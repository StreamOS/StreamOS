#!/usr/bin/env node

const { execFileSync, spawnSync } = require("node:child_process");
const { createHmac, randomUUID } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { isIP } = require("node:net");

const { consumeValueFlag } = require("./lib/cli-args.cjs");

const DEFAULT_API_GATEWAY_URL = "http://localhost:4000";
const DEFAULT_ENV_FILE = ".env.test";
const LOCAL_DIAGNOSTIC_MODE = "local-diagnostic";
const PRODUCTION_GATE_MODE = "production-gate";
const DEFAULT_POLL_MS = 2_000;
const DEFAULT_WAIT_MS = 120_000;
const DEFAULT_STREAM_EVENT_WEBHOOK_SECRET = "local-streamos-webhook-secret";
const TRANSCRIPTION_E2E_FIXTURE_ENV_NAME =
  "TRANSCRIPTION_E2E_FIXTURE_ASSET_URL";
const LOCAL_FIXTURE_PLACEHOLDER_HOST = "cdn.example.com";
const ALLOWED_FIXTURE_EXTENSIONS = new Set([
  ".aac",
  ".flac",
  ".m4a",
  ".mp3",
  ".mp4",
  ".mpeg",
  ".mpga",
  ".oga",
  ".ogg",
  ".wav",
  ".webm",
]);

function getExpectedTranscriptionQueueJobId(streamId) {
  return `transcription-trigger-${streamId}`;
}

