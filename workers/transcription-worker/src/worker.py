from pydantic import BaseModel, Field


class TranscriptionJob(BaseModel):
    job_id: str = Field(min_length=1)
    asset_url: str = Field(min_length=1)
    language: str = "auto"


def process_job(job: TranscriptionJob) -> dict[str, str]:
    return {
        "job_id": job.job_id,
        "status": "queued",
        "message": "Wire this worker to the queue backend before production use.",
    }
