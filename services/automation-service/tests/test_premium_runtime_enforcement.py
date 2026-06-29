import asyncio
from datetime import UTC, datetime

import httpx
import pytest
from fastapi import HTTPException

from ai_assistant_backend_contract import (
    AiAssistantBackendContractRequest,
    prepare_ai_assistant_backend_contract,
    run_ai_assistant_backend_operation,
)
from ai_context_boundary import AiAssistantContextRequest, AiContextSourceRequest
from ai_context_retrieval_adapters import (
    AI_CONTEXT_SOURCE_ADAPTERS,
    AiContextResolvedSource,
)
from entitlement_assertions import (
    AutomationEntitlementAssertion,
    sign_automation_entitlement_assertion,
)
from premium_runtime_enforcement import (
    PREMIUM_AUTOMATION_RUNTIME_FEATURE,
    PREMIUM_RUNTIME_UNAVAILABLE_CODE,
    PREMIUM_RUNTIME_UNAVAILABLE_MESSAGE,
    build_premium_runtime_unavailable_detail,
    run_ai_assistant_premium_operation,
)
from settings import Settings

ASSERTION_SIGNING_TEST_SECRET = "a" * 32


def build_settings(
    *,
    assertion_secret: str = ASSERTION_SIGNING_TEST_SECRET,
    signing_mode: str = "hmac_sha256",
) -> Settings:
    return Settings(
        streamos_e2e_mode=False,
        openai_api_key="sk-server",
        openai_model="gpt-4o",
        openai_title_model="gpt-4o-mini",
        openai_transcription_model="gpt-4o-transcribe",
        openai_base_url="https://api.openai.test/v1",
        openai_timeout_seconds=30,
        max_transcription_media_bytes=25_000_000,
        transcription_processor_mode="openai",
        automation_entitlement_assertion_secret=assertion_secret,
        automation_entitlement_assertion_signing_mode=signing_mode,
    )


def valid_assertion_payload(
    *,
    feature: str = PREMIUM_AUTOMATION_RUNTIME_FEATURE,
    plan: str = "pro",
    plan_source: str = "persisted_server_plan",
    user_id: str = "user-123",
) -> dict[str, object]:
    return {
        "audience": "automation-service",
        "expires_at": "2026-06-28T12:01:30.000Z",
        "feature": feature,
        "issued_at": "2026-06-28T12:00:00.000Z",
        "issuer": "api-gateway",
        "plan": plan,
        "plan_source": plan_source,
        "purpose": "premium_ai_access",
        "request_id": "req-123",
        "user_id": user_id,
    }


def fixed_now() -> datetime:
    return datetime(2026, 6, 28, 12, 0, 30, tzinfo=UTC)


def run_premium_operation(
    *,
    assertion: object | None,
    now: datetime | None = None,
    settings: Settings,
    signature: str | None,
    user_id: str | None,
) -> tuple[bool, object | HTTPException]:
    called = False

    async def operation() -> str:
        nonlocal called
        called = True
        return "premium-operation-ran"

    try:
        result = asyncio.run(
            run_ai_assistant_premium_operation(
                assertion=assertion,
                now=now,
                operation=operation,
                settings=settings,
                signature=signature,
                user_id=user_id,
            )
        )
    except HTTPException as error:
        return called, error

    return called, result


