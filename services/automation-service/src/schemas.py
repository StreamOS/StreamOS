import re
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field

MAX_REPURPOSING_TEXT_LENGTH = 4_000
UNSAFE_REPURPOSING_TEXT_PATTERN = re.compile(
    r"<\s*/?\s*script\b|javascript\s*:|on(?:error|load|click|mouseover|focus)\s*=",
    re.IGNORECASE,
)


def _strip_repurposing_text(value: object) -> object:
    if isinstance(value, str):
        return value.strip()

    return value


def _reject_unsafe_repurposing_text(value: str) -> str:
    if UNSAFE_REPURPOSING_TEXT_PATTERN.search(value):
        raise ValueError("contains unsafe script-like content")

    return value


RepurposingText = Annotated[
    str,
    BeforeValidator(_strip_repurposing_text),
    Field(min_length=1, max_length=MAX_REPURPOSING_TEXT_LENGTH),
    AfterValidator(_reject_unsafe_repurposing_text),
]
RepurposingHashtagSet = Annotated[
    list[RepurposingText],
    Field(min_length=1, max_length=12),
]


class ClipAnalysisRequest(BaseModel):
    asset_id: str = Field(min_length=1)
    source_platform: str = Field(min_length=1)
    transcript: str = Field(min_length=1, max_length=60_000)


class ClipAnalysisResponse(BaseModel):
    asset_id: str
    source_platform: str
    virality_score: int = Field(ge=1, le=100)
    recommended_formats: list[str] = Field(min_length=1, max_length=5)
    highlights: list[str] = Field(default_factory=list, max_length=5)
    title_suggestions: list[str] = Field(default_factory=list, max_length=5)
    repurpose_summary: str = Field(min_length=1)
    provider: str


class TranscriptionProcessRequest(BaseModel):
    job_id: str = Field(min_length=1)
    stream_id: str = Field(min_length=1)
    source_platform: str = Field(min_length=1)
    asset_url: str = Field(min_length=1)
    language: str = Field(default="auto", min_length=1)
    creator_id: str | None = Field(default=None, min_length=1)
    channel_id: str | None = Field(default=None, min_length=1)


class TranscriptionSegment(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    text: str = Field(min_length=1)


class TranscriptionProcessResponse(BaseModel):
    job_id: str
    stream_id: str
    transcript: str = Field(min_length=1)
    segments: list[TranscriptionSegment] = Field(default_factory=list)
    language: str
    provider: str
    model: str


class RepurposingPlanAssetReference(BaseModel):
    kind: str | None = Field(default=None, min_length=1)
    status: str | None = Field(default=None, min_length=1)
    url: str = Field(min_length=1)


class RepurposingPlanTranscriptReference(BaseModel):
    language: str | None = Field(default=None, min_length=1)
    queue_job_id: str | None = Field(default=None, min_length=1)
    stream_id: str | None = Field(default=None, min_length=1)
    transcript_id: str | None = Field(default=None, min_length=1)


class RepurposingPlanRequest(BaseModel):
    asset_reference: RepurposingPlanAssetReference | None = None
    brand_context: dict[str, object] | None = None
    content_job_id: str = Field(min_length=1)
    content_policy_hints: dict[str, object] | None = None
    language: str | None = Field(default=None, min_length=1)
    locale: str | None = Field(default=None, min_length=1)
    manual_review_required: Literal[True]
    provider: str = Field(min_length=1)
    provider_video_id: str | None = Field(default=None, min_length=1)
    queue_job_id: str = Field(min_length=1)
    source_event_type: Literal["video.published"]
    source_metadata: dict[str, object]
    target_platforms: list[str] = Field(default_factory=list, max_length=4)
    transcript_reference: RepurposingPlanTranscriptReference | None = None
    user_id: str = Field(min_length=1)


class RepurposingPlanResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    captions: list[RepurposingText] = Field(min_length=1, max_length=10)
    confidence: int = Field(ge=1, le=100)
    content_job_id: RepurposingText
    descriptions: list[RepurposingText] = Field(min_length=1, max_length=10)
    hashtag_sets: list[RepurposingHashtagSet] = Field(
        default_factory=list, max_length=8
    )
    hook_ideas: list[RepurposingText] = Field(min_length=1, max_length=10)
    manual_review_required: Literal[True]
    model: RepurposingText
    provider: RepurposingText
    queue_job_id: RepurposingText
    review_notes: list[RepurposingText] = Field(min_length=1, max_length=10)
    short_form_plan: RepurposingText
    title_suggestions: list[RepurposingText] = Field(min_length=1, max_length=10)
    warnings: list[RepurposingText] = Field(default_factory=list, max_length=10)


def ensure_repurposing_plan_response_matches_request(
    request: RepurposingPlanRequest,
    response: RepurposingPlanResponse,
) -> RepurposingPlanResponse:
    if (
        response.content_job_id != request.content_job_id
        or response.queue_job_id != request.queue_job_id
    ):
        raise ValueError("Repurposing plan response identifiers do not match request.")

    return response
