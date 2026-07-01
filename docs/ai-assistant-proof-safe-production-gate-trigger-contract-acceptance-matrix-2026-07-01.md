# AI Assistant Proof-Safe Production-Gate Trigger Contract Acceptance Matrix - 2026-07-01

## Decision

Primary decision: `activation_not_allowed_now`

This document is docs-only. It does not authorize:

- Product-Gate opening
- Route-Mode transition
- productive AI Assistant runtime
- productive AI Assistant downstream
- production deployment
- production-gate execution
- provider, webhook, queue, database, or OpenAI mutations

## Purpose

Define a docs-only acceptance matrix for later AI Assistant
proof-safe Production-Gate trigger proposals.

This matrix exists to classify future trigger designs without implying:

- runtime approval
- operator approval
- target-runtime proof
- production-gate proof
- AI Assistant activation

## Related Documents

- Current readiness consolidation:
  [ai-assistant-activation-readiness-status-consolidation-2026-07-01.md](./ai-assistant-activation-readiness-status-consolidation-2026-07-01.md)
- Product-Gate and Route-Mode state machine:
  [ai-assistant-product-gate-route-mode-state-machine-2026-07-01.md](./ai-assistant-product-gate-route-mode-state-machine-2026-07-01.md)
- Proof-safe trigger architecture review:
  [ai-assistant-proof-safe-production-gate-trigger-architecture-review-2026-07-01.md](./ai-assistant-proof-safe-production-gate-trigger-architecture-review-2026-07-01.md)
- Deployment and proof-runtime boundaries:
  [deployment.md](./deployment.md)
- Full-gate trigger audit baseline:
  [production-gate-trigger-contract-design-audit-2026-07-01.md](./production-gate-trigger-contract-design-audit-2026-07-01.md)

## Current Fixed State

The current state remains:

- `activation_not_allowed_now`
- Product Gate: `closed`
- Route Mode: `disabled`
- no productive AI Assistant runtime status
- no productive AI Assistant downstream
- no Full Production-Gate proof
- no implemented proof-safe trigger contract
- `release-gate-runner` remains proof-only
- `release-gate-runner` has no provider or webhook secret scope
- `release-gate-runner` does not receive `STREAM_EVENT_WEBHOOK_SECRET`
- `release-gate-runner` does not receive broad `API_GATEWAY_SECRET`
- `release-gate-runner` does not receive Redis credentials
- current `main` `1e7071d3f29252c9a0838136b0a159fbe7ead86c` has no new production deploy evidence

The `main` SHA above is a repo-state reference only. It must not be interpreted
as a deployed release candidate.

## Evidence Classes

These evidence classes stay separate:

| Evidence class           | Meaning                                                                                                        | What it is not                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `docs_ready`             | documentation defines the proposal and its boundaries                                                          | no implementation proof, no runtime proof, no approval            |
| `contract_ready`         | ownership, auth shape, proof scope, rollback semantics, and forbidden effects are explicitly defined           | no operator approval, no runtime proof                            |
| `operator_approved`      | an operator accepted the specific proposal, scope, rollout path, rollback path, and cost/risk posture          | no runtime proof, no production-gate result                       |
| `target_runtime_proven`  | redacted evidence from the intended proof-capable runtime proves the proposal on the target boundary           | no broader production approval, no Product-Gate opening by itself |
| `production_gate_proven` | the implemented trigger passed the approved Production-Gate proof scope from the correct proof-capable runtime | no permission to expand beyond the proven scope                   |

Rules:

- `docs_ready` must not be read as runtime-safe
- `contract_ready` must not be read as operator-approved
- documented reachability is not target-runtime-proven reachability
- documented signing parity is not target-runtime-proven signing parity
- same-RC binding is not proven until redacted target-runtime evidence exists

## Decision Values

| Decision                             | Meaning                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `accepted_for_future_design`         | the design is acceptable as target architecture, but remains unimplemented and not runtime-proven        |
| `rejected`                           | the design violates a hard StreamOS boundary and must not be implemented                                 |
| `blocked_until_operator_gate`        | the design can be coherent, but needs explicit operator approval for production-adjacent scope or auth   |
| `blocked_until_target_runtime_proof` | the design can be coherent on paper, but cannot count as proof until target-runtime evidence exists      |
| `incomplete`                         | the design leaves required proof semantics unresolved, such as auth, replay, provenance, rollback, scope |

