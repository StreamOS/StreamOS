#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { chmodSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadEnvFile } = require("./check-deployment.cjs");
const { consumeValueFlag } = require("./lib/cli-args.cjs");

const DEFAULT_DATABASE_URL_ENV = "SUPABASE_DB_URL";
const DEFAULT_FORMAT = "text";
const DEFAULT_PG_CONNECT_TIMEOUT_SECONDS = "10";
const DEFAULT_PSQL_COMMAND = "psql";
const DEFAULT_PSQL_TIMEOUT_MS = 15_000;

const EXPECTED_UPLOAD_METADATA_STATUSES = [
  "available",
  "invalid",
  "unavailable",
];
const EXPECTED_PREVIEW_CAPABILITY_STATUSES = [
  "previewable",
  "unsupported",
  "missing_storage",
  "invalid_storage",
];
const EXPECTED_COLUMNS = {
  preview_capability_status: true,
  upload_metadata_status: true,
};
const EXPECTED_CONSTRAINTS = {
  brand_assets_preview_capability_status_check:
    EXPECTED_PREVIEW_CAPABILITY_STATUSES,
  brand_assets_upload_metadata_status_check: EXPECTED_UPLOAD_METADATA_STATUSES,
};
const EXPECTED_FUNCTIONS = {
  resolve_brand_asset_preview_capability_status: {
    immutable: true,
    identityArguments: "text, text, uuid, jsonb",
  },
  resolve_brand_asset_upload_metadata_status: {
    immutable: true,
    identityArguments: "jsonb",
  },
};
const EXPECTED_INDEX_PATTERNS = {
  brand_assets_user_preview_capability_status_updated_idx:
    "(user_id, preview_capability_status, updated_at desc)",
  brand_assets_user_upload_metadata_status_updated_idx:
    "(user_id, upload_metadata_status, updated_at desc)",
};
const EXPECTED_COLUMN_GENERATION_PATTERNS = {
  preview_capability_status:
    "public.resolve_brand_asset_preview_capability_status(storage_bucket, storage_path, user_id, metadata)",
  upload_metadata_status:
    "public.resolve_brand_asset_upload_metadata_status(metadata)",
};

