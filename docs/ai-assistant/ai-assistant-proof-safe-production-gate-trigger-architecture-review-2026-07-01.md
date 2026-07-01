# AI Assistant Proof-Safe Production-Gate Trigger Architecture Review - 2026-07-01

## Decision

Primary decision: `activation_not_allowed_now`

This document is an architecture review only. It does not authorize:

- Product-Gate opening
- Route-Mode transition
- productive AI Assistant runtime
- productive AI Assistant downstream
- production deployment
- production-gate execution
- provider or OpenAI calls

## Goal

Define the architecture target for a later proof-safe Production-Gate trigger
contract for the AI Assistant.

The trigger must allow a later production-gate proof to be initiated without:

- giving `release-gate-runner` provider or webhook secrets
- implying AI Assistant activation
- causing productive AI execution
- causing third-party writes
- causing irreversible downstream actions

## Related Documents

- Current readiness status:
  [ai-assistant-activation-readiness-status-consolidation-2026-07-01.md](./ai-assistant-activation-readiness-status-consolidation-2026-07-01.md)
- Product-Gate and Route-Mode state machine:
  [ai-assistant-product-gate-route-mode-state-machine-2026-07-01.md](./ai-assistant-product-gate-route-mode-state-machine-2026-07-01.md)
- Deployment and proof-runtime boundaries:
  [deployment.md](./deployment.md)
- Existing production-gate trigger design audit:
  [production-gate-trigger-contract-design-audit-2026-07-01.md](./production-gate-trigger-contract-design-audit-2026-07-01.md)

## Current Fixed Boundaries

The current state remains:

- `activation_not_allowed_now`
- Product Gate: `closed`
- Route Mode: `disabled`
- no productive AI Assistant runtime status
- no productive AI Assistant downstream
- full Production-Gate blocked until a proof-safe trigger contract exists
- `release-gate-runner` remains proof-only
- `release-gate-runner` does not receive `STREAM_EVENT_WEBHOOK_SECRET`
- no new production deploy is evidenced for `main`
  `1e7071d3f29252c9a0838136b0a159fbe7ead86c`

The `main` SHA above is a repo-state reference only. It must not be interpreted
as a deployed production release candidate.

## Architecture Decision

### 1. Trigger Ownership

The trigger contract must be `gateway-owned` or `gateway-mediated`.

Decision:

- `services/api-gateway` owns the trigger contract whenever the trigger touches
  a public or product-near entrypoint
- `release-gate-runner` is only the proof caller and proof collection context
- `release-gate-runner` must not become a queue owner, webhook owner, provider
  owner, or product-service control plane

Why:

- secret ownership already belongs to `services/api-gateway`
- the API Gateway is the existing product-service boundary for webhooks,
  protected server actions, and queue production
- keeping the trigger gateway-owned avoids turning the proof runtime into a
  privileged product runtime

### 2. Safe Trigger Source

Preferred architecture target:

- a dedicated `gateway-owned proof-only contract`
- optionally exposed as a narrow API Gateway proof route
- backed by a Gateway-internal proof action after server-side validation

This keeps the public or product-near entrypoint, if any, at the API Gateway
boundary while allowing the actual proof logic to remain internal and
non-productive.

## Trigger Source Review

| Trigger source                                                       | Decision                           | Why                                                                                                                                         |
| -------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| dedicated Gateway proof route bound to proof-only contract           | `allowed_as_target_architecture`   | acceptable only if it remains gateway-owned, non-secret-safe on the runner side, replay-protected, rate-limited, and proof-only by contract |
| Gateway-internal proof action behind the proof contract              | `allowed_as_implementation_detail` | acceptable as a server-side internal step after the Gateway validates proof ownership, scope, TTL, and idempotency                          |
| dedicated proof-only contract with disposable proof request binding  | `preferred`                        | best fit for proof-safe semantics because it can separate proof intent from product activation and from real webhook flows                  |
| existing webhook path requiring `STREAM_EVENT_WEBHOOK_SECRET`        | `forbidden`                        | violates current secret ownership and is already the blocking condition for the full Production-Gate                                        |
| runner-owned direct queue enqueue                                    | `forbidden`                        | would make `release-gate-runner` a production queue writer and weaken service ownership                                                     |
| runner-owned DB-only seed used as the proof trigger itself           | `forbidden_for_full_gate`          | may prepare proof artifacts but does not safely replace a gateway-owned trigger for a product-near proof                                    |
| direct browser or Vercel trigger path                                | `forbidden`                        | browser/Vercel must not own private Automation proof or AI Assistant activation-adjacent control                                            |
| direct Automation Service trigger from runner for product-near proof | `forbidden_as_primary_entrypoint`  | would bypass the Gateway ownership boundary for a product-near activation/proof surface                                                     |

