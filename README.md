# StreamOS Monorepo

StreamOS is an AI-assisted operating layer for streamers. The platform combines discoverability, monetization insights, content automation, branding tools, multi-platform management, and analytics in one modular product surface.

## Workspace

This repository uses `pnpm` workspaces and Turborepo for parallel builds, task orchestration, and build caching.

```text
StreamOS/
|-- apps/
|   `-- web/                     # Next.js App Router dashboard
|-- services/
|   |-- api-gateway/             # Backend-for-frontend aggregation service
|   `-- automation-service/      # FastAPI service for clip and AI pipelines
|-- workers/
|   |-- transcription-worker/    # BullMQ transcription consumer
|   |-- clip-worker/             # BullMQ clip generation consumer
|   |-- content-job-retry-worker/ # Failed content_jobs retry orchestrator
|   `-- stream-job-worker/       # Stream webhook event materializer
|-- packages/
|   |-- config/                  # Shared TypeScript configuration
|   |-- database/                # Supabase contracts and migration helpers
|   |-- types/                   # Shared domain contracts
|   `-- ui/                      # Reusable React UI components
|-- pnpm-workspace.yaml
`-- turbo.json
```

The production frontend lives in `apps/web`. The previous root Vite/Electron prototype has been removed so new frontend work has one clear target.

## Getting Started

Install dependencies:

```bash
pnpm install
```

Python automation service checks require Python 3.12. The root validation
uses `.venv` when available, or `STREAMOS_PYTHON` when you need to point at a
specific Python 3.12 executable.

Create local environment values:

```bash
cp .env.example apps/web/.env.local
cp .env.compose.example .env
```

Fill the root `.env` with Supabase values from Supabase Dashboard -> Project
Settings -> API before starting Compose. `SUPABASE_SERVICE_ROLE_KEY` is required
for server-side workers and server route handlers that read or write encrypted
platform tokens; it must never be exposed in browser code.

Start only the dashboard:

```bash
pnpm --filter @streamos/web dev
```

The dashboard runs at `http://localhost:3000/dashboard`.

Start the local queue infrastructure, API gateway, automation service, and
workers:

```bash
pnpm infra:up
pnpm infra:ps
```

This starts Redis at `localhost:6379`, the API gateway at
`http://localhost:4000`, the automation service at `http://localhost:8000`,
`transcription-worker`, `clip-worker`, and `content-job-retry-worker`. Compose reads
`SUPABASE_URL`, optional `SUPABASE_DOCKER_URL`, and
`SUPABASE_SERVICE_ROLE_KEY` from the selected env file for the workers.
Use `SUPABASE_DOCKER_URL=http://host.docker.internal:54321` when the worker in
Docker should call a Supabase CLI stack running on your host. The gateway and
worker use the internal Compose Redis URL `redis://redis:6379/0`; Node services
that run on your host should use `redis://localhost:6379/0`.

Check the gateway health endpoint:

```bash
curl http://localhost:4000/health
```

Watch infrastructure logs:

```bash
pnpm infra:logs
```

Stop local infrastructure:

```bash
pnpm infra:down
```

The safe E2E path for jobs uses `.env.test` by default and blocks hosted
Supabase URLs unless `--allow-hosted` is passed:

```bash
cp .env.test.example .env.test
pnpm e2e:jobs
```

To prove the full transcription path through Redis, API Gateway,
`transcription-worker`, and `automation-service`, run:

```bash
pnpm e2e:transcription
pnpm e2e:transcription -- --expect=failed
```

The retry worker scans failed `content_jobs`, claims eligible rows by
`retry_count`, and requeues supported jobs with BullMQ `attempts=3` plus
exponential backoff. `clip_scoring` jobs go back to
`streamos-clip-generation`; `transcription` jobs go back to
`streamos-transcription`.

Manual retries from `/dashboard/jobs` keep the row in `failed`, clear
`next_retry_at`, and raise `max_retries` when the previous retry budget is
exhausted. The retry worker then claims the row, sets it back to `pending`, and
the dashboard receives the status change through Supabase Realtime.

Generate a local encryption key before storing platform OAuth tokens:

```bash
node -e "console.log('base64:' + require('crypto').randomBytes(32).toString('base64'))"
```

Set the generated value as `APP_ENCRYPTION_KEY` in the server runtime that owns
the provider flow. Today that means `apps/web/.env.local` for Twitch and the
API gateway environment for YouTube.

## AI Provider Secrets

OpenAI keys are server-only. Do not define `NEXT_PUBLIC_OPENAI_KEY` or
`NEXT_PUBLIC_OPENAI_API_KEY` in any web environment. The Next.js app fails
fast if either value is present.

