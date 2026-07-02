# StreamOS Brand Asset Orphan-Cleanup Execution Implementation Plan

Date: 2026-06-28
Branch: `docs/branding-orphan-cleanup-execution-implementation-plan`
Decision: `planned_but_blocked`

## Ausgangslage

This slice documents a technical implementation plan for a possible future
`Brand Asset Orphan-Cleanup Execution` path.

Current repo baseline:

- current `main` SHA at slice start: `8f32e647d2cd932e97d78e59078d68fff17dfdee`
- `main == origin/main`: yes
- worktree at slice start: clean
- post-merge branch audit baseline:
  - total branches: `31`
  - `needs rename`: `7`
  - `temporary ops`: `8`

Existing orphan-cleanup chain already merged:

- read-only dry-run:
  [scripts/branding-orphan-dry-run.cjs](../scripts/branding-orphan-dry-run.cjs)
- dry-run tests:
  [scripts/branding-orphan-dry-run.test.cjs](../scripts/branding-orphan-dry-run.test.cjs)
- execution contract:
  [scripts/branding-orphan-execution-contract.cjs](../scripts/branding-orphan-execution-contract.cjs)
- execution contract tests:
  [scripts/branding-orphan-execution-contract.test.cjs](../scripts/branding-orphan-execution-contract.test.cjs)
- execution gate:
  [scripts/branding-orphan-execution-gate.cjs](../scripts/branding-orphan-execution-gate.cjs)
- execution gate tests:
  [scripts/branding-orphan-execution-gate.test.cjs](../scripts/branding-orphan-execution-gate.test.cjs)
- prior design audit:
  [docs/branding/branding-orphan-cleanup-execution-design-audit-2026-06-28.md](./branding-orphan-cleanup-execution-design-audit-2026-06-28.md)
- prior contract report:
  [docs/branding/branding-orphan-cleanup-execution-contract-2026-06-28.md](./branding-orphan-cleanup-execution-contract-2026-06-28.md)
- prior gate report:
  [docs/branding/branding-orphan-cleanup-execution-gate-2026-06-28.md](./branding-orphan-cleanup-execution-gate-2026-06-28.md)
- production-bound read-only evidence:
  [docs/branding/branding-orphan-environment-binding-evidence-2026-06-27.md](./branding-orphan-environment-binding-evidence-2026-06-27.md)

Current evidence baseline remains conservative:

- `referenced`: `0`
- `orphan_candidate`: `0`
- `out_of_scope`: `0`
- `unknown`: `0`
- `total_objects`: `0`

This means the repo has enough evidence to design a future execution path, but
not enough justification to authorize one.

## Nicht-Ziele

This slice does not permit:

- storage deletes
- storage removes
- DB deletes
- DB updates
- DB upserts
- Supabase migrations
- bucket or policy changes
- UI delete controls
- server action execution surfaces
- a live CLI `--execute` path
- production execution
- automatic execution approval

Execution remains blocked after this plan.

## Voraussetzungen fuer spaetere Execution

A later implementation is only allowed when all of the following already exist
and agree with each other:

- explicit `--user-id`
- explicit `--target-environment`
- fresh dry-run evidence
- SHA-bound dry-run evidence
- explicit operator approval
- non-expired operator approval
- exact candidate list from the immediately previous dry-run
- exact bucket binding to `brand-assets`
- exact prefix binding to `<user_id>/`
- candidate count at or below `max-delete-limit`
- zero `referenced` objects
- zero `unknown` objects
- zero `out_of_scope` objects

The later implementation must remain fail-closed whenever any prerequisite is
missing, stale, contradictory, or ambiguous.

## Required Inputs

A future execution-capable entrypoint should require these explicit inputs:

- `--report-file`
- `--report-sha`
- `--current-sha`
- `--user-id`
- `--target-environment`
- `--max-delete-limit`
- `--max-evidence-age-minutes`
- `--operator-decision`
- `--approval-sha`
- `--approval-user-id`
- `--approval-target-environment`
- `--approved-at`
- `--approval-max-age-minutes`
- non-default `--execute`

