# StreamOS Project Structure Reference — Codex Optimized

Use this reference when Codex plans, scaffolds, reviews, or modifies the StreamOS repository structure.

This file is intentionally operational. It tells Codex where work belongs, what to inspect first, which service owns which responsibility, what not to create, and which validation commands prove the change.

## Core Rule

Inspect the existing repository before creating or moving files. Existing StreamOS structure, local `AGENTS.md`/skill instructions, package scripts, migrations, tests, and service boundaries always outrank this reference.

Do not treat this document as permission to scaffold every listed file. Create or edit only the files required by the current task.

## Fast Decision Matrix

| Task type                                         | Default owner                           | First paths to inspect                                                | Do not do                                              |
| ------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| Dashboard route or UI module                      | `apps/web`                              | `apps/web/src/app/dashboard`, `apps/web/src/components`, nearby tests | Do not create a root `src/` app in the active monorepo |
| Web-owned server action or route handler          | `apps/web`                              | `apps/web/src/app/api`, route actions, Supabase SSR helpers           | Do not put secrets into client components              |
| Provider OAuth, token refresh, webhooks           | `services/api-gateway`                  | gateway auth routes, provider clients, env validation, tests          | Do not move OAuth secrets into Vercel or browser code  |
| AI, transcription, clip scoring, repurposing plan | `services/automation-service`           | FastAPI routes, schemas, tests                                        | Do not call AI providers from browser code             |
| Queue producer                                    | usually `services/api-gateway`          | queue package, gateway routes, job schema/contracts                   | Do not produce untyped or non-idempotent jobs          |
| Queue consumer                                    | `workers/*`                             | target worker, queue package, shared types, tests                     | Do not make Python consume BullMQ directly             |
| Shared domain contract                            | `packages/types`                        | existing exported contracts and tests                                 | Do not duplicate durable types in app-local files      |
| Database schema/RLS                               | `packages/database`                     | migrations, generated types, RLS patterns                             | Do not rewrite released migrations                     |
| Deployment or env contract                        | docs + service env validation           | `deployment.md`, `.env*.example`, Dockerfiles, workflows              | Do not expose worker/private service URLs publicly     |
| Release proof or production gate                  | `release-gate-runner` + rollout scripts | `scripts/`, deployment docs, Railway audit docs                       | Do not treat local diagnostics as production proof     |

## Context Loading Order For Codex

Before changing files, inspect the smallest useful set of repository context.

1. Root and architecture context:
   - `README.md`
   - `architecture.md` or `docs/architecture.md`
   - `deployment.md` or `docs/deployment.md`
   - `package.json`
   - `pnpm-workspace.yaml`
   - `turbo.json`
2. Structure context, only for setup/scaffold/module-placement tasks:
   - `streamos-structure.md`
   - `references/streamos-structure.md`, if present
3. Target package context:
   - nearest `package.json`, Python project file, or local README
   - existing source files for the same module
   - nearby tests and test fixtures
   - local `AGENTS.md`, if present
4. Contract context when crossing boundaries:
   - `packages/types`
   - `packages/queue`
   - `packages/database`
   - Supabase migrations under `packages/database/supabase/migrations`
   - env examples: `.env.example`, `.env.compose.example`, `.env.test.example`, app/service-specific env examples
5. Deployment context when runtime behavior changes:
   - `.github/workflows`
   - Dockerfiles
   - Railway/Vercel/Fly docs
   - rollout and audit scripts

Use targeted search for existing route names, table names, queue names, action names, and status enums before introducing new ones.

## Active StreamOS Monorepo Shape

The active product is a `pnpm`/Turborepo monorepo. Production frontend work belongs in `apps/web`. Do not recreate the removed root Vite/Electron prototype. Do not create a new root `src/` app unless the user explicitly asks for a separate single-app scaffold.

