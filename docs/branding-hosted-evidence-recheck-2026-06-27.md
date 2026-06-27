# StreamOS Branding Hosted-Evidence Recheck

Date: 2026-06-27

Scope: read-only recheck of branding hosted readiness after the P5 closeout,
branch-governance triage, and unique-history branch decision audit.

## Decision

`passed_with_warnings`

- The Vercel `apps/web` production inventory now validates clean against the
  documented env-ownership policy.
- The hosted branding evidence script now evaluates the active P5.14 server
  filter activation consistently with the branding web read path instead of
  hard-blocking `serverFilterReady`.
- The hosted DB target environment is now bound explicitly as `production`
  during the read-only evidence run.
- `Brand Asset Replace Contract Hardening` may start as the next slice, but the
  DB target proof still relies on the configured `SUPABASE_DB_URL` plus the
  explicit target-environment binding rather than a separately pinned hosted
  project/ref identifier.

## Current Repo State

- current branch: `codex/fix-branding-hosted-evidence-closeout`
- current `main` SHA: `da9748f3e51c3197df86874f6761adb2ae3ba8f4`
- `main == origin/main`: yes
- worktree at start: clean
- `pnpm branch:audit`:
  - total branches: `30`
  - `needs rename`: `7`
  - `temporary ops`: `8`

## Target Environment

`hosted`

Evidence in this report comes from:

- pulled Vercel `production` env inventory under `apps/web/.vercel`
- read-only hosted branding DB evidence via `SUPABASE_DB_URL`
  plus `--target-environment production`

The Vercel side is explicitly `production`. The DB side is also explicitly
bound as `production` for this recheck, but this report still does not
independently prove a canonical hosted project/ref binding beyond the
configured `SUPABASE_DB_URL` target plus the explicit target-environment flag.

## Sources Reviewed

- [docs/p5-branding-closeout.md](./p5-branding-closeout.md)
- [docs/maintenance-closeout-matrix.md](./maintenance-closeout-matrix.md)
- [docs/branch-governance-triage-2026-06-27.md](./branch-governance-triage-2026-06-27.md)
- [docs/branch-unique-history-decision-2026-06-27.md](./branch-unique-history-decision-2026-06-27.md)
- [docs/deployment.md](./deployment.md)
- [docs/architecture.md](./architecture.md)
- [docs/operator-live-env-audit.md](./operator-live-env-audit.md)
- [apps/web/src/app/dashboard/branding/data.ts](../apps/web/src/app/dashboard/branding/data.ts)
- [apps/web/src/app/dashboard/branding/preview.ts](../apps/web/src/app/dashboard/branding/preview.ts)
- [apps/web/src/app/dashboard/branding/actions.ts](../apps/web/src/app/dashboard/branding/actions.ts)
- [apps/web/src/components/modules/BrandingDashboardConsole.utils.ts](../apps/web/src/components/modules/BrandingDashboardConsole.utils.ts)
- [packages/types/src/branding-dashboard.ts](../packages/types/src/branding-dashboard.ts)
- [scripts/branding-hosted-evidence.cjs](../scripts/branding-hosted-evidence.cjs)
- [scripts/validate-vercel-env.cjs](../scripts/validate-vercel-env.cjs)

## Local Checks

- `git status --short --branch`
- `git rev-parse --abbrev-ref HEAD`
- `git rev-parse HEAD`
- `git rev-parse origin/main`
- `pnpm branch:audit`
- `pnpm db:validate-security`
- `node --test scripts/branding-hosted-evidence.test.cjs scripts/vercel-env-policy.test.cjs`

Result:

- repo state is clean and aligned with `origin/main`
- branch-hygiene warnings remain documented but unchanged from the post-PR-#153
  state
- local contract validators for branding DB evidence and Vercel env policy pass

## Hosted Checks

### Vercel Env Ownership

Command:

```bash
pnpm vercel:audit -- --vercel-dir .vercel --environment production
```

Result: `passed`

Observed result in the pulled Vercel `production` inventory:

- no forbidden `SB_POSTGRES_*` keys remain
- no forbidden `SB_SUPABASE_*` keys remain
- no forbidden `TWITCH_*` keys remain

Interpretation:

- `apps/web` now validates down to the web-owned env contract only
- no secret values were printed and no forbidden provider-/DB-/service-secret
  names remain in the pulled Vercel production inventory
- the previous env-ownership blocker is closed for this recheck

### Hosted Branding DB Evidence

Command:

```bash
pnpm db:branding-evidence -- --env-file .env --target-environment production --format text
```

Result:

- `repoReady: passed`
- `hostedMigrationReady: passed`
- `hostedIndexReady: passed`
- `hostedBindingReady: passed`
- `serverFilterReady: passed`
- `readyForP514: yes`

