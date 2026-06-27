const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BRAND_ASSET_STORAGE_BUCKET,
  buildBrandingOrphanDryRunReport,
  classifyBrandingStorageObject,
  createSupabaseReadonlyClient,
  formatReport,
  isRecognizedBrandAssetStoragePath,
  normalizeStoragePath,
  parseArgs,
  readBrandAssetReferences,
  readBrandAssetStorageObjects,
  redactStoragePath,
  resolveTargetEnvironment,
  runBrandingOrphanDryRun,
} = require("./branding-orphan-dry-run.cjs");

const tenantId = "11111111-1111-4111-8111-111111111111";

test("orphan dry-run parser accepts env, tenant, and target-environment flags", () => {
  const options = parseArgs([
    "--env-file",
    ".env",
    "--user-id",
    tenantId,
    "--supabase-url-env",
    "SUPABASE_URL_STAGING",
    "--service-role-env",
    "SUPABASE_SERVICE_ROLE_KEY_STAGING",
    "--target-environment",
    "production",
    "--format",
    "json",
  ]);

  assert.equal(options.envFile, ".env");
  assert.equal(options.userId, tenantId);
  assert.equal(options.supabaseUrlEnv, "SUPABASE_URL_STAGING");
  assert.equal(options.serviceRoleEnv, "SUPABASE_SERVICE_ROLE_KEY_STAGING");
  assert.equal(options.targetEnvironment, "production");
  assert.equal(options.format, "json");
});

test("orphan dry-run parser requires a tenant-scoped user id", () => {
  assert.throws(() => parseArgs(["--format", "text"]), /--user-id is required/);
});

test("orphan dry-run parser allows help without tenant-scoped execution args", () => {
  const options = parseArgs(["--help"]);

  assert.equal(options.help, true);
  assert.equal(options.userId, undefined);
});

test("referenced object is not marked as orphan", () => {
  const result = classifyBrandingStorageObject({
    bucket: BRAND_ASSET_STORAGE_BUCKET,
    object: {
      createdAt: "2026-06-27T10:00:00.000Z",
      lastAccessedAt: null,
      metadata: { size: 2048 },
      path: `${tenantId}/logo/asset-live/neon-logo.png`,
      updatedAt: "2026-06-27T11:00:00.000Z",
    },
    referencedPaths: new Set([`${tenantId}/logo/asset-live/neon-logo.png`]),
    userId: tenantId,
  });

  assert.equal(result.classification, "referenced");
  assert.equal(result.redactedPath, "<tenant>/logo/asset-live/neon-logo.png");
  assert.equal(result.objectSizeBytes, 2048);
});

test("old replace object without DB reference is marked as orphan_candidate", () => {
  const result = classifyBrandingStorageObject({
    bucket: BRAND_ASSET_STORAGE_BUCKET,
    object: {
      createdAt: "2026-06-27T10:00:00.000Z",
      lastAccessedAt: null,
      metadata: { size: 4096 },
      path: `${tenantId}/logo/asset-live/replacements/22222222-2222-4222-8222-222222222222-neon-logo.png`,
      updatedAt: "2026-06-27T11:00:00.000Z",
    },
    referencedPaths: new Set([`${tenantId}/logo/asset-live/neon-logo.png`]),
    userId: tenantId,
  });

  assert.equal(result.classification, "orphan_candidate");
  assert.match(
    result.reason,
    /replacement object has no active brand_assets reference/i,
  );
});

test("out-of-prefix object is classified out_of_scope without leaking the foreign tenant path", () => {
  const result = classifyBrandingStorageObject({
    bucket: BRAND_ASSET_STORAGE_BUCKET,
    object: {
      createdAt: null,
      lastAccessedAt: null,
      metadata: { size: 1024 },
      path: "99999999-9999-4999-8999-999999999999/logo/asset-x/foreign.png",
      updatedAt: null,
    },
    referencedPaths: new Set(),
    userId: tenantId,
  });

  assert.equal(result.classification, "out_of_scope");
  assert.equal(result.redactedPath, "<out-of-scope>");
});

test("legacy or unexpected tenant-scoped path stays fail-safe as unknown", () => {
  const result = classifyBrandingStorageObject({
    bucket: BRAND_ASSET_STORAGE_BUCKET,
    object: {
      createdAt: null,
      lastAccessedAt: null,
      metadata: null,
      path: `${tenantId}/legacy-folder/odd-shape/file.png`,
      updatedAt: null,
    },
    referencedPaths: new Set(),
    userId: tenantId,
  });

  assert.equal(result.classification, "unknown");
});

