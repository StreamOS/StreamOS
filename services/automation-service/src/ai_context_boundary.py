from dataclasses import dataclass
from typing import Literal

from ai_guardrails import (
    AI_ASSISTANT_FEATURE,
    AiGuardrailError,
    ensure_ai_guardrail_feature_is_productive,
)

AI_CONTEXT_REASON_CODES = (
    "ai_context_source_not_allowed",
    "ai_context_source_unknown",
    "ai_context_source_unavailable",
    "ai_context_tenant_required",
    "ai_context_window_too_large",
    "ai_context_payload_too_large",
    "ai_context_sensitive_data_blocked",
    "ai_context_not_productive",
    "ai_context_internal_error",
)
AI_CONTEXT_ERROR_MESSAGES = {
    "ai_context_source_not_allowed": "The requested AI context source is not allowed.",
    "ai_context_source_unknown": "The requested AI context source is unknown.",
    "ai_context_source_unavailable": "The requested AI context source is currently unavailable.",
    "ai_context_tenant_required": "Tenant-scoped AI context requires trusted tenant and user identifiers.",
    "ai_context_window_too_large": "The requested AI context window exceeds the allowed range.",
    "ai_context_payload_too_large": "The requested AI context payload exceeds the allowed size.",
    "ai_context_sensitive_data_blocked": "Sensitive AI context sources are blocked.",
    "ai_context_not_productive": "The requested AI context path is not yet productive.",
    "ai_context_internal_error": "The AI context request could not be prepared.",
}

AiContextReasonCode = Literal[
    "ai_context_source_not_allowed",
    "ai_context_source_unknown",
    "ai_context_source_unavailable",
    "ai_context_tenant_required",
    "ai_context_window_too_large",
    "ai_context_payload_too_large",
    "ai_context_sensitive_data_blocked",
    "ai_context_not_productive",
    "ai_context_internal_error",
]
AiContextSourceKey = Literal[
    "brand_asset_metadata",
    "channel_platform_status",
    "clip_highlight_summary",
    "content_job_summary",
    "monetization_summary",
    "publication_history_summary",
    "stream_performance_summary",
    "transcript_excerpt",
]

DEFAULT_CONTEXT_WINDOW_DAYS = 30
MAX_CONTEXT_WINDOW_DAYS = 90
MAX_CONTEXT_SOURCE_COUNT = 6
MAX_CONTEXT_ITEM_LIMIT = 50
MAX_CONTEXT_PAYLOAD_BYTES = 24_576
MAX_CONTEXT_TOTAL_PAYLOAD_BYTES = 49_152
MAX_TRANSCRIPT_EXCERPT_CHARACTERS = 4_000

SENSITIVE_CONTEXT_SOURCES = frozenset(
    {
        "oauth_access_tokens",
        "refresh_tokens",
        "provider_secrets",
        "openai_keys",
        "supabase_service_role_keys",
        "private_railway_urls",
        "raw_provider_payloads",
        "cross_tenant_data",
        "payment_detail_records",
        "private_original_files",
        "prompt_raw_content",
        "entitlement_assertions",
        "secret_logs",
    }
)
ALLOWED_CONTEXT_SOURCES = frozenset(
    {
        "brand_asset_metadata",
        "channel_platform_status",
        "clip_highlight_summary",
        "content_job_summary",
        "monetization_summary",
        "publication_history_summary",
        "stream_performance_summary",
        "transcript_excerpt",
    }
)


@dataclass(frozen=True)
class AiContextSourcePolicy:
    source: AiContextSourceKey
    classification: str
    description: str
    max_window_days: int
    max_item_limit: int
    max_payload_bytes: int


@dataclass(frozen=True)
class AiContextSourceRequest:
    source: str
    item_limit: int = 10
    payload_bytes: int = 2_048
    time_window_days: int = DEFAULT_CONTEXT_WINDOW_DAYS


@dataclass(frozen=True)
class AiAssistantContextRequest:
    tenant_id: str
    user_id: str
    sources: tuple[AiContextSourceRequest, ...]
    transcript_excerpt_characters: int = 0