Interpretation:

- the hosted DB contract for derived branding statuses and tenant-scoped query
  indexes is present
- the same script now validates the active P5.14 server-filter activation
  against the repo read path and reports `previewServerQueryable: true` and
  `metadataServerQueryable: true`
- this is now consistent with the active web branding read model on current
  `main`

## Env Ownership Status

### Expected `apps/web` Ownership

Per deployment docs, Vercel web ownership is limited to:

- `APP_URL`
- `NEXT_PUBLIC_APP_URL`
- `API_GATEWAY_URL`
- `API_GATEWAY_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `STREAMOS_DEMO_MODE`
- `APP_ENV`

### Forbidden In `apps/web`

The documented denylist includes:

- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_ENCRYPTION_KEY`
- `OPENAI_API_KEY`
- Redis URLs
- Railway private URLs
- provider OAuth secrets/config owned by `services/api-gateway`

### Current Status

`passed`

- actual pulled Vercel production env inventory is clean for the documented
  denylist
- code search in `apps/web` found no active runtime dependency on
  `SUPABASE_SERVICE_ROLE_KEY`, `APP_ENCRYPTION_KEY`, `OPENAI_API_KEY`,
  `REDIS_URL`, `RAILWAY_*`, `TWITCH_*`, `YOUTUBE_*`, `TIKTOK_*`, or `KICK_*`
  outside redaction/tests
- the previously blocked inventory drift was environmental, not a newly
  introduced code path, and is now closed

## Schema / Storage Readiness

Status: `passed_with_warnings`

Confirmed read-only evidence:

- `pnpm db:validate-security` passed for tenant tables, composite tenant
  foreign keys, and `brand-assets` private storage policies
- branding hosted DB evidence passed for:
  - generated derived-status columns
  - derived-status constraint contract
  - derived-status resolver functions
  - tenant-scoped derived-status query indexes

Repo contract remains consistent with branding storage rules:

- `brand-assets` bucket remains private
- object paths remain tenant-/user-scoped
- signed preview URLs are server-created only
- durable `public_url` dependence is not part of the flow
- SVG remains blocked

Residual warning:

- hosted DB target provenance is explicit for this run, but still not pinned to
  a separately surfaced hosted project/ref identifier inside the report

## Branding UI / Read-Model Status

Status: `passed`

Confirmed on current `main`:

- `/dashboard/branding` route exists via
  [apps/web/src/app/dashboard/branding/page.tsx](../apps/web/src/app/dashboard/branding/page.tsx)
- feed reads use server-side filters on:
  - `preview_capability_status`
  - `upload_metadata_status`
- feed metadata exports `serverFilters`, `serverSort`, and the active derived
  status gate
- previews are created server-side via
  `storage.createSignedUrl(...)` in
  [preview.ts](../apps/web/src/app/dashboard/branding/preview.ts)
- upload writes persist `public_url: null` and use the private
  `brand-assets` bucket
- tests explicitly assert:
  - no `public_url` dependency
  - no raw `brand-assets/` path leakage in rendered HTML
  - no `SUPABASE_SERVICE_ROLE_KEY` leakage
  - SVG upload remains blocked
  - `replace` and `orphan_cleanup` stay disabled

The active web slice and the hosted branding evidence script now agree on the
P5.14 activation state.

## Consistency Findings

### Consistent Evidence

- branch governance and unique-history blockers are already reduced to accepted
  residual warnings
- branding DB/storage contract is present and locally validated
- branding read-path remains private-bucket, signed-preview, no-public-url, and
  no-SVG

### Inconsistent Evidence

None after this fix slice. The hosted branding evidence script now checks the
active P5.14 web gate and derived-status filter path instead of carrying a
hard-coded pre-activation assumption.

## Warnings

- `pnpm branch:audit` still reports `7` accepted `needs rename` cases
- the hosted DB target still depends on the configured `SUPABASE_DB_URL` plus
  the explicit `--target-environment production` binding, not on a separately
  surfaced hosted project/ref identifier

## Blockers

None for this recheck.

## Final Recommendation

Decision for next slice:
`Brand Asset Replace Contract Hardening` is `recommended_with_warnings`

Required follow-up before that slice:

1. open a fresh mutation branch from current `main` for
   `Brand Asset Replace Contract Hardening`
2. keep the explicit hosted target-environment binding in the evidence command
   until a stronger canonical hosted project/ref proof is surfaced
3. keep `Brand Asset Replace / Orphan-Cleanup` as a separate later slice

`Brand Asset Replace / Orphan-Cleanup` is not released by this report.
Orphan cleanup remains a later separate slice.
