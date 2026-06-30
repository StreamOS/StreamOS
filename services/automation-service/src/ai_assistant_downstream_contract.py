from dataclasses import asdict, dataclass, is_dataclass
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, ValidationError, model_validator

from ai_context_boundary import AiAssistantContextRequest, AiContextSourceRequest
from ai_guardrails import AI_ASSISTANT_FEATURE
AI_ASSISTANT_DOWNSTREAM_CONTEXT_BOUNDARY_VERSION = (
    "2026-06-30.ai-assistant-context-boundary.v1"
)
AI_ASSISTANT_DOWNSTREAM_RUNTIME_STATUS = "not_yet_productive"
AI_ASSISTANT_DOWNSTREAM_REASON_CODES = (
    "ai_assistant_downstream_contract_invalid",
    "ai_assistant_downstream_contract_mismatch",
)
AI_ASSISTANT_DOWNSTREAM_ERROR_MESSAGES = {
    "ai_assistant_downstream_contract_invalid": (
        "The AI assistant downstream contract is invalid."
    ),
    "ai_assistant_downstream_contract_mismatch": (
        "The AI assistant downstream contract does not match the trusted request context."
    ),
}

AiAssistantDownstreamReasonCode = Literal[
    "ai_assistant_downstream_contract_invalid",
    "ai_assistant_downstream_contract_mismatch",
]


class AiAssistantDownstreamContextSourceRequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    source: str
    item_limit: int
    payload_bytes: int
    time_window_days: int


class AiAssistantDownstreamContextRequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    tenant_id: str
    user_id: str
    transcript_excerpt_characters: int = 0
    sources: tuple[AiAssistantDownstreamContextSourceRequestModel, ...]

    def to_boundary_request(self) -> AiAssistantContextRequest:
        return AiAssistantContextRequest(
            tenant_id=self.tenant_id,
            user_id=self.user_id,
            transcript_excerpt_characters=self.transcript_excerpt_characters,
            sources=tuple(
                AiContextSourceRequest(
                    source=source.source,
                    item_limit=source.item_limit,
                    payload_bytes=source.payload_bytes,
                    time_window_days=source.time_window_days,
                )
                for source in self.sources
            ),
        )


class AiAssistantDownstreamContractRequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    context: AiAssistantDownstreamContextRequestModel
    context_boundary_version: Literal[
        "2026-06-30.ai-assistant-context-boundary.v1"
    ]
    feature: str
    prompt: str
    request_classification: str
    request_id: str
    runtime_status: Literal["not_yet_productive"]
    usage_context: object | None = None
    usage_context_signature: str | None = None

    @model_validator(mode="after")
    def ensure_contract_parity(self) -> "AiAssistantDownstreamContractRequestModel":
        usage_context = self.usage_context
        if not isinstance(usage_context, dict):
            return self

        usage_tenant_id = _read_optional_string(usage_context, "tenant_id")
        usage_user_id = _read_optional_string(usage_context, "user_id")
        usage_request_id = _read_optional_string(usage_context, "request_id")
        usage_request_classification = _read_optional_string(
            usage_context, "request_classification"
        )
        usage_feature = _read_optional_string(usage_context, "feature")

        if (
            usage_tenant_id is not None
            and self.context.tenant_id != usage_tenant_id
        ):
            raise ValueError("tenant_mismatch")
        if usage_user_id is not None and self.context.user_id != usage_user_id:
            raise ValueError("user_mismatch")
        if usage_request_id is not None and self.request_id != usage_request_id:
            raise ValueError("request_id_mismatch")
        if (
            usage_request_classification is not None
            and self.request_classification != usage_request_classification
        ):
            raise ValueError("request_classification_mismatch")
        if usage_feature is not None and self.feature != usage_feature:
            raise ValueError("feature_mismatch")

        return self


@dataclass(frozen=True)
class ValidatedAiAssistantDownstreamContractRequest:
    context: AiAssistantContextRequest
    context_boundary_version: str
    feature: str
    prompt: str
    request_classification: str
    request_id: str
    runtime_status: str
    usage_context: object | None
    usage_context_signature: str | None


def build_ai_assistant_downstream_contract_error_detail(
    reason: AiAssistantDownstreamReasonCode,
) -> dict[str, str]:
    return {
        "code": reason,
        "feature": AI_ASSISTANT_FEATURE,
        "message": AI_ASSISTANT_DOWNSTREAM_ERROR_MESSAGES[reason],
    }


def validate_ai_assistant_downstream_contract_request(
    request: object,
) -> ValidatedAiAssistantDownstreamContractRequest:
    candidate = asdict(request) if is_dataclass(request) else request

    try:
        parsed = AiAssistantDownstreamContractRequestModel.model_validate(candidate)
    except ValidationError as error:
        raise HTTPException(
            status_code=403,
            detail=build_ai_assistant_downstream_contract_error_detail(
                _resolve_reason_code_from_validation_error(error)
            ),
        ) from error

    return ValidatedAiAssistantDownstreamContractRequest(
        context=parsed.context.to_boundary_request(),
        context_boundary_version=parsed.context_boundary_version,
        feature=parsed.feature,
        prompt=parsed.prompt,
        request_classification=parsed.request_classification,
        request_id=parsed.request_id,
        runtime_status=parsed.runtime_status,
        usage_context=parsed.usage_context,
        usage_context_signature=parsed.usage_context_signature,
    )


def _resolve_reason_code_from_validation_error(
    error: ValidationError,
) -> AiAssistantDownstreamReasonCode:
    for issue in error.errors():
        if issue.get("type") == "value_error":
            return "ai_assistant_downstream_contract_mismatch"

    return "ai_assistant_downstream_contract_invalid"


def _read_optional_string(value: dict[str, object], key: str) -> str | None:
    candidate = value.get(key)
    if not isinstance(candidate, str):
        return None

    normalized = candidate.strip()
    return normalized or None
