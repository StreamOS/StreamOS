const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const migrationsDir = path.join(
  repoRoot,
  "packages",
  "database",
  "supabase",
  "migrations",
);

const tenantTables = [
  "creators",
  "channels",
  "platform_connections",
  "metrics_snapshots",
  "streams",
  "content_jobs",
  "vod_assets",
  "stream_transcripts",
  "stream_highlights",
  "clips",
  "clip_exports",
  "brand_assets",
  "monetization_events",
  "monetization_summaries",
];

const compositeTenantConstraints = [
  "channels_creator_user_fkey",
  "platform_connections_creator_user_fkey",
  "platform_connections_channel_user_fkey",
  "metrics_snapshots_creator_user_fkey",
  "metrics_snapshots_channel_user_fkey",
  "streams_channel_user_fkey",
  "content_jobs_stream_user_fkey",
  "vod_assets_stream_user_fkey",
  "stream_transcripts_stream_user_fkey",
  "stream_transcripts_vod_asset_user_fkey",
  "stream_highlights_stream_user_fkey",
  "stream_highlights_transcript_user_fkey",
  "clips_stream_user_fkey",
  "clips_highlight_user_fkey",
  "clip_exports_clip_user_fkey",
  "brand_assets_creator_user_fkey",
  "brand_assets_channel_user_fkey",
  "monetization_events_creator_user_fkey",
  "monetization_events_channel_user_fkey",
  "monetization_events_stream_user_fkey",
  "monetization_summaries_creator_user_fkey",
  "monetization_summaries_channel_user_fkey",
];

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort();

const rawSql = migrationFiles
  .map((fileName) =>
    fs.readFileSync(path.join(migrationsDir, fileName), "utf8"),
  )
  .join("\n");

const normalizedSql = rawSql
  .replace(/--.*$/gm, "")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

const failures = [];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const hasPattern = (pattern) => pattern.test(normalizedSql);

const assertPattern = (condition, message) => {
  if (!condition) {
    failures.push(message);
  }
};

const policyRegex = (table, action, bodyPattern) =>
  new RegExp(
    `create\\s+policy\\s+"[^"]+"\\s+on\\s+public\\.${escapeRegex(
      table,
    )}\\s+for\\s+${action}\\s+to\\s+authenticated\\s+${bodyPattern}`,
    "i",
  );

for (const table of tenantTables) {
  const tableName = escapeRegex(table);

  assertPattern(
    hasPattern(
      new RegExp(
        `(create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${tableName}|alter\\s+table\\s+public\\.${tableName})`,
        "i",
      ),
    ),
    `${table}: table is not represented in migrations`,
  );

  assertPattern(
    hasPattern(
      new RegExp(
        `(create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${tableName}\\s*\\([^;]*\\buser_id\\s+uuid\\s+not\\s+null|alter\\s+table\\s+public\\.${tableName}\\s+alter\\s+column\\s+user_id\\s+set\\s+not\\s+null)`,
        "i",
      ),
    ),
    `${table}: user_id must be required`,
  );

  assertPattern(
    hasPattern(
      new RegExp(
        `alter\\s+table\\s+public\\.${tableName}\\s+enable\\s+row\\s+level\\s+security`,
        "i",
      ),
    ),
    `${table}: RLS is not enabled`,
  );

  assertPattern(
    hasPattern(
      policyRegex(
        table,
        "select",
        "using\\s*\\(\\s*user_id\\s*=\\s*\\(\\s*select\\s+auth\\.uid\\s*\\(\\s*\\)\\s*\\)\\s*\\)",
      ),
    ),
    `${table}: SELECT policy must be scoped to user_id = auth.uid()`,
  );

  assertPattern(
    hasPattern(
      policyRegex(
        table,
        "insert",
        "with\\s+check\\s*\\(\\s*user_id\\s*=\\s*\\(\\s*select\\s+auth\\.uid\\s*\\(\\s*\\)\\s*\\)\\s*\\)",
      ),
    ),
    `${table}: INSERT policy must check user_id = auth.uid()`,
  );

  assertPattern(
    hasPattern(
      policyRegex(
        table,
        "update",
        "using\\s*\\(\\s*user_id\\s*=\\s*\\(\\s*select\\s+auth\\.uid\\s*\\(\\s*\\)\\s*\\)\\s*\\)\\s*with\\s+check\\s*\\(\\s*user_id\\s*=\\s*\\(\\s*select\\s+auth\\.uid\\s*\\(\\s*\\)\\s*\\)\\s*\\)",
      ),
    ),
    `${table}: UPDATE policy must include USING and WITH CHECK user scope`,
  );

  assertPattern(
    hasPattern(
      policyRegex(
        table,
        "delete",
        "using\\s*\\(\\s*user_id\\s*=\\s*\\(\\s*select\\s+auth\\.uid\\s*\\(\\s*\\)\\s*\\)\\s*\\)",
      ),
    ),
    `${table}: DELETE policy must be scoped to user_id = auth.uid()`,
  );

  assertPattern(
    hasPattern(
      new RegExp(
        `grant\\s+select\\s*,\\s*insert\\s*,\\s*update\\s*,\\s*delete\\s+on\\s+public\\.${tableName}\\s+to\\s+authenticated`,
        "i",
      ),
    ),
    `${table}: authenticated role is missing explicit CRUD grants`,
  );

  assertPattern(
    hasPattern(
      new RegExp(
        `grant\\s+all\\s+on\\s+public\\.${tableName}\\s+to\\s+service_role`,
        "i",
      ),
    ),
    `${table}: service_role is missing explicit grants`,
  );

  assertPattern(
    hasPattern(
      new RegExp(
        `create\\s+(?:unique\\s+)?index\\s+(?:if\\s+not\\s+exists\\s+)?[a-z0-9_]+\\s+on\\s+public\\.${tableName}\\s*\\(\\s*user_id\\b`,
        "i",
      ),
    ),
    `${table}: missing query index with user_id as leading column`,
  );
}

for (const constraint of compositeTenantConstraints) {
  assertPattern(
    hasPattern(
      new RegExp(
        `constraint\\s+${escapeRegex(
          constraint,
        )}\\s+foreign\\s+key\\s*\\([^)]*user_id[^)]*\\)`,
        "i",
      ),
    ),
    `${constraint}: composite tenant foreign key must include user_id`,
  );
}

if (failures.length > 0) {
  console.error("Database security validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Database security validation passed for ${tenantTables.length} tenant tables and ${compositeTenantConstraints.length} composite tenant foreign keys.`,
);
