# StreamOS Deployment

This document defines the production deployment topology for the StreamOS monorepo.

## Target Topology

| Path                               | Runtime               | Platform                                                       | Purpose                                                                     |
| ---------------------------------- | --------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `apps/web`                         | Next.js App Router    | Vercel                                                         | Dashboard, auth surfaces, Twitch OAuth server handlers                      |
| `services/api-gateway`             | Node.js               | Railway                                                        | Public API gateway, non-Twitch OAuth, webhook ingress, BullMQ job producers |
| `services/automation-service`      | FastAPI               | Railway first, Fly.io when GPU or regional compute is required | Server-side AI and clip automation APIs                                     |
| `workers/clip-worker`              | Node.js BullMQ Worker | Railway Worker Dyno                                            | Long-running clip-generation consumer that calls FastAPI                    |
| `workers/stream-job-worker`        | Node.js BullMQ Worker | Railway Worker Dyno                                            | Consumes normalized provider webhook jobs and persists stream state         |
| `workers/transcription-worker`     | Node.js BullMQ Worker | Railway Worker Dyno                                            | Long-running transcription consumer that calls FastAPI                      |
| `workers/content-job-retry-worker` | Node.js BullMQ Worker | Railway Worker Dyno                                            | Requeues retryable failed `content_jobs` into BullMQ                        |

## Service Boundaries

- Browser code must call the Next.js app or `services/api-gateway`; it must not call AI providers directly.
- `services/api-gateway` is the public backend entrypoint for external webhooks, app-facing backend APIs, and new non-Twitch platform OAuth flows.
- Twitch OAuth remains in `apps/web` route handlers and dashboard server actions
  until the gateway owns a signed Supabase user-session hand-off and
  tenant-safe encrypted token persistence.
- `services/automation-service` should use private Railway networking in production. Do not call it from browser code or Vercel client bundles; only Railway services/workers in the same project/environment should call it.
- `workers/stream-job-worker` owns the `streamos-media` queue fed by provider webhooks. It normalizes stream/video events into durable Supabase state and must not embed direct browser-facing or AI-provider credentials.
- `workers/transcription-worker` owns only `streamos-transcription` BullMQ consumption, calls `services/automation-service`, and writes job status to Supabase.
- `workers/clip-worker` owns `streamos-clip-generation` BullMQ consumption, calls `services/automation-service`, and persists highlight, clip, and export artifacts to Supabase.
- `workers/content-job-retry-worker` owns retry orchestration for failed `content_jobs`; it uses the Supabase service-role key server-side and requeues only supported job payloads. Row-level `content_jobs.max_retries` is the source of truth for retry budget, including manual retries from the dashboard.
- Python does not consume BullMQ directly. Redis is the shared backing service, but BullMQ job semantics remain Node-owned.
- OpenAI, provider client secrets, Supabase service role keys, and Redis credentials are server-only.

## Vercel: repository root -> `apps/web`

Create a Vercel project with the repository root as the Vercel root directory so
pnpm can resolve the full workspace graph during install. The Next.js app still
builds from `apps/web`.

| Setting          | Value                                               |
| ---------------- | --------------------------------------------------- |
| Root Directory   | repository root                                     |
| Framework Preset | Next.js                                             |
| Install Command  | `corepack enable && pnpm install --frozen-lockfile` |
| Build Command    | `pnpm --filter @streamos/web build`                 |

Do not point the Vercel root directory at `apps/web`; that isolates the app
from workspace packages such as `@streamos/queue`, `@streamos/types`,
`@streamos/twitch-eventsub`, and `@streamos/youtube-websub`.

The Next.js build artifact is written to `apps/web/.next`, but Vercel should
serve it through the Next.js integration rather than a custom static output
directory.

The repository root `vercel.json` keeps the cron schedule and the
workspace-aware install/build commands under version control.

Required Vercel environment variables:

```bash
NEXT_PUBLIC_APP_URL=https://app.streamos.example
APP_ENV=production
STREAMOS_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
APP_ENCRYPTION_KEY=base64:replace-with-32-byte-key
STREAM_EVENT_WEBHOOK_SECRET=
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_REDIRECT_URI=https://app.streamos.example/api/platforms/twitch/callback
TWITCH_SCOPES=user:read:email
API_GATEWAY_URL=https://streamos-api-gateway.up.railway.app
API_GATEWAY_SECRET=
```

Do not set `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_OPENAI_KEY`, or `NEXT_PUBLIC_OPENAI_API_KEY` in the Vercel browser-facing app unless a server route explicitly needs the server-only value.

`TWITCH_CLIENT_SECRET` stays in Vercel only for the documented Twitch OAuth
server-route exception. It must never be exposed with a `NEXT_PUBLIC_*` prefix.
The current Twitch exception also reuses `STREAM_EVENT_WEBHOOK_SECRET` during
EventSub registration, so Vercel and Railway must share the same secret value
until that flow is moved fully behind the API gateway. YouTube, TikTok, and
Kick provider secrets should be configured on the API gateway when those OAuth
flows are implemented there.

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
API_GATEWAY_SECRET=
API_GATEWAY_ALLOWED_ORIGINS=https://app.streamos.example
CONNECT_SUCCESS_REDIRECT=https://app.streamos.example/dashboard/platforms
API_GATEWAY_RATE_LIMIT_MAX=120
API_GATEWAY_RATE_LIMIT_WINDOW_MS=60000
STREAM_EVENT_WEBHOOK_SECRET=
APP_ENCRYPTION_KEY=base64:replace-with-32-byte-key
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
YOUTUBE_WEBSUB_SECRET=
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

`HOST=::` is the Railway binding value for both the gateway and the automation
service. Local Compose keeps `HOST=0.0.0.0` through `.env.compose.example`.

Twitch OAuth variables are not required in the API gateway while the Twitch flow
remains in `apps/web`. YouTube, TikTok, and Kick are gateway-owned and must use
the API Gateway callback URLs shown above.

Use `/health` as the Railway healthcheck path. The endpoint must return HTTP 200 before Railway sends traffic to the new deployment.

Security model:

- `/health` is public and not rate-limited so Railway healthchecks remain reliable.
- App-facing `/api/*` routes require `Authorization: Bearer $API_GATEWAY_SECRET` or `X-StreamOS-API-Secret`.
- External stream webhooks require raw-body HMAC headers
  `X-StreamOS-Event-Id`, `X-StreamOS-Timestamp`, and
  `X-StreamOS-Signature`, derived from `STREAM_EVENT_WEBHOOK_SECRET`.
- Gateway OAuth connect requests require a short-lived `handoff` token signed
  with `API_GATEWAY_SECRET`; callbacks validate one-time state plus PKCE before
  encrypted token persistence, then redirect to the safe `return_to` target or
  `CONNECT_SUCCESS_REDIRECT`.
- TikTok and Kick OAuth are gateway-owned. Their client secrets must stay in
  Railway only, and provider tokens must never be proxied through browser code.
