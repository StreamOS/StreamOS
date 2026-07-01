# Production Gate Trigger Contract Design Audit

Date: 2026-07-01

## Goal

Define a safe future trigger contract for the StreamOS full production gate so
`release-gate-runner` can prove a hosted Media/Transcription path without
owning `STREAM_EVENT_WEBHOOK_SECRET` or any other `api-gateway`-owned secret.

This is a design audit only. It does not implement a route, queue producer,
runtime variable, deployment, or production gate run.

## Scope Reviewed

- `scripts/rollout-check.cjs`
- `scripts/check-deployment.cjs`
- `scripts/e2e-transcription-job.cjs`
- `scripts/e2e-transcription-job.test.cjs`
- `scripts/operator-cli.test.cjs`
- `scripts/config/railway-env-whitelist.cjs`
- `services/api-gateway/src/app.ts`
- `services/api-gateway/src/app.test.ts`
- `docs/deployment.md`

## Current Blocker

The hosted transcription E2E currently seeds hosted proof rows, then calls
`POST /api/webhooks/streams/ended`. That request is signed inside
`scripts/e2e-transcription-job.cjs` with `STREAM_EVENT_WEBHOOK_SECRET`.

That secret is explicitly owned by `services/api-gateway` and is rejected on
`release-gate-runner` by the Railway env audit. PR #253 correctly made
production mode fail closed with
`production_gate_webhook_secret_boundary_blocked` before the runner can use a
local fallback signing secret or a mis-scoped production webhook secret.

The current production gate still proves:

- public `api-gateway` `/health` runtime provenance;
- private Automation Service reachability from `release-gate-runner`;
- proof-owned hosted fixture and Supabase data availability.

It does not currently prove the live Media -> stream-job-worker ->
transcription-worker -> Automation Service path from a proof-safe trigger.

## Non-Negotiable Constraints

- `STREAM_EVENT_WEBHOOK_SECRET` remains `api-gateway`-owned.
- `release-gate-runner` must not receive provider secrets, webhook secrets,
  `API_GATEWAY_SECRET`, Redis credentials, or private service URLs beyond the
  existing proof-only allowlist.
- Local diagnostic output is not production proof.
- Production proof must be collected from `release-gate-runner` or an
  explicitly equivalent Railway runtime in the same project, environment, and
  release-candidate snapshot.
- No real provider writes or third-party writes are part of the proof.
- Proof payloads must be disposable, tenant-isolated, idempotent, and
  secret-free.

## Decision Matrix

| Option                                  | Summary                                                                                                                                                                     | Secret Ownership                                                                                                                                                                      | Service Boundaries                                                                                | Runner Env Allowlist                                                                                                                  | Replay / Rate Limit                                                                                     | Tenant / Proof Data Isolation                                                                                                      | Cleanup / Idempotency                                                                               | Production-Gate Tauglichkeit                                                  | Backdoor Risk                                                                       | Operator Gate                                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A. Gateway-owned proof trigger contract | Add a dedicated API Gateway proof trigger that validates proof-owned DB state and enqueues the existing media/transcription work without using the external webhook secret. | Acceptable only if it uses no gateway-owned secret on the runner. A design that requires `API_GATEWAY_SECRET`, provider secrets, or a new long-lived shared secret is not acceptable. | Strong fit if API Gateway remains the only queue producer and workers remain unchanged.           | Must not expand the runner allowlist with gateway, webhook, provider, or Redis secrets.                                               | Must include one-time proof IDs, bounded TTL, replay rejection, and strict rate limits.                 | Must require disposable proof rows, a proof-only user/workspace marker, allowed hosted fixture URL, and no customer/provider data. | Must use deterministic proof IDs and tolerate rerun/upsert behavior without duplicate side effects. | Best long-term candidate if gated by architecture review and tests.           | Medium to high unless narrowly scoped, disabled outside proof context, and audited. | Required before implementation because this creates new gateway surface.                                   |
| B. Runner-owned queue / DB seed proof   | Runner directly seeds DB rows and/or enqueues BullMQ transcription jobs.                                                                                                    | Unsafe if it requires Redis or queue credentials on the runner. Supabase service role is already proof-allowed, but DB-only seeding does not prove queue ingestion.                   | Weak: bypasses API Gateway as canonical producer and risks making runner a product-like producer. | Would require expanding allowlist for Redis or queue env to prove the full worker path, which is not acceptable under current policy. | Runner-side enqueue would need its own replay, rate-limit, and cleanup semantics outside API Gateway.   | Can create disposable rows, but direct enqueue risks orphaned jobs and product-state drift.                                        | Idempotency can be implemented but would duplicate queue-producer policy outside the gateway.       | Not recommended for full production gate; DB-only proof is incomplete.        | High because it gives a proof runtime direct production queue-write capability.     | Required, and likely should be rejected unless the runner is redesigned as a controlled internal producer. |
| C. Permanently split gate contract      | Keep API Gateway webhook ingress covered by tests/audits and keep runner proof limited to provenance, private reachability, and hosted proof data.                          | Strong: no new secrets and no allowlist expansion.                                                                                                                                    | Preserves all current boundaries.                                                                 | No change.                                                                                                                            | Existing API Gateway tests cover signed webhook replay and rate limiting; no live proof trigger exists. | Strong for runner-owned data; incomplete for live media path.                                                                      | No new cleanup burden.                                                                              | Safe but incomplete: it cannot unblock "full" hosted Media/Transcription E2E. | Low.                                                                                | No implementation gate, but release policy must explicitly accept a split proof if used for promotion.     |

