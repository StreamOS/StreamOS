# AI Assistant Budget and Metering Production Proof - 2026-06-30

## Decision

Primary decisions:

- `budget_metering_requirements_reviewed`
- `production_budget_metering_operator_proof_required`
- `activation_not_allowed_now`

Why:

- reviewed repository code, tests, migrations, and docs show clear local contract evidence for admission, rate limiting, concurrency limiting, ledger reservation, metering reconciliation, and secret-safe observability
- reviewed repository evidence also shows that the current AI Assistant budget mode is intentionally not production-ready by default
- no reviewed repository or local-test evidence proves productive budget operation, production Redis guard health, production ledger writes, or production metering reconciliation
- this slice is docs-only and does not permit runtime activation, productive downstream enablement, or any live environment action

No `blocked_by_budget_metering_contract_drift` decision is added because no hard repo-level contract drift was found in the reviewed materials.

## Scope

This slice reviews only:

- repository documentation
- repository source
- repository tests
- existing local schema and migration evidence

Not done:

- no live Railway, Vercel, Supabase, Automation Service, or OpenAI check
- no DB live verification
- no production proof run
- no runtime activation
- no code, test, env, DB, worker, provider, or deployment change

Reviewed on current `main` at `f8ca49e7b3fe15b3aa6f668ede3201687dbbe681`.

Repository note:

- `01_security_and_stabilization.md` was not present on current `main`
- `02_roadmap_and_next_slices.md` was not present on current `main`
- `streamos_produkt_feature_roadmap.md` was not present on current `main`
- `docs/p4-product-roadmap-update.md` remains the available roadmap source referenced by earlier AI Assistant docs

## Current Fail-Closed State

Current repository-backed state remains:

- `/api/ai-assistant` is mounted in `services/api-gateway`
- `productGate=closed`
- `routeMode=disabled`
- Gateway `runtimeStatus=not_yet_productive`
- Automation `runtimeStatus=not_yet_productive`
- no productive AI Assistant downstream is configured
- activation remains not allowed now

Budget and metering review does not change that state. Even complete local evidence cannot authorize runtime activation.

## Evidence Sources Reviewed

- `docs/ai-assistant/ai-assistant-private-reachability-proof-2026-06-30.md`
- `docs/ai-assistant/ai-assistant-signing-parity-verification-2026-06-30.md`
- `docs/ai-assistant/ai-assistant-activation-proof-collection-report-2026-06-30.md`
- `docs/ai-assistant/ai-assistant-activation-slice-planning-2026-06-30.md`
- `docs/ai-assistant/ai-assistant-operator-proof-runbook-2026-06-30.md`
- `docs/ai-assistant/ai-assistant-runtime-activation-readiness-audit-2026-06-30.md`
- `docs/billing-entitlements/ai-usage-budget-rate-limit-source-design-2026-06-29.md`
- `docs/architecture.md`
- `docs/deployment.md`
- `services/api-gateway/src/lib/ai-assistant-route-contract.ts`
- `services/api-gateway/src/lib/ai-assistant-activation-preflight.ts`
- `services/api-gateway/src/lib/ai-assistant-route-observability.ts`
- `services/api-gateway/src/lib/ai-usage-admission.ts`
- `services/api-gateway/src/lib/ai-usage-redis-guard.ts`
- `services/api-gateway/src/lib/ai-usage-ledger.ts`
- `services/api-gateway/src/lib/ai-usage-context-issuance.ts`
- `services/api-gateway/src/lib/ai-usage-metering-reconciliation.ts`
- `services/api-gateway/src/lib/ai-usage-admission.test.ts`
- `services/api-gateway/src/lib/ai-usage-redis-guard.test.ts`
- `services/api-gateway/src/lib/ai-usage-ledger.test.ts`
- `services/api-gateway/src/lib/ai-usage-metering-reconciliation.test.ts`
- `services/api-gateway/src/lib/ai-assistant-route-observability.test.ts`
- `services/api-gateway/src/lib/ai-assistant-route-contract.test.ts`
- `services/api-gateway/src/lib/ai-assistant-gateway-automation-contract.test.ts`
- `packages/database/supabase/migrations/20260629215047_ai_usage_ledger.sql`

