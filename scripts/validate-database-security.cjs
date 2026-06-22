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
  "user_profiles",
  "creators",
  "channels",
  "platform_connections",
  "metrics_snapshots",
  "streams",
  "content_jobs",
  "content_job_export_events",
  "content_publications",
  "content_publication_events",
  "vod_assets",
  "stream_transcripts",
  "stream_highlights",
  "clips",
  "clip_exports",
  "brand_assets",
  "monetization_events",
  "monetization_summaries",
  "youtube_websub_subscriptions",
];

const platformConnectionReadableColumns = [
  "id",
  "user_id",
  "creator_id",
  "channel_id",
  "platform",
  "provider_account_id",
  "scopes",
  "expires_at",
  "connected_at",
  "status",
  "created_at",
  "updated_at",
];

const contentJobClientInsertColumns = [
  "user_id",
  "stream_id",
  "queue_job_id",
  "job_type",
  "payload",
];

const authenticatedReadOnlyTables = [
  "metrics_snapshots",
  "content_publications",
  "content_publication_events",
  "vod_assets",
  "stream_transcripts",
  "clip_exports",
  "monetization_events",
  "monetization_summaries",
  "youtube_websub_subscriptions",
];

const authenticatedAppendOnlyTables = ["content_job_export_events"];

const authenticatedReadOnlyWritePolicies = {
  clip_exports: {
    delete: "Clip exports can be deleted by their user",
    insert: "Clip exports can be inserted by their user",
    update: "Clip exports can be updated by their user",
  },
  content_publications: {
    delete: "Content publications can be deleted by their user",
    insert: "Content publications can be inserted by their user",
    update: "Content publications can be updated by their user",
  },
  content_publication_events: {
    delete: "Content publication events can be deleted by their user",
    insert: "Content publication events can be inserted by their user",
    update: "Content publication events can be updated by their user",
  },
  metrics_snapshots: {
    delete: "Metrics snapshots can be deleted by their user",
    insert: "Metrics snapshots can be inserted by their user",
    update: "Metrics snapshots can be updated by their user",
  },
  monetization_events: {
    delete: "Monetization events can be deleted by their user",
    insert: "Monetization events can be inserted by their user",
    update: "Monetization events can be updated by their user",
  },
  monetization_summaries: {
    delete: "Monetization summaries can be deleted by their user",
    insert: "Monetization summaries can be inserted by their user",
    update: "Monetization summaries can be updated by their user",
  },
  youtube_websub_subscriptions: {
    delete: "YouTube WebSub subscriptions can be deleted by their user",
    insert: "YouTube WebSub subscriptions can be inserted by their user",
    update: "YouTube WebSub subscriptions can be updated by their user",
  },
  stream_transcripts: {
    delete: "Stream transcripts can be deleted by their user",
    insert: "Stream transcripts can be inserted by their user",
    update: "Stream transcripts can be updated by their user",
  },
  vod_assets: {
    delete: "VOD assets can be deleted by their user",
    insert: "VOD assets can be inserted by their user",
    update: "VOD assets can be updated by their user",
  },
};

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
  "content_publications_content_job_user_fkey",
  "content_publications_connection_user_fkey",
  "content_publication_events_publication_user_fkey",
  "brand_assets_creator_user_fkey",
  "brand_assets_channel_user_fkey",
  "monetization_events_creator_user_fkey",
  "monetization_events_channel_user_fkey",
  "monetization_events_stream_user_fkey",
  "monetization_summaries_creator_user_fkey",
  "monetization_summaries_channel_user_fkey",
  "youtube_websub_subscriptions_connection_user_fkey",
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

const lastPatternIndex = (pattern) => {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  let lastIndex = -1;

  for (const match of normalizedSql.matchAll(globalPattern)) {
    lastIndex = match.index ?? lastIndex;
  }

  return lastIndex;
};

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

