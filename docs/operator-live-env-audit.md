# StreamOS Live Environment Audit Runbook

This runbook defines how operators collect and classify staging and production
environment evidence. It is intentionally read-only: it does not authorize
deployments, restarts, environment changes, provider writes, or Supabase
mutations.

Use this runbook when validating hosted StreamOS environments before release
approval, after a deployment incident, or when comparing `staging` and
`production` for drift.

## Scope

Allowed target modes:

- `staging`: hosted Railway and Vercel staging or preview evidence only.
- `production`: hosted Railway and Vercel production evidence only.
- `cross-env`: compares `staging` and `production` for hosted drift.
- `local diagnostic`: local troubleshooting only. It is never production proof.

Valid live evidence must be reproducible, secret-safe, and tied to the target
environment. A production proof is valid only when it comes from the deployed
`release-gate-runner` or an equivalent proof-capable Railway runtime in the
same project, environment, and release-candidate snapshot.

## Evidence Operators May Collect

Collect names, presence, statuses, classifications, and non-secret identifiers.
Do not collect values for secrets or private credentials.

Allowed evidence:

- Railway service inventory for the target environment.
- Railway service type and public networking or public domain status.
- Deployment SHA, release-candidate SHA, and runtime provenance.
- API Gateway `/health` status and non-secret runtime provenance headers.
- Environment variable key presence and ownership, without values.
- Worker privacy evidence: no public networking and no public domain.
- Vercel environment key presence and ownership, without values.
- Queue/schema readiness evidence from approved audit or gate output.
- Protected observability route status, without raw payloads or secrets.
- `release-gate-runner` proof capability and production-gate proof marker.
- Railway audit Markdown and JSON outputs when both support the same decision.

## Evidence Operators Must Not Collect

Forbidden evidence:

- Secret values, provider tokens, refresh tokens, authorization codes, API keys,
  webhook secrets, encryption keys, Redis URLs, or Supabase service-role values.
- Private URLs that include credentials, tokens, or query-string secrets.
- Raw provider webhook payloads or provider write responses.
- Screenshots, logs, or markdown reports that reveal secrets.
- Real YouTube, TikTok, Kick, Twitch, or other third-party writes.
- Live database mutations outside an explicitly approved production-gate flow.
- Local diagnostic output presented as production proof.

If forbidden evidence appears in a report, stop using that artifact, rotate any
exposed credential according to the incident process, and classify the audit as
`blocked` until a clean evidence set exists.

## Required Evidence Areas

### Repo Validation vs Hosted Proof

Keep these evidence classes separate:

- Repo validation proves the checked-in contract. Examples:
  `pnpm db:validate-security`, package tests, migration review, and CI status.
- Local diagnostic proves a local setup can exercise part of the contract. It
  can explain failures, but it is not hosted staging or production evidence.
- Hosted staging audit proves the live staging environment matches the repo
  contract for service inventory, env ownership, Supabase schema/RLS/storage,
  and Vercel policy.
- Hosted production audit proves the live production environment matches the
  same contract. It is required separately from CI and local diagnostics.

CI and local tests can support the evidence package, but they must not be
classified as hosted drift proof or production proof.

### Railway Service Inventory

Confirm that every expected Railway service exists in the audited environment:

- `api-gateway`
- `automation-service`
- `stream-job-worker`
- `transcription-worker`
- `clip-worker`
- `repurposing-worker`
- `content-job-retry-worker`
- `publishing-worker`
- `publishing-scheduler-worker`
- `release-gate-runner`

`api-gateway` is the only public backend entrypoint. Worker services and
`release-gate-runner` must remain private and must not have public domains.

### Railway Env Ownership

The audit may show only env names and presence. It must never show values.

Ownership rules:

- `api-gateway` owns provider OAuth config, provider webhook secrets, YouTube
  WebSub verification, gateway auth, Redis-backed gateway state, and Supabase
  service-role writes for gateway-owned commands.
- `automation-service` owns OpenAI or AI-provider credentials and model config.
- Workers own Redis, Supabase service-role keys, queue names, concurrency, and
  private Automation Service URLs only when their runtime calls Automation.
