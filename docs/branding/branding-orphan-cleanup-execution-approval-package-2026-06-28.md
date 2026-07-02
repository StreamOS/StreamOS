# StreamOS Brand Asset Orphan-Cleanup Execution Approval Package

Date: 2026-06-28
Branch: `docs/branding-orphan-cleanup-execution-approval-package`
Decision: `not_approved`

## Zweck

This document packages the minimum operator evidence and decision criteria that
would be required before any later, separate
`Brand Asset Orphan-Cleanup Execution` slice could be considered.

This package does not authorize execution by itself.

## Nicht-Ziele

This slice does not implement or allow:

- storage deletes
- storage removes
- DB deletes
- DB updates
- DB upserts
- a live CLI `--execute` path
- production execution
- bucket or policy changes
- migrations
- UI delete controls

Execution remains blocked after this approval package.

## Aktueller Main-SHA

- current `main` SHA: `0aa99975ef2010892b40b28d4a1317812d929114`
- `main == origin/main`: yes
- worktree at slice start: clean

## Zielumgebung

Current evidence baseline that may be referenced safely:

- target environment from prior production-bound evidence: `production`
- target environment source from prior evidence: `explicit`

This document does not approve any environment for execution. It only records
what a later operator package must prove explicitly.

## Redaktierter User-Kontext

Current approval state:

- explicit tenant-scoped operator package user: `not supplied`
- redacted user context in this document: `not executed`

No raw tenant identifiers, tokens, or tenant-specific private URLs are
recorded here.

## Required Evidence

Any later execution consideration must supply all of the following:

- current `main` SHA
- explicit `--target-environment`
- explicit `--user-id`
- fresh tenant-scoped dry-run JSON report
- fresh final-preflight result
- matching SHA bindings across report, preflight, and approval context
- operator decision timestamp
- approval validity window
- candidate summary with redacted paths only

Evidence that is stale, contradictory, unbound, or secret-bearing is invalid.

## Required Dry-Run

The required dry-run input must come from the existing read-only dry-run chain:

- [scripts/branding-orphan-dry-run.cjs](../scripts/branding-orphan-dry-run.cjs)
- [scripts/branding-orphan-dry-run.test.cjs](../scripts/branding-orphan-dry-run.test.cjs)

The later approval package must not accept a dry-run unless all of the
following are true:

- `--user-id` is explicit
- `--target-environment` is explicit
- bucket is exactly `brand-assets`
- prefix is exactly `<user_id>/`
- output is redacted and secret-safe
- evidence freshness window is still valid

## Required Final Preflight

The later approval package must require a fresh successful final preflight from
the non-destructive preflight chain:

- [scripts/branding-orphan-final-preflight.cjs](../scripts/branding-orphan-final-preflight.cjs)
- [docs/branding/branding-orphan-cleanup-final-preflight-2026-06-28.md](./branding-orphan-cleanup-final-preflight-2026-06-28.md)

The preflight must remain:

- read-only
- fail-closed
- SHA-bound
- environment-bound
- user-bound
- secret-safe

## Required Contract / Gate Status

The later approval package must verify that all previous contract layers remain
valid and consistent:

- execution contract exists and remains blocked for real execution
- final preflight exists and remains non-destructive
- operator approval is explicit, not inferred
- any `--execute` behavior remains not implemented or blocked

Relevant artifacts:

- [scripts/branding-orphan-execution-contract.cjs](../scripts/branding-orphan-execution-contract.cjs)
- [docs/branding/branding-orphan-cleanup-execution-contract-2026-06-28.md](./branding-orphan-cleanup-execution-contract-2026-06-28.md)
- [docs/branding/branding-orphan-cleanup-execution-implementation-plan-2026-06-28.md](./branding-orphan-cleanup-execution-implementation-plan-2026-06-28.md)
- [docs/branding/branding-orphan-cleanup-execution-design-audit-2026-06-28.md](./branding-orphan-cleanup-execution-design-audit-2026-06-28.md)

## Candidate Summary

Latest production-bound tenant-scoped evidence available in `main` reported:

- `referenced`: `0`
- `orphan_candidate`: `0`
- `out_of_scope`: `0`
- `unknown`: `0`
- `total_objects`: `0`

Implication:

- there is currently no acute cleanup pressure
- there is currently no demonstrated delete-safe candidate set
- a later execution slice is only sensible if new candidates appear or if an
  explicit proof scenario is intentionally requested

## Hard Blockers

The approval package must hard-block any later execution consideration if any
of the following applies:

- no explicit operator decision
- no current `main` SHA binding
- no explicit `--target-environment`
- no explicit `--user-id`
- no fresh dry-run
- no fresh successful final preflight
- SHA mismatch
- target-environment mismatch
- user-context mismatch
- bucket mismatch
- prefix mismatch
- candidate count above `max-delete-limit`
- any `referenced` candidate
- any `unknown` candidate
- any `out_of_scope` candidate
- any secret, token, private URL, or signed URL leak in reports

## Operator Approval Checklist

The later operator must verify all of the following explicitly:

- `main` SHA checked
- worktree clean
- target environment checked
- user context checked in redacted form
- dry-run is fresh
- final preflight is fresh
- candidate count checked
- `max-delete-limit` checked
- no `unknown`
- no `referenced`
- no `out_of_scope`
- no secret leaks
- recovery limits accepted
- decision made consciously

## Secret-Safety Checklist

All later approval evidence must satisfy:

- no secrets
- no tokens
- no env values
- no private URLs
- no signed URLs
- no unredacted sensitive storage URLs
- no unredacted cross-tenant paths

Any violation blocks approval immediately.

## Recovery- / Rollback-Hinweise

Recovery limits that the operator must accept explicitly:

- storage deletes are not transactional with the DB reads used for evidence
- code rollback does not restore deleted objects
- recovery depends on provider capability, storage backup retention, or
  external operator procedures
- partial failure can leave mixed state even when the code path is correct

Because of these limits, any future delete-capable slice remains a separate
operator-controlled risk decision.

## Ablaufdatum / Gueltigkeitsfenster

This document itself is a governance baseline and does not approve execution.

Any future operator approval package must include:

- explicit approval timestamp
- explicit approval max-age window
- explicit dry-run evidence age window
- explicit SHA binding to the reviewed repo state

If any of those windows expires, the package is no longer valid and the
decision reverts to blocked or not approved.

## Aktuelle Entscheidung

`not_approved`

Reason:

- no explicit operator is recorded here
- no fresh tenant-scoped dry-run JSON input is attached here
- no fresh final-preflight run is attached here
- latest known production-bound evidence had `0` candidates
- therefore there is no justified basis for future execution approval at this
  time

## Schlussfolgerung

This approval package:

- implements no deletes
- grants no execution
- serves only as a prerequisite template for a later separate execution slice

`Brand Asset Orphan-Cleanup Execution` remains blocked.

If a later proof is needed, the next sensible slice is:

`Brand Asset Orphan-Cleanup Execution No-Op Proof`

That slice should still remain non-destructive unless a later explicit
destructive approval is authorized separately.