function parseArgs(argv) {
  const options = {
    allowHosted: false,
    envFile: DEFAULT_ENV_FILE,
    expect: "done",
    help: false,
    mode: LOCAL_DIAGNOSTIC_MODE,
    pollMs: DEFAULT_POLL_MS,
    skipDocker: false,
    waitMs: DEFAULT_WAIT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--allow-hosted") {
      options.allowHosted = true;
      continue;
    }

    const apiGatewayUrlMatch = consumeValueFlag(argv, index, "api-gateway-url");

    if (apiGatewayUrlMatch.matched) {
      options.apiGatewayUrl = apiGatewayUrlMatch.value.trim();
      index = apiGatewayUrlMatch.nextIndex;
      continue;
    }

    const dockerBinMatch = consumeValueFlag(argv, index, "docker-bin");

    if (dockerBinMatch.matched) {
      options.dockerBin = dockerBinMatch.value.trim();
      index = dockerBinMatch.nextIndex;
      continue;
    }

    const fixtureAssetUrlMatch = consumeValueFlag(
      argv,
      index,
      "fixture-asset-url",
    );

    if (fixtureAssetUrlMatch.matched) {
      options.fixtureAssetUrl = fixtureAssetUrlMatch.value.trim();
      index = fixtureAssetUrlMatch.nextIndex;
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
      options.expect = expectMatch.value.trim();
      index = expectMatch.nextIndex;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    const modeMatch = consumeValueFlag(argv, index, "mode");

    if (modeMatch.matched) {
      options.mode = modeMatch.value.trim();
      index = modeMatch.nextIndex;
      continue;
    }

    const pollMsMatch = consumeValueFlag(argv, index, "poll-ms");

    if (pollMsMatch.matched) {
      options.pollMs = Number(pollMsMatch.value.trim());
      index = pollMsMatch.nextIndex;
      continue;
    }

    if (arg === "--skip-docker") {
      options.skipDocker = true;
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
      options.waitMs = Number(waitMsMatch.value.trim());
      index = waitMsMatch.nextIndex;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
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

  if (![LOCAL_DIAGNOSTIC_MODE, PRODUCTION_GATE_MODE].includes(options.mode)) {
    throw new Error(
      `--mode must be either ${LOCAL_DIAGNOSTIC_MODE} or ${PRODUCTION_GATE_MODE}.`,
    );
  }

  return options;
}

function printHelp() {
  console.log(`StreamOS transcription job E2E

Usage:
  pnpm e2e:transcription
  pnpm e2e:transcription:local
  pnpm e2e:transcription -- --expect failed
  pnpm e2e:transcription -- --skip-docker --user-id <auth-user-uuid>

Options:
  --allow-hosted             Allow writes to a non-local Supabase URL. Requires intent.
  --api-gateway-url URL      API Gateway base URL. Default: ${DEFAULT_API_GATEWAY_URL}.
  --docker-bin BIN           Use a specific Docker-compatible CLI binary.
  --env-file PATH            Load E2E env from a file. Default: ${DEFAULT_ENV_FILE}.
  --expect done|failed       Expected final content_jobs.status. Default: done.
  --fixture-asset-url URL    Public HTTPS media fixture for hosted / production-gate runs.
  --mode MODE                local-diagnostic or production-gate. Default: ${LOCAL_DIAGNOSTIC_MODE}.
  --skip-docker              Do not run docker compose up before testing.
  --user-id UUID             Use a specific Supabase auth user.
  --wait-ms N                How long to wait for terminal status. Default: ${DEFAULT_WAIT_MS}.
  --poll-ms N                Poll interval while waiting. Default: ${DEFAULT_POLL_MS}.
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

function redactFixtureAssetUrl(value) {
  try {
    const parsedUrl = value instanceof URL ? value : new URL(String(value));
    const extension = getFixtureAssetExtension(parsedUrl.pathname);

    return `${parsedUrl.protocol}//${parsedUrl.host}/redacted${extension}`;
  } catch {
    return "invalid-fixture-url";
  }
}

function getFixtureAssetExtension(pathname) {
  const match = String(pathname || "")
    .toLowerCase()
    .match(/\.[a-z0-9]{2,5}$/);

  return match?.[0] ?? "";
}

function isPlaceholderFixtureHostname(hostname) {
  return ["example.com", "example.org", "example.net", "example.invalid"].some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}

function isPrivateOrLocalFixtureHostname(hostname) {
  if (!hostname) {
    return true;
  }

  const normalizedHostname = hostname.trim().toLowerCase().replace(/\.$/, "");

  if (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".internal") ||
    normalizedHostname.endsWith(".local") ||
    normalizedHostname.endsWith(".localhost")
  ) {
    return true;
  }

  const ipVersion = isIP(normalizedHostname);

  if (ipVersion === 4) {
    const octets = normalizedHostname.split(".").map(Number);

    return (
      octets.length !== 4 ||
      octets.some((octet) => Number.isNaN(octet)) ||
      octets[0] === 0 ||
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 198 && (octets[1] === 18 || octets[1] === 19))
    );
  }

  if (ipVersion === 6) {
    return (
      normalizedHostname === "::" ||
      normalizedHostname === "::1" ||
      normalizedHostname.startsWith("fe80:") ||
      normalizedHostname.startsWith("fc") ||
      normalizedHostname.startsWith("fd")
    );
  }

  return false;
}

