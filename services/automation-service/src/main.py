from collections.abc import AsyncIterator
from typing import Annotated, Protocol

import httpx
from fastapi import Depends, FastAPI, HTTPException
from pydantic import ValidationError

from openai_client import OpenAIClipAnalyzer, OpenAITranscriptionProcessor
from schemas import (
    ClipAnalysisRequest,
    ClipAnalysisResponse,
    TranscriptionProcessRequest,
    TranscriptionProcessResponse,
    TranscriptionSegment,
)
from settings import SettingsError, load_settings
from ssrf import UnsafeAssetUrlError

app = FastAPI(title="StreamOS Automation Service", version="0.1.0")


class ClipAnalyzer(Protocol):
    async def analyze_clip(self, payload: ClipAnalysisRequest) -> ClipAnalysisResponse:
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
    except httpx.HTTPStatusError as error:
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI request failed with status {error.response.status_code}.",
        ) from error
    except (httpx.HTTPError, ValueError, KeyError, ValidationError) as error:
        raise HTTPException(status_code=502, detail="OpenAI clip analysis failed.") from error


@app.post("/transcriptions/process", response_model=TranscriptionProcessResponse)
async def process_transcription(
    payload: TranscriptionProcessRequest,
    processor: Annotated[
        TranscriptionProcessor, Depends(get_transcription_processor)
    ],
) -> TranscriptionProcessResponse:
    try:
        return await processor.process_transcription(payload)
    except UnsafeAssetUrlError as error:
        raise HTTPException(
            status_code=400,
            detail="Transcription asset URL is not allowed.",
        ) from error
    except httpx.HTTPStatusError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Transcription request failed with status {error.response.status_code}.",
        ) from error
    except (httpx.HTTPError, ValueError, KeyError, ValidationError) as error:
        raise HTTPException(status_code=502, detail="OpenAI transcription failed.") from error
