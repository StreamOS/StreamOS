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

const CHECK = "\u2705";
const CROSS = "\u274c";

const fixturesDir = join(__dirname, "__fixtures__", "railway-audit");
const expectedServices = Object.keys(whitelist.services);
const privateServices = expectedServices.filter(
  (serviceName) => serviceName !== "api-gateway",
);

function readJson(...segments) {
  return JSON.parse(readFileSync(join(fixturesDir, ...segments), "utf8"));
}

function readJsonFromRoot(rootName, ...segments) {
  return JSON.parse(
    readFileSync(
      join(__dirname, "__fixtures__", rootName, ...segments),
      "utf8",
    ),
  );
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

function loadEnvironmentFromRoot(rootName, environment) {
  const serviceVariables = {};

  for (const serviceName of Object.keys(whitelist.services)) {
    serviceVariables[serviceName] = readJsonFromRoot(
      rootName,
      environment,
      "services",
      `${serviceName}.variables.json`,
    );
  }

  return {
    environmentConfig: readJsonFromRoot(
      rootName,
      environment,
      "environment-config.json",
    ),
    healthChecks: readJsonFromRoot(rootName, environment, "health.json"),
    serviceList: readJsonFromRoot(rootName, environment, "service-list.json"),
    serviceVariables,
    sharedVariables: readJsonFromRoot(
      rootName,
      environment,
      "shared-variables.json",
    ),
  };
}

function getServiceId(environment, serviceName) {
  return environment.serviceList.find((entry) => entry.name === serviceName)
    ?.id;
}

function loadHappyPathEnvironment(environment) {
  const loaded = cloneEnvironment(loadEnvironment(environment));
  const automationServiceId = getServiceId(loaded, "automation-service");
  const apiGatewayHealth = loaded.healthChecks.find(
    (check) => check.name === "api-gateway-public-health",
  );
  const automationPathHealth = loaded.healthChecks.find(
    (check) => check.name === "transcription-worker-automation-path",
  );

  if (
    automationServiceId &&
    loaded.environmentConfig.services[automationServiceId]
  ) {
    loaded.environmentConfig.services[
      automationServiceId
    ].networking.serviceDomains = [];
  }

  const automationServiceListEntry = loaded.serviceList.find(
    (entry) => entry.name === "automation-service",
  );

  if (automationServiceListEntry) {
    automationServiceListEntry.url = null;
  }

  if (apiGatewayHealth) {
    apiGatewayHealth.bodyText = '{"service":"api-gateway","status":"ok"}';
    apiGatewayHealth.httpStatus = 200;
    apiGatewayHealth.ok = true;
    delete apiGatewayHealth.message;
  }

  if (automationPathHealth) {
    automationPathHealth.bodyText =
      '{"service":"automation-service","status":"ok"}';
    automationPathHealth.httpStatus = 200;
    automationPathHealth.ok = true;
    automationPathHealth.target =
      "http://automation-service-production.railway.internal:8000/health";
    delete automationPathHealth.message;
  }

  return loaded;
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

  assert.equal(productionNetworkRow.status, CROSS);
  assert.match(
    productionNetworkRow.summary,
    /Public networking must stay disabled/,
  );
  assert.equal(workerAutomationRow.status, CROSS);
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

  assert.equal(stagingRow.status, CHECK);
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

  assert.equal(networkRow.status, CHECK);
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
  assert.equal(inventoryRow.status, CHECK);
  assert.match(inventoryRow.summary, /present in the Railway inventory/);
  assert.ok(networkRow);
  assert.equal(networkRow.status, CHECK);
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

test("buildAuditReport includes publishing-scheduler-worker as a private worker with only execution storage env", () => {
  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production: loadEnvironment("production"),
    },
    validateHealthPayload,
    whitelist,
  });

  const schedulerRows =
    report.environments.production.services["publishing-scheduler-worker"]
      .variables;
  const inventoryRow = schedulerRows.find(
    (row) => row.variable === "SERVICE_INVENTORY",
  );
  const networkRow = schedulerRows.find(
    (row) => row.variable === "PUBLIC_NETWORKING",
  );

  assert.ok(inventoryRow);
  assert.equal(inventoryRow.status, CHECK);
  assert.match(inventoryRow.summary, /present in the Railway inventory/);
  assert.ok(networkRow);
  assert.equal(networkRow.status, CHECK);
  assert.match(networkRow.summary, /Service remains private as expected/);
  assert.equal(
    schedulerRows.some((row) => row.variable === "AUTOMATION_SERVICE_URL"),
    false,
  );
  assert.equal(
    schedulerRows.some((row) => row.variable === "APP_ENCRYPTION_KEY"),
    false,
  );
  assert.ok(schedulerRows.some((row) => row.variable === "REDIS_URL"));
  assert.ok(schedulerRows.some((row) => row.variable === "SUPABASE_URL"));
  assert.ok(
    schedulerRows.some((row) => row.variable === "SUPABASE_SERVICE_ROLE_KEY"),
  );
});

