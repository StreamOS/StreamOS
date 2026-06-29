# Dependabot Stale PR Refresh - 2026-06-29

## Executive Summary

This slice refreshed and rechecked the seven Dependabot PRs previously classified as stale shared CI failures:

- `#182`
- `#183`
- `#184`
- `#186`
- `#188`
- `#189`
- `#190`

Result:

- all seven PR branches were successfully updated against current `main`
- all seven now point at current base commit `38f7dffaddfcfdb0b357535f51015e1b3ba468a5`
- `Validate monorepo` is green on all seven refreshed PRs
- no dependency files, lockfiles, runtime code, environments, secrets, rulesets, or deployment gates were changed in this slice

Out of scope and untouched:

- `#185` `@eslint/js`
- `#187` `zod`

Those remain separate fix slices.

## Repo State

- Branch: `chore/dependabot-stale-pr-refresh-2026-06-29`
- `HEAD`: `38f7dffaddfcfdb0b357535f51015e1b3ba468a5`
- `origin/main`: `38f7dffaddfcfdb0b357535f51015e1b3ba468a5`
- `main == origin/main`: yes
- Worktree at slice start: clean

## Refresh / Recheck Matrix

| PR     | Dependency                                     | Branch                                                    | Refresh action                  | Final status | Notes                                                    |
| ------ | ---------------------------------------------- | --------------------------------------------------------- | ------------------------------- | ------------ | -------------------------------------------------------- |
| `#182` | `actions/cache` `5 -> 6`                       | `dependabot/github_actions/actions/cache-6`               | `gh pr update-branch` succeeded | all green    | includes `actionlint` green after refresh                |
| `#183` | `@playwright/test` `1.60.0 -> 1.61.1`          | `dependabot/npm_and_yarn/playwright/test-1.61.1`          | `gh pr update-branch` succeeded | all green    | stale CI signature cleared                               |
| `#184` | `@typescript-eslint/parser` `8.61.1 -> 8.62.0` | `dependabot/npm_and_yarn/typescript-eslint/parser-8.62.0` | `gh pr update-branch` succeeded | all green    | stale CI signature cleared                               |
| `#186` | `turbo` `2.9.16 -> 2.10.0`                     | `dependabot/npm_and_yarn/turbo-2.10.0`                    | `gh pr update-branch` succeeded | all green    | stale CI signature cleared                               |
| `#188` | `vitest` `3.2.6 -> 4.1.9`                      | `dependabot/npm_and_yarn/vitest-4.1.9`                    | `gh pr update-branch` succeeded | all green    | still a major update, so normal review remains important |
| `#189` | `fast-xml-parser` `5.8.0 -> 5.9.3`             | `dependabot/npm_and_yarn/fast-xml-parser-5.9.3`           | `gh pr update-branch` succeeded | all green    | runtime-sensitive parser dep, but CI is green now        |
| `#190` | `postcss` `8.5.15 -> 8.5.16`                   | `dependabot/npm_and_yarn/postcss-8.5.16`                  | `gh pr update-branch` succeeded | all green    | stale CI signature cleared                               |

## Final State Per PR

All seven refreshed PRs now satisfy the following:

- `baseRefOid == 38f7dffaddfcfdb0b357535f51015e1b3ba468a5`
- `mergeStateStatus == CLEAN`
- `Validate monorepo == SUCCESS`
- Vercel deployment completed successfully

Representative refreshed check URLs:

- `#182` `Validate monorepo`: `https://github.com/StreamOS/StreamOS/actions/runs/28379300551/job/84077234500`
- `#183` `Validate monorepo`: `https://github.com/StreamOS/StreamOS/actions/runs/28379303441/job/84077244881`
- `#184` `Validate monorepo`: `https://github.com/StreamOS/StreamOS/actions/runs/28379306744/job/84077256176`
- `#186` `Validate monorepo`: `https://github.com/StreamOS/StreamOS/actions/runs/28379309916/job/84077265609`
- `#188` `Validate monorepo`: `https://github.com/StreamOS/StreamOS/actions/runs/28379313093/job/84077275877`
- `#189` `Validate monorepo`: `https://github.com/StreamOS/StreamOS/actions/runs/28379315826/job/84077286724`
- `#190` `Validate monorepo`: `https://github.com/StreamOS/StreamOS/actions/runs/28379286573/job/84077185099`

## Merge-Readiness Notes

From a stale-CI-refresh perspective:

- `#182`, `#183`, `#184`, `#186`, `#189`, and `#190` now look merge-ready, subject to normal review
- `#188` is also green and clean after refresh, but it remains a major test-tooling update and should still receive explicit reviewer attention before merge

Not recommended in this slice:

- no merge was performed
- no PR was closed
- no recreate recommendation is needed for these seven PRs anymore

## Explicitly Out Of Scope

- `#185` `@eslint/js` remains a separate fix slice
- `#187` `zod` remains a separate fix slice
- no manual dependency upgrades
- no package or lockfile edits
- no runtime code edits
- no GitHub environment, secret, ruleset, branch-protection, or deployment-gate changes

## Recommended Next Slice

Next recommended order:

1. Merge or review the now-green stale Dependabot PRs individually.
2. Implement the separate fix slice for `#185` `@eslint/js`.
3. Implement the separate fix slice for `#187` `zod`.
4. Return to `AI Cost and Abuse Guardrails`.
