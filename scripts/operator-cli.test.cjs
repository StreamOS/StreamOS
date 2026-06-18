const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildRailwayCommandEnv,
  parseArgs: parseAuditArgs,
  resolveProject,
  resolveRailwayToken,
} = require("./audit-railway-env.cjs");
const {
  assertNoClientAiSecrets,
  parseArgs: parseDeploymentArgs,
} = require("./check-deployment.cjs");
const {
  API_GATEWAY_RUNTIME_WORKSPACE_PACKAGES,
  LOCAL_DIAGNOSTIC_MODE,
  RUNNER_PROVENANCE_PATH,
  RUNNER_PROVENANCE_SCHEMA_VERSION,
  SNAPSHOT_NOT_PROOF_CAPABLE,
  PRODUCTION_GATE_MODE,
  assertProofCapableSnapshot,
  buildDeploymentArgs,
  buildTranscriptionArgs,
  collectGateContractIssues,
  collectProofSnapshotIssues,
  collectRunnerProvenanceIssues,
  getApiGatewayRuntimePackageBuildSteps,
  getCheckSequence,
  parseArgs: parseRolloutArgs,
  validateRolloutMode,
} = require("./rollout-check.cjs");
const {
  buildReleaseGateRunnerProvenance,
  parseArgs: parseProvenanceWriterArgs,
} = require("./write-release-gate-runner-provenance.cjs");
const {
  DEFAULT_ENV_FILE: DEFAULT_TRANSCRIPTION_ENV_FILE,
  parseArgs: parseTranscriptionArgs,
} = require("./e2e-transcription-job.cjs");
const {
  DEFAULT_ENV_FILE: DEFAULT_CONTENT_JOBS_ENV_FILE,
  parseArgs: parseContentJobsArgs,
} = require("./e2e-content-jobs.cjs");

test("audit CLI parser accepts split --env and --format flags", () => {
  const options = parseAuditArgs(["--env", "staging", "--format", "markdown"]);

  assert.deepEqual(options.environments, ["staging"]);
  assert.equal(options.format, "markdown");
});

test("audit CLI parser accepts --environment alias", () => {
  const options = parseAuditArgs(["--environment", "production"]);

  assert.deepEqual(options.environments, ["production"]);
});

test("audit project resolution prefers env project id before repo fallback", () => {
  const project = resolveProject(
    {
      defaultProjectId: "repo-project",
      projectId: undefined,
      projectName: "terrific-reflection",
    },
    {
      RAILWAY_PROJECT_ID: "env-project",
    },
  );

  assert.equal(project.id, "env-project");
});

test("audit token resolution uses staging token for staging", () => {
  assert.equal(
    resolveRailwayToken("staging", {
      RAILWAY_TOKEN_STAGING: "staging-token",
      RAILWAY_TOKEN_PRODUCTION: "production-token",
    }),
    "staging-token",
  );
});

test("audit token resolution uses production token for production", () => {
  assert.equal(
    resolveRailwayToken("production", {
      RAILWAY_TOKEN_STAGING: "staging-token",
      RAILWAY_TOKEN_PRODUCTION: "production-token",
    }),
    "production-token",
  );
});

test("audit token resolution lets explicit RAILWAY_TOKEN override env-specific tokens", () => {
  const commandEnv = buildRailwayCommandEnv("production", {
    RAILWAY_TOKEN: "shared-token",
    RAILWAY_TOKEN_PRODUCTION: "production-token",
  });

  assert.equal(commandEnv.RAILWAY_TOKEN, "shared-token");
});

test("audit token resolution fails cleanly when the environment token is missing", () => {
  assert.throws(
    () => resolveRailwayToken("staging", {}),
    /Set RAILWAY_TOKEN or RAILWAY_TOKEN_STAGING/,
  );
});

test("deployment parser accepts split env-file syntax", () => {
  const options = parseDeploymentArgs([
    "--env-file",
    ".env",
    "--api-gateway-url",
    "https://api.example.com",
  ]);

  assert.equal(options.envFile, ".env");
  assert.equal(options.apiGatewayUrl, "https://api.example.com");
});

