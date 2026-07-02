# AI Usage Budget / Rate Limit Source Design

## Executive Summary

`ai_assistant` remains `not_yet_productive`. This slice does not activate a route,
does not add persistence, and does not execute any OpenAI call.

Current repository evidence supports a hybrid ownership model instead of a
single enforcement owner:

- `services/api-gateway` is already the plan and signed-entitlement owner.
- `services/api-gateway` already contains request-boundary rate-limit patterns.
- `services/automation-service` already contains model/input/timeout guardrails
  and fail-closed premium runtime enforcement.
- `services/automation-service` does not currently own a safe general-purpose
  database retrieval or usage-persistence path.
- no existing AI-specific usage ledger or monthly budget table was found.

Recommended architecture:

1. `services/api-gateway` owns AI request admission, plan gating, signed budget
   context issuance, and durable usage persistence.
2. Redis owns short-window burst, abuse, and in-flight reservation state.
3. Supabase/Postgres owns durable usage events, monthly aggregates, and future
   billing-compatible counters.
4. `services/automation-service` owns model-near guardrails, validates the
   signed usage/budget context fail-closed, and returns a small metering result
   for persistence by the gateway.

This keeps cost enforcement server-owned without adding direct database
ownership to the automation service.

## Current State

Repository patterns observed on `2026-06-29`:

- Gateway feature gating and entitlement issuance already exist through shared
  feature-gate definitions and `automation-entitlement-issuer`.
- Automation runtime enforcement for `ai_assistant` already exists and is
  fail-closed when signed entitlement requirements are not met.
- Automation guardrails already expose stable secret-safe denial codes,
  including `ai_guardrail_usage_budget_unavailable`.
- Gateway rate limiting is already treated as production-required and already
  exists at route boundaries.
- Trusted context reads were intentionally moved toward gateway ownership
  because the automation service does not currently own a safe DB access layer.

Implication:

- persistent AI usage accounting should not start inside
  `services/automation-service`
- request admission should not wait until after model execution
- short-window abuse controls should not rely on process-local state before
  productive activation

## Enforcement Owner Options

| Option                                                     | Tenant / user scope                            | Cost control                 | Rate-limit ability        | Abuse protection             | Resilience                         | Testability | Billing compatibility              | Secret safety                              | Assessment         |
| ---------------------------------------------------------- | ---------------------------------------------- | ---------------------------- | ------------------------- | ---------------------------- | ---------------------------------- | ----------- | ---------------------------------- | ------------------------------------------ | ------------------ |
| API Gateway only                                           | strong, already request-scoped                 | partial without model result | strong for request entry  | strong at entry boundary     | medium; needs shared backing store | strong      | medium unless durable ledger added | strong                                     | insufficient alone |
| Automation Service only                                    | medium; currently weaker persistence ownership | strong near model call       | weak for edge throttling  | medium                       | medium                             | medium      | weak without DB owner              | medium; expands secret surface if DB added | reject             |
| Supabase/Postgres only                                     | strong for durable tenant records              | strong for monthly totals    | weak for burst throttling | weak for fast abuse controls | strong for persistence             | medium      | strong                             | strong                                     | insufficient alone |
| Redis only                                                 | medium; ephemeral keys only                    | weak for monthly accounting  | strong                    | strong                       | medium; ephemeral by design        | strong      | weak                               | strong                                     | insufficient alone |
| Hybrid: Gateway + Redis + Postgres + Automation guardrails | strong                                         | strong                       | strong                    | strong                       | strong                             | strong      | strong                             | strong                                     | recommended        |

## Recommended Ownership Architecture

### 1. API Gateway

Recommended owner for:

- request admission
- authenticated `tenant_id` / `user_id` validation
- plan-based feature check for `ai_assistant`
- signed usage/budget context issuance
- durable usage event writes
- monthly budget reads and decisions
- route-level rate-limit decisions before the automation request

Why:

- it already owns signed entitlement decisions
- it already owns server-side request boundaries
- it already owns trusted server-side Supabase access patterns
- it is the correct place to deny before the expensive downstream AI call

### 2. Redis

Recommended owner for:

- per-user burst limits
- per-tenant burst limits
- concurrent request caps
- short cooldowns after repeated denies
- temporary in-flight reservations keyed by request

Why:

- these checks need low-latency mutable counters
- they should work before any durable write round-trip becomes a bottleneck
- they map well to existing gateway-side Redis patterns

Constraint:

- productive AI limits should use shared Redis-backed keys, not only
  process-local memory

### 3. Supabase / Postgres

Recommended owner for:

- immutable AI usage event ledger
- monthly per-tenant and per-user usage totals
- feature-level usage totals
- billing-compatible cost reporting inputs
- reconciliation state for incomplete or pending usage events

Why:

- monthly budgets and billing compatibility require durable storage
- auditability requires server-owned persistent history
- Redis alone cannot be the source of truth for monthly spend enforcement

### 4. Automation Service

Recommended owner for:

- input, payload, media, and timeout guardrails
- model/provider error normalization
- fail-closed validation of signed usage/budget context
- reporting a small metering envelope back to the gateway

Not recommended as owner for:

- durable monthly usage storage
- plan source-of-truth decisions
- general AI billing ledger writes

Why:

- it already contains the model-near guardrails
- it does not currently own the safe persistence boundary required for billing
  and usage accounting

## Recommended Limit Classes

