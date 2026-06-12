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

- OAuth and token refresh for YouTube, TikTok, and Kick through
  `services/api-gateway`.
- Twitch OAuth is the current explicit exception and remains in Next.js server
  route handlers plus dashboard server actions until the gateway owns a
  first-class Supabase user-session hand-off.
- Webhook validation and event ingestion.
- Analytics normalization into Supabase PostgreSQL.
- AI jobs for transcription, clip scoring, title generation, and repurposing.
- Rate limiting, retry handling, and audit logging for external API calls.

## Data Model Direction

The initial Supabase migration lives in `packages/database/supabase/migrations/0001_initial_streamos_schema.sql`.

Core entities currently covered:

- `creators`
- `channels`
- `platform_connections`
- `metrics_snapshots`

Entities planned next:

- `streams`
- `clips`
- `content_jobs`
- `brand_assets`
- `monetization_events`

Use `user_id` on every Supabase table plus row-level security policies scoped to `user_id = auth.uid()` for tenant isolation. Service-role keys must remain server-only.

## API Strategy

Use REST route handlers or the API gateway for simple commands and webhooks:

- `services/api-gateway`: `/api/auth/youtube/connect`
- `services/api-gateway`: `/api/auth/youtube/callback`
- `apps/web`: `/api/platforms/twitch/connect`
- `apps/web`: `/api/platforms/twitch/callback`
- `apps/web`: dashboard server action for Twitch token refresh
- `apps/web`: dashboard server action for first Twitch analytics sync
- `apps/web`: `/api/metrics/sync` proxy for Twitch locally and gateway delegation for YouTube, TikTok, and Kick
- `services/api-gateway`: `/api/metrics/sync` owns Non-Twitch credential refresh, provider API fetches, and snapshot upserts
- `/api/clips/analyze`
- `/api/webhooks/twitch`
- `/api/webhooks/youtube`

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

New platform OAuth flows for YouTube, TikTok, and Kick should be implemented in
`services/api-gateway` from the start so this exception does not expand.

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
