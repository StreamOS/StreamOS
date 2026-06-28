#!/usr/bin/env node

const { consumeValueFlag } = require("./lib/cli-args.cjs");
const {
  DEFAULT_FORMAT,
  evaluateExecutionContract,
} = require("./branding-orphan-execution-contract.cjs");
const {
  EXECUTION_ALLOWED_TARGET_ENVIRONMENTS,
  readDryRunReportFile,
} = require("./branding-orphan-execution-contract.cjs");
const {
  normalizeTargetEnvironmentName,
} = require("./branding-orphan-dry-run.cjs");

const DEFAULT_APPROVAL_MAX_AGE_MINUTES = 30;
const DEFAULT_REPORT_SCHEMA_VERSION = "branding_orphan_execution_gate/v1";
const GATE_STATES = [
  "not_requested",
  "blocked",
  "ready_for_operator_review",
  "approved_for_future_execution",
  "expired",
  "invalid",
];
const OPERATOR_DECISIONS = [
  "not_requested",
  "request_review",
  "approve",
  "reject",
];
const SHA_PATTERN = /^[a-f0-9]{7,40}$/i;

function parseArgs(argv) {
  const options = {
    approvalMaxAgeMinutes: DEFAULT_APPROVAL_MAX_AGE_MINUTES,
    approvalSha: undefined,
    approvalTargetEnvironment: undefined,
    approvalUserId: undefined,
    approvedAt: undefined,
    currentSha: undefined,
    execute: false,
    format: DEFAULT_FORMAT,
    help: false,
    maxDeleteLimit: undefined,
    maxEvidenceAgeMinutes: undefined,
    operatorDecision: "not_requested",
    reportFile: undefined,
    reportSha: undefined,
    targetEnvironment: undefined,
    userId: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--") {
      continue;
    }

    if (arg === "--execute") {
      options.execute = true;
      continue;
    }

    const approvalMaxAgeMatch = consumeValueFlag(
      argv,
      index,
      "approval-max-age-minutes",
    );

    if (approvalMaxAgeMatch.matched) {
      options.approvalMaxAgeMinutes = parsePositiveInteger(
        approvalMaxAgeMatch.value.trim(),
        "--approval-max-age-minutes",
      );
      index = approvalMaxAgeMatch.nextIndex;
      continue;
    }

    const approvalShaMatch = consumeValueFlag(argv, index, "approval-sha");

    if (approvalShaMatch.matched) {
      options.approvalSha = approvalShaMatch.value.trim();
      index = approvalShaMatch.nextIndex;
      continue;
    }

    const approvalTargetEnvironmentMatch = consumeValueFlag(
      argv,
      index,
      "approval-target-environment",
    );

    if (approvalTargetEnvironmentMatch.matched) {
      options.approvalTargetEnvironment = normalizeTargetEnvironmentName(
        approvalTargetEnvironmentMatch.value.trim(),
      );
      index = approvalTargetEnvironmentMatch.nextIndex;
      continue;
    }

    const approvalUserIdMatch = consumeValueFlag(
      argv,
      index,
      "approval-user-id",
    );

    if (approvalUserIdMatch.matched) {
      options.approvalUserId = approvalUserIdMatch.value.trim();
      index = approvalUserIdMatch.nextIndex;
      continue;
    }

    const approvedAtMatch = consumeValueFlag(argv, index, "approved-at");

    if (approvedAtMatch.matched) {
      options.approvedAt = approvedAtMatch.value.trim();
      index = approvedAtMatch.nextIndex;
      continue;
    }

    const currentShaMatch = consumeValueFlag(argv, index, "current-sha");

    if (currentShaMatch.matched) {
      options.currentSha = currentShaMatch.value.trim();
      index = currentShaMatch.nextIndex;
      continue;
    }

    const formatMatch = consumeValueFlag(argv, index, "format");

    if (formatMatch.matched) {
      options.format = formatMatch.value.trim();
      index = formatMatch.nextIndex;
      continue;
    }

    const maxDeleteLimitMatch = consumeValueFlag(
      argv,
      index,
      "max-delete-limit",
    );

    if (maxDeleteLimitMatch.matched) {
      options.maxDeleteLimit = parsePositiveInteger(
        maxDeleteLimitMatch.value.trim(),
        "--max-delete-limit",
      );
      index = maxDeleteLimitMatch.nextIndex;
      continue;
    }

    const maxEvidenceAgeMatch = consumeValueFlag(
      argv,
      index,
      "max-evidence-age-minutes",
    );

    if (maxEvidenceAgeMatch.matched) {
      options.maxEvidenceAgeMinutes = parsePositiveInteger(
        maxEvidenceAgeMatch.value.trim(),
        "--max-evidence-age-minutes",
      );
      index = maxEvidenceAgeMatch.nextIndex;
      continue;
    }

    const operatorDecisionMatch = consumeValueFlag(
      argv,
      index,
      "operator-decision",
    );

    if (operatorDecisionMatch.matched) {
      options.operatorDecision = operatorDecisionMatch.value
        .trim()
        .toLowerCase();
      index = operatorDecisionMatch.nextIndex;
      continue;
    }

    const reportFileMatch = consumeValueFlag(argv, index, "report-file");

    if (reportFileMatch.matched) {
      options.reportFile = reportFileMatch.value.trim();
      index = reportFileMatch.nextIndex;
      continue;
    }

    const reportShaMatch = consumeValueFlag(argv, index, "report-sha");

    if (reportShaMatch.matched) {
      options.reportSha = reportShaMatch.value.trim();
      index = reportShaMatch.nextIndex;
      continue;
    }

    const targetEnvironmentMatch = consumeValueFlag(
      argv,
      index,
      "target-environment",
    );

    if (targetEnvironmentMatch.matched) {
      options.targetEnvironment = normalizeTargetEnvironmentName(
        targetEnvironmentMatch.value.trim(),
      );
      index = targetEnvironmentMatch.nextIndex;
      continue;
    }

    const userIdMatch = consumeValueFlag(argv, index, "user-id");

    if (userIdMatch.matched) {
      options.userId = userIdMatch.value.trim();
      index = userIdMatch.nextIndex;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!["json", "text"].includes(options.format)) {
    throw new Error("--format must be one of: text, json.");
  }

  if (options.help) {
    return options;
  }

  if (!OPERATOR_DECISIONS.includes(options.operatorDecision)) {
    throw new Error(
      `--operator-decision must be one of: ${OPERATOR_DECISIONS.join(", ")}.`,
    );
  }

  if (!options.reportFile) {
    throw new Error("--report-file is required.");
  }

  if (!options.userId) {
    throw new Error("--user-id is required.");
  }

  if (!options.targetEnvironment) {
    throw new Error("--target-environment is required.");
  }

  if (
    !EXECUTION_ALLOWED_TARGET_ENVIRONMENTS.includes(options.targetEnvironment)
  ) {
    throw new Error(
      `--target-environment must be one of: ${EXECUTION_ALLOWED_TARGET_ENVIRONMENTS.join(", ")}.`,
    );
  }

  if (options.maxDeleteLimit === undefined) {
    throw new Error("--max-delete-limit is required.");
  }

  if (options.maxEvidenceAgeMinutes === undefined) {
    throw new Error("--max-evidence-age-minutes is required.");
  }

  if (!options.reportSha) {
    throw new Error("--report-sha is required.");
  }

  if (!options.currentSha) {
    throw new Error("--current-sha is required.");
  }

  return options;
}

