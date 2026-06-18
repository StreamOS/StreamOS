from collections.abc import AsyncIterator
from typing import Annotated, Protocol

import httpx
from fastapi import Depends, FastAPI, HTTPException
from pydantic import ValidationError

from openai_client import (
    OpenAIClipAnalyzer,
    OpenAIRepurposingPlanner,
    OpenAITranscriptionProcessor,
    ProviderRateLimitError,
)
from schemas import (
    ClipAnalysisRequest,
    ClipAnalysisResponse,
    RepurposingPlanRequest,
    RepurposingPlanResponse,
    TranscriptionProcessRequest,
    TranscriptionProcessResponse,
    TranscriptionSegment,
)
from settings import SettingsError, load_settings
from ssrf import UnsafeAssetUrlError

app = FastAPI(title="StreamOS Automation Service", version="0.1.0")


def build_provider_rate_limit_detail(error: ProviderRateLimitError) -> dict[str, object]:
    return {
        "code": "provider_rate_limited",
        "message": error.message,
        "provider": error.provider,
        "retryable": True,
        "retry_after_seconds": error.retry_after_seconds,
        "upstream_status": error.upstream_status,
    }


class ClipAnalyzer(Protocol):
    async def analyze_clip(self, payload: ClipAnalysisRequest) -> ClipAnalysisResponse:
        pass


class RepurposingPlanner(Protocol):
    async def plan_repurposing(
        self, payload: RepurposingPlanRequest
    ) -> RepurposingPlanResponse:
        pass


class TranscriptionProcessor(Protocol):
    async def process_transcription(
        self, payload: TranscriptionProcessRequest
    ) -> TranscriptionProcessResponse:
        pass


class E2EStubTranscriptionProcessor:
    async def process_transcription(
        self, payload: TranscriptionProcessRequest
    ) -> TranscriptionProcessResponse:
        return TranscriptionProcessResponse(
            job_id=payload.job_id,
            stream_id=payload.stream_id,
            transcript="StreamOS local E2E transcript completed.",
            segments=[
                TranscriptionSegment(
                    start=0.0,
                    end=2.4,
                    text="StreamOS local E2E transcript completed.",
                )
            ],
            language=payload.language,
            provider="streamos-e2e",
            model="local-e2e-stub",
        )


class E2EFailingTranscriptionProcessor:
    async def process_transcription(
        self, payload: TranscriptionProcessRequest
    ) -> TranscriptionProcessResponse:
        raise ValueError(f"E2E forced transcription failure for job {payload.job_id}.")


class E2EStubRepurposingPlanner:
    async def plan_repurposing(
        self, payload: RepurposingPlanRequest
    ) -> RepurposingPlanResponse:
        source_title = None
        if isinstance(payload.source_metadata, dict):
            source_title = payload.source_metadata.get("source_video_title")
            if not isinstance(source_title, str) or not source_title.strip():
                source_title = None

        title = source_title or "StreamOS repurposing plan"

        return RepurposingPlanResponse(
            captions=[
                "Open with the strongest moment.",
                "Trim for a vertical-first cut.",
            ],
            confidence=84,
            content_job_id=payload.content_job_id,
            descriptions=[
                "Write a concise platform-specific description.",
                "Keep the tone creator-authentic and review-only.",
            ],
            hashtag_sets=[["#streamos", "#repurposing"]],
            hook_ideas=[
                "Lead with the most surprising beat.",
                "Use the first three seconds as the hook.",
            ],
            manual_review_required=True,
            model="local-e2e-stub",
            provider="streamos-e2e",
            queue_job_id=payload.queue_job_id,
            review_notes=[
                "Manual review required before any publishing action.",
                "No automatic cross-posting or export is performed.",
            ],
            short_form_plan=f"Draft a short-form repurposing plan for {title}.",
            title_suggestions=[
                f"{title} - StreamOS draft",
                "A highlight worthy of manual review",
            ],
            warnings=["Human approval required before downstream publishing."],
        )


class E2EFailingRepurposingPlanner:
    async def plan_repurposing(
        self, payload: RepurposingPlanRequest
    ) -> RepurposingPlanResponse:
        raise ValueError(
            f"E2E forced repurposing failure for job {payload.content_job_id}."
        )


