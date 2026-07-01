# AI Assistant Proof-Safe Trigger Auth, Replay Protection, Provenance Marker and Proof Artifact Lifecycle Spec - 2026-07-01

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

Translate the accepted target designs from the AI Assistant trigger acceptance
matrix into concrete contract requirements for a later implementation review.

This specification exists so later implementation PRs can be accepted or
rejected without:

- inferring runtime proof from docs
- inferring operator approval from contract language
- weakening secret ownership
- treating a proof trigger as a product activation path

## Related Documents

- Readiness consolidation:
  [ai-assistant-activation-readiness-status-consolidation-2026-07-01.md](./ai-assistant-activation-readiness-status-consolidation-2026-07-01.md)
- Product-Gate and Route-Mode state machine:
  [ai-assistant-product-gate-route-mode-state-machine-2026-07-01.md](./ai-assistant-product-gate-route-mode-state-machine-2026-07-01.md)
- Trigger architecture review:
  [ai-assistant-proof-safe-production-gate-trigger-architecture-review-2026-07-01.md](./ai-assistant-proof-safe-production-gate-trigger-architecture-review-2026-07-01.md)
- Trigger acceptance matrix:
  [ai-assistant-proof-safe-production-gate-trigger-contract-acceptance-matrix-2026-07-01.md](./ai-assistant-proof-safe-production-gate-trigger-contract-acceptance-matrix-2026-07-01.md)
- Deployment boundaries:
  [deployment.md](./deployment.md)

## Current Fixed State

The current state remains:

- `activation_not_allowed_now`
- Product Gate: `closed`
- Route Mode: `disabled`
- no productive AI Assistant runtime status
- no productive AI Assistant downstream
- no implemented proof-safe trigger contract
- Full Production-Gate remains blocked
- `release-gate-runner` remains proof-only
- `release-gate-runner` does not receive `STREAM_EVENT_WEBHOOK_SECRET`
- `release-gate-runner` does not receive broad `API_GATEWAY_SECRET`
- `release-gate-runner` does not receive Redis credentials
- current `main` has no new production deploy evidence

This document does not change any of those conditions.

## Scope Boundary

This spec defines contract requirements only for:

- least-privilege proof auth
- replay protection
- runtime provenance markers
- proof artifact lifecycle
- failure and rollback classifications
- acceptance rules for later implementation PRs

This spec does not define:

- runtime code
- real secrets
- deployment steps
- Product-Gate opening
- Route-Mode changes
- productive AI execution

## Contract Vocabulary

These evidence classes remain separate:

| Evidence class           | Meaning                                                                                                       | Not implied                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `docs_ready`             | the specification is written clearly enough for review                                                        | no runtime proof, no operator approval                              |
| `contract_ready`         | auth scope, replay semantics, provenance markers, and artifact lifecycle are defined consistently             | no runtime proof, no approval to deploy                             |
| `operator_approved`      | an operator explicitly accepted a proposal, its scope, and rollback path                                      | no target-runtime proof, no activation approval                     |
| `target_runtime_proven`  | redacted evidence from the intended proof-capable runtime proves the contract behavior on the target boundary | no broader production approval, no Product-Gate opening             |
| `production_gate_proven` | the implemented trigger passed the approved Production-Gate proof scope                                       | no permission to expand beyond that approved and proven proof scope |

Interpretation rules:

- documented reachability is not `target_runtime_proven` reachability
- documented signing parity is not `target_runtime_proven` signing parity
- documented same-RC intent is not same-RC proof
- local diagnostics are not Production-Gate proof

## Least-Privilege Proof Auth Requirements

### Why normal `API_GATEWAY_SECRET` stays rejected

Normal `API_GATEWAY_SECRET` remains rejected for the proof trigger because it
would:

- grant broader Gateway product-surface access than a proof trigger needs
- blur proof auth with app-facing product auth
- over-privilege `release-gate-runner`
- increase blast radius if reused outside the proof scope
- make it harder to prove that the trigger stayed proof-only

This rejection remains fixed even if the eventual trigger path is gateway-owned.

### Required contract properties for future proof auth

A later proof-only auth concept is acceptable on contract level only if it is:

- proof-specific, not a general Gateway credential
- least-privilege by scope
- revocable
- time-bounded, single-proof-bounded, or equivalently challenge-bound
- bound to the proof purpose rather than to general product API access
- unusable from browser or Vercel contexts
- unable to convey provider, webhook, Redis, or broad Gateway permissions

### Minimum contract shape

A future implementation PR must define, at minimum:

- who can mint or authorize a proof auth unit
- what single proof scope that auth unit authorizes
- how auth expiry is enforced
- how auth revocation or invalidation is enforced
- how auth scope mismatch is classified
- how auth failure remains secret-safe in logs and reports

### Explicit auth prohibitions

A future implementation must be rejected if its auth model:

- reuses normal `API_GATEWAY_SECRET`
- reuses `STREAM_EVENT_WEBHOOK_SECRET`
- requires Redis credentials on `release-gate-runner`
- is valid for non-proof Gateway routes
- can be replayed as a general product mutation credential
- can be exposed to browser code, Vercel runtime, or public client bundles

## Replay Protection Requirements

The proof trigger contract must define replay protection that is testable and
secret-safe.

### Required replay controls

At least one coherent replay model must be specified with all required fields:

- nonce or equivalent one-time challenge marker
- request ID or proof-attempt ID
- TTL or explicit expiry window
- idempotent proof ID or equivalent duplicate-detection mechanism
- bounded duplicate handling outcome

If equivalent mechanisms are proposed instead of those names, the proposal must
still prove the same properties.

### Replay handling rules

The contract must define:

- which requests are first-use valid
- which requests are duplicates
- which requests are expired
- which requests are scope-mismatched
- which requests are provenance-mismatched
- which requests are rejected versus blocked for later review

### Replay outcomes

The following replay cases must fail closed and remain secret-safe:

- same proof auth reused outside its intended proof scope
- same nonce reused after successful consumption
- same proof ID replayed with altered provenance markers
- expired proof artifact or expired request replay
- repeated attempts that would otherwise create productive side effects

Repeated proof attempts must never:

- open Product Gate
- change Route Mode
- trigger productive AI execution
- write to providers
- enqueue productive queue work
- create customer-visible assistant state

### Replay evidence requirements

A later implementation can only be accepted if it can produce redacted
evidence showing:

- the replay key material is not itself secret-disclosing
- duplicate classification is observable through secret-safe markers
- TTL/expiry classification is observable through secret-safe markers
- blocked or rejected replay attempts do not mutate productive state

## Runtime Provenance Marker Requirements

### Required non-sensitive markers

Any future proof-safe trigger proposal must define a marker set that is
non-sensitive and sufficient for operator review.

Required markers:

- RC SHA
- service name
- Railway project or environment classification without private details
- runner provenance
- gateway provenance
- contract version or gate-contract hash
- timestamp or TTL classification

### Marker quality rules

Markers must be:

- non-secret
- stable enough for operator comparison
- redaction-safe in logs and evidence bundles
- specific enough to distinguish same-RC versus mismatched-RC attempts
- specific enough to distinguish runner provenance versus gateway provenance

### Forbidden marker contents

The marker model must reject any inclusion of:

- secret values
- private URLs
- tokens
- raw request payloads
- provider data
- webhook payloads
- Redis endpoints
- personally identifying details beyond minimal proof reference
- env dumps

### Provenance mismatch rules

The contract must define a secret-safe mismatch result when:

- RC SHA does not match the approved proof scope
- runner provenance does not match the intended proof-capable runtime class
- gateway provenance does not match the expected target boundary
- contract version or gate-contract hash does not match the expected reviewable
  contract
- timestamp or TTL classification falls outside the allowed proof window

## Proof Artifact Lifecycle

Proof artifacts must be disposable and explicitly classified as proof-only.

### Required lifecycle stages

Every future implementation proposal must define these stages:

1. creation
2. read or lookup
3. validation
4. classification
5. disposal, expiry, or equivalent terminal state

### Lifecycle requirements

Proof artifacts must:

- exist only for proof purposes
- be bounded to a specific proof attempt or proof scope
- be readable only by the proof contract path or its tightly bounded internal
  action
- expire or become unusable after their allowed proof window
- be classifiable as consumed, expired, rejected, or invalid without implying
  productive runtime state

### Explicit artifact prohibitions

Proof artifacts must not:

- create productive AI Assistant state
- trigger user actions
- trigger provider actions
- trigger publication actions
- act as a substitute for Product-Gate opening
- act as a substitute for Route-Mode change
- become durable customer-facing records that look like productive assistant
  history

### Allowed and forbidden persistence

Allowed persistence is limited to:

- disposable proof metadata
- secret-safe proof markers
- secret-safe failure classifications
- secret-safe evidence references for later operator review

Forbidden persistence includes:

- durable productive assistant state
- provider tokens or webhook materials
- raw payload archives
- customer content state mutations
- proof records that can be reused as standing authorization

## Failure And Rollback Classification

