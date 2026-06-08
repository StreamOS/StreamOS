#!/usr/bin/env node

const { execFileSync, spawnSync } = require("node:child_process");
const { createHmac, randomUUID } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");

const DEFAULT_API_GATEWAY_URL = "http://localhost:4000";
const DEFAULT_ENV_FILE = ".env.test";
const DEFAULT_POLL_MS = 2_000;
const DEFAULT_WAIT_MS = 120_000;
const DEFAULT_STREAM_EVENT_WEBHOOK_SECRET = "local-streamos-webhook-secret";

function parseArgs(argv) {
  const options = {
    allowHosted: false,
    envFile: DEFAULT_ENV_FILE,
    expect: "done",
    help: false,
    pollMs: DEFAULT_POLL_MS,
    skipDocker: false,
    waitMs: DEFAULT_WAIT_MS,
  };

  for (const arg of argv) {
    if (arg === "--allow-hosted") {
      options.allowHosted = true;
    } else if (arg.startsWith("--api-gateway-url=")) {
      options.apiGatewayUrl = arg.slice("--api-gateway-url=".length).trim();
    } else if (arg.startsWith("--docker-bin=")) {
      options.dockerBin = arg.slice("--docker-bin=".length).trim();
    } else if (arg.startsWith("--env-file=")) {
      options.envFile = arg.slice("--env-file=".length).trim();
    } else if (arg.startsWith("--expect=")) {
      options.expect = arg.slice("--expect=".length).trim();
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--poll-ms=")) {
      options.pollMs = Number(arg.slice("--poll-ms=".length));
    } else if (arg === "--skip-docker") {
      options.skipDocker = true;
    } else if (arg.startsWith("--user-id=")) {
      options.userId = arg.slice("--user-id=".length).trim();
    } else if (arg.startsWith("--wait-ms=")) {
      options.waitMs = Number(arg.slice("--wait-ms=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!["done", "failed"].includes(options.expect)) {
    throw new Error("--expect must be either done or failed.");
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
  console.log(`StreamOS transcription job E2E

Usage:
  pnpm e2e:transcription
  pnpm e2e:transcription:local
  pnpm e2e:transcription -- --expect=failed
  pnpm e2e:transcription -- --skip-docker --user-id=<auth-user-uuid>

Options:
  --allow-hosted             Allow writes to a non-local Supabase URL. Requires intent.
  --api-gateway-url=URL      API Gateway base URL. Default: ${DEFAULT_API_GATEWAY_URL}.
  --docker-bin=BIN           Use a specific Docker-compatible CLI binary.
  --env-file=PATH            Load E2E env from a file. Default: ${DEFAULT_ENV_FILE}.
  --expect=done|failed       Expected final content_jobs.status. Default: done.
  --skip-docker              Do not run docker compose up before testing.
  --user-id=UUID             Use a specific Supabase auth user.
  --wait-ms=N                How long to wait for terminal status. Default: ${DEFAULT_WAIT_MS}.
  --poll-ms=N                Poll interval while waiting. Default: ${DEFAULT_POLL_MS}.
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

function getEnv(envFile, expectedStatus) {
  const selectedEnv = loadEnvFile(envFile);
  const processorMode = expectedStatus === "failed" ? "fail" : "stub";

  return {
    ...selectedEnv,
    ...process.env,
    STREAMOS_E2E_MODE: "true",
    TRANSCRIPTION_PROCESSOR_MODE: processorMode,
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

async function waitForHttpHealth(url, serviceName, waitMs) {
  const deadline = Date.now() + waitMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL("/health", url));
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the container healthcheck and host port are both ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`${serviceName} did not become healthy within ${waitMs}ms.`);
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
      email: `streamos-transcription-e2e-${runId}@example.local`,
      email_confirm: true,
      password: `StreamOS-${runId}-E2E!`,
      user_metadata: {
        source: "streamos-transcription-e2e",
      },
    },
    env,
    method: "POST",
    path: "/auth/v1/admin/users",
  });

  if (!createdUser?.id) {
    throw new Error(
      "Unable to create a Supabase auth user for transcription E2E.",
    );
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

async function seedStreamGraph(env, userId) {
  const runId = getRunId();
  const existingCreatorRows = await supabaseFetch({
    env,
    path: "/rest/v1/creators",
    query: {
      select: "id",
      user_id: `eq.${userId}`,
    },
  });
  let creatorId = existingCreatorRows[0]?.id;

  if (!creatorId) {
    const creatorRows = await supabaseFetch({
      body: {
        display_name: `StreamOS E2E Creator ${runId}`,
        handle: `e2e-${runId}`,
        niche: "Local E2E",
        owner_id: userId,
        user_id: userId,
      },
      env,
      method: "POST",
      path: "/rest/v1/creators",
      query: {
        select: "id",
      },
    });
    creatorId = creatorRows[0]?.id;
  }

  if (!creatorId) {
    throw new Error("Unable to seed creator for transcription E2E.");
  }

  const channelRows = await supabaseFetch({
    body: {
      connected_at: new Date().toISOString(),
      creator_id: creatorId,
      display_name: "StreamOS E2E Twitch",
      external_channel_id: `e2e-channel-${runId}`,
      follower_count: 0,
      platform: "twitch",
      user_id: userId,
    },
    env,
    method: "POST",
    path: "/rest/v1/channels",
    query: {
      select: "id",
    },
  });
  const channelId = channelRows[0]?.id;

  if (!channelId) {
    throw new Error("Unable to seed channel for transcription E2E.");
  }

  const streamRows = await supabaseFetch({
    body: {
      channel_id: channelId,
      ended_at: new Date().toISOString(),
      provider: "twitch",
      platform_stream_id: `e2e-transcription-${runId}`,
      started_at: new Date(Date.now() - 15 * 60_000).toISOString(),
      title: "StreamOS Transcription E2E",
      user_id: userId,
    },
    env,
    method: "POST",
    path: "/rest/v1/streams",
    query: {
      select: "id",
    },
  });
  const streamId = streamRows[0]?.id;

  if (!streamId) {
    throw new Error("Unable to seed stream for transcription E2E.");
  }

  return {
    channelId,
    creatorId,
    streamId,
    vodAssetUrl: `https://cdn.example.com/streamos-transcription-e2e-${runId}.mp4`,
  };
}

async function triggerTranscription({ apiGatewayUrl, env, graph, userId }) {
  const body = JSON.stringify({
    channel_id: graph.channelId,
    creator_id: graph.creatorId,
    ended_at: new Date().toISOString(),
    language: "en",
    platform: "twitch",
    stream_id: graph.streamId,
    user_id: userId,
    vod_asset_url: graph.vodAssetUrl,
  });
  const webhookSecret =
    env.STREAM_EVENT_WEBHOOK_SECRET ?? DEFAULT_STREAM_EVENT_WEBHOOK_SECRET;
  const eventId = randomUUID();
  const timestamp = new Date().toISOString();
  const signature = `sha256=${createHmac("sha256", webhookSecret)
    .update(eventId)
    .update(timestamp)
    .update(body)
    .digest("hex")}`;

  const response = await fetch(
    new URL("/api/webhooks/streams/ended", apiGatewayUrl),
    {
      body,
      headers: {
        "Content-Type": "application/json",
        "x-streamos-event-id": eventId,
        "x-streamos-signature": signature,
        "x-streamos-timestamp": timestamp,
      },
      method: "POST",
    },
  );

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (response.status !== 202) {
    throw new Error(
      `API Gateway transcription trigger failed with ${response.status}: ${text}`,
    );
  }

  if (data?.status !== "queued" || !data.queue_job_id) {
    throw new Error(`API Gateway did not return a queued job: ${text}`);
  }

  return data;
}

async function getContentJobByQueueId(env, queueJobId) {
  const rows = await supabaseFetch({
    env,
    path: "/rest/v1/content_jobs",
    query: {
      queue_job_id: `eq.${queueJobId}`,
      select: "id,status,queue_job_id,error_message,result,updated_at",
    },
  });

  return rows[0] ?? null;
}

async function waitForTerminalContentJob({
  env,
  expectedStatus,
  pollMs,
  queueJobId,
  waitMs,
}) {
  const deadline = Date.now() + waitMs;
  let lastJob = null;

  while (Date.now() < deadline) {
    lastJob = await getContentJobByQueueId(env, queueJobId);

    if (lastJob?.status === "done" || lastJob?.status === "failed") {
      if (lastJob.status !== expectedStatus) {
        throw new Error(
          `Expected content_jobs.status=${expectedStatus}, got ${lastJob.status}: ${JSON.stringify(lastJob)}`,
        );
      }

      return lastJob;
    }

    console.log(
      `Waiting for transcription worker: status=${lastJob?.status ?? "missing"} queue=${queueJobId}`,
    );
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(
    `Transcription job did not reach ${expectedStatus} within ${waitMs}ms. Last row: ${JSON.stringify(lastJob)}`,
  );
}

function tryRedisJobExists({ containerCli, envFile, queueJobId, processEnv }) {
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
        `bull:streamos-transcription:${queueJobId}`,
      ]),
      { encoding: "utf8", env: processEnv },
    ).trim();

    return output === "1";
  } catch {
    return null;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const env = getEnv(options.envFile, options.expect);
  const supabaseUrl = requireEnv(env, "SUPABASE_URL");
  requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");

  if (!isLocalSupabaseUrl(supabaseUrl) && !options.allowHosted) {
    throw new Error(
      `Selected SUPABASE_URL is not local (${supabaseUrl}). Use ${DEFAULT_ENV_FILE} with Supabase CLI local stack, or pass --allow-hosted intentionally.`,
    );
  }

  if (!isLocalSupabaseUrl(supabaseUrl)) {
    console.warn(
      `Warning: using hosted Supabase from ${options.envFile}. Disposable E2E rows will be created.`,
    );
  }

  const containerCli = resolveContainerCli(options);
  const processEnv = {
    ...process.env,
    ...env,
  };

  if (!options.skipDocker) {
    if (!containerCli) {
      throw new Error(
        "No Docker-compatible CLI was found. Set DOCKER_BIN, pass --docker-bin, install Docker Desktop/Podman, or rerun with --skip-docker.",
      );
    }

    console.log(
      `Starting Docker Compose transcription stack with ${containerCli}...`,
    );
    run(
      containerCli,
      getComposeArgs(options.envFile, [
        "up",
        "-d",
        "redis",
        "api-gateway",
        "automation-service",
        "transcription-worker",
      ]),
      { env: processEnv },
    );
  }

  const apiGatewayUrl = options.apiGatewayUrl ?? DEFAULT_API_GATEWAY_URL;
  await waitForHttpHealth(apiGatewayUrl, "api-gateway", 60_000);

  const userId =
    options.userId || env.E2E_USER_ID || (await getFirstAuthUserId(env));
  console.log(`Using Supabase auth user: ${userId}`);

  const graph = await seedStreamGraph(env, userId);
  console.log(`Seeded stream graph: stream=${graph.streamId}`);

  const queuedJob = await triggerTranscription({
    apiGatewayUrl,
    env,
    graph,
    userId,
  });
  console.log(
    `Queued transcription job: stream=${queuedJob.stream_id} queue=${queuedJob.queue_job_id}`,
  );

  const finalJob = await waitForTerminalContentJob({
    env,
    expectedStatus: options.expect,
    pollMs: options.pollMs,
    queueJobId: queuedJob.queue_job_id,
    waitMs: options.waitMs,
  });

  const redisExists = tryRedisJobExists({
    containerCli,
    envFile: options.envFile,
    processEnv,
    queueJobId: queuedJob.queue_job_id,
  });

  console.log("\nE2E verification passed:");
  console.log("- API Gateway response status: queued");
  console.log(`- content_jobs.status: ${finalJob.status}`);
  console.log(`- content_jobs.queue_job_id: ${finalJob.queue_job_id}`);

  if (finalJob.status === "done") {
    console.log(`- transcript: ${finalJob.result?.transcript ?? "<missing>"}`);
  } else {
    console.log(`- error_message: ${finalJob.error_message ?? "<missing>"}`);
  }

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
