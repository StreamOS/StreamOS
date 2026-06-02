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
|   `-- transcription-worker/    # Async media transcription worker
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
only for server-side workers and must never be exposed in browser code.

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
`transcription-worker`, and `content-job-retry-worker`. Compose reads
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

Set the generated value as `APP_ENCRYPTION_KEY` in `apps/web/.env.local`.

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

## Queue Backend

The API gateway uses BullMQ for automation jobs. For Upstash Redis, configure
the Redis protocol endpoint, not the REST endpoint:

```bash
REDIS_URL=rediss://default:password@host.upstash.io:6379
CLIP_GENERATION_QUEUE_NAME=streamos-clip-generation
TRANSCRIPTION_QUEUE_NAME=streamos-transcription
CLIP_WORKER_CONCURRENCY=1
STREAM_EVENT_WEBHOOK_SECRET=
CONTENT_JOB_RETRY_ATTEMPTS=3
CONTENT_JOB_RETRY_BACKOFF_MS=30000
```

`POST /api/webhooks/streams/ended` queues the first automation job,
`transcription.trigger`. Re-sending the same `stream_id` reuses the same BullMQ
`jobId`, so one ended stream cannot enqueue duplicate transcription work.

## Supabase Auth

The dashboard uses Supabase SSR auth. The initial schema migration must be applied before using login/signup.

For hosted Supabase email confirmations, set the Confirm signup email template link to:

```html
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

Also allow your local and deployed app URLs in Supabase Auth URL configuration.

## Twitch OAuth

The first platform connector lives in the web app route handlers:

- `/api/platforms/twitch/connect`
- `/api/platforms/twitch/callback`

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
```

Register the same redirect URI in the Twitch Developer Console. If Next.js falls back to another local port, update both `TWITCH_REDIRECT_URI` and the Twitch app settings to match.

## Next Implementation Steps

1. Add OAuth flows for Twitch, YouTube, TikTok, and Kick behind `services/api-gateway`.
2. Add BullMQ workers for transcription processing and clip generation.
3. Move durable AI workflows into `services/automation-service` and keep browser-visible API keys out of client components.
