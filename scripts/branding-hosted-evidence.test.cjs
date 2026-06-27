const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");

const {
  buildPsqlChildEnv,
  buildEvidenceSql,
  buildPsqlConnectionConfig,
  DEFAULT_PG_CONNECT_TIMEOUT_SECONDS,
  DEFAULT_PSQL_TIMEOUT_MS,
  executeEvidenceQuery,
  escapePgpassValue,
  inspectRepoServerFilterActivationEvidence,
  matchesExpectedGenerationExpression,
  matchesIdentityArguments,
  parseArgs,
  parseEvidencePayload,
  requireDatabaseUrl,
  resolveDatabaseTargetEnvironment,
  validateEvidencePayload,
} = require("./branding-hosted-evidence.cjs");

const validPayload = {
  columns: {
    preview_capability_status: {
      generationExpression:
        "public.resolve_brand_asset_preview_capability_status(storage_bucket, storage_path, user_id, metadata)",
      isGenerated: "ALWAYS",
    },
    upload_metadata_status: {
      generationExpression:
        "public.resolve_brand_asset_upload_metadata_status(metadata)",
      isGenerated: "ALWAYS",
    },
  },
  constraints: {
    brand_assets_preview_capability_status_check: {
      definition:
        "CHECK (preview_capability_status IN ('previewable', 'unsupported', 'missing_storage', 'invalid_storage'))",
    },
    brand_assets_upload_metadata_status_check: {
      definition:
        "CHECK (upload_metadata_status IN ('available', 'invalid', 'unavailable'))",
    },
  },
  functions: {
    resolve_brand_asset_preview_capability_status: {
      identityArguments: "text, text, uuid, jsonb",
      immutable: true,
    },
    resolve_brand_asset_upload_metadata_status: {
      identityArguments: "jsonb",
      immutable: true,
    },
  },
  indexes: {
    brand_assets_user_preview_capability_status_updated_idx: {
      definition:
        "CREATE INDEX brand_assets_user_preview_capability_status_updated_idx ON public.brand_assets USING btree (user_id, preview_capability_status, updated_at DESC)",
    },
    brand_assets_user_upload_metadata_status_updated_idx: {
      definition:
        "CREATE INDEX brand_assets_user_upload_metadata_status_updated_idx ON public.brand_assets USING btree (user_id, upload_metadata_status, updated_at DESC)",
    },
  },
};

const hostedCatalogPayload = {
  columns: {
    preview_capability_status: {
      generationExpression:
        "resolve_brand_asset_preview_capability_status(storage_bucket, storage_path, user_id, metadata)",
      isGenerated: "ALWAYS",
    },
    upload_metadata_status: {
      generationExpression:
        "resolve_brand_asset_upload_metadata_status(metadata)",
      isGenerated: "ALWAYS",
    },
  },
  constraints: validPayload.constraints,
  functions: {
    resolve_brand_asset_preview_capability_status: {
      identityArguments:
        "asset_storage_bucket text, asset_storage_path text, asset_user_id uuid, asset_metadata jsonb",
      immutable: true,
    },
    resolve_brand_asset_upload_metadata_status: {
      identityArguments: "asset_metadata jsonb",
      immutable: true,
    },
  },
  indexes: validPayload.indexes,
};

const productionBinding = {
  environment: "production",
  findings: [],
  source: "explicit",
};
const readyRepoActivationEvidence = {
  findings: [],
  metadataServerQueryable: true,
  previewServerQueryable: true,
};

test("branding evidence parser accepts split env-file syntax, target binding, and print-sql flag", () => {
  const options = parseArgs([
    "--env-file",
    ".env",
    "--database-url-env",
    "SUPABASE_DB_URL_STAGING",
    "--target-environment",
    "production",
    "--format",
    "json",
    "--print-sql",
  ]);

  assert.equal(options.envFile, ".env");
  assert.equal(options.databaseUrlEnv, "SUPABASE_DB_URL_STAGING");
  assert.equal(options.targetEnvironment, "production");
  assert.equal(options.format, "json");
  assert.equal(options.printSql, true);
});