function parsePositiveInteger(value, flagName) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${flagName} must be a positive integer.`);
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }

  return parsed;
}

function printHelp() {
  console.log(`StreamOS brand asset orphan cleanup execution gate

Usage:
  pnpm branding:orphan-execution-gate -- --report-file orphan-report.json --report-sha 473f6697 --current-sha 473f6697 --user-id 11111111-1111-4111-8111-111111111111 --target-environment production --max-delete-limit 5 --max-evidence-age-minutes 30 --operator-decision request_review --format text

Options:
  --report-file PATH                JSON report produced by the orphan dry-run.
  --report-sha SHA                  SHA bound to the dry-run evidence. Required.
  --current-sha SHA                 Current candidate SHA for the future execution slice. Required.
  --user-id ID                      Explicit tenant/user scope. Required.
  --target-environment ENV          Explicit environment binding. Required.
                                    Allowed: ${EXECUTION_ALLOWED_TARGET_ENVIRONMENTS.join(", ")}.
  --max-delete-limit NUMBER         Maximum eligible candidates allowed. Required.
  --max-evidence-age-minutes NUM    Maximum age of the dry-run report. Required.
  --operator-decision DECISION      Required approval intent.
                                    Allowed: ${OPERATOR_DECISIONS.join(", ")}.
  --approval-sha SHA                Required when --operator-decision approve.
  --approval-user-id ID             Required when --operator-decision approve.
  --approval-target-environment ENV Required when --operator-decision approve.
  --approved-at ISO8601             Required when --operator-decision approve.
  --approval-max-age-minutes NUM    Approval validity window. Default: ${DEFAULT_APPROVAL_MAX_AGE_MINUTES}
  --execute                         Reserved future flag. Always blocked.
  --format text|json                Output format. Default: ${DEFAULT_FORMAT}
