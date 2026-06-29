import asyncio
import ipaddress
import json
from collections.abc import Callable

import httpx
import pytest
from pydantic import ValidationError

from ai_context_boundary import (
    AI_CONTEXT_SOURCE_POLICIES,
    AiAssistantContextRequest,
    AiContextBoundaryError,
    AiContextSourceRequest,
    build_ai_context_error_detail,
    get_ai_context_source_policy,
    validate_ai_assistant_context_boundary,
)
from ai_guardrails import (
    AI_ASSISTANT_FEATURE,
    CLIP_ANALYZE_FEATURE,
    REPURPOSING_PLAN_FEATURE,
    TRANSCRIPTIONS_PROCESS_FEATURE,
    AiGuardrailError,
    build_ai_guardrail_detail,
    ensure_ai_guardrail_feature_is_productive,
    get_ai_guardrail_policy,
)
from main import (
    app,
    get_clip_analyzer,
    get_repurposing_planner,
    get_transcription_processor,
)
from openai_client import (
    OpenAIClipAnalyzer,
    OpenAIRepurposingPlanner,
    OpenAITranscriptionProcessor,
    ProviderRateLimitError,
)
from schemas import (
    ClipAnalysisRequest,
    ClipAnalysisResponse,
    RepurposingPlanRequest,
    RepurposingPlanResponse,
    TranscriptionProcessRequest,
    TranscriptionProcessResponse,
    TranscriptionSegment,
    ensure_repurposing_plan_response_matches_request,
)
from settings import Settings, SettingsError, load_settings
from ssrf import UnsafeAssetUrlError

ASSERTION_SIGNING_TEST_SECRET = "a" * 32


async def post_json(path: str, payload: dict[str, object]) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as client:
        return await client.post(path, json=payload)


def valid_repurposing_request_payload() -> dict[str, object]:
    return {
        "asset_reference": {
            "kind": "vod",
            "status": "asset_available",
            "url": "https://cdn.example.com/vods/test.mp4",
        },
        "brand_context": {"brand_profile_id": "brand-1"},
        "content_job_id": "job-123",
        "content_policy_hints": {"content_policy_profile": "safe"},
        "language": "en",
        "locale": "en",
        "manual_review_required": True,
        "provider": "youtube",
        "provider_video_id": "video-123",
        "queue_job_id": "repurposing-plan-job-123",
        "source_event_type": "video.published",
        "source_metadata": {
            "source_provider": "youtube",
            "source_video_id": "video-123",
            "stream_id": "stream-123",
            "user_id": "11111111-1111-4111-8111-111111111111",
            "vod_asset_url": "https://cdn.example.com/vods/test.mp4",
            "workflow": "repurposing_plan",
        },
        "target_platforms": ["youtube", "tiktok"],
        "transcript_reference": {
            "stream_id": "stream-123",
            "transcript_id": "transcript-1",
        },
        "user_id": "11111111-1111-4111-8111-111111111111",
    }


class StubClipAnalyzer:
    async def analyze_clip(self, payload: ClipAnalysisRequest) -> ClipAnalysisResponse:
        return ClipAnalysisResponse(
            asset_id=payload.asset_id,
            source_platform=payload.source_platform,
            virality_score=84,
            recommended_formats=["shorts", "tiktok"],
            highlights=["Strong opening hook"],
            title_suggestions=["This Stream Moment Changed Everything"],
            repurpose_summary="A high-energy clip suitable for short-form distribution.",
            provider="test",
        )


class StubTranscriptionProcessor:
    async def process_transcription(
        self, payload: TranscriptionProcessRequest
    ) -> TranscriptionProcessResponse:
        return TranscriptionProcessResponse(
            job_id=payload.job_id,
            stream_id=payload.stream_id,
            transcript="A clean test transcript.",
            segments=[
                TranscriptionSegment(
                    start=0.0, end=1.5, text="A clean test transcript."
                )
            ],
            language=payload.language,
            provider="test",
            model="gpt-4o-transcribe",
        )


class StubRepurposingPlanner:
    async def plan_repurposing(
        self, payload: RepurposingPlanRequest
    ) -> RepurposingPlanResponse:
        return RepurposingPlanResponse(
            captions=["Repurpose this moment."],
            confidence=87,
            content_job_id=payload.content_job_id,
            descriptions=["Review-only description."],
            hashtag_sets=[["#streamos"]],
            hook_ideas=["Open with the strongest beat."],
            manual_review_required=True,
            model="gpt-4o",
            provider="test",
            queue_job_id=payload.queue_job_id,
            review_notes=["Manual approval is required."],
            short_form_plan="Draft a review-only repurposing plan.",
            title_suggestions=["The moment everyone missed"],
            warnings=["No automatic publishing."],
        )


class MismatchedContentJobRepurposingPlanner:
    async def plan_repurposing(
        self, payload: RepurposingPlanRequest
    ) -> RepurposingPlanResponse:
        return RepurposingPlanResponse.model_validate(
            valid_repurposing_response_payload(
                content_job_id="other-content-job",
                queue_job_id=payload.queue_job_id,
            )
        )


