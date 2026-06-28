# StreamOS Gateway and Automation Entitlement Enforcement Design

Date: 2026-06-28
Branch: `chore/api-gateway/gateway-automation-entitlement-enforcement-design`
Decision: `planned_with_warnings`

## Ausgangslage

This slice defines how StreamOS should later enforce persisted entitlements
across `apps/web`, `services/api-gateway`, and `services/automation-service`
without implementing that enforcement yet.

Current repo baseline at slice start:

- current `main` SHA: `1e8d3e4c31a14d6cc826c64207562e3c3441d89e`
- `main == origin/main`: yes
- worktree at slice start: clean
- branch audit baseline:
  - total branches: `30`
  - `merged & stale`: `0`
  - `needs rename`: `7`
  - `temporary ops`: `8`

Already merged entitlement foundation:

- feature gate contract:
  [packages/types/src/feature-gates.ts](../packages/types/src/feature-gates.ts)
- plan model contract:
  [packages/types/src/plan-model.ts](../packages/types/src/plan-model.ts)
- server-side web entitlement resolver:
  [apps/web/src/lib/entitlements/server.ts](../apps/web/src/lib/entitlements/server.ts)
- persisted plan reader for web server paths:
  [apps/web/src/lib/entitlements/persisted-plan.ts](../apps/web/src/lib/entitlements/persisted-plan.ts)
- persisted plan table:
  [packages/database/supabase/migrations/20260628112548_persisted_plan_model.sql](../packages/database/supabase/migrations/20260628112548_persisted_plan_model.sql)

Current persisted plan baseline:

- trusted sources:
  - `persisted_server_plan`
  - `server_verified_billing`
- untrusted sources:
  - `client_state`
  - `ui_badge`
  - `query_parameter`
  - `request_header`
  - `cookie`
  - `local_storage`
- persisted row missing: resolve as `free`
- persisted read error: resolve as `free`
- unknown persisted plan: resolve as `free`

Current runtime reality:

- `apps/web` already has server-only entitlement helpers, but they are not yet
  wired into premium route ownership decisions.
- `services/api-gateway` already owns app-facing server routes and already reads
  Supabase through server-side service-role calls.
- `services/automation-service` currently enforces request shape and AI boundary
  rules, but it does not yet enforce feature entitlements before model calls.
- current worker calls into `services/automation-service` do not carry a
  separate entitlement assertion header or signed token.

## Zielbild

StreamOS should later have one consistent premium-feature enforcement model:

1. Client/UI gates stay convenience-only.
2. Web server actions and BFF routes enforce premium access server-side.
3. API Gateway enforces premium access for gateway-owned commands before any
   server mutation, provider action, queue enqueue, or internal premium command.
4. Automation Service enforces premium access before any model call for premium
   AI features.
5. The trusted entitlement source stays the persisted server-side plan model,
   not a client claim.
6. Unknown, missing, or stale entitlement context never unlocks premium
   behavior.

## Nicht-Ziele

This slice does not add:

- production gateway entitlement checks
- production automation entitlement checks
- new API routes
- new automation endpoints
- OpenAI or other AI calls
- billing or Stripe logic
- DB migration changes
- RLS changes
- worker behavior changes
- queue contract changes
- provider write changes
- environment changes

## Aktueller Zustand nach Service

### Web

- Web already exposes server-only helpers that map persisted plan rows to a
  fail-closed entitlement context.
- These helpers are appropriate for web-owned reads, server actions, and BFF
  convenience checks.
- Web is not the authority for gateway-owned routes or private automation
  execution.

### API Gateway

- Gateway routes are already protected by `API_GATEWAY_SECRET` for app-facing
  calls.
- Gateway already uses server-side service-role Supabase reads and writes via
  [services/api-gateway/src/lib/supabaseRest.ts](../services/api-gateway/src/lib/supabaseRest.ts).
- Gateway is the correct future authority for gateway-owned premium command
  enforcement because it already owns:
  - app-facing server APIs
  - OAuth ownership
  - server-owned queue enqueue
  - publication and scheduling mutations

### Automation Service

