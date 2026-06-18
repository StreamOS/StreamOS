from typing import Literal

from pydantic import BaseModel, Field


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
    captions: list[str] = Field(default_factory=list, max_length=10)
    confidence: int = Field(ge=1, le=100)
    content_job_id: str = Field(min_length=1)
    descriptions: list[str] = Field(default_factory=list, max_length=10)
    hashtag_sets: list[list[str]] = Field(default_factory=list, max_length=8)
    hook_ideas: list[str] = Field(default_factory=list, max_length=10)
    manual_review_required: Literal[True]
    model: str = Field(min_length=1)
    provider: str = Field(min_length=1)
    queue_job_id: str = Field(min_length=1)
    review_notes: list[str] = Field(default_factory=list, max_length=10)
    short_form_plan: str = Field(min_length=1)
    title_suggestions: list[str] = Field(default_factory=list, max_length=10)
    warnings: list[str] = Field(default_factory=list, max_length=10)
