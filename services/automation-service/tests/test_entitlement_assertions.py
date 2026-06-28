from datetime import UTC, datetime

import pytest

from entitlement_assertions import (
    ASSERTION_AUDIENCES,
    ASSERTION_CLOCK_SKEW_SECONDS,
    ASSERTION_ISSUERS,
    ASSERTION_MAX_TTL_SECONDS,
    ASSERTION_MIN_SECRET_LENGTH,
    ASSERTION_PURPOSES,
    ASSERTION_REASON_CODES,
    ASSERTION_SECRET_ENV_NAME,
    ASSERTION_SIGNATURE_ALGORITHM,
    ASSERTION_SIGNING_MODE_ENV_NAME,
    ASSERTION_SIGNING_MODES,
    AutomationEntitlementAssertion,
    build_entitlement_assertion_error_detail,
    serialize_automation_entitlement_assertion,
    sign_automation_entitlement_assertion,
    validate_automation_entitlement_assertion,
    validate_signed_automation_entitlement_assertion,
    verify_automation_entitlement_assertion_signature,
)

ASSERTION_SIGNING_TEST_SECRET = "a" * 32


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
        "entitlement_assertion_signature_invalid",
        "entitlement_assertion_signature_missing",
        "entitlement_feature_not_allowed",
        "entitlement_plan_source_untrusted",
        "entitlement_user_context_mismatch",
    )
    assert ASSERTION_SIGNING_MODES == ("unsigned_internal_contract", "hmac_sha256")
    assert ASSERTION_SECRET_ENV_NAME == "AUTOMATION_ENTITLEMENT_ASSERTION_SECRET"
    assert (
        ASSERTION_SIGNING_MODE_ENV_NAME
        == "AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE"
    )
    assert ASSERTION_SIGNATURE_ALGORITHM == "hmac-sha256"
    assert ASSERTION_MIN_SECRET_LENGTH == 32
    assert ASSERTION_MAX_TTL_SECONDS == 120
    assert ASSERTION_CLOCK_SKEW_SECONDS == 15


def test_assertion_contract_serializes_canonically_for_cross_runtime_signing() -> None:
    assertion = AutomationEntitlementAssertion.model_validate(valid_assertion_payload())

    assert (
        serialize_automation_entitlement_assertion(assertion)
        == '{"audience":"automation-service","expires_at":"2026-06-28T12:01:30.000Z","feature":"ai_assistant","issued_at":"2026-06-28T12:00:00.000Z","issuer":"api-gateway","plan":"pro","plan_source":"persisted_server_plan","purpose":"premium_ai_access","request_id":"req-123","user_id":"user-123"}'
    )


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


def test_signed_assertion_is_verified_for_premium_feature() -> None:
    assertion = AutomationEntitlementAssertion.model_validate(valid_assertion_payload())
    secret = ASSERTION_SIGNING_TEST_SECRET
    signature = sign_automation_entitlement_assertion(assertion, secret=secret)

    result = validate_signed_automation_entitlement_assertion(
        assertion.model_dump(mode="python"),
        feature="ai_assistant",
        now=fixed_now(),
        signature=signature,
        secret=secret,
        user_id="user-123",
    )

    assert result.allowed is True
    assert result.reason == "allowed"
    assert (
        verify_automation_entitlement_assertion_signature(
            assertion, secret=secret, signature=signature
        )
        is True
    )


def test_signed_assertion_denies_missing_or_invalid_signatures() -> None:
    assertion = AutomationEntitlementAssertion.model_validate(
        valid_assertion_payload(feature="branding_ai")
    )
    secret = ASSERTION_SIGNING_TEST_SECRET

    missing_signature = validate_signed_automation_entitlement_assertion(
        assertion.model_dump(mode="python"),
        feature="branding_ai",
        now=fixed_now(),
        signature=None,
        secret=secret,
        user_id="user-123",
    )
    invalid_signature = validate_signed_automation_entitlement_assertion(
        assertion.model_dump(mode="python"),
        feature="branding_ai",
        now=fixed_now(),
        signature="bad-signature",
        secret=secret,
        user_id="user-123",
    )

    assert missing_signature.allowed is False
    assert missing_signature.reason == "entitlement_assertion_signature_missing"
    assert invalid_signature.allowed is False
    assert invalid_signature.reason == "entitlement_assertion_signature_invalid"


def test_signed_assertion_still_denies_wrong_issuer_or_audience() -> None:
    secret = ASSERTION_SIGNING_TEST_SECRET

    wrong_issuer = valid_assertion_payload(feature="branding_ai")
    wrong_issuer["issuer"] = "other-service"
    wrong_audience = valid_assertion_payload(feature="branding_ai")
    wrong_audience["audience"] = "other-audience"

    assert (
        validate_signed_automation_entitlement_assertion(
            wrong_issuer,
            feature="branding_ai",
            now=fixed_now(),
            signature="placeholder",
            secret=secret,
            user_id="user-123",
        ).reason
        == "entitlement_assertion_malformed"
    )
    assert (
        validate_signed_automation_entitlement_assertion(
            wrong_audience,
            feature="branding_ai",
            now=fixed_now(),
            signature="placeholder",
            secret=secret,
            user_id="user-123",
        ).reason
        == "entitlement_assertion_malformed"
    )


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