test("buildAuditReport treats gateway-owned Twitch and YouTube secrets as Railway-managed and accepts webhook aliases", () => {
  const production = cloneEnvironment(loadEnvironment("production"));
  const apiGatewayVariables = production.serviceVariables["api-gateway"];

  apiGatewayVariables.TWITCH_WEBHOOK_SECRET =
    apiGatewayVariables.TWITCH_EVENTSUB_SECRET;
  delete apiGatewayVariables.TWITCH_EVENTSUB_SECRET;
  apiGatewayVariables.YOUTUBE_WEBSUB_SECRET =
    apiGatewayVariables.YOUTUBE_WEBHOOK_SECRET;
  delete apiGatewayVariables.YOUTUBE_WEBHOOK_SECRET;
  delete apiGatewayVariables.CLIP_WORKER_CONCURRENCY;
  delete apiGatewayVariables.KICK_WEBHOOK_SECRET;

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

  assert.equal(
    apiGatewayRows.some((row) => row.variable === "TWITCH_WEBHOOK_SECRET"),
    false,
  );
  assert.equal(
    apiGatewayRows.some((row) => row.variable === "YOUTUBE_WEBSUB_SECRET"),
    false,
  );
  assert.ok(
    apiGatewayRows.find((row) => row.variable === "TWITCH_EVENTSUB_SECRET"),
  );
  assert.ok(
    apiGatewayRows.find((row) => row.variable === "YOUTUBE_WEBHOOK_SECRET"),
  );
  assert.ok(apiGatewayRows.find((row) => row.variable === "TWITCH_CLIENT_ID"));
  assert.ok(
    apiGatewayRows.find((row) => row.variable === "TWITCH_CLIENT_SECRET"),
  );
  assert.ok(apiGatewayRows.find((row) => row.variable === "YOUTUBE_CLIENT_ID"));
  assert.ok(
    apiGatewayRows.find((row) => row.variable === "YOUTUBE_CLIENT_SECRET"),
  );
  assert.equal(
    apiGatewayRows.some((row) => row.variable === "CLIP_WORKER_CONCURRENCY"),
    false,
  );
  assert.equal(
    apiGatewayRows.some((row) => row.variable === "KICK_WEBHOOK_SECRET"),
    false,
  );
});

test("buildAuditReport requires the api-gateway YouTube WebSub verify token in staging and production", () => {
  const production = cloneEnvironment(loadEnvironment("production"));
  const staging = cloneEnvironment(loadEnvironment("staging"));
  delete production.serviceVariables["api-gateway"].YOUTUBE_WEBSUB_VERIFY_TOKEN;
  delete staging.serviceVariables["api-gateway"].YOUTUBE_WEBSUB_VERIFY_TOKEN;

  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production,
      staging,
    },
    validateHealthPayload,
    whitelist,
  });

  for (const environmentName of ["staging", "production"]) {
    const row = report.environments[environmentName].services[
      "api-gateway"
    ].variables.find(
      (entry) => entry.variable === "YOUTUBE_WEBSUB_VERIFY_TOKEN",
    );

    assert.ok(row, `${environmentName} should model the verify token`);
    assert.equal(row.required, true);
    assert.equal(row.status, CROSS);
    assert.match(row.summary, /Required variable is not set/);
    assert.ok(row.checks.includes("required"));
    assert.ok(
      report.environments[environmentName].prioritizedFixes.some(
        (finding) =>
          finding.service === "api-gateway" &&
          finding.variable === "YOUTUBE_WEBSUB_VERIFY_TOKEN" &&
          finding.flag === "MISSING" &&
          finding.priority ===
            (environmentName === "production" ? "CRITICAL" : "HIGH"),
      ),
    );
  }

  assert.equal(hasBlockingFindings(report), true);
});

