const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PRODUCTION_GATE_PROOF_PREFIX,
  buildProductionGateProof,
  formatProductionGateProofLine,
} = require("./write-production-gate-proof.cjs");
const {
  extractProofToken,
  verifyProductionGateProof,
} = require("./verify-production-gate-proof.cjs");
const {
  encodeProductionGateProof,
} = require("./write-production-gate-proof.cjs");

const EXPECTED = {
  expectedEnvironment: "production",
  expectedRcSha: "195c6685282571d9d5017f3a0ec3b197b97cfa1d",
  expectedRunAttempt: "2",
  expectedRunId: "1234567890",
  expectedService: "release-gate-runner",
};

function buildProof(overrides = {}) {
  return buildProductionGateProof({
    environment: EXPECTED.expectedEnvironment,
    generatedAt: "2026-06-25T08:00:00.000Z",
    rcSha: EXPECTED.expectedRcSha,
    runAttempt: EXPECTED.expectedRunAttempt,
    runId: EXPECTED.expectedRunId,
    service: EXPECTED.expectedService,
    ...overrides,
  });
}

function encodeProof(overrides = {}) {
  return encodeProductionGateProof({
    ...buildProof(),
    ...overrides,
  });
}

function assertRejectsWithoutLeaking(token, pattern, forbiddenValues) {
  assert.throws(
    () => verifyProductionGateProof(token, EXPECTED),
    (error) => {
      assert.match(error.message, pattern);

      for (const forbiddenValue of forbiddenValues) {
        assert.doesNotMatch(error.message, new RegExp(forbiddenValue, "i"));
      }

      return true;
    },
  );
}

test("production gate proof marker verifies expected runner context", () => {
  const proofLine = formatProductionGateProofLine(buildProof());
  const proof = verifyProductionGateProof(
    extractProofToken(proofLine),
    EXPECTED,
  );

  assert.equal(proof.rcSha, EXPECTED.expectedRcSha);
  assert.equal(proof.environment, EXPECTED.expectedEnvironment);
  assert.equal(proof.runnerService, EXPECTED.expectedService);
  assert.equal(proof.gateRun.id, EXPECTED.expectedRunId);
  assert.equal(proof.gateRun.attempt, EXPECTED.expectedRunAttempt);
});

test("production gate proof marker fails closed when missing", () => {
  assert.throws(
    () => verifyProductionGateProof("", EXPECTED),
    /proof marker is missing/,
  );
});

test("production gate proof marker rejects rc-sha mismatch", () => {
  const mismatchedSha = "295c6685282571d9d5017f3a0ec3b197b97cfa1d";
  const proofLine = formatProductionGateProofLine(
    buildProof({ rcSha: mismatchedSha }),
  );

  assertRejectsWithoutLeaking(extractProofToken(proofLine), /rcSha mismatch/, [
    mismatchedSha,
  ]);
});

test("production gate proof marker rejects run attempt mismatch", () => {
  const mismatchedAttempt = "3";
  const proofLine = formatProductionGateProofLine(
    buildProof({ runAttempt: mismatchedAttempt }),
  );

  assertRejectsWithoutLeaking(
    extractProofToken(proofLine),
    /gateRun\.attempt mismatch/,
    [mismatchedAttempt],
  );
});

test("production gate proof marker rejects environment mismatch without leaking value", () => {
  const mismatchedEnvironment = "staging";
  const proofLine = formatProductionGateProofLine(
    buildProof({ environment: mismatchedEnvironment }),
  );

  assertRejectsWithoutLeaking(
    extractProofToken(proofLine),
    /environment mismatch/,
    [mismatchedEnvironment],
  );
});

test("production gate proof marker rejects gate command mismatch without leaking value", () => {
  const mismatchedCommand = "pnpm rollout:check:local";
  const proofToken = encodeProof({ gateCommand: mismatchedCommand });

  assertRejectsWithoutLeaking(proofToken, /gateCommand mismatch/, [
    "rollout:check:local",
  ]);
});

test("production gate proof marker rejects token-like manipulated values without leaking them", () => {
  const tokenLikeValue = "sk-test-secret-token-value?leak=1";
  const proofToken = encodeProof({ runnerService: tokenLikeValue });

  assertRejectsWithoutLeaking(proofToken, /runnerService has invalid format/, [
    tokenLikeValue,
    "secret",
    "token",
  ]);
});

test("production gate proof marker rejects URL manipulated values without leaking them", () => {
  const urlValue = "https://example.invalid/path?token=abc123";
  const proofToken = encodeProof({ environment: urlValue });

  assertRejectsWithoutLeaking(proofToken, /environment has invalid format/, [
    "example\\.invalid",
    "token=abc123",
  ]);
});

test("production gate proof marker rejects invalid field format without leaking value", () => {
  const invalidSha = "not-a-sha-with-query?secret=value";
  const proofToken = encodeProof({ rcSha: invalidSha });

  assertRejectsWithoutLeaking(proofToken, /rcSha has invalid format/, [
    "not-a-sha",
    "secret=value",
  ]);
});

test("production gate proof marker contains no secret-like fields", () => {
  const proofLine = formatProductionGateProofLine(buildProof());
  const token = extractProofToken(proofLine);
  const serializedProof = JSON.stringify(
    verifyProductionGateProof(token, EXPECTED),
  );

  assert.ok(proofLine.startsWith(PRODUCTION_GATE_PROOF_PREFIX));
  assert.doesNotMatch(serializedProof, /token|secret|key|private|credential/i);
  assert.doesNotMatch(serializedProof, /railway\.internal/i);
});
