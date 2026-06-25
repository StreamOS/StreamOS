#!/usr/bin/env node

const { Buffer } = require("node:buffer");

const { consumeValueFlag } = require("./lib/cli-args.cjs");
const {
  PRODUCTION_GATE_MODE,
  RELEASE_GATE_RUNNER_SERVICE,
} = require("./rollout-check.cjs");

const PRODUCTION_GATE_PROOF_PREFIX = "STREAMOS_PRODUCTION_GATE_PROOF=";
const PRODUCTION_GATE_PROOF_SCHEMA_VERSION = 1;
const PRODUCTION_GATE_PROOF_TYPE = "streamos-production-gate";
const PRODUCTION_GATE_COMMAND = "pnpm rollout:check:production";

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    const valueMatch = consumeValueFlag(argv, index, [
      "environment",
      "generated-at",
      "rc-sha",
      "run-attempt",
      "run-id",
      "service",
    ]);

    if (valueMatch.matched) {
      options[
        valueMatch.name.replace(/-([a-z])/g, (_, char) => char.toUpperCase())
      ] = valueMatch.value.trim();
      index = valueMatch.nextIndex;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    environment: options.environment || process.env.RAILWAY_ENVIRONMENT || "",
    generatedAt: options.generatedAt || new Date().toISOString(),
    rcSha:
      options.rcSha ||
      process.env.GITHUB_SHA ||
      process.env.STREAMOS_RC_COMMIT_SHA ||
      "",
    runAttempt: options.runAttempt || process.env.GITHUB_RUN_ATTEMPT || "",
    runId: options.runId || process.env.GITHUB_RUN_ID || "",
    service:
      options.service ||
      process.env.RAILWAY_SERVICE_NAME ||
      RELEASE_GATE_RUNNER_SERVICE,
  };
}

function assertSafeIdentifier(value, fieldName, pattern) {
  if (!pattern.test(value)) {
    throw new Error(`Invalid production gate proof ${fieldName}.`);
  }
}

function buildProductionGateProof(options) {
  assertSafeIdentifier(options.rcSha, "rcSha", /^[0-9a-f]{7,40}$/i);
  assertSafeIdentifier(options.environment, "environment", /^[A-Za-z0-9_.-]+$/);
  assertSafeIdentifier(options.service, "service", /^[A-Za-z0-9_.-]+$/);
  assertSafeIdentifier(options.runId, "runId", /^[0-9]+$/);
  assertSafeIdentifier(options.runAttempt, "runAttempt", /^[0-9]+$/);

  return {
    schemaVersion: PRODUCTION_GATE_PROOF_SCHEMA_VERSION,
    proofType: PRODUCTION_GATE_PROOF_TYPE,
    mode: PRODUCTION_GATE_MODE,
    rcSha: options.rcSha,
    environment: options.environment,
    runnerService: options.service,
    gateCommand: PRODUCTION_GATE_COMMAND,
    gateRun: {
      id: options.runId,
      attempt: options.runAttempt,
    },
    generatedAt: options.generatedAt,
  };
}

function encodeProductionGateProof(proof) {
  return Buffer.from(JSON.stringify(proof), "utf8").toString("base64url");
}

function formatProductionGateProofLine(proof) {
  return `${PRODUCTION_GATE_PROOF_PREFIX}${encodeProductionGateProof(proof)}`;
}

function main() {
  const proof = buildProductionGateProof(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${formatProductionGateProofLine(proof)}\n`);
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
  PRODUCTION_GATE_COMMAND,
  PRODUCTION_GATE_PROOF_PREFIX,
  PRODUCTION_GATE_PROOF_SCHEMA_VERSION,
  PRODUCTION_GATE_PROOF_TYPE,
  buildProductionGateProof,
  encodeProductionGateProof,
  formatProductionGateProofLine,
  parseArgs,
};