```text
StreamOS/
+-- apps/
|   +-- web/                         # Next.js App Router dashboard and web-owned BFF routes
+-- services/
|   +-- api-gateway/                 # Public backend entrypoint, OAuth, webhooks, queue producers
|   +-- automation-service/          # Private FastAPI AI/transcription/repurposing APIs
+-- workers/
|   +-- stream-job-worker/           # Canonical streamos-media consumer
|   +-- transcription-worker/        # Canonical streamos-transcription consumer
|   +-- clip-worker/                 # Canonical streamos-clip-generation consumer
|   +-- repurposing-worker/          # Canonical streamos-repurposing consumer
|   +-- publishing-worker/           # Canonical streamos-publishing consumer
|   +-- content-job-retry-worker/    # Durable failed content_jobs retry orchestration
+-- packages/
|   +-- config/                      # Shared TS/ESLint/Tailwind/build config
|   +-- database/                    # Supabase contracts, migrations, generated DB types
|   +-- queue/                       # BullMQ queue contracts/helpers, if present
|   +-- types/                       # Shared domain contracts across web/services/workers
|   +-- ui/                          # Reusable UI primitives only when genuinely shared
+-- scripts/                         # Rollout, audit, E2E, release-gate helpers
+-- docs/                            # Architecture, deployment, runbooks, audits, decisions
+-- .github/workflows/               # CI/CD and environment-gated deployment workflows
+-- package.json
+-- pnpm-workspace.yaml
+-- turbo.json
```

### Root Responsibilities

- Root `package.json`: workspace scripts only; do not add app-specific scripts here unless they orchestrate workspace behavior.
- `pnpm-workspace.yaml`: package discovery; preserve existing workspace boundaries.
- `turbo.json`: task pipeline/caching; update only when package-level scripts require orchestration changes.
- Dockerfiles: service-specific production images from repository root when workspace packages are needed.
- `scripts/`: operational proof, audits, E2E, and deployment tooling. Treat these as release-critical.

## `apps/web` Internal Shape

Use this shape unless the existing app has intentionally evolved.

```text
apps/web/src/
+-- app/
|   +-- dashboard/                   # Authenticated product routes
|   +-- api/                         # Web-owned route handlers and gateway proxy/handoff routes
|   +-- auth/                        # Supabase SSR auth callbacks/confirmation routes
|   +-- layout.tsx
|   +-- page.tsx
+-- components/
|   +-- ui/                          # Low-level app UI primitives
|   +-- layout/                      # Dashboard shell/navigation/layout pieces
|   +-- modules/                     # Product-specific modules and consoles
+-- data/                            # Static/demo/module data only where current pattern uses it
+-- lib/
|   +-- supabase/                    # Browser/server Supabase helpers
|   +-- integrations/                # Server-only integration helpers; no browser secrets
|   +-- utils/                       # Local app utilities
+-- store/                           # Small client UI state only
+-- types/                           # App-local types that do not belong in packages/types
```

### App Router Rules

- Server components are the default.
- Add `"use client"` only for browser interactivity, chart libraries, DOM APIs, local UI state, client effects, clipboard behavior, or Supabase browser client usage.
- Route orchestration belongs in `app/**/page.tsx`, route layouts, server actions, or route handlers.
- Product widgets belong in `components/modules` unless the existing feature already colocates them differently.
- Low-level, non-product UI belongs in `components/ui`.
- Dashboard shell/navigation belongs in `components/layout`.
- Durable data belongs in Supabase, server fetches, route handlers, gateway/service calls, or workers, not in Zustand.

### Dashboard Module Placement

| Feature                     | Route surface                                          | Module/component surface                                          | Durable owner                                        |
| --------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------- |
| Analytics                   | `apps/web/src/app/dashboard/analytics`                 | `components/modules/analytics` or existing analytics console path | Supabase snapshots/service syncs                     |
| Jobs and retry UI           | `apps/web/src/app/dashboard/jobs`                      | `components/modules/*Job*`                                        | `content_jobs`, workers, gateway commands            |
| Repurposing review          | dashboard job/review route or existing console path    | `components/modules/Repurposing*`                                 | `content_jobs.result`, manual review state           |
| Publishing history/detail   | dashboard publishing route or existing console path    | `components/modules/*Publication*`                                | `content_publications`, `content_publication_events` |
| Crossposting summary/fanout | dashboard publishing/crossposting surface              | `components/modules/Crossposting*`                                | fanout tables plus child publications                |
| Platform connections        | `apps/web/src/app/dashboard/platforms`                 | `components/modules/platforms`                                    | gateway-owned OAuth + Supabase connection rows       |
| Monetization                | `apps/web/src/app/dashboard/monetization`              | `components/modules/monetization`                                 | service-managed monetization tables/summaries        |
| Branding                    | `apps/web/src/app/dashboard/branding`                  | `components/modules/branding`                                     | Supabase Storage/database contracts                  |
| Settings/admin              | `apps/web/src/app/dashboard/settings` or admin surface | `components/modules/settings`                                     | server-side auth/role checks                         |

