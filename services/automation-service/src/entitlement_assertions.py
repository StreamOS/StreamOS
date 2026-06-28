import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

FEATURE_KEYS = (
    "ai_assistant",
    "advanced_analytics",
    "publishing_schedule",
    "monetization_exports",
    "branding_ai",
    "team_workspace",
)
ENTITLEMENT_PLANS = ("free", "pro", "agency")
TRUSTED_PLAN_SOURCES = ("persisted_server_plan", "server_verified_billing")
ASSERTION_ISSUERS = ("api-gateway",)
ASSERTION_AUDIENCES = ("automation-service",)
ASSERTION_PURPOSES = ("premium_ai_access",)
ASSERTION_REASON_CODES = (
    "allowed",
    "entitlement_assertion_missing",
    "entitlement_assertion_expired",
    "entitlement_assertion_malformed",
    "entitlement_assertion_signature_invalid",
    "entitlement_assertion_signature_missing",
    "entitlement_feature_not_allowed",
    "entitlement_plan_source_untrusted",
    "entitlement_user_context_mismatch",
)
ASSERTION_SIGNING_MODES = ("unsigned_internal_contract", "hmac_sha256")
ASSERTION_SECRET_ENV_NAME = "AUTOMATION_ENTITLEMENT_ASSERTION_SECRET"
ASSERTION_SIGNING_MODE_ENV_NAME = "AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE"
ASSERTION_SIGNATURE_ALGORITHM = "hmac-sha256"
ASSERTION_MIN_SECRET_LENGTH = 32
ASSERTION_MAX_TTL_SECONDS = 120
ASSERTION_CLOCK_SKEW_SECONDS = 15

EntitlementFeatureKey = Literal[
    "ai_assistant",
    "advanced_analytics",
    "publishing_schedule",
    "monetization_exports",
    "branding_ai",
    "team_workspace",
]
EntitlementPlan = Literal["free", "pro", "agency"]
TrustedPlanSource = Literal["persisted_server_plan", "server_verified_billing"]
AssertionIssuer = Literal["api-gateway"]
AssertionAudience = Literal["automation-service"]
AssertionPurpose = Literal["premium_ai_access"]
EntitlementAssertionReasonCode = Literal[
    "allowed",
    "entitlement_assertion_missing",
    "entitlement_assertion_expired",
    "entitlement_assertion_malformed",
    "entitlement_assertion_signature_invalid",
    "entitlement_assertion_signature_missing",
    "entitlement_feature_not_allowed",
    "entitlement_plan_source_untrusted",
    "entitlement_user_context_mismatch",
]
AssertionSigningMode = Literal["unsigned_internal_contract", "hmac_sha256"]

PLAN_RANK = {
    "free": 0,
    "pro": 1,
    "agency": 2,
}
FEATURE_MINIMUM_PLAN: dict[EntitlementFeatureKey, EntitlementPlan] = {
    "advanced_analytics": "pro",
    "ai_assistant": "pro",
    "branding_ai": "pro",
    "monetization_exports": "pro",
    "publishing_schedule": "pro",
    "team_workspace": "agency",
}
ERROR_MESSAGES: dict[EntitlementAssertionReasonCode, str] = {
    "allowed": "Entitlement assertion accepted.",
    "entitlement_assertion_missing": "A valid internal entitlement assertion is required.",
    "entitlement_assertion_expired": "The internal entitlement assertion expired.",
    "entitlement_assertion_malformed": "The internal entitlement assertion is invalid.",
    "entitlement_assertion_signature_invalid": "The internal entitlement assertion signature is invalid.",
    "entitlement_assertion_signature_missing": "A signed internal entitlement assertion is required.",
    "entitlement_feature_not_allowed": "The requested premium feature is not enabled.",
    "entitlement_plan_source_untrusted": "The entitlement assertion used an untrusted plan source.",
    "entitlement_user_context_mismatch": "The entitlement assertion does not match the authenticated server user context.",
}