async def get_clip_analyzer() -> AsyncIterator[OpenAIClipAnalyzer]:
    try:
        settings = load_settings()
    except SettingsError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is required in automation-service for server-side AI calls.",
        )

    analyzer = OpenAIClipAnalyzer(settings)
    try:
        yield analyzer
    finally:
        await analyzer.aclose()


async def get_repurposing_planner() -> AsyncIterator[RepurposingPlanner]:
    try:
        settings = load_settings()
    except SettingsError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    if settings.transcription_processor_mode == "stub":
        yield E2EStubRepurposingPlanner()
        return

    if settings.transcription_processor_mode == "fail":
        yield E2EFailingRepurposingPlanner()
        return

    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is required in automation-service for server-side AI calls.",
        )

    planner = OpenAIRepurposingPlanner(settings)
    try:
        yield planner
    finally:
        await planner.aclose()


async def get_transcription_processor() -> AsyncIterator[TranscriptionProcessor]:
    try:
        settings = load_settings()
    except SettingsError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    if settings.transcription_processor_mode == "stub":
        yield E2EStubTranscriptionProcessor()
        return

    if settings.transcription_processor_mode == "fail":
        yield E2EFailingTranscriptionProcessor()
        return

    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is required in automation-service for server-side AI calls.",
        )

    processor = OpenAITranscriptionProcessor(settings)
    try:
        yield processor
    finally:
        await processor.aclose()


@app.get("/health")
def health() -> dict[str, str]:
    return {"service": "automation-service", "status": "ok"}


@app.post("/clips/analyze", response_model=ClipAnalysisResponse)
async def analyze_clip(
    payload: ClipAnalysisRequest,
    analyzer: Annotated[ClipAnalyzer, Depends(get_clip_analyzer)],
) -> ClipAnalysisResponse:
    try:
        return await analyzer.analyze_clip(payload)
    except ProviderRateLimitError as error:
        raise HTTPException(
            status_code=503,
            detail=build_provider_rate_limit_detail(error),
        ) from error
    except httpx.HTTPStatusError as error:
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI request failed with status {error.response.status_code}.",
        ) from error
    except (httpx.HTTPError, ValueError, KeyError, ValidationError) as error:
        raise HTTPException(
            status_code=502, detail="OpenAI clip analysis failed."
        ) from error


@app.post("/repurposing/plan", response_model=RepurposingPlanResponse)
async def plan_repurposing(
    payload: RepurposingPlanRequest,
    planner: Annotated[RepurposingPlanner, Depends(get_repurposing_planner)],
) -> RepurposingPlanResponse:
    try:
        return await planner.plan_repurposing(payload)
    except ProviderRateLimitError as error:
        raise HTTPException(
            status_code=503,
            detail=build_provider_rate_limit_detail(error),
        ) from error
    except httpx.HTTPStatusError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Repurposing request failed with status {error.response.status_code}.",
        ) from error
    except (httpx.HTTPError, ValueError, KeyError, ValidationError) as error:
        raise HTTPException(status_code=502, detail="OpenAI repurposing failed.") from error


@app.post("/transcriptions/process", response_model=TranscriptionProcessResponse)
async def process_transcription(
    payload: TranscriptionProcessRequest,
    processor: Annotated[TranscriptionProcessor, Depends(get_transcription_processor)],
) -> TranscriptionProcessResponse:
    try:
        return await processor.process_transcription(payload)
    except UnsafeAssetUrlError as error:
        raise HTTPException(
            status_code=400,
            detail="Transcription asset URL is not allowed.",
        ) from error
    except ProviderRateLimitError as error:
        raise HTTPException(
            status_code=503,
            detail=build_provider_rate_limit_detail(error),
        ) from error
    except httpx.HTTPStatusError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Transcription request failed with status {error.response.status_code}.",
        ) from error
    except (httpx.HTTPError, ValueError, KeyError, ValidationError) as error:
        raise HTTPException(
            status_code=502, detail="OpenAI transcription failed."
        ) from error
