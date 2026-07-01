# AI Assistant Route Mount Readiness Audit

## Scope

Read-only audit on current `main` at `6e99cc344d940b7105fc2ca70f68dc446226bc0d`.

This audit reviewed:

- `services/api-gateway/src/lib/ai-assistant-route-contract.ts`
- `services/api-gateway/src/lib/fixtures/ai-assistant-gateway-automation-contract.json`
- `services/api-gateway/src/lib/ai-usage-admission.ts`
- `services/api-gateway/src/lib/ai-usage-context-issuance.ts`
- `services/api-gateway/src/lib/ai-usage-metering-reconciliation.ts`
- `services/api-gateway/src/lib/ai-assistant-route-observability.ts`
- `services/api-gateway/src/lib/aiAssistantTrustedContext.ts`
- `services/api-gateway/src/routes/callbacks/automation.ts`
- `services/automation-service/src/ai_assistant_backend_contract.py`
- `services/automation-service/src/ai_usage_context_enforcement.py`
- `services/automation-service/src/ai_trusted_context_client.py`
- `services/automation-service/src/ai_context_boundary.py`
- `services/automation-service/src/ai_context_retrieval_adapters.py`
- `services/automation-service/src/ai_guardrails.py`
- `services/automation-service/src/premium_runtime_enforcement.py`
- `services/automation-service/src/main.py`
- `services/automation-service/src/settings.py`
- `packages/database/supabase/migrations/20260629215047_ai_usage_ledger.sql`
- relevant Gateway and Automation contract tests
- `docs/deployment.md`

No route was mounted. No UI was added. No env, DB, worker, or runtime activation change was made. No OpenAI call was executed.

## Decision

Decision: `ready_for_route_mount_foundation`

Why:

- the Gateway to Automation contract body now covers the two allowed `plan_source` values and exercises issuance, signature validation, tenant/user/request binding, mocked backend execution, metering reconciliation, and concurrency release
- `signed_entitlement_assertion` is no longer accepted as route-contract issuance input
- the current chain is fail-closed by default in both Gateway and Automation
- observability is secret-safe and sufficient for a mounted foundation slice
- runtime activation is still blocked by missing operator gates, mounted-controller semantics, and deployment proof

## Readiness Summary

| Area                            | Audit result                          | Notes                                                                              |
| ------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------- |
| Guardrail ordering              | sufficient for route mount foundation | one ingress/product gate layer still needs explicit mounted-route semantics        |
| `plan_source` alignment         | aligned                               | trusted set is now `persisted_server_plan` and `server_verified_billing` only      |
| Shared fixture as contract body | sufficient for route mount foundation | good happy-path and deny-path contract body, but not full controller/runtime proof |
| Observability contract          | sufficient for route mount foundation | secret-safe event schema exists; queryable operator surface still missing          |
| Trusted context enforcement     | sufficient for route mount foundation | bounded, tenant/user-scoped, low-risk sources only                                 |
| Runtime activation              | blocked                               | operator gates, deployment proof, and productive routing remain missing            |

## Guardrail Order

The current internal chain is coherent and ordered correctly for a minimal mounted route:

1. Route helper parses and bounds request shape.
2. Route helper rejects unsupported `plan_source` before issuance.
3. Gateway admission enforces feature, runtime status, trusted plan source, and budget mode.
4. Redis burst/concurrency guard runs before ledger reservation.
5. Ledger reservation happens before signed usage-context issuance.
6. Signed usage context is required before any downstream Automation operation.
7. Automation runtime entitlement is checked.
8. Automation context boundary enforces tenant, user, source allowlist, and payload limits.
9. Automation usage-context enforcement validates request, tenant, user, expiry, plan source, admission state, budget state, and signature.
10. Trusted context retrieval is sanitized and bounded to low-risk sources.
11. Request-size guardrail runs before backend operation.
12. Post-call metering reconciliation finalizes ledger state.
13. Concurrency release runs after reconciliation.

Assessment:

- for route mount foundation, the order is complete enough
- for productive activation, one explicit mounted-route ingress layer is still missing: route auth plus route-level product gate semantics must wrap the helper before any admission or issuance occurs

## `plan_source` Alignment

Current alignment is consistent across the reviewed contract surfaces:

- `packages/types/src/plan-model.ts` defines trusted sources as `persisted_server_plan` and `server_verified_billing`
- `services/api-gateway/src/lib/ai-assistant-route-contract.ts` rejects any other route-contract `planSource` value before usage-context issuance
- `services/api-gateway/src/lib/ai-usage-context-issuance.ts` carries `TrustedPlanModelSource`
- `services/api-gateway/src/lib/ai-assistant-route-observability.ts` only records the same two values
- `services/automation-service/src/ai_usage_context_enforcement.py` only accepts the same two values
- `services/automation-service/src/entitlement_assertions.py` uses the same trusted set
- `packages/database/supabase/migrations/20260629215047_ai_usage_ledger.sql` constrains the ledger to the same two values
- the shared fixture covers both values and nothing else

Assessment:

- `plan_source` is now aligned for a minimal mount slice
- this closes the previous mismatch where `signed_entitlement_assertion` could drift into Gateway route issuance semantics

## Shared Fixture Assessment

The shared fixture at `services/api-gateway/src/lib/fixtures/ai-assistant-gateway-automation-contract.json` is sufficient as the contract body for a later minimal route mount slice.

What it already proves through Gateway and Automation tests:

- Gateway prepares the exact Automation request envelope
- signed usage context survives cross-runtime verification
- tenant, user, and request binding are enforced
- both allowed `plan_source` values are covered
- mocked downstream success and mocked deny cases reconcile metering correctly
- concurrency release is exercised
- prompt text, context-source names, and signatures are kept out of observability and ledger writes

What it does not prove yet:

- mounted HTTP controller auth semantics
- mounted route default-disabled behavior
- mounted route status-code contract for operator-closed vs. product-closed states
- deployment/env misconfiguration behavior at mounted-route ingress
- productive downstream runtime behavior

Assessment:

- sufficient for route mount foundation
- not sufficient for runtime activation on its own

## Observability Assessment

Current observability is adequate for a route foundation slice:

- `services/api-gateway/src/lib/ai-assistant-route-observability.ts` defines a bounded, secret-safe schema
- allowed fields exclude prompt text, raw context, signatures, provider payloads, and model responses
- reason codes and request classification are sanitized
- route tests verify redaction behavior and sink-failure tolerance
- route-contract tests prove event emission across admission, issuance, metering, and release phases

Current gap:

- there is no assistant-specific operator read surface, counter aggregation, or persisted operator dashboard path for these events

Assessment:

- sufficient for route foundation
- insufficient for runtime activation and operator support

## Trusted Context Client Assessment

The synchronous trusted context client is not a blocker for route mount foundation.

Why it is acceptable for that slice:

- timeout is bounded to `min(openai_timeout_seconds, 5s)`
- only two low-risk sources are live: `channel_platform_status` and `content_job_summary`
- request and response shapes are strict
- payload size is bounded
- tenant and user echo validation is enforced
- returned records are sanitized and reject URLs, secret-like tokens, and shape drift
- missing `API_GATEWAY_URL` plus `API_GATEWAY_SECRET` falls back to stubbed low-risk records; partial configuration fails closed

Why it remains a runtime-activation blocker:

- it is still synchronous internal HTTP in the hot path
- it has no assistant-specific retry, circuit-breaker, or operator telemetry surface
- it has no deployment-proof around steady-state latency or degradation handling

Assessment:

- not a blocker for `ready_for_route_mount_foundation`
- still a blocker for `ready_for_runtime_activation`

## Fail-Closed Requirements For A Mounted Slice

A minimal mounted route slice should stay fail-closed with all of these semantics:

- mounted controller exists, but defaults to helper mode `disabled`
- Gateway admission policy keeps `runtimeStatus=not_yet_productive`
- Automation guardrail keeps `ai_assistant` at `runtime_status=not_yet_productive`
- no UI entry point exists
- no browser-direct call path exists
- unsupported `plan_source` returns denial before issuance
- missing trusted request context returns denial before issuance
- any signing/config/ledger/metering problem returns `503` and prevents productive continuation
- no downstream productive operation is bound in the mounted slice
- no prompt, raw context, raw model response, raw OpenAI payload, token, or private URL is persisted or emitted

Recommended mounted-slice semantics:

- `featureFlag`: route presence only; does not imply productive availability
- `runtimeStatus`: still the authoritative productive gate in Gateway and Automation
- `productGate`: separate operator-controlled closed state that must remain closed for the mount slice