- `publishing-worker` owns provider credentials needed for approved provider
  writes; it must not require `AUTOMATION_SERVICE_URL`.
- `publishing-scheduler-worker` owns scheduler queue/database access only; it
  must not own provider write secrets or `AUTOMATION_SERVICE_URL`.
- `release-gate-runner` owns proof-only env names required by the production
  gate. It is not a product service.

### Vercel Env Ownership

`apps/web` on Vercel may own only web-facing or web-server values such as:

- `APP_URL`
- `NEXT_PUBLIC_APP_URL`
- `API_GATEWAY_URL`
- `API_GATEWAY_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` for legacy compatibility
- `STREAMOS_DEMO_MODE`
- `APP_ENV`

`apps/web` must not own provider secrets, Redis URLs, OpenAI or Replicate
credentials, Supabase service-role keys, encryption keys, webhook secrets,
Railway private URLs, or `YOUTUBE_WEBSUB_VERIFY_TOKEN`.

### Production Gate and Runner Proof Capability

`pnpm rollout:check:production` is the only promotable production gate. It must
run from `release-gate-runner` or an equivalent proof-capable Railway runtime
that:

- is in the same Railway project as the release candidate;
- is in the same Railway environment as the release candidate;
- contains the same RC SHA as the deployed candidate;
- contains the gate-required monorepo files and workspace sources;
- can reach the private Automation Service through Railway private networking;
- proves API Gateway runtime provenance against the same RC SHA and environment.

A local shell, stopped runner, generic helper shell, Vercel function, or runtime
missing gate-required files is not proof-capable. A green
`pnpm rollout:check:local` result is useful troubleshooting evidence, but it is
not production proof.

### Audit Report Consistency

When Markdown and JSON Railway audit outputs are both collected, they must
support the same decision. A contradiction between Markdown and JSON is a
report-contract problem and the evidence is not complete.

Recommended operator pattern:

```bash
pnpm railway:audit --env staging --format markdown
pnpm railway:audit --env staging --format json
pnpm railway:audit --env production --format markdown
pnpm railway:audit --env production --format json
pnpm railway:audit --environments staging,production --format markdown
pnpm railway:audit --environments staging,production --format json
```

Do not commit generated live audit reports unless a release process explicitly
asks for a redacted artifact. Never paste secret values into reports.

## Hosted Drift Audit Matrix

Use these matrices after the generic environment inventory has been collected.
Record only names, presence, ownership, policy status, and non-secret
identifiers. Missing hosted evidence is `incomplete`, not `passed`.

### Branding

Repo contract:

- `brand_assets` stores tenant-owned brand metadata.
- The `brand-assets` Supabase Storage bucket is private.
- Object paths start with the owning user id.
- Authenticated storage policies allow only owner-scoped select, insert, and
  delete.
- Update/upsert remains disabled until replace semantics are explicitly
  specified.
- Runtime preview uses short-lived server-created signed URLs.
- Durable `public_url` dependence is not part of the MVP contract.
- SVG and other script-capable upload types remain blocked unless a future safe
  sanitizing flow is explicitly added.

