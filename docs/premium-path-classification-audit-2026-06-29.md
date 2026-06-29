# StreamOS Premium Path Classification Audit

Date: 2026-06-29
Branch: `feature/docs/premium-path-classification-audit-clean`
Decision: `classification_ready_for_gateway_slice`
Baseline: merged internal automation entitlement wrapper present; no productive premium route activated

## Executive Summary

This audit classifies current and planned StreamOS runtime paths so the next
premium-enforcement slice can stay small, explicit, and safe.

Primary conclusions:

- The existing Automation Service endpoints `/clips/analyze`,
  `/repurposing/plan`, and `/transcriptions/process` remain productive
  Internal/System core pipeline paths. They must not be silently reclassified
  as premium.
- The internal `ai_assistant` wrapper is correctly treated as a planned
  Pro/Premium path, but it is not a productive runtime endpoint yet. The
  merged wrapper is only a prerequisite for future automation runtime
  activation and does not reclassify current productive worker traffic.
- The most plausible next premium-enforcement candidates are gateway-owned
  schedule mutation commands, not worker-owned automation endpoints.
- Current dashboard analytics, monetization, and branding surfaces are
  productive read/storage flows today. Their matching feature gates describe
  future premium overlays, not retroactive gating of the current runtime by
  default.
- The next technical slice should be `Gateway Premium Command Enforcement`.
  It should start with a narrowly chosen gateway-owned command and must not
  begin by gating current worker-to-automation traffic.

## Audit Scope And Evidence

Repository areas inspected for this audit:

- `services/api-gateway/src/app.ts`
- `services/api-gateway/src/routes/contentJobs.ts`
- `services/api-gateway/src/routes/contentPublications.ts`
- `services/automation-service/src/main.py`
- `services/automation-service/src/premium_runtime_enforcement.py`
- `services/automation-service/tests/test_premium_runtime_enforcement.py`
- `workers/stream-job-worker/src/index.ts`
- `workers/transcription-worker/src/automationClient.ts`
- `workers/clip-worker/src/automationClient.ts`
- `workers/repurposing-worker/src/automationClient.ts`
- `apps/web/src/app/dashboard/publications/schedule/actions.ts`
- `apps/web/src/app/dashboard/jobs/repurposing/actions.ts`
- `apps/web/src/app/dashboard/branding/actions.ts`
- `apps/web/src/app/api/dashboard/jobs/repurposing/export/route.ts`
- `apps/web/src/lib/entitlements/server.ts`
- `apps/web/src/lib/entitlements/persisted-plan.ts`
- `services/api-gateway/src/lib/automation-entitlement-issuer.ts`
- `services/api-gateway/src/lib/automation-entitlement-signing.ts`
- `packages/types/src/feature-gates.ts`
- `packages/types/src/automation-entitlement-assertions.ts`

Audit constraints:

- no productive enforcement change
- no DB, RLS, env, worker, or queue contract change
- no new dependencies
- no premium reclassification by implication

## Classification Matrix

