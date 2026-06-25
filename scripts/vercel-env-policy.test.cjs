const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const {
  assertNoForbiddenVercelEnv,
  assertVercelEnvironment,
  collectUnexpectedVercelEnvNames,
  collectVercelEnvironmentIssues,
  findForbiddenVercelEnvNames,
  formatForbiddenVercelEnvError,
  findForbiddenOpenAIEnvNames,
  formatForbiddenOpenAIEnvError,
  formatUnexpectedVercelEnvWarning,
} = require("./config/vercel-env-policy.cjs");

function buildValidVercelEnv(overrides = {}) {
  return {
    APP_URL: "https://app.streamos.test",
    API_GATEWAY_SECRET: "test-api-gateway-secret-123",
    API_GATEWAY_URL: "https://gateway.streamos.test",
    NEXT_PUBLIC_APP_URL: "https://app.streamos.test",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    STREAMOS_DEMO_MODE: "false",
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

        import(\`data:text/javascript;base64,\${Buffer.from(transpiled).toString('base64')}\`)
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
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    STREAMOS_DEMO_MODE: "false",
  };

  const issues = collectVercelEnvironmentIssues(maskedEnv, {
    knownPresentNames: new Set([
      "API_GATEWAY_SECRET",
      "API_GATEWAY_URL",
      "NEXT_PUBLIC_APP_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
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

test("collectVercelEnvironmentIssues blocks Supabase integration admin keys from Vercel inventory", () => {
  const issues = collectVercelEnvironmentIssues(
    {},
    {
      knownPresentNames: new Set([
        "SB_POSTGRES_PASSWORD",
        "SB_POSTGRES_PRISMA_URL",
        "SB_SUPABASE_JWT_SECRET",
        "SB_SUPABASE_SECRET_KEY",
        "SB_SUPABASE_SERVICE_ROLE_KEY",
      ]),
      requireRequired: false,
      validatePublicUrls: false,
    },
  );

  assert.deepEqual(
    issues.map((issue) => issue.name),
    [
      "SB_POSTGRES_PASSWORD",
      "SB_POSTGRES_PRISMA_URL",
      "SB_SUPABASE_JWT_SECRET",
      "SB_SUPABASE_SECRET_KEY",
      "SB_SUPABASE_SERVICE_ROLE_KEY",
    ],
  );
  assert.match(
    issues.map((issue) => issue.reason).join("\n"),
    /Privileged Supabase database access belongs in Railway services\/workers/,
  );
});

test("findForbiddenVercelEnvNames catches Railway-only names and prefixes", () => {
  const names = findForbiddenVercelEnvNames({
    APP_ENCRYPTION_KEY: `base64:${Buffer.alloc(32, 7).toString("base64")}`,
    OPENAI_API_KEY: "sk-test",
    RAILWAY_PRIVATE_DOMAIN: "internal",
    REDIS_URL: "redis://localhost:6379/0",
    SB_POSTGRES_PASSWORD: "postgres-password",
    SB_SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    TIKTOK_CLIENT_KEY: "tiktok-client-key",
    TWITCH_CLIENT_ID: "twitch-client-id",
    TWITCH_REDIRECT_URI:
      "https://gateway.streamos.test/api/auth/twitch/callback",
    TWITCH_SCOPES: "user:read:email",
    YOUTUBE_CLIENT_SECRET: "youtube-secret",
  });

  assert.deepEqual(names, [
    "APP_ENCRYPTION_KEY",
    "OPENAI_API_KEY",
    "RAILWAY_PRIVATE_DOMAIN",
    "REDIS_URL",
    "SB_POSTGRES_PASSWORD",
    "SB_SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "TIKTOK_CLIENT_KEY",
    "TWITCH_CLIENT_ID",
    "TWITCH_REDIRECT_URI",
    "TWITCH_SCOPES",
    "YOUTUBE_CLIENT_SECRET",
  ]);
  assert.match(
    formatForbiddenVercelEnvError(names, "apps/web Vercel build"),
    /APP_ENCRYPTION_KEY[\s\S]*YOUTUBE_CLIENT_SECRET[\s\S]*(belong|must not be configured)/i,
  );
});

test("assertVercelEnvironment blocks Railway-only secrets and provider secrets", () => {
  assert.throws(
    () =>
      assertVercelEnvironment(
        {
          APP_ENCRYPTION_KEY: `base64:${Buffer.alloc(32, 7).toString("base64")}`,
          CRON_SECRET: "cron-secret",
          KICK_CLIENT_SECRET: "kick-secret",
          KICK_WEBHOOK_SECRET: "kick-webhook-secret",
          OPENAI_API_KEY: "sk-test",
          REDIS_URL: "redis://localhost:6379/0",
          SB_POSTGRES_PASSWORD: "postgres-password",
          SB_SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
          SUPABASE_DB_URL: "postgres://localhost:5432/postgres",
          SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
          TIKTOK_CLIENT_KEY: "tiktok-client-key",
          TIKTOK_CLIENT_SECRET: "tiktok-secret",
          TWITCH_CLIENT_ID: "twitch-client-id",
          TWITCH_CLIENT_SECRET: "twitch-secret",
          TWITCH_REDIRECT_URI:
            "https://gateway.streamos.test/api/auth/twitch/callback",
          TWITCH_SCOPES: "user:read:email",
          YOUTUBE_CLIENT_SECRET: "youtube-client-secret",
        },
        { requireRequired: false, validatePublicUrls: false },
      ),
    /APP_ENCRYPTION_KEY|CRON_SECRET|KICK_CLIENT_SECRET|KICK_WEBHOOK_SECRET|OPENAI_API_KEY|REDIS_URL|SB_POSTGRES_PASSWORD|SB_SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|SUPABASE_SERVICE_ROLE_KEY|TIKTOK_CLIENT_KEY|TIKTOK_CLIENT_SECRET|TWITCH_CLIENT_ID|TWITCH_CLIENT_SECRET|TWITCH_REDIRECT_URI|TWITCH_SCOPES|YOUTUBE_CLIENT_SECRET/,
  );
});

test("assertNoForbiddenVercelEnv uses runtime-specific secret guidance", () => {
  assert.throws(
    () =>
      assertNoForbiddenVercelEnv(
        {
          APP_ENCRYPTION_KEY: `base64:${Buffer.alloc(32, 7).toString("base64")}`,
          OPENAI_API_KEY: "sk-test",
          SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        },
        { contextLabel: "apps/web Vercel build" },
      ),
    /APP_ENCRYPTION_KEY[\s\S]*OPENAI_API_KEY[\s\S]*SUPABASE_SERVICE_ROLE_KEY[\s\S]*(belong|must not be configured)/i,
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

test("assertVercelEnvironment validates optional APP_URL when present", () => {
  assert.throws(
    () =>
      assertVercelEnvironment(
        buildValidVercelEnv({
          APP_URL: "http://streamos-web-production.up.railway.app",
        }),
        { requireRequired: true, validatePublicUrls: true },
      ),
    /APP_URL/,
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

test("assertVercelEnvironment requires a public Supabase key in Vercel mode", () => {
  assert.throws(
    () =>
      assertVercelEnvironment(
        {
          API_GATEWAY_SECRET: "test-api-gateway-secret-123",
          API_GATEWAY_URL: "https://gateway.streamos.test",
          NEXT_PUBLIC_APP_URL: "https://app.streamos.test",
          NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        },
        { requireRequired: true, validatePublicUrls: true },
      ),
    /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \| NEXT_PUBLIC_SUPABASE_ANON_KEY/,
  );
});

test("assertVercelEnvironment requires a canonical app origin in Vercel mode", () => {
  assert.throws(
    () =>
      assertVercelEnvironment(
        {
          API_GATEWAY_SECRET: "test-api-gateway-secret-123",
          API_GATEWAY_URL: "https://gateway.streamos.test",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
          NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        },
        { requireRequired: true, validatePublicUrls: true },
      ),
    /APP_URL \| NEXT_PUBLIC_APP_URL/,
  );
});

test("collectUnexpectedVercelEnvNames returns unknown non-blocked names", () => {
  const names = collectUnexpectedVercelEnvNames({
    APP_ENV: "development",
    CODEX_SHELL: "pwsh",
    CUSTOM_DEBUG_FLAG: "1",
    NEXT_PUBLIC_SB_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    SB_SUPABASE_URL: "https://project.supabase.co",
    PATH: "/usr/bin",
    PNPM_SCRIPT_SRC_DIR: "C:/Dev/StreamOS",
    TURBO_HASH: "hash",
  });

  assert.deepEqual(names, [
    "CUSTOM_DEBUG_FLAG",
    "NEXT_PUBLIC_SB_SUPABASE_PUBLISHABLE_KEY",
    "SB_SUPABASE_URL",
  ]);
  assert.match(
    formatUnexpectedVercelEnvWarning(names, "apps/web Vercel build"),
    /CUSTOM_DEBUG_FLAG[\s\S]*NEXT_PUBLIC_SB_SUPABASE_PUBLISHABLE_KEY[\s\S]*SB_SUPABASE_URL/,
  );
});

test("parseArgs accepts development as a supported Vercel audit environment", () => {
  const { parseArgs } = require("./validate-vercel-env.cjs");

  assert.deepEqual(parseArgs(["--environment", "development"]), {
    environment: "development",
    envFile: undefined,
    help: false,
    vercelDir: ".vercel",
  });
});

test("collectUnexpectedVercelEnvNames filters common local tooling noise", () => {
  const names = collectUnexpectedVercelEnvNames({
    __PSLockDownPolicy: "1",
    APPDATA: "C:\\Users\\dorts\\AppData\\Roaming",
    INIT_CWD: "C:\\Dev\\StreamOS",
    JEST_WORKER_ID: "1",
    LOCALAPPDATA: "C:\\Users\\dorts\\AppData\\Local",
    NEXT_PRIVATE_START_TIME: "1766650000000",
    NEXT_RUNTIME: "nodejs",
    NODE: "C:\\Program Files\\nodejs\\node.exe",
    Path: "C:\\Windows\\System32",
    ProgramFiles: "C:\\Program Files",
    TEMP: "C:\\Users\\dorts\\AppData\\Local\\Temp",
    TURBOPACK: "1",
    USERDOMAIN_ROAMINGPROFILE: "DESKTOP",
    USERPROFILE: "C:\\Users\\dorts",
  });

  assert.deepEqual(names, []);
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

test("Vercel env runner accepts development env files with the same web policy", () => {
  const tempDirectory = mkdtempSync(join(os.tmpdir(), "streamos-vercel-env-"));
  const vercelDirectory = join(tempDirectory, ".vercel");
  const envFile = join(vercelDirectory, ".env.development.local");
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
      "development",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Vercel development environment audit passed/);
});

test("Vercel env runner blocks forbidden server-only keys in development", () => {
  const tempDirectory = mkdtempSync(join(os.tmpdir(), "streamos-vercel-env-"));
  const vercelDirectory = join(tempDirectory, ".vercel");
  const envFile = join(vercelDirectory, ".env.development.local");
  mkdirSync(vercelDirectory, { recursive: true });
  writeFileSync(
    envFile,
    Object.entries(
      buildValidVercelEnv({
        APP_ENCRYPTION_KEY: `base64:${Buffer.alloc(32, 7).toString("base64")}`,
        STREAM_EVENT_WEBHOOK_SECRET: "webhook-secret-placeholder",
        TWITCH_CLIENT_SECRET: "twitch-secret-placeholder",
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
      "development",
    ],
    { encoding: "utf8" },
  );

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /APP_ENCRYPTION_KEY[\s\S]*STREAM_EVENT_WEBHOOK_SECRET[\s\S]*TWITCH_CLIENT_SECRET/,
  );
});

test("Vercel env runner blocks gateway-owned Twitch OAuth config in development", () => {
  const tempDirectory = mkdtempSync(join(os.tmpdir(), "streamos-vercel-env-"));
  const vercelDirectory = join(tempDirectory, ".vercel");
  const envFile = join(vercelDirectory, ".env.development.local");
  mkdirSync(vercelDirectory, { recursive: true });
  writeFileSync(
    envFile,
    Object.entries(
      buildValidVercelEnv({
        TWITCH_CLIENT_ID: "twitch-client-id-placeholder",
        TWITCH_REDIRECT_URI:
          "https://gateway.streamos.test/api/auth/twitch/callback",
        TWITCH_SCOPES: "user:read:email",
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
      "development",
    ],
    { encoding: "utf8" },
  );

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /TWITCH_CLIENT_ID[\s\S]*TWITCH_REDIRECT_URI[\s\S]*TWITCH_SCOPES/,
  );
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
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
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

test("next.config.ts fails fast on Railway-only secrets outside Vercel mode", () => {
  const result = runNextConfigImport({
    APP_ENCRYPTION_KEY: `base64:${Buffer.alloc(32, 7).toString("base64")}`,
    OPENAI_API_KEY: "sk-server-only",
    REDIS_URL: "redis://localhost:6379/0",
  });

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /APP_ENCRYPTION_KEY[\s\S]*OPENAI_API_KEY[\s\S]*REDIS_URL[\s\S]*(belong|must not be configured)/i,
  );
});

test("next.config.ts fails fast on gateway-owned Twitch OAuth config", () => {
  const result = runNextConfigImport({
    TWITCH_CLIENT_ID: "twitch-client-id-placeholder",
    TWITCH_REDIRECT_URI:
      "https://gateway.streamos.test/api/auth/twitch/callback",
    TWITCH_SCOPES: "user:read:email",
  });

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /TWITCH_CLIENT_ID[\s\S]*TWITCH_REDIRECT_URI[\s\S]*TWITCH_SCOPES[\s\S]*(belong|must not be configured)/i,
  );
});

test("next.config.ts warns on unknown non-blocked env keys", () => {
  const result = runNextConfigImport({
    CUSTOM_DEBUG_FLAG: "1",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(`${result.stdout}${result.stderr}`, /CUSTOM_DEBUG_FLAG/);
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
