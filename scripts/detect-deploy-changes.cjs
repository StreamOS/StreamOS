#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = process.cwd();

const deployOutputs = [
  "deploy_web",
  "deploy_api_gateway",
  "deploy_automation_service",
  "deploy_transcription_worker",
  "deploy_clip_worker",
  "deploy_content_job_retry_worker",
  "run_migrations",
  "has_deployable_changes",
];

const deployTargets = {
  deploy_web: {
    displayName: "apps/web",
    packagePath: "apps/web",
  },
  deploy_api_gateway: {
    displayName: "services/api-gateway",
    packagePath: "services/api-gateway",
  },
  deploy_automation_service: {
    displayName: "services/automation-service",
    packagePath: "services/automation-service",
    directOnly: true,
  },
  deploy_transcription_worker: {
    displayName: "workers/transcription-worker",
    packagePath: "workers/transcription-worker",
  },
  deploy_clip_worker: {
    displayName: "workers/clip-worker",
    packagePath: "workers/clip-worker",
  },
  deploy_content_job_retry_worker: {
    displayName: "workers/content-job-retry-worker",
    packagePath: "workers/content-job-retry-worker",
  },
};

const directPathTriggers = {
  "Dockerfile.api-gateway": ["deploy_api_gateway"],
  "Dockerfile.automation-service": ["deploy_automation_service"],
  "Dockerfile.transcription-worker": ["deploy_transcription_worker"],
  "Dockerfile.clip-worker": ["deploy_clip_worker"],
  "Dockerfile.content-job-retry-worker": ["deploy_content_job_retry_worker"],
};

const rootNodeTriggers = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
]);