| Limit class                   | Recommended owner  | Storage / source           | Enforcement timing                                  | Notes                                                            |
| ----------------------------- | ------------------ | -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Request shape and prompt size | Automation Service | request only               | before model call                                   | already aligned with current guardrails                          |
| Media size and timeout        | Automation Service | request only               | before model call                                   | already aligned with current guardrails                          |
| Feature / plan allow-deny     | API Gateway        | plan model + feature gates | before automation call                              | gateway remains entitlement owner                                |
| Per-user burst limit          | Gateway + Redis    | ephemeral counter          | before automation call                              | authenticated user key, not IP only                              |
| Per-tenant burst limit        | Gateway + Redis    | ephemeral counter          | before automation call                              | prevents team or bot fanout abuse                                |
| Concurrent in-flight requests | Gateway + Redis    | ephemeral reservation      | before automation call and on completion            | prevents parallel cost spikes                                    |
| Monthly tenant budget         | Gateway + Postgres | durable aggregate / ledger | before automation call, then reconcile after result | billing-compatible source of truth                               |
| Monthly user budget           | Gateway + Postgres | durable aggregate / ledger | before automation call, then reconcile after result | defense-in-depth under one tenant                                |
| Feature-specific budget       | Gateway + Postgres | durable aggregate / ledger | before automation call                              | allows `ai_assistant` to remain isolated from future AI features |
| Provider-specific backoff     | Automation Service | provider response          | during or after model call                          | maps upstream 429 and timeout behavior                           |

## Recommended Request Flow

Recommended future productive flow:

1. Gateway authenticates request and resolves `tenant_id` and `user_id`.
2. Gateway checks plan and feature eligibility for `ai_assistant`.
3. Gateway checks Redis-backed burst and concurrency limits.
4. Gateway checks durable monthly budget state in Postgres.
5. Gateway creates a request-scoped usage context:
   - request ID
   - feature
   - tenant ID
   - user ID
   - current plan
   - small budget snapshot or reservation metadata
6. Gateway signs that context and forwards it to the automation service.
7. Automation service validates the signed context fail-closed.
8. Automation service applies input, payload, timeout, and model guardrails.
9. Automation service performs the model call only after all checks pass.
10. Automation service returns a small metering summary to the gateway.
11. Gateway persists the usage event and updates monthly aggregates.

Fail-closed rule:

- if signed usage/budget context is missing, malformed, expired, or cannot be
  reconciled, the automation service should deny with a stable secret-safe
  guardrail reason instead of performing the AI call

## Persistent Data Recommendation

Recommended durable fields for a future AI usage ledger:

- `request_id`
- `feature`
- `tenant_id`
- `user_id`
- `plan_at_request_time`
- `request_status`
- `deny_reason_code` or `completion_status`
- `model_family`
- `input_bytes`
- `context_payload_bytes`
- `prompt_characters`
- `output_token_count`, if available
- `input_token_count`, if available
- `estimated_cost_minor_units` or another documented normalized server-side cost
  field
- `created_at`
- `completed_at`

Recommended durable aggregate dimensions:

- month bucket
- tenant
- user
- feature
- plan

Recommended non-durable or ephemeral-only data:

- burst counters
- concurrency reservations
- cooldown flags
- retry-after windows

## Data That Must Never Be Stored

The future implementation should not persist:

- raw prompts
- full trusted context payloads
- transcript bodies
- clip or repurposing payload bodies
- raw provider payloads
- OAuth access tokens
- refresh tokens
- provider secrets
- private callback URLs
- service-role credentials
- raw OpenAI request or response bodies
- raw error messages that may embed URLs, prompts, provider identifiers, or
  sensitive metadata

Persist only compact, normalized, secret-safe reason codes and bounded usage
metrics.

## Why The Hybrid Model Wins

Gateway-only is not enough because it does not naturally observe final model
usage and should not guess durable spend outcomes.

Automation-only is not enough because it would require expanding a private AI
service into a new persistence and billing owner, which the current repository
explicitly avoids.

Postgres-only is not enough because burst abuse prevention needs a fast mutable
counter before the expensive request is accepted.

Redis-only is not enough because monthly budget enforcement and billing history
need durable audit data.

The hybrid design preserves current ownership boundaries:

- gateway decides whether a request may start
- automation decides whether a model call remains safe to execute
- Redis protects the short window
- Postgres preserves the long window

## Explicit Non-Goals

- no productive `ai_assistant` activation
- no new route
- no OpenAI execution
- no DB migration in this slice
- no Env change
- no monthly budget implementation yet
- no Redis key implementation yet
- no billing UI
- no monetization export changes
- no changes to `/clips/analyze`, `/repurposing/plan`, or
  `/transcriptions/process`

## Risks

- Relying only on process-local gateway rate limits would be insufficient for a
  productive multi-instance AI path.
- Letting the automation service become the durable budget owner would broaden
  DB and secret ownership without current need.
- Writing detailed prompts or raw model/provider payloads into durable usage
  tables would create a privacy and secret-handling regression.
- Skipping a durable request ledger would make monthly budgets hard to audit and
  hard to reconcile after partial failures.

## Recommended Next Implementation Slices

1. `Gateway AI usage admission contract`
   - define a small signed usage/budget context passed from gateway to
     automation service

2. `AI usage ledger schema and repository contract`
   - add durable usage event and monthly aggregate persistence on the gateway /
     database side

3. `Redis-backed AI burst and concurrency limits`
   - add shared low-latency abuse controls at the gateway boundary

4. `Automation-service usage context enforcement`
   - deny when usage context is missing or invalid before any model call

5. `Gateway post-call metering reconciliation`
   - persist final usage outcomes and aggregate updates after automation returns

These slices should land before any productive AI Assistant route or UI
activation.
