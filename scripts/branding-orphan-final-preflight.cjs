#!/usr/bin/env node

const {
  DEFAULT_FORMAT,
  buildFailure,
  evaluateExecutionContract,
  readDryRunReportFile,
} = require("./branding-orphan-execution-contract.cjs");
const {
  buildBindingSummary,
  parseArgs: parseGateArgs,
  resolveApprovalState,
} = require("./branding-orphan-execution-gate.cjs");

const DEFAULT_REPORT_SCHEMA_VERSION = "branding_orphan_final_preflight/v1";
const FINAL_PREFLIGHT_DECISIONS = [
  "passed",
  "passed_with_warnings",
  "blocked",
  "incomplete",
];

function parseArgs(argv) {
  return parseGateArgs(argv);
}

function printHelp() {
  console.log(`StreamOS brand asset orphan cleanup final preflight

Usage:
  pnpm branding:orphan-final-preflight -- --report-file orphan-report.json --report-sha 2aea7736 --current-sha 2aea7736 --user-id 11111111-1111-4111-8111-111111111111 --target-environment production --max-delete-limit 5 --max-evidence-age-minutes 30 --operator-decision approve --approval-sha 2aea7736 --approval-user-id 11111111-1111-4111-8111-111111111111 --approval-target-environment production --approved-at 2026-06-28T00:01:00.000Z --format text

Options:
  --report-file PATH                JSON report produced by the orphan dry-run.
  --report-sha SHA                  SHA bound to the dry-run evidence. Required.
  --current-sha SHA                 Current candidate SHA for final preflight. Required.
  --user-id ID                      Explicit tenant/user scope. Required.
  --target-environment ENV          Explicit environment binding. Required.
  --max-delete-limit NUMBER         Maximum eligible candidates allowed. Required.
  --max-evidence-age-minutes NUM    Maximum age of the dry-run report. Required.
  --operator-decision DECISION      Approval intent. Must resolve to explicit approval.
  --approval-sha SHA                Required when --operator-decision approve.
  --approval-user-id ID             Required when --operator-decision approve.
  --approval-target-environment ENV Required when --operator-decision approve.
  --approved-at ISO8601             Required when --operator-decision approve.
  --approval-max-age-minutes NUM    Approval validity window.
  --execute                         Reserved future flag. Always blocked.
  --format text|json                Output format. Default: ${DEFAULT_FORMAT}
`);
}

function evaluateFinalPreflight({ now = new Date(), options, report }) {
  const contractReport = evaluateExecutionContract({
    now,
    options,
    report,
  });
  const failures = contractReport.failures
    .filter((failure) => failure.code !== "zero_eligible_candidates")
    .map(cloneFailure);
  const warnings = [];
  const eligibleCandidates =
    contractReport.eligibleCandidates.map(sanitizeCandidate);
  const blockedCandidates =
    contractReport.blockedCandidates.map(sanitizeCandidate);
  const zeroCandidateSafe =
    eligibleCandidates.length === 0 &&
    blockedCandidates.length === 0 &&
    contractReport.summary.totalObjects === 0;
  const binding = buildBindingSummary(options);
  const shaBinding = buildShaBinding(options);

  if (blockedCandidates.length > 0) {
    failures.push(
      buildFailure(
        "ineligible_candidates_present",
        "The final preflight found candidates that remain ineligible for any future delete simulation.",
      ),
    );
  }

  if (!shaBinding.valid) {
    failures.push(
      buildFailure(
        "mismatched_main_sha_report_sha",
        "The current SHA does not match the SHA bound to the final preflight input.",
      ),
    );
  }

  const approval = resolvePreflightApproval({
    failures,
    now,
    options,
  });

  if (zeroCandidateSafe) {
    warnings.push(
      buildWarning(
        "zero_candidates_safe",
        "The final preflight found zero eligible candidates. This is safe and remains non-destructive.",
      ),
    );
  }

  const hasBlockingFailures = failures.length > 0;
  const decision = hasBlockingFailures
    ? "blocked"
    : zeroCandidateSafe
      ? "passed_with_warnings"
      : "passed";

  return {
    approval,
    binding,
    decision,
    evaluation: {
      decisions: FINAL_PREFLIGHT_DECISIONS,
      deleteSimulationOnly: true,
      executeFlagBlocked: options.execute,
      executionRemainsBlocked: true,
      nextSlice: "Brand Asset Orphan-Cleanup Execution Approval Package",
      operatorApprovalSatisfied:
        approval.state === "approved_for_future_execution",
    },
    evidence: {
      contractDecision: contractReport.decision,
      evidenceAgeMinutes: contractReport.evidence.evidenceAgeMinutes,
      generatedAt: contractReport.evidence.generatedAt,
      reportSchemaVersion: report?.schemaVersion ?? null,
      reportSha: options.reportSha,
      targetEnvironment: options.targetEnvironment,
    },
    gates: buildGateResults({
      approvalState: approval.state,
      contractReport,
      options,
      report,
      shaBinding,
      zeroCandidateSafe,
    }),
    failures,
    warnings,
    schemaVersion: DEFAULT_REPORT_SCHEMA_VERSION,
    summary: {
      blockedCandidateCount: blockedCandidates.length,
      candidateCounts: {
        orphan_candidate:
          contractReport.summary.classifications.orphan_candidate,
        out_of_scope: contractReport.summary.classifications.out_of_scope,
        referenced: contractReport.summary.classifications.referenced,
        unknown: contractReport.summary.classifications.unknown,
      },
      eligibleCandidateCount: eligibleCandidates.length,
      maxDeleteLimit: options.maxDeleteLimit,
      totalObjects: contractReport.summary.totalObjects,
      zeroCandidateSafe,
    },
    blockedCandidates,
    simulatedCandidates: eligibleCandidates,
  };
}