class MismatchedQueueJobRepurposingPlanner:
    async def plan_repurposing(
        self, payload: RepurposingPlanRequest
    ) -> RepurposingPlanResponse:
        return RepurposingPlanResponse.model_validate(
            valid_repurposing_response_payload(
                content_job_id=payload.content_job_id,
                queue_job_id="other-queue-job",
            )
        )


class UnsafeUrlTranscriptionProcessor:
    async def process_transcription(
        self, _payload: TranscriptionProcessRequest
    ) -> TranscriptionProcessResponse:
        raise UnsafeAssetUrlError("Asset URL resolves to a non-public IP address.")


class RateLimitedTranscriptionProcessor:
    async def process_transcription(
        self, _payload: TranscriptionProcessRequest
    ) -> TranscriptionProcessResponse:
        raise ProviderRateLimitError(
            message="Upstream transcription provider rate limited the request.",
            provider="openai",
            retry_after_seconds=45,
        )


class RateLimitedRepurposingPlanner:
    async def plan_repurposing(
        self, _payload: RepurposingPlanRequest
    ) -> RepurposingPlanResponse:
        raise ProviderRateLimitError(
            message="Upstream repurposing provider rate limited the request.",
            provider="openai",
            retry_after_seconds=30,
        )


class TimeoutClipAnalyzer:
    async def analyze_clip(self, _payload: ClipAnalysisRequest) -> ClipAnalysisResponse:
        raise httpx.ReadTimeout("upstream timeout")


def valid_repurposing_response_payload(
    *,
    content_job_id: str = "job-123",
    queue_job_id: str = "repurposing-plan-job-123",
) -> dict[str, object]:
    return {
        "captions": ["Repurpose this moment."],
        "confidence": 87,
        "content_job_id": content_job_id,
        "descriptions": ["Review-only description."],
        "hashtag_sets": [["#streamos"]],
        "hook_ideas": ["Open with the strongest beat."],
        "manual_review_required": True,
        "model": "gpt-4o",
        "provider": "test",
        "queue_job_id": queue_job_id,
        "review_notes": ["Manual approval is required."],
        "short_form_plan": "Draft a review-only repurposing plan.",
        "title_suggestions": ["The moment everyone missed"],
        "warnings": ["No automatic publishing."],
    }


def test_repurposing_response_contract_accepts_worker_valid_shape() -> None:
    payload = valid_repurposing_response_payload()

    result = RepurposingPlanResponse.model_validate(payload)

    assert result.model_dump() == payload


def test_repurposing_response_contract_accepts_matching_request_ids() -> None:
    request = RepurposingPlanRequest.model_validate(valid_repurposing_request_payload())
    response = RepurposingPlanResponse.model_validate(
        valid_repurposing_response_payload(
            content_job_id=request.content_job_id,
            queue_job_id=request.queue_job_id,
        )
    )

    assert (
        ensure_repurposing_plan_response_matches_request(request, response) is response
    )


def test_repurposing_response_contract_trims_text_like_worker() -> None:
    payload = {
        **valid_repurposing_response_payload(),
        "captions": [" Repurpose this moment. "],
    }

    result = RepurposingPlanResponse.model_validate(payload)

    assert result.captions == ["Repurpose this moment."]


def test_ai_guardrail_policy_keeps_core_runtime_paths_non_premium() -> None:
    clip_policy = get_ai_guardrail_policy(CLIP_ANALYZE_FEATURE)
    repurposing_policy = get_ai_guardrail_policy(REPURPOSING_PLAN_FEATURE)
    transcription_policy = get_ai_guardrail_policy(TRANSCRIPTIONS_PROCESS_FEATURE)

    assert clip_policy.runtime_status == "active"
    assert repurposing_policy.runtime_status == "active"
    assert transcription_policy.runtime_status == "active"
    assert clip_policy.requires_signed_entitlement is False
    assert repurposing_policy.requires_signed_entitlement is False
    assert transcription_policy.requires_signed_entitlement is False


def test_ai_guardrail_policy_marks_ai_assistant_as_not_yet_productive() -> None:
    policy = get_ai_guardrail_policy(AI_ASSISTANT_FEATURE)

    assert policy.runtime_status == "not_yet_productive"
    assert policy.requires_signed_entitlement is True

    with pytest.raises(AiGuardrailError) as error_info:
        ensure_ai_guardrail_feature_is_productive(AI_ASSISTANT_FEATURE)

    assert build_ai_guardrail_detail(error_info.value) == {
        "code": "ai_guardrail_feature_unavailable",
        "feature": "ai_assistant",
        "message": "The requested AI feature is not available.",
        "retryable": False,
    }