Configure AI provider credentials only for `services/automation-service`:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
OPENAI_TITLE_MODEL=gpt-4o-mini
```

Use `OPENAI_MODEL=gpt-4o` for complex clip analysis and repurposing tasks.
Use `OPENAI_TITLE_MODEL=gpt-4o-mini` for low-latency title generation.

Browser code should call StreamOS API routes or backend services. It must never
call OpenAI directly.

## Validation

```bash
pnpm validate
```

`pnpm validate` runs TypeScript checks, workspace tests, the FastAPI automation
service tests via `python -m pytest services/automation-service`, and the
production build.

## Deployment

The production deployment topology is documented in
[`docs/deployment.md`](docs/deployment.md):

- `apps/web` deploys to Vercel as the Next.js App Router dashboard.
- `services/api-gateway` deploys to Railway with `Dockerfile.api-gateway`.
- `services/automation-service` deploys to Railway first, or Fly.io when GPU-backed Whisper becomes required.
- `workers/transcription-worker` deploys to Railway as a Node.js BullMQ worker and calls FastAPI for transcription.
- `workers/clip-worker` deploys to Railway as a Node.js BullMQ worker and calls FastAPI for clip scoring/generation.
- `workers/content-job-retry-worker` deploys to Railway as a Node.js BullMQ worker and requeues failed `content_jobs`.

### Required GitHub Secrets

Set these values in GitHub repository or environment secrets before enabling
the CI/CD workflows:

```bash
VERCEL_TOKEN=
VERCEL_ORG_ID=
VERCEL_PROJECT_ID=
RAILWAY_PROJECT_ID=
RAILWAY_TOKEN_STAGING=
RAILWAY_TOKEN_PRODUCTION=
SUPABASE_DB_URL_STAGING=postgresql://postgres.<project-ref>:<password>@<pooler-host>:5432/postgres
SUPABASE_DB_URL_PRODUCTION=postgresql://postgres.<project-ref>:<password>@<pooler-host>:5432/postgres
DISCORD_WEBHOOK_URL=
```

`DISCORD_WEBHOOK_URL` is optional; when it is not configured, production
deployment notifications are still written to the GitHub Actions job summary.
Use GitHub Environments named `staging` and `production` for environment-scoped
secrets and enable required reviewers on `production` to enforce manual approval
before production deploy and migration jobs run.

## Queue Backend

The API gateway uses BullMQ for automation jobs. For Upstash Redis, configure
the Redis protocol endpoint, not the REST endpoint:

```bash
REDIS_URL=rediss://default:password@host.upstash.io:6379
CLIP_GENERATION_QUEUE_NAME=streamos-clip-generation
TRANSCRIPTION_QUEUE_NAME=streamos-transcription
CLIP_WORKER_CONCURRENCY=1
API_GATEWAY_SECRET=
API_GATEWAY_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
API_GATEWAY_RATE_LIMIT_MAX=120
API_GATEWAY_RATE_LIMIT_WINDOW_MS=60000
STREAM_EVENT_WEBHOOK_SECRET=
CONTENT_JOB_RETRY_ATTEMPTS=3
CONTENT_JOB_RETRY_BACKOFF_MS=30000
```

`POST /api/webhooks/streams/ended` queues the first automation job,
`transcription.trigger`. Re-sending the same `stream_id` reuses the same BullMQ
`jobId`, so one ended stream cannot enqueue duplicate transcription work.
In production, `services/api-gateway` fails startup unless both
`API_GATEWAY_SECRET` and `STREAM_EVENT_WEBHOOK_SECRET` are set. App-facing
gateway routes accept `Authorization: Bearer $API_GATEWAY_SECRET`; external
webhooks use `X-StreamOS-Webhook-Secret`.

## Supabase Auth

The dashboard uses Supabase SSR auth. The initial schema migration must be applied before using login/signup.

Signup and password-reset redirects use the SSR callback route:

```text
/auth/callback
```

For hosted Supabase email confirmations with a custom token-hash template, set
the Confirm signup email template link to:

```html
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

`/auth/confirm` is intentionally limited to signup email confirmation tokens.
Also allow your local and deployed `/auth/callback` and `/auth/confirm` URLs in
Supabase Auth URL configuration. The manual local Inbucket test plan is in
`docs/auth-email-confirmation-test-plan.md`.

## Twitch OAuth

The first platform connector intentionally lives in the web app server
boundary:

- `/api/platforms/twitch/connect`
- `/api/platforms/twitch/callback`

