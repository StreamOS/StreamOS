import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import TypeVar

import httpx
from fastapi import HTTPException

from ai_context_boundary import (
    AiAssistantContextBoundary,
    AiAssistantContextRequest,
    AiContextBoundaryError,
    build_ai_context_error_detail,
    validate_ai_assistant_context_boundary,
)
from ai_guardrails import (
    AI_ASSISTANT_FEATURE,
    AiGuardrailError,
    build_ai_guardrail_detail,
    build_ai_guardrail_timeout_error,
    enforce_max_request_bytes,
    get_ai_guardrail_policy,
)
from premium_runtime_enforcement import require_ai_assistant_runtime_entitlement
from settings import Settings

T = TypeVar("T")


@dataclass(frozen=True)
class AiAssistantBackendContractRequest:
    context: AiAssistantContextRequest
    feature: str = AI_ASSISTANT_FEATURE
    prompt: str = ""


@dataclass(frozen=True)
class AiAssistantPreparedOperation:
    context_boundary: AiAssistantContextBoundary
    feature: str
    prompt: str
    request_payload_bytes: int


def prepare_ai_assistant_backend_contract(
    request: AiAssistantBackendContractRequest,
    *,
    assertion: object | None,
    now: datetime | None = None,
    settings: Settings,
    signature: str | None,
    allow_not_yet_productive: bool = False,
) -> AiAssistantPreparedOperation:
    try:
        policy = get_ai_guardrail_policy(request.feature)
    except AiGuardrailError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=build_ai_guardrail_detail(error),
        ) from error

    if not allow_not_yet_productive and policy.runtime_status != "active":
        raise HTTPException(
            status_code=503,
            detail=build_ai_context_error_detail(
                AiContextBoundaryError(
                    code="ai_context_not_productive",
                    status_code=503,
                    feature=policy.feature,
                )
            ),
        )

    require_ai_assistant_runtime_entitlement(
        assertion=assertion,
        now=now,
        settings=settings,
        signature=signature,
        user_id=request.context.user_id,
    )

    try:
        context_boundary = validate_ai_assistant_context_boundary(
            request.context,
            require_productive=False,
        )
        payload = _serialize_ai_assistant_request(
            request,
            context_boundary=context_boundary,
        )
        enforce_max_request_bytes(
            feature=policy.feature,
            value=payload,
            max_request_bytes=policy.max_request_bytes,
        )
    except AiContextBoundaryError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=build_ai_context_error_detail(error),
        ) from error
    except AiGuardrailError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=build_ai_guardrail_detail(error),
        ) from error

    return AiAssistantPreparedOperation(
        context_boundary=context_boundary,
        feature=policy.feature,
        prompt=request.prompt,
        request_payload_bytes=len(payload.encode("utf-8")),
    )


async def run_ai_assistant_backend_operation(
    *,
    assertion: object | None,
    now: datetime | None = None,
    operation: Callable[[AiAssistantPreparedOperation], Awaitable[T]],
    request: AiAssistantBackendContractRequest,
    settings: Settings,
    signature: str | None,
    allow_not_yet_productive: bool = False,
) -> T:
    prepared_request = prepare_ai_assistant_backend_contract(
        request,
        assertion=assertion,
        now=now,
        settings=settings,
        signature=signature,
        allow_not_yet_productive=allow_not_yet_productive,
    )

    try:
        return await operation(prepared_request)
    except httpx.TimeoutException as error:
        guardrail_error = build_ai_guardrail_timeout_error(prepared_request.feature)
        raise HTTPException(
            status_code=guardrail_error.status_code,
            detail=build_ai_guardrail_detail(guardrail_error),
        ) from error


def _serialize_ai_assistant_request(
    request: AiAssistantBackendContractRequest,
    *,
    context_boundary: AiAssistantContextBoundary,
) -> str:
    return json.dumps(
        {
            "feature": request.feature,
            "prompt": request.prompt,
            "tenant_id": context_boundary.tenant_id,
            "user_id": context_boundary.user_id,
            "transcript_excerpt_characters": (
                context_boundary.transcript_excerpt_characters
            ),
            "sources": [
                {
                    "source": source.source,
                    "item_limit": source.item_limit,
                    "payload_bytes": source.payload_bytes,
                    "time_window_days": source.time_window_days,
                }
                for source in context_boundary.sources
            ],
        },
        ensure_ascii=True,
        separators=(",", ":"),
    )
