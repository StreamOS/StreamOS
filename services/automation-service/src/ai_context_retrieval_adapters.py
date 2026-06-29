import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

import httpx
from fastapi import HTTPException

from ai_context_boundary import (
    AI_CONTEXT_SOURCE_POLICIES,
    ALLOWED_CONTEXT_SOURCES,
    AiAssistantContextBoundary,
    AiContextBoundaryError,
    AiContextSourceRequest,
    build_ai_context_error_detail,
)
from settings import Settings

AiContextAdapterKey = Literal[
    "brand_asset_metadata",
    "channel_platform_status",
    "clip_highlight_summary",
    "content_job_summary",
    "monetization_summary",
    "publication_history_summary",
    "stream_performance_summary",
    "transcript_excerpt",
]


@dataclass(frozen=True)
class AiContextResolvedSource:
    source: AiContextAdapterKey
    records: tuple[dict[str, object], ...]
    payload_bytes: int


@dataclass(frozen=True)
class AiAssistantResolvedContext:
    tenant_id: str
    user_id: str
    total_payload_bytes: int
    sources: tuple[AiContextResolvedSource, ...]


AiContextSourceAdapter = Callable[
    [AiAssistantContextBoundary, AiContextSourceRequest, Settings],
    AiContextResolvedSource,
]

LOW_RISK_STUBBED_CONTEXT_SOURCES: tuple[AiContextAdapterKey, ...] = (
    "channel_platform_status",
    "content_job_summary",
)

AI_CONTEXT_FUTURE_RETRIEVAL_OWNERS: dict[AiContextAdapterKey, str] = {
    "channel_platform_status": "services/api-gateway",
    "content_job_summary": "services/api-gateway",
}

TRUSTED_CONTEXT_ROUTE_PATH = "/api/callbacks/automation/trusted-context"
TRUSTED_CONTEXT_HTTP_TIMEOUT_SECONDS = 5.0
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


def resolve_ai_context_sources(
    context_boundary: AiAssistantContextBoundary,
    *,
    settings: Settings,
    adapters: Mapping[str, AiContextSourceAdapter] | None = None,
) -> AiAssistantResolvedContext:
    if not context_boundary.tenant_id or not context_boundary.user_id:
        raise HTTPException(
            status_code=400,
            detail=build_ai_context_error_detail(
                AiContextBoundaryError(
                    code="ai_context_tenant_required",
                    status_code=400,
                )
            ),
        )

    active_adapters = AI_CONTEXT_SOURCE_ADAPTERS if adapters is None else adapters
    resolved_sources: list[AiContextResolvedSource] = []
    total_payload_bytes = 0

    for requested_source in context_boundary.sources:
        adapter = active_adapters.get(requested_source.source)
        if adapter is None:
            raise HTTPException(
                status_code=403,
                detail=build_ai_context_error_detail(
                    AiContextBoundaryError(
                        code="ai_context_source_not_allowed",
                        status_code=403,
                        source=requested_source.source,
                    )
                ),
            )

        resolved_source = adapter(context_boundary, requested_source, settings)
        if resolved_source.source != requested_source.source:
            raise HTTPException(
                status_code=500,
                detail=build_ai_context_error_detail(
                    AiContextBoundaryError(
                        code="ai_context_internal_error",
                        status_code=500,
                        source=requested_source.source,
                    )
                ),
            )

        if resolved_source.payload_bytes > requested_source.payload_bytes:
            raise HTTPException(
                status_code=413,
                detail=build_ai_context_error_detail(
                    AiContextBoundaryError(
                        code="ai_context_payload_too_large",
                        status_code=413,
                        source=requested_source.source,
                    )
                ),
            )

        total_payload_bytes += resolved_source.payload_bytes
        if total_payload_bytes > context_boundary.total_payload_bytes:
            raise HTTPException(
                status_code=413,
                detail=build_ai_context_error_detail(
                    AiContextBoundaryError(
                        code="ai_context_payload_too_large",
                        status_code=413,
                    )
                ),
            )

        resolved_sources.append(resolved_source)

    return AiAssistantResolvedContext(
        tenant_id=context_boundary.tenant_id,
        user_id=context_boundary.user_id,
        total_payload_bytes=total_payload_bytes,
        sources=tuple(resolved_sources),
    )