- `API_GATEWAY_SECRET` and `STREAM_EVENT_WEBHOOK_SECRET` are mandatory when `NODE_ENV=production`; the service fails during startup if either is missing.
- `STREAM_EVENT_WEBHOOK_SECRET` is the canonical Twitch EventSub secret name. `TWITCH_EVENTSUB_SECRET` and `TWITCH_WEBHOOK_SECRET` are legacy fallbacks only.
- `YOUTUBE_WEBSUB_SECRET` is the canonical YouTube WebSub secret name and is used for both HMAC signatures and GET verification unless a legacy `YOUTUBE_WEBSUB_VERIFY_TOKEN` override is explicitly set.
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
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_TIMEOUT_SECONDS=30
OPENAI_MAX_TRANSCRIPTION_MEDIA_BYTES=25000000
STREAMOS_E2E_MODE=false
TRANSCRIPTION_PROCESSOR_MODE=openai
RAILWAY_HEALTHCHECK_TIMEOUT_SEC=30
```

`OPENAI_MODEL` is reserved for complex analysis tasks.

`REPLICATE_API_TOKEN` is not required for the current OpenAI-only runtime.
Leave it unset until a Replicate processor is actually implemented.

Keep public networking disabled for steady-state production. During first deploy only, you may temporarily enable a Railway public domain to smoke-test `/health`, then remove it and verify from a Railway worker shell with `node scripts/check-deployment.cjs --expect-private-automation`.

Validation:

```bash
python -m pytest services/automation-service
```

## Railway Worker Dyno: `workers/clip-worker`

The clip worker is a Node.js BullMQ consumer. It consumes the same
`streamos-clip-generation` queue that upstream services produce, calls FastAPI
for clip analysis, and persists derived highlights, clips, and export drafts in
Supabase.

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

## Railway Worker Dyno: `workers/stream-job-worker`

The stream job worker consumes normalized provider webhook events from the
`streamos-media` queue, upserts `streams`, and creates durable `content_jobs`
rows for downstream processing. It must not depend on provider client secrets or
call `services/automation-service` directly.

Recommended Docker configuration:

| Setting           | Value                          |
| ----------------- | ------------------------------ |
| Dockerfile Path   | `Dockerfile.stream-job-worker` |
| Service Type      | Worker                         |
| Public Networking | Disabled                       |

Required variables:

```bash
REDIS_URL=rediss://default:password@host:6379
QUEUE_DEFAULT_NAME=streamos-media
STREAM_JOB_QUEUE_NAME=streamos-media
STREAM_JOB_WORKER_CONCURRENCY=5
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
STREAM_JOB_ALERT_WEBHOOK_URL=
```

Validation:

```bash
pnpm --filter stream-job-worker lint
pnpm --filter stream-job-worker build
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

Run the rollout gate before promoting a deployment from a checked-out copy of
the repository. This is the pre-promotion gate because it combines tenant
security validation, API Gateway integration tests, signed-webhook tests, the
transcription E2E path, and service health checks in one ordered command.

```bash
pnpm rollout:check -- --env-file=.env.test
```

For deployed environments, use a separate remote smoke verification from a
Railway service that can reach private networking. The worker images now bundle
`scripts/check-deployment.cjs`, so `transcription-worker`, `clip-worker`,
`stream-job-worker`, or `content-job-retry-worker` can be used as the SSH
entrypoint. A supported remote path is:

```bash
pnpm deployment:check:remote -- \
  --project-id=<railway-project-id> \
  --environment=production \
  --service=transcription-worker \
  --identity-file=$HOME/.ssh/railway_verifier \
  --api-gateway-url=https://streamos-api-gateway.up.railway.app \
  --automation-service-url=http://automation-service.railway.internal:8000 \
  --expect-private-automation
```

The repository also includes a manual GitHub Actions workflow,
`Railway Smoke Verification`, which wraps the same SSH-based check for staging
or production. Configure these secrets before using it:

- `RAILWAY_PROJECT_ID`
- `RAILWAY_API_TOKEN`
  Use a workspace-scoped Railway API token for CI verification.
- `RAILWAY_VERIFIER_SSH_PRIVATE_KEY`
  Register the matching public key as a Railway workspace SSH key.

You can optionally store `API_GATEWAY_URL` as a GitHub Environment variable on
`staging` and `production`, otherwise pass it as a workflow input.

Do not promote when `rollout:check` fails. Treat the remote Railway smoke check
as the deployed-environment confirmation that `/health` passes from both the
public gateway and the private Automation Service path.

The private Automation Service check cannot succeed from a local shell or
Vercel because Railway private networking is not public internet. The SSH-based
workflow follows Railway's documented `railway ssh` single-command mode and its
workspace SSH key model.