class AutomationEntitlementAssertion(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    audience: AssertionAudience
    expires_at: str = Field(min_length=1)
    feature: EntitlementFeatureKey
    issued_at: str = Field(min_length=1)
    issuer: AssertionIssuer
    plan: EntitlementPlan
    plan_source: TrustedPlanSource
    purpose: AssertionPurpose | None = None
    request_id: str | None = Field(default=None, min_length=1)
    user_id: str = Field(min_length=1)


@dataclass(frozen=True)
class AutomationEntitlementAssertionValidation:
    allowed: bool
    assertion: AutomationEntitlementAssertion | None
    feature: EntitlementFeatureKey | None
    normalized_plan: EntitlementPlan | None
    reason: EntitlementAssertionReasonCode
    user_id: str | None


def build_entitlement_assertion_error_detail(
    reason: EntitlementAssertionReasonCode,
) -> dict[str, str]:
    return {
        "code": reason,
        "message": ERROR_MESSAGES[reason],
    }


def serialize_automation_entitlement_assertion(
    assertion: AutomationEntitlementAssertion,
) -> str:
    payload: dict[str, str] = {
        "audience": assertion.audience,
        "expires_at": assertion.expires_at,
        "feature": assertion.feature,
        "issued_at": assertion.issued_at,
        "issuer": assertion.issuer,
        "plan": assertion.plan,
        "plan_source": assertion.plan_source,
    }
    if assertion.purpose is not None:
        payload["purpose"] = assertion.purpose
    if assertion.request_id is not None:
        payload["request_id"] = assertion.request_id
    payload["user_id"] = assertion.user_id

    return json.dumps(payload, separators=(",", ":"), ensure_ascii=True)


def sign_automation_entitlement_assertion(
    assertion: AutomationEntitlementAssertion,
    *,
    secret: str | None,
) -> str:
    normalized_secret = _normalize_secret(secret)
    _assert_signing_secret(normalized_secret)

    return hmac.new(
        normalized_secret.encode("utf-8"),
        serialize_automation_entitlement_assertion(assertion).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def verify_automation_entitlement_assertion_signature(
    assertion: AutomationEntitlementAssertion,
    *,
    secret: str | None,
    signature: str | None,
) -> bool:
    normalized_secret = _normalize_secret(secret)
    normalized_signature = _normalize_optional_non_empty_string(signature)
    if normalized_signature is None:
        return False

    _assert_signing_secret(normalized_secret)

    return hmac.compare_digest(
        sign_automation_entitlement_assertion(assertion, secret=normalized_secret),
        normalized_signature,
    )


def validate_automation_entitlement_assertion(
    assertion: object | None,
    *,
    feature: str,
    now: datetime | None = None,
    user_id: str | None,
) -> AutomationEntitlementAssertionValidation:
    requested_feature = feature.strip()

    if requested_feature not in FEATURE_KEYS:
        return _deny(
            feature=None,
            reason="entitlement_feature_not_allowed",
            user_id=user_id,
        )

    typed_feature = requested_feature

    if not user_id or not user_id.strip():
        return _deny(
            feature=typed_feature,
            reason="entitlement_user_context_mismatch",
            user_id=user_id,
        )

    if assertion is None:
        return _deny(
            feature=typed_feature,
            reason="entitlement_assertion_missing",
            user_id=user_id,
        )

    try:
        parsed = AutomationEntitlementAssertion.model_validate(assertion)
    except ValidationError:
        plan_source = _extract_plan_source(assertion)
        reason: EntitlementAssertionReasonCode = (
            "entitlement_plan_source_untrusted"
            if plan_source is not None and plan_source not in TRUSTED_PLAN_SOURCES
            else "entitlement_assertion_malformed"
        )
        return _deny(feature=typed_feature, reason=reason, user_id=user_id)

    if parsed.feature != typed_feature:
        return _deny(
            feature=typed_feature,
            reason="entitlement_feature_not_allowed",
            user_id=user_id,
        )

    normalized_user_id = user_id.strip()
    if parsed.user_id != normalized_user_id:
        return _deny(
            feature=typed_feature,
            reason="entitlement_user_context_mismatch",
            user_id=normalized_user_id,
        )

    issued_at = _parse_timestamp(parsed.issued_at)
    expires_at = _parse_timestamp(parsed.expires_at)

    if issued_at is None or expires_at is None or expires_at <= issued_at:
        return _deny(
            feature=typed_feature,
            reason="entitlement_assertion_malformed",
            user_id=normalized_user_id,
        )

    comparison_now = _normalize_now(now)
    if (
        (expires_at - issued_at).total_seconds() > ASSERTION_MAX_TTL_SECONDS
        or (issued_at - comparison_now).total_seconds() > ASSERTION_CLOCK_SKEW_SECONDS
    ):
        return _deny(
            feature=typed_feature,
            reason="entitlement_assertion_malformed",
            user_id=normalized_user_id,
        )

    if (comparison_now - expires_at).total_seconds() > ASSERTION_CLOCK_SKEW_SECONDS:
        return _deny(
            feature=typed_feature,
            reason="entitlement_assertion_expired",
            user_id=normalized_user_id,
        )

    if not is_feature_allowed_for_plan(parsed.feature, parsed.plan):
        return _deny(
            feature=typed_feature,
            reason="entitlement_feature_not_allowed",
            user_id=normalized_user_id,
        )

    return AutomationEntitlementAssertionValidation(
        allowed=True,
        assertion=parsed,
        feature=typed_feature,
        normalized_plan=parsed.plan,
        reason="allowed",
        user_id=parsed.user_id,
    )


def validate_signed_automation_entitlement_assertion(
    assertion: object | None,
    *,
    feature: str,
    now: datetime | None = None,
    signature: str | None,
    secret: str | None,
    user_id: str | None,
) -> AutomationEntitlementAssertionValidation:
    result = validate_automation_entitlement_assertion(
        assertion,
        feature=feature,
        now=now,
        user_id=user_id,
    )

    if not result.allowed or result.assertion is None:
        return result

    normalized_signature = _normalize_optional_non_empty_string(signature)
    if normalized_signature is None:
        return _deny(
            feature=result.feature,
            reason="entitlement_assertion_signature_missing",
            user_id=result.user_id,
        )

    if not verify_automation_entitlement_assertion_signature(
        result.assertion,
        secret=secret,
        signature=normalized_signature,
    ):
        return _deny(
            feature=result.feature,
            reason="entitlement_assertion_signature_invalid",
            user_id=result.user_id,
        )

    return result


def is_feature_allowed_for_plan(
    feature: EntitlementFeatureKey,
    plan: EntitlementPlan,
) -> bool:
    return PLAN_RANK[plan] >= PLAN_RANK[FEATURE_MINIMUM_PLAN[feature]]


def _deny(
    *,
    feature: EntitlementFeatureKey | None,
    reason: EntitlementAssertionReasonCode,
    user_id: str | None,
) -> AutomationEntitlementAssertionValidation:
    return AutomationEntitlementAssertionValidation(
        allowed=False,
        assertion=None,
        feature=feature,
        normalized_plan=None,
        reason=reason,
        user_id=user_id.strip() if isinstance(user_id, str) and user_id.strip() else None,
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
            f"{ASSERTION_SECRET_ENV_NAME} is required when {ASSERTION_SIGNING_MODE_ENV_NAME}=hmac_sha256."
        )

    if len(secret) < ASSERTION_MIN_SECRET_LENGTH:
        raise ValueError(
            f"{ASSERTION_SECRET_ENV_NAME} must be at least {ASSERTION_MIN_SECRET_LENGTH} characters for {ASSERTION_SIGNATURE_ALGORITHM}."
        )