## Hard Boundaries

These boundaries are non-negotiable for every future trigger proposal:

1. `release-gate-runner` remains proof-only and does not become a product
   service.
2. `release-gate-runner` does not receive provider secrets, webhook secrets,
   `STREAM_EVENT_WEBHOOK_SECRET`, broad `API_GATEWAY_SECRET`, or Redis
   credentials.
3. `services/api-gateway` remains the product-near entrypoint owner.
4. Browser or Vercel runtime must not trigger the proof contract.
5. The trigger must not open Product Gate or change Route Mode.
6. The trigger must not create productive AI Assistant runtime behavior or
   productive downstream execution.
7. The trigger must not perform provider writes, third-party writes, webhook
   ingestion, or queue production as a runner-owned action.
8. Proof artifacts must be disposable, secret-safe, and explicitly marked as
   proof-only.
9. Local diagnostics and docs-only evidence are never Production-Gate proof.

## Acceptance Criteria For Future Designs

A proposal can only stay inside the accepted design envelope if it defines:

- gateway-owned or gateway-mediated ownership
- least-privilege proof auth instead of broad product auth reuse
- replay protection and one-time or idempotent semantics
- RC-SHA and runtime-provenance binding
- bounded, non-productive runtime effects
- disposable proof artifacts and secret-safe markers
- explicit rollback and close semantics
- secret-safe evidence outputs

If one of those elements is missing, the proposal is either `incomplete`,
`rejected`, or blocked from any proof claim.

## Allowed And Forbidden Runtime Effects

Allowed proof-only runtime effects:

- validate a disposable proof request or proof artifact
- validate proof TTL, scope, and single-use or idempotent semantics
- validate same-RC and same-environment expectations
- emit secret-safe proof markers
- persist bounded proof classifications that are clearly non-productive

Forbidden runtime effects:

- productive AI Assistant response generation
- user-facing assistant state mutation
- Product-Gate opening
- Route-Mode transition
- provider write or third-party write
- productive webhook ingestion
- runner-owned queue enqueue
- irreversible downstream execution
- customer-visible activation semantics

## Candidate Acceptance Matrix