test("branding evidence parser rejects unsupported formats", () => {
  assert.throws(() => parseArgs(["--format", "markdown"]), /text, json/);
});

test("branding evidence SQL stays read-only and targets branding derived-status metadata", () => {
  const sql = buildEvidenceSql();

  assert.match(sql, /information_schema\.columns/);
  assert.match(sql, /pg_constraint/);
  assert.match(sql, /pg_proc/);
  assert.match(sql, /pg_indexes/);
  assert.match(sql, /upload_metadata_status/);
  assert.match(sql, /preview_capability_status/);
});

test("branding evidence normalizers accept unqualified expressions and named identity arguments", () => {
  assert.equal(
    matchesExpectedGenerationExpression(
      "public.resolve_brand_asset_upload_metadata_status(metadata)",
      "public.resolve_brand_asset_upload_metadata_status(metadata)",
    ),
    true,
  );
  assert.equal(
    matchesExpectedGenerationExpression(
      "resolve_brand_asset_upload_metadata_status(metadata)",
      "public.resolve_brand_asset_upload_metadata_status(metadata)",
    ),
    true,
  );
  assert.equal(
    matchesExpectedGenerationExpression(
      "other_schema.resolve_brand_asset_upload_metadata_status(metadata)",
      "public.resolve_brand_asset_upload_metadata_status(metadata)",
    ),
    false,
  );
  assert.equal(matchesIdentityArguments("asset_metadata jsonb", "jsonb"), true);
  assert.equal(
    matchesIdentityArguments(
      "asset_storage_bucket text, asset_storage_path text, asset_user_id uuid, asset_metadata jsonb",
      "text, text, uuid, jsonb",
    ),
    true,
  );
  assert.equal(
    matchesIdentityArguments(
      "asset_storage_bucket text, asset_storage_path text, asset_metadata jsonb, asset_user_id uuid",
      "text, text, uuid, jsonb",
    ),
    false,
  );
});

test("branding evidence psql connection config uses pgpass instead of a URI argv", () => {
  assert.equal(escapePgpassValue("s3cr:et\\value"), "s3cr\\:et\\\\value");

  const connection = buildPsqlConnectionConfig(
    "postgres://streamos-user:s3cr:et@example.test:6543/postgres?sslmode=require",
  );

  try {
    assert.equal(connection.env.PGHOST, "example.test");
    assert.equal(connection.env.PGPORT, "6543");
    assert.equal(connection.env.PGDATABASE, "postgres");
    assert.equal(connection.env.PGUSER, "streamos-user");
    assert.equal(connection.env.PGSSLMODE, "require");
    assert.equal(typeof connection.env.PGPASSFILE, "string");
    assert.equal(existsSync(connection.env.PGPASSFILE), true);
    assert.match(
      readFileSync(connection.env.PGPASSFILE, "utf8"),
      /^example\.test:6543:postgres:streamos-user:s3cr\\:et\r?\n$/,
    );
  } finally {
    connection.cleanup();
  }
});

test("branding evidence payload parser keeps the final JSON row", () => {
  const payload = parseEvidencePayload(
    "\nNOTICE: ignored by parser\n" + JSON.stringify(validPayload) + "\n",
  );

  assert.deepEqual(payload, validPayload);
});

test("branding evidence resolves explicit and inferred hosted target environments fail-closed", () => {
  assert.deepEqual(
    resolveDatabaseTargetEnvironment({
      databaseUrl: "postgres://user:secret@db-production.example.test/postgres",
      databaseUrlEnv: "SUPABASE_DB_URL",
      targetEnvironment: "production",
    }),
    productionBinding,
  );

  assert.equal(
    resolveDatabaseTargetEnvironment({
      databaseUrl: "postgres://user:secret@db-staging.example.test/postgres",
      databaseUrlEnv: "SUPABASE_DB_URL_STAGING",
    }).environment,
    "staging",
  );

  assert.equal(
    resolveDatabaseTargetEnvironment({
      databaseUrl: "postgres://user:secret@db.example.test/postgres",
      databaseUrlEnv: "SUPABASE_DB_URL",
    }).environment,
    "unknown",
  );
});

