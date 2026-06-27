# StreamOS Branding Hosted-Evidence Recheck

Date: 2026-06-27

Scope: read-only recheck of branding hosted readiness after the P5 closeout,
branch-governance triage, and unique-history branch decision audit.

## Decision

`blocked`

- Hosted evidence is no longer missing, but it is not clean.
- The Vercel production environment inventory currently violates the documented
  `apps/web` env-ownership policy.
- The hosted branding evidence script still reports
  `serverFilterReady: blocked`, while the active web read model on `main`
  already treats the P5.14 derived-status gate as enabled.
- `Brand Asset Replace Contract Hardening` should not start until both drifts
  are reconciled.

## Current Repo State

- current branch: `main`
- current `main` SHA: `9760cf628489c9e77678eca30fbfc27be2add24c`
- `main == origin/main`: yes
- worktree at start: clean
- `pnpm branch:audit`:
  - total branches: `30`
  - `needs rename`: `7`
  - `temporary ops`: `8`

## Target Environment

`hosted`

Evidence in this report comes from:

- pulled Vercel `production` env inventory under `.vercel`
- read-only hosted branding DB evidence via `SUPABASE_DB_URL`

The Vercel side is explicitly `production`. The DB side is hosted and
successful, but this report does not independently prove a canonical hosted
project/ref binding beyond the configured `SUPABASE_DB_URL` target.

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

Result: `blocked`

Observed forbidden env names in the pulled Vercel `production` inventory:

- `SB_POSTGRES_DATABASE`
- `SB_POSTGRES_HOST`
- `SB_POSTGRES_PASSWORD`
- `SB_POSTGRES_PRISMA_URL`
- `SB_POSTGRES_URL`
- `SB_POSTGRES_URL_NON_POOLING`
- `SB_POSTGRES_USER`
- `SB_SUPABASE_JWT_SECRET`
- `SB_SUPABASE_SECRET_KEY`
- `SB_SUPABASE_SERVICE_ROLE_KEY`
- `TWITCH_CLIENT_ID`
- `TWITCH_REDIRECT_URI`
- `TWITCH_SCOPES`

Interpretation:

- `apps/web` is currently carrying privileged Supabase integration/database env
  names that belong in Railway services/workers, not in Vercel.
- the pulled Vercel inventory also carries gateway-owned Twitch OAuth config
  names that belong in `services/api-gateway`, not in `apps/web`
- no secret values were printed, but the key ownership drift is real and
  blocking for the next branding mutation slice

### Hosted Branding DB Evidence

Command:

```bash
pnpm db:branding-evidence -- --env-file .env --format text
```

Result:

- `repoReady: passed`
- `hostedMigrationReady: passed`
- `hostedIndexReady: passed`
- `serverFilterReady: blocked`
- `readyForP514: yes`

Interpretation:

- the hosted DB contract for derived branding statuses and tenant-scoped query
  indexes is present
- the same script still hardcodes `requires_server_filter_activation` and
  reports `previewServerQueryable: false` and `metadataServerQueryable: false`
- this is inconsistent with the active web branding read model on current
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

`blocked`

- actual pulled Vercel production env inventory contains forbidden
  Supabase-admin and gateway-owned provider keys
- code search in `apps/web` found no active runtime dependency on
  `SUPABASE_SERVICE_ROLE_KEY`, `APP_ENCRYPTION_KEY`, `OPENAI_API_KEY`,
  `REDIS_URL`, `RAILWAY_*`, `TWITCH_*`, `YOUTUBE_*`, `TIKTOK_*`, or `KICK_*`
  outside redaction/tests
- the blocker is hosted env ownership drift, not a newly introduced code path

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

- hosted DB evidence and active app activation evidence are not represented by
  the same gate model yet

## Branding UI / Read-Model Status

Status: `passed_with_warnings`

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

Warning:

- the active web slice enables the P5.14 gate through
  `BRANDING_DASHBOARD_P514_DERIVED_STATUS_QUERY_GATE`, but the hosted branding
  evidence script still reports the activation step as blocked

## Consistency Findings

### Consistent Evidence

- branch governance and unique-history blockers are already reduced to accepted
  residual warnings
- branding DB/storage contract is present and locally validated
- branding read-path remains private-bucket, signed-preview, no-public-url, and
  no-SVG

### Inconsistent Evidence

- [docs/p5-branding-closeout.md](./p5-branding-closeout.md) records
  `serverFilterReady` as activated in P5.14
- the active web implementation on `main` uses the P5.14 gate override and
  server-side derived-status filters
- [scripts/branding-hosted-evidence.cjs](../scripts/branding-hosted-evidence.cjs)
  still hardcodes:
  - `serverFilterReady: blocked`
  - `requires_server_filter_activation`
  - `previewServerQueryable: false`
  - `metadataServerQueryable: false`

This is an evidence-contract drift. Even without the Vercel blocker, it would
need reconciliation before a clean hosted-readiness pass could be claimed.

## Warnings

- `pnpm branch:audit` still reports `7` accepted `needs rename` cases
- the hosted DB target is only identified through the configured
  `SUPABASE_DB_URL`; this report does not add a stronger hosted project binding
- the branding DB evidence script and the active P5.14 web gate disagree on
  activation state

## Blockers

- Vercel `production` env ownership drift:
  forbidden Supabase-admin and Twitch gateway-owned env names are present in
  the pulled `apps/web` Vercel environment
- hosted evidence contract drift:
  the branding hosted evidence script still models `serverFilterReady` as
  blocked while the active web slice models it as enabled

## Final Recommendation

Decision for next slice:
`Brand Asset Replace Contract Hardening` is `not_recommended_yet`

Required follow-up before that slice:

1. run a dedicated env-ownership cleanup / evidence slice for the Vercel web
   project so `apps/web` no longer carries forbidden hosted env names
2. reconcile the hosted branding evidence script with the active P5.14 web gate
   so hosted-readiness reporting and runtime behavior describe the same state
3. only after those two blockers are closed, open a fresh mutation branch from
   `main` for `Brand Asset Replace Contract Hardening`

`Brand Asset Replace / Orphan-Cleanup` is not released by this report.
Orphan cleanup remains a later separate slice.
