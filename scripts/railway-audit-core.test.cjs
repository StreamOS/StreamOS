const test = require("node:test");
const assert = require("node:assert/strict");
const { join } = require("node:path");
const { readFileSync } = require("node:fs");

const whitelist = require("./config/railway-env-whitelist.cjs");
const {
  buildAuditReport,
  hasBlockingFindings,
} = require("./lib/railway-audit-core.cjs");
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

function cloneEnvironment(environment) {
  return structuredClone(environment);
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

test("buildAuditReport falls back to service list URLs for required public networking", () => {
  const production = loadEnvironment("production");
  delete production.environmentConfig.services["svc-api-production"].networking
    .serviceDomains;

  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production,
    },
    validateHealthPayload,
    whitelist,
  });

  const apiGatewayRows =
    report.environments.production.services["api-gateway"].variables;
  const networkRow = apiGatewayRows.find(
    (row) => row.variable === "PUBLIC_NETWORKING",
  );

  assert.equal(networkRow.status, "✅");
  assert.match(networkRow.summary, /Public networking is enabled/);
});

test("buildAuditReport includes publishing-worker as a private worker without automation-service env", () => {
  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production: loadEnvironment("production"),
    },
    validateHealthPayload,
    whitelist,
  });

  const publishingRows =
    report.environments.production.services["publishing-worker"].variables;
  const inventoryRow = publishingRows.find(
    (row) => row.variable === "SERVICE_INVENTORY",
  );
  const networkRow = publishingRows.find(
    (row) => row.variable === "PUBLIC_NETWORKING",
  );

  assert.ok(inventoryRow);
  assert.equal(inventoryRow.status, "✅");
  assert.match(inventoryRow.summary, /present in the Railway inventory/);
  assert.ok(networkRow);
  assert.equal(networkRow.status, "✅");
  assert.match(networkRow.summary, /Service remains private as expected/);
  assert.equal(
    publishingRows.some((row) => row.variable === "AUTOMATION_SERVICE_URL"),
    false,
  );
  assert.ok(publishingRows.some((row) => row.variable === "REDIS_URL"));
  assert.ok(publishingRows.some((row) => row.variable === "SUPABASE_URL"));
  assert.ok(
    publishingRows.some((row) => row.variable === "SUPABASE_SERVICE_ROLE_KEY"),
  );
  assert.ok(publishingRows.some((row) => row.variable === "YOUTUBE_CLIENT_ID"));
  assert.ok(
    publishingRows.some((row) => row.variable === "YOUTUBE_CLIENT_SECRET"),
  );
  assert.ok(publishingRows.some((row) => row.variable === "TIKTOK_CLIENT_KEY"));
  assert.ok(
    publishingRows.some((row) => row.variable === "TIKTOK_CLIENT_SECRET"),
  );
});

test("buildAuditReport flags a missing publishing-worker inventory entry as blocking", () => {
  const production = cloneEnvironment(loadEnvironment("production"));
  delete production.environmentConfig.services["svc-publishing-production"];
  production.serviceList = production.serviceList.filter(
    (entry) => entry.name !== "publishing-worker",
  );

  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production,
    },
    validateHealthPayload,
    whitelist,
  });

  const publishingRows =
    report.environments.production.services["publishing-worker"].variables;
  const inventoryRow = publishingRows.find(
    (row) => row.variable === "SERVICE_INVENTORY",
  );

  assert.ok(inventoryRow);
  assert.equal(inventoryRow.status, "❌");
  assert.match(
    inventoryRow.summary,
    /missing from the Railway environment inventory/,
  );
  assert.ok(
    report.environments.production.prioritizedFixes.some(
      (finding) =>
        finding.service === "publishing-worker" &&
        finding.variable === "SERVICE_INVENTORY" &&
        finding.flag === "MISSING" &&
        finding.priority === "CRITICAL",
    ),
  );
});

test("buildAuditReport flags publishing-worker public networking exposure", () => {
  const production = cloneEnvironment(loadEnvironment("production"));
  production.environmentConfig.services[
    "svc-publishing-production"
  ].networking.serviceDomains = ["publishing-worker-production.up.railway.app"];

  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production,
    },
    validateHealthPayload,
    whitelist,
  });

  const networkRow = report.environments.production.services[
    "publishing-worker"
  ].variables.find((row) => row.variable === "PUBLIC_NETWORKING");

  assert.equal(networkRow.status, "❌");
  assert.match(networkRow.summary, /Public networking must stay disabled/);
});

test("buildAuditReport flags missing required publishing-worker env and ignores optional env gaps", () => {
  const production = cloneEnvironment(loadEnvironment("production"));
  delete production.serviceVariables["publishing-worker"].YOUTUBE_CLIENT_ID;
  delete production.serviceVariables["publishing-worker"]
    .PUBLICATION_QUEUE_NAME;

  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production,
    },
    validateHealthPayload,
    whitelist,
  });

  const publishingRows =
    report.environments.production.services["publishing-worker"].variables;
  const requiredRow = publishingRows.find(
    (row) => row.variable === "YOUTUBE_CLIENT_ID",
  );
  const optionalRow = publishingRows.find(
    (row) => row.variable === "PUBLICATION_QUEUE_NAME",
  );

  assert.equal(requiredRow.status, "❌");
  assert.match(requiredRow.summary, /Required variable is not set/);
  assert.equal(optionalRow.status, "✅");
  assert.match(optionalRow.summary, /Optional variable is unset/);
});

test("buildAuditReport does not require AUTOMATION_SERVICE_URL for publishing-worker", () => {
  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production: loadEnvironment("production"),
    },
    validateHealthPayload,
    whitelist,
  });

  const publishingRows =
    report.environments.production.services["publishing-worker"].variables;

  assert.equal(
    publishingRows.some((row) => row.variable === "AUTOMATION_SERVICE_URL"),
    false,
  );
});

test("hasBlockingFindings ignores unverifiable SSH health checks", () => {
  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      staging: loadEnvironment("staging"),
    },
    validateHealthPayload,
    whitelist,
  });

  report.summary.totalFindings = 0;
  report.environments.staging.healthChecks = [
    {
      category: "health",
      name: "automation-service-local-health",
      ok: false,
      service: "automation-service",
      unverified: true,
    },
  ];

  assert.equal(hasBlockingFindings(report), false);
});

test("buildAuditReport ignores null-valued Railway tombstone variables", () => {
  const staging = loadEnvironment("staging");
  staging.environmentConfig.services["svc-api-staging"].variables = {
    NEXT_PUBLIC_SUPABASE_ANON_KEY: null,
  };
  staging.serviceVariables["api-gateway"] = {
    ...staging.serviceVariables["api-gateway"],
    NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
  };

  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      staging,
    },
    validateHealthPayload,
    whitelist,
  });

  const gatewayRows =
    report.environments.staging.services["api-gateway"].variables;
  assert.equal(
    gatewayRows.some((row) => row.variable === "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    false,
  );
});

test("buildAuditReport includes release-gate-runner as a private service", () => {
  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production: loadEnvironment("production"),
    },
    validateHealthPayload,
    whitelist,
  });

  const runnerRows =
    report.environments.production.services["release-gate-runner"].variables;
  const networkRow = runnerRows.find(
    (row) => row.variable === "PUBLIC_NETWORKING",
  );

  assert.ok(report.environments.production.services["release-gate-runner"]);
  assert.equal(networkRow.status, "✅");
  assert.match(networkRow.summary, /Service remains private as expected/);
});
