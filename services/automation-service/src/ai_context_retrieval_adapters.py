import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Literal

from fastapi import HTTPException

import ai_trusted_context_client as trusted_context_client
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
        try:
            client = trusted_context_client.build_trusted_context_client(settings)
        except trusted_context_client.TrustedContextClientError as error:
            raise _build_ai_context_http_exception(
                code=error.code,
                source=source,
                status_code=error.status_code,
            ) from error

        if client is not None:
            return _resolve_gateway_bound_source(
                client=client,
                context_boundary=context_boundary,
                requested_source=requested_source,
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


def _resolve_gateway_bound_source(
    *,
    client: trusted_context_client.TrustedContextClient,
    context_boundary: AiAssistantContextBoundary,
    requested_source: AiContextSourceRequest,
) -> AiContextResolvedSource:
    try:
        records = client.read_source(
            requested_source=requested_source,
            tenant_id=context_boundary.tenant_id,
            user_id=context_boundary.user_id,
        )
    except trusted_context_client.TrustedContextClientError as error:
        raise _build_ai_context_http_exception(
            code=error.code,
            source=requested_source.source,
            status_code=error.status_code,
        ) from error

    payload_bytes = len(
        json.dumps(records, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    )
    return AiContextResolvedSource(
        source=requested_source.source,
        records=records,
        payload_bytes=payload_bytes,
    )


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
