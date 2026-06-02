#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const binDirName = process.platform === "win32" ? "Scripts" : "bin";
const pythonBinName = process.platform === "win32" ? "python.exe" : "python";
const localPython = path.join(repoRoot, ".venv", binDirName, pythonBinName);
const bundledPython = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "python",
  pythonBinName,
);

const candidates = [
  process.env.STREAMOS_PYTHON,
  localPython,
  bundledPython,
  "python",
  "python3.12",
  "python3",
].filter(Boolean);

function isPathCandidate(candidate) {
  return candidate.includes("/") || candidate.includes("\\");
}

function getPythonVersion(candidate) {
  if (isPathCandidate(candidate) && !existsSync(candidate)) {
    return null;
  }

  const result = spawnSync(candidate, ["--version"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return `${result.stdout || ""}${result.stderr || ""}`.trim();
}

const selectedPython = candidates.find((candidate) => {
  const version = getPythonVersion(candidate);
  return version ? /^Python 3\.12\./.test(version) : false;
});

if (!selectedPython) {
  console.error(
    "Python 3.12 is required. Set STREAMOS_PYTHON to a Python 3.12 executable or create .venv with Python 3.12.",
  );
  process.exit(1);
}

const selectedBinDir = isPathCandidate(selectedPython)
  ? path.dirname(selectedPython)
  : null;
const env = {
  ...process.env,
  PATH: selectedBinDir
    ? `${selectedBinDir}${path.delimiter}${process.env.PATH || ""}`
    : process.env.PATH,
};

const args = process.argv.slice(2);
const command = args[0] === "python" ? selectedPython : args[0];
const commandArgs = args[0] === "python" ? args.slice(1) : args.slice(1);

if (!command) {
  console.error("Usage: node scripts/with-python-312.cjs python <args...>");
  process.exit(1);
}

const result = spawnSync(command, commandArgs, {
  cwd: repoRoot,
  env,
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
