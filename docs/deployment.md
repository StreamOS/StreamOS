# StreamOS Deployment

This document defines the production deployment topology for the StreamOS monorepo.

## Target Topology

| Path                               | Runtime               | Platform                                                       | Purpose                                                                     |
| ---------------------------------- | --------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `apps/web`                         | Next.js App Router    | Vercel                                                         | Dashboard, auth surfaces, Twitch OAuth server handlers                      |
| `services/api-gateway`             | Node.js               | Railway                                                        | Public API gateway, non-Twitch OAuth, webhook ingress, BullMQ job producers |
| `services/automation-service`      | FastAPI               | Railway first, Fly.io when GPU or regional compute is required | Server-side AI and clip automation APIs                                     |
| `workers/transcription-worker`     | Node.js BullMQ Worker | Railway Worker Dyno                                            | Long-running transcription consumer that calls FastAPI                      |
| `workers/clip-worker`              | Node.js BullMQ Worker | Railway Worker Dyno                                            | Long-running clip-generation consumer that calls FastAPI                    |
| `workers/content-job-retry-worker` | Node.js BullMQ Worker | Railway Worker Dyno                                            | Requeues retryable failed `content_jobs` into BullMQ                        |

## Service Boundaries

- Browser code must call the Next.js app or `services/api-gateway`; it must not call AI providers directly.
- `services/api-gateway` is the public backend entrypoint for external webhooks, app-facing backend APIs, and new non-Twitch platform OAuth flows.
- Twitch OAuth remains in `apps/web` route handlers and dashboard server actions
  until the gateway owns a signed Supabase user-session hand-off and
  tenant-safe encrypted token persistence.
- `services/automation-service` should use private Railway networking in production. Do not call it from browser code or Vercel client bundles; only Railway services/workers in the same project/environment should call it.
- `workers/transcription-worker` owns BullMQ consumption, calls `services/automation-service`, and writes job status to Supabase.
- `workers/clip-worker` owns the `streamos-clip-generation` BullMQ queue, calls
  `services/automation-service` for clip scoring/generation, and writes job
  status to Supabase.
- `workers/content-job-retry-worker` owns retry orchestration for failed `content_jobs`; it uses the Supabase service-role key server-side and requeues only supported job payloads. Row-level `content_jobs.max_retries` is the source of truth for retry budget, including manual retries from the dashboard.
- Python does not consume BullMQ directly. Redis is the shared backing service, but BullMQ job semantics remain Node-owned.
- OpenAI, provider client secrets, Supabase service role keys, and Redis credentials are server-only.

## Vercel: `apps/web`

Create a Vercel project with this configuration:

| Setting          | Value                                               |
| ---------------- | --------------------------------------------------- |
| Root Directory   | `apps/web`                                          |
| Framework Preset | Next.js                                             |
| Install Command  | `corepack enable && pnpm install --frozen-lockfile` |
| Build Command    | `pnpm --filter @streamos/web build`                 |

If the web app fails locally or in a preview build with a stale Next.js
artifact error such as `Cannot find module './7751.js'`, clear the generated
output before rebuilding:

```bash
pnpm clean:web
pnpm --filter @streamos/web build
```

See [`docs/troubleshooting.md`](docs/troubleshooting.md) for the full local
recovery flow and additional checks.

Required Vercel environment variables:

```bash
NEXT_PUBLIC_APP_URL=https://app.streamos.example
APP_ENV=production
STREAMOS_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
APP_ENCRYPTION_KEY=base64:replace-with-32-byte-key
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_REDIRECT_URI=https://app.streamos.example/api/platforms/twitch/callback
TWITCH_SCOPES=user:read:email
API_GATEWAY_URL=https://streamos-api-gateway.up.railway.app
API_GATEWAY_SECRET=
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` must be set in
both the Vercel Production and Preview/Staging environments. The CD workflow
fails the Vercel build when either value is missing, because `/auth/login`,
Supabase SSR session checks, and platform OAuth connect flows depend on them.

