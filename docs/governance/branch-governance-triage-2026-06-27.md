# StreamOS Branch Governance Triage

Date: 2026-06-27

Scope: follow-up triage after the P5 maintenance closeout freeze. This report
classifies the remaining branch-hygiene warnings from `pnpm branch:audit`,
records the safe deletions performed in this slice, and documents the minimal
governance-tooling fix applied during the audit.

## Decision

`partial_closeout_with_remaining_review`

- P5 closeout documentation was already frozen in commit `7c78ca68`
  (`docs(maintenance): freeze p5 closeout audit`).
- The branch-hygiene cleanup removed all 12 clearly safe deletion candidates.
- The branch-governance policy was aligned with existing docs so `archive/*`
  and `railway/*` no longer surface as rename warnings.
- Remaining warnings are now reduced to 14 `needs rename` branches with unique
  diffs, all of which require owner review before rename or deletion.

## Starting State

- repo `main`: `f469b2ed5f96227e24ce05f5bc915297c1368d52`
- freeze branch HEAD at start of triage:
  `7c78ca6824000ed5265f493d50ac47b63835e839`
- open PRs: none
- open CodeQL alerts: none
- pre-cleanup `pnpm branch:audit` summary:
  - total branches: `50`
  - `merged & stale`: `12`
  - `needs rename`: `22`
  - `temporary ops`: `1`

## Safe Deletions Performed

All branches below were verified as no-open-PR, contained in `main`, and
patch-equivalent before deletion.

| Branch                                                       | Local | Remote | Last SHA   | Prior audit category | PR state       | Decision      |
| ------------------------------------------------------------ | ----- | ------ | ---------- | -------------------- | -------------- | ------------- |
| `finding-autofix-1`                                          | no    | yes    | `d835d8a0` | `merged & stale`     | PR #109 merged | `delete_safe` |
| `ai-findings-autofix/scripts-lib-branch-governance-core.cjs` | no    | yes    | `86d6b1f9` | `merged & stale`     | PR #108 merged | `delete_safe` |
| `fix/dependabot-runtime-compat-maintenance`                  | yes   | yes    | `92e3ae91` | `merged & stale`     | PR #105 merged | `delete_safe` |
| `fix/api-gateway-schedule-update-test`                       | yes   | yes    | `6430953c` | `merged & stale`     | PR #104 merged | `delete_safe` |
| `feat/web-brand-asset-upload-ui`                             | yes   | yes    | `8690bca7` | `merged & stale`     | PR #101 merged | `delete_safe` |
| `feat/web-brand-kit-crud-mvp`                                | yes   | yes    | `d3fbe5c6` | `merged & stale`     | PR #97 merged  | `delete_safe` |
| `chore/repo/governance-codeowners-mini`                      | yes   | yes    | `a56b11a8` | `merged & stale`     | PR #95 merged  | `delete_safe` |
| `chore/infra/production-config-cleanup-mini`                 | yes   | yes    | `52c213d3` | `merged & stale`     | PR #94 merged  | `delete_safe` |
| `chore/web/next-artifact-recovery-mini`                      | yes   | yes    | `5e7af009` | `merged & stale`     | PR #93 merged  | `delete_safe` |
| `fix/react-hooks-eslint-7-hygiene`                           | yes   | yes    | `5192b163` | `merged & stale`     | PR #92 merged  | `delete_safe` |
| `fix/infra/deploy-env-audit-gates`                           | no    | yes    | `9e8d2755` | `merged & stale`     | PR #51 merged  | `delete_safe` |
| `fix/infra/pnpm-11-toolchain`                                | no    | yes    | `e36e59ea` | `merged & stale`     | PR #50 merged  | `delete_safe` |

## Governance Tooling Alignment

The audit exposed a mismatch between documentation and the branch-audit policy:

- `docs/branch-governance.md` already treated `railway/*` as naming-exempt.
- `docs/branch-governance.md` already treated `archive/*` as a deliberate
  retained prefix in cleanup slices.
- the audit policy still classified both as rename warnings.

Applied minimal fix:

- `scripts/config/branch-governance-policy.cjs`
  - added `archive/` and `railway/` to `temporaryOpsPrefixes`
- `scripts/branch-governance.test.cjs`
  - added coverage for `archive/*` and `railway/*`
- `docs/branch-governance.md`
  - clarified that `archive/*` is an archival snapshot exception, not an active
    human branch that should be renamed into the normal convention

Tooling false positives resolved by this change:

- `archive/codex/local-main-pre-stabilize-20260625`
- `archive/fix/workers/transcription-e2e-guardrails`
- `archive/fix/infra/vercel-root-deploy-settings`
- `archive/feature/packages/webhook-shared-types`
- `archive/chore/workers/queue-runtime-split`
- `archive/feature/api-gateway/twitch-eventsub-integration`
- `archive/feature/api-gateway/metrics-sync-gateway-refactor`
- `railway/fix-deploy-ab5e91`

