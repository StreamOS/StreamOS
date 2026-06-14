#!/usr/bin/env node

const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const os = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const whitelist = require("./config/railway-env-whitelist.cjs");
const {
  buildAuditReport,
  formatMarkdownReport,
  hasBlockingFindings,
  parseServiceListPayload,
  parseVariablePayload,
} = require("./lib/railway-audit-core.cjs");
const {
  requestHealth,
  validateHealthPayload,
} = require("./check-deployment.cjs");

const DEFAULT_TIMEOUT_MS = 5_000;
const NODE_SERVICE_HEALTH_SCRIPT = `
let target = process.argv[1];
(async () => {
  try {
    if (!target) {
      if (!process.env.AUTOMATION_SERVICE_URL) {
        throw new Error("AUTOMATION_SERVICE_URL is not set in the remote service environment.");
      }

      target = new URL("/health", process.env.AUTOMATION_SERVICE_URL).toString();
    }

    const response = await fetch(target);
    const body = await response.text();
    process.stdout.write(JSON.stringify({
      body,
      ok: response.ok,
      status: response.status,
      target,
    }));
  } catch (error) {
    process.stdout.write(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      ok: false,
      target,
    }));
  }
})();
`;

const PYTHON_SERVICE_HEALTH_SCRIPT = `
import json
import sys
from urllib import request, error

target = sys.argv[1]
try:
    with request.urlopen(target, timeout=5) as response:
        body = response.read().decode("utf-8")
        print(json.dumps({
            "body": body,
            "ok": 200 <= response.status < 300,
            "status": response.status,
            "target": target,
        }))
except error.HTTPError as exc:
    print(json.dumps({
        "body": exc.read().decode("utf-8"),
        "ok": False,
        "status": exc.code,
        "target": target,
    }))
except Exception as exc:
    print(json.dumps({
        "error": str(exc),
        "ok": False,
        "target": target,
    }))
`;

const REDIS_TCP_CHECK_SCRIPT = `
const { URL } = require("node:url");
const net = require("node:net");

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  process.stdout.write(JSON.stringify({
    error: "REDIS_URL is not set in the remote service environment.",
    ok: false,
  }));
  process.exit(0);
}

let parsedUrl;

try {
  parsedUrl = new URL(redisUrl);
} catch (error) {
  process.stdout.write(JSON.stringify({
    error: "REDIS_URL is not a valid absolute URL.",
    ok: false,
  }));
  process.exit(0);
}

const socket = net.connect({
  host: parsedUrl.hostname,
  port: Number(parsedUrl.port || 6379),
});

socket.setTimeout(5000);

socket.on("connect", () => {
  process.stdout.write(JSON.stringify({
    ok: true,
    target: \`\${parsedUrl.protocol}//\${parsedUrl.host}\`,
  }));
  socket.destroy();
});

socket.on("timeout", () => {
  process.stdout.write(JSON.stringify({
    error: "Redis TCP connection timed out.",
    ok: false,
    target: \`\${parsedUrl.protocol}//\${parsedUrl.host}\`,
  }));
  socket.destroy();
});

socket.on("error", (error) => {
  process.stdout.write(JSON.stringify({
    error: error.message,
    ok: false,
    target: \`\${parsedUrl.protocol}//\${parsedUrl.host}\`,
  }));
});
`;

function parseArgs(argv) {
  const options = {
    defaultProjectId: whitelist.project.id,
    environments: [...whitelist.environments],
    format: "both",
    help: false,
    projectId: undefined,
    projectName: whitelist.project.name,
    strict: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--environments=")) {
      options.environments = arg
        .slice("--environments=".length)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--fixtures-dir=")) {
      options.fixturesDir = resolve(arg.slice("--fixtures-dir=".length).trim());
    } else if (arg.startsWith("--format=")) {
      options.format = arg.slice("--format=".length).trim();
    } else if (arg.startsWith("--project-id=")) {
      options.projectId = arg.slice("--project-id=".length).trim();
    } else if (arg.startsWith("--project-name=")) {
      options.projectName = arg.slice("--project-name=".length).trim();
    } else if (arg.startsWith("--railway-bin=")) {
      options.railwayBin = arg.slice("--railway-bin=".length).trim();
    } else if (arg === "--strict") {
      options.strict = true;
    } else if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = Number(arg.slice("--timeout-ms=".length).trim());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!["json", "markdown", "both"].includes(options.format)) {
    throw new Error("--format must be one of: json, markdown, both.");
  }

  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 500) {
    throw new Error("--timeout-ms must be an integer >= 500.");
  }

  if (options.environments.length === 0) {
    throw new Error("At least one environment is required.");
  }

  return options;
}

