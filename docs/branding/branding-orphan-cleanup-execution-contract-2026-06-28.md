# StreamOS Brand Asset Orphan-Cleanup Execution Contract

Date: 2026-06-28

Scope: executable contract checks for a future orphan-cleanup execution slice.
This document covers only candidate eligibility, guardrails, stale-evidence
validation, secret-safe reporting, and explicit non-implementation of delete
behavior.

## Decision

`prepared_but_blocked`

- The execution contract is now testable.
- The contract can evaluate a JSON dry-run report for later operator review.
- No storage delete path is implemented.
- Any attempted `--execute` run is hard-blocked as not implemented.
- A later execution slice still requires a separate operator gate.

## Implemented Contract Surface

Contract checker:

- [scripts/branding-orphan-execution-contract.cjs](../scripts/branding-orphan-execution-contract.cjs)

Tests:

- [scripts/branding-orphan-execution-contract.test.cjs](../scripts/branding-orphan-execution-contract.test.cjs)
- [scripts/branding-orphan-dry-run.test.cjs](../scripts/branding-orphan-dry-run.test.cjs)

Dry-run input contract:

- [scripts/branding-orphan-dry-run.cjs](../scripts/branding-orphan-dry-run.cjs)

The checker consumes a JSON dry-run report and validates:

- explicit `--user-id`
- explicit `--target-environment`
- explicit `--max-delete-limit`
- explicit `--max-evidence-age-minutes`
- fresh `generatedAt` evidence
- report bucket `brand-assets`
- exact `<user_id>/` scope prefix
- `targetEnvironment.source = explicit`
- strict `orphan_candidate` eligibility only

## Guardrails

Delete eligibility is blocked unless all required checks pass:

- candidate classification is exactly `orphan_candidate`
- bucket is exactly `brand-assets`
- tenant prefix remains locked
- recognized storage path shape is present
- evidence is fresh enough
- report scope matches the explicit CLI scope
- report environment matches the explicit CLI environment
- eligible count does not exceed `max-delete-limit`

Blocked classifications:

- `referenced`
- `unknown`
- `out_of_scope`
- wrong bucket
- cross-tenant or invalid prefix
- stale evidence
- contradictory summary counts

## Non-Implementation Guarantee

This slice does not implement:

- storage `.remove`
- REST `DELETE`
- DB `delete`
- DB `update`
- DB `upsert`
- fix mode
- live cleanup execution

`--execute` is reserved future syntax only. The current behavior is to fail
closed with `execution_not_implemented`.

## Report Behavior

The contract checker emits only secret-safe output:

- no signed URLs
- no private URLs
- no raw storage paths
- no tokens
- no env values

The checker reports:

- contract decision
- execution blocked state
- evidence age
- eligible candidate count
- blocked candidate count
- failure codes
- redacted candidate paths only

## Recommended Next Slice

The next justified slice is:

1. `Brand Asset Orphan-Cleanup Execution Gate`

That slice would still need to stay non-destructive unless it separately
introduces:

- operator confirmation
- manifest handling
- explicit runtime governance
- audited failure handling
- approved destructive-path review

Until then, `Brand Asset Orphan-Cleanup Execution` remains blocked.
