# StreamOS Branch Governance

This document defines the branch naming, review, and cleanup model for the
StreamOS monorepo. It is a repository hygiene guide only; it does not replace
GitHub branch protection, GitHub Environment rules, or the production-gate
process described in [deployment.md](deployment.md).

## Goals

- Keep `main` stable and production-ready.
- Keep release branches reviewable while release evidence is being collected.
- Make branch purpose obvious from the name.
- Avoid stale merged branches accumulating locally or on `origin`.
- Preserve CODEOWNERS review for security, deployment, database, worker, and
  provider-owned areas.

## Protected Branches

Permanent protected branch:

- `main`

Release and release-candidate branches:

- `release/*`

Rules for protected branches:

- Do not force-push.
- Do not push directly to `main`.
- Use pull requests for integration.
- Keep required CI, security, Vercel, and deployment checks enabled.
- Do not bypass production-gate evidence with a local diagnostic run.

## Branch Naming

Use one of these patterns for human-created branches:

- `feature/<scope>/<short-description>`
- `fix/<scope>/<short-description>`
- `chore/<scope>/<short-description>`
- `release/<short-description>`

Recommended scopes:

- `web`
- `api`
- `automation`
- `worker`
- `queue`
- `types`
- `database`
- `config`
- `ci`
- `docs`
- `infra`
- `repo`

Examples:

- `feature/web/publication-review-flow`
- `fix/api/oauth-relative-redirects`
- `chore/infra/railway-worker-audit`
- `fix/database/publication-rls`
- `release/publishing-scheduling-rc`

Automation-managed prefixes are exempt from the human naming convention:

- `dependabot/*`
- `codex/*`
- `railway/*`

These branches should remain short-lived and should be merged, closed, or
deleted only after their PR and release evidence are resolved.

## Review Ownership

CODEOWNERS is the source of truth for repository review ownership. The current
repository is single-owner, but the file intentionally lists critical areas so
future team ownership can be introduced without weakening coverage.

Critical areas that require careful review:

- `.github/workflows/*`
- `Dockerfile*`, `compose.yaml`, and deployment scripts
- `docs/deployment.md` and release-gate runbooks
- `scripts/*rollout*`, `scripts/*audit*`, and deployment proof scripts
- `packages/database/**` and Supabase migrations
- `packages/queue/**` and shared job contracts
- `services/api-gateway/**`
- `services/automation-service/**`
- `workers/**`
- `apps/web/**` Vercel-owned web surfaces

CODEOWNERS changes must not remove review coverage for security-sensitive,
deployment-sensitive, database, provider, worker, or browser/server-boundary
paths.

## Branch Lifecycle

Use this lifecycle for normal work:

1. Create a scoped branch from current `main`.
2. Keep the branch focused on one reviewable concern.
3. Open a pull request into `main`, or into a release branch when explicitly
   staging a release-candidate integration.
4. Wait for required checks and review.
5. Merge only after the diff is in scope and secret-safe.
6. Delete merged branches only during an explicit cleanup slice.

Do not merge stale draft PRs directly. If an old PR contains useful work,
extract the still-relevant scope into a fresh branch from current `main`.

## Audit Workflow

Before any branch mutation, run the read-only audit:

```bash
pnpm branch:audit
```

Useful variants:

```bash
pnpm branch:audit -- --format both
pnpm branch:audit -- --no-gh
pnpm branch:audit -- --active-days 30 --abandoned-days 60
```

The audit checks branch inventory, last commit metadata, merge state against
`main`, references in GitHub workflows and deployment documentation, local dirty
worktree state, and open GitHub pull requests when `gh` is available.

## GitHub And CI Checklist

External GitHub or CI audit notes are inputs, not source of truth. Before any
branch mutation or CI/deploy-adjacent debugging, classify findings into these
blocks:

- `Branch-Sicherheit`: open PRs, head branch binding, base branch, draft/review
  state, merge status, divergence, and worktree collisions.
- `Workflow-/Deploy-Relevanz`: workflow triggers, GitHub Environment bindings,
  deployment branch rules, concurrency behavior, release paths, and rollback
  paths.
- `Secret-/Runtime-Sicherheit`: Railway/Vercel secret scope, `NEXT_PUBLIC_*`
  boundaries, and private-network smoke or rollout checks.

Repo-first workflow mapping must preserve the active repository files,
environment bindings, and branch triggers. External audit wording must not
override `.github/workflows/*`, `docs/deployment.md`, or the branch-governance
policy.

## Cleanup Rules

Classify branches before deletion:

- `protected`: `main` and `release/*`
- `active`: recent branch with an open PR or current owner
- `merged`: already integrated and safe to delete after review
- `superseded`: replaced by a newer branch or PR
- `stale`: no recent activity and no open PR
- `manual_review_required`: unclear ownership, unique diffs, or release impact

Safe deletion requires all of the following:

- The branch is not protected.
- The branch has no open PR.
- The branch has no unique diffs that need extraction.
- The branch is not referenced by active release, deployment, or evidence
  workflows.
- The cleanup was requested or explicitly approved.

Do not delete `dependabot/*`, `archive/*`, release branches, or worktrees as
part of unrelated feature work.

## Release And Environment Rules

Branch governance must not weaken the release process:

- Production promotion still requires the proof-capable Railway
  `release-gate-runner` and a successful hosted production gate.
- A local diagnostic is never a production proof.
- Real provider publishing is not part of a generic production gate.
- GitHub Environment reviewer, wait timer, branch restriction, and deployment
  rules remain deployment controls and must not be bypassed by branch cleanup.
- Worker services must remain private; `api-gateway` is the only public backend
  service.

P4 work remains blocked until the explicit M3/M4 cleanup and validation steps
are complete.

## Secret Safety

Branch, PR, and cleanup reports must never include:

- secret values;
- provider access or refresh tokens;
- Supabase service-role values;
- Redis URLs;
- database admin URLs;
- OpenAI or provider API keys;
- private Railway URLs with sensitive details.

It is acceptable to mention environment variable names when reviewing ownership,
but never include actual values.
