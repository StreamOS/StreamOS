#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const DEFAULT_REMOTE_SERVICE = "transcription-worker";
const DEFAULT_TIMEOUT_MS = 5_000;

function parseArgs(argv) {
  const options = {
    expectPrivateAutomation: true,
    help: false,
    service: DEFAULT_REMOTE_SERVICE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    } else if (arg.startsWith("--api-gateway-url=")) {
      options.apiGatewayUrl = arg.slice("--api-gateway-url=".length).trim();
    } else if (arg.startsWith("--automation-service-url=")) {
      options.automationServiceUrl = arg
        .slice("--automation-service-url=".length)
        .trim();
    } else if (arg === "--allow-public-automation") {
      options.expectPrivateAutomation = false;
    } else if (arg === "--expect-private-automation") {
      options.expectPrivateAutomation = true;
    } else if (arg.startsWith("--environment=")) {
      options.environment = arg.slice("--environment=".length).trim();
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--identity-file=")) {
      options.identityFile = arg.slice("--identity-file=".length).trim();
    } else if (arg.startsWith("--project-id=")) {
      options.projectId = arg.slice("--project-id=".length).trim();
    } else if (arg.startsWith("--service=")) {
      options.service = arg.slice("--service=".length).trim();
    } else if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = Number(arg.slice("--timeout-ms=".length).trim());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 500) {
    throw new Error("--timeout-ms must be an integer >= 500.");
  }

  return options;
}

function printHelp() {
  console.log(`StreamOS Railway smoke verification

Usage:
  pnpm deployment:check:remote -- --project-id=<railway-project-id> --environment=production --api-gateway-url=https://streamos-api-gateway.up.railway.app --identity-file=$HOME/.ssh/railway_verifier

This command SSHes into a deployed Railway service that can reach private
networking, then runs scripts/check-deployment.cjs inside the container.

Options:
  --api-gateway-url=URL          Public API Gateway base URL. Required unless the remote service exports API_GATEWAY_URL.
  --automation-service-url=URL   Automation Service base URL override.
  --allow-public-automation      Skip the private-network enforcement check.
  --expect-private-automation    Enforce private-network automation URL validation. Default: enabled.
  --environment=NAME             Railway environment name or ID. Required.
  --identity-file=PATH           SSH private key forwarded to railway ssh.
  --project-id=ID                Railway project ID. Falls back to RAILWAY_PROJECT_ID.
  --service=NAME                 Railway service to SSH into. Default: ${DEFAULT_REMOTE_SERVICE}.
  --timeout-ms=N                 Health-check timeout. Default: ${DEFAULT_TIMEOUT_MS}.
`);
}

function requireNonEmpty(value, message) {
  if (!value || !value.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

function getRailwayCommand() {
  return process.platform === "win32" ? "railway.cmd" : "railway";
}

function buildRemoteCommand(options) {
  const command = ["node", "scripts/check-deployment.cjs"];

  if (options.apiGatewayUrl) {
    command.push(`--api-gateway-url=${options.apiGatewayUrl}`);
  }

  if (options.automationServiceUrl) {
    command.push(`--automation-service-url=${options.automationServiceUrl}`);
  }

  if (options.expectPrivateAutomation) {
    command.push("--expect-private-automation");
  }

  command.push(`--timeout-ms=${options.timeoutMs}`);

  return command;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const projectId = requireNonEmpty(
    options.projectId ?? process.env.RAILWAY_PROJECT_ID,
    "Railway project ID is required. Pass --project-id or set RAILWAY_PROJECT_ID.",
  );
  const environment = requireNonEmpty(
    options.environment,
    "Railway environment is required. Pass --environment=<name>.",
  );
  const service = requireNonEmpty(
    options.service,
    "Railway service is required. Pass --service=<name>.",
  );

  const args = [
    "ssh",
    "--project",
    projectId,
    "--environment",
    environment,
    "--service",
    service,
  ];

  if (options.identityFile) {
    args.push("--identity-file", options.identityFile);
  }

  args.push(...buildRemoteCommand(options));

  console.log(
    `Running Railway smoke check via ${service} in ${environment} for project ${projectId}.`,
  );

  const result = spawnSync(getRailwayCommand(), args, {
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Railway smoke verification failed with exit code ${result.status}.`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error(
    `StreamOS Railway smoke verification failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}
