# AI Assistant Proof-Safe Trigger Redacted Target-Runtime Evidence Operator Review Standard - 2026-07-01

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

Define the operator review standard for later redacted target-runtime evidence
about the AI Assistant proof-safe trigger contract.

This standard defines what later evidence is sufficient or insufficient to
review:

- proof-auth behavior
- replay classification
- provenance matching
- proof-artifact disposal

This standard does not turn accepted evidence into runtime approval or product
activation.

## Related Documents

- Readiness consolidation:
  [ai-assistant-activation-readiness-status-consolidation-2026-07-01.md](./ai-assistant-activation-readiness-status-consolidation-2026-07-01.md)
- Product-Gate and Route-Mode state machine:
  [ai-assistant-product-gate-route-mode-state-machine-2026-07-01.md](./ai-assistant-product-gate-route-mode-state-machine-2026-07-01.md)
- Trigger architecture review:
  [ai-assistant-proof-safe-production-gate-trigger-architecture-review-2026-07-01.md](./ai-assistant-proof-safe-production-gate-trigger-architecture-review-2026-07-01.md)
- Trigger acceptance matrix:
  [ai-assistant-proof-safe-production-gate-trigger-contract-acceptance-matrix-2026-07-01.md](./ai-assistant-proof-safe-production-gate-trigger-contract-acceptance-matrix-2026-07-01.md)
- Trigger auth, replay, provenance, and artifact spec:
  [ai-assistant-proof-safe-trigger-auth-replay-provenance-artifact-spec-2026-07-01.md](./ai-assistant-proof-safe-trigger-auth-replay-provenance-artifact-spec-2026-07-01.md)
- Deployment boundaries:
  [deployment.md](./deployment.md)

## Current Fixed State

The current state remains:

- `activation_not_allowed_now`
- Product Gate: `closed`
- Route Mode: `disabled`
- no productive AI Assistant runtime status
- no productive AI Assistant downstream
- no new production deploy for current `main`
- no implemented proof-safe trigger contract
- Full Production-Gate remains blocked
- `release-gate-runner` remains proof-only
- no secret-scope expansion on `release-gate-runner`
- no `STREAM_EVENT_WEBHOOK_SECRET` on `release-gate-runner`
- no broad `API_GATEWAY_SECRET` on `release-gate-runner`
- no Redis credentials on `release-gate-runner`

Accepted evidence under this document does not change any of those conditions.

## Evidence Decision Values

| Decision                   | Meaning                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `accepted_evidence`        | the redacted bundle is sufficient for the narrow operator review question it claims to show |
| `insufficient_evidence`    | the bundle is incomplete, ambiguous, or missing required target-runtime markers             |
| `rejected_evidence`        | the bundle contains forbidden material or proves a boundary violation                       |
| `operator_review_required` | the bundle may be structurally acceptable, but human sign-off is still required             |

Interpretation rules:

- `accepted_evidence` is not Product-Gate opening
- `accepted_evidence` is not Route-Mode change
- `accepted_evidence` is not productive downstream activation
- local diagnostics are not Production-Gate proof
- docs-only statements are not target-runtime proof

## Redaction Rules

Every later evidence bundle must be redacted and secret-safe.

Allowed evidence contents:

- decision codes
- non-sensitive marker values
- non-sensitive classifications
- redacted timestamps or TTL classes
- redacted same-RC and same-environment comparisons
- proof-only artifact state classes

Forbidden evidence contents:

- secret values
- private URLs
- tokens
- Redis connection strings
- raw provider payloads
- webhook secrets
- auth material
- env dumps
- raw request bodies
- personal data beyond a minimal proof reference

If forbidden material appears anywhere in the bundle, the result is
`rejected_evidence`.

## Accepted Auth Evidence

Redacted auth evidence is acceptable only if it can show, without revealing
secrets:

- proof auth is proof-specific
- proof auth is least-privilege
- proof auth is revocable, time-bounded, or explicitly proof-bound
- no normal `API_GATEWAY_SECRET` was used
- no `STREAM_EVENT_WEBHOOK_SECRET` was used
- no Redis credentials were used
- the auth path does not grant general Gateway product access

Examples of acceptable auth evidence categories:

- redacted auth decision code showing proof-only scope
- redacted scope classification showing non-product route or proof-only action
- redacted expiry or TTL classification
- redacted deny-path classification for non-proof API access
- redacted revocation or invalidation result class

Evidence is `insufficient_evidence` if it shows only:

- a narrative claim that auth is narrow
- docs-only intent with no runtime markers
- a success log with no scope classification
- a marker set with no indication of auth scope or auth decision class

Evidence is `rejected_evidence` if it reveals or implies:

- normal `API_GATEWAY_SECRET` usage as proof auth
- `STREAM_EVENT_WEBHOOK_SECRET` usage
- Redis-backed runner-owned auth
- a token, secret, or private URL
- general product API access from the proof auth

## Accepted Replay Evidence

Redacted replay evidence is acceptable only if it shows:

- nonce or equivalent one-time mechanism
- request ID or proof ID
- TTL or expiry classification
- duplicate detection
- fail-closed replay classification
- no productive side effect on repeated use

Examples of acceptable replay evidence categories:

- redacted first-use decision code
- redacted duplicate-attempt decision code
- redacted expired-attempt decision code
- redacted side-effect confirmation showing proof-only outcome
- redacted mismatch classification for altered provenance on replay

Evidence is `insufficient_evidence` if it lacks:

- a replay identifier class
- duplicate handling classification
- TTL or expiry class
- a secret-safe side-effect confirmation

Evidence is `rejected_evidence` if it:

- shows repeated attempts causing productive effects
- shows replay behavior without fail-closed handling
- includes raw replay keys, tokens, or secrets
- relies on local diagnostics as proof of target-runtime replay handling

## Accepted Provenance Evidence

Redacted provenance evidence is acceptable only if it shows:

- RC SHA
- runner provenance
- gateway provenance
- Railway project or environment classification without private details
- contract version or gate-contract hash
- timestamp or TTL classification
- explicit mismatch classification when provenance is wrong

Examples of acceptable provenance evidence categories:

- redacted same-RC comparison marker
- redacted runner service-class marker
- redacted gateway runtime marker
- redacted environment-class match or mismatch code
- redacted contract-hash comparison result

Evidence is `insufficient_evidence` if it contains:

- only a repo SHA with no runtime binding
- only a screenshot of docs
- only local shell output
- service or environment claims without runtime markers

Evidence is `rejected_evidence` if it:

- omits RC or runtime binding entirely
- includes private URLs or env dumps
- shows productive AI execution as provenance proof
- shows third-party writes as provenance proof

## Accepted Artifact Lifecycle Evidence

Redacted artifact lifecycle evidence is acceptable only if it shows all of
these classes:

- creation
- read or lookup
- validation
- classification
- disposal or expiry
- proof-only classification
- no productive AI Assistant, user, provider, or publication action

Examples of acceptable artifact evidence categories:

- redacted artifact-created classification
- redacted artifact-read classification
- redacted artifact-validated classification
- redacted artifact-consumed, disposed, or expired classification
- redacted side-effect confirmation showing no productive mutation

Evidence is `insufficient_evidence` if it shows:

- creation without disposal or expiry
- disposal claims without a proof-only classification
- artifact classes with no side-effect confirmation

Evidence is `rejected_evidence` if it shows:

- durable productive assistant state
- provider action or publication action
- customer-visible assistant history
- artifact reuse as standing authorization

## Explicitly Rejected Evidence

The following evidence categories are always `rejected_evidence`:

- screenshots or logs with secret values
- private URLs
- tokens
- Redis connection strings
- provider payloads
- real webhook secrets
- normal Gateway product secret usage as proof auth
- local diagnostics presented as Production-Gate proof
- docs-only assertions without target-runtime markers
- evidence without RC or runtime binding
- evidence with productive AI execution
- evidence with third-party write