This is a documented exception to the long-term gateway direction. Twitch uses
the Supabase SSR session from HTTP-only Next.js cookies to verify the user, then
uses a server-only service-role client for encrypted `platform_connections`
token reads and writes. Do not move this flow to `services/api-gateway` until
the gateway has a signed user-session hand-off from `apps/web`, a tenant-safe
Supabase client strategy, and integration coverage for callback success and
failure paths.

Connected Twitch accounts store encrypted access and refresh tokens in Supabase.
The dashboard exposes a server-side token refresh action so expired access tokens
can be renewed without exposing provider credentials to the browser.
The first analytics sync is available from `/dashboard/analytics`; it reads
Twitch channel, live stream, and follower count data, updates the linked channel,
and writes a `metrics_snapshots` row.

Configure these server-only values in `apps/web/.env.local`:

```bash
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_REDIRECT_URI=http://localhost:3000/api/platforms/twitch/callback
TWITCH_SCOPES=user:read:email
APP_ENCRYPTION_KEY=base64:replace-with-32-byte-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

Register the same redirect URI in the Twitch Developer Console. If Next.js falls back to another local port, update both `TWITCH_REDIRECT_URI` and the Twitch app settings to match.

## Gateway OAuth: YouTube, TikTok, Kick

YouTube, TikTok, and Kick OAuth flows are owned by `services/api-gateway`:

- `GET /api/auth/youtube/connect?handoff=<signed-token>`
- `GET /api/auth/youtube/callback`
- `GET /api/auth/tiktok/connect?handoff=<signed-token>`
- `GET /api/auth/tiktok/callback`
- `GET /api/auth/kick/connect?handoff=<signed-token>`
- `GET /api/auth/kick/callback`

The `handoff` query value is a short-lived HMAC token signed with
`API_GATEWAY_SECRET`. It carries only `user_id`, `creator_id`, optional
`return_to`, and `exp`; provider tokens never pass through the browser. The
Next.js dashboard creates these handoff URLs through `/api/gateway-connect`.
The gateway stores a one-time `state` plus PKCE `code_verifier`, redirects to
the provider, exchanges the callback code with PKCE, fetches the authenticated
channel/profile, encrypts access and refresh tokens with `APP_ENCRYPTION_KEY`,
and upserts `channels` plus `platform_connections`.

YouTube additionally records the initial WebSub subscription in
`youtube_websub_subscriptions` when subscription setup succeeds. Token refresh
for Twitch, YouTube, and TikTok is handled by the server-side metrics sync path;
Kick refresh still fails closed when a refresh is required but unavailable.

Configure these server-only values in the API gateway environment:

```bash
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REDIRECT_URI=http://localhost:4000/api/auth/youtube/callback
YOUTUBE_SCOPES=https://www.googleapis.com/auth/youtube.readonly
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=http://localhost:4000/api/auth/tiktok/callback
TIKTOK_SCOPES=user.info.basic
KICK_CLIENT_ID=
KICK_CLIENT_SECRET=
KICK_REDIRECT_URI=http://localhost:4000/api/auth/kick/callback
KICK_SCOPES=user:read channel:read events:subscribe channel:follow channel:subscription
APP_ENCRYPTION_KEY=base64:replace-with-32-byte-key
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
API_GATEWAY_SECRET=
```

Register the same redirect URIs in the provider developer consoles. Run the
gateway OAuth tests with:

```bash
pnpm --filter @streamos/api-gateway test
```

## Current Implementation Status And Next Focus

Implemented now:

- Twitch OAuth remains the explicit Next.js server-route exception.
- YouTube, TikTok, and Kick OAuth are gateway-owned with signed handoff, PKCE,
  one-time state, encrypted token persistence, and tests.
- Supabase migrations exist through
  `packages/database/supabase/migrations/0027_media_content_jobs.sql`, covering
  streams, clips, content jobs, brand assets, monetization, media assets,
  WebSub tracking, RLS, grants, and server-managed mutation boundaries.
- BullMQ producers and workers exist for transcription, clip generation, and
  failed `content_jobs` retry orchestration.
- Manual retry from `/dashboard/jobs` and automatic retry via
  `workers/content-job-retry-worker` share `content_jobs.max_retries` and
  `next_retry_at` as the database source of truth.

Next focus:

1. Harden deployed OAuth/webhook smoke tests against real provider sandbox or
   staging apps.
2. Expand durable automation outputs for repurposing, title generation, render
   status, and export status.
3. Continue product UI work in Branding, Monetization, and Analytics using the
   existing Supabase contracts.
