# StreamOS Deployment

This document defines the production deployment topology for the StreamOS monorepo.

## Target Topology

| Path                               | Runtime               | Platform                                                       | Purpose                                                                                          |
| ---------------------------------- | --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `apps/web`                         | Next.js App Router    | Vercel                                                         | Dashboard, Supabase SSR Auth, app-facing BFF routes                                              |
| `services/api-gateway`             | Node.js               | Railway                                                        | Public API gateway, platform OAuth, server-only mutations, webhook ingress, BullMQ job producers |
| `services/automation-service`      | FastAPI               | Railway first, Fly.io when GPU or regional compute is required | Server-side AI and clip automation APIs                                                          |
| `workers/stream-job-worker`        | Node.js BullMQ Worker | Railway Worker Dyno                                            | Canonical `streamos-media` consumer for stream materialization and transcription fan-out         |
| `workers/transcription-worker`     | Node.js BullMQ Worker | Railway Worker Dyno                                            | Long-running transcription consumer that calls FastAPI                                           |
| `workers/content-job-retry-worker` | Node.js BullMQ Worker | Railway Worker Dyno                                            | Requeues retryable failed `content_jobs` into BullMQ                                             |
| `release-gate-runner`              | Node.js operator shell | Railway private worker/service                                | Proof-only runtime for `pnpm rollout:check:production` using the gate-required release-candidate snapshot |

## Service Boundaries

- Browser code must call the Next.js app or `services/api-gateway`; it must not call AI providers directly.
- `services/api-gateway` is the public backend entrypoint for external webhooks, app-facing backend APIs, platform OAuth flows, provider token refresh, metrics writes, and queue-producing commands.
- `services/automation-service` should use private Railway networking in production. Do not call it from browser code or Vercel client bundles; only Railway services/workers in the same project/environment should call it.
- `workers/stream-job-worker` is the only canonical `streamos-media` consumer. It materializes `streams`, creates durable `content_jobs`, and enqueues canonical `transcription.trigger` jobs only when a media event already includes enough transcription input such as `vodAssetUrl`.
- `workers/transcription-worker` consumes only `streamos-transcription`, calls `services/automation-service`, and writes transcription job status plus derived transcript state to Supabase.
- `workers/content-job-retry-worker` owns retry orchestration for failed `content_jobs`; it uses the Supabase service-role key server-side and requeues only supported job payloads. Row-level `content_jobs.max_retries` is the source of truth for retry budget, including manual retries from the dashboard.
- `release-gate-runner` is not a product service. It exists only to provide a Railway-internal shell/runtime that contains the same gate-required release-candidate snapshot as the services under test, so `pnpm rollout:check:production` can run with private Automation Service reachability and the required monorepo sources.
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
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_REDIRECT_URI=https://streamos-api-gateway.up.railway.app/api/auth/twitch/callback
TWITCH_SCOPES=user:read:email moderator:read:followers
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

Twitch, YouTube, TikTok, and Kick OAuth are gateway-owned and must use the API
Gateway callback URLs shown above.

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

`OPENAI_MODEL` is reserved for complex analysis tasks. `OPENAI_TITLE_MODEL`
remains a server-only reserved setting for a future canonical title-generation
or repurposing contract; the active production endpoints are
`/clips/analyze` and `/transcriptions/process`.

Keep public networking disabled for steady-state production. During first deploy only, you may temporarily enable a Railway public domain to smoke-test `/health`, then remove it and verify from the dedicated `release-gate-runner` Railway shell with `node scripts/check-deployment.cjs --expect-private-automation`.

Validation:

```bash
python -m pytest services/automation-service
```

## Railway Worker Dyno: `workers/stream-job-worker`

The stream job worker is the canonical `streamos-media` consumer. It
materializes `streams`, persists durable `content_jobs`, and fans out to
`streamos-transcription` only when the incoming media event already carries the
required transcription input such as `vodAssetUrl`.

Recommended Docker configuration:

| Setting           | Value                           |
| ----------------- | ------------------------------- |
| Dockerfile Path   | `Dockerfile.stream-job-worker`  |
| Service Type      | Worker                          |
| Public Networking | Disabled                        |

Required variables:

```bash
REDIS_URL=rediss://default:password@host:6379
TRANSCRIPTION_QUEUE_NAME=streamos-transcription
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Optional variables:

```bash
QUEUE_DEFAULT_NAME=streamos-media
STREAM_JOB_QUEUE_NAME=streamos-media
STREAM_JOB_WORKER_CONCURRENCY=5
STREAM_JOB_ALERT_WEBHOOK_URL=
```

This worker must not call `AUTOMATION_SERVICE_URL` and must not depend on
provider client secrets. Raw provider webhooks without `vodAssetUrl` must stay
limited to stream materialization only.

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
`release-gate-runner`; if that service is missing in the audited environment,
the environment is not proof-ready.

For a deployed release candidate, run the production gate from the dedicated
`release-gate-runner` runtime, or an equivalent Railway shell that contains the
same gate-required release-candidate snapshot, in the same Railway project and
the same Railway environment as the candidate:

```bash
pnpm rollout:check:production -- \
  --api-gateway-url https://streamos-api-gateway.up.railway.app \
  --automation-service-url http://automation-service.railway.internal:8000
```

Do not promote when the production gate fails. Successful package tests, builds,
or a green local diagnostic are not enough on their own. The transcription E2E
over the real Media -> Transcription path remains mandatory for promotion.

Before running the gate, verify these provenance points from the runner itself:

- the Railway service name is exactly `release-gate-runner`
- the runner belongs to the same Railway project and target environment as the
  release candidate
- the deployed commit matches the release-candidate commit you intend to
  promote
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
- `audit-premerge-cross-env.md` has no `MISSING`, `DANGEROUS_EXPOSURE`, or
  real `STAGING_DRIFT` blockers
- `audit-baseline-staging.md` is only committed when the staging-only run has
  no blocker-worthy findings
- `audit-premerge-cross-env.md` remains a local review artifact and is not
  committed
