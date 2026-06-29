from dataclasses import dataclass
from typing import Literal

AI_GUARDRAIL_REASON_CODES = (
    "ai_guardrail_input_too_large",
    "ai_guardrail_media_too_large",
    "ai_guardrail_timeout",
    "ai_guardrail_feature_unavailable",
    "ai_guardrail_usage_budget_unavailable",
    "ai_guardrail_request_denied",
    "ai_guardrail_invalid_feature",
    "ai_guardrail_internal_error",
)
AI_GUARDRAIL_MESSAGES = {
    "ai_guardrail_input_too_large": "The AI request exceeds the allowed input size.",
    "ai_guardrail_media_too_large": "The AI media input exceeds the allowed size.",
    "ai_guardrail_timeout": "The AI request timed out before completion.",
    "ai_guardrail_feature_unavailable": "The requested AI feature is not available.",
    "ai_guardrail_usage_budget_unavailable": (
        "The AI request could not be accepted because usage budget context is unavailable."
    ),
    "ai_guardrail_request_denied": "The AI request was denied by server guardrails.",
    "ai_guardrail_invalid_feature": "The requested AI feature is invalid.",
    "ai_guardrail_internal_error": "The AI request failed before completion.",
}

AutomationAiGuardrailFeature = Literal[
    "clips_analyze",
    "repurposing_plan",
    "transcriptions_process",
    "ai_assistant",
]
AutomationAiGuardrailReasonCode = Literal[
    "ai_guardrail_input_too_large",
    "ai_guardrail_media_too_large",
    "ai_guardrail_timeout",
    "ai_guardrail_feature_unavailable",
    "ai_guardrail_usage_budget_unavailable",
    "ai_guardrail_request_denied",
    "ai_guardrail_invalid_feature",
    "ai_guardrail_internal_error",
]
AutomationAiGuardrailRuntimeStatus = Literal["active", "not_yet_productive"]

CLIP_ANALYZE_FEATURE: AutomationAiGuardrailFeature = "clips_analyze"
REPURPOSING_PLAN_FEATURE: AutomationAiGuardrailFeature = "repurposing_plan"
TRANSCRIPTIONS_PROCESS_FEATURE: AutomationAiGuardrailFeature = (
    "transcriptions_process"
)
AI_ASSISTANT_FEATURE: AutomationAiGuardrailFeature = "ai_assistant"

CLIP_ANALYSIS_MAX_REQUEST_BYTES = 65_536
REPURPOSING_PLAN_MAX_REQUEST_BYTES = 32_768
AI_ASSISTANT_MAX_REQUEST_BYTES = 16_384


@dataclass(frozen=True)
class AiGuardrailPolicy:
    feature: AutomationAiGuardrailFeature
    runtime_status: AutomationAiGuardrailRuntimeStatus
    requires_signed_entitlement: bool
    max_request_bytes: int | None = None
    max_text_characters: int | None = None


@dataclass(frozen=True)
class AiGuardrailError(Exception):
    code: AutomationAiGuardrailReasonCode
    feature: AutomationAiGuardrailFeature
    status_code: int
    retryable: bool


AI_GUARDRAIL_POLICIES: dict[AutomationAiGuardrailFeature, AiGuardrailPolicy] = {
    CLIP_ANALYZE_FEATURE: AiGuardrailPolicy(
        feature=CLIP_ANALYZE_FEATURE,
        runtime_status="active",
        requires_signed_entitlement=False,
        max_request_bytes=CLIP_ANALYSIS_MAX_REQUEST_BYTES,
        max_text_characters=60_000,
    ),
    REPURPOSING_PLAN_FEATURE: AiGuardrailPolicy(
        feature=REPURPOSING_PLAN_FEATURE,
        runtime_status="active",
        requires_signed_entitlement=False,
        max_request_bytes=REPURPOSING_PLAN_MAX_REQUEST_BYTES,
    ),
    TRANSCRIPTIONS_PROCESS_FEATURE: AiGuardrailPolicy(
        feature=TRANSCRIPTIONS_PROCESS_FEATURE,
        runtime_status="active",
        requires_signed_entitlement=False,
    ),
    AI_ASSISTANT_FEATURE: AiGuardrailPolicy(
        feature=AI_ASSISTANT_FEATURE,
        runtime_status="not_yet_productive",
        requires_signed_entitlement=True,
        max_request_bytes=AI_ASSISTANT_MAX_REQUEST_BYTES,
    ),
}


def build_ai_guardrail_detail(error: AiGuardrailError) -> dict[str, object]:
    return {
        "code": error.code,
        "feature": error.feature,
        "message": AI_GUARDRAIL_MESSAGES[error.code],
        "retryable": error.retryable,
    }


def get_ai_guardrail_policy(feature: str) -> AiGuardrailPolicy:
    normalized_feature = feature.strip()

    if normalized_feature not in AI_GUARDRAIL_POLICIES:
        raise AiGuardrailError(
            code="ai_guardrail_invalid_feature",
            feature=AI_ASSISTANT_FEATURE,
            status_code=400,
            retryable=False,
        )

    return AI_GUARDRAIL_POLICIES[normalized_feature]


def ensure_ai_guardrail_feature_is_productive(feature: str) -> AiGuardrailPolicy:
    policy = get_ai_guardrail_policy(feature)

    if policy.runtime_status != "active":
        raise AiGuardrailError(
            code="ai_guardrail_feature_unavailable",
            feature=policy.feature,
            status_code=503,
            retryable=False,
        )

    return policy


def build_ai_guardrail_timeout_error(
    feature: AutomationAiGuardrailFeature,
) -> AiGuardrailError:
    return AiGuardrailError(
        code="ai_guardrail_timeout",
        feature=feature,
        status_code=504,
        retryable=True,
    )


def enforce_max_request_bytes(
    *,
    feature: AutomationAiGuardrailFeature,
    value: str,
    max_request_bytes: int | None,
) -> None:
    if max_request_bytes is None:
        return

    if len(value.encode("utf-8")) > max_request_bytes:
        raise AiGuardrailError(
            code="ai_guardrail_input_too_large",
            feature=feature,
            status_code=413,
            retryable=False,
        )


def enforce_max_text_characters(
    *,
    feature: AutomationAiGuardrailFeature,
    value: str,
    max_text_characters: int | None,
) -> None:
    if max_text_characters is None:
        return

    if len(value) > max_text_characters:
        raise AiGuardrailError(
            code="ai_guardrail_input_too_large",
            feature=feature,
            status_code=413,
            retryable=False,
        )


def enforce_max_media_bytes(
    *,
    feature: AutomationAiGuardrailFeature,
    media_bytes: bytes,
    max_media_bytes: int,
) -> None:
    if len(media_bytes) > max_media_bytes:
        raise AiGuardrailError(
            code="ai_guardrail_media_too_large",
            feature=feature,
            status_code=413,
            retryable=False,
        )