- Automation endpoints are private-service endpoints and already enforce input
  schema, provider error normalization, and server-only AI credentials.
- They do not currently verify whether the caller is entitled to premium AI
  features.
- Existing endpoints such as `/repurposing/plan`, `/clips/analyze`, and
  `/transcriptions/process` are currently worker/service paths, not client
  entitlements.

## Service Ownership

### `apps/web`

Owns:

- UI visibility and convenience-only plan hints
- server action and BFF prechecks for web-owned premium reads/writes
- mapping authenticated user context to a persisted plan row through RLS-safe
  server paths

Does not own:

- gateway-owned premium authorization
- automation-service premium authorization
- signed entitlement issuance for browser callers
- service-role plan reads for client-visible code

### `services/api-gateway`

Owns:

- authoritative entitlement enforcement for gateway-owned commands
- server-side evaluation of trusted persisted plan state
- future issuance of short-lived internal entitlement assertions for downstream
  premium automation calls when gateway initiates them
- suppression of billing/plan internals from public error payloads

Does not own:

- browser-trusted plan state
- client-provided premium claims
- direct model execution

### `services/automation-service`

Owns:

- final pre-model entitlement check for premium AI features
- validation of an internal trusted entitlement assertion before premium model
  work begins
- fail-closed denial when the assertion is missing, invalid, expired, or
  feature-mismatched

Should not own by default:

- direct plan derivation from client claims
- browser-visible plan logic
- unreviewed long-lived entitlement state

## Trust Boundary

### Trusted inputs

- authenticated server-side user context
- `public.user_plan_models` read through trusted server paths
- trusted plan sources:
  - `persisted_server_plan`
  - `server_verified_billing`
- future internal signed entitlement assertion generated by a trusted server
  owner

### Untrusted inputs

- client plan badges
- query params
- cookies
- request headers from client space
- local storage
- any browser claim that says a user is `pro` or `agency`
- raw worker payload fields that were never derived from the persisted plan
  model

## Enforcement-Matrix

| Feature                | Minimum Plan | Later Web Enforcement                                 | Later Gateway Enforcement                                      | Later Automation Enforcement                | Notes                                    |
| ---------------------- | ------------ | ----------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------- |
| `ai_assistant`         | `pro`        | web server action or BFF gate before command dispatch | enforce when gateway owns assistant command/session initiation | enforce before any premium model call       | highest abuse/cost sensitivity           |
| `advanced_analytics`   | `pro`        | server-side read model or BFF gate                    | only if analytics export/sync becomes gateway-owned            | none by default                             | mostly read-path gating                  |
| `publishing_schedule`  | `pro`        | optional web precheck for UX                          | enforce on schedule create/edit/cancel routes                  | none                                        | scheduler stays private                  |
| `monetization_exports` | `pro`        | web server action/BFF export request                  | enforce if export becomes gateway-owned                        | none                                        | avoid client-only export unlocks         |
| `branding_ai`          | `pro`        | web BFF or server action gate                         | enforce if gateway owns branding AI orchestration              | enforce before premium branding model call  | must not authorize storage mutation here |
| `team_workspace`       | `agency`     | web role + workspace membership precheck              | enforce on future workspace admin/member routes                | optional only if AI runs per workspace seat | requires separate workspace model later  |

## Gateway Enforcement Design

### Recommended role

Gateway should be the authoritative premium gate for gateway-owned routes.

Recommended future flow:

1. Authenticate caller as today.
2. Resolve server-side user context.
3. Read trusted plan state from `user_plan_models` through a server-side path.
4. Evaluate the requested feature with the shared feature-gate contract.
5. If denied or ambiguous, stop before queue enqueue, provider action, or
   downstream premium command.
6. If a premium automation call is needed, mint a short-lived internal
   entitlement assertion for that exact feature and caller context.

### Enforcement targets in gateway

Future gateway enforcement should sit immediately before:

- schedule create/edit/cancel
- premium export initiation if it becomes gateway-owned
- premium AI orchestration commands if gateway later owns them
- any server-owned command that would otherwise unlock premium-only behavior

It should not be added inside unrelated health, OAuth callback, or webhook
signature middleware.