Do not set `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_OPENAI_KEY`, or `NEXT_PUBLIC_OPENAI_API_KEY` in the Vercel browser-facing app unless a server route explicitly needs the server-only value.

`TWITCH_CLIENT_SECRET` stays in Vercel only for the documented Twitch OAuth
server-route exception. It must never be exposed with a `NEXT_PUBLIC_*` prefix.
YouTube, TikTok, and Kick provider secrets are configured on the API gateway.

`API_GATEWAY_URL` must be public because Vercel functions are outside the Railway private network. The Automation Service remains private and is reached by Railway workers, not by Vercel.

## Railway: `services/api-gateway`

Use the repository root as the Railway build context so workspace packages resolve correctly.

Recommended Docker configuration:

| Setting           | Value                    |
| ----------------- | ------------------------ |
| Dockerfile Path   | `Dockerfile.api-gateway` |
| Healthcheck Path  | `/health`                |
| Public Networking | Enabled                  |
| Port              | `4000`                   |

Required Railway variables:

```bash
NODE_ENV=production
HOST=::
PORT=4000
REDIS_URL=rediss://default:password@host:6379
QUEUE_DEFAULT_NAME=streamos-media
CLIP_GENERATION_QUEUE_NAME=streamos-clip-generation
TRANSCRIPTION_QUEUE_NAME=streamos-transcription
CLIP_WORKER_CONCURRENCY=2
API_GATEWAY_SECRET=
API_GATEWAY_ALLOWED_ORIGINS=https://app.streamos.example
CONNECT_SUCCESS_REDIRECT=https://app.streamos.example/dashboard/platforms
API_GATEWAY_RATE_LIMIT_MAX=120
API_GATEWAY_RATE_LIMIT_WINDOW_MS=60000
STREAM_EVENT_WEBHOOK_SECRET=
APP_ENCRYPTION_KEY=base64:replace-with-32-byte-key
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REDIRECT_URI=https://streamos-api-gateway.up.railway.app/api/auth/youtube/callback
YOUTUBE_SCOPES=https://www.googleapis.com/auth/youtube.readonly
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=https://streamos-api-gateway.up.railway.app/api/auth/tiktok/callback
TIKTOK_SCOPES=user.info.basic
KICK_CLIENT_ID=
KICK_CLIENT_SECRET=
KICK_REDIRECT_URI=https://streamos-api-gateway.up.railway.app/api/auth/kick/callback
KICK_SCOPES=user:read channel:read events:subscribe channel:follow channel:subscription
KICK_WEBHOOK_SECRET=
RAILWAY_HEALTHCHECK_TIMEOUT_SEC=30
```

Twitch OAuth variables are not required in the API gateway while the Twitch flow
remains in `apps/web`. YouTube, TikTok, and Kick are gateway-owned and must use
the API Gateway callback URLs shown above.

Use `/health` as the Railway healthcheck path. The endpoint must return HTTP 200 before Railway sends traffic to the new deployment.

Security model:

- `/health` is public and not rate-limited so Railway healthchecks remain reliable.
- App-facing `/api/*` routes require `Authorization: Bearer $API_GATEWAY_SECRET` or `X-StreamOS-API-Secret`.
- External stream webhooks require `X-StreamOS-Webhook-Secret: $STREAM_EVENT_WEBHOOK_SECRET`.
- Gateway OAuth connect requests require a short-lived `handoff` token signed
  with `API_GATEWAY_SECRET`; callbacks validate one-time state plus PKCE before
  encrypted token persistence, then redirect to the safe `return_to` target or
  `CONNECT_SUCCESS_REDIRECT`.
- TikTok and Kick OAuth are gateway-owned. Their client secrets must stay in
  Railway only, and provider tokens must never be proxied through browser code.
- `API_GATEWAY_SECRET` and `STREAM_EVENT_WEBHOOK_SECRET` are mandatory when `NODE_ENV=production`; the service fails during startup if either is missing.
- CORS allows only `API_GATEWAY_ALLOWED_ORIGINS`; server-to-server calls without an `Origin` header are allowed.
- Rate limits are fixed-window per client IP, method, and URL. Start with `120` requests per `60000` ms and tighten per endpoint once production traffic is measured.

