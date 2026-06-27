#!/usr/bin/env node

const { loadEnvFile } = require("./check-deployment.cjs");
const { consumeValueFlag } = require("./lib/cli-args.cjs");

const BRAND_ASSET_STORAGE_BUCKET = "brand-assets";
const DEFAULT_FORMAT = "text";
const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_REPORT_SCHEMA_VERSION = "branding_orphan_dry_run/v2";
const DEFAULT_SUPABASE_SERVICE_ROLE_ENV = "SUPABASE_SERVICE_ROLE_KEY";
const DEFAULT_SUPABASE_URL_ENV = "SUPABASE_URL";
const DEFAULT_TARGET_ENVIRONMENT = "auto";
const VALID_TARGET_ENVIRONMENTS = [
  "auto",
  "local",
  "development",
  "staging",
  "production",
  "unknown",
];
const KNOWN_BRAND_ASSET_TYPES = new Set([
  "overlay",
  "alert",
  "logo",
  "banner",
  "panel",
  "emote",
  "color_palette",
  "typography",
  "scene",
]);
const KNOWN_BRAND_ASSET_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const STORAGE_LIST_UNSUPPORTED_STATUS_CODES = new Set([400, 404, 405, 501]);

function parseArgs(argv) {
  const options = {
    envFile: undefined,
    format: DEFAULT_FORMAT,
    help: false,
    serviceRoleEnv: DEFAULT_SUPABASE_SERVICE_ROLE_ENV,
    supabaseUrlEnv: DEFAULT_SUPABASE_URL_ENV,
    targetEnvironment: DEFAULT_TARGET_ENVIRONMENT,
    userId: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--") {
      continue;
    }

    const envFileMatch = consumeValueFlag(argv, index, "env-file");

    if (envFileMatch.matched) {
      options.envFile = envFileMatch.value.trim();
      index = envFileMatch.nextIndex;
      continue;
    }

    const formatMatch = consumeValueFlag(argv, index, "format");

    if (formatMatch.matched) {
      options.format = formatMatch.value.trim();
      index = formatMatch.nextIndex;
      continue;
    }

    const serviceRoleEnvMatch = consumeValueFlag(
      argv,
      index,
      "service-role-env",
    );

    if (serviceRoleEnvMatch.matched) {
      options.serviceRoleEnv = serviceRoleEnvMatch.value.trim();
      index = serviceRoleEnvMatch.nextIndex;
      continue;
    }

    const supabaseUrlEnvMatch = consumeValueFlag(
      argv,
      index,
      "supabase-url-env",
    );

    if (supabaseUrlEnvMatch.matched) {
      options.supabaseUrlEnv = supabaseUrlEnvMatch.value.trim();
      index = supabaseUrlEnvMatch.nextIndex;
      continue;
    }

    const targetEnvironmentMatch = consumeValueFlag(
      argv,
      index,
      "target-environment",
    );

    if (targetEnvironmentMatch.matched) {
      options.targetEnvironment = normalizeTargetEnvironmentName(
        targetEnvironmentMatch.value.trim(),
      );
      index = targetEnvironmentMatch.nextIndex;
      continue;
    }

    const userIdMatch = consumeValueFlag(argv, index, "user-id");

    if (userIdMatch.matched) {
      options.userId = userIdMatch.value.trim();
      index = userIdMatch.nextIndex;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!["json", "text"].includes(options.format)) {
    throw new Error("--format must be one of: text, json.");
  }

  if (!VALID_TARGET_ENVIRONMENTS.includes(options.targetEnvironment)) {
    throw new Error(
      `--target-environment must be one of: ${VALID_TARGET_ENVIRONMENTS.join(", ")}.`,
    );
  }

  if (!options.help && !options.userId) {
    throw new Error("--user-id is required for tenant-scoped orphan dry-runs.");
  }

  if (!options.supabaseUrlEnv) {
    throw new Error("--supabase-url-env must not be empty.");
  }

  if (!options.serviceRoleEnv) {
    throw new Error("--service-role-env must not be empty.");
  }

  return options;
}

