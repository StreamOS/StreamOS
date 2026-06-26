# StreamOS Monorepo

**StreamOS** is an AI-assisted creator operations platform for streamers, creators, and content teams. It combines discoverability, SEO, monetization insights, content automation, branding tools, multi-platform management, publishing workflows, and analytics in one modular product surface.

This README is the operational entry point for local development, Codex work, validation, deployment awareness, and safe operator handoff.

Last updated: **2026-06-26**

---

## 1. Current Status Snapshot

StreamOS is currently in a **maintenance and stabilization-first phase** while product modules continue to move forward in small, reviewable slices.

Active priorities:

1. Keep Security, CodeQL, Env, Auth, OAuth, Gateway, Worker, and Release-Gate findings clean.
2. Keep provider OAuth and provider writes gateway-owned/server-owned.
3. Keep dashboard modules creator-safe, tenant-scoped, and browser-safe.
4. Expand product modules only on top of existing contracts.
5. Treat staging/production proof as separate from local validation.

Active dashboard/product surfaces:

- Growth / SEO Intelligence: `/dashboard/growth`
- Analytics Expansion: `/dashboard/analytics`
- Monetization Dashboard: `/dashboard/monetization`
- Branding Dashboard: `/dashboard/branding`
- Jobs / Publications / Schedule surfaces where enabled by the current branch

Current product rule:

> Read-first and tenant-safe surfaces are preferred before new write-heavy flows. Provider writes, publishing, reconciliation, storage policy changes, and production gates require explicit operator awareness.

---

## 2. Source of Truth

Use these files in this order when resolving conflicts:

1. Current task or operator instruction.
2. `README.md` for local setup, repo orientation, and common commands.
3. `architecture.md` or `docs/architecture.md` for service boundaries and data ownership.
4. `deployment.md` or `docs/deployment.md` for runtime topology, environment ownership, audits, and gates.
5. `AGENTS.md` for Codex behavior inside the repository.
6. Existing code, package-local README files, tests, scripts, and migrations.

Conflict rules:

- For security, use the stricter rule.
- For service ownership, use `architecture.md`.
- For production/deployment behavior, use `deployment.md`.
- For current prioritization, use the roadmap document or latest operator instruction.
- Never invent secrets, private URLs, provider credentials, or production state in documentation.

---

## 3. Workspace

StreamOS is a `pnpm` workspace and Turborepo monorepo.

```text
StreamOS/
|-- apps/
|   `-- web/                              # Next.js App Router dashboard
|-- services/
|   |-- api-gateway/                      # Public backend entrypoint, OAuth, webhooks, BFF, queue producers
|   `-- automation-service/               # FastAPI service for AI, transcription, clip analysis, repurposing
|-- workers/
|   |-- stream-job-worker/                # Canonical streamos-media consumer
|   |-- transcription-worker/             # Canonical streamos-transcription consumer
|   |-- clip-worker/                      # Canonical streamos-clip-generation consumer
|   |-- repurposing-worker/               # Canonical streamos-repurposing consumer
|   |-- publishing-worker/                # Canonical streamos-publishing consumer
|   |-- publishing-scheduler-worker/      # Private scheduler for due publication jobs
|   `-- content-job-retry-worker/         # Durable failed content_jobs retry orchestration
|-- packages/
|   |-- config/                           # Shared TypeScript / lint / build config
|   |-- database/                         # Supabase migrations, DB contracts, generated types
|   |-- queue/                            # Shared queue contracts and helpers where present
|   |-- types/                            # Shared domain contracts
|   |-- ui/                               # Reusable UI primitives, not product-specific dashboard widgets
|   `-- utils/                            # Shared utilities where present
|-- docs/
|   `-- ...
|-- scripts/                              # Audits, rollout checks, E2E helpers, env policies
|-- pnpm-workspace.yaml
`-- turbo.json
```

