const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const {
  assertVercelEnvironment,
  collectVercelEnvironmentIssues,
  findForbiddenOpenAIEnvNames,
  formatForbiddenOpenAIEnvError,
} = require("./config/vercel-env-policy.cjs");

function buildValidVercelEnv(overrides = {}) {
  return {
    APP_ENCRYPTION_KEY: `base64:${Buffer.alloc(32, 7).toString("base64")}`,
    APP_ENV: "production",
    API_GATEWAY_SECRET: "test-api-gateway-secret-123",
    API_GATEWAY_URL: "https://gateway.streamos.test",
    NEXT_PUBLIC_APP_URL: "https://app.streamos.test",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    STREAMOS_DEMO_MODE: "false",
    STREAM_EVENT_WEBHOOK_SECRET: "test-stream-event-secret-123",
    TWITCH_CLIENT_ID: "twitch-client-id",
    TWITCH_CLIENT_SECRET: "twitch-client-secret",
    TWITCH_REDIRECT_URI:
      "https://gateway.streamos.test/api/auth/twitch/callback",
    TWITCH_SCOPES: "user:read:email",
    ...overrides,
  };
}

function runNextConfigImport(env = {}) {
  const nextConfigPath = resolve(process.cwd(), "apps/web/next.config.ts");
  const policyPath = pathToFileURL(
    resolve(process.cwd(), "scripts/config/vercel-env-policy.cjs"),
  ).href;

  return spawnSync(
    process.execPath,
    [
      "--eval",
      `
        const fs = require('node:fs');
        const ts = require('typescript');

        const source = fs.readFileSync(${JSON.stringify(nextConfigPath)}, 'utf8');
        const transpiled = ts
          .transpileModule(source, {
            compilerOptions: {
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ES2022,
            },
            fileName: ${JSON.stringify(nextConfigPath)},
          })
          .outputText.replace(
            "../../scripts/config/vercel-env-policy.cjs",
            ${JSON.stringify(policyPath)},
          );

        import('data:text/javascript;base64,' + Buffer.from(transpiled).toString('base64'))
          .then(() => {
            console.log('next-config-import-ok');
          })
          .catch((error) => {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
          });
      `,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "development",
        VERCEL: "",
        VERCEL_ENV: "",
        ...env,
      },
    },
  );
}

test("findForbiddenOpenAIEnvNames catches every NEXT_PUBLIC_OPENAI* variant", () => {
  const names = findForbiddenOpenAIEnvNames({
    NEXT_PUBLIC_OPENAI: "1",
    NEXT_PUBLIC_OPENAI_API_KEY: "2",
    NEXT_PUBLIC_OPENAI_SECRET: "3",
    NEXT_PUBLIC_SUPABASE_URL: "https://supabase.co",
  });

  assert.deepEqual(names, [
    "NEXT_PUBLIC_OPENAI",
    "NEXT_PUBLIC_OPENAI_API_KEY",
    "NEXT_PUBLIC_OPENAI_SECRET",
  ]);
  assert.match(
    formatForbiddenOpenAIEnvError(names, "web app"),
    /NEXT_PUBLIC_OPENAI, NEXT_PUBLIC_OPENAI_API_KEY, NEXT_PUBLIC_OPENAI_SECRET/,
  );
});

test("collectVercelEnvironmentIssues skips local-only URLs outside Vercel mode", () => {
  const issues = collectVercelEnvironmentIssues(
    {
      API_GATEWAY_URL: "http://localhost:4000",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    },
    {
      requireRequired: false,
      validatePublicUrls: false,
    },
  );

  assert.deepEqual(issues, []);
});

test("collectVercelEnvironmentIssues accepts required keys confirmed by Vercel inventory", () => {
  const maskedEnv = {
    APP_ENV: "production",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    STREAMOS_DEMO_MODE: "false",
    STREAM_EVENT_WEBHOOK_SECRET: "test-stream-event-secret-123",
    TWITCH_REDIRECT_URI:
      "https://gateway.streamos.test/api/auth/twitch/callback",
    TWITCH_SCOPES: "user:read:email",
  };

  const issues = collectVercelEnvironmentIssues(maskedEnv, {
    knownPresentNames: new Set([
      "APP_ENCRYPTION_KEY",
      "API_GATEWAY_SECRET",
      "API_GATEWAY_URL",
      "NEXT_PUBLIC_APP_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "TWITCH_CLIENT_ID",
      "TWITCH_CLIENT_SECRET",
    ]),
    requireRequired: true,
    validatePublicUrls: true,
  });

  assert.deepEqual(issues, []);
});

