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

Later contract layers add server-managed publication audit tables for the
approved repurposing flow:

- `content_publications`
- `content_publication_events`

## Security Model

Every tenant-owned table has a required `user_id` column, row-level security enabled, and policies scoped to `user_id = auth.uid()`. Child tables keep their domain foreign keys, but composite tenant foreign keys prevent cross-user `creator_id` or `channel_id` links.

Validate this contract after changing migrations:

```bash
pnpm db:validate-security
```

The validator checks required `user_id` columns, RLS enablement, authenticated Data API grants, leading `user_id` query indexes, composite tenant foreign keys, and explicit authenticated ownership predicates (`auth.uid() is not null and user_id = auth.uid()`). `platform_connections` is intentionally stricter: authenticated users get column-level `SELECT` grants that exclude token ciphertext columns, while writes remain service-role only. `content_jobs` accepts client inserts only for request metadata (`user_id`, `stream_id`, `queue_job_id`, `job_type`, `payload`); status, result, error, and retry fields are mutated only by service-role server actions, services, or workers. `content_publications` and `content_publication_events` are server-managed publication contract tables: authenticated users can read their rows, but the gateway writes validated snapshots and append-only events through the service role only. `metrics_snapshots`, `vod_assets`, `stream_transcripts`, `clip_exports`, `monetization_events`, and `monetization_summaries` are read-only for authenticated users; ingestion, processing, export, metric, and summary writes must run through service-role workers or server services.
Monetization provider event idempotency must also stay tenant-scoped: unique indexes for provider event IDs include leading `user_id`, so two creators can ingest the same provider event identifier without cross-tenant collisions.

Brand asset uploads use the private Supabase Storage bucket `brand-assets`.
The bucket is not public, and authenticated storage policies allow users to
select, insert, and delete only objects whose first path segment equals
`auth.uid()`. Update/upsert is intentionally not granted until a later
replace-flow is specified. The planned storage path shape is
`user_id/asset_type/asset_id/sanitized_filename`. The branding MVP must store
only `storage_bucket` and `storage_path` when upload runtime is added later;
durable `public_url` persistence is intentionally avoided. SVG remains blocked
for the upload MVP because uploaded SVG can carry script-capable content, and
previews should use short-lived server-generated signed URLs from the private
bucket instead of public bucket URLs. The `brand_assets` table also carries the
server-managed derived status columns `upload_metadata_status` and
`preview_capability_status`. They are database-derived columns, so app writes
do not set them directly; PostgreSQL computes them from `metadata`,
`storage_bucket`, `storage_path`, and `user_id`. They exist to make future
server-queryable Branding Explorer filters possible without trusting
client-window heuristics. Historical `brand_assets` rows are backfilled
implicitly when the generated columns are added: there is no separate live
storage probe, no signed-URL generation, and no durable runtime-only status
such as `signing_failed`. A follow-up index migration prepares
`upload_metadata_status` and `preview_capability_status` for future
tenant-scoped query paths. This package does not enable those filters by
itself: activate server-side preview/metadata filtering only after the
migration rollout and the dedicated server-filter slice are complete.

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
