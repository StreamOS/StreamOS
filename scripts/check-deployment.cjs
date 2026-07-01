#!/usr/bin/env node

const { existsSync, readFileSync } = require("node:fs");

const { isPrivateAutomationUrl } = require("./lib/private-automation-url.cjs");
const { consumeValueFlag } = require("./lib/cli-args.cjs");
const {
  findForbiddenOpenAIEnvNames,
  formatForbiddenOpenAIEnvError,
} = require("./config/vercel-env-policy.cjs");

const DEFAULT_TIMEOUT_MS = 5_000;
const SAFE_RUNTIME_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/i;

function parseArgs(argv) {
  const options = {
    envFile: undefined,
    expectPrivateAutomation: false,
    help: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--expect-private-automation") {
      options.expectPrivateAutomation = true;
      continue;
    }

    if (arg === "--require-api-gateway-provenance") {
      options.requireApiGatewayProvenance = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--") {
      continue;
    }

    const apiGatewayUrlMatch = consumeValueFlag(argv, index, "api-gateway-url");

    if (apiGatewayUrlMatch.matched) {
      options.apiGatewayUrl = apiGatewayUrlMatch.value.trim();
      index = apiGatewayUrlMatch.nextIndex;
      continue;
    }

    const expectedApiGatewayCommitMatch = consumeValueFlag(
      argv,
      index,
      "expected-api-gateway-commit",
    );

    if (expectedApiGatewayCommitMatch.matched) {
      options.expectedApiGatewayCommit =
        expectedApiGatewayCommitMatch.value.trim();
      index = expectedApiGatewayCommitMatch.nextIndex;
      continue;
    }

    const expectedEnvironmentMatch = consumeValueFlag(
      argv,
      index,
      "expected-environment",
    );

    if (expectedEnvironmentMatch.matched) {
      options.expectedEnvironment = expectedEnvironmentMatch.value.trim();
      index = expectedEnvironmentMatch.nextIndex;
      continue;
    }

    const automationServiceUrlMatch = consumeValueFlag(
      argv,
      index,
      "automation-service-url",
    );

    if (automationServiceUrlMatch.matched) {
      options.automationServiceUrl = automationServiceUrlMatch.value.trim();
      index = automationServiceUrlMatch.nextIndex;
      continue;
    }

    const envFileMatch = consumeValueFlag(argv, index, "env-file");

    if (envFileMatch.matched) {
      options.envFile = envFileMatch.value.trim();
      index = envFileMatch.nextIndex;
      continue;
    }

    const timeoutMatch = consumeValueFlag(argv, index, "timeout-ms");

    if (timeoutMatch.matched) {
      options.timeoutMs = Number(timeoutMatch.value.trim());
      index = timeoutMatch.nextIndex;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 500) {
    throw new Error("--timeout-ms must be an integer >= 500.");
  }

  return options;
}

