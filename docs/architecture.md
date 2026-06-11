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

## Backend Responsibilities

- Gateway OAuth and encrypted token persistence for YouTube, TikTok, and Kick
  through `services/api-gateway`.
- Twitch OAuth is the current explicit exception and remains in Next.js server
  route handlers plus dashboard server actions until the gateway owns a
  first-class Supabase user-session hand-off.
- Webhook validation and event ingestion.
- BullMQ job production for stream-ended transcription and clip generation.
- BullMQ job consumption through `workers/transcription-worker`,
  `workers/clip-worker`, and `workers/content-job-retry-worker`.
- Analytics normalization into Supabase PostgreSQL.
- AI jobs for transcription, clip scoring, title generation, and repurposing.
- Retry handling for failed `content_jobs`, including manual dashboard retry
  requests and automatic requeueing with exponential BullMQ backoff.
- Rate limiting and audit logging for external API calls.

## Data Model Direction

Supabase migration history lives in
`packages/database/supabase/migrations/`. The active chain currently runs from
`0001_initial_streamos_schema.sql` through `0027_media_content_jobs.sql`.
Drizzle is available as a server-side query layer, but SQL migrations remain the
source of truth for schema ownership.

Core entities currently covered include:

- `user_profiles`
- `creators`
- `channels`
- `platform_connections`
- `youtube_websub_subscriptions`
- `metrics_snapshots`
- `streams`
- `content_jobs`
- `vod_assets`
- `stream_transcripts`
- `stream_highlights`
- `clips`
- `clip_exports`
- `brand_assets`
- `monetization_events`
- `monetization_summaries`

Use `user_id` on every tenant-owned Supabase table plus row-level security
policies scoped to `(select auth.uid()) = user_id` for tenant isolation.
New public tables must include explicit grants and RLS policies in the same
migration, because Data API exposure is a deliberate database contract.
Service-role keys must remain server-only.

## API Strategy

Use REST route handlers or the API gateway for simple commands and webhooks:

- `apps/web`: `/api/gateway-connect`
- `apps/web`: `/api/platforms/twitch/connect`
- `apps/web`: `/api/platforms/twitch/callback`
- `apps/web`: `/api/platforms/twitch/disconnect`
- `apps/web`: `/api/platforms/youtube/disconnect`
- `apps/web`: `/api/metrics/sync`
- `apps/web`: `/api/webhooks/youtube/websub`
- `apps/web`: dashboard server action for Twitch token refresh
- `apps/web`: dashboard server action for first Twitch analytics sync
- `apps/web`: dashboard server action for manual `content_jobs` retry requests
- `services/api-gateway`: `/api/auth/youtube/connect`
- `services/api-gateway`: `/api/auth/youtube/callback`
- `services/api-gateway`: `/api/auth/tiktok/connect`
- `services/api-gateway`: `/api/auth/tiktok/callback`
- `services/api-gateway`: `/api/auth/kick/connect`
- `services/api-gateway`: `/api/auth/kick/callback`
- `services/api-gateway`: `/api/clips/generate`
- `services/api-gateway`: `/api/webhooks/streams/ended`
- `services/api-gateway`: `/api/webhooks/twitch`
- `services/api-gateway`: `/api/webhooks/youtube`

Use realtime channels or server-sent events for live viewer counts, stream status, ingestion progress, and notifications.

## Twitch OAuth Placement Decision

Twitch OAuth intentionally stays in `apps/web` for the current implementation.
The connect and callback route handlers run only on the Next.js server, read the
Supabase SSR session from HTTP-only cookies, use a server-only service-role
client for `platform_connections` token reads and writes, and encrypt access and
refresh tokens with `APP_ENCRYPTION_KEY` before writing `platform_connections`.

This keeps Twitch tied to the authenticated browser session while avoiding
browser-visible token grants. The service-role key is allowed only in server
route handlers/actions; a gateway migration should happen only after the gateway
has all of the following contracts:

- A signed, short-lived hand-off from `apps/web` that identifies the Supabase
  user without forwarding provider tokens through the browser.
- A gateway Supabase client strategy that preserves tenant isolation and avoids
  plaintext OAuth token storage.
- Integration tests for connect callback success, invalid state, missing user,
  token exchange failure, and encrypted token persistence.
- Updated Twitch Developer Console redirect URI pointing at the gateway callback.

YouTube, TikTok, and Kick already follow the gateway pattern in
`services/api-gateway/src/oauth`. The Next.js dashboard calls
`/api/gateway-connect` to mint a short-lived signed handoff, then redirects the
browser to `/api/auth/:provider/connect` on the gateway. The gateway owns
provider PKCE, one-time state, profile lookup, encrypted token persistence, and
safe callback redirects.

Do not expand the Twitch exception to new providers.

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
