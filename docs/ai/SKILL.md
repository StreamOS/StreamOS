---
name: streamos-codex-architecture-setup
version: 2026-06-21
status: codex-optimized
description: Use for StreamOS architecture, setup, monorepo implementation, repo audits, Next.js App Router, Supabase/PostgreSQL, API Gateway, FastAPI automation, BullMQ workers, OAuth, publishing, crossposting, AI pipelines, env contracts, CI/CD, Railway/Vercel deployment, release-gate proof, and validation planning. Optimized for Codex to inspect the repository first, route work to the correct service owner, avoid stale architecture assumptions, keep diffs scoped, preserve tenant isolation and secrets boundaries, and run evidence-based validation.
---

# StreamOS Codex Architecture Setup

## Purpose

Use this skill when Codex plans, reviews, or implements technical work in the StreamOS repository.

This is not a generic coding guide. It is a project-specific execution protocol for making Codex faster and safer inside the StreamOS monorepo. Its job is to reduce ambiguity around:

- which service owns a change,
- which files must be inspected before editing,
- which contracts must not be broken,
- which validations prove the change,
- which deployment and security boundaries are non-negotiable.

Core rule: **inspect the existing repository before proposing or applying changes. Existing StreamOS code, tests, migrations, docs, and AGENTS instructions beat generic framework advice.**

## Absolute Operating Rules

Codex must always follow these rules:

1. Do not guess repository structure. Inspect it.
2. Do not create parallel architecture when an existing pattern can be extended.
3. Do not move service boundaries to make one task easier.
4. Do not expose secrets to browser code, Vercel client bundles, logs, markdown reports, screenshots, or test fixtures.
5. Do not rewrite released migrations. Add a new migration unless the user explicitly targets an unreleased local migration.
6. Do not introduce new dependencies without checking existing alternatives and explaining why the dependency is required.
7. Do not claim validation passed unless the command actually ran successfully.
8. Do not bury security, tenant-isolation, or deployment blockers under style feedback.
9. Do not perform broad refactors unless the user explicitly asked for them.
10. Do not continue implementation if the request would weaken authentication, token handling, tenant isolation, or production gate integrity. Report the safer alternative first.

## When To Use This Skill

Use this skill for tasks involving any of the following:

- StreamOS monorepo structure, setup, scaffolding, package placement, or architecture review.
- `apps/web` Next.js App Router dashboard, routes, server actions, route handlers, Supabase SSR, UI modules, or product navigation.
- `services/api-gateway` Node.js backend routes, OAuth, provider callbacks, webhooks, rate limits, app-facing backend APIs, observability, or BullMQ producers.
- `services/automation-service` FastAPI AI workflows, transcription, clip scoring, title/caption/hashtag generation, repurposing, model configuration, cost controls, or AI output validation.
- BullMQ queues, workers, retries, idempotent job IDs, durable `content_jobs`, worker deployment, or queue contract changes.
- Supabase/PostgreSQL schema, migrations, RLS, grants, service-role access, tenant-owned data, or database contracts.
- Platform APIs: Twitch, YouTube, TikTok, Kick, OAuth, token refresh, disconnect, provider sync, provider publishing, or webhooks.
- Publishing, publication reconciliation, publication history, crossposting fanout, fanout manual controls, scheduling contracts, or publishing analytics.
- Environment variables, `.env.example` files, runtime ownership, Vercel/Railway/Fly deployment, Dockerfiles, CI/CD, GitHub Actions, release gates, or Railway audits.
- Security hardening, performance hardening, observability, rollout proof, repo audit, debugging, or validation planning.

Do not use this skill for isolated copy edits, product text, or tiny CSS-only polish unless the task touches paths, data flow, server/client ownership, security, performance, or deployment.

## Current Architecture Facts

Treat this section as the active baseline unless the repository proves a newer contract.

### Product Shape

StreamOS is a pnpm/Turborepo monorepo. The production frontend lives in `apps/web`. The removed root Vite/Electron prototype must not be recreated.

Primary paths:

- `apps/web`: Next.js App Router dashboard, Supabase SSR auth, app-facing BFF routes, dashboard modules, and web-owned server actions.
- `services/api-gateway`: Node.js public backend entrypoint for OAuth, app-facing backend APIs, external webhooks, provider token refresh, provider disconnects, observability, and BullMQ job production.
- `services/automation-service`: FastAPI private service for AI/transcription/clip/repurposing workflows.
- `workers/stream-job-worker`: canonical `streamos-media` consumer.
- `workers/transcription-worker`: canonical `streamos-transcription` consumer.
- `workers/clip-worker`: canonical clip-generation/scoring consumer.
- `workers/repurposing-worker`: canonical `streamos-repurposing` consumer.
- `workers/publishing-worker`: canonical `streamos-publishing` consumer for approved publication execution and reconciliation.
- `workers/content-job-retry-worker`: durable retry orchestration for failed `content_jobs`.
- `release-gate-runner`: private proof-only Railway runtime for promotable production gates.
- `packages/types`: shared domain contracts used across web, gateway, services, and workers.
- `packages/database`: Supabase migrations, database helpers, generated database types, and schema contracts.
- `packages/config`: shared TypeScript, ESLint, Tailwind, Prettier, and build configuration.
- `packages/ui`: reusable UI primitives only when there is real reuse across apps/packages.

### Provider Ownership

Twitch, YouTube, TikTok, and Kick OAuth are gateway-owned.

`apps/web` may initiate a short-lived signed OAuth handoff after validating the Supabase SSR session, but provider client secrets, PKCE state, callback validation, provider profile lookup, encrypted token persistence, token refresh, disconnect, metrics writes, and provider webhooks belong in `services/api-gateway`.

`apps/web` must not require these in Vercel:

- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_ENCRYPTION_KEY`
- provider client secrets
- provider webhook secrets
- Redis URLs
- OpenAI or Replicate credentials
- Railway private service URLs

### Publishing Ownership

Publishing is server-owned.

Browser code may request review/export/publish actions through approved StreamOS server surfaces, but it must never call provider write APIs directly.

Current publishing chain:

1. Approved repurposing result exists in `content_jobs.result`.
2. API Gateway validates tenant, approved snapshot, provider connection, scope/eligibility, and publish target.
3. API Gateway freezes the publish snapshot in `content_publications` and appends `content_publication_events`.
4. API Gateway enqueues deterministic `publication.publish` or `publication.reconcile` jobs into `streamos-publishing`.
5. `workers/publishing-worker` performs provider-side writes and reconciliation.
6. Worker persists publication state transitions and audit events.
7. UI reads publication state/history and offers only policy-valid manual controls.

Current relevant routes:

- `POST /api/content-publications`
- `POST /api/content-publications/:id/publish`
- `POST /api/content-publications/:id/reconcile`
- `POST /api/content-publications/fanout`

### Repurposing Ownership

Repurposing is manual-review-first.

`video.published` may materialize a durable `repurposing` `content_jobs` row and enqueue `repurposing.plan` only when provider enrichment resolves `asset_available` and connected platform metadata explicitly opts in.

The durable repurposing job must not auto-publish, export, render, or crosspost. Approved repurposing jobs can later feed manual export or server-owned publication flows.

### Queue Ownership

- API Gateway produces normalized provider/app events into queues.
- BullMQ job semantics remain Node-owned.
- Python must not consume BullMQ directly.
- Redis is the shared queue backend.
- `content_jobs` is the durable source of truth for user-visible job state.
- Queue payloads must be typed or validated.
- Duplicate-prone events should use deterministic job IDs.

### Deployment Ownership

- `apps/web`: Vercel.
- `services/api-gateway`: Railway public service, `/health` public and not rate-limited.
- `services/automation-service`: Railway private service in steady-state production; Fly.io only when GPU/local Whisper/regional compute requires it.
- `workers/*`: Railway private worker dynos, no public domains.
- `release-gate-runner`: Railway private proof runtime, not a product service.

## Fast Task Classifier

Before editing, classify the task and load only the useful context.

| Task type                             | Primary owner                            | Inspect first                                                           | Typical validation                              |
| ------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------- |
| Dashboard route/module                | `apps/web`                               | route, layout, nearby modules, tests, shared UI                         | web lint/test/build                             |
| Web server action/route handler       | `apps/web` unless provider/backend-owned | existing `app/api`, auth helpers, gateway proxy pattern                 | web test/build                                  |
| Provider OAuth/connect/disconnect     | `services/api-gateway` plus web handoff  | gateway auth routes, web gateway-connect, token encryption, tests       | gateway test/build, web test if handoff changes |
| External webhook                      | `services/api-gateway`                   | webhook routes, signature validation, replay/rate limit, queue producer | gateway test/build                              |
| AI/transcription/repurposing endpoint | `services/automation-service`            | FastAPI routes, schemas, tests, model config                            | automation pytest                               |
| Queue producer                        | usually `services/api-gateway`           | queue package, producer, job schemas, tests                             | gateway + queue tests                           |
| Queue consumer                        | matching `workers/*`                     | worker entry, schemas, persistence helpers, tests                       | worker lint/test/build                          |
| Supabase schema/RLS                   | `packages/database`                      | latest migrations, DB types, consuming code                             | migration checks + affected package tests       |
| Shared domain contract                | `packages/types`                         | existing types, all importers                                           | affected package tests + root validate if broad |
| Publishing action/reconcile           | gateway + publishing-worker + web UI     | contracts, routes, worker, events, UI policy helpers                    | gateway + publishing-worker + web tests         |
| Crossposting fanout                   | gateway + web UI + publishing contract   | fanout routes, parent/child types, UI summary/manual controls           | gateway + web + publishing-worker tests         |
| Deployment/env                        | docs + service config + CI               | deployment docs, Dockerfiles, env examples, workflows                   | rollout/audit-specific checks                   |
| Repo audit/debugging                  | affected packages                        | errors, changed files, tests, logs, docs                                | evidence-specific                               |

If a task crosses more than one owner, preserve the boundary and validate each touched owner.

## Codex Execution Loop

Unless the user explicitly requests planning only, use this loop:

1. **Orient**
   - Identify task type, affected module, likely owner, and risk level.
   - Check for AGENTS or local instructions in or above affected paths.
   - Summarize assumptions before making risky changes.

2. **Inspect**
   - Read the minimal relevant repository context.
   - Search for existing names, types, helpers, routes, test patterns, and env validation.
   - Confirm current architecture from code before relying on docs.

3. **Plan the diff**
   - State which files will likely change.
   - State which files will not change and why, when important.
   - Keep the change narrow.

4. **Implement**
   - Extend existing patterns.
   - Keep service boundaries intact.
   - Keep domain contracts centralized.
   - Add/update tests near changed behavior.
   - Update docs/env examples when contracts change.

5. **Validate**
   - Run the narrowest useful validation first.
   - Expand validation when a change crosses package, queue, database, or deployment boundaries.
   - Capture exact command results.

6. **Report**
   - Lead with blockers or failed validation.
   - List changed files grouped by owner.
   - Include security/tenant-isolation notes.
   - Include commands run and commands not run.
   - Include remaining risks and follow-ups.

## Clarification Policy

Do not ask broad clarification questions. Make reasonable MVP assumptions when safe.

Ask only when the missing answer could change one of these:

- tenant model or workspace ownership,
- token/security model,
- provider ownership,
- production deployment topology,
- billing or paid-plan behavior,
- destructive migration/data deletion,
- real provider write behavior,
- AI cost profile or media-size budget,
- release promotion decision.

If a safe assumption exists, proceed and document it.

## Repository Context Loading Order

Use the smallest useful set of files in this order.

### 1. Root and project contracts

Read when the task is architectural, cross-package, deployment-related, or ambiguous:

- `README.md`
- `architecture.md` or `docs/architecture.md`
- `deployment.md` or `docs/deployment.md`
- `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`
- root `AGENTS.md` or local AGENTS file if present

### 2. Structure reference

Read `references/streamos-structure.md` or `streamos-structure.md` only when the task involves:

- setup or scaffold,
- module placement,
- route placement,
- local development instructions,
- environment contract review,
- API surface review,
- comparing current repo shape against intended structure.

Do not load or copy the structure reference for unrelated feature edits.

### 3. Target package/service

Read:

- nearest `package.json`, `pyproject.toml`, or service config,
- target source folder,
- existing tests near the behavior,
- local README/docs,
- existing route/worker/schema/helpers for the same domain.

### 4. Contract context

Read when data or cross-package behavior changes:

- `packages/types`
- `packages/database`
- `packages/database/supabase/migrations`
- `packages/queue` if queue contracts exist
- env examples such as `.env.example`, `.env.compose.example`, `.env.test.example`, and service-specific examples

### 5. CI/CD and deployment context

Read when validation, deployment, secrets, or rollout proof changes:

- `.github/workflows`
- Dockerfiles
- Railway/Vercel/Fly docs/config
- rollout scripts
- audit scripts
- release-gate-runner contract files

## Conflict Resolution

If docs, code, tests, and this skill disagree:

1. Prefer currently enforced code/tests over prose docs.
2. Prefer newer architecture/deployment docs over stale comments.
3. Prefer security-preserving interpretation over convenience.
4. Report the inconsistency if it affects implementation.
5. Do not silently implement the less secure or older path.

Known stale-risk area: older notes may describe Twitch OAuth as a Next.js exception. The active architecture is gateway-owned OAuth for Twitch, YouTube, TikTok, and Kick.

## Efficient Search Recipes

Use targeted search before creating files or contracts.

### General orientation

- Search package names and route names before adding new modules.
- Search for existing type names in `packages/types` before creating app-local duplicates.
- Search for nearby tests before adding a new test style.
- Search for env validation before adding new variables.

### Common search targets by task

Dashboard UI:

- dashboard route folder
- existing module folder
- navigation/sidebar definitions
- `manualActions`, `disabledReason`, `empty`, `loading`, `error`

Publishing:

- `content_publications`
- `content_publication_events`
- `publication.publish`
- `publication.reconcile`
- `streamos-publishing`
- `publishing-worker`
- `manualActions`
- `fanout`

Repurposing:

- `repurposing.plan`
- `streamos-repurposing`
- `manualReviewRequired`
- `reviewStatus`
- `approved`
- `export bundle`
- `sanitize`

OAuth/provider:

- `gateway-connect`
- `handoff`
- `PKCE`
- `APP_ENCRYPTION_KEY`
- `platform_connections`
- provider callback route
- disconnect route

Queue/worker:

- queue name constant
- job schema
- deterministic job ID
- `content_jobs`
- retry budget fields
- worker concurrency env

Deployment/release:

- Dockerfile for service
- Railway service name
- healthcheck path
- `rollout:check`
- `release-gate-runner`
- `snapshot_not_proof_capable`
- env audit rules

## Active Frontend Shape

Use this shape for `apps/web/src` unless the repository has intentionally evolved:

- `app/`: App Router routes, layouts, server actions, route handlers.
- `app/dashboard/`: authenticated dashboard product routes.
- `app/api/`: web-owned server concerns and app-facing proxies.
- `components/ui/`: reusable UI primitives.
- `components/layout/`: dashboard shell/navigation/layout components.
- `components/modules/`: feature-specific product modules.
- `data/`: static/demo/module data where the repo already uses this pattern.
- `lib/supabase/`: Supabase browser/server clients and auth helpers.
- `lib/integrations/`: provider-facing helpers that must not expose secrets to browser code.
- `lib/utils/`: shared web utilities.
- `store/`: small client-side UI state only.
- `types/`: app-local types only when they do not belong in `packages/types`.

Server components are the default. Add `"use client"` only for interactivity, browser APIs, client-only Supabase clients, Zustand, Recharts/charts, local state, or effects.

Do not move product-specific dashboard widgets into `packages/ui` unless reuse is confirmed.

## Module Placement Rules

Use these defaults:

- Analytics UI: `apps/web/src/app/dashboard/analytics` and `apps/web/src/components/modules/analytics`.
- Clips/content job UI: `apps/web` dashboard route/module; durable state in `content_jobs`.
- Repurposing review UI: `apps/web` dashboard/module; no auto-publish/export/render unless server contract exists.
- Publishing UI: `apps/web` dashboard/module; reads publication state/history; mutations go through server-owned routes/actions.
- Monetization UI: `apps/web` dashboard/module; writes/materialization service-side unless RLS explicitly permits safe user writes.
- Branding UI: `apps/web` dashboard/module; asset persistence through Supabase Storage/database contracts.
- Platform connections UI: `apps/web`; provider OAuth itself is gateway-owned.
- API Gateway commands/webhooks/OAuth: `services/api-gateway`.
- AI processing: `services/automation-service`, called by workers/gateway/trusted server paths only.
- Durable shared domain types: `packages/types`.
- Database schema/RLS: `packages/database/supabase/migrations`.
- Reusable UI primitives: `packages/ui` only when shared beyond one product module.

## Service Boundary Rules

### Browser and Next.js

Browser code may call:

- Next.js pages, server actions, and route handlers in `apps/web`.
- API Gateway through approved app-facing server routes/actions.
- Supabase anon/publishable client only for allowed RLS-protected reads/writes.

Browser code must not call:

- OpenAI, Replicate, Whisper, or any AI provider directly.
- Supabase service-role operations.
- `services/automation-service` directly.
- Railway private URLs.
- Provider token endpoints when secrets are required.
- Provider write APIs for publishing/crossposting.

### API Gateway

Use `services/api-gateway` for:

- Twitch, YouTube, TikTok, and Kick OAuth connect/callback/disconnect.
- App-facing backend APIs that aggregate or normalize data.
- External webhooks.
- Provider token refresh and encrypted token persistence.
- Provider profile/channel lookup.
- BullMQ job production.
- Rate-limited backend commands.
- Publishing contract validation, fanout preparation, publish/reconcile enqueue.
- Protected operator observability snapshots.

Production gateway invariants:

- Public `/health` stays available for Railway healthchecks.
- App-facing `/api/*` routes require `Authorization: Bearer $API_GATEWAY_SECRET` or `X-StreamOS-API-Secret` where applicable.
- Webhooks validate signature/secret and replay protection before side effects.
- Redis must back production observability/rate limit/replay state; memory fallback is local/test only.

### Automation Service

Use `services/automation-service` for:

- transcription processing,
- clip scoring and highlight analysis,
- repurposing plan generation,
- title/caption/description/hashtag generation when server contract exists,
- model-level validation and cost-sensitive inference.

The automation service should be private in production. Browser and Vercel client bundles must not call it.

### Workers

Use workers for long-running, retryable, or provider-write work:

- `stream-job-worker`: media event materialization and downstream fanout.
- `transcription-worker`: transcription job consumption and persistence.
- `clip-worker`: clip generation/scoring job consumption.
- `repurposing-worker`: manual-review-only repurposing plan jobs.
- `publishing-worker`: approved publication execution and reconciliation.
- `content-job-retry-worker`: durable retry orchestration.

Workers must be private Railway worker dynos unless the repo proves a different production topology.

## Supabase and Database Rules

SQL migrations are the source of truth.

For every tenant-owned table:

- include `user_id` unless there is a documented reason not to,
- apply RLS scoped to `auth.uid()`,
- add explicit grants/policies when exposed through Supabase Data API,
- prevent clients from writing service-managed columns,
- keep provider tokens, internal job state, and AI/provider secrets hidden from authenticated client reads.

Known server-managed areas include:

- `platform_connections` token columns,
- `metrics_snapshots` writes,
- `vod_assets`, `stream_transcripts`, `stream_highlights`, `clips`, `clip_exports` writes,
- `content_jobs.status`, `content_jobs.result`, `content_jobs.error_message`, retry fields,
- `content_publications` execution/reconcile state,
- `content_publication_events`,
- `content_publication_fanouts` and targets when present,
- monetization ingestion and summary materialization.

Do not rewrite old migrations. Add new migrations for schema changes.

When adding schema/contracts, update all relevant consumers:

- migration,
- generated DB types if the repo tracks them,
- `packages/types` if shared across owners,
- gateway/services/workers/web imports,
- tests and fixtures.

## API Design Rules

Default to REST for StreamOS commands, resources, OAuth callbacks, sync endpoints, and webhooks.

Every API change must define:

- owner runtime,
- route/resource,
- request shape,
- response shape,
- auth/authorization model,
- tenant-isolation behavior,
- side effects,
- error model and status codes,
- pagination/cursor strategy for lists,
- caching/rate-limit expectations,
- idempotency strategy when retries or webhooks are involved,
- location of shared types/contracts.

Use GraphQL only when the repo already has a GraphQL boundary or the user explicitly asks for flexible nested reads.

Use Supabase Realtime, server-sent events, or WebSocket patterns for live viewer counts, stream status, ingestion progress, job progress, notifications, or dashboard presence when the existing repo supports that pattern.

## AI Pipeline Rules

Every AI workflow must define:

- input source and validation,
- size/duration/token limits,
- processing owner,
- model selection,
- timeout behavior,
- retry behavior,
- rate-limit handling,
- cost controls,
- output schema,
- persistence model,
- provenance/auditability,
- user review/approval behavior,
- logging without secrets or sensitive payloads.

Manual review is required when AI output affects:

- public posting,
- crossposting,
- sponsorship or revenue reporting,
- brand-facing assets,
- user-visible claims/recommendations that may harm trust.

OpenAI keys are server-only and belong to `services/automation-service` unless a current server-only exception is present in code. Never add `NEXT_PUBLIC_OPENAI_KEY` or `NEXT_PUBLIC_OPENAI_API_KEY`.

## Publishing and Crossposting Rules

Publishing is one of the highest-risk domains because it can trigger third-party writes.

Codex must preserve these invariants:

- Browser never calls provider write APIs.
- Only approved repurposing snapshots can feed publication creation.
- The gateway validates tenant, connection, scope, asset/bundle eligibility, and target policy before enqueue.
- The publication snapshot is frozen before worker execution.
- Worker writes status transitions and audit events.
- Manual actions must derive from the same policy semantics as server actions.
- UI availability and server acceptance must not drift.
- Reconcile is safe and idempotent.
- Retries are bounded and policy-aware.
- Real provider publishing is not part of production gate proof.

### Single-target publication

For single-target publish work, inspect:

- publication routes,
- publication shared types,
- queue contract,
- `publishing-worker`,
- `content_publications` persistence,
- `content_publication_events`,
- web UI policy helpers.

### Fanout/crossposting

For fanout work, preserve parent/child consistency:

- Parent fanout status must aggregate child target state intentionally.
- Child retry/reconcile/manual-control policies must include child-specific guards.
- Blocked targets should remain inspectable and individually recoverable.
- Target cards must not imply provider write success before child publication has proof.
- Fanout event history should stay auditable.

### Scheduling

Scheduling should start as a contract/UI visibility layer unless the user explicitly asks for scheduler execution.

Do not add a production scheduler before:

- publish/reconcile is stable,
- fanout targets are auditable,
- manual controls are safe,
- retry/reconcile semantics are clear,
- provider-specific timing/rate-limit behavior is modeled.

## Environment Variable Rules

When adding/changing env variables:

- update relevant env example files,
- distinguish browser-safe `NEXT_PUBLIC_*` from server-only secrets,
- document runtime owner,
- add startup validation where existing service validation exists,
- preserve production fail-closed behavior for critical secrets,
- do not leak secret values into output.

Runtime ownership:

- `apps/web` on Vercel: browser-safe Supabase publishable values, app origin, API gateway URL, server-only gateway secret for handoff/proxy where required.
- `services/api-gateway` on Railway: provider secrets, webhook secrets, Redis, Supabase service-role, encryption key, gateway secret, observability/rate limit/replay state.
- `services/automation-service`: AI provider credentials and model config.
- Workers: Redis, Supabase service-role, queue names, concurrency, private automation URL only if that worker actually calls automation.
- `publishing-worker`: provider credentials and `APP_ENCRYPTION_KEY` when token decryption is required; no `AUTOMATION_SERVICE_URL` unless a future contract adds it.
- `release-gate-runner`: operator/proof-only env needed for production gate; no product traffic.

Never place these in browser-facing env:

- Supabase service-role key,
- provider client secrets,
- Redis URLs,
- OpenAI/Replicate keys,
- webhook secrets,
- encryption keys,
- Railway private URLs,
- provider refresh/access tokens.

## Security Baseline

Always preserve:

- no hardcoded API keys, tokens, secrets,
- no secrets in browser bundles,
- no plaintext provider token persistence,
- no provider token logging,
- no unprotected admin/operator routes,
- no unsigned/unvalidated webhooks,
- no replayable webhook side effects,
- no cross-user or cross-workspace access,
- no service-role use without server-side session or trusted service context,
- no PII/token leakage in errors, analytics, traces, reports, or logs,
- no unbounded AI usage/media processing,
- no unchecked file upload/media ingestion,
- no database table exposed through Data API without RLS and grants,
- no rollout promotion without valid gate proof.

If a requested change weakens these constraints, stop and report the safer design.

## Performance and Scalability Rules

Prefer:

- background jobs for media, AI, sync, import/export, publishing, reconciliation, and retries,
- cursor-based pagination for lists, histories, logs, and events,
- aggregated snapshots for analytics dashboards,
- debounced UI-triggered expensive queries,
- caching stable provider metadata where safe,
- deterministic job IDs for duplicate-prone webhooks/events,
- server-side provider normalization,
- Redis-backed production rate limiting/replay/observability,
- minimal client bundles,
- heavy charting only in client-scoped components,
- separation of live data, raw ingestion, normalized metrics, and aggregates.

Do not put long-running work in Vercel route handlers when a worker/service exists.

## Validation Matrix

Run narrow checks first. Expand when the change crosses boundaries.

### Root or broad cross-package changes

- `pnpm validate`

### Web dashboard changes

- `pnpm --filter @streamos/web lint`
- `pnpm --filter @streamos/web test` when tests exist or behavior changed
- `pnpm --filter @streamos/web build` for route/layout/env/server-boundary changes

### API Gateway changes

- `pnpm --filter @streamos/api-gateway lint`
- `pnpm --filter @streamos/api-gateway test`
- `pnpm --filter @streamos/api-gateway build`

### Automation service changes

- `python -m pytest services/automation-service`

### Stream job worker changes

Use the package name from the repo. Common candidates are `stream-job-worker` or `@streamos/stream-job-worker`. Inspect `workers/stream-job-worker/package.json` first.

- package-specific lint
- package-specific test
- package-specific build

### Transcription worker changes

- `pnpm --filter @streamos/transcription-worker lint`
- `pnpm --filter @streamos/transcription-worker test`
- `pnpm --filter @streamos/transcription-worker build`

### Clip worker changes

- `pnpm --filter @streamos/clip-worker lint`
- `pnpm --filter @streamos/clip-worker test`
- `pnpm --filter @streamos/clip-worker build`

### Repurposing worker changes

Inspect package name first, then run package-specific:

- lint
- test
- build

### Publishing worker changes

- `pnpm --filter @streamos/publishing-worker lint`
- `pnpm --filter @streamos/publishing-worker test`
- `pnpm --filter @streamos/publishing-worker build`

If the package name differs, use the actual `package.json` name.

### Content job retry worker changes

- `pnpm --filter @streamos/content-job-retry-worker lint`
- `pnpm --filter @streamos/content-job-retry-worker test`
- `pnpm --filter @streamos/content-job-retry-worker build`

### Queue or E2E job flow changes

- `pnpm e2e:jobs`
- `pnpm e2e:transcription` when the media/transcription path is affected

### Deployment or release-gate changes

Use the current scripts from root `package.json`. Current expected modes include:

- `pnpm rollout:check:local` for local diagnostic only
- `pnpm rollout:check:production` only from a proof-capable Railway runtime
- Railway audit scripts when env/service topology changes

Do not treat local diagnostics as promotable production proof.

If validation cannot run because dependencies, env vars, Docker, Python, external services, or private networks are unavailable, report exactly what did not run and why.

## Local Setup Guidance

When asked how to run StreamOS locally, inspect docs and package scripts first.

Baseline expectations:

- install dependencies from repo root with the package manager already used by the repo,
- copy root and app env examples into local env files,
- fill Supabase values before Compose-backed infrastructure,
- start only `apps/web` for dashboard-only work,
- start Redis, API Gateway, automation-service, and workers for queue/integration work,
- dashboard usually runs at `/dashboard` on port `3000`,
- API gateway health usually runs at port `4000`,
- automation-service health usually runs at port `8000` when exposed locally.

Do not invent setup commands when README/package scripts already document them.

## CI/CD and Deployment Rules

When changing deployment:

- keep Railway services built from repo root when workspace packages are needed,
- keep API Gateway public and workers private,
- keep Automation Service private after smoke testing,
- keep Vercel client bundles away from Railway private URLs,
- preserve healthcheck paths,
- keep production secrets scoped to platform secret stores or GitHub Environments,
- do not promote when rollout checks fail,
- do not treat `api-gateway` public networking rules as worker rules.

### Release-gate invariants

A promotable production gate must run from `release-gate-runner` or an equivalent Railway runtime that:

- is in the same Railway project and environment as the release candidate,
- contains the same release-candidate snapshot,
- has required gate scripts and workspace sources,
- can reach private Automation Service,
- proves API Gateway runtime provenance,
- uses a valid non-sensitive public transcription fixture asset when required.

A stopped runner, generic helper shell, local terminal, Vercel function, or runtime missing gate-required files is not proof-capable.

## Implementation Guardrails

Codex must not:

- introduce dependencies without justification,
- refactor unrelated code,
- change public contracts without updating shared types/tests/docs,
- duplicate durable shared types locally,
- silence TypeScript/lint/test failures,
- add `any`/casts as a shortcut at service boundaries,
- remove tests instead of fixing behavior,
- weaken startup validation,
- make private workers public,
- add provider writes to the browser,
- mark validation successful when it did not run.

Codex should:

- reuse naming conventions,
- keep diffs scoped,
- prefer explicit boundary types,
- add/update tests near behavior,
- preserve accessibility/responsive states when UI changes,
- update docs/env examples with contract changes,
- explain architecture decisions in final summary.

## Planning-Only Output Format

When the user asks for planning, architecture review, or a prompt rather than implementation, respond with:

1. Goal.
2. Recommended architecture.
3. Affected paths.
4. Data flow.
5. Security constraints.
6. Performance/scaling considerations.
7. Implementation steps for Codex.
8. Validation plan.
9. Risks and follow-ups.

Keep it concrete. Name likely files/packages, but do not pretend files exist unless inspected.

## Implementation Output Format

After implementation, report:

1. Result summary.
2. Files changed, grouped by package/service.
3. Architecture decisions.
4. Security and tenant-isolation notes.
5. Validation commands run and results.
6. Commands not run and why.
7. Remaining risks/follow-ups.

Lead with blockers or failed validation.

## Review Output Format

When reviewing a repo/diff, lead with highest risk:

1. Critical security or tenant-isolation issues.
2. Runtime/deployment blockers.
3. Broken service boundaries.
4. Data model or migration risks.
5. Provider/API write risks.
6. Queue/retry/idempotency risks.
7. Performance/scaling risks.
8. Maintainability issues.
9. Concrete fixes and validation commands.

Use severity labels only when helpful: Critical, High, Medium, Low.

## Feature Checklists

### Structure or scaffold task

- Determine monorepo vs single-app target.
- Keep active frontend work under `apps/web/src`.
- Use root `src/` only for a confirmed single-app scaffold.
- Verify module placement before creating files.
- Do not create all baseline files by default.
- Report deviations from reference structure.

### Dashboard feature

- Route belongs under `apps/web/src/app/dashboard` unless repo says otherwise.
- Reuse dashboard layout/navigation.
- Keep business widgets in `components/modules` unless colocated by existing pattern.
- Prefer server data fetching.
- Limit client components to interactivity/charts/browser APIs.
- Handle empty, loading, error, unauthorized, and responsive states.
- Do not expose server-only env to client.

### Supabase schema feature

- Add new migration.
- Include tenant isolation.
- Add RLS and grants.
- Protect service-managed columns.
- Update shared contracts/types.
- Add tests or validation notes for tenant behavior.

### Provider integration

- Use gateway-owned OAuth for Twitch, YouTube, TikTok, Kick.
- Keep provider secrets server-only in Railway gateway.
- Encrypt tokens before persistence.
- Rotate refresh tokens when provider returns replacements.
- Handle missing scopes, revoked tokens, and rate limits.
- Validate webhooks and replay protection.
- Logs must exclude tokens and sensitive payloads.

### AI or automation feature

- Browser never calls AI providers.
- Long-running work is queued.
- Job status is persisted.
- Retries are bounded/idempotent.
- Model choice matches complexity.
- Cost/media limits are explicit.
- Output schema is validated.
- User-facing/public-output paths include review.

### Worker or queue feature

- BullMQ remains Node-owned.
- Queue names come from env/config.
- Job payloads are typed/validated.
- Duplicate-prone jobs use deterministic IDs.
- `content_jobs` stays durable source of truth.
- Retry behavior preserves `max_retries`, `retry_count`, `next_retry_at` semantics.
- Worker startup fails closed for missing critical env.

### Publishing feature

- Start from approved repurposing result.
- Gateway validates snapshot and target.
- Worker performs provider write.
- Audit events are appended.
- Reconcile is idempotent.
- UI manual actions align with server policy.
- No browser provider writes.
- No real provider publish in release gate.

### Fanout feature

- Validate parent and each target server-side.
- Persist parent/child/fanout audit rows before execution.
- Keep blocked targets inspectable.
- Child manual controls include child-specific guards.
- Parent aggregate status is derived intentionally.
- UI does not hide child errors behind a green parent.

### Deployment feature

- Runtime ownership unchanged unless explicitly requested.
- Env vars documented by runtime.
- Healthchecks remain valid.
- Private networking preserved.
- Worker public networking disabled.
- Release-gate proof requirements identified before promotion.

## Common Anti-Patterns To Avoid

- Creating a new root frontend when `apps/web` already exists.
- Adding provider OAuth callbacks to `apps/web` instead of gateway.
- Adding service-role Supabase code to client components.
- Calling Automation Service from browser/Vercel client bundle.
- Letting UI action availability drift from server action policy.
- Creating a new queue name without env/config/docs/tests.
- Writing AI outputs straight to public posting flows without review.
- Treating local rollout diagnostics as production proof.
- Adding a public domain to a worker.
- Committing audit files containing secret values.
- Changing a migration that may already be released.

## Definition of Done

A StreamOS task is done only when:

- requested behavior is satisfied,
- correct service owns the behavior,
- existing patterns and naming are respected,
- tenant isolation is preserved,
- secrets remain server-only,
- env changes are documented in appropriate examples,
- database changes include migration/RLS/grants discipline,
- AI/media work is bounded, queued, retry-safe, and cost-aware,
- provider writes stay server-owned,
- UI changes cover responsive/empty/loading/error states where applicable,
- tests or validation commands were run, or limitations are explicitly reported,
- final summary is specific enough for a human reviewer to audit the diff quickly.

## Final Response Checklist For Codex

Before finishing, Codex must include:

- what changed,
- why the chosen owner/service is correct,
- files changed,
- validations run with results,
- validations not run with reason,
- security/tenant isolation note,
- deployment/env note when relevant,
- remaining risks or next steps.
