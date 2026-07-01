#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const { consumeValueFlag } = require("./lib/cli-args.cjs");
const {
  DEFAULT_TIMEOUT_MS,
  assertApiGatewayRuntimeProvenance,
  fetchHealth,
  fetchHealthDetails,
  isPrivateAutomationUrl,
  loadEnvFile,
  requireUrl,
} = require("./check-deployment.cjs");
const {
  PRODUCTION_GATE_MODE: TRANSCRIPTION_E2E_PRODUCTION_MODE,
  TRANSCRIPTION_E2E_FIXTURE_ENV_NAME,
  resolveFixtureAssetConfig,
} = require("./e2e-transcription-job.cjs");

const DEFAULT_EXPECTED_TRANSCRIPTION_STATUS = "done";
const LOCAL_DIAGNOSTIC_MODE = "local-diagnostic";
const PRODUCTION_GATE_MODE = "production-gate";
const SNAPSHOT_NOT_PROOF_CAPABLE = "snapshot_not_proof_capable";
const RUNNER_PROVENANCE_PATH = "scripts/.release-gate-runner-provenance.json";
const RUNNER_PROVENANCE_SCHEMA_VERSION = 1;
const RELEASE_GATE_RUNNER_SERVICE = "release-gate-runner";
const API_GATEWAY_RUNTIME_WORKSPACE_PACKAGES = [
  {
    name: "@streamos/types",
    path: "packages/types",
  },
  {
    name: "@streamos/redis",
    path: "packages/redis",
  },
  {
    name: "@streamos/queue",
    path: "packages/queue",
  },
  {
    name: "@streamos/utils",
    path: "packages/utils",
  },
  {
    name: "@streamos/youtube-websub",
    path: "packages/youtube-websub",
  },
];
const TRANSCRIPTION_WORKER_RUNTIME_WORKSPACE_PACKAGES = [
  {
    name: "@streamos/types",
    path: "packages/types",
  },
  {
    name: "@streamos/queue",
    path: "packages/queue",
  },
  {
    name: "@streamos/redis",
    path: "packages/redis",
  },
];
const PROOF_SNAPSHOT_REQUIRED_PATHS = [
  "pnpm-workspace.yaml",
  "turbo.json",
  "scripts/rollout-check.cjs",
  "scripts/check-deployment.cjs",
  "scripts/e2e-transcription-job.cjs",
  "scripts/write-production-gate-proof.cjs",
  "scripts/verify-production-gate-proof.cjs",
  "services/api-gateway",
  "workers/stream-job-worker",
  "workers/transcription-worker",
  "packages/database",
  ...new Set([
    ...API_GATEWAY_RUNTIME_WORKSPACE_PACKAGES.map((pkg) => pkg.path),
    ...TRANSCRIPTION_WORKER_RUNTIME_WORKSPACE_PACKAGES.map((pkg) => pkg.path),
  ]),
];
const API_GATEWAY_TEST_LABEL =
  "API Gateway integration and signed-webhook tests";
const API_GATEWAY_BUILD_LABEL = "API Gateway build";
const TRANSCRIPTION_WORKER_TEST_LABEL = "transcription-worker tests";
const TRANSCRIPTION_E2E_LABEL = "Transcription E2E path";

