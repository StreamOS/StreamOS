# @streamos/database

Shared Supabase schema contracts for StreamOS.

## Migration Order

Apply migrations from:

```text
packages/database/supabase/migrations
```

Initial schema:

- `creators`
- `channels`
- `streams`
- `platform_connections`
- `metrics_snapshots`
- `content_jobs`
- `vod_assets`
- `stream_transcripts`
- `stream_highlights`
- `clips`
- `clip_exports`
- `brand_assets`
- `monetization_events`
- `monetization_summaries`

## Security Model

Every tenant-owned table has a required `user_id` column, row-level security enabled, and policies scoped to `user_id = auth.uid()`. Child tables keep their domain foreign keys, but composite tenant foreign keys prevent cross-user `creator_id` or `channel_id` links.

Validate this contract after changing migrations:

```bash
pnpm db:validate-security
```

The validator checks required `user_id` columns, RLS enablement, authenticated CRUD policies, explicit Data API grants, leading `user_id` query indexes, and composite tenant foreign keys.

`content_jobs.queue_job_id` links BullMQ job attempts to durable database state.
Workers write it with the Supabase service role, while user-facing access remains
scoped through `user_id` RLS policies.

Provider OAuth tokens must be encrypted or vaulted before being written to `platform_connections.access_token_ciphertext` or `platform_connections.refresh_token_ciphertext`. Do not store plaintext provider tokens.

## Type Usage

Use the generated-style `Database` type with Supabase clients:

```ts
import type { Database } from "@streamos/database";
```
