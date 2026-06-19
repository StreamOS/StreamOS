# StreamOS Architecture

## Architecture Goal

StreamOS is a modular creator operations platform. The frontend owns the dashboard experience, while backend services isolate platform integrations, AI processing, analytics ingestion, and secure credential handling.

## Active Application Shape

Production frontend work targets `apps/web`. New routes, UI modules, Supabase clients, and product flows should live under `apps/web/src`.

```text
apps/web/src/
|-- app/
|   |-- dashboard/
|   |-- api/
|   `-- layout.tsx
|-- components/
|   |-- ui/
|   |-- layout/
|   `-- modules/
|-- data/
|-- lib/
|   |-- supabase/
|   |-- integrations/
|   `-- utils/
|-- store/
`-- types/
```

## Module Boundaries

- Dashboard routes compose modules and handle product-level navigation.
- UI components stay presentational and reusable.
- Feature modules own streamer workflows such as analytics, clips, monetization, SEO, and branding.
- Integration clients live under `src/lib/integrations` and never expose provider secrets to browser code.
- Provider analytics syncs should run in server actions, route handlers, backend
  services, or workers, never in client components.
- Database and API contracts live in shared packages where possible, especially `packages/types` and `packages/database`.
- Publish and export command surfaces should stay server-owned; browser code may request review/export/publish actions, but it must not call provider write APIs directly.

## Backend Responsibilities

- OAuth and token refresh for YouTube, TikTok, and Kick through
  `services/api-gateway` with signed hand-off tokens, PKCE state, encrypted
  token persistence, and provider profile upserts.
- OAuth handoff initiation for the dashboard stays in `apps/web`, but provider
  secrets, PKCE state, callback handling, encrypted token persistence, token
  refresh, disconnect, and provider webhooks are gateway-owned in
  `services/api-gateway`.
- Webhook validation and event ingestion.
- Analytics normalization into Supabase PostgreSQL.
- BullMQ orchestration for transcription triggers, clip generation, stream jobs,
  and durable content-job retries.
- AI jobs for transcription and clip scoring in `services/automation-service`.
  Title generation and broader repurposing remain future server-side contracts
  and are not active media-worker endpoints today.
- Rate limiting, retry handling, and audit logging for external API calls.
- `GET /api/observability` is a protected server-to-server snapshot route for
  operator use. In production it must be backed by Redis so rate limiting,
  replay protection, and observability counters share cluster-wide state; the
  memory backend is only for local and test runs.
- `POST /api/content-publications` is the server-side publication contract for
  approved repurposing jobs. It freezes a publish snapshot, records
  `content_publications`, and appends `content_publication_events`; it does not
  publish directly or invoke a worker yet.

## Data Model Status

Supabase migrations live in `packages/database/supabase/migrations/` and are
the source of truth for database state. The baseline starts with
`0001_initial_streamos_schema.sql`; later migrations add stream automation,
media pipeline, branding, monetization, webhook tracking, auth profiles, and
retry semantics.

Current tenant-owned and service-managed entities include:

- `creators`
- `user_profiles`
- `channels`
- `platform_connections`
- `metrics_snapshots`
- `streams`
- `content_jobs`
- `content_publications`
- `content_publication_events`
- `vod_assets`
- `stream_transcripts`
- `stream_highlights`
- `clips`
- `clip_exports`
- `brand_assets`
- `monetization_events`
- `monetization_summaries`
- `youtube_websub_subscriptions`

`content_jobs` already carries durable retry state through `retry_count`,
`max_retries`, `error_message`, and `next_retry_at`. Failed jobs can be requeued by
`workers/content-job-retry-worker` into the transcription or clip-generation
queues.

Use `user_id` on every Supabase table plus row-level security policies scoped to `user_id = auth.uid()` for tenant isolation. Service-role keys must remain server-only.

## API Strategy

Use REST route handlers or the API gateway for simple commands and webhooks:

- `services/api-gateway`: `/api/auth/twitch/connect`
- `services/api-gateway`: `/api/auth/twitch/callback`
- `services/api-gateway`: `/api/auth/youtube/connect`
- `services/api-gateway`: `/api/auth/youtube/callback`
- `services/api-gateway`: `/api/auth/tiktok/connect`
- `services/api-gateway`: `/api/auth/tiktok/callback`
- `services/api-gateway`: `/api/auth/kick/connect`
- `services/api-gateway`: `/api/auth/kick/callback`
- `services/api-gateway`: `/api/clips/generate`
- `services/api-gateway`: `/api/metrics/sync`
- `services/api-gateway`: `/api/content-jobs/retry`
- `services/api-gateway`: `/api/platforms/:provider/disconnect`
- `services/api-gateway`: `/api/webhooks/streams/ended`
- `services/api-gateway`: `/api/callbacks/automation`
- `apps/web`: `/api/gateway-connect`
- `apps/web`: `/api/metrics/sync` authenticated proxy to the gateway
- `apps/web`: dashboard server actions that call gateway-owned mutations