test("buildAuditReport keeps publishing-worker happy-path fixtures clean in staging and production", () => {
  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production: loadEnvironmentFromRoot("railway-audit", "production"),
      staging: loadEnvironmentFromRoot("railway-audit", "staging"),
    },
    validateHealthPayload,
    whitelist,
  });

  const stagingRows =
    report.environments.staging.services["publishing-worker"].variables;
  const productionRows =
    report.environments.production.services["publishing-worker"].variables;

  for (const rows of [stagingRows, productionRows]) {
    assert.equal(
      rows.find((row) => row.variable === "SERVICE_INVENTORY").status,
      "✅",
    );
    assert.equal(
      rows.find((row) => row.variable === "PUBLIC_NETWORKING").status,
      "✅",
    );
    assert.equal(
      rows.some((row) => row.variable === "AUTOMATION_SERVICE_URL"),
      false,
    );
  }
});

test("buildAuditReport flags staging missing publishing-worker fixtures", () => {
  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production: loadEnvironmentFromRoot(
        "railway-audit-missing-publishing-worker-staging",
        "production",
      ),
      staging: loadEnvironmentFromRoot(
        "railway-audit-missing-publishing-worker-staging",
        "staging",
      ),
    },
    validateHealthPayload,
    whitelist,
  });

  const stagingInventoryRow = report.environments.staging.services[
    "publishing-worker"
  ].variables.find((row) => row.variable === "SERVICE_INVENTORY");

  assert.equal(stagingInventoryRow.status, "❌");
  assert.match(
    stagingInventoryRow.summary,
    /missing from the Railway environment inventory/,
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

test("buildAuditReport flags production missing publishing-worker fixtures", () => {
  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production: loadEnvironmentFromRoot(
        "railway-audit-missing-publishing-worker-production",
        "production",
      ),
      staging: loadEnvironmentFromRoot(
        "railway-audit-missing-publishing-worker-production",
        "staging",
      ),
    },
    validateHealthPayload,
    whitelist,
  });

  const productionInventoryRow = report.environments.production.services[
    "publishing-worker"
  ].variables.find((row) => row.variable === "SERVICE_INVENTORY");

  assert.equal(productionInventoryRow.status, "❌");
  assert.match(
    productionInventoryRow.summary,
    /missing from the Railway environment inventory/,
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

test("buildAuditReport flags both-environment missing publishing-worker fixtures", () => {
  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production: loadEnvironmentFromRoot(
        "railway-audit-missing-publishing-worker-both",
        "production",
      ),
      staging: loadEnvironmentFromRoot(
        "railway-audit-missing-publishing-worker-both",
        "staging",
      ),
    },
    validateHealthPayload,
    whitelist,
  });

  const stagingInventoryRow = report.environments.staging.services[
    "publishing-worker"
  ].variables.find((row) => row.variable === "SERVICE_INVENTORY");
  const productionInventoryRow = report.environments.production.services[
    "publishing-worker"
  ].variables.find((row) => row.variable === "SERVICE_INVENTORY");

  assert.equal(stagingInventoryRow.status, "❌");
  assert.equal(productionInventoryRow.status, "❌");
  assert.equal(
    report.stagingDrift.some(
      (finding) =>
        finding.service === "publishing-worker" &&
        finding.variable === "SERVICE_INVENTORY",
    ),
    false,
  );
});