const columnGrantRegex = (table, action, columns, role) =>
  new RegExp(
    `grant\\s+${action}\\s*\\(\\s*${columns
      .map(escapeRegex)
      .join("\\s*,\\s*")}\\s*\\)\\s+on\\s+public\\.${escapeRegex(
      table,
    )}\\s+to\\s+${escapeRegex(role)}`,
    "i",
  );

const droppedPolicyRegex = (table, policyName) =>
  new RegExp(
    `drop\\s+policy\\s+if\\s+exists\\s+"${escapeRegex(
      policyName,
    )}"\\s+on\\s+public\\.${escapeRegex(table)}`,
    "i",
  );

const namedWritePolicyRegex = (table, policyName, action) =>
  new RegExp(
    `create\\s+policy\\s+"${escapeRegex(
      policyName,
    )}"\\s+on\\s+public\\.${escapeRegex(
      table,
    )}\\s+for\\s+${action}\\s+to\\s+authenticated`,
    "i",
  );

const tableCrudGrantRegex = (table) =>
  new RegExp(
    `grant\\s+select\\s*,\\s*insert\\s*,\\s*update\\s*,\\s*delete\\s+on\\s+public\\.${escapeRegex(
      table,
    )}\\s+to\\s+authenticated`,
    "i",
  );

const authenticatedUserScope =
  "auth\\.uid\\s*\\(\\s*\\)\\s+is\\s+not\\s+null\\s+and\\s+user_id\\s*=\\s*auth\\.uid\\s*\\(\\s*\\)";

const monetizationProviderEventGlobalIndexRegex = new RegExp(
  "create\\s+unique\\s+index\\s+(?:if\\s+not\\s+exists\\s+)?monetization_events_provider_event_unique_idx\\s+on\\s+public\\.monetization_events\\s*\\(\\s*provider\\s*,\\s*provider_event_id\\s*\\)\\s+where\\s+provider_event_id\\s+is\\s+not\\s+null",
  "i",
);

const monetizationProviderEventScopedIndexRegex = new RegExp(
  "create\\s+unique\\s+index\\s+(?:if\\s+not\\s+exists\\s+)?monetization_events_provider_event_unique_idx\\s+on\\s+public\\.monetization_events\\s*\\(\\s*user_id\\s*,\\s*provider\\s*,\\s*provider_event_id\\s*\\)\\s+where\\s+provider_event_id\\s+is\\s+not\\s+null",
  "i",
);

const monetizationProviderEventDropIndexRegex = new RegExp(
  "drop\\s+index\\s+if\\s+exists\\s+(?:public\\.)?monetization_events_provider_event_unique_idx",
  "i",
);

const brandAssetsPrivateBucketRegex = new RegExp(
  "insert\\s+into\\s+storage\\.buckets\\s*\\(\\s*id\\s*,\\s*name\\s*,\\s*public\\s*\\)\\s*values\\s*\\(\\s*'brand-assets'\\s*,\\s*'brand-assets'\\s*,\\s*false\\s*\\)",
  "i",
);

const brandAssetsPublicBucketRegex = new RegExp(
  "insert\\s+into\\s+storage\\.buckets\\s*\\([^)]*public[^)]*\\)\\s*values\\s*\\([^;]*'brand-assets'[^;]*true",
  "i",
);

const brandAssetsStoragePolicyRegex = (action, clause) =>
  new RegExp(
    `create\\s+policy\\s+"[^"]+"\\s+on\\s+storage\\.objects\\s+for\\s+${action}\\s+to\\s+authenticated\\s+${clause}\\s*\\(\\s*bucket_id\\s*=\\s*'brand-assets'\\s+and\\s+auth\\.uid\\s*\\(\\s*\\)\\s+is\\s+not\\s+null\\s+and\\s+\\(\\s*storage\\.foldername\\s*\\(\\s*name\\s*\\)\\s*\\)\\s*\\[\\s*1\\s*\\]\\s*=\\s*auth\\.uid\\s*\\(\\s*\\)\\s*::\\s*text\\s*\\)`,
    "i",
  );