Validation:

```bash
pnpm --filter @streamos/api-gateway lint
pnpm --filter @streamos/api-gateway test
pnpm --filter @streamos/api-gateway build
```

## Railway/Fly.io: `services/automation-service`

Start on Railway for the first production version. Move this service to Fly.io when local Whisper, GPU-backed inference, or specific regional placement becomes a hard requirement.

Recommended Docker configuration:

| Setting           | Value                             |
| ----------------- | --------------------------------- |
| Dockerfile Path   | `Dockerfile.automation-service`   |
| Healthcheck Path  | `/health`                         |
| Public Networking | Disabled after initial smoke test |
| Port              | `8000`                            |

Required variables:

```bash
HOST=::
PORT=8000
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
OPENAI_TITLE_MODEL=gpt-4o-mini
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_TIMEOUT_SECONDS=30
OPENAI_MAX_TRANSCRIPTION_MEDIA_BYTES=25000000
REPLICATE_API_TOKEN=
STREAMOS_E2E_MODE=false
TRANSCRIPTION_PROCESSOR_MODE=openai
RAILWAY_HEALTHCHECK_TIMEOUT_SEC=30
```

`OPENAI_MODEL` is reserved for complex analysis tasks. Title-generation jobs
should use `OPENAI_TITLE_MODEL`.

Keep public networking disabled for steady-state production. During first deploy only, you may temporarily enable a Railway public domain to smoke-test `/health`, then remove it and verify from the transcription worker Railway shell with `node scripts/check-deployment.cjs --expect-private-automation`.

Validation:

```bash
python -m pytest services/automation-service
```

## Railway Worker Dyno: `workers/transcription-worker`

The transcription worker is a Node.js BullMQ consumer. It consumes the same `streamos-transcription` queue that `services/api-gateway` produces, calls FastAPI for transcription, and persists status in Supabase.

Recommended Docker configuration:

| Setting           | Value                             |
| ----------------- | --------------------------------- |
| Dockerfile Path   | `Dockerfile.transcription-worker` |
| Service Type      | Worker                            |
| Public Networking | Disabled                          |

Required variables:

```bash
REDIS_URL=rediss://default:password@host:6379
TRANSCRIPTION_QUEUE_NAME=streamos-transcription
TRANSCRIPTION_WORKER_CONCURRENCY=2
CLIP_WORKER_CONCURRENCY=2
AUTOMATION_SERVICE_URL=http://${{automation-service.RAILWAY_PRIVATE_DOMAIN}}:8000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

If the Railway service is named differently, replace `automation-service` in the reference variable with the exact Railway service name. The rendered value must end in `railway.internal` and must use `http` plus the Automation Service port.

Validation:

```bash
pnpm --filter @streamos/transcription-worker lint
pnpm --filter @streamos/transcription-worker test
pnpm --filter @streamos/transcription-worker build
```

## Railway Worker Dyno: `workers/clip-worker`

The clip worker is a Node.js BullMQ consumer. It consumes the same
`streamos-clip-generation` queue that `services/api-gateway` produces and that
`workers/content-job-retry-worker` can requeue, calls FastAPI for clip
scoring/generation, and persists status in Supabase.

Recommended Docker configuration:

| Setting           | Value                    |
| ----------------- | ------------------------ |
| Dockerfile Path   | `Dockerfile.clip-worker` |
| Service Type      | Worker                   |
| Public Networking | Disabled                 |

Required variables:

```bash
REDIS_URL=rediss://default:password@host:6379
CLIP_GENERATION_QUEUE_NAME=streamos-clip-generation
CLIP_WORKER_CONCURRENCY=2
AUTOMATION_SERVICE_URL=http://${{automation-service.RAILWAY_PRIVATE_DOMAIN}}:8000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Validation:

```bash
pnpm --filter @streamos/clip-worker lint
pnpm --filter @streamos/clip-worker test
pnpm --filter @streamos/clip-worker build
```

