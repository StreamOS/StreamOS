# AGENTS.md — StreamOS Codex Operating Guide

## 1. Purpose

This file defines how Codex must work inside the StreamOS repository. It is not a generic coding guide. It is a repo-specific execution contract for producing small, safe, reviewable changes in the StreamOS monorepo.

Codex should optimize for:

- fast repository orientation before editing;
- correct service ownership;
- minimal diffs;
- tenant isolation;
- server-only secret handling;
- reliable validation evidence;
- clear summaries for human review.

When this file conflicts with the actual repository, the existing repository and the nearest local `AGENTS.md` take precedence. Do not invent architecture that is not present in the checked-out repo.

---

## 2. Product Context

StreamOS is an AI-powered creator operations platform for streamers and creator teams.

Core product areas:

- Discoverability and SEO optimization for creator channels.
- Monetization dashboards for subscriptions, donations, merch, sponsorships, and affiliate revenue.
- Content automation for transcription, clip generation, highlight detection, repurposing, exports, publishing, and crossposting.
- Branding tools for overlays, alerts, channel design, and brand kits.
- Multi-platform management for Twitch, YouTube, TikTok, and Kick.
- Analytics and performance tracking across platforms and content workflows.

The product is multi-tenant. Every feature must preserve user/workspace isolation, auditability, and server-side ownership of sensitive operations.

---

## 3. Active Technical Stack

Use the existing repo configuration as source of truth. These are the expected defaults:

- Frontend: Next.js App Router, React, TypeScript, Tailwind CSS.
- Backend: Node.js API Gateway plus Python FastAPI automation service.
- Database: Supabase PostgreSQL with Row Level Security.
- Queues: BullMQ with Redis.
- AI: OpenAI and transcription models through server-side services only.
- Deployment: Vercel for `apps/web`; Railway for `services/*`, `workers/*`, and release-proof runtimes.

Do not add Firebase, a new API framework, a second queue system, or a new state/data layer unless the task explicitly requires it and the trade-off is documented.

---

## 4. Active Monorepo Shape

Primary workspace layout:

```text
apps/
  web/                         # Next.js App Router dashboard and web-owned BFF routes
services/
  api-gateway/                 # Public backend entrypoint, provider OAuth, webhooks, queue producers
  automation-service/          # FastAPI AI/transcription/repurposing APIs
workers/
  stream-job-worker/           # Canonical streamos-media consumer
  transcription-worker/        # Canonical streamos-transcription consumer
  clip-worker/                 # Canonical streamos-clip-generation consumer
  repurposing-worker/          # Canonical streamos-repurposing consumer
  publishing-worker/           # Canonical streamos-publishing consumer
  content-job-retry-worker/    # Durable retry orchestration for failed content_jobs
packages/
  config/                      # Shared config
  database/                    # Supabase migrations, DB contracts, helpers
  queue/                       # Shared queue contracts/helpers when present
  types/                       # Shared domain contracts
  ui/                          # Reusable UI primitives only when truly shared
scripts/                       # Rollout, audit, E2E, deployment verification scripts
docs/                          # Architecture, deployment, runbooks, test plans
```

Production frontend work belongs in `apps/web`. Do not create a new root `src/` app, Vite app, Electron app, or duplicate dashboard surface.

---

## 5. Codex Prime Directive

Before editing, Codex must:

1. Identify the task type and affected StreamOS module.
2. Inspect relevant repository context.
3. Map the correct service boundary and data owner.
4. Search for existing patterns, contracts, tests, helpers, and naming.
5. Make the smallest safe change that satisfies the request.
6. Preserve tenant isolation, server/client boundaries, and secret handling.
7. Run the narrowest useful validation first, then broader validation when justified.
8. Report changed files, validation results, assumptions, and remaining risks.

Do not ask broad clarification questions. Make reasonable MVP assumptions unless the task affects tenant model, token/security model, provider ownership, production deployment topology, billing behavior, destructive data migration, or AI cost profile.

---

## 6. Fast Task Classifier

Use this classifier to route work quickly:

| Task type                                        | First place to inspect                                                                     | Typical owner                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Dashboard UI, routes, UX states                  | `apps/web/src/app`, `apps/web/src/components`                                              | `apps/web`                                 |
| Dashboard server action or web-owned route       | `apps/web/src/app/**/actions.*`, `apps/web/src/app/api/**`                                 | `apps/web`, unless gateway-owned           |
| Provider OAuth, token refresh, disconnect        | `services/api-gateway/src`                                                                 | `services/api-gateway`                     |
| Provider webhooks or app-facing backend commands | `services/api-gateway/src`                                                                 | `services/api-gateway`                     |
| AI planning, transcription, clip scoring         | `services/automation-service`                                                              | `services/automation-service`              |
| Queue payloads and job contracts                 | `packages/types`, `packages/queue`, producer/consumer tests                                | Shared contract plus owning service/worker |
| Transcription pipeline                           | `workers/stream-job-worker`, `workers/transcription-worker`, `services/automation-service` | Node workers + FastAPI                     |
| Repurposing pipeline                             | `workers/repurposing-worker`, `services/automation-service`, `packages/types`              | Worker + FastAPI                           |
| Publishing or reconciliation                     | `services/api-gateway`, `workers/publishing-worker`, `packages/types`                      | Gateway + publishing worker                |
| Fanout/crossposting                              | `services/api-gateway`, `apps/web` fanout UI, publishing contracts                         | Gateway + web UI                           |
| Retry/manual intervention                        | API gateway routes, retry worker, UI action policies                                       | Gateway + worker + web                     |
| Supabase schema/RLS                              | `packages/database/supabase/migrations`                                                    | Database package                           |
| Deployment, env, release gates                   | `docs/deployment.md`, Dockerfiles, `.github/workflows`, `scripts`                          | CI/CD and runtime owner                    |
| Repo audit or worktree stabilization             | root files, package configs, tests, git diff                                               | whole repo                                 |

---

## 7. Repository Context Loading Order

Use the smallest sufficient context. Do not read the entire repository unless the task requires an audit.

Recommended order:

1. Root orientation:
   - `README.md`
   - `architecture.md` or `docs/architecture.md`
   - `deployment.md` or `docs/deployment.md`
   - `package.json`
   - `pnpm-workspace.yaml`
   - `turbo.json`
2. Nearest instruction files:
   - root `AGENTS.md`
   - local `AGENTS.md` under the target package, if present
3. Target package/service:
   - nearest `package.json`, Python project config, or service README
   - source folder for the affected module
   - nearby tests and fixtures
4. Shared contracts:
   - `packages/types`
   - `packages/queue`
   - `packages/database`
   - Supabase migrations
5. Runtime/deployment context, when relevant:
   - `.env.example`, `.env.compose.example`, `.env.test.example`
   - Dockerfiles
   - `.github/workflows`
   - `scripts/*rollout*`, `scripts/*audit*`, `scripts/*deployment*`

Always search for existing names before creating new files. Prefer extending current modules over adding parallel implementations.

---

## 8. Service Boundary Rules

### `apps/web`

Owns:

- Next.js App Router dashboard routes and layouts.
- Authenticated dashboard UI.
- Web-owned server actions and route handlers.
- Supabase SSR session handling.
- Short-lived provider connect handoff initiation to the API Gateway.
- Creator-facing views for jobs, review, export history, publications, fanouts, scheduling, and analytics.

Must not own:

- Provider token exchange or token refresh.
- Provider write APIs.
- OpenAI/Whisper/Replicate calls.
- Supabase service-role logic in browser code.
- Long-running media or AI processing.
- Private Railway service calls from client bundles.

### `services/api-gateway`

Owns:

- Public backend entrypoint.
- Twitch, YouTube, TikTok, and Kick OAuth flows.
- Signed handoff validation, PKCE state, callback validation, provider profile lookup, encrypted token persistence, refresh, disconnect, and safe redirects.
- External webhooks and webhook signature validation.
- App-facing backend commands requiring server ownership.
- BullMQ job production.
- Publication creation, publishing requests, reconciliation requests, and fanout preparation.
- Server-side provider token usage outside worker-owned execution.
- Distributed rate limiting and observability when enabled.

### `services/automation-service`

Owns:

- AI/transcription APIs.
- Clip scoring and highlight analysis.
- Repurposing plan generation.
- AI output validation and cost-sensitive workflows.
- Model selection, timeouts, size limits, and provider error mapping.

This service is private in production. Browser code and Vercel client bundles must never call it directly.

### Workers

Workers own long-running, retryable queue consumption:

- `stream-job-worker`: consumes `streamos-media`; materializes streams and downstream content jobs.
- `transcription-worker`: consumes `streamos-transcription`; calls the automation service; persists transcript/job state.
- `clip-worker`: consumes `streamos-clip-generation`; calls the automation service; persists clip/highlight outputs.
- `repurposing-worker`: consumes `streamos-repurposing`; calls `POST /repurposing/plan`; persists manual-review-only plans.
- `publishing-worker`: consumes `streamos-publishing`; executes provider publishing/reconciliation; persists publication state and audit events.
- `content-job-retry-worker`: scans failed `content_jobs`, respects retry budgets, and requeues supported jobs.

Python must not consume BullMQ directly. BullMQ semantics remain Node-owned.

---

## 9. Provider OAuth and Platform Rules

Twitch, YouTube, TikTok, and Kick are gateway-owned providers.

Required invariants:

- Dashboard creates only a short-lived signed handoff after validating the user session.
- Provider tokens never pass through browser code.
- Gateway owns PKCE, one-time state, callback validation, token exchange, provider profile/channel lookup, encrypted persistence, refresh, disconnect, and safe redirects.
- Provider secrets live only in server-side runtime environments.
- Access and refresh tokens are encrypted with `APP_ENCRYPTION_KEY` before persistence.
- Refresh tokens are rotated when providers return replacements.
- Webhook signatures are validated before events are processed.
- Logs must never include access tokens, refresh tokens, authorization codes, webhook secrets, or raw sensitive provider payloads.

Do not reintroduce a Next.js provider-secret exception unless a task explicitly asks to evaluate a migration and the security trade-off is documented.

---

## 10. Supabase and Database Rules

Supabase migrations live in:

```text
packages/database/supabase/migrations/
```

Rules:

- Add new migrations; do not rewrite released migrations.
- Every tenant-owned table must include `user_id` or a documented tenant ownership path.
- RLS must scope reads/writes to the authenticated user or workspace.
- Grants and policies must be explicit when exposed through the Supabase Data API.
- Service-managed columns must not be client-writable.
- Provider token columns must not be exposed to authenticated client reads.
- Runtime state such as job status, retry state, publication execution state, and provider write results must be service-managed.
- Shared domain contracts must be updated in `packages/types` when used by multiple workspaces.

Known server-managed areas:

- `platform_connections` token columns.
- `metrics_snapshots` writes.
- `vod_assets`, `stream_transcripts`, `stream_highlights`, `clips`, and `clip_exports` writes.
- `content_jobs.status`, `content_jobs.result`, `content_jobs.error_message`, retry columns, and queue correlation IDs.
- `content_publications`, `content_publication_events`, fanout state, provider result snapshots, and reconciliation metadata.
- Monetization ingestion and summary materialization.

---

## 11. Publishing, Fanout, and Scheduling Rules

Publishing is server-owned. Browser code may request actions, but it must not call provider write APIs directly.

Expected ownership:

- `services/api-gateway`: validates publish/fanout/reconcile requests, freezes snapshots, persists audit rows, and enqueues publishing jobs.
- `workers/publishing-worker`: consumes `streamos-publishing`, performs provider write/reconciliation, and persists final state.
- `apps/web`: displays creator/operator state, action availability, disabled reasons, history, fanout summary, and scheduling UI.
- `packages/types`: owns shared publication/fanout/scheduling contracts when used cross-package.

Rules:

- Only approved repurposing outputs can be publication sources.
- Publication snapshots must be immutable enough to audit what was approved and published.
- Manual retry/reconcile/final-failed actions must have explicit guards and disabled reasons.
- Parent fanout status must be derived from target/child state, not guessed in the browser.
- Child retry policies must include fanout-specific guards such as membership, fanout status, approved bundle availability, and publishable asset availability.
- Scheduling should start as contract and UI visibility unless the task explicitly adds scheduler execution.
- Real provider publishing must never be part of a generic release gate.

---

## 12. AI and Automation Rules

Every AI workflow must define:

- input source and validation;
- maximum media size/duration or token budget;
- model selection;
- timeout behavior;
- retry behavior;
- rate-limit behavior;
- cost-control assumptions;
- persisted job state;
- output schema validation;
- logging without secrets or sensitive payloads;
- review behavior when output affects public posting, revenue, sponsorship, or brand-facing assets.

Manual review is required for public posting, sponsorship-sensitive output, revenue-affecting recommendations, and brand-facing generated assets unless the product contract explicitly says otherwise.