test("branding evidence repo activation evidence matches the active P5.14 web read path", () => {
  const evidence = inspectRepoServerFilterActivationEvidence();

  assert.deepEqual(evidence, readyRepoActivationEvidence);
});

test("branding evidence report passes hosted migration, binding, and server-filter readiness when the contract matches", () => {
  const report = validateEvidencePayload(validPayload, {
    databaseTargetEnvironment: productionBinding,
    databaseUrlEnv: "SUPABASE_DB_URL",
    repoActivationEvidence: readyRepoActivationEvidence,
  });

  assert.equal(report.databaseUrlEnv, "SUPABASE_DB_URL");
  assert.deepEqual(report.databaseTargetEnvironment, productionBinding);
  assert.equal(report.readyForP514, true);
  assert.equal(report.releaseMatrix.repoReady.status, "passed");
  assert.equal(report.releaseMatrix.hostedBindingReady.status, "passed");
  assert.equal(report.releaseMatrix.hostedMigrationReady.status, "passed");
  assert.equal(report.releaseMatrix.hostedIndexReady.status, "passed");
  assert.equal(report.releaseMatrix.serverFilterReady.status, "passed");
  assert.equal(report.feedGate.previewServerQueryable, true);
  assert.equal(report.feedGate.metadataServerQueryable, true);
  assert.deepEqual(report.feedGate.blockedBy, []);
});

test("branding evidence report accepts hosted catalog formatting after rollout", () => {
  const report = validateEvidencePayload(hostedCatalogPayload, {
    databaseTargetEnvironment: productionBinding,
    databaseUrlEnv: "SUPABASE_DB_URL",
    repoActivationEvidence: readyRepoActivationEvidence,
  });

  assert.equal(report.readyForP514, true);
  assert.equal(report.releaseMatrix.hostedBindingReady.status, "passed");
  assert.equal(report.releaseMatrix.hostedMigrationReady.status, "passed");
  assert.equal(report.releaseMatrix.hostedIndexReady.status, "passed");
  assert.equal(report.releaseMatrix.serverFilterReady.status, "passed");
});

test("branding evidence report rejects generated-column resolvers from the wrong schema", () => {
  const report = validateEvidencePayload(
    {
      ...validPayload,
      columns: {
        ...validPayload.columns,
        upload_metadata_status: {
          generationExpression:
            "other_schema.resolve_brand_asset_upload_metadata_status(metadata)",
          isGenerated: "ALWAYS",
        },
      },
    },
    {
      databaseTargetEnvironment: productionBinding,
      databaseUrlEnv: "SUPABASE_DB_URL",
      repoActivationEvidence: readyRepoActivationEvidence,
    },
  );

  assert.equal(report.releaseMatrix.hostedMigrationReady.status, "blocked");
  assert.match(
    report.releaseMatrix.hostedMigrationReady.findings.join("\n"),
    /expected derived-status resolver/,
  );
});

