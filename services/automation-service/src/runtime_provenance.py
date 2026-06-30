from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

AUTOMATION_SERVICE_RUNTIME_PROVENANCE_PATH = (
    Path(__file__).resolve().parent.parent / "runtime-provenance.json"
)
AUTOMATION_SERVICE_RUNTIME_PROVENANCE_SCHEMA_VERSION = 1
AUTOMATION_SERVICE_RUNTIME_PROVENANCE_SERVICE = "automation-service"
_GIT_COMMIT_PATTERN = re.compile(r"^[0-9a-f]{7,40}$", re.IGNORECASE)


@dataclass(frozen=True)
class AutomationServiceRuntimeProvenance:
    environment: str
    generated_at: str
    git_commit: str
    git_ref: str
    repository: str
    run_attempt: str
    run_id: str
    schema_version: int
    service: str
    workflow: str


def read_automation_service_runtime_provenance(
    path: Path | None = None,
) -> AutomationServiceRuntimeProvenance | None:
    provenance_path = path or AUTOMATION_SERVICE_RUNTIME_PROVENANCE_PATH

    if not provenance_path.exists():
        return None

    try:
        payload = json.loads(provenance_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    if not _is_runtime_provenance_payload(payload):
        return None

    return AutomationServiceRuntimeProvenance(
        environment=payload["environment"],
        generated_at=payload["generatedAt"],
        git_commit=payload["gitCommit"],
        git_ref=payload["gitRef"],
        repository=payload["repository"],
        run_attempt=payload["runAttempt"],
        run_id=payload["runId"],
        schema_version=payload["schemaVersion"],
        service=payload["service"],
        workflow=payload["workflow"],
    )


def _is_runtime_provenance_payload(payload: object) -> bool:
    if not isinstance(payload, dict):
        return False

    return (
        payload.get("schemaVersion")
        == AUTOMATION_SERVICE_RUNTIME_PROVENANCE_SCHEMA_VERSION
        and payload.get("service") == AUTOMATION_SERVICE_RUNTIME_PROVENANCE_SERVICE
        and isinstance(payload.get("environment"), str)
        and bool(payload["environment"])
        and isinstance(payload.get("generatedAt"), str)
        and bool(payload["generatedAt"])
        and isinstance(payload.get("gitCommit"), str)
        and bool(_GIT_COMMIT_PATTERN.fullmatch(payload["gitCommit"]))
        and isinstance(payload.get("gitRef"), str)
        and isinstance(payload.get("repository"), str)
        and isinstance(payload.get("runAttempt"), str)
        and isinstance(payload.get("runId"), str)
        and isinstance(payload.get("workflow"), str)
    )