def test_ai_guardrail_policy_rejects_invalid_feature_with_secret_safe_detail() -> None:
    with pytest.raises(AiGuardrailError) as error_info:
        get_ai_guardrail_policy("not-a-real-feature")

    assert build_ai_guardrail_detail(error_info.value) == {
        "code": "ai_guardrail_invalid_feature",
        "feature": "ai_assistant",
        "message": "The requested AI feature is invalid.",
        "retryable": False,
    }


def valid_ai_assistant_context_request() -> AiAssistantContextRequest:
    return AiAssistantContextRequest(
        tenant_id="tenant-123",
        user_id="user-123",
        transcript_excerpt_characters=1_200,
        sources=(
            AiContextSourceRequest(
                source="channel_platform_status",
                item_limit=5,
                payload_bytes=1_024,
                time_window_days=30,
            ),
            AiContextSourceRequest(
                source="stream_performance_summary",
                item_limit=10,
                payload_bytes=2_048,
                time_window_days=30,
            ),
        ),
    )


def test_ai_context_boundary_accepts_allowlisted_sources() -> None:
    result = validate_ai_assistant_context_boundary(
        valid_ai_assistant_context_request()
    )

    assert result.feature == "ai_assistant"
    assert result.tenant_id == "tenant-123"
    assert result.user_id == "user-123"
    assert result.source_count == 2
    assert result.total_payload_bytes == 3_072
    assert tuple(source.source for source in result.sources) == (
        "channel_platform_status",
        "stream_performance_summary",
    )


def test_ai_context_boundary_rejects_unknown_source() -> None:
    request = AiAssistantContextRequest(
        tenant_id="tenant-123",
        user_id="user-123",
        sources=(AiContextSourceRequest(source="mystery_source"),),
    )

    with pytest.raises(AiContextBoundaryError) as error_info:
        validate_ai_assistant_context_boundary(request)

    assert build_ai_context_error_detail(error_info.value) == {
        "code": "ai_context_source_unknown",
        "feature": "ai_assistant",
        "message": "The requested AI context source is unknown.",
        "source": "mystery_source",
    }


def test_ai_context_boundary_rejects_sensitive_source() -> None:
    request = AiAssistantContextRequest(
        tenant_id="tenant-123",
        user_id="user-123",
        sources=(AiContextSourceRequest(source="refresh_tokens"),),
    )

    with pytest.raises(AiContextBoundaryError) as error_info:
        validate_ai_assistant_context_boundary(request)

    assert build_ai_context_error_detail(error_info.value) == {
        "code": "ai_context_sensitive_data_blocked",
        "feature": "ai_assistant",
        "message": "Sensitive AI context sources are blocked.",
        "source": "refresh_tokens",
    }


def test_ai_context_boundary_rejects_window_that_is_too_large() -> None:
    request = AiAssistantContextRequest(
        tenant_id="tenant-123",
        user_id="user-123",
        sources=(
            AiContextSourceRequest(
                source="publication_history_summary",
                time_window_days=120,
            ),
        ),
    )

    with pytest.raises(AiContextBoundaryError) as error_info:
        validate_ai_assistant_context_boundary(request)

    assert build_ai_context_error_detail(error_info.value) == {
        "code": "ai_context_window_too_large",
        "feature": "ai_assistant",
        "message": "The requested AI context window exceeds the allowed range.",
        "source": "publication_history_summary",
    }


def test_ai_context_boundary_rejects_payload_that_is_too_large() -> None:
    request = AiAssistantContextRequest(
        tenant_id="tenant-123",
        user_id="user-123",
        sources=(
            AiContextSourceRequest(
                source="clip_highlight_summary",
                item_limit=10,
                payload_bytes=9_000,
            ),
        ),
    )

    with pytest.raises(AiContextBoundaryError) as error_info:
        validate_ai_assistant_context_boundary(request)

    assert build_ai_context_error_detail(error_info.value) == {
        "code": "ai_context_payload_too_large",
        "feature": "ai_assistant",
        "message": "The requested AI context payload exceeds the allowed size.",
        "source": "clip_highlight_summary",
    }


def test_ai_context_boundary_requires_tenant_and_user_context() -> None:
    request = AiAssistantContextRequest(
        tenant_id="",
        user_id="user-123",
        sources=(AiContextSourceRequest(source="channel_platform_status"),),
    )

    with pytest.raises(AiContextBoundaryError) as error_info:
        validate_ai_assistant_context_boundary(request)

    assert build_ai_context_error_detail(error_info.value) == {
        "code": "ai_context_tenant_required",
        "feature": "ai_assistant",
        "message": "Tenant-scoped AI context requires trusted tenant and user identifiers.",
    }


def test_ai_context_boundary_error_details_stay_secret_safe() -> None:
    request = AiAssistantContextRequest(
        tenant_id="tenant-123",
        user_id="user-123",
        sources=(
            AiContextSourceRequest(
                source="https://private.railway.internal/token?secret=sk-server",
            ),
        ),
    )

    with pytest.raises(AiContextBoundaryError) as error_info:
        validate_ai_assistant_context_boundary(request)

    detail = build_ai_context_error_detail(error_info.value)

    assert detail["code"] == "ai_context_source_unknown"
    assert "secret" not in detail["message"].lower()
    assert "token" not in detail["message"].lower()
    assert "http://" not in detail["message"].lower()
    assert "https://" not in detail["message"].lower()
    assert "sk-server" not in json.dumps(detail)
    assert "private.railway.internal" not in json.dumps(detail)