def build_ai_context_source_adapter_registry() -> dict[str, AiContextSourceAdapter]:
    registry: dict[str, AiContextSourceAdapter] = {}
    for source in sorted(ALLOWED_CONTEXT_SOURCES):
        if source not in AI_CONTEXT_SOURCE_POLICIES:
            continue

        if source in LOW_RISK_STUBBED_CONTEXT_SOURCES:
            registry[source] = _build_gateway_bound_low_risk_adapter(source)
            continue

        registry[source] = _build_stub_adapter(source)

    return registry


def _build_stub_adapter(source: str) -> AiContextSourceAdapter:
    def adapter(
        context_boundary: AiAssistantContextBoundary,
        requested_source: AiContextSourceRequest,
        _settings: Settings,
    ) -> AiContextResolvedSource:
        records = _build_stub_records(
            source=source,
            tenant_id=context_boundary.tenant_id,
            user_id=context_boundary.user_id,
            requested_source=requested_source,
        )
        payload_bytes = len(
            json.dumps(records, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
        )
        return AiContextResolvedSource(
            source=source,
            records=records,
            payload_bytes=payload_bytes,
        )

    return adapter


def _build_gateway_bound_low_risk_adapter(
    source: AiContextAdapterKey,
) -> AiContextSourceAdapter:
    def adapter(
        context_boundary: AiAssistantContextBoundary,
        requested_source: AiContextSourceRequest,
        settings: Settings,
    ) -> AiContextResolvedSource:
        if settings.api_gateway_url and settings.api_gateway_secret:
            return _fetch_trusted_context_source(
                context_boundary=context_boundary,
                requested_source=requested_source,
                settings=settings,
            )

        if settings.api_gateway_url or settings.api_gateway_secret:
            raise _build_ai_context_http_exception(
                code="ai_context_source_unavailable",
                source=source,
                status_code=503,
            )

        records = _build_low_risk_stub_records(
            source=source,
            tenant_id=context_boundary.tenant_id,
            user_id=context_boundary.user_id,
            requested_source=requested_source,
        )
        payload_bytes = len(
            json.dumps(records, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
        )
        return AiContextResolvedSource(
            source=source,
            records=records,
            payload_bytes=payload_bytes,
        )

    return adapter


def _build_stub_records(
    *,
    source: str,
    tenant_id: str,
    user_id: str,
    requested_source: AiContextSourceRequest,
) -> tuple[dict[str, object], ...]:
    bounded_item_count = min(requested_source.item_limit, 2)
    records: list[dict[str, object]] = []
    for index in range(bounded_item_count):
        records.append(
            {
                "scope": "tenant_user_stub",
                "source": source,
                "summary": f"{source} summary {index + 1}",
                "time_window_days": requested_source.time_window_days,
                "tenant_ref": _safe_reference(tenant_id),
                "user_ref": _safe_reference(user_id),
            }
        )

    return tuple(records)


def _build_low_risk_stub_records(
    *,
    source: AiContextAdapterKey,
    tenant_id: str,
    user_id: str,
    requested_source: AiContextSourceRequest,
) -> tuple[dict[str, object], ...]:
    return (
        {
            "scope": "tenant_user_stub",
            "source": source,
            "summary": (
                f"{source} is prepared for gateway-backed retrieval but runtime gateway configuration is still missing."
            ),
            "retrieval_mode": "gateway_contract_prepared",
            "gateway_binding_status": "config_required",
            "future_retrieval_owner": AI_CONTEXT_FUTURE_RETRIEVAL_OWNERS[source],
            "time_window_days": requested_source.time_window_days,
            "tenant_ref": _safe_reference(tenant_id),
            "user_ref": _safe_reference(user_id),
        },
    )


def _fetch_trusted_context_source(
    *,
    context_boundary: AiAssistantContextBoundary,
    requested_source: AiContextSourceRequest,
    settings: Settings,
) -> AiContextResolvedSource:
    source = requested_source.source
    response_bytes_limit = _max_trusted_context_response_bytes(requested_source)
    request_payload = {
        "tenant_id": context_boundary.tenant_id,
        "user_id": context_boundary.user_id,
        "sources": [source],
    }

    try:
        with _build_trusted_context_http_client(settings) as http_client:
            response = http_client.post(
                f"{settings.api_gateway_url}{TRUSTED_CONTEXT_ROUTE_PATH}",
                headers={"x-streamos-api-secret": settings.api_gateway_secret},
                json=request_payload,
            )
    except httpx.TimeoutException as error:
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source=source,
            status_code=504,
        ) from error
    except httpx.HTTPError as error:
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source=source,
            status_code=503,
        ) from error

    if response.status_code < 200 or response.status_code >= 300:
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source=source,
            status_code=503,
        )

    if len(response.content) > response_bytes_limit:
        raise _build_ai_context_http_exception(
            code="ai_context_payload_too_large",
            source=source,
            status_code=413,
        )

    try:
        response_payload = response.json()
    except ValueError as error:
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source=source,
            status_code=503,
        ) from error

    records = _sanitize_trusted_context_records(
        payload=response_payload,
        requested_source=requested_source,
        tenant_id=context_boundary.tenant_id,
        user_id=context_boundary.user_id,
    )
    payload_bytes = len(
        json.dumps(records, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    )
    return AiContextResolvedSource(
        source=source,
        records=records,
        payload_bytes=payload_bytes,
    )


def _build_trusted_context_http_client(settings: Settings) -> httpx.Client:
    return httpx.Client(
        timeout=min(
            settings.openai_timeout_seconds,
            TRUSTED_CONTEXT_HTTP_TIMEOUT_SECONDS,
        )
    )


def _sanitize_trusted_context_records(
    *,
    payload: object,
    requested_source: AiContextSourceRequest,
    tenant_id: str,
    user_id: str,
) -> tuple[dict[str, object], ...]:
    source = requested_source.source
    if not isinstance(payload, dict) or set(payload) != {
        "tenant_id",
        "user_id",
        "sources",
    }:
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source=source,
            status_code=503,
        )

    if (
        not isinstance(payload["tenant_id"], str)
        or not isinstance(payload["user_id"], str)
        or payload["tenant_id"] != tenant_id
        or payload["user_id"] != user_id
    ):
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source=source,
            status_code=503,
        )

    sources = payload["sources"]
    if not isinstance(sources, list) or len(sources) != 1:
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source=source,
            status_code=503,
        )

    source_payload = sources[0]
    if not isinstance(source_payload, dict) or set(source_payload) != {
        "source",
        "records",
    }:
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source=source,
            status_code=503,
        )

    if (
        source_payload["source"] != source
        or not isinstance(source_payload["records"], list)
    ):
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source=source,
            status_code=503,
        )

    bounded_records = source_payload["records"][: requested_source.item_limit]
    if source == "channel_platform_status":
        return tuple(
            _sanitize_channel_platform_status_record(record)
            for record in bounded_records
        )

    if source == "content_job_summary":
        return tuple(
            _sanitize_content_job_summary_record(record)
            for record in bounded_records
        )

    raise _build_ai_context_http_exception(
        code="ai_context_source_not_allowed",
        source=source,
        status_code=403,
    )