function resolvePreflightApproval({ failures, now, options }) {
  switch (options.operatorDecision) {
    case "approve": {
      const state = resolveApprovalState({
        failures,
        now,
        options,
      });

      return {
        approvedAt: options.approvedAt ?? null,
        approvalMaxAgeMinutes: options.approvalMaxAgeMinutes,
        explicitOperatorDecision: options.operatorDecision,
        state,
      };
    }
    case "reject":
      failures.push(
        buildFailure(
          "operator_rejected",
          "The final preflight requires explicit operator approval and cannot proceed after rejection.",
        ),
      );
      return buildApprovalSummary(options, "blocked");
    case "request_review":
    case "not_requested":
    default:
      failures.push(
        buildFailure(
          "operator_approval_required",
          "The final preflight requires explicit non-expired operator approval.",
        ),
      );
      return buildApprovalSummary(options, "blocked");
  }
}

function buildApprovalSummary(options, state) {
  return {
    approvedAt: options.approvedAt ?? null,
    approvalMaxAgeMinutes: options.approvalMaxAgeMinutes,
    explicitOperatorDecision: options.operatorDecision,
    state,
  };
}

function buildShaBinding(options) {
  const reportSha =
    typeof options.reportSha === "string" ? options.reportSha : "";
  const currentSha =
    typeof options.currentSha === "string" ? options.currentSha : "";

  return {
    currentSha,
    reportSha,
    valid:
      /^[a-f0-9]{7,40}$/i.test(reportSha) &&
      /^[a-f0-9]{7,40}$/i.test(currentSha) &&
      reportSha === currentSha,
  };
}

function buildGateResults({
  approvalState,
  contractReport,
  options,
  report,
  shaBinding,
  zeroCandidateSafe,
}) {
  return {
    approvalBoundToCurrentSha:
      approvalState === "approved_for_future_execution",
    bucketAllowlistExact:
      report?.bucket === "brand-assets" &&
      contractReport.blockedCandidates.every(
        (candidate) =>
          candidate.failureCodes.includes("wrong_bucket") === false,
      ),
    candidateEligibilityExact:
      contractReport.summary.classifications.referenced === 0 &&
      contractReport.summary.classifications.unknown === 0 &&
      contractReport.summary.classifications.out_of_scope === 0,
    explicitTargetEnvironment:
      contractReport.evidence.reportTargetSource === "explicit",
    maxDeleteLimitRespected:
      contractReport.summary.eligibleCandidateCount <= options.maxDeleteLimit,
    noMutationsExecuted: true,
    prefixLockExact: report?.scope?.prefix === `${options.userId}/`,
    secretSafeOutput:
      sanitizeBindingValue(options.userId) === "<redacted-user>" &&
      sanitizeBindingValue(options.approvalUserId) ===
        (options.approvalUserId ? "<redacted-user>" : null),
    shaBoundToCurrentMain: shaBinding.valid,
    staleEvidenceBlocked:
      contractReport.failures.some(
        (failure) => failure.code === "stale_evidence",
      ) === false,
    targetEnvironmentMatches:
      contractReport.evidence.reportTargetEnvironment ===
      options.targetEnvironment,
    userIdMatches: report?.scope?.userId === options.userId,
    zeroCandidatesSafe: zeroCandidateSafe,
  };
}

