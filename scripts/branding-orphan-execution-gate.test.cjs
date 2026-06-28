const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBrandingOrphanDryRunReport,
} = require("./branding-orphan-dry-run.cjs");
const {
  evaluateExecutionGate,
  formatReport,
  parseArgs,
} = require("./branding-orphan-execution-gate.cjs");

const tenantId = "11111111-1111-4111-8111-111111111111";
const candidateSha = "473f66970083c768a7728b0aa223938a6a17b3da";

test("gate parser requires explicit report sha and current sha", () => {
  assert.throws(
    () =>
      parseArgs([
        "--report-file",
        "report.json",
        "--user-id",
        tenantId,
        "--target-environment",
        "production",
        "--max-delete-limit",
        "5",
        "--max-evidence-age-minutes",
        "30",
      ]),
    /--report-sha is required/,
  );
});

test("missing operator approval stays not_requested and not approved", () => {
  const result = evaluateExecutionGate({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: createBaseOptions(),
    report: createOrphanCandidateReport(),
  });

  assert.equal(result.decision, "not_requested");
  assert.equal(result.evaluation.operatorGateSatisfied, false);
});

test("request review reaches ready_for_operator_review without enabling execution", () => {
  const result = evaluateExecutionGate({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      ...createBaseOptions(),
      operatorDecision: "request_review",
    },
    report: createOrphanCandidateReport(),
  });

  assert.equal(result.decision, "ready_for_operator_review");
  assert.equal(result.evaluation.executionRemainsBlocked, true);
});

test("missing target environment is rejected at parse time", () => {
  assert.throws(
    () =>
      parseArgs([
        "--report-file",
        "report.json",
        "--report-sha",
        candidateSha,
        "--current-sha",
        candidateSha,
        "--user-id",
        tenantId,
        "--max-delete-limit",
        "5",
        "--max-evidence-age-minutes",
        "30",
      ]),
    /--target-environment is required/,
  );
});

test("missing user id is rejected at parse time", () => {
  assert.throws(
    () =>
      parseArgs([
        "--report-file",
        "report.json",
        "--report-sha",
        candidateSha,
        "--current-sha",
        candidateSha,
        "--target-environment",
        "production",
        "--max-delete-limit",
        "5",
        "--max-evidence-age-minutes",
        "30",
      ]),
    /--user-id is required/,
  );
});

test("stale dry-run evidence blocks the gate", () => {
  const result = evaluateExecutionGate({
    now: new Date("2026-06-28T01:00:00.000Z"),
    options: createBaseOptions(),
    report: createOrphanCandidateReport(),
  });

  assert.equal(result.decision, "blocked");
  assert.equal(
    result.failures.some((failure) => failure.code === "stale_evidence"),
    true,
  );
});

test("mismatched main sha and report sha blocks the gate", () => {
  const result = evaluateExecutionGate({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      ...createBaseOptions(),
      currentSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    report: createOrphanCandidateReport(),
  });

  assert.equal(result.decision, "blocked");
  assert.equal(
    result.failures.some(
      (failure) => failure.code === "mismatched_main_sha_report_sha",
    ),
    true,
  );
});

test("candidate count over max-delete-limit blocks the gate", () => {
  const result = evaluateExecutionGate({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      ...createBaseOptions(),
      maxDeleteLimit: 1,
      operatorDecision: "request_review",
    },
    report: buildBrandingOrphanDryRunReport({
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
    }),
  });

  assert.equal(result.decision, "blocked");
  assert.equal(
    result.failures.some(
      (failure) => failure.code === "max_delete_limit_exceeded",
    ),
    true,
  );
});

test("referenced candidate blocks the gate", () => {
  const result = evaluateExecutionGate({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      ...createBaseOptions(),
      operatorDecision: "request_review",
    },
    report: buildBrandingOrphanDryRunReport({
      generatedAt: "2026-06-28T00:00:00.000Z",
      references: [
        {
          id: "asset-1",
          storageBucket: "brand-assets",
          storagePath: `${tenantId}/logo/asset-live/neon-logo.png`,
          updatedAt: null,
          userId: tenantId,
          withinExpectedBucket: true,
        },
      ],
      storageObjects: [
        {
          createdAt: null,
          lastAccessedAt: null,
          metadata: { size: 512 },
          path: `${tenantId}/logo/asset-live/neon-logo.png`,
          updatedAt: null,
        },
      ],
      targetEnvironment: {
        environment: "production",
        findings: [],
        source: "explicit",
      },
      userId: tenantId,
    }),
  });

  assert.equal(result.decision, "blocked");
  assert.equal(result.blockedCandidates[0].classification, "referenced");
});

test("unknown candidate blocks the gate", () => {
  const result = evaluateExecutionGate({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      ...createBaseOptions(),
      operatorDecision: "request_review",
    },
    report: buildBrandingOrphanDryRunReport({
      generatedAt: "2026-06-28T00:00:00.000Z",
      references: [],
      storageObjects: [
        {
          createdAt: null,
          lastAccessedAt: null,
          metadata: { size: 512 },
          path: `${tenantId}/legacy-folder/odd-shape/file.png`,
          updatedAt: null,
        },
      ],
      targetEnvironment: {
        environment: "production",
        findings: [],
        source: "explicit",
      },
      userId: tenantId,
    }),
  });

  assert.equal(result.decision, "blocked");
  assert.equal(result.blockedCandidates[0].classification, "unknown");
});