function parseArgs(argv) {
  const options = {
    databaseUrlEnv: DEFAULT_DATABASE_URL_ENV,
    envFile: undefined,
    format: DEFAULT_FORMAT,
    help: false,
    printSql: false,
    psqlCommand: DEFAULT_PSQL_COMMAND,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--print-sql") {
      options.printSql = true;
      continue;
    }

    if (arg === "--") {
      continue;
    }

    const databaseUrlEnvMatch = consumeValueFlag(
      argv,
      index,
      "database-url-env",
    );

    if (databaseUrlEnvMatch.matched) {
      options.databaseUrlEnv = databaseUrlEnvMatch.value.trim();
      index = databaseUrlEnvMatch.nextIndex;
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

    const psqlCommandMatch = consumeValueFlag(argv, index, "psql-command");

    if (psqlCommandMatch.matched) {
      options.psqlCommand = psqlCommandMatch.value.trim();
      index = psqlCommandMatch.nextIndex;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.databaseUrlEnv) {
    throw new Error("--database-url-env must not be empty.");
  }

  if (!["json", "text"].includes(options.format)) {
    throw new Error("--format must be one of: text, json.");
  }

  if (!options.psqlCommand) {
    throw new Error("--psql-command must not be empty.");
  }

  return options;
}

function printHelp() {
  console.log(`StreamOS branding hosted migration evidence

Usage:
  pnpm db:branding-evidence -- --env-file .env --format text
  pnpm db:branding-evidence -- --database-url-env SUPABASE_DB_URL --format json
  pnpm db:branding-evidence -- --print-sql

Options:
  --env-file PATH              Load key=value pairs before reading process.env.
  --database-url-env NAME      Environment variable that stores the hosted DB URL.
                               Default: ${DEFAULT_DATABASE_URL_ENV}
  --psql-command COMMAND       psql executable to use. Default: ${DEFAULT_PSQL_COMMAND}
  --format text|json           Output format. Default: ${DEFAULT_FORMAT}
  --print-sql                  Print the read-only SQL evidence query and exit.
`);
}

function buildEvidenceSql() {
  return `
with derived_columns as (
  select
    column_name,
    generation_expression,
    is_generated
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'brand_assets'
    and column_name in (
      'upload_metadata_status',
      'preview_capability_status'
    )
),
derived_constraints as (
  select
    conname,
    pg_get_constraintdef(oid, true) as definition
  from pg_constraint
  where conrelid = 'public.brand_assets'::regclass
    and conname in (
      'brand_assets_upload_metadata_status_check',
      'brand_assets_preview_capability_status_check'
    )
),
derived_functions as (
  select
    p.proname,
    pg_get_function_identity_arguments(p.oid) as identity_arguments,
    p.provolatile = 'i' as immutable
  from pg_proc p
  inner join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'resolve_brand_asset_upload_metadata_status',
      'resolve_brand_asset_preview_capability_status'
    )
),
derived_indexes as (
  select
    indexname,
    indexdef
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'brand_assets'
    and indexname in (
      'brand_assets_user_upload_metadata_status_updated_idx',
      'brand_assets_user_preview_capability_status_updated_idx'
    )
)
select json_build_object(
  'columns',
  coalesce(
    (
      select json_object_agg(
        column_name,
        json_build_object(
          'generationExpression', generation_expression,
          'isGenerated', is_generated
        )
      )
      from derived_columns
    ),
    '{}'::json
  ),
  'constraints',
  coalesce(
    (
      select json_object_agg(
        conname,
        json_build_object('definition', definition)
      )
      from derived_constraints
    ),
    '{}'::json
  ),
  'functions',
  coalesce(
    (
      select json_object_agg(
        proname,
        json_build_object(
          'identityArguments', identity_arguments,
          'immutable', immutable
        )
      )
      from derived_functions
    ),
    '{}'::json
  ),
  'indexes',
  coalesce(
    (
      select json_object_agg(
        indexname,
        json_build_object('definition', indexdef)
      )
      from derived_indexes
    ),
    '{}'::json
  )
)::text;
`.trim();
}

function requireDatabaseUrl(env, name) {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for hosted branding evidence.`);
  }

  return value;
}

function escapePgpassValue(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:");
}

function buildPsqlConnectionConfig(databaseUrl) {
  let parsedUrl;

  try {
    parsedUrl = new URL(databaseUrl);
  } catch (error) {
    throw new Error(
      "The configured hosted DB URL is not a valid PostgreSQL connection string.",
      { cause: error },
    );
  }

  if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
    throw new Error(
      "The configured hosted DB URL must use the postgres:// or postgresql:// scheme.",
    );
  }

  const databaseName = decodeURIComponent(
    parsedUrl.pathname.replace(/^\/+/, ""),
  ).trim();

  if (!parsedUrl.hostname || !databaseName) {
    throw new Error(
      "The configured hosted DB URL must include a host and database name.",
    );
  }

  const connectionEnv = {
    PGAPPNAME: "streamos-branding-hosted-evidence",
    PGCONNECT_TIMEOUT:
      parsedUrl.searchParams.get("connect_timeout")?.trim() || undefined,
    PGDATABASE: databaseName,
    PGHOST: parsedUrl.hostname,
    PGPORT: parsedUrl.port || "5432",
    PGSSLMODE: parsedUrl.searchParams.get("sslmode")?.trim() || undefined,
    PGTARGETSESSIONATTRS:
      parsedUrl.searchParams.get("target_session_attrs")?.trim() || undefined,
    PGUSER: parsedUrl.username
      ? decodeURIComponent(parsedUrl.username).trim()
      : undefined,
  };
  const password = parsedUrl.password
    ? decodeURIComponent(parsedUrl.password)
    : "";
  let cleanup = () => {};

  if (password) {
    const pgpassDir = mkdtempSync(
      path.join(os.tmpdir(), "streamos-branding-pgpass-"),
    );
    const pgpassFile = path.join(pgpassDir, "pgpass.conf");
    const pgpassEntry = [
      escapePgpassValue(connectionEnv.PGHOST),
      escapePgpassValue(connectionEnv.PGPORT),
      escapePgpassValue(connectionEnv.PGDATABASE),
      escapePgpassValue(connectionEnv.PGUSER || "*"),
      escapePgpassValue(password),
    ].join(":");

    writeFileSync(pgpassFile, `${pgpassEntry}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });

    try {
      chmodSync(pgpassFile, 0o600);
    } catch {
      // Windows may ignore chmod on temp files; PGPASSFILE still works.
    }

    connectionEnv.PGPASSFILE = pgpassFile;
    cleanup = () => {
      rmSync(pgpassDir, {
        force: true,
        recursive: true,
      });
    };
  }

  return {
    cleanup,
    env: Object.fromEntries(
      Object.entries(connectionEnv).filter(([, value]) => Boolean(value)),
    ),
  };
}

