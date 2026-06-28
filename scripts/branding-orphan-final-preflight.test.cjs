const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBrandingOrphanDryRunReport,
} = require("./branding-orphan-dry-run.cjs");
const {
  evaluateFinalPreflight,
  formatReport,
  parseArgs,
} = require("./branding-orphan-final-preflight.cjs");

const tenantId = "11111111-1111-4111-8111-111111111111";
const currentSha = "2aea77361b783e1629771ee1d26820b863e0afc5";

test("happy path with 0 candidates remains safe", () => {
  const result = evaluateFinalPreflight({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: createApprovedOptions(),
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

  assert.equal(result.decision, "passed_with_warnings");
  assert.equal(result.summary.zeroCandidateSafe, true);
  assert.equal(result.evaluation.executionRemainsBlocked, true);
});

test("happy path with candidates simulates only and does not delete", () => {
  const result = evaluateFinalPreflight({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: createApprovedOptions(),
    report: createOrphanCandidateReport(),
  });

  assert.equal(result.decision, "passed");
  assert.equal(result.simulatedCandidates.length, 1);
  assert.equal(result.evaluation.deleteSimulationOnly, true);
  assert.equal(result.evaluation.executionRemainsBlocked, true);
});

test("missing user id is rejected at parse time", () => {
  assert.throws(
    () =>
      parseArgs([
        "--report-file",
        "report.json",
        "--report-sha",
        currentSha,
        "--current-sha",
        currentSha,
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

test("missing target environment is rejected at parse time", () => {
  assert.throws(
    () =>
      parseArgs([
        "--report-file",
        "report.json",
        "--report-sha",
        currentSha,
        "--current-sha",
        currentSha,
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

test("missing operator approval blocks", () => {
  const result = evaluateFinalPreflight({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      ...createApprovedOptions(),
      operatorDecision: "not_requested",
      approvalSha: undefined,
      approvalTargetEnvironment: undefined,
      approvalUserId: undefined,
      approvedAt: undefined,
    },
    report: createOrphanCandidateReport(),
  });

  assert.equal(result.decision, "blocked");
  assert.equal(
    result.failures.some(
      (failure) => failure.code === "operator_approval_required",
    ),
    true,
  );
});

test("stale evidence blocks", () => {
  const result = evaluateFinalPreflight({
    now: new Date("2026-06-28T02:00:00.000Z"),
    options: createApprovedOptions(),
    report: createOrphanCandidateReport(),
  });

  assert.equal(result.decision, "blocked");
  assert.equal(
    result.failures.some((failure) => failure.code === "stale_evidence"),
    true,
  );
});

test("sha mismatch blocks", () => {
  const result = evaluateFinalPreflight({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      ...createApprovedOptions(),
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

test("target environment mismatch blocks", () => {
  const result = evaluateFinalPreflight({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: createApprovedOptions(),
    report: buildBrandingOrphanDryRunReport({
      generatedAt: "2026-06-28T00:00:00.000Z",
      references: [],
      storageObjects: [
        {
          createdAt: null,
          lastAccessedAt: null,
          metadata: { size: 512 },
          path: `${tenantId}/logo/asset-live/replacements/uuid-neon-logo.png`,
          updatedAt: null,
        },
      ],
      targetEnvironment: {
        environment: "staging",
        findings: [],
        source: "explicit",
      },
      userId: tenantId,
    }),
  });

  assert.equal(result.decision, "blocked");
  assert.equal(
    result.failures.some(
      (failure) => failure.code === "target_environment_mismatch",
    ),
    true,
  );
});

test("user id mismatch blocks", () => {
  const result = evaluateFinalPreflight({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: createApprovedOptions(),
    report: buildBrandingOrphanDryRunReport({
      generatedAt: "2026-06-28T00:00:00.000Z",
      references: [],
      storageObjects: [
        {
          createdAt: null,
          lastAccessedAt: null,
          metadata: { size: 512 },
          path: `${tenantId}/logo/asset-live/replacements/uuid-neon-logo.png`,
          updatedAt: null,
        },
      ],
      targetEnvironment: {
        environment: "production",
        findings: [],
        source: "explicit",
      },
      userId: "22222222-2222-4222-8222-222222222222",
    }),
  });

  assert.equal(result.decision, "blocked");
  assert.equal(
    result.failures.some((failure) => failure.code === "user_id_mismatch"),
    true,
  );
});

test("wrong bucket blocks", () => {
  const report = createOrphanCandidateReport();
  report.objects[0].bucket = "other-bucket";

  const result = evaluateFinalPreflight({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: createApprovedOptions(),
    report,
  });

  assert.equal(result.decision, "blocked");
  assert.equal(
    result.blockedCandidates[0].failureCodes.includes("wrong_bucket"),
    true,
  );
});

test("cross-tenant prefix blocks", () => {
  const report = createOrphanCandidateReport();
  report.objects[0].pathContract.tenantScopedPrefix = false;

  const result = evaluateFinalPreflight({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: createApprovedOptions(),
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

test("referenced candidate blocks", () => {
  const result = evaluateFinalPreflight({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: createApprovedOptions(),
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

test("unknown candidate blocks", () => {
  const result = evaluateFinalPreflight({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: createApprovedOptions(),
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

test("out_of_scope candidate blocks", () => {
  const result = evaluateFinalPreflight({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: createApprovedOptions(),
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

test("max-delete-limit blocks oversized candidate sets", () => {
  const result = evaluateFinalPreflight({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      ...createApprovedOptions(),
      maxDeleteLimit: 1,
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

test("secret-bearing output is blocked and redacted", () => {
  const report = createOrphanCandidateReport();
  report.objects[0].redactedPath = "https://private.example.test/signed-url";

  const result = evaluateFinalPreflight({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: createApprovedOptions(),
    report,
  });
  const jsonOutput = formatReport(result, "json");
  const textOutput = formatReport(result, "text");

  assert.equal(result.decision, "blocked");
  assert.equal(jsonOutput.includes("https://"), false);
  assert.equal(textOutput.includes("https://"), false);
  assert.equal(jsonOutput.includes(tenantId), false);
  assert.equal(textOutput.includes(tenantId), false);
});

test("--execute remains blocked and not implemented", () => {
  const result = evaluateFinalPreflight({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: {
      ...createApprovedOptions(),
      execute: true,
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

test("final preflight evaluation stays read-only and does not touch mutating helpers", () => {
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

  const result = evaluateFinalPreflight({
    now: new Date("2026-06-28T00:05:00.000Z"),
    options: createApprovedOptions(),
    report,
  });

  assert.equal(result.evaluation.deleteSimulationOnly, true);
  assert.equal(removeCalls, 0);
  assert.equal(deleteCalls, 0);
  assert.equal(updateCalls, 0);
  assert.equal(upsertCalls, 0);
});

function createApprovedOptions() {
  return {
    approvalMaxAgeMinutes: 30,
    approvalSha: currentSha,
    approvalTargetEnvironment: "production",
    approvalUserId: tenantId,
    approvedAt: "2026-06-28T00:01:00.000Z",
    currentSha,
    execute: false,
    format: "json",
    maxDeleteLimit: 5,
    maxEvidenceAgeMinutes: 30,
    operatorDecision: "approve",
    reportFile: "unused.json",
    reportSha: currentSha,
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
