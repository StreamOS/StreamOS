#!/usr/bin/env node

const fs = require("node:fs");

const { consumeValueFlag } = require("./lib/cli-args.cjs");
const {
  BRAND_ASSET_STORAGE_BUCKET,
  normalizeTargetEnvironmentName,
} = require("./branding-orphan-dry-run.cjs");

const DEFAULT_FORMAT = "text";
const DEFAULT_REPORT_SCHEMA_VERSION = "branding_orphan_execution_contract/v1";
const EXECUTION_ALLOWED_TARGET_ENVIRONMENTS = [
  "local",
  "development",
  "staging",
  "production",
];
const OBJECT_CLASSIFICATIONS = new Set([
  "orphan_candidate",
  "out_of_scope",
  "referenced",
  "unknown",
]);

function parseArgs(argv) {
  const options = {
    execute: false,
    format: DEFAULT_FORMAT,
    help: false,
    maxDeleteLimit: undefined,
    maxEvidenceAgeMinutes: undefined,
    reportFile: undefined,
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

    const reportFileMatch = consumeValueFlag(argv, index, "report-file");

    if (reportFileMatch.matched) {
      options.reportFile = reportFileMatch.value.trim();
      index = reportFileMatch.nextIndex;
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
  console.log(`StreamOS brand asset orphan cleanup execution contract

Usage:
  pnpm branding:orphan-execution-contract -- --report-file orphan-report.json --user-id 11111111-1111-4111-8111-111111111111 --target-environment production --max-delete-limit 5 --max-evidence-age-minutes 30 --format text

Options:
  --report-file PATH              JSON report produced by the orphan dry-run.
  --user-id ID                    Explicit tenant/user scope. Required.
  --target-environment ENV        Explicit environment binding. Required.
                                  Allowed: ${EXECUTION_ALLOWED_TARGET_ENVIRONMENTS.join(", ")}.
  --max-delete-limit NUMBER       Maximum eligible candidates allowed. Required.
  --max-evidence-age-minutes NUM  Maximum age of the dry-run report. Required.
  --execute                       Reserved future flag. Always blocked.
  --format text|json              Output format. Default: ${DEFAULT_FORMAT}
`);
}

function readDryRunReportFile(reportFile) {
  let contents;

  try {
    contents = fs.readFileSync(reportFile, "utf8");
  } catch (error) {
    throw new Error(`Unable to read --report-file: ${error.message}`);
  }

  try {
    return JSON.parse(contents);
  } catch {
    throw new Error("--report-file must contain valid JSON.");
  }
}

function evaluateExecutionContract({ now = new Date(), options, report }) {
  const failures = [];
  const eligibleCandidates = [];
  const blockedCandidates = [];
  const validation = validateDryRunReportShape(report);
  const generatedAt = validation.generatedAt;
  const evidenceAgeMinutes =
    generatedAt === null
      ? null
      : Math.max(
          0,
          Math.floor((now.getTime() - generatedAt.getTime()) / 60000),
        );

  failures.push(...validation.failures);

  if (options.execute) {
    failures.push(
      buildFailure(
        "execution_not_implemented",
        "The execution contract does not implement any delete-capable path.",
      ),
    );
  }

  if (validation.generatedAt === null) {
    failures.push(
      buildFailure(
        "missing_generated_at",
        "The dry-run report must include a generatedAt timestamp.",
      ),
    );
  } else if (evidenceAgeMinutes > options.maxEvidenceAgeMinutes) {
    failures.push(
      buildFailure(
        "stale_evidence",
        `The dry-run report is ${evidenceAgeMinutes} minutes old and exceeds the configured maximum evidence age.`,
      ),
    );
  }

  if (validation.scopeUserId !== options.userId) {
    failures.push(
      buildFailure(
        "user_id_mismatch",
        "The dry-run report user scope does not match the explicit --user-id.",
      ),
    );
  }

  if (validation.scopePrefix !== `${options.userId}/`) {
    failures.push(
      buildFailure(
        "prefix_mismatch",
        "The dry-run report prefix does not match the explicit tenant-scoped prefix.",
      ),
    );
  }

  if (validation.reportBucket !== BRAND_ASSET_STORAGE_BUCKET) {
    failures.push(
      buildFailure(
        "wrong_bucket",
        "The dry-run report bucket is not the allowed brand-assets bucket.",
      ),
    );
  }

  if (validation.executionDryRun !== true) {
    failures.push(
      buildFailure(
        "dry_run_required",
        "The execution contract requires a dry-run report.",
      ),
    );
  }

  if (validation.mutationAllowed !== false) {
    failures.push(
      buildFailure(
        "mutation_allowed_conflict",
        "The dry-run report indicates a mutating mode, which is not allowed.",
      ),
    );
  }

  if (validation.executionSliceBlocked !== true) {
    failures.push(
      buildFailure(
        "execution_slice_not_blocked",
        "The dry-run report must keep the execution slice blocked.",
      ),
    );
  }

  if (validation.reportTargetEnvironment !== options.targetEnvironment) {
    failures.push(
      buildFailure(
        "target_environment_mismatch",
        "The dry-run report environment does not match the explicit --target-environment.",
      ),
    );
  }

  if (validation.reportTargetSource !== "explicit") {
    failures.push(
      buildFailure(
        "explicit_target_environment_required",
        "The execution contract requires dry-run evidence with an explicit target environment binding.",
      ),
    );
  }

  if (validation.summaryContradictions.length > 0) {
    for (const contradiction of validation.summaryContradictions) {
      failures.push(buildFailure("contradictory_evidence", contradiction));
    }
  }

  for (const object of validation.objects) {
    const candidateResult = classifyExecutionCandidate(object);

    if (candidateResult.eligible) {
      eligibleCandidates.push(candidateResult.candidate);
    } else {
      blockedCandidates.push(candidateResult.candidate);
    }
  }

  if (eligibleCandidates.length > options.maxDeleteLimit) {
    failures.push(
      buildFailure(
        "max_delete_limit_exceeded",
        `Eligible candidate count ${eligibleCandidates.length} exceeds the configured max-delete-limit ${options.maxDeleteLimit}.`,
      ),
    );
  }

  if (eligibleCandidates.length === 0) {
    failures.push(
      buildFailure(
        "zero_eligible_candidates",
        "The execution contract found zero delete-eligible candidates.",
      ),
    );
  }

  return {
    decision: failures.length > 0 ? "blocked" : "ready_for_operator_gate",
    eligibleCandidates,
    evaluation: {
      executeFlagBlocked: options.execute,
      executionImplemented: false,
      executionRemainsBlocked: true,
      nextSlice: "Brand Asset Orphan-Cleanup Execution Gate",
      readyForOperatorGate: failures.length === 0,
    },
    evidence: {
      evidenceAgeMinutes,
      generatedAt: validation.generatedAtRaw,
      mutationAllowed: validation.mutationAllowed,
      reportBucket: validation.reportBucket,
      reportTargetEnvironment: validation.reportTargetEnvironment,
      reportTargetSource: validation.reportTargetSource,
      schemaVersion: validation.schemaVersion,
    },
    failures,
    schemaVersion: DEFAULT_REPORT_SCHEMA_VERSION,
    scope: {
      prefix: `${options.userId}/`,
      targetEnvironment: options.targetEnvironment,
      userId: options.userId,
    },
    summary: {
      blockedCandidateCount: blockedCandidates.length,
      classifications: validation.classifications,
      eligibleCandidateCount: eligibleCandidates.length,
      maxDeleteLimit: options.maxDeleteLimit,
      maxEvidenceAgeMinutes: options.maxEvidenceAgeMinutes,
      totalObjects: validation.objects.length,
    },
    blockedCandidates,
  };
}

function validateDryRunReportShape(report) {
  const failures = [];
  const execution = isPlainObject(report?.execution) ? report.execution : {};
  const scope = isPlainObject(report?.scope) ? report.scope : {};
  const targetEnvironment = isPlainObject(report?.targetEnvironment)
    ? report.targetEnvironment
    : {};
  const summary = isPlainObject(report?.summary) ? report.summary : {};
  const objects = Array.isArray(report?.objects) ? report.objects : [];
  const classifications = {
    orphan_candidate: 0,
    out_of_scope: 0,
    referenced: 0,
    unknown: 0,
  };

  if (!isPlainObject(report)) {
    failures.push(
      buildFailure(
        "invalid_report_shape",
        "The dry-run report must be a JSON object.",
      ),
    );
  }

  for (const object of objects) {
    if (!OBJECT_CLASSIFICATIONS.has(object?.classification)) {
      failures.push(
        buildFailure(
          "invalid_report_shape",
          "The dry-run report contains an object with an unsupported classification.",
        ),
      );
      continue;
    }

    classifications[object.classification] += 1;
  }

  const summaryContradictions = [];

  if (summary.orphanCandidateCount !== classifications.orphan_candidate) {
    summaryContradictions.push(
      "The dry-run report orphanCandidateCount does not match the classified object set.",
    );
  }

  if (summary.outOfScopeCount !== classifications.out_of_scope) {
    summaryContradictions.push(
      "The dry-run report outOfScopeCount does not match the classified object set.",
    );
  }

  if (summary.referencedCount !== classifications.referenced) {
    summaryContradictions.push(
      "The dry-run report referencedCount does not match the classified object set.",
    );
  }

  if (summary.unknownCount !== classifications.unknown) {
    summaryContradictions.push(
      "The dry-run report unknownCount does not match the classified object set.",
    );
  }

  if (summary.totalObjects !== objects.length) {
    summaryContradictions.push(
      "The dry-run report totalObjects does not match the object list length.",
    );
  }

  const generatedAtRaw =
    typeof report?.generatedAt === "string" ? report.generatedAt.trim() : null;
  const generatedAt =
    generatedAtRaw && !Number.isNaN(new Date(generatedAtRaw).getTime())
      ? new Date(generatedAtRaw)
      : null;

  return {
    classifications,
    executionDryRun: execution.dryRun,
    executionSliceBlocked: execution.nextExecutionSliceBlocked,
    failures,
    generatedAt,
    generatedAtRaw,
    mutationAllowed: execution.mutationAllowed,
    objects,
    reportBucket: report?.bucket,
    reportTargetEnvironment: targetEnvironment.environment,
    reportTargetSource: targetEnvironment.source,
    schemaVersion: report?.schemaVersion ?? null,
    scopePrefix: scope.prefix,
    scopeUserId: scope.userId,
    summaryContradictions,
  };
}

function classifyExecutionCandidate(object) {
  const failureCodes = [];

  if (object.bucket !== BRAND_ASSET_STORAGE_BUCKET) {
    failureCodes.push("wrong_bucket");
  }

  if (!isPlainObject(object.pathContract)) {
    failureCodes.push("missing_path_contract");
  } else {
    if (object.pathContract.tenantScopedPrefix !== true) {
      failureCodes.push("cross_tenant_or_invalid_prefix");
    }

    if (object.pathContract.recognizedShape !== true) {
      failureCodes.push("unrecognized_storage_path");
    }
  }

  switch (object.classification) {
    case "referenced":
      failureCodes.push("referenced_object");
      break;
    case "unknown":
      failureCodes.push("unknown_object");
      break;
    case "out_of_scope":
      failureCodes.push("out_of_scope_object");
      break;
    case "orphan_candidate":
      break;
    default:
      failureCodes.push("candidate_not_orphan");
      break;
  }

  if (
    typeof object.redactedPath === "string" &&
    /:\/\/|\?|#/.test(object.redactedPath)
  ) {
    failureCodes.push("unsafe_report_path");
  }

  return {
    eligible: failureCodes.length === 0,
    candidate: {
      bucket: object.bucket,
      classification: object.classification,
      failureCodes,
      pathContract: isPlainObject(object.pathContract)
        ? {
            recognizedShape: object.pathContract.recognizedShape === true,
            tenantScopedPrefix: object.pathContract.tenantScopedPrefix === true,
          }
        : null,
      reason: object.reason ?? null,
      redactedPath: object.redactedPath ?? "<missing-path>",
      updatedAt: object.updatedAt ?? null,
    },
  };
}

function buildFailure(code, message) {
  return { code, message };
}

function formatReport(report, format) {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }

  return renderTextReport(report);
}

function renderTextReport(report) {
  const lines = [
    "StreamOS brand asset orphan cleanup execution contract",
    "",
    `- decision: ${report.decision}`,
    `- execution implemented: no`,
    `- execution remains blocked: yes`,
    `- ready for operator gate: ${report.evaluation.readyForOperatorGate ? "yes" : "no"}`,
    `- target environment: ${report.scope.targetEnvironment}`,
    `- tenant prefix: ${report.scope.prefix}`,
    `- report bucket: ${report.evidence.reportBucket ?? "<unknown>"}`,
    `- report target source: ${report.evidence.reportTargetSource ?? "<unknown>"}`,
    `- evidence generated at: ${report.evidence.generatedAt ?? "<missing>"}`,
    `- evidence age minutes: ${report.evidence.evidenceAgeMinutes ?? "<unknown>"}`,
    `- max evidence age minutes: ${report.summary.maxEvidenceAgeMinutes}`,
    `- max delete limit: ${report.summary.maxDeleteLimit}`,
    `- eligible candidates: ${report.summary.eligibleCandidateCount}`,
    `- blocked candidates: ${report.summary.blockedCandidateCount}`,
    `- total objects: ${report.summary.totalObjects}`,
  ];

  if (report.failures.length > 0) {
    lines.push("");
    lines.push("failures:");

    for (const failure of report.failures) {
      lines.push(`- ${failure.code}: ${failure.message}`);
    }
  }

  if (report.eligibleCandidates.length > 0) {
    lines.push("");
    lines.push("eligible candidates:");

    for (const candidate of report.eligibleCandidates) {
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
  const contractReport = evaluateExecutionContract({
    options,
    report,
  });

  console.log(formatReport(contractReport, options.format));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      `Branding orphan execution contract failed: ${error.message}`,
    );
    process.exit(1);
  });
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  DEFAULT_FORMAT,
  DEFAULT_REPORT_SCHEMA_VERSION,
  EXECUTION_ALLOWED_TARGET_ENVIRONMENTS,
  buildFailure,
  classifyExecutionCandidate,
  evaluateExecutionContract,
  formatReport,
  parseArgs,
  readDryRunReportFile,
  renderTextReport,
  validateDryRunReportShape,
};