function buildPsqlChildEnv(connectionEnv, baseEnv = process.env) {
  const sanitizedBaseEnv = Object.fromEntries(
    Object.entries(baseEnv).filter(([key]) => !/^PG/i.test(key)),
  );

  return {
    ...sanitizedBaseEnv,
    ...connectionEnv,
    PAGER: "cat",
    PGCONNECT_TIMEOUT:
      connectionEnv.PGCONNECT_TIMEOUT || DEFAULT_PG_CONNECT_TIMEOUT_SECONDS,
  };
}

function executeEvidenceQuery({
  databaseUrl,
  databaseUrlEnv = DEFAULT_DATABASE_URL_ENV,
  psqlCommand,
  spawnSyncFn = spawnSync,
}) {
  const sql = buildEvidenceSql();
  const connection = buildPsqlConnectionConfig(databaseUrl);

  try {
    const result = spawnSyncFn(
      psqlCommand,
      ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
      {
        encoding: "utf8",
        env: buildPsqlChildEnv(connection.env),
        input: sql,
        timeout: DEFAULT_PSQL_TIMEOUT_MS,
      },
    );

    if (result.error) {
      throw new Error(
        `Unable to execute ${psqlCommand}. Install psql or use --print-sql for a manual hosted audit.`,
        {
          cause: result.error,
        },
      );
    }

    if (result.status !== 0) {
      throw new Error(
        `The read-only branding evidence query could not be executed. Check ${databaseUrlEnv} reachability and hosted DB access without printing secret values.`,
      );
    }

    return parseEvidencePayload(result.stdout);
  } finally {
    connection.cleanup();
  }
}