function printHelp() {
  console.log(`StreamOS deployment checks

Usage:
  pnpm deployment:check -- --api-gateway-url https://api.example.com --automation-service-url http://automation.railway.internal:8000 --expect-private-automation
  pnpm deployment:check -- --env-file .env.test

Options:
  --api-gateway-url URL          API Gateway base URL. Falls back to API_GATEWAY_URL.
  --automation-service-url URL   Automation Service base URL. Falls back to AUTOMATION_SERVICE_URL.
  --env-file PATH                Load key=value pairs before reading process.env.
  --expected-api-gateway-commit SHA
                                 Expected non-secret api-gateway runtime commit marker.
  --expected-environment NAME    Expected non-secret Railway environment marker.
  --expect-private-automation    Fail if AUTOMATION_SERVICE_URL is public-facing.
  --require-api-gateway-provenance
                                 Fail if public api-gateway /health lacks runtime provenance.
  --timeout-ms N                 Per-request timeout. Default: ${DEFAULT_TIMEOUT_MS}.
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

function validateHealthPayload({ endpoint, expectedService, text }) {
  let payload;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`${endpoint} returned invalid JSON: ${text}`, {
      cause: error,
    });
  }

  if (payload?.service !== expectedService || payload?.status !== "ok") {
    throw new Error(`${endpoint} returned unexpected health payload: ${text}`);
  }

  return payload;
}

function normalizeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([key, value]) => [
      key.toLowerCase(),
      String(value),
    ]),
  );
}

async function requestHealth({ timeoutMs, url, fetchFn = fetch }) {
  const endpoint = new URL("/health", url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(endpoint, { signal: controller.signal });
    const text = await response.text();

    return {
      endpoint,
      headers: Object.fromEntries(response.headers.entries()),
      ok: response.ok,
      status: response.status,
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHealthDetails({
  expectedService,
  fetchFn = fetch,
  timeoutMs,
  url,
}) {
  const result = await requestHealth({ fetchFn, timeoutMs, url });

  if (!result.ok) {
    throw new Error(
      `${result.endpoint} returned HTTP ${result.status}: ${result.text}`,
    );
  }

  return {
    ...result,
    headers: normalizeHeaders(result.headers),
    payload: validateHealthPayload({
      endpoint: result.endpoint,
      expectedService,
      text: result.text,
    }),
  };
}

async function fetchHealth({ expectedService, timeoutMs, url }) {
  const result = await fetchHealthDetails({ expectedService, timeoutMs, url });
  return result.payload;
}

function assertApiGatewayRuntimeProvenance(
  headers,
  { expectedCommit, expectedEnvironment } = {},
) {
  const normalizedHeaders = normalizeHeaders(headers);
  const service = normalizedHeaders["x-streamos-runtime-service"]?.trim() || "";
  const gitCommit =
    normalizedHeaders["x-streamos-runtime-commit"]?.trim() || "";
  const environment =
    normalizedHeaders["x-streamos-runtime-environment"]?.trim() || "";

  if (!service && !gitCommit && !environment) {
    throw new Error(
      "api-gateway runtime provenance is missing from /health response headers.",
    );
  }

  if (service !== "api-gateway") {
    throw new Error(
      `api-gateway runtime provenance reported unexpected service ${service || "<missing>"}.`,
    );
  }

  if (!/^[0-9a-f]{7,40}$/i.test(gitCommit)) {
    throw new Error(
      "api-gateway runtime provenance is missing a valid git commit hash.",
    );
  }

  if (!SAFE_RUNTIME_LABEL_PATTERN.test(environment)) {
    throw new Error(
      "api-gateway runtime provenance is missing a safe Railway environment marker.",
    );
  }

  if (expectedCommit && gitCommit !== expectedCommit) {
    throw new Error(
      `api-gateway runtime provenance commit ${gitCommit} does not match expected release candidate ${expectedCommit}.`,
    );
  }

  if (expectedEnvironment && environment !== expectedEnvironment) {
    throw new Error(
      `api-gateway runtime provenance environment ${environment} does not match expected environment ${expectedEnvironment}.`,
    );
  }

  return {
    environment,
    gitCommit,
    service,
  };
}

function resolveApiGatewayRuntimeProvenanceExpectation(env, options = {}) {
  const expectedCommit =
    options.expectedApiGatewayCommit?.trim() ||
    env.STREAMOS_RC_COMMIT_SHA?.trim() ||
    "";
  const expectedEnvironment =
    options.expectedEnvironment?.trim() ||
    env.RAILWAY_ENVIRONMENT_NAME?.trim() ||
    env.RAILWAY_ENVIRONMENT?.trim() ||
    "";

  return {
    expectedCommit,
    expectedEnvironment,
    required:
      Boolean(options.requireApiGatewayProvenance) ||
      expectedCommit.length > 0 ||
      expectedEnvironment.length > 0,
  };
}

function assertNoClientAiSecrets(env) {
  const leakedNames = findForbiddenOpenAIEnvNames(env);

  if (leakedNames.length > 0) {
    throw new Error(formatForbiddenOpenAIEnvError(leakedNames));
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

  const apiGatewayHealth = await fetchHealthDetails({
    expectedService: "api-gateway",
    timeoutMs: options.timeoutMs,
    url: apiGatewayUrl,
  });
  const apiGatewayProvenanceExpectation =
    resolveApiGatewayRuntimeProvenanceExpectation(env, options);

  if (apiGatewayProvenanceExpectation.required) {
    const apiGatewayProvenance = assertApiGatewayRuntimeProvenance(
      apiGatewayHealth.headers,
      {
        expectedCommit:
          apiGatewayProvenanceExpectation.expectedCommit || undefined,
        expectedEnvironment:
          apiGatewayProvenanceExpectation.expectedEnvironment || undefined,
      },
    );

    console.log(
      `api-gateway runtime provenance ok: commit ${apiGatewayProvenance.gitCommit.slice(
        0,
        12,
      )}, environment ${apiGatewayProvenance.environment}`,
    );
  }

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

if (require.main === module) {
  main().catch((error) => {
    console.error(`Deployment check failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  assertNoClientAiSecrets,
  assertApiGatewayRuntimeProvenance,
  fetchHealth,
  fetchHealthDetails,
  isPrivateAutomationUrl,
  loadEnvFile,
  normalizeHeaders,
  parseArgs,
  printHelp,
  requestHealth,
  requireUrl,
  resolveApiGatewayRuntimeProvenanceExpectation,
  validateHealthPayload,
};