test("buildAuditReport flags publishing-worker public networking exposure in fixture roots", () => {
  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production: loadEnvironmentFromRoot(
        "railway-audit-publishing-worker-public-exposure",
        "production",
      ),
      staging: loadEnvironmentFromRoot(
        "railway-audit-publishing-worker-public-exposure",
        "staging",
      ),
    },
    validateHealthPayload,
    whitelist,
  });

  const productionNetworkRow = report.environments.production.services[
    "publishing-worker"
  ].variables.find((row) => row.variable === "PUBLIC_NETWORKING");

  assert.equal(productionNetworkRow.status, "❌");
  assert.match(
    productionNetworkRow.summary,
    /Public networking must stay disabled/,
  );
});

test("buildAuditReport flags missing publishing-worker envs in fixture roots", () => {
  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production: loadEnvironmentFromRoot(
        "railway-audit-publishing-worker-missing-env",
        "production",
      ),
      staging: loadEnvironmentFromRoot(
        "railway-audit-publishing-worker-missing-env",
        "staging",
      ),
    },
    validateHealthPayload,
    whitelist,
  });

  const publishingRows =
    report.environments.production.services["publishing-worker"].variables;

  assert.equal(
    publishingRows.find((row) => row.variable === "REDIS_URL").status,
    "❌",
  );
  assert.equal(
    publishingRows.find((row) => row.variable === "SUPABASE_URL").status,
    "❌",
  );
  assert.equal(
    publishingRows.find((row) => row.variable === "SUPABASE_SERVICE_ROLE_KEY")
      .status,
    "❌",
  );
  assert.equal(
    publishingRows.find((row) => row.variable === "APP_ENCRYPTION_KEY").status,
    "❌",
  );
  assert.equal(
    publishingRows.some((row) => row.variable === "AUTOMATION_SERVICE_URL"),
    false,
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

test("buildAuditReport tolerates ID-keyed publishing-worker environment config entries", () => {
  const production = cloneEnvironment(loadEnvironment("production"));
  delete production.environmentConfig.services["svc-publishing-production"]
    .name;

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

  assert.equal(inventoryRow.status, "✅");
  assert.match(inventoryRow.summary, /present in the Railway inventory/);
  assert.equal(
    report.environments.production.services["publishing-worker"].networking
      .privateNetworkEndpoint,
    "publishing-worker-production",
  );
  assert.deepEqual(
    report.environments.production.services["publishing-worker"].networking
      .publicDomains,
    [],
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

test("buildAuditReport models every expected service as present and private in the happy path", () => {
  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production: loadHappyPathEnvironment("production"),
      staging: loadHappyPathEnvironment("staging"),
    },
    validateHealthPayload,
    whitelist,
  });

  for (const environmentName of ["staging", "production"]) {
    for (const serviceName of expectedServices) {
      const serviceRows =
        report.environments[environmentName].services[serviceName].variables;
      const inventoryRow = serviceRows.find(
        (row) => row.variable === "SERVICE_INVENTORY",
      );
      const networkingRow = serviceRows.find(
        (row) => row.variable === "PUBLIC_NETWORKING",
      );

      assert.ok(
        report.environments[environmentName].services[serviceName],
        `${environmentName} is missing ${serviceName}`,
      );
      assert.ok(
        inventoryRow,
        `${environmentName} is missing inventory for ${serviceName}`,
      );
      assert.match(inventoryRow.summary, /present in the Railway inventory/);
      assert.ok(
        networkingRow,
        `${environmentName} is missing networking for ${serviceName}`,
      );

      if (serviceName === "api-gateway") {
        assert.match(
          networkingRow.summary,
          /Public networking is enabled as expected/,
        );
      } else {
        assert.match(
          networkingRow.summary,
          /Service remains private as expected/,
        );
      }
    }
  }
});

test("buildAuditReport exposes the retry worker repurposing queue contract explicitly", () => {
  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production: loadEnvironment("production"),
      staging: loadEnvironment("staging"),
    },
    validateHealthPayload,
    whitelist,
  });

  for (const environmentName of ["staging", "production"]) {
    const retryWorkerRows =
      report.environments[environmentName].services["content-job-retry-worker"]
        .variables;
    const repurposingQueueRow = retryWorkerRows.find(
      (row) => row.variable === "REPURPOSING_QUEUE_NAME",
    );

    assert.ok(repurposingQueueRow);
    assert.match(
      repurposingQueueRow.summary,
      /configured via service|Optional variable is unset/,
    );
  }
});

