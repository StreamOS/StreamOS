from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

import httpx

from ai_context_boundary import AI_CONTEXT_SOURCE_POLICIES, AiContextSourceRequest
from settings import Settings

TrustedContextSourceKey = Literal[
    "channel_platform_status",
    "content_job_summary",
]
TrustedContextClientErrorCode = Literal[
    "ai_context_payload_too_large",
    "ai_context_source_unavailable",
]

TRUSTED_CONTEXT_ROUTE_PATH = "/api/callbacks/automation/trusted-context"
TRUSTED_CONTEXT_CLIENT_TIMEOUT_SECONDS = 5.0
TRUSTED_CONTEXT_ALLOWED_PROVIDERS = frozenset(("twitch", "youtube", "tiktok", "kick"))
TRUSTED_CONNECTION_STATES = frozenset(
    ("connected", "disconnected", "reconnect_required")
)
TRUSTED_PLATFORM_STATUS_REASONS = frozenset(
    (
        "status_connected",
        "status_disconnected",
        "connection_degraded",
        "connection_pending",
        "token_expired",
    )
)
TRUSTED_CONTENT_JOB_ERROR_CATEGORIES = frozenset(
    (
        "provider_rate_limit",
        "request_timeout",
        "unsafe_input",
        "validation_failed",
        "upstream_unavailable",
        "unknown_failure",
    )
)


@dataclass(frozen=True)
class TrustedContextClientConfig:
    api_gateway_secret: str
    api_gateway_url: str
    timeout_seconds: float


@dataclass(frozen=True)
class TrustedContextClientError(Exception):
    code: TrustedContextClientErrorCode
    status_code: int


TrustedContextHttpClientFactory = Callable[[TrustedContextClientConfig], httpx.Client]


class TrustedContextClient:
    def __init__(
        self,
        *,
        config: TrustedContextClientConfig,
        http_client_factory: TrustedContextHttpClientFactory | None = None,
    ) -> None:
        self._config = config
        self._http_client_factory = http_client_factory or _build_trusted_context_http_client

    def read_source(
        self,
        *,
        requested_source: AiContextSourceRequest,
        tenant_id: str,
        user_id: str,
    ) -> tuple[dict[str, object], ...]:
        source = _normalize_trusted_context_source(requested_source.source)
        response_bytes_limit = _max_trusted_context_response_bytes(requested_source)
        request_payload = {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "sources": [source],
        }

        try:
            with self._http_client_factory(self._config) as http_client:
                response = http_client.post(
                    f"{self._config.api_gateway_url}{TRUSTED_CONTEXT_ROUTE_PATH}",
                    headers={"x-streamos-api-secret": self._config.api_gateway_secret},
                    json=request_payload,
                )
        except httpx.TimeoutException as error:
            raise TrustedContextClientError(
                code="ai_context_source_unavailable",
                status_code=504,
            ) from error
        except httpx.HTTPError as error:
            raise TrustedContextClientError(
                code="ai_context_source_unavailable",
                status_code=503,
            ) from error

        if response.status_code < 200 or response.status_code >= 300:
            raise TrustedContextClientError(
                code="ai_context_source_unavailable",
                status_code=503,
            )

        if len(response.content) > response_bytes_limit:
            raise TrustedContextClientError(
                code="ai_context_payload_too_large",
                status_code=413,
            )

        try:
            response_payload = response.json()
        except ValueError as error:
            raise TrustedContextClientError(
                code="ai_context_source_unavailable",
                status_code=503,
            ) from error

        return _sanitize_trusted_context_response(
            payload=response_payload,
            requested_source=requested_source,
            source=source,
            tenant_id=tenant_id,
            user_id=user_id,
        )


def build_trusted_context_client(
    settings: Settings,
) -> TrustedContextClient | None:
    api_gateway_url = settings.api_gateway_url.strip()
    api_gateway_secret = settings.api_gateway_secret.strip()

    if not api_gateway_url and not api_gateway_secret:
        return None

    if not api_gateway_url or not api_gateway_secret:
        raise TrustedContextClientError(
            code="ai_context_source_unavailable",
            status_code=503,
        )

    return TrustedContextClient(
        config=TrustedContextClientConfig(
            api_gateway_secret=api_gateway_secret,
            api_gateway_url=api_gateway_url,
            timeout_seconds=min(
                settings.openai_timeout_seconds,
                TRUSTED_CONTEXT_CLIENT_TIMEOUT_SECONDS,
            ),
        )
    )


def _build_trusted_context_http_client(
    config: TrustedContextClientConfig,
) -> httpx.Client:
    return httpx.Client(timeout=config.timeout_seconds)


