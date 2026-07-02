# StreamOS Unique-History Branch Decision Audit

Date: 2026-06-27

Scope: deliberate decision audit for the 14 remaining unique-history
`needs rename` branches after PR #152 merged the P5 maintenance closeout
freeze.

## Decision

`decision_complete_with_remaining_warnings`

- All 14 branches were classified individually.
- Seven branches were confirmed `delete_safe` and removed from local and/or
  remote refs during this slice.
- The remaining branches are now narrowed to seven explicitly documented
  history cases, instead of a generic unresolved backlog.
- `Branding Hosted-Evidence-Recheck` may start next.
- `Brand Asset Replace / Orphan-Cleanup` remains blocked until that hosted
  evidence recheck completes and the remaining stale branches are treated as
  non-reusable history.

## Starting State

- current branch: `main`
- start SHA: `b84fb9042ddbe963fae794eb393a4b0f832f8233`
- `main == origin/main`: yes
- worktree at start: clean
- pre-audit `pnpm branch:audit` summary:
  - total branches: `37`
  - `merged & stale`: `0`
  - `needs rename`: `14`
  - `temporary ops`: `8`

## Decision Matrix

| Branch                                        | Locality at start | Tip SHA    | Ahead / behind vs `main` | PR status                                                      | Direct ancestor of `main` | Patch-equivalent in `main`                                               | Main affected paths                                                                                                                                                      | Sensitive area                                    | Classification           | Outcome / next action                                                                                                                                                                                                |
| --------------------------------------------- | ----------------- | ---------- | ------------------------ | -------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feat/web-brand-asset-signed-preview-runtime` | local + remote    | `8bdd920a` | `1 / 106`                | PR #100 merged                                                 | no                        | yes (`git cherry` `-`)                                                   | `apps/web/src/app/dashboard/branding/*`                                                                                                                                  | branding, storage contract tests                  | `delete_safe`            | Deleted local and remote. Concept is already represented on `main`; do not reuse branch for new branding work.                                                                                                       |
| `feat/web-brand-asset-upload-runtime`         | local + remote    | `f8942065` | `1 / 107`                | PR #99 merged                                                  | no                        | yes (`git cherry` `-`)                                                   | `apps/web/src/app/dashboard/branding/actions.*`, `brand-asset-storage.*`                                                                                                 | branding, storage contract tests                  | `delete_safe`            | Deleted local and remote. Future upload mutations must start from current `main`, not this stale branch.                                                                                                             |
| `chore/database-brand-assets-private-storage` | local + remote    | `4bda24e3` | `1 / 108`                | PR #98 merged                                                  | no                        | yes (`git cherry` `-`)                                                   | `packages/database/.../20260622164807_brand_assets_private_storage.sql`, `docs/architecture.md`, `packages/database/README.md`, `scripts/validate-database-security.cjs` | storage, RLS, branding                            | `delete_safe`            | Deleted local and remote. Current `main` already contains the private `brand-assets` contract.                                                                                                                       |
| `test/api-gateway-metrics-sync-contract`      | local + remote    | `63f58cf1` | `1 / 111`                | PR #96 merged                                                  | no                        | yes (`git cherry` `-`)                                                   | `services/api-gateway/src/routes/metricsSync.test.ts`                                                                                                                    | gateway contract tests                            | `delete_safe`            | Deleted local and remote. Historical test-only branch was already absorbed.                                                                                                                                          |
| `fix/repurposing-worker-production-rc`        | local + remote    | `65180cee` | `1 / 199`                | PRs #66-#69 merged into RC flow; draft PR #66 merged to `main` | no                        | yes on local tip (`git cherry` `-`) and no non-equivalent remote patches | `packages/database/.../20260619160934_p3_publication_contract.sql`                                                                                                       | database migration, release RC                    | `superseded_keep_record` | Remote ref deleted. Local ref was intentionally kept because `git branch -d` refused on non-ancestor history and this slice does not force-delete. Treat as historical residue only; do not reuse as a working base. |
| `fix/release-gate-proof-rc-2`                 | local + remote    | `988a8e76` | `1 / 247`                | no PR                                                          | no                        | no (`git cherry` `+`)                                                    | `scripts/rollout-check.cjs`, `scripts/operator-cli.test.cjs`                                                                                                             | deployment, proof gate                            | `superseded_keep_record` | Keep as history only. Current `main` already contains later proof-gate hardening (`dd112364`, `a515b339`) and explicit `stream-job-worker` rollout coverage.                                                         |
| `fix/release-gate-runner-proof`               | remote only       | `4c0b19ff` | `6 / 257`                | no PR                                                          | no                        | no (`git cherry` `+`)                                                    | env examples, workflow files, `scripts/rollout-check.cjs`, `scripts/operator-cli.test.cjs`, workers, gateway tests                                                       | deployment, runner proof, env ownership           | `archive_only`           | Keep remote history for evidence only. The branch is broad, stale, and based on an earlier proof architecture; any future gate work must be freshly re-cut from `main`.                                              |
| `fix/api/oauth-relative-redirects`            | local + remote    | `b1ee1385` | `1 / 268`                | no PR                                                          | no                        | no (`git cherry` `+`)                                                    | `services/api-gateway/src/oauth/redirects.ts`, `redirects.test.ts`, provider callback tests                                                                              | OAuth, redirect safety                            | `recreate_from_main`     | Do not delete blindly and do not keep using this stale branch. Current `main` already normalizes safe relative redirects; if more provider-specific hardening is still needed, recreate a fresh branch from `main`.  |
| `fix/web-react-version-alignment`             | remote only       | `d7f7ac0c` | `1 / 281`                | PR #47 merged                                                  | no                        | yes (`git cherry` `-`)                                                   | `apps/web/package.json`, `pnpm-lock.yaml`                                                                                                                                | web runtime deps                                  | `delete_safe`            | Deleted remote. The effective React alignment already lives on `main` in `5849be83`.                                                                                                                                 |
| `fix/worktree-validation-stability`           | remote only       | `e7d01a7c` | `7 / 286`                | PR #26 merged                                                  | no                        | no (`git cherry` `+` for `23137400`, `db0d93ef`, `6fb512e0`)             | `.gitignore`, `apps/web/scripts/typecheck.cjs`, `packages/config/tsconfig/{next,node}.json`, `apps/web/package.json`                                                     | CI, typecheck determinism                         | `superseded_keep_record` | Keep as historical context only. The branch predates later toolchain and artifact-recovery cleanup on `main`; any revived work should be re-cut cleanly from current `main`.                                         |
| `fix/production-vercel-managed-build`         | remote only       | `409b590c` | `4 / 287`                | PR #31 merged                                                  | no                        | yes (`git cherry` `-` for `156d7fd0`)                                    | `.github/workflows/deploy-production.yml`                                                                                                                                | deployment workflow                               | `delete_safe`            | Deleted remote. Only historical merge-wrapper lineage remained.                                                                                                                                                      |
| `fix/rollback-vercel-managed-build`           | remote only       | `dfbc1cb3` | `3 / 288`                | PR #32 merged                                                  | no                        | yes (`git cherry` `-` for `9016fe9d`)                                    | `.github/workflows/main.yml`                                                                                                                                             | rollback workflow                                 | `delete_safe`            | Deleted remote. Only historical merge-wrapper lineage remained.                                                                                                                                                      |
| `fix/staging-supabase-url`                    | remote only       | `4bc35d95` | `10 / 317`               | PR #28 closed unmerged (base `develop`)                        | no                        | no (`git cherry` `+`)                                                    | `.github/workflows/deploy-{staging,production}.yml`, `README.md`, `docs/deployment.md`, `.gitignore`                                                                     | deployment, env, staging routing                  | `archive_only`           | Keep remote history only. The branch targets an outdated `develop`-centric staging shape that no longer matches repo-first deployment rules (`release/*` now owns staging).                                          |
| `fix/worktree-audit-stability`                | remote only       | `c2a4b921` | `23 / 312`               | PR #27 closed unmerged                                         | no                        | no (`git cherry` `+` many commits)                                       | workflows, env examples, docs, scripts, gateway, automation, workers, database migration `0028_restrict_authenticated_runtime_writes.sql`                                | mixed deployment, database, OAuth, worker runtime | `review_required`        | Keep untouched. This is the highest-risk mixed branch and should be split or audited commit-by-commit before any archival or deletion decision.                                                                      |

## Safe Deletes Performed

Deleted local and remote:

- `feat/web-brand-asset-signed-preview-runtime` at `8bdd920a`
- `feat/web-brand-asset-upload-runtime` at `f8942065`
- `chore/database-brand-assets-private-storage` at `4bda24e3`
- `test/api-gateway-metrics-sync-contract` at `63f58cf1`

Deleted remote only:

- `fix/repurposing-worker-production-rc` remote ref at `23ca3101`
- `fix/web-react-version-alignment` at `d7f7ac0c`
- `fix/production-vercel-managed-build` at `409b590c`
- `fix/rollback-vercel-managed-build` at `dfbc1cb3`

Local delete intentionally not forced:

- `fix/repurposing-worker-production-rc` local ref at `65180cee`
  - `git branch -d` refused because the local tip is not ancestry-merged into
    `HEAD`.
  - no force-delete was used in this slice.

## Branches That Should Be Recreated From `main`

- If OAuth redirect hardening still needs follow-up, recreate from current
  `main` instead of reviving `fix/api/oauth-relative-redirects`.
- If the product moves into `Brand Asset Replace / Orphan-Cleanup`, create a
  new branch from current `main`; the deleted branding branches are historical
  evidence only and must not be reused.

## Remaining Warnings

- Post-audit `pnpm branch:audit` summary:
  - total branches: `30`
  - `merged & stale`: `0`
  - `needs rename`: `7`
  - `temporary ops`: `8`
- The remaining `needs rename` count is now concentrated in seven explicit
  history cases:
  - `fix/repurposing-worker-production-rc`
  - `fix/release-gate-proof-rc-2`
  - `fix/release-gate-runner-proof`
  - `fix/api/oauth-relative-redirects`
  - `fix/worktree-validation-stability`
  - `fix/staging-supabase-url`
  - `fix/worktree-audit-stability`
- `pnpm branch:audit` still reports them as rename warnings because the current
  policy tool does not model `superseded_keep_record`, `archive_only`, or
  `recreate_from_main`. This report is the higher-fidelity decision record.

## Recommendation

- `Branding Hosted-Evidence-Recheck` is the correct next slice. The branding
  adjacent unique-history branches were resolved, and the remaining warnings are
  no longer branding-runtime branches that should gate this audit.
- `Brand Asset Replace / Orphan-Cleanup` should stay blocked for now.
  - The branch-decision blocker is resolved.
  - The hosted-evidence blocker is not resolved.
  - The remaining deployment/OAuth/worktree history branches must be treated as
    stale evidence only, not as reusable implementation branches.

## Validation

Ran during this slice:

- `pnpm branch:audit` before and after cleanup
- `git cherry main <branch>` for patch-equivalence checks
- targeted `git show --stat --summary` checks on branch tip commits
- targeted `rg`/`git log` checks against current `main` for branding, OAuth,
  rollout-gate, and workflow evidence
