# StreamOS Maintenance Closeout Matrix

Date: 2026-06-27

Scope: P5 Branding / Maintenance closeout after the latest branch-hygiene,
CodeRabbit, CodeQL, and cleanup-adjacent work on `main`. This report is
evidence-only. It does not authorize deployments, restarts, Supabase
mutations, storage changes, provider writes, or live production actions.

## Current Repo State

- `main` SHA: `f469b2ed5f96227e24ce05f5bc915297c1368d52`
- `origin/main` SHA: `f469b2ed5f96227e24ce05f5bc915297c1368d52`
- `main == origin/main`: yes
- current branch: `main`
- worktree: clean
- local `codex/*` branches: none
- remote `origin/codex/*` branches: none
- open GitHub pull requests: none

## Overall Decision

`closed_with_warnings`

The P5 branding slice is repo-closed and locally evidence-backed. GitHub
currently shows no open CodeQL alerts for `CodeQL`, and no open PR or
`codex/*` branch cleanup blocker is active. Remaining warnings are maintenance
and evidence quality items, not code defects: the repository still has stale or
rename-worthy non-`codex/*` branches, and the branding hosted-readiness gate is
documented from prior redacted hosted evidence rather than re-run during this
read-only audit.

## Maintenance Matrix

| Slice / area                                                           | Status       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Merge / PR / SHA hint                                                                                  | Residual risk                                                                                                                                  | Next recommended action                                                                                                  |
| ---------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Prior generic maintenance matrix                                       | `superseded` | The previous report in this file stopped before the P5 branding closeout chain and before current `main` advanced to `f469b2ed`.                                                                                                                                                                                                                                                                                                                         | Prior matrix date `2026-06-25`; current `main` includes PRs #147-#151.                                 | Older wording understates current P5 branding and branch-audit state.                                                                          | Use this 2026-06-27 matrix as the active maintenance closeout reference.                                                 |
| Branding dashboard / explorer closeout                                 | `closed`     | [`docs/p5-branding-closeout.md`](./p5-branding-closeout.md) documents the active `/dashboard/branding` read model, explorer UX, preview flow, upload contract, disabled future mutations, and validation evidence.                                                                                                                                                                                                                                       | PR #145 baseline merge `d386bc00`; closeout PR #147 commit `e1325976`.                                 | No active repo defect is evident in the read-only branding slice.                                                                              | Keep future branding work scoped to the existing dashboard, preview, and shared contract paths.                          |
| Server-side filter / sort / pagination hardening                       | `closed`     | P5 closeout sections for P5.10 and P5.14 describe DB-backed filter/sort/pagination, cursor binding, and derived-status server filters. Local evidence also points to `apps/web/src/app/dashboard/branding/data.test.ts`, `page.test.tsx`, and `packages/types/test/branding-dashboard.test.ts`.                                                                                                                                                          | PR #147 `e1325976`, PR #148 `e9fd4e7d`, PR #149 `9504453c`, PR #150 `e7dff3b2`.                        | Future mutations could regress the derived-status contract if they bypass the shared types and server query gate.                              | Reuse the existing derived-status gate and test set for the next branding slice.                                         |
| Activation gate / hosted readiness for branding derived-status filters | `warning`    | [`docs/p5-branding-closeout.md`](./p5-branding-closeout.md) records `hostedMigrationReady`, `hostedIndexReady`, and `serverFilterReady` as passed/active and references `scripts/branding-hosted-evidence.cjs` plus `scripts/branding-hosted-evidence.test.cjs`.                                                                                                                                                                                         | PR #149 `9504453c`, PR #150 `e7dff3b2`.                                                                | This audit did not re-run hosted DB evidence; the closeout relies on prior redacted hosted proof remaining current for the target environment. | Before a new branding mutation slice, re-confirm hosted branding evidence if there is any doubt about environment drift. |
| CodeRabbit follow-up closure                                           | `closed`     | [`docs/p5-branding-closeout.md`](./p5-branding-closeout.md) records `coderabbit review --agent --base main -c AGENTS.md` as passed with `0 issues`, and PR #150 is explicitly the review-fix follow-up.                                                                                                                                                                                                                                                  | PR #150 `e7dff3b2`; current `main` head `f469b2ed`.                                                    | New review findings can still appear on future diffs, but no unresolved P5 review tail is documented locally.                                  | Start any next slice from current `main` and re-run CodeRabbit only against the new diff.                                |
| CodeQL / security residual findings                                    | `closed`     | `gh api "repos/StreamOS/StreamOS/code-scanning/alerts?state=open&tool_name=CodeQL&per_page=100"` returned `[]`. `gh run list --workflow security.yml --limit 10 --json ...` shows the latest `Security & Dependency Checks` run completed successfully for `f469b2ed5f96227e24ce05f5bc915297c1368d52`. Existing repo security closeouts remain in [`docs/m6-gateway-auth-webhook-security-closeout.md`](./m6-gateway-auth-webhook-security-closeout.md). | Current `main` `f469b2ed`; latest security workflow run created `2026-06-27T06:39:14Z`.                | Code scanning state is point-in-time and must be rechecked on every new head SHA.                                                              | Re-run the same GitHub checks on the next mutation branch tip before merge.                                              |
| Branch hygiene / cleanup posture                                       | `warning`    | `pnpm branch:audit` on current `main` reports: total branches `49`, active development `12`, merged & stale `12`, needs rename `22`, safe deletion candidates `12`, open PRs `0`, local/remote `codex/*` branches `0`, worktree clean. `node --test scripts/branch-governance.test.cjs` passed.                                                                                                                                                          | Current `main` `f469b2ed`; governance policy in [`docs/branch-governance.md`](./branch-governance.md). | Stale and rename-worthy non-`codex/*` branches can blur provenance and make the next maintenance slice noisier than necessary.                 | Run an explicit branch-cleanup / rename-triage slice before opening a new mutating branding branch.                      |