Do not move product-specific dashboard consoles into `packages/ui` unless they are reused outside `apps/web`.

## Services And Workers

### `services/api-gateway`

Use for:

- Twitch, YouTube, TikTok, and Kick OAuth connect/callback flows.
- Provider token refresh and encrypted token persistence.
- External provider webhooks and internal signed webhooks.
- App-facing backend commands that require secrets, rate limits, or service-role access.
- BullMQ job production.
- Server-side publication, fanout, publish, reconcile, and retry actions.
- Protected observability snapshots.

Default public runtime: Railway with public networking enabled and `/health` exposed.

Browser code may call the gateway only through approved app-facing routes or authenticated server-side handoff/proxy paths. Browser code must never receive provider access tokens, refresh tokens, service-role keys, Redis credentials, encryption keys, or AI provider secrets.

### `services/automation-service`

Use for:

- Transcription processing.
- Clip/highlight analysis.
- Repurposing plan generation.
- AI output validation.
- Cost-sensitive model orchestration.

Default production runtime: private Railway service. Browser code and Vercel client bundles must not call it. Railway services/workers may call it through private networking.

### `workers/stream-job-worker`

Canonical consumer for `streamos-media`.

Owns:

- Stream event materialization.
- Durable `content_jobs` creation.
- Transcription fan-out when the event has sufficient transcription input.
- `video.published -> repurposing.plan` fan-out only when server-side enrichment resolves an available asset and repurposing is explicitly enabled.

Must not call the automation service directly and must not require provider client secrets.

### `workers/transcription-worker`

Canonical consumer for `streamos-transcription`.

Owns:

- Calling `POST /transcriptions/process` on the private automation service.
- Persisting VOD/transcript/job status transitions.
- Enqueuing downstream clip-generation jobs when supported by the deployed contract.

### `workers/clip-worker`

Canonical consumer for `streamos-clip-generation`.

Owns:

- Clip scoring/generation work.
- Calling private automation-service endpoints.
- Persisting clip/highlight job state.

### `workers/repurposing-worker`

Canonical consumer for `streamos-repurposing`.

Owns:

- Durable `repurposing.plan` jobs.
- Calling `POST /repurposing/plan` on the private automation service.
- Persisting manual-review-only repurposing results in `content_jobs.result`.

Must not auto-publish, export rendered media, or crosspost. Approved repurposing output can feed separate export/publishing contracts only after explicit user/operator action.

### `workers/publishing-worker`

Canonical consumer for `streamos-publishing`.

Owns:

- Approved publication execution.
- Provider write APIs for supported targets.
- Publication reconciliation.
- Publication state transitions and audit events.

Must stay private in Railway. No public domain. No public networking. No browser calls. It must not require `AUTOMATION_SERVICE_URL` unless a future contract explicitly changes that.

### `workers/content-job-retry-worker`

Owns retry orchestration for failed `content_jobs`.

Rules:

- Use durable retry state from `content_jobs`.
- Preserve `retry_count`, `max_retries`, `next_retry_at`, and existing optimistic claim semantics.
- Requeue only supported deployed job types.
- Manual dashboard retries may release an exhausted retry budget only through the approved server-side path.

### BullMQ Rule

BullMQ semantics are Node-owned. Python must not consume BullMQ directly. Redis is shared infrastructure, not a business logic owner.

## Shared Packages

