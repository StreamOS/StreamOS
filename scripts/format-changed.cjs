#!/usr/bin/env node

const { existsSync, statSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const cliArgs = new Set(process.argv.slice(2));
const write = cliArgs.has("--write");
const stagedOnly = cliArgs.has("--staged");
const prettierMode = write ? "--write" : "--check";

const supportedExtensions = new Set([
  ".cjs",
  ".css",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const generatedSegments = new Set([
  ".cache",
  ".git",
  ".next",
  ".pytest_cache",
  ".turbo",
  ".venv",
  "blob-report",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "playwright-report",
  "test-results",
]);

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });

  if (result.error || result.status !== 0) {
    const detail =
      result.stderr?.trim() || result.error?.message || "unknown git error";
    console.error(`Failed to collect changed files: ${detail}`);
    process.exit(result.status || 1);
  }

  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function normalizeGitPath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function isGeneratedPath(filePath) {
  return normalizeGitPath(filePath)
    .split("/")
    .some((segment) => generatedSegments.has(segment));
}

function isSupportedPath(filePath) {
  return supportedExtensions.has(path.extname(filePath).toLowerCase());
}

function isExistingFile(filePath) {
  const absolutePath = path.join(repoRoot, filePath);
  return existsSync(absolutePath) && statSync(absolutePath).isFile();
}

function collectChangedFiles() {
  const files = new Set();
  const add = (filePath) => {
    const normalizedPath = normalizeGitPath(filePath);

    if (
      isSupportedPath(normalizedPath) &&
      !isGeneratedPath(normalizedPath) &&
      isExistingFile(normalizedPath)
    ) {
      files.add(normalizedPath);
    }
  };

  runGit([
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMRTUXB",
    "--",
  ]).forEach(add);

  if (!stagedOnly) {
    runGit(["diff", "--name-only", "--diff-filter=ACMRTUXB", "--"]).forEach(
      add,
    );
    runGit(["ls-files", "--others", "--exclude-standard"]).forEach(add);
  }

  return [...files].sort((left, right) => left.localeCompare(right));
}

function runPrettier(files) {
  const command = process.execPath;
  const prettierBin = path.join(
    repoRoot,
    "node_modules",
    "prettier",
    "bin",
    "prettier.cjs",
  );
  const chunkSize = 40;

  for (let index = 0; index < files.length; index += chunkSize) {
    const chunk = files.slice(index, index + chunkSize);
    const result = spawnSync(
      command,
      [
        prettierBin,
        prettierMode,
        "--ignore-unknown",
        "--ignore-path",
        ".prettierignore",
        ...chunk,
      ],
      {
        cwd: repoRoot,
        stdio: "inherit",
        shell: false,
      },
    );

    if (result.error || result.status !== 0) {
      process.exit(result.status || 1);
    }
  }
}

const files = collectChangedFiles();

if (files.length === 0) {
  console.log(
    stagedOnly
      ? "No staged Prettier-supported files found."
      : "No changed Prettier-supported files found.",
  );
  process.exit(0);
}

console.log(
  `${write ? "Formatting" : "Checking"} ${files.length} ${stagedOnly ? "staged" : "changed"} file(s) with Prettier.`,
);

runPrettier(files);
