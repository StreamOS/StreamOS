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
    "entitlement_feature_not_allowed",
    "entitlement_plan_source_untrusted",
    "entitlement_user_context_mismatch",
)
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
    "entitlement_feature_not_allowed",
    "entitlement_plan_source_untrusted",
    "entitlement_user_context_mismatch",
]

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
