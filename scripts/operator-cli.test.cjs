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
  buildDeploymentArgs,
  buildTranscriptionArgs,
  parseArgs: parseRolloutArgs,
} = require("./rollout-check.cjs");
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

test("audit token resolution allows ambient railway login sessions", () => {
  assert.equal(resolveRailwayToken("staging", {}), undefined);

  const commandEnv = buildRailwayCommandEnv("staging", {
    PATH: process.env.PATH,
  });

  assert.equal(commandEnv.RAILWAY_TOKEN, undefined);
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
    "--automation-service-url",
    "http://automation-service.railway.internal:8000",
    "--api-gateway-url=https://api.example.com",
  ]);

  assert.equal(options.envFile, ".env");
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
