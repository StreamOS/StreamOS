const test = require("node:test");
const assert = require("node:assert/strict");
const { join } = require("node:path");
const { readFileSync } = require("node:fs");

const whitelist = require("./config/railway-env-whitelist.cjs");
const { buildAuditReport } = require("./lib/railway-audit-core.cjs");
const { validateHealthPayload } = require("./check-deployment.cjs");

const fixturesDir = join(__dirname, "__fixtures__", "railway-audit");

function readJson(...segments) {
  return JSON.parse(readFileSync(join(fixturesDir, ...segments), "utf8"));
}

function loadEnvironment(environment) {
  const serviceVariables = {};

  for (const serviceName of Object.keys(whitelist.services)) {
    serviceVariables[serviceName] = readJson(
      environment,
      "services",
      `${serviceName}.variables.json`,
    );
  }

  return {
    environmentConfig: readJson(environment, "environment-config.json"),
    healthChecks: readJson(environment, "health.json"),
    serviceList: readJson(environment, "service-list.json"),
    serviceVariables,
    sharedVariables: readJson(environment, "shared-variables.json"),
  };
}

test("buildAuditReport flags production private-network and health regressions", () => {
  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production: loadEnvironment("production"),
      staging: loadEnvironment("staging"),
    },
    validateHealthPayload,
    whitelist,
  });

  const productionAutomationRows =
    report.environments.production.services["automation-service"].variables;
  const productionNetworkRow = productionAutomationRows.find(
    (row) => row.variable === "PUBLIC_NETWORKING",
  );
  const productionWorkerRows =
    report.environments.production.services["transcription-worker"].variables;
  const workerAutomationRow = productionWorkerRows.find(
    (row) => row.variable === "AUTOMATION_SERVICE_URL",
  );

  assert.equal(productionNetworkRow.status, "❌");
  assert.match(
    productionNetworkRow.summary,
    /Public networking must stay disabled/,
  );
  assert.equal(workerAutomationRow.status, "❌");
  assert.match(workerAutomationRow.summary, /private networking/);
  assert.ok(
    report.stagingDrift.some(
      (finding) =>
        finding.service === "automation-service" &&
        finding.variable === "PUBLIC_NETWORKING",
    ),
  );
  assert.ok(report.summary.totalFindings > 0);
});

test("buildAuditReport allows stub mode in staging e2e", () => {
  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      staging: loadEnvironment("staging"),
    },
    validateHealthPayload,
    whitelist,
  });

  const stagingRow = report.environments.staging.services[
    "automation-service"
  ].variables.find((row) => row.variable === "TRANSCRIPTION_PROCESSOR_MODE");

  assert.equal(stagingRow.status, "✅");
});
