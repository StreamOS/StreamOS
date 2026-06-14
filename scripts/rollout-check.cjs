#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const { consumeValueFlag } = require("./lib/cli-args.cjs");

const DEFAULT_EXPECTED_TRANSCRIPTION_STATUS = "done";

function parseArgs(argv) {
  const options = {
    allowHostedE2e: false,
    expectPrivateAutomation: false,
    help: false,
    skipDocker: false,
    transcriptionExpect: DEFAULT_EXPECTED_TRANSCRIPTION_STATUS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--allow-hosted-e2e") {
      options.allowHostedE2e = true;
      continue;
    }

    const apiGatewayUrlMatch = consumeValueFlag(argv, index, "api-gateway-url");

    if (apiGatewayUrlMatch.matched) {
      options.apiGatewayUrl = apiGatewayUrlMatch.value.trim();
      index = apiGatewayUrlMatch.nextIndex;
      continue;
    }

    const automationServiceUrlMatch = consumeValueFlag(
      argv,
      index,
      "automation-service-url",
    );

    if (automationServiceUrlMatch.matched) {
      options.automationServiceUrl = automationServiceUrlMatch.value.trim();
      index = automationServiceUrlMatch.nextIndex;
      continue;
    }

    const dockerBinMatch = consumeValueFlag(argv, index, "docker-bin");

    if (dockerBinMatch.matched) {
      options.dockerBin = dockerBinMatch.value.trim();
      index = dockerBinMatch.nextIndex;
      continue;
    }

    const envFileMatch = consumeValueFlag(argv, index, "env-file");

    if (envFileMatch.matched) {
      options.envFile = envFileMatch.value.trim();
      index = envFileMatch.nextIndex;
      continue;
    }

    const expectMatch = consumeValueFlag(argv, index, "expect");

    if (expectMatch.matched) {
      options.transcriptionExpect = expectMatch.value.trim();
      index = expectMatch.nextIndex;
      continue;
    }

    if (arg === "--expect-private-automation") {
      options.expectPrivateAutomation = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    const pollMsMatch = consumeValueFlag(argv, index, "poll-ms");

    if (pollMsMatch.matched) {
      options.pollMs = pollMsMatch.value.trim();
      index = pollMsMatch.nextIndex;
      continue;
    }

    if (arg === "--skip-docker") {
      options.skipDocker = true;
      continue;
    }

    const timeoutMsMatch = consumeValueFlag(argv, index, "timeout-ms");

    if (timeoutMsMatch.matched) {
      options.timeoutMs = timeoutMsMatch.value.trim();
      index = timeoutMsMatch.nextIndex;
      continue;
    }

    const userIdMatch = consumeValueFlag(argv, index, "user-id");

    if (userIdMatch.matched) {
      options.userId = userIdMatch.value.trim();
      index = userIdMatch.nextIndex;
      continue;
    }

    const waitMsMatch = consumeValueFlag(argv, index, "wait-ms");

    if (waitMsMatch.matched) {
      options.waitMs = waitMsMatch.value.trim();
      index = waitMsMatch.nextIndex;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!["done", "failed"].includes(options.transcriptionExpect)) {
    throw new Error("--expect must be either done or failed.");
  }

  return options;
}

function printHelp() {
  console.log(`StreamOS rollout gate

Usage:
  pnpm rollout:check -- --env-file .env.test
  pnpm rollout:check -- --env-file .env --skip-docker --allow-hosted-e2e --api-gateway-url https://api.example.com --automation-service-url http://automation-service.railway.internal:8000 --expect-private-automation

Required checks:
  1. Supabase migration/RLS/index validator
  2. API Gateway typecheck
  3. API Gateway integration and signed-webhook tests
  4. Transcription E2E: webhook -> BullMQ -> worker -> content_jobs write
  5. Deployment health checks for API Gateway and Automation Service

Options:
  --allow-hosted-e2e             Allow transcription E2E writes to a hosted Supabase project.
  --api-gateway-url URL          API Gateway base URL for deployment checks and E2E trigger.
  --automation-service-url URL   Automation Service base URL for deployment checks.
  --docker-bin BIN               Docker-compatible CLI for local E2E runs.
  --env-file PATH                Env file passed to deployment and E2E checks.
  --expect done|failed           Expected transcription E2E terminal status. Default: ${DEFAULT_EXPECTED_TRANSCRIPTION_STATUS}.
  --expect-private-automation    Fail if Automation Service URL is public-facing.
  --poll-ms N                    Transcription E2E polling interval.
  --skip-docker                  Use already running/deployed services for transcription E2E.
  --timeout-ms N                 Deployment health-check request timeout.
  --user-id UUID                 Supabase auth user for transcription E2E.
  --wait-ms N                    Transcription E2E maximum wait time.
`);
}

function run(command, args, label) {
  console.log(`\n==> ${label}`);
  const needsWindowsShell =
    process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command);
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: needsWindowsShell,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}.`);
  }
}

function runPnpm(args, label) {
  const corepackCommand =
    process.platform === "win32" ? "corepack.cmd" : "corepack";
  run(corepackCommand, ["pnpm", ...args], label);
}

function buildDeploymentArgs(options) {
  const args = ["scripts/check-deployment.cjs"];

  if (options.apiGatewayUrl) {
    args.push("--api-gateway-url", options.apiGatewayUrl);
  }

  if (options.automationServiceUrl) {
    args.push("--automation-service-url", options.automationServiceUrl);
  }

  if (options.envFile) {
    args.push("--env-file", options.envFile);
  }

  if (options.expectPrivateAutomation) {
    args.push("--expect-private-automation");
  }

  if (options.timeoutMs) {
    args.push("--timeout-ms", options.timeoutMs);
  }

  return args;
}

function buildTranscriptionArgs(options) {
  const args = [
    "scripts/e2e-transcription-job.cjs",
    "--expect",
    options.transcriptionExpect,
  ];

  if (options.allowHostedE2e) {
    args.push("--allow-hosted");
  }

  if (options.apiGatewayUrl) {
    args.push("--api-gateway-url", options.apiGatewayUrl);
  }

  if (options.dockerBin) {
    args.push("--docker-bin", options.dockerBin);
  }

  if (options.envFile) {
    args.push("--env-file", options.envFile);
  }

  if (options.pollMs) {
    args.push("--poll-ms", options.pollMs);
  }

  if (options.skipDocker) {
    args.push("--skip-docker");
  }

  if (options.userId) {
    args.push("--user-id", options.userId);
  }

  if (options.waitMs) {
    args.push("--wait-ms", options.waitMs);
  }

  return args;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  runPnpm(["db:validate-security"], "Supabase migration/RLS/index validation");
  runPnpm(
    ["--filter", "@streamos/api-gateway", "typecheck"],
    "API Gateway typecheck",
  );
  runPnpm(
    ["--filter", "@streamos/api-gateway", "test"],
    "API Gateway integration and signed-webhook tests",
  );
  run(
    process.execPath,
    buildTranscriptionArgs(options),
    "Transcription E2E path",
  );
  run(
    process.execPath,
    buildDeploymentArgs(options),
    "Deployment health checks",
  );

  console.log("\nStreamOS rollout gate passed.");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(
      `StreamOS rollout gate failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_EXPECTED_TRANSCRIPTION_STATUS,
  buildDeploymentArgs,
  buildTranscriptionArgs,
  main,
  parseArgs,
  printHelp,
};