The mounted route should not be able to transition to productive behavior by route presence alone.

## Required Mounted Route Semantics

For the next slice, the route should be mounted only with explicit split semantics:

- `route mounted`: yes
- `route callable by product users`: no by default
- `route mode`: `disabled` by default
- `runtimeStatus`: `not_yet_productive` in Gateway and Automation
- `productGate`: closed by default and evaluated before productive downstream binding
- `downstreamOperation`: mock-only or unset in production code path until a later activation slice

This means a mounted slice may return bounded `503` responses from a real controller while still keeping AI Assistant non-productive.

## Core/Internal Endpoint Status

The existing Automation endpoints remain unchanged core/internal endpoints:

- `/clips/analyze`
- `/repurposing/plan`
- `/transcriptions/process`

`services/automation-service/src/main.py` exposes those endpoints and no `ai_assistant` endpoint was found.

Assessment:

- they remain core/internal
- they should not be reclassified or product-gated by the route-mount slice

## Persistence Safety

The audit did not find a persistence path that stores:

- raw prompts
- full trusted-context payloads
- full resolved-context payloads
- raw model responses
- raw OpenAI payloads
- raw provider payloads
- tokens, secrets, or private URLs

What was found:

- Gateway ledger writes persist only accounting-safe fields
- Gateway observability persists only the bounded event contract
- Automation usage-context serialization excludes prompt and resolved context
- the backend contract serializes prompt plus resolved context in memory only for request-size enforcement before operation

Assessment:

- current foundation is secret-safe enough for route mount foundation

## Missing Operator Gates

These operator gates are still missing before runtime activation:

- explicit mounted-route product gate contract with a closed default
- assistant-specific operator observability surface for denials, metering failures, and concurrency-release failures
- proof that Gateway and Automation share correct signing mode and secret configuration in the target environment
- proof that Automation private networking and Gateway trusted-context callback behavior are healthy in the target environment
- explicit release evidence for AI Assistant runtime enablement and rollback expectations
- mounted-controller auth and abuse-policy proof separate from helper tests

## Env And Deployment Assumptions To Verify Before Route Mount

These assumptions should be checked before mounting even a fail-closed route:

- `services/api-gateway` and `services/automation-service` still own `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` and `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET`
- no `NEXT_PUBLIC_OPENAI*` or public assertion env leaks exist
- `API_GATEWAY_URL` and `API_GATEWAY_SECRET` remain server-only in Automation when trusted-context retrieval is enabled
- Automation remains private in production
- Vercel/browser paths still do not call Automation directly
- the mounted route does not require any new web, worker, or browser env
- Redis-backed guard remains Gateway-owned and required for productive activation later

Assessment:

- none of these require changing env now
- they do require explicit verification in the mount slice and again before activation

## Route-Mount Blockers

No hard blocker was found for a minimal fail-closed route mount foundation, if the slice:

- mounts only a controller boundary
- reuses the existing route-contract helper
- keeps the helper in `disabled` mode by default
- keeps `ai_assistant` `not_yet_productive`
- adds no UI
- adds no new productive downstream runtime

## Runtime-Activation Blockers

These still block `ready_for_runtime_activation`:

1. No mounted controller contract has yet proven auth, product gate, and fail-closed semantics.
2. No assistant-specific operator observability surface exists.
3. No activation proof exists for env parity, private networking, and rollback expectations.
4. The trusted context client is still synchronous hot-path HTTP and lacks activation-grade telemetry and degradation proof.
5. No productive assistant endpoint or downstream model path is mounted.
6. `ai_assistant` remains intentionally `not_yet_productive` in both Gateway and Automation.

## Recommended Next Slice

Recommended next slice:

`AI Assistant Route Mount Foundation`

That slice should:

- mount one minimal Gateway controller only
- call the existing route-contract helper
- keep default route mode closed
- keep `runtimeStatus=not_yet_productive`
- add explicit `productGate` closed-default semantics
- add mounted-controller tests for auth, fail-closed behavior, and secret-safe responses
- avoid UI, env changes, DB changes, worker changes, and productive runtime activation

## Final Assessment

The contract foundation is strong enough to mount a minimal fail-closed route, but not strong enough to activate productive runtime.

Decision: `ready_for_route_mount_foundation`