def _sanitize_channel_platform_status_record(record: object) -> dict[str, object]:
    if not isinstance(record, dict) or set(record) != {
        "provider",
        "connection_state",
        "last_sync_at",
        "status_reason",
    }:
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source="channel_platform_status",
            status_code=503,
        )

    provider = _require_allowed_value(
        record["provider"],
        allowed_values=TRUSTED_CONTEXT_ALLOWED_PROVIDERS,
        source="channel_platform_status",
    )
    connection_state = _require_allowed_value(
        record["connection_state"],
        allowed_values=TRUSTED_CONNECTION_STATES,
        source="channel_platform_status",
    )
    status_reason = _require_allowed_value(
        record["status_reason"],
        allowed_values=TRUSTED_PLATFORM_STATUS_REASONS,
        source="channel_platform_status",
    )
    last_sync_at = _require_optional_iso_timestamp(
        record["last_sync_at"],
        source="channel_platform_status",
    )

    return {
        "provider": provider,
        "connection_state": connection_state,
        "last_sync_at": last_sync_at,
        "status_reason": status_reason,
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
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source="content_job_summary",
            status_code=503,
        )

    return {
        "job_type": _require_safe_summary_string(
            record["job_type"],
            source="content_job_summary",
        ),
        "status": _require_safe_summary_string(
            record["status"],
            source="content_job_summary",
        ),
        "created_at": _require_iso_timestamp(
            record["created_at"],
            source="content_job_summary",
        ),
        "updated_at": _require_iso_timestamp(
            record["updated_at"],
            source="content_job_summary",
        ),
        "retry_count": _require_retry_count(record["retry_count"]),
        "error_category": _require_optional_allowed_value(
            record["error_category"],
            allowed_values=TRUSTED_CONTENT_JOB_ERROR_CATEGORIES,
            source="content_job_summary",
        ),
    }


