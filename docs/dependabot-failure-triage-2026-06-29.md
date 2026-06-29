# Dependabot Failure Triage - 2026-06-29

## Executive Summary

This slice triaged the nine open Dependabot PRs that currently show a failed `Validate monorepo` check.

Result:

- Seven PRs share the same stale failure signature from older PR merge refs: `apps/web` `PublicationScheduleConsole.test.tsx` fails in CI, but the same targeted test passes on current `main` at `ff0d55d6d1110310ea6f75192dd9d2bd1764c7d8`.
- Two PRs show real update-specific breakage and need separate fix work:
  - `#185` `@eslint/js` -> root lint now fails on existing scripts under newer ESLint rules.
  - `#187` `zod` -> worker TypeScript types break in `workers/clip-worker`.
- No PR was merged, rebased, refreshed, closed, or otherwise mutated in this slice.

The recommended next step is a small, separate Dependabot CI refresh/fix slice before returning to `AI Cost and Abuse Guardrails`.

## Repo State

- Branch: `chore/dependabot-failure-triage-2026-06-29`
- `HEAD`: `ff0d55d6d1110310ea6f75192dd9d2bd1764c7d8`
- `main`: `ff0d55d6d1110310ea6f75192dd9d2bd1764c7d8`
- `origin/main`: `ff0d55d6d1110310ea6f75192dd9d2bd1764c7d8`
- `main == origin/main`: yes
- Worktree at triage start: clean

## Dependabot PR Inventory

| PR   | Dependency                                     | Workspace / package scope                                      | Update type | Security relevance                        | Failed check        | Current classification                                                             |
| ---- | ---------------------------------------------- | -------------------------------------------------------------- | ----------- | ----------------------------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| #190 | `postcss` `8.5.15 -> 8.5.16`                   | transitive lockfile only (`pnpm-lock.yaml`)                    | patch       | normal                                    | `Validate monorepo` | stale shared failure; refresh and retest                                           |
| #189 | `fast-xml-parser` `5.8.0 -> 5.9.3`             | transitive lockfile only (`pnpm-lock.yaml`)                    | minor       | normal, runtime-sensitive parser dep      | `Validate monorepo` | stale shared failure; refresh and retest                                           |
| #188 | `vitest` `3.2.6 -> 4.1.9`                      | `apps/web`, `services/api-gateway`, multiple workers, lockfile | major       | normal, test-tooling                      | `Validate monorepo` | stale shared failure in current logs; still needs explicit post-refresh validation |
| #187 | `zod` `3.25.76 -> 4.4.3`                       | `apps/web`, `services/api-gateway`, multiple workers, lockfile | major       | normal, runtime/shared-contract sensitive | `Validate monorepo` | real dependency breakage                                                           |
| #186 | `turbo` `2.9.16 -> 2.10.0`                     | transitive lockfile only (`pnpm-lock.yaml`)                    | minor       | normal, build-tooling                     | `Validate monorepo` | stale shared failure; refresh and retest                                           |
| #185 | `@eslint/js` `9.39.4 -> 10.0.1`                | root `package.json`, lockfile                                  | major       | normal, lint-policy sensitive             | `Validate monorepo` | real dependency breakage                                                           |
| #184 | `@typescript-eslint/parser` `8.61.1 -> 8.62.0` | transitive lockfile only (`pnpm-lock.yaml`)                    | minor       | normal, lint-tooling                      | `Validate monorepo` | stale shared failure; refresh and retest                                           |
| #183 | `@playwright/test` `1.60.0 -> 1.61.1`          | transitive lockfile only (`pnpm-lock.yaml`)                    | minor       | normal, test-tooling                      | `Validate monorepo` | stale shared failure; refresh and retest                                           |
| #182 | `actions/cache` `5 -> 6`                       | GitHub Actions workflows only                                  | major       | normal, CI-sensitive                      | `Validate monorepo` | stale shared failure; refresh and retest                                           |

Notes:

- No explicit GitHub security-alert marker was retrievable from the available `gh` PR/check metadata.
- "Security relevance" above therefore reflects operational sensitivity, not a confirmed Dependabot security advisory.

## Failure Classification

### 1. Shared stale check failure on older PR merge refs

Affected PRs:

- `#182`
- `#183`
- `#184`
- `#186`
- `#188`
- `#189`
- `#190`

Observed CI failure signature:

- `apps/web` test file: `src/components/modules/PublicationScheduleConsole.test.tsx`
- failing assertions:
  - `expected [ { ... } ] to have a length of 2 but got 1`
  - `expected 1 to be 2`

Why this is classified as stale and not as a current `main` blocker:

- The same targeted local test command passes on current `main`:
  - `pnpm --filter @streamos/web test -- --run src/components/modules/PublicationScheduleConsole.test.tsx`
- Current `main`, `origin/main`, and `HEAD` are all the same commit:
  - `ff0d55d6d1110310ea6f75192dd9d2bd1764c7d8`
- Therefore the failing GitHub results are tied to older PR merge refs and should not be treated as authoritative for the current base branch state.

Interpretation:

- These PRs need branch refresh or recreation plus fresh CI before merge decisions.
- `#188` still carries major-upgrade risk even if its current failure log is stale.

### 2. Real update-specific breakage

#### PR `#185` `@eslint/js` major update

Observed failure class:

- root `pnpm validate:ci` fails in `pnpm lint`
- newer lint rules flag existing script code

Observed errors:

- `scripts/audit-railway-env.cjs:467` `preserve-caught-error`
- `scripts/audit-railway-env.cjs:591` `no-useless-assignment`
- `scripts/branding-orphan-execution-contract.cjs:203` `preserve-caught-error`
- `scripts/e2e-transcription-job.cjs:1089` `preserve-caught-error`
- `scripts/lib/branch-governance-core.cjs:156` `no-useless-assignment`
- `scripts/rollout-check.cjs:482` `no-useless-assignment`

Interpretation:

- This is not blocked by stale schedule test output.
- A dedicated lint-compatibility slice is required before this PR can merge safely.

#### PR `#187` `zod` major update

Observed failure class:

- worker TypeScript incompatibility under Zod v4

Observed errors:

- `workers/clip-worker/src/automationClient.ts(30,58)` `ZodTypeDef` no longer exported
- `workers/clip-worker/src/automationClient.ts(30,70)` generic constraint failure
- `workers/clip-worker/src/jobSchema.ts(19,49)` `ZodTypeDef` no longer exported
- `workers/clip-worker/src/jobSchema.ts(19,61)` generic constraint failure

Interpretation:

- This is a real runtime-contract migration issue.
- It requires a deliberate compatibility update across worker code and possibly shared schema helpers.

### 3. Unknown / incomplete

- `gh` returned enough data for inventory, changed-file scope, check URLs, and failure logs.
- `mergeStateStatus` came back as `UNKNOWN` for all nine PRs via `gh`, so mergeability freshness was not fully retrievable from CLI metadata alone.

## Recommended Action Plan

### Priority 1: refresh stale PRs against current `main`

Recommended candidates:

- `#190` `postcss`
- `#189` `fast-xml-parser`
- `#184` `@typescript-eslint/parser`
- `#183` `@playwright/test`
- `#186` `turbo`
- `#182` `actions/cache`

Why first:

- Their current failures are not trustworthy against the current base branch.
- They are patch/minor or isolated CI-only changes, with smaller likely blast radius than the major dependency PRs.

Recommended handling:

- refresh or recreate the PR branch
- rerun `Validate monorepo`
- merge only after fresh green checks

### Priority 2: refresh then explicitly evaluate `#188` `vitest`

Why second:

- The current failure log is stale-shared, not obviously Vitest-specific.
- But this is still a major test-runner jump touching multiple workspaces.

Required follow-up after refresh:

- rerun full `Validate monorepo`
- pay special attention to test snapshots, Vitest API changes, and multi-workspace test startup behavior

### Priority 3: separate fix slices for true breakages

- `#185` should become a small ESLint-compatibility slice.
- `#187` should become a small Zod v4 compatibility slice.

These should not be mixed with the stale-check refresh work.

## Merge Safety Notes

- Do not merge based on the currently recorded failed checks for the seven stale-signature PRs.
- For refreshed patch/minor PRs, the minimum expected proof is a fresh green `Validate monorepo`.
- For `#188`, also review any test-runner config drift after refresh because it is a major toolchain change.
- For `#185`, rollback is simple: keep `@eslint/js` on the current major until script lint fixes exist.
- For `#187`, rollback is simple: keep Zod on v3 until worker schema typing is migrated intentionally.

## Out of Scope

- no production change
- no environment or secret change
- no deployment-gate change
- no PR merge, close, rebase, or refresh action
- no remote branch deletion
- no dependency update was applied locally

## Follow-up Recommendation

Recommended order after this report:

1. Small Dependabot refresh slice for the seven stale-signature PRs.
2. Separate fix slice for `#185` and `#187`.
3. Re-evaluate whether `#188` can merge after refresh or needs its own major-upgrade slice.
4. Return to `AI Cost and Abuse Guardrails`.

If the refresh slice proves the seven PRs green on current `main`, this report can be merged without coupling it to dependency code changes.