| Package             | Use for                                                                   | Avoid                                                              |
| ------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `packages/types`    | Shared domain types, enums, API/job contracts used by multiple packages   | App-only display types                                             |
| `packages/database` | Supabase migrations, DB contracts, generated DB types/helpers             | Runtime-specific service logic                                     |
| `packages/queue`    | Queue names, job payload schemas, producer helpers, worker contract tests | Provider-specific business decisions unless already designed there |
| `packages/config`   | Shared lint/TS/Tailwind/build config                                      | Product behavior                                                   |
| `packages/ui`       | Truly reusable UI primitives shared across apps/surfaces                  | Product-specific dashboard widgets/consoles                        |

If a type crosses web, gateway, worker, or service boundaries, prefer `packages/types`. If it only shapes one React component, keep it local.

## Single-App Fallback Structure

Use this only when no monorepo exists or the user explicitly asks for a single-app StreamOS-style scaffold.

```text
streamos/
+-- package.json
+-- tsconfig.json
+-- tailwind.config.ts
+-- next.config.ts
+-- .env.example
+-- src/
    +-- app/
    |   +-- globals.css
    |   +-- layout.tsx
    |   +-- page.tsx
    |   +-- dashboard/
    |       +-- layout.tsx
    |       +-- page.tsx
    +-- components/
    |   +-- ui/
    |   +-- layout/
    |   +-- modules/
    +-- lib/
    |   +-- supabase/
    |   +-- integrations/
    |   +-- utils/
    +-- store/
    +-- types/
```

For the active monorepo, adapt this internal shape under `apps/web/src` instead of creating root `src`.

## File Responsibility Rules

### Package and Config Files

- `package.json`: preserve the existing package manager and script conventions. Do not switch `pnpm` to `npm` or `yarn`.
- `tsconfig.json`: preserve strict TypeScript and path aliases used by the target package.
- `tailwind.config.ts`: use semantic design tokens and existing project theme conventions.
- `next.config.ts`: keep remote image domains and startup/env validation aligned with deployment rules.
- `.env*.example`: document variable names and ownership without real values.
- Dockerfiles: build from repo root when workspace packages are required.

### Supabase Helpers

- Browser client: publishable/anon key only.
- Server client: cookie-aware SSR session handling.
- Service-role access: isolated to trusted server/service/worker paths after explicit user/session or trusted-service validation.
- Never import service-role helpers into client components.

### UI Files

- Components should be typed, accessible, responsive, and scoped.
- Keep loading, empty, error, unauthorized, and disabled states for user-facing flows.
- Keep manual action availability aligned with the server-side policy; never create UI-only permissions for retry, reconcile, publish, or fanout actions.
- Heavy charts or interactive modules should be client-scoped without turning whole pages into client components.

### Tests

Add or update tests near changed behavior. Prefer extending existing test patterns over creating new test frameworks.

## API Surface And Route Ownership

Default to REST for StreamOS commands, resources, OAuth callbacks, sync endpoints, and webhooks. Use GraphQL only if the repo already has a GraphQL boundary or the task explicitly requires flexible nested reads.

### `apps/web` Routes

Use for:

- Dashboard pages.
- Supabase SSR auth callback/confirmation routes.
- Gateway handoff initiation after validating the Supabase SSR session.
- Thin server-side proxies only when the web app owns the authenticated browser context and the gateway owns the secret operation.

Examples of web-owned concerns:

- `/auth/callback`
- `/auth/confirm`
- `/api/gateway-connect`
- app-facing dashboard route handlers that call the gateway server-side

### `services/api-gateway` Routes

Use for:

- `/api/auth/:provider/connect`
- `/api/auth/:provider/callback`
- `/api/platforms/:provider/disconnect`
- `/api/metrics/sync`
- `/api/clips/generate`
- `/api/content-jobs/retry`
- `/api/content-publications`
- `/api/content-publications/fanout`
- `/api/content-publications/:id/publish`
- `/api/content-publications/:id/reconcile`
- `/api/webhooks/*`
- `/api/callbacks/automation`
- `/api/observability`