test("buildAuditReport requires REPURPOSING_QUEUE_NAME for content-job-retry-worker", () => {
  const production = cloneEnvironment(loadEnvironment("production"));
  delete production.serviceVariables["content-job-retry-worker"]
    .REPURPOSING_QUEUE_NAME;

  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production,
    },
    validateHealthPayload,
    whitelist,
  });

  const retryWorkerRows =
    report.environments.production.services["content-job-retry-worker"]
      .variables;
  const repurposingQueueRow = retryWorkerRows.find(
    (row) => row.variable === "REPURPOSING_QUEUE_NAME",
  );

  assert.match(repurposingQueueRow.summary, /Required variable is not set/);
});

test("buildAuditReport keeps AUTOMATION_SERVICE_URL on runtimes that actually need it", () => {
  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production: loadEnvironment("production"),
    },
    validateHealthPayload,
    whitelist,
  });

  for (const serviceName of [
    "clip-worker",
    "release-gate-runner",
    "repurposing-worker",
    "transcription-worker",
  ]) {
    assert.ok(
      report.environments.production.services[serviceName].variables.some(
        (row) => row.variable === "AUTOMATION_SERVICE_URL",
      ),
      `${serviceName} should model AUTOMATION_SERVICE_URL`,
    );
  }

  for (const serviceName of [
    "content-job-retry-worker",
    "publishing-worker",
    "stream-job-worker",
  ]) {
    assert.equal(
      report.environments.production.services[serviceName].variables.some(
        (row) => row.variable === "AUTOMATION_SERVICE_URL",
      ),
      false,
      `${serviceName} should not model AUTOMATION_SERVICE_URL`,
    );
  }
});

test("buildAuditReport flags missing private services as blocking inventory drift", () => {
  for (const serviceName of privateServices) {
    const production = cloneEnvironment(loadEnvironment("production"));
    const serviceId = getServiceId(production, serviceName);

    assert.ok(serviceId, `${serviceName} is missing a production service id`);
    delete production.environmentConfig.services[serviceId];
    production.serviceList = production.serviceList.filter(
      (entry) => entry.name !== serviceName,
    );

    const report = buildAuditReport({
      project: whitelist.project,
      rawEnvironments: {
        production,
      },
      validateHealthPayload,
      whitelist,
    });

    const inventoryRow = report.environments.production.services[
      serviceName
    ].variables.find((row) => row.variable === "SERVICE_INVENTORY");

    assert.match(
      inventoryRow.summary,
      /missing from the Railway environment inventory/,
    );
    assert.ok(
      report.environments.production.prioritizedFixes.some(
        (finding) =>
          finding.service === serviceName &&
          finding.variable === "SERVICE_INVENTORY" &&
          finding.flag === "MISSING",
      ),
    );
  }
});

test("buildAuditReport flags public networking exposure for every private service", () => {
  for (const serviceName of privateServices) {
    const production = cloneEnvironment(loadEnvironment("production"));
    const serviceId = getServiceId(production, serviceName);

    assert.ok(serviceId, `${serviceName} is missing a production service id`);
    production.environmentConfig.services[serviceId].networking.serviceDomains =
      [`${serviceName}-production.up.railway.app`];

    const report = buildAuditReport({
      project: whitelist.project,
      rawEnvironments: {
        production,
      },
      validateHealthPayload,
      whitelist,
    });

    const networkingRow = report.environments.production.services[
      serviceName
    ].variables.find((row) => row.variable === "PUBLIC_NETWORKING");

    assert.match(networkingRow.summary, /Public networking must stay disabled/);
  }
});

