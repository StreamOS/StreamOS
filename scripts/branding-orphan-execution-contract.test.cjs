const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BRAND_ASSET_STORAGE_BUCKET,
  buildBrandingOrphanDryRunReport,
} = require("./branding-orphan-dry-run.cjs");
const {
  classifyExecutionCandidate,
  evaluateExecutionContract,
  formatReport,
  parseArgs,
} = require("./branding-orphan-execution-contract.cjs");

const tenantId = "11111111-1111-4111-8111-111111111111";

test("execution contract parser requires explicit tenant, environment, report, and limits", () => {
  assert.throws(
    () => parseArgs(["--report-file", "report.json"]),
    /--user-id is required/,
  );
  assert.throws(
    () => parseArgs(["--report-file", "report.json", "--user-id", tenantId]),
    /--target-environment is required/,
  );
  assert.throws(
    () =>
      parseArgs([
        "--report-file",
        "report.json",
        "--user-id",
        tenantId,
        "--target-environment",
        "production",
      ]),
    /--max-delete-limit is required/,
  );
});

test("referenced object is never execution-eligible", () => {
  const result = classifyExecutionCandidate({
    bucket: BRAND_ASSET_STORAGE_BUCKET,
    classification: "referenced",
    pathContract: {
      recognizedShape: true,
      tenantScopedPrefix: true,
    },
    redactedPath: "<tenant>/logo/asset-live/neon-logo.png",
    reason: "still referenced",
  });

  assert.equal(result.eligible, false);
  assert.deepEqual(result.candidate.failureCodes, ["referenced_object"]);
});

test("wrong bucket is never execution-eligible", () => {
  const result = classifyExecutionCandidate({
    bucket: "other-bucket",
    classification: "orphan_candidate",
    pathContract: {
      recognizedShape: true,
      tenantScopedPrefix: true,
    },
    redactedPath: "<tenant>/logo/asset-live/replacements/uuid.png",
    reason: "candidate",
  });

  assert.equal(result.eligible, false);
  assert.deepEqual(result.candidate.failureCodes, ["wrong_bucket"]);
});

test("cross-tenant or invalid prefix path is never execution-eligible", () => {
  const report = buildBrandingOrphanDryRunReport({
    generatedAt: "2026-06-28T00:00:00.000Z",
    references: [],
    storageObjects: [
      {
        createdAt: null,
        lastAccessedAt: null,
        metadata: { size: 512 },
        path: "99999999-9999-4999-8999-999999999999/logo/asset-x/foreign.png",
        updatedAt: null,
      },
    ],
    targetEnvironment: {
      environment: "production",
      findings: [],
      source: "explicit",
    },
    userId: tenantId,
  });

  const result = evaluateExecutionContract({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      execute: false,
      format: "json",
      maxDeleteLimit: 5,
      maxEvidenceAgeMinutes: 30,
      reportFile: "unused.json",
      targetEnvironment: "production",
      userId: tenantId,
    },
    report,
  });

  assert.equal(result.decision, "blocked");
  assert.equal(result.blockedCandidates[0].classification, "out_of_scope");
  assert.deepEqual(result.blockedCandidates[0].failureCodes, [
    "cross_tenant_or_invalid_prefix",
    "unrecognized_storage_path",
    "out_of_scope_object",
  ]);
});

test("stale dry-run evidence blocks the execution contract", () => {
  const report = createOrphanCandidateReport({
    generatedAt: "2026-06-28T00:00:00.000Z",
  });

  const result = evaluateExecutionContract({
    now: new Date("2026-06-28T01:00:00.000Z"),
    options: {
      execute: false,
      format: "json",
      maxDeleteLimit: 5,
      maxEvidenceAgeMinutes: 15,
      reportFile: "unused.json",
      targetEnvironment: "production",
      userId: tenantId,
    },
    report,
  });

  assert.equal(result.decision, "blocked");
  assert.equal(
    result.failures.some((failure) => failure.code === "stale_evidence"),
    true,
  );
});

test("max-delete-limit blocks oversized eligible candidate sets", () => {
  const report = buildBrandingOrphanDryRunReport({
    generatedAt: "2026-06-28T00:00:00.000Z",
    references: [],
    storageObjects: [
      {
        createdAt: null,
        lastAccessedAt: null,
        metadata: { size: 512 },
        path: `${tenantId}/logo/asset-one/replacements/uuid-one.png`,
        updatedAt: null,
      },
      {
        createdAt: null,
        lastAccessedAt: null,
        metadata: { size: 512 },
        path: `${tenantId}/logo/asset-two/replacements/uuid-two.png`,
        updatedAt: null,
      },
    ],
    targetEnvironment: {
      environment: "production",
      findings: [],
      source: "explicit",
    },
    userId: tenantId,
  });

  const result = evaluateExecutionContract({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      execute: false,
      format: "json",
      maxDeleteLimit: 1,
      maxEvidenceAgeMinutes: 30,
      reportFile: "unused.json",
      targetEnvironment: "production",
      userId: tenantId,
    },
    report,
  });

  assert.equal(result.decision, "blocked");
  assert.equal(result.summary.eligibleCandidateCount, 2);
  assert.equal(
    result.failures.some(
      (failure) => failure.code === "max_delete_limit_exceeded",
    ),
    true,
  );
});

