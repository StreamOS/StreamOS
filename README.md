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
|   |-- clip-worker/             # BullMQ clip generation worker
|   |-- content-job-retry-worker/ # Durable content job retry orchestration
|   |-- stream-job-worker/       # Stream event ingestion worker package
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
cp apps/web/.env.local.example apps/web/.env.local
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

If Next.js starts with a stale or corrupt build artifact error such as
`Cannot find module './7751.js'` or
`__webpack_modules__[moduleId] is not a function`, reset the local web build
output and restart the dashboard. The full recovery flow is documented in
[docs/troubleshooting.md](docs/troubleshooting.md):

```bash
pnpm clean:web
pnpm --filter @streamos/web dev
```

Start the local queue infrastructure, API gateway, automation service, and
workers:

```bash
pnpm infra:up
pnpm infra:ps
```

This starts Redis at `localhost:6379`, the API gateway at
`http://localhost:4000`, the automation service at `http://localhost:8000`,
`stream-job-worker`, `clip-worker`, `transcription-worker`, and
`content-job-retry-worker`.
Compose reads `SUPABASE_URL`, optional `SUPABASE_DOCKER_URL`, and
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
`stream-job-worker`, `transcription-worker`, and `automation-service`, run:

```bash
pnpm e2e:transcription
pnpm e2e:transcription -- --expect=failed
```

For a promotable hosted `production-gate`, the transcription E2E also needs an
explicit non-sensitive public fixture asset via
`TRANSCRIPTION_E2E_FIXTURE_ASSET_URL` or `--fixture-asset-url`. Placeholder
hosts such as `example.com`, localhost/private URLs, signed query-string URLs,
and Railway private URLs are rejected before the gate can enqueue work.

For an operator-level diagnostic that keeps the same hard invariants but still
targets your local stack, run:

```bash
pnpm rollout:check:local
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
the provider flow. In the current architecture that means the API gateway and
other trusted Railway services, never `apps/web` on Vercel.

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
Keep `OPENAI_TITLE_MODEL` reserved for a future canonical title-generation or
repurposing contract. The active production endpoints are `/clips/analyze`,
`/repurposing/plan`, and `/transcriptions/process`.

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
- `workers/stream-job-worker` deploys to Railway as the canonical `streamos-media` consumer and materializes durable stream/content-job state.
- `workers/repurposing-worker` deploys to Railway as the canonical `streamos-repurposing` consumer and calls `POST /repurposing/plan` for manual-review-only repurposing plans.
- `workers/publishing-worker` deploys to Railway as the canonical `streamos-publishing` consumer and executes approved publication and reconciliation jobs for server-side provider writes.
- `workers/publishing-scheduler-worker` deploys to Railway as a private polling worker that claims due scheduled publications and enqueues deterministic `publication.publish` jobs into `streamos-publishing`. The StreamOS scheduler remains the primary source of truth; provider-native scheduling is treated only as a secondary policy hint, not as the primary execution path.
- `workers/transcription-worker` deploys to Railway as a Node.js BullMQ worker and calls FastAPI for transcription.
- `workers/clip-worker` deploys to Railway as a Node.js BullMQ worker and calls FastAPI for clip scoring.
- `workers/content-job-retry-worker` deploys to Railway as a Node.js BullMQ worker that requeues retryable failed `content_jobs`.
- `release-gate-runner` deploys to Railway as a private operator runtime built from `Dockerfile.release-gate-runner`; it exists only to run the promotable `production-gate` from the same release-candidate snapshot and environment.

Only `pnpm rollout:check:production` counts as a promotable release gate. Run
it from `release-gate-runner` or another Railway runtime that can reach the
private Automation Service URL and contains the same gate-required
release-candidate snapshot. A green local diagnostic is useful, but it is not a
production pass.
The Railway service itself must exist in the target environment; generic shell
services are not a valid substitute, and a stopped runner cannot provide proof.
The gate now fails early with `snapshot_not_proof_capable` if the runtime is
missing `scripts/rollout-check.cjs`, the root `rollout:check:production`
script, required workspace sources, or the current runner-provenance / gate-contract
marker generated from the deployed checkout.
For the publishing and scheduling slice, run the controlled staging proof in
[`docs/deployment.md`](docs/deployment.md) before any production-oriented
approval. That staging proof verifies inventory, worker privacy, schema,
queue, observability, and creator-safe read models without real third-party
writes.

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
SUPABASE_DB_URL_STAGING=
SUPABASE_DB_URL_PRODUCTION=
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
REPURPOSING_QUEUE_NAME=streamos-repurposing
API_GATEWAY_SECRET=
API_GATEWAY_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
API_GATEWAY_RATE_LIMIT_MAX=120
API_GATEWAY_RATE_LIMIT_WINDOW_MS=60000
STREAM_EVENT_WEBHOOK_SECRET=
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_EVENTSUB_SECRET=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_WEBHOOK_SECRET=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
KICK_CLIENT_ID=
KICK_CLIENT_SECRET=
CONTENT_JOB_RETRY_ATTEMPTS=3
CONTENT_JOB_RETRY_BACKOFF_MS=30000
```