## Remaining `needs rename` Triage

All remaining `needs rename` branches have unique diffs outside `main` and are
therefore not safe-delete candidates in this slice.

| Branch                                        | Locality       | Tip SHA    | Ahead / behind vs `main` | PR status              | In `main` | Patch-equivalent | Classification    | Decision / next action                                                                                                   |
| --------------------------------------------- | -------------- | ---------- | ------------------------ | ---------------------- | --------- | ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `feat/web-brand-asset-signed-preview-runtime` | local + remote | `8bdd920a` | `1 / 103`                | PR #100 merged         | no        | no               | `review_required` | Historical merged branding branch whose current tip is not in `main`; inspect unique branch tip before rename or delete. |
| `feat/web-brand-asset-upload-runtime`         | local + remote | `f8942065` | `1 / 104`                | PR #99 merged          | no        | no               | `review_required` | Same pattern as above; do not rename or delete blindly.                                                                  |
| `chore/database-brand-assets-private-storage` | local + remote | `4bda24e3` | `1 / 105`                | PR #98 merged          | no        | no               | `review_required` | Merged PR exists, but branch tip still carries a unique commit outside `main`.                                           |
| `test/api-gateway-metrics-sync-contract`      | local + remote | `63f58cf1` | `1 / 108`                | PR #96 merged          | no        | no               | `review_required` | Historical merged test branch with unique tip; preserve until explicitly reconciled.                                     |
| `fix/repurposing-worker-production-rc`        | local + remote | `65180cee` | `1 / 196`                | PRs #66-#69 merged     | no        | no               | `review_required` | Diverged RC branch with multiple merged PRs and local ahead state; reconcile before any rename.                          |
| `fix/release-gate-proof-rc-2`                 | local + remote | `988a8e76` | `1 / 244`                | none                   | no        | no               | `review_required` | Unique branch with no PR linkage; confirm owner intent before rename or deletion.                                        |
| `fix/release-gate-runner-proof`               | remote only    | `4c0b19ff` | `6 / 254`                | none                   | no        | no               | `review_required` | Remote-only branch with multiple unique commits; requires manual provenance review.                                      |
| `fix/api/oauth-relative-redirects`            | local + remote | `b1ee1385` | `1 / 265`                | none                   | no        | no               | `review_required` | Unique OAuth branch without an open PR; review before any mutation.                                                      |
| `fix/web-react-version-alignment`             | remote only    | `d7f7ac0c` | `1 / 278`                | PR #47 merged          | no        | no               | `review_required` | Merged PR exists but current branch tip is not represented in `main`.                                                    |
| `fix/worktree-validation-stability`           | remote only    | `e7d01a7c` | `7 / 283`                | PR #26 merged          | no        | no               | `review_required` | Remote-only branch with seven unique commits beyond `main`; do not auto-clean.                                           |
| `fix/production-vercel-managed-build`         | remote only    | `409b590c` | `4 / 284`                | PR #31 merged          | no        | no               | `review_required` | Historical deployment branch with unique remote-only tail commits.                                                       |
| `fix/rollback-vercel-managed-build`           | remote only    | `dfbc1cb3` | `3 / 285`                | PR #32 merged          | no        | no               | `review_required` | Same as above; requires manual reconciliation if still relevant.                                                         |
| `fix/staging-supabase-url`                    | remote only    | `4bc35d95` | `10 / 314`               | PR #28 closed unmerged | no        | no               | `review_required` | Closed-but-unmerged remote branch with substantial unique history; keep until explicitly triaged.                        |
| `fix/worktree-audit-stability`                | remote only    | `c2a4b921` | `23 / 309`               | PR #27 closed unmerged | no        | no               | `review_required` | Largest unique remote tail in this set; explicit owner review required before any action.                                |

No remaining branch is classified as `rename_required` in this slice because no
case is safe to rename blindly without first resolving unique branch history,
merged-PR mismatch, or closed-PR provenance.

## Post-Cleanup State

Post-cleanup `pnpm branch:audit` summary after the policy fix:

- total branches: `38`
- `merged & stale`: `0`
- `needs rename`: `14`
- `temporary ops`: `9`

Interpretation:

- the stale-branch backlog was fully cleared;
- eight rename warnings were reclassified as intentional `temporary ops`
  branches because the policy now matches the documented rules;
- the remaining warnings are concentrated in unique-history branches that need
  explicit human triage.

## Validation

Ran:

- `git diff --check`
- `pnpm exec prettier --check docs/maintenance-closeout-matrix.md`
- `pnpm branch:audit`
- `node --test scripts/branch-governance.test.cjs`

## Recommendation

- A fresh branding hosted-evidence recheck is still recommended before any new
  branding mutation slice if there is any doubt about hosted drift.
- `Brand Asset Replace / Orphan-Cleanup` remains blocked for now. The blocking
  reason is no longer generic stale-branch noise, but the 14 remaining
  unique-history `needs rename` branches that still require deliberate review.