Every failure class below must be secret-safe and activation-blocking.

| Failure class                              | Blocking meaning                                                                               | Minimum secret-safe interpretation                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `proof_auth_missing`                       | no proof auth was presented                                                                    | fail closed without exposing the expected credential shape                                   |
| `proof_auth_invalid`                       | auth material is malformed, expired, revoked, or otherwise invalid                             | fail closed without echoing auth contents                                                    |
| `proof_auth_scope_invalid`                 | auth does not authorize the specific proof-only action                                         | fail closed and do not fall back to broader Gateway privileges                               |
| `proof_replay_detected`                    | a nonce, proof ID, or equivalent replay guard indicates duplicate or unsafe reuse              | classify duplicate safely and keep all productive effects blocked                            |
| `proof_marker_missing`                     | one or more required provenance markers are absent                                             | fail closed because the proof cannot be audited                                              |
| `proof_marker_mismatch`                    | marker values conflict with the approved proof scope or with each other                        | fail closed and preserve only redacted mismatch evidence                                     |
| `proof_runtime_provenance_mismatch`        | runner or gateway provenance does not match the required proof-capable runtime boundary        | fail closed and block any proof claim                                                        |
| `proof_artifact_expired`                   | the artifact or request lifetime ended before validation or reuse attempt                      | fail closed and classify as expired rather than retryable activation                         |
| `proof_artifact_not_disposable`            | the artifact behaves like durable product state or reusable authorization                      | fail closed because the proof path is no longer safely disposable                            |
| `proof_attempt_has_productive_side_effect` | the attempt touched productive AI, productive downstream state, or third-party write semantics | treat as hard blocker and reject the implementation shape, not merely the individual attempt |

Rollback and close rules:

- any failure above blocks activation
- any failure above preserves Product Gate as `closed`
- any failure above preserves Route Mode as `disabled`
- any failure above preserves the absence of productive downstream activation
- any failure above must be representable without secrets, tokens, or private
  URLs

## Acceptance Rules For Future Implementation PRs

A later implementation PR may be accepted only if all of the following remain
true:

1. Product Gate stays closed until the required operator gate is explicitly
   satisfied.
2. Route Mode stays `disabled` until the required transition gate is explicitly
   satisfied.
3. `release-gate-runner` receives no provider, webhook, Redis, or broad Gateway
   secrets.
4. proof auth is least-privilege and proof-specific.
5. replay protection is defined and testable.
6. provenance markers are non-sensitive and RC-bound.
7. proof artifacts are disposable.
8. no productive downstream is triggered.
9. no third-party write is triggered.
10. all failure classes remain secret-safe and activation-blocking.

A later implementation PR must be rejected if it:

- turns the runner into a product service
- relies on broad `API_GATEWAY_SECRET`
- relies on `STREAM_EVENT_WEBHOOK_SECRET`
- relies on browser or Vercel proof initiation
- relies on direct queue or Redis ownership by the runner
- treats docs-only markers as target-runtime proof
- treats local diagnostics as Production-Gate proof
- omits disposable artifact semantics
- omits replay semantics
- omits provenance mismatch handling

## Review Checklist For Later PRs

Use this checklist for later implementation review:

- proof auth is proof-only, revocable, and narrow in scope
- normal `API_GATEWAY_SECRET` is not reused for proof triggering
- no provider, webhook, Redis, or broad Gateway auth lands on the runner
- replay detection covers nonce, proof ID, TTL, and duplicate handling
- provenance markers include RC SHA, service, environment classification,
  runner provenance, gateway provenance, and contract version or hash
- markers remain non-sensitive and redaction-safe
- proof artifact stages are creation, validation, classification, and disposal
- proof artifact storage remains disposable and non-productive
- failure classes are secret-safe and block activation
- Product Gate remains `closed`
- Route Mode remains `disabled`

## Still Blocked Activation Transitions

This specification unblocks no activation transition.

Still blocked:

- Product-Gate opening
- Route-Mode transition
- productive AI Assistant runtime
- productive AI Assistant downstream
- Full Production-Gate proof
- any secret-scope expansion to `release-gate-runner`
- any proof claim based only on docs or local diagnostics

## Recommended Next Safe Slice

One safe follow-up slice remains:

- docs-only operator review criteria for redacted target-runtime evidence of
  proof auth behavior, replay classification, provenance matching, and artifact
  disposal

That slice must still avoid:

- code changes
- runtime changes
- secret changes
- Product-Gate opening
- Route-Mode changes
- AI Assistant activation

`activation_not_allowed_now` remains in force.
