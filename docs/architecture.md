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

- `services/api-gateway`: `/api/platforms/connect`
- `services/api-gateway`: `/api/platforms/callback`
- `apps/web`: `/api/platforms/twitch/connect`
- `apps/web`: `/api/platforms/twitch/callback`
- `apps/web`: dashboard server action for Twitch token refresh
- `apps/web`: dashboard server action for first Twitch analytics sync
- `/api/metrics/sync`
- `/api/clips/analyze`
- `/api/webhooks/twitch`
- `/api/webhooks/youtube`

Use realtime channels or server-sent events for live viewer counts, stream status, ingestion progress, and notifications.

## Twitch OAuth Placement Decision

Twitch OAuth intentionally stays in `apps/web` for the current implementation.
The connect and callback route handlers run only on the Next.js server, read the
Supabase SSR session from HTTP-only cookies, persist tokens through the anon-key
RLS client, and encrypt access and refresh tokens with `APP_ENCRYPTION_KEY`
before writing `platform_connections`.

This keeps Twitch tied to the authenticated browser session without introducing
`SUPABASE_SERVICE_ROLE_KEY` into the dashboard deployment or inventing a
gateway-side session exchange. A gateway migration should happen only after the
gateway has all of the following contracts:

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
- Refresh provider access tokens on the server and rotate persisted refresh tokens
  when providers return replacements.
- Dashboard routes are protected in `apps/web/src/app/dashboard/layout.tsx` when Supabase is configured.
- Supabase session cookies are refreshed in `apps/web/src/middleware.ts`.
- Email confirmations are handled by `apps/web/src/app/auth/confirm/route.ts`; Supabase email templates must send `token_hash` links to `/auth/confirm`.
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