Every API change must define:

- Route owner.
- Request shape.
- Response shape.
- Auth model.
- Tenant isolation behavior.
- Error model and status codes.
- Idempotency behavior for mutations/events.
- Pagination/cursor behavior for lists.
- Rate-limit expectations.
- Cache behavior, if applicable.
- Shared type location.
- Validation commands.

## Provider And OAuth Placement

Twitch, YouTube, TikTok, and Kick OAuth are gateway-owned.

Required invariants:

- `apps/web` validates the Supabase SSR session before creating a signed handoff.
- The gateway owns provider PKCE, one-time state, callback validation, token exchange, profile/channel lookup, encrypted token persistence, refresh, disconnect, and safe redirects.
- Provider tokens never pass through browser code.
- Provider client secrets live only in the gateway runtime.
- Access and refresh tokens are encrypted before persistence.
- Refresh tokens are rotated when the provider returns replacements.
- Callback success and failure paths have tests.
- Logs never include provider tokens, OAuth codes, PKCE verifiers, or raw secret-bearing payloads.

Do not restore older Next.js-owned provider OAuth patterns unless an explicit architecture decision reverses the gateway-owned model.

## Publishing, Crossposting, And Scheduling Structure

### Publication Contract

- Request creation and validation: `services/api-gateway`.
- Execution and reconciliation: `workers/publishing-worker`.
- Durable state: `content_publications` and `content_publication_events`.
- Shared contracts: `packages/types` and queue contracts where used.
- UI surfaces: `apps/web/src/app/dashboard/**` plus `components/modules/*Publication*` or existing console files.

Browser code may request approved actions through server-owned routes. Browser code must not call YouTube, TikTok, Kick, or Twitch write APIs directly.

### Fanout Contract

- Parent/fanout preparation: gateway-owned.
- Child target validation: server-side per provider/connection/scope.
- Durable state: fanout parent/target tables plus child publications/events.
- UI: parent summary, target cards, aggregate status, links to child history.
- Manual controls: target-level retry/reconcile only, not broad global retry.

Ensure UI action availability uses the same effective policy as the server. Child retry UI must include child-specific guards such as fanout membership, fanout status, approved bundle availability, and publishable asset availability.

### Scheduling Contract

- Treat scheduling first as a contract and visibility layer.
- Do not add a provider scheduler until the scheduling contract, UI visibility, audit history, and failure model are stable.
- Planned publication/fanout entries should be visible before execution automation is introduced.

## Database And Supabase Rules

Migrations in `packages/database/supabase/migrations` are the source of truth.

For tenant-owned data:

- Include `user_id` unless a documented exception exists.
- Apply RLS scoped to `auth.uid()`.
- Add explicit grants and policies in the same migration if exposed through the Supabase Data API.
- Keep service-managed columns writable only by service-role code.
- Do not expose provider tokens, internal job state, AI secrets, or encrypted payloads to `authenticated` users.

Known service-managed areas:

- `platform_connections` token columns.
- `metrics_snapshots` writes.
- `vod_assets`, `stream_transcripts`, `stream_highlights`, `clips`, `clip_exports` writes.
- `content_jobs.status`, `content_jobs.result`, `content_jobs.error_message`, retry columns.
- `content_publications` execution/reconciliation state.
- `content_publication_events` audit rows.
- Monetization event ingestion and summary materialization.

Do not rewrite released migrations. Add a new migration unless the task explicitly targets an unreleased local migration.

## Environment Variable Ownership

Document new variables in the relevant example file and runtime docs. Use placeholders only. Never write real secret values into repo files or generated reports.

