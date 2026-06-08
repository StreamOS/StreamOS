#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");

const DEFAULT_API_GATEWAY_URL = "http://localhost:4000";
const DEFAULT_EXPECTED_TRANSCRIPTION_STATUS = "done";
const DEFAULT_LOCAL_SERVICE_TIMEOUT_MS = 1_500;

function parseArgs(argv) {
  const options = {
    allowHostedE2e: false,
    allowMissingLocalServices: false,
    expectPrivateAutomation: false,
    help: false,
    skipDocker: false,
    transcriptionExpect: DEFAULT_EXPECTED_TRANSCRIPTION_STATUS,
  };

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    } else if (arg === "--allow-missing-local-services") {
      options.allowMissingLocalServices = true;
    } else if (arg === "--allow-hosted-e2e") {
      options.allowHostedE2e = true;
    } else if (arg.startsWith("--api-gateway-url=")) {
      options.apiGatewayUrl = arg.slice("--api-gateway-url=".length).trim();
    } else if (arg.startsWith("--automation-service-url=")) {
      options.automationServiceUrl = arg
        .slice("--automation-service-url=".length)
        .trim();
    } else if (arg.startsWith("--docker-bin=")) {
      options.dockerBin = arg.slice("--docker-bin=".length).trim();
    } else if (arg.startsWith("--env-file=")) {
      options.envFile = arg.slice("--env-file=".length).trim();
    } else if (arg.startsWith("--expect=")) {
      options.transcriptionExpect = arg.slice("--expect=".length).trim();
    } else if (arg === "--expect-private-automation") {
      options.expectPrivateAutomation = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--poll-ms=")) {
      options.pollMs = arg.slice("--poll-ms=".length).trim();
    } else if (arg === "--skip-docker") {
      options.skipDocker = true;
    } else if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = arg.slice("--timeout-ms=".length).trim();
    } else if (arg.startsWith("--user-id=")) {
      options.userId = arg.slice("--user-id=".length).trim();
    } else if (arg.startsWith("--wait-ms=")) {
      options.waitMs = arg.slice("--wait-ms=".length).trim();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!["done", "failed"].includes(options.transcriptionExpect)) {
    throw new Error("--expect must be either done or failed.");
  }

  if (options.allowMissingLocalServices && !options.skipDocker) {
    throw new Error("--allow-missing-local-services requires --skip-docker.");
  }

  if (options.allowMissingLocalServices && options.allowHostedE2e) {
    throw new Error(
      "--allow-missing-local-services cannot be combined with --allow-hosted-e2e.",
    );
  }

  return options;
}

function printHelp() {
  console.log(`StreamOS rollout gate

Usage:
  pnpm rollout:check -- --env-file=.env.test
  pnpm rollout:check -- --env-file=.env.test --skip-docker --allow-missing-local-services
  pnpm rollout:check -- --env-file=.env --skip-docker --allow-hosted-e2e --api-gateway-url=https://api.example.com --automation-service-url=http://automation.railway.internal:8000 --expect-private-automation

Required checks:
  1. Supabase migration/RLS/index validator
  2. API Gateway typecheck
  3. API Gateway integration and signed-webhook tests
  4. Transcription E2E: webhook -> BullMQ -> worker -> content_jobs write
  5. Deployment health checks for API Gateway and Automation Service

Options:
  --allow-missing-local-services
                                  With --skip-docker, pass after static checks when local service health endpoints are unavailable.
  --allow-hosted-e2e             Allow transcription E2E writes to a hosted Supabase project.
  --api-gateway-url=URL          API Gateway base URL for deployment checks and E2E trigger.
  --automation-service-url=URL   Automation Service base URL for deployment checks.
  --docker-bin=BIN               Docker-compatible CLI for local E2E runs.
  --env-file=PATH                Env file passed to deployment and E2E checks.
  --expect=done|failed           Expected transcription E2E terminal status. Default: ${DEFAULT_EXPECTED_TRANSCRIPTION_STATUS}.
  --expect-private-automation    Fail if Automation Service URL is public-facing.
  --poll-ms=N                    Transcription E2E polling interval.
  --skip-docker                  Use already running/deployed services for transcription E2E.
  --timeout-ms=N                 Deployment health-check request timeout.
  --user-id=UUID                 Supabase auth user for transcription E2E.
  --wait-ms=N                    Transcription E2E maximum wait time.
`);
}