Do not call AI providers from browser code. OpenAI keys and transcription provider credentials belong to `services/automation-service` unless an existing server-only exception is documented.

---

## 13. Environment Variable Ownership

When adding or changing environment variables:

- Update the relevant example file only; never write real `.env` values.
- Distinguish browser-safe `NEXT_PUBLIC_*` values from server-only secrets.
- Document which runtime owns each variable.
- Preserve fail-closed startup validation for critical production secrets.

Runtime ownership defaults:

| Runtime                                  | Owns                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `apps/web` on Vercel                     | browser-safe Supabase publishable values, app origin, API gateway URL, server-only gateway handoff secret |
| `services/api-gateway` on Railway        | provider secrets, webhook secrets, Redis, Supabase service-role, encryption key, API gateway secret       |
| `services/automation-service` on Railway | OpenAI/AI provider credentials, model config, media processing limits                                     |
| workers on Railway                       | Redis, Supabase service-role, queue names, concurrency, private service URLs when needed                  |
| `release-gate-runner`                    | proof-only runtime env needed for rollout checks; no product traffic                                      |

Never expose these to browser code or `NEXT_PUBLIC_*`:

- `OPENAI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_ENCRYPTION_KEY`
- provider client secrets
- refresh tokens
- webhook secrets
- Redis URLs
- Railway private service URLs

---

## 14. Security Hard Rules

Never violate these rules:

- No hardcoded secrets, API keys, tokens, private URLs, or credentials.
- No provider token logging.
- No secrets in browser bundles.
- No unsigned or unvalidated webhooks.
- No cross-user or cross-workspace data access.
- No service-role operations without trusted server context and tenant checks.
- No unbounded AI, media, import, export, or provider write operation.
- No public networking for worker services.
- No direct provider write APIs from browser code.
- No database table exposed through the Data API without explicit RLS and grants.
- No production promotion without the required gate evidence.

If a requested change weakens a hard rule, implement the safer alternative or stop and report the blocker.

---

## 15. Performance and Scalability Rules

Prefer:

- background jobs for media, AI, sync, imports, exports, retries, and publishing;
- idempotent job IDs for webhook and event-driven flows;
- cursor pagination for lists, events, history, publications, and logs;
- aggregated/snapshot tables for analytics dashboards;
- server-side normalization of provider data;
- bounded retries with audit events;
- debounce/throttle for expensive UI-triggered actions;
- small client bundles and isolated client components for charts/interactivity;
- Redis-backed rate limits, replay protection, and queue visibility in production.

Do not place long-running work in Vercel request handlers when a worker or service is available.

---

## 16. File Placement Rules

### Web dashboard

- Routes: `apps/web/src/app/dashboard/**`
- Route handlers: `apps/web/src/app/api/**` only for web-owned server concerns
- UI primitives: `apps/web/src/components/ui/**`
- Layout shell: `apps/web/src/components/layout/**`
- Product modules: `apps/web/src/components/modules/**`
- App-local utilities: `apps/web/src/lib/**`
- App-local types: `apps/web/src/types/**`

Keep product-specific widgets in `apps/web`. Move to `packages/ui` only when reused across multiple app surfaces.

### Shared contracts

- Durable domain contracts: `packages/types`
- Queue contracts/helpers: `packages/queue` when present
- Database migrations/contracts: `packages/database`
- Shared config: `packages/config`

### Services and workers

- Gateway commands/webhooks/OAuth: `services/api-gateway`
- FastAPI AI endpoints: `services/automation-service`
- Queue consumers: `workers/*`

Do not duplicate shared types in app-local folders when a cross-package contract exists.

---

## 17. Code Style and Implementation Rules

Follow the repo's actual configuration. Do not assume a style framework that is not configured.

Defaults:

- TypeScript strictness must be preserved.
- Prefer explicit types at service and package boundaries.
- Use existing naming conventions and file organization.
- Add client components only when interactivity, browser APIs, charts, effects, or client state require them.
- Keep server components as the default in Next.js.
- Keep Python code typed and aligned with existing FastAPI patterns.
- Do not silence TypeScript, lint, or test failures without fixing the cause.
- Do not introduce dependencies without checking existing alternatives and documenting why the dependency is necessary.
- Do not perform large opportunistic refactors while implementing a feature.

Codex may implement production-quality code when asked, but final responses should summarize the implementation rather than dumping large code blocks.

---

## 18. Commands Codex May Run

Run commands only when appropriate for the changed area and available environment.