def test_ai_context_boundary_marks_ai_assistant_as_not_yet_productive() -> None:
    with pytest.raises(AiContextBoundaryError) as error_info:
        validate_ai_assistant_context_boundary(
            valid_ai_assistant_context_request(),
            require_productive=True,
        )

    assert build_ai_context_error_detail(error_info.value) == {
        "code": "ai_context_not_productive",
        "feature": "ai_assistant",
        "message": "The requested AI context path is not yet productive.",
    }


def test_ai_context_boundary_policies_cover_allowlisted_sources() -> None:
    assert set(AI_CONTEXT_SOURCE_POLICIES) == {
        "brand_asset_metadata",
        "channel_platform_status",
        "clip_highlight_summary",
        "content_job_summary",
        "monetization_summary",
        "publication_history_summary",
        "stream_performance_summary",
        "transcript_excerpt",
    }
    assert (
        get_ai_context_source_policy("monetization_summary").description
        == "Own monetization summaries in aggregated, non-sensitive form."
    )


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param(
            lambda: {
                key: value
                for key, value in valid_repurposing_response_payload().items()
                if key != "short_form_plan"
            },
            id="missing required field",
        ),
        pytest.param(
            lambda: {
                **valid_repurposing_response_payload(),
                "confidence": "87",
            },
            id="wrong field type",
        ),
        pytest.param(
            lambda: {
                **valid_repurposing_response_payload(),
                "captions": [],
            },
            id="empty required array",
        ),
        pytest.param(
            lambda: {
                **valid_repurposing_response_payload(),
                "captions": ["   "],
            },
            id="empty text item",
        ),
        pytest.param(
            lambda: {
                **valid_repurposing_response_payload(),
                "hashtag_sets": [[]],
            },
            id="empty hashtag set",
        ),
        pytest.param(
            lambda: {
                **valid_repurposing_response_payload(),
                "auto_publish": True,
            },
            id="unexpected top-level field",
        ),
        pytest.param(
            lambda: {
                **valid_repurposing_response_payload(),
                "short_form_plan": "x" * 4_001,
            },
            id="oversized text field",
        ),
        pytest.param(
            lambda: {
                **valid_repurposing_response_payload(),
                "captions": ['<script>alert("x")</script>'],
            },
            id="script-like content",
        ),
        pytest.param(
            lambda: {
                "content_job_id": "job-123",
                "manual_review_required": True,
                "queue_job_id": "repurposing-plan-job-123",
                "short_form_plan": "Looks like a plan but lacks review fields.",
            },
            id="partial plausible data",
        ),
    ],
)
def test_repurposing_response_contract_rejects_worker_invalid_shapes(
    payload: Callable[[], object],
) -> None:
    with pytest.raises(ValidationError):
        RepurposingPlanResponse.model_validate(payload())


def test_repurposing_response_contract_rejects_non_object_top_level_shape() -> None:
    with pytest.raises(ValidationError):
        RepurposingPlanResponse.model_validate([])


def test_settings_reject_public_openai_keys() -> None:
    with pytest.raises(SettingsError, match="NEXT_PUBLIC_OPENAI_KEY"):
        load_settings(
            {
                "NEXT_PUBLIC_OPENAI_KEY": "sk-client-leak",
                "OPENAI_API_KEY": "sk-server",
            }
        )


def test_settings_reject_public_assertion_signing_env_names() -> None:
    with pytest.raises(
        SettingsError, match="NEXT_PUBLIC_AUTOMATION_ENTITLEMENT_ASSERTION_SECRET"
    ):
        load_settings(
            {
                "NEXT_PUBLIC_AUTOMATION_ENTITLEMENT_ASSERTION_SECRET": "leak",
                "OPENAI_API_KEY": "sk-server",
            }
        )


def test_settings_require_assertion_secret_when_hmac_signing_mode_is_enabled() -> None:
    with pytest.raises(
        SettingsError,
        match="AUTOMATION_ENTITLEMENT_ASSERTION_SECRET is required when AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE=hmac_sha256",
    ):
        load_settings(
            {
                "AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE": "hmac_sha256",
                "OPENAI_API_KEY": "sk-server",
            }
        )


def test_settings_accept_hmac_signing_mode_with_server_only_secret() -> None:
    settings = load_settings(
        {
            "AUTOMATION_ENTITLEMENT_ASSERTION_SECRET": ASSERTION_SIGNING_TEST_SECRET,
            "AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE": "hmac_sha256",
            "OPENAI_API_KEY": "sk-server",
        }
    )

    assert settings.automation_entitlement_assertion_signing_mode == "hmac_sha256"
    assert (
        settings.automation_entitlement_assertion_secret
        == ASSERTION_SIGNING_TEST_SECRET
    )