function validateFixtureAssetUrl(value, { mode }) {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    throw new Error(
      `fixture_asset_invalid: ${TRANSCRIPTION_E2E_FIXTURE_ENV_NAME} or --fixture-asset-url is required for ${mode}.`,
    );
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(trimmedValue);
  } catch (error) {
    throw new Error(
      `fixture_asset_invalid: transcription fixture asset must be an absolute URL.`,
      { cause: error },
    );
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error(
      "fixture_asset_invalid: transcription fixture asset must use https.",
    );
  }

  if (parsedUrl.port && parsedUrl.port !== "443") {
    throw new Error(
      "fixture_asset_invalid: transcription fixture asset must use the default https port.",
    );
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error(
      "fixture_asset_invalid: transcription fixture asset must not include credentials.",
    );
  }

  if (parsedUrl.search || parsedUrl.hash) {
    throw new Error(
      "fixture_asset_invalid: transcription fixture asset must not include query strings or fragments.",
    );
  }

  const normalizedHostname = parsedUrl.hostname
    .toLowerCase()
    .replace(/\.$/, "");

  if (isPlaceholderFixtureHostname(normalizedHostname)) {
    throw new Error(
      "fixture_asset_invalid: example.* placeholder hosts are not valid transcription fixture assets.",
    );
  }

  if (isPrivateOrLocalFixtureHostname(normalizedHostname)) {
    throw new Error(
      "fixture_asset_invalid: transcription fixture asset must not use localhost, private IPs, link-local IPs, or internal hostnames.",
    );
  }

  const extension = getFixtureAssetExtension(parsedUrl.pathname);

  if (!ALLOWED_FIXTURE_EXTENSIONS.has(extension)) {
    throw new Error(
      `fixture_asset_invalid: transcription fixture asset must use a known audio/video file extension (${Array.from(
        ALLOWED_FIXTURE_EXTENSIONS,
      )
        .sort()
        .join(", ")}).`,
    );
  }

  return {
    extension,
    hostname: normalizedHostname,
    raw: parsedUrl.toString(),
    redacted: redactFixtureAssetUrl(parsedUrl),
  };
}

function resolveFixtureAssetConfig({ env, options }) {
  const configuredValue =
    options.fixtureAssetUrl || env[TRANSCRIPTION_E2E_FIXTURE_ENV_NAME];

  if (configuredValue) {
    return validateFixtureAssetUrl(configuredValue, { mode: options.mode });
  }

  if (options.mode === PRODUCTION_GATE_MODE) {
    throw new Error(
      `fixture_asset_invalid: production-gate requires ${TRANSCRIPTION_E2E_FIXTURE_ENV_NAME} or --fixture-asset-url.`,
    );
  }

  return null;
}

function classifyContentJobFailure(job) {
  const errorMessage = String(job?.error_message || "").trim();

  if (!errorMessage) {
    return null;
  }

  if (errorMessage.includes("Transcription asset URL is not allowed.")) {
    return {
      code: "asset_not_allowed",
      message:
        "automation-service rejected the configured transcription fixture asset URL.",
    };
  }

  if (errorMessage.includes("fixture_asset_invalid:")) {
    return {
      code: "fixture_asset_invalid",
      message: errorMessage,
    };
  }

  return null;
}

async function waitForHttpHealth(
  url,
  serviceName,
  waitMs,
  { skipDocker = false } = {},
) {
  const deadline = Date.now() + waitMs;
  let lastConnectionError = null;
  let lastStatus = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL("/health", url));
      if (response.ok) {
        return;
      }

      lastStatus = `${response.status} ${response.statusText}`.trim();
    } catch (error) {
      lastConnectionError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  const details =
    lastStatus !== null
      ? ` Last health response: ${lastStatus}.`
      : lastConnectionError instanceof Error
        ? ` Last connection error: ${lastConnectionError.message}.`
        : "";
  const guidance = skipDocker
    ? ` Start ${serviceName} manually or rerun without --skip-docker so Compose can bootstrap the local stack.`
    : " Check Docker Desktop, `docker compose ps`, and the service logs before retrying.";

  throw new Error(
    `${serviceName} did not become healthy within ${waitMs}ms.${details}${guidance}`,
  );
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
      provider: "twitch",
      platform_stream_id: `e2e-transcription-${runId}`,
      started_at: new Date(Date.now() - 15 * 60_000).toISOString(),
      status: "live",
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
    vodAssetUrl: `https://${LOCAL_FIXTURE_PLACEHOLDER_HOST}/streamos-transcription-e2e-${runId}.mp4`,
  };
}

async function getStreamState(env, streamId) {
  const rows = await supabaseFetch({
    env,
    path: "/rest/v1/streams",
    query: {
      id: `eq.${streamId}`,
      select: "id,status,started_at,ended_at,updated_at",
    },
  });

  return rows[0] ?? null;
}

