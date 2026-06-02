# StreamOS Deployment

This document defines the production deployment topology for the StreamOS monorepo.

## Target Topology

| Path                               | Runtime               | Platform                                                       | Purpose                                                   |
| ---------------------------------- | --------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| `apps/web`                         | Next.js App Router    | Vercel                                                         | Dashboard, auth surfaces, server route handlers           |
| `services/api-gateway`             | Node.js               | Railway                                                        | Public API gateway, webhook ingress, BullMQ job producers |
| `services/automation-service`      | FastAPI               | Railway first, Fly.io when GPU or regional compute is required | Server-side AI and clip automation APIs                   |
| `workers/transcription-worker`     | Node.js BullMQ Worker | Railway Worker Dyno                                            | Long-running transcription consumer that calls FastAPI    |
| `workers/content-job-retry-worker` | Node.js BullMQ Worker | Railway Worker Dyno                                            | Requeues retryable failed `content_jobs` into BullMQ      |

## Service Boundaries

- Browser code must call the Next.js app or `services/api-gateway`; it must not call AI providers directly.
- `services/api-gateway` is the public backend entrypoint for external webhooks and app-facing backend APIs.
- `services/automation-service` should use private Railway networking in production. Do not call it from browser code or Vercel client bundles; only Railway services/workers in the same project/environment should call it.
- `workers/transcription-worker` owns BullMQ consumption, calls `services/automation-service`, and writes job status to Supabase.
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

Required Vercel environment variables:

```bash
NEXT_PUBLIC_APP_URL=https://app.streamos.example
APP_ENV=production
STREAMOS_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
APP_ENCRYPTION_KEY=base64:replace-with-32-byte-key
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_REDIRECT_URI=https://app.streamos.example/api/platforms/twitch/callback
TWITCH_SCOPES=user:read:email
API_GATEWAY_URL=https://streamos-api-gateway.up.railway.app
```

Do not set `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_OPENAI_KEY`, or `NEXT_PUBLIC_OPENAI_API_KEY` in the Vercel browser-facing app unless a server route explicitly needs the server-only value.

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
STREAM_EVENT_WEBHOOK_SECRET=
RAILWAY_HEALTHCHECK_TIMEOUT_SEC=30
```

Use `/health` as the Railway healthcheck path. The endpoint must return HTTP 200 before Railway sends traffic to the new deployment.

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

Run these before promoting a deployment:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
python -m pytest services/automation-service
```

Smoke-test deployed services:

```bash
curl https://streamos-api-gateway.up.railway.app/health
node scripts/check-deployment.cjs \
  --api-gateway-url=https://streamos-api-gateway.up.railway.app \
  --automation-service-url=http://automation-service.railway.internal:8000 \
  --expect-private-automation
```

Run the private Automation Service check from a Railway shell or another Railway service in the same project/environment. It cannot succeed from a local shell or Vercel because Railway private networking is not public internet.