function printHelp() {
  console.log(`StreamOS brand asset orphan cleanup dry-run

Usage:
  pnpm branding:orphan-dry-run -- --env-file .env --user-id 11111111-1111-4111-8111-111111111111 --format text
  pnpm branding:orphan-dry-run -- --user-id 11111111-1111-4111-8111-111111111111 --target-environment production --format json

Options:
  --env-file PATH              Load key=value pairs before reading process.env.
  --user-id ID                 Tenant/user prefix to audit. Required.
  --supabase-url-env NAME      Environment variable for Supabase URL.
                               Default: ${DEFAULT_SUPABASE_URL_ENV}
  --service-role-env NAME      Environment variable for Supabase service role key.
                               Default: ${DEFAULT_SUPABASE_SERVICE_ROLE_ENV}
  --target-environment ENV     Explicit environment binding.
                               Allowed: ${VALID_TARGET_ENVIRONMENTS.join(", ")}.
                               Default: ${DEFAULT_TARGET_ENVIRONMENT}
  --format text|json           Output format. Default: ${DEFAULT_FORMAT}
`);
}

function normalizeTargetEnvironmentName(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "dev") {
    return "development";
  }

  if (normalized === "prod") {
    return "production";
  }

  return normalized;
}

function inferTargetEnvironmentFromSupabaseUrlEnvName(name) {
  const normalized = String(name ?? "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return undefined;
  }

  if (normalized.includes("local")) {
    return "local";
  }

  if (normalized.includes("development") || normalized.includes("_dev")) {
    return "development";
  }

  if (normalized.includes("staging")) {
    return "staging";
  }

  if (normalized.includes("production") || normalized.includes("_prod")) {
    return "production";
  }

  return undefined;
}

function inferTargetEnvironmentFromSupabaseUrl(supabaseUrl) {
  let parsedUrl;

  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    return undefined;
  }

  const host = parsedUrl.hostname.trim().toLowerCase();

  if (!host) {
    return undefined;
  }

  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local")
  ) {
    return "local";
  }

  if (host.includes("development") || host.includes("-dev")) {
    return "development";
  }

  if (host.includes("staging")) {
    return "staging";
  }

  if (host.includes("production") || host.includes("-prod")) {
    return "production";
  }

  return undefined;
}

function resolveTargetEnvironment({
  supabaseUrl,
  supabaseUrlEnv = DEFAULT_SUPABASE_URL_ENV,
  targetEnvironment = DEFAULT_TARGET_ENVIRONMENT,
}) {
  const explicitEnvironment = normalizeTargetEnvironmentName(targetEnvironment);
  const inferredFromEnvName =
    inferTargetEnvironmentFromSupabaseUrlEnvName(supabaseUrlEnv);
  const inferredFromUrl = inferTargetEnvironmentFromSupabaseUrl(supabaseUrl);
  const findings = [];

  if (
    explicitEnvironment &&
    explicitEnvironment !== DEFAULT_TARGET_ENVIRONMENT &&
    explicitEnvironment !== "unknown"
  ) {
    const conflictingInference = [inferredFromEnvName, inferredFromUrl].find(
      (value) => value && value !== explicitEnvironment,
    );

    if (conflictingInference) {
      findings.push(
        `The explicit target environment (${explicitEnvironment}) conflicts with inferred hosted evidence (${conflictingInference}).`,
      );

      return {
        environment: "unknown",
        findings,
        source: "explicit_conflict",
      };
    }

    return {
      environment: explicitEnvironment,
      findings,
      source: "explicit",
    };
  }

  if (
    inferredFromEnvName &&
    inferredFromUrl &&
    inferredFromEnvName !== inferredFromUrl
  ) {
    findings.push(
      `The target environment could not be proven because ${supabaseUrlEnv} and the configured Supabase host imply different environments.`,
    );

    return {
      environment: "unknown",
      findings,
      source: "inference_conflict",
    };
  }

  if (inferredFromEnvName && inferredFromUrl) {
    return {
      environment: inferredFromEnvName,
      findings,
      source: "env_name_and_host",
    };
  }

  if (inferredFromEnvName) {
    return {
      environment: inferredFromEnvName,
      findings,
      source: "env_name",
    };
  }

  if (inferredFromUrl) {
    return {
      environment: inferredFromUrl,
      findings,
      source: "supabase_host",
    };
  }

  findings.push(
    `The target environment is not explicit. Pass --target-environment <local|development|staging|production> when ${supabaseUrlEnv} alone does not prove the intended scope.`,
  );

  return {
    environment: "unknown",
    findings,
    source: "unknown",
  };
}

