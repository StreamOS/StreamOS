import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ai_guardrails import AI_ASSISTANT_FEATURE
from entitlement_assertions import (
    ASSERTION_CLOCK_SKEW_SECONDS,
    ASSERTION_MAX_TTL_SECONDS,
    ASSERTION_MIN_SECRET_LENGTH,
    ASSERTION_SECRET_ENV_NAME,
    ASSERTION_SIGNATURE_ALGORITHM,
    ASSERTION_SIGNING_MODE_ENV_NAME,
    TRUSTED_PLAN_SOURCES,
    is_feature_allowed_for_plan,
)
from settings import Settings

AI_USAGE_CONTEXT_REASON_CODES = (
    "allowed",
    "ai_usage_context_denied",
    "ai_usage_context_expired",
    "ai_usage_context_feature_mismatch",
    "ai_usage_context_malformed",
    "ai_usage_context_missing",
    "ai_usage_context_plan_untrusted",
    "ai_usage_context_signature_invalid",
    "ai_usage_context_unavailable",
    "ai_usage_context_user_mismatch",
)
AI_USAGE_CONTEXT_ERROR_MESSAGES = {
    "allowed": "AI usage context accepted.",
    "ai_usage_context_denied": "The trusted AI usage context denied the request.",
    "ai_usage_context_expired": "The trusted AI usage context expired.",
    "ai_usage_context_feature_mismatch": (
        "The trusted AI usage context does not match the requested feature."
    ),
    "ai_usage_context_malformed": "The trusted AI usage context is invalid.",
    "ai_usage_context_missing": "A trusted AI usage context is required.",
    "ai_usage_context_plan_untrusted": (
        "The trusted AI usage context used an untrusted plan source."
    ),
    "ai_usage_context_signature_invalid": (
        "The trusted AI usage context signature is invalid."
    ),
    "ai_usage_context_unavailable": "AI usage context enforcement is unavailable.",
    "ai_usage_context_user_mismatch": (
        "The trusted AI usage context does not match the trusted request context."
    ),
}

AI_USAGE_CONTEXT_PURPOSE = "ai_usage_budget_admission"
AI_USAGE_CONTEXT_SIGNING_MODE = "hmac_sha256"

AiUsageContextReasonCode = Literal[
    "allowed",
    "ai_usage_context_denied",
    "ai_usage_context_expired",
    "ai_usage_context_feature_mismatch",
    "ai_usage_context_malformed",
    "ai_usage_context_missing",
    "ai_usage_context_plan_untrusted",
    "ai_usage_context_signature_invalid",
    "ai_usage_context_unavailable",
    "ai_usage_context_user_mismatch",
]
AiUsageContextBudgetStatus = Literal[
    "within_budget",
    "budget_exceeded",
    "budget_unavailable",
]
AiUsageContextAdmissionDecision = Literal["allow", "deny"]