## Railway Worker Dyno: `workers/content-job-retry-worker`

The content job retry worker scans failed `content_jobs`, claims retryable rows
with optimistic `retry_count` checks, and requeues supported jobs with BullMQ
`attempts=3` and exponential backoff. It uses the row-level `max_retries` value
as the retry budget so `/dashboard/jobs` can manually release an exhausted job
by raising that value.

Recommended Docker configuration:

| Setting           | Value                                 |
| ----------------- | ------------------------------------- |
| Dockerfile Path   | `Dockerfile.content-job-retry-worker` |
| Service Type      | Worker                                |
| Public Networking | Disabled                              |

Required variables:

```bash
REDIS_URL=rediss://default:password@host:6379
CLIP_GENERATION_QUEUE_NAME=streamos-clip-generation
TRANSCRIPTION_QUEUE_NAME=streamos-transcription
CLIP_WORKER_CONCURRENCY=2
CONTENT_JOB_RETRY_WORKER_BATCH_SIZE=25
CONTENT_JOB_RETRY_WORKER_POLL_INTERVAL_MS=60000
CONTENT_JOB_RETRY_ATTEMPTS=3
CONTENT_JOB_RETRY_BACKOFF_MS=30000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Validation:

```bash
pnpm --filter @streamos/content-job-retry-worker lint
pnpm --filter @streamos/content-job-retry-worker test
pnpm --filter @streamos/content-job-retry-worker build
```

## Production Checks

Run the rollout gate before promoting a deployment. This is mandatory for
release candidates because it combines tenant security validation, API Gateway
integration tests, signed-webhook tests, the transcription E2E path, and
service health checks in one ordered command.

```bash
pnpm rollout:check -- --env-file=.env.test
```

For a deployed release candidate, run the gate from an environment that can
reach the private Automation Service URL, for example a Railway shell in the
same project/environment:

```bash
pnpm rollout:check -- \
  --env-file=.env \
  --skip-docker \
  --allow-hosted-e2e \
  --api-gateway-url=https://streamos-api-gateway.up.railway.app \
  --automation-service-url=http://automation-service.railway.internal:8000 \
  --expect-private-automation
```

Do not promote when `rollout:check` fails. `--skip-docker` is only valid when
the target services are already running, and `--allow-hosted-e2e` must only be
used intentionally because the transcription E2E creates disposable Supabase
rows via the service-role key.

The private Automation Service check cannot succeed from a local shell or
Vercel because Railway private networking is not public internet.

## GitHub Actions Deployment Workflows

StreamOS already uses split GitHub Actions deployment workflows instead of a
single `deploy.yml`:

- [`.github/workflows/deploy-staging.yml`](../.github/workflows/deploy-staging.yml)
- [`.github/workflows/deploy-production.yml`](../.github/workflows/deploy-production.yml)

This matches the current topology better than a unified workflow because:

- `develop` is the staging deployment branch.
- `main` is the production deployment branch.
- production has extra release and migration-repair behavior that staging does
  not need.

### Staging Flow

Trigger:

- push to `develop`
- manual dispatch with optional backend-service deployment toggle

Behavior:

- run shared CI first through `ci.yml`
- deploy `apps/web` to Vercel preview/staging
- deploy Railway backend services and workers
- apply Supabase staging migrations
- comment the staging URL on associated pull requests
- write a GitHub deployment summary
- send an optional Discord notification

Staging concurrency is configured with `cancel-in-progress: false` so an active
deploy is queued instead of interrupted mid-rollout.

### Production Flow

Trigger:

- push to `main`
- manual dispatch with optional backend-service deployment toggle
- optional production migration-history repair toggle

Behavior:

- run shared CI first through `ci.yml`
- create a GitHub release from Conventional Commits
- deploy Railway backend services and workers
- deploy `apps/web` to Vercel production
- apply Supabase production migrations
- write a GitHub deployment summary
- send an optional Discord notification

Production concurrency is also configured with `cancel-in-progress: false` so
queued deploys do not interrupt in-flight Railway worker rollouts.

### Secrets Used By The Workflows

Repository-level:

- `RAILWAY_PROJECT_ID`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_TOKEN`
- `DISCORD_WEBHOOK_URL` (optional)

