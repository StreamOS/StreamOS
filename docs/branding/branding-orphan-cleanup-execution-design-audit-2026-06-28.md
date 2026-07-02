# StreamOS Brand Asset Orphan-Cleanup Execution Design Audit

Date: 2026-06-28

Scope: design and governance audit for a possible future brand asset orphan
cleanup execution slice. This document does not authorize or implement storage
deletes, DB mutations, cleanup execution, fix mode behavior, API delete
surfaces, UI delete controls, or any production action.

## Decision

`blocked`

- The current repo contains read-only orphan evidence only.
- The latest tenant-scoped production-bound dry-run reported zero candidates.
- Storage deletes would be non-transactional relative to the DB reads used for
  candidate classification.
- Recovery after a real storage delete would depend on provider backup or
  operator recovery capability, not on an application rollback.
- A later execution slice is only acceptable behind a separate operator-gated
  execution contract.

## Ausgangslage

Current baseline:

- current branch at slice start: `docs/branding-orphan-cleanup-execution-design-audit`
- start `main` SHA: `fef1604e6452ad04654433b34d4a29a4d7340605`
- `main == origin/main`: yes before this docs branch
- worktree at slice start: clean
- current orphan evidence report in `main`:
  [docs/branding/branding-orphan-environment-binding-evidence-2026-06-27.md](./branding-orphan-environment-binding-evidence-2026-06-27.md)

Relevant repo sources reviewed:

- [scripts/branding-orphan-dry-run.cjs](../scripts/branding-orphan-dry-run.cjs)
- [scripts/branding-orphan-dry-run.test.cjs](../scripts/branding-orphan-dry-run.test.cjs)
- [apps/web/src/app/dashboard/branding/storage.ts](../apps/web/src/app/dashboard/branding/storage.ts)
- [apps/web/src/app/dashboard/branding/actions.ts](../apps/web/src/app/dashboard/branding/actions.ts)
- [apps/web/src/app/dashboard/branding/preview.ts](../apps/web/src/app/dashboard/branding/preview.ts)
- [apps/web/src/app/dashboard/branding/data.ts](../apps/web/src/app/dashboard/branding/data.ts)
- [docs/branding/p5-branding-closeout.md](./p5-branding-closeout.md)
- [docs/deployment.md](../docs/deployment.md)

## Bisherige Evidence

Latest read-only evidence status:

- target environment: `production`
- target environment source: `explicit`
- tenant context: explicit `--user-id`, redacted in report
- dry-run contract:
  - `brand_assets` read via `GET /rest/v1/brand_assets`
  - storage listing via `POST /storage/v1/object/list/brand-assets`
  - tenant prefix restricted to `<user_id>/`
  - report stays redacted and read-only

Latest tenant-scoped result:

- `referenced`: `0`
- `orphan_candidate`: `0`
- `out_of_scope`: `0`
- `unknown`: `0`
- `total_objects`: `0`

Interpretation:

- there is no current evidence for a safe real delete candidate
- the dry-run proves only that the current read path is tenant-scoped and
  environment-bound
- the dry-run does not prove that a future execution path is safe

## Warum Execution Weiterhin Blockiert Ist

Execution remains blocked for structural reasons:

- the current orphan tooling classifies candidates from two separate read paths,
  but does not produce an execution-grade immutable manifest
- the repo has no operator confirmation contract for destructive storage work
- storage delete would not be atomic with the `brand_assets` reference read
- a candidate can change state between dry-run and delete
- the current evidence contains zero candidates, so there is no live proof that
  a later execution filter chain behaves correctly on delete-safe objects
- no recovery contract exists yet for partial delete failure or mistaken delete

Additional repo-context blocker:

- existing branding actions already use `storage.remove()` only as a narrow
  upload rollback for failed DB insert in
  [apps/web/src/app/dashboard/branding/actions.ts](../apps/web/src/app/dashboard/branding/actions.ts)
- that rollback path is coupled to a fresh upload failure and is not a valid
  precedent for retrospective orphan cleanup

## Vorgeschlagener Execution Contract

A future execution slice should use a distinct execution contract, not extend
the current read-only script implicitly.

Recommended high-level contract:

1. A read-only dry-run is executed immediately before any delete attempt.
2. The dry-run emits an execution-grade manifest or equivalent deterministic
   candidate snapshot.
3. A separate operator-only execution command consumes that fresh manifest.
4. The execution command deletes only the manifest-approved candidates and
   produces a redacted audit report.
5. Execution fails closed on any mismatch, missing evidence, ambiguity, or
   cross-tenant condition.

Recommended future operator surface:

- separate `--execute` style flag or equivalent explicit operator switch
- mandatory explicit `--target-environment`
- mandatory explicit `--user-id`
- explicit bucket allowlist
- explicit max-delete-limit
- explicit operator confirmation step

This report does not authorize implementing any of the above yet.

## Harte Safety Gates

Any future execution must be blocked unless all of the following are true:

- target environment is explicit and not inferred as `unknown`
- `--user-id` is explicit
- bucket is exactly `brand-assets`
- every candidate path is under the exact `<user_id>/` prefix
- the immediately preceding dry-run classified the object as
  `orphan_candidate`
- the object is not currently referenced by `brand_assets.storage_path`
- the object is not classified as `referenced`
- the object is not classified as `unknown`
- the object is not classified as `out_of_scope`
- the dry-run evidence is fresh enough for a short operator window
- the dry-run and execution agree on bucket, tenant, and target environment
- the candidate count is non-zero and within `max-delete-limit`
- branch, worktree, and runtime context are unambiguous
- operator confirmation is present

Any ambiguity must fail closed to `blocked`.

## Tenant-Isolation

Tenant isolation must stay stronger than the current read-only contract.

Required invariants:

- execution may inspect and act on only one explicit tenant at a time
- bucket scope must remain fixed to `brand-assets`
- path scope must remain fixed to `<user_id>/`
- no global bucket traversal
- no wildcard delete outside the exact candidate list
- no cross-tenant path repair, normalization, or fallback behavior

Observed repo evidence supporting this requirement:

- storage paths are constructed as `<user_id>/<asset_type>/<asset_id>/<file>`
  or `<user_id>/<asset_type>/<asset_id>/replacements/<replacement_id>-<file>`
  in [apps/web/src/app/dashboard/branding/storage.ts](../apps/web/src/app/dashboard/branding/storage.ts)
- preview signing rejects non-tenant-scoped paths in
  [apps/web/src/app/dashboard/branding/preview.ts](../apps/web/src/app/dashboard/branding/preview.ts)
- dry-run redacts invalid and out-of-scope paths instead of trusting them in
  [scripts/branding-orphan-dry-run.cjs](../scripts/branding-orphan-dry-run.cjs)

## Candidate Eligibility

A future execution candidate should be eligible only when all conditions below
are true:

- bucket equals `brand-assets`
- path is valid and tenant-scoped under the explicit `<user_id>/` prefix
- path shape matches the recognized branding asset contract
- path was classified in the immediately previous dry-run as
  `orphan_candidate`
- the current `brand_assets` read shows no live `storage_path` reference to the
  same object
- the candidate does not appear in `referenceFindings`
- the candidate is not `unknown`
- the candidate is not `out_of_scope`
- the candidate is not `referenced`
- the target environment is explicit and matches the execution context
- the dry-run evidence age is within a strict freshness window
- the candidate count does not exceed the configured delete limit

Recommended additional future requirement:

- execution should use a dry-run candidate manifest keyed by redacted candidate
  IDs plus exact raw storage paths in memory or protected operator context,
  rather than re-discovering candidates loosely during delete time

## Delete Guardrails

Recommended delete guardrails:

- dry-run-before-execute is mandatory
- execution mode is separate and opt-in
- default `max-delete-limit` should be small
- zero tolerance for `unknown`
- zero tolerance for `out_of_scope`
- zero tolerance for cross-tenant path ambiguity
- zero tolerance for stale or contradictory evidence
- no delete if target environment is missing or conflicts with evidence
- no delete if `--user-id` is missing
- no delete if branch/worktree/env state is ambiguous in operator workflow
- no signed URLs in delete reports
- no private URLs in delete reports
- no secret values in logs or reports