test("deployment check blocks NEXT_PUBLIC_OPENAI* variables", () => {
  assert.throws(
    () =>
      assertNoClientAiSecrets({
        NEXT_PUBLIC_OPENAI_SECRET: "sk-client-leak",
      }),
    /NEXT_PUBLIC_OPENAI_SECRET/,
  );
});

test("rollout parser accepts split env-file syntax and builders emit split args", () => {
  const options = parseRolloutArgs([
    "--env-file",
    ".env",
    "--mode",
    "production-gate",
    "--automation-service-url",
    "http://automation-service.railway.internal:8000",
    "--api-gateway-url=https://api.example.com",
  ]);

  assert.equal(options.envFile, ".env");
  assert.equal(options.mode, PRODUCTION_GATE_MODE);
  assert.deepEqual(buildDeploymentArgs(options), [
    "scripts/check-deployment.cjs",
    "--api-gateway-url",
    "https://api.example.com",
    "--automation-service-url",
    "http://automation-service.railway.internal:8000",
    "--env-file",
    ".env",
  ]);
});

test("rollout transcription builder emits split args for downstream scripts", () => {
  const options = parseRolloutArgs([
    "--env-file",
    ".env",
    "--expect",
    "failed",
  ]);

  assert.deepEqual(buildTranscriptionArgs(options), [
    "scripts/e2e-transcription-job.cjs",
    "--expect",
    "failed",
    "--env-file",
    ".env",
  ]);
});

test("rollout parser defaults to local diagnostic mode", () => {
  const options = parseRolloutArgs([]);

  assert.equal(options.mode, LOCAL_DIAGNOSTIC_MODE);
});

test("rollout production gate requires deployed hosted options", () => {
  assert.throws(
    () =>
      validateRolloutMode(
        {
          allowHostedE2e: false,
          expectPrivateAutomation: false,
          mode: PRODUCTION_GATE_MODE,
          skipDocker: false,
        },
        {},
      ),
    /requires --skip-docker/,
  );
});

test("rollout production gate rejects local api gateway urls", () => {
  assert.throws(
    () =>
      validateRolloutMode(
        {
          allowHostedE2e: true,
          apiGatewayUrl: "http://localhost:4000",
          automationServiceUrl:
            "http://automation-service.railway.internal:8000",
          expectPrivateAutomation: true,
          mode: PRODUCTION_GATE_MODE,
          skipDocker: true,
        },
        {},
      ),
    /hosted API gateway URL/,
  );
});

test("rollout production gate accepts private automation urls", () => {
  const context = validateRolloutMode(
    {
      allowHostedE2e: true,
      apiGatewayUrl: "https://api.example.com",
      automationServiceUrl: "http://automation-service.railway.internal:8000",
      expectPrivateAutomation: true,
      mode: PRODUCTION_GATE_MODE,
      skipDocker: true,
    },
    {},
  );

  assert.equal(context.mode, PRODUCTION_GATE_MODE);
  assert.equal(context.apiGatewayUrl.hostname, "api.example.com");
  assert.equal(
    context.automationServiceUrl.hostname,
    "automation-service.railway.internal",
  );
});

test("rollout snapshot check reports missing gate files clearly", () => {
  const existingPaths = new Set([
    "/repo/package.json",
    "/repo/pnpm-workspace.yaml",
    "/repo/turbo.json",
    "/repo/scripts/check-deployment.cjs",
    "/repo/services/api-gateway",
    "/repo/workers/stream-job-worker",
    "/repo/workers/transcription-worker",
    "/repo/packages/queue",
    "/repo/packages/types",
    "/repo/packages/database",
  ]);

  const snapshot = collectProofSnapshotIssues({
    exists: (filePath) => existingPaths.has(filePath.replace(/\\/g, "/")),
    readFile: () =>
      JSON.stringify({
        scripts: {
          "rollout:check:production":
            "node scripts/rollout-check.cjs --mode production-gate",
        },
      }),
    repoRoot: "/repo",
  });

  assert.deepEqual(snapshot.issues, [
    "missing scripts/rollout-check.cjs",
    "missing scripts/e2e-transcription-job.cjs",
    "missing packages/redis",
    "missing packages/youtube-websub",
  ]);
});

