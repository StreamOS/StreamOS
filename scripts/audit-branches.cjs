#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

const { consumeValueFlag } = require("./lib/cli-args.cjs");
const policy = require("./config/branch-governance-policy.cjs");
const {
  buildBranchAuditReport,
  formatMarkdownReport,
  loadReferenceFiles,
  normalizeBranchName,
} = require("./lib/branch-governance-core.cjs");

function runGit(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      (result.stderr || result.stdout || "git command failed").trim(),
    );
  }

  return result.stdout.trimEnd();
}

function commandExists(command, cwd) {
  const result = spawnSync(command, ["--version"], {
    cwd,
    encoding: "utf8",
  });

  return result.status === 0;
}

function parseArgs(argv) {
  const options = {
    activeDays: policy.activeDevelopmentDays,
    abandonedDays: policy.abandonedDays,
    cwd: process.cwd(),
    format: "markdown",
    help: false,
    integrationBranches: ["develop"],
    prCheck: true,
    referencePaths: [...policy.referencePaths],
    remoteName: "origin",
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

    const activeDaysMatch = consumeValueFlag(argv, index, "active-days");

    if (activeDaysMatch.matched) {
      options.activeDays = Number(activeDaysMatch.value);
      index = activeDaysMatch.nextIndex;
      continue;
    }

    const abandonedDaysMatch = consumeValueFlag(argv, index, "abandoned-days");

    if (abandonedDaysMatch.matched) {
      options.abandonedDays = Number(abandonedDaysMatch.value);
      index = abandonedDaysMatch.nextIndex;
      continue;
    }

    const cwdMatch = consumeValueFlag(argv, index, "cwd");

    if (cwdMatch.matched) {
      options.cwd = resolve(cwdMatch.value);
      index = cwdMatch.nextIndex;
      continue;
    }

    const formatMatch = consumeValueFlag(argv, index, "format");

    if (formatMatch.matched) {
      options.format = formatMatch.value.trim();
      index = formatMatch.nextIndex;
      continue;
    }

    const integrationMatch = consumeValueFlag(
      argv,
      index,
      "integration-branch",
    );

    if (integrationMatch.matched) {
      options.integrationBranches.push(integrationMatch.value.trim());
      index = integrationMatch.nextIndex;
      continue;
    }

    const referencePathMatch = consumeValueFlag(argv, index, "reference-path");

    if (referencePathMatch.matched) {
      options.referencePaths.push(referencePathMatch.value.trim());
      index = referencePathMatch.nextIndex;
      continue;
    }

    const remoteMatch = consumeValueFlag(argv, index, "remote");

    if (remoteMatch.matched) {
      options.remoteName = remoteMatch.value.trim();
      index = remoteMatch.nextIndex;
      continue;
    }

    if (arg === "--no-gh") {
      options.prCheck = false;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!["json", "markdown", "both"].includes(options.format)) {
    throw new Error("--format must be one of: json, markdown, both.");
  }

  if (!Number.isInteger(options.activeDays) || options.activeDays < 1) {
    throw new Error("--active-days must be an integer >= 1.");
  }

  if (!Number.isInteger(options.abandonedDays) || options.abandonedDays < 1) {
    throw new Error("--abandoned-days must be an integer >= 1.");
  }

  options.integrationBranches = [...new Set(options.integrationBranches)];
  options.referencePaths = [...new Set(options.referencePaths)];

  return options;
}

function printHelp() {
  process.stdout.write(`StreamOS branch audit

Usage:
  pnpm branch:audit
  pnpm branch:audit -- --format json
  pnpm branch:audit -- --no-gh --active-days 21 --abandoned-days 90

Options:
  --format <markdown|json|both>   Output format (default: markdown)
  --active-days <number>          Recent activity threshold (default: 30)
  --abandoned-days <number>       Abandoned threshold (default: 60)
  --integration-branch <name>     Additional integration branch to treat as relevant
  --reference-path <path>         Extra workflow or docs path to scan for branch references
  --remote <name>                 Remote name for remote refs and PR checks (default: origin)
  --cwd <path>                    Repository root (default: current working directory)
  --no-gh                         Skip GitHub open PR lookup
  -h, --help                      Show this help
`);
}

function listBranchRefs(cwd, remoteName) {
  const output = runGit(
    [
      "for-each-ref",
      "--sort=-committerdate",
      "--format=%(refname)|%(refname:short)|%(objectname)|%(committerdate:iso-strict)|%(authorname)|%(subject)",
      "refs/heads",
      `refs/remotes/${remoteName}`,
    ],
    cwd,
  );

  const branches = new Map();

  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const [refName, shortName, , date, author, subject] = line.split("|");

    if (refName === `refs/remotes/${remoteName}/HEAD`) {
      continue;
    }

    const logicalName = normalizeBranchName(shortName);

    if (!logicalName) {
      continue;
    }

    const isLocal = refName.startsWith("refs/heads/");
    const existing = branches.get(logicalName) || {
      name: logicalName,
      localRef: null,
      remoteRef: null,
    };

    const existingDate = existing.lastCommitDate
      ? new Date(existing.lastCommitDate).getTime()
      : Number.NEGATIVE_INFINITY;
    const candidateDate = date
      ? new Date(date).getTime()
      : Number.NEGATIVE_INFINITY;
    const next =
      candidateDate >= existingDate
        ? {
            ...existing,
            lastCommitAuthor: author,
            lastCommitDate: date,
            subject,
          }
        : { ...existing };

    if (isLocal) {
      next.localRef = shortName;
    } else {
      next.remoteRef = shortName;
    }

    branches.set(logicalName, next);
  }

  return [...branches.values()];
}

