import json
from typing import Any

import httpx

from schemas import (
    ClipAnalysisRequest,
    ClipAnalysisResponse,
    TranscriptionProcessRequest,
    TranscriptionProcessResponse,
    TranscriptionSegment,
)
from settings import Settings


class OpenAIClipAnalyzer:
    def __init__(
        self,
        settings: Settings,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self.settings = settings
        self.http_client = http_client or httpx.AsyncClient(timeout=settings.openai_timeout_seconds)
        self._owns_client = http_client is None

    async def analyze_clip(self, payload: ClipAnalysisRequest) -> ClipAnalysisResponse:
        response = await self.http_client.post(
            f"{self.settings.openai_base_url}/responses",
            headers={
                "Authorization": f"Bearer {self.settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.settings.openai_model,
                "input": [
                    {
                        "role": "developer",
                        "content": (
                            "You analyze creator livestream clips for repurposing. "
                            "Return only JSON that matches the provided schema. "
                            "Do not include secrets, credentials, or raw prompt metadata."
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "asset_id": payload.asset_id,
                                "source_platform": payload.source_platform,
                                "transcript": payload.transcript,
                            },
                            separators=(",", ":"),
                        ),
                    },
                ],
                "text": {
                    "format": {
                        "type": "json_schema",
                        "name": "streamos_clip_analysis",
                        "strict": True,
                        "schema": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": [
                                "virality_score",
                                "recommended_formats",
                                "highlights",
                                "title_suggestions",
                                "repurpose_summary",
                            ],
                            "properties": {
                                "virality_score": {"type": "integer", "minimum": 1, "maximum": 100},
                                "recommended_formats": {
                                    "type": "array",
                                    "minItems": 1,
                                    "maxItems": 5,
                                    "items": {"type": "string"},
                                },
                                "highlights": {
                                    "type": "array",
                                    "maxItems": 5,
                                    "items": {"type": "string"},
                                },
                                "title_suggestions": {
                                    "type": "array",
                                    "maxItems": 5,
                                    "items": {"type": "string"},
                                },
                                "repurpose_summary": {"type": "string"},
                            },
                        },
                    }
                },
            },
        )

        response.raise_for_status()
        analysis = json.loads(_extract_output_text(response.json()))

        return ClipAnalysisResponse(
            asset_id=payload.asset_id,
            source_platform=payload.source_platform,
            virality_score=analysis["virality_score"],
            recommended_formats=analysis["recommended_formats"],
            highlights=analysis["highlights"],
            title_suggestions=analysis["title_suggestions"],
            repurpose_summary=analysis["repurpose_summary"],
            provider="openai",
        )

    async def aclose(self) -> None:
        if self._owns_client:
            await self.http_client.aclose()


class OpenAITranscriptionProcessor:
    def __init__(
        self,
        settings: Settings,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self.settings = settings
        self.http_client = http_client or httpx.AsyncClient(timeout=settings.openai_timeout_seconds)
        self._owns_client = http_client is None

    async def process_transcription(
        self, payload: TranscriptionProcessRequest
    ) -> TranscriptionProcessResponse:
        media_response = await self.http_client.get(payload.asset_url, follow_redirects=True)
        media_response.raise_for_status()

        media_bytes = media_response.content
        if len(media_bytes) > self.settings.max_transcription_media_bytes:
            raise ValueError("Transcription media exceeds configured maximum size.")

        data = {
            "model": self.settings.openai_transcription_model,
            "response_format": "verbose_json",
        }
        if payload.language != "auto":
            data["language"] = payload.language

        transcription_response = await self.http_client.post(
            f"{self.settings.openai_base_url}/audio/transcriptions",
            headers={"Authorization": f"Bearer {self.settings.openai_api_key}"},
            data=data,
            files={
                "file": (
                    _filename_from_url(payload.asset_url),
                    media_bytes,
                    media_response.headers.get("content-type", "application/octet-stream"),
                )
            },
        )
        transcription_response.raise_for_status()
        response_payload = transcription_response.json()
        transcript = response_payload.get("text")

        if not isinstance(transcript, str) or not transcript.strip():
            raise ValueError("OpenAI transcription response did not include text.")

        return TranscriptionProcessResponse(
            job_id=payload.job_id,
            stream_id=payload.stream_id,
            transcript=transcript.strip(),
            segments=_extract_transcription_segments(response_payload),
            language=payload.language,
            provider="openai",
            model=self.settings.openai_transcription_model,
        )

    async def aclose(self) -> None:
        if self._owns_client:
            await self.http_client.aclose()


def _extract_output_text(response_payload: dict[str, Any]) -> str:
    output_text = response_payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    for output_item in response_payload.get("output", []):
        for content_item in output_item.get("content", []):
            text = content_item.get("text")
            if isinstance(text, str) and text.strip():
                return text

    raise ValueError("OpenAI response did not include text output.")


def _filename_from_url(asset_url: str) -> str:
    path = httpx.URL(asset_url).path
    filename = path.rsplit("/", 1)[-1]

    return filename or "streamos-audio.mp4"


def _extract_transcription_segments(
    response_payload: dict[str, Any]
) -> list[TranscriptionSegment]:
    segments = response_payload.get("segments")

    if not isinstance(segments, list):
        return []

    normalized_segments: list[TranscriptionSegment] = []
    for segment in segments:
        if not isinstance(segment, dict):
            continue

        start = segment.get("start")
        end = segment.get("end")
        text = segment.get("text")

        if not isinstance(start, (int, float)):
            continue
        if not isinstance(end, (int, float)):
            continue
        if not isinstance(text, str) or not text.strip():
            continue

        normalized_segments.append(
            TranscriptionSegment(
                start=float(start),
                end=float(end),
                text=text.strip(),
            )
        )

    return normalized_segments