test("collectVercelEnvironmentIssues still blocks forbidden keys from Vercel inventory", () => {
  const issues = collectVercelEnvironmentIssues(
    {},
    {
      knownPresentNames: new Set(["OPENAI_API_KEY", "REDIS_URL"]),
      requireRequired: false,
      validatePublicUrls: false,
    },
  );

  assert.match(
    issues.map((issue) => issue.name).join(","),
    /OPENAI_API_KEY|REDIS_URL/,
  );
});

test("assertVercelEnvironment blocks Railway-only secrets and provider prefixes", () => {
  assert.throws(
    () =>
      assertVercelEnvironment(
        {
          OPENAI_API_KEY: "sk-test",
          REDIS_URL: "redis://localhost:6379/0",
          SUPABASE_DB_URL: "postgres://localhost:5432/postgres",
          SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
          TIKTOK_CLIENT_SECRET: "tiktok-secret",
          YOUTUBE_CLIENT_ID: "youtube-client-id",
          KICK_WEBHOOK_SECRET: "kick-secret",
        },
        { requireRequired: false, validatePublicUrls: false },
      ),
    /OPENAI_API_KEY|REDIS_URL|SUPABASE_DB_URL|SUPABASE_SERVICE_ROLE_KEY|TIKTOK_CLIENT_SECRET|YOUTUBE_CLIENT_ID|KICK_WEBHOOK_SECRET/,
  );
});

test("assertVercelEnvironment rejects private Railway URLs in Vercel mode", () => {
  assert.throws(
    () =>
      assertVercelEnvironment(
        buildValidVercelEnv({
          API_GATEWAY_URL: "http://automation-service.railway.internal:8000",
        }),
        { requireRequired: true, validatePublicUrls: true },
      ),
    /API_GATEWAY_URL/,
  );
});

test("assertVercelEnvironment allows localhost values during local development", () => {
  assert.doesNotThrow(() =>
    assertVercelEnvironment(
      {
        API_GATEWAY_URL: "http://localhost:4000",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      },
      { requireRequired: false, validatePublicUrls: false },
    ),
  );
});

test("Vercel env runner accepts a valid pulled env file", () => {
  const tempDirectory = mkdtempSync(join(os.tmpdir(), "streamos-vercel-env-"));
  const vercelDirectory = join(tempDirectory, ".vercel");
  const envFile = join(vercelDirectory, ".env.preview.local");
  mkdirSync(vercelDirectory, { recursive: true });
  writeFileSync(
    envFile,
    Object.entries(buildValidVercelEnv())
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  );

  const result = spawnSync(
    process.execPath,
    [
      join(__dirname, "validate-vercel-env.cjs"),
      "--vercel-dir",
      vercelDirectory,
      "--environment",
      "preview",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Vercel preview environment audit passed/);
});

test("Vercel env runner fails fast on forbidden NEXT_PUBLIC_OPENAI vars", () => {
  const tempDirectory = mkdtempSync(join(os.tmpdir(), "streamos-vercel-env-"));
  const vercelDirectory = join(tempDirectory, ".vercel");
  const envFile = join(vercelDirectory, ".env.production.local");
  mkdirSync(vercelDirectory, { recursive: true });
  writeFileSync(
    envFile,
    Object.entries(
      buildValidVercelEnv({
        NEXT_PUBLIC_OPENAI_SECRET: "sk-client-leak",
      }),
    )
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  );

  const result = spawnSync(
    process.execPath,
    [
      join(__dirname, "validate-vercel-env.cjs"),
      "--vercel-dir",
      vercelDirectory,
      "--environment",
      "production",
    ],
    { encoding: "utf8" },
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /NEXT_PUBLIC_OPENAI_SECRET/);
});

test("next.config.ts still allows local development-only Vercel-style values", () => {
  const result = runNextConfigImport({
    API_GATEWAY_URL: "http://localhost:4000",
    APP_ENV: "development",
    OPENAI_API_KEY: "sk-server-only",
    REDIS_URL: "redis://localhost:6379/0",
    STREAMOS_DEMO_MODE: "false",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    TWITCH_CLIENT_ID: "local-twitch-client-id",
    TWITCH_CLIENT_SECRET: "local-twitch-client-secret",
    TWITCH_REDIRECT_URI: "http://localhost:4000/api/auth/twitch/callback",
    TWITCH_SCOPES: "user:read:email",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /next-config-import-ok/);
});

test("next.config.ts fails fast on NEXT_PUBLIC_OPENAI prefixes", () => {
  const result = runNextConfigImport({
    NEXT_PUBLIC_OPENAI_SECRET: "sk-client-leak",
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /NEXT_PUBLIC_OPENAI_SECRET/);
});

test("next.config.ts enforces the Vercel policy when VERCEL is set", () => {
  const result = runNextConfigImport({
    ...buildValidVercelEnv({
      REDIS_URL: "redis://localhost:6379/0",
    }),
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "production",
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /REDIS_URL/);
});