### Gateway shared evaluation contract

Gateway should reuse the shared feature and plan contracts already defined in
`packages/types`.

A small future gateway-side helper should mirror the web resolver semantics:

- missing persisted row -> `free`
- unknown plan -> `free`
- trusted source missing plan -> `free`
- unknown feature -> deny
- missing authenticated user context -> deny

### External response behavior

Public app-facing responses should stay conservative:

- `401` only for missing or invalid gateway auth
- `403` for authenticated-but-not-entitled premium access
- `503` only when a trusted internal dependency failure is materially distinct
  and the caller is already a trusted server path

Client-visible responses should not reveal:

- billing status details
- whether a user was almost eligible
- service-role lookup details
- raw DB or provider errors

Recommended stable public error codes:

- `entitlement_required`
- `feature_not_enabled`

Recommended internal classification only:

- `plan_source_unavailable`
- `entitlement_context_missing`
- `unknown_feature`

## Automation Service Enforcement Design

### Recommended model

Preferred first implementation: short-lived signed entitlement assertion
validated by `services/automation-service`.

Why this is preferred:

- avoids moving browser-adjacent trust into the automation service
- avoids making the automation service infer premium access from raw client
  claims
- avoids duplicating plan-source reads across every caller path by default
- lets automation fail closed with a small, explicit claim set

### Assertion shape

The future assertion should be internal-only and short-lived.

Recommended minimum claims:

- `iss`: trusted issuer, initially `api-gateway` or a later dedicated
  entitlement issuer
- `aud`: `automation-service`
- `sub`: user id
- `feature`: exact feature key
- `plan`: normalized plan
- `source`: trusted source kind
- `iat`: issued at
- `exp`: short expiry
- `jti`: unique assertion id for tracing and replay controls
- `request_id` or correlation id for log stitching

Recommended TTL:

- 60 to 120 seconds

Recommended scope:

- one feature per assertion
- one audience
- no reusable broad wildcard claim

### Automation validation steps

Before any premium model call, automation should later:

1. Require a trusted internal assertion for premium AI features.
2. Validate signature and issuer.
3. Validate audience.
4. Validate expiry.
5. Validate that the asserted feature matches the endpoint/action.
6. Validate that the plan is sufficient for that feature.
7. Deny before model execution if any step fails.

### Fail-closed behavior in automation

Automation must not start premium model work when:

- assertion is missing
- assertion is malformed
- assertion is expired
- assertion audience is wrong
- assertion feature does not match the endpoint
- assertion plan is insufficient
- feature key is unknown

Recommended internal reason codes:

- `entitlement_context_missing`
- `entitlement_assertion_invalid`
- `entitlement_assertion_expired`
- `feature_not_enabled`
- `unknown_feature`

Recommended external/private endpoint behavior:

- return `403` for invalid or insufficient premium entitlement
- never include plan source details, billing details, or secret validation
  context in the response body
- log the reason code and correlation id only in secret-safe server logs

## Alternative: Automation Self-Read

Alternative design:

- automation service directly reads `user_plan_models` through a trusted
  server-side DB path

Trade-offs:

- duplicates plan lookup logic across services
- increases secret and DB-access scope inside automation
- makes every premium model path depend on direct plan-source reachability
- complicates ownership if both gateway and automation can independently define
  premium access behavior

Decision:

- do not use automation self-read as the first implementation path
- keep it as a later fallback only if a future premium automation workflow must
  run without a gateway-issued assertion and the additional runtime ownership is
  explicitly accepted

## Worker Interaction Constraint

Current workers call automation endpoints directly and do not currently attach a
premium entitlement assertion.

Implication:

- do not retrofit premium entitlement checks onto all existing automation
  endpoints without classifying which workflows are actually premium
- existing non-premium worker automation paths should continue to use their
  current safety controls unless and until a separate slice classifies them as
  premium features

This matters especially for:

- `/repurposing/plan`
- `/clips/analyze`
- `/transcriptions/process`

The first premium automation rollout should prefer a new or explicitly upgraded
premium path instead of silently breaking existing worker traffic.

## Fail-Closed Rules by Service