test("rollout snapshot check fails closed when the production script is missing", () => {
  assert.throws(
    () =>
      assertProofCapableSnapshot({
        exists: (filePath) => filePath.replace(/\\/g, "/") !== "/repo/package.json",
        readFile: () => JSON.stringify({ scripts: {} }),
        repoRoot: "/repo",
      }),
    (error) =>
      error instanceof Error &&
      error.code === SNAPSHOT_NOT_PROOF_CAPABLE &&
      error.message.includes("missing root package.json"),
  );
});

test("rollout snapshot check fails closed when rollout:check:production is absent", () => {
  assert.throws(
    () =>
      assertProofCapableSnapshot({
        exists: () => true,
        readFile: () =>
          JSON.stringify({
            scripts: {
              "rollout:check:local":
                "node scripts/rollout-check.cjs --mode local-diagnostic",
            },
          }),
        repoRoot: "/repo",
      }),
    new RegExp(
      `${SNAPSHOT_NOT_PROOF_CAPABLE}: missing package\\.json script rollout:check:production`,
    ),
  );
});

test("rollout gate contract check requires shared package builds before api-gateway tests", () => {
  const result = collectGateContractIssues();

  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.contract.apiGatewayRuntimePackages, [
    "@streamos/redis",
    "@streamos/queue",
    "@streamos/youtube-websub",
  ]);
  assert.deepEqual(result.contract.sharedRuntimePackageSteps, [
    "API Gateway runtime package build: @streamos/redis",
    "API Gateway runtime package build: @streamos/queue",
    "API Gateway runtime package build: @streamos/youtube-websub",
  ]);
});

test("rollout check sequence includes blocking api-gateway build before e2e", () => {
  const sequence = getCheckSequence(
    parseRolloutArgs([
      "--mode",
      "production-gate",
      "--skip-docker",
      "--allow-hosted-e2e",
      "--expect-private-automation",
      "--api-gateway-url",
      "https://api.example.com",
      "--automation-service-url",
      "http://automation-service.railway.internal:8000",
    ]),
  );

  const labels = sequence.map((step) => step.label);

  assert.ok(labels.includes("API Gateway build"));
  assert.ok(labels.includes("Transcription E2E path"));
  assert.ok(
    labels.indexOf("API Gateway build") <
      labels.indexOf("Transcription E2E path"),
  );
});

test("rollout check builds shared runtime packages before api-gateway tests", () => {
  const sequence = getCheckSequence(
    parseRolloutArgs([
      "--mode",
      "production-gate",
      "--skip-docker",
      "--allow-hosted-e2e",
      "--expect-private-automation",
      "--api-gateway-url",
      "https://api.example.com",
      "--automation-service-url",
      "http://automation-service.railway.internal:8000",
    ]),
  );

  const labels = sequence.map((step) => step.label);
  const apiGatewayTestIndex = labels.indexOf(
    "API Gateway integration and signed-webhook tests",
  );

  assert.ok(apiGatewayTestIndex > 0);
  assert.deepEqual(
    getApiGatewayRuntimePackageBuildSteps().map((step) => step.label),
    [
      "API Gateway runtime package build: @streamos/redis",
      "API Gateway runtime package build: @streamos/queue",
      "API Gateway runtime package build: @streamos/youtube-websub",
    ],
  );

  for (const label of getApiGatewayRuntimePackageBuildSteps().map((step) => step.label)) {
    const index = labels.indexOf(label);
    assert.ok(index >= 0, `${label} should be part of the rollout gate`);
    assert.ok(
      index < apiGatewayTestIndex,
      `${label} should run before the API Gateway tests`,
    );
  }
});

test("api-gateway runtime package inventory is explicit and includes youtube-websub", () => {
  assert.deepEqual(
    API_GATEWAY_RUNTIME_WORKSPACE_PACKAGES.map((pkg) => pkg.name),
    [
      "@streamos/redis",
      "@streamos/queue",
      "@streamos/youtube-websub",
    ],
  );
});

test("rollout check sequence keeps local diagnostic semantics visible", () => {
  const options = parseRolloutArgs(["--mode", "local-diagnostic"]);
  const context = validateRolloutMode(options, {});
  const sequence = getCheckSequence(options);

  assert.equal(context.mode, LOCAL_DIAGNOSTIC_MODE);
  assert.equal(sequence[0].label, "Supabase migration/RLS/index validation");
});