Common orientation:

```bash
git status --short
git diff --stat
pnpm --version
```

Web:

```bash
pnpm --filter @streamos/web lint
pnpm --filter @streamos/web test
pnpm --filter @streamos/web build
```

API Gateway:

```bash
pnpm --filter @streamos/api-gateway lint
pnpm --filter @streamos/api-gateway test
pnpm --filter @streamos/api-gateway build
```

Automation service:

```bash
python -m pytest services/automation-service
```

Workers:

```bash
pnpm --filter @streamos/stream-job-worker lint
pnpm --filter @streamos/stream-job-worker test
pnpm --filter @streamos/stream-job-worker build
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
pnpm --filter @streamos/content-job-retry-worker lint
pnpm --filter @streamos/content-job-retry-worker test
pnpm --filter @streamos/content-job-retry-worker build
```

Cross-package or release-critical:

```bash
pnpm validate
pnpm e2e:jobs
pnpm e2e:transcription
pnpm rollout:check:local
```

If a filter name differs from the current repo, inspect `package.json` and use the actual package name.

---

## 19. Commands Codex Must Not Run Without Explicit User Approval

Do not run:

- commands that overwrite or create real `.env` files;
- production deploy commands;
- `vercel --prod`, `railway up`, `railway redeploy`, or equivalent production-impacting commands;
- database reset or destructive migration commands against hosted environments;
- commands that expose secrets in logs or reports;
- `git push --force`;
- direct pushes to `main`;
- Docker/Compose infrastructure commands unless the user explicitly allows local infrastructure usage;
- long-running watchers as final validation.

Codex may update `.env.example`, `.env.test.example`, `.env.compose.example`, or docs that describe env names, but must never fill real secret values.

---

## 20. Validation Matrix

Choose the narrowest meaningful validation first:

| Changed area                     | Required validation                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| Web UI only                      | web lint, web tests if behavior changed, web build for route/layout/env changes    |
| Web server action/API route      | web lint, web test, web build                                                      |
| API Gateway route/OAuth/webhook  | gateway lint, gateway test, gateway build                                          |
| FastAPI endpoint or AI workflow  | `python -m pytest services/automation-service`                                     |
| Worker behavior                  | target worker lint, test, build                                                    |
| Shared types/contracts           | affected package tests plus dependent service/worker tests                         |
| Supabase migration/RLS           | migration review plus tests if present; document tenant isolation evidence         |
| Queue producer/consumer contract | producer tests, consumer tests, shared contract tests, relevant E2E when practical |
| Publishing/fanout/reconcile      | gateway tests, publishing-worker tests, web tests if UI affected                   |
| Deployment/release gate scripts  | script tests if present, `pnpm validate`, local rollout diagnostic where safe      |
| Cross-package changes            | `pnpm validate`                                                                    |

If validation cannot run because dependencies, env, Docker, Python, network, or credentials are unavailable, say exactly what was not run and why. Never claim validation passed without evidence.

---

## 21. Git, Commit, and PR Rules

- Work on feature/fix/refactor branches, not directly on `main`.
- Use Conventional Commits when committing: `<type>(<scope>): <description>`.
- Common scopes: `web`, `api`, `automation`, `worker`, `queue`, `types`, `database`, `config`, `ci`, `docs`.
- Do not commit `.env*`, `node_modules/`, `.venv/`, `dist/`, `.next/`, generated secrets, local audit outputs with sensitive values, or temporary logs.
- For cross-cutting changes, prefer logical commits by workspace or concern.
- Commit only when the user asks for commits or the task explicitly includes worktree stabilization.
- Never push directly to `main`.

PR summaries should include:

- What changed.
- Why it changed.
- Validation run.
- Risks or follow-ups.
- Any commands not run and why.

---

## 22. Release and Deployment Rules

Deployment topology:

- `apps/web`: Vercel.
- `services/api-gateway`: Railway public service with `/health`.
- `services/automation-service`: Railway private service after smoke testing.
- `workers/*`: Railway private worker services with public networking disabled.
- `release-gate-runner`: Railway private proof runtime, not a product service.

Rules:

- Keep Railway services built from repository root when workspace packages are needed.
- Do not require Vercel client bundles to call private Railway services.
- Do not expose worker services publicly.
- Do not promote when rollout checks fail.
- A local diagnostic is not a production pass.
- Production gate must run from a proof-capable Railway runtime in the same project/environment and release-candidate snapshot.
- Real provider publishing is not part of the production gate.

