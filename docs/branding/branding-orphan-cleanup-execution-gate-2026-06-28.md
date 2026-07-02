# Brand Asset Orphan-Cleanup Execution Gate

Date: 2026-06-28
Branch: `feat/branding-orphan-cleanup-execution-gate`
Decision: `passed_with_warnings`

## Purpose

This slice defines a fail-closed execution gate for a later, separate `Brand Asset Orphan-Cleanup Execution` slice.

This slice does not implement, enable, or approve cleanup execution.

The gate remains read-only:

- no Storage deletes
- no DB deletes
- no DB updates
- no DB upserts
- no cleanup fix mode
- no production execution
- `--execute` remains `not implemented`

## Gate Contract

The gate checker validates only operator intent and prior evidence.

Required bindings:

- explicit operator decision
- explicit target environment
- explicit tenant `user_id`
- fresh dry-run evidence within a bounded time window
- exact `report_sha` and `current_sha` binding
- approval binding to SHA, environment, tenant context, dry-run evidence, and approval age
- exact bucket `brand-assets`
- exact tenant prefix `<user_id>/`
- candidate count at or below `max-delete-limit`

All candidates must remain `orphan_candidate`.

Any `referenced`, `unknown`, `out_of_scope`, wrong-bucket, cross-tenant, stale, or contradictory evidence blocks the gate.

## Gate States

- `not_requested`
- `blocked`
- `ready_for_operator_review`
- `approved_for_future_execution`
- `expired`
- `invalid`

No state in this slice authorizes real execution. Even `approved_for_future_execution` is only a bound approval artifact for a later, separate execution slice.

## Current Evidence Baseline

The latest production-bound tenant-scoped dry-run evidence documented on 2026-06-27 reported:

- `referenced`: `0`
- `orphan_candidate`: `0`
- `out_of_scope`: `0`
- `unknown`: `0`
- `total_objects`: `0`

That evidence is safe to reference for gate design, but it does not release cleanup execution.

## Approval Rules

Approval is never inferred from green tests alone.

Approval requires an explicit operator decision and remains valid only while all of the following still match:

- repo SHA
- target environment
- tenant context
- dry-run report binding
- approval freshness window

Expired or mismatched approval fails closed.

## Security Notes

- No secrets, tokens, private URLs, signed URLs, or env values are recorded in gate output.
- The gate checker emits decision-only evidence.
- The checker does not call delete, remove, update, or upsert operations.
- Tenant isolation stays strict through exact prefix validation and fail-closed candidate classification.

## Next Slice

After this gate contract is merged, a separate `Brand Asset Orphan-Cleanup Execution Implementation Plan` slice is sensible.

That next slice must remain design/governance scoped unless and until a later operator-approved execution slice is explicitly authorized.