| Runtime                           | Owns                                                                                                                                                       | Must not own                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `apps/web` on Vercel              | browser-safe Supabase values, app URL, API gateway URL, server-only gateway handoff secret if already part of the contract                                 | provider client secrets, OpenAI keys, Redis, Supabase service role, encryption key, Railway private URLs |
| `services/api-gateway` on Railway | API gateway secret, provider secrets, webhook secrets, Redis, Supabase service role, encryption key, OAuth redirect URIs                                   | browser-only `NEXT_PUBLIC_*` secrets                                                                     |
| `services/automation-service`     | OpenAI/Replicate/model settings, AI timeouts/limits                                                                                                        | provider OAuth secrets unless a specific server contract requires it                                     |
| `workers/*`                       | Redis, Supabase service role, queue names, concurrency, private automation-service URL where needed, provider write credentials only for publishing-worker | public domains, browser variables, unrelated provider secrets                                            |
| `release-gate-runner`             | operator/gate variables needed for proof runtime                                                                                                           | product request handling, BullMQ consumption, public networking                                          |

Rules:

- Only variables intentionally public should use `NEXT_PUBLIC_*`.
- Never create `NEXT_PUBLIC_OPENAI_KEY` or `NEXT_PUBLIC_OPENAI_API_KEY`.
- `AUTOMATION_SERVICE_URL` must be private for production workers that require it.
- `publishing-worker` should not require `AUTOMATION_SERVICE_URL` under the current contract.
- Production services should fail closed when critical secrets are missing if existing startup validation supports it.

## Local Development Guidance

Codex must detect the current package manager and scripts instead of inventing commands. For the active monorepo, prefer workspace commands.

Expected local modes:

### Dashboard-only work

```bash
pnpm --filter @streamos/web dev
```

Dashboard default route: `http://localhost:3000/dashboard` unless the dev server reports another port.

### Queue/integration work

```bash
pnpm infra:up
pnpm infra:ps
pnpm infra:logs
pnpm infra:down
```

Expected local endpoints when infrastructure is running:

- API Gateway: `http://localhost:4000/health`
- Automation Service: `http://localhost:8000/health`
- Redis: `localhost:6379`

### E2E and rollout diagnostics

```bash
pnpm e2e:jobs
pnpm e2e:transcription
pnpm rollout:check:local
```

A local diagnostic is not a production pass. Hosted production promotion requires the proof-capable Railway runner and hosted production gate.

## Validation Matrix

Run narrow validation first. Run broader validation when a change crosses package, runtime, queue, database, or deployment boundaries.

| Changed area                       | Validation                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| Root/cross-package                 | `pnpm validate`                                                                        |
| `apps/web` UI/routes               | `pnpm --filter @streamos/web lint`; tests/build when behavior, routing, or env changed |
| `services/api-gateway`             | `pnpm --filter @streamos/api-gateway lint`; `test`; `build`                            |
| `services/automation-service`      | `python -m pytest services/automation-service`                                         |
| `workers/stream-job-worker`        | package lint/test/build using existing package name/script                             |
| `workers/transcription-worker`     | `pnpm --filter @streamos/transcription-worker lint`; `test`; `build`                   |
| `workers/clip-worker`              | `pnpm --filter @streamos/clip-worker lint`; `test`; `build`                            |
| `workers/repurposing-worker`       | package lint/test/build using existing package name/script                             |
| `workers/publishing-worker`        | `pnpm --filter @streamos/publishing-worker lint`; `test`; `build`                      |
| `workers/content-job-retry-worker` | `pnpm --filter @streamos/content-job-retry-worker lint`; `test`; `build`               |
| Queue or E2E job flow              | `pnpm e2e:jobs`; `pnpm e2e:transcription` if transcription path is affected            |
| Deployment/audit/release gate      | Railway audit scripts and production gate as documented in deployment docs             |

If validation cannot run, report exactly what was not run and why. Do not claim validation passed without evidence.

## Search Recipes For Codex

Use targeted search before adding new abstractions.

### Before adding a dashboard module

Search for:

- Existing route under `apps/web/src/app/dashboard`.
- Existing module under `apps/web/src/components/modules`.
- Existing navigation/sidebar entries.
- Existing test patterns for dashboard modules.
- Existing loading/empty/error state components.

### Before adding an API route

Search for:

- Existing route owner in `apps/web/src/app/api` and `services/api-gateway`.
- Existing auth middleware/secret validation.
- Existing error shape and status code conventions.
- Existing request/response schemas in `packages/types`.
- Existing rate limit or replay protection patterns.

