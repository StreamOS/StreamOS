from dataclasses import dataclass
from os import environ
from typing import Mapping

FORBIDDEN_CLIENT_AI_ENV_NAMES = (
    "NEXT_PUBLIC_OPENAI_KEY",
    "NEXT_PUBLIC_OPENAI_API_KEY",
)


class SettingsError(RuntimeError):
    pass


@dataclass(frozen=True)
class Settings:
    streamos_e2e_mode: bool
    openai_api_key: str
    openai_model: str
    openai_title_model: str
    openai_transcription_model: str
    openai_base_url: str
    openai_timeout_seconds: float
    max_transcription_media_bytes: int
    transcription_processor_mode: str


def load_settings(source: Mapping[str, str] | None = None) -> Settings:
    values = environ if source is None else source
    leaked_names = [name for name in FORBIDDEN_CLIENT_AI_ENV_NAMES if values.get(name)]

    if leaked_names:
        names = ", ".join(leaked_names)
        raise SettingsError(
            f"Remove public OpenAI env var(s): {names}. Use server-only OPENAI_API_KEY in automation-service."
        )

    timeout_seconds = values.get("OPENAI_TIMEOUT_SECONDS", "30")
    try:
        parsed_timeout_seconds = float(timeout_seconds)
    except ValueError as error:
        raise SettingsError("OPENAI_TIMEOUT_SECONDS must be a number.") from error

    if parsed_timeout_seconds <= 0:
        raise SettingsError("OPENAI_TIMEOUT_SECONDS must be greater than zero.")

    max_media_bytes = values.get("OPENAI_MAX_TRANSCRIPTION_MEDIA_BYTES", "25000000")
    try:
        parsed_max_media_bytes = int(max_media_bytes)
    except ValueError as error:
        raise SettingsError(
            "OPENAI_MAX_TRANSCRIPTION_MEDIA_BYTES must be an integer."
        ) from error

    if parsed_max_media_bytes <= 0:
        raise SettingsError(
            "OPENAI_MAX_TRANSCRIPTION_MEDIA_BYTES must be greater than zero."
        )

    e2e_mode = values.get("STREAMOS_E2E_MODE", "").strip().lower() == "true"
    transcription_processor_mode = (
        values.get("TRANSCRIPTION_PROCESSOR_MODE", "openai").strip().lower() or "openai"
    )

    if transcription_processor_mode not in {"openai", "stub", "fail"}:
        raise SettingsError(
            "TRANSCRIPTION_PROCESSOR_MODE must be one of: openai, stub, fail."
        )

    if transcription_processor_mode != "openai" and not e2e_mode:
        raise SettingsError(
            "TRANSCRIPTION_PROCESSOR_MODE stub/fail is only allowed with STREAMOS_E2E_MODE=true."
        )

    return Settings(
        streamos_e2e_mode=e2e_mode,
        openai_api_key=values.get("OPENAI_API_KEY", "").strip(),
        openai_model=values.get("OPENAI_MODEL", "gpt-4o").strip() or "gpt-4o",
        openai_title_model=values.get("OPENAI_TITLE_MODEL", "gpt-4o-mini").strip()
        or "gpt-4o-mini",
        openai_transcription_model=values.get(
            "OPENAI_TRANSCRIPTION_MODEL", "gpt-4o-transcribe"
        ).strip()
        or "gpt-4o-transcribe",
        openai_base_url=values.get(
            "OPENAI_BASE_URL", "https://api.openai.com/v1"
        ).rstrip("/"),
        openai_timeout_seconds=parsed_timeout_seconds,
        max_transcription_media_bytes=parsed_max_media_bytes,
        transcription_processor_mode=transcription_processor_mode,
    )