Required input semantics:

- `--user-id` must scope exactly one tenant
- `--target-environment` must be explicit, never inferred at execution time
- `--report-sha` and `--current-sha` must match exactly
- approval fields must bind to the same SHA, environment, and user context
- `--execute` must never be the default mode

## Execution Flow

This section describes a future execution flow conceptually only. It is not an
implementation.

Recommended future flow:

1. Load approved gate input.
2. Parse and validate the approved dry-run report.
3. Verify the dry-run report is fresh enough and SHA-bound to the current repo
   state.
4. Verify the explicit tenant scope and target environment again.
5. Re-run or verify a fresh dry-run immediately before any delete attempt.
6. Re-check `brand_assets` references immediately before delete.
7. Re-check bucket and prefix for every candidate.
8. Re-apply `max-delete-limit`.
9. Delete only candidates that remain eligible at the final preflight moment.
10. Record per-object result.
11. Stop safely on partial failure or evidence drift.
12. Emit a secret-safe execution report.

No later implementation should skip the immediate pre-delete re-checks, even
if a gate report was approved shortly before.

## Guardrails

The later implementation must enforce these guardrails before the first delete:

- explicit tenant scope only
- explicit target environment only
- single bucket allowlist: `brand-assets`
- single prefix allowlist: `<user_id>/`
- fresh evidence only
- exact SHA binding only
- exact operator-approval binding only
- exact candidate manifest only
- exact count check against `max-delete-limit`
- no wildcard delete
- no bucket-wide delete
- no cross-tenant scan
- no implicit environment fallback
- no secret-bearing output
- no signed URLs
- no private URLs

Any guardrail violation must return `blocked` or `failed`, not warnings-only.

## Operator-Gate

The existing gate contract is a prerequisite, not a release.

The future operator gate must remain mandatory because cleanup deletes are
destructive and non-transactional relative to the reads used to classify
candidates.

Future operator approval should bind to:

- repo SHA
- target environment
- tenant scope
- dry-run report identity
- approval timestamp
- approval expiry window
- candidate count
- candidate manifest identity

Operator review should explicitly acknowledge:

- destructive storage action
- non-transactional nature of delete versus DB reads
- recovery limits
- tenant scope
- environment scope
- exact candidate count

## Candidate Eligibility

An execution candidate is eligible only if all of the following are true at the
final preflight point:

- classification is exactly `orphan_candidate`
- bucket is exactly `brand-assets`
- path remains under exact prefix `<user_id>/`
- path contract remains recognized
- candidate still appears in the approved candidate list
- candidate still matches the immediately previous dry-run evidence
- current `brand_assets` reads show no active reference
- target environment still matches
- SHA binding still matches
- approval binding still matches

Hard blockers:

- missing user ID
- missing target environment
- missing operator approval
- stale dry-run evidence
- SHA mismatch
- target environment mismatch
- user ID mismatch
- bucket mismatch
- prefix mismatch
- candidate count over limit
- any `referenced` candidate
- any `unknown` candidate
- any `out_of_scope` candidate
- any secret-bearing, signed-URL, or private-URL report content

## Delete Strategy

The future implementation should delete only a deterministic candidate set that
has passed final preflight.

Recommended strategy:

- build or consume an approved candidate manifest from the immediately previous
  dry-run
- verify manifest entries one final time before delete
- delete candidates one object at a time or in tightly controlled batches
- record per-object success or failure
- stop when confidence in manifest integrity is lost

Recommended non-goals:

- no opportunistic discovery during delete
- no best-effort delete of ambiguous objects
- no auto-repair of path drift
- no cross-tenant cleanup pass

## Failure Handling

The later implementation should fail safely in these cases:

- dry-run report cannot be loaded
- report shape is invalid
- evidence is stale
- SHA binding mismatches
- target environment mismatches
- user scope mismatches
- candidate set exceeds limit
- candidate becomes referenced again
- candidate bucket changes
- prefix validation fails
- delete returns partial failure
- report output cannot be written safely