def test_transcription_e2e_mode_requires_explicit_guard() -> None:
    with pytest.raises(SettingsError, match="STREAMOS_E2E_MODE=true"):
        load_settings({"TRANSCRIPTION_PROCESSOR_MODE": "stub"})


def test_transcription_e2e_mode_allows_stub_processor() -> None:
    settings = load_settings(
        {
            "STREAMOS_E2E_MODE": "true",
            "TRANSCRIPTION_PROCESSOR_MODE": "stub",
        }
    )

    assert settings.streamos_e2e_mode is True
    assert settings.transcription_processor_mode == "stub"


def test_clip_analysis_endpoint_uses_server_side_analyzer() -> None:
    app.dependency_overrides[get_clip_analyzer] = StubClipAnalyzer

    try:
        response = asyncio.run(
            post_json(
                "/clips/analyze",
                {
                    "asset_id": "clip-123",
                    "source_platform": "twitch",
                    "transcript": "Huge comeback after a risky play in the final round.",
                },
            )
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "asset_id": "clip-123",
        "source_platform": "twitch",
        "virality_score": 84,
        "recommended_formats": ["shorts", "tiktok"],
        "highlights": ["Strong opening hook"],
        "title_suggestions": ["This Stream Moment Changed Everything"],
        "repurpose_summary": "A high-energy clip suitable for short-form distribution.",
        "provider": "test",
    }


def test_transcription_endpoint_uses_server_side_processor() -> None:
    app.dependency_overrides[get_transcription_processor] = StubTranscriptionProcessor

    try:
        response = asyncio.run(
            post_json(
                "/transcriptions/process",
                {
                    "job_id": "job-123",
                    "stream_id": "stream-123",
                    "source_platform": "twitch",
                    "asset_url": "https://cdn.example.com/audio.mp4",
                    "language": "en",
                },
            )
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "job_id": "job-123",
        "stream_id": "stream-123",
        "transcript": "A clean test transcript.",
        "segments": [{"start": 0.0, "end": 1.5, "text": "A clean test transcript."}],
        "language": "en",
        "provider": "test",
        "model": "gpt-4o-transcribe",
    }


def test_repurposing_endpoint_uses_server_side_planner() -> None:
    app.dependency_overrides[get_repurposing_planner] = StubRepurposingPlanner

    try:
        response = asyncio.run(
            post_json(
                "/repurposing/plan",
                valid_repurposing_request_payload(),
            )
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "captions": ["Repurpose this moment."],
        "confidence": 87,
        "content_job_id": "job-123",
        "descriptions": ["Review-only description."],
        "hashtag_sets": [["#streamos"]],
        "hook_ideas": ["Open with the strongest beat."],
        "manual_review_required": True,
        "model": "gpt-4o",
        "provider": "test",
        "queue_job_id": "repurposing-plan-job-123",
        "review_notes": ["Manual approval is required."],
        "short_form_plan": "Draft a review-only repurposing plan.",
        "title_suggestions": ["The moment everyone missed"],
        "warnings": ["No automatic publishing."],
    }


