import asyncio
import ipaddress
import json

import httpx
import pytest

from main import app, get_clip_analyzer, get_transcription_processor
from openai_client import OpenAIClipAnalyzer, OpenAITranscriptionProcessor
from schemas import (
    ClipAnalysisRequest,
    ClipAnalysisResponse,
    TranscriptionProcessRequest,
    TranscriptionProcessResponse,
    TranscriptionSegment,
)
from settings import Settings, SettingsError, load_settings
from ssrf import UnsafeAssetUrlError


async def post_json(path: str, payload: dict[str, object]) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as client:
        return await client.post(path, json=payload)


class StubClipAnalyzer:
    async def analyze_clip(self, payload: ClipAnalysisRequest) -> ClipAnalysisResponse:
        return ClipAnalysisResponse(
            asset_id=payload.asset_id,
            source_platform=payload.source_platform,
            virality_score=84,
            recommended_formats=["shorts", "tiktok"],
            highlights=["Strong opening hook"],
            title_suggestions=["This Stream Moment Changed Everything"],
            repurpose_summary="A high-energy clip suitable for short-form distribution.",
            provider="test",
        )


class StubTranscriptionProcessor:
    async def process_transcription(
        self, payload: TranscriptionProcessRequest
    ) -> TranscriptionProcessResponse:
        return TranscriptionProcessResponse(
            job_id=payload.job_id,
            stream_id=payload.stream_id,
            transcript="A clean test transcript.",
            segments=[
                TranscriptionSegment(
                    start=0.0, end=1.5, text="A clean test transcript."
                )
            ],
            language=payload.language,
            provider="test",
            model="gpt-4o-transcribe",
        )


class UnsafeUrlTranscriptionProcessor:
    async def process_transcription(
        self, _payload: TranscriptionProcessRequest
    ) -> TranscriptionProcessResponse:
        raise UnsafeAssetUrlError("Asset URL resolves to a non-public IP address.")


def test_settings_reject_public_openai_keys() -> None:
    with pytest.raises(SettingsError, match="NEXT_PUBLIC_OPENAI_KEY"):
        load_settings(
            {
                "NEXT_PUBLIC_OPENAI_KEY": "sk-client-leak",
                "OPENAI_API_KEY": "sk-server",
            }
        )


def test_transcription_e2e_mode_requires_explicit_guard() -> None:
    with pytest.raises(SettingsError, match="STREAMOS_E2E_MODE=true"):
        load_settings({"TRANSCRIPTION_PROCESSOR_MODE": "stub"})


def test_transcription_e2e_mode_allows_stub_processor() -> None:
    settings = load_settings(
        {
            "STREAMOS_E2E_MODE": "true",
            "TRANSCRIPTION_PROCESSOR_MODE": "stub",
        }
    )

    assert settings.streamos_e2e_mode is True
    assert settings.transcription_processor_mode == "stub"


def test_clip_analysis_endpoint_uses_server_side_analyzer() -> None:
    app.dependency_overrides[get_clip_analyzer] = StubClipAnalyzer

    try:
        response = asyncio.run(
            post_json(
                "/clips/analyze",
                {
                    "asset_id": "clip-123",
                    "source_platform": "twitch",
                    "transcript": "Huge comeback after a risky play in the final round.",
                },
            )
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "asset_id": "clip-123",
        "source_platform": "twitch",
        "virality_score": 84,
        "recommended_formats": ["shorts", "tiktok"],
        "highlights": ["Strong opening hook"],
        "title_suggestions": ["This Stream Moment Changed Everything"],
        "repurpose_summary": "A high-energy clip suitable for short-form distribution.",
        "provider": "test",
    }


