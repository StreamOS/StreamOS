# StreamOS Deployment

This document defines the production deployment topology for the StreamOS monorepo.

## Target Topology

| Path                                  | Runtime                | Platform                                                       | Purpose                                                                                                   |
| ------------------------------------- | ---------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `apps/web`                            | Next.js App Router     | Vercel                                                         | Dashboard, Supabase SSR Auth, app-facing BFF routes                                                       |
| `services/api-gateway`                | Node.js                | Railway                                                        | Public API gateway, platform OAuth, server-only mutations, webhook ingress, BullMQ job producers          |
| `services/automation-service`         | FastAPI                | Railway first, Fly.io when GPU or regional compute is required | Server-side AI and clip automation APIs                                                                   |
| `workers/stream-job-worker`           | Node.js BullMQ Worker  | Railway Worker Dyno                                            | Canonical `streamos-media` consumer for stream materialization and transcription fan-out                  |
| `workers/repurposing-worker`          | Node.js BullMQ Worker  | Railway Worker Dyno                                            | Canonical `streamos-repurposing` consumer for manual-review-only repurposing plans                        |
| `workers/publishing-worker`           | Node.js BullMQ Worker  | Railway Worker Dyno                                            | Canonical `streamos-publishing` consumer for approved publication execution and reconciliation            |
| `workers/publishing-scheduler-worker` | Node.js polling worker | Railway Worker Dyno                                            | Private scheduler that claims due publications and enqueues deterministic `publication.publish` jobs      |
| `workers/transcription-worker`        | Node.js BullMQ Worker  | Railway Worker Dyno                                            | Long-running transcription consumer that calls FastAPI                                                    |
| `workers/content-job-retry-worker`    | Node.js BullMQ Worker  | Railway Worker Dyno                                            | Requeues retryable failed `content_jobs` into transcription, clip, and repurposing queues                 |
| `release-gate-runner`                 | Node.js operator shell | Railway private worker/service                                 | Proof-only runtime for `pnpm rollout:check:production` using the gate-required release-candidate snapshot |

## Service Boundaries

- Browser code must call the Next.js app or `services/api-gateway`; it must not call AI providers directly.
- `services/api-gateway` is the public backend entrypoint for external webhooks, app-facing backend APIs, platform OAuth flows, provider token refresh, metrics writes, and queue-producing commands.
- `services/api-gateway` also owns the server-side publication contract at `POST /api/content-publications`, the fanout preparation contract at `POST /api/content-publications/fanout`, and the publish/reconcile actions under `/api/content-publications/:id/publish` and `/api/content-publications/:id/reconcile`; it freezes approved repurposing snapshots, validates tenant and scope eligibility, writes `content_publications`, `content_publication_fanouts`, `content_publication_fanout_targets`, plus `content_publication_events`, and enqueues `streamos-publishing` jobs for server-side worker execution.
- `services/automation-service` should use private Railway networking in production. Do not call it from browser code or Vercel client bundles; only Railway services/workers in the same project/environment should call it.
- `workers/stream-job-worker` is the only canonical `streamos-media` consumer. It materializes `streams`, creates durable `content_jobs`, and enqueues canonical `transcription.trigger` jobs when a media event already includes, or the API Gateway can resolve, enough transcription input such as `vodAssetUrl`.
- `workers/repurposing-worker` is the only canonical `streamos-repurposing` consumer. It consumes durable `repurposing.plan` jobs, calls `services/automation-service` at `POST /repurposing/plan`, and persists a manual-review-only result to `content_jobs.result`.
- `workers/publishing-worker` is the only canonical `streamos-publishing` consumer. It executes approved publication jobs against server-owned provider write APIs, performs publication reconciliation, and persists publication status plus audit events in Supabase.
- `workers/publishing-scheduler-worker` is the private scheduler for `streamos-publishing`. It polls due scheduled publications, claims work in Supabase, and enqueues deterministic `publication.publish` jobs for the publishing worker. It does not call provider APIs or `services/automation-service` directly.
- `workers/transcription-worker` consumes only `streamos-transcription`, calls `services/automation-service`, and writes transcription job status plus derived transcript state to Supabase.
- `workers/content-job-retry-worker` owns retry orchestration for failed `content_jobs`; it uses the Supabase service-role key server-side and requeues only supported job payloads. Row-level `content_jobs.max_retries` is the source of truth for retry budget, including manual retries from the dashboard.
- `release-gate-runner` is not a product service. It exists only to provide a Railway-internal shell/runtime that contains the same gate-required release-candidate snapshot as the services under test, so `pnpm rollout:check:production` can run with private Automation Service reachability and the required monorepo sources.
- `services/api-gateway` must expose a non-secret runtime provenance marker on `/health` so the production gate can prove that the hosted public gateway is running the same release-candidate commit and Railway environment as the `release-gate-runner` before the transcription E2E starts.
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

Required Vercel environment variables, plus an optional server-only
canonical-origin override:

```bash
# Optional server-only canonical origin override for OAuth handoff redirects.
APP_URL=https://app.streamos.example
NEXT_PUBLIC_APP_URL=https://app.streamos.example
STREAMOS_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
# Legacy compatibility only when older deployments still use anon-key naming:
# NEXT_PUBLIC_SUPABASE_ANON_KEY=
API_GATEWAY_URL=https://streamos-api-gateway.up.railway.app
API_GATEWAY_SECRET=
```

Do not set `APP_ENCRYPTION_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_DB_URL`, Redis URLs, Railway private service URLs, provider client
secrets, provider webhook secrets, `STREAM_EVENT_WEBHOOK_SECRET`, or any
`NEXT_PUBLIC_OPENAI*` variable in the Vercel browser-facing app.

