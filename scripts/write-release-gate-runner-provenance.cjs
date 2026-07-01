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

const DEFAULT_RUNTIME_PROVENANCE_REPOSITORY = "StreamOS/StreamOS";
const ARGUMENT_FLAG_TO_OPTION_KEY = new Map([
  ["environment", "environment"],
  ["generated-at", "generatedAt"],
  ["git-sha", "gitCommit"],
  ["git-ref", "gitRef"],
  ["output", "output"],
  ["repository", "repository"],
  ["run-attempt", "runAttempt"],
  ["run-id", "runId"],
  ["service", "runnerService"],
  ["workflow", "workflow"],
]);

function parseArgs(argv) {
  const options = {
    output: RUNNER_PROVENANCE_PATH,
  };

  let index = 0;

  while (index < argv.length) {
    const arg = argv[index];

    if (arg === "--") {
      index += 1;
      continue;
    }

    let consumedFlag = false;

    for (const [flagName, optionKey] of ARGUMENT_FLAG_TO_OPTION_KEY) {
      const match = consumeValueFlag(argv, index, flagName);

      if (!match.matched) {
        continue;
      }

      options[optionKey] = match.value.trim();
      index = match.nextIndex + 1;
      consumedFlag = true;
      break;
    }

    if (consumedFlag) {
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
    repository:
      options.repository ||
      process.env.GITHUB_REPOSITORY ||
      DEFAULT_RUNTIME_PROVENANCE_REPOSITORY,
    runAttempt: options.runAttempt || process.env.GITHUB_RUN_ATTEMPT || "",
    runId: options.runId || process.env.GITHUB_RUN_ID || "",
    runnerService: options.runnerService || RELEASE_GATE_RUNNER_SERVICE,
    workflow: options.workflow || process.env.GITHUB_WORKFLOW || "",
  };
}

function buildReleaseGateRunnerProvenance(
  options,
  { repoRoot = resolve(__dirname, ".."), readFile = readFileSync } = {},
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
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = {
  ARGUMENT_FLAG_TO_OPTION_KEY,
  DEFAULT_RUNTIME_PROVENANCE_REPOSITORY,
  buildReleaseGateRunnerProvenance,
  parseArgs,
};
