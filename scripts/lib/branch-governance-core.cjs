const { readFileSync, readdirSync, statSync } = require("node:fs");
const { join, relative, resolve } = require("node:path");

const policy = require("../config/branch-governance-policy.cjs");

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+*?.-]/g, "\\$&");
}

function normalizeBranchName(name) {
  if (!name || name === "HEAD") {
    return null;
  }

  return name.startsWith("origin/") ? name.slice("origin/".length) : name;
}

function isDependabotBranch(name) {
  return name.startsWith("dependabot/");
}

function isProtectedBranch(name) {
  return (
    policy.protectedBranches.has(name) ||
    policy.protectedPatterns.some((pattern) => pattern.test(name))
  );
}

function isTemporaryOpsBranch(name) {
  return policy.temporaryOpsPrefixes.some((prefix) => name.startsWith(prefix));
}

function isWorkflowSensitiveBaseBranch(name) {
  return (
    Boolean(name) &&
    (policy.workflowSensitiveBaseBranches.has(name) ||
      policy.workflowSensitiveBasePatterns.some((pattern) =>
        pattern.test(name),
      ))
  );
}

function isNamingCompliant(name) {
  if (isProtectedBranch(name) || isTemporaryOpsBranch(name)) {
    return true;
  }

  if (name.startsWith("release/")) {
    return /^release\/[0-9A-Za-z][0-9A-Za-z._-]*$/.test(name);
  }

  // Enforce lowercase kebab-case for the description segment (third path part):
  // uppercase letters are intentionally disallowed by [a-z0-9][a-z0-9-]*.
  const match = /^(feature|fix|chore)\/([^/]+)\/([a-z0-9][a-z0-9-]*)$/.exec(
    name,
  );

  return Boolean(match && policy.allowedScopes.has(match[2]));
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function tokenize(value) {
  return slugify(value)
    .split("-")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function inferScope(name, subject = "") {
  const branchTokens = tokenize(name);
  const subjectTokens = tokenize(subject);
  const scores = new Map();

  for (const scope of Object.keys(policy.scopeKeywords)) {
    let score = 0;

    for (const keyword of policy.scopeKeywords[scope]) {
      const normalizedKeyword = slugify(keyword);

      if (branchTokens.includes(normalizedKeyword)) {
        score += 3;
      }

      if (subjectTokens.includes(normalizedKeyword)) {
        score += 1;
      }
    }

    scores.set(scope, score);
  }

  const ranked = [...scores.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0]);
  });

  return ranked[0] && ranked[0][1] > 0 ? ranked[0][0] : null;
}

function inferType(name, subject = "") {
  const branchPrefix = name.split("/")[0]?.toLowerCase();

  if (branchPrefix && policy.typeAliases[branchPrefix]) {
    return policy.typeAliases[branchPrefix];
  }

  const subjectPrefix = subject
    .trim()
    .toLowerCase()
    .match(
      /^(feat|feature|fix|bugfix|hotfix|chore|refactor|docs|ci|build|test|release)\b/,
    );

  return subjectPrefix ? policy.typeAliases[subjectPrefix[1]] : null;
}

function suggestBranchRename(name, subject = "") {
  if (
    isProtectedBranch(name) ||
    isTemporaryOpsBranch(name) ||
    isDependabotBranch(name) ||
    isNamingCompliant(name)
  ) {
    return null;
  }

  const parts = name.split("/").filter(Boolean);
  const type = inferType(name, subject);

  if (!type) {
    return null;
  }

  if (type === "release") {
    const releaseSegment = slugify(parts.slice(1).join("-") || subject);

    return releaseSegment ? `release/${releaseSegment}` : null;
  }

  const scope = inferScope(name, subject);

  if (!scope) {
    return null;
  }

  // Two cases:
  // 1) Canonical branch format: <type>/<scope>/<description...>
  //    When type is recognized and we have at least 3 segments, use everything after type+scope.
  // 2) Non-canonical/malformed input: fall back to remaining segments (or first segment)
  //    so we can still produce a best-effort rename suggestion.
  const descriptionSource =
    parts.length >= 3 && policy.allowedTypes.has(parts[0])
      ? parts.slice(2).join("-")
      : parts.slice(1).join("-") || parts[0];

  const description = slugify(descriptionSource);

  if (!description) {
    return null;
  }

  return `${type}/${scope}/${description}`;
}

