import asyncio
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

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