`POST /api/webhooks/streams/ended` first validates the internal `stream_id`
server-side. Unknown streams return `404 stream_not_found` and do not enqueue
anything.

Known streams enqueue a normalized `stream.offline` media event into
`streamos-media`. The API Gateway opportunistically enriches that event from
existing `vod_assets` when `vodAssetUrl` is missing, then `stream-job-worker`
remains the canonical consumer of that queue and only fans out to the
downstream `transcription.trigger` job in `streamos-transcription` when the
event carries or resolves complete transcription input.

The API response stays aligned to the later canonical downstream ID:
`job_id` and `queue_job_id` both resolve to `transcription-trigger-<stream_id>`.
This keeps UI and monitoring stable even though the first queued job is the
media event, not the transcription worker job.

`transcription-worker` consumes only `streamos-transcription` and calls
`POST /transcriptions/process`. `video.published` can now create a durable
`repurposing` plan content job and enqueue `repurposing.plan` into
`streamos-repurposing` when server-side enrichment resolves `asset_available`
and the connected platform metadata explicitly opts in. The dedicated
`repurposing-worker` consumes only `streamos-repurposing`, calls
`POST /repurposing/plan`, and persists a manual-review-only plan in
`content_jobs.result`. It does not auto-publish, export, render, or
crosspost. Approved repurposing jobs can later produce a sanitized,
clipboard-only export bundle for manual use. Raw provider events without a
direct `vodAssetUrl` still rely on server-side enrichment against existing
assets before they can trigger automatic transcription.

`POST /api/content-publications` is the server-side publication contract for
approved repurposing jobs. It freezes a publish snapshot, writes
`content_publications`, and appends `content_publication_events` for audit
history. The gateway then enqueues the deterministic `publication.publish`
job into `streamos-publishing`, where `workers/publishing-worker` performs the
server-side provider write and reconciliation work. The browser still does not
call provider write APIs directly.

`POST /api/content-publications/fanout` is the server-side fanout contract for
approved repurposing jobs that should prepare multiple target publications in
one request. It validates the repurposing snapshot once, validates each target
server-side, and writes durable fanout audit rows before any publication worker
path is used. The browser still does not call provider write APIs directly.

`GET /dashboard/publications/schedule` is the read-only schedule overview for
approved publications and parent fanouts. It groups planned items by day,
shows export eligibility and history links, and stays tenant-scoped without
starting any worker, publish, or provider-write flow from the browser. The
schedule timeline is always StreamOS-managed first; provider-native hints can
inform policy, but they do not replace the canonical schedule state or fanout
parent ownership.

`GET /api/observability/scheduler` is a protected server-to-server snapshot
route for operator use. It requires `API_GATEWAY_SECRET`, returns persisted
scheduler run history plus summary counters and stuck-claim visibility, and
exposes only secret-safe attempt/run reasons without raw payloads or private
URLs.

In production, `services/api-gateway` fails startup unless
`API_GATEWAY_SECRET`, `STREAM_EVENT_WEBHOOK_SECRET`, and `REDIS_URL` are set.
App-facing gateway routes accept `Authorization: Bearer $API_GATEWAY_SECRET`;
external webhooks use `X-StreamOS-Webhook-Secret`.

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

## Gateway-Owned OAuth

Twitch, YouTube, TikTok, and Kick OAuth flows are owned by `services/api-gateway`:

- `GET /api/auth/:provider/connect?handoff=<signed-token>`
- `GET /api/auth/:provider/callback`

The `handoff` query value is a short-lived HMAC token signed with
`API_GATEWAY_SECRET`. It carries only `user_id`, `creator_id`, optional
`return_to`, and `exp`; provider tokens never pass through the browser. The
gateway stores a one-time `state` plus PKCE `code_verifier`, redirects to the
provider, exchanges the callback code with PKCE, fetches the authenticated
provider profile, encrypts access and refresh tokens with `APP_ENCRYPTION_KEY`,
and upserts `channels` plus `platform_connections`.

`apps/web` only keeps the minimal server-side handoff boundary:

```bash
APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
API_GATEWAY_URL=http://localhost:4000
API_GATEWAY_SECRET=
```

Do not place `APP_ENCRYPTION_KEY`, provider client secrets, webhook secrets,
Redis credentials, `SUPABASE_SERVICE_ROLE_KEY`, or any `OPENAI_*` variable in
`apps/web/.env.local`.

Configure these server-only values in the API gateway environment:

```bash
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_REDIRECT_URI=http://localhost:4000/api/auth/twitch/callback
TWITCH_SCOPES=user:read:email
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
APP_ENCRYPTION_KEY=base64:replace-with-32-byte-key
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
API_GATEWAY_SECRET=
```

Register the matching redirect URI with each provider. Run the gateway OAuth
tests with:

```bash
pnpm --filter @streamos/api-gateway test
```

## Next Implementation Steps

1. Expand integration coverage for gateway-owned OAuth handoff, callback
   failure paths, and encrypted token persistence across all providers.
2. Harden media storage and export automation around the existing
   transcription, clip generation, and retry workers.
3. Build the user-facing branding and monetization workflows on top of the
   existing `brand_assets`, `monetization_events`, and `monetization_summaries`
   schema.