function parseEvidencePayload(stdout) {
  const lines = String(stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const payload = lines.at(-1);

  if (!payload) {
    throw new Error("The branding evidence query returned no payload.");
  }

  try {
    return JSON.parse(payload);
  } catch (error) {
    throw new Error("The branding evidence query returned malformed JSON.", {
      cause: error,
    });
  }
}

function normalizeWhitespace(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function extractQuotedStatuses(definition) {
  return Array.from(String(definition ?? "").matchAll(/'([^']+)'/g))
    .map((match) => match[1])
    .filter(Boolean)
    .sort();
}

function buildCheck(status, findings = []) {
  return {
    findings,
    status,
  };
}

function collectMigrationFindings(payload) {
  const findings = [];
  const columns = payload?.columns ?? {};
  const constraints = payload?.constraints ?? {};
  const functions = payload?.functions ?? {};

  for (const columnName of Object.keys(EXPECTED_COLUMNS)) {
    const column = columns[columnName];

    if (!column) {
      findings.push(
        `Missing generated column: public.brand_assets.${columnName}.`,
      );
      continue;
    }

    if (column.isGenerated !== "ALWAYS") {
      findings.push(
        `Column public.brand_assets.${columnName} is not reported as a stored generated column.`,
      );
    }

    const normalizedExpression = normalizeWhitespace(
      column.generationExpression ?? "",
    );
    const expectedGenerationPattern = normalizeWhitespace(
      EXPECTED_COLUMN_GENERATION_PATTERNS[columnName],
    );

    if (!normalizedExpression) {
      findings.push(
        `Column public.brand_assets.${columnName} is missing a generation expression.`,
      );
      continue;
    }

    if (!normalizedExpression.includes(expectedGenerationPattern)) {
      findings.push(
        `Column public.brand_assets.${columnName} does not use the expected derived-status resolver.`,
      );
    }
  }

  for (const [constraintName, expectedStatuses] of Object.entries(
    EXPECTED_CONSTRAINTS,
  )) {
    const constraint = constraints[constraintName];

    if (!constraint?.definition) {
      findings.push(`Missing check constraint: ${constraintName}.`);
      continue;
    }

    const actualStatuses = extractQuotedStatuses(constraint.definition);
    const normalizedExpected = [...expectedStatuses].sort();

    if (JSON.stringify(actualStatuses) !== JSON.stringify(normalizedExpected)) {
      findings.push(
        `Constraint ${constraintName} does not match the expected status contract.`,
      );
    }
  }

  for (const [functionName, expected] of Object.entries(EXPECTED_FUNCTIONS)) {
    const fn = functions[functionName];

    if (!fn) {
      findings.push(`Missing derived-status function: public.${functionName}.`);
      continue;
    }

    if (fn.identityArguments !== expected.identityArguments) {
      findings.push(
        `Function public.${functionName} uses unexpected arguments: ${fn.identityArguments || "<missing>"}.`,
      );
    }

    if (Boolean(fn.immutable) !== expected.immutable) {
      findings.push(
        `Function public.${functionName} must remain immutable for generated-column determinism.`,
      );
    }
  }

  return findings;
}

function collectIndexFindings(payload) {
  const findings = [];
  const indexes = payload?.indexes ?? {};

  for (const [indexName, expectedPattern] of Object.entries(
    EXPECTED_INDEX_PATTERNS,
  )) {
    const index = indexes[indexName];

    if (!index?.definition) {
      findings.push(`Missing tenant-scoped index: ${indexName}.`);
      continue;
    }

    const actualDefinition = normalizeWhitespace(index.definition);
    const normalizedPattern = normalizeWhitespace(expectedPattern);

    if (!actualDefinition.includes(normalizedPattern)) {
      findings.push(
        `Index ${indexName} does not match the expected tenant-scoped key order.`,
      );
    }
  }

  return findings;
}

function validateEvidencePayload(payload, { databaseUrlEnv }) {
  const migrationFindings = collectMigrationFindings(payload);
  const indexFindings = collectIndexFindings(payload);
  const readyForP514 =
    migrationFindings.length === 0 && indexFindings.length === 0;
  const feedGateBlockedBy = [
    ...(readyForP514 ? [] : ["requires_hosted_migration_evidence"]),
    "requires_server_filter_activation",
  ];

  return {
    databaseUrlEnv,
    feedGate: {
      blockedBy: feedGateBlockedBy,
      metadataServerQueryable: false,
      previewServerQueryable: false,
    },
    readyForP514,
    releaseMatrix: {
      hostedIndexReady: buildCheck(
        indexFindings.length === 0 ? "passed" : "blocked",
        indexFindings,
      ),
      hostedMigrationReady: buildCheck(
        migrationFindings.length === 0 ? "passed" : "blocked",
        migrationFindings,
      ),
      repoReady: buildCheck("passed", [
        "Repo contract contains the generated-column and index slices, but hosted evidence is still required per environment.",
      ]),
      serverFilterReady: buildCheck("blocked", [
        "preview and metadata remain client_window until the dedicated server-filter activation slice lands.",
      ]),
    },
  };
}

function renderTextReport(report) {
  const lines = [
    "StreamOS branding hosted migration evidence",
    "",
    `- database URL env: ${report.databaseUrlEnv}`,
    `- repoReady: ${report.releaseMatrix.repoReady.status}`,
    `- hostedMigrationReady: ${report.releaseMatrix.hostedMigrationReady.status}`,
    `- hostedIndexReady: ${report.releaseMatrix.hostedIndexReady.status}`,
    `- serverFilterReady: ${report.releaseMatrix.serverFilterReady.status}`,
    `- readyForP514: ${report.readyForP514 ? "yes" : "no"}`,
    `- feed gate blockers: ${report.feedGate.blockedBy.join(", ")}`,
    `- previewServerQueryable: ${report.feedGate.previewServerQueryable}`,
    `- metadataServerQueryable: ${report.feedGate.metadataServerQueryable}`,
  ];

  for (const [name, check] of Object.entries(report.releaseMatrix)) {
    if (check.findings.length === 0) {
      continue;
    }

    lines.push("");
    lines.push(`${name} findings:`);

    for (const finding of check.findings) {
      lines.push(`- ${finding}`);
    }
  }

  return lines.join("\n");
}

function formatReport(report, format) {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }

  return renderTextReport(report);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (options.printSql) {
    console.log(buildEvidenceSql());
    return;
  }

  const env = {
    ...loadEnvFile(options.envFile),
    ...process.env,
  };
  const databaseUrl = requireDatabaseUrl(env, options.databaseUrlEnv);
  const payload = executeEvidenceQuery({
    databaseUrl,
    databaseUrlEnv: options.databaseUrlEnv,
    psqlCommand: options.psqlCommand,
  });
  const report = validateEvidencePayload(payload, {
    databaseUrlEnv: options.databaseUrlEnv,
  });

  console.log(formatReport(report, options.format));

  if (!report.readyForP514) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Branding hosted evidence failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_DATABASE_URL_ENV,
  DEFAULT_FORMAT,
  DEFAULT_PG_CONNECT_TIMEOUT_SECONDS,
  DEFAULT_PSQL_COMMAND,
  DEFAULT_PSQL_TIMEOUT_MS,
  EXPECTED_CONSTRAINTS,
  EXPECTED_COLUMN_GENERATION_PATTERNS,
  EXPECTED_FUNCTIONS,
  EXPECTED_INDEX_PATTERNS,
  buildEvidenceSql,
  buildPsqlChildEnv,
  buildPsqlConnectionConfig,
  escapePgpassValue,
  executeEvidenceQuery,
  formatReport,
  parseArgs,
  parseEvidencePayload,
  printHelp,
  renderTextReport,
  requireDatabaseUrl,
  validateEvidencePayload,
};
