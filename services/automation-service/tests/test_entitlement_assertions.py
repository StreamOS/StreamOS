from datetime import UTC, datetime

import pytest

from entitlement_assertions import (
    ASSERTION_AUDIENCES,
    ASSERTION_CLOCK_SKEW_SECONDS,
    ASSERTION_ISSUERS,
    ASSERTION_MAX_TTL_SECONDS,
    ASSERTION_PURPOSES,
    ASSERTION_REASON_CODES,
    AutomationEntitlementAssertion,
    build_entitlement_assertion_error_detail,
    validate_automation_entitlement_assertion,
)


def valid_assertion_payload(
    *,
    feature: str = "ai_assistant",
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


def test_assertion_contract_keeps_canonical_constants_stable() -> None:
    assert ASSERTION_ISSUERS == ("api-gateway",)
    assert ASSERTION_AUDIENCES == ("automation-service",)
    assert ASSERTION_PURPOSES == ("premium_ai_access",)
    assert ASSERTION_REASON_CODES == (
        "allowed",
        "entitlement_assertion_missing",
        "entitlement_assertion_expired",
        "entitlement_assertion_malformed",
        "entitlement_feature_not_allowed",
        "entitlement_plan_source_untrusted",
        "entitlement_user_context_mismatch",
    )
    assert ASSERTION_MAX_TTL_SECONDS == 120
    assert ASSERTION_CLOCK_SKEW_SECONDS == 15


def test_valid_pro_assertion_is_accepted_for_premium_feature() -> None:
    result = validate_automation_entitlement_assertion(
        valid_assertion_payload(),
        feature="ai_assistant",
        now=fixed_now(),
        user_id="user-123",
    )

    assert result.allowed is True
    assert isinstance(result.assertion, AutomationEntitlementAssertion)
    assert result.reason == "allowed"
    assert result.feature == "ai_assistant"
    assert result.normalized_plan == "pro"
    assert result.user_id == "user-123"


def test_missing_assertion_is_denied_fail_closed() -> None:
    result = validate_automation_entitlement_assertion(
        None,
        feature="branding_ai",
        now=fixed_now(),
        user_id="user-123",
    )

    assert result.allowed is False
    assert result.reason == "entitlement_assertion_missing"


def test_expired_assertion_is_denied() -> None:
    payload = valid_assertion_payload(feature="branding_ai")
    payload["issued_at"] = "2026-06-28T11:58:00.000Z"
    payload["expires_at"] = "2026-06-28T11:59:00.000Z"

    result = validate_automation_entitlement_assertion(
        payload,
        feature="branding_ai",
        now=fixed_now(),
        user_id="user-123",
    )

    assert result.allowed is False
    assert result.reason == "entitlement_assertion_expired"


def test_malformed_assertion_is_denied() -> None:
    payload = valid_assertion_payload(feature="branding_ai")
    payload["expires_at"] = "not-a-date"

    result = validate_automation_entitlement_assertion(
        payload,
        feature="branding_ai",
        now=fixed_now(),
        user_id="user-123",
    )

    assert result.allowed is False
    assert result.reason == "entitlement_assertion_malformed"


def test_unknown_or_mismatched_feature_is_denied() -> None:
    assert (
        validate_automation_entitlement_assertion(
            valid_assertion_payload(feature="branding_ai"),
            feature="unknown_feature",
            now=fixed_now(),
            user_id="user-123",
        ).reason
        == "entitlement_feature_not_allowed"
    )

    assert (
        validate_automation_entitlement_assertion(
            valid_assertion_payload(feature="branding_ai"),
            feature="ai_assistant",
            now=fixed_now(),
            user_id="user-123",
        ).reason
        == "entitlement_feature_not_allowed"
    )


def test_untrusted_plan_source_is_denied() -> None:
    result = validate_automation_entitlement_assertion(
        valid_assertion_payload(
            feature="branding_ai",
            plan_source="ui_badge",
        ),
        feature="branding_ai",
        now=fixed_now(),
        user_id="user-123",
    )

    assert result.allowed is False
    assert result.reason == "entitlement_plan_source_untrusted"


def test_user_context_mismatch_is_denied() -> None:
    result = validate_automation_entitlement_assertion(
        valid_assertion_payload(feature="branding_ai"),
        feature="branding_ai",
        now=fixed_now(),
        user_id="other-user",
    )

    assert result.allowed is False
    assert result.reason == "entitlement_user_context_mismatch"


def test_free_plan_cannot_unlock_premium_feature() -> None:
    result = validate_automation_entitlement_assertion(
        valid_assertion_payload(feature="branding_ai", plan="free"),
        feature="branding_ai",
        now=fixed_now(),
        user_id="user-123",
    )

    assert result.allowed is False
    assert result.reason == "entitlement_feature_not_allowed"


def test_agency_can_model_agency_only_feature_with_trusted_assertion() -> None:
    result = validate_automation_entitlement_assertion(
        valid_assertion_payload(feature="team_workspace", plan="agency"),
        feature="team_workspace",
        now=fixed_now(),
        user_id="user-123",
    )

    assert result.allowed is True
    assert result.reason == "allowed"


def test_extra_secret_like_fields_are_rejected() -> None:
    payload = valid_assertion_payload(feature="branding_ai")
    payload["provider_token"] = "should-not-be-here"

    result = validate_automation_entitlement_assertion(
        payload,
        feature="branding_ai",
        now=fixed_now(),
        user_id="user-123",
    )

    assert result.allowed is False
    assert result.reason == "entitlement_assertion_malformed"


def test_oversized_ttl_is_rejected() -> None:
    payload = valid_assertion_payload(feature="branding_ai")
    payload["expires_at"] = "2026-06-28T12:05:00.000Z"

    result = validate_automation_entitlement_assertion(
        payload,
        feature="branding_ai",
        now=fixed_now(),
        user_id="user-123",
    )

    assert result.allowed is False
    assert result.reason == "entitlement_assertion_malformed"


def test_error_details_stay_secret_safe() -> None:
    detail = build_entitlement_assertion_error_detail(
        "entitlement_assertion_malformed"
    )

    assert detail == {
        "code": "entitlement_assertion_malformed",
        "message": "The internal entitlement assertion is invalid.",
    }
    assert "token" not in detail["message"].lower()
    assert "secret" not in detail["message"].lower()
    assert "http://" not in detail["message"].lower()
    assert "https://" not in detail["message"].lower()