test("recognized brand asset storage path accepts create and replacement shapes only", () => {
  assert.equal(
    isRecognizedBrandAssetStoragePath(
      `${tenantId}/logo/asset-live/neon-logo.png`,
      tenantId,
    ),
    true,
  );
  assert.equal(
    isRecognizedBrandAssetStoragePath(
      `${tenantId}/logo/asset-live/replacements/uuid-neon-logo.png`,
      tenantId,
    ),
    true,
  );
  assert.equal(
    isRecognizedBrandAssetStoragePath(
      `${tenantId}/logo/asset-live/replacements/deeper/path.png`,
      tenantId,
    ),
    false,
  );
  assert.equal(
    isRecognizedBrandAssetStoragePath(
      `${tenantId}/logo/asset-live/neon-logo.svg`,
      tenantId,
    ),
    false,
  );
});

test("normalize and redact storage paths keep unsafe or cross-tenant paths secret-safe", () => {
  assert.equal(normalizeStoragePath(`/bad/path.png`), null);
  assert.equal(normalizeStoragePath(`bad\\path.png`), null);
  assert.equal(redactStoragePath(`/bad/path.png`, tenantId), "<invalid-path>");
  assert.equal(
    redactStoragePath(`${tenantId}/logo/asset-live/neon-logo.png`, tenantId),
    "<tenant>/logo/asset-live/neon-logo.png",
  );
  assert.equal(
    redactStoragePath(
      `99999999-9999-4999-8999-999999999999/logo/asset-live/foreign.png`,
      tenantId,
    ),
    "<out-of-scope>",
  );
});

test("storage listing and DB lookups stay read-only and tenant-scoped", async () => {
  const calls = [];
  const client = createSupabaseReadonlyClient({
    fetchImpl: async (url, options) => {
      calls.push({
        method: options.method,
        url: String(url),
      });

      return {
        ok: true,
        async json() {
          return [];
        },
      };
    },
    serviceRoleKey: "service-role-key",
    supabaseUrl: "https://streamos.supabase.co",
  });

  await readBrandAssetReferences({
    client,
    userId: tenantId,
  });
  await readBrandAssetStorageObjects({
    client,
    userId: tenantId,
  });

  assert.deepEqual(
    calls.map((call) => call.method),
    ["GET", "GET"],
  );
  assert.equal(
    calls.every((call) => !/(delete|remove|patch|post|put)/i.test(call.method)),
    true,
  );
  assert.match(
    calls[0].url,
    /user_id=eq\.11111111-1111-4111-8111-111111111111/,
  );
  assert.match(calls[1].url, /bucket_id=eq\.brand-assets/);
  assert.match(
    calls[1].url,
    /name=like\.11111111-1111-4111-8111-111111111111%2F%25/,
  );
});

test("storage listing failure is secret-safe", async () => {
  await assert.rejects(
    () =>
      runBrandingOrphanDryRun({
        env: {
          SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
          SUPABASE_URL: "https://streamos.supabase.co",
        },
        fetchImpl: async (url) => ({
          ok: !String(url).includes("storage.objects"),
          status: 503,
          async json() {
            return [];
          },
        }),
        options: {
          format: "text",
          serviceRoleEnv: "SUPABASE_SERVICE_ROLE_KEY",
          supabaseUrlEnv: "SUPABASE_URL",
          targetEnvironment: "production",
          userId: tenantId,
        },
      }),
    /Supabase storage\.objects lookup failed with status 503/,
  );
});

test("DB failure is secret-safe", async () => {
  await assert.rejects(
    () =>
      runBrandingOrphanDryRun({
        env: {
          SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
          SUPABASE_URL: "https://streamos.supabase.co",
        },
        fetchImpl: async (url) => ({
          ok: !String(url).includes("/rest/v1/brand_assets"),
          status: 500,
          async json() {
            return [];
          },
        }),
        options: {
          format: "text",
          serviceRoleEnv: "SUPABASE_SERVICE_ROLE_KEY",
          supabaseUrlEnv: "SUPABASE_URL",
          targetEnvironment: "production",
          userId: tenantId,
        },
      }),
    /Supabase brand_assets lookup failed with status 500/,
  );
});