function walkFiles(rootPath) {
  const results = [];
  const stats = statSync(rootPath);

  if (stats.isFile()) {
    results.push(rootPath);
    return results;
  }

  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const targetPath = join(rootPath, entry.name);

    if (entry.isDirectory()) {
      results.push(...walkFiles(targetPath));
      continue;
    }

    results.push(targetPath);
  }

  return results;
}

function loadReferenceFiles(cwd, referencePaths = policy.referencePaths) {
  const files = [];

  for (const referencePath of referencePaths) {
    const absolutePath = resolve(cwd, referencePath);

    try {
      for (const filePath of walkFiles(absolutePath)) {
        files.push({
          content: readFileSync(filePath, "utf8"),
          path: relative(cwd, filePath).replace(/\\/g, "/"),
        });
      }
    } catch (error) {
      if (error && error.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }

  return files;
}

function findBranchReferences(branchName, referenceFiles) {
  const patterns = [
    new RegExp(
      `(^|[^A-Za-z0-9_./-])${escapeRegex(branchName)}(?=$|[^A-Za-z0-9_./-])`,
      "m",
    ),
  ];

  if (branchName.startsWith("release/")) {
    patterns.push(/release\/\*/);
  }

  return referenceFiles
    .filter((file) => patterns.some((pattern) => pattern.test(file.content)))
    .map((file) => file.path);
}

function normalizeYamlValue(value) {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function extractPushBranches(content) {
  // Match the `push:` section and lazily capture its body until we hit:
  // - another key at the same workflow-map indentation (`\n  <key>:`),
  // - a top-level key (`\n<key>:`), or
  // - end of file.
  // This documents the stop-condition strategy for this lightweight YAML shape parsing.
  const pushBlockMatch = content.match(
    /push:\s*\n([\s\S]*?)(?:\n\s{2}[A-Za-z_][A-Za-z0-9_-]*:|\n[A-Za-z_][A-Za-z0-9_-]*:|$)/,
  );

  if (!pushBlockMatch) {
    return [];
  }

  const branchesBlockMatch = pushBlockMatch[1].match(
    /branches:\s*\n((?:\s*-\s*[^\n]+\n?)*)/,
  );

  if (!branchesBlockMatch) {
    return [];
  }

  return branchesBlockMatch[1]
    .split(/\r?\n/)
    .map((line) => {
      const itemMatch = line.trim().match(/^-\s*(.+)$/);
      if (!itemMatch) {
        return null;
      }

      const rawValue = itemMatch[1].trim();
      const quotedMatch = rawValue.match(/^"((?:\\.|[^"\\])*)"$/);
      if (quotedMatch) {
        return quotedMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      }

      const unquotedMatch = rawValue.match(/^([^\n#]+)$/);
      return unquotedMatch ? unquotedMatch[1].trim() : null;
    })
    .filter(Boolean)
    .map((value) => normalizeYamlValue(value));
}

function extractWorkflowEnvironments(content) {
  return [...content.matchAll(/environment:\s*\n\s*name:\s*([^\n#]+)/g)]
    .map((match) => normalizeYamlValue(match[1]))
    .filter(Boolean);
}

function parseWorkflowMetadata(file) {
  const nameMatch = file.content.match(/^name:\s*(.+)$/m);
  const cancelInProgressMatch = file.content.match(
    /cancel-in-progress:\s*(true|false)/,
  );
  const environments = [...new Set(extractWorkflowEnvironments(file.content))];
  const pushBranches = [...new Set(extractPushBranches(file.content))];
  const hasWorkflowDispatch = /workflow_dispatch:/m.test(file.content);

  return {
    name: nameMatch ? normalizeYamlValue(nameMatch[1]) : file.path,
    path: file.path,
    triggers: {
      pushBranches,
      workflowDispatch: hasWorkflowDispatch,
    },
    environments,
    cancelInProgress: cancelInProgressMatch
      ? cancelInProgressMatch[1]
      : "unknown",
  };
}

function extractDeploymentBranchRestrictions(referenceFiles) {
  const deploymentDoc = referenceFiles.find(
    (file) => file.path === "docs/deployment.md",
  );

  if (!deploymentDoc) {
    return [];
  }

  const matches = [
    ...deploymentDoc.content.matchAll(
      /deployment branch restriction to ([^\n]+)/gi,
    ),
  ];

  return matches.flatMap((match) => {
    const branchMatches = [...match[1].matchAll(/`([^`]+)`/g)].map(
      (entry) => entry[1],
    );
    return branchMatches;
  });
}

function buildRepoFirstAuditSummary(referenceFiles) {
  const workflowFiles = referenceFiles
    .filter((file) => file.path.startsWith(".github/workflows/"))
    .map(parseWorkflowMetadata)
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    deploymentBranchRestrictions: [
      ...new Set(extractDeploymentBranchRestrictions(referenceFiles)),
    ],
    runtimeFollowUp: policy.runtimeFollowUpRules,
    workflowAuditMappings: policy.workflowAuditMappings,
    workflows: workflowFiles,
  };
}

function formatReviewDecision(reviewDecision) {
  if (!reviewDecision) {
    return "review state unknown";
  }

  const labels = {
    APPROVED: "approved",
    CHANGES_REQUESTED: "changes requested",
    REVIEW_REQUIRED: "review required",
  };

  return (
    labels[reviewDecision] || reviewDecision.toLowerCase().replace(/_/g, " ")
  );
}

function buildPrSummary(openPrs, options = {}) {
  if (openPrs.length === 0) {
    return options.prCheckAvailable
      ? "No open PR."
      : "Open PR state unknown (gh unavailable).";
  }

  return openPrs
    .map((pullRequest) => {
      const draftState = pullRequest.isDraft ? "draft" : "ready";
      const baseRef = pullRequest.baseRefName || "unknown";
      return `#${pullRequest.number} -> ${baseRef} (${draftState}, ${formatReviewDecision(
        pullRequest.reviewDecision,
      )})`;
    })
    .join("; ");
}

function buildBranchSafety(branch, options = {}) {
  const notes = [];

  if (branch.prState === "open") {
    notes.push(`Open PRs: ${branch.prSummary}`);
  } else if (branch.prState === "unknown") {
    notes.push("Open PR state unknown.");
  } else {
    notes.push("No open PR.");
  }

  if (branch.mergedIntoRelevant) {
    notes.push("Merged into a relevant integration branch.");
  }

  if (
    branch.divergence &&
    (branch.divergence.ahead > 0 || branch.divergence.behind > 0)
  ) {
    notes.push(
      `Local/remote divergence ${branch.divergence.ahead} ahead, ${branch.divergence.behind} behind.`,
    );
  }

  if (options.workingTreeDirty && branch.isCurrent) {
    notes.push("Current worktree is dirty.");
  }

  return notes.join(" ");
}

function buildWorkflowSensitivity(branch) {
  const reasons = [];
  const workflowRefs = branch.references.filter((path) =>
    path.startsWith(".github/workflows/"),
  );
  const sensitiveBaseRefs = [
    ...new Set(
      branch.openPrs
        .map((pullRequest) => pullRequest.baseRefName)
        .filter((baseRef) => isWorkflowSensitiveBaseBranch(baseRef)),
    ),
  ];

  if (branch.isProtected) {
    reasons.push("protected/deployment branch");
  }

  if (workflowRefs.length > 0) {
    reasons.push(`workflow refs: ${workflowRefs.join(", ")}`);
  }

  if (branch.references.includes("docs/deployment.md")) {
    reasons.push("deployment document binding");
  }

  if (sensitiveBaseRefs.length > 0) {
    reasons.push(`open PR base: ${sensitiveBaseRefs.join(", ")}`);
  }

  return {
    reasons,
    value: reasons.length > 0,
  };
}

function buildCategoryCounts(branches) {
  const counts = {
    "active development": 0,
    abandoned: 0,
    "merged & stale": 0,
    "needs rename": 0,
    protected: 0,
    "temporary ops": 0,
  };

  for (const branch of branches) {
    counts[branch.status] += 1;
  }

  return counts;
}

function formatLastCommit(branch) {
  const date = branch.lastCommitDate
    ? branch.lastCommitDate.slice(0, 10)
    : "unknown";
  const author = branch.lastCommitAuthor || "unknown";

  return `${date} by ${author}`;
}

function escapeMarkdownTableCell(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function buildRecommendedAction(branch, options = {}) {
  const hasReferences = branch.references.length > 0;
  const divergence = branch.divergence;
  const workflowSensitiveNote = branch.workflowSensitive
    ? ` Review workflow-/environment-sensitive bindings first (${branch.workflowSensitiveReasons.join("; ")}).`
    : "";
  const workingTreeWarning =
    options.workingTreeDirty && branch.isCurrent
      ? " Separate uncommitted changes before branch operations."
      : "";

  if (branch.isDependabot) {
    if (branch.prState === "open") {
      return `Dependabot branch with open PR ${branch.prSummary}; do not rename into the manual StreamOS naming convention. Merge or close the PR, then delete the branch.${workflowSensitiveNote}${workingTreeWarning}`;
    }

    if (branch.prState === "unknown") {
      return `Dependabot branch; verify PR state before cleanup. Do not rename into the manual StreamOS naming convention.${workflowSensitiveNote}${workingTreeWarning}`;
    }

    return `Dependabot branch; delete only after merge or explicit closure confirmation. Do not rename.${workflowSensitiveNote}${workingTreeWarning}`;
  }

  if (branch.status === "protected") {
    if (hasReferences) {
      return `Keep protected; referenced in ${branch.references.join(", ")}.${workflowSensitiveNote}${workingTreeWarning}`;
    }

    return `Keep protected; no cleanup action.${workflowSensitiveNote}${workingTreeWarning}`;
  }

  if (branch.status === "temporary ops") {
    if (branch.mergedIntoRelevant && branch.prState === "none") {
      return `Temporary ops branch; candidate for cleanup after owner confirmation.${workflowSensitiveNote}${workingTreeWarning}`;
    }

    if (branch.ageDays > options.abandonedDays && branch.prState !== "open") {
      return `Temporary ops branch is stale; verify owner intent before cleanup.${workflowSensitiveNote}${workingTreeWarning}`;
    }

    return `Keep isolated as temporary ops; review in the next cleanup pass.${workflowSensitiveNote}${workingTreeWarning}`;
  }

  if (branch.status === "merged & stale") {
    if (branch.prState === "open") {
      return `Already merged, but an open PR still references this branch; close or retarget the PR before cleanup.${workflowSensitiveNote}${workingTreeWarning}`;
    }

    if (branch.prState === "unknown") {
      return `Appears fully merged; confirm open PR status, then delete after confirmation.${workflowSensitiveNote}${workingTreeWarning}`;
    }

    return `Safe delete candidate after confirmation.${workflowSensitiveNote}${workingTreeWarning}`;
  }

  if (branch.status === "abandoned") {
    if (branch.prState === "open") {
      return `Commit history is stale, but an open PR exists; inspect before cleanup.${workflowSensitiveNote}${workingTreeWarning}`;
    }

    if (branch.prState === "unknown") {
      return `Stale branch; verify open PR status before cleanup.${workflowSensitiveNote}${workingTreeWarning}`;
    }

    return `Abandoned branch; delete after confirmation if no owner claims it.${workflowSensitiveNote}${workingTreeWarning}`;
  }

  if (branch.status === "needs rename") {
    if (branch.prState === "open") {
      return `Open PR bound to this branch (${branch.prSummary}); keep the head branch unchanged until the PR is merged or closed.${workflowSensitiveNote}${workingTreeWarning}`;
    }

    if (branch.prState === "unknown") {
      return `Potential rename candidate, but GitHub PR state is unknown; verify head/base branch binding, draft status, and review state before renaming.${workflowSensitiveNote}${workingTreeWarning}`;
    }

    let action = hasReferences
      ? `Rename only after updating referenced workflow/deployment files (${branch.references.join(", ")}).`
      : "Rename after confirmation.";

    if (divergence && (divergence.ahead > 0 || divergence.behind > 0)) {
      action += ` Resolve local/remote divergence first (${divergence.ahead} ahead, ${divergence.behind} behind).`;
    }

    return `${action}${workflowSensitiveNote}${workingTreeWarning}`;
  }

  if (divergence && (divergence.ahead > 0 || divergence.behind > 0)) {
    return `Keep active; reconcile local/remote divergence (${divergence.ahead} ahead, ${divergence.behind} behind).${workflowSensitiveNote}${workingTreeWarning}`;
  }

  return `Keep active.${workflowSensitiveNote}${workingTreeWarning}`;
}

function classifyBranch(branch, options = {}) {
  if (branch.isProtected) {
    return "protected";
  }

  if (branch.isTemporaryOps) {
    return "temporary ops";
  }

  if (branch.mergedIntoRelevant) {
    return "merged & stale";
  }

  if (branch.ageDays > options.abandonedDays && branch.prState !== "open") {
    return "abandoned";
  }

  if (!branch.isNamingCompliant) {
    return "needs rename";
  }

  return "active development";
}

function buildBranchAuditReport({
  branches,
  currentBranch,
  openPrsByBranch = new Map(),
  options = {},
  referenceFiles = [],
  workingTreeDirty = false,
}) {
  const repoFirstAudit = buildRepoFirstAuditSummary(referenceFiles);
  const decoratedBranches = branches
    .map((branch) => {
      const references = findBranchReferences(branch.name, referenceFiles);
      const openPrs = openPrsByBranch.get(branch.name) || [];
      const prState =
        openPrs.length > 0
          ? "open"
          : options.prCheckAvailable
            ? "none"
            : "unknown";
      const ageDays = Math.floor(
        (Date.now() - new Date(branch.lastCommitDate).getTime()) / 86_400_000,
      );
      const isProtected = isProtectedBranch(branch.name);
      const isTemporaryOps = isTemporaryOpsBranch(branch.name);
      const isDependabot = isDependabotBranch(branch.name);
      const namingCompliant = isNamingCompliant(branch.name);
      const mergedIntoRelevant = Object.values(branch.mergedInto || {}).some(
        Boolean,
      );
      const prSummary = buildPrSummary(openPrs, {
        prCheckAvailable: options.prCheckAvailable,
      });
      const workflowSensitivity = buildWorkflowSensitivity({
        ...branch,
        isProtected,
        openPrs,
        references,
      });

      return {
        ...branch,
        ageDays,
        isCurrent: branch.name === currentBranch,
        isDependabot,
        isNamingCompliant: namingCompliant,
        isProtected,
        isTemporaryOps,
        branchSafety: "",
        mergedIntoRelevant,
        newName: suggestBranchRename(branch.name, branch.subject),
        openPrs,
        prSummary,
        prState,
        references,
        workflowSensitive: workflowSensitivity.value,
        workflowSensitiveReasons: workflowSensitivity.reasons,
      };
    })
    .map((branch) => {
      const status = classifyBranch(branch, options);

      return {
        ...branch,
        branchSafety: buildBranchSafety(
          { ...branch, status },
          {
            workingTreeDirty,
          },
        ),
        recommendedAction: buildRecommendedAction(
          { ...branch, status },
          {
            abandonedDays: options.abandonedDays,
            workingTreeDirty,
          },
        ),
        status,
      };
    })
    .sort((left, right) => {
      const leftTime = new Date(left.lastCommitDate).getTime();
      const rightTime = new Date(right.lastCommitDate).getTime();

      return rightTime - leftTime;
    });

  const safeDeletionCandidates = decoratedBranches.filter((branch) => {
    if (branch.prState !== "none") {
      return false;
    }

    if (branch.references.length > 0) {
      return false;
    }

    return branch.status === "merged & stale" || branch.status === "abandoned";
  });

  return {
    currentBranch,
    generatedAt: new Date().toISOString(),
    referenceFiles: referenceFiles.map((file) => file.path),
    repoFirstAudit,
    safeDeletionCandidates,
    summary: {
      byCategory: buildCategoryCounts(decoratedBranches),
      totalBranches: decoratedBranches.length,
      workflowSensitiveBranches: decoratedBranches.filter(
        (branch) => branch.workflowSensitive,
      ).length,
      workingTreeDirty,
    },
    thresholds: {
      abandonedDays: options.abandonedDays,
      activeDevelopmentDays: options.activeDays,
    },
    branches: decoratedBranches,
  };
}

function formatMarkdownReport(report, options = {}) {
  const lines = [
    "# StreamOS Branch Audit",
    "",
    `Generated: ${report.generatedAt}`,
    `Current branch: ${report.currentBranch || "detached HEAD"}`,
    `Working tree: ${report.summary.workingTreeDirty ? "dirty" : "clean"}`,
    `PR check: ${options.prCheckSummary || "unknown"}`,
    `Thresholds: active < ${report.thresholds.activeDevelopmentDays} days, abandoned > ${report.thresholds.abandonedDays} days`,
    "",
    "## Summary",
    "",
    `- Total branches: ${report.summary.totalBranches}`,
    `- Protected: ${report.summary.byCategory.protected}`,
    `- Active development: ${report.summary.byCategory["active development"]}`,
    `- Merged & stale: ${report.summary.byCategory["merged & stale"]}`,
    `- Abandoned: ${report.summary.byCategory.abandoned}`,
    `- Needs rename: ${report.summary.byCategory["needs rename"]}`,
    `- Temporary ops: ${report.summary.byCategory["temporary ops"]}`,
    `- Workflow-sensitive: ${report.summary.workflowSensitiveBranches}`,
    "",
    "## Branch Table",
    "",
    "| Branch Name | Last Commit | Status | PR / Branch Safety | Workflow Sensitive | Recommended Action | New Name (if rename needed) |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const branch of report.branches) {
    const workflowSensitive = branch.workflowSensitive
      ? `yes (${branch.workflowSensitiveReasons.join("; ")})`
      : "no";

    lines.push(
      `| ${escapeMarkdownTableCell(branch.name)} | ${escapeMarkdownTableCell(formatLastCommit(branch))} | ${escapeMarkdownTableCell(branch.status)} | ${escapeMarkdownTableCell(branch.branchSafety)} | ${escapeMarkdownTableCell(workflowSensitive)} | ${escapeMarkdownTableCell(branch.recommendedAction)} | ${escapeMarkdownTableCell(branch.newName)} |`,
    );
  }

  lines.push("", "## Safe Deletion Candidates", "");

  if (report.safeDeletionCandidates.length === 0) {
    lines.push(
      "No safe deletion candidates found under the current policy. Confirm PR state manually if GitHub lookup was unavailable.",
    );
  } else {
    for (const branch of report.safeDeletionCandidates) {
      lines.push(
        `- ${branch.name} (${branch.status}; last commit ${formatLastCommit(branch)})`,
      );
    }
  }

  lines.push("", "## Workflow / Deploy Relevance", "");

  for (const mapping of report.repoFirstAudit.workflowAuditMappings) {
    lines.push(
      `- Repo-first mapping: \`${mapping.auditExpectation}\` -> \`${mapping.repoSource}\` (${mapping.note})`,
    );
  }

  if (report.repoFirstAudit.workflows.length > 0) {
    lines.push("");
    for (const workflow of report.repoFirstAudit.workflows) {
      const triggerSummary = [];

      if (workflow.triggers.pushBranches.length > 0) {
        triggerSummary.push(
          `push: ${workflow.triggers.pushBranches.join(", ")}`,
        );
      }

      if (workflow.triggers.workflowDispatch) {
        triggerSummary.push("workflow_dispatch");
      }

      lines.push(
        `- ${workflow.path}: triggers ${triggerSummary.join(" + ") || "unknown"}, environments ${workflow.environments.join(", ") || "none detected"}, cancel-in-progress ${workflow.cancelInProgress}`,
      );
    }
  }

  if (report.repoFirstAudit.deploymentBranchRestrictions.length > 0) {
    lines.push(
      `- docs/deployment.md branch restrictions: ${report.repoFirstAudit.deploymentBranchRestrictions.join(", ")}`,
    );
  }

  lines.push("", "## Secret / Runtime Follow-up", "");

  for (const rule of report.repoFirstAudit.runtimeFollowUp) {
    lines.push(`- ${rule.gate}: ${rule.when}`);
  }

  lines.push("", "## Reference Scan", "");

  for (const filePath of report.referenceFiles) {
    lines.push(`- ${filePath}`);
  }

  return `${lines.join("\n")}\n`;
}

module.exports = {
  buildBranchAuditReport,
  findBranchReferences,
  formatMarkdownReport,
  inferScope,
  inferType,
  isDependabotBranch,
  isNamingCompliant,
  isProtectedBranch,
  isTemporaryOpsBranch,
  isWorkflowSensitiveBaseBranch,
  loadReferenceFiles,
  normalizeBranchName,
  suggestBranchRename,
};