The production frontend lives in `apps/web`. Do not recreate the removed root Vite/Electron prototype. New frontend work should target `apps/web/src` unless a task explicitly changes workspace architecture.

---

## 4. Runtime Ownership Matrix

| Runtime                     | Owner path                            | Platform                               | Owns                                                                                       | Must not own                                                                                      |
| --------------------------- | ------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Web dashboard               | `apps/web`                            | Vercel                                 | Dashboard UI, SSR auth, app-facing BFF/server actions, gateway handoff start               | Provider secrets, OpenAI keys, Redis, Supabase service-role, encryption keys, provider write APIs |
| API Gateway                 | `services/api-gateway`                | Railway                                | OAuth, webhooks, provider sync, server mutations, queue producers, protected observability | Browser token exposure, raw secret logging                                                        |
| Automation Service          | `services/automation-service`         | Railway first / Fly.io later if needed | Transcription, clip analysis, repurposing plans, AI processing                             | Browser access, public AI endpoint                                                                |
| Stream Job Worker           | `workers/stream-job-worker`           | Railway worker                         | `streamos-media` consumption, streams/content_jobs materialization, transcription fan-out  | Automation Service calls unless explicitly part of contract                                       |
| Transcription Worker        | `workers/transcription-worker`        | Railway worker                         | `streamos-transcription`, Automation Service transcription calls, transcript persistence   | Provider writes                                                                                   |
| Clip Worker                 | `workers/clip-worker`                 | Railway worker                         | `streamos-clip-generation`, clip scoring/analysis persistence                              | Provider secrets unless future contract requires them                                             |
| Repurposing Worker          | `workers/repurposing-worker`          | Railway worker                         | `streamos-repurposing`, manual-review-only plan persistence                                | Auto-publishing                                                                                   |
| Publishing Worker           | `workers/publishing-worker`           | Railway worker                         | Approved publication execution and reconciliation                                          | Public networking, browser access, Automation Service dependency                                  |
| Publishing Scheduler Worker | `workers/publishing-scheduler-worker` | Railway worker                         | Claim due scheduled publications and enqueue deterministic publish jobs                    | Provider APIs, Automation Service calls, public networking                                        |
| Retry Worker                | `workers/content-job-retry-worker`    | Railway worker                         | Retry failed `content_jobs` into supported queues                                          | Cross-queue ownership drift                                                                       |
| Release Gate Runner         | `release-gate-runner`                 | Railway private proof runtime          | Production gate proof from same RC snapshot/environment                                    | Product traffic, queue consumption, public URL                                                    |

---

## 5. Active Application Shape

Production frontend work belongs under `apps/web/src`.

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

Frontend placement rules:

- App Router routes, layouts, route handlers, and server actions belong in `apps/web/src/app`.
- Product dashboard pages belong under `apps/web/src/app/dashboard`.
- Product-specific widgets belong in `apps/web/src/components/modules` unless the existing branch colocates them differently.
- Reusable low-level UI belongs in `components/ui`; only broadly reused UI belongs in `packages/ui`.
- Server components are the default. Add `"use client"` only for interactivity, charts, browser APIs, client effects, or client-side state.
- Durable data should come from server fetches, Supabase, gateway calls, or worker-generated persistence, not long-lived client global state.

---

## 6. Service Boundaries

### Browser and `apps/web`

Allowed:

- Render dashboard modules.
- Protect routes with Supabase SSR session checks.
- Start gateway handoff flows after session validation.
- Call gateway-owned server mutations through approved server-side paths.
- Display creator-safe read models.

Forbidden:

- Direct OpenAI, Replicate, Whisper, or AI provider calls.
- Supabase service-role usage in browser/client-near code.
- Provider token exchange, refresh, decryption, or persistence.
- Direct provider write APIs.
- Redis access.
- Railway private service URLs.
- Storing provider secrets or webhook secrets in Vercel web environments.

### `services/api-gateway`

Owns:

- OAuth connect/callback for Twitch, YouTube, TikTok, and Kick.
- Handoff token verification, PKCE, state, callback validation, token exchange.
- Encrypted provider token persistence.
- Provider profile/channel upsert.
- Webhook validation, replay protection, rate limiting.
- Queue-producing commands.
- Publication, fanout, publish, reconcile, and schedule-related server contracts.
- Protected observability routes.

### `services/automation-service`

Owns AI and media analysis:

- `/transcriptions/process`
- `/clips/analyze`
- `/repurposing/plan`
- future title, SEO, and recommendation contracts

It should be private in production. Browser and Vercel client bundles must not call it.

### Workers

Worker rules:

- Each worker consumes only its canonical queue or poll scope.
- Workers are private Railway background services.
- Python does not consume BullMQ directly.
- Job payloads must not contain secrets.
- Retry, idempotency, status persistence, and secret-safe logs are mandatory for queue changes.

---

## 7. Installation

Prerequisites:

- Node.js version supported by the repository and deployment target.
- Corepack-enabled `pnpm`.
- Python **3.12** for `services/automation-service` tests.
- Docker only when using local infrastructure via `pnpm infra:*`.
- Supabase project or local Supabase stack when DB-backed flows are needed.
- Redis when queue/worker flows are tested outside Compose.

Install dependencies from the repository root:

```bash
pnpm install
```

Python validation uses `.venv` when available. If your Python 3.12 binary is outside the default path, set `STREAMOS_PYTHON` in your shell before validation.

---

## 8. Environment Setup

Create local environment files from examples:

```bash
cp apps/web/.env.local.example apps/web/.env.local
cp .env.compose.example .env
cp .env.test.example .env.test
```

Fill values from the correct owner runtime only. Do not copy production secret values into documentation, screenshots, commits, or reports.

### Web-owned environment values

`apps/web` may use only browser-safe or web-server-owned values such as:

```bash
APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
STREAMOS_DEMO_MODE=false
API_GATEWAY_URL=http://localhost:4000
API_GATEWAY_SECRET=
```

`API_GATEWAY_SECRET` is server-side in the web runtime for trusted gateway calls and handoff generation. It must not be exposed to browser bundles.

Never place these in `apps/web/.env.local`, Vercel web env, or `NEXT_PUBLIC_*`:

```bash
APP_ENCRYPTION_KEY=
OPENAI_API_KEY=
REPLICATE_API_TOKEN=
REDIS_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=
STREAM_EVENT_WEBHOOK_SECRET=
TWITCH_CLIENT_SECRET=
YOUTUBE_CLIENT_SECRET=
TIKTOK_CLIENT_SECRET=
KICK_CLIENT_SECRET=
```

### API Gateway-owned environment values

`services/api-gateway` owns provider credentials, webhook secrets, Redis, service-role access, and encryption:

```bash
NODE_ENV=production
PORT=4000
REDIS_URL=
API_GATEWAY_SECRET=
API_GATEWAY_ALLOWED_ORIGINS=
STREAM_EVENT_WEBHOOK_SECRET=
APP_ENCRYPTION_KEY=
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

Use placeholders only in documentation. Real values belong in local env files or platform secret stores.

### Automation Service-owned environment values

```bash
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_TITLE_MODEL=
OPENAI_TRANSCRIPTION_MODEL=
OPENAI_TIMEOUT_SECONDS=
OPENAI_MAX_TRANSCRIPTION_MEDIA_BYTES=
REPLICATE_API_TOKEN=
```

OpenAI keys are server-only and belong to `services/automation-service`.

### Worker-owned environment values

Workers typically own:

```bash
REDIS_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
AUTOMATION_SERVICE_URL=
```

Only workers that call the Automation Service should have `AUTOMATION_SERVICE_URL`. Publishing and scheduler workers must not depend on it under the current contract.

---

## 9. Local Development

### Dashboard only

```bash
pnpm --filter @streamos/web dev
```

Dashboard URL:

```text
http://localhost:3000/dashboard
```

### Reset stale web build output

If Next.js fails with stale or corrupt build artifacts, for example `Cannot find module './7751.js'` or `__webpack_modules__[moduleId] is not a function`, clear only generated web output:

```bash
pnpm clean:web
pnpm --filter @streamos/web dev
```

Do not manually delete source files, env files, migrations, or package metadata as part of this cleanup.

### Full local infrastructure

Start Redis, API Gateway, Automation Service, and workers through the repo infrastructure scripts:

```bash
pnpm infra:up
pnpm infra:ps
```

Expected local endpoints:

```text
Web dashboard:       http://localhost:3000/dashboard
API Gateway health:  http://localhost:4000/health
Automation health:   http://localhost:8000/health
Redis:               localhost:6379
```

Check API Gateway health:

```bash
curl http://localhost:4000/health
```

Watch logs:

```bash
pnpm infra:logs
```

Stop infrastructure:

```bash
pnpm infra:down
```

Compose reads root env values for Supabase and service-role use. Use `SUPABASE_DOCKER_URL=http://host.docker.internal:54321` when Docker workers need to reach a Supabase CLI stack running on the host.

---

## 10. Queue and Worker Contracts

StreamOS uses BullMQ with Redis. BullMQ semantics are Node-owned.

| Queue / poll scope         | Producer                                | Consumer                              | Purpose                                                         |
| -------------------------- | --------------------------------------- | ------------------------------------- | --------------------------------------------------------------- |
| `streamos-media`           | API Gateway                             | `workers/stream-job-worker`           | Stream/media events, durable stream/content job materialization |
| `streamos-transcription`   | Stream job worker / gateway-owned flows | `workers/transcription-worker`        | Transcription trigger processing                                |
| `streamos-clip-generation` | Transcription or app-facing server flow | `workers/clip-worker`                 | Clip scoring and highlight analysis                             |
| `streamos-repurposing`     | Stream job worker / gateway-owned flows | `workers/repurposing-worker`          | Manual-review-only repurposing plan generation                  |
| `streamos-publishing`      | API Gateway / scheduler worker          | `workers/publishing-worker`           | Approved publication execution and reconciliation               |
| due scheduled publications | Supabase polling                        | `workers/publishing-scheduler-worker` | Claim due schedules and enqueue deterministic publish jobs      |
| failed `content_jobs`      | Supabase polling                        | `workers/content-job-retry-worker`    | Requeue retryable failed content jobs                           |

Queue rules:

- Queue names must come from env/config or existing shared contracts.
- Producers and consumers must agree on payload shape and queue name.
- Duplicate provider events must be idempotent or deduplicated.
- `content_jobs` remains the durable source of truth for user-visible job state.
- Retry state must preserve `retry_count`, `max_retries`, `next_retry_at`, and `error_message`.
- Logs and job payloads must not contain provider tokens, API keys, private URLs, or raw secret-bearing payloads.

---

## 11. E2E and Rollout Checks

Safe local job E2E path:

```bash
pnpm e2e:jobs
```

Full transcription E2E through Redis, API Gateway, stream job worker, transcription worker, and automation service:

```bash
pnpm e2e:transcription
pnpm e2e:transcription -- --expect=failed
```

Operator-level local rollout diagnostic:

```bash
pnpm rollout:check:local
```

Production rule:

> A green local diagnostic is useful, but it is never a production pass.

Promotable production checks must run from `release-gate-runner` or an equivalent proof-capable Railway runtime that:

- is deployed from the same release-candidate SHA,
- belongs to the same Railway project/environment,
- can reach the private Automation Service,
- contains the required root scripts and workspace sources,
- does not perform real third-party provider writes.

Hosted production transcription E2E requires a non-sensitive public fixture asset through `TRANSCRIPTION_E2E_FIXTURE_ASSET_URL` or `--fixture-asset-url`. Do not use localhost, private URLs, signed query strings, credential-bearing links, Railway private URLs, or placeholder hosts.

