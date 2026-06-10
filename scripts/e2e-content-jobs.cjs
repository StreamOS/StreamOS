#!/usr/bin/env node

const { execFileSync, spawnSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { createInterface } = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const DEFAULT_WAIT_MS = 180_000;
const DEFAULT_POLL_MS = 5_000;
const DEFAULT_ENV_FILE = ".env.test";
const TEST_ENV_FILE = ".env.test";

function parseArgs(argv) {
  const options = {
    autoRelease: false,
    allowHosted: false,
    help: false,
    envFile: DEFAULT_ENV_FILE,
    pollMs: DEFAULT_POLL_MS,
    seedOnly: false,
    skipDocker: false,
    waitMs: DEFAULT_WAIT_MS,
  };

  for (const arg of argv) {
    if (arg === "--auto-release") {
      options.autoRelease = true;
    } else if (arg === "--allow-hosted") {
      options.allowHosted = true;
    } else if (arg.startsWith("--docker-bin=")) {
      options.dockerBin = arg.slice("--docker-bin=".length).trim();
    } else if (arg.startsWith("--env-file=")) {
      options.envFile = arg.slice("--env-file=".length).trim();
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--seed-only") {
      options.seedOnly = true;
    } else if (arg === "--skip-docker") {
      options.skipDocker = true;
    } else if (arg.startsWith("--poll-ms=")) {
      options.pollMs = Number(arg.slice("--poll-ms=".length));
    } else if (arg.startsWith("--wait-ms=")) {
      options.waitMs = Number(arg.slice("--wait-ms=".length));
    } else if (arg.startsWith("--user-id=")) {
      options.userId = arg.slice("--user-id=".length).trim();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.pollMs) || options.pollMs < 500) {
    throw new Error("--poll-ms must be an integer >= 500.");
  }

  if (!Number.isInteger(options.waitMs) || options.waitMs < options.pollMs) {
    throw new Error("--wait-ms must be an integer >= --poll-ms.");
  }

  return options;
}

function printHelp() {
  console.log(`StreamOS content_jobs E2E

Usage:
  pnpm e2e:jobs
  pnpm e2e:jobs:local
  pnpm e2e:jobs -- --auto-release
  pnpm e2e:jobs -- --skip-docker --user-id=<auth-user-uuid>
  pnpm e2e:jobs -- --env-file=.env --allow-hosted

Options:
  --auto-release   Simulate the /dashboard/jobs Retry action through Supabase.
  --allow-hosted   Allow writes to a non-local Supabase URL. Requires intent.
  --docker-bin=BIN Use a specific Docker-compatible CLI binary.
  --env-file=PATH  Load E2E env from a file. Default: ${DEFAULT_ENV_FILE}.
  --seed-only      Create the failed content_job and exit.
  --skip-docker    Do not run docker compose up before seeding.
  --user-id=UUID   Use a specific Supabase auth user. Defaults to E2E_USER_ID, first auth user, or a created E2E user.
  --wait-ms=N      How long to wait for retry-worker claim. Default: ${DEFAULT_WAIT_MS}.
  --poll-ms=N      Poll interval while waiting. Default: ${DEFAULT_POLL_MS}.
`);
}

function loadEnvFile(path) {
  if (!existsSync(path)) {
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

function getEnv(envFile) {
  const selectedEnv = loadEnvFile(envFile);
  const webEnv = loadEnvFile("apps/web/.env.local");

  return {
    ...webEnv,
    ...selectedEnv,
    ...process.env,
  };
}

function requireEnv(env, name) {
  const value = env[name]?.trim();

  if (!value || (value.startsWith("<") && value.endsWith(">"))) {
    throw new Error(`${name} is required in the selected E2E env file.`);
  }

  return value;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const details = result.stderr || result.stdout || "";
    throw new Error(
      `${command} ${args.join(" ")} failed with ${result.status}. ${details}`.trim(),
    );
  }

  return result.stdout;
}

function resolveContainerCli(options) {
  const candidates = [
    options.dockerBin,
    process.env.DOCKER_BIN,
    "docker",
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? `${process.env.LOCALAPPDATA}\\Programs\\DockerDesktop\\resources\\bin\\docker.exe`
      : undefined,
    process.platform === "win32"
      ? "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe"
      : undefined,
    process.platform === "win32"
      ? "C:\\Program Files\\Docker\\Docker\\resources\\bin\\com.docker.cli.exe"
      : undefined,
    "podman",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const result =
      candidate.includes("\\") || candidate.includes("/")
        ? spawnSync(candidate, ["--version"], {
            encoding: "utf8",
            stdio: "pipe",
          })
        : spawnSync(
            process.platform === "win32" ? "where.exe" : "which",
            [candidate],
            {
              encoding: "utf8",
              stdio: "pipe",
            },
          );

    if (result.status === 0) {
      return candidate;
    }
  }

  return null;
}

function getComposeArgs(envFile, args) {
  return ["compose", "--env-file", envFile, ...args];
}

function isLocalSupabaseUrl(value) {
  try {
    const hostname = new URL(value).hostname;
    return ["localhost", "127.0.0.1", "::1", "host.docker.internal"].includes(
      hostname,
    );
  } catch {
    return false;
  }
}

async function supabaseFetch({ body, env, method = "GET", path, query }) {
  const supabaseUrl = requireEnv(env, "SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  const url = new URL(path, supabaseUrl);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const response = await fetch(url, {
        body: body ? JSON.stringify(body) : undefined,
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        method,
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : null;

      if (response.ok) {
        return data;
      }

      if (![502, 503, 504].includes(response.status)) {
        throw new Error(
          `${method} ${url.pathname} failed with ${response.status}: ${text}`,
        );
      }

      if (attempt === 8) {
        throw new Error(
          `${method} ${url.pathname} failed with ${response.status}: ${text}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isRetryableNetworkError =
        !message.includes(" failed with ") ||
        [" failed with 502:", " failed with 503:", " failed with 504:"].some(
          (pattern) => message.includes(pattern),
        );

      if (!isRetryableNetworkError || attempt === 8) {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt));
  }

  throw new Error(`${method} ${url.pathname} failed unexpectedly.`);
}

async function getFirstAuthUserId(env) {
  const data = await supabaseFetch({
    env,
    path: "/auth/v1/admin/users",
    query: {
      page: "1",
      per_page: "1",
    },
  });
  const userId = data?.users?.[0]?.id;

  if (userId) {
    return userId;
  }

  const runId = getRunId();
  const createdUser = await supabaseFetch({
    body: {
      email: `streamos-e2e-${runId}@example.local`,
      email_confirm: true,
      password: `StreamOS-${runId}-E2E!`,
      user_metadata: {
        source: "streamos-content-jobs-e2e",
      },
    },
    env,
    method: "POST",
    path: "/auth/v1/admin/users",
  });

  if (!createdUser?.id) {
    throw new Error("Unable to create a Supabase auth user for E2E.");
  }

  console.log(`Created Supabase E2E auth user: ${createdUser.id}`);
  return createdUser.id;
}

function getRunId() {
  return new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
}

async function insertFailedContentJob(env, userId) {
  const runId = getRunId();
  const payloadStreamId = `e2e-stream-${runId}`;
  const rows = await supabaseFetch({
    body: {
      error_message: "E2E seeded failed content job.",
      job_type: "clip_scoring",
      max_retries: 3,
      next_retry_at: null,
      payload: {
        requested_by: userId,
        source_platform: "twitch",
        source_url: `https://example.com/streamos-e2e-${runId}.mp4`,
        stream_id: payloadStreamId,
        transcript:
          "E2E transcript fixture for retrying a failed StreamOS clip scoring job.",
      },
      queue_job_id: `e2e-failed-${runId}`,
      result: {
        error: "E2E seeded failed content job.",
      },
      retry_count: 3,
      status: "failed",
      stream_id: null,
      user_id: userId,
    },
    env,
    method: "POST",
    path: "/rest/v1/content_jobs",
    query: {
      select:
        "id,user_id,status,retry_count,max_retries,queue_job_id,updated_at",
    },
  });

  return rows[0];
}

async function releaseForRetry(env, job) {
  const rows = await supabaseFetch({
    body: {
      error_message: "E2E retry requested.",
      max_retries: Number(job.retry_count) + 1,
      next_retry_at: null,
      updated_at: new Date().toISOString(),
    },
    env,
    method: "PATCH",
    path: "/rest/v1/content_jobs",
    query: {
      id: `eq.${job.id}`,
      select: "id,status,retry_count,max_retries,queue_job_id,updated_at",
    },
  });

  return rows[0];
}

async function getContentJob(env, jobId) {
  const rows = await supabaseFetch({
    env,
    path: "/rest/v1/content_jobs",
    query: {
      id: `eq.${jobId}`,
      select:
        "id,status,retry_count,max_retries,queue_job_id,error_message,updated_at",
    },
  });

  return rows[0] ?? null;
}

async function waitForWorkerClaim({ env, jobId, pollMs, waitMs }) {
  const deadline = Date.now() + waitMs;
  let lastJob = null;

  while (Date.now() < deadline) {
    lastJob = await getContentJob(env, jobId);

    if (
      lastJob?.status === "pending" &&
      Number(lastJob.retry_count) >= 4 &&
      String(lastJob.queue_job_id ?? "").includes(
        `content-job-clip_scoring-${jobId}-retry-`,
      )
    ) {
      return lastJob;
    }

    console.log(
      `Waiting for retry-worker: status=${lastJob?.status} retry=${lastJob?.retry_count}/${lastJob?.max_retries} queue=${lastJob?.queue_job_id}`,
    );
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(
    `Retry-worker did not claim the job within ${waitMs}ms. Last row: ${JSON.stringify(lastJob)}`,
  );
}

function tryRedisJobExists({ containerCli, envFile, queueJobId }) {
  if (!containerCli) {
    return null;
  }

  try {
    const output = execFileSync(
      containerCli,
      getComposeArgs(envFile, [
        "exec",
        "-T",
        "redis",
        "redis-cli",
        "EXISTS",
        `bull:streamos-clip-generation:${queueJobId}`,
      ]),
      { encoding: "utf8" },
    ).trim();

    return output === "1";
  } catch {
    return null;
  }
}

async function waitForManualRetry(job) {
  if (!process.stdin.isTTY) {
    console.log("Non-interactive shell detected. Seeded job only.");
    console.log(`Open /dashboard/jobs and retry job ${job.id}.`);
    return false;
  }

  console.log("\nManual UI step:");
  console.log(
    "1. Start the dashboard if needed: pnpm --filter @streamos/web dev",
  );
  console.log("2. Sign in as the seeded Supabase user.");
  console.log("3. Open http://localhost:3000/dashboard/jobs");
  console.log(`4. Click Retry for job id: ${job.id}`);
  console.log(
    "5. Keep the page open and watch Failed -> Pending/Processing.\n",
  );

  const rl = createInterface({ input, output });
  await rl.question("Press Enter after clicking Retry in the UI...");
  rl.close();
  return true;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const env = getEnv(options.envFile);
  const supabaseUrl = requireEnv(env, "SUPABASE_URL");
  requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");

  if (!isLocalSupabaseUrl(supabaseUrl) && !options.allowHosted) {
    throw new Error(
      `Selected SUPABASE_URL is not local (${supabaseUrl}). Use ${TEST_ENV_FILE} with Supabase CLI local stack, or pass --allow-hosted intentionally.`,
    );
  }

  if (!isLocalSupabaseUrl(supabaseUrl)) {
    console.warn(
      `Warning: using hosted Supabase from ${options.envFile}. Disposable E2E rows will be created.`,
    );
  }

  const containerCli = resolveContainerCli(options);

  if (!options.skipDocker) {
    if (!containerCli) {
      throw new Error(
        "No Docker-compatible CLI was found. Set DOCKER_BIN, pass --docker-bin, install Docker Desktop/Podman, or rerun with --skip-docker.",
      );
    }

    console.log(
      `Starting Docker Compose infrastructure with ${containerCli}...`,
    );
    run(
      containerCli,
      getComposeArgs(options.envFile, [
        "up",
        "-d",
        "redis",
        "api-gateway",
        "content-job-retry-worker",
      ]),
    );
  }

  const userId =
    options.userId || env.E2E_USER_ID || (await getFirstAuthUserId(env));
  console.log(`Using Supabase auth user: ${userId}`);

  const seededJob = await insertFailedContentJob(env, userId);
  console.log(
    `Seeded exhausted failed content_job: ${seededJob.id} retry=${seededJob.retry_count}/${seededJob.max_retries}`,
  );

  if (options.seedOnly) {
    console.log("Seed-only mode complete.");
    return;
  }

  if (options.autoRelease) {
    const released = await releaseForRetry(env, seededJob);
    console.log(
      `Released job through script: ${released.id} retry=${released.retry_count}/${released.max_retries}`,
    );
  } else {
    const didManualStep = await waitForManualRetry(seededJob);
    if (!didManualStep) {
      return;
    }
  }

  const claimedJob = await waitForWorkerClaim({
    env,
    jobId: seededJob.id,
    pollMs: options.pollMs,
    waitMs: options.waitMs,
  });

  const redisExists = tryRedisJobExists({
    containerCli,
    envFile: options.envFile,
    queueJobId: claimedJob.queue_job_id,
  });

  console.log("\nE2E verification passed:");
  console.log(`- content_jobs.status: ${claimedJob.status}`);
  console.log(`- content_jobs.retry_count: ${claimedJob.retry_count}`);
  console.log(`- content_jobs.queue_job_id: ${claimedJob.queue_job_id}`);

  if (redisExists !== null) {
    console.log(`- Redis BullMQ job key exists: ${redisExists}`);
  } else {
    console.log("- Redis BullMQ key check skipped.");
  }
}

main().catch((error) => {
  console.error(`E2E failed: ${error.message}`);
  process.exit(1);
});