test("empty bucket and DB states render a stable dry-run report", async () => {
  const report = await runBrandingOrphanDryRun({
    env: {
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
      SUPABASE_URL: "https://db-production.example.test",
    },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return [];
      },
    }),
    options: {
      format: "json",
      serviceRoleEnv: "SUPABASE_SERVICE_ROLE_KEY",
      supabaseUrlEnv: "SUPABASE_URL",
      targetEnvironment: "production",
      userId: tenantId,
    },
  });

  assert.equal(report.execution.dryRun, true);
  assert.equal(report.execution.mutationAllowed, false);
  assert.equal(report.execution.nextExecutionSliceBlocked, true);
  assert.equal(report.summary.totalObjects, 0);
  assert.equal(report.summary.orphanCandidateCount, 0);
  assert.equal(report.scope.prefix, `${tenantId}/`);
  assert.equal(report.targetEnvironment.environment, "production");
  assert.match(formatReport(report, "text"), /no storage objects matched/i);
});

test("text report includes safe object metadata when available", () => {
  const report = buildBrandingOrphanDryRunReport({
    references: [],
    storageObjects: [
      {
        createdAt: "2026-06-27T10:00:00.000Z",
        lastAccessedAt: "2026-06-27T12:00:00.000Z",
        metadata: { size: 512 },
        path: `${tenantId}/logo/asset-live/replacements/uuid-neon-logo.png`,
        updatedAt: "2026-06-27T11:00:00.000Z",
      },
    ],
    targetEnvironment: {
      environment: "production",
      findings: [],
      source: "explicit",
    },
    userId: tenantId,
  });

  const textReport = formatReport(report, "text");

  assert.match(textReport, /size=512B/);
  assert.match(textReport, /created=2026-06-27T10:00:00.000Z/);
  assert.match(textReport, /updated=2026-06-27T11:00:00.000Z/);
  assert.match(textReport, /last_accessed=2026-06-27T12:00:00.000Z/);
});

test("report builder keeps cross-tenant references out of the referenced set", () => {
  const report = buildBrandingOrphanDryRunReport({
    references: [
      {
        id: "asset-1",
        storageBucket: BRAND_ASSET_STORAGE_BUCKET,
        storagePath: `${tenantId}/logo/asset-live/neon-logo.png`,
        updatedAt: null,
        userId: tenantId,
        withinExpectedBucket: true,
      },
      {
        id: "asset-2",
        storageBucket: BRAND_ASSET_STORAGE_BUCKET,
        storagePath:
          "99999999-9999-4999-8999-999999999999/logo/asset-x/foreign.png",
        updatedAt: null,
        userId: tenantId,
        withinExpectedBucket: true,
      },
    ],
    storageObjects: [
      {
        createdAt: null,
        lastAccessedAt: null,
        metadata: { size: 512 },
        path: `${tenantId}/logo/asset-live/neon-logo.png`,
        updatedAt: null,
      },
      {
        createdAt: null,
        lastAccessedAt: null,
        metadata: { size: 512 },
        path: `${tenantId}/logo/asset-live/replacements/uuid-neon-logo.png`,
        updatedAt: null,
      },
    ],
    targetEnvironment: {
      environment: "production",
      findings: [],
      source: "explicit",
    },
    userId: tenantId,
  });

  assert.equal(report.objects[0].classification, "referenced");
  assert.equal(report.objects[1].classification, "orphan_candidate");
  assert.equal(report.referenceFindings[0].classification, "out_of_scope");
  assert.equal(report.referenceFindings[0].redactedPath, "<out-of-scope>");
});

test("target environment resolves explicit and inferred bindings without claiming unknown hosts as production", () => {
  assert.deepEqual(
    resolveTargetEnvironment({
      supabaseUrl: "https://db-production.example.test",
      supabaseUrlEnv: "SUPABASE_URL",
      targetEnvironment: "production",
    }),
    {
      environment: "production",
      findings: [],
      source: "explicit",
    },
  );

  assert.equal(
    resolveTargetEnvironment({
      supabaseUrl: "https://db-staging.example.test",
      supabaseUrlEnv: "SUPABASE_URL_STAGING",
    }).environment,
    "staging",
  );

  assert.equal(
    resolveTargetEnvironment({
      supabaseUrl: "https://db.example.test",
      supabaseUrlEnv: "SUPABASE_URL",
    }).environment,
    "unknown",
  );
});