## Budget and Metering Proof Matrix

| Area                                           | Evidence Source                                                                                                                           | Evidence Class                | Status                        | Gap                                                                                                                              | Required Operator Proof                                                                             | Secret-Safety Rule                                                   | Blocks Activation |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------- |
| budget mode default state                      | `services/api-gateway/src/lib/ai-usage-admission.ts`, readiness audit                                                                     | `present_repo_evidence`       | `present_repo_evidence`       | default budget mode is `not_configured`, not productive                                                                          | proof that a productive budget policy is configured and intentionally enabled in target environment | no secret config values, no raw env dump                             | yes               |
| budget mode local allow path                   | `ai-usage-admission.test.ts`, route-contract tests, contract fixture tests                                                                | `present_local_test_evidence` | `present_local_test_evidence` | local coverage uses explicit `stubbed_allow` override and does not prove production budget enforcement                           | operator evidence for real productive budget policy, thresholds, and deny-safe behavior             | no raw prompts, no billing-secret material, no cross-tenant examples | yes               |
| rate guard behavior                            | `ai-usage-redis-guard.ts`, `ai-usage-redis-guard.test.ts`, route-contract tests                                                           | `present_local_test_evidence` | `present_local_test_evidence` | local and in-memory coverage exists, but no production Redis/operator proof exists                                               | proof that production Redis-backed rate guard is configured, observable, and deny-safe              | no Redis URLs, no raw store errors, no internal hostnames            | yes               |
| concurrency guard behavior                     | `ai-usage-redis-guard.ts`, `ai-usage-redis-guard.test.ts`, route-contract tests, contract fixture tests                                   | `present_local_test_evidence` | `present_local_test_evidence` | local release semantics are covered, but no productive release-under-failure proof exists                                        | proof that production concurrency claims and releases behave safely under success and failure       | no request payloads, no raw Redis diagnostics                        | yes               |
| ledger reservation contract                    | `ai-usage-ledger.ts`, `20260629215047_ai_usage_ledger.sql`, `ai-usage-ledger.test.ts`, route-contract tests                               | `present_repo_evidence`       | `present_local_test_evidence` | repo and test evidence exist, but no live operator evidence proves service-role writes and durable reads in target environment   | proof that reservation writes, tenant/user scoping, and deny-safe shapes work in target environment | no service-role secret, no raw row dumps with unsafe metadata        | yes               |
| metering and reconciliation contract           | `ai-usage-metering-reconciliation.ts`, `ai-usage-metering-reconciliation.test.ts`, route-contract tests, gateway-automation fixture tests | `present_local_test_evidence` | `present_local_test_evidence` | local success, deny, idempotent replay, release, and failure coverage exist, but no productive operator evidence exists          | proof that productive metering and reconciliation record safely and fail closed when unavailable    | no raw provider/model payloads, no raw error bodies                  | yes               |
| usage context issuance for budget admission    | `ai-usage-context-issuance.ts`, `.test.ts`, route-contract tests                                                                          | `present_local_test_evidence` | `present_local_test_evidence` | signed usage context exists locally, but target-environment signing and budget policy proof still belong to operator proof chain | proof that target environment uses intended signing/budget configuration for budget admission path  | no signatures, no secrets, no full context payloads                  | yes               |
| observability for budget and metering failures | `ai-assistant-route-observability.ts`, `.test.ts`, route-contract tests                                                                   | `present_local_test_evidence` | `present_local_test_evidence` | secret-safe event classes exist, but no productive operator read model proof exists                                              | proof that operators can read deny/failure evidence without unsafe payload leakage                  | no raw logs, no secret-like URLs, no tokens                          | yes               |
| production deployment prerequisites            | `docs/deployment.md`, runbook, proof-collection report                                                                                    | `present_docs_evidence`       | `operator_proof_required`     | docs require production Redis and proof-capable runtime, but do not prove productive budget/metering operation                   | proof from target runtime that productive usage-governance stack is configured and healthy          | no private URLs, no raw shell transcripts, no env dumps              | yes               |

## Budget Mode Review

