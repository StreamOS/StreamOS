# AGENTS.md

## Project

You are working on StreamOS.

StreamOS is an AI-assisted operating layer for streamers and creator teams. It combines discoverability, SEO optimization, monetization insights, content automation, branding tools, multi-platform management, platform integrations, and analytics in one modular creator operations platform.

Your job is to implement requested changes safely, minimally, and consistently with the existing architecture.

Do not treat this repository as a greenfield project. Always inspect the current structure, existing patterns, shared packages, service boundaries, and tests before changing code.

---

## Core Rule

Before making changes:

1. Analyze the existing project structure.
2. Identify the relevant app, service, worker, package, route, component, or database contract.
3. Respect existing naming conventions, folder structure, types, and architectural decisions.
4. Make the smallest clean change that fully satisfies the task.
5. Avoid broad refactors unless the task explicitly requires them.
6. Do not introduce new dependencies unless clearly justified.
7. Do not hardcode secrets, tokens, API keys, credentials, provider secrets, or environment-specific values.
8. Do not expose server-only logic or credentials to browser code.
9. Do not create breaking changes without explicitly documenting why they are required.
10. After the change, summarize what changed, why it changed, and which files were touched.

---

## Repository Shape

This is a pnpm workspace and Turborepo monorepo.

Main areas:

- `apps/web`
  - Next.js App Router dashboard.
  - Main frontend product surface.
  - Dashboard routes, auth surfaces, server actions, route handlers, and UI modules live here.

- `services/api-gateway`
  - Node.js backend gateway.
  - Owns app-facing backend APIs, non-Twitch OAuth, webhook ingress, and BullMQ job producers.

- `services/automation-service`
  - FastAPI service.
  - Owns AI and clip automation APIs.
  - Handles transcription, clip analysis, title generation, repurposing, and related AI workflows.

- `workers/transcription-worker`
  - Node.js BullMQ worker.
  - Consumes transcription jobs and calls the automation service.

- `workers/clip-worker`
  - Node.js BullMQ worker.
  - Consumes clip generation jobs and calls the automation service.

- `workers/content-job-retry-worker`
  - Node.js BullMQ worker.
  - Requeues retryable failed `content_jobs`.

- `workers/stream-job-worker`
  - Stream webhook event materialization worker, if relevant to the task.

- `packages/config`
  - Shared TypeScript configuration.

- `packages/database`
  - Supabase contracts and migration helpers.
  - SQL migrations remain the source of truth for schema ownership.

- `packages/types`
  - Shared domain contracts and reusable types.

- `packages/ui`
  - Reusable React UI components.

The production frontend target is `apps/web`. Do not revive or depend on removed prototype app structures.

---

## Preferred Tech Stack

Use the existing project stack:

- Frontend: Next.js, React, TypeScript, Tailwind CSS.
- Backend gateway: Node.js.
- AI automation backend: Python FastAPI.
- Database: Supabase PostgreSQL.
- Queue system: BullMQ with Redis.
- AI providers: OpenAI API, Whisper/transcription models, Replicate where applicable.
- Deployment: Vercel for `apps/web`, Railway for gateway/services/workers, Fly.io only when GPU or regional compute becomes necessary.

---

## Application Boundaries

Respect these boundaries strictly.

### Frontend / `apps/web`

Use `apps/web` for:

- Dashboard routes.
- Product UI.
- Supabase SSR auth surfaces.
- Browser-safe client components.
- Server actions where already established.
- Next.js route handlers where the architecture explicitly allows them.

New frontend work should usually live under:

- `apps/web/src/app`
- `apps/web/src/components`
- `apps/web/src/components/modules`
- `apps/web/src/lib`
- `apps/web/src/data`
- `apps/web/src/store`
- `apps/web/src/types`

Keep UI components presentational where possible. Business logic should live in server actions, route handlers, services, shared packages, or backend services depending on the task.

### API Gateway / `services/api-gateway`

Use the API gateway for:

- Public backend entrypoints.
- App-facing backend APIs.
- New non-Twitch OAuth flows.
- Webhook ingress.
- BullMQ job production.
- Provider API integration that requires server secrets.
- Rate limiting, secret validation, and webhook validation.

YouTube, TikTok, and Kick OAuth are gateway-owned. Do not move those flows into the web app.

### Automation Service / `services/automation-service`

Use the FastAPI automation service for:

- AI analysis.
- Transcription.
- Clip scoring.
- Clip generation orchestration.
- Title generation.
- Repurposing metadata generation.
- Any provider or model call that must remain server-side.