test("buildAuditReport keeps worker-owned secrets and provider secrets scoped to the correct services", () => {
  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production: loadEnvironment("production"),
    },
    validateHealthPayload,
    whitelist,
  });

  const forbiddenVariablesByService = {
    "clip-worker": [
      "APP_ENCRYPTION_KEY",
      "TWITCH_CLIENT_SECRET",
      "YOUTUBE_CLIENT_SECRET",
    ],
    "content-job-retry-worker": [
      "APP_ENCRYPTION_KEY",
      "AUTOMATION_SERVICE_URL",
      "TWITCH_CLIENT_SECRET",
      "YOUTUBE_CLIENT_SECRET",
    ],
    "publishing-worker": ["AUTOMATION_SERVICE_URL"],
    "publishing-scheduler-worker": [
      "APP_ENCRYPTION_KEY",
      "AUTOMATION_SERVICE_URL",
      "TIKTOK_CLIENT_SECRET",
      "TWITCH_CLIENT_SECRET",
      "YOUTUBE_CLIENT_ID",
      "YOUTUBE_CLIENT_SECRET",
    ],
    "release-gate-runner": [
      "APP_ENCRYPTION_KEY",
      "TWITCH_CLIENT_SECRET",
      "YOUTUBE_CLIENT_SECRET",
    ],
    "repurposing-worker": [
      "APP_ENCRYPTION_KEY",
      "TWITCH_CLIENT_SECRET",
      "YOUTUBE_CLIENT_SECRET",
    ],
    "stream-job-worker": [
      "APP_ENCRYPTION_KEY",
      "AUTOMATION_SERVICE_URL",
      "TWITCH_CLIENT_SECRET",
      "YOUTUBE_CLIENT_SECRET",
    ],
    "transcription-worker": [
      "APP_ENCRYPTION_KEY",
      "CLIP_WORKER_CONCURRENCY",
      "TWITCH_CLIENT_SECRET",
      "YOUTUBE_CLIENT_SECRET",
    ],
  };

  for (const [serviceName, forbiddenVariables] of Object.entries(
    forbiddenVariablesByService,
  )) {
    const serviceRows =
      report.environments.production.services[serviceName].variables;

    for (const variableName of forbiddenVariables) {
      assert.equal(
        serviceRows.some((row) => row.variable === variableName),
        false,
        `${serviceName} should not model ${variableName}`,
      );
    }
  }
});

test("buildAuditReport flags CLIP_WORKER_CONCURRENCY as wrong scope on api-gateway and content-job-retry-worker", () => {
  const production = cloneEnvironment(loadEnvironment("production"));
  production.serviceVariables["api-gateway"].CLIP_WORKER_CONCURRENCY = "3";
  production.serviceVariables[
    "content-job-retry-worker"
  ].CLIP_WORKER_CONCURRENCY = "4";

  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production,
    },
    validateHealthPayload,
    whitelist,
  });

  for (const serviceName of ["api-gateway", "content-job-retry-worker"]) {
    const serviceRows =
      report.environments.production.services[serviceName].variables;
    const concurrencyRow = serviceRows.find(
      (row) => row.variable === "CLIP_WORKER_CONCURRENCY",
    );

    assert.ok(concurrencyRow, `${serviceName} should include the extra row`);
    assert.equal(concurrencyRow.status, "\u274c");
    assert.match(concurrencyRow.summary, /belongs to clip-worker/);
    assert.ok(
      report.environments.production.prioritizedFixes.some(
        (finding) =>
          finding.service === serviceName &&
          finding.variable === "CLIP_WORKER_CONCURRENCY" &&
          finding.flag === "WRONG_SERVICE" &&
          finding.priority === "HIGH",
      ),
    );
  }
});

test("buildAuditReport keeps secret values redacted from the report payload", () => {
  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production: loadEnvironment("production"),
      staging: loadEnvironment("staging"),
    },
    validateHealthPayload,
    whitelist,
  });

  const serializedReport = JSON.stringify(report);

  assert.doesNotMatch(serializedReport, /shared-service-role-key/);
  assert.doesNotMatch(serializedReport, /password@/);
  assert.doesNotMatch(serializedReport, /APP_ENCRYPTION_KEY=.*replace-with/);
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