def test_transcription_endpoint_uses_server_side_processor() -> None:
    app.dependency_overrides[get_transcription_processor] = StubTranscriptionProcessor

    try:
        response = asyncio.run(
            post_json(
                "/transcriptions/process",
                {
                    "job_id": "job-123",
                    "stream_id": "stream-123",
                    "source_platform": "twitch",
                    "asset_url": "https://cdn.example.com/audio.mp4",
                    "language": "en",
                },
            )
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "job_id": "job-123",
        "stream_id": "stream-123",
        "transcript": "A clean test transcript.",
        "segments": [{"start": 0.0, "end": 1.5, "text": "A clean test transcript."}],
        "language": "en",
        "provider": "test",
        "model": "gpt-4o-transcribe",
    }


def test_transcription_endpoint_returns_400_for_unsafe_asset_url() -> None:
    app.dependency_overrides[get_transcription_processor] = (
        UnsafeUrlTranscriptionProcessor
    )

    try:
        response = asyncio.run(
            post_json(
                "/transcriptions/process",
                {
                    "job_id": "job-123",
                    "stream_id": "stream-123",
                    "source_platform": "twitch",
                    "asset_url": "https://127.0.0.1/audio.mp4",
                    "language": "en",
                },
            )
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json() == {"detail": "Transcription asset URL is not allowed."}


def test_missing_server_openai_key_returns_503(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_OPENAI_KEY", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_OPENAI_API_KEY", raising=False)

    response = asyncio.run(
        post_json(
            "/clips/analyze",
            {
                "asset_id": "clip-123",
                "source_platform": "twitch",
                "transcript": "A clean testing transcript.",
            },
        )
    )

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "OPENAI_API_KEY is required in automation-service for server-side AI calls."
    )


def test_openai_client_keeps_api_key_out_of_request_body() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        body = request.content.decode("utf-8")

        assert request.headers["Authorization"] == "Bearer sk-server"
        assert "sk-server" not in body

        return httpx.Response(
            status_code=200,
            json={
                "output_text": json.dumps(
                    {
                        "virality_score": 91,
                        "recommended_formats": ["shorts", "reel"],
                        "highlights": ["Unexpected clutch moment"],
                        "title_suggestions": ["The Clutch Nobody Saw Coming"],
                        "repurpose_summary": "Lead with the comeback and cut for mobile pacing.",
                    }
                )
            },
        )

    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport)
    analyzer = OpenAIClipAnalyzer(
        Settings(
            streamos_e2e_mode=False,
            openai_api_key="sk-server",
            openai_model="gpt-4o",
            openai_title_model="gpt-4o-mini",
            openai_transcription_model="gpt-4o-transcribe",
            openai_base_url="https://api.openai.test/v1",
            openai_timeout_seconds=30,
            max_transcription_media_bytes=25_000_000,
            transcription_processor_mode="openai",
        ),
        http_client=http_client,
    )

    async def run_analysis() -> ClipAnalysisResponse:
        try:
            return await analyzer.analyze_clip(
                ClipAnalysisRequest(
                    asset_id="clip-123",
                    source_platform="twitch",
                    transcript="A creator lands an unexpected clutch play.",
                )
            )
        finally:
            await http_client.aclose()

    result = asyncio.run(run_analysis())

    assert len(requests) == 1
    assert requests[0].url == "https://api.openai.test/v1/responses"
    assert result.provider == "openai"
    assert result.virality_score == 91


