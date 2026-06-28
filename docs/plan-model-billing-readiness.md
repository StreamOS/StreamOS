# Plan Model / Billing Readiness

## Decision

This slice prepares a future persisted plan model without introducing live
billing behavior. StreamOS keeps the canonical plan IDs `free`, `pro`, and
`agency`, but continues to fail closed on `free` until a trusted server-side
plan source exists.

## Trusted plan sources

- `persisted_server_plan`
- `server_verified_billing`

Only these server-side sources may eventually unlock premium features.

## Untrusted plan sources

- `client_state`
- `ui_badge`
- `query_parameter`
- `request_header`
- `cookie`
- `local_storage`

These sources are readiness hints at most. They must never unlock `pro` or
`agency` access on their own.

## Minimal future persisted plan contract

A later persisted plan slice should provide, per tenant/user:

- `user_id`
- canonical `plan`
- trusted `source`
- optional billing-readiness `status`

Optional future billing metadata may be added later, but prices, checkout,
provider subscription IDs, webhooks, and payment execution remain out of scope
for this readiness slice.

## Current fail-closed behavior

- no trusted source -> `free`
- trusted source without a plan -> `free`
- unknown plan from a trusted source -> `free`
- any untrusted client-like source -> `free`

The existing dashboard plan badge remains UI-only and is not a security source.

## Explicitly out of scope

- Stripe or any billing provider integration
- prices, checkout, subscriptions, invoices, or webhooks
- database migrations or new tables
- RLS or env changes
- gateway or automation-service enforcement changes
- paywall UI or premium product unlock flows