test("buildAuditReport accepts release-gate-runner commit provenance stamp", () => {
  const production = cloneEnvironment(loadEnvironment("production"));
  production.serviceVariables["release-gate-runner"] = {
    ...production.serviceVariables["release-gate-runner"],
    STREAMOS_RC_COMMIT_SHA: "8d5bea297833579ef2782c3878d6fe39ad497fcc",
  };

  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production,
    },
    validateHealthPayload,
    whitelist,
  });

  const runnerRows =
    report.environments.production.services["release-gate-runner"].variables;
  const commitRow = runnerRows.find(
    (row) => row.variable === "STREAMOS_RC_COMMIT_SHA",
  );

  assert.ok(commitRow);
  assert.equal(commitRow.status, "✅");
  assert.match(commitRow.summary, /configured via service/);
});

test("buildAuditReport accepts release-gate-runner proof-only Supabase env", () => {
  const production = cloneEnvironment(loadEnvironment("production"));
  production.serviceVariables["release-gate-runner"] = {
    ...production.serviceVariables["release-gate-runner"],
    TRANSCRIPTION_E2E_FIXTURE_ASSET_URL:
      "https://fixtures.example.test/transcription-fixture.mp4",
  };

  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production,
    },
    validateHealthPayload,
    whitelist,
  });

  const runnerRows =
    report.environments.production.services["release-gate-runner"].variables;

  for (const variableName of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_URL",
    "TRANSCRIPTION_E2E_FIXTURE_ASSET_URL",
  ]) {
    const row = runnerRows.find((entry) => entry.variable === variableName);

    assert.ok(row, `release-gate-runner should model ${variableName}`);
    assert.equal(row.status, CHECK);
    assert.equal(
      row.findings.some((finding) =>
        ["WRONG_SERVICE", "DANGEROUS_EXPOSURE"].includes(finding.flag),
      ),
      false,
    );
    assert.match(row.summary, /configured via (service|shared)/);
  }

  const runnerSupabaseBlockingFindings = runnerRows
    .filter((entry) =>
      ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL"].includes(entry.variable),
    )
    .flatMap((entry) => entry.findings)
    .filter((finding) => ["CRITICAL", "HIGH"].includes(finding.priority));

  assert.deepEqual(runnerSupabaseBlockingFindings, []);
});

test("buildAuditReport rejects gateway-owned webhook secret on release-gate-runner", () => {
  const production = cloneEnvironment(loadEnvironment("production"));
  production.serviceVariables["release-gate-runner"] = {
    ...production.serviceVariables["release-gate-runner"],
    STREAM_EVENT_WEBHOOK_SECRET: "production-webhook-secret",
  };

  const report = buildAuditReport({
    project: whitelist.project,
    rawEnvironments: {
      production,
    },
    validateHealthPayload,
    whitelist,
  });

  const webhookRow = report.environments.production.services[
    "release-gate-runner"
  ].variables.find((row) => row.variable === "STREAM_EVENT_WEBHOOK_SECRET");

  assert.ok(webhookRow);
  assert.equal(webhookRow.status, CROSS);
  assert.match(webhookRow.summary, /belongs to api-gateway/);
  assert.ok(
    webhookRow.findings.some(
      (finding) =>
        finding.flag === "DANGEROUS_EXPOSURE" &&
        finding.priority === "CRITICAL",
    ),
  );
  assert.equal(hasBlockingFindings(report), true);
});

test("buildAuditReport keeps api-gateway Twitch client env as critical production requirements", () => {
  const production = cloneEnvironment(loadEnvironment("production"));
  delete production.serviceVariables["api-gateway"].TWITCH_CLIENT_ID;
  delete production.serviceVariables["api-gateway"].TWITCH_CLIENT_SECRET;

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

  for (const variableName of ["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET"]) {
    const row = apiGatewayRows.find((entry) => entry.variable === variableName);

    assert.ok(row, `api-gateway should model ${variableName}`);
    assert.equal(row.status, CROSS);
    assert.match(row.summary, /Required variable is not set/);
    assert.ok(
      row.findings.some(
        (finding) =>
          finding.flag === "MISSING" && finding.priority === "CRITICAL",
      ),
    );
  }
});