const brandAssetsStorageAnonPolicyRegex = new RegExp(
  'create\\s+policy\\s+"[^"]+"\\s+on\\s+storage\\.objects\\s+for\\s+(?:select|insert|update|delete)\\s+to\\s+anon\\b[^;]*brand-assets',
  "i",
);

const brandAssetsStorageUpdatePolicyRegex = new RegExp(
  'create\\s+policy\\s+"[^"]+"\\s+on\\s+storage\\.objects\\s+for\\s+update\\s+to\\s+authenticated\\b[^;]*brand-assets',
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
        `using\\s*\\(\\s*${authenticatedUserScope}\\s*\\)`,
      ),
    ),
    `${table}: SELECT policy must explicitly check auth.uid() is not null and user_id = auth.uid()`,
  );

  if (table === "platform_connections") {
    assertPattern(
      hasPattern(
        new RegExp(
          `drop\\s+policy\\s+if\\s+exists\\s+"platform connections can be inserted by their user"\\s+on\\s+public\\.${tableName}`,
          "i",
        ),
      ),
      `${table}: authenticated INSERT policy must be dropped; writes are server-side only`,
    );

    assertPattern(
      hasPattern(
        new RegExp(
          `drop\\s+policy\\s+if\\s+exists\\s+"platform connections can be updated by their user"\\s+on\\s+public\\.${tableName}`,
          "i",
        ),
      ),
      `${table}: authenticated UPDATE policy must be dropped; writes are server-side only`,
    );

    assertPattern(
      hasPattern(
        new RegExp(
          `drop\\s+policy\\s+if\\s+exists\\s+"platform connections can be deleted by their user"\\s+on\\s+public\\.${tableName}`,
          "i",
        ),
      ),
      `${table}: authenticated DELETE policy must be dropped; writes are server-side only`,
    );

    assertPattern(
      hasPattern(
        new RegExp(
          `revoke\\s+select\\s*,\\s*insert\\s*,\\s*update\\s*,\\s*delete\\s+on\\s+public\\.${tableName}\\s+from\\s+authenticated`,
          "i",
        ),
      ),
      `${table}: authenticated role must have table-level CRUD revoked`,
    );

    assertPattern(
      hasPattern(
        columnGrantRegex(
          table,
          "select",
          platformConnectionReadableColumns,
          "authenticated",
        ),
      ),
      `${table}: authenticated SELECT grant must use explicit non-token columns`,
    );
  } else if (table === "content_jobs") {
    const updatePolicyName = "Content jobs can be updated by their user";
    const deletePolicyName = "Content jobs can be deleted by their user";

    assertPattern(
      hasPattern(
        policyRegex(
          table,
          "insert",
          `with\\s+check\\s*\\(\\s*${authenticatedUserScope}\\s*\\)`,
        ),
      ),
      `${table}: INSERT policy must explicitly check auth.uid() is not null and user_id = auth.uid()`,
    );

    assertPattern(
      hasPattern(droppedPolicyRegex(table, updatePolicyName)),
      `${table}: authenticated UPDATE policy must be dropped; status/result/retry writes are service-side only`,
    );

    assertPattern(
      hasPattern(droppedPolicyRegex(table, deletePolicyName)),
      `${table}: authenticated DELETE policy must be dropped; job state is service-side only`,
    );

    assertPattern(
      lastPatternIndex(droppedPolicyRegex(table, updatePolicyName)) >
        lastPatternIndex(
          namedWritePolicyRegex(table, updatePolicyName, "update"),
        ),
      `${table}: final UPDATE policy state must be dropped`,
    );

    assertPattern(
      lastPatternIndex(droppedPolicyRegex(table, deletePolicyName)) >
        lastPatternIndex(
          namedWritePolicyRegex(table, deletePolicyName, "delete"),
        ),
      `${table}: final DELETE policy state must be dropped`,
    );

    assertPattern(
      lastPatternIndex(
        new RegExp(
          `revoke\\s+insert\\s*,\\s*update\\s*,\\s*delete\\s+on\\s+public\\.${tableName}\\s+from\\s+authenticated`,
          "i",
        ),
      ) > lastPatternIndex(tableCrudGrantRegex(table)),
      `${table}: authenticated table-level write grants must be revoked after earlier CRUD grants`,
    );

    assertPattern(
      hasPattern(
        columnGrantRegex(
          table,
          "insert",
          contentJobClientInsertColumns,
          "authenticated",
        ),
      ),
      `${table}: authenticated INSERT grant must exclude status/result/retry columns`,
    );

    assertPattern(
      hasPattern(
        new RegExp(
          `grant\\s+select\\s+on\\s+public\\.${tableName}\\s+to\\s+authenticated`,
          "i",
        ),
      ),
      `${table}: authenticated role must keep explicit SELECT grant`,
    );
  } else if (authenticatedReadOnlyTables.includes(table)) {
    const writePolicies = authenticatedReadOnlyWritePolicies[table];
    const policyActions = ["insert", "update", "delete"];

    assertPattern(
      hasPattern(droppedPolicyRegex(table, writePolicies.insert)),
      `${table}: authenticated INSERT policy must be dropped; writes are service-side only`,
    );

    assertPattern(
      hasPattern(droppedPolicyRegex(table, writePolicies.update)),
      `${table}: authenticated UPDATE policy must be dropped; writes are service-side only`,
    );

    assertPattern(
      hasPattern(droppedPolicyRegex(table, writePolicies.delete)),
      `${table}: authenticated DELETE policy must be dropped; writes are service-side only`,
    );

    for (const action of policyActions) {
      const policyName = writePolicies[action];
      const lastCreateIndex = lastPatternIndex(
        namedWritePolicyRegex(table, policyName, action),
      );
      const lastDropIndex = lastPatternIndex(
        droppedPolicyRegex(table, policyName),
      );

      assertPattern(
        lastDropIndex > lastCreateIndex,
        `${table}: final ${action.toUpperCase()} policy state must be dropped`,
      );
    }

    assertPattern(
      lastPatternIndex(
        new RegExp(
          `revoke\\s+insert\\s*,\\s*update\\s*,\\s*delete\\s+on\\s+public\\.${tableName}\\s+from\\s+authenticated`,
          "i",
        ),
      ) > lastPatternIndex(tableCrudGrantRegex(table)),
      `${table}: authenticated table-level write grants must be revoked after earlier CRUD grants`,
    );

    assertPattern(
      hasPattern(
        new RegExp(
          `grant\\s+select\\s+on\\s+public\\.${tableName}\\s+to\\s+authenticated`,
          "i",
        ),
      ),
      `${table}: authenticated role must keep explicit read-only SELECT grant`,
    );
  } else if (authenticatedAppendOnlyTables.includes(table)) {
    assertPattern(
      hasPattern(
        policyRegex(
          table,
          "select",
          `using\\s*\\(\\s*${authenticatedUserScope}\\s*\\)`,
        ),
      ),
      `${table}: SELECT policy must explicitly check auth.uid() is not null and user_id = auth.uid()`,
    );

    assertPattern(
      hasPattern(
        policyRegex(
          table,
          "insert",
          `with\\s+check\\s*\\(\\s*auth\\.uid\\s*\\(\\s*\\)\\s+is\\s+not\\s+null\\s+and\\s+user_id\\s*=\\s*auth\\.uid\\s*\\(\\s*\\)\\s+and\\s+actor_id\\s*=\\s*auth\\.uid\\s*\\(\\s*\\)\\s*\\)`,
        ),
      ),
      `${table}: INSERT policy must require authenticated ownership and matching actor_id`,
    );

    assertPattern(
      hasPattern(
        droppedPolicyRegex(
          table,
          "Content job export events can be updated by their user",
        ),
      ),
      `${table}: authenticated UPDATE policy must be dropped; export events are append-only`,
    );

    assertPattern(
      hasPattern(
        droppedPolicyRegex(
          table,
          "Content job export events can be deleted by their user",
        ),
      ),
      `${table}: authenticated DELETE policy must be dropped; export events are append-only`,
    );

    assertPattern(
      hasPattern(
        new RegExp(
          `grant\\s+select\\s*,\\s*insert\\s+on\\s+public\\.${tableName}\\s+to\\s+authenticated`,
          "i",
        ),
      ),
      `${table}: authenticated role must keep explicit SELECT and INSERT grants only`,
    );
  } else {
    assertPattern(
      hasPattern(
        policyRegex(
          table,
          "insert",
          `with\\s+check\\s*\\(\\s*${authenticatedUserScope}\\s*\\)`,
        ),
      ),
      `${table}: INSERT policy must explicitly check auth.uid() is not null and user_id = auth.uid()`,
    );

    assertPattern(
      hasPattern(
        policyRegex(
          table,
          "update",
          `using\\s*\\(\\s*${authenticatedUserScope}\\s*\\)\\s*with\\s+check\\s*\\(\\s*${authenticatedUserScope}\\s*\\)`,
        ),
      ),
      `${table}: UPDATE policy must include explicit USING and WITH CHECK authenticated user scope`,
    );

    assertPattern(
      hasPattern(
        policyRegex(
          table,
          "delete",
          `using\\s*\\(\\s*${authenticatedUserScope}\\s*\\)`,
        ),
      ),
      `${table}: DELETE policy must explicitly check auth.uid() is not null and user_id = auth.uid()`,
    );

    assertPattern(
      hasPattern(tableCrudGrantRegex(table)),
      `${table}: authenticated role is missing explicit CRUD grants`,
    );
  }

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