## Runtime Effect Boundary

The trigger contract must remain proof-only.

Maximum allowed runtime effect:

- create or validate a disposable proof request
- validate proof-row ownership and proof purpose
- validate same-RC and same-environment prerequisites
- emit secret-safe proof markers
- optionally perform bounded non-productive server-side checks required by the
  proof scope

Forbidden runtime effect:

- productive AI Assistant response generation
- user-facing Assistant state mutation
- Product-Gate opening
- Route-Mode change
- productive runtime-status change
- provider write
- webhook simulation that enters productive ingestion semantics
- queue fanout into productive actions
- irreversible downstream execution
- customer-visible feature activation

Important boundary:

- a proof-safe trigger may validate or record proof state
- it must not act like a real AI Assistant request path
- it must not be mistaken for a limited production activation path

## Secret and Env Scope Decision

### `release-gate-runner`

Allowed scope category:

- proof-only env names needed to identify the release candidate, proof scope,
  and secret-safe evidence outputs

Forbidden scope category:

- provider secrets
- webhook secrets
- `STREAM_EVENT_WEBHOOK_SECRET`
- `API_GATEWAY_SECRET`
- Redis credentials
- provider write credentials
- any env that would let the runner impersonate a product-owned webhook or
  queue producer

### `services/api-gateway`

Retained ownership:

- provider and webhook secret scope
- gateway-owned protected product-service behavior
- any future proof-trigger validation that touches product-near ingress

Decision:

- secret ownership remains at the product service boundary
- the runner does not receive the secret scope required for existing webhook
  ingress

## Proof Flow Target

The later proof flow should follow this architecture:

1. `release-gate-runner` proves it is the intended proof runtime class for the
   target release-candidate scope.
2. The runner creates or references a disposable proof artifact owned by the
   proof flow, not by customer/product state.
3. The runner calls the gateway-owned proof trigger contract with a short-lived
   proof identifier or challenge.
4. `services/api-gateway` validates the proof artifact server-side:
   - proof purpose
   - TTL
   - one-time or idempotent use semantics
   - same RC / same environment expectations
   - proof-only scope
5. The Gateway records only secret-safe proof markers and bounded result
   classifications.
6. Any optional deeper check remains non-productive and disposable:
   - no real AI generation
   - no provider write
   - no customer-visible assistant state
7. The proof result is reported as a secret-safe artifact.

## Evidence Classes for This Contract