---

## 12. Validation Matrix

Run the narrowest useful validation first, then broader validation when a change crosses boundaries.

### Root / cross-workspace

```bash
pnpm validate
```

### Web dashboard

```bash
pnpm --filter @streamos/web lint
pnpm --filter @streamos/web test
pnpm --filter @streamos/web build
```

### API Gateway

```bash
pnpm --filter @streamos/api-gateway lint
pnpm --filter @streamos/api-gateway test
pnpm --filter @streamos/api-gateway build
```

### Automation Service

```bash
python -m pytest services/automation-service
```

### Workers

```bash
pnpm --filter stream-job-worker lint
pnpm --filter stream-job-worker test
pnpm --filter stream-job-worker build

pnpm --filter @streamos/transcription-worker lint
pnpm --filter @streamos/transcription-worker test
pnpm --filter @streamos/transcription-worker build

pnpm --filter @streamos/clip-worker lint
pnpm --filter @streamos/clip-worker test
pnpm --filter @streamos/clip-worker build

pnpm --filter @streamos/repurposing-worker lint
pnpm --filter @streamos/repurposing-worker test
pnpm --filter @streamos/repurposing-worker build

pnpm --filter @streamos/publishing-worker lint
pnpm --filter @streamos/publishing-worker test
pnpm --filter @streamos/publishing-worker build

pnpm --filter @streamos/publishing-scheduler-worker lint
pnpm --filter @streamos/publishing-scheduler-worker test
pnpm --filter @streamos/publishing-scheduler-worker build

pnpm --filter @streamos/content-job-retry-worker lint
pnpm --filter @streamos/content-job-retry-worker test
pnpm --filter @streamos/content-job-retry-worker build
```

If a package filter differs in the actual `package.json`, use the actual package name. Do not rename packages just to match documentation.

### Audits

Vercel env audit after `vercel pull` and before build:

```bash
pnpm vercel:audit -- --vercel-dir .vercel --environment development
pnpm vercel:audit -- --vercel-dir .vercel --environment preview
pnpm vercel:audit -- --vercel-dir .vercel --environment production
```

Railway audit examples:

```bash
pnpm railway:audit --env staging --format markdown > audit-baseline-staging.md
pnpm railway:audit --env staging --format json > audit-staging.json
pnpm railway:audit --env production --format markdown > audit-production.md
pnpm railway:audit --environments staging,production --format markdown > audit-premerge-cross-env.md
```

Audit reports must not contain secret values. If an audit report leaks a value, treat that as a blocker.

---

## 13. Supabase, RLS, and Storage

Supabase/PostgreSQL is the primary data layer. Migrations live in:

```text
packages/database/supabase/migrations/
```

Rules:

- Released migrations are not rewritten. Add a new migration for schema changes.
- Tenant-owned tables need `user_id` unless a documented exception exists.
- RLS must scope authenticated access to the owning user/tenant.
- Service-managed columns are not client-writable.
- `platform_connections` token columns stay hidden from normal authenticated reads.
- Service-role keys stay server-side in API Gateway, workers, automation-service, proof runtime, or other trusted server-only contexts.
- Runtime state for `content_jobs`, publications, media processing, and provider-backed data is mutated by services/workers, not by client code.

Current important entities include:

```text
creators
user_profiles
channels
platform_connections
metrics_snapshots
streams
content_jobs
content_publications
content_publication_events
content_publication_fanouts
content_publication_fanout_targets
content_publication_scheduler_runs
content_publication_scheduler_run_attempts
vod_assets
stream_transcripts
stream_highlights
clips
clip_exports
brand_assets
monetization_events
monetization_summaries
youtube_websub_subscriptions
```

### Branding storage

Branding uses a private Storage-first model:

- `brand-assets` bucket stays private.
- Object paths start with the owning `auth.uid()` value.
- Signed preview URLs are generated server-side.
- Durable `public_url` storage is avoided.
- SVG is blocked in the MVP unless a safe sanitizing flow is explicitly added.
- Replace semantics and orphan cleanup are separate slices unless already implemented in the target branch.

---

## 14. Gateway-Owned OAuth

Twitch, YouTube, TikTok, and Kick OAuth are gateway-owned.

Flow:

1. User is authenticated in `apps/web` through Supabase SSR.
2. `apps/web` creates a short-lived signed handoff token.
3. Browser is redirected to API Gateway connect route.
4. API Gateway owns PKCE, one-time state, provider redirect, callback validation, token exchange, provider profile lookup, encrypted token persistence, channel upsert, and safe return redirect.
5. Provider tokens never pass through browser code.

Gateway routes:

```text
GET /api/auth/:provider/connect?handoff=<signed-token>
GET /api/auth/:provider/callback
```

Web-owned handoff config:

```bash
APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
API_GATEWAY_URL=http://localhost:4000
API_GATEWAY_SECRET=
```

Gateway-owned provider config:

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
KICK_SCOPES=user:read channel:read events:subscribe channel:follow channel:subscription
```

Redirect URI changes require operator action in provider consoles.

---

## 15. Publishing, Fanout, Scheduling, and Reconcile

Publishing is server-owned and review-oriented.

Rules:

- Repurposing remains manual-review-only until a user/operator approves publication.
- Browser code may request server-owned actions; it must not call provider write APIs directly.
- API Gateway validates tenant, platform connection, provider eligibility, scope, publication snapshot, schedule policy, and status.
- Publishing worker executes approved provider writes server-side.
- Scheduler worker only claims due schedules and enqueues deterministic `publication.publish` jobs.
- Scheduler must not call provider APIs or the Automation Service.
- Reconciliation stays server-side and secret-safe.
- Staging/production proofs must not execute real third-party writes.

Relevant gateway contracts:

```text
POST /api/content-publications
POST /api/content-publications/fanout
POST /api/content-publications/:id/publish
POST /api/content-publications/:id/reconcile
GET  /api/observability/scheduler
```

Relevant dashboard read surface:

```text
GET /dashboard/publications/schedule
```

Provider-native scheduling is only a secondary policy hint. StreamOS remains the primary schedule authority.

---

## 16. AI Provider Secrets and Cost Control

OpenAI and other AI provider credentials are server-only.

Never define:

```bash
NEXT_PUBLIC_OPENAI_KEY=
NEXT_PUBLIC_OPENAI_API_KEY=
```

Active automation endpoints:

```text
POST /transcriptions/process
POST /clips/analyze
POST /repurposing/plan
```

AI/automation rules:

- Browser never calls AI providers directly.
- Long-running media work is queued.
- Inputs must be size-limited and validated.
- Timeouts and retries must be bounded.
- Logs must not contain secrets or sensitive raw payloads.
- Outputs that affect publishing, sponsorship, revenue reporting, or brand-facing assets need manual review.
- Cost-sensitive flows must document model choice, max input size, timeout, and retry behavior.

---

## 17. Deployment Overview

Deployment topology:

| Path                          | Platform                | Notes                                                      |
| ----------------------------- | ----------------------- | ---------------------------------------------------------- |
| `apps/web`                    | Vercel                  | Root directory `apps/web`; browser-safe env only           |
| `services/api-gateway`        | Railway                 | Public service with `/health`, protected app-facing routes |
| `services/automation-service` | Railway / Fly.io later  | Private in production                                      |
| `workers/*`                   | Railway worker dynos    | Private, no public domains                                 |
| `release-gate-runner`         | Railway private runtime | Proof-only, not a product service                          |

Vercel build command:

```bash
pnpm --filter @streamos/web... --if-present build
```

API Gateway health:

```text
/health
```

Production release rules:

- Do not promote on local validation alone.
- Do not promote with missing service inventory.
- Do not promote if required workers are absent.
- Do not promote if worker public networking is enabled.
- Do not promote if `apps/web` contains gateway/provider/worker-only secrets.
- Do not promote if staging/production evidence is incomplete or contradictory.
- Do not perform real provider writes in proof runs.

---

## 18. Required GitHub Secrets

Use GitHub repository or environment secrets. Do not commit these values.

```bash
VERCEL_TOKEN=
VERCEL_ORG_ID=
VERCEL_PROJECT_ID=
RAILWAY_PROJECT_ID=
RAILWAY_TOKEN_STAGING=
RAILWAY_TOKEN_PRODUCTION=
RAILWAY_SSH_PRIVATE_KEY_PRODUCTION=
SUPABASE_DB_URL_STAGING=
SUPABASE_DB_URL_PRODUCTION=
DISCORD_WEBHOOK_URL=
```

Notes:

- `DISCORD_WEBHOOK_URL` is optional.
- Production and staging should be protected GitHub Environments.
- Production requires manual approval before deployment or migration jobs when configured.
- Do not print Railway tokens, private SSH keys, Supabase service-role keys, provider secrets, or DB URLs in logs, reports, screenshots, or runbooks.

---

## 19. Troubleshooting

### Stale Next.js artifact

Symptoms:

```text
Cannot find module './7751.js'
__webpack_modules__[moduleId] is not a function
```

Recovery:

```bash
pnpm clean:web
pnpm --filter @streamos/web dev
```

Escalate only if the clean rebuild fails.

### API Gateway crash

Initial read-only triage:

1. Confirm the target environment and release-candidate SHA.
2. Check `/health` if reachable.
3. Inspect secret-safe logs for startup failure class.
4. Verify required env names exist on `services/api-gateway`.
5. Confirm no web-only or worker-only env drift.
6. Run or review `pnpm railway:audit` output for the target environment.
7. Check Redis connectivity and mandatory production env contract.
8. Do not change production secrets or provider console settings without operator approval.

Likely areas:

- missing `API_GATEWAY_SECRET`, `STREAM_EVENT_WEBHOOK_SECRET`, or `REDIS_URL`,
- invalid `APP_ENCRYPTION_KEY`,
- CORS/origin mismatch,
- Railway service bound to wrong project/environment,
- schema or queue contract drift,
- deployment from wrong commit.

### Worker crash loop

Check:

- service inventory,
- public networking disabled,
- required env names,
- correct Dockerfile,
- correct package filter/build target,
- Redis reachability,
- Supabase service-role access,
- private `AUTOMATION_SERVICE_URL` only for workers that need it,
- no public Automation Service fallback.

### Hosted proof failure

Classify first:

- local diagnostic failure,
- staging proof blocker,
- production gate blocker,
- evidence incomplete,
- real runtime failure.

Do not treat local Docker/network failures as production proof failures. Do not treat a successful local diagnostic as production approval.

---

## 20. Codex Operating Contract

Codex should follow this sequence for repository work:

1. Identify task type and affected module.
2. Read relevant repository context before changing files.
3. Map correct service boundary and data ownership.
4. Search existing patterns before adding new abstractions.
5. Make the smallest safe change that satisfies the task.
6. Preserve tenant isolation, server/client boundaries, and secret handling.
7. Add or update tests close to changed behavior.
8. Run narrow validation first; broaden if the change crosses boundaries.
9. Report changed files, validation results, assumptions, risks, and follow-ups.

Codex must not:

- move provider/OAuth/token logic into browser code,
- expose service-role keys or provider secrets,
- add new dependencies without checking existing alternatives,
- rewrite released migrations,
- make workers public,
- use suppression instead of fixing security findings,
- run destructive or production-changing commands without operator approval,
- claim validation passed if it was not run.

---

## 21. Operator Gates

Operator approval is required before:

- adding/changing real secrets,
- provider developer console changes,
- OAuth redirect URI changes,
- staging or production deployments,
- production gate / release promotion,
- destructive or risky migrations,
- real provider publishing, crossposting, or reconciliation,
- payment/monetization provider writes,
- high-cost AI workflows,
- changing public/private networking of Railway services.

No operator gate is needed for:

- local repo analysis,
- isolated tests,
- safe documentation updates,
- read-only dashboard modules,
- mock/demo UI work,
- local validation without secrets or production effects.

---

## 22. Current Product Surfaces

Use this as a product orientation, not as a replacement for current branch inspection.

| Surface                   | Route / area                       | Current preferred mode                                        | Safety rule                                                                  |
| ------------------------- | ---------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Growth / SEO Intelligence | `/dashboard/growth`                | Read-first intelligence surface                               | No OpenAI/browser side effects unless server contract exists                 |
| Analytics                 | `/dashboard/analytics`             | Tenant-scoped read model                                      | Server-owned syncs; no client provider secrets                               |
| Monetization              | `/dashboard/monetization`          | Read-first summaries/events                                   | No payment/provider writes from browser                                      |
| Branding                  | `/dashboard/branding`              | Private assets, read-first explorer, controlled upload slices | Private storage, signed previews, no durable public URLs, SVG blocked in MVP |
| Jobs                      | `/dashboard/jobs`                  | Runtime status visibility and controlled manual retry         | Runtime state remains service/worker-owned                                   |
| Publications              | `/dashboard/publications`          | Review, history, fanout, schedule read models                 | Provider writes server-owned                                                 |
| Schedule                  | `/dashboard/publications/schedule` | Calendar Light read model                                     | StreamOS-managed schedule is source of truth                                 |

---

## 23. Recommended Next Slices

Default order when no higher-priority bug or security finding is active:

1. **Security and stability closeout**
   - Keep CodeQL, dependency, env, auth, gateway, worker, and release-gate findings closed.
   - Treat new security findings as higher priority than product expansion.

2. **Gateway / Railway crash audit if runtime issue is active**
   - Audit API Gateway, worker inventory, env ownership, logs, health, queue/Redis, and schema drift.
   - Keep the audit read-only unless a concrete fix slice is created.

3. **OAuth regression coverage**
   - Expand gateway-owned Handoff, callback failure paths, encrypted token persistence, and redirect-safety tests.

4. **Branding MVP hardening**
   - Continue small slices around private asset previews, metadata completeness, replace semantics, and orphan cleanup.
   - Keep SVG blocked until a sanitizing path exists.

5. **Monetization provenance and coverage**
   - Improve freshness, source confidence, summary completeness, and read-model clarity before real sync expansion.

6. **Media / Export / Repurposing stability**
   - Improve job status, idempotency, retry observability, export safety, and manual-review provenance.

7. **Publishing / Scheduling controlled expansion**
   - Use staging proof before production-oriented approval.
   - Never include real third-party writes in proof runs.

---

## 24. Definition of Done

A StreamOS task is done only when:

- the requested behavior is satisfied,
- the correct service owns the behavior,
- tenant isolation is preserved,
- secrets remain server-only,
- RLS/service-role boundaries remain intact,
- provider/AI/queue actions are server-owned,
- UI has clear empty/loading/error states when UI is affected,
- worker and queue flows are idempotent or deduplicated where needed,
- environment ownership is documented when changed,
- tests or validation ran, or limitations are clearly reported,
- final report lists changed files, validations, architecture decisions, and remaining risks.

---

## 25. Fast Links

```text
Architecture:                 architecture.md or docs/architecture.md
Deployment:                   deployment.md or docs/deployment.md
Troubleshooting:              docs/troubleshooting.md
P4 Closeout:                  docs/p4-product-closeout.md
P4 Roadmap Update:            docs/p4-product-roadmap-update.md
```
