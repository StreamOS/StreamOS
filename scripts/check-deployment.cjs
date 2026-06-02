#!/usr/bin/env node

const { existsSync, readFileSync } = require("node:fs");
const { isIP } = require("node:net");

const DEFAULT_TIMEOUT_MS = 5_000;
const FORBIDDEN_CLIENT_AI_ENV_NAMES = [
  "NEXT_PUBLIC_OPENAI_KEY",
  "NEXT_PUBLIC_OPENAI_API_KEY",
];

function parseArgs(argv) {
  const options = {
    envFile: undefined,
    expectPrivateAutomation: false,
    help: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (const arg of argv) {
    if (arg === "--expect-private-automation") {
      options.expectPrivateAutomation = true;
    } else if (arg.startsWith("--api-gateway-url=")) {
      options.apiGatewayUrl = arg.slice("--api-gateway-url=".length).trim();
    } else if (arg.startsWith("--automation-service-url=")) {
      options.automationServiceUrl = arg
        .slice("--automation-service-url=".length)
        .trim();
    } else if (arg.startsWith("--env-file=")) {
      options.envFile = arg.slice("--env-file=".length).trim();
    } else if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 500) {
    throw new Error("--timeout-ms must be an integer >= 500.");
  }

  return options;
}

function printHelp() {
  console.log(`StreamOS deployment checks

Usage:
  pnpm deployment:check -- --api-gateway-url=https://api.example.com --automation-service-url=http://automation.railway.internal:8000 --expect-private-automation
  pnpm deployment:check -- --env-file=.env.test

Options:
  --api-gateway-url=URL          API Gateway base URL. Falls back to API_GATEWAY_URL.
  --automation-service-url=URL   Automation Service base URL. Falls back to AUTOMATION_SERVICE_URL.
  --env-file=PATH                Load key=value pairs before reading process.env.
  --expect-private-automation    Fail if AUTOMATION_SERVICE_URL is public-facing.
  --timeout-ms=N                 Per-request timeout. Default: ${DEFAULT_TIMEOUT_MS}.
`);
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

function requireUrl(env, name, override) {
  const value = override || env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for deployment checks.`);
  }

  try {
    return new URL(value);
  } catch (error) {
    throw new Error(`${name} must be a valid absolute URL.`, { cause: error });
  }
}

function isPrivateIp(hostname) {
  if (isIP(hostname) === 0) {
    return false;
  }

  if (hostname === "::1" || hostname === "127.0.0.1") {
    return true;
  }

  const octets = hostname.split(".").map(Number);

  if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet))) {
    return false;
  }

  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function isPrivateAutomationUrl(url) {
  const hostname = url.hostname.toLowerCase();

  return (
    hostname === "localhost" ||
    hostname === "automation-service" ||
    hostname.endsWith(".railway.internal") ||
    hostname.endsWith(".internal") ||
    isPrivateIp(hostname)
  );
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
      throw new Error(`${endpoint} returned HTTP ${response.status}: ${text}`);
    }

    if (payload?.service !== expectedService || payload?.status !== "ok") {
      throw new Error(
        `${endpoint} returned unexpected health payload: ${text}`,
      );
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function assertNoClientAiSecrets(env) {
  const leakedNames = FORBIDDEN_CLIENT_AI_ENV_NAMES.filter((name) =>
    env[name]?.trim(),
  );

  if (leakedNames.length > 0) {
    throw new Error(
      `Remove public OpenAI env var(s): ${leakedNames.join(", ")}.`,
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const env = {
    ...loadEnvFile(options.envFile),
    ...process.env,
  };

  assertNoClientAiSecrets(env);

  const apiGatewayUrl = requireUrl(
    env,
    "API_GATEWAY_URL",
    options.apiGatewayUrl,
  );
  const automationServiceUrl = requireUrl(
    env,
    "AUTOMATION_SERVICE_URL",
    options.automationServiceUrl,
  );

  if (
    options.expectPrivateAutomation &&
    !isPrivateAutomationUrl(automationServiceUrl)
  ) {
    throw new Error(
      `AUTOMATION_SERVICE_URL must use private networking, got ${automationServiceUrl.hostname}.`,
    );
  }

  await fetchHealth({
    expectedService: "api-gateway",
    timeoutMs: options.timeoutMs,
    url: apiGatewayUrl,
  });
  console.log(`api-gateway health ok: ${new URL("/health", apiGatewayUrl)}`);

  await fetchHealth({
    expectedService: "automation-service",
    timeoutMs: options.timeoutMs,
    url: automationServiceUrl,
  });
  console.log(
    `automation-service health ok: ${new URL("/health", automationServiceUrl)}`,
  );

  if (options.expectPrivateAutomation) {
    console.log(
      `automation-service private endpoint ok: ${automationServiceUrl.hostname}`,
    );
  }
}

main().catch((error) => {
  console.error(`Deployment check failed: ${error.message}`);
  process.exit(1);
});