def valid_context_request(
    *,
    tenant_id: str = "tenant-123",
    user_id: str = "user-123",
    sources: tuple[AiContextSourceRequest, ...] | None = None,
    transcript_excerpt_characters: int = 1_200,
) -> AiAssistantContextRequest:
    return AiAssistantContextRequest(
        tenant_id=tenant_id,
        user_id=user_id,
        transcript_excerpt_characters=transcript_excerpt_characters,
        sources=sources
        or (
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


def run_backend_contract(
    *,
    assertion: object | None,
    signature: str | None,
    settings: Settings,
    context: AiAssistantContextRequest,
    prompt: str = "Summarize the recent creator performance safely.",
    feature: str = PREMIUM_AUTOMATION_RUNTIME_FEATURE,
    allow_not_yet_productive: bool = False,
    context_adapters: dict[str, object] | None = None,
) -> tuple[bool, object | HTTPException]:
    called = False

    async def operation(_request: object) -> str:
        nonlocal called
        called = True
        return "assistant-operation-ran"

    request = AiAssistantBackendContractRequest(
        context=context,
        feature=feature,
        prompt=prompt,
    )

    try:
        result = asyncio.run(
            run_ai_assistant_backend_operation(
                assertion=assertion,
                now=fixed_now(),
                operation=operation,
                request=request,
                settings=settings,
                signature=signature,
                allow_not_yet_productive=allow_not_yet_productive,
                context_adapters=context_adapters,
            )
        )
    except HTTPException as error:
        return called, error

    return called, result


def test_signed_ai_assistant_assertion_allows_internal_premium_operation() -> None:
    assertion = AutomationEntitlementAssertion.model_validate(valid_assertion_payload())
    signature = sign_automation_entitlement_assertion(
        assertion,
        secret=ASSERTION_SIGNING_TEST_SECRET,
    )

    called, result = run_premium_operation(
        assertion=assertion.model_dump(mode="python"),
        now=fixed_now(),
        settings=build_settings(),
        signature=signature,
        user_id="user-123",
    )

    assert called is True
    assert result == "premium-operation-ran"


@pytest.mark.parametrize(
    ("assertion", "signature", "user_id", "expected_code"),
    [
        pytest.param(
            None,
            None,
            "user-123",
            "entitlement_assertion_missing",
            id="missing assertion",
        ),
        pytest.param(
            valid_assertion_payload(),
            None,
            "user-123",
            "entitlement_assertion_signature_missing",
            id="missing signature",
        ),
        pytest.param(
            valid_assertion_payload(),
            "bad-signature",
            "user-123",
            "entitlement_assertion_signature_invalid",
            id="invalid signature",
        ),
        pytest.param(
            {**valid_assertion_payload(), "issuer": "other-service"},
            "placeholder",
            "user-123",
            "entitlement_assertion_malformed",
            id="wrong issuer",
        ),
        pytest.param(
            {**valid_assertion_payload(), "audience": "other-audience"},
            "placeholder",
            "user-123",
            "entitlement_assertion_malformed",
            id="wrong audience",
        ),
        pytest.param(
            {
                **valid_assertion_payload(),
                "issued_at": "2026-06-28T11:58:00.000Z",
                "expires_at": "2026-06-28T11:59:00.000Z",
            },
            "placeholder",
            "user-123",
            "entitlement_assertion_expired",
            id="expired",
        ),
        pytest.param(
            {**valid_assertion_payload(), "expires_at": "not-a-date"},
            "placeholder",
            "user-123",
            "entitlement_assertion_malformed",
            id="malformed",
        ),
        pytest.param(
            {**valid_assertion_payload(), "plan_source": "ui_badge"},
            "placeholder",
            "user-123",
            "entitlement_plan_source_untrusted",
            id="untrusted plan source",
        ),
        pytest.param(
            valid_assertion_payload(),
            "placeholder",
            "other-user",
            "entitlement_user_context_mismatch",
            id="user mismatch",
        ),
        pytest.param(
            {**valid_assertion_payload(), "plan": "free"},
            "placeholder",
            "user-123",
            "entitlement_feature_not_allowed",
            id="free plan",
        ),
    ],
)
def test_internal_premium_wrapper_fails_closed_for_invalid_entitlements(
    assertion: object | None,
    signature: str | None,
    user_id: str | None,
    expected_code: str,
) -> None:
    called, error = run_premium_operation(
        assertion=assertion,
        now=fixed_now(),
        settings=build_settings(),
        signature=signature,
        user_id=user_id,
    )

    assert called is False
    assert isinstance(error, HTTPException)
    assert error.status_code == 403
    assert error.detail["code"] == expected_code
    assert "secret" not in error.detail["message"].lower()
    assert "http://" not in error.detail["message"].lower()
    assert "https://" not in error.detail["message"].lower()
    assert "user-123" not in error.detail["message"]
    assert "req-123" not in error.detail["message"]


def test_internal_premium_wrapper_fails_closed_when_signed_runtime_is_disabled() -> None:
    assertion = AutomationEntitlementAssertion.model_validate(valid_assertion_payload())
    signature = sign_automation_entitlement_assertion(
        assertion,
        secret=ASSERTION_SIGNING_TEST_SECRET,
    )

    called, error = run_premium_operation(
        assertion=assertion.model_dump(mode="python"),
        now=fixed_now(),
        settings=build_settings(signing_mode="unsigned_internal_contract"),
        signature=signature,
        user_id="user-123",
    )

    assert called is False
    assert isinstance(error, HTTPException)
    assert error.status_code == 503
    assert error.detail == {
        "code": PREMIUM_RUNTIME_UNAVAILABLE_CODE,
        "message": PREMIUM_RUNTIME_UNAVAILABLE_MESSAGE,
    }


def test_runtime_unavailable_detail_stays_secret_safe() -> None:
    detail = build_premium_runtime_unavailable_detail()

    assert detail == {
        "code": PREMIUM_RUNTIME_UNAVAILABLE_CODE,
        "message": PREMIUM_RUNTIME_UNAVAILABLE_MESSAGE,
    }
    assert "secret" not in detail["message"].lower()
    assert "http://" not in detail["message"].lower()
    assert "https://" not in detail["message"].lower()


def test_backend_contract_denies_ai_assistant_when_not_yet_productive() -> None:
    assertion = AutomationEntitlementAssertion.model_validate(valid_assertion_payload())
    signature = sign_automation_entitlement_assertion(
        assertion,
        secret=ASSERTION_SIGNING_TEST_SECRET,
    )

    called, error = run_backend_contract(
        assertion=assertion.model_dump(mode="python"),
        signature=signature,
        settings=build_settings(),
        context=valid_context_request(),
    )

    assert called is False
    assert isinstance(error, HTTPException)
    assert error.status_code == 503
    assert error.detail == {
        "code": "ai_context_not_productive",
        "feature": "ai_assistant",
        "message": "The requested AI context path is not yet productive.",
    }


@pytest.mark.parametrize(
    ("assertion", "signature", "context", "expected_status", "expected_code"),
    [
        pytest.param(
            None,
            None,
            valid_context_request(),
            403,
            "entitlement_assertion_missing",
            id="missing entitlement assertion",
        ),
        pytest.param(
            valid_assertion_payload(),
            "bad-signature",
            valid_context_request(),
            403,
            "entitlement_assertion_signature_invalid",
            id="invalid entitlement signature",
        ),
        pytest.param(
            valid_assertion_payload(),
            "placeholder",
            valid_context_request(tenant_id="", user_id="user-123"),
            400,
            "ai_context_tenant_required",
            id="missing tenant context",
        ),
        pytest.param(
            valid_assertion_payload(),
            "placeholder",
            valid_context_request(
                sources=(AiContextSourceRequest(source="unknown_source"),)
            ),
            400,
            "ai_context_source_unknown",
            id="unknown context source",
        ),
        pytest.param(
            valid_assertion_payload(),
            "placeholder",
            valid_context_request(
                sources=(AiContextSourceRequest(source="refresh_tokens"),)
            ),
            403,
            "ai_context_sensitive_data_blocked",
            id="sensitive context source",
        ),
        pytest.param(
            valid_assertion_payload(),
            "placeholder",
            valid_context_request(
                sources=(
                    AiContextSourceRequest(
                        source="publication_history_summary",
                        time_window_days=120,
                    ),
                )
            ),
            400,
            "ai_context_window_too_large",
            id="window too large",
        ),
        pytest.param(
            valid_assertion_payload(),
            "placeholder",
            valid_context_request(
                sources=tuple(
                    AiContextSourceRequest(source="channel_platform_status")
                    for _ in range(7)
                )
            ),
            413,
            "ai_context_payload_too_large",
            id="too many sources",
        ),
        pytest.param(
            valid_assertion_payload(),
            "placeholder",
            valid_context_request(
                sources=(
                    AiContextSourceRequest(
                        source="clip_highlight_summary",
                        item_limit=5,
                        payload_bytes=9_000,
                    ),
                )
            ),
            413,
            "ai_context_payload_too_large",
            id="context payload too large",
        ),
    ],
)
def test_backend_contract_fails_closed_before_operation_for_denied_requests(
    assertion: object | None,
    signature: str | None,
    context: AiAssistantContextRequest,
    expected_status: int,
    expected_code: str,
) -> None:
    if signature == "placeholder" and assertion is not None:
        parsed_assertion = AutomationEntitlementAssertion.model_validate(assertion)
        signature = sign_automation_entitlement_assertion(
            parsed_assertion,
            secret=ASSERTION_SIGNING_TEST_SECRET,
        )

    called, error = run_backend_contract(
        assertion=assertion,
        signature=signature,
        settings=build_settings(),
        context=context,
        allow_not_yet_productive=True,
    )

    assert called is False
    assert isinstance(error, HTTPException)
    assert error.status_code == expected_status
    assert error.detail["code"] == expected_code
    serialized_detail = str(error.detail)
    assert "secret" not in serialized_detail.lower()
    assert "sk-server" not in serialized_detail
    assert "req-123" not in serialized_detail
    assert "http://" not in serialized_detail.lower()
    assert "https://" not in serialized_detail.lower()


def test_backend_contract_rejects_invalid_feature_before_operation() -> None:
    assertion = AutomationEntitlementAssertion.model_validate(valid_assertion_payload())
    signature = sign_automation_entitlement_assertion(
        assertion,
        secret=ASSERTION_SIGNING_TEST_SECRET,
    )

    called, error = run_backend_contract(
        assertion=assertion.model_dump(mode="python"),
        signature=signature,
        settings=build_settings(),
        context=valid_context_request(),
        feature="wrong_feature",
        allow_not_yet_productive=True,
    )

    assert called is False
    assert isinstance(error, HTTPException)
    assert error.status_code == 400
    assert error.detail == {
        "code": "ai_guardrail_invalid_feature",
        "feature": "ai_assistant",
        "message": "The requested AI feature is invalid.",
        "retryable": False,
    }


def test_backend_contract_success_path_is_mockable_without_real_openai_call() -> None:
    assertion = AutomationEntitlementAssertion.model_validate(valid_assertion_payload())
    signature = sign_automation_entitlement_assertion(
        assertion,
        secret=ASSERTION_SIGNING_TEST_SECRET,
    )

    called, result = run_backend_contract(
        assertion=assertion.model_dump(mode="python"),
        signature=signature,
        settings=build_settings(),
        context=valid_context_request(),
        allow_not_yet_productive=True,
    )

    assert called is True
    assert result == "assistant-operation-ran"


def test_backend_contract_rejects_oversized_prompt_before_operation() -> None:
    assertion = AutomationEntitlementAssertion.model_validate(valid_assertion_payload())
    signature = sign_automation_entitlement_assertion(
        assertion,
        secret=ASSERTION_SIGNING_TEST_SECRET,
    )

    called, error = run_backend_contract(
        assertion=assertion.model_dump(mode="python"),
        signature=signature,
        settings=build_settings(),
        context=valid_context_request(),
        prompt="x" * 20_000,
        allow_not_yet_productive=True,
    )

    assert called is False
    assert isinstance(error, HTTPException)
    assert error.status_code == 413
    assert error.detail == {
        "code": "ai_guardrail_input_too_large",
        "feature": "ai_assistant",
        "message": "The AI request exceeds the allowed input size.",
        "retryable": False,
    }


def test_backend_contract_prepare_includes_bounded_context_and_guardrail_sizes() -> None:
    assertion = AutomationEntitlementAssertion.model_validate(valid_assertion_payload())
    signature = sign_automation_entitlement_assertion(
        assertion,
        secret=ASSERTION_SIGNING_TEST_SECRET,
    )

    prepared = prepare_ai_assistant_backend_contract(
        AiAssistantBackendContractRequest(
            context=valid_context_request(),
            prompt="Summarize the last 30 days without exposing secrets.",
        ),
        assertion=assertion.model_dump(mode="python"),
        now=fixed_now(),
        settings=build_settings(),
        signature=signature,
        allow_not_yet_productive=True,
    )

    assert prepared.feature == "ai_assistant"
    assert prepared.context_boundary.feature == "ai_assistant"
    assert prepared.resolved_context.total_payload_bytes > 0
    assert prepared.context_boundary.source_count == 2
    assert prepared.request_payload_bytes > 0


def test_context_adapter_registry_contains_only_allowlisted_sources() -> None:
    assert set(AI_CONTEXT_SOURCE_ADAPTERS) == {
        "brand_asset_metadata",
        "channel_platform_status",
        "clip_highlight_summary",
        "content_job_summary",
        "monetization_summary",
        "publication_history_summary",
        "stream_performance_summary",
        "transcript_excerpt",
    }
    assert "refresh_tokens" not in AI_CONTEXT_SOURCE_ADAPTERS
    assert "oauth_access_tokens" not in AI_CONTEXT_SOURCE_ADAPTERS


def test_context_adapter_resolution_requires_tenant_and_user_context() -> None:
    assertion = AutomationEntitlementAssertion.model_validate(valid_assertion_payload())
    signature = sign_automation_entitlement_assertion(
        assertion,
        secret=ASSERTION_SIGNING_TEST_SECRET,
    )

    with pytest.raises(HTTPException) as error_info:
        prepare_ai_assistant_backend_contract(
            AiAssistantBackendContractRequest(
                context=valid_context_request(tenant_id="", user_id="user-123"),
                prompt="Summarize safely.",
            ),
            assertion=assertion.model_dump(mode="python"),
            now=fixed_now(),
            settings=build_settings(),
            signature=signature,
            allow_not_yet_productive=True,
        )

    assert error_info.value.status_code == 400
    assert error_info.value.detail == {
        "code": "ai_context_tenant_required",
        "feature": "ai_assistant",
        "message": "Tenant-scoped AI context requires trusted tenant and user identifiers.",
    }


def test_context_adapter_resolution_returns_stubbed_single_source_result() -> None:
    assertion = AutomationEntitlementAssertion.model_validate(valid_assertion_payload())
    signature = sign_automation_entitlement_assertion(
        assertion,
        secret=ASSERTION_SIGNING_TEST_SECRET,
    )

    prepared = prepare_ai_assistant_backend_contract(
        AiAssistantBackendContractRequest(
            context=valid_context_request(
                sources=(
                    AiContextSourceRequest(
                        source="channel_platform_status",
                        item_limit=1,
                        payload_bytes=1_024,
                        time_window_days=30,
                    ),
                )
            ),
            prompt="Summarize one source safely.",
        ),
        assertion=assertion.model_dump(mode="python"),
        now=fixed_now(),
        settings=build_settings(),
        signature=signature,
        allow_not_yet_productive=True,
    )

    assert len(prepared.resolved_context.sources) == 1
    resolved_source = prepared.resolved_context.sources[0]
    assert resolved_source.source == "channel_platform_status"
    assert resolved_source.payload_bytes > 0
    assert resolved_source.records[0]["source"] == "channel_platform_status"
    assert resolved_source.records[0]["summary"] == "channel_platform_status summary 1"


def test_context_adapter_resolution_supports_multiple_allowed_sources_within_limits() -> None:
    assertion = AutomationEntitlementAssertion.model_validate(valid_assertion_payload())
    signature = sign_automation_entitlement_assertion(
        assertion,
        secret=ASSERTION_SIGNING_TEST_SECRET,
    )

    prepared = prepare_ai_assistant_backend_contract(
        AiAssistantBackendContractRequest(
            context=valid_context_request(),
            prompt="Summarize multiple sources safely.",
        ),
        assertion=assertion.model_dump(mode="python"),
        now=fixed_now(),
        settings=build_settings(),
        signature=signature,
        allow_not_yet_productive=True,
    )

    assert tuple(source.source for source in prepared.resolved_context.sources) == (
        "channel_platform_status",
        "stream_performance_summary",
    )
    assert (
        prepared.resolved_context.total_payload_bytes
        <= prepared.context_boundary.total_payload_bytes
    )


def test_context_adapter_resolution_denies_source_without_registered_adapter() -> None:
    assertion = AutomationEntitlementAssertion.model_validate(valid_assertion_payload())
    signature = sign_automation_entitlement_assertion(
        assertion,
        secret=ASSERTION_SIGNING_TEST_SECRET,
    )

    with pytest.raises(HTTPException) as error_info:
        prepare_ai_assistant_backend_contract(
            AiAssistantBackendContractRequest(
                context=valid_context_request(
                    sources=(
                        AiContextSourceRequest(
                            source="channel_platform_status",
                            item_limit=1,
                            payload_bytes=1_024,
                            time_window_days=30,
                        ),
                    )
                ),
                prompt="Summarize safely.",
            ),
            assertion=assertion.model_dump(mode="python"),
            now=fixed_now(),
            settings=build_settings(),
            signature=signature,
            allow_not_yet_productive=True,
            context_adapters={},
        )

    assert error_info.value.status_code == 403
    assert error_info.value.detail == {
        "code": "ai_context_source_not_allowed",
        "feature": "ai_assistant",
        "message": "The requested AI context source is not allowed.",
        "source": "channel_platform_status",
    }


def test_backend_contract_does_not_execute_operation_after_adapter_deny() -> None:
    assertion = AutomationEntitlementAssertion.model_validate(valid_assertion_payload())
    signature = sign_automation_entitlement_assertion(
        assertion,
        secret=ASSERTION_SIGNING_TEST_SECRET,
    )

    called, error = run_backend_contract(
        assertion=assertion.model_dump(mode="python"),
        signature=signature,
        settings=build_settings(),
        context=valid_context_request(
            sources=(
                AiContextSourceRequest(
                    source="channel_platform_status",
                    item_limit=1,
                    payload_bytes=1_024,
                    time_window_days=30,
                ),
            )
        ),
        allow_not_yet_productive=True,
        context_adapters={},
    )

    assert called is False
    assert isinstance(error, HTTPException)
    assert error.status_code == 403
    assert error.detail["code"] == "ai_context_source_not_allowed"


def test_context_adapter_resolution_denies_payload_that_exceeds_requested_source_budget() -> (
    None
):
    assertion = AutomationEntitlementAssertion.model_validate(valid_assertion_payload())
    signature = sign_automation_entitlement_assertion(
        assertion,
        secret=ASSERTION_SIGNING_TEST_SECRET,
    )

    def oversized_adapter(
        _context_boundary: object, _requested_source: AiContextSourceRequest
    ) -> AiContextResolvedSource:
        return AiContextResolvedSource(
            source="channel_platform_status",
            records=({"summary": "x" * 400},),
            payload_bytes=9_999,
        )

    with pytest.raises(HTTPException) as error_info:
        prepare_ai_assistant_backend_contract(
            AiAssistantBackendContractRequest(
                context=valid_context_request(
                    sources=(
                        AiContextSourceRequest(
                            source="channel_platform_status",
                            item_limit=1,
                            payload_bytes=256,
                            time_window_days=30,
                        ),
                    )
                ),
                prompt="Summarize safely.",
            ),
            assertion=assertion.model_dump(mode="python"),
            now=fixed_now(),
            settings=build_settings(),
            signature=signature,
            allow_not_yet_productive=True,
            context_adapters={"channel_platform_status": oversized_adapter},
        )

    assert error_info.value.status_code == 413
    assert error_info.value.detail == {
        "code": "ai_context_payload_too_large",
        "feature": "ai_assistant",
        "message": "The requested AI context payload exceeds the allowed size.",
        "source": "channel_platform_status",
    }


def test_backend_contract_timeout_maps_to_guardrail_reason_code() -> None:
    assertion = AutomationEntitlementAssertion.model_validate(valid_assertion_payload())
    signature = sign_automation_entitlement_assertion(
        assertion,
        secret=ASSERTION_SIGNING_TEST_SECRET,
    )
    request = AiAssistantBackendContractRequest(
        context=valid_context_request(),
        prompt="Summarize performance safely.",
    )

    async def operation(_request: object) -> str:
        raise httpx.ReadTimeout("upstream timeout")

    with pytest.raises(HTTPException) as error_info:
        asyncio.run(
            run_ai_assistant_backend_operation(
                assertion=assertion.model_dump(mode="python"),
                now=fixed_now(),
                operation=operation,
                request=request,
                settings=build_settings(),
                signature=signature,
                allow_not_yet_productive=True,
            )
        )

    assert error_info.value.status_code == 504
    assert error_info.value.detail == {
        "code": "ai_guardrail_timeout",
        "feature": "ai_assistant",
        "message": "The AI request timed out before completion.",
        "retryable": True,
    }
