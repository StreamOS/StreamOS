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

The validator checks required `user_id` columns, RLS enablement, authenticated Data API grants, leading `user_id` query indexes, composite tenant foreign keys, and explicit authenticated ownership predicates (`auth.uid() is not null and user_id = auth.uid()`). `platform_connections` is intentionally stricter: authenticated users get column-level `SELECT` grants that exclude token ciphertext columns, while writes remain service-role only. `content_jobs` accepts client inserts only for request metadata (`user_id`, `stream_id`, `queue_job_id`, `job_type`, `payload`); status, result, error, and retry fields are mutated only by service-role server actions, services, or workers. `metrics_snapshots`, `vod_assets`, `stream_transcripts`, `clip_exports`, `monetization_events`, and `monetization_summaries` are read-only for authenticated users; ingestion, processing, export, metric, and summary writes must run through service-role workers or server services.
Monetization provider event idempotency must also stay tenant-scoped: unique indexes for provider event IDs include leading `user_id`, so two creators can ingest the same provider event identifier without cross-tenant collisions.

`content_jobs.queue_job_id` links BullMQ job attempts to durable database state.
Workers and server actions mutate runtime status, result, error, and retry
fields with the Supabase service role, while user-facing access remains scoped
through `user_id` RLS policies.

Provider OAuth tokens must be encrypted or vaulted before being written to `platform_connections.access_token_ciphertext` or `platform_connections.refresh_token_ciphertext`. Do not store plaintext provider tokens. Token columns are not granted to `authenticated`; any route that reads or writes them must run server-side with `SUPABASE_SERVICE_ROLE_KEY` after verifying the Supabase user session.

## Type Usage

Use the generated-style `Database` type with Supabase clients:

```ts
import type { Database } from "@streamos/database";
```