## Key Evidence Reviewed

- `git rev-parse main`
- `git rev-parse origin/main`
- `git status --short`
- `git branch --list "codex/*"`
- `git branch -r --list "origin/codex/*"`
- `gh pr list --state open --limit 100 --json number,title,headRefName,baseRefName,isDraft,mergeStateStatus`
- `gh api "repos/StreamOS/StreamOS/code-scanning/alerts?state=open&tool_name=CodeQL&per_page=100"`
- `gh run list --workflow security.yml --limit 10 --json databaseId,headSha,status,conclusion,displayTitle,createdAt`
- `pnpm branch:audit`
- `node --test scripts/branch-governance.test.cjs`
- [`docs/p5-branding-closeout.md`](./p5-branding-closeout.md)
- [`docs/operator-live-env-audit.md`](./operator-live-env-audit.md)
- [`docs/branch-governance.md`](./branch-governance.md)
- [`README.md`](../README.md)

## Residual Risk Register

| Risk                                                                                     | Status    | Why it still matters                                                                           | Follow-up                                                                                                                  |
| ---------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Hosted branding readiness evidence could drift after the last documented redacted proof. | `warning` | The repo gate is active, but this audit did not independently re-run hosted branding evidence. | Re-run the branding hosted evidence check before the next mutating branding slice if target-environment drift is possible. |
| Branch inventory is not yet fully trimmed or normalized.                                 | `warning` | `pnpm branch:audit` still reports 22 rename candidates and 12 safe deletion candidates.        | Perform an explicit cleanup / rename pass and keep it separate from product mutation work.                                 |
| CodeQL and security workflow results are current only for the audited SHA.               | `warning` | A clean result at `f469b2ed` does not transfer automatically to a new branch head.             | Re-check CodeQL open alerts and the security workflow on the next slice head before merge.                                 |

## Recommendation For Next Branding Mutation Slice

Decision: `not_recommended_yet`

`Brand Asset Replace / Orphan-Cleanup` should not start immediately as the next
mutating slice. The safer sequence is:

1. accept or clear the current branch-hygiene warnings in a dedicated cleanup
   slice;
2. re-confirm branding hosted-readiness evidence if the target environment may
   have drifted;
3. start the next branding mutation only from fresh `main`.

If those warnings are explicitly accepted by the operator, the next slice can be
opened from current `main` without a code blocker from the closed P5 branding
work itself.

## Validation For This Report

Ran:

- `pnpm branch:audit`
- `node --test scripts/branch-governance.test.cjs`
- GitHub PR / CodeQL / security-workflow read-only checks listed above

Recommended after editing this report:

- `git diff --check`
- `pnpm exec prettier --check docs/maintenance-closeout-matrix.md`
