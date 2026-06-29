# Branch, GitHub PR, and Environment Hygiene Audit

Date: 2026-06-29

## Executive Summary

- Audit start state was clean on `main`, and `main` matched `origin/main` at `6117663534eeea1171293bb28cb054861ce6f0bb`.
- GitHub PR data was available through `gh` and authentication was valid.
- The highest-signal branch hygiene findings are:
  - several local branches without any upstream,
  - one local branch whose upstream is gone,
  - several linked worktree branches still active outside the main checkout,
  - one stale local remote-tracking ref for `origin/codex/gateway-premium-command-enforcement` even though the remote head no longer exists.
- The highest-signal PR hygiene findings are:
  - 9 open Dependabot PRs,
  - all 9 currently show a failed `Validate monorepo` check,
  - one recent closed/unmerged PR remains relevant as a stale branch/PR pair: PR `#192`.
- The highest-signal environment and folder hygiene findings are:
  - local env files exist and are ignored as expected,
  - multiple local runtime/output folders are present and should remain local-only,
  - `.ruff_cache/` exists locally but is not ignored,
  - root `src/` and `tests/` only contain `.gitkeep` placeholders and should be explicitly kept or removed later by decision, not by accident,
  - dated audit/evidence markdown files in `docs/` are accumulating and need a retention decision.
- Static-analysis fix applied: removed the unused `pytest` import from `services/automation-service/tests/test_entitlement_assertions.py`.

## Repo State

- Current branch: `main`
- Current SHA: `6117663534eeea1171293bb28cb054861ce6f0bb`
- `main == origin/main`: yes
- Worktree at audit start: clean
- GitHub CLI availability: available
- GitHub auth availability: authenticated

## Branch Inventory

### Local Branch Summary

- Local branches observed: `21`
- Remote heads observed on `origin`: `30`
- Local branches without upstream: `10`
- Local branches with linked worktrees: `4`

### Local Branches With Upstream and No Immediate Drift Signal

- `main`
- `develop`
- `chore/web/next-artifact-recovery`
- `feature/automation/automation-runtime-entitlement-enforcement`
- `feature/docs/premium-path-classification-audit`
- `fix/api/oauth-relative-redirects`
- `fix/infra/docker-prepare-hook`
- `fix/infra/prod-config-cleanup-slice`
- `fix/release-gate-proof-rc-2`
- `release/repurposing-worker-production-rc`

### Local Branches Without Upstream

Keep/archive oriented local-only branches:

- `archive/chore/workers/queue-runtime-split`
- `archive/codex/local-main-pre-stabilize-20260625`
- `archive/feature/api-gateway/metrics-sync-gateway-refactor`
- `archive/feature/api-gateway/twitch-eventsub-integration`
- `archive/feature/packages/webhook-shared-types`
- `archive/fix/infra/vercel-root-deploy-settings`
- `archive/fix/workers/transcription-e2e-guardrails`

Needs Thomas decision:

- `fix/infra/branch-governance-isolation`
- `fix/infra/gateway-production-env-hardening`
- `fix/infra/prod-config-cleanup`

Reason:

- they are not under `archive/`,
- they do not currently track any remote branch,
- two of them are also attached to linked worktrees.

### Local Branches With Linked Worktrees

- `chore/web/next-artifact-recovery`
- `fix/infra/branch-governance-isolation`
- `fix/infra/gateway-production-env-hardening`
- `fix/infra/prod-config-cleanup-slice`

Recommendation:

- keep as active while the linked worktrees still matter,
- do not delete or rename without confirming the external worktree purpose.

### Branches With Remote/Tracking Irregularities

- `fix/repurposing-worker-production-rc`
  - local branch still exists,
  - `git branch -vv` reports upstream `origin/fix/repurposing-worker-production-rc: gone`,
  - classify as `stale candidate`.
- local remote-tracking ref `origin/codex/gateway-premium-command-enforcement`
  - still visible in `git branch --all`,
  - not present in `git ls-remote --heads origin`,
  - classify as `stale local tracking ref`,
  - safe follow-up would be a prune/fetch workflow, but not executed in this audit.

### Merged vs Not-Merged Snapshot

Merged into current `main`:

- `main`
- `release/repurposing-worker-production-rc`

Not merged into current `main`:

- all `archive/*` branches listed above
- `chore/web/next-artifact-recovery`
- `develop`
- `feature/automation/automation-runtime-entitlement-enforcement`
- `feature/docs/premium-path-classification-audit`
- `fix/api/oauth-relative-redirects`
- `fix/infra/branch-governance-isolation`
- `fix/infra/docker-prepare-hook`
- `fix/infra/gateway-production-env-hardening`
- `fix/infra/prod-config-cleanup`
- `fix/infra/prod-config-cleanup-slice`
- `fix/release-gate-proof-rc-2`
- `fix/repurposing-worker-production-rc`

Interpretation:

- several of these may be intentionally retained history,
- several may also simply be older operational branches that were never cleaned up.

## GitHub PR Inventory

Status: available through `gh`, but still `incomplete` for long-tail historical PR-to-branch mapping beyond the queried window of 100 PRs.

### Open PRs

Open PR count observed: `9`

All currently open PRs are Dependabot PRs:

- `#190` `dependabot/npm_and_yarn/postcss-8.5.16`
- `#189` `dependabot/npm_and_yarn/fast-xml-parser-5.9.3`
- `#188` `dependabot/npm_and_yarn/vitest-4.1.9`
- `#187` `dependabot/npm_and_yarn/zod-4.4.3`
- `#186` `dependabot/npm_and_yarn/turbo-2.10.0`
- `#185` `dependabot/npm_and_yarn/eslint/js-10.0.1`
- `#184` `dependabot/npm_and_yarn/typescript-eslint/parser-8.62.0`
- `#183` `dependabot/npm_and_yarn/playwright/test-1.61.1`
- `#182` `dependabot/github_actions/actions/cache-6`

### PRs With Handlungsbedarf

All 9 open Dependabot PRs currently show a failed `Validate monorepo` check while their security/dependency checks are otherwise green.

Classify as:

- `open / red checks / needs triage`

Recommendation:

- batch-triage whether they fail for the same root monorepo validation reason,
- avoid merging any of them blindly.

### Closed / Stale PRs

- `#192` `[codex] Add premium path classification audit`
  - state: `CLOSED`
  - merged: no
  - check state included failed `Validate monorepo`
  - branch head: `feature/docs/premium-path-classification-audit`
  - classify as `closed stale PR / needs branch decision`

### Recently Merged PRs Relevant to This Audit

- `#194` merged cleanly
- `#193` merged cleanly
- `#191` merged cleanly

## Environment / Folder Hygiene

### Active / Required

- `.github/`
- `apps/`
- `docs/`
- `e2e/`
- `packages/`
- `scripts/`
- `services/`
- `workers/`
- `README.md`
- `compose.yaml`
- `Dockerfile.*`
- `.env.example`
- `.env.compose.example`
- `.env.test.example`
- `apps/web/.env.local.example`

### Local-Only / Ignore

- `.env`
- `.env.local`
- `.env.test`
- `apps/web/.env.local`
- `.venv/`
- `.vercel/`
- `.turbo/`
- `playwright-report/`
- `test-results/`
- `node_modules/`
- `publishing-worker-production-build.log`
- `publishing-worker-production-deploy.log`
- `release-gate-runner-production-build.log`
- `.codex-pnpm-dev.err.log`
- `.codex-pnpm-dev.out.log`

Notes:

- these are present locally and should remain out of reports, commits, and cleanup automation,
- no values or secret contents were inspected or recorded.

### Stale Candidates

- `logs/`
  - contains dated local web dev logs from `2026-06-11`,
  - file names are ignored via `*.log`,
  - classify as `stale candidate`.
- stale local remote-tracking ref for `origin/codex/gateway-premium-command-enforcement`
  - classify as `stale candidate`.
- `fix/repurposing-worker-production-rc`
  - upstream gone,
  - classify as `stale candidate`.
- `feature/automation/automation-runtime-entitlement-enforcement`
  - after local prune, the configured upstream is now gone,
  - no cleanup action was applied in this slice,
  - classify as `stale candidate / needs later branch decision`.

### Unknown / Needs Thomas Decision

- `src/`
  - only contains `src/.gitkeep`,
  - no active root app is allowed by current architecture guidance,
  - classify as `needs decision`.
- `tests/`
  - only contains `tests/.gitkeep`,
  - classify as `needs decision`.