function printHelp() {
  console.log(`StreamOS Railway environment audit

Usage:
  pnpm railway:audit
  pnpm railway:audit -- --strict --railway-bin=/path/to/railway
  pnpm railway:audit -- --fixtures-dir=scripts/__fixtures__/railway-audit --format=json

Options:
  --environments=CSV     Override environments. Default: ${whitelist.environments.join(", ")}.
  --fixtures-dir=PATH    Read staged JSON fixtures instead of calling Railway.
  --format=MODE          markdown, json, or both. Default: both.
  --project-id=ID        Railway project ID. Default: ${whitelist.project.id}.
  --project-name=NAME    Railway project name for the report header.
  --railway-bin=PATH     Railway CLI binary. Defaults to railway in PATH.
  --strict               Exit non-zero when any finding or failed health check exists.
  --timeout-ms=N         Public health-check timeout in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}.
`);
}

function runCommand(command, args, { allowFailure = false, cwd } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.error) {
    if (allowFailure) {
      return {
        ...result,
        stderr: result.error.message,
        stdout: result.stdout ?? "",
      };
    }

    throw result.error;
  }

  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}: ${
        result.stderr?.trim() || result.stdout?.trim() || "no output"
      }`,
    );
  }

  return result;
}

function parseJsonOutput(output, description) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`${description} did not return valid JSON.`, {
      cause: error,
    });
  }
}

function runRailwayJsonCommand(railwayBin, args, description, options = {}) {
  const result = runCommand(railwayBin, [...args, "--json"], options);
  return parseJsonOutput(result.stdout, description);
}

function ensureRailwayCli(railwayBin) {
  try {
    runCommand(railwayBin, ["--version"]);
  } catch (error) {
    throw new Error(
      `Railway CLI was not found or failed to start. Pass --railway-bin with the full binary path. ${error.message}`,
    );
  }
}

function resolveProjectId(options, railwayBin) {
  if (options.projectId) {
    return {
      id: options.projectId,
      name: options.projectName,
    };
  }

  if (options.projectName === whitelist.project.name) {
    return {
      id: options.defaultProjectId,
      name: options.projectName,
    };
  }

  const projects = runRailwayJsonCommand(
    railwayBin,
    ["project", "list"],
    "railway project list",
  );

  const matchingProject = projects.find(
    (project) => project.name === options.projectName,
  );

  if (!matchingProject) {
    throw new Error(
      `Railway project ${options.projectName} was not found. Pass --project-id explicitly.`,
    );
  }

  return {
    id: matchingProject.id,
    name: matchingProject.name,
  };
}

function loadRailwayEnvironmentConfig({ environment, projectId, railwayBin }) {
  const tempDirectory = mkdtempSync(
    join(os.tmpdir(), "streamos-railway-audit-"),
  );

  try {
    runCommand(railwayBin, ["link", "-p", projectId, "-e", environment], {
      cwd: tempDirectory,
    });

    return runRailwayJsonCommand(
      railwayBin,
      ["environment", "config", "-e", environment],
      `railway environment config (${environment})`,
      { cwd: tempDirectory },
    );
  } finally {
    rmSync(tempDirectory, { force: true, recursive: true });
  }
}

function loadFixtureJson(...segments) {
  return parseJsonOutput(
    readFileSync(join(...segments), "utf8"),
    segments[segments.length - 1],
  );
}

function loadFixtureEnvironment(fixturesDir, environment) {
  const environmentDir = join(fixturesDir, environment);
  const serviceVariables = {};

  for (const serviceName of Object.keys(whitelist.services)) {
    const serviceFixturePath = join(
      environmentDir,
      "services",
      `${serviceName}.variables.json`,
    );

    try {
      serviceVariables[serviceName] = loadFixtureJson(serviceFixturePath);
    } catch {
      serviceVariables[serviceName] = {};
    }
  }

  let healthChecks = [];

  try {
    healthChecks = loadFixtureJson(environmentDir, "health.json");
  } catch {
    healthChecks = [];
  }

  return {
    environmentConfig: loadFixtureJson(
      environmentDir,
      "environment-config.json",
    ),
    healthChecks,
    serviceList: loadFixtureJson(environmentDir, "service-list.json"),
    serviceVariables,
    sharedVariables: loadFixtureJson(environmentDir, "shared-variables.json"),
  };
}

function getServicePublicUrl(serviceList, serviceName) {
  const services = parseServiceListPayload(serviceList);
  const service = services.find((entry) => entry.name === serviceName);
  return service?.url ?? null;
}

async function runPublicHealthCheck({
  environment,
  expectedService,
  name,
  service,
  target,
  timeoutMs,
}) {
  const endpoint = new URL("/health", target);

  try {
    const result = await requestHealth({
      timeoutMs,
      url: endpoint,
    });

    return {
      bodyText: result.text,
      category: "health",
      expectedService,
      httpStatus: result.status,
      method: "public-fetch",
      name,
      ok: result.ok,
      service,
      target: endpoint.toString(),
    };
  } catch (error) {
    return {
      category: "health",
      environment,
      expectedService,
      message: error.message,
      method: "public-fetch",
      name,
      ok: false,
      service,
      target: endpoint.toString(),
    };
  }
}

function runRailwaySsh(railwayBin, args) {
  return runCommand(railwayBin, ["ssh", ...args]);
}

function runNodeServiceHealthCheck({
  environment,
  expectedService,
  projectId,
  railwayBin,
  service,
  target,
}) {
  const result = runRailwaySsh(railwayBin, [
    "-p",
    projectId,
    "-e",
    environment,
    "-s",
    service,
    "node",
    "-e",
    NODE_SERVICE_HEALTH_SCRIPT,
    target,
  ]);
  const payload = parseJsonOutput(
    result.stdout,
    `${service} remote health payload`,
  );

  return {
    bodyText: payload.body,
    category: "health",
    expectedService,
    httpStatus: payload.status,
    message: payload.error,
    method: "railway-ssh-node",
    name: `${service}-local-health`,
    ok: payload.ok === true,
    service,
    target: payload.target ?? target,
  };
}

function runPythonServiceHealthCheck({
  environment,
  expectedService,
  projectId,
  railwayBin,
  service,
  target,
}) {
  const result = runRailwaySsh(railwayBin, [
    "-p",
    projectId,
    "-e",
    environment,
    "-s",
    service,
    "python",
    "-c",
    PYTHON_SERVICE_HEALTH_SCRIPT,
    target,
  ]);
  const payload = parseJsonOutput(
    result.stdout,
    `${service} remote health payload`,
  );

  return {
    bodyText: payload.body,
    category: "health",
    expectedService,
    httpStatus: payload.status,
    message: payload.error,
    method: "railway-ssh-python",
    name: `${service}-local-health`,
    ok: payload.ok === true,
    service,
    target: payload.target ?? target,
  };
}

function runWorkerAutomationHealthCheck({
  environment,
  projectId,
  railwayBin,
  service,
}) {
  const result = runRailwaySsh(railwayBin, [
    "-p",
    projectId,
    "-e",
    environment,
    "-s",
    service,
    "node",
    "-e",
    NODE_SERVICE_HEALTH_SCRIPT,
  ]);
  const payload = parseJsonOutput(
    result.stdout,
    `${service} worker-path health payload`,
  );

  return {
    bodyText: payload.body,
    category: "health",
    expectedService: "automation-service",
    httpStatus: payload.status,
    message: payload.error,
    method: "railway-ssh-worker-path",
    name: `${service}-automation-path`,
    ok: payload.ok === true,
    service,
    target: payload.target,
  };
}

function runRedisReachabilityCheck({
  environment,
  projectId,
  railwayBin,
  service,
}) {
  const result = runRailwaySsh(railwayBin, [
    "-p",
    projectId,
    "-e",
    environment,
    "-s",
    service,
    "node",
    "-e",
    REDIS_TCP_CHECK_SCRIPT,
  ]);
  const payload = parseJsonOutput(
    result.stdout,
    `${service} redis TCP payload`,
  );

  return {
    category: "redis",
    message: payload.error,
    method: "railway-ssh-node",
    name: `${service}-redis`,
    ok: payload.ok === true,
    service,
    target: payload.target ?? "REDIS_URL",
  };
}

async function runLiveHealthChecks({
  environment,
  projectId,
  railwayBin,
  rawEnvironment,
  timeoutMs,
}) {
  const checks = [];
  const apiGatewayPublicUrl = getServicePublicUrl(
    rawEnvironment.serviceList,
    "api-gateway",
  );

  if (apiGatewayPublicUrl) {
    checks.push(
      await runPublicHealthCheck({
        environment,
        expectedService: "api-gateway",
        name: "api-gateway-public-health",
        service: "api-gateway",
        target: apiGatewayPublicUrl,
        timeoutMs,
      }),
    );
  }

  checks.push(
    runNodeServiceHealthCheck({
      environment,
      expectedService: "api-gateway",
      projectId,
      railwayBin,
      service: "api-gateway",
      target: "http://127.0.0.1:4000/health",
    }),
  );
  checks.push(
    runPythonServiceHealthCheck({
      environment,
      expectedService: "automation-service",
      projectId,
      railwayBin,
      service: "automation-service",
      target: "http://127.0.0.1:8000/health",
    }),
  );
  checks.push(
    runWorkerAutomationHealthCheck({
      environment,
      projectId,
      railwayBin,
      service: "transcription-worker",
    }),
  );
  checks.push(
    runRedisReachabilityCheck({
      environment,
      projectId,
      railwayBin,
      service: "api-gateway",
    }),
  );

  return checks;
}

function loadLiveEnvironment({ environment, projectId, railwayBin }) {
  const sharedVariables = runRailwayJsonCommand(
    railwayBin,
    ["variable", "list", "-p", projectId, "-e", environment],
    `railway variable list (${environment}, shared)`,
  );
  const serviceList = runRailwayJsonCommand(
    railwayBin,
    ["service", "list", "-p", projectId, "-e", environment],
    `railway service list (${environment})`,
  );
  const serviceVariables = {};

  for (const serviceName of Object.keys(whitelist.services)) {
    serviceVariables[serviceName] = runRailwayJsonCommand(
      railwayBin,
      [
        "variable",
        "list",
        "-p",
        projectId,
        "-e",
        environment,
        "-s",
        serviceName,
      ],
      `railway variable list (${environment}, ${serviceName})`,
    );
  }

  return {
    environmentConfig: loadRailwayEnvironmentConfig({
      environment,
      projectId,
      railwayBin,
    }),
    serviceList,
    serviceVariables,
    sharedVariables,
  };
}

async function loadEnvironmentState({
  environment,
  fixturesDir,
  projectId,
  railwayBin,
  timeoutMs,
}) {
  if (fixturesDir) {
    return loadFixtureEnvironment(fixturesDir, environment);
  }

  const rawEnvironment = loadLiveEnvironment({
    environment,
    projectId,
    railwayBin,
  });

  rawEnvironment.healthChecks = await runLiveHealthChecks({
    environment,
    projectId,
    railwayBin,
    rawEnvironment,
    timeoutMs,
  });

  return rawEnvironment;
}

function renderOutput(format, report) {
  const markdown = formatMarkdownReport(report);
  const json = JSON.stringify(report, null, 2);

  if (format === "markdown") {
    return markdown;
  }

  if (format === "json") {
    return json;
  }

  return `${markdown}\n--- JSON REPORT ---\n${json}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (!options.fixturesDir) {
    ensureRailwayCli(options.railwayBin || "railway");
  }

  const railwayBin = options.railwayBin || "railway";
  const project = options.fixturesDir
    ? {
        id: options.projectId ?? options.defaultProjectId,
        name: options.projectName,
      }
    : resolveProjectId(options, railwayBin);
  const rawEnvironments = {};

  for (const environment of options.environments) {
    rawEnvironments[environment] = await loadEnvironmentState({
      environment,
      fixturesDir: options.fixturesDir,
      projectId: project.id,
      railwayBin,
      timeoutMs: options.timeoutMs,
    });
  }

  const report = buildAuditReport({
    project,
    rawEnvironments,
    validateHealthPayload,
    whitelist,
  });

  process.stdout.write(renderOutput(options.format, report));

  if (options.strict && hasBlockingFindings(report)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Railway environment audit failed: ${error.message}`);
  process.exit(1);
});