Budget mode result: repo-consistent, not production-proven.

Reviewed code shows:

- Gateway admission owns budget mode decisions
- supported budget modes are only `not_configured` and `stubbed_allow`
- default policy for `ai_assistant` is `budgetMode=not_configured`
- admission denies when runtime is active but budget enforcement is still not configured
- local allow behavior is explicitly test-only through `stubbed_allow`

Implications:

- repository evidence confirms that productive budget mode is not enabled by default
- repository evidence does not yet show a durable activation-grade budget policy
- no contract drift was found; the missing piece is productive operator proof, not repo inconsistency

Status:

- repo requirement shape: `present_repo_evidence`
- local deny/allow semantics: `present_local_test_evidence`
- productive budget proof: `operator_proof_required`

## Rate Guard Review

Rate guard result: strong local evidence, no production proof.

Reviewed evidence shows:

- Redis guard owns burst limiting and concurrency claiming at the Gateway boundary
- enabled policies deny with `ai_usage_rate_limited` when burst limit is exceeded
- guard keys remain tenant- and user-scoped
- active enforced mode fails closed when Redis protection is unavailable
- denial responses stay secret-safe even when backing-store exceptions contain secret-like data
- route-contract tests confirm that rate-limit denials stop before downstream invocation

Status:

- repo implementation evidence: `present_repo_evidence`
- local guard behavior: `present_local_test_evidence`
- productive distributed guard evidence: `operator_proof_required`

## Concurrency Guard Review

Concurrency guard result: strong local evidence, no production proof.

Reviewed evidence shows:

- concurrency claims are bounded by request, tenant, and user scope
- local tests prove denial when limit is exceeded and allowance resumes after release
- route-contract and fixture tests cover safe release after success and deny-safe reconciliation after downstream failure
- metering reconciliation surfaces `ai_usage_concurrency_release_failed` without double counting
- observability classifies `concurrency_guard_denied` and `concurrency_release_failure` separately and secret-safely

Gap:

- no operator evidence proves productive release behavior under real target-environment error conditions

Status:

- repo implementation evidence: `present_repo_evidence`
- local release/deny coverage: `present_local_test_evidence`
- productive release proof: `operator_proof_required`

## Ledger Reservation Review

Ledger reservation result: durable contract exists, production proof absent.

Reviewed evidence shows:

- `ai_usage_ledger` migration defines durable statuses `reserved`, `recorded`, and `denied`
- migration constrains feature, plan, trusted `plan_source`, positive usage units, and valid status payload combinations
- RLS allows authenticated users to read only their own rows
- authenticated users cannot insert, update, or delete ledger rows directly
- service role retains write authority
- repository tests verify minimal reserved writes, tenant/user filtering, request-scoped reads, monthly summary reads, and cross-tenant exclusion
- request payload persistence remains bounded and excludes raw prompts, raw context payloads, and secret-like URL content

Observed limitation:

- current persistence boundary remains `user_id`-primary with `tenant_id` stored as defense in depth
- no live operator evidence proves productive reservation writes or monthly summaries in target environment

Status:

- repo schema and repository evidence: `present_repo_evidence`
- local repository test evidence: `present_local_test_evidence`
- productive ledger proof: `operator_proof_required`

## Metering and Reconciliation Review

Metering and reconciliation result: strong local flow coverage, production proof absent.

Reviewed evidence shows:

- success path records final usage units and releases concurrency
- idempotent replay avoids double counting
- deny path writes only safe error categories
- released path preserves denied-equivalent ledger shape
- invalid context, feature mismatch, and invalid final usage values fail closed
- unavailable ledger load returns `ai_usage_metering_unavailable`
- route-contract and fixture tests show success, deny, metering failure, and concurrency-release-failure orchestration

Important distinction:

- the local contract proves reconciliation semantics
- it does not prove real target-environment durability, retries, or operator monitoring

Status:

- repo implementation evidence: `present_repo_evidence`
- local orchestration evidence: `present_local_test_evidence`
- productive metering/reconciliation proof: `operator_proof_required`

## Usage Context Review

Usage context result: locally strong, still operator-bound for production.

