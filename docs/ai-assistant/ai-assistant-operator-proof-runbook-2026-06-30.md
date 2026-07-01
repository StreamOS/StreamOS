# AI Assistant Operator Proof Runbook — 2026-06-30

## Purpose

This runbook defines the operator-owned proof categories that must exist before any later AI Assistant runtime activation slice is allowed to proceed.

It is intentionally proof-only:

- no runtime activation
- no `productGate` opening
- no `routeMode` transition out of `disabled`
- no productive `runtimeStatus`
- no productive downstream call

The runbook is based on the current mounted-but-fail-closed Gateway route, the local activation preflight evaluator, the AI Assistant observability contract, `docs/architecture.md`, `docs/deployment.md`, and the merged runtime activation readiness audit.

`02_roadmap_and_next_slices.md` and `streamos_produkt_feature_roadmap.md` were not present on current `main`. `docs/p4-product-roadmap-update.md` is the available roadmap source.

## Current Fail-Closed State

The current assistant slice remains intentionally non-productive:

- `/api/ai-assistant` is mounted in `services/api-gateway`
- `productGate=closed`
- `routeMode=disabled`
- Gateway `runtimeStatus=not_yet_productive`
- Automation `runtime_status=not_yet_productive`
- no productive AI Assistant downstream is configured
- local preflight can produce at most `preflight_ready`
- local preflight still returns `activationPermittedNow=false`
- local preflight still returns `localOnly=true`
- local preflight still returns `operatorProofRequired=true`

Current internal automation endpoints remain unchanged core/internal surfaces:

- `/clips/analyze`
- `/repurposing/plan`
- `/transcriptions/process`

## Non-Goals

- proving runtime activation from a local environment
- treating local tests as production proof
- exposing secrets, tokens, private URLs, signatures, or raw payloads
- enabling a browser-visible or client-side activation path
- allowing test fixtures to activate runtime semantics
- introducing UI, env, DB, worker, provider, billing, or OpenAI changes

## Required Operator Proofs

### 1. Product Gate Proof

Operators must prove that `productGate` can only move from `closed` through a server-owned operational step, and that it can be returned to `closed` immediately without code edits.

Required evidence:

- named operator owner
- bounded open procedure
- bounded close procedure
- operator-readable audit evidence that the route stayed closed before the step

### 2. Route Mode Transition Proof

Operators must prove that leaving `routeMode=disabled` is an explicit operational transition, not a side effect of deploy drift or test config.

Required evidence:

- allowed transition path documented from `disabled`
- explicit reject state for accidental or partial transition
- rollback path back to `disabled`
- operator-readable confirmation that no productive mode is reached implicitly

### 3. Runtime Status Coordination Proof

Gateway and Automation must not diverge into mixed activation state.

Required evidence:

- coordinated sequencing for Gateway and Automation runtime status changes
- proof that either both stay fail-closed or both are deliberately coordinated
- explicit abort condition if one side is not ready
- operator-readable confirmation that Automation remains non-productive until all other proofs are complete

### 4. Signing Parity Proof

Gateway and Automation must prove shared interpretation of the entitlement assertion signing contract in the target environment.

Required evidence:

- same configured signing mode on both services
- if HMAC signing is used later, proof that both services are wired to the same secret owner path without exposing the secret
- operator-readable parity result that does not print the secret, signature, or raw assertion payload

### 5. Private Gateway to Automation Reachability Proof

The Automation Service must remain private in steady-state production, and Gateway-to-Automation connectivity must be proven from the correct runtime boundary.

Required evidence:

- proof source from the intended Railway-internal runtime boundary
- proof that browser code and Vercel do not call the Automation Service directly
- proof that private networking exists for the service pair under test
- explicit rejection of local shell reachability as production proof

### 6. Budget, Rate, Concurrency, Ledger, and Metering Proof

Activation must stay blocked until productive usage control is proven operational, not just implemented in code.

Required evidence:

- `budget_mode_productive_ready`
- `rate_guard_ready`
- `concurrency_guard_ready`
- `ledger_metering_ready`
- operator-readable evidence that the controls deny safely and reconcile safely

### 7. Rollback Proof

Operators must prove that the assistant can be returned to fail-closed state quickly and safely.

Required evidence:

- immediate close path for `productGate`
- immediate return path to `routeMode=disabled`
- coordinated return path to non-productive runtime status
- operator-readable evidence that rollback prevented productive downstream execution

### 8. Activation Evidence Secret-Safety

All activation and rollback evidence must remain secret-safe.

Required evidence:

- evidence contains status, timestamps, gate categories, and safe reason codes only
- no secret values, tokens, signatures, private URLs, raw prompts, raw context payloads, raw provider payloads, raw model responses, or raw errors
- operator-readable evidence remains tenant-safe and non-cross-tenant

## Proof Matrix

| Proof category                               | Why it exists                                           | Minimum acceptable evidence                                       | Still blocked by local-only proof                    |
| -------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| `product_gate_operator_approval`             | Prevents silent opening of the mounted route            | operator owner, open/close procedure, audit-readable confirmation | yes                                                  |
| `route_mode_transition_approval`             | Prevents accidental transition out of `disabled`        | documented allowed transition and rollback path                   | yes                                                  |
| `runtime_status_coordination`                | Prevents Gateway/Automation activation drift            | coordinated status procedure and abort rule                       | yes                                                  |
| `gateway_automation_signing_parity`          | Prevents contract mismatch between issuer and validator | secret-safe parity confirmation from target env                   | yes                                                  |
| `private_gateway_to_automation_reachability` | Preserves private Automation boundary                   | Railway-internal reachability proof                               | yes                                                  |
| `budget_mode_productive_ready`               | Prevents ungoverned spend                               | productive budget policy proof                                    | yes                                                  |
| `rate_guard_ready`                           | Prevents admission abuse                                | operator-readable guard readiness evidence                        | yes                                                  |
| `concurrency_guard_ready`                    | Prevents hot-path saturation                            | operator-readable concurrency proof                               | yes                                                  |
| `ledger_metering_ready`                      | Prevents untracked usage and broken reconciliation      | operator-readable reservation and reconciliation proof            | yes                                                  |
| `rollback_switch_ready`                      | Prevents one-way activation                             | rollback evidence with bounded close path                         | yes                                                  |
| `activation_evidence_secret_safe`            | Prevents sensitive data leakage in proof artifacts      | secret-safe evidence review                                       | no, but it still does not allow activation by itself |