### Before changing a queue contract

Search for:

- Queue name constants.
- Job payload schemas.
- Deterministic job ID patterns.
- Producer route/service.
- Consumer worker.
- Tests in `packages/queue`, gateway, and worker.
- Durable `content_jobs` state transitions.

### Before changing publication/fanout UI

Search for:

- `content_publications` and `content_publication_events` usage.
- Manual action policies.
- Disabled reason builders.
- Fanout parent/child status aggregation.
- Provider-specific scope and remote-state handling.
- Server-side retry/reconcile route behavior.

### Before changing env/deployment

Search for:

- Env validation in target service startup.
- `.env*.example` files.
- Dockerfile for the target runtime.
- Deployment docs.
- GitHub workflow environment names.
- Railway audit expectations.

## Security Baseline

Codex must preserve these constraints:

- No hardcoded API keys, tokens, secrets, private URLs, or credentials.
- No service-role keys, provider secrets, Redis URLs, OpenAI keys, Replicate tokens, webhook secrets, or encryption keys in browser code.
- No unprotected admin/operator routes.
- No unsigned/unvalidated external webhooks.
- No cross-user or cross-workspace data access.
- No provider token logging.
- No PII or secret-bearing payloads in errors/logs.
- No unbounded AI/media processing.
- No unchecked file upload or media ingestion path.
- No database table exposed through Supabase Data API without RLS and grants.
- No public networking for worker-only Railway services.

If a requested change weakens these constraints, implement the safer alternative or stop with a blocker explanation.

## Performance And Scalability Baseline

Prefer:

- Background jobs for media, AI, sync, imports, exports, retries, publish execution, and reconciliation.
- Idempotent job IDs for duplicate-prone provider events.
- Cursor/pagination for lists, logs, history, and audit timelines.
- Aggregated tables/snapshots for analytics dashboards.
- Server-side provider data normalization.
- Redis-backed rate limiting/replay protection in production gateway paths.
- Minimal client bundles; isolate charts/interactivity to client components.
- Bounded retries and explicit backoff.
- Cost limits for AI/media workflows.
- Manual review before public posting, sponsorship-facing outputs, revenue-affecting actions, or brand-facing assets.

Avoid long-running work in Vercel request handlers when a worker/service path exists.

## Common Anti-Patterns To Reject

- Creating `src/` at repo root in the active monorepo.
- Using `npm` commands when the repo uses `pnpm`.
- Moving product widgets into `packages/ui` without reuse.
- Adding a new package for one local helper.
- Creating duplicate status enums instead of using shared contracts.
- Putting provider OAuth callbacks into `apps/web` instead of the gateway.
- Calling `services/automation-service` from browser/Vercel client bundles.
- Adding `NEXT_PUBLIC_*` secrets.
- Letting UI enable a manual action that the server policy will reject.
- Adding provider publish execution to the browser.
- Adding public networking or a public domain to worker services.
- Rewriting released migrations.
- Silencing lint/type errors without fixing the root cause.
- Reporting tests as passed when they were not run.

## Codex Output Expectations

After implementation, Codex should report:

1. Summary of what changed.
2. Files changed, grouped by package/service.
3. Architecture decisions and service-boundary reasoning.
4. Security and tenant-isolation notes.
5. Validation commands run and exact result.
6. Commands not run and why.
7. Remaining risks or follow-up tasks.

Lead with blockers or failed validation. Keep the summary short enough for a reviewer to audit quickly.

## Definition Of Done

A structure/setup task is complete only when:

- The behavior belongs to the correct owner.
- Existing repo patterns were reused.
- The diff is scoped and reviewable.
- Tenant isolation is preserved.
- Secrets remain server-only.
- Env examples/docs are updated when contracts change.
- Database changes use new migrations with RLS/grants where applicable.
- AI/media work is queued, bounded, retry-safe, and cost-aware.
- UI changes include responsive, loading, empty, error, unauthorized, and disabled states where relevant.
- Manual actions match server-side availability policies.
- Validation was run or limitations were reported honestly.
- The final report lists changed files, decisions, validation, and risks.