## Recommendation

Recommend Option A as the target architecture, but only behind an explicit
operator/architecture gate. The safe version is a narrow `api-gateway`-owned
proof trigger contract that:

1. Does not require `STREAM_EVENT_WEBHOOK_SECRET`, `API_GATEWAY_SECRET`, Redis
   credentials, provider secrets, or any new long-lived secret on
   `release-gate-runner`.
2. Accepts only a proof request tied to a short-lived, disposable proof row
   created by the runner in hosted Supabase.
3. Verifies the proof row server-side using API Gateway-owned service context,
   including environment, expected commit marker, proof purpose, fixture URL,
   expiry, and one-time nonce or idempotency key.
4. Enqueues the same canonical internal media/transcription work that the
   stream-ended webhook would produce, while keeping external webhook signature
   validation tested separately.
5. Returns only non-secret proof identifiers and canonical queue/job markers.
6. Emits no private URLs, tokens, credentials, provider payloads, or customer
   data.
7. Is rate-limited, replay-protected, production-gate-only by contract, and
   covered by API Gateway tests plus Railway env audits.

This design keeps the API Gateway as the queue producer and avoids making
`release-gate-runner` a worker, provider, webhook, or queue owner.

## Rejected Variants

- Copy `STREAM_EVENT_WEBHOOK_SECRET` to `release-gate-runner`: rejected because
  it violates secret ownership and existing Railway audit policy.
- Give `release-gate-runner` `API_GATEWAY_SECRET`: rejected because it turns a
  proof runtime into a gateway command caller and expands gateway-owned secret
  scope.
- Give `release-gate-runner` Redis credentials: rejected because it gives the
  proof runtime direct production queue-write capability.
- Add an unauthenticated public proof route: rejected unless it is strictly
  bound to pre-existing proof rows, one-time IDs, expiry, rate limits, and a
  reviewed production-gate-only contract. A generic public enqueue route would
  be a backdoor.

## Required Operator / Architecture Gates Before Option A

- Approve the exact route or command surface, including whether it is public,
  private, or bound to a proof-row challenge.
- Approve the proof row schema or reuse of existing hosted proof metadata.
- Approve the one-time replay model, TTL, deterministic IDs, and cleanup
  behavior.
- Add API Gateway tests proving the route cannot enqueue customer/provider work
  and cannot be used without a valid proof row.
- Add script tests proving `release-gate-runner` still does not require
  `STREAM_EVENT_WEBHOOK_SECRET`, `API_GATEWAY_SECRET`, Redis, or provider
  secrets.
- Update Railway env audit allowlists only if the approved design genuinely
  needs new non-secret proof env names.
- Update `docs/deployment.md` and `docs/transcription-e2e.md` after the final
  contract is implemented.

## Interim Release Posture

Until Option A or another reviewed proof-safe trigger exists, the correct
production-gate behavior remains fail-closed:

- `/health` provenance and private Automation reachability can be proven.
- API Gateway webhook security remains covered by tests and Railway env audits.
- Full hosted Media/Transcription E2E remains blocked with
  `production_gate_webhook_secret_boundary_blocked`.
- Release signalling must not treat local diagnostics, partial hosted checks,
  or successful deploys as a full production proof.

`activation_not_allowed_now` remains unchanged.
