# AI Assistant Runtime Activation Audit

## Executive Summary

This audit reviewed the current `ai_assistant` foundation chain across
`services/api-gateway` and `services/automation-service` on current `main`.

Decision: `ready_for_route_contract_foundation`

Rationale:

- `ai_assistant` is still fail-closed and `not_yet_productive` in both Gateway
  admission and Automation guardrails.
- The technical foundation chain now exists as internal building blocks:
  admission, burst/concurrency protection, ledger reservation, signed usage
  context issuance, automation usage-context validation, context boundary,
  trusted context retrieval, model-adjacent guardrails, post-call metering
  reconciliation, and concurrency release.
- No public AI Assistant route or UI was found.
- Core automation endpoints `/clips/analyze`, `/repurposing/plan`, and
  `/transcriptions/process` remain active core/internal endpoints and are not
  reclassified behind AI Assistant runtime gates.
- The current system is not ready for productive runtime activation because the
  chain is not yet wired through a minimal route/controller flow, assistant-
  specific observability is incomplete, and some trust-boundary details still
  need alignment.

The next safe slice is a minimal `AI Assistant Route Contract Foundation` that
stays internal or disabled-by-default, adds no visible UI, and does not
activate productive runtime.

## Current Chain Inventory

| Chain step                          | Owner                                                  | Current state                                                                                                                                     | Audit result            |
| ----------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Request admission                   | `services/api-gateway`                                 | `ai_assistant` feature gate exists; default policy remains `not_yet_productive` and `budgetMode=not_configured`                                   | present, fail-closed    |
| Burst/concurrency protection        | `services/api-gateway`                                 | Redis-backed guard exists with enforced-mode fail-closed behavior when runtime is active                                                          | present                 |
| Ledger reservation                  | `services/api-gateway`                                 | usage ledger repository supports `reserved` entries keyed by `user_id + request_id`                                                               | present                 |
| Signed usage context issuance       | `services/api-gateway`                                 | internal helper issues HMAC-signed short-lived usage context after admission + guard + reservation                                                | present                 |
| Automation usage-context validation | `services/automation-service`                          | signed usage context is required and validated fail-closed before backend assistant operation                                                     | present                 |
| Context boundary                    | `services/automation-service`                          | tenant/user/source/window/payload limits enforced, sensitive sources blocked                                                                      | present                 |
| Trusted context retrieval           | `services/automation-service` + `services/api-gateway` | gateway-owned trusted context contract exists for `channel_platform_status` and `content_job_summary`; automation client validates returned shape | present with limitation |
| Model-adjacent guardrails           | `services/automation-service`                          | request size and timeout guardrails exist; assistant remains `not_yet_productive`                                                                 | present                 |
| Post-call metering reconciliation   | `services/api-gateway`                                 | reserved usage can be finalized as `recorded` or `denied`; request idempotency preserved                                                          | present                 |
| Concurrency release                 | `services/api-gateway`                                 | release helper exists and reconciliation attempts release after finalization                                                                      | present                 |
| Productive route/controller wiring  | none                                                   | no AI Assistant route found in Gateway or Automation public API                                                                                   | missing by design       |
| Productive UI                       | none                                                   | no AI Assistant UI activation found                                                                                                               | missing by design       |

## Gateway Preconditions

Status: mostly prepared for route contract foundation, not prepared for runtime
activation.

Confirmed:

- `authorizeGatewayAiUsageAdmission(...)` denies `ai_assistant` by default while
  runtime is `not_yet_productive`.
- `evaluateGatewayAiUsageRedisGuard(...)` supports feature/tenant/user-scoped
  burst and concurrency protection and fails closed in active enforced mode when
  Redis protection is unavailable.
- `recordAiUsageLedgerEntry(...)` persists only safe accounting fields and never
  needs prompts, raw context, model responses, provider payloads, tokens, or
  secrets.
- `issueGatewayAiUsageContext(...)` deny-first orchestrates admission, Redis
  guard, ledger reservation, and short-lived HMAC-signed usage context
  issuance.
- `reconcileGatewayAiUsageMetering(...)` finalizes reserved usage entries and
  attempts concurrency release without overriding already finalized ledger
  state.

Still missing before runtime activation:

- no Gateway route/controller that wires admission, context issuance, downstream
  assistant invocation, and post-call reconciliation as one bounded flow
- no assistant-specific operator/observability surface for admission outcomes,
  budget denial patterns, metering mismatches, or concurrency-release failures
- no production-ready route contract proving how request-scoped IDs,
  signatures, and reconciliation callbacks are threaded end-to-end

## Automation-Service Preconditions

Status: backend contract is well prepared, but still intentionally non-
productive.

Confirmed:

- `prepare_ai_assistant_backend_contract(...)` requires runtime entitlement,
  context boundary validation, usage-context validation, trusted context
  resolution, and request-size guardrails before any backend assistant
  operation.
- `run_ai_assistant_backend_operation(...)` maps model timeout into a stable
  guardrail error without exposing raw upstream details.
- `require_ai_assistant_usage_context(...)` validates request binding,
  tenant/user binding, expiry, trusted plan source, admission decision, budget
  status, and HMAC signature before allowing execution.
- `validate_ai_assistant_context_boundary(...)` enforces tenant/user context,
  source allowlist, payload caps, and transcript limits while blocking
  explicitly sensitive source categories.
- `AI_CONTEXT_SOURCE_ADAPTERS` only resolves live low-risk sources through the
  hardened trusted context client; higher-risk sources remain stubbed or blocked
  by boundary policy.
- `AI_ASSISTANT_FEATURE` remains `not_yet_productive` in guardrail policy.