function requireEnv(env, name) {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for the branding orphan dry-run.`);
  }

  return value;
}

function createSupabaseReadonlyClient({
  fetchImpl = fetch,
  serviceRoleKey,
  supabaseUrl,
}) {
  const normalizedSupabaseUrl = supabaseUrl?.trim();
  const normalizedServiceRoleKey = serviceRoleKey?.trim();

  if (!normalizedSupabaseUrl || !normalizedServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  return {
    fetchImpl,
    headers: {
      apikey: normalizedServiceRoleKey,
      Authorization: `Bearer ${normalizedServiceRoleKey}`,
      "Content-Type": "application/json",
    },
    supabaseUrl: normalizedSupabaseUrl.replace(/\/+$/, ""),
  };
}

function createSupabaseRestUrl({ client, table }) {
  return new URL(`/rest/v1/${table}`, client.supabaseUrl);
}

function createSupabaseStorageListUrl({ bucket, client }) {
  return new URL(
    `/storage/v1/object/list/${encodeURIComponent(bucket)}`,
    client.supabaseUrl,
  );
}

async function readAllSupabaseRows({
  client,
  pageSize = DEFAULT_PAGE_SIZE,
  params,
  table,
}) {
  const rows = [];

  for (let offset = 0; ; offset += pageSize) {
    const url = createSupabaseRestUrl({ client, table });

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));

    const response = await client.fetchImpl(url, {
      headers: client.headers,
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(
        `Supabase ${table} lookup failed with status ${response.status}.`,
      );
    }

    const page = await response.json();

    if (!Array.isArray(page)) {
      throw new Error(`Supabase ${table} lookup returned malformed JSON.`);
    }

    rows.push(...page);

    if (page.length < pageSize) {
      return rows;
    }
  }
}

async function readBrandAssetReferences({
  bucket = BRAND_ASSET_STORAGE_BUCKET,
  client,
  userId,
}) {
  const rows = await readAllSupabaseRows({
    client,
    params: {
      order: "storage_path.asc.nullslast",
      select: "id,storage_bucket,storage_path,updated_at",
      user_id: `eq.${userId}`,
    },
    table: "brand_assets",
  });

  return rows.map((row) => ({
    id: typeof row.id === "string" ? row.id : null,
    storageBucket:
      typeof row.storage_bucket === "string" ? row.storage_bucket : null,
    storagePath: typeof row.storage_path === "string" ? row.storage_path : null,
    updatedAt: normalizeTimestamp(row.updated_at),
    userId,
    withinExpectedBucket: row.storage_bucket === bucket,
  }));
}

async function readBrandAssetStorageObjects({
  bucket = BRAND_ASSET_STORAGE_BUCKET,
  client,
  pageSize = DEFAULT_PAGE_SIZE,
  userId,
}) {
  const rootPrefix = normalizeStorageListPrefix(userId);
  const visitedPrefixes = new Set();
  const collectedObjects = [];
  const prefixesToVisit = [rootPrefix];

  while (prefixesToVisit.length > 0) {
    const currentPrefix = prefixesToVisit.shift();

    if (!currentPrefix || visitedPrefixes.has(currentPrefix)) {
      continue;
    }

    visitedPrefixes.add(currentPrefix);

    const entries = await readAllStorageListEntries({
      bucket,
      client,
      pageSize,
      prefix: currentPrefix,
    });

    for (const entry of entries) {
      const entryName = typeof entry.name === "string" ? entry.name.trim() : "";

      if (!entryName) {
        continue;
      }

      const fullPath = normalizeStoragePath(`${currentPrefix}/${entryName}`);

      if (!fullPath || !isTenantScopedPrefix(fullPath, userId)) {
        continue;
      }

      if (entry.id === null) {
        prefixesToVisit.push(fullPath);
        continue;
      }

      collectedObjects.push({
        createdAt: normalizeTimestamp(entry.created_at),
        lastAccessedAt: normalizeTimestamp(entry.last_accessed_at),
        metadata: isPlainObject(entry.metadata) ? entry.metadata : null,
        path: fullPath,
        updatedAt: normalizeTimestamp(entry.updated_at),
      });
    }
  }

  return collectedObjects.sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

async function readAllStorageListEntries({
  bucket,
  client,
  pageSize = DEFAULT_PAGE_SIZE,
  prefix,
}) {
  const rows = [];

  for (let offset = 0; ; offset += pageSize) {
    const url = createSupabaseStorageListUrl({ bucket, client });
    const response = await client.fetchImpl(url, {
      body: JSON.stringify({
        limit: pageSize,
        offset,
        prefix,
        sortBy: {
          column: "name",
          order: "asc",
        },
      }),
      headers: client.headers,
      method: "POST",
    });

    if (!response.ok) {
      const message = STORAGE_LIST_UNSUPPORTED_STATUS_CODES.has(response.status)
        ? `Supabase Storage list API lookup failed with status ${response.status}. The configured storage metadata read path may be unsupported for this project.`
        : `Supabase Storage list API lookup failed with status ${response.status}.`;

      throw new Error(message);
    }

    const page = await response.json();

    if (!Array.isArray(page)) {
      throw new Error(
        "Supabase Storage list API lookup returned malformed JSON.",
      );
    }

    rows.push(...page);

    if (page.length < pageSize) {
      return rows;
    }
  }
}

function buildBrandingOrphanDryRunReport({
  bucket = BRAND_ASSET_STORAGE_BUCKET,
  generatedAt = new Date().toISOString(),
  storageObjects,
  targetEnvironment,
  userId,
  references,
}) {
  const referencedPaths = new Set();
  const referenceFindings = [];

  for (const reference of references) {
    if (!reference.storagePath || !reference.storageBucket) {
      continue;
    }

    if (reference.storageBucket !== bucket) {
      referenceFindings.push({
        assetId: reference.id,
        classification: "out_of_scope",
        reason: "brand_assets row points at a different storage bucket.",
        redactedPath: null,
      });
      continue;
    }

    const normalizedPath = normalizeStoragePath(reference.storagePath);

    if (!normalizedPath || !isTenantScopedPrefix(normalizedPath, userId)) {
      referenceFindings.push({
        assetId: reference.id,
        classification: "out_of_scope",
        reason:
          "brand_assets row points outside the expected tenant-scoped prefix.",
        redactedPath: redactStoragePath(reference.storagePath, userId),
      });
      continue;
    }

    referencedPaths.add(normalizedPath);
  }

  const objects = storageObjects.map((object) =>
    classifyBrandingStorageObject({
      bucket,
      object,
      referencedPaths,
      userId,
    }),
  );
  const summary = {
    orphanCandidateCount: objects.filter(
      (object) => object.classification === "orphan_candidate",
    ).length,
    outOfScopeCount: objects.filter(
      (object) => object.classification === "out_of_scope",
    ).length,
    referencedCount: objects.filter(
      (object) => object.classification === "referenced",
    ).length,
    totalObjects: objects.length,
    unknownCount: objects.filter(
      (object) => object.classification === "unknown",
    ).length,
  };

  return {
    bucket,
    execution: {
      dryRun: true,
      mutationAllowed: false,
      nextExecutionSliceBlocked: true,
    },
    generatedAt,
    objects,
    referenceFindings,
    schemaVersion: DEFAULT_REPORT_SCHEMA_VERSION,
    scope: {
      prefix: `${userId}/`,
      userId,
    },
    summary,
    targetEnvironment,
  };
}

function classifyBrandingStorageObject({
  bucket,
  object,
  referencedPaths,
  userId,
}) {
  const normalizedPath = normalizeStoragePath(object.path);
  const tenantScopedPrefix =
    normalizedPath !== null && isTenantScopedPrefix(normalizedPath, userId);
  const recognizedShape =
    normalizedPath !== null &&
    isRecognizedBrandAssetStoragePath(normalizedPath, userId);

  if (!tenantScopedPrefix) {
    return buildObjectReport({
      bucket,
      classification: "out_of_scope",
      object,
      pathContract: {
        recognizedShape: false,
        tenantScopedPrefix: false,
      },
      reason:
        "Storage object lies outside the expected tenant-scoped prefix or uses an unsafe path shape.",
      userId,
    });
  }

  if (referencedPaths.has(normalizedPath)) {
    return buildObjectReport({
      bucket,
      classification: "referenced",
      object,
      pathContract: {
        recognizedShape,
        tenantScopedPrefix,
      },
      reason:
        "Storage object is still referenced by an active brand_assets.storage_path value.",
      userId,
    });
  }

  if (!recognizedShape) {
    return buildObjectReport({
      bucket,
      classification: "unknown",
      object,
      pathContract: {
        recognizedShape,
        tenantScopedPrefix,
      },
      reason:
        "Storage object is tenant-scoped but uses an unexpected or legacy path shape, so dry-run keeps it fail-safe.",
      userId,
    });
  }

  return buildObjectReport({
    bucket,
    classification: "orphan_candidate",
    object,
    pathContract: {
      recognizedShape,
      tenantScopedPrefix,
    },
    reason: normalizedPath.includes("/replacements/")
      ? "Tenant-scoped replacement object has no active brand_assets reference."
      : "Tenant-scoped brand-assets object has no active brand_assets reference.",
    userId,
  });
}

function buildObjectReport({
  bucket,
  classification,
  object,
  pathContract,
  reason,
  userId,
}) {
  return {
    bucket,
    classification,
    createdAt: object.createdAt,
    lastAccessedAt: object.lastAccessedAt,
    objectSizeBytes: extractObjectSize(object.metadata),
    pathContract,
    reason,
    redactedPath: redactStoragePath(object.path, userId),
    updatedAt: object.updatedAt,
  };
}

function normalizeStoragePath(value) {
  const normalized = String(value ?? "").trim();

  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.includes("\\") ||
    normalized.includes("://") ||
    normalized.includes("?") ||
    normalized.includes("#")
  ) {
    return null;
  }

  const segments = normalized.split("/");

  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    return null;
  }

  return normalized;
}

function normalizeStorageListPrefix(value) {
  const normalizedCandidate = String(value ?? "")
    .trim()
    .replace(/\/+$/, "");
  const normalized = normalizeStoragePath(normalizedCandidate);

  return normalized ?? null;
}

function isTenantScopedPrefix(storagePath, userId) {
  return storagePath.startsWith(`${userId}/`);
}

function isRecognizedBrandAssetStoragePath(storagePath, userId) {
  if (!isTenantScopedPrefix(storagePath, userId)) {
    return false;
  }

  const segments = storagePath.split("/");
  const assetType = segments[1];
  const filename = segments.at(-1) ?? "";
  const extension = filename.split(".").at(-1)?.toLowerCase() ?? "";

  if (!KNOWN_BRAND_ASSET_TYPES.has(assetType)) {
    return false;
  }

  if (!KNOWN_BRAND_ASSET_EXTENSIONS.has(extension)) {
    return false;
  }

  if (segments.length === 4) {
    return filename.length > extension.length + 1;
  }

  if (segments.length === 5 && segments[3] === "replacements") {
    return filename.length > extension.length + 1;
  }

  return false;
}

function redactStoragePath(storagePath, userId) {
  const normalizedPath = normalizeStoragePath(storagePath);

  if (!normalizedPath) {
    return "<invalid-path>";
  }

  if (!isTenantScopedPrefix(normalizedPath, userId)) {
    return "<out-of-scope>";
  }

  return `<tenant>/${normalizedPath.slice(userId.length + 1)}`;
}

function extractObjectSize(metadata) {
  if (!isPlainObject(metadata)) {
    return null;
  }

  for (const key of ["size", "fileSize", "file_size"]) {
    const value = metadata[key];

    if (Number.isInteger(value) && value >= 0) {
      return value;
    }
  }

  return null;
}

function normalizeTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const timestamp = new Date(value);

  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function formatReport(report, format) {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }

  return renderTextReport(report);
}

function renderTextReport(report) {
  const lines = [
    "StreamOS brand asset orphan cleanup dry-run",
    "",
    `- schema version: ${report.schemaVersion}`,
    `- generated at: ${report.generatedAt}`,
    `- target environment: ${report.targetEnvironment.environment}`,
    `- target source: ${report.targetEnvironment.source}`,
    `- bucket: ${report.bucket}`,
    `- tenant prefix: ${report.scope.prefix}`,
    `- dry run: yes`,
    `- mutation allowed: no`,
    `- orphan execution slice ready: no`,
    `- referenced: ${report.summary.referencedCount}`,
    `- orphan_candidate: ${report.summary.orphanCandidateCount}`,
    `- unknown: ${report.summary.unknownCount}`,
    `- out_of_scope: ${report.summary.outOfScopeCount}`,
    `- total objects: ${report.summary.totalObjects}`,
  ];

  if (report.targetEnvironment.findings.length > 0) {
    lines.push("");
    lines.push("target environment findings:");

    for (const finding of report.targetEnvironment.findings) {
      lines.push(`- ${finding}`);
    }
  }

  if (report.referenceFindings.length > 0) {
    lines.push("");
    lines.push("reference findings:");

    for (const finding of report.referenceFindings) {
      lines.push(
        `- ${finding.assetId ?? "<unknown-asset>"}: ${finding.classification} (${finding.reason})`,
      );
    }
  }

  if (report.objects.length > 0) {
    lines.push("");
    lines.push("objects:");

    for (const object of report.objects) {
      const metadataParts = [
        object.objectSizeBytes === null
          ? null
          : `size=${object.objectSizeBytes}B`,
        object.createdAt ? `created=${object.createdAt}` : null,
        object.updatedAt ? `updated=${object.updatedAt}` : null,
        object.lastAccessedAt ? `last_accessed=${object.lastAccessedAt}` : null,
      ].filter(Boolean);
      const metadataSuffix =
        metadataParts.length > 0 ? ` [${metadataParts.join(", ")}]` : "";

      lines.push(
        `- ${object.classification}: ${object.redactedPath} (${object.reason})${metadataSuffix}`,
      );
    }
  } else {
    lines.push("");
    lines.push("- no storage objects matched the tenant-scoped prefix.");
  }

  return lines.join("\n");
}

async function runBrandingOrphanDryRun({
  bucket = BRAND_ASSET_STORAGE_BUCKET,
  env,
  fetchImpl = fetch,
  options,
}) {
  const supabaseUrl = requireEnv(env, options.supabaseUrlEnv);
  const serviceRoleKey = requireEnv(env, options.serviceRoleEnv);
  const client = createSupabaseReadonlyClient({
    fetchImpl,
    serviceRoleKey,
    supabaseUrl,
  });
  const targetEnvironment = resolveTargetEnvironment({
    supabaseUrl,
    supabaseUrlEnv: options.supabaseUrlEnv,
    targetEnvironment: options.targetEnvironment,
  });
  const [references, storageObjects] = await Promise.all([
    readBrandAssetReferences({
      bucket,
      client,
      userId: options.userId,
    }),
    readBrandAssetStorageObjects({
      bucket,
      client,
      userId: options.userId,
    }),
  ]);

  return buildBrandingOrphanDryRunReport({
    bucket,
    references,
    storageObjects,
    targetEnvironment,
    userId: options.userId,
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const env = {
    ...loadEnvFile(options.envFile),
    ...process.env,
  };
  const report = await runBrandingOrphanDryRun({
    env,
    options,
  });

  console.log(formatReport(report, options.format));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Branding orphan dry-run failed: ${error.message}`);
    process.exit(1);
  });
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  BRAND_ASSET_STORAGE_BUCKET,
  DEFAULT_FORMAT,
  DEFAULT_PAGE_SIZE,
  DEFAULT_REPORT_SCHEMA_VERSION,
  DEFAULT_SUPABASE_SERVICE_ROLE_ENV,
  DEFAULT_SUPABASE_URL_ENV,
  DEFAULT_TARGET_ENVIRONMENT,
  VALID_TARGET_ENVIRONMENTS,
  buildBrandingOrphanDryRunReport,
  classifyBrandingStorageObject,
  createSupabaseReadonlyClient,
  extractObjectSize,
  formatReport,
  inferTargetEnvironmentFromSupabaseUrl,
  inferTargetEnvironmentFromSupabaseUrlEnvName,
  isRecognizedBrandAssetStoragePath,
  normalizeStorageListPrefix,
  normalizeStoragePath,
  normalizeTargetEnvironmentName,
  parseArgs,
  readAllSupabaseRows,
  readBrandAssetReferences,
  readAllStorageListEntries,
  readBrandAssetStorageObjects,
  redactStoragePath,
  renderTextReport,
  resolveTargetEnvironment,
  runBrandingOrphanDryRun,
};
