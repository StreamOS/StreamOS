# StreamOS Brand Asset Orphan-Cleanup Dry-Run Evidence

Date: 2026-06-27

Scope: read-only evidence review for the merged brand asset orphan-cleanup
dry-run from PR #157. This report does not authorize deletes, cleanup
execution, DB mutations, storage mutations, or fix mode behavior.

## Decision

`incomplete`

- The merged dry-run contract is locally validated and remains read-only.
- A real tenant-scoped execution was not performed because no explicit
  `--user-id` input was available for a safe audit run.
- `.env` and `.env.test` both contain the required Supabase variable names, but
  the target environment cannot be proven from this report without executing
  the script against a specific tenant scope.
- No mutation was executed.
- `Brand Asset Orphan-Cleanup Execution` remains blocked.

## Current Repo State

- current branch: `main`
- start `main` SHA: `42617f323c8e271a84e3ea1b2547606d51316889`
- `main == origin/main`: yes
- worktree at start: clean
- `pnpm branch:audit`:
  - total branches: `31`
  - `needs rename`: `7`
  - `temporary ops`: `8`

## Target Environment

`unknown`

Evidence in this report comes from:

- local validation of the merged dry-run script and tests
- secret-safe presence checks for `.env`, `.env.test`, and required variable
  names only

This report does not classify the target as `local`, `staging`, or
`production`, because no tenant-scoped dry-run execution was performed.

## Dry-Run Contract Reviewed

Script entrypoint:

- [scripts/branding-orphan-dry-run.cjs](../scripts/branding-orphan-dry-run.cjs)

Test entrypoint:

- [scripts/branding-orphan-dry-run.test.cjs](../scripts/branding-orphan-dry-run.test.cjs)

Package aliases:

- `pnpm branding:orphan-dry-run`
- `pnpm test:branding-orphan-dry-run`

Confirmed contract:

- read-only report only
- Supabase access stays `GET` only
- `brand_assets` is tenant-scoped via `user_id=eq.<userId>`
- `storage.objects` is bucket-/prefix-scoped via
  `bucket_id=eq.brand-assets` and `name=like.<userId>/%`
- report metadata includes:
  - `dryRun: true`
  - `mutationAllowed: false`
  - `nextExecutionSliceBlocked: true`

Confirmed non-goals:

- no storage `delete` / `remove`
- no DB `delete`
- no DB `update`
- no DB `upsert`
- no cleanup execution
- no fix mode
- no signed URL generation
- no production mutation

## Parameters Required For Safe Execution

The script requires:

- `--user-id <tenant-user-id>`
- Supabase URL from env or `--env-file`
- Supabase service-role key from env or `--env-file`
- optional `--target-environment`
- optional `--format text|json`

Secret-safe presence checks only:

- `.env`: present
- `.env.test`: present
- `.env` contains `SUPABASE_URL`: yes
- `.env` contains `SUPABASE_SERVICE_ROLE_KEY`: yes
- `.env.test` contains `SUPABASE_URL`: yes
- `.env.test` contains `SUPABASE_SERVICE_ROLE_KEY`: yes
- process env `SUPABASE_URL`: not present
- process env `SUPABASE_SERVICE_ROLE_KEY`: not present
- process env `BRANDING_ORPHAN_DRY_RUN_USER_ID`: not present

Blocking gap for execution:

- no explicit tenant-scoped `--user-id` was supplied or documented for this
  report

Because the script is intentionally tenant-scoped, this report does not invent
or discover a tenant id outside the dry-run contract.

## Commands Executed

Local checks:

- `git branch --show-current`
- `git rev-parse HEAD`
- `git rev-parse origin/main`
- `git status --short`
- `pnpm test:branding-orphan-dry-run`
- `pnpm branding:orphan-dry-run -- --help`
- `pnpm branch:audit`
- `git diff --check`

Secret-safe parameter checks:

- `.env` / `.env.test` presence
- required env-name presence only, without values
- process env presence only, without values

Not executed:

- `pnpm branding:orphan-dry-run -- ... --user-id <real-tenant-id>`

Reason:

- missing explicit tenant-scoped audit target

## Candidate Summary

Dry-run object classification counts:

- `referenced`: not executed
- `orphan_candidate`: not executed
- `out_of_scope`: not executed
- `unknown`: not executed

No candidate paths are reported because no tenant-scoped execution was
performed.

## Mutation Status

No storage or DB mutation was executed.

Explicitly not executed:

- no storage deletes
- no storage removes
- no DB deletes
- no DB updates
- no DB upserts
- no cleanup execution
- no fix mode
- no bucket/policy changes
- no migrations

## Warnings

- `pnpm branch:audit` still reports `7` accepted `needs rename` cases
- `pnpm branch:audit` still reports `8` `temporary ops` branches
- dry-run execution evidence is incomplete until a tenant-scoped `--user-id`
  is provided for a read-only run

## Final Recommendation

Decision for next slice:
`Brand Asset Orphan-Cleanup Execution` remains `blocked`

Recommended next step:

1. collect an explicit tenant-scoped audit target for a read-only dry-run
2. rerun `pnpm branding:orphan-dry-run` with that tenant scope and a secret-safe
   environment binding
3. only after tenant-scoped dry-run evidence exists, consider whether an
   `Orphan-Cleanup Execution Design Audit` is justified

An `Orphan-Cleanup Execution Design Audit` is not yet recommended from this
evidence set alone.