@dataclass(frozen=True)
class AiContextBoundaryError(Exception):
    code: AiContextReasonCode
    status_code: int
    feature: str = AI_ASSISTANT_FEATURE
    source: str | None = None


@dataclass(frozen=True)
class AiAssistantContextBoundary:
    feature: str
    tenant_id: str
    user_id: str
    source_count: int
    total_payload_bytes: int
    transcript_excerpt_characters: int
    sources: tuple[AiContextSourceRequest, ...]


AI_CONTEXT_SOURCE_POLICIES: dict[AiContextSourceKey, AiContextSourcePolicy] = {
    "brand_asset_metadata": AiContextSourcePolicy(
        source="brand_asset_metadata",
        classification="allowlisted",
        description="Brand asset metadata only, without private originals or secrets.",
        max_window_days=MAX_CONTEXT_WINDOW_DAYS,
        max_item_limit=25,
        max_payload_bytes=4_096,
    ),
    "channel_platform_status": AiContextSourcePolicy(
        source="channel_platform_status",
        classification="allowlisted",
        description="Own channel and platform connection status in a secret-safe form.",
        max_window_days=MAX_CONTEXT_WINDOW_DAYS,
        max_item_limit=20,
        max_payload_bytes=4_096,
    ),
    "clip_highlight_summary": AiContextSourcePolicy(
        source="clip_highlight_summary",
        classification="allowlisted",
        description="Own clips and highlights summarized without raw private media.",
        max_window_days=MAX_CONTEXT_WINDOW_DAYS,
        max_item_limit=30,
        max_payload_bytes=8_192,
    ),
    "content_job_summary": AiContextSourcePolicy(
        source="content_job_summary",
        classification="allowlisted",
        description="Own content jobs in creator-safe summary form.",
        max_window_days=MAX_CONTEXT_WINDOW_DAYS,
        max_item_limit=30,
        max_payload_bytes=6_144,
    ),
    "monetization_summary": AiContextSourcePolicy(
        source="monetization_summary",
        classification="allowlisted",
        description="Own monetization summaries in aggregated, non-sensitive form.",
        max_window_days=MAX_CONTEXT_WINDOW_DAYS,
        max_item_limit=12,
        max_payload_bytes=4_096,
    ),
    "publication_history_summary": AiContextSourcePolicy(
        source="publication_history_summary",
        classification="allowlisted",
        description="Own publication history in creator-safe summary form.",
        max_window_days=MAX_CONTEXT_WINDOW_DAYS,
        max_item_limit=30,
        max_payload_bytes=6_144,
    ),
    "stream_performance_summary": AiContextSourcePolicy(
        source="stream_performance_summary",
        classification="allowlisted",
        description="Own stream performance metrics within bounded windows.",
        max_window_days=MAX_CONTEXT_WINDOW_DAYS,
        max_item_limit=20,
        max_payload_bytes=6_144,
    ),
    "transcript_excerpt": AiContextSourcePolicy(
        source="transcript_excerpt",
        classification="allowlisted",
        description="Own transcript excerpts only, bounded in size and time.",
        max_window_days=MAX_CONTEXT_WINDOW_DAYS,
        max_item_limit=20,
        max_payload_bytes=8_192,
    ),
}


def build_ai_context_error_detail(error: AiContextBoundaryError) -> dict[str, object]:
    detail: dict[str, object] = {
        "code": error.code,
        "feature": error.feature,
        "message": AI_CONTEXT_ERROR_MESSAGES[error.code],
    }
    sanitized_source = _sanitize_context_source_for_detail(error.source)
    if sanitized_source is not None:
        detail["source"] = sanitized_source

    return detail


def get_ai_context_source_policy(source: str) -> AiContextSourcePolicy:
    normalized_source = source.strip()

    if normalized_source in SENSITIVE_CONTEXT_SOURCES:
        raise AiContextBoundaryError(
            code="ai_context_sensitive_data_blocked",
            source=normalized_source,
            status_code=403,
        )

    if normalized_source not in ALLOWED_CONTEXT_SOURCES:
        raise AiContextBoundaryError(
            code="ai_context_source_unknown",
            source=normalized_source,
            status_code=400,
        )

    return AI_CONTEXT_SOURCE_POLICIES[normalized_source]


