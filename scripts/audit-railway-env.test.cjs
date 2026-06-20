const test = require("node:test");
const assert = require("node:assert/strict");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

function runAuditCli(args, rootName = "railway-audit") {
  const fixturesDir = join(__dirname, "__fixtures__", rootName);

  return spawnSync(
    process.execPath,
    [
      join(__dirname, "audit-railway-env.cjs"),
      `--fixtures-dir=${fixturesDir}`,
      ...args,
    ],
    {
      encoding: "utf8",
    },
  );
}

test("audit CLI renders JSON from fixtures without calling Railway", () => {
  const result = runAuditCli(["--format=json"]);

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);

  assert.equal(report.project.id, "edb7c5f7-6ee6-475e-9095-eb689f5284e8");
  assert.ok(report.environments.production);
  assert.ok(report.summary.totalFindings > 0);
});

test("audit CLI accepts split staging flags with fixture data", () => {
  const result = runAuditCli(["--env", "staging", "--format", "json"]);

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);

  assert.ok(report.environments.staging);
  assert.equal(Object.keys(report.environments).length, 1);
});

test("audit CLI accepts split production flags with fixture data", () => {
  const result = runAuditCli(["--env", "production", "--format", "markdown"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /## production/);
  assert.doesNotMatch(result.stdout, /## staging/);
});

test("audit CLI renders publishing-worker in markdown output for staging and production", () => {
  const result = runAuditCli(["--format", "markdown"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /### publishing-worker/);

  const sectionMatches = result.stdout.match(/^### publishing-worker$/gm) ?? [];
  assert.equal(sectionMatches.length, 2);
  assert.match(result.stdout, /### publishing-worker[\s\S]*SERVICE_INVENTORY/);
  assert.match(result.stdout, /### publishing-worker[\s\S]*PUBLIC_NETWORKING/);
});

test("audit CLI renders publishing-worker in JSON output for staging and production", () => {
  const result = runAuditCli(["--format", "json"]);

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);

  assert.ok(report.environments.staging.services["publishing-worker"]);
  assert.ok(report.environments.production.services["publishing-worker"]);
  assert.equal(
    report.environments.staging.services["publishing-worker"].variables.some(
      (row) => row.variable === "AUTOMATION_SERVICE_URL",
    ),
    false,
  );
  assert.equal(
    report.environments.production.services["publishing-worker"].variables.some(
      (row) => row.variable === "AUTOMATION_SERVICE_URL",
    ),
    false,
  );
});

test("audit CLI keeps publishing-worker happy-path output non-blocking in markdown and JSON", () => {
  const markdownResult = runAuditCli(
    ["--environments", "staging,production", "--format", "markdown"],
    "railway-audit",
  );

  assert.equal(markdownResult.status, 0, markdownResult.stderr);
  assert.match(markdownResult.stdout, /### publishing-worker/);
  assert.match(
    markdownResult.stdout,
    /publishing-worker[\s\S]*SERVICE_INVENTORY[\s\S]*present in the Railway inventory/,
  );
  assert.match(
    markdownResult.stdout,
    /publishing-worker[\s\S]*PUBLIC_NETWORKING[\s\S]*Service remains private as expected/,
  );

  const jsonResult = runAuditCli(
    ["--environments", "staging,production", "--format", "json"],
    "railway-audit",
  );

  assert.equal(jsonResult.status, 0, jsonResult.stderr);

  const report = JSON.parse(jsonResult.stdout);

  assert.ok(report.environments.staging.services["publishing-worker"]);
  assert.ok(report.environments.production.services["publishing-worker"]);
  assert.equal(
    report.environments.staging.services["publishing-worker"].variables.some(
      (row) => row.variable === "AUTOMATION_SERVICE_URL",
    ),
    false,
  );
  assert.equal(
    report.environments.production.services["publishing-worker"].variables.some(
      (row) => row.variable === "AUTOMATION_SERVICE_URL",
    ),
    false,
  );
});

test("audit CLI blocks strict pre-merge output when publishing-worker is missing in production", () => {
  const result = runAuditCli(
    [
      "--environments",
      "staging,production",
      "--format",
      "markdown",
      "--strict",
    ],
    "railway-audit-missing-publishing-worker-production",
  );

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /publishing-worker/);
  assert.match(result.stdout, /STAGING_DRIFT/);
  assert.match(result.stdout, /missing from the Railway environment inventory/);
});

test("audit CLI blocks strict pre-merge output when publishing-worker is missing in staging", () => {
  const result = runAuditCli(
    ["--environments", "staging,production", "--format", "json", "--strict"],
    "railway-audit-missing-publishing-worker-staging",
  );

  assert.equal(result.status, 1, result.stderr);

  const report = JSON.parse(result.stdout);

  assert.ok(
    report.environments.staging.services["publishing-worker"].variables.some(
      (row) => row.variable === "SERVICE_INVENTORY" && row.status === "❌",
    ),
  );
  assert.ok(
    report.stagingDrift.some(
      (finding) =>
        finding.service === "publishing-worker" &&
        finding.variable === "SERVICE_INVENTORY" &&
        finding.flag === "STAGING_DRIFT",
    ),
  );
});

test("audit CLI blocks strict pre-merge output when publishing-worker has public exposure", () => {
  const result = runAuditCli(
    ["--environments", "staging,production", "--format", "json", "--strict"],
    "railway-audit-publishing-worker-public-exposure",
  );

  assert.equal(result.status, 1, result.stderr);

  const report = JSON.parse(result.stdout);

  assert.ok(
    report.environments.staging.services["publishing-worker"].variables.some(
      (row) => row.variable === "PUBLIC_NETWORKING" && row.status === "❌",
    ),
  );
  assert.ok(
    report.environments.production.services["publishing-worker"].variables.some(
      (row) => row.variable === "PUBLIC_NETWORKING" && row.status === "❌",
    ),
  );
  assert.equal(
    report.stagingDrift.some(
      (finding) =>
        finding.service === "publishing-worker" &&
        finding.variable === "PUBLIC_NETWORKING" &&
        finding.flag === "STAGING_DRIFT",
    ),
    false,
  );
});