| Path or feature                                                                                                                                                   | Owner                                                  | Current runtime status                 | Surface                               | Classification                             | AI/OpenAI cost risk                        | Data / tenant sensitivity | Future enforcement locus                                                 | Signed assertion needed  | Gateway enforcement needed | Future usage / rate limit                 | Notes                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------- | ------------------------------------- | ------------------------------------------ | ------------------------------------------ | ------------------------- | ------------------------------------------------------------------------ | ------------------------ | -------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/webhooks/streams/ended`                                                                                                                                | `services/api-gateway`                                 | Productive                             | Internal ingress                      | `Internal/System`                          | Low direct, unlocks downstream AI work     | High                      | Existing webhook auth and queue guards                                   | No                       | No premium gate            | Yes, already webhook/rate-limit sensitive | Signed webhook path, not a premium entitlement path.                                                                                                                     |
| `stream-job-worker` `stream.offline` -> transcription queue                                                                                                       | `workers/stream-job-worker`                            | Productive                             | Internal worker                       | `Internal/System`                          | Medium                                     | High                      | Existing worker + queue ownership                                        | No                       | No                         | Yes                                       | Core ingestion pipeline. Do not route premium gates here.                                                                                                                |
| `POST /transcriptions/process`                                                                                                                                    | `services/automation-service`                          | Productive                             | Internal worker call                  | `Internal/System`                          | High                                       | High                      | Existing worker contract and automation validation                       | No                       | No                         | Yes                                       | Core transcription pipeline. Not premium by current contract.                                                                                                            |
| `POST /clips/analyze`                                                                                                                                             | `services/automation-service`                          | Productive                             | Internal worker call                  | `Internal/System`                          | High                                       | High                      | Existing worker contract and automation validation                       | No                       | No                         | Yes                                       | Productive clip pipeline. Do not retrofit premium gating here without a separate product decision.                                                                       |
| `POST /repurposing/plan`                                                                                                                                          | `services/automation-service`                          | Productive                             | Internal worker call                  | `Internal/System`                          | High                                       | High                      | Existing worker contract and automation validation                       | No                       | No                         | Yes                                       | Productive manual-review-first repurposing pipeline. Must remain ungated by premium assertions for now.                                                                  |
| `POST /api/clips/generate`                                                                                                                                        | `services/api-gateway`                                 | Productive                             | User-facing command                   | `Free/Core`                                | High                                       | High                      | Existing gateway auth and queue enqueue rules                            | No                       | Not for premium today      | Yes                                       | User-triggered AI-cost path, but currently core product behavior.                                                                                                        |
| `POST /api/content-jobs/review` and web repurposing review action                                                                                                 | `services/api-gateway` + `apps/web`                    | Productive                             | User-facing command                   | `Free/Core`                                | None direct                                | High                      | Existing gateway auth and review policy                                  | No                       | Not for premium today      | Low                                       | Manual review is core workflow control, not a premium feature in the current contract.                                                                                   |
| `POST /api/content-publications`, `/fanout`, `/:publication_id/publish`, `/:publication_id/retry`, `/:publication_id/reconcile`, `/:publication_id/reconcile-now` | `services/api-gateway`                                 | Productive                             | User-facing command                   | `Free/Core`                                | Low direct, downstream provider write risk | High                      | Existing gateway publish/fanout/manual-action policy                     | No                       | Not for premium today      | Yes                                       | Server-owned publication pipeline is core product behavior today.                                                                                                        |
| `GET /dashboard/publications/schedule`                                                                                                                            | `apps/web`                                             | Productive                             | User-facing read                      | `Free/Core`                                | None direct                                | High                      | Web SSR + RLS-safe reads                                                 | No                       | No                         | Low                                       | Read visibility should remain core even if schedule mutations later become premium-gated.                                                                                |
| `POST /api/content-publications/:publication_id/schedule` and `/api/content-publications/fanouts/:fanout_id/schedule` plus web schedule action                    | `services/api-gateway` + `apps/web`                    | Productive                             | User-facing command                   | `Unknown/Needs decision`                   | Low direct, scheduler abuse risk           | High                      | Gateway command boundary                                                 | No                       | Yes, if classified premium | Yes                                       | These are productive gateway-owned commands aligned to the planned `publishing_schedule` feature gate and are the strongest first candidates for the next gateway slice. |
| `POST /api/dashboard/jobs/repurposing/export`                                                                                                                     | `apps/web`                                             | Productive                             | User-facing audit route               | `Free/Core`                                | None direct                                | High                      | Web route handler + Supabase auth                                        | No                       | No                         | Low                                       | This is an approved repurposing export audit path, not `monetization_exports`. Do not use it as precedent for monetization premium gating.                               |
| `GET /dashboard/analytics`, `GET /dashboard/growth`, `GET /dashboard/publications/analytics`                                                                      | `apps/web`                                             | Productive                             | User-facing read                      | `Free/Core`                                | None direct                                | Medium to High            | Web SSR/BFF read boundary                                                | No                       | No for current pages       | Possible later                            | Current analytics and growth pages are live read models. `advanced_analytics` is an additive future gate, not an implicit gate on these existing pages.                  |
| `GET /dashboard/monetization`                                                                                                                                     | `apps/web`                                             | Productive                             | User-facing read                      | `Free/Core`                                | None direct                                | High                      | Web SSR/BFF read boundary                                                | No                       | No for current page        | Possible later                            | Current monetization dashboard is read-first. No productive export runtime matching `monetization_exports` was found.                                                    |
| `POST` branding upload/replace server actions                                                                                                                     | `apps/web`                                             | Productive                             | User-facing command                   | `Free/Core`                                | None                                       | High                      | Web server action boundary                                               | No                       | No for current actions     | Low                                       | Existing branding runtime is storage and metadata management, not AI orchestration.                                                                                      |
| Planned `ai_assistant` premium runtime                                                                                                                            | `services/api-gateway` + `services/automation-service` | Not productive                         | Future user-facing command            | `Not yet productive (planned Pro/Premium)` | High                                       | High                      | Gateway command first, automation wrapper second                         | Yes                      | Yes                        | Yes                                       | Existing merged wrapper proves fail-closed automation enforcement, but no productive route exists yet.                                                                   |
| Planned `advanced_analytics` premium overlay                                                                                                                      | `apps/web` and possibly `services/api-gateway` later   | Not productive                         | Future user-facing read/command       | `Not yet productive (planned Pro/Premium)` | Low to Medium                              | Medium to High            | Web server/BFF first; gateway only if future export/sync command appears | No                       | Maybe later                | Maybe later                               | Treat as additive premium capability, not as blanket gating of current analytics pages.                                                                                  |
| Planned `publishing_schedule` premium policy                                                                                                                      | `services/api-gateway` + `apps/web`                    | Partially productive, policy undecided | Future user-facing command            | `Unknown/Needs decision`                   | Low direct, abuse risk medium              | High                      | Gateway command boundary                                                 | No                       | Yes                        | Yes                                       | Existing schedule commands exist today, but product policy must explicitly decide whether premium gating should apply.                                                   |
| Planned `monetization_exports` premium path                                                                                                                       | `apps/web` or `services/api-gateway`                   | Not productive                         | Future user-facing command            | `Not yet productive (planned Pro/Premium)` | Low                                        | High                      | Web server action or gateway export command                              | No                       | Yes if gateway-owned       | Yes                                       | No productive monetization export command was found.                                                                                                                     |
| Planned `branding_ai` premium path                                                                                                                                | `services/api-gateway` + `services/automation-service` | Not productive                         | Future user-facing command            | `Not yet productive (planned Pro/Premium)` | High                                       | High                      | Gateway orchestration first, automation runtime second                   | Yes if model call exists | Yes                        | Yes                                       | Existing branding actions are non-AI. Premium branding must be introduced as a new explicit path.                                                                        |
| Planned `team_workspace` agency path                                                                                                                              | future gateway/workspace owner                         | Not productive                         | Future user-facing admin/runtime path | `Agency/Future`                            | Low by itself                              | High                      | Future workspace/admin boundary                                          | No by default            | Yes                        | Yes                                       | Requires a separate workspace and membership runtime before any enforcement is meaningful.                                                                               |

## Premium Candidate List

These are the safest premium-enforcement candidates for follow-up work:

1. Gateway schedule mutation commands:
   - `POST /api/content-publications/:publication_id/schedule`
   - `POST /api/content-publications/fanouts/:fanout_id/schedule`
     Why:
   - already gateway-owned
   - already user-facing
   - no worker payload change required
   - no automation assertion required
   - aligned with the existing `publishing_schedule` feature gate

2. Future `ai_assistant` gateway command:
   Why:
   - already classified as `pro`
   - automation-side fail-closed wrapper already exists as an internal prerequisite
   - premium enforcement can remain explicit and narrow once a productive route exists

3. Future `branding_ai` orchestration command:
   Why:
   - should be introduced as a brand-new explicit premium AI path
   - can use gateway entitlement enforcement before any automation model call

4. Future `monetization_exports` command:
   Why:
   - not productive yet
   - clean future premium entry point if export execution becomes explicit

5. Future `advanced_analytics` premium overlay:
   Why:
   - should be introduced as additive server-side data access or export capability
   - should not retroactively lock the current analytics page without a separate decision

## Explicitly Non-Premium / Core Runtime Paths

The following paths must remain out of the first premium-enforcement slice:

- `POST /transcriptions/process`
- `POST /clips/analyze`
- `POST /repurposing/plan`
- `stream-job-worker` queue fanout into transcription and repurposing
- `POST /api/content-jobs/review`
- `POST /api/content-publications`
- `POST /api/content-publications/fanout`
- `POST /api/content-publications/:publication_id/publish`
- `POST /api/content-publications/:publication_id/retry`
- `POST /api/content-publications/:publication_id/reconcile`
- `POST /api/content-publications/:publication_id/reconcile-now`
- `GET /dashboard/analytics`
- `GET /dashboard/growth`
- `GET /dashboard/monetization`
- existing branding upload/replace actions
- `POST /api/dashboard/jobs/repurposing/export`

Reasoning:

- These are either current core product flows or internal worker/system paths.
- Several of them carry AI cost, but AI cost alone is not evidence that a path
  is premium.
- Gating them first would create a high risk of silently breaking productive
  worker or publication workflows.

## Unknowns / Decisions Needed

The following decisions should be made explicitly before `Gateway Premium Command Enforcement` begins:

1. Are schedule mutation commands premium now, or only later?
   - Existing productive schedule routes already exist.
   - The feature gate says `publishing_schedule` is a future `pro` capability.
   - The repo needs an explicit product decision on whether current schedule
     mutation should move behind that gate or remain core for now.

2. Is `advanced_analytics` additive or substitutive?
   - Current analytics and growth pages are productive read models.
   - A premium gate should likely unlock extra analytics depth or export, not
     remove existing read visibility by default.

3. What concrete runtime will represent `monetization_exports`?
   - No productive monetization export command was found.
   - A future runtime path must be named before it can be enforced.

4. What concrete runtime will represent `branding_ai`?
   - Current branding runtime is storage-only and tenant-scoped.
   - A future AI orchestration route must be created explicitly instead of
     overloading current branding actions.

5. When does `team_workspace` become a real runtime gate?
   - A workspace and membership model is still required.
   - Agency enforcement should not be inferred from the feature gate alone.

## Recommended Enforcement Order

Recommended next sequence:

1. `Gateway Premium Command Enforcement`
   - start with one narrow gateway-owned command set
   - preferred first target: schedule mutation commands
   - do not touch worker-to-automation endpoints in this slice

2. `Premium Path Activation Audit`
   - if schedule commands are not selected, choose the next concrete premium
     command and document why

3. `AI Cost and Abuse Guardrails`
   - add usage/rate/cost controls only after the premium command boundary is
     explicit

4. `Automation Runtime Activation`
   - only after a real `ai_assistant` or `branding_ai` productive path exists
   - use gateway-issued signed assertions at automation entry

## Risks And Non-Goals

### Risks

- Silent premium reclassification of core worker traffic would be a regression.
- Gating current analytics, monetization, or branding pages wholesale would
  overreach the current feature-gate contract.
- Starting with automation endpoints instead of gateway commands would create
  worker contract risk before premium ownership is settled.

### Non-goals

- no productive enforcement
- no route activation
- no worker or queue contract change
- no DB or env change
- no pricing or billing implementation
- no cost-counter implementation
- no new AI endpoint

## Conclusion

This audit leaves StreamOS in a reviewable state:

- core worker and automation runtime paths stay explicitly non-premium
- `ai_assistant` stays visible as a planned Pro/Premium path but is still not
  productive
- the merged internal wrapper remains prerequisite-only and does not justify
  gating `/clips/analyze`, `/repurposing/plan`, or `/transcriptions/process`
- schedule mutation commands are isolated as the clearest current gateway-owned
  premium candidate set

The next technical slice should be `Gateway Premium Command Enforcement`.
It should begin at a narrow gateway-owned command boundary and must explicitly
avoid blocking the existing worker-driven automation core.
