from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import TypeVar

from fastapi import HTTPException

from entitlement_assertions import (
    build_entitlement_assertion_error_detail,
    validate_signed_automation_entitlement_assertion,
)
from settings import Settings

PREMIUM_AUTOMATION_RUNTIME_FEATURE = "ai_assistant"
PREMIUM_AUTOMATION_RUNTIME_SIGNING_MODE = "hmac_sha256"
PREMIUM_RUNTIME_UNAVAILABLE_CODE = "premium_runtime_unavailable"
PREMIUM_RUNTIME_UNAVAILABLE_MESSAGE = (
    "Premium automation runtime enforcement is unavailable."
)

T = TypeVar("T")


def build_premium_runtime_unavailable_detail() -> dict[str, str]:
    return {
        "code": PREMIUM_RUNTIME_UNAVAILABLE_CODE,
        "message": PREMIUM_RUNTIME_UNAVAILABLE_MESSAGE,
    }


def require_ai_assistant_runtime_entitlement(
    *,
    assertion: object | None,
    now: datetime | None = None,
    settings: Settings,
    signature: str | None,
    user_id: str | None,
) -> None:
    if (
        settings.automation_entitlement_assertion_signing_mode
        != PREMIUM_AUTOMATION_RUNTIME_SIGNING_MODE
    ):
        raise HTTPException(
            status_code=503,
            detail=build_premium_runtime_unavailable_detail(),
        )

    validation = validate_signed_automation_entitlement_assertion(
        assertion,
        feature=PREMIUM_AUTOMATION_RUNTIME_FEATURE,
        now=now,
        signature=signature,
        secret=settings.automation_entitlement_assertion_secret,
        user_id=user_id,
    )
    if not validation.allowed:
        raise HTTPException(
            status_code=403,
            detail=build_entitlement_assertion_error_detail(validation.reason),
        )


async def run_ai_assistant_premium_operation(
    *,
    assertion: object | None,
    now: datetime | None = None,
    operation: Callable[[], Awaitable[T]],
    settings: Settings,
    signature: str | None,
    user_id: str | None,
) -> T:
    require_ai_assistant_runtime_entitlement(
        assertion=assertion,
        now=now,
        settings=settings,
        signature=signature,
        user_id=user_id,
    )

    return await operation()
