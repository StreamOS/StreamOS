const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const { join, resolve } = require("node:path");

const {
  buildBranchAuditReport,
  findBranchReferences,
  formatMarkdownReport,
  isDependabotBranch,
  isNamingCompliant,
  isProtectedBranch,
  isTemporaryOpsBranch,
  loadReferenceFiles,
  suggestBranchRename,
} = require("./lib/branch-governance-core.cjs");
const { parseArgs } = require("./audit-branches.cjs");

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  return result.stdout.trim();
}

test("branch audit parser accepts split args and disables gh on request", () => {
  const options = parseArgs([
    "--format",
    "json",
    "--active-days",
    "21",
    "--abandoned-days",
    "90",
    "--integration-branch",
    "release/1.4.0",
    "--no-gh",
  ]);

  assert.equal(options.format, "json");
  assert.equal(options.activeDays, 21);
  assert.equal(options.abandonedDays, 90);
  assert.equal(options.prCheck, false);
  assert.deepEqual(options.integrationBranches, ["develop", "release/1.4.0"]);
});

test("branch governance helpers classify protected, temporary, and compliant names", () => {
  assert.equal(isProtectedBranch("main"), true);
  assert.equal(isProtectedBranch("release/1.4.0"), true);
  assert.equal(isTemporaryOpsBranch("backup/pre-cleanup"), true);
  assert.equal(isDependabotBranch("dependabot/npm_and_yarn/pnpm-11.6.0"), true);
  assert.equal(isNamingCompliant("feature/web/branding-module-ui"), true);
  assert.equal(isNamingCompliant("feature/branding-module-ui"), false);
});

test("branch rename suggestions infer scope from StreamOS workspace keywords", () => {
  assert.equal(
    suggestBranchRename(
      "feature/twitch-eventsub-integration",
      "feat(api): add Twitch EventSub support",
    ),
    "feature/api-gateway/twitch-eventsub-integration",
  );
  assert.equal(
    suggestBranchRename(
      "fix/workspace-types",
      "fix(config): add missing workspace type defs",
    ),
    "fix/packages/workspace-types",
  );
  assert.equal(
    suggestBranchRename(
      "refactor/queue-runtime-split",
      "refactor(queue): split queue runtime and shared types",
    ),
    "chore/workers/queue-runtime-split",
  );
});

test("branch reference scanner detects exact names and release wildcards", () => {
  const referenceFiles = [
    {
      content: "branches:\n  - develop\n  - main\n",
      path: ".github/workflows/ci.yml",
    },
    {
      content: "deployment branch restriction to `main` and `release/*`\n",
      path: "docs/deployment.md",
    },
  ];

  assert.deepEqual(findBranchReferences("develop", referenceFiles), [
    ".github/workflows/ci.yml",
  ]);
  assert.deepEqual(findBranchReferences("release/1.4.0", referenceFiles), [
    "docs/deployment.md",
  ]);
});

test("branch audit report categorizes branches and keeps deletion list conservative", () => {
  const report = buildBranchAuditReport({
    branches: [
      {
        divergence: null,
        lastCommitAuthor: "Alice",
        lastCommitDate: "2026-06-15T10:00:00.000Z",
        localRef: "main",
        mergedInto: {},
        name: "main",
        remoteRef: "origin/main",
        subject: "Fix main",
      },
      {
        divergence: null,
        lastCommitAuthor: "Bob",
        lastCommitDate: "2026-06-14T10:00:00.000Z",
        localRef: "feature/metrics-sync-gateway-refactor",
        mergedInto: {},
        name: "feature/metrics-sync-gateway-refactor",
        remoteRef: null,
        subject: "feat(web): proxy metrics sync through api gateway",
      },
      {
        divergence: {
          ahead: 0,
          behind: 0,
        },
        lastCommitAuthor: "Dependabot",
        lastCommitDate: "2026-06-13T10:00:00.000Z",
        localRef: "dependabot/npm_and_yarn/pnpm-11.6.0",
        mergedInto: {},
        name: "dependabot/npm_and_yarn/pnpm-11.6.0",
        remoteRef: "origin/dependabot/npm_and_yarn/pnpm-11.6.0",
        subject: "build(deps): bump pnpm from 9.15.4 to 11.6.0",
      },
      {
        divergence: null,
        lastCommitAuthor: "Carol",
        lastCommitDate: "2025-12-01T10:00:00.000Z",
        localRef: "backup/worktree-audit-pre-split",
        mergedInto: {
          main: false,
        },
        name: "backup/worktree-audit-pre-split",
        remoteRef: null,
        subject: "backup snapshot",
      },
      {
        divergence: null,
        lastCommitAuthor: "Dan",
        lastCommitDate: "2025-11-01T10:00:00.000Z",
        localRef: "fix/infra/old-staging-url",
        mergedInto: {
          main: false,
        },
        name: "fix/infra/old-staging-url",
        remoteRef: null,
        subject: "fix(ci): old staging URL",
      },
      {
        divergence: null,
        lastCommitAuthor: "Eve",
        lastCommitDate: "2026-06-10T10:00:00.000Z",
        localRef: "fix/infra/merged-branch",
        mergedInto: {
          main: true,
        },
        name: "fix/infra/merged-branch",
        remoteRef: null,
        subject: "fix(ci): merged branch",
      },
    ],
    currentBranch: "feature/metrics-sync-gateway-refactor",
    openPrsByBranch: new Map([
      [
        "dependabot/npm_and_yarn/pnpm-11.6.0",
        [
          {
            baseRefName: "main",
            isDraft: false,
            number: 43,
            reviewDecision: "REVIEW_REQUIRED",
            url: "https://example.test/pr/43",
          },
        ],
      ],
    ]),
    options: {
      abandonedDays: 60,
      activeDays: 30,
      prCheckAvailable: true,
    },
    referenceFiles: [
      {
        content: "branches:\n  - main\n  - develop\n",
        path: ".github/workflows/ci.yml",
      },
    ],
    workingTreeDirty: true,
  });

  const statuses = Object.fromEntries(
    report.branches.map((branch) => [branch.name, branch.status]),
  );

  assert.equal(statuses.main, "protected");
  assert.equal(
    statuses["feature/metrics-sync-gateway-refactor"],
    "needs rename",
  );
  assert.equal(statuses["dependabot/npm_and_yarn/pnpm-11.6.0"], "needs rename");
  assert.equal(statuses["backup/worktree-audit-pre-split"], "temporary ops");
  assert.equal(statuses["fix/infra/old-staging-url"], "abandoned");
  assert.equal(statuses["fix/infra/merged-branch"], "merged & stale");
  assert.deepEqual(
    report.safeDeletionCandidates.map((branch) => branch.name),
    ["fix/infra/merged-branch", "fix/infra/old-staging-url"],
  );
  assert.equal(report.summary.workflowSensitiveBranches >= 2, true);
  assert.match(
    report.branches.find(
      (branch) => branch.name === "dependabot/npm_and_yarn/pnpm-11.6.0",
    ).recommendedAction,
    /do not rename/i,
  );
  assert.match(
    report.branches.find(
      (branch) => branch.name === "dependabot/npm_and_yarn/pnpm-11.6.0",
    ).branchSafety,
    /Open PRs: #43 -> main/,
  );
  assert.deepEqual(
    report.repoFirstAudit.workflowAuditMappings.map(
      (mapping) => mapping.repoSource,
    ),
    [
      ".github/workflows/main.yml",
      ".github/workflows/smoke-production-manual.yml + pnpm rollout:check",
      "release/*",
    ],
  );

  const markdown = formatMarkdownReport(report, {
    prCheckSummary: "available",
  });

  assert.match(
    markdown,
    /Branch Name \| Last Commit \| Status \| PR \/ Branch Safety/,
  );
  assert.match(markdown, /Safe delete candidate after confirmation/);
  assert.match(markdown, /Workflow \/ Deploy Relevance/);
  assert.match(markdown, /Secret \/ Runtime Follow-up/);
  assert.match(markdown, /Repo-first mapping: `rollback\.yml`/);
});