test("rollout production gate requires runner provenance with current gate contract", () => {
  const rolloutCheckSource = "console.log('current rollout-check');";
  const packageJsonSource = JSON.stringify({
    scripts: {
      "rollout:check:production":
        "node scripts/rollout-check.cjs --mode production-gate",
    },
  });
  const provenance = buildReleaseGateRunnerProvenance(
    {
      environment: "production",
      generatedAt: "2026-06-17T21:41:16.354Z",
      gitCommit: "195c6685282571d9d5017f3a0ec3b197b97cfa1d",
      gitRef: "refs/heads/main",
      output: RUNNER_PROVENANCE_PATH,
      repository: "StreamOS/StreamOS",
      runAttempt: "1",
      runId: "123456789",
      runnerService: "release-gate-runner",
      workflow: "CD - Production Deployment",
    },
    {
      readFile: (filePath) => {
        const normalized = filePath.replace(/\\/g, "/");

        if (normalized.endsWith("/scripts/rollout-check.cjs")) {
          return rolloutCheckSource;
        }

        if (normalized.endsWith("/package.json")) {
          return packageJsonSource;
        }

        throw new Error(`Unexpected read: ${filePath}`);
      },
      repoRoot: "/repo",
    },
  );

  const issues = collectRunnerProvenanceIssues({
    exists: () => true,
    mode: PRODUCTION_GATE_MODE,
    readFile: (filePath) => {
      const normalized = filePath.replace(/\\/g, "/");

      if (normalized.endsWith("/scripts/.release-gate-runner-provenance.json")) {
        return JSON.stringify(provenance);
      }

      if (normalized.endsWith("/scripts/rollout-check.cjs")) {
        return rolloutCheckSource;
      }

      if (normalized.endsWith("/package.json")) {
        return packageJsonSource;
      }

      throw new Error(`Unexpected read: ${filePath}`);
    },
    repoRoot: "/repo",
    runtimeEnv: {
      RAILWAY_ENVIRONMENT_NAME: "production",
      RAILWAY_SERVICE_NAME: "release-gate-runner",
    },
  });

  assert.deepEqual(issues.issues, []);
  assert.equal(issues.provenance.schemaVersion, RUNNER_PROVENANCE_SCHEMA_VERSION);
});

test("rollout production gate rejects stale runner provenance hashes", () => {
  const issues = collectRunnerProvenanceIssues({
    exists: () => true,
    mode: PRODUCTION_GATE_MODE,
    readFile: (filePath) => {
      const normalized = filePath.replace(/\\/g, "/");

      if (normalized.endsWith("/scripts/.release-gate-runner-provenance.json")) {
        return JSON.stringify({
          environment: "production",
          gateContract: {
            contractHash: "stale-contract-hash",
          },
          generatedAt: "2026-06-17T21:41:16.354Z",
          gitCommit: "195c6685282571d9d5017f3a0ec3b197b97cfa1d",
          runnerService: "release-gate-runner",
          schemaVersion: RUNNER_PROVENANCE_SCHEMA_VERSION,
          snapshot: {
            packageJsonSha256: "stale",
            rolloutCheckSha256: "stale",
          },
        });
      }

      if (normalized.endsWith("/scripts/rollout-check.cjs")) {
        return "console.log('current rollout-check');";
      }

      if (normalized.endsWith("/package.json")) {
        return JSON.stringify({
          scripts: {
            "rollout:check:production":
              "node scripts/rollout-check.cjs --mode production-gate",
          },
        });
      }

      throw new Error(`Unexpected read: ${filePath}`);
    },
    repoRoot: "/repo",
    runtimeEnv: {
      RAILWAY_ENVIRONMENT_NAME: "production",
      RAILWAY_SERVICE_NAME: "release-gate-runner",
    },
  });

  assert.match(
    issues.issues.join("; "),
    /gate contract hash does not match|package\.json hash does not match|rollout-check hash does not match/,
  );
});

