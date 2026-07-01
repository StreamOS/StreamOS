# AI Assistant Signing Runtime Configuration Evidence Collection - 2026-06-30

## Purpose

This report records secret-safe config-level evidence for the AI Assistant signing runtime configuration in Railway `StreamOS / production`.

The evidence in this slice is limited to operator attestation and redacted status outcomes. It does not claim runtime activation, runtime readiness, live runtime proof, or same-RC binding proof.

Codex did not perform Railway, Vercel, Supabase, runtime, or provider actions for this report. This document reflects the operator attestation supplied for the slice and the already committed AI Assistant evidence chain in the repository.

## Decision

- `target_runtime_signing_configuration_configured`
- `gateway_signing_runtime_config_configured_pending_redeploy`
- `automation_signing_runtime_config_configured_pending_redeploy`
- `signing_mode_pairing_configured`
- `signing_secret_presence_pairing_configured`
- `signing_secret_value_parity_operator_attested`
- `runtime_redeploy_required`
- `same_rc_binding_still_required`
- `activation_not_allowed_now`

## Starting Point Before Operator Action

The prior reviewed state was:

- `api-gateway`: signing mode present `false`, value class `missing`, secret present `false`
- `automation-service`: signing mode present `false`, value class `missing`, secret present `false`
- both services were aligned only on absence, not on target-runtime signing readiness
- same-RC binding across `release-gate-runner`, `api-gateway`, and `automation-service` was not proven
- `productGate` remained closed
- `routeMode` remained disabled
- runtime activation remained forbidden

## Operator Action

Thomas, acting as operator, attested that the following Railway config-level action was performed in `StreamOS / production`:

- `services/api-gateway`: `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` set to `hmac_sha256`
- `services/api-gateway`: `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` present
- `services/automation-service`: `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` set to `hmac_sha256`
- `services/automation-service`: `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` present

The operator also attested that:

- `--skip-deploys` was used
- secret values were not disclosed
- redacted checks were used to confirm the configured status

This produces config-level evidence only. It does not prove that already running instances are using the updated values.

## Redacted Service Results

### `api-gateway`

- signing mode present: `true`
- signing mode value class: `hmac_sha256`
- signing secret present: `true`
- runtime consumption status: `pending_redeploy`

### `automation-service`

- signing mode present: `true`
- signing mode value class: `hmac_sha256`
- signing secret present: `true`
- runtime consumption status: `pending_redeploy`

## Parity Result

- signing mode parity: `aligned`
- secret presence parity: `aligned`
- secret value parity: `operator_attested_aligned`

Interpretation:

- both services are now attested as configured for the same signing mode
- both services are now attested as having the required signing secret present
- same secret value usage is accepted only as operator attestation in this slice
- no secret value, digest, substring, or raw comparison artifact is recorded here

## Deployment Status

- `skip_deploys_used`
- `runtime_redeploy_required`
- `running_instances_not_proven`

Config-level meaning:

- Railway configuration storage is updated
- deploy triggering was intentionally skipped
- running service instances are not yet proven to have consumed the new signing configuration
- runtime-level proof must wait for a later redeploy-aware evidence slice

## Actions Not Performed

- no redeploy
- no runtime activation
- no live proof of running instance configuration
- no route activation
- no `productGate` opening
- no `routeMode` transition
- no OpenAI call
- no UI change
- no DB change
- no worker change
- no provider write

## Secret-Safety Review

This report is secret-safe:

- no secret values are printed
- no env dumps are printed
- no private URLs are printed
- no raw payloads are printed
- no screenshots are included
- no sensitive logs are included
- no raw Railway variable output is reproduced

## Open Blockers

- running instances have not yet been redeployed
- same-RC binding across `release-gate-runner`, `api-gateway`, and `automation-service` is not proven
- runtime binding is not proven
- `productGate` remains closed
- `routeMode` remains disabled
- runtime activation remains forbidden

## Activation Boundary

This report does not authorize:

- runtime activation
- route mount activation
- product gate opening
- route mode transition
- productive runtime status

Mandatory carry-forward result:

- `activation_not_allowed_now`

## Recommended Next Slice

`AI Assistant Signing Runtime Redeploy and Same-RC Binding Evidence`

That follow-up must prove, separately and still secret-safe:

- that redeployed `api-gateway` instances consumed the configured signing mode and secret presence
- that redeployed `automation-service` instances consumed the configured signing mode and secret presence
- that same-RC binding across `release-gate-runner`, `api-gateway`, and `automation-service` is established
- that runtime-level evidence is distinct from config-level evidence

## Context Reviewed

- [ai-assistant-signing-runtime-configuration-operator-action-2026-06-30.md](./ai-assistant-signing-runtime-configuration-operator-action-2026-06-30.md)
- [ai-assistant-target-runtime-signing-configuration-evidence-review-2026-06-30.md](./ai-assistant-target-runtime-signing-configuration-evidence-review-2026-06-30.md)
- [ai-assistant-target-runtime-signing-runtime-binding-redacted-evidence-2026-06-30.md](./ai-assistant-target-runtime-signing-runtime-binding-redacted-evidence-2026-06-30.md)
- [ai-assistant-signing-runtime-configuration-plan-2026-06-30.md](./ai-assistant-signing-runtime-configuration-plan-2026-06-30.md)
- [ai-assistant-target-runtime-signing-server-only-binding-evidence-2026-06-30.md](./ai-assistant-target-runtime-signing-server-only-binding-evidence-2026-06-30.md)

## Validation

- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant/ai-assistant-signing-runtime-configuration-evidence-collection-2026-06-30.md`

`pnpm validate` may remain skipped for this slice because the change is docs-only and does not modify code, tests, env files, DB contracts, workers, providers, or deployment scripts.