test("branch audit CLI emits a markdown report for a repository without gh access", () => {
  const tempRoot = mkdtempSync(join(os.tmpdir(), "streamos-branch-audit-"));
  const repoPath = join(tempRoot, "repo");
  mkdirSync(repoPath, { recursive: true });
  mkdirSync(join(repoPath, ".github", "workflows"), { recursive: true });
  mkdirSync(join(repoPath, "docs"), { recursive: true });

  writeFileSync(
    join(repoPath, ".github", "workflows", "ci.yml"),
    "branches:\n  - main\n  - develop\n",
  );
  writeFileSync(
    join(repoPath, "docs", "deployment.md"),
    "deployment branch restriction to `main` and `release/*`\n",
  );
  writeFileSync(join(repoPath, "README.md"), "# temp repo\n");

  run("git", ["init", "--initial-branch=main"], repoPath);
  run("git", ["config", "user.name", "StreamOS Test"], repoPath);
  run("git", ["config", "user.email", "test@example.com"], repoPath);
  run("git", ["add", "."], repoPath);
  run("git", ["commit", "-m", "chore: bootstrap repo"], repoPath);
  run("git", ["checkout", "-b", "develop"], repoPath);
  run(
    "git",
    ["checkout", "-b", "feature/twitch-eventsub-integration"],
    repoPath,
  );
  writeFileSync(join(repoPath, "feature.txt"), "active\n");
  run("git", ["add", "."], repoPath);
  run("git", ["commit", "-m", "feat(api): add Twitch EventSub"], repoPath);

  const result = spawnSync(
    process.execPath,
    [
      resolve(process.cwd(), "scripts", "audit-branches.cjs"),
      "--cwd",
      repoPath,
      "--no-gh",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  rmSync(tempRoot, { force: true, recursive: true });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /# StreamOS Branch Audit/);
  assert.match(result.stdout, /feature\/twitch-eventsub-integration/);
  assert.match(result.stdout, /needs rename/);
  assert.match(
    result.stdout,
    /Potential rename candidate, but GitHub PR state is unknown/,
  );
  assert.match(result.stdout, /Workflow \/ Deploy Relevance/);
});

test("reference file loader walks workflow directories and deployment docs", () => {
  const tempRoot = mkdtempSync(join(os.tmpdir(), "streamos-branch-refs-"));
  mkdirSync(join(tempRoot, ".github", "workflows"), { recursive: true });
  mkdirSync(join(tempRoot, "docs"), { recursive: true });
  writeFileSync(join(tempRoot, ".github", "workflows", "main.yml"), "main\n");
  writeFileSync(join(tempRoot, "docs", "deployment.md"), "release/*\n");

  const files = loadReferenceFiles(tempRoot);
  rmSync(tempRoot, { force: true, recursive: true });

  assert.deepEqual(files.map((file) => file.path).sort(), [
    ".github/workflows/main.yml",
    "docs/deployment.md",
  ]);
});