| Candidate design                                                             | Decision                             | Evidence floor before implementation discussion | Operator-Gate required | Why                                                                                                        | Next safe slice                                                                              |
| ---------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| dedicated gateway-owned proof-only trigger contract                          | `accepted_for_future_design`         | `contract_ready`                                | yes                    | fits gateway ownership, keeps runner proof-only, and can isolate proof semantics from productive paths     | define least-privilege auth, replay semantics, and proof markers without runtime changes     |
| gateway-mediated internal proof action                                       | `accepted_for_future_design`         | `contract_ready`                                | yes                    | acceptable only as an internal step after Gateway validation, not as a runner-owned entrypoint             | document internal action boundaries and rollback semantics                                   |
| proof-only route with least-privilege auth                                   | `blocked_until_operator_gate`        | `contract_ready`                                | yes                    | can be valid, but auth scope, approval owner, abuse controls, and rollout authority need operator sign-off | define narrow auth scope, TTL, rate limit, and replay model for operator review              |
| proof-only route with normal `API_GATEWAY_SECRET`                            | `rejected`                           | none                                            | yes                    | broad secret reuse would over-privilege the runner and blur proof auth with product auth                   | replace with a dedicated least-privilege proof auth design                                   |
| existing webhook path with `STREAM_EVENT_WEBHOOK_SECRET`                     | `rejected`                           | none                                            | yes                    | violates fixed secret ownership and reuses productive webhook ingress                                      | keep webhook ownership on Gateway and design a separate proof-only contract                  |
| runner-owned direct queue enqueue                                            | `rejected`                           | none                                            | yes                    | turns `release-gate-runner` into a production queue writer and breaks service ownership                    | keep queue production behind product-owned services                                          |
| runner-owned Redis/BullMQ enqueue                                            | `rejected`                           | none                                            | yes                    | requires forbidden Redis credentials and bypasses Gateway ownership                                        | keep Redis and BullMQ ownership outside the runner                                           |
| DB-only seed as Full-Gate trigger                                            | `rejected`                           | none                                            | yes                    | a DB seed can stage proof metadata but is not an acceptable product-near trigger contract                  | if needed, use DB rows only as disposable proof artifacts behind a gateway-owned trigger     |
| Browser or Vercel-triggered proof path                                       | `rejected`                           | none                                            | yes                    | browser and Vercel must not own private proof triggering or production-adjacent auth                       | keep proof initiation in a proof-capable Railway runtime                                     |
| direct Automation-Service trigger                                            | `rejected`                           | none                                            | yes                    | bypasses API Gateway ownership for a product-near proof surface                                            | keep Automation behind Gateway-mediated proof control where product-near ingress is involved |
| local diagnostic trigger                                                     | `blocked_until_target_runtime_proof` | `docs_ready`                                    | yes                    | can test local contract shape only, but local diagnostics are not target-runtime or Production-Gate proof  | keep as local-only diagnostic evidence and require proof-capable runtime evidence separately |
| GitHub Actions without proof-capable Railway runtime                         | `blocked_until_target_runtime_proof` | `docs_ready`                                    | yes                    | wrong runtime class for same-environment and same-RC proof claims                                          | move proof execution to the approved proof-capable Railway runtime                           |
| Gateway proof contract without replay protection                             | `incomplete`                         | `docs_ready`                                    | yes                    | proof semantics are unsafe without nonce, TTL, or idempotent replay handling                               | define replay prevention, expiry, and duplicate handling                                     |
| Gateway proof contract without RC-SHA or runtime-provenance binding          | `incomplete`                         | `docs_ready`                                    | yes                    | cannot prove same release candidate or same target runtime without explicit provenance binding             | define redacted provenance markers and RC binding acceptance criteria                        |
| Gateway proof contract with productive AI execution                          | `rejected`                           | none                                            | yes                    | violates the proof-only boundary and would create productive AI runtime behavior                           | keep proof path non-productive and separate from real assistant execution                    |
| Gateway proof contract with disposable proof artifact and secret-safe marker | `accepted_for_future_design`         | `contract_ready`                                | yes                    | matches proof-only artifact handling, supports redacted evidence, and avoids productive state mutation     | define artifact lifecycle, marker schema, and redaction requirements                         |

## Interpretation Notes

Evidence versus interpretation must stay separate:

- a row marked `accepted_for_future_design` is not approved for runtime use
- a row marked `accepted_for_future_design` is not target-runtime-proven
- a row marked `blocked_until_operator_gate` is not self-approving
- a row marked `blocked_until_target_runtime_proof` is not upgradeable by local
  diagnostics, CI logs, or docs-only statements
- a row marked `incomplete` must not be promoted to accepted by inference

Concrete interpretation examples:

- documented private reachability is still not
  `target_runtime_proven` reachability
- documented signing parity is still not `target_runtime_proven` signing parity
- the current `main` SHA is still not a deployed RC proof
- a disposable proof artifact is acceptable only if it remains non-productive
  and secret-safe

## Operator-Gate Triggers

These proposal traits always require operator review before any implementation
or runtime use:

- any new auth scope for proof triggering
- any deployment into a proof-capable runtime
- any production-adjacent Gateway entrypoint
- any redacted target-runtime evidence acceptance
- any proposal that could touch production costs, quotas, or AI invocation paths
- any proposal that could be confused with Product-Gate opening or Route-Mode
  change

## Still Blocked Activation Transitions

This matrix unblocks no activation transition.

Still blocked:

- Product Gate remains `closed`
- Route Mode remains `disabled`
- no productive AI Assistant runtime status exists
- no productive AI Assistant downstream exists
- Full Production-Gate remains blocked until a proof-safe trigger contract is
  defined, approved, implemented, and proven
- no secret-scope expansion to `release-gate-runner` is allowed
- no new production deploy exists for current `main`

## Recommended Next Safe Slice

One safe follow-up slice remains:

- docs-only acceptance criteria refinement for least-privilege proof auth,
  replay protection, provenance markers, and proof artifact lifecycle

That follow-up still must not:

- activate the AI Assistant
- open Product Gate
- change Route Mode
- deploy anything
- assign new secrets

`activation_not_allowed_now` remains in force.
