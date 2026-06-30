import json
from pathlib import Path

import pytest
from fastapi import HTTPException

from ai_assistant_downstream_contract import (
    AI_ASSISTANT_DOWNSTREAM_CONTEXT_BOUNDARY_VERSION,
    AI_ASSISTANT_DOWNSTREAM_RUNTIME_STATUS,
    validate_ai_assistant_downstream_contract_request,
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


def test_downstream_contract_accepts_shared_gateway_fixture_shape() -> None:
    fixture_case = _load_fixture_cases()[0]
    request = fixture_case["expected_prepared_automation_request"]

    validated = validate_ai_assistant_downstream_contract_request(request)

    assert validated.feature == "ai_assistant"
    assert validated.context_boundary_version == (
        AI_ASSISTANT_DOWNSTREAM_CONTEXT_BOUNDARY_VERSION
    )
    assert validated.runtime_status == AI_ASSISTANT_DOWNSTREAM_RUNTIME_STATUS
    assert validated.request_classification == "assistant_prompt"
    assert validated.request_id == "req-123"
    assert validated.context.tenant_id == "tenant-123"
    assert validated.context.user_id == "11111111-1111-4111-8111-111111111111"
    assert isinstance(validated.usage_context, dict)
    assert validated.usage_context["plan_source"] == "persisted_server_plan"


def test_downstream_contract_rejects_secret_bearing_top_level_fields() -> None:
    fixture_case = _load_fixture_cases()[0]
    request = fixture_case["expected_prepared_automation_request"] | {
        "provider_token": "sk-secret"
    }

    with pytest.raises(HTTPException) as error_info:
        validate_ai_assistant_downstream_contract_request(request)

    assert error_info.value.status_code == 403
    assert error_info.value.detail == {
        "code": "ai_assistant_downstream_contract_invalid",
        "feature": "ai_assistant",
        "message": "The AI assistant downstream contract is invalid.",
    }


def test_downstream_contract_rejects_context_parity_drift() -> None:
    fixture_case = _load_fixture_cases()[0]
    request = fixture_case["expected_prepared_automation_request"] | {
        "request_classification": "other_classification"
    }

    with pytest.raises(HTTPException) as error_info:
        validate_ai_assistant_downstream_contract_request(request)

    assert error_info.value.status_code == 403
    assert error_info.value.detail == {
        "code": "ai_assistant_downstream_contract_mismatch",
        "feature": "ai_assistant",
        "message": (
            "The AI assistant downstream contract does not match the trusted request context."
        ),
    }


def test_downstream_contract_rejects_productive_runtime_markers() -> None:
    fixture_case = _load_fixture_cases()[0]
    request = fixture_case["expected_prepared_automation_request"] | {
        "runtime_status": "active"
    }

    with pytest.raises(HTTPException) as error_info:
        validate_ai_assistant_downstream_contract_request(request)

    assert error_info.value.status_code == 403
    assert error_info.value.detail == {
        "code": "ai_assistant_downstream_contract_invalid",
        "feature": "ai_assistant",
        "message": "The AI assistant downstream contract is invalid.",
    }