---

## 23. Current Roadmap Alignment

When prioritizing or sequencing work, respect the current StreamOS direction:

1. Keep core media, transcription, repurposing, publishing, and audit contracts stable.
2. Prefer observability, UI clarity, manual controls, history, and analytics before adding broader automation.
3. TikTok execution should build on the same publication/reconciliation contracts as YouTube, not a separate path.
4. Crossposting fanout should be introduced after at least two provider targets behave consistently enough to expose parent/child state.
5. Scheduling should begin as a contract and lightweight calendar/UI visibility before scheduler execution.
6. Provider write paths must stay server-owned and auditable.
7. Every public-action workflow should expose state, disabled reasons, history, and safe retry/reconcile behavior.

Do not regress already-established P2/P3 safety boundaries: approved-only repurposing, manual-review-first outputs, server-side publishing, event history, and worker-owned execution.

---

## 24. Common Search Recipes

Use targeted searches before editing:

```bash
rg "content_publications|content_publication_events|publication" packages services workers apps
rg "fanout|content_publication_fanout" packages services workers apps
rg "repurposing" packages services workers apps
rg "manualActions|retry_publish|reconcile" apps services packages
rg "APP_ENCRYPTION_KEY|platform_connections|refresh_token" services workers packages apps
rg "SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_OPENAI|OPENAI_API_KEY" apps services workers packages
rg "streamos-publishing|PUBLICATION_QUEUE_NAME" packages services workers
rg "rollout:check|release-gate-runner|snapshot_not_proof_capable" scripts docs package.json
```

Adjust search terms to the task. Search first; create second.

---

## 25. Review Output Format

When reviewing a diff or repo state, lead with the highest-risk findings:

1. Critical security or tenant-isolation issues.
2. Runtime/deployment blockers.
3. Broken service boundaries.
4. Data model or migration risks.
5. Queue/job contract mismatches.
6. Provider/OAuth/publishing risks.
7. Performance/scaling risks.
8. Maintainability issues.
9. Concrete fixes and validation commands.

Do not bury security, provider-token, RLS, or production-gate issues under style feedback.

---

## 26. Implementation Output Format

After making changes, Codex must report:

1. Summary of what changed.
2. Files changed, grouped by package/service.
3. Architecture decisions made.
4. Security and tenant-isolation notes.
5. Validation commands run and results.
6. Commands not run and why.
7. Remaining risks or follow-up tasks.

Lead with blockers or failed validation if present.

---

## 27. Planning-Only Output Format

When asked for planning instead of direct implementation, answer with:

1. Goal.
2. Recommended architecture.
3. Affected paths.
4. Data flow.
5. Security constraints.
6. Performance/scaling considerations.
7. Implementation steps.
8. Validation plan.
9. Risks and follow-ups.

Keep plans concrete. Name likely paths, but do not pretend files exist unless inspected.

---

## 28. Anti-Patterns to Avoid

Avoid these patterns:

- Adding a new root app or duplicate dashboard.
- Calling AI providers from browser code.
- Putting provider secrets or service-role keys in `apps/web` client-visible envs.
- Creating provider-specific publish paths that bypass the shared publication contract.
- Duplicating domain types instead of updating `packages/types`.
- Rewriting released migrations.
- Making fanout state browser-derived instead of contract-derived.
- Adding global client state for durable server data.
- Hiding failed validation or presenting skipped validation as success.
- Adding dependencies for convenience without checking existing repo utilities.
- Refactoring unrelated modules during a feature task.
- Adding public networking to workers.
- Treating a green local diagnostic as production release proof.

---

## 29. Definition of Done

A StreamOS task is done only when:

- The requested behavior is implemented or the blocker is clearly reported.
- The correct service owns the behavior.
- Existing patterns and naming are respected.
- Tenant isolation is preserved.
- Secrets remain server-only.
- New env variables are documented in the correct example/docs file.
- Database changes include migration discipline, RLS, and grants where applicable.
- AI/media/provider work is bounded, queued, retry-safe, and cost-aware where applicable.
- Publishing and fanout actions are auditable and server-owned.
- UI changes include responsive, empty, loading, error, disabled, and unauthorized states where applicable.
- Tests or validation were run, or limitations were explicitly reported.
- The final summary is specific enough for a human reviewer to audit the diff quickly.