function branchExists(cwd, refName) {
  const result = spawnSync("git", ["rev-parse", "--verify", refName], {
    cwd,
    encoding: "utf8",
  });

  return result.status === 0;
}

function resolveBaseRef(cwd, branchName, remoteName) {
  if (branchExists(cwd, `refs/heads/${branchName}`)) {
    return branchName;
  }

  if (branchExists(cwd, `refs/remotes/${remoteName}/${branchName}`)) {
    return `${remoteName}/${branchName}`;
  }

  return null;
}

function readMergedInto(cwd, branch, baseRefs) {
  const sourceRef = branch.localRef || branch.remoteRef;
  const mergedInto = {};

  for (const baseRef of baseRefs) {
    if (!baseRef || baseRef === sourceRef) {
      mergedInto[baseRef] = false;
      continue;
    }

    const result = spawnSync(
      "git",
      ["merge-base", "--is-ancestor", sourceRef, baseRef],
      {
        cwd,
        encoding: "utf8",
      },
    );
    mergedInto[baseRef] = result.status === 0;
  }

  return mergedInto;
}

function readDivergence(cwd, branch, remoteName) {
  if (!branch.localRef || !branch.remoteRef) {
    return null;
  }

  const result = spawnSync(
    "git",
    [
      "rev-list",
      "--left-right",
      "--count",
      `${branch.localRef}...${remoteName}/${branch.name}`,
    ],
    {
      cwd,
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    return null;
  }

  const [aheadRaw, behindRaw] = result.stdout.trim().split(/\s+/);

  return {
    ahead: Number(aheadRaw || 0),
    behind: Number(behindRaw || 0),
  };
}

function loadOpenPrsByBranch(cwd) {
  if (!commandExists("gh", cwd)) {
    return {
      available: false,
      byBranch: new Map(),
      summary: "unavailable (gh CLI not installed or not in PATH)",
    };
  }

  const result = spawnSync(
    "gh",
    [
      "pr",
      "list",
      "--state",
      "open",
      "--json",
      "baseRefName,headRefName,isDraft,number,reviewDecision,url",
    ],
    {
      cwd,
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    return {
      available: false,
      byBranch: new Map(),
      summary: `unavailable (${(result.stderr || result.stdout).trim() || "gh PR lookup failed"})`,
    };
  }

  const pullRequests = JSON.parse(result.stdout || "[]");
  const byBranch = new Map();

  for (const pullRequest of pullRequests) {
    const key = pullRequest.headRefName;
    const existing = byBranch.get(key) || [];
    existing.push({
      baseRefName: pullRequest.baseRefName,
      isDraft: pullRequest.isDraft,
      number: pullRequest.number,
      reviewDecision: pullRequest.reviewDecision,
      url: pullRequest.url,
    });
    byBranch.set(key, existing);
  }

  return {
    available: true,
    byBranch,
    summary: "available",
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const currentBranch = runGit(
    ["branch", "--show-current"],
    options.cwd,
  ).trim();
  const workingTreeDirty =
    runGit(["status", "--porcelain"], options.cwd)
      .split(/\r?\n/)
      .filter(Boolean).length > 0;
  const referenceFiles = loadReferenceFiles(
    options.cwd,
    options.referencePaths,
  );
  const baseRefs = [
    resolveBaseRef(options.cwd, "main", options.remoteName),
    ...options.integrationBranches.map((branchName) =>
      resolveBaseRef(options.cwd, branchName, options.remoteName),
    ),
  ].filter(Boolean);
  const openPrState = options.prCheck
    ? loadOpenPrsByBranch(options.cwd)
    : {
        available: false,
        byBranch: new Map(),
        summary: "skipped (--no-gh)",
      };

  const branches = listBranchRefs(options.cwd, options.remoteName).map(
    (branch) => ({
      ...branch,
      divergence: readDivergence(options.cwd, branch, options.remoteName),
      mergedInto: readMergedInto(options.cwd, branch, baseRefs),
    }),
  );

  const report = buildBranchAuditReport({
    branches,
    currentBranch,
    openPrsByBranch: openPrState.byBranch,
    options: {
      abandonedDays: options.abandonedDays,
      activeDays: options.activeDays,
      prCheckAvailable: openPrState.available,
    },
    referenceFiles,
    workingTreeDirty,
  });

  if (options.format === "markdown" || options.format === "both") {
    process.stdout.write(
      formatMarkdownReport(report, {
        prCheckSummary: openPrState.summary,
      }),
    );
  }

  if (options.format === "json" || options.format === "both") {
    if (options.format === "both") {
      process.stdout.write("\n");
    }

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}

module.exports = {
  listBranchRefs,
  loadOpenPrsByBranch,
  parseArgs,
  resolveBaseRef,
};
