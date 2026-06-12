#!/usr/bin/env node

const { appendFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");

const ALL_RAILWAY_SERVICES = [
  "api-gateway",
  "automation-service",
  "clip-worker",
  "stream-job-worker",
  "transcription-worker",
  "content-job-retry-worker",
];

const SHARED_BACKEND_PATHS = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "packages/",
];

const SERVICE_PATHS = {
  "api-gateway": ["services/api-gateway/", "Dockerfile.api-gateway"],
  "automation-service": [
    "services/automation-service/",
    "Dockerfile.automation-service",
  ],
  "clip-worker": ["workers/clip-worker/", "Dockerfile.clip-worker"],
  "stream-job-worker": [
    "workers/stream-job-worker/",
    "Dockerfile.stream-job-worker",
  ],
  "transcription-worker": [
    "workers/transcription-worker/",
    "Dockerfile.transcription-worker",
  ],
  "content-job-retry-worker": [
    "workers/content-job-retry-worker/",
    "Dockerfile.content-job-retry-worker",
  ],
};

const ZERO_SHA_PATTERN = /^0{40}$/;

function parseArgs(argv) {
  const args = {};

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (!value.startsWith("--")) {
      continue;
    }

    const separatorIndex = value.indexOf("=");

    if (separatorIndex === -1) {
      const key = value.slice(2);
      const nextValue = argv[index + 1];

      if (!nextValue || nextValue.startsWith("--")) {
        args[key] = "true";
        continue;
      }

      args[key] = nextValue;
      index += 1;
      continue;
    }

    args[value.slice(2, separatorIndex)] = value.slice(separatorIndex + 1);
  }

  return args;
}

function matchesPath(filePath, candidatePath) {
  return candidatePath.endsWith("/")
    ? filePath.startsWith(candidatePath)
    : filePath === candidatePath;
}

function getChangedFiles({ base, head }) {
  if (
    !base ||
    !head ||
    ZERO_SHA_PATTERN.test(base) ||
    ZERO_SHA_PATTERN.test(head)
  ) {
    return null;
  }

  try {
    const output = execFileSync(
      "git",
      ["diff", "--name-only", `${base}..${head}`],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    return output
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

function detectRailwayServices(changedFiles) {
  if (changedFiles === null) {
    return {
      detectionMode: "all",
      railwayServices: [...ALL_RAILWAY_SERVICES],
    };
  }

  if (
    changedFiles.some((filePath) =>
      SHARED_BACKEND_PATHS.some((candidatePath) =>
        matchesPath(filePath, candidatePath),
      ),
    )
  ) {
    return {
      detectionMode: "shared-backend-change",
      railwayServices: [...ALL_RAILWAY_SERVICES],
    };
  }

  const railwayServices = ALL_RAILWAY_SERVICES.filter((service) =>
    changedFiles.some((filePath) =>
      SERVICE_PATHS[service].some((candidatePath) =>
        matchesPath(filePath, candidatePath),
      ),
    ),
  );

  return {
    detectionMode: "incremental",
    railwayServices,
  };
}

function writeGithubOutput(outputPath, outputs) {
  for (const [key, value] of Object.entries(outputs)) {
    appendFileSync(outputPath, `${key}=${value}\n`, "utf8");
  }
}

function main() {
  const args = parseArgs(process.argv);
  const changedFiles = getChangedFiles({
    base: args.base,
    head: args.head,
  });
  const detection = detectRailwayServices(changedFiles);
  const summary = {
    changedFiles: changedFiles ?? [],
    detectionMode: detection.detectionMode,
    railwayServices: detection.railwayServices,
  };

  if (args["github-output"]) {
    writeGithubOutput(args["github-output"], {
      changed_files_json: JSON.stringify(summary.changedFiles),
      deploy_backend: detection.railwayServices.length > 0 ? "true" : "false",
      detection_mode: detection.detectionMode,
      railway_services_json: JSON.stringify(detection.railwayServices),
    });
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main();