## Forbidden Evidence

The following must not appear in docs, logs, tests, dashboards, evidence bundles, or operator reports:

- secret values
- API tokens
- private Railway URLs
- HMAC secrets or signatures
- raw entitlement assertions
- raw prompt text
- full trusted-context payloads
- full resolved-context payloads
- raw provider payloads
- raw OpenAI payloads
- raw model responses
- cross-tenant identifiers beyond the minimum safe operator metadata
- raw internal stack traces or unsanitized errors

## Local vs Staging vs Production Proof

Local proof is implementation evidence only.

- Local can prove helper behavior, fail-closed defaults, route denials, contract parsing, and secret-safe observability shapes.
- Local cannot prove shared env parity, Railway-private reachability, operational rollback, or productive budget and guard operation.
- A local `preflight_ready` result is not an activation approval. It only means the local evaluator saw complete local evidence while the system still remained fail-closed.

Staging proof is stronger but still bounded.

- Staging can prove operator workflow shape, status coordination, and secret-safe evidence handling in a controlled target-like environment.
- Staging still does not replace production proof when networking, secrets, or runtime topology differ from production.

Production proof must come from the intended operator/runtime boundary.

- Production proof must be collected from the target Railway deployment context or a proof-capable equivalent runtime in the same deployment topology.
- Production proof must confirm private Automation reachability, signing parity, and rollback readiness without exposing sensitive values.
- Production proof is required before any activation slice may attempt to change gate semantics.

The synchronous trusted context client is not a blocker for local preflight or route presence, but it remains a runtime activation concern because productive activation would depend on a live internal HTTP hop.

## Activation Decision Matrix

| Status                     | Meaning                                                                                                                         | Allowed action                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `blocked`                  | current state is not fail-closed, or required proof structure is missing                                                        | keep route fail-closed and collect missing proof requirements |
| `operator_proof_required`  | code and local tests exist, but target-environment operator evidence is still missing                                           | do not activate; gather operator proof                        |
| `proof_ready`              | proof categories are documented and evidence format is acceptable                                                               | activation is still not allowed                               |
| `activation_slice_allowed` | documentation, operator proof ownership, and target proof requirements are complete enough to start a separate activation slice | only start the slice; do not activate in this runbook         |
| `activation_not_allowed`   | any proof is stale, unsafe, secret-leaking, partial, or contradicted by deployment/runtime drift                                | immediately return to fail-closed evaluation                  |

Decision rule:

- local `blocked` or local `preflight_ready` never overrides operator proof requirements
- `proof_ready` is not equivalent to runtime activation
- only `activation_slice_allowed` may justify a future, separate, reviewed activation slice
- no status in this runbook authorizes direct runtime activation

## Rollback Evidence Template

Use this secret-safe template for rollback proof artifacts:

| Field                              | Required content                                                  |
| ---------------------------------- | ----------------------------------------------------------------- |
| `event_type`                       | `ai_assistant_activation_rollback`                                |
| `occurred_at`                      | ISO timestamp                                                     |
| `operator_scope`                   | operator role or owning runtime, no personal secret data          |
| `product_gate_status`              | expected closed value after rollback                              |
| `route_mode`                       | expected disabled value after rollback                            |
| `gateway_runtime_status`           | expected `not_yet_productive`                                     |
| `automation_runtime_status`        | expected `not_yet_productive`                                     |
| `productive_downstream_configured` | expected false value                                              |
| `reason_code`                      | safe rollback reason code                                         |
| `verification_result`              | secret-safe confirmation that downstream execution stayed blocked |
| `evidence_class`                   | secret-safe observability or operator-proof class                 |

## Operator Checklist

- confirm current route state is still fail-closed
- confirm no productive downstream is configured in `services/automation-service`
- confirm `productGate` owner, open path, and close path are documented
- confirm `routeMode` transition path and rollback path are documented
- confirm Gateway and Automation runtime status coordination procedure exists
- confirm signing parity proof exists without exposing secret material
- confirm private Gateway-to-Automation reachability proof comes from the correct runtime boundary
- confirm productive budget, rate, concurrency, ledger, and metering proofs exist
- confirm rollback evidence template is available and operator-readable
- confirm evidence remains secret-safe
- confirm browser and Vercel remain outside the private Automation path
- confirm `/clips/analyze`, `/repurposing/plan`, and `/transcriptions/process` remain unchanged core/internal endpoints unless a later reviewed slice explicitly changes them

## Recommended Next Slice

`AI Assistant Activation Slice Planning`

That slice should do only this:

- convert the proof-ready runbook into an explicit activation plan with named operator inputs
- define the narrow activation sequence for `productGate`, `routeMode`, runtime coordination, and rollback
- keep runtime inactive until that later slice is separately reviewed and approved

Final activation boundary:

- this runbook does not activate anything
- local preflight does not activate anything
- mounted route presence does not activate anything
- a future activation slice must still fail closed if any operator proof is missing, stale, unsafe, or target-env-incomplete
