# StreamOS Maintenance Closeout Matrix

Date: 2026-06-27

Scope: P5 Branding / Maintenance closeout after the latest branch-hygiene,
CodeRabbit, CodeQL, and cleanup-adjacent work on `main`. This report is
evidence-only. It does not authorize deployments, restarts, Supabase
mutations, storage changes, provider writes, or live production actions.

## Current Repo State

- `main` SHA: `da9748f3e51c3197df86874f6761adb2ae3ba8f4`
- `origin/main` SHA: `da9748f3e51c3197df86874f6761adb2ae3ba8f4`
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

| Slice / area                                                           | Status                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Merge / PR / SHA hint                                                                                  | Residual risk                                                                                                                                   | Next recommended action                                                                                                                    |
| ---------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Prior generic maintenance matrix                                       | `superseded`           | The previous report in this file stopped before the P5 branding closeout chain and before current `main` advanced to `f469b2ed`.                                                                                                                                                                                                                                                                                                                                     | Prior matrix date `2026-06-25`; current `main` includes PRs #147-#151.                                 | Older wording understates current P5 branding and branch-audit state.                                                                           | Use this 2026-06-27 matrix as the active maintenance closeout reference.                                                                   |
| Branding dashboard / explorer closeout                                 | `closed`               | [`docs/p5-branding-closeout.md`](./p5-branding-closeout.md) documents the active `/dashboard/branding` read model, explorer UX, preview flow, upload contract, disabled future mutations, and validation evidence.                                                                                                                                                                                                                                                   | PR #145 baseline merge `d386bc00`; closeout PR #147 commit `e1325976`.                                 | No active repo defect is evident in the read-only branding slice.                                                                               | Keep future branding work scoped to the existing dashboard, preview, and shared contract paths.                                            |
| Server-side filter / sort / pagination hardening                       | `closed`               | P5 closeout sections for P5.10 and P5.14 describe DB-backed filter/sort/pagination, cursor binding, and derived-status server filters. Local evidence also points to `apps/web/src/app/dashboard/branding/data.test.ts`, `page.test.tsx`, and `packages/types/test/branding-dashboard.test.ts`.                                                                                                                                                                      | PR #147 `e1325976`, PR #148 `e9fd4e7d`, PR #149 `9504453c`, PR #150 `e7dff3b2`.                        | Future mutations could regress the derived-status contract if they bypass the shared types and server query gate.                               | Reuse the existing derived-status gate and test set for the next branding slice.                                                           |
| Activation gate / hosted readiness for branding derived-status filters | `closed_with_warnings` | [`docs/p5-branding-closeout.md`](./p5-branding-closeout.md) plus [`docs/branding-hosted-evidence-recheck-2026-06-27.md`](./branding-hosted-evidence-recheck-2026-06-27.md) now record a clean Vercel production env audit, explicit hosted DB target binding via `--target-environment production`, green hosted migration/index evidence, and a hosted evidence script that validates the active P5.14 web gate instead of hardcoding `serverFilterReady: blocked`. | PR #149 `9504453c`, PR #150 `e7dff3b2`, hosted-evidence fix slice after merge `da9748f3`.              | Hosted DB provenance is explicit for the recheck but still not pinned to a separately surfaced hosted project/ref identifier inside the report. | `Brand Asset Replace Contract Hardening` can start from fresh `main`; keep explicit target-environment binding in follow-up evidence runs. |
| CodeRabbit follow-up closure                                           | `closed`               | [`docs/p5-branding-closeout.md`](./p5-branding-closeout.md) records `coderabbit review --agent --base main -c AGENTS.md` as passed with `0 issues`, and PR #150 is explicitly the review-fix follow-up.                                                                                                                                                                                                                                                              | PR #150 `e7dff3b2`; current `main` head `f469b2ed`.                                                    | New review findings can still appear on future diffs, but no unresolved P5 review tail is documented locally.                                   | Start any next slice from current `main` and re-run CodeRabbit only against the new diff.                                                  |
| CodeQL / security residual findings                                    | `closed`               | `gh api "repos/StreamOS/StreamOS/code-scanning/alerts?state=open&tool_name=CodeQL&per_page=100"` returned `[]`. `gh run list --workflow security.yml --limit 10 --json ...` shows the latest `Security & Dependency Checks` run completed successfully for `f469b2ed5f96227e24ce05f5bc915297c1368d52`. Existing repo security closeouts remain in [`docs/m6-gateway-auth-webhook-security-closeout.md`](./m6-gateway-auth-webhook-security-closeout.md).             | Current `main` `f469b2ed`; latest security workflow run created `2026-06-27T06:39:14Z`.                | Code scanning state is point-in-time and must be rechecked on every new head SHA.                                                               | Re-run the same GitHub checks on the next mutation branch tip before merge.                                                                |
| Branch hygiene / cleanup posture                                       | `warning`              | `pnpm branch:audit` on current `main` reports: total branches `49`, active development `12`, merged & stale `12`, needs rename `22`, safe deletion candidates `12`, open PRs `0`, local/remote `codex/*` branches `0`, worktree clean. `node --test scripts/branch-governance.test.cjs` passed.                                                                                                                                                                      | Current `main` `f469b2ed`; governance policy in [`docs/branch-governance.md`](./branch-governance.md). | Stale and rename-worthy non-`codex/*` branches can blur provenance and make the next maintenance slice noisier than necessary.                  | Run an explicit branch-cleanup / rename-triage slice before opening a new mutating branding branch.                                        |

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

| Risk                                                                                     | Status    | Why it still matters                                                                                                                                                                   | Follow-up                                                                                                                          |
| ---------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Hosted branding readiness evidence still depends on explicit target-environment binding. | `warning` | The recheck now passes, but the hosted DB target is still proven via `SUPABASE_DB_URL` plus `--target-environment production`, not via a separately surfaced hosted project/ref proof. | Keep the explicit target-environment binding on future read-only branding evidence runs until a stronger provenance marker exists. |
| Branch inventory is not yet fully trimmed or normalized.                                 | `warning` | `pnpm branch:audit` still reports 22 rename candidates and 12 safe deletion candidates.                                                                                                | Perform an explicit cleanup / rename pass and keep it separate from product mutation work.                                         |
| CodeQL and security workflow results are current only for the audited SHA.               | `warning` | A clean result at `f469b2ed` does not transfer automatically to a new branch head.                                                                                                     | Re-check CodeQL open alerts and the security workflow on the next slice head before merge.                                         |

## Recommendation For Next Branding Mutation Slice

Decision: `recommended_with_warnings`

`Brand Asset Replace Contract Hardening` may start from fresh `main`. The
safer sequence for subsequent branding mutations is:

1. start `Brand Asset Replace Contract Hardening` from fresh `main`;
2. keep re-confirming branding hosted-readiness evidence with explicit
   target-environment binding when the target environment may have drifted;
3. keep `Brand Asset Replace / Orphan-Cleanup` as a separate later slice.

Accepted branch-hygiene warnings remain maintenance follow-up, not a code
blocker for the hardening slice itself.

## Validation For This Report

Ran:

- `pnpm branch:audit`
- `node --test scripts/branch-governance.test.cjs`
- GitHub PR / CodeQL / security-workflow read-only checks listed above

Recommended after editing this report:

- `git diff --check`
- `pnpm exec prettier --check docs/maintenance-closeout-matrix.md`