async function triggerTranscription({ apiGatewayUrl, env, graph, userId }) {
  const expectedQueueJobId = getExpectedTranscriptionQueueJobId(graph.streamId);
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

  if (
    data.queue_job_id !== expectedQueueJobId ||
    data.job_id !== expectedQueueJobId
  ) {
    throw new Error(
      `API Gateway returned a non-canonical queue job id. Expected ${expectedQueueJobId}, got ${JSON.stringify(
        {
          job_id: data.job_id,
          queue_job_id: data.queue_job_id,
        },
      )}`,
    );
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
  streamId,
  waitMs,
}) {
  const deadline = Date.now() + waitMs;
  let lastJob = null;

  while (Date.now() < deadline) {
    lastJob = await getContentJobByQueueId(env, queueJobId);

    const classifiedFailure =
      expectedStatus === "done" ? classifyContentJobFailure(lastJob) : null;

    if (classifiedFailure) {
      throw new Error(
        `${classifiedFailure.code}: ${classifiedFailure.message} Last row: ${JSON.stringify(lastJob)}`,
      );
    }

    if (lastJob?.status === "done" || lastJob?.status === "failed") {
      if (lastJob.status !== expectedStatus) {
        const terminalFailure = classifyContentJobFailure(lastJob);

        if (terminalFailure) {
          throw new Error(
            `${terminalFailure.code}: ${terminalFailure.message} Last row: ${JSON.stringify(lastJob)}`,
          );
        }

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

  const streamState = streamId ? await getStreamState(env, streamId) : null;

  throw new Error(
    `Transcription job did not reach ${expectedStatus} within ${waitMs}ms. Last row: ${JSON.stringify(lastJob)} Stream state: ${JSON.stringify(streamState)}`,
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
  const fixtureAsset = resolveFixtureAssetConfig({ env, options });

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

  if (fixtureAsset) {
    console.log(`Using transcription fixture asset: ${fixtureAsset.redacted}`);
  } else {
    console.log(
      "Using local diagnostic placeholder transcription fixture asset (not production-proof).",
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
    try {
      run(
        containerCli,
        getComposeArgs(options.envFile, [
          "up",
          "-d",
          "redis",
          "api-gateway",
          "automation-service",
          "stream-job-worker",
          "transcription-worker",
        ]),
        { env: processEnv },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (
        message.includes("failed to connect to the docker API") ||
        message.includes("dockerDesktopLinuxEngine")
      ) {
        throw new Error(
          "Docker daemon is not reachable. Start Docker Desktop or rerun with --skip-docker against an already running local stack.",
        );
      }

      throw error;
    }
  }

  const apiGatewayUrl = options.apiGatewayUrl ?? DEFAULT_API_GATEWAY_URL;
  await waitForHttpHealth(apiGatewayUrl, "api-gateway", 60_000, {
    skipDocker: options.skipDocker,
  });

  const userId =
    options.userId || env.E2E_USER_ID || (await getFirstAuthUserId(env));
  console.log(`Using Supabase auth user: ${userId}`);

  const graph = await seedStreamGraph(env, userId);
  if (fixtureAsset) {
    graph.vodAssetUrl = fixtureAsset.raw;
  }
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
    streamId: graph.streamId,
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

if (require.main === module) {
  main().catch((error) => {
    console.error(`E2E failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_API_GATEWAY_URL,
  DEFAULT_ENV_FILE,
  DEFAULT_POLL_MS,
  DEFAULT_WAIT_MS,
  LOCAL_DIAGNOSTIC_MODE,
  PRODUCTION_GATE_MODE,
  TRANSCRIPTION_E2E_FIXTURE_ENV_NAME,
  classifyContentJobFailure,
  getFixtureAssetExtension,
  isPlaceholderFixtureHostname,
  isPrivateOrLocalFixtureHostname,
  parseArgs,
  printHelp,
  redactFixtureAssetUrl,
  resolveFixtureAssetConfig,
  validateFixtureAssetUrl,
};
