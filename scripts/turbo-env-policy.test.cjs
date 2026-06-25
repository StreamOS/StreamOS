const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");
const { resolve } = require("node:path");

const {
  FORBIDDEN_VERCEL_ENV_NAMES,
  FORBIDDEN_VERCEL_ENV_PREFIXES,
} = require("./config/vercel-env-policy.cjs");

const repoRoot = resolve(__dirname, "..");
const turboConfigPath = resolve(repoRoot, "turbo.json");

const WEB_BUILD_ENV_NAMES = new Set([
  "APP_ENV",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "STREAMOS_DEMO_MODE",
]);

const GLOBAL_DENIED_ENV_NAMES = new Set([
  ...FORBIDDEN_VERCEL_ENV_NAMES,
  "API_GATEWAY_ALLOWED_ORIGINS",
  "API_GATEWAY_SECRET",
  "AUTOMATION_SERVICE_URL",
  "CLIP_GENERATION_QUEUE_NAME",
  "CONNECT_SUCCESS_REDIRECT",
  "DISCORD_WEBHOOK_URL",
  "KICK_CLIENT_ID",
  "KICK_REDIRECT_URI",
  "KICK_SCOPES",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MAX_TRANSCRIPTION_MEDIA_BYTES",
  "OPENAI_MODEL",
  "OPENAI_TIMEOUT_SECONDS",
  "OPENAI_TITLE_MODEL",
  "OPENAI_TRANSCRIPTION_MODEL",
  "PUBLICATION_QUEUE_NAME",
  "QUEUE_DEFAULT_NAME",
  "RAILWAY_PROJECT_ID",
  "RAILWAY_SSH_PRIVATE_KEY_PRODUCTION",
  "RAILWAY_TOKEN_PRODUCTION",
  "RAILWAY_TOKEN_STAGING",
  "REPLICATE_API_TOKEN",
  "REPURPOSING_QUEUE_NAME",
  "STREAMOS_PUBLIC_URL",
  "SUPABASE_DB_URL_PRODUCTION",
  "SUPABASE_DB_URL_STAGING",
  "TIKTOK_REDIRECT_URI",
  "TIKTOK_SCOPES",
  "TRANSCRIPTION_QUEUE_NAME",
  "TWITCH_EVENTSUB_CALLBACK_URL",
  "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CONNECT_SUCCESS_REDIRECT",
  "YOUTUBE_REDIRECT_URI",
  "YOUTUBE_SCOPES",
]);

const GLOBAL_DENIED_ENV_PREFIXES = [
  ...FORBIDDEN_VERCEL_ENV_PREFIXES,
  "OPENAI_",
  "RAILWAY_",
  "REDIS_",
  "REPLICATE_",
  "SUPABASE_DB_URL_",
  "UPSTASH_REDIS_",
  "VERCEL_ORG_",
  "VERCEL_PROJECT_",
  "VERCEL_TOKEN",
];

function loadTurboConfig() {
  return JSON.parse(readFileSync(turboConfigPath, "utf8"));
}

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

function matchesDeniedPrefix(name) {
  return GLOBAL_DENIED_ENV_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function findDeniedNames(names) {
  return normalizeList(names)
    .filter(
      (name) => GLOBAL_DENIED_ENV_NAMES.has(name) || matchesDeniedPrefix(name),
    )
    .sort((left, right) => left.localeCompare(right));
}

function collectTaskEnvEntries(config) {
  return Object.entries(config.tasks ?? {}).flatMap(([taskName, task]) => [
    ...normalizeList(task.env).map((name) => ({
      name,
      taskName,
      type: "env",
    })),
    ...normalizeList(task.passThroughEnv).map((name) => ({
      name,
      taskName,
      type: "passThroughEnv",
    })),
  ]);
}

test("turbo config keeps envMode strict", () => {
  const config = loadTurboConfig();

  assert.notEqual(config.envMode, "loose");
});

test("turbo global env does not include server-only, provider, AI, Redis, or deploy secrets", () => {
  const config = loadTurboConfig();
  const globalEnv = normalizeList(config.globalEnv);
  const globalPassThroughEnv = normalizeList(config.globalPassThroughEnv);

  assert.deepEqual(findDeniedNames(globalEnv), []);
  assert.deepEqual(findDeniedNames(globalPassThroughEnv), []);
});

test("generic turbo task env does not accept runtime or deploy secrets", () => {
  const config = loadTurboConfig();
  const genericTaskEntries = collectTaskEnvEntries(config)
    .filter(({ taskName }) => !taskName.includes("#"))
    .map(({ name }) => name);

  assert.deepEqual(findDeniedNames(genericTaskEntries), []);
});

test("web build env stays web-owned and does not include gateway or worker secrets", () => {
  const config = loadTurboConfig();
  const webBuildEnv = normalizeList(config.tasks?.["@streamos/web#build"]?.env);

  assert.deepEqual(
    webBuildEnv.filter((name) => !WEB_BUILD_ENV_NAMES.has(name)),
    [],
  );
  assert.deepEqual(findDeniedNames(webBuildEnv), []);
  assert.ok(webBuildEnv.includes("NEXT_PUBLIC_SUPABASE_URL"));
  assert.ok(webBuildEnv.includes("STREAMOS_DEMO_MODE"));
});

test("package-specific turbo build env does not include AI or deploy secrets", () => {
  const config = loadTurboConfig();
  const buildEnvEntries = collectTaskEnvEntries(config)
    .filter(
      ({ taskName }) => taskName === "build" || taskName.endsWith("#build"),
    )
    .map(({ name }) => name);

  assert.deepEqual(findDeniedNames(buildEnvEntries), []);
});