def _require_allowed_value(
    value: object,
    *,
    allowed_values: frozenset[str],
    source: AiContextAdapterKey,
) -> str:
    if not isinstance(value, str):
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source=source,
            status_code=503,
        )

    normalized = value.strip()
    if normalized not in allowed_values:
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source=source,
            status_code=503,
        )

    return normalized


def _require_optional_allowed_value(
    value: object,
    *,
    allowed_values: frozenset[str],
    source: AiContextAdapterKey,
) -> str | None:
    if value is None:
        return None

    return _require_allowed_value(
        value,
        allowed_values=allowed_values,
        source=source,
    )


def _require_safe_summary_string(value: object, *, source: AiContextAdapterKey) -> str:
    if not isinstance(value, str):
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source=source,
            status_code=503,
        )

    normalized = value.strip()
    if not normalized or len(normalized) > 120:
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source=source,
            status_code=503,
        )
    if "://" in normalized or "sk-" in normalized.lower():
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source=source,
            status_code=503,
        )

    return normalized


def _require_iso_timestamp(value: object, *, source: AiContextAdapterKey) -> str:
    if not isinstance(value, str):
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source=source,
            status_code=503,
        )

    normalized = value.strip()
    if not normalized:
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source=source,
            status_code=503,
        )

    try:
        datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except Exception as error:
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source=source,
            status_code=503,
        ) from error

    return normalized


def _require_optional_iso_timestamp(
    value: object, *, source: AiContextAdapterKey
) -> str | None:
    if value is None:
        return None

    return _require_iso_timestamp(value, source=source)


def _require_retry_count(value: object) -> int:
    if not isinstance(value, int) or value < 0 or value > 100:
        raise _build_ai_context_http_exception(
            code="ai_context_source_unavailable",
            source="content_job_summary",
            status_code=503,
        )

    return value


def _max_trusted_context_response_bytes(
    requested_source: AiContextSourceRequest,
) -> int:
    policy = AI_CONTEXT_SOURCE_POLICIES[requested_source.source]
    return min(policy.max_payload_bytes, requested_source.payload_bytes) + 8_192


def _build_ai_context_http_exception(
    *,
    code: str,
    source: str,
    status_code: int,
) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail=build_ai_context_error_detail(
            AiContextBoundaryError(
                code=code,
                status_code=status_code,
                source=source,
            )
        ),
    )


def _safe_reference(value: str) -> str:
    normalized = value.strip()
    if len(normalized) <= 4:
        return normalized

    return f"{normalized[:2]}...{normalized[-2:]}"


AI_CONTEXT_SOURCE_ADAPTERS = build_ai_context_source_adapter_registry()