test("branding evidence execution keeps DB credentials out of argv and cleans up pgpass files", () => {
  const invocations = [];
  const databaseUrl =
    "postgres://streamos-user:s3cr:et@example.test:5432/postgres?sslmode=require";
  let observedPgpassFile;
  let observedPgpassContents;
  const originalPgHost = process.env.PGHOST;
  const originalPgPassword = process.env.PGPASSWORD;
  const originalPgPassFile = process.env.PGPASSFILE;

  process.env.PGHOST = "inherited-host.example";
  process.env.PGPASSWORD = "inherited-password";
  process.env.PGPASSFILE = "C:\\sensitive\\pgpass";

  try {
    const payload = executeEvidenceQuery({
      databaseUrl,
      databaseUrlEnv: "SUPABASE_DB_URL_STAGING",
      psqlCommand: "psql",
      spawnSyncFn(command, args, options) {
        observedPgpassFile = options.env.PGPASSFILE;
        observedPgpassContents = readFileSync(observedPgpassFile, "utf8");
        invocations.push({
          args,
          command,
          env: options.env,
          timeout: options.timeout,
        });

        return {
          error: null,
          status: 0,
          stdout: JSON.stringify(validPayload),
        };
      },
    });

    assert.deepEqual(payload, validPayload);
    assert.equal(invocations.length, 1);
    assert.equal(invocations[0].command, "psql");
    assert.deepEqual(invocations[0].args, [
      "-X",
      "-q",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
    ]);
    assert.equal(invocations[0].args.includes(databaseUrl), false);
    assert.equal(invocations[0].env.PGHOST, "example.test");
    assert.equal(invocations[0].env.PGPORT, "5432");
    assert.equal(invocations[0].env.PGDATABASE, "postgres");
    assert.equal(invocations[0].env.PGUSER, "streamos-user");
    assert.equal(invocations[0].env.PGSSLMODE, "require");
    assert.equal(invocations[0].env.PGPASSWORD, undefined);
    assert.equal(invocations[0].env.PGCONNECT_TIMEOUT, "10");
    assert.equal(invocations[0].timeout, DEFAULT_PSQL_TIMEOUT_MS);
    assert.match(
      observedPgpassContents,
      /^example\.test:5432:postgres:streamos-user:s3cr\\:et\r?\n$/,
    );
    assert.equal(existsSync(observedPgpassFile), false);
  } finally {
    if (originalPgHost === undefined) {
      delete process.env.PGHOST;
    } else {
      process.env.PGHOST = originalPgHost;
    }

    if (originalPgPassword === undefined) {
      delete process.env.PGPASSWORD;
    } else {
      process.env.PGPASSWORD = originalPgPassword;
    }

    if (originalPgPassFile === undefined) {
      delete process.env.PGPASSFILE;
    } else {
      process.env.PGPASSFILE = originalPgPassFile;
    }
  }
});

test("branding evidence child env strips inherited PG variables before layering connection config", () => {
  const env = buildPsqlChildEnv(
    {
      PGDATABASE: "postgres",
      PGHOST: "example.test",
      PGUSER: "streamos-user",
    },
    {
      PATH: "C:\\Windows\\System32",
      PGHOST: "override-me",
      PGPASSWORD: "secret",
      PGPASSFILE: "C:\\sensitive\\pgpass",
    },
  );

  assert.equal(env.PATH, "C:\\Windows\\System32");
  assert.equal(env.PGHOST, "example.test");
  assert.equal(env.PGUSER, "streamos-user");
  assert.equal(env.PGPASSWORD, undefined);
  assert.equal(env.PGPASSFILE, undefined);
  assert.equal(env.PGCONNECT_TIMEOUT, DEFAULT_PG_CONNECT_TIMEOUT_SECONDS);
});

test("branding evidence report blocks P5.14 when generated columns or indexes drift", () => {
  const report = validateEvidencePayload(
    {
      ...validPayload,
      columns: {
        preview_capability_status: {
          generationExpression: "",
          isGenerated: "NEVER",
        },
      },
      indexes: {},
    },
    {
      databaseTargetEnvironment: productionBinding,
      databaseUrlEnv: "SUPABASE_DB_URL",
      repoActivationEvidence: readyRepoActivationEvidence,
    },
  );

  assert.equal(report.readyForP514, false);
  assert.equal(report.releaseMatrix.hostedMigrationReady.status, "blocked");
  assert.equal(report.releaseMatrix.hostedIndexReady.status, "blocked");
  assert.equal(report.releaseMatrix.serverFilterReady.status, "blocked");
  assert.deepEqual(report.feedGate.blockedBy, [
    "requires_hosted_migration_evidence",
    "requires_server_filter_activation",
  ]);
  assert.match(
    report.releaseMatrix.hostedMigrationReady.findings.join("\n"),
    /upload_metadata_status|preview_capability_status/,
  );
  assert.match(
    report.releaseMatrix.hostedIndexReady.findings.join("\n"),
    /brand_assets_user_/,
  );
});