Reviewed evidence shows:

- Gateway issues a signed short-lived usage context only after admission, Redis guard, and ledger reservation succeed
- usage context reason codes cover admission denial, limit denial, reservation failure, and signing unavailability
- context payload intentionally excludes prompt text, raw context payloads, model responses, URLs, and secrets
- route contract uses usage-context issuance as the bounded admission-to-downstream handoff

What remains outside local proof:

- target-environment signing configuration
- target-environment budget-mode activation semantics
- target-environment operator evidence that budget-admission issuance is configured intentionally

Status:

- repo context-issuance contract: `present_repo_evidence`
- local signed-context evidence: `present_local_test_evidence`
- target-environment issuance proof: `operator_proof_required`

## Observability Review

Observability result: secret-safe contract exists, productive operator proof absent.

Reviewed evidence shows secret-safe evidence classes for:

- `rate_guard_denied`
- `concurrency_guard_denied`
- `ledger_reservation_failed`
- `metering_recorded`
- `metering_released`
- `metering_failure`
- `concurrency_release_failure`

Reviewed tests show:

- reason codes and classifications are sanitized
- secret-like URLs and token-like strings are redacted
- recorder behavior is best-effort and does not leak sink failures

Gap:

- no reviewed operator evidence proves that these classes are surfaced and consumable in the intended productive runtime

Status:

- repo observability contract: `present_repo_evidence`
- local secret-safe classification evidence: `present_local_test_evidence`
- productive operator-readability proof: `operator_proof_required`

## Missing Operator Proofs

The following target-environment proofs are still required:

- proof that productive budget policy is configured intentionally for AI Assistant admission
- proof that production Redis-backed rate guard is enabled, healthy, and deny-safe
- proof that production concurrency claim and release behavior remains safe under success and failure
- proof that ledger reservation writes and monthly summaries work in the intended target environment
- proof that productive metering and reconciliation complete without unsafe fallback or silent drift
- proof that operator-readable observability exists for rate denial, concurrency denial, ledger reservation failure, metering failure, and concurrency release failure
- proof that the productive usage-governance evidence is tied to the intended release candidate and target runtime

These remain:

- `operator_proof_required`

## Forbidden Evidence

The future operator proof must not place any of the following into this report or similar docs:

- secret values
- tokens
- private URLs
- internal hostnames
- signatures
- raw prompts
- raw trusted-context payloads
- raw resolved-context payloads
- raw model responses
- raw provider payloads
- raw database rows containing unsafe payload data
- raw error strings from Redis, Supabase, Automation Service, or provider boundaries
- raw shell transcripts or env dumps

## Secret-Safety Review

Result: secret-safe.

This report includes only:

- contract behavior
- schema and test classifications
- allowed status and reason-code semantics
- operator-proof gaps

This report does not include:

- prompt contents
- full usage-context payloads
- secret config values
- Redis or Supabase credentials
- provider or AI payloads

## Activation Boundary

This slice does not permit activation.

Conservative boundary result:

- `budget_metering_requirements_reviewed` is justified
- `production_budget_metering_operator_proof_required` remains mandatory
- `activation_not_allowed_now` remains mandatory

This slice cannot conclude:

- `budget_metering_proven_for_activation`
- `activation_slice_allowed`
- `runtime_activation_allowed`

Even future productive budget and metering proof would still leave separate activation gates for:

- `productGate`
- `routeMode`
- coordinated `runtimeStatus`
- signing parity
- private reachability
- productive downstream enablement
- rollback readiness

## Recommended Next Slice

`AI Assistant Automation Downstream Contract Foundation`

Why:

- no hard budget/metering contract drift was found
- budget, guard, ledger, and reconciliation requirements are now reviewed and still correctly held behind operator proof
- the next planned slice after proof-collection is the first fail-closed downstream contract foundation in `services/automation-service`

## Checks

Executed for this docs-only slice:

- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant/ai-assistant-budget-metering-production-proof-2026-06-30.md`

Not executed:

- `pnpm validate`

Why skipped:

- only one docs-only Markdown file was added
- no code, tests, env, DB, worker, provider, or deployment contract changed
