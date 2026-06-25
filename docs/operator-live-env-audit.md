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
- Protected observability route status:
- Raw payloads omitted:

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