@pytest.mark.parametrize(
    "planner",
    [
        pytest.param(
            MismatchedContentJobRepurposingPlanner,
            id="content_job_id mismatch",
        ),
        pytest.param(
            MismatchedQueueJobRepurposingPlanner,
            id="queue_job_id mismatch",
        ),
    ],
)
def test_repurposing_endpoint_rejects_mismatched_response_ids(
    planner: type[object],
) -> None:
    app.dependency_overrides[get_repurposing_planner] = planner

    try:
        response = asyncio.run(
            post_json(
                "/repurposing/plan",
                valid_repurposing_request_payload(),
            )
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 502
    assert response.json() == {"detail": "OpenAI repurposing failed."}
    assert "other-" not in response.text


def test_clip_analysis_endpoint_returns_structured_504_for_timeout() -> None:
    app.dependency_overrides[get_clip_analyzer] = TimeoutClipAnalyzer

    try:
        response = asyncio.run(
            post_json(
                "/clips/analyze",
                {
                    "asset_id": "clip-123",
                    "source_platform": "twitch",
                    "transcript": "A clean testing transcript.",
                },
            )
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 504
    assert response.json() == {
        "detail": {
            "code": "ai_guardrail_timeout",
            "feature": "clips_analyze",
            "message": "The AI request timed out before completion.",
            "retryable": True,
        }
    }


def test_repurposing_endpoint_returns_structured_503_for_provider_rate_limit() -> None:
    app.dependency_overrides[get_repurposing_planner] = RateLimitedRepurposingPlanner

    try:
        response = asyncio.run(
            post_json(
                "/repurposing/plan",
                {
                    "content_job_id": "job-123",
                    "manual_review_required": True,
                    "provider": "youtube",
                    "queue_job_id": "repurposing-plan-job-123",
                    "source_event_type": "video.published",
                    "source_metadata": {},
                    "user_id": "11111111-1111-4111-8111-111111111111",
                },
            )
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json() == {
        "detail": {
            "code": "provider_rate_limited",
            "message": "Upstream repurposing provider rate limited the request.",
            "provider": "openai",
            "retryable": True,
            "retry_after_seconds": 30,
            "upstream_status": 429,
        }
    }


def test_transcription_endpoint_returns_400_for_unsafe_asset_url() -> None:
    app.dependency_overrides[get_transcription_processor] = (
        UnsafeUrlTranscriptionProcessor
    )

    try:
        response = asyncio.run(
            post_json(
                "/transcriptions/process",
                {
                    "job_id": "job-123",
                    "stream_id": "stream-123",
                    "source_platform": "twitch",
                    "asset_url": "https://127.0.0.1/audio.mp4",
                    "language": "en",
                },
            )
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json() == {"detail": "Transcription asset URL is not allowed."}


def test_transcription_endpoint_returns_structured_503_for_provider_rate_limit() -> (
    None
):
    app.dependency_overrides[get_transcription_processor] = (
        RateLimitedTranscriptionProcessor
    )

    try:
        response = asyncio.run(
            post_json(
                "/transcriptions/process",
                {
                    "job_id": "job-123",
                    "stream_id": "stream-123",
                    "source_platform": "twitch",
                    "asset_url": "https://cdn.example.com/audio.mp4",
                    "language": "en",
                },
            )
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json() == {
        "detail": {
            "code": "provider_rate_limited",
            "message": "Upstream transcription provider rate limited the request.",
            "provider": "openai",
            "retryable": True,
            "retry_after_seconds": 45,
            "upstream_status": 429,
        }
    }


def test_missing_server_openai_key_returns_503(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_OPENAI_KEY", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_OPENAI_API_KEY", raising=False)

    response = asyncio.run(
        post_json(
            "/clips/analyze",
            {
                "asset_id": "clip-123",
                "source_platform": "twitch",
                "transcript": "A clean testing transcript.",
            },
        )
    )

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "OPENAI_API_KEY is required in automation-service for server-side AI calls."
    )


def test_openai_client_keeps_api_key_out_of_request_body() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        body = request.content.decode("utf-8")

        assert request.headers["Authorization"] == "Bearer sk-server"
        assert "sk-server" not in body

        return httpx.Response(
            status_code=200,
            json={
                "output_text": json.dumps(
                    {
                        "virality_score": 91,
                        "recommended_formats": ["shorts", "reel"],
                        "highlights": ["Unexpected clutch moment"],
                        "title_suggestions": ["The Clutch Nobody Saw Coming"],
                        "repurpose_summary": "Lead with the comeback and cut for mobile pacing.",
                    }
                )
            },
        )

    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport)
    analyzer = OpenAIClipAnalyzer(
        Settings(
            streamos_e2e_mode=False,
            openai_api_key="sk-server",
            openai_model="gpt-4o",
            openai_title_model="gpt-4o-mini",
            openai_transcription_model="gpt-4o-transcribe",
            openai_base_url="https://api.openai.test/v1",
            openai_timeout_seconds=30,
            max_transcription_media_bytes=25_000_000,
            transcription_processor_mode="openai",
        ),
        http_client=http_client,
    )

    async def run_analysis() -> ClipAnalysisResponse:
        try:
            return await analyzer.analyze_clip(
                ClipAnalysisRequest(
                    asset_id="clip-123",
                    source_platform="twitch",
                    transcript="A creator lands an unexpected clutch play.",
                )
            )
        finally:
            await http_client.aclose()

    result = asyncio.run(run_analysis())

    assert len(requests) == 1
    assert requests[0].url == "https://api.openai.test/v1/responses"
    assert result.provider == "openai"
    assert result.virality_score == 91


def test_openai_clip_analyzer_rejects_oversized_input_before_upstream_request() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(status_code=200, json={"output_text": "{}"})

    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport)
    analyzer = OpenAIClipAnalyzer(
        Settings(
            streamos_e2e_mode=False,
            openai_api_key="sk-server",
            openai_model="gpt-4o",
            openai_title_model="gpt-4o-mini",
            openai_transcription_model="gpt-4o-transcribe",
            openai_base_url="https://api.openai.test/v1",
            openai_timeout_seconds=30,
            max_transcription_media_bytes=25_000_000,
            transcription_processor_mode="openai",
        ),
        http_client=http_client,
    )
    oversized_payload = ClipAnalysisRequest.model_construct(
        asset_id="clip-123",
        source_platform="twitch",
        transcript="x" * 60_001,
    )

    async def run_analysis() -> None:
        try:
            await analyzer.analyze_clip(oversized_payload)
        finally:
            await http_client.aclose()

    with pytest.raises(AiGuardrailError) as error_info:
        asyncio.run(run_analysis())

    assert error_info.value.code == "ai_guardrail_input_too_large"
    assert error_info.value.feature == "clips_analyze"
    assert requests == []


def test_openai_repurposing_planner_rejects_oversized_input_before_upstream_request() -> (
    None
):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(status_code=200, json={"output_text": "{}"})

    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport)
    planner = OpenAIRepurposingPlanner(
        Settings(
            streamos_e2e_mode=False,
            openai_api_key="sk-server",
            openai_model="gpt-4o",
            openai_title_model="gpt-4o-mini",
            openai_transcription_model="gpt-4o-transcribe",
            openai_base_url="https://api.openai.test/v1",
            openai_timeout_seconds=30,
            max_transcription_media_bytes=25_000_000,
            transcription_processor_mode="openai",
        ),
        http_client=http_client,
    )
    payload = RepurposingPlanRequest.model_validate(
        {
            **valid_repurposing_request_payload(),
            "source_metadata": {"oversized_note": "x" * 40_000},
        }
    )

    async def run_planner() -> None:
        try:
            await planner.plan_repurposing(payload)
        finally:
            await http_client.aclose()

    with pytest.raises(AiGuardrailError) as error_info:
        asyncio.run(run_planner())

    assert error_info.value.code == "ai_guardrail_input_too_large"
    assert error_info.value.feature == "repurposing_plan"
    assert requests == []


def test_openai_transcription_processor_downloads_media_and_calls_audio_endpoint() -> (
    None
):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)

        if request.url == "https://cdn.example.com/audio.mp4":
            return httpx.Response(
                status_code=200,
                headers={"content-type": "audio/mp4"},
                content=b"fake-audio-bytes",
            )

        assert request.url == "https://api.openai.test/v1/audio/transcriptions"
        assert request.headers["Authorization"] == "Bearer sk-server"
        transcription_payload = request.content.decode("utf-8", errors="ignore")

        assert 'name="model"' in transcription_payload
        assert "gpt-4o-transcribe" in transcription_payload
        assert 'name="response_format"' in transcription_payload
        assert "verbose_json" not in transcription_payload
        assert "\r\njson\r\n" in transcription_payload

        return httpx.Response(
            status_code=200,
            json={
                "text": "Creator says hello.",
                "segments": [
                    {
                        "start": 0.0,
                        "end": 1.2,
                        "text": "Creator says hello.",
                    }
                ],
            },
        )

    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport)
    processor = OpenAITranscriptionProcessor(
        Settings(
            streamos_e2e_mode=False,
            openai_api_key="sk-server",
            openai_model="gpt-4o",
            openai_title_model="gpt-4o-mini",
            openai_transcription_model="gpt-4o-transcribe",
            openai_base_url="https://api.openai.test/v1",
            openai_timeout_seconds=30,
            max_transcription_media_bytes=25_000_000,
            transcription_processor_mode="openai",
        ),
        http_client=http_client,
        asset_url_resolver=lambda _hostname: [ipaddress.ip_address("93.184.216.34")],
    )

    async def run_transcription() -> TranscriptionProcessResponse:
        try:
            return await processor.process_transcription(
                TranscriptionProcessRequest(
                    job_id="job-123",
                    stream_id="stream-123",
                    source_platform="twitch",
                    asset_url="https://cdn.example.com/audio.mp4",
                    language="en",
                )
            )
        finally:
            await http_client.aclose()

    result = asyncio.run(run_transcription())

    assert [str(request.url) for request in requests] == [
        "https://cdn.example.com/audio.mp4",
        "https://api.openai.test/v1/audio/transcriptions",
    ]
    assert result.transcript == "Creator says hello."
    assert result.segments == [
        TranscriptionSegment(start=0.0, end=1.2, text="Creator says hello.")
    ]
    assert result.model == "gpt-4o-transcribe"