function run(command, args, label) {
  console.log(`\n==> ${label}`);
  const needsWindowsShell =
    process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command);
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: needsWindowsShell,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}.`);
  }
}

function runPnpm(args, label) {
  const corepackCommand =
    process.platform === "win32" ? "corepack.cmd" : "corepack";
  run(corepackCommand, ["pnpm", ...args], label);
}

function loadEnvFile(path) {
  if (!path || !existsSync(path)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const rawValue = line.slice(index + 1).trim();
        const value = rawValue.replace(/^["']|["']$/g, "");
        return [key, value];
      }),
  );
}

function getMergedEnv(envFile) {
  return {
    ...loadEnvFile(envFile),
    ...process.env,
  };
}

function getTimeoutMs(options) {
  if (!options.timeoutMs) {
    return DEFAULT_LOCAL_SERVICE_TIMEOUT_MS;
  }

  const timeoutMs = Number(options.timeoutMs);

  if (!Number.isInteger(timeoutMs) || timeoutMs < 500) {
    throw new Error("--timeout-ms must be an integer >= 500.");
  }

  return timeoutMs;
}

function parseServiceUrl(name, value) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value);
  } catch (error) {
    throw new Error(`${name} must be a valid absolute URL.`, {
      cause: error,
    });
  }
}

function isLocalServiceUrl(url) {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  return [
    "::1",
    "127.0.0.1",
    "api-gateway",
    "automation-service",
    "host.docker.internal",
    "localhost",
  ].includes(hostname);
}

function resolveServiceTargets(options) {
  const env = getMergedEnv(options.envFile);
  const apiGatewayUrl = parseServiceUrl(
    "API_GATEWAY_URL",
    options.apiGatewayUrl || env.API_GATEWAY_URL || DEFAULT_API_GATEWAY_URL,
  );
  const automationServiceUrl = parseServiceUrl(
    "AUTOMATION_SERVICE_URL",
    options.automationServiceUrl || env.AUTOMATION_SERVICE_URL,
  );

  return [
    {
      expectedService: "api-gateway",
      name: "API Gateway",
      url: apiGatewayUrl,
    },
    {
      expectedService: "automation-service",
      name: "Automation Service",
      url: automationServiceUrl,
    },
  ];
}

async function fetchHealth({ expectedService, timeoutMs, url }) {
  const endpoint = new URL("/health", url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(`${endpoint} returned HTTP ${response.status}.`);
    }

    if (payload?.service !== expectedService || payload?.status !== "ok") {
      throw new Error(`${endpoint} returned an unexpected health payload.`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function getLocalServiceSkip(options) {
  if (!options.allowMissingLocalServices) {
    return null;
  }

  const targets = resolveServiceTargets(options);

  if (targets.some((target) => target.url && !isLocalServiceUrl(target.url))) {
    return null;
  }

  const timeoutMs = getTimeoutMs(options);
  const missing = [];

  for (const target of targets) {
    if (!target.url) {
      missing.push(`${target.name}: no URL configured`);
      continue;
    }

    try {
      await fetchHealth({
        expectedService: target.expectedService,
        timeoutMs,
        url: target.url,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      missing.push(`${target.name}: ${message}`);
    }
  }

  if (missing.length === 0) {
    console.log(
      "\nLocal service preflight passed; continuing service-dependent rollout checks.",
    );
    return null;
  }

  return { missing };
}

function buildDeploymentArgs(options) {
  const args = ["scripts/check-deployment.cjs"];

  if (options.apiGatewayUrl) {
    args.push(`--api-gateway-url=${options.apiGatewayUrl}`);
  }

  if (options.automationServiceUrl) {
    args.push(`--automation-service-url=${options.automationServiceUrl}`);
  }

  if (options.envFile) {
    args.push(`--env-file=${options.envFile}`);
  }

  if (options.expectPrivateAutomation) {
    args.push("--expect-private-automation");
  }

  if (options.timeoutMs) {
    args.push(`--timeout-ms=${options.timeoutMs}`);
  }

  return args;
}

function buildTranscriptionArgs(options) {
  const args = [
    "scripts/e2e-transcription-job.cjs",
    `--expect=${options.transcriptionExpect}`,
  ];

  if (options.allowHostedE2e) {
    args.push("--allow-hosted");
  }

  if (options.apiGatewayUrl) {
    args.push(`--api-gateway-url=${options.apiGatewayUrl}`);
  }

  if (options.dockerBin) {
    args.push(`--docker-bin=${options.dockerBin}`);
  }

  if (options.envFile) {
    args.push(`--env-file=${options.envFile}`);
  }

  if (options.pollMs) {
    args.push(`--poll-ms=${options.pollMs}`);
  }

  if (options.skipDocker) {
    args.push("--skip-docker");
  }

  if (options.userId) {
    args.push(`--user-id=${options.userId}`);
  }

  if (options.waitMs) {
    args.push(`--wait-ms=${options.waitMs}`);
  }

  return args;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  runPnpm(["db:validate-security"], "Supabase migration/RLS/index validation");
  runPnpm(
    ["--filter", "@streamos/api-gateway", "typecheck"],
    "API Gateway typecheck",
  );
  runPnpm(
    ["--filter", "@streamos/api-gateway", "test"],
    "API Gateway integration and signed-webhook tests",
  );

  const localServiceSkip = await getLocalServiceSkip(options);

  if (localServiceSkip) {
    console.warn(
      "\nService-dependent rollout checks skipped because --skip-docker and --allow-missing-local-services were set.",
    );
    for (const item of localServiceSkip.missing) {
      console.warn(`- ${item}`);
    }
    console.warn(
      "Static rollout checks passed. Start the local services or omit --allow-missing-local-services for the full rollout gate.",
    );
    return;
  }

  run(
    process.execPath,
    buildTranscriptionArgs(options),
    "Transcription E2E path",
  );
  run(
    process.execPath,
    buildDeploymentArgs(options),
    "Deployment health checks",
  );

  console.log("\nStreamOS rollout gate passed.");
}

try {
  main().catch((error) => {
    console.error(
      `StreamOS rollout gate failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  });
} catch (error) {
  console.error(
    `StreamOS rollout gate failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}