Use realtime channels or server-sent events for live viewer counts, stream status, ingestion progress, and notifications.

## Queue Ownership

- `services/api-gateway` produces normalized provider and app-facing media
  events into `streamos-media`.
- `workers/stream-job-worker` is the only canonical `streamos-media` consumer.
  It materializes `streams`, writes durable `content_jobs`, and enqueues
  canonical `transcription.trigger` jobs when the media event carries enough
  transcription input, including provider-enriched events that resolved a
  missing `vodAssetUrl` on the server side.
- `workers/repurposing-worker` is the canonical `streamos-repurposing`
  consumer. It receives durable `repurposing.plan` jobs, calls
  `services/automation-service` at `POST /repurposing/plan`, and persists a
  manual-review-only plan result in `content_jobs.result`.
- `workers/transcription-worker` consumes only `streamos-transcription`, calls
  `services/automation-service`, and persists `vod_assets`,
  `stream_transcripts`, clip follow-up jobs, and transcription job status.
- `video.published` can now materialize a durable `repurposing` plan
  `content_jobs` row and enqueue `repurposing.plan` when provider enrichment
  resolves `asset_available` and the connected platform metadata explicitly
  enables repurposing. The durable job remains review-oriented only: it does
  not auto-publish, export, render, or crosspost. Approved repurposing jobs
  can later produce a sanitized, clipboard-only export bundle for manual use.
  Provider enrichment is
  classified as `asset_available`, `enrichment_required`,
  `enrichment_retryable`, `enrichment_failed`, or `unsupported`; only
  `asset_available` plus explicit opt-in may feed the plan row and downstream
  repurposing queue.
- `POST /api/content-publications` validates a request against an approved
  repurposing result, a matching platform connection, and the server-side
  publish snapshot. The gateway writes the publication snapshot and audit
  events to Supabase, but execution/publishing remains a later contract.

## Twitch OAuth Placement Decision

Twitch OAuth is gateway-owned. The web app issues a short-lived signed handoff
after validating the Supabase SSR session, then the API Gateway owns PKCE,
provider callback validation, encrypted token persistence, token refresh,
disconnect, and metrics writes. `apps/web` must not require
`SUPABASE_SERVICE_ROLE_KEY`, `APP_ENCRYPTION_KEY`, provider client secrets,
provider webhook secrets, Redis, OpenAI, or Railway private URLs in Vercel.

This keeps Twitch tied to the authenticated browser session while avoiding
browser-visible token grants. The migration depends on these gateway contracts:

- A signed, short-lived hand-off from `apps/web` that identifies the Supabase
  user without forwarding provider tokens through the browser.
- A gateway Supabase client strategy that preserves tenant isolation and avoids
  plaintext OAuth token storage.
- Integration tests for connect callback success, invalid state, missing user,
  token exchange failure, and encrypted token persistence.
- Updated Twitch Developer Console redirect URI pointing at the gateway callback.

YouTube, TikTok, and Kick use the same gateway-owned OAuth pattern.

## Security Baseline

- Store provider secrets only in server-side environment variables.
- Encrypt platform OAuth access and refresh tokens before writing them to Supabase.
- Keep `platform_connections` token columns hidden from `authenticated` with
  column-level grants; read and write them only through server-side service-role
  code after user-session verification.
- Keep monetization event ingestion and summary materialization service-side:
  `authenticated` can read `monetization_events` and
  `monetization_summaries`, but writes require service-role workers/services.
- Keep `content_jobs` runtime state service-side: clients can create request
  metadata, but `status`, `result`, `error_message`, and retry columns are
  mutated only by service-role server actions, backend services, or workers.
- Keep media and analytics outputs server-managed: `metrics_snapshots`,
  `vod_assets`, `stream_transcripts`, and `clip_exports` are readable by users,
  while writes are performed only by service-role syncs, services, or workers.
- Refresh provider access tokens on the server and rotate persisted refresh tokens
  when providers return replacements.
- Dashboard routes are protected in `apps/web/src/app/dashboard/layout.tsx` when Supabase is configured.
- Supabase session cookies are refreshed in `apps/web/src/middleware.ts`.
- SSR auth callbacks are handled by `apps/web/src/app/auth/callback/route.ts`; signup email confirmation tokens are handled by the stricter `/auth/confirm` route.
- Validate all webhook signatures before processing events.
- Encrypt or vault refresh tokens.
- Apply Supabase row-level security to all tenant-owned tables, and require `user_id` on every table from the initial migration onward.
- Add integration tests for API endpoints before production rollout.

## Validation

Expected checks before shipping changes:

```bash
pnpm validate
```

The root validation includes `python -m pytest services/automation-service` for
the FastAPI automation service and requires Python 3.12.