### Web BFF / server action

- missing user -> deny
- missing row -> `free`
- DB read error -> `free`
- unknown plan -> `free`
- unknown feature -> deny
- UI remains convenience-only

### Gateway

- missing authenticated user context -> deny
- missing row -> `free`
- DB read error for premium route -> deny before premium side effects
- unknown plan -> `free`
- unknown feature -> deny
- no queue enqueue or provider action after deny

### Automation

- missing assertion -> deny
- invalid assertion -> deny
- expired assertion -> deny
- feature mismatch -> deny
- insufficient plan -> deny
- no model call after deny

## Error and Status Conventions

### Public/app-facing

- generic premium denial message
- no billing internals
- no plan-source internals
- no raw DB errors
- no secret-bearing context

Recommended public payload shape later:

- `error`: stable machine code
- `message`: safe generic text
- optional `request_id`

### Internal/private service classification

Allowed internal reason vocabulary:

- `entitlement_required`
- `feature_not_enabled`
- `plan_source_unavailable`
- `entitlement_context_missing`
- `entitlement_assertion_invalid`
- `entitlement_assertion_expired`
- `unknown_feature`

These reason codes should remain stable enough for tests and observability, but
they should not expose secrets or raw upstream details.

## Audit and Logging Requirements

Future enforcement should log only secret-safe metadata:

- request id / correlation id
- user id
- feature key
- normalized plan
- trusted source kind
- allow/deny result
- internal reason code
- issuer and audience for automation assertions

Do not log:

- raw signed assertion
- service-role keys
- provider tokens
- billing provider payloads
- raw DB error bodies
- private Railway URLs in public-facing evidence

## Test Plan for Later Implementation

### Gateway

- allows feature when trusted persisted plan is sufficient
- denies unknown feature
- denies missing authenticated user context
- denies premium route when trusted plan read fails
- never enqueues premium side effects after denial
- returns secret-safe error payloads only

### Automation

- denies premium model call when assertion is missing
- denies premium model call when assertion is malformed
- denies premium model call when assertion is expired
- denies premium model call when feature claim mismatches endpoint
- denies premium model call when plan is insufficient
- never starts provider/model call after deny
- logs secret-safe reason codes only

### Web

- UI gates remain convenience-only
- server-side web checks stay authoritative for web-owned paths
- client plan claims never unlock server-side premium access

## Risiken

- Gateway and web may drift if they do not share the same normalized feature and
  plan contract.
- Automation self-read would expand secret and DB ownership if adopted too
  early.
- Existing worker-to-automation traffic could be broken if premium gating is
  bolted onto current endpoints without endpoint classification.
- `team_workspace` cannot be fully enforced without a later workspace and role
  model slice.
- `advanced_analytics` and `monetization_exports` still need explicit ownership
  decisions before implementation.

## Empfohlene naechste Slices

Recommended order:

1. `Automation Entitlement Assertion Contract`
   - define assertion format, signing, expiry, audience, and validation tests
2. `Gateway Entitlement Enforcement Implementation`
   - implement gateway-side premium enforcement for the first concrete
     gateway-owned feature
3. `AI Cost and Abuse Guardrails`
   - add rate/cost controls only after entitlement ownership is consistent

Why this order:

- automation needs a stable trusted assertion contract before premium
  model-entry checks are safe to implement
- gateway needs a stable downstream contract before it becomes an issuer
- cost and abuse controls are weaker if the trusted entitlement boundary is
  still ambiguous

## Bewusst ausgelassen

This slice intentionally leaves out:

- runtime enforcement code
- new env vars
- JWT or HMAC implementation details
- billing provider integration
- pricing tables
- UI paywalls
- worker queue changes
- provider-write gating changes

## Abschluss

This repo now has a documented entitlement-enforcement target state:

- persisted plan rows remain the trusted server-side source
- UI sources remain explicitly untrusted
- gateway is the premium authority for gateway-owned commands
- automation should validate a short-lived internal entitlement assertion before
  premium model execution
- premium AI flows should fail closed before any model call

This is enough to start the next contract slice, but not enough to start cost
and abuse guardrails first.