def test_openai_transcription_processor_rejects_private_asset_url_before_download() -> (
    None
):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(status_code=200, content=b"should-not-download")

    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport)
    processor = OpenAITranscriptionProcessor(
        Settings(
            streamos_e2e_mode=False,
            openai_api_key="sk-server",
            openai_model="gpt-4o",
            openai_title_model="gpt-4o-mini",
            openai_transcription_model="gpt-4o-transcribe",
            openai_base_url="https://api.openai.test/v1",
            openai_timeout_seconds=30,
            max_transcription_media_bytes=25_000_000,
            transcription_processor_mode="openai",
        ),
        http_client=http_client,
    )

    async def run_transcription() -> None:
        try:
            await processor.process_transcription(
                TranscriptionProcessRequest(
                    job_id="job-123",
                    stream_id="stream-123",
                    source_platform="twitch",
                    asset_url="https://127.0.0.1/latest/meta-data",
                    language="en",
                )
            )
        finally:
            await http_client.aclose()

    with pytest.raises(UnsafeAssetUrlError, match="non-public IP"):
        asyncio.run(run_transcription())

    assert requests == []


def test_openai_transcription_processor_rejects_private_redirect_targets() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)

        if request.url == "https://cdn.example.com/audio.mp4":
            return httpx.Response(
                status_code=302,
                headers={"location": "https://127.0.0.1/admin"},
            )

        return httpx.Response(status_code=200, content=b"should-not-download")

    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport)
    processor = OpenAITranscriptionProcessor(
        Settings(
            streamos_e2e_mode=False,
            openai_api_key="sk-server",
            openai_model="gpt-4o",
            openai_title_model="gpt-4o-mini",
            openai_transcription_model="gpt-4o-transcribe",
            openai_base_url="https://api.openai.test/v1",
            openai_timeout_seconds=30,
            max_transcription_media_bytes=25_000_000,
            transcription_processor_mode="openai",
        ),
        http_client=http_client,
        asset_url_resolver=lambda _hostname: [ipaddress.ip_address("93.184.216.34")],
    )

    async def run_transcription() -> None:
        try:
            await processor.process_transcription(
                TranscriptionProcessRequest(
                    job_id="job-123",
                    stream_id="stream-123",
                    source_platform="twitch",
                    asset_url="https://cdn.example.com/audio.mp4",
                    language="en",
                )
            )
        finally:
            await http_client.aclose()

    with pytest.raises(UnsafeAssetUrlError, match="non-public IP"):
        asyncio.run(run_transcription())

    assert [str(request.url) for request in requests] == [
        "https://cdn.example.com/audio.mp4"
    ]