function parseArgs(argv) {
  const options = {
    allowHostedE2e: false,
    expectPrivateAutomation: false,
    help: false,
    mode: LOCAL_DIAGNOSTIC_MODE,
    skipDocker: false,
    transcriptionExpect: DEFAULT_EXPECTED_TRANSCRIPTION_STATUS,
  };

  function consumeTrimmedOption(index, flagName, optionName = flagName) {
    const match = consumeValueFlag(argv, index, flagName);

    if (!match.matched) {
      return false;
    }

    options[optionName] = match.value.trim();
    return match.nextIndex;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--allow-hosted-e2e") {
      options.allowHostedE2e = true;
      continue;
    }

    const modeIndex = consumeTrimmedOption(index, "mode");

    if (modeIndex !== false) {
      index = modeIndex;
      continue;
    }

    const apiGatewayUrlIndex = consumeTrimmedOption(
      index,
      "api-gateway-url",
      "apiGatewayUrl",
    );

    if (apiGatewayUrlIndex !== false) {
      index = apiGatewayUrlIndex;
      continue;
    }

    const automationServiceUrlIndex = consumeTrimmedOption(
      index,
      "automation-service-url",
      "automationServiceUrl",
    );

    if (automationServiceUrlIndex !== false) {
      index = automationServiceUrlIndex;
      continue;
    }

    const dockerBinIndex = consumeTrimmedOption(
      index,
      "docker-bin",
      "dockerBin",
    );

    if (dockerBinIndex !== false) {
      index = dockerBinIndex;
      continue;
    }

    const fixtureAssetUrlIndex = consumeTrimmedOption(
      index,
      "fixture-asset-url",
      "fixtureAssetUrl",
    );

    if (fixtureAssetUrlIndex !== false) {
      index = fixtureAssetUrlIndex;
      continue;
    }

    const envFileIndex = consumeTrimmedOption(index, "env-file", "envFile");

    if (envFileIndex !== false) {
      index = envFileIndex;
      continue;
    }

    const expectIndex = consumeTrimmedOption(
      index,
      "expect",
      "transcriptionExpect",
    );

    if (expectIndex !== false) {
      index = expectIndex;
      continue;
    }

    const expectedRunnerCommitIndex = consumeTrimmedOption(
      index,
      "expected-runner-commit",
      "expectedRunnerCommit",
    );

    if (expectedRunnerCommitIndex !== false) {
      index = expectedRunnerCommitIndex;
      continue;
    }

    if (arg === "--expect-private-automation") {
      options.expectPrivateAutomation = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    const pollMsIndex = consumeTrimmedOption(index, "poll-ms", "pollMs");

    if (pollMsIndex !== false) {
      index = pollMsIndex;
      continue;
    }

    if (arg === "--skip-docker") {
      options.skipDocker = true;
      continue;
    }

    const timeoutMsIndex = consumeTrimmedOption(
      index,
      "timeout-ms",
      "timeoutMs",
    );

    if (timeoutMsIndex !== false) {
      index = timeoutMsIndex;
      continue;
    }

    const userIdIndex = consumeTrimmedOption(index, "user-id", "userId");

    if (userIdIndex !== false) {
      index = userIdIndex;
      continue;
    }

    const waitMsIndex = consumeTrimmedOption(index, "wait-ms", "waitMs");

    if (waitMsIndex !== false) {
      index = waitMsIndex;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!["done", "failed"].includes(options.transcriptionExpect)) {
    throw new Error("--expect must be either done or failed.");
  }

  if (![LOCAL_DIAGNOSTIC_MODE, PRODUCTION_GATE_MODE].includes(options.mode)) {
    throw new Error(
      `--mode must be either ${LOCAL_DIAGNOSTIC_MODE} or ${PRODUCTION_GATE_MODE}.`,
    );
  }

  return options;
}

function printHelp() {
  console.log(`StreamOS rollout gate

Usage:
  pnpm rollout:check:local
  pnpm rollout:check -- --mode local-diagnostic --env-file .env.test
  pnpm rollout:check:production -- --env-file .env --api-gateway-url https://api.example.com --automation-service-url http://automation-service.railway.internal:8000
  pnpm rollout:check -- --mode production-gate --env-file .env --skip-docker --allow-hosted-e2e --api-gateway-url https://api.example.com --automation-service-url http://automation-service.railway.internal:8000 --expect-private-automation

Required checks:
  1. Supabase migration/RLS/index validator
  2. API Gateway typecheck
  3. API Gateway runtime package build: @streamos/types
  4. API Gateway runtime package build: @streamos/redis
  5. API Gateway runtime package build: @streamos/queue
  6. API Gateway runtime package build: @streamos/youtube-websub
  7. API Gateway integration and signed-webhook tests
  8. API Gateway build
  9. Stream-job-worker test and build
  10. transcription-worker runtime package build: @streamos/types
  11. transcription-worker runtime package build: @streamos/queue
  12. transcription-worker runtime package build: @streamos/redis
  13. Transcription-worker test and build
  14. Transcription E2E: hosted media/transcription proof, fail-closed until a proof-safe trigger avoids gateway-owned webhook secrets
  15. Deployment health checks for API Gateway and Automation Service

Production-gate runtime:
  - Must run from the dedicated Railway service release-gate-runner, or an equivalent
    Railway-internal runtime with the same gate-required release-candidate snapshot.
  - Generic helper shells are not valid production-proof runtimes.

Options:
  --allow-hosted-e2e             Allow transcription E2E writes to a hosted Supabase project.
  --api-gateway-url URL          API Gateway base URL for deployment checks and E2E trigger.
  --automation-service-url URL   Automation Service base URL for deployment checks.
  --docker-bin BIN               Docker-compatible CLI for local E2E runs.
  --env-file PATH                Env file passed to deployment and E2E checks.
  --expected-runner-commit SHA   Optional expected release-candidate commit for the proof runner.
  --expect done|failed           Expected transcription E2E terminal status. Default: ${DEFAULT_EXPECTED_TRANSCRIPTION_STATUS}.
  --fixture-asset-url URL        Public HTTPS transcription fixture asset for hosted / production-gate E2E.
  --expect-private-automation    Fail if Automation Service URL is public-facing.
  --mode MODE                    local-diagnostic or production-gate. Default: ${LOCAL_DIAGNOSTIC_MODE}.
  --poll-ms N                    Transcription E2E polling interval.
  --skip-docker                  Use already running/deployed services for transcription E2E.
  --timeout-ms N                 Deployment health-check request timeout.
  --user-id UUID                 Supabase auth user for transcription E2E.
  --wait-ms N                    Transcription E2E maximum wait time.
`);
}

function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

function createContractCheckOptions() {
  return {
    transcriptionExpect: DEFAULT_EXPECTED_TRANSCRIPTION_STATUS,
  };
}

function getRuntimePackageBuildSteps(packages, labelPrefix) {
  return packages.map((pkg) => ({
    args: ["--filter", pkg.name, "build"],
    label: `${labelPrefix}: ${pkg.name}`,
    runner: "pnpm",
  }));
}

function getApiGatewayRuntimePackageBuildSteps() {
  return getRuntimePackageBuildSteps(
    API_GATEWAY_RUNTIME_WORKSPACE_PACKAGES,
    "API Gateway runtime package build",
  );
}

function getTranscriptionWorkerRuntimePackageBuildSteps() {
  return getRuntimePackageBuildSteps(
    TRANSCRIPTION_WORKER_RUNTIME_WORKSPACE_PACKAGES,
    "transcription-worker runtime package build",
  );
}

function getExpectedGateContract() {
  const apiGatewayRuntimePackageSteps = getApiGatewayRuntimePackageBuildSteps();
  const transcriptionWorkerRuntimePackageSteps =
    getTranscriptionWorkerRuntimePackageBuildSteps();
  const contract = {
    apiGatewayBuildLabel: API_GATEWAY_BUILD_LABEL,
    apiGatewayTestLabel: API_GATEWAY_TEST_LABEL,
    apiGatewayRuntimePackages: API_GATEWAY_RUNTIME_WORKSPACE_PACKAGES.map(
      (pkg) => pkg.name,
    ),
    apiGatewayRuntimePackageSteps: apiGatewayRuntimePackageSteps.map(
      (step) => step.label,
    ),
    transcriptionWorkerRuntimePackages:
      TRANSCRIPTION_WORKER_RUNTIME_WORKSPACE_PACKAGES.map((pkg) => pkg.name),
    transcriptionWorkerRuntimePackageSteps:
      transcriptionWorkerRuntimePackageSteps.map((step) => step.label),
    transcriptionWorkerTestLabel: TRANSCRIPTION_WORKER_TEST_LABEL,
    sharedRuntimePackageSteps: [
      ...apiGatewayRuntimePackageSteps.map((step) => step.label),
      ...transcriptionWorkerRuntimePackageSteps.map((step) => step.label),
    ],
    transcriptionE2eLabel: TRANSCRIPTION_E2E_LABEL,
  };

  return {
    ...contract,
    contractHash: hashText(JSON.stringify(contract)),
  };
}

function collectGateContractIssues(
  sequence = getCheckSequence(createContractCheckOptions()),
) {
  const labels = sequence.map((step) => step.label);
  const expectedContract = getExpectedGateContract();
  const issues = [];
  const apiGatewayTestIndex = labels.indexOf(
    expectedContract.apiGatewayTestLabel,
  );
  const apiGatewayBuildIndex = labels.indexOf(
    expectedContract.apiGatewayBuildLabel,
  );
  const transcriptionWorkerTestIndex = labels.indexOf(
    expectedContract.transcriptionWorkerTestLabel,
  );
  const transcriptionE2eIndex = labels.indexOf(
    expectedContract.transcriptionE2eLabel,
  );

  for (const label of expectedContract.apiGatewayRuntimePackageSteps) {
    const index = labels.indexOf(label);

    if (index < 0) {
      issues.push(`missing gate contract step ${label}`);
      continue;
    }

    if (apiGatewayTestIndex >= 0 && index > apiGatewayTestIndex) {
      issues.push(
        `${label} must run before ${expectedContract.apiGatewayTestLabel}`,
      );
    }
  }

  for (const label of expectedContract.transcriptionWorkerRuntimePackageSteps) {
    const index = labels.indexOf(label);

    if (index < 0) {
      issues.push(`missing gate contract step ${label}`);
      continue;
    }

    if (
      transcriptionWorkerTestIndex >= 0 &&
      index > transcriptionWorkerTestIndex
    ) {
      issues.push(
        `${label} must run before ${expectedContract.transcriptionWorkerTestLabel}`,
      );
    }
  }

  if (apiGatewayBuildIndex < 0) {
    issues.push(
      `missing gate contract step ${expectedContract.apiGatewayBuildLabel}`,
    );
  }

  if (transcriptionWorkerTestIndex < 0) {
    issues.push(
      `missing gate contract step ${expectedContract.transcriptionWorkerTestLabel}`,
    );
  }

  if (transcriptionE2eIndex < 0) {
    issues.push(
      `missing gate contract step ${expectedContract.transcriptionE2eLabel}`,
    );
  }

  if (
    apiGatewayBuildIndex >= 0 &&
    transcriptionE2eIndex >= 0 &&
    apiGatewayBuildIndex > transcriptionE2eIndex
  ) {
    issues.push(
      `${expectedContract.apiGatewayBuildLabel} must run before ${expectedContract.transcriptionE2eLabel}`,
    );
  }

  return {
    contract: expectedContract,
    issues,
  };
}

function readRunnerProvenance({
  exists = existsSync,
  readFile = readFileSync,
  repoRoot = resolve(__dirname, ".."),
} = {}) {
  const provenancePath = join(repoRoot, RUNNER_PROVENANCE_PATH);

  if (!exists(provenancePath)) {
    return {
      path: provenancePath,
      provenance: null,
    };
  }

  return {
    path: provenancePath,
    provenance: JSON.parse(readFile(provenancePath, "utf8")),
  };
}

function collectRunnerProvenanceIssues({
  exists = existsSync,
  expectedRunnerCommit,
  mode,
  readFile = readFileSync,
  repoRoot = resolve(__dirname, ".."),
  runtimeEnv = process.env,
} = {}) {
  if (mode !== PRODUCTION_GATE_MODE) {
    return {
      issues: [],
      provenance: null,
    };
  }

  const issues = [];
  let provenanceRecord;
  const expectedContract = getExpectedGateContract();
  const provenancePath = join(repoRoot, RUNNER_PROVENANCE_PATH);

  if (!exists(provenancePath)) {
    issues.push(`missing ${RUNNER_PROVENANCE_PATH}`);
    return {
      issues,
      provenance: null,
    };
  }

  try {
    provenanceRecord = JSON.parse(readFile(provenancePath, "utf8"));
  } catch {
    issues.push(`${RUNNER_PROVENANCE_PATH} is unreadable`);
    return {
      issues,
      provenance: null,
    };
  }

  const runtimeServiceName =
    runtimeEnv.RAILWAY_SERVICE_NAME || runtimeEnv.RAILWAY_SERVICE || "";
  const runtimeEnvironmentName =
    runtimeEnv.RAILWAY_ENVIRONMENT_NAME || runtimeEnv.RAILWAY_ENVIRONMENT || "";

  if (provenanceRecord.schemaVersion !== RUNNER_PROVENANCE_SCHEMA_VERSION) {
    issues.push(
      `${RUNNER_PROVENANCE_PATH} has unsupported schema version ${String(
        provenanceRecord.schemaVersion,
      )}`,
    );
  }

  if (provenanceRecord.runnerService !== RELEASE_GATE_RUNNER_SERVICE) {
    issues.push(
      `${RUNNER_PROVENANCE_PATH} targets ${String(
        provenanceRecord.runnerService,
      )} instead of ${RELEASE_GATE_RUNNER_SERVICE}`,
    );
  }

  if (!/^[0-9a-f]{7,40}$/i.test(provenanceRecord.gitCommit ?? "")) {
    issues.push(`${RUNNER_PROVENANCE_PATH} is missing a valid gitCommit`);
  }

  if (
    expectedRunnerCommit &&
    provenanceRecord.gitCommit &&
    provenanceRecord.gitCommit !== expectedRunnerCommit
  ) {
    issues.push(
      `${RUNNER_PROVENANCE_PATH} gitCommit ${provenanceRecord.gitCommit} does not match expected runner commit ${expectedRunnerCommit}`,
    );
  }

  if (
    runtimeServiceName &&
    provenanceRecord.runnerService &&
    provenanceRecord.runnerService !== runtimeServiceName
  ) {
    issues.push(
      `${RUNNER_PROVENANCE_PATH} runnerService ${provenanceRecord.runnerService} does not match runtime service ${runtimeServiceName}`,
    );
  }

  if (
    runtimeEnvironmentName &&
    provenanceRecord.environment &&
    provenanceRecord.environment !== runtimeEnvironmentName
  ) {
    issues.push(
      `${RUNNER_PROVENANCE_PATH} environment ${provenanceRecord.environment} does not match runtime environment ${runtimeEnvironmentName}`,
    );
  }

  if (
    provenanceRecord.gateContract?.contractHash !==
    expectedContract.contractHash
  ) {
    issues.push(
      `${RUNNER_PROVENANCE_PATH} gate contract hash does not match the expected rollout-check sequence`,
    );
  }

  const rolloutCheckSha256 = hashText(
    readFile(join(repoRoot, "scripts/rollout-check.cjs"), "utf8"),
  );
  const packageJsonSha256 = hashText(
    readFile(join(repoRoot, "package.json"), "utf8"),
  );

  if (provenanceRecord.snapshot?.rolloutCheckSha256 !== rolloutCheckSha256) {
    issues.push(
      `${RUNNER_PROVENANCE_PATH} rollout-check hash does not match the runtime snapshot`,
    );
  }

  if (provenanceRecord.snapshot?.packageJsonSha256 !== packageJsonSha256) {
    issues.push(
      `${RUNNER_PROVENANCE_PATH} package.json hash does not match the runtime snapshot`,
    );
  }

  return {
    issues,
    provenance: provenanceRecord,
  };
}

function collectProofSnapshotIssues({
  exists = existsSync,
  readFile = readFileSync,
  repoRoot = resolve(__dirname, ".."),
} = {}) {
  const issues = [];
  const packageJsonPath = join(repoRoot, "package.json");

  if (!exists(packageJsonPath)) {
    issues.push("missing root package.json");
  } else {
    let packageJson;

    try {
      packageJson = JSON.parse(readFile(packageJsonPath, "utf8"));
    } catch {
      issues.push("root package.json is unreadable");
    }

    if (
      packageJson &&
      typeof packageJson.scripts?.["rollout:check:production"] !== "string"
    ) {
      issues.push("missing package.json script rollout:check:production");
    }
  }

  for (const relativePath of PROOF_SNAPSHOT_REQUIRED_PATHS) {
    if (!exists(join(repoRoot, relativePath))) {
      issues.push(`missing ${relativePath}`);
    }
  }

  return {
    issues,
    repoRoot,
  };
}

function assertProofCapableSnapshot(options = {}) {
  const { issues, repoRoot } = collectProofSnapshotIssues(options);
  const gateContract = collectGateContractIssues();
  const provenance = collectRunnerProvenanceIssues({
    ...options,
    repoRoot,
  });
  const combinedIssues = [
    ...issues,
    ...gateContract.issues,
    ...provenance.issues,
  ];

  if (combinedIssues.length === 0) {
    return {
      contract: gateContract.contract,
      provenance: provenance.provenance,
      repoRoot,
    };
  }

  const error = new Error(
    `${SNAPSHOT_NOT_PROOF_CAPABLE}: ${combinedIssues.join("; ")}`,
  );
  error.code = SNAPSHOT_NOT_PROOF_CAPABLE;
  throw error;
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

function buildDeploymentArgs(options) {
  const args = ["scripts/check-deployment.cjs"];

  if (options.apiGatewayUrl) {
    args.push("--api-gateway-url", options.apiGatewayUrl);
  }

  if (options.automationServiceUrl) {
    args.push("--automation-service-url", options.automationServiceUrl);
  }

  if (options.envFile) {
    args.push("--env-file", options.envFile);
  }

  if (options.expectPrivateAutomation) {
    args.push("--expect-private-automation");
  }

  if (options.mode === PRODUCTION_GATE_MODE) {
    args.push("--require-api-gateway-provenance");

    if (options.expectedRunnerCommit) {
      args.push("--expected-api-gateway-commit", options.expectedRunnerCommit);
    }
  }

  if (options.timeoutMs) {
    args.push("--timeout-ms", options.timeoutMs);
  }

  return args;
}

function formatResolvedUrl(value) {
  return value instanceof URL ? value.toString() : value;
}

function buildTranscriptionArgs(options, context = {}) {
  const args = [
    "scripts/e2e-transcription-job.cjs",
    "--expect",
    options.transcriptionExpect,
    "--mode",
    options.mode,
  ];

  if (options.allowHostedE2e) {
    args.push("--allow-hosted");
  }

  const apiGatewayUrl = options.apiGatewayUrl || context.apiGatewayUrl;

  if (apiGatewayUrl) {
    args.push("--api-gateway-url", formatResolvedUrl(apiGatewayUrl));
  }

  if (options.dockerBin) {
    args.push("--docker-bin", options.dockerBin);
  }

  if (options.envFile) {
    args.push("--env-file", options.envFile);
  }

  if (options.fixtureAssetUrl) {
    args.push("--fixture-asset-url", options.fixtureAssetUrl);
  }

  if (options.pollMs) {
    args.push("--poll-ms", options.pollMs);
  }

  if (options.skipDocker) {
    args.push("--skip-docker");
  }

  if (options.userId) {
    args.push("--user-id", options.userId);
  }

  if (options.waitMs) {
    args.push("--wait-ms", options.waitMs);
  }

  return args;
}

function isLocalRuntimeUrl(url) {
  return ["localhost", "127.0.0.1", "::1", "host.docker.internal"].includes(
    url.hostname,
  );
}

function getRolloutEnv(options) {
  return {
    ...loadEnvFile(options.envFile),
    ...process.env,
  };
}

function getTimeoutMs(options) {
  if (!options.timeoutMs) {
    return DEFAULT_TIMEOUT_MS;
  }

  const timeoutMs = Number(options.timeoutMs);

  if (!Number.isInteger(timeoutMs) || timeoutMs < 500) {
    throw new Error("--timeout-ms must be an integer >= 500.");
  }

  return timeoutMs;
}

function validateRolloutMode(options, env = process.env) {
  if (options.mode === LOCAL_DIAGNOSTIC_MODE) {
    return {
      mode: LOCAL_DIAGNOSTIC_MODE,
    };
  }

  if (!options.skipDocker) {
    throw new Error(
      "production-gate requires --skip-docker because it must target already running deployed services.",
    );
  }

  if (!options.allowHostedE2e) {
    throw new Error(
      "production-gate requires --allow-hosted-e2e because the E2E writes disposable rows into hosted Supabase.",
    );
  }

  if (!options.expectPrivateAutomation) {
    throw new Error("production-gate requires --expect-private-automation.");
  }

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
  const fixtureAsset = resolveFixtureAssetConfig({
    env,
    options: {
      fixtureAssetUrl: options.fixtureAssetUrl,
      mode:
        options.mode === PRODUCTION_GATE_MODE
          ? TRANSCRIPTION_E2E_PRODUCTION_MODE
          : options.mode,
    },
  });

  if (isLocalRuntimeUrl(apiGatewayUrl)) {
    throw new Error(
      `production-gate requires a hosted API gateway URL, got local host ${apiGatewayUrl.hostname}.`,
    );
  }

  if (isLocalRuntimeUrl(automationServiceUrl)) {
    throw new Error(
      `production-gate requires a private Automation Service URL, got local host ${automationServiceUrl.hostname}.`,
    );
  }

  if (!isPrivateAutomationUrl(automationServiceUrl)) {
    throw new Error(
      `production-gate requires AUTOMATION_SERVICE_URL to use Railway private networking, got ${automationServiceUrl.hostname}.`,
    );
  }

  if (!fixtureAsset) {
    throw new Error(
      `production-gate requires ${TRANSCRIPTION_E2E_FIXTURE_ENV_NAME} or --fixture-asset-url.`,
    );
  }

  return {
    apiGatewayUrl,
    automationServiceUrl,
    fixtureAsset,
    mode: PRODUCTION_GATE_MODE,
  };
}

async function runModePreflight(options, snapshot) {
  const env = getRolloutEnv(options);
  const context = validateRolloutMode(options, env);

  if (context.mode === LOCAL_DIAGNOSTIC_MODE) {
    console.log(
      "\nRollout mode: local diagnostic (useful for diagnosis, never a promotable production gate).",
    );
    return context;
  }

  const timeoutMs = getTimeoutMs(options);

  console.log(
    "\nRollout mode: production gate (must run from release-gate-runner or an equivalent Railway runtime that can reach the private Automation Service).",
  );

  const apiGatewayHealth = await fetchHealthDetails({
    expectedService: "api-gateway",
    timeoutMs,
    url: context.apiGatewayUrl,
  });
  const expectedApiGatewayCommit =
    options.expectedRunnerCommit || snapshot?.provenance?.gitCommit;
  const expectedApiGatewayEnvironment =
    snapshot?.provenance?.environment ||
    process.env.RAILWAY_ENVIRONMENT_NAME ||
    process.env.RAILWAY_ENVIRONMENT ||
    "";
  const apiGatewayProvenance = assertApiGatewayRuntimeProvenance(
    apiGatewayHealth.headers,
    {
      expectedCommit: expectedApiGatewayCommit,
      expectedEnvironment: expectedApiGatewayEnvironment,
    },
  );

  console.log(
    `API Gateway runtime provenance ok: commit ${apiGatewayProvenance.gitCommit.slice(
      0,
      12,
    )}, environment ${apiGatewayProvenance.environment}.`,
  );

  await fetchHealth({
    expectedService: "automation-service",
    timeoutMs,
    url: context.automationServiceUrl,
  });

  console.log(
    `Production transcription fixture asset ok: ${context.fixtureAsset.redacted}.`,
  );
  console.log(
    "Production-gate preflight ok: hosted API gateway and private Automation Service are reachable from this runtime.",
  );

  return context;
}

function getCheckSequence(options, context = {}) {
  return [
    {
      args: ["db:validate-security"],
      label: "Supabase migration/RLS/index validation",
      runner: "pnpm",
    },
    {
      args: ["--filter", "@streamos/api-gateway", "typecheck"],
      label: "API Gateway typecheck",
      runner: "pnpm",
    },
    ...getApiGatewayRuntimePackageBuildSteps(),
    {
      args: ["--filter", "@streamos/api-gateway", "test"],
      label: API_GATEWAY_TEST_LABEL,
      runner: "pnpm",
    },
    {
      args: ["--filter", "@streamos/api-gateway", "build"],
      label: API_GATEWAY_BUILD_LABEL,
      runner: "pnpm",
    },
    {
      args: ["--filter", "stream-job-worker", "test"],
      label: "stream-job-worker tests",
      runner: "pnpm",
    },
    {
      args: ["--filter", "stream-job-worker", "build"],
      label: "stream-job-worker build",
      runner: "pnpm",
    },
    ...getTranscriptionWorkerRuntimePackageBuildSteps(),
    {
      args: ["--filter", "@streamos/transcription-worker", "test"],
      label: TRANSCRIPTION_WORKER_TEST_LABEL,
      runner: "pnpm",
    },
    {
      args: ["--filter", "@streamos/transcription-worker", "build"],
      label: "transcription-worker build",
      runner: "pnpm",
    },
    {
      args: buildTranscriptionArgs(options, context),
      command: process.execPath,
      label: TRANSCRIPTION_E2E_LABEL,
      runner: "node",
    },
    {
      args: buildDeploymentArgs(options),
      command: process.execPath,
      label: "Deployment health checks",
      runner: "node",
    },
  ];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const snapshot = assertProofCapableSnapshot({
    expectedRunnerCommit: options.expectedRunnerCommit,
    mode: options.mode,
  });
  console.log(`Snapshot preflight ok: ${snapshot.repoRoot}`);

  if (snapshot.provenance) {
    console.log(
      `Runner provenance ok: commit ${snapshot.provenance.gitCommit.slice(
        0,
        12,
      )}, built ${snapshot.provenance.generatedAt}, contract ${snapshot.contract.contractHash.slice(
        0,
        12,
      )}.`,
    );
  }

  const modeContext = await runModePreflight(options, snapshot);

  for (const step of getCheckSequence(options, modeContext)) {
    if (step.runner === "pnpm") {
      runPnpm(step.args, step.label);
      continue;
    }

    run(step.command, step.args, step.label);
  }

  if (modeContext.mode === LOCAL_DIAGNOSTIC_MODE) {
    console.log(
      "\nStreamOS local diagnostic passed. This run is not a production promotion gate.",
    );
    return;
  }

  console.log(
    "\nStreamOS production gate passed. This run is promotable because the private Automation Service was reachable from this runtime.",
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      `StreamOS rollout gate failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_EXPECTED_TRANSCRIPTION_STATUS,
  LOCAL_DIAGNOSTIC_MODE,
  PROOF_SNAPSHOT_REQUIRED_PATHS,
  PRODUCTION_GATE_MODE,
  SNAPSHOT_NOT_PROOF_CAPABLE,
  API_GATEWAY_RUNTIME_WORKSPACE_PACKAGES,
  API_GATEWAY_BUILD_LABEL,
  API_GATEWAY_TEST_LABEL,
  RELEASE_GATE_RUNNER_SERVICE,
  RUNNER_PROVENANCE_PATH,
  RUNNER_PROVENANCE_SCHEMA_VERSION,
  TRANSCRIPTION_WORKER_RUNTIME_WORKSPACE_PACKAGES,
  TRANSCRIPTION_WORKER_TEST_LABEL,
  TRANSCRIPTION_E2E_LABEL,
  getApiGatewayRuntimePackageBuildSteps,
  getTranscriptionWorkerRuntimePackageBuildSteps,
  assertProofCapableSnapshot,
  buildDeploymentArgs,
  buildTranscriptionArgs,
  collectGateContractIssues,
  collectProofSnapshotIssues,
  collectRunnerProvenanceIssues,
  getCheckSequence,
  getExpectedGateContract,
  getRolloutEnv,
  getTimeoutMs,
  hashText,
  isLocalRuntimeUrl,
  main,
  parseArgs,
  printHelp,
  readRunnerProvenance,
  runModePreflight,
  validateRolloutMode,
};