def validate_ai_assistant_context_boundary(
    request: AiAssistantContextRequest,
    *,
    require_productive: bool = False,
) -> AiAssistantContextBoundary:
    tenant_id = request.tenant_id.strip()
    user_id = request.user_id.strip()
    if not tenant_id or not user_id:
        raise AiContextBoundaryError(
            code="ai_context_tenant_required",
            status_code=400,
        )

    if require_productive:
        try:
            ensure_ai_guardrail_feature_is_productive(AI_ASSISTANT_FEATURE)
        except AiGuardrailError as error:
            raise AiContextBoundaryError(
                code="ai_context_not_productive",
                status_code=503,
            ) from error

    if not request.sources or len(request.sources) > MAX_CONTEXT_SOURCE_COUNT:
        raise AiContextBoundaryError(
            code="ai_context_payload_too_large",
            status_code=413,
        )

    if request.transcript_excerpt_characters > MAX_TRANSCRIPT_EXCERPT_CHARACTERS:
        raise AiContextBoundaryError(
            code="ai_context_payload_too_large",
            status_code=413,
            source="transcript_excerpt",
        )

    total_payload_bytes = 0
    normalized_sources: list[AiContextSourceRequest] = []
    for requested_source in request.sources:
        policy = get_ai_context_source_policy(requested_source.source)

        if requested_source.time_window_days <= 0:
            raise AiContextBoundaryError(
                code="ai_context_window_too_large",
                status_code=400,
                source=policy.source,
            )
        if requested_source.time_window_days > policy.max_window_days:
            raise AiContextBoundaryError(
                code="ai_context_window_too_large",
                status_code=400,
                source=policy.source,
            )

        if requested_source.item_limit <= 0:
            raise AiContextBoundaryError(
                code="ai_context_payload_too_large",
                status_code=413,
                source=policy.source,
            )
        if requested_source.item_limit > min(policy.max_item_limit, MAX_CONTEXT_ITEM_LIMIT):
            raise AiContextBoundaryError(
                code="ai_context_payload_too_large",
                status_code=413,
                source=policy.source,
            )

        if requested_source.payload_bytes <= 0:
            raise AiContextBoundaryError(
                code="ai_context_payload_too_large",
                status_code=413,
                source=policy.source,
            )
        if requested_source.payload_bytes > policy.max_payload_bytes:
            raise AiContextBoundaryError(
                code="ai_context_payload_too_large",
                status_code=413,
                source=policy.source,
            )

        total_payload_bytes += requested_source.payload_bytes
        normalized_sources.append(
            AiContextSourceRequest(
                source=policy.source,
                item_limit=requested_source.item_limit,
                payload_bytes=requested_source.payload_bytes,
                time_window_days=requested_source.time_window_days,
            )
        )

    if total_payload_bytes > MAX_CONTEXT_TOTAL_PAYLOAD_BYTES:
        raise AiContextBoundaryError(
            code="ai_context_payload_too_large",
            status_code=413,
        )

    return AiAssistantContextBoundary(
        feature=AI_ASSISTANT_FEATURE,
        tenant_id=tenant_id,
        user_id=user_id,
        source_count=len(normalized_sources),
        total_payload_bytes=total_payload_bytes,
        transcript_excerpt_characters=request.transcript_excerpt_characters,
        sources=tuple(normalized_sources),
    )


def _sanitize_context_source_for_detail(source: str | None) -> str | None:
    if source is None:
        return None

    normalized_source = source.strip()
    if not normalized_source:
        return None

    if normalized_source in ALLOWED_CONTEXT_SOURCES:
        return normalized_source
    if normalized_source in SENSITIVE_CONTEXT_SOURCES:
        return normalized_source
    if len(normalized_source) > 64:
        return None
    if "://" in normalized_source or "/" in normalized_source:
        return None
    if "?" in normalized_source or "=" in normalized_source:
        return None
    if "." in normalized_source:
        return None
    if normalized_source.startswith("sk-"):
        return None
    if not normalized_source.replace("_", "").replace("-", "").isalnum():
        return None

    return normalized_source
