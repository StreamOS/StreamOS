import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi import HTTPException

from ai_assistant_backend_contract import (
    AiAssistantBackendContractRequest,
    AiAssistantPreparedOperation,
    run_ai_assistant_backend_operation,
)
from ai_context_boundary import AiAssistantContextRequest, AiContextSourceRequest
from ai_usage_context_enforcement import serialize_automation_ai_usage_context
from entitlement_assertions import (
    AutomationEntitlementAssertion,
    sign_automation_entitlement_assertion,
)
from test_premium_runtime_enforcement import (
    ASSERTION_SIGNING_TEST_SECRET,
    build_settings,
)

FIXTURE_PATH = (
    Path(__file__).resolve().parents[3]
    / "services"
    / "api-gateway"
    / "src"
    / "lib"
    / "fixtures"
    / "ai-assistant-gateway-automation-contract.json"
)


def _load_fixture_cases() -> list[dict[str, object]]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))["cases"]


def _parse_fixture_now(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


@pytest.mark.parametrize(
    "fixture_case",
    _load_fixture_cases(),
    ids=[case["name"] for case in _load_fixture_cases()],
)
def test_gateway_fixture_usage_context_runs_through_automation_backend_contract(
    fixture_case: dict[str, object],
) -> None:
    expected_request = fixture_case["expected_prepared_automation_request"]
    assert isinstance(expected_request, dict)

    assertion = AutomationEntitlementAssertion.model_validate(
        {
            "audience": "automation-service",
            "expires_at": "2026-06-30T08:01:30.000Z",
            "feature": "ai_assistant",
            "issued_at": "2026-06-30T08:00:00.000Z",
            "issuer": "api-gateway",
            "plan": fixture_case["plan"],
            "plan_source": fixture_case["plan_source"],
            "purpose": "premium_ai_access",
            "request_id": expected_request["request_id"],
            "user_id": expected_request["context"]["user_id"],
        }
    )
    signature = sign_automation_entitlement_assertion(
        assertion,
        secret=ASSERTION_SIGNING_TEST_SECRET,
    )

    captured: AiAssistantPreparedOperation | None = None

    async def operation(
        prepared_request: AiAssistantPreparedOperation,
    ) -> str:
        nonlocal captured
        captured = prepared_request
        return "assistant-operation-ran"

    result = asyncio.run(
        run_ai_assistant_backend_operation(
            assertion=assertion.model_dump(mode="python"),
            now=_parse_fixture_now(fixture_case["now"]),
            operation=operation,
            request=AiAssistantBackendContractRequest(
                context=_build_context_request(expected_request["context"]),
                feature=expected_request["feature"],
                prompt=expected_request["prompt"],
                request_id=expected_request["request_id"],
                usage_context=expected_request["usage_context"],
                usage_context_signature=expected_request[
                    "usage_context_signature"
                ],
            ),
            settings=build_settings(),
            signature=signature,
            allow_not_yet_productive=True,
        )
    )

    assert result == "assistant-operation-ran"
    assert captured is not None
    assert captured.feature == "ai_assistant"
    assert captured.request_id == expected_request["request_id"]
    assert captured.context_boundary.tenant_id == expected_request["context"]["tenant_id"]
    assert captured.context_boundary.user_id == expected_request["context"]["user_id"]
    assert tuple(source.source for source in captured.context_boundary.sources) == (
        "channel_platform_status",
    )
    assert captured.usage_context.plan_source == fixture_case["plan_source"]
    assert captured.usage_context.plan_at_request_time == fixture_case["plan"]

    serialized_usage_context = serialize_automation_ai_usage_context(
        captured.usage_context
    )
    assert expected_request["prompt"] not in serialized_usage_context
    assert "channel_platform_status" not in serialized_usage_context
    assert "http://" not in serialized_usage_context.lower()
    assert "https://" not in serialized_usage_context.lower()


@pytest.mark.parametrize(
    ("mutated_tenant_id", "mutated_user_id", "mutated_request_id", "expected_code"),
    [
        pytest.param(
            "tenant-other",
            None,
            None,
            "ai_usage_context_user_mismatch",
            id="tenant mismatch",
        ),
        pytest.param(
            None,
            "22222222-2222-4222-8222-222222222222",
            None,
            "entitlement_user_context_mismatch",
            id="user mismatch",
        ),
        pytest.param(
            None,
            None,
            "req-other",
            "ai_usage_context_user_mismatch",
            id="request mismatch",
        ),
    ],
)
def test_gateway_fixture_usage_context_denies_on_context_mismatch(
    mutated_tenant_id: str | None,
    mutated_user_id: str | None,
    mutated_request_id: str | None,
    expected_code: str,
) -> None:
    fixture_case = _load_fixture_cases()[0]
    expected_request = fixture_case["expected_prepared_automation_request"]
    assert isinstance(expected_request, dict)

    assertion = AutomationEntitlementAssertion.model_validate(
        {
            "audience": "automation-service",
            "expires_at": "2026-06-30T08:01:30.000Z",
            "feature": "ai_assistant",
            "issued_at": "2026-06-30T08:00:00.000Z",
            "issuer": "api-gateway",
            "plan": fixture_case["plan"],
            "plan_source": fixture_case["plan_source"],
            "purpose": "premium_ai_access",
            "request_id": expected_request["request_id"],
            "user_id": expected_request["context"]["user_id"],
        }
    )
    signature = sign_automation_entitlement_assertion(
        assertion,
        secret=ASSERTION_SIGNING_TEST_SECRET,
    )

    with pytest.raises(HTTPException) as error_info:
        asyncio.run(
            run_ai_assistant_backend_operation(
                assertion=assertion.model_dump(mode="python"),
                now=_parse_fixture_now(fixture_case["now"]),
                operation=_unexpected_operation,
                request=AiAssistantBackendContractRequest(
                    context=AiAssistantContextRequest(
                        tenant_id=mutated_tenant_id
                        or expected_request["context"]["tenant_id"],
                        user_id=mutated_user_id
                        or expected_request["context"]["user_id"],
                        transcript_excerpt_characters=expected_request["context"][
                            "transcript_excerpt_characters"
                        ],
                        sources=(
                            AiContextSourceRequest(
                                source="channel_platform_status",
                                item_limit=1,
                                payload_bytes=1024,
                                time_window_days=30,
                            ),
                        ),
                    ),
                    feature=expected_request["feature"],
                    prompt=expected_request["prompt"],
                    request_id=mutated_request_id or expected_request["request_id"],
                    usage_context=expected_request["usage_context"],
                    usage_context_signature=expected_request[
                        "usage_context_signature"
                    ],
                ),
                settings=build_settings(),
                signature=signature,
                allow_not_yet_productive=True,
            )
        )

    error = error_info.value
    assert error.status_code == 403
    assert error.detail["code"] == expected_code


def _build_context_request(context: dict[str, object]) -> AiAssistantContextRequest:
    sources = tuple(
        AiContextSourceRequest(
            source=source["source"],
            item_limit=source["item_limit"],
            payload_bytes=source["payload_bytes"],
            time_window_days=source["time_window_days"],
        )
        for source in context["sources"]
    )
    return AiAssistantContextRequest(
        tenant_id=context["tenant_id"],
        user_id=context["user_id"],
        transcript_excerpt_characters=context["transcript_excerpt_characters"],
        sources=sources,
    )


async def _unexpected_operation(_prepared_request: AiAssistantPreparedOperation) -> str:
    raise AssertionError("operation must not run after context mismatch")