Browser code must never call the automation service directly.

### Workers

Use workers for long-running or asynchronous jobs:

- Transcription processing.
- Clip generation.
- Failed job retry orchestration.
- Stream event materialization.
- Analytics ingestion if implemented as background processing.

Python does not consume BullMQ directly. BullMQ job semantics are Node-owned.

---

## OAuth And Platform Integration Rules

Provider tokens must never pass through browser-visible code.

### Twitch

Twitch OAuth is the current explicit exception:

- Twitch connect and callback routes currently live in `apps/web`.
- They use Next.js server route handlers and the Supabase SSR session from HTTP-only cookies.
- They use server-only service-role logic for encrypted token persistence.
- Do not move Twitch OAuth to the gateway unless the task explicitly requires a gateway migration and includes signed user-session handoff, tenant-safe Supabase access, encrypted token persistence, and integration coverage.

Do not expand the Twitch exception to new providers.

### YouTube, TikTok, Kick

YouTube, TikTok, and Kick OAuth are owned by `services/api-gateway`.

The gateway owns:

- Signed short-lived handoff token validation.
- PKCE.
- One-time state handling.
- Provider callback handling.
- Provider profile/channel lookup.
- Encrypted token persistence.
- Safe callback redirects.
- Tests for success and failure paths.

The web dashboard should initiate gateway-owned OAuth through the existing gateway-connect pattern instead of directly handling provider secrets.

---

## Security Rules

Security is non-negotiable.

Always enforce or preserve:

- No hardcoded secrets.
- No provider secrets in browser code.
- No `NEXT_PUBLIC_*` secrets except values that are intentionally public.
- No OpenAI keys in frontend code.
- No browser calls directly to OpenAI, Replicate, or private automation services.
- No Supabase service-role key in client components or browser bundles.
- OAuth access and refresh tokens must be encrypted before persistence.
- Token refresh must happen server-side.
- Refresh tokens must be rotated when providers return replacements.
- Webhook signatures or shared webhook secrets must be validated before processing.
- API gateway app-facing routes must enforce gateway authentication where required.
- Tenant-owned Supabase tables must include `user_id`.
- Row Level Security must protect tenant data.
- Clients must not mutate server-managed runtime state directly.
- Logs must not include secrets, OAuth tokens, refresh tokens, service-role keys, personal data, or raw provider credentials.

Pay special attention to:

- `platform_connections`
- `content_jobs`
- `metrics_snapshots`
- `vod_assets`
- `stream_transcripts`
- `stream_highlights`
- `clips`
- `clip_exports`
- `monetization_events`
- `monetization_summaries`

Server-managed state must remain server-managed.

---

## Database Rules

Supabase PostgreSQL is the database source of truth.

SQL migrations in `packages/database/supabase/migrations` are the source of truth for schema ownership.

When a task requires database changes:

1. Inspect existing migrations and contracts first.
2. Preserve the existing migration style.
3. Add tenant isolation using `user_id` where data is user-owned.
4. Add or preserve Row Level Security.
5. Include explicit grants and policies for new public tables.
6. Keep service-managed writes service-side.
7. Avoid exposing sensitive columns to authenticated browser clients.
8. Update shared contracts or types when required by existing patterns.
9. Do not add schema changes that duplicate existing entities.
10. Do not bypass existing Supabase security assumptions.

Core domain entities may include:

- `user_profiles`
- `creators`
- `channels`
- `platform_connections`
- `youtube_websub_subscriptions`
- `metrics_snapshots`
- `streams`
- `content_jobs`
- `vod_assets`
- `stream_transcripts`
- `stream_highlights`
- `clips`
- `clip_exports`
- `brand_assets`
- `monetization_events`
- `monetization_summaries`

Before creating new tables, verify whether one of these existing entities already covers the required concept.

---

## AI Workflow Rules

AI features must be designed for reliability, traceability, and cost control.

For any AI-related task, include or preserve:

- Server-side execution only.
- Clear input validation.
- Explicit job status tracking.
- Durable output persistence.
- Retry strategy.
- Rate-limit awareness.
- Cost-aware model selection.
- Safe error handling.
- No provider secrets in frontend code.
- No unbounded model calls.
- No silent failures.
- Human-reviewable outputs where relevant.
- Auditability of generated outputs.

Use stronger models for complex analysis and cheaper/faster models for lightweight generation when the existing configuration supports that distinction.

AI workflow stages should be clear:

- Input: VOD, clip, audio, transcript, chat, metadata, analytics, platform data, or branding data.
- Processing: transcription, segmentation, highlight detection, sentiment analysis, topic extraction, title generation, description generation, hashtag generation, SEO scoring, content repurposing, recommendations.
- Output: clip suggestions, generated metadata, analytics insights, monetization recommendations, branding suggestions, automation jobs, or persisted content records.

---

## Queue And Job Rules

BullMQ is used for automation jobs.

When changing queues or workers:

- Preserve existing queue names unless the task explicitly requires a change.
- Avoid duplicate job creation.
- Use stable job IDs when idempotency is required.
- Preserve retry behavior and backoff strategy.
- Keep job status persistence in Supabase consistent with existing `content_jobs` behavior.
- Do not let browser clients mutate runtime-only job fields.
- Ensure failed jobs are observable and retryable where appropriate.
- Ensure workers can run without public networking.
- Keep Redis credentials server-only.

`content_jobs` retry budget and retry state must remain consistent with the database source of truth.

---

## Frontend Rules

When working in `apps/web`:

- Use existing layout and dashboard patterns.
- Prefer existing UI components from local components or `packages/ui`.
- Keep client components minimal.
- Use server components, server actions, or route handlers where sensitive logic is involved.
- Never access provider secrets, service-role keys, or AI provider credentials from client components.
- Keep UI responsive.
- Handle loading, empty, error, and unauthorized states.
- Avoid large client-side data fetching when server-side fetching is more appropriate.
- Keep platform-specific states visible to users, especially disconnected, expired-token, missing-permission, syncing, failed, and retrying states.
- Do not add UI dependencies unless clearly justified.

For dashboards and analytics:

- Use pagination or aggregation for large datasets.
- Avoid loading unbounded analytics rows.
- Prefer normalized server-side snapshots or summaries.
- Keep mock data isolated and easy to replace with real data.

---

## API Rules

When implementing or changing APIs:

- Validate input.
- Authenticate requests.
- Authorize by tenant/user/workspace.
- Avoid leaking internal error details.
- Return clear errors for expected failure cases.
- Use existing response patterns.
- Apply rate limiting where appropriate.
- Validate webhook signatures before processing.
- Preserve idempotency for webhook and job-trigger endpoints.
- Do not expose service-role behavior to browser clients.
- Do not log secrets or sensitive payloads.

Use REST route handlers or the API gateway for simple commands and webhooks unless the existing architecture clearly uses another pattern.

---

## Performance Rules

Always consider:

- Pagination for lists.
- Aggregation for analytics.
- Avoiding unnecessary provider API calls.
- Caching where appropriate.
- Debouncing user-triggered sync actions.
- Queueing expensive AI or media processing work.
- Keeping long-running work out of request/response paths.
- Avoiding N+1 database access patterns.
- Respecting provider API rate limits.
- Keeping Vercel functions lightweight.
- Keeping private Railway service calls server-to-server.

For large media or analytics workflows, prefer asynchronous jobs over synchronous UI-triggered processing.

---

## Testing And Validation

Before finalizing changes, run the most relevant validation for the touched area.

Use the repository’s existing validation approach. Common validation targets include:

- Root workspace validation: `pnpm validate`.
- Web app checks for `apps/web`.
- API gateway lint, test, and build tasks.
- Automation service tests through Python pytest.
- Worker lint, test, and build tasks.
- Job E2E paths where relevant.
- Rollout checks for deployment-sensitive changes.

Do not invent a new test framework if one already exists.

When adding behavior:

- Add tests when existing coverage patterns are present.
- Update tests when behavior changes.
- Include failure-path coverage for auth, OAuth, webhooks, queues, retries, and AI job failures.
- For UI work, verify loading, empty, error, unauthorized, and success states.
- For database changes, verify RLS assumptions and server-managed write boundaries.

If validation cannot be run, clearly state what should be run and why it was not run.

---

## Deployment Awareness

Respect the production topology:

- `apps/web` deploys to Vercel.
- `services/api-gateway` deploys to Railway.
- `services/automation-service` deploys to Railway first, with Fly.io as a later option for GPU or regional compute.
- Workers deploy as Railway worker dynos.
- Automation service should remain private in steady-state production.
- API gateway is public and owns external backend ingress.
- Browser code must not call private services directly.

Do not introduce architecture that requires browser access to private Railway services.

Do not add environment variables casually. If a new environment variable is required:

1. Use a clear server-only name.
2. Document where it must be configured.
3. Avoid `NEXT_PUBLIC_*` unless the value is truly safe for browser exposure.
4. Explain whether it belongs in Vercel, Railway, Supabase, or CI secrets.
5. Preserve staging and production separation.

---

## StreamOS Product Modules

Keep module boundaries clean.

Main modules:

- Auth
- Workspace / creator profile
- Platform management
- Analytics
- Content automation
- Discoverability and SEO
- Monetization
- Branding
- Billing
- Admin
- Settings

Do not mix unrelated module logic.

Examples:

- Analytics UI should not directly own OAuth token refresh logic.
- Branding UI should not directly call AI providers.
- Content automation jobs should not be run inside client components.
- Monetization summaries should not be mutated directly from the browser.
- Platform integrations should not expose provider secrets to frontend code.

---

## MVP Priority

When a task is vague, default to MVP-safe implementation.

Preferred product priority:

1. Auth and protected dashboard foundation.
2. Creator profile and workspace structure.
3. Platform connections.
4. Dashboard shell.
5. Analytics foundation.
6. Content import or VOD/clip management.
7. AI transcription.
8. Clip and highlight detection.
9. Discoverability and SEO.
10. Monetization dashboard.
11. Branding tools.
12. Automation workflows.
13. Billing and SaaS plans.
14. Admin.
15. Monitoring, scaling, and optimization.

If the request is broad, implement the smallest useful slice that fits this order.

---

## Handling Ambiguous Tasks

When the task is unclear:

1. Inspect the repository first.
2. Infer the most likely intended scope from existing architecture.
3. Keep the implementation small.
4. Prefer MVP behavior over speculative full-platform behavior.
5. Do not introduce large abstractions without need.
6. Ask for clarification only if multiple options would significantly change architecture, security, data ownership, or deployment topology.

Examples of vague tasks:

- “Build analytics”
- “Add Twitch”
- “Make the dashboard”
- “Integrate AI”
- “Add SEO”
- “Fix jobs”

For these, choose a safe MVP scope aligned with existing code instead of overbuilding.

---

## Change Discipline

Do not:

- Rewrite large parts of the app without explicit instruction.
- Move service boundaries casually.
- Add new state management libraries without need.
- Add new UI libraries without need.
- Add new database tables without checking existing schema.
- Add new environment variables without documenting them.
- Create provider integrations in the wrong runtime.
- Put secrets in frontend code.
- Disable RLS.
- Weaken auth checks.
- Bypass existing tests.
- Hide failures.
- Log sensitive values.
- Treat mock data as production data.
- Duplicate domain models.
- Create one-off patterns when a shared package or existing service already covers the need.

Do:

- Keep changes scoped.
- Reuse existing contracts.
- Update shared types if required.
- Preserve tenant isolation.
- Preserve server-managed write boundaries.
- Add meaningful tests where patterns exist.
- Handle expected failure cases.
- Document important decisions in the final summary.
- Mention follow-up work when the task intentionally leaves something out.

---

## Final Response Requirements

After completing a task, provide a concise technical summary with:

1. What changed.
2. Which files were modified.
3. Why the chosen approach fits the existing architecture.
4. What validation was run.
5. Any validation that could not be run.
6. Security or migration notes, if relevant.
7. Suggested follow-up tasks, if relevant.

Do not include unnecessary narrative.

If the task touches auth, OAuth, tokens, RLS, webhooks, AI providers, queues, billing, or deployment, explicitly mention the relevant security and operational considerations in the summary.

---

## Special Instructions For This Repository

Use these StreamOS-specific assumptions unless the existing code proves otherwise:

- `apps/web` is the only production frontend target.
- New non-Twitch platform OAuth belongs in `services/api-gateway`.
- Twitch OAuth currently remains in `apps/web` as a documented exception.
- AI provider calls belong in server-side services, usually `services/automation-service`.
- Long-running media and AI work belongs in queues and workers.
- Supabase SQL migrations are the schema source of truth.
- Tenant-owned tables require `user_id` and RLS.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- `OPENAI_API_KEY` is server-only.
- Provider tokens must be encrypted before storage.
- Browser code must call StreamOS server boundaries, not external AI providers or private services directly.
- The automation service should stay private in production.
- API gateway routes and webhooks must enforce secrets, signatures, handoff validation, or authentication depending on the route type.

Build StreamOS as a secure, modular, scalable SaaS product. Prefer boring, explicit, maintainable architecture over clever abstractions.
