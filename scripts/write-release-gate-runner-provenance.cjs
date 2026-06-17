#!/usr/bin/env node

const { readFileSync, writeFileSync } = require("node:fs");
const { isAbsolute, join, resolve } = require("node:path");

const { consumeValueFlag } = require("./lib/cli-args.cjs");
const {
  RELEASE_GATE_RUNNER_SERVICE,
  RUNNER_PROVENANCE_PATH,
  RUNNER_PROVENANCE_SCHEMA_VERSION,
  PROOF_SNAPSHOT_REQUIRED_PATHS,
  getExpectedGateContract,
  hashText,
} = require("./rollout-check.cjs");

function parseArgs(argv) {
  const options = {
    output: RUNNER_PROVENANCE_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    const environmentMatch = consumeValueFlag(argv, index, "environment");

    if (environmentMatch.matched) {
      options.environment = environmentMatch.value.trim();
      index = environmentMatch.nextIndex;
      continue;
    }

    const generatedAtMatch = consumeValueFlag(argv, index, "generated-at");

    if (generatedAtMatch.matched) {
      options.generatedAt = generatedAtMatch.value.trim();
      index = generatedAtMatch.nextIndex;
      continue;
    }

    const gitCommitMatch = consumeValueFlag(argv, index, "git-sha");

    if (gitCommitMatch.matched) {
      options.gitCommit = gitCommitMatch.value.trim();
      index = gitCommitMatch.nextIndex;
      continue;
    }

    const gitRefMatch = consumeValueFlag(argv, index, "git-ref");

    if (gitRefMatch.matched) {
      options.gitRef = gitRefMatch.value.trim();
      index = gitRefMatch.nextIndex;
      continue;
    }

    const outputMatch = consumeValueFlag(argv, index, "output");

    if (outputMatch.matched) {
      options.output = outputMatch.value.trim();
      index = outputMatch.nextIndex;
      continue;
    }

    const repositoryMatch = consumeValueFlag(argv, index, "repository");

    if (repositoryMatch.matched) {
      options.repository = repositoryMatch.value.trim();
      index = repositoryMatch.nextIndex;
      continue;
    }

    const runAttemptMatch = consumeValueFlag(argv, index, "run-attempt");

    if (runAttemptMatch.matched) {
      options.runAttempt = runAttemptMatch.value.trim();
      index = runAttemptMatch.nextIndex;
      continue;
    }

    const runIdMatch = consumeValueFlag(argv, index, "run-id");

    if (runIdMatch.matched) {
      options.runId = runIdMatch.value.trim();
      index = runIdMatch.nextIndex;
      continue;
    }

    const serviceMatch = consumeValueFlag(argv, index, "service");

    if (serviceMatch.matched) {
      options.runnerService = serviceMatch.value.trim();
      index = serviceMatch.nextIndex;
      continue;
    }

    const workflowMatch = consumeValueFlag(argv, index, "workflow");

    if (workflowMatch.matched) {
      options.workflow = workflowMatch.value.trim();
      index = workflowMatch.nextIndex;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    environment: options.environment || process.env.RAILWAY_ENVIRONMENT || "",
    generatedAt: options.generatedAt || new Date().toISOString(),
    gitCommit:
      options.gitCommit ||
      process.env.GITHUB_SHA ||
      process.env.STREAMOS_RC_COMMIT_SHA ||
      "",
    gitRef: options.gitRef || process.env.GITHUB_REF || "",
    output: options.output,
    repository: options.repository || process.env.GITHUB_REPOSITORY || "",
    runAttempt: options.runAttempt || process.env.GITHUB_RUN_ATTEMPT || "",
    runId: options.runId || process.env.GITHUB_RUN_ID || "",
    runnerService: options.runnerService || RELEASE_GATE_RUNNER_SERVICE,
    workflow: options.workflow || process.env.GITHUB_WORKFLOW || "",
  };
}

function buildReleaseGateRunnerProvenance(
  options,
  {
    repoRoot = resolve(__dirname, ".."),
    readFile = readFileSync,
  } = {},
) {
  if (!/^[0-9a-f]{7,40}$/i.test(options.gitCommit)) {
    throw new Error("write-release-gate-runner-provenance requires --git-sha.");
  }

  const rolloutCheckPath = join(repoRoot, "scripts/rollout-check.cjs");
  const packageJsonPath = join(repoRoot, "package.json");
  const expectedGateContract = getExpectedGateContract();

  return {
    schemaVersion: RUNNER_PROVENANCE_SCHEMA_VERSION,
    runnerService: options.runnerService,
    environment: options.environment,
    gitCommit: options.gitCommit,
    gitRef: options.gitRef,
    repository: options.repository,
    workflow: options.workflow,
    runId: options.runId,
    runAttempt: options.runAttempt,
    generatedAt: options.generatedAt,
    gateContract: expectedGateContract,
    snapshot: {
      packageJsonSha256: hashText(readFile(packageJsonPath, "utf8")),
      proofPaths: PROOF_SNAPSHOT_REQUIRED_PATHS,
      rolloutCheckSha256: hashText(readFile(rolloutCheckPath, "utf8")),
    },
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(__dirname, "..");
  const provenance = buildReleaseGateRunnerProvenance(options, { repoRoot });
  const outputPath = isAbsolute(options.output)
    ? options.output
    : join(repoRoot, options.output);

  writeFileSync(outputPath, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
  console.log(
    `Wrote release-gate-runner provenance: ${outputPath} (${provenance.gitCommit.slice(
      0,
      12,
    )}, ${provenance.gateContract.contractHash.slice(0, 12)})`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

module.exports = {
  buildReleaseGateRunnerProvenance,
  parseArgs,
};