test("out_of_scope candidate blocks the gate", () => {
  const result = evaluateExecutionGate({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      ...createBaseOptions(),
      operatorDecision: "request_review",
    },
    report: buildBrandingOrphanDryRunReport({
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
    }),
  });

  assert.equal(result.decision, "blocked");
  assert.equal(result.blockedCandidates[0].classification, "out_of_scope");
});

test("wrong bucket blocks the gate", () => {
  const report = createOrphanCandidateReport();
  report.objects[0].bucket = "other-bucket";

  const result = evaluateExecutionGate({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      ...createBaseOptions(),
      operatorDecision: "request_review",
    },
    report,
  });

  assert.equal(result.decision, "blocked");
  assert.equal(
    result.blockedCandidates[0].failureCodes.includes("wrong_bucket"),
    true,
  );
});

test("cross-tenant prefix blocks the gate", () => {
  const report = createOrphanCandidateReport();
  report.objects[0].pathContract.tenantScopedPrefix = false;

  const result = evaluateExecutionGate({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      ...createBaseOptions(),
      operatorDecision: "request_review",
    },
    report,
  });

  assert.equal(result.decision, "blocked");
  assert.equal(
    result.blockedCandidates[0].failureCodes.includes(
      "cross_tenant_or_invalid_prefix",
    ),
    true,
  );
});

test("zero candidates remain safe and do not auto-approve", () => {
  const result = evaluateExecutionGate({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: createBaseOptions(),
    report: buildBrandingOrphanDryRunReport({
      generatedAt: "2026-06-28T00:00:00.000Z",
      references: [],
      storageObjects: [],
      targetEnvironment: {
        environment: "production",
        findings: [],
        source: "explicit",
      },
      userId: tenantId,
    }),
  });

  assert.equal(result.decision, "blocked");
  assert.equal(result.summary.zeroCandidateSafe, true);
  assert.equal(result.evaluation.operatorGateSatisfied, false);
});

test("approval output is secret-safe", () => {
  const result = evaluateExecutionGate({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      ...createBaseOptions(),
      operatorDecision: "approve",
      approvalSha: candidateSha,
      approvalTargetEnvironment: "production",
      approvalUserId: tenantId,
      approvedAt: "2026-06-28T00:01:00.000Z",
    },
    report: createOrphanCandidateReport(),
  });
  const jsonOutput = formatReport(result, "json");
  const textOutput = formatReport(result, "text");

  assert.equal(jsonOutput.includes("https://"), false);
  assert.equal(textOutput.includes("https://"), false);
  assert.equal(jsonOutput.toLowerCase().includes("signed url"), false);
  assert.equal(textOutput.toLowerCase().includes("signed url"), false);
  assert.equal(jsonOutput.includes(tenantId), false);
  assert.equal(textOutput.includes(tenantId), false);
});

test("--execute remains not implemented and blocked", () => {
  const result = evaluateExecutionGate({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      ...createBaseOptions(),
      execute: true,
      operatorDecision: "request_review",
    },
    report: createOrphanCandidateReport(),
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

test("gate evaluation stays read-only and does not touch mutating helpers", () => {
  let removeCalls = 0;
  let deleteCalls = 0;
  let updateCalls = 0;
  let upsertCalls = 0;
  const report = {
    ...createOrphanCandidateReport(),
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

  const result = evaluateExecutionGate({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      ...createBaseOptions(),
      operatorDecision: "request_review",
    },
    report,
  });

  assert.equal(result.evaluation.executionImplemented, false);
  assert.equal(removeCalls, 0);
  assert.equal(deleteCalls, 0);
  assert.equal(updateCalls, 0);
  assert.equal(upsertCalls, 0);
});

test("explicit approval can expire", () => {
  const result = evaluateExecutionGate({
    now: new Date("2026-06-28T02:00:00.000Z"),
    options: {
      ...createBaseOptions(),
      approvalMaxAgeMinutes: 10,
      maxEvidenceAgeMinutes: 180,
      operatorDecision: "approve",
      approvalSha: candidateSha,
      approvalTargetEnvironment: "production",
      approvalUserId: tenantId,
      approvedAt: "2026-06-28T00:01:00.000Z",
    },
    report: createOrphanCandidateReport(),
  });

  assert.equal(result.decision, "expired");
  assert.equal(
    result.failures.some((failure) => failure.code === "approval_expired"),
    true,
  );
});

function createBaseOptions() {
  return {
    approvalMaxAgeMinutes: 30,
    approvalSha: undefined,
    approvalTargetEnvironment: undefined,
    approvalUserId: undefined,
    approvedAt: undefined,
    currentSha: candidateSha,
    execute: false,
    format: "json",
    maxDeleteLimit: 5,
    maxEvidenceAgeMinutes: 30,
    operatorDecision: "not_requested",
    reportFile: "unused.json",
    reportSha: candidateSha,
    targetEnvironment: "production",
    userId: tenantId,
  };
}

function createOrphanCandidateReport() {
  return buildBrandingOrphanDryRunReport({
    generatedAt: "2026-06-28T00:00:00.000Z",
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