| Evidence item        | Secret-safe evidence                                  | `passed` requirement                                                                              | Blocker if                                                                                              | Warning if                                                                 |
| -------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `brand_assets` table | Table name, column presence, migration/version marker | Hosted table is present and compatible with repo columns used by the web runtime                  | Table is missing or incompatible while a live branding route is active                                  | Branding route is not active and table provisioning is explicitly deferred |
| Tenant scope         | `user_id` column and RLS policy names/status          | `user_id` exists and RLS is enabled with tenant-safe predicates                                   | RLS is disabled or cross-tenant read/write is possible                                                  | Evidence is partial and no live route depends on it                        |
| Storage bucket       | Bucket name and public/private status                 | `brand-assets` exists and is private when upload runtime is active                                | Bucket is public, wrong bucket is used, or public URLs are required                                     | Bucket not provisioned yet and no live upload flow is enabled              |
| Storage policies     | Policy names and owner-path predicate presence        | Authenticated users can only select, insert, and delete first path segment matching their user id | Policy allows anon access, cross-tenant access, or update/upsert without an approved replace flow       | Operator hardening remains but owner access is safe                        |
| Preview flow         | Route/server action names and status                  | Signed preview URL creation stays server-side and short-lived                                     | Browser receives storage metadata sufficient to bypass tenant checks or relies on permanent public URLs | Preview route not active yet but contract is documented                    |
| `public_url` use     | Column/read-model presence and selected fields        | Runtime does not persist or depend on durable `public_url` for private brand assets               | Hosted flow requires public URLs for private assets                                                     | Legacy nullable column exists but is not read as success                   |
| Upload type safety   | Allowed MIME/type list and UI/runtime status          | SVG/script-capable types are blocked or explicitly marked not released                            | SVG upload is accepted without a sanitizing flow                                                        | Upload runtime is disabled and future type policy remains TODO             |

### Monetization

Repo contract:

- `monetization_events` and `monetization_summaries` are tenant-owned.
- Authenticated users may read their own rows.
- Ingestion, event writes, and summary materialization stay service-side or
  service-role-owned.
- Provider event idempotency stays tenant-scoped with leading `user_id`.
- Dashboard reads must not treat missing hosted data as proof that hosted state
  is correct.

| Evidence item                  | Secret-safe evidence                                  | `passed` requirement                                                       | Blocker if                                                                    | Warning if                                                         |
| ------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `monetization_events` table    | Table name, column presence, migration/version marker | Hosted table is present and compatible with repo read model                | Table missing while live monetization read flow is active                     | UI is read-only and feature is explicitly not active in target env |
| `monetization_summaries` table | Table name, column presence, migration/version marker | Hosted summary table is present and compatible with dashboard read model   | Table missing while dashboard reads summaries                                 | Hosted data is empty but table/RLS contract is correct             |
| Tenant-safe reads              | RLS status, grants, policy names                      | Authenticated reads are scoped to `user_id`                                | Cross-tenant read is possible or RLS is disabled                              | Evidence names are present but policy text needs manual review     |
| Service-side writes            | Grants and write-policy status                        | Authenticated insert/update/delete are not granted for monetization tables | Client/authenticated writes are allowed without server-side mediation         | No ingestion runtime is active but write owner is documented       |
| Provider idempotency           | Index name and leading columns                        | Provider event unique index is tenant-scoped by leading `user_id`          | Global provider event uniqueness can collide across tenants                   | No provider ingestion active yet and drift is documented           |
| Secret ownership               | Vercel/Railway env name inventory only                | Payment/provider secrets are absent from `apps/web` and Vercel             | Provider/payment/service-role secrets appear in Vercel or browser env         | Optional provider config is absent because ingestion is not active |
| Empty hosted state             | Dashboard state and table presence                    | Empty data is displayed as empty state, not proof of schema correctness    | Tests or audit mark empty hosted data as `passed` without schema/RLS evidence | Empty data is expected and schema/RLS evidence is complete         |

### Tests and CI

Repo contract:

- CI validates the repository contract and uses fixtures, not live secrets.
- Pull request tests must not require hosted Supabase, Railway, Vercel, provider
  accounts, private URLs, or real credentials.
- Hosted drift is a separate operator audit step.
- Production proof requires the production gate from a proof-capable Railway
  runtime, not CI alone.