test("rollout production gate fails closed when runner provenance is missing", () => {
  const issues = collectRunnerProvenanceIssues({
    exists: () => false,
    mode: PRODUCTION_GATE_MODE,
    repoRoot: "/repo",
  });

  assert.deepEqual(issues.issues, [
    "missing scripts/.release-gate-runner-provenance.json",
  ]);
  assert.equal(issues.provenance, null);
});

test("release-gate-runner provenance payload stays non-secret and hash-bound", () => {
  const provenance = buildReleaseGateRunnerProvenance(
    {
      environment: "production",
      generatedAt: "2026-06-17T21:41:16.354Z",
      gitCommit: "195c6685282571d9d5017f3a0ec3b197b97cfa1d",
      gitRef: "refs/heads/main",
      output: RUNNER_PROVENANCE_PATH,
      repository: "StreamOS/StreamOS",
      runAttempt: "1",
      runId: "123456789",
      runnerService: "release-gate-runner",
      workflow: "CD - Production Deployment",
    },
    {
      readFile: (filePath) => {
        const normalized = filePath.replace(/\\/g, "/");

        if (normalized.endsWith("/scripts/rollout-check.cjs")) {
          return "console.log('current rollout-check');";
        }

        if (normalized.endsWith("/package.json")) {
          return JSON.stringify({
            scripts: {
              "rollout:check:production":
                "node scripts/rollout-check.cjs --mode production-gate",
            },
          });
        }

        throw new Error(`Unexpected read: ${filePath}`);
      },
      repoRoot: "/repo",
    },
  );

  assert.deepEqual(Object.keys(provenance).sort(), [
    "environment",
    "gateContract",
    "generatedAt",
    "gitCommit",
    "gitRef",
    "repository",
    "runAttempt",
    "runId",
    "runnerService",
    "schemaVersion",
    "snapshot",
    "workflow",
  ]);
  assert.equal(provenance.runnerService, "release-gate-runner");
  assert.equal(provenance.environment, "production");
  assert.equal(
    provenance.snapshot.proofPaths.includes("packages/redis"),
    true,
  );
  assert.equal(
    JSON.stringify(provenance).includes("SECRET"),
    false,
  );
});

test("rollout production gate rejects public automation urls", () => {
  assert.throws(
    () =>
      validateRolloutMode(
        {
          allowHostedE2e: true,
          apiGatewayUrl: "https://api.example.com",
          automationServiceUrl: "https://automation.example.com",
          expectPrivateAutomation: true,
          mode: PRODUCTION_GATE_MODE,
          skipDocker: true,
        },
        {},
      ),
    /requires AUTOMATION_SERVICE_URL to use Railway private networking/,
  );
});

test("transcription E2E parser accepts split env-file syntax", () => {
  const options = parseTranscriptionArgs(["--env-file", ".env"]);

  assert.equal(options.envFile, ".env");
});

test("transcription E2E parser keeps equals syntax working", () => {
  const options = parseTranscriptionArgs(["--env-file=.env"]);

  assert.equal(options.envFile, ".env");
});

test("content-jobs E2E parser accepts split env-file syntax", () => {
  const options = parseContentJobsArgs(["--env-file", ".env"]);

  assert.equal(options.envFile, ".env");
});

test("content-jobs and transcription parsers keep their default env files", () => {
  assert.equal(
    parseTranscriptionArgs([]).envFile,
    DEFAULT_TRANSCRIPTION_ENV_FILE,
  );
  assert.equal(parseContentJobsArgs([]).envFile, DEFAULT_CONTENT_JOBS_ENV_FILE);
});

test("release-gate-runner provenance writer parses explicit args", () => {
  const options = parseProvenanceWriterArgs([
    "--git-sha",
    "195c6685282571d9d5017f3a0ec3b197b97cfa1d",
    "--environment",
    "production",
    "--git-ref",
    "refs/heads/main",
    "--repository",
    "StreamOS/StreamOS",
    "--workflow",
    "CD - Production Deployment",
    "--run-id",
    "123456789",
    "--run-attempt",
    "1",
  ]);

  assert.equal(options.environment, "production");
  assert.equal(options.gitCommit, "195c6685282571d9d5017f3a0ec3b197b97cfa1d");
});