test("branding evidence report blocks when hosted DB target binding is unknown", () => {
  const report = validateEvidencePayload(validPayload, {
    databaseTargetEnvironment: {
      environment: "unknown",
      findings: ["Hosted target environment is not explicit."],
      source: "unknown",
    },
    databaseUrlEnv: "SUPABASE_DB_URL",
    repoActivationEvidence: readyRepoActivationEvidence,
  });

  assert.equal(report.readyForP514, false);
  assert.equal(report.releaseMatrix.hostedBindingReady.status, "blocked");
  assert.equal(report.releaseMatrix.serverFilterReady.status, "passed");
  assert.equal(report.feedGate.previewServerQueryable, false);
  assert.equal(report.feedGate.metadataServerQueryable, false);
  assert.deepEqual(report.feedGate.blockedBy, [
    "requires_hosted_environment_binding",
  ]);
});

test("branding evidence report blocks server filter readiness when repo activation evidence drifts", () => {
  const report = validateEvidencePayload(validPayload, {
    databaseTargetEnvironment: productionBinding,
    databaseUrlEnv: "SUPABASE_DB_URL",
    repoActivationEvidence: {
      findings: [
        "Repo evidence drift: active read path no longer matches P5.14.",
      ],
      metadataServerQueryable: false,
      previewServerQueryable: false,
    },
  });

  assert.equal(report.readyForP514, false);
  assert.equal(report.releaseMatrix.hostedBindingReady.status, "passed");
  assert.equal(report.releaseMatrix.hostedMigrationReady.status, "passed");
  assert.equal(report.releaseMatrix.hostedIndexReady.status, "passed");
  assert.equal(report.releaseMatrix.serverFilterReady.status, "blocked");
  assert.deepEqual(report.feedGate.blockedBy, [
    "requires_server_filter_activation",
  ]);
});

test("branding evidence requires the configured DB URL env name without printing values", () => {
  assert.equal(
    requireDatabaseUrl(
      {
        SUPABASE_DB_URL: "postgres://user:secret@example.test/postgres",
      },
      "SUPABASE_DB_URL",
    ),
    "postgres://user:secret@example.test/postgres",
  );

  assert.throws(
    () => requireDatabaseUrl({}, "SUPABASE_DB_URL"),
    /SUPABASE_DB_URL is required/,
  );
});

test("branding evidence report blocks drifted generation expressions even when they are non-empty", () => {
  const report = validateEvidencePayload(
    {
      ...validPayload,
      columns: {
        ...validPayload.columns,
        upload_metadata_status: {
          generationExpression:
            "public.resolve_some_other_upload_status(metadata)",
          isGenerated: "ALWAYS",
        },
      },
    },
    {
      databaseTargetEnvironment: productionBinding,
      databaseUrlEnv: "SUPABASE_DB_URL",
      repoActivationEvidence: readyRepoActivationEvidence,
    },
  );

  assert.equal(report.releaseMatrix.hostedMigrationReady.status, "blocked");
  assert.match(
    report.releaseMatrix.hostedMigrationReady.findings.join("\n"),
    /expected derived-status resolver/,
  );
});

test("branding evidence execution reports the configured env name on connection failure", () => {
  assert.throws(
    () =>
      executeEvidenceQuery({
        databaseUrl: "postgres://streamos-user:secret@example.test/postgres",
        databaseUrlEnv: "SUPABASE_DB_URL_STAGING",
        psqlCommand: "psql",
        spawnSyncFn() {
          return {
            error: null,
            status: 1,
            stdout: "",
          };
        },
      }),
    /SUPABASE_DB_URL_STAGING/,
  );
});