class AutomationAiUsageContext(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    audience: Literal["automation-service"]
    estimated_usage_units: int = Field(gt=0)
    expires_at: str = Field(min_length=1)
    feature: str = Field(min_length=1)
    issued_at: str = Field(min_length=1)
    issuer: Literal["api-gateway"]
    plan_at_request_time: Literal["free", "pro", "agency"]
    plan_source: Literal["persisted_server_plan", "server_verified_billing"]
    purpose: Literal["ai_usage_budget_admission"] | None = None
    request_classification: str = Field(min_length=1, max_length=120)
    request_id: str = Field(min_length=1)
    tenant_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    admission_decision: AiUsageContextAdmissionDecision | None = None
    budget_status: AiUsageContextBudgetStatus | None = None


@dataclass(frozen=True)
class AutomationAiUsageContextValidation:
    allowed: bool
    context: AutomationAiUsageContext | None
    feature: str | None
    reason: AiUsageContextReasonCode
    request_id: str | None
    tenant_id: str | None
    user_id: str | None


def build_ai_usage_context_error_detail(
    reason: AiUsageContextReasonCode,
) -> dict[str, str]:
    return {
        "code": reason,
        "feature": AI_ASSISTANT_FEATURE,
        "message": AI_USAGE_CONTEXT_ERROR_MESSAGES[reason],
    }


def serialize_automation_ai_usage_context(
    context: AutomationAiUsageContext,
) -> str:
    payload: dict[str, object] = {
        "audience": context.audience,
        "estimated_usage_units": context.estimated_usage_units,
        "expires_at": context.expires_at,
        "feature": context.feature,
        "issued_at": context.issued_at,
        "issuer": context.issuer,
        "plan_at_request_time": context.plan_at_request_time,
        "plan_source": context.plan_source,
        "request_classification": context.request_classification,
        "request_id": context.request_id,
        "tenant_id": context.tenant_id,
        "user_id": context.user_id,
    }
    if context.purpose is not None:
        payload["purpose"] = context.purpose
    if context.admission_decision is not None:
        payload["admission_decision"] = context.admission_decision
    if context.budget_status is not None:
        payload["budget_status"] = context.budget_status

    return json.dumps(payload, separators=(",", ":"), ensure_ascii=True)


def sign_automation_ai_usage_context(
    context: AutomationAiUsageContext,
    *,
    secret: str | None,
) -> str:
    normalized_secret = _normalize_secret(secret)
    _assert_signing_secret(normalized_secret)

    return hmac.new(
        normalized_secret.encode("utf-8"),
        serialize_automation_ai_usage_context(context).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def verify_automation_ai_usage_context_signature(
    context: AutomationAiUsageContext,
    *,
    secret: str | None,
    signature: str | None,
) -> bool:
    normalized_signature = _normalize_optional_non_empty_string(signature)
    if normalized_signature is None:
        return False

    normalized_secret = _normalize_secret(secret)
    _assert_signing_secret(normalized_secret)

    return hmac.compare_digest(
        sign_automation_ai_usage_context(context, secret=normalized_secret),
        normalized_signature,
    )


def validate_automation_ai_usage_context(
    usage_context: object | None,
    *,
    feature: str,
    now: datetime | None = None,
    request_id: str | None,
    tenant_id: str | None,
    user_id: str | None,
) -> AutomationAiUsageContextValidation:
    normalized_feature = feature.strip()
    normalized_request_id = _normalize_optional_non_empty_string(request_id)
    normalized_tenant_id = _normalize_optional_non_empty_string(tenant_id)
    normalized_user_id = _normalize_optional_non_empty_string(user_id)

    if (
        normalized_feature != AI_ASSISTANT_FEATURE
        or normalized_request_id is None
        or normalized_tenant_id is None
        or normalized_user_id is None
    ):
        return _deny(
            feature=AI_ASSISTANT_FEATURE,
            reason="ai_usage_context_missing",
            request_id=normalized_request_id,
            tenant_id=normalized_tenant_id,
            user_id=normalized_user_id,
        )

    if usage_context is None:
        return _deny(
            feature=AI_ASSISTANT_FEATURE,
            reason="ai_usage_context_missing",
            request_id=normalized_request_id,
            tenant_id=normalized_tenant_id,
            user_id=normalized_user_id,
        )

    try:
        parsed = AutomationAiUsageContext.model_validate(usage_context)
    except ValidationError:
        plan_source = _extract_plan_source(usage_context)
        reason: AiUsageContextReasonCode = (
            "ai_usage_context_plan_untrusted"
            if plan_source is not None and plan_source not in TRUSTED_PLAN_SOURCES
            else "ai_usage_context_malformed"
        )
        return _deny(
            feature=AI_ASSISTANT_FEATURE,
            reason=reason,
            request_id=normalized_request_id,
            tenant_id=normalized_tenant_id,
            user_id=normalized_user_id,
        )

    if parsed.purpose is not None and parsed.purpose != AI_USAGE_CONTEXT_PURPOSE:
        return _deny(
            feature=AI_ASSISTANT_FEATURE,
            reason="ai_usage_context_malformed",
            request_id=normalized_request_id,
            tenant_id=normalized_tenant_id,
            user_id=normalized_user_id,
        )

    if parsed.feature != AI_ASSISTANT_FEATURE:
        return _deny(
            feature=AI_ASSISTANT_FEATURE,
            reason="ai_usage_context_feature_mismatch",
            request_id=normalized_request_id,
            tenant_id=normalized_tenant_id,
            user_id=normalized_user_id,
        )

    if (
        parsed.user_id != normalized_user_id
        or parsed.tenant_id != normalized_tenant_id
        or parsed.request_id != normalized_request_id
    ):
        return _deny(
            feature=AI_ASSISTANT_FEATURE,
            reason="ai_usage_context_user_mismatch",
            request_id=normalized_request_id,
            tenant_id=normalized_tenant_id,
            user_id=normalized_user_id,
        )

    issued_at = _parse_timestamp(parsed.issued_at)
    expires_at = _parse_timestamp(parsed.expires_at)
    if issued_at is None or expires_at is None or expires_at <= issued_at:
        return _deny(
            feature=AI_ASSISTANT_FEATURE,
            reason="ai_usage_context_malformed",
            request_id=normalized_request_id,
            tenant_id=normalized_tenant_id,
            user_id=normalized_user_id,
        )

    comparison_now = _normalize_now(now)
    if (
        (expires_at - issued_at).total_seconds() > ASSERTION_MAX_TTL_SECONDS
        or (issued_at - comparison_now).total_seconds() > ASSERTION_CLOCK_SKEW_SECONDS
    ):
        return _deny(
            feature=AI_ASSISTANT_FEATURE,
            reason="ai_usage_context_malformed",
            request_id=normalized_request_id,
            tenant_id=normalized_tenant_id,
            user_id=normalized_user_id,
        )

    if (comparison_now - expires_at).total_seconds() > ASSERTION_CLOCK_SKEW_SECONDS:
        return _deny(
            feature=AI_ASSISTANT_FEATURE,
            reason="ai_usage_context_expired",
            request_id=normalized_request_id,
            tenant_id=normalized_tenant_id,
            user_id=normalized_user_id,
        )

    if not is_feature_allowed_for_plan(
        parsed.feature, parsed.plan_at_request_time
    ) or parsed.admission_decision == "deny" or parsed.budget_status in {
        "budget_exceeded",
        "budget_unavailable",
    }:
        return _deny(
            feature=AI_ASSISTANT_FEATURE,
            reason="ai_usage_context_denied",
            request_id=normalized_request_id,
            tenant_id=normalized_tenant_id,
            user_id=normalized_user_id,
        )

    return AutomationAiUsageContextValidation(
        allowed=True,
        context=parsed,
        feature=parsed.feature,
        reason="allowed",
        request_id=parsed.request_id,
        tenant_id=parsed.tenant_id,
        user_id=parsed.user_id,
    )


def validate_signed_automation_ai_usage_context(
    usage_context: object | None,
    *,
    feature: str,
    now: datetime | None = None,
    request_id: str | None,
    secret: str | None,
    signature: str | None,
    tenant_id: str | None,
    user_id: str | None,
) -> AutomationAiUsageContextValidation:
    result = validate_automation_ai_usage_context(
        usage_context,
        feature=feature,
        now=now,
        request_id=request_id,
        tenant_id=tenant_id,
        user_id=user_id,
    )
    if not result.allowed or result.context is None:
        return result

    if not verify_automation_ai_usage_context_signature(
        result.context,
        secret=secret,
        signature=signature,
    ):
        return _deny(
            feature=result.feature,
            reason="ai_usage_context_signature_invalid",
            request_id=result.request_id,
            tenant_id=result.tenant_id,
            user_id=result.user_id,
        )

    return result


def require_ai_assistant_usage_context(
    *,
    feature: str,
    now: datetime | None = None,
    request_id: str | None,
    settings: Settings,
    signature: str | None,
    tenant_id: str | None,
    usage_context: object | None,
    user_id: str | None,
) -> AutomationAiUsageContext:
    if (
        settings.automation_entitlement_assertion_signing_mode
        != AI_USAGE_CONTEXT_SIGNING_MODE
    ):
        raise HTTPException(
            status_code=503,
            detail=build_ai_usage_context_error_detail("ai_usage_context_unavailable"),
        )

    validation = validate_signed_automation_ai_usage_context(
        usage_context,
        feature=feature,
        now=now,
        request_id=request_id,
        secret=settings.automation_entitlement_assertion_secret,
        signature=signature,
        tenant_id=tenant_id,
        user_id=user_id,
    )
    if not validation.allowed or validation.context is None:
        raise HTTPException(
            status_code=_status_code_for_reason(validation.reason),
            detail=build_ai_usage_context_error_detail(validation.reason),
        )

    return validation.context


def _status_code_for_reason(reason: AiUsageContextReasonCode) -> int:
    if reason == "ai_usage_context_unavailable":
        return 503
    if reason == "ai_usage_context_missing":
        return 403
    if reason == "ai_usage_context_expired":
        return 403
    if reason == "ai_usage_context_malformed":
        return 403
    if reason == "ai_usage_context_feature_mismatch":
        return 403
    if reason == "ai_usage_context_user_mismatch":
        return 403
    if reason == "ai_usage_context_plan_untrusted":
        return 403
    if reason == "ai_usage_context_denied":
        return 403
    if reason == "ai_usage_context_signature_invalid":
        return 403
    return 500


def _deny(
    *,
    feature: str | None,
    reason: AiUsageContextReasonCode,
    request_id: str | None,
    tenant_id: str | None,
    user_id: str | None,
) -> AutomationAiUsageContextValidation:
    return AutomationAiUsageContextValidation(
        allowed=False,
        context=None,
        feature=feature,
        reason=reason,
        request_id=request_id,
        tenant_id=tenant_id,
        user_id=user_id,
    )


def _normalize_now(value: datetime | None) -> datetime:
    if value is None:
        return datetime.now(UTC)

    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)

    return value.astimezone(UTC)


def _parse_timestamp(value: str) -> datetime | None:
    candidate = value.strip()
    if not candidate:
        return None

    normalized = candidate.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)

    return parsed.astimezone(UTC)


def _extract_plan_source(value: object) -> str | None:
    if not isinstance(value, dict):
        return None

    plan_source = value.get("plan_source")
    if not isinstance(plan_source, str):
        return None

    normalized = plan_source.strip()
    return normalized or None


def _normalize_secret(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = value.strip()
    return normalized or None


def _normalize_optional_non_empty_string(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = value.strip()
    return normalized or None


def _assert_signing_secret(secret: str | None) -> None:
    if secret is None:
        raise ValueError(
            f"{ASSERTION_SECRET_ENV_NAME} is required when {ASSERTION_SIGNING_MODE_ENV_NAME}={AI_USAGE_CONTEXT_SIGNING_MODE}."
        )

    if len(secret) < ASSERTION_MIN_SECRET_LENGTH:
        raise ValueError(
            f"{ASSERTION_SECRET_ENV_NAME} must be at least {ASSERTION_MIN_SECRET_LENGTH} characters for {ASSERTION_SIGNATURE_ALGORITHM}."
        )
