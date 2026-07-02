# Persisted Plan Model

## Decision

StreamOS now has a minimal persisted server-side plan source in
`public.user_plan_models`.

## Storage contract

- one row per `user_id`
- canonical `plan`: `free | pro | agency`
- canonical `source`: `persisted_server_plan | server_verified_billing`
- optional `billing_status`

## Security contract

- table is tenant-scoped by `user_id`
- RLS allows `authenticated` users to `select` only their own row
- `authenticated` cannot `insert`, `update`, or `delete`
- `service_role` keeps write access for later server-owned plan changes
- missing row or read error still resolves to `free`

## Current runtime behavior

- web server entitlements can now read a persisted trusted plan source
- invalid or unknown persisted plans still fail closed to `free`
- no Stripe, checkout, prices, webhooks, or provider writes are introduced

## Out of scope

- billing provider integration
- operator workflows for plan upgrades
- gateway or automation-service entitlement enforcement
- paywall UI or TopHeader badge binding