Recommended behavior:

- stop before any delete if preconditions fail
- stop further deletes when evidence confidence is lost
- preserve already captured per-object results
- emit an honest secret-safe failure report
- never report success when any delete result is unknown

## Audit Logging / Evidence Output

The future execution slice should emit secret-safe evidence only.

Recommended report fields:

- timestamp
- actor or operator identity class
- target environment
- redacted user context
- report SHA
- current SHA
- approval timestamp
- requested delete count
- attempted delete count
- succeeded delete count
- failed delete count
- per-object redacted outcome
- terminal decision

Report rules:

- no secrets
- no tokens
- no env values
- no signed URLs
- no private URLs
- no unredacted cross-tenant paths

## Recovery- und Rollback-Grenzen

Hard constraints that the future implementation must document explicitly:

- storage deletes are not transactional with DB reads
- code rollback does not restore deleted storage objects
- recovery depends on provider capability, backup retention, or operator
  recovery procedures outside the code path
- partial delete outcomes may leave mixed state that code alone cannot undo

Governance implication:

- real execution is not a routine app mutation
- real execution needs a separate operator-controlled slice
- production execution, if ever attempted, must be treated as controlled proof
  work, not as generic feature release

## Testplan

This slice adds no code tests. It defines the minimum later test plan.

Future unit tests should cover:

- missing `--user-id` blocks
- missing `--target-environment` blocks
- missing approval blocks
- stale evidence blocks
- SHA mismatch blocks
- target environment mismatch blocks
- user mismatch blocks
- bucket mismatch blocks
- prefix mismatch blocks
- `referenced` candidate blocks
- `unknown` candidate blocks
- `out_of_scope` candidate blocks
- count over `max-delete-limit` blocks
- zero-candidate state remains safe
- secret-safe report output

Future integration tests should cover:

- final preflight without deletes
- candidate becomes referenced between dry-run and execution
- partial delete failure handling
- per-object result capture
- stop-on-drift behavior
- no mutation without explicit `--execute`

## PR-Schnitt fuer spaetere Implementierung

The later implementation should be split into small PRs:

1. PR A: `Brand Asset Orphan-Cleanup Final Preflight`
   - final preflight only
   - re-check fresh dry-run
   - re-check DB references
   - no deletes
   - no production execution

2. PR B: gated execution behind explicit non-default `--execute`
   - still operator-gated
   - still environment-bound
   - still tenant-scoped
   - still not approved for production by default

3. PR C: controlled one-tenant proof, only if still required
   - operator-run
   - environment-specific
   - explicit evidence capture
   - explicit recovery expectations

This plan intentionally keeps destructive capability out of the first future
implementation PR.

## Release- / Production-Gate-Hinweise

A future execution slice should not use ordinary green CI as sufficient proof.

Production-adjacent requirements should include:

- explicit operator approval
- explicit environment binding
- final preflight evidence
- bounded tenant scope
- bounded candidate count
- explicit recovery acknowledgement
- explicit secret-safe evidence output

No future PR should phrase execution as automatically released because:

- current production-bound dry-run evidence had `0` candidates
- existing evidence proves only read-only scoping and gate discipline
- destructive execution remains a separate operational risk class

## Wichtigste Plan-Entscheidungen

- Execution remains blocked after this plan.
- The first justified implementation step is a final preflight slice, not a
  delete slice.
- A later delete-capable path must consume fresh, SHA-bound, tenant-scoped,
  environment-bound, operator-approved evidence.
- Any ambiguity or drift must fail closed.
- Recovery limits must stay explicit because deleted storage objects are not
  restored by code rollback.

## Schlussfolgerung

`Brand Asset Orphan-Cleanup Execution Implementation Plan` is justified now as
documentation only.

The next sensible slice after this plan is:

`Brand Asset Orphan-Cleanup Final Preflight`

That next slice should still remain non-destructive and must not implement real
cleanup execution yet.
