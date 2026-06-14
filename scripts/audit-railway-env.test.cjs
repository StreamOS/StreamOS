const test = require("node:test");
const assert = require("node:assert/strict");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

test("audit CLI renders JSON from fixtures without calling Railway", () => {
  const fixturesDir = join(__dirname, "__fixtures__", "railway-audit");
  const result = spawnSync(
    process.execPath,
    [
      join(__dirname, "audit-railway-env.cjs"),
      `--fixtures-dir=${fixturesDir}`,
      "--format=json",
    ],
    {
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);

  assert.equal(report.project.id, "edb7c5f7-6ee6-475e-9095-eb689f5284e8");
  assert.ok(report.environments.production);
  assert.ok(report.summary.totalFindings > 0);
});

test("audit CLI accepts split staging flags with fixture data", () => {
  const fixturesDir = join(__dirname, "__fixtures__", "railway-audit");
  const result = spawnSync(
    process.execPath,
    [
      join(__dirname, "audit-railway-env.cjs"),
      "--fixtures-dir",
      fixturesDir,
      "--env",
      "staging",
      "--format",
      "json",
    ],
    {
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);

  assert.ok(report.environments.staging);
  assert.equal(Object.keys(report.environments).length, 1);
});

test("audit CLI accepts split production flags with fixture data", () => {
  const fixturesDir = join(__dirname, "__fixtures__", "railway-audit");
  const result = spawnSync(
    process.execPath,
    [
      join(__dirname, "audit-railway-env.cjs"),
      "--fixtures-dir",
      fixturesDir,
      "--env",
      "production",
      "--format",
      "markdown",
    ],
    {
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /## production/);
  assert.doesNotMatch(result.stdout, /## staging/);
});