function parseArgs(argv) {
  const options = {
    base: "",
    head: "HEAD",
    forceAll: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base") {
      options.base = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--head") {
      options.head = argv[index + 1] ?? "HEAD";
      index += 1;
      continue;
    }
    if (arg === "--force-all") {
      options.forceAll = true;
    }
  }

  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listWorkspacePackageJsonFiles() {
  const roots = ["apps", "services", "workers", "packages"];
  const files = [];

  for (const root of roots) {
    const absRoot = path.join(repoRoot, root);
    if (!fs.existsSync(absRoot)) {
      continue;
    }

    for (const entry of fs.readdirSync(absRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const packageJsonPath = path.join(absRoot, entry.name, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        files.push(packageJsonPath);
      }
    }
  }

  return files;
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function collectWorkspacePackages() {
  const packagesByName = new Map();
  const packagesByPath = new Map();

  for (const packageJsonPath of listWorkspacePackageJsonFiles()) {
    const manifest = readJson(packageJsonPath);
    const packageDir = normalizePath(
      path.relative(repoRoot, path.dirname(packageJsonPath)),
    );
    const dependencyNames = new Set();

    for (const field of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      const deps = manifest[field] ?? {};
      for (const [dependencyName, version] of Object.entries(deps)) {
        if (typeof version === "string" && version.startsWith("workspace:")) {
          dependencyNames.add(dependencyName);
        }
      }
    }

    const packageInfo = {
      name: manifest.name,
      path: packageDir,
      dependencies: dependencyNames,
    };

    packagesByName.set(packageInfo.name, packageInfo);
    packagesByPath.set(packageInfo.path, packageInfo);
  }

  return { packagesByName, packagesByPath };
}

function buildReverseDependencyGraph(packagesByName) {
  const reverseGraph = new Map();

  for (const packageInfo of packagesByName.values()) {
    for (const dependencyName of packageInfo.dependencies) {
      if (!packagesByName.has(dependencyName)) {
        continue;
      }
      if (!reverseGraph.has(dependencyName)) {
        reverseGraph.set(dependencyName, new Set());
      }
      reverseGraph.get(dependencyName).add(packageInfo.name);
    }
  }

  return reverseGraph;
}

function gitDiffNames(base, head) {
  const output = execFileSync("git", ["diff", "--name-only", base, head], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(normalizePath);
}

function isAllZeroSha(value) {
  return /^0+$/.test(value);
}

function resolveImpactedPackages(changedPackageNames, reverseGraph) {
  const impacted = new Set(changedPackageNames);
  const queue = [...changedPackageNames];

  while (queue.length > 0) {
    const current = queue.shift();
    const dependents = reverseGraph.get(current);
    if (!dependents) {
      continue;
    }

    for (const dependent of dependents) {
      if (impacted.has(dependent)) {
        continue;
      }
      impacted.add(dependent);
      queue.push(dependent);
    }
  }

  return impacted;
}

function writeOutputs(result) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }

  const lines = deployOutputs.map((name) => `${name}=${result[name]}`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}

function writeSummary(result, changedFiles, modeDescription) {
  const lines = [
    "## Deploy Change Detection",
    "",
    `- Mode: ${modeDescription}`,
  ];

  if (changedFiles.length > 0) {
    lines.push(`- Compared files: ${changedFiles.length}`);
  }

  lines.push("", "| Target | Deploy? |", "| --- | --- |");

  for (const [outputName, target] of Object.entries(deployTargets)) {
    lines.push(`| ${target.displayName} | ${result[outputName]} |`);
  }

  lines.push(
    `| packages/database/supabase/migrations | ${result.run_migrations} |`,
  );
  lines.push(
    "",
    `- Deployable changes detected: ${result.has_deployable_changes}`,
  );

  const summary = `${lines.join("\n")}\n`;
  process.stdout.write(`${summary}\n`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
}

function allTrueResult() {
  return {
    deploy_web: "true",
    deploy_api_gateway: "true",
    deploy_automation_service: "true",
    deploy_transcription_worker: "true",
    deploy_clip_worker: "true",
    deploy_content_job_retry_worker: "true",
    run_migrations: "true",
    has_deployable_changes: "true",
  };
}

function detectChanges(options) {
  if (options.forceAll || !options.base || isAllZeroSha(options.base)) {
    return {
      changedFiles: [],
      modeDescription: options.forceAll
        ? "force-all"
        : "fallback-all (missing or zero base SHA)",
      result: allTrueResult(),
    };
  }

  const changedFiles = gitDiffNames(options.base, options.head);
  const { packagesByName, packagesByPath } = collectWorkspacePackages();
  const reverseGraph = buildReverseDependencyGraph(packagesByName);

  const changedPackageNames = new Set();
  const directOutputs = new Set();
  let runMigrations = false;

  for (const filePath of changedFiles) {
    if (filePath.startsWith("packages/database/supabase/migrations/")) {
      runMigrations = true;
      continue;
    }

    for (const [triggerPath, outputs] of Object.entries(directPathTriggers)) {
      if (filePath === triggerPath) {
        for (const outputName of outputs) {
          directOutputs.add(outputName);
        }
      }
    }

    if (rootNodeTriggers.has(filePath)) {
      directOutputs.add("deploy_web");
      directOutputs.add("deploy_api_gateway");
      directOutputs.add("deploy_transcription_worker");
      directOutputs.add("deploy_clip_worker");
      directOutputs.add("deploy_content_job_retry_worker");
      continue;
    }

    for (const [packagePath, packageInfo] of packagesByPath.entries()) {
      if (filePath === packagePath || filePath.startsWith(`${packagePath}/`)) {
        changedPackageNames.add(packageInfo.name);
      }
    }
  }

  const impactedPackages = resolveImpactedPackages(
    changedPackageNames,
    reverseGraph,
  );

  const result = {
    deploy_web: "false",
    deploy_api_gateway: "false",
    deploy_automation_service: "false",
    deploy_transcription_worker: "false",
    deploy_clip_worker: "false",
    deploy_content_job_retry_worker: "false",
    run_migrations: runMigrations ? "true" : "false",
    has_deployable_changes: "false",
  };

  for (const outputName of directOutputs) {
    result[outputName] = "true";
  }

  for (const [outputName, target] of Object.entries(deployTargets)) {
    if (result[outputName] === "true") {
      continue;
    }

    if (target.directOnly) {
      const changedDirectly = changedFiles.some(
        (filePath) =>
          filePath === target.packagePath ||
          filePath.startsWith(`${target.packagePath}/`),
      );
      if (changedDirectly) {
        result[outputName] = "true";
      }
      continue;
    }

    const packageInfo = packagesByPath.get(target.packagePath);
    if (packageInfo && impactedPackages.has(packageInfo.name)) {
      result[outputName] = "true";
    }
  }

  result.has_deployable_changes = Object.entries(result).some(
    ([outputName, value]) =>
      outputName !== "has_deployable_changes" && value === "true",
  )
    ? "true"
    : "false";

  return {
    changedFiles,
    modeDescription: `git diff ${options.base}..${options.head}`,
    result,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const { changedFiles, modeDescription, result } = detectChanges(options);
  writeOutputs(result);
  writeSummary(result, changedFiles, modeDescription);
}

main();