def test_openai_transcription_processor_downloads_media_and_calls_audio_endpoint() -> (
    None
):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)

        if request.url == "https://cdn.example.com/audio.mp4":
            return httpx.Response(
                status_code=200,
                headers={"content-type": "audio/mp4"},
                content=b"fake-audio-bytes",
            )

        assert request.url == "https://api.openai.test/v1/audio/transcriptions"
        assert request.headers["Authorization"] == "Bearer sk-server"

        return httpx.Response(
            status_code=200,
            json={
                "text": "Creator says hello.",
                "segments": [
                    {
                        "start": 0.0,
                        "end": 1.2,
                        "text": "Creator says hello.",
                    }
                ],
            },
        )

    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport)
    processor = OpenAITranscriptionProcessor(
        Settings(
            streamos_e2e_mode=False,
            openai_api_key="sk-server",
            openai_model="gpt-4o",
            openai_title_model="gpt-4o-mini",
            openai_transcription_model="gpt-4o-transcribe",
            openai_base_url="https://api.openai.test/v1",
            openai_timeout_seconds=30,
            max_transcription_media_bytes=25_000_000,
            transcription_processor_mode="openai",
        ),
        http_client=http_client,
        asset_url_resolver=lambda _hostname: [ipaddress.ip_address("93.184.216.34")],
    )

    async def run_transcription() -> TranscriptionProcessResponse:
        try:
            return await processor.process_transcription(
                TranscriptionProcessRequest(
                    job_id="job-123",
                    stream_id="stream-123",
                    source_platform="twitch",
                    asset_url="https://cdn.example.com/audio.mp4",
                    language="en",
                )
            )
        finally:
            await http_client.aclose()

    result = asyncio.run(run_transcription())

    assert [str(request.url) for request in requests] == [
        "https://cdn.example.com/audio.mp4",
        "https://api.openai.test/v1/audio/transcriptions",
    ]
    assert result.transcript == "Creator says hello."
    assert result.segments == [
        TranscriptionSegment(start=0.0, end=1.2, text="Creator says hello.")
    ]
    assert result.model == "gpt-4o-transcribe"


def test_openai_transcription_processor_rejects_private_asset_url_before_download() -> (
    None
):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(status_code=200, content=b"should-not-download")

    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport)
    processor = OpenAITranscriptionProcessor(
        Settings(
            streamos_e2e_mode=False,
            openai_api_key="sk-server",
            openai_model="gpt-4o",
            openai_title_model="gpt-4o-mini",
            openai_transcription_model="gpt-4o-transcribe",
            openai_base_url="https://api.openai.test/v1",
            openai_timeout_seconds=30,
            max_transcription_media_bytes=25_000_000,
            transcription_processor_mode="openai",
        ),
        http_client=http_client,
    )

    async def run_transcription() -> None:
        try:
            await processor.process_transcription(
                TranscriptionProcessRequest(
                    job_id="job-123",
                    stream_id="stream-123",
                    source_platform="twitch",
                    asset_url="https://127.0.0.1/latest/meta-data",
                    language="en",
                )
            )
        finally:
            await http_client.aclose()

    with pytest.raises(UnsafeAssetUrlError, match="non-public IP"):
        asyncio.run(run_transcription())

    assert requests == []


def test_openai_transcription_processor_rejects_private_redirect_targets() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)

        if request.url == "https://cdn.example.com/audio.mp4":
            return httpx.Response(
                status_code=302,
                headers={"location": "https://127.0.0.1/admin"},
            )

        return httpx.Response(status_code=200, content=b"should-not-download")

    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport)
    processor = OpenAITranscriptionProcessor(
        Settings(
            streamos_e2e_mode=False,
            openai_api_key="sk-server",
            openai_model="gpt-4o",
            openai_title_model="gpt-4o-mini",
            openai_transcription_model="gpt-4o-transcribe",
            openai_base_url="https://api.openai.test/v1",
            openai_timeout_seconds=30,
            max_transcription_media_bytes=25_000_000,
            transcription_processor_mode="openai",
        ),
        http_client=http_client,
        asset_url_resolver=lambda _hostname: [ipaddress.ip_address("93.184.216.34")],
    )

    async def run_transcription() -> None:
        try:
            await processor.process_transcription(
                TranscriptionProcessRequest(
                    job_id="job-123",
                    stream_id="stream-123",
                    source_platform="twitch",
                    asset_url="https://cdn.example.com/audio.mp4",
                    language="en",
                )
            )
        finally:
            await http_client.aclose()

    with pytest.raises(UnsafeAssetUrlError, match="non-public IP"):
        asyncio.run(run_transcription())

    assert [str(request.url) for request in requests] == [
        "https://cdn.example.com/audio.mp4"
    ]