## Minimal Evidence Bundle

The minimal later redacted evidence bundle must include:

- target environment
- RC SHA
- runner provenance
- gateway provenance
- contract version or gate-contract hash
- auth decision code
- replay decision code
- provenance decision code
- artifact lifecycle decision code
- secret-safety confirmation
- side-effect confirmation
- final decision:
  `accepted_evidence`, `insufficient_evidence`, `rejected_evidence`, or
  `operator_review_required`

This bundle is still `insufficient_evidence` if any field above is absent or if
the fields exist only as unbound narrative claims.

## Blocker And Warning Catalog

Hard blockers:

- any secret material in the bundle
- any private URL in the bundle
- any use of normal `API_GATEWAY_SECRET` as proof auth
- any use of `STREAM_EVENT_WEBHOOK_SECRET`
- any use of Redis credentials on `release-gate-runner`
- any productive AI execution
- any third-party write
- any missing RC or runtime binding
- any evidence that the proof path created productive downstream state

Warnings that still require operator review:

- partial marker coverage with plausible but incomplete provenance
- replay evidence that shows decision classes but no clear side-effect
  confirmation
- artifact disposal evidence that proves expiry but not single-use consumption
- auth evidence that proves scope but not revocation behavior

Warnings are never self-clearing. They remain
`operator_review_required` or `insufficient_evidence` until the missing runtime
proof is added.

## Operator Review Checklist For Thomas

Use this checklist for later evidence review:

- [ ] bundle is redacted and contains no secret values
- [ ] bundle contains no private URLs, tokens, Redis strings, or raw payloads
- [ ] target environment is stated
- [ ] RC SHA is stated and runtime-bound
- [ ] runner provenance is stated
- [ ] gateway provenance is stated
- [ ] environment classification is stated without private details
- [ ] contract version or gate-contract hash is stated
- [ ] auth decision code proves proof-specific least-privilege behavior
- [ ] auth evidence shows no use of normal `API_GATEWAY_SECRET`
- [ ] auth evidence shows no use of `STREAM_EVENT_WEBHOOK_SECRET`
- [ ] auth evidence shows no Redis credential dependency
- [ ] replay evidence shows nonce or equivalent one-time handling
- [ ] replay evidence shows request ID or proof ID
- [ ] replay evidence shows TTL or expiry classification
- [ ] replay evidence shows duplicate detection
- [ ] replay evidence confirms fail-closed handling
- [ ] provenance evidence shows same-RC or mismatch classification
- [ ] provenance evidence shows runner and gateway provenance classes
- [ ] artifact evidence shows creation, validation, and disposal or expiry
- [ ] artifact evidence confirms proof-only classification
- [ ] artifact evidence confirms no productive side effects
- [ ] final evidence decision is justified as `accepted_evidence`,
      `insufficient_evidence`, `rejected_evidence`, or
      `operator_review_required`
- [ ] review result does not imply Product-Gate opening
- [ ] review result does not imply Route-Mode change
- [ ] review result does not imply productive downstream activation

## Activation Boundaries

Even later `accepted_evidence` can only prepare a later operator gate.

It does not automatically:

- open Product Gate
- change Route Mode
- activate productive downstream
- approve production deployment
- convert docs-ready or contract-ready claims into runtime activation

## Still Blocked Activation Transitions

This review standard unblocks no activation transition.

Still blocked:

- Product Gate remains `closed`
- Route Mode remains `disabled`
- no productive AI Assistant runtime status exists
- no productive AI Assistant downstream exists
- Full Production-Gate remains blocked
- no secret-scope expansion to `release-gate-runner` is allowed

## Recommended Next Safe Slice

One safe follow-up slice remains:

- docs-only decision template for later operator review results against this
  evidence standard

That follow-up must still avoid:

- code changes
- runtime changes
- secret changes
- Product-Gate opening
- Route-Mode changes
- AI Assistant activation

`activation_not_allowed_now` remains in force.
