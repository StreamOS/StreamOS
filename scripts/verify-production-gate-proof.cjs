#!/usr/bin/env node

const { Buffer } = require("node:buffer");

const { consumeValueFlag } = require("./lib/cli-args.cjs");
const {
  PRODUCTION_GATE_COMMAND,
  PRODUCTION_GATE_PROOF_PREFIX,
  PRODUCTION_GATE_PROOF_SCHEMA_VERSION,
  PRODUCTION_GATE_PROOF_TYPE,
} = require("./write-production-gate-proof.cjs");
const {
  PRODUCTION_GATE_MODE,
  RELEASE_GATE_RUNNER_SERVICE,
} = require("./rollout-check.cjs");

const PROOF_FIELD_PATTERNS = {
  environment: /^[A-Za-z0-9_.-]+$/,
  gateCommand: /^[A-Za-z0-9:._ -]+$/,
  gateRunAttempt: /^[0-9]+$/,
  gateRunId: /^[0-9]+$/,
  generatedAt: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/,
  mode: /^[A-Za-z0-9_.-]+$/,
  proofType: /^[A-Za-z0-9_.-]+$/,
  rcSha: /^[0-9a-f]{7,40}$/i,
  runnerService: /^[A-Za-z0-9_.-]+$/,
};

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    const valueMatch = consumeValueFlag(argv, index, [
      "expected-environment",
      "expected-rc-sha",
      "expected-run-attempt",
      "expected-run-id",
      "expected-service",
      "proof-line",
      "proof-token",
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
    expectedEnvironment:
      options.expectedEnvironment || process.env.RAILWAY_ENVIRONMENT || "",
    expectedRcSha: options.expectedRcSha || process.env.GITHUB_SHA || "",
    expectedRunAttempt:
      options.expectedRunAttempt || process.env.GITHUB_RUN_ATTEMPT || "",
    expectedRunId: options.expectedRunId || process.env.GITHUB_RUN_ID || "",
    expectedService: options.expectedService || RELEASE_GATE_RUNNER_SERVICE,
    proofToken:
      options.proofToken ||
      extractProofToken(options.proofLine || process.env.PRODUCTION_GATE_PROOF),
  };
}

function extractProofToken(line) {
  if (!line) {
    return "";
  }

  return line.startsWith(PRODUCTION_GATE_PROOF_PREFIX)
    ? line.slice(PRODUCTION_GATE_PROOF_PREFIX.length).trim()
    : line.trim();
}

function decodeProductionGateProof(token) {
  if (!token) {
    throw new Error("Production gate proof marker is missing.");
  }

  try {
    return JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    throw new Error("Production gate proof marker is invalid.");
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`Production gate proof ${label} mismatch.`);
  }
}

function assertFieldFormat(value, label, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`Production gate proof ${label} has invalid format.`);
  }
}

function assertNumberFieldFormat(value, label) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`Production gate proof ${label} has invalid format.`);
  }
}

function verifyProductionGateProof(token, expected) {
  const proof = decodeProductionGateProof(token);

  assertNumberFieldFormat(proof.schemaVersion, "schemaVersion");
  assertFieldFormat(
    proof.proofType,
    "proofType",
    PROOF_FIELD_PATTERNS.proofType,
  );
  assertFieldFormat(proof.mode, "mode", PROOF_FIELD_PATTERNS.mode);
  assertFieldFormat(
    proof.gateCommand,
    "gateCommand",
    PROOF_FIELD_PATTERNS.gateCommand,
  );
  assertFieldFormat(proof.rcSha, "rcSha", PROOF_FIELD_PATTERNS.rcSha);
  assertFieldFormat(
    proof.environment,
    "environment",
    PROOF_FIELD_PATTERNS.environment,
  );
  assertFieldFormat(
    proof.runnerService,
    "runnerService",
    PROOF_FIELD_PATTERNS.runnerService,
  );
  assertFieldFormat(
    proof.gateRun?.id,
    "gateRun.id",
    PROOF_FIELD_PATTERNS.gateRunId,
  );
  assertFieldFormat(
    proof.gateRun?.attempt,
    "gateRun.attempt",
    PROOF_FIELD_PATTERNS.gateRunAttempt,
  );
  assertFieldFormat(
    proof.generatedAt,
    "generatedAt",
    PROOF_FIELD_PATTERNS.generatedAt,
  );

  assertEqual(
    proof.schemaVersion,
    PRODUCTION_GATE_PROOF_SCHEMA_VERSION,
    "schemaVersion",
  );
  assertEqual(proof.proofType, PRODUCTION_GATE_PROOF_TYPE, "proofType");
  assertEqual(proof.mode, PRODUCTION_GATE_MODE, "mode");
  assertEqual(proof.gateCommand, PRODUCTION_GATE_COMMAND, "gateCommand");
  assertEqual(proof.rcSha, expected.expectedRcSha, "rcSha");
  assertEqual(proof.environment, expected.expectedEnvironment, "environment");
  assertEqual(proof.runnerService, expected.expectedService, "runnerService");
  assertEqual(proof.gateRun?.id, expected.expectedRunId, "gateRun.id");
  assertEqual(
    proof.gateRun?.attempt,
    expected.expectedRunAttempt,
    "gateRun.attempt",
  );

  if (!Date.parse(proof.generatedAt)) {
    throw new Error("Production gate proof generatedAt is invalid.");
  }

  return proof;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  verifyProductionGateProof(options.proofToken, {
    expectedEnvironment: options.expectedEnvironment,
    expectedRcSha: options.expectedRcSha,
    expectedRunAttempt: options.expectedRunAttempt,
    expectedRunId: options.expectedRunId,
    expectedService: options.expectedService,
  });
  process.stdout.write("Production gate proof marker verified.\n");
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
  decodeProductionGateProof,
  extractProofToken,
  parseArgs,
  PROOF_FIELD_PATTERNS,
  verifyProductionGateProof,
};