def _sanitize_trusted_context_response(
    *,
    payload: object,
    requested_source: AiContextSourceRequest,
    source: TrustedContextSourceKey,
    tenant_id: str,
    user_id: str,
) -> tuple[dict[str, object], ...]:
    if not isinstance(payload, dict) or set(payload) != {
        "tenant_id",
        "user_id",
        "sources",
    }:
        raise TrustedContextClientError(
            code="ai_context_source_unavailable",
            status_code=503,
        )

    if (
        not isinstance(payload["tenant_id"], str)
        or not isinstance(payload["user_id"], str)
        or payload["tenant_id"] != tenant_id
        or payload["user_id"] != user_id
    ):
        raise TrustedContextClientError(
            code="ai_context_source_unavailable",
            status_code=503,
        )

    sources = payload["sources"]
    if not isinstance(sources, list) or len(sources) != 1:
        raise TrustedContextClientError(
            code="ai_context_source_unavailable",
            status_code=503,
        )

    source_payload = sources[0]
    if not isinstance(source_payload, dict) or set(source_payload) != {
        "source",
        "records",
    }:
        raise TrustedContextClientError(
            code="ai_context_source_unavailable",
            status_code=503,
        )

    if (
        source_payload["source"] != source
        or not isinstance(source_payload["records"], list)
    ):
        raise TrustedContextClientError(
            code="ai_context_source_unavailable",
            status_code=503,
        )

    bounded_records = source_payload["records"][: requested_source.item_limit]
    if source == "channel_platform_status":
        return tuple(
            _sanitize_channel_platform_status_record(record)
            for record in bounded_records
        )

    return tuple(
        _sanitize_content_job_summary_record(record) for record in bounded_records
    )


def _sanitize_channel_platform_status_record(record: object) -> dict[str, object]:
    if not isinstance(record, dict) or set(record) != {
        "provider",
        "connection_state",
        "last_sync_at",
        "status_reason",
    }:
        raise TrustedContextClientError(
            code="ai_context_source_unavailable",
            status_code=503,
        )

    return {
        "provider": _require_allowed_value(
            record["provider"],
            allowed_values=TRUSTED_CONTEXT_ALLOWED_PROVIDERS,
        ),
        "connection_state": _require_allowed_value(
            record["connection_state"],
            allowed_values=TRUSTED_CONNECTION_STATES,
        ),
        "last_sync_at": _require_optional_iso_timestamp(record["last_sync_at"]),
        "status_reason": _require_allowed_value(
            record["status_reason"],
            allowed_values=TRUSTED_PLATFORM_STATUS_REASONS,
        ),
    }


def _sanitize_content_job_summary_record(record: object) -> dict[str, object]:
    if not isinstance(record, dict) or set(record) != {
        "job_type",
        "status",
        "created_at",
        "updated_at",
        "retry_count",
        "error_category",
    }:
        raise TrustedContextClientError(
            code="ai_context_source_unavailable",
            status_code=503,
        )

    return {
        "job_type": _require_safe_summary_string(record["job_type"]),
        "status": _require_safe_summary_string(record["status"]),
        "created_at": _require_iso_timestamp(record["created_at"]),
        "updated_at": _require_iso_timestamp(record["updated_at"]),
        "retry_count": _require_retry_count(record["retry_count"]),
        "error_category": _require_optional_allowed_value(
            record["error_category"],
            allowed_values=TRUSTED_CONTENT_JOB_ERROR_CATEGORIES,
        ),
    }


def _max_trusted_context_response_bytes(
    requested_source: AiContextSourceRequest,
) -> int:
    policy = AI_CONTEXT_SOURCE_POLICIES[
        _normalize_trusted_context_source(requested_source.source)
    ]
    return min(policy.max_payload_bytes, requested_source.payload_bytes) + 8_192


def _normalize_trusted_context_source(source: str) -> TrustedContextSourceKey:
    normalized = source.strip()
    if normalized not in {"channel_platform_status", "content_job_summary"}:
        raise TrustedContextClientError(
            code="ai_context_source_unavailable",
            status_code=503,
        )

    return normalized


def _require_allowed_value(
    value: object,
    *,
    allowed_values: frozenset[str],
) -> str:
    if not isinstance(value, str):
        raise TrustedContextClientError(
            code="ai_context_source_unavailable",
            status_code=503,
        )

    normalized = value.strip()
    if normalized not in allowed_values:
        raise TrustedContextClientError(
            code="ai_context_source_unavailable",
            status_code=503,
        )

    return normalized


def _require_optional_allowed_value(
    value: object,
    *,
    allowed_values: frozenset[str],
) -> str | None:
    if value is None:
        return None

    return _require_allowed_value(value, allowed_values=allowed_values)


def _require_safe_summary_string(value: object) -> str:
    if not isinstance(value, str):
        raise TrustedContextClientError(
            code="ai_context_source_unavailable",
            status_code=503,
        )

    normalized = value.strip()
    if not normalized or len(normalized) > 120:
        raise TrustedContextClientError(
            code="ai_context_source_unavailable",
            status_code=503,
        )
    if "://" in normalized or "sk-" in normalized.lower():
        raise TrustedContextClientError(
            code="ai_context_source_unavailable",
            status_code=503,
        )

    return normalized


def _require_iso_timestamp(value: object) -> str:
    if not isinstance(value, str):
        raise TrustedContextClientError(
            code="ai_context_source_unavailable",
            status_code=503,
        )

    normalized = value.strip()
    if not normalized:
        raise TrustedContextClientError(
            code="ai_context_source_unavailable",
            status_code=503,
        )

    try:
        datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError as error:
        raise TrustedContextClientError(
            code="ai_context_source_unavailable",
            status_code=503,
        ) from error

    return normalized


def _require_optional_iso_timestamp(value: object) -> str | None:
    if value is None:
        return None

    return _require_iso_timestamp(value)


def _require_retry_count(value: object) -> int:
    if not isinstance(value, int) or value < 0 or value > 100:
        raise TrustedContextClientError(
            code="ai_context_source_unavailable",
            status_code=503,
        )

    return value