Still missing before runtime activation:

- no productive assistant endpoint in `main.py`
- no downstream model execution path dedicated to AI Assistant with end-to-end
  post-call metering feedback to Gateway
- no assistant-specific operator metrics or structured audit trail beyond
  current guardrail/HTTP denial behavior

## Data / Context Safety

Status: strong enough for route contract foundation.

Confirmed:

- trusted context reads are tenant/user-scoped
- only `channel_platform_status` and `content_job_summary` are live low-risk
  retrieval sources
- context boundary blocks sensitive categories such as tokens, provider
  secrets, service-role keys, private URLs, raw provider payloads, prompt raw
  content, entitlement assertions, and secret logs
- trusted context client sanitizes returned record shape and rejects
  out-of-contract fields
- Gateway ledger and usage-context helpers intentionally exclude raw prompts,
  full context payloads, model responses, raw provider payloads, tokens,
  secrets, and private URLs

No productive persistence path was found for:

- raw prompts
- full resolved context payloads
- raw model responses
- raw OpenAI payloads
- provider tokens
- private Railway URLs

Note:

- `prepare_ai_assistant_backend_contract(...)` serializes prompt and resolved
  context in memory for request-size enforcement, but the audit found no
  persistence path that writes those raw values into the Gateway ledger or the
  trusted context contract.

## Usage / Budget / Abuse Safety

Status: foundation chain exists, but productive routing is still absent.

Confirmed:

- request admission exists and is deny-first
- burst/concurrency limits exist and are feature/tenant/user-scoped
- ledger reservation exists before signed usage-context issuance
- signed usage context carries request-bound budget/admission state into
  Automation
- post-call reconciliation finalizes reserved usage and preserves
  `request_id` idempotency
- concurrency release is attempted after finalization on both success and
  failure paths

Known limitation:

- the ledger still only persists `reserved`, `recorded`, and `denied`
- released or abandoned reservations currently map to `denied + policy_blocked`
- this is acceptable for the current foundation, but a dedicated `released` or
  `failed` status may be needed later for billing/reporting clarity

## Signing / Trust Boundary

Status: mostly prepared, but not fully aligned for productive activation.

Confirmed:

- Gateway usage-context issuance signs short-lived assistant usage contexts with
  HMAC SHA-256
- Automation validates purpose, expiry, request binding, tenant/user binding,
  plan trust, admission state, budget status, and signature
- premium runtime entitlement enforcement is still separate from usage-context
  enforcement; both are required before backend assistant execution

Remaining trust-boundary issue:

- Gateway usage-context issuance currently accepts trusted plan sources
  including `signed_entitlement_assertion`
- Automation usage-context validation currently accepts
  `persisted_server_plan` and `server_verified_billing`
- the existing ledger schema also constrains plan source to
  `persisted_server_plan` or `server_verified_billing`

Audit assessment:

- this mismatch is not a blocker for a minimal route contract foundation if that
  slice explicitly pins usage-context issuance to `persisted_server_plan`
- it is a blocker for broader runtime activation until Gateway, Automation, and
  ledger semantics agree on the exact allowed `plan_source` set

Additional limitation:

- entitlement assertions and usage contexts currently share the same signing
  mode / secret infrastructure
- purpose separation exists in payloads, but key separation does not
- acceptable for the current internal foundation, but stronger signing
  separation is preferable before productive activation

## Remaining Blockers

These block `ready_for_runtime_activation`:

1. No assistant route/controller flow exists yet in Gateway or Automation.
2. No end-to-end route contract proves how admission, signed usage context,
   trusted context resolution, downstream invocation, and post-call metering are
   threaded together.
3. Assistant-specific observability is incomplete:
   there is no dedicated operator surface for admission denials, budget
   decisions, metering reconciliation failures, or concurrency-release
   anomalies.
4. `plan_source` semantics are not fully aligned across Gateway usage-context
   issuance, Automation validation, and the ledger schema.
5. The current trusted context client is still a small synchronous internal HTTP
   client; that is acceptable for foundation work, but not ideal for productive
   runtime activation without stronger retry/observability/config semantics.
6. There is no production/operator gate proving assistant-specific runtime
   activation safety, rollback expectations, or release evidence.

## Accepted Non-Blocking Limitations

These do not block `ready_for_route_contract_foundation`:

- `ai_assistant` remains intentionally `not_yet_productive`
- no public route exists yet
- no UI exists yet
- low-risk trusted context retrieval is limited to two sources
- higher-risk sources remain stubbed or blocked
- the trusted context client is synchronous but bounded and hardened
- released reservations use the existing `denied + policy_blocked` ledger shape
- assistant-specific observability is incomplete, but the missing surface can be
  added after a minimal route contract exists

## Recommendation

Recommendation: `ready_for_route_contract_foundation`

Not recommended:

- `ready_for_runtime_activation`

Reasoning:

- the security/cost-abuse chain is now strong enough to support a minimal,
  internal, disabled-by-default route contract
- the chain is not yet production-ready because route wiring, trust-boundary
  alignment, assistant-specific observability, and operator release proof are
  still missing

## Next Slice Recommendation

Recommended next slice:

`AI Assistant Route Contract Foundation`

Constraints for that slice:

- no visible UI
- no productive activation
- no direct browser-to-automation call
- Gateway-owned route/controller only
- explicit request ID threading
- explicit usage-context issuance and forwarding
- explicit post-call metering reconciliation contract shape
- explicit temporary pinning of accepted `plan_source` to the already aligned
  safe subset until the trust-boundary mismatch is resolved

Explicit non-goal of the next slice:

- no production rollout of a live assistant runtime
