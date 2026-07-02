# StreamOS Tenant-Scoped Brand Asset Orphan Dry-Run Evidence

Date: 2026-06-27

Scope: tenant-scoped evidence attempt for the merged brand asset orphan-cleanup
dry-run. This report does not authorize deletes, cleanup execution, DB
mutations, storage mutations, fix mode behavior, or any execution slice.

## Decision

`incomplete`

- The merged dry-run contract is locally validated and remains read-only.
- A real tenant-scoped execution was completed with an explicit `--user-id`.
- The original blocker was a wrong read path: the tool queried
  `/rest/v1/storage.objects`, while the hosted environment only served the
  prefix-scoped metadata listing through Supabase Storage API
  `/storage/v1/object/list/{bucket}`.
- The storage metadata read path is now corrected and remains tenant-scoped and
  read-only.
- The environment classification for this run remains `unknown`, because the
  configured Supabase host and env naming do not independently prove
  `local`, `staging`, or `production`.
- No mutation was executed.
- `Brand Asset Orphan-Cleanup Execution` remains blocked.

## Current Repo State

- current branch: `fix/branding-orphan-storage-read-path`
- start `main` SHA: `37e020a1028210c3f46d0ce1d8a4d63345f07f2b`
- end `main` SHA: `37e020a1028210c3f46d0ce1d8a4d63345f07f2b`
- `main == origin/main`: yes
- worktree at start: clean
- `pnpm branch:audit`:
  - total branches: `33`
  - `needs rename`: `7`
  - `temporary ops`: `8`

## Target Environment

`unknown`

Evidence in this report comes from:

- local validation of the merged dry-run script and tests
- a tenant-scoped read-only execution attempt with an explicit operator-supplied
  `--user-id`
- secret-safe follow-up checks for `.env`, `.env.test`, and endpoint status
  codes only

This report does not classify the target as `local`, `staging`, or
`production`, because the tenant-scoped evidence run completed but the target
environment could still not be proven from the configured env naming/host
signals alone.

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

## Tenant Context Requirement

The script requires an explicit:

- `--user-id <tenant-user-id>`

Provided tenant context for this run:

- explicit `--user-id`: yes
- redacted tenant identifier: `0fb812cd-...-5d5e`

Secret-safe presence checks:

- process env `BRANDING_ORPHAN_DRY_RUN_USER_ID`: not present
- process env `SUPABASE_URL`: not present
- process env `SUPABASE_SERVICE_ROLE_KEY`: not present
- `.env`: present
- `.env` contains `BRANDING_ORPHAN_DRY_RUN_USER_ID`: no
- `.env.test`: present
- `.env.test` contains `BRANDING_ORPHAN_DRY_RUN_USER_ID`: no

Residual evidence gap:

- the explicit tenant scope was available and the read-only execution
  completed
- the target environment classification remains `unknown`

Because the script is intentionally tenant-scoped, this report does not fall
back to any broader scan or cross-tenant inference.

## Commands Executed

Local checks:

- `git branch --show-current`
- `git rev-parse HEAD`
- `git status --short`
- `pnpm branding:orphan-dry-run -- --help`
- `pnpm test:branding-orphan-dry-run`
- `pnpm branch:audit`
- `git diff --check`

Tenant-scoped execution attempt:

- `node scripts/branding-orphan-dry-run.cjs --env-file .env --user-id <redacted> --format json`

Secret-safe root-cause checks:

- process env presence only, without values
- `.env` / `.env.test` presence
- env-name presence only, without values
- endpoint status-only probe for `brand_assets` and `storage.objects`

Execution result:

- `brand_assets` REST path remained reachable with status `200`
- `/rest/v1/storage.objects` returned `404`
- `/storage/v1/object/list/brand-assets` returned `200`
- the corrected tenant-scoped dry-run completed and produced candidate counts

Not executed:

- any broader fallback scan
- any cross-tenant scan
- any mutation or cleanup action

Reason:

- none beyond the remaining environment-classification ambiguity

## Candidate Summary

Dry-run object classification counts:

- `referenced`: `0`
- `orphan_candidate`: `0`
- `out_of_scope`: `0`
- `unknown`: `0`

Supporting findings:

- `total_objects`: `0`
- `reference_findings`: `0`

No candidate paths are reported because the completed tenant-scoped run found
no objects under the evaluated prefix.

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

- `pnpm branch:audit` now reports `33` total branches because the evidence
  and fix branch themselves are unmerged during this run
- `pnpm branch:audit` still reports `7` accepted `needs rename` cases
- `pnpm branch:audit` still reports `8` `temporary ops` branches
- target environment classification remains `unknown` for this evidence set

## Final Recommendation

Decision for next slice:
`Tenant-scoped Brand Asset Orphan Dry-Run Evidence` remains `incomplete`

Recommended next step:

1. if environment binding matters for release evidence, rerun the same
   tenant-scoped dry-run with an explicit target-environment classification
2. keep the corrected Storage API list path and its tenant-scoped tests as the
   active read-only contract
3. only after sufficiently bound tenant-scoped dry-run evidence exists, reassess whether an
   `Orphan-Cleanup Execution Design Audit` is justified

`Brand Asset Orphan-Cleanup Execution` is not released by this report and
remains blocked.