| Evidence class           | Meaning in this trigger review                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local_diagnostic_only`  | local scripts or docs confirm contract shape or fail-closed behavior only; not target-runtime proof                                                      |
| `docs_ready`             | the trigger contract and boundaries are documented clearly enough for later implementation review                                                        |
| `contract_ready`         | ownership, allowed sources, forbidden sources, and proof-only runtime effect are defined consistently                                                    |
| `target_runtime_proven`  | a later redacted runtime bundle proves same RC, same environment, gateway provenance, and any required private reachability for the approved proof scope |
| `production_gate_proven` | the later implemented proof contract was executed from a proof-capable runtime and passed in the approved production-gate scope                          |

Rules:

- `docs_ready` is not activation proof
- `contract_ready` is not target-runtime proof
- documented reachability is not target-runtime-proven reachability
- documented signing expectations are not target-runtime-proven signing parity
- signing parity and same-RC binding become proof-capable only after redacted
  target-runtime evidence exists

## Required Future Evidence

The trigger contract is only target-runtime-proven later if the evidence bundle
can show:

- release-candidate SHA binding
- same Railway project and environment binding
- Gateway runtime provenance
- proof-runtime identity as `release-gate-runner` or equivalent proof-capable
  Railway runtime
- secret-safe proof request marker
- secret-safe proof result marker
- no secret values in logs, artifacts, or reports

Private Automation reachability is required only when the approved proof scope
actually depends on that boundary. If it is required, it must still be proven
through a secret-safe redacted target-runtime artifact and must not imply AI
Assistant activation.

## Signing and Binding Boundary

This architecture review does not treat signing parity or same-RC binding as
already proven.

Current interpretation:

- signing parity remains `incomplete` until redacted target-runtime evidence
  exists
- same-RC binding remains `incomplete` until redacted target-runtime evidence
  exists
- neither condition may be inferred from docs-only or local evidence

## Blocker and Warning Matrix

| Area                                  | Current classification   | Why                                                                                          | What must be true later                                         |
| ------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| runner secret boundary                | `blocker_if_violated`    | `release-gate-runner` must not receive provider or webhook secrets                           | runner remains proof-only and secret-minimal                    |
| trigger ownership                     | `blocker_if_wrong_owner` | product-near trigger behavior must stay gateway-owned or gateway-mediated                    | Gateway remains the service boundary                            |
| existing webhook reuse                | `blocked`                | current webhook path requires `STREAM_EVENT_WEBHOOK_SECRET` on the caller side               | future proof trigger must avoid that dependency                 |
| runner direct queue ownership         | `blocked`                | would turn proof runtime into a production queue producer                                    | queue ownership stays with product services                     |
| productive AI execution               | `blocked`                | this proof contract must not generate real AI Assistant responses                            | proof path remains non-productive                               |
| productive downstream state           | `blocked`                | no productive downstream exists and this review does not authorize one                       | downstream remains absent or explicitly blocked                 |
| same-RC binding                       | `incomplete`             | docs and redacted review history do not yet prove the live binding for the later proof scope | redacted runtime evidence must prove RC equality                |
| signing parity                        | `incomplete`             | docs and prior evidence do not yet prove the live proof-scope parity                         | redacted runtime evidence must prove parity                     |
| private reachability                  | `warning`                | documented boundary exists, but documentation alone is not target-runtime proof              | prove only if the approved proof scope needs it                 |
| full Production-Gate trigger contract | `blocked`                | no implemented proof-safe trigger contract exists yet                                        | architecture approval, implementation, and proof still required |

## Explicitly Forbidden Designs

- copying `STREAM_EVENT_WEBHOOK_SECRET` to `release-gate-runner`
- giving `release-gate-runner` `API_GATEWAY_SECRET`
- giving `release-gate-runner` Redis credentials
- using the existing webhook ingress as the proof trigger
- simulating a real provider webhook in a way that enters productive ingestion
- treating a DB seed alone as a full-gate trigger
- calling a productive AI Assistant path as the proof
- emitting private URLs, secret values, raw payloads, or unsanitized errors in
  proof reports

## Allowed Design Envelope

The later implementation may be considered within scope only if it stays inside
this envelope:

- gateway-owned or gateway-mediated
- proof-only
- disposable or read-only proof artifacts
- replay-protected
- rate-limited
- idempotent
- secret-safe reportable
- non-productive for AI Assistant runtime semantics

## Still Blocked Activation Transitions

This architecture review does not unblock any activation transition.

Still blocked:

- Product-Gate opening
- Route-Mode transition
- productive runtime-status change
- productive downstream introduction
- any transition that would require full Production-Gate proof before the
  proof-safe trigger contract exists

## Recommended Next Safe Slice

Exactly one safe follow-up slice is recommended:

`AI Assistant Proof-Safe Production-Gate Trigger Contract Acceptance Matrix`

That slice should remain docs-only and should do only this:

- convert this architecture target into an explicit acceptance matrix
- define testable accept/reject criteria for allowed trigger sources
- keep `activation_not_allowed_now`
- keep all runtime, secret, and deployment boundaries unchanged

`activation_not_allowed_now` remains in force.
