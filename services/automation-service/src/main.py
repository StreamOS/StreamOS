from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="StreamOS Automation Service", version="0.1.0")


class ClipAnalysisRequest(BaseModel):
    asset_id: str = Field(min_length=1)
    source_platform: str = Field(min_length=1)
    transcript: str = Field(min_length=1)


@app.get("/health")
def health() -> dict[str, str]:
    return {"service": "automation-service", "status": "ok"}


@app.post("/clips/analyze")
def analyze_clip(payload: ClipAnalysisRequest) -> dict[str, object]:
    score = min(100, max(1, len(payload.transcript.split()) * 3))
    return {
        "asset_id": payload.asset_id,
        "source_platform": payload.source_platform,
        "virality_score": score,
        "recommended_formats": ["shorts", "tiktok", "reel"],
    }
