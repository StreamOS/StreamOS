#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { resolve, join, dirname } = require("node:path");

const { consumeValueFlag } = require("./lib/cli-args.cjs");
const {
  collectUnexpectedVercelEnvNames,
  assertVercelEnvironment,
} = require("./config/vercel-env-policy.cjs");

const DEFAULT_VERCEL_DIR = ".vercel";
const DEFAULT_VERCEL_ENVIRONMENT = process.env.VERCEL_ENV?.trim() || "preview";

function parseArgs(argv) {
  const options = {
    environment: DEFAULT_VERCEL_ENVIRONMENT,
    envFile: undefined,
    help: false,
    vercelDir: DEFAULT_VERCEL_DIR,
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

    const environmentMatch = consumeValueFlag(argv, index, [
      "env",
      "environment",
    ]);

    if (environmentMatch.matched) {
      options.environment = environmentMatch.value.trim();
      index = environmentMatch.nextIndex;
      continue;
    }

    const envFileMatch = consumeValueFlag(argv, index, "env-file");

    if (envFileMatch.matched) {
      options.envFile = resolve(envFileMatch.value.trim());
      index = envFileMatch.nextIndex;
      continue;
    }

    const vercelDirMatch = consumeValueFlag(argv, index, "vercel-dir");

    if (vercelDirMatch.matched) {
      options.vercelDir = resolve(vercelDirMatch.value.trim());
      index = vercelDirMatch.nextIndex;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!["preview", "production"].includes(options.environment)) {
    throw new Error("--environment must be either preview or production.");
  }

  return options;
}

function printHelp() {
  console.log(`StreamOS Vercel environment audit

Usage:
  pnpm vercel:audit -- --environment preview
  pnpm vercel:audit -- --environment production
  pnpm vercel:audit -- --env-file .vercel/.env.preview.local

Options:
  --environment ENV   Vercel environment to audit. Allowed values: preview, production. Default: ${DEFAULT_VERCEL_ENVIRONMENT}.
  --env-file PATH     Audit a specific env file instead of the default .vercel path.
  --vercel-dir PATH   Root directory that contains the pulled .vercel folder. Default: ${DEFAULT_VERCEL_DIR}.
`);
}

function loadEnvFile(path) {
  if (!path || !existsSync(path)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const rawValue = line.slice(index + 1).trim();
        const value = rawValue.replace(/^["']|["']$/g, "");
        return [key, value];
      }),
  );
}

function resolveEnvFilePath({ envFile, environment, vercelDir }) {
  if (envFile) {
    return envFile;
  }

  return join(vercelDir, `.env.${environment}.local`);
}

function loadRemoteEnvKeys({ environment, vercelDir }) {
  const projectFile = join(vercelDir, "project.json");

  if (!existsSync(projectFile)) {
    return new Set();
  }

  const projectDirectory = dirname(vercelDir);
  const result =
    process.platform === "win32"
      ? spawnSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-Command",
            `vercel env list ${environment} --cwd '${projectDirectory.replace(/'/g, "''")}' --format json`,
          ],
          {
            encoding: "utf8",
            env: process.env,
          },
        )
      : spawnSync(
          "vercel",
          [
            "env",
            "list",
            environment,
            "--cwd",
            projectDirectory,
            "--format",
            "json",
          ],
          {
            encoding: "utf8",
            env: process.env,
          },
        );

  if (result.status !== 0) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(result.stdout);
    return new Set(
      Array.isArray(parsed?.envs)
        ? parsed.envs
            .map((entry) => entry?.key)
            .filter((key) => typeof key === "string" && key.trim() !== "")
        : [],
    );
  } catch {
    return new Set();
  }
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    return;
  }

  const envFile = resolveEnvFilePath(options);
  const env = loadEnvFile(envFile);
  const remoteEnvKeys = loadRemoteEnvKeys({
    environment: options.environment,
    vercelDir: options.vercelDir,
  });

  if (!existsSync(envFile)) {
    throw new Error(`Vercel env file not found: ${envFile}`);
  }

  assertVercelEnvironment(env, {
    contextLabel: `Vercel ${options.environment} environment (${envFile})`,
    knownPresentNames: remoteEnvKeys,
    requireRequired: true,
    validatePublicUrls: true,
  });

  const unexpectedEnvNames = collectUnexpectedVercelEnvNames(
    env,
    remoteEnvKeys,
  );

  if (unexpectedEnvNames.length > 0) {
    console.warn(
      [
        `Unexpected Vercel ${options.environment} environment variables detected:`,
        ...unexpectedEnvNames.map((name) => `- ${name}`),
      ].join("\n"),
    );
  }

  console.log(
    `Vercel ${options.environment} environment audit passed: ${envFile}`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Vercel environment audit failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_VERCEL_DIR,
  DEFAULT_VERCEL_ENVIRONMENT,
  loadEnvFile,
  loadRemoteEnvKeys,
  main,
  parseArgs,
  printHelp,
  resolveEnvFilePath,
};