`);
}

function evaluateExecutionGate({ now = new Date(), options, report }) {
  const contractReport = evaluateExecutionContract({
    now,
    options,
    report,
  });
  const failures = [...contractReport.failures];
  const binding = buildBindingSummary(options);
  let gateState;

  if (!isValidSha(options.reportSha) || !isValidSha(options.currentSha)) {
    failures.push(
      buildFailure(
        "invalid_sha_binding",
        "Both --report-sha and --current-sha must be valid commit-like SHAs.",
      ),
    );
    gateState = "invalid";
  } else if (options.reportSha !== options.currentSha) {
    failures.push(
      buildFailure(
        "mismatched_main_sha_report_sha",
        "The current SHA does not match the SHA bound to the dry-run report.",
      ),
    );
    gateState = "blocked";
  } else if (contractReport.decision !== "ready_for_operator_gate") {
    gateState = "blocked";
  } else {
    gateState = resolveOperatorGateState({
      failures,
      now,
      options,
    });
  }

  return {
    approval: {
      approvalMaxAgeMinutes: options.approvalMaxAgeMinutes,
      approvedAt: options.approvedAt ?? null,
      explicitOperatorDecision: options.operatorDecision,
      futureExecutionApproved: gateState === "approved_for_future_execution",
    },
    binding,
    decision: gateState,
    evaluation: {
      executeFlagBlocked: options.execute,
      executionImplemented: false,
      executionRemainsBlocked: true,
      nextSlice: "Brand Asset Orphan-Cleanup Execution Implementation Plan",
      operatorGateSatisfied: gateState === "approved_for_future_execution",
      states: GATE_STATES,
    },
    evidence: {
      contractDecision: contractReport.decision,
      evidenceAgeMinutes: contractReport.evidence.evidenceAgeMinutes,
      reportSchemaVersion: report?.schemaVersion ?? null,
      reportSha: options.reportSha,
    },
    failures,
    schemaVersion: DEFAULT_REPORT_SCHEMA_VERSION,
    summary: {
      blockedCandidateCount: contractReport.summary.blockedCandidateCount,
      eligibleCandidateCount: contractReport.summary.eligibleCandidateCount,
      maxDeleteLimit: contractReport.summary.maxDeleteLimit,
      operatorDecision: options.operatorDecision,
      totalObjects: contractReport.summary.totalObjects,
      zeroCandidateSafe: contractReport.summary.eligibleCandidateCount === 0,
    },
    blockedCandidates: contractReport.blockedCandidates,
    eligibleCandidates: contractReport.eligibleCandidates,
  };
}

function resolveOperatorGateState({ failures, now, options }) {
  switch (options.operatorDecision) {
    case "not_requested":
      return "not_requested";
    case "request_review":
      return "ready_for_operator_review";
    case "reject":
      failures.push(
        buildFailure(
          "operator_rejected",
          "The operator decision explicitly rejected future execution approval.",
        ),
      );
      return "blocked";
    case "approve":
      return resolveApprovalState({ failures, now, options });
    default:
      failures.push(
        buildFailure(
          "invalid_operator_decision",
          "The operator decision is not recognized by the execution gate.",
        ),
      );
      return "invalid";
  }
}

function resolveApprovalState({ failures, now, options }) {
  if (!options.approvalSha) {
    failures.push(
      buildFailure(
        "missing_approval_sha",
        "An explicit approval SHA is required for future execution approval.",
      ),
    );
    return "invalid";
  }

  if (!options.approvalUserId) {
    failures.push(
      buildFailure(
        "missing_approval_user_id",
        "An explicit approval user scope is required for future execution approval.",
      ),
    );
    return "invalid";
  }

  if (!options.approvalTargetEnvironment) {
    failures.push(
      buildFailure(
        "missing_approval_target_environment",
        "An explicit approval target environment is required for future execution approval.",
      ),
    );
    return "invalid";
  }

  if (!options.approvedAt) {
    failures.push(
      buildFailure(
        "missing_approved_at",
        "An explicit approval timestamp is required for future execution approval.",
      ),
    );
    return "invalid";
  }

  if (!isValidSha(options.approvalSha)) {
    failures.push(
      buildFailure(
        "invalid_approval_sha",
        "The approval SHA must be a valid commit-like SHA.",
      ),
    );
    return "invalid";
  }

  const approvedAt = parseIsoTimestamp(options.approvedAt);

  if (approvedAt === null) {
    failures.push(
      buildFailure(
        "invalid_approved_at",
        "The approval timestamp must be a valid ISO-8601 string.",
      ),
    );
    return "invalid";
  }

  if (options.approvalSha !== options.currentSha) {
    failures.push(
      buildFailure(
        "approval_sha_mismatch",
        "The approval SHA does not match the current candidate SHA.",
      ),
    );
    return "invalid";
  }

  if (options.approvalUserId !== options.userId) {
    failures.push(
      buildFailure(
        "approval_user_id_mismatch",
        "The approval user scope does not match the explicit --user-id.",
      ),
    );
    return "invalid";
  }

  if (options.approvalTargetEnvironment !== options.targetEnvironment) {
    failures.push(
      buildFailure(
        "approval_target_environment_mismatch",
        "The approval target environment does not match the explicit --target-environment.",
      ),
    );
    return "invalid";
  }

  const approvalAgeMinutes = Math.max(
    0,
    Math.floor((now.getTime() - approvedAt.getTime()) / 60000),
  );

  if (approvalAgeMinutes > options.approvalMaxAgeMinutes) {
    failures.push(
      buildFailure(
        "approval_expired",
        `The operator approval is ${approvalAgeMinutes} minutes old and exceeds the configured approval window.`,
      ),
    );
    return "expired";
  }

  return "approved_for_future_execution";
}

function buildBindingSummary(options) {
  return {
    approvalSha: options.approvalSha ?? null,
    approvalTargetEnvironment: options.approvalTargetEnvironment ?? null,
    approvalUserId: options.approvalUserId ? "<redacted-user>" : null,
    currentSha: options.currentSha ?? null,
    reportSha: options.reportSha ?? null,
    targetEnvironment: options.targetEnvironment ?? null,
    userId: options.userId ? "<redacted-user>" : null,
  };
}

function buildFailure(code, message) {
  return { code, message };
}

function isValidSha(value) {
  return typeof value === "string" && SHA_PATTERN.test(value.trim());
}

function parseIsoTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatReport(report, format) {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }

  return renderTextReport(report);
}

function renderTextReport(report) {
  const lines = [
    "StreamOS brand asset orphan cleanup execution gate",
    "",
    `- decision: ${report.decision}`,
    `- execution implemented: no`,
    `- execution remains blocked: yes`,
    `- operator decision: ${report.summary.operatorDecision}`,
    `- operator gate satisfied: ${report.evaluation.operatorGateSatisfied ? "yes" : "no"}`,
    `- report sha: ${report.binding.reportSha ?? "<missing>"}`,
    `- current sha: ${report.binding.currentSha ?? "<missing>"}`,
    `- target environment: ${report.binding.targetEnvironment ?? "<missing>"}`,
    `- user context: ${report.binding.userId ?? "<missing>"}`,
    `- eligible candidates: ${report.summary.eligibleCandidateCount}`,
    `- blocked candidates: ${report.summary.blockedCandidateCount}`,
    `- total objects: ${report.summary.totalObjects}`,
    `- zero candidates safe: ${report.summary.zeroCandidateSafe ? "yes" : "no"}`,
  ];

  if (report.failures.length > 0) {
    lines.push("");
    lines.push("failures:");

    for (const failure of report.failures) {
      lines.push(`- ${failure.code}: ${failure.message}`);
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
  const gateReport = evaluateExecutionGate({
    options,
    report,
  });

  console.log(formatReport(gateReport, options.format));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Branding orphan execution gate failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_APPROVAL_MAX_AGE_MINUTES,
  DEFAULT_REPORT_SCHEMA_VERSION,
  GATE_STATES,
  OPERATOR_DECISIONS,
  buildBindingSummary,
  buildFailure,
  evaluateExecutionGate,
  formatReport,
  isValidSha,
  parseArgs,
  parseIsoTimestamp,
  renderTextReport,
  resolveApprovalState,
  resolveOperatorGateState,
};