Environment `staging`:

- `RAILWAY_TOKEN_STAGING`
- `SUPABASE_DB_URL_STAGING`

Environment `production`:

- `RAILWAY_TOKEN_PRODUCTION`
- `SUPABASE_DB_URL_PRODUCTION`

Keep Railway and Supabase secrets environment-scoped so staging deploys cannot
accidentally promote production credentials.

### Affected-Only Deploy Selection

Push-triggered staging and production deploys do not blindly redeploy every
service anymore. Both deploy workflows run
[`scripts/detect-deploy-changes.cjs`](../scripts/detect-deploy-changes.cjs)
first and compare `github.event.before` to `github.sha`.

The detection logic is intentionally path- and dependency-aware:

- direct changes under `apps/web`, `services/api-gateway`,
  `services/automation-service`, `workers/transcription-worker`,
  `workers/clip-worker`, or `workers/content-job-retry-worker` redeploy only
  that target
- shared workspace package changes propagate through the internal workspace
  dependency graph
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and `turbo.json`
  invalidate all Node-based deploy targets
- `packages/database/supabase/migrations/*` triggers Supabase migration rollout
  without forcing unrelated service redeploys
- manual workflow dispatch still forces a full deployment selection so operators
  can intentionally redeploy everything
- if no deployable target changed, CI still runs but release, deployment, and
  deployment-notification jobs are skipped

This keeps the existing CI choice intact: `validate:ci` still avoids Turbo in
GitHub CI on purpose, while deployment selection uses the monorepo dependency
graph to skip unchanged deploy targets safely.

## GitHub Actions Rollback Workflow

StreamOS uses a manual rollback workflow in
[`.github/workflows/rollback.yml`](../.github/workflows/rollback.yml).

This workflow redeploys an older Git ref instead of attempting an opaque
platform-side rollback. That approach matches the current setup better because
production deploys already create GitHub release tags and the existing deploy
logic is ref-driven from the repository.

### Why the rollback workflow is manual

- Railway's documented rollback flow is exposed in the dashboard deployment UI.
- The current Railway CLI documentation exposes `redeploy`, `restart`, and
  `scale`, but not a general-purpose rollback command for arbitrary previous
  deployments.
- Supabase schema rollback is intentionally not automated because migrations
  may be destructive or not reversible in place.

### Rollback Trigger

Use the GitHub Actions UI to run `CD - Manual Rollback`.

Inputs:

- `environment`: `staging` or `production`
- `git_ref`: git tag, branch, or commit SHA
- `deploy_backend_services`: whether Railway services should be redeployed
- `deploy_frontend`: whether the Vercel app should be redeployed
- `reason`: optional operator note for the deployment summary

### Rollback Target Resolution

Production behavior:

- if `git_ref` is provided, the workflow redeploys that ref
- if `git_ref` is omitted, the workflow selects the previous release tag

Staging behavior:

- `git_ref` is required because staging does not create release tags

### Rollback Behavior

The workflow:

- checks out the target ref
- redeploys Railway services from that exact repository state
- optionally redeploys `apps/web` to the matching Vercel environment
- writes a rollback summary to the GitHub job summary
- sends an optional Discord notification

### Deliberate Non-Goals

The workflow does not:

- attempt automatic Supabase schema rollback
- attempt automatic Railway dashboard rollback of a previous deployment object
- run the private Automation Service rollout gate from GitHub-hosted runners

After a production rollback, run the hosted verification flow from a Railway
shell in the same project/environment before treating the rollback as complete:

```bash
pnpm rollout:check -- \
  --env-file=.env \
  --skip-docker \
  --allow-hosted-e2e \
  --api-gateway-url=https://streamos-api-gateway.up.railway.app \
  --automation-service-url=http://automation-service.railway.internal:8000 \
  --expect-private-automation
```