assertPattern(
  lastPatternIndex(monetizationProviderEventDropIndexRegex) >
    lastPatternIndex(monetizationProviderEventGlobalIndexRegex),
  "monetization_events: global provider/provider_event_id unique index must be dropped",
);

assertPattern(
  lastPatternIndex(monetizationProviderEventScopedIndexRegex) >
    lastPatternIndex(monetizationProviderEventDropIndexRegex),
  "monetization_events: provider/provider_event_id unique index must be tenant-scoped by leading user_id",
);

assertPattern(
  hasPattern(brandAssetsPrivateBucketRegex),
  "brand-assets storage: private storage bucket must be created with public=false",
);

assertPattern(
  !hasPattern(brandAssetsPublicBucketRegex),
  "brand-assets storage: bucket must not be public",
);

assertPattern(
  hasPattern(brandAssetsStoragePolicyRegex("select", "using")),
  "brand-assets storage: SELECT policy must require authenticated user-owned first path segment",
);

assertPattern(
  hasPattern(brandAssetsStoragePolicyRegex("insert", "with\\s+check")),
  "brand-assets storage: INSERT policy must require authenticated user-owned first path segment",
);

assertPattern(
  hasPattern(brandAssetsStoragePolicyRegex("delete", "using")),
  "brand-assets storage: DELETE policy must require authenticated user-owned first path segment",
);

assertPattern(
  !hasPattern(brandAssetsStorageUpdatePolicyRegex),
  "brand-assets storage: UPDATE policy must stay absent until replace/upsert is explicitly supported",
);

assertPattern(
  !hasPattern(brandAssetsStorageAnonPolicyRegex),
  "brand-assets storage: anonymous storage access must not be granted",
);

if (failures.length > 0) {
  console.error("Database security validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Database security validation passed for ${tenantTables.length} tenant tables, ${compositeTenantConstraints.length} composite tenant foreign keys, and brand-assets private storage policies.`,
);