- dated audit/evidence docs under `docs/`
  - many 2026-06-27/28/29 reports are tracked,
  - likely intentional evidence,
  - retention/archive policy is unclear,
  - classify as `needs Thomas decision`.

### Keep / Archive / Delete-Candidate Guidance

- Keep:
  - active repo owners and env example files,
  - linked worktree branches that are still intentionally in use,
  - tracked audit docs that still matter operationally.
- Archive candidate:
  - old closed PR context around `#192`,
  - older non-upstream local branches that are no longer active but still useful historically.
- Delete candidate:
  - local log artifacts in `logs/`,
  - stale local tracking refs after explicit approval.
- Needs decision:
  - root `src/` and `tests/` placeholders,
  - non-archive local branches without upstream,
  - dated evidence-doc retention policy.

## Static Analysis Fix

- File: `services/automation-service/tests/test_entitlement_assertions.py`
- Root cause: unused `pytest` import at file top level
- Change: removed the import only
- No other test refactoring or assertion changes were made

## Cleanup Recommendations

Safe next steps, not executed automatically:

1. Decide whether `feature/automation/automation-runtime-entitlement-enforcement` should stay as a local branch now that its upstream is gone after pruning.
2. Decide whether the archived stale branch `archive/stale/repurposing-worker-production-rc-2026-06-29` should eventually be deleted locally.
3. Triage the 9 open Dependabot PRs as one batch because they all currently fail the same top-level `Validate monorepo` gate.
4. Decide whether the archived hold branches should remain available in linked worktrees or be removed later:
   - `archive/hold/branch-governance-isolation`
   - `archive/hold/gateway-production-env-hardening`
   - `archive/hold/prod-config-cleanup`
5. Decide on a retention policy for dated audit/evidence markdown files in `docs/`.

Explicitly not executed in this audit:

- no branch deletion
- no PR close/merge/edit
- no environment or secret change
- no GitHub settings change
- no remote branch deletion

## Blockers / Warnings / Thomas Decisions Needed

- Decision needed on whether the newly archived local hold branches should continue to exist or be removed in a later cleanup:
  - `archive/hold/branch-governance-isolation`
  - `archive/hold/gateway-production-env-hardening`
  - `archive/hold/prod-config-cleanup`
- Decision needed on whether the archived stale branch should be kept longer or dropped later:
  - `archive/stale/repurposing-worker-production-rc-2026-06-29`
- Decision needed on whether the local branch with now-gone upstream should be archived or removed in a later slice:
  - `feature/automation/automation-runtime-entitlement-enforcement`
- Decision needed on whether the recent accumulation of dated audit/evidence docs should be kept as-is or periodically archived.

## Cleanup Decisions Applied

- Created local cleanup branch:
  - `chore/repo-hygiene-cleanup-2026-06-29`
- Applied local branch archiving:
  - `fix/infra/branch-governance-isolation` -> `archive/hold/branch-governance-isolation`
  - `fix/infra/gateway-production-env-hardening` -> `archive/hold/gateway-production-env-hardening`
  - `fix/infra/prod-config-cleanup` -> `archive/hold/prod-config-cleanup`
  - `fix/repurposing-worker-production-rc` -> `archive/stale/repurposing-worker-production-rc-2026-06-29`
- Pruned stale local remote-tracking refs with `git remote prune origin`:
  - `origin/codex/gateway-premium-command-enforcement`
  - `origin/feature/automation/automation-runtime-entitlement-enforcement`
  - `origin/feature/docs/premium-path-classification-audit-clean`
- Added local cache/log hygiene to `.gitignore`:
  - `.ruff_cache/`
  - `logs/`
- Removed local `logs/` directory after confirming it only held local log artifacts.
- Removed empty root placeholder directories by deleting tracked `.gitkeep` placeholders under:
  - `src/`
  - `tests/`

## Follow-up Slices

- `Dependabot Failure Triage`
  - all 9 currently open Dependabot PRs still need a separate triage pass for their failed `Validate monorepo` checks
- `Docs Evidence Retention Policy`
  - optional follow-up to define when dated audit/evidence docs stay in place versus move to `docs/archive/YYYY-MM/`
- `AI Cost and Abuse Guardrails`
  - remains the next product/runtime slice after hygiene cleanup is completed