Recommended non-goal:

- do not allow execution to infer or auto-fix bucket, user, environment, or
  path drift

## Operator-Gate

Execution needs an explicit operator gate because the destructive step cannot be
reversed by code alone.

Recommended operator gate elements:

- explicit acknowledgment of target environment
- explicit acknowledgment of tenant scope
- explicit acknowledgment of candidate count
- explicit acknowledgment of non-transactional storage delete risk
- explicit acknowledgment that recovery depends on backups/provider capability
- explicit review of fresh dry-run evidence before execution

Recommended governance rule:

- a future execution contract should be reviewed and approved as a separate
  slice before any delete-capable implementation starts

## Observability / Audit Logging

A future execution slice should produce secret-safe operator evidence.

Recommended logging/reporting fields:

- timestamp
- operator identity or execution actor
- target environment
- redacted tenant context
- dry-run manifest identifier or evidence timestamp
- requested delete count
- attempted delete count
- succeeded delete count
- failed delete count
- per-candidate redacted outcome
- terminal decision: `passed`, `passed_with_warnings`, `blocked`, or `failed`

Log safety rules:

- no signed URLs
- no private hosts
- no service-role values
- no raw tokens
- no unredacted cross-tenant paths in user-facing reports

## Failure Handling

The future execution design must fail closed for these cases:

- storage list fails
- DB read fails
- target environment is missing or conflicting
- user context is missing or conflicting
- candidate disappears between dry-run and execution
- candidate becomes referenced again between dry-run and execution
- delete partially succeeds
- rate limit or Supabase API failure occurs
- network error interrupts execution
- report writing fails

Recommended failure semantics:

- stop before any delete when preconditions fail
- stop further deletes when the runtime loses confidence in evidence integrity
- report partial completion honestly
- never claim cleanup success from a partial delete set without explicit warning

## Recovery-/Rollback-Grenzen

Hard limits that must stay explicit:

- storage deletes are not transactional with DB reads
- the current app contract does not provide a reversible delete journal
- there is no simple code rollback after a real storage delete
- recovery depends on backup retention, provider recovery capability, and
  operator processes outside the app code

Governance implication:

- destructive orphan cleanup is not a normal app mutation
- it requires a dedicated operator-controlled recovery model

## Teststrategie

No tests are added in this slice. A later execution contract should be required
to add tests at least for:

- delete-safe candidate can be selected only when all gates pass
- referenced object is never deleted
- `unknown` object is never deleted
- `out_of_scope` object is never deleted
- cross-tenant path is never deleted
- stale dry-run evidence blocks execution
- missing target environment blocks execution
- missing `--user-id` blocks execution
- `max-delete-limit` blocks oversized delete sets
- partial delete failure is reported correctly
- logs and reports remain secret-safe

Recommended future validation shape:

- unit tests for eligibility and guardrails
- integration tests with mocked storage delete outcomes
- failure-path tests for stale evidence and cross-tenant drift
- report redaction tests

## Nicht-Ziele

This slice does not permit:

- storage delete implementation
- DB delete, update, or upsert implementation
- execution mode implementation
- fix mode implementation
- delete API creation
- server action for cleanup execution
- UI cleanup controls
- bucket or policy changes
- migration changes
- production execution

## Empfohlene Naechste Slices

1. `Brand Asset Orphan-Cleanup Execution Contract`
   Define the machine-readable manifest, operator confirmation model,
   freshness window, and exact failure semantics without performing deletes.
2. `Brand Asset Orphan-Cleanup Execution Test Design`
   Define the minimal unit/integration test matrix for a future delete-capable
   implementation.
3. `Brand Asset Orphan-Cleanup Operator Runbook`
   Define approval, evidence capture, rollback expectations, and incident
   handling for destructive cleanup.

## Schlussentscheidung

`Brand Asset Orphan-Cleanup Execution Design Audit: blocked`

The repo now has sufficient read-only evidence to justify designing a future
execution contract, but not to authorize execution itself. A separate
`Brand Asset Orphan-Cleanup Execution Contract` slice is justified next.
Delete-capable code remains blocked until that contract, operator gate, test
strategy, and recovery limits are specified and approved.