def test_openai_transcription_processor_classifies_provider_429() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)

        if request.url == "https://cdn.example.com/audio.mp4":
            return httpx.Response(
                status_code=200,
                headers={"content-type": "audio/mp4"},
                content=b"fake-audio-bytes",
            )

        assert request.url == "https://api.openai.test/v1/audio/transcriptions"
        return httpx.Response(
            status_code=429,
            headers={"retry-after": "120"},
            json={"error": {"message": "Rate limit exceeded."}},
        )

    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport)
    processor = OpenAITranscriptionProcessor(
        Settings(
            streamos_e2e_mode=False,
            openai_api_key="sk-server",
            openai_model="gpt-4o",
            openai_title_model="gpt-4o-mini",
            openai_transcription_model="gpt-4o-transcribe",
            openai_base_url="https://api.openai.test/v1",
            openai_timeout_seconds=30,
            max_transcription_media_bytes=25_000_000,
            transcription_processor_mode="openai",
        ),
        http_client=http_client,
        asset_url_resolver=lambda _hostname: [ipaddress.ip_address("93.184.216.34")],
    )

    async def run_transcription() -> None:
        try:
            await processor.process_transcription(
                TranscriptionProcessRequest(
                    job_id="job-123",
                    stream_id="stream-123",
                    source_platform="twitch",
                    asset_url="https://cdn.example.com/audio.mp4",
                    language="en",
                )
            )
        finally:
            await http_client.aclose()

    with pytest.raises(ProviderRateLimitError) as error_info:
        asyncio.run(run_transcription())

    assert error_info.value.provider == "openai"
    assert error_info.value.retry_after_seconds == 120
    assert error_info.value.upstream_status == 429
    assert [str(request.url) for request in requests] == [
        "https://cdn.example.com/audio.mp4",
        "https://api.openai.test/v1/audio/transcriptions",
    ]


def test_openai_transcription_processor_rejects_oversized_media_before_model_call() -> (
    None
):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)

        if request.url == "https://cdn.example.com/audio.mp4":
            return httpx.Response(
                status_code=200,
                headers={"content-type": "audio/mp4"},
                content=b"12345",
            )

        return httpx.Response(status_code=200, json={"text": "should-not-run"})

    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport)
    processor = OpenAITranscriptionProcessor(
        Settings(
            streamos_e2e_mode=False,
            openai_api_key="sk-server",
            openai_model="gpt-4o",
            openai_title_model="gpt-4o-mini",
            openai_transcription_model="gpt-4o-transcribe",
            openai_base_url="https://api.openai.test/v1",
            openai_timeout_seconds=30,
            max_transcription_media_bytes=4,
            transcription_processor_mode="openai",
        ),
        http_client=http_client,
        asset_url_resolver=lambda _hostname: [ipaddress.ip_address("93.184.216.34")],
    )

    async def run_transcription() -> None:
        try:
            await processor.process_transcription(
                TranscriptionProcessRequest(
                    job_id="job-123",
                    stream_id="stream-123",
                    source_platform="twitch",
                    asset_url="https://cdn.example.com/audio.mp4",
                    language="en",
                )
            )
        finally:
            await http_client.aclose()

    with pytest.raises(AiGuardrailError) as error_info:
        asyncio.run(run_transcription())

    assert error_info.value.code == "ai_guardrail_media_too_large"
    assert error_info.value.feature == "transcriptions_process"
    assert [str(request.url) for request in requests] == [
        "https://cdn.example.com/audio.mp4"
    ]