test("zero-candidate execution contract remains safe and blocked", () => {
  const report = buildBrandingOrphanDryRunReport({
    generatedAt: "2026-06-28T00:00:00.000Z",
    references: [],
    storageObjects: [],
    targetEnvironment: {
      environment: "production",
      findings: [],
      source: "explicit",
    },
    userId: tenantId,
  });

  const result = evaluateExecutionContract({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      execute: false,
      format: "json",
      maxDeleteLimit: 5,
      maxEvidenceAgeMinutes: 30,
      reportFile: "unused.json",
      targetEnvironment: "production",
      userId: tenantId,
    },
    report,
  });

  assert.equal(result.decision, "blocked");
  assert.equal(result.summary.eligibleCandidateCount, 0);
  assert.equal(result.evaluation.executionRemainsBlocked, true);
  assert.equal(
    result.failures.some(
      (failure) => failure.code === "zero_eligible_candidates",
    ),
    true,
  );
});

test("execute flag stays blocked and not implemented", () => {
  const report = createOrphanCandidateReport({
    generatedAt: "2026-06-28T00:00:00.000Z",
  });

  const result = evaluateExecutionContract({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      execute: true,
      format: "json",
      maxDeleteLimit: 5,
      maxEvidenceAgeMinutes: 30,
      reportFile: "unused.json",
      targetEnvironment: "production",
      userId: tenantId,
    },
    report,
  });

  assert.equal(result.decision, "blocked");
  assert.equal(result.evaluation.executeFlagBlocked, true);
  assert.equal(
    result.failures.some(
      (failure) => failure.code === "execution_not_implemented",
    ),
    true,
  );
});

test("secret-safe report output does not contain signed or private URLs", () => {
  const report = createOrphanCandidateReport({
    generatedAt: "2026-06-28T00:00:00.000Z",
  });

  const result = evaluateExecutionContract({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      execute: false,
      format: "json",
      maxDeleteLimit: 5,
      maxEvidenceAgeMinutes: 30,
      reportFile: "unused.json",
      targetEnvironment: "production",
      userId: tenantId,
    },
    report,
  });
  const jsonOutput = formatReport(result, "json");
  const textOutput = formatReport(result, "text");

  assert.equal(jsonOutput.includes("https://"), false);
  assert.equal(textOutput.includes("https://"), false);
  assert.equal(jsonOutput.toLowerCase().includes("signedurl"), false);
  assert.equal(textOutput.toLowerCase().includes("signed url"), false);
});

test("execution contract evaluation stays read-only and does not touch mutating helpers", () => {
  let removeCalls = 0;
  let deleteCalls = 0;
  let updateCalls = 0;
  let upsertCalls = 0;
  const report = {
    ...createOrphanCandidateReport({
      generatedAt: "2026-06-28T00:00:00.000Z",
    }),
    delete() {
      deleteCalls += 1;
    },
    remove() {
      removeCalls += 1;
    },
    update() {
      updateCalls += 1;
    },
    upsert() {
      upsertCalls += 1;
    },
  };

  const result = evaluateExecutionContract({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      execute: false,
      format: "json",
      maxDeleteLimit: 5,
      maxEvidenceAgeMinutes: 30,
      reportFile: "unused.json",
      targetEnvironment: "production",
      userId: tenantId,
    },
    report,
  });

  assert.equal(result.evaluation.executionImplemented, false);
  assert.equal(removeCalls, 0);
  assert.equal(deleteCalls, 0);
  assert.equal(updateCalls, 0);
  assert.equal(upsertCalls, 0);
});

function createOrphanCandidateReport({ generatedAt }) {
  return buildBrandingOrphanDryRunReport({
    generatedAt,
    references: [],
    storageObjects: [
      {
        createdAt: "2026-06-27T10:00:00.000Z",
        lastAccessedAt: null,
        metadata: { size: 512 },
        path: `${tenantId}/logo/asset-live/replacements/uuid-neon-logo.png`,
        updatedAt: "2026-06-27T11:00:00.000Z",
      },
    ],
    targetEnvironment: {
      environment: "production",
      findings: [],
      source: "explicit",
    },
    userId: tenantId,
  });
}