function buildWarning(code, message) {
  return { code, message };
}

function cloneFailure(failure) {
  return {
    code: failure.code,
    message: failure.message,
  };
}

function sanitizeCandidate(candidate) {
  return {
    ...candidate,
    redactedPath: sanitizeBindingValue(candidate.redactedPath, {
      allowTenantMarker: true,
    }),
  };
}

function sanitizeBindingValue(value, options = {}) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed === "<redacted-user>") {
    return trimmed;
  }

  if (
    options.allowTenantMarker === true &&
    /^<tenant>\//.test(trimmed) &&
    !/:\//.test(trimmed) &&
    !/[?#]/.test(trimmed)
  ) {
    return trimmed;
  }

  if (/:\//.test(trimmed) || /[?#]/.test(trimmed)) {
    return "<redacted-unsafe-path>";
  }

  if (/^[0-9a-f-]{8,}$/i.test(trimmed)) {
    return "<redacted-user>";
  }

  return trimmed;
}

function formatReport(report, format) {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }

  return renderTextReport(report);
}

function renderTextReport(report) {
  const lines = [
    "StreamOS brand asset orphan cleanup final preflight",
    "",
    `- decision: ${report.decision}`,
    `- delete simulation only: yes`,
    `- execution remains blocked: yes`,
    `- operator decision: ${report.approval.explicitOperatorDecision}`,
    `- operator approval satisfied: ${report.evaluation.operatorApprovalSatisfied ? "yes" : "no"}`,
    `- report sha: ${report.binding.reportSha ?? "<missing>"}`,
    `- current sha: ${report.binding.currentSha ?? "<missing>"}`,
    `- target environment: ${report.binding.targetEnvironment ?? "<missing>"}`,
    `- user context: ${report.binding.userId ?? "<missing>"}`,
    `- eligible candidates: ${report.summary.eligibleCandidateCount}`,
    `- blocked candidates: ${report.summary.blockedCandidateCount}`,
    `- total objects: ${report.summary.totalObjects}`,
    `- zero candidates safe: ${report.summary.zeroCandidateSafe ? "yes" : "no"}`,
  ];

  if (report.warnings.length > 0) {
    lines.push("");
    lines.push("warnings:");

    for (const warning of report.warnings) {
      lines.push(`- ${warning.code}: ${warning.message}`);
    }
  }

  if (report.failures.length > 0) {
    lines.push("");
    lines.push("failures:");

    for (const failure of report.failures) {
      lines.push(`- ${failure.code}: ${failure.message}`);
    }
  }

  if (report.simulatedCandidates.length > 0) {
    lines.push("");
    lines.push("simulated candidates:");

    for (const candidate of report.simulatedCandidates) {
      lines.push(`- ${candidate.redactedPath} (${candidate.classification})`);
    }
  }

  if (report.blockedCandidates.length > 0) {
    lines.push("");
    lines.push("blocked candidates:");

    for (const candidate of report.blockedCandidates) {
      lines.push(
        `- ${candidate.redactedPath} (${candidate.classification}; ${candidate.failureCodes.join(", ")})`,
      );
    }
  }

  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const report = readDryRunReportFile(options.reportFile);
  const preflightReport = evaluateFinalPreflight({
    options,
    report,
  });

  console.log(formatReport(preflightReport, options.format));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Branding orphan final preflight failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_REPORT_SCHEMA_VERSION,
  FINAL_PREFLIGHT_DECISIONS,
  buildGateResults,
  buildShaBinding,
  buildWarning,
  evaluateFinalPreflight,
  formatReport,
  parseArgs,
  printHelp,
  renderTextReport,
  sanitizeBindingValue,
  sanitizeCandidate,
};
