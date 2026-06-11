# StreamOS Branch Governance

This document defines the branch naming, cleanup, and protection model for the
StreamOS monorepo.

## Goals

- Keep `main` and `develop` stable.
- Make branch purpose obvious from the name.
- Avoid stale merged branches piling up locally or on `origin`.
- Align review ownership with workspace boundaries.
- Protect deployment branches without slowing down feature work.

## Protected Branches

Permanent protected branches:

- `main`
- `develop`

Pattern-protected branches:

- `release/*`

Do not use force-push or direct commits on these branches.

## Branch Naming

Use one of these patterns:

- `feature/<scope>/<short-description>`
- `fix/<scope>/<short-description>`
- `chore/<scope>/<short-description>`
- `release/<version>`

Recommended scopes for this repository:

- `web`
- `api-gateway`
- `automation-service`
- `workers`
- `database`
- `types`
- `ui`
- `infra`
- `repo`

Examples:

- `feature/web/platform-connections-dashboard`
- `fix/api-gateway/youtube-oauth-callback`
- `chore/infra/railway-staging-healthcheck`
- `fix/database/metrics-snapshot-hourly-dedupe`
- `release/1.4.0`

Automation-managed branch prefixes are exempt from the human naming convention:

- `dependabot/*`
- `codex/*`
- `railway/*`

These branches should stay short-lived. Merge or delete them once the related
automation run or pull request is complete.

## Branch Lifecycle

Create feature branches from `main` unless a release or hotfix process requires
another base branch.

Use this lifecycle:

1. Create a scoped branch with the naming convention above.
2. Open a pull request into `main` for production-bound work.
3. Merge using squash merge for `feature/*`, `fix/*`, and `chore/*`.
4. Delete the remote branch after merge.
5. Delete the local branch after confirming the merge landed cleanly.

`develop` is reserved for staging deployment flow and integration validation.
Avoid long-lived feature work directly on `develop`.

## Cleanup Rules

Classify branches with these rules:

- `protected`: `main`, `develop`, `release/*`
- `active`: recent commits or an open pull request
- `merged`: merged into `main` and safe to delete after review
- `stale`: no recent activity and no open pull request
- `rename`: active branch that does not follow the naming convention

Safe deletion requires all of the following:

- The branch is not protected.
- The branch has no open pull request.
- The branch is merged into `main` or intentionally abandoned.
- The branch is not referenced by active deployment or release automation.

## GitHub Protection Rules

StreamOS currently uses these GitHub workflows:

- `CI` in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
- `CD - Staging Deployment` in [`.github/workflows/deploy-staging.yml`](../.github/workflows/deploy-staging.yml)
- `CD - Production Deployment` in [`.github/workflows/deploy-production.yml`](../.github/workflows/deploy-production.yml)
- `Security & Dependency Checks` in [`.github/workflows/security.yml`](../.github/workflows/security.yml)

Recommended protection for `main`:

- Require a pull request before merging.
- Require at least 1 approving review.
- Dismiss stale approvals on new commits.
- Require conversation resolution before merge.
- Require code owner review after the repository has multiple maintainers.
- Require the CI validation check from `CI`.
- Block force pushes.
- Block branch deletion.

Recommended protection for `develop`:

- Require a pull request before merging.
- Require at least 1 approving review.
- Require the CI validation check from `CI`.
- Block force pushes.
- Block branch deletion.

Recommended protection for `release/*`:

- Require a pull request before merging.
- Require linear history.
- Block force pushes.
- Block branch deletion.

Merge strategy:

- Use squash merge for `feature/*`, `fix/*`, and `chore/*`.
- Reserve merge commits for release branches only when preserving release
  context is useful.

## Current Platform Limitation

GitHub branch protection and repository rulesets are not available for this
private repository on the current plan. GitHub returns `403` for branch
protection and ruleset API endpoints unless the repository is made public or
the account is upgraded to GitHub Pro.

Until that changes:

- Use pull requests as the default integration path.
- Avoid direct pushes to `main` and `develop`.
- Keep `CODEOWNERS` current.
- Enforce review discipline operationally.

## Ownership

Code ownership lives in [`.github/CODEOWNERS`](../.github/CODEOWNERS). The
current file is intentionally minimal and valid for the present single-owner
setup. If StreamOS moves to a multi-maintainer team, replace the username-based
entries with organization teams and enable required code owner reviews on
protected branches.