Twitch, YouTube, TikTok, and Kick OAuth are gateway-owned. Provider secrets and
webhook secrets must be configured on the API gateway only. `API_GATEWAY_SECRET`
is the only shared secret that remains in Vercel, and only for server-side
handoff and app-facing gateway calls.

Run `pnpm vercel:audit -- --vercel-dir .vercel --environment preview` or
`pnpm vercel:audit -- --vercel-dir .vercel --environment production` after
`vercel pull` and before `vercel build`, depending on the target deployment
workflow. The same policy is enforced in `apps/web/next.config.ts` during
Vercel builds and startup, so the web app fails fast if the pulled environment
still contains Railway-only secrets or private Railway URLs.

`APP_URL` is the preferred server-side canonical origin for OAuth handoff
redirects such as `/api/gateway-connect`. `NEXT_PUBLIC_APP_URL` remains an
optional browser-safe fallback when client-visible configuration needs the app
origin. In production, the web app must have a canonical app origin configured,
and `APP_URL` takes precedence when both values are present.

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
REDIS_URL=rediss://default:password@host:6379
API_GATEWAY_SECRET=
API_GATEWAY_ALLOWED_ORIGINS=https://app.streamos.example
STREAM_EVENT_WEBHOOK_SECRET=
APP_ENCRYPTION_KEY=base64:replace-with-32-byte-key
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
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
```

Twitch, YouTube, TikTok, and Kick OAuth are gateway-owned and must use the API
Gateway callback URLs shown above.

Optional Railway overrides:

```bash
HOST=::
PORT=4000
QUEUE_DEFAULT_NAME=streamos-media
CLIP_GENERATION_QUEUE_NAME=streamos-clip-generation
TRANSCRIPTION_QUEUE_NAME=streamos-transcription
CONNECT_SUCCESS_REDIRECT=https://app.streamos.example/dashboard/platforms
API_GATEWAY_RATE_LIMIT_MAX=120
API_GATEWAY_RATE_LIMIT_WINDOW_MS=60000
TWITCH_REDIRECT_URI=https://streamos-api-gateway.up.railway.app/api/auth/twitch/callback
TWITCH_SCOPES=user:read:email moderator:read:followers
YOUTUBE_REDIRECT_URI=https://streamos-api-gateway.up.railway.app/api/auth/youtube/callback
YOUTUBE_SCOPES=https://www.googleapis.com/auth/youtube.readonly
TIKTOK_REDIRECT_URI=https://streamos-api-gateway.up.railway.app/api/auth/tiktok/callback
TIKTOK_SCOPES=user.info.basic
KICK_REDIRECT_URI=https://streamos-api-gateway.up.railway.app/api/auth/kick/callback
KICK_SCOPES=user:read channel:read events:subscribe channel:follow channel:subscription
RAILWAY_HEALTHCHECK_TIMEOUT_SEC=30
```

`TWITCH_EVENTSUB_SECRET` accepts the compatibility alias `TWITCH_WEBHOOK_SECRET`.
`YOUTUBE_WEBHOOK_SECRET` accepts the compatibility alias `YOUTUBE_WEBSUB_SECRET`.

`REDIS_URL` is mandatory in production for the API gateway because
observability, distributed rate limiting, and webhook replay protection must
share the same Redis-backed state. `GET /api/observability/scheduler` is a
protected server-to-server snapshot route that exposes persisted scheduler run
history, summary counters, and stuck-claim visibility without raw payloads or
secrets.

Use `/health` as the Railway healthcheck path. The endpoint must return HTTP 200 before Railway sends traffic to the new deployment.

Security model:

- `/health` is public and not rate-limited so Railway healthchecks remain reliable.
- App-facing `/api/*` routes require `Authorization: Bearer $API_GATEWAY_SECRET` or `X-StreamOS-API-Secret`.
- External stream webhooks require `X-StreamOS-Webhook-Secret: $STREAM_EVENT_WEBHOOK_SECRET`.
- Gateway OAuth connect requests require a short-lived `handoff` token signed
  with `API_GATEWAY_SECRET`; callbacks validate one-time state plus PKCE before
  encrypted token persistence, then redirect to the safe `return_to` target or
  `CONNECT_SUCCESS_REDIRECT`.
- Twitch, YouTube, TikTok, and Kick OAuth are gateway-owned. Their client
  secrets must stay in Railway, and provider tokens must never be proxied
  through browser code.
- `API_GATEWAY_SECRET` and `STREAM_EVENT_WEBHOOK_SECRET` are mandatory when `NODE_ENV=production`; the service fails during startup if either is missing.
- `REDIS_URL` is mandatory when `NODE_ENV=production`; the gateway fails during startup if it is missing so observability, rate limiting, and replay protection cannot silently fall back to in-memory.
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
OPENAI_API_KEY=
```

`OPENAI_MODEL` is reserved for complex analysis tasks. `OPENAI_TITLE_MODEL`
remains a server-only reserved setting for a future canonical title-generation
or repurposing contract. `video.published` can now create a durable
`repurposing` plan content job and enqueue `repurposing.plan` when provider
enrichment resolves `asset_available` and the connected platform metadata
explicitly opts in; the active production endpoints are now `/clips/analyze`,
`/repurposing/plan`, and `/transcriptions/process`.

Optional Railway overrides:

```bash
HOST=::
PORT=8000
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

Keep public networking disabled for steady-state production. During first deploy only, you may temporarily enable a Railway public domain to smoke-test `/health`, then remove it and verify from the dedicated `release-gate-runner` Railway shell with `node scripts/check-deployment.cjs --expect-private-automation`.

Validation:

```bash
python -m pytest services/automation-service
```

## Railway Worker Dyno: `workers/repurposing-worker`

The repurposing worker is the canonical `streamos-repurposing` consumer. It
consumes durable `repurposing.plan` jobs, calls `services/automation-service`
at `POST /repurposing/plan`, and persists the manual-review-only plan result
to `content_jobs.result`.

Recommended Docker configuration:

| Setting           | Value                           |
| ----------------- | ------------------------------- |
| Dockerfile Path   | `Dockerfile.repurposing-worker` |
| Service Type      | Worker                          |
| Public Networking | Disabled                        |

Required variables:

```bash
REDIS_URL=rediss://default:password@host:6379
AUTOMATION_SERVICE_URL=http://automation-service.railway.internal:8000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
REPURPOSING_QUEUE_NAME=streamos-repurposing
```

## Railway Worker Dyno: `workers/stream-job-worker`

The stream job worker is the canonical `streamos-media` consumer. It
materializes `streams`, persists durable `content_jobs`, and fans out to
`streamos-transcription` when the incoming media event already carries, or the
API Gateway can resolve, the required transcription input such as `vodAssetUrl`.
For `video.published`, it also writes a durable `repurposing` plan
`content_jobs` row and enqueues `repurposing.plan` when provider enrichment
resolves `asset_available` and the connected platform metadata explicitly
enables repurposing. The durable plan is review-oriented only and does not
auto-publish, export, render, or crosspost.

Recommended Docker configuration:

| Setting           | Value                          |
| ----------------- | ------------------------------ |
| Dockerfile Path   | `Dockerfile.stream-job-worker` |
| Service Type      | Worker                         |
| Public Networking | Disabled                       |

Required variables:

```bash
REDIS_URL=rediss://default:password@host:6379
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Optional variables:

```bash
QUEUE_DEFAULT_NAME=streamos-media
STREAM_JOB_QUEUE_NAME=streamos-media
STREAM_JOB_WORKER_CONCURRENCY=5
STREAM_JOB_ALERT_WEBHOOK_URL=
REPURPOSING_QUEUE_NAME=streamos-repurposing
TRANSCRIPTION_QUEUE_NAME=streamos-transcription
```

This worker must not call `AUTOMATION_SERVICE_URL` and must not depend on
provider client secrets. Raw provider webhooks without `vodAssetUrl` may stay
limited to stream materialization only when the gateway cannot resolve an
existing asset.

Validation:

```bash
pnpm --filter stream-job-worker lint
pnpm --filter stream-job-worker test
pnpm --filter stream-job-worker build
```

## Railway Worker Dyno: `workers/transcription-worker`

The transcription worker is a Node.js BullMQ consumer. It consumes only
`streamos-transcription`, calls FastAPI for transcription, and persists status
in Supabase.

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
AUTOMATION_SERVICE_URL=http://${{automation-service.RAILWAY_PRIVATE_DOMAIN}}:8000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Optional variables:

```bash
CLIP_GENERATION_QUEUE_NAME=streamos-clip-generation
TRANSCRIPTION_QUEUE_NAME=streamos-transcription
TRANSCRIPTION_WORKER_CONCURRENCY=2
```

If the Railway service is named differently, replace `automation-service` in the reference variable with the exact Railway service name. The rendered value must end in `railway.internal` and must use `http` plus the Automation Service port.

Validation:

```bash
pnpm --filter @streamos/transcription-worker lint
pnpm --filter @streamos/transcription-worker test
pnpm --filter @streamos/transcription-worker build
```

## Railway Worker Dyno: `workers/clip-worker`

The clip worker is a Node.js BullMQ consumer for clip-generation and scoring
jobs. It calls the private Automation Service and persists job state with
Supabase server-side credentials.

Recommended Docker configuration:

| Setting           | Value                    |
| ----------------- | ------------------------ |
| Dockerfile Path   | `Dockerfile.clip-worker` |
| Service Type      | Worker                   |
| Public Networking | Disabled                 |

### Required Variables

```bash
REDIS_URL=rediss://default:password@host:6379
AUTOMATION_SERVICE_URL=http://${{automation-service.RAILWAY_PRIVATE_DOMAIN}}:8000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

These variables are mandatory for every Railway deployment of
`workers/clip-worker`. The worker must fail startup if one of them is missing or
if `AUTOMATION_SERVICE_URL` resolves to a public host.

### Optional Variables

```bash
CLIP_WORKER_CONCURRENCY=2
CLIP_GENERATION_QUEUE_NAME=streamos-clip-generation
QUEUE_DEFAULT_NAME=streamos-media
```

`AUTOMATION_SERVICE_URL` must resolve to the private Railway Automation Service
endpoint. Public `https://*.up.railway.app` URLs are invalid for this worker
and must not be used as a fallback.

Validation:

```bash
pnpm --filter @streamos/clip-worker lint
pnpm --filter @streamos/clip-worker test
pnpm --filter @streamos/clip-worker build
```

## Railway Worker Dyno: `workers/content-job-retry-worker`

The content job retry worker scans failed `content_jobs`, claims retryable rows
with optimistic `retry_count` checks, and requeues supported jobs with BullMQ
`attempts=3` and exponential backoff. It keeps retry support aligned with the
deployed queue contract, including transcription, clip-generation, and
repurposing when those queue names are configured. It uses the row-level
`max_retries` value as the retry budget so `/dashboard/jobs` can manually
release an exhausted job by raising that value.

Recommended Docker configuration:

| Setting           | Value                                 |
| ----------------- | ------------------------------------- |
| Dockerfile Path   | `Dockerfile.content-job-retry-worker` |
| Service Type      | Worker                                |
| Public Networking | Disabled                              |

Required variables:

```bash
REDIS_URL=rediss://default:password@host:6379
CONTENT_JOB_RETRY_WORKER_BATCH_SIZE=25
CONTENT_JOB_RETRY_WORKER_POLL_INTERVAL_MS=60000
CONTENT_JOB_RETRY_ATTEMPTS=3
CONTENT_JOB_RETRY_BACKOFF_MS=30000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
REPURPOSING_QUEUE_NAME=streamos-repurposing
```

Optional variables:

```bash
CLIP_GENERATION_QUEUE_NAME=streamos-clip-generation
QUEUE_DEFAULT_NAME=streamos-media
TRANSCRIPTION_QUEUE_NAME=streamos-transcription
```

Validation:

```bash
pnpm --filter @streamos/content-job-retry-worker lint
pnpm --filter @streamos/content-job-retry-worker test
pnpm --filter @streamos/content-job-retry-worker build
```

## Railway Worker Dyno: `workers/publishing-worker`

The publishing worker is the canonical `streamos-publishing` consumer. It
executes queued publication jobs for approved repurposing snapshots, writes
publication state transitions and audit events to Supabase, and performs
provider-side reconciliation. The current worker implementation supports both
YouTube and TikTok publication targets, so the environment must provision both
sets of provider client credentials when the service is enabled.

Recommended Docker configuration:

| Setting           | Value                          |
| ----------------- | ------------------------------ |
| Dockerfile Path   | `Dockerfile.publishing-worker` |
| Service Type      | Worker                         |
| Public Networking | Disabled                       |

Required variables:

```bash
REDIS_URL=rediss://default:password@host:6379
APP_ENCRYPTION_KEY=base64:replace-with-32-byte-key
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
```

Optional variables:

```bash
PUBLICATION_QUEUE_NAME=streamos-publishing
PUBLISHING_WORKER_CONCURRENCY=1
```

The worker must not be exposed with a public domain. It is a private
Railway-only background service and should never be called from browser code.
It also must not require `AUTOMATION_SERVICE_URL`; provider write calls remain
embedded in the worker and are executed only through its BullMQ queue.

Operator rollout checklist:

1. Confirm the Railway project already contains a `publishing-worker` service
   in the target environment.
2. Confirm the service is deployed from the intended release-candidate commit
   and uses `Dockerfile.publishing-worker` from the repository root build
   context.
3. Verify the required environment variables above are present in Railway and
   that no browser-facing `NEXT_PUBLIC_*` secrets are configured for the
   worker.
4. Keep public networking disabled and do not attach a public domain.
5. Confirm the gateway can enqueue `publication.publish` and
   `publication.reconcile` jobs into `streamos-publishing`.
6. Run a controlled publish smoke test against an already approved repurposing
   job, then verify the publication status transitions, audit events, and
   reconciliation path without leaking secrets.
7. If the service fails on startup, first check provider credentials, Supabase
   service-role access, and Redis connectivity before changing any publish
   contract code.

Validation:

```bash
pnpm --filter @streamos/publishing-worker lint
pnpm --filter @streamos/publishing-worker test
pnpm --filter @streamos/publishing-worker build
```

## Railway Worker Dyno: `workers/publishing-scheduler-worker`

The publishing scheduler worker is a private polling service that claims due
scheduled publications in Supabase and enqueues deterministic
`publication.publish` jobs into `streamos-publishing`. It does not execute
provider writes itself and it does not call `services/automation-service`.
Operators can inspect its persisted run history and stuck-claim visibility via
the protected `GET /api/observability/scheduler` snapshot route.

Recommended Docker configuration:

| Setting           | Value                                    |
| ----------------- | ---------------------------------------- |
| Dockerfile Path   | `Dockerfile.publishing-scheduler-worker` |
| Service Type      | Worker                                   |
| Public Networking | Disabled                                 |

Required variables:

```bash
REDIS_URL=rediss://default:password@host:6379
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Optional variables:

```bash
PUBLICATION_QUEUE_NAME=streamos-publishing
PUBLISHING_SCHEDULER_WORKER_BATCH_SIZE=25
PUBLISHING_SCHEDULER_WORKER_CLAIM_TIMEOUT_MS=300000
PUBLISHING_SCHEDULER_WORKER_POLL_INTERVAL_MS=30000
```

Operator rollout checklist:

1. Confirm the Railway project contains a `publishing-scheduler-worker`
   service in the target environment.
2. Confirm the service is deployed from the intended release-candidate commit
   and uses `Dockerfile.publishing-scheduler-worker` from the repository root
   build context.
3. Verify the worker remains private with no public domain attached.
4. Confirm `REDIS_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are
   present and no provider write secrets or `AUTOMATION_SERVICE_URL` are
   configured on the scheduler.
5. Confirm the scheduler enqueues deterministic `publication.publish` jobs
   into `streamos-publishing` and leaves provider writes to
   `workers/publishing-worker`.

Validation:

```bash
pnpm --filter @streamos/publishing-scheduler-worker lint
pnpm --filter @streamos/publishing-scheduler-worker test
pnpm --filter @streamos/publishing-scheduler-worker build
```

## Railway Private Service: `release-gate-runner`

Use a dedicated Railway worker or private service for production-gate proofs
instead of expanding the runtime snapshots of `api-gateway` or the BullMQ
workers. The goal is to keep product images minimal while still giving
operators one Railway runtime that carries the gate-required release-candidate snapshot.

Recommended Docker configuration:

| Setting           | Value                            |
| ----------------- | -------------------------------- |
| Dockerfile Path   | `Dockerfile.release-gate-runner` |
| Service Type      | Worker or private service        |
| Public Networking | Disabled                         |

Rules:

- Provision a real Railway service named `release-gate-runner` in every target
  environment that should support promotable rollout checks. A missing service
  is a hard blocker: the deploy workflow can only deploy the runner if the
  service already exists in that Railway project/environment.
- Build this runner from the repository root.
- Deploy it from the same Git commit and into the same Railway project and
  Railway environment as the release candidate you want to verify.
- Keep it out of request handling and out of BullMQ consumption. It must not
  replace `api-gateway`, `stream-job-worker`, or `transcription-worker`.
- Generic helper shells such as `railway-function-shell*` are not valid
  substitutes. They do not prove that the current release-candidate snapshot,
  `Dockerfile.release-gate-runner`, and the gate-required files were actually
  deployed together.
- The runner must be running before an operator can start a promotable
  `production-gate` from it. A stopped runner provides no proof.
- Do not treat a product image with selective `COPY` instructions as
  proof-capable just because the monorepo root exists. A valid proof runtime
  must contain the current root `package.json`, `scripts/rollout-check.cjs`,
  `scripts/check-deployment.cjs`, `scripts/e2e-transcription-job.cjs`, and the
  required workspace sources.

The runner does not need a public URL. It only needs Railway-private network
reachability plus the operator shell/exec path that lets you run the gate from
inside the same environment as the deployed services.

## Production Checks

Run the rollout tooling before promoting a deployment. StreamOS now separates
two modes deliberately:

- `local diagnostic`: useful for local troubleshooting, but never promotable
- `production gate`: the only promotable gate, and only valid from a runtime
  that can reach the private Automation Service URL

Use the local diagnostic mode for local Compose-backed verification:

```bash
pnpm rollout:check:local
```

For live Railway audits, export the operator-only Railway secrets into the
current shell and run the audit once per environment:

```bash
export RAILWAY_PROJECT_ID=
export RAILWAY_TOKEN_STAGING=
export RAILWAY_TOKEN_PRODUCTION=

pnpm railway:audit --env staging --format markdown > audit-staging.md
pnpm railway:audit --env production --format markdown > audit-production.md
```

`pnpm railway:audit` reads `RAILWAY_PROJECT_ID`, `RAILWAY_TOKEN_STAGING`, and
`RAILWAY_TOKEN_PRODUCTION` only from `process.env`. It does not persist those
values in repo files or generated reports. If `RAILWAY_TOKEN` is explicitly set
in the current shell, that shared token overrides the env-specific Railway
tokens for the audit run. The audit inventory now includes
`release-gate-runner`, `publishing-worker`, and
`publishing-scheduler-worker`; if any of those services is missing in the
audited environment, the environment is not proof-ready.

For `publishing-worker`, the audit expects:

- the service to be present in the Railway inventory
- public networking to stay disabled
- no public domain to be attached
- the worker-specific required env contract to be populated, without requiring
  `AUTOMATION_SERVICE_URL`

For `publishing-scheduler-worker`, the audit expects:

- the service to be present in the Railway inventory
- public networking to stay disabled
- no public domain to be attached
- the worker-specific required env contract to be populated
- `AUTOMATION_SERVICE_URL`, provider secrets, and browser-facing secrets to stay
  off the scheduler service

### Publishing-worker Audit Interpretation

`pnpm railway:audit` renders the same underlying report as Markdown or JSON.
Markdown is for operator review. JSON is for CI, automation, and machine
comparison. If the Markdown and JSON outputs disagree about service presence,
public networking, or finding severity, block the rollout and re-run the audit.
If a finding appears in only one format, treat it as a report-contract problem
and do not promote until the audit output is reconciled.

For `publishing-worker`, use the following matrix to translate audit findings
into rollout decisions:

| Finding / flag                                                 | Example trigger                                                                                                                                                                                                       | Service             | Env                   | Rollout decision                                         | Operator action                                                                                                                             | Re-audit?   |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `SERVICE_INVENTORY` / `MISSING`                                | `publishing-worker` is absent from the Railway service list or environment config                                                                                                                                     | `publishing-worker` | staging or production | Block rollout                                            | Provision the service in the target Railway environment and confirm the inventory entry exists                                              | Yes         |
| `PUBLIC_NETWORKING` / `DANGEROUS_EXPOSURE`                     | A public domain is attached or `serviceDomains` is populated for the worker                                                                                                                                           | `publishing-worker` | staging or production | Block rollout                                            | Remove the public domain, disable public networking, and keep the worker private                                                            | Yes         |
| Required env missing or invalid                                | `REDIS_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, or another required worker variable is missing, empty, or invalid, including `PUBLICATION_QUEUE_NAME` only if the deployed worker version marks it required | `publishing-worker` | staging or production | Block rollout                                            | Restore the required Railway variables and verify the worker contract before retrying                                                       | Yes         |
| `APP_ENCRYPTION_KEY` missing                                   | The current worker code actually requires token decryption and the key is unset                                                                                                                                       | `publishing-worker` | staging or production | Block rollout when the current code contract requires it | Restore the key only if the deployed worker version needs it for token handling                                                             | Yes         |
| `AUTOMATION_SERVICE_URL` missing                               | The worker contract does not use `AUTOMATION_SERVICE_URL`                                                                                                                                                             | `publishing-worker` | staging or production | Not blocking                                             | No action unless a later worker contract adds this dependency                                                                               | No          |
| `WRONG_SCOPE`, `WRONG_SERVICE`, or secret `DANGEROUS_EXPOSURE` | A secret or variable is attached to the wrong service or exposed on a service that should not own it                                                                                                                  | `publishing-worker` | staging or production | Block rollout                                            | Move the variable to the correct owner and remove any exposure before retrying                                                              | Yes         |
| `STAGING_DRIFT`                                                | Staging and production differ on service presence, networking, or variable status                                                                                                                                     | `publishing-worker` | cross-environment     | Manual review required                                   | Compare both environments, confirm whether the drift is intentional, and block if it changes required envs, service presence, or networking | Usually yes |
| `HEALTHCHECK_FAILED`                                           | A verifiable worker health probe fails                                                                                                                                                                                | `publishing-worker` | staging or production | Block rollout                                            | Fix the runtime or deployment, then re-audit after the worker is healthy again                                                              | Yes         |

Do not apply the worker networking rule to `api-gateway`. `api-gateway` is the
public backend entry point and may legitimately keep public networking
enabled. The worker rule is the opposite: `publishing-worker` must stay
private.

If the report is incomplete, contains unknown service metadata, or the Railway
SSH/internal probe is unverified while all hard blockers are green, hold the
rollout for manual review. Do not promote until the missing information has
been clarified.

For `audit-premerge-cross-env.md`, treat any `publishing-worker` finding in
`SERVICE_INVENTORY` / `MISSING`, `PUBLIC_NETWORKING` /
`DANGEROUS_EXPOSURE`, required-env failures, or relevant `STAGING_DRIFT` as a
merge blocker. Re-run the cross-environment audit after the drift is fixed.
`api-gateway` may remain public; `publishing-worker` may not.

### Publishing-worker Decision Tree

1. Is `publishing-worker` present in the target Railway environment?
   - No: block rollout.
2. Is public networking disabled for `publishing-worker`?
   - No: block rollout.
3. Does the worker have a public domain or public URL?
   - Yes: block rollout.
4. Are all required worker env variables present and valid?
   - No: block rollout.
5. Are any secret values visible in the Markdown or JSON audit output?
   - Yes: block rollout.
6. Does staging differ from production?
   - Yes: manually review the drift first; block if the difference touches required envs, service presence, or networking.
7. Was the worker deployed from the expected release-candidate commit?
   - No: block rollout.
8. Are only optional or known non-blocking hints left?
   - Yes: rollout can continue.
9. Is the production gate green?
   - No: do not promote.
10. Real provider publishing is never part of the gate itself.

- Keep the publish execution separate from audit and proof checks.

### Publishing-worker Release Approval Form

Use this compact form only for operator sign-off. Leave every value blank until
the evidence is available. Never record secret values, tokens, or private URLs.

**Release Metadata**

- RC SHA:
- Branch / PR:
- Target environment:
- Railway project / environment:
- Date checked:
- Operator / approver:
- Relevant deployment IDs:
- Freigabe ist ohne eindeutigen RC-SHA ungültig.

**Audit Status**

- [ ] `audit-premerge-cross-env.md` reviewed
- [ ] `staging` and `production` included
- [ ] No `MISSING` blocker for `publishing-worker`
- [ ] No `DANGEROUS_EXPOSURE` blocker for `publishing-worker`
- [ ] No real `STAGING_DRIFT` blocker for `publishing-worker`
- [ ] No secret values visible in Markdown or JSON reports
- [ ] Markdown and JSON support the same rollout decision
- [ ] `publishing-worker` is listed correctly in the audit report

**Worker Privacy**

- [ ] `publishing-worker` exists in the target environment
- [ ] Service type is Worker / Background Worker
- [ ] Public Networking is disabled
- [ ] No public domain is attached
- [ ] No public healthcheck is required
- [ ] Worker is in the expected Railway project
- [ ] Worker is in the expected Railway environment
- [ ] Worker was deployed from the expected RC SHA
- [ ] Logs show no secret values

**Env Status**

- [ ] All required env names are present
- [ ] `REDIS_URL` present when required
- [ ] `SUPABASE_URL` present
- [ ] `SUPABASE_SERVICE_ROLE_KEY` present
- [ ] Publishing queue name present when required by the deployed worker
- [ ] `APP_ENCRYPTION_KEY` present when the deployed worker requires token decryption
- [ ] `AUTOMATION_SERVICE_URL` is not required for the current worker contract
- [ ] No provider secrets were moved into `apps/web` or Vercel

**Gate Status**

- [ ] Production gate ran from a proof-capable Railway runtime
- [ ] Runner is in the same Railway project
- [ ] Runner is in the same Railway environment
- [ ] Runner contains the same RC SHA
- [ ] API Gateway runtime provenance matches the RC SHA
- [ ] Gate passed green
- [ ] Gate contains no real YouTube publish
- [ ] Gate contains no third-party write
- [ ] Known non-blocking warnings are documented

**Decision**

- Decision: `Freigegeben` / `Blockiert` / `Zurückgestellt`
- Reason:

Freigabe ist nur gültig, wenn RC SHA, Audit-Status, Worker-Privatsphäre, Env-
Status und Gate-Status bestätigt sind und kein Blocker vorliegt. Wenn ein
harter Blocker existiert, setze die Entscheidung auf `Blockiert`. Wenn die
Nachweise unvollständig oder widersprüchlich sind, setze die Entscheidung auf
`Zurückgestellt`.

**Beispielausfüllung ohne Secrets**

_Die Werte unten sind fiktiv und kein Produktionsnachweis. Echte Freigabe
erfordert echte Audit- und Gate-Nachweise. Wenn ein harter Blocker vorliegt,
darf das Formular nicht auf `Freigegeben` stehen. Keine Secret-Werte
eintragen._

**Release Metadata**

- [x] RC SHA: `abc1234def5678example`
- [x] Branch / PR: `release/publishing-worker-rollout` / `PR #1234`
- [x] Target environment: `production`
- [x] Railway project / environment: `terrific-reflection` / `production`
- [x] Date checked: `2026-06-20`
- [x] Operator / approver: `operator@example`
- [x] Relevant deployment IDs: `railway-deploy-example-001`
- [x] Freigabe ist ohne eindeutigen RC-SHA ungültig.

**Audit Status**

- [x] `audit-premerge-cross-env.md` reviewed
- [x] Markdown report reviewed
- [x] JSON report reviewed, falls vorhanden
- [x] `publishing-worker` in staging korrekt gelistet
- [x] `publishing-worker` in production korrekt gelistet
- [x] Kein `MISSING` Blocker
- [x] Kein `DANGEROUS_EXPOSURE` Blocker
- [x] Keine echte `publishing-worker`-Drift
- [x] Keine Secret-Werte in Reports
- [x] Markdown und JSON stützen dieselbe Entscheidung

**Worker Privacy**

- [x] `publishing-worker` existiert in `production`
- [x] Service-Typ ist Worker / Background Worker
- [x] Public Networking ist deaktiviert
- [x] Keine öffentliche Domain vorhanden
- [x] Kein öffentlicher Healthcheck erforderlich
- [x] Service gehört zum richtigen Railway Project
- [x] Service gehört zum richtigen Railway Environment
- [x] Service wurde aus dem erwarteten RC-SHA deployt
- [x] Logs enthalten keine Secrets

**Env Status**

- [x] `REDIS_URL` vorhanden, falls laut Worker-Contract Pflicht
- [x] `SUPABASE_URL` vorhanden
- [x] `SUPABASE_SERVICE_ROLE_KEY` vorhanden
- [x] Publishing-Queue-Name vorhanden, falls laut Worker-Contract Pflicht
- [x] `APP_ENCRYPTION_KEY` vorhanden, falls der Worker Token-Entschlüsselung benötigt
- [x] Sonstige Pflichtvariablen aus dem Worker-Code sind vorhanden
- [x] `AUTOMATION_SERVICE_URL` ist nicht erforderlich
- [x] Keine Provider-Secrets nach `apps/web` oder Vercel verschoben

**Gate Status**

- [x] Production-Gate wurde aus proof-fähigem Railway-Kontext ausgeführt
- [x] Runner gehört zum selben Railway Project
- [x] Runner gehört zum selben Railway Environment
- [x] Runner enthält denselben RC-SHA
- [x] API-Gateway Runtime-Provenance passt zum RC-SHA
- [x] Gate ist grün
- [x] Gate enthält keinen echten YouTube-Publish
- [x] Gate enthält keinen echten Drittanbieter-Write
- [x] Bekannte nicht-blockierende Warnungen sind dokumentiert

**Decision**

- [x] Decision: `Freigegeben`
- [x] Reason: Audit clean, worker privat, Pflicht-Env vollständig, production gate grün.

### Erster kontrollierter Production-Deploy-Proof für publishing-worker

Use this proof for the first controlled production deploy. It proves service,
audit, env, privacy, queue readiness, and gate context. It does not prove a
provider publish.

- No real YouTube publish.
- No third-party write.
- No crossposting.
- No new publish execution.
- No live Railway call is required in the proof text itself.

**Proof Checks**

- [ ] RC SHA is unique and recorded in the approval template
- [ ] `publishing-worker`, `api-gateway`, and shared packages come from the same RC SHA
- [ ] No deploy came from a local dirty state
- [ ] `publishing-worker` exists in Railway `production`
- [ ] Service type is Worker / Background Worker
- [ ] Public Networking is disabled
- [ ] No public domain is attached
- [ ] No public healthcheck is required
- [ ] Worker belongs to the correct Railway project
- [ ] Worker belongs to the correct Railway environment
- [ ] Worker runs from the expected RC SHA
- [ ] Required env names are present
- [ ] Env values are not written into the runbook, approval template, or reports
- [ ] `REDIS_URL` is present when required
- [ ] `SUPABASE_URL` is present
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is present
- [ ] Publishing queue name is present when required by the worker contract
- [ ] `APP_ENCRYPTION_KEY` is present when the worker needs token decryption
- [ ] `AUTOMATION_SERVICE_URL` is not required for the current worker contract
- [ ] Railway audit was checked for the target environment
- [ ] Cross-environment audit was checked when part of the release process
- [ ] `publishing-worker` is listed correctly in the audit report
- [ ] No `MISSING` finding exists
- [ ] No `DANGEROUS_EXPOSURE` finding exists
- [ ] No real `publishing-worker` drift exists
- [ ] No missing required env exists
- [ ] No secret values appear in Markdown or JSON
- [ ] Markdown and JSON support the same rollout decision
- [ ] Production gate ran from a proof-capable Railway runtime
- [ ] Runner is in the same Railway project
- [ ] Runner is in the same Railway environment
- [ ] Runner contains the same RC SHA
- [ ] API Gateway runtime provenance matches the RC SHA
- [ ] Gate is green
- [ ] Gate contains no real YouTube publish
- [ ] Gate contains no third-party write
- [ ] Known non-blocking warnings are documented
- [ ] Worker started without a crash loop
- [ ] Logs show a successful start
- [ ] Logs show no secrets
- [ ] Worker points at the expected publishing queue
- [ ] No public URL is present
- [ ] No unexpected Automation Service dependency is present
- [ ] No aggressive retries or provider calls appear while idle

**Proof Result**

- Decision: `Freigegeben` / `Blockiert` / `Zurückgestellt`
- Reason:

If any hard blocker is present, the proof is `Blockiert`. If the evidence is
incomplete or inconsistent, the proof is `Zurückgestellt`. If the RC SHA, audit
status, worker privacy, env status, gate status, and runtime sanity checks are
all confirmed, the proof can be `Freigegeben`.

For a deployed release candidate, run the production gate from the dedicated
`release-gate-runner` runtime, or an equivalent Railway shell that contains the
same gate-required release-candidate snapshot, in the same Railway project and
the same Railway environment as the candidate:

```bash
pnpm rollout:check:production -- \
  --api-gateway-url https://streamos-api-gateway.up.railway.app \
  --automation-service-url http://automation-service.railway.internal:8000
```

The runner must also provide `TRANSCRIPTION_E2E_FIXTURE_ASSET_URL` or pass
`--fixture-asset-url` when the hosted transcription E2E runs. That fixture URL
is non-sensitive, but it must be a stable public HTTPS media file with no
credentials, no query-string tokens, no private hostnames, and no placeholder
hosts such as `example.com`. If the fixture asset is missing or invalid, the
gate now fails closed before any transcription work is queued.

Do not promote when the production gate fails. Successful package tests, builds,
or a green local diagnostic are not enough on their own. The transcription E2E
over the real Media -> Transcription path remains mandatory for promotion.

Before running the gate, verify these provenance points from the runner itself:

- the Railway service name is exactly `release-gate-runner`
- the runner belongs to the same Railway project and target environment as the
  release candidate
- the deployed commit matches the release-candidate commit you intend to
  promote
- the public `api-gateway` `/health` response includes `x-streamos-runtime-*`
  headers for service, commit, and environment, and those values match the same
  release-candidate commit and Railway environment as the runner
- `scripts/.release-gate-runner-provenance.json` is present and reports the
  expected commit plus gate-contract hash for this runner deploy
- `package.json` still exposes `rollout:check:production`
- `scripts/rollout-check.cjs`, `scripts/check-deployment.cjs`,
  `scripts/e2e-transcription-job.cjs`, `services/api-gateway`,
  `workers/stream-job-worker`, `workers/transcription-worker`, and
  `packages/queue` are present inside the runner snapshot

If any of those checks fail, the runner is not proof-capable and the release
must remain blocked.

The proof runtime must be snapshot-capable before the gate starts. The gate now
fails early with `snapshot_not_proof_capable` when the runtime is missing the
root script contract, the current gate-sequence contract, the generated
runner-provenance marker, or required workspace paths. This is intentional: a
successful runner deploy alone is not proof when the runtime may still contain
an older gate snapshot.

`pnpm rollout:check:production` hard-requires `--skip-docker`,
`--allow-hosted-e2e`, and `--expect-private-automation` internally because the
gate must target already running deployed services and intentionally writes
disposable Supabase rows via the service-role key. Running the local diagnostic
from a local shell, or running the production gate from the wrong Railway
environment, is not a valid health gate because Railway private networking is
environment-scoped.

The private Automation Service check cannot succeed from a local shell or
Vercel because Railway private networking is not public internet. A red local
diagnostic because Docker is unavailable or `api-gateway` is not running is
acceptable as local diagnosis, but it is never a production pass. Production
promotion remains blocked until the proof-capable Railway runner itself was
deployed from the same release-candidate snapshot and the hosted
`production-gate` passed there.

## Pre-Merge Checklist

`staging` and `production` are deployment-side protected GitHub environments.
Jobs that reference those environments must pass the configured deployment gate
before they start or receive environment secrets.

Current environment gate:

- `production`: required reviewer `thomasdorts-hash`, admin bypass disabled,
  5-minute wait timer, deployment branch restriction to `main`
- `staging`: required reviewer `thomasdorts-hash`, admin bypass disabled,
  deployment branch restriction to `main` and `release/*`
- GitHub evaluates these reviewer, branch, and wait rules before jobs using
  those environments can proceed

This deployment gate is separate from the repository merge gate. GitHub now
also enforces the active `Protect main merges` ruleset for `main` and
`release/*`, including:

- `CI / Validate monorepo` as a required status check
- at least one approving review
- required CODEOWNERS review
- resolved review threads before merge

Recommended pre-merge sequence:

```bash
export RAILWAY_PROJECT_ID=
export RAILWAY_TOKEN_STAGING=
export RAILWAY_TOKEN_PRODUCTION=

pnpm validate
pnpm railway:audit --environments staging,production --format markdown > audit-premerge-cross-env.md
pnpm railway:audit --env staging --format markdown > audit-baseline-staging.md
```

Merge expectations:

- `CI / Validate monorepo` is green on the pull request
- `publishing-worker Release Approval` is linked or referenced and is set to
  `Freigegeben`
- `audit-premerge-cross-env.md` has no `MISSING`, `DANGEROUS_EXPOSURE`, or
  real `STAGING_DRIFT` blockers
- `audit-baseline-staging.md` is only committed when the staging-only run has
  no blocker-worthy findings
- `audit-premerge-cross-env.md` remains a local review artifact and is not
  committed
