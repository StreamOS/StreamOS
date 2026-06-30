from pathlib import Path

from fastapi.testclient import TestClient

from main import app
from runtime_provenance import (
    AutomationServiceRuntimeProvenance,
    read_automation_service_runtime_provenance,
)


def test_read_runtime_provenance_returns_none_for_missing_file(tmp_path: Path) -> None:
    assert (
        read_automation_service_runtime_provenance(tmp_path / "missing-runtime.json")
        is None
    )


def test_read_runtime_provenance_reads_non_secret_commit_marker(
    tmp_path: Path,
) -> None:
    path = tmp_path / "runtime-provenance.json"
    path.write_text(
        """
{
  "schemaVersion": 1,
  "service": "automation-service",
  "environment": "production",
  "generatedAt": "2026-06-30T22:40:00.000Z",
  "gitCommit": "011753c42cc2b0312bd5556ab5da25e873df19c5",
  "gitRef": "refs/heads/main",
  "repository": "StreamOS/StreamOS",
  "workflow": "railway-build",
  "runId": "railway-build",
  "runAttempt": "1"
}
""".strip(),
        encoding="utf-8",
    )

    provenance = read_automation_service_runtime_provenance(path)

    assert provenance == AutomationServiceRuntimeProvenance(
        environment="production",
        generated_at="2026-06-30T22:40:00.000Z",
        git_commit="011753c42cc2b0312bd5556ab5da25e873df19c5",
        git_ref="refs/heads/main",
        repository="StreamOS/StreamOS",
        run_attempt="1",
        run_id="railway-build",
        schema_version=1,
        service="automation-service",
        workflow="railway-build",
    )


def test_health_serves_runtime_provenance_headers_when_available() -> None:
    original = getattr(app.state, "runtime_provenance", None)
    app.state.runtime_provenance = AutomationServiceRuntimeProvenance(
        environment="production",
        generated_at="2026-06-30T22:40:00.000Z",
        git_commit="011753c42cc2b0312bd5556ab5da25e873df19c5",
        git_ref="refs/heads/main",
        repository="StreamOS/StreamOS",
        run_attempt="1",
        run_id="railway-build",
        schema_version=1,
        service="automation-service",
        workflow="railway-build",
    )

    try:
        client = TestClient(app)
        response = client.get("/health")

        assert response.status_code == 200
        assert response.json() == {"service": "automation-service", "status": "ok"}
        assert response.headers["x-streamos-runtime-service"] == "automation-service"
        assert (
            response.headers["x-streamos-runtime-commit"]
            == "011753c42cc2b0312bd5556ab5da25e873df19c5"
        )
        assert response.headers["x-streamos-runtime-environment"] == "production"
    finally:
        app.state.runtime_provenance = original
