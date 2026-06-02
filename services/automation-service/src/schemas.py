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