| Evidence item       | Secret-safe evidence                              | `passed` requirement                                                             | Blocker if                                                                | Warning if                                                                 |
| ------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| CI status           | Check names and conclusions                       | Required CI checks pass without live credentials                                 | CI requires live secrets or hosted state for pull requests                | Optional visual/UI checks are absent but contract/security tests exist     |
| Test fixtures       | Fixture names and host class                      | Fixtures contain no private URLs, credentials, tokens, or real provider payloads | Fixture includes a real secret, tokenized URL, private URL, or credential | Fixture uses documented public non-sensitive media for local/e2e proof     |
| Database validation | `pnpm db:validate-security` status                | Repo migrations pass local security validation                                   | Validator fails or is bypassed while claiming hosted safety               | Validator passes but hosted audit is still pending                         |
| Vercel policy       | `pnpm test:vercel-audit` and env inventory status | Vercel policy blocks server-only keys and provider-owned config                  | Vercel contains server-only/provider secrets or private Railway URLs      | Unexpected non-blocked Vercel keys need operator review                    |
| Railway audit       | Audit command and artifact status                 | Hosted audit is collected for target env and classified separately from CI       | Hosted drift is marked `passed` only because local tests are green        | Hosted audit unavailable and release decision remains `incomplete`         |
| Production proof    | Gate command and proof marker status              | Production proof marker is verified from `release-gate-runner`                   | CI status is used as production proof                                     | Production proof not needed for a non-production documentation-only review |

## Final Decision States

Use exactly one final decision:

- `passed`: all required evidence is present, all blockers are absent, and
  Markdown/JSON reports agree.
- `passed_with_warnings`: all blockers are absent, required evidence is
  complete, and only documented non-blocking warnings remain.
- `blocked`: at least one blocker exists, forbidden evidence was collected, or
  a proof used an invalid runtime.
- `incomplete`: evidence is missing, contradictory, unverifiable, or not tied
  to the target environment.

`incomplete` is not a softer `passed`. It means the operator cannot make a
release decision from the current evidence.

## Blocker Catalog

Classify the audit as `blocked` when any item below is true:

- Required service missing from the target Railway environment.
- Any worker or `release-gate-runner` has public networking or a public domain.
- Required env name missing for the owning runtime.
- Secret or provider config is assigned to the wrong service.
- Provider secrets, Redis, OpenAI, Supabase service-role, encryption keys,
  webhook secrets, or Railway-private URLs are present in `apps/web` or Vercel.
- `release-gate-runner` is missing, stopped, not proof-capable, or not from the
  same RC SHA, Railway project, and environment as the release candidate.
- API Gateway runtime provenance is missing or does not match the RC SHA.
- A local diagnostic is presented as production proof.
- Schema, queue, or required env drift exists between hosted runtime and code.
- Protected observability routes are exposed without server-to-server auth.
- Railway Markdown and JSON audit outputs disagree on the decision.
- A real third-party provider write occurs during audit or production proof.
- Hosted drift touches required envs, service presence, worker privacy, schema,
  queue contracts, or runtime provenance.
- A report, screenshot, or log contains secret values or provider tokens.
- Branding Storage is public, cross-tenant, or dependent on permanent public
  URLs for private assets.
- Hosted `brand_assets`, `monetization_events`, or `monetization_summaries`
  schema is incompatible with active live routes.
- Monetization RLS/grants allow cross-tenant reads or client-side writes.
- CI or fixtures require live secrets, private URLs, hosted state, or real
  provider/payment credentials for pull-request validation.
- Local-only tests or CI are used as hosted drift proof.

## Warning Catalog

Classify as `passed_with_warnings` only when every blocker is absent and the
warning is documented:

- Non-blocking hosted drift that does not affect required envs, service
  presence, worker privacy, schema, queues, provenance, or secret ownership.
- Optional operator hardening remains, such as stricter review settings.
- Local Docker or local private-networking is unavailable for a local
  diagnostic only. This cannot be used to waive production proof.
- Informational audit extras or unknown optional env names are reviewed and
  accepted as non-owning or local-only.
- Branding upload runtime is not active yet, but the private storage contract is
  documented and repo validation is green.
- Monetization dashboard data is empty while hosted tables, RLS, and grants are
  compatible.
- `brand-assets` bucket provisioning is deferred only because no live upload
  route is enabled in the target environment.
- Optional visual/UI checks are absent while security, RLS, storage, env, and
  contract checks are present.

If a warning is not understood, classify the audit as `incomplete` until an
operator records why it is non-blocking.

## Incomplete Evidence Catalog

Classify as `incomplete` when no blocker is proven but the evidence cannot yet
support a decision:

- RC SHA, target environment, operator, or date is missing.
- Service inventory is partial or unavailable.
- Env ownership is known only from memory and not from an audit artifact.
- Worker privacy could not be verified.
- Vercel env ownership could not be verified.
- Production-gate proof marker is missing, malformed, or not verified.
- `release-gate-runner` proof capability was not checked.
- Runtime provenance or deployment SHA could not be tied to the target env.
- Markdown audit output exists but JSON was required for the release process and
  was not collected, or the reverse is true.
- Evidence was collected from the wrong environment.
- Hosted branding storage bucket or policies were not checked.
- Hosted monetization table, RLS, or grant state was not checked.
- CI/test fixture secret-safety was assumed but not reviewed.

## Evidence Completion Template

Use this template for `staging`, `production`, or `cross-env` sign-off. Fill it
with statuses and identifiers only. Do not paste secret values, tokenized URLs,
raw payloads, or screenshots that contain credentials.

```markdown
# StreamOS Live Env Audit Evidence

- Decision: `passed` / `passed_with_warnings` / `blocked` / `incomplete`
- Target: `staging` / `production` / `cross-env`
- RC SHA:
- Operator:
- Date:
- Source artifacts:
  - Railway markdown audit:
  - Railway JSON audit:
  - Vercel env audit:
  - Production-gate proof:
  - Runtime provenance:

## Services Checked

| Service                     | Environment | Present | Public networking/domain | Deployment / RC SHA | Notes |
| --------------------------- | ----------- | ------- | ------------------------ | ------------------- | ----- |
| api-gateway                 |             |         | public allowed           |                     |       |
| automation-service          |             |         | private required         |                     |       |
| stream-job-worker           |             |         | private required         |                     |       |
| transcription-worker        |             |         | private required         |                     |       |
| clip-worker                 |             |         | private required         |                     |       |
| repurposing-worker          |             |         | private required         |                     |       |
| content-job-retry-worker    |             |         | private required         |                     |       |
| publishing-worker           |             |         | private required         |                     |       |
| publishing-scheduler-worker |             |         | private required         |                     |       |
| release-gate-runner         |             |         | private required         |                     |       |

## Env Ownership Result

- Railway env presence result:
- Wrong-service ownership findings:
- Required env blockers:
- Optional env warnings:
- Secret-safe report confirmed: yes / no

## Vercel Env Result

- `apps/web` required env present:
- Forbidden Vercel env findings:
- Public URL policy result:
- Unexpected env warnings:

## Worker Privacy Result

- Workers private:
- Worker public domain findings:
- `api-gateway` public exception confirmed:

## Queue / Schema / Observability Result

- Queue names aligned:
- Schema readiness:
- Branding schema/storage readiness:
- Monetization schema/RLS readiness:
- Protected observability route status:
- Raw payloads omitted:

## Tests / CI Drift Result

- CI status:
- `pnpm db:validate-security` result:
- Fixture secret-safety result:
- Hosted drift represented as separate audit step:
- Local tests used only as repo validation: yes / no

## Runtime Provenance / Gate Result

- API Gateway runtime provenance:
- `release-gate-runner` proof-capable:
- Production gate command:
- Production gate marker verified:
- Local diagnostic used only as diagnostic: yes / no / not applicable

## Markdown / JSON Audit Consistency

- Markdown decision:
- JSON decision:
- Consistent: yes / no

## Warnings

-

## Blockers

-

## Final Reason

-
```

## Operator Closeout

Before marking the audit complete:

1. Confirm no report contains secret values or tokenized private URLs.
2. Confirm the target environment and RC SHA are explicit.
3. Confirm required services and worker privacy are verified.
4. Confirm Vercel contains only web-owned env names.
5. Confirm `release-gate-runner` is proof-capable for production proof.
6. Confirm production proof did not use a local diagnostic.
7. Confirm no real provider write was part of audit or proof.
8. Confirm Markdown and JSON audit artifacts, when both used, agree.

Only then set the final decision to `passed` or `passed_with_warnings`.
