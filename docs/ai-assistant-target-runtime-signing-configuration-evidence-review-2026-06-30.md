# AI Assistant Target Runtime Signing Configuration Evidence Review - 2026-06-30

## Decision

- `target_runtime_signing_configuration_reviewed`
- `gateway_signing_runtime_config_missing`
- `automation_signing_runtime_config_missing`
- `signing_mode_pairing_missing_or_incomplete`
- `signing_secret_presence_missing_or_incomplete`
- `signing_owner_path_unknown`
- `same_rc_binding_still_required`
- `activation_not_allowed_now`

## Scope

This report reviews the actual redacted AI Assistant signing runtime configuration evidence already present in repository markdown artifacts. It does not perform a live check, does not read runtime environment values, and does not change code, tests, env, deployment state, route state, or runtime activation state.

Reviewed owner surfaces:

- `services/api-gateway`
- `services/automation-service`
- carry-forward evidence for `apps/web` and Vercel browser-env exclusion
- carry-forward runtime-binding evidence for `release-gate-runner`, `api-gateway`, and `automation-service`

Primary source artifact:

- [ai-assistant-target-runtime-signing-server-only-binding-evidence-2026-06-30.md](/C:/Dev/StreamOS/docs/ai-assistant-target-runtime-signing-server-only-binding-evidence-2026-06-30.md)

Supporting source artifacts:

- [ai-assistant-target-runtime-signing-binding-evidence-review-2026-06-30.md](/C:/Dev/StreamOS/docs/ai-assistant-target-runtime-signing-binding-evidence-review-2026-06-30.md)
- [ai-assistant-signing-runtime-configuration-plan-2026-06-30.md](/C:/Dev/StreamOS/docs/ai-assistant-signing-runtime-configuration-plan-2026-06-30.md)
- [ai-assistant-target-runtime-signing-runtime-binding-redacted-evidence-2026-06-30.md](/C:/Dev/StreamOS/docs/ai-assistant-target-runtime-signing-runtime-binding-redacted-evidence-2026-06-30.md)

## Current Fail-Closed State

The previously accepted fail-closed boundary remains unchanged:

- `productGate=closed`
- `routeMode=disabled`
- Gateway runtime status remains `not_yet_productive`
- Automation runtime status remains `not_yet_productive`
- no productive AI Assistant downstream is accepted
- no runtime activation is allowed from local or redacted evidence alone

This review does not weaken any of those boundaries.

## Evidence Reviewed

This report relies only on already committed redacted evidence and carry-forward decisions:

- later target path remains joint `hmac_sha256` configuration on Gateway and Automation
- prior accepted evidence states signing mode is currently not present on both services
- prior accepted evidence states signing secret is currently not present on both services
- prior accepted evidence states server-only ownership is accepted for the signing env names
- same Railway project and environment are accepted as aligned
- same target environment is accepted as aligned
- same-RC binding remains not proven

No new operator evidence was added by this review.

## Signing Runtime Configuration Matrix

| Service              | Signing Mode Present | Signing Mode Value Class | Secret Present | Owner Path Status | Accepted Evidence                                                                             | Gap                                                                                                                | Blocks Activation |
| -------------------- | -------------------- | ------------------------ | -------------- | ----------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------- |
| `api-gateway`        | `false`              | `missing`                | `false`        | `unknown`         | prior redacted report states the signing mode is not present and no signing secret is present | no redacted target-runtime proof of configured `hmac_sha256`; no secret-presence proof; no owner-path parity proof | yes               |
| `automation-service` | `false`              | `missing`                | `false`        | `unknown`         | prior redacted report states the signing mode is not present and no signing secret is present | no redacted target-runtime proof of configured `hmac_sha256`; no secret-presence proof; no owner-path parity proof | yes               |

Interpretation rules applied:

- `missing` means no accepted redacted evidence currently proves target-runtime presence
- `false` for secret presence means no accepted redacted evidence currently proves the secret is present
- `unknown` for owner path means this review has no accepted artifact proving aligned server-only secret ownership paths across both services
- no raw env values, secret values, owner-path strings, or env dumps are included

## Pairing and Parity Review

Current reviewed state:

- Gateway and Automation are aligned only on absence of target-runtime signing configuration evidence
- negative parity by shared absence is not readiness
- the planned activation-grade target remains both services using `hmac_sha256`
- if `hmac_sha256` is later configured, both services must also show redacted `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` presence
- `signing_owner_path_parity` remains `unknown` until separate redacted owner-path evidence is provided

Resulting parity assessment:

- `signing_mode_pairing_missing_or_incomplete`
- `signing_secret_presence_missing_or_incomplete`
- `signing_owner_path_unknown`

This review therefore does not justify:

- `target_runtime_signing_configuration_evidence_ready_for_next_review`
- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`

## Web/Vercel Exclusion Carry-Forward

The server-only ownership evidence from the prior report is accepted and carried forward unchanged:

- `apps_web_signing_env_reference_count=0`
- `vercel_apps_web_signing_mode_key_present=false`
- `vercel_apps_web_signing_secret_key_present=false`
- `vercel_apps_web_next_public_signing_mode_key_present=false`
- `vercel_apps_web_next_public_signing_secret_key_present=false`
- `browser_exposed=false`

Accepted interpretation:

- the AI Assistant signing env names are not evidenced in `apps/web`
- the AI Assistant signing env names are not evidenced in Vercel browser env inventory for `apps/web`
- no `NEXT_PUBLIC_*` variant is accepted for these signing controls
- signing remains a server-only Gateway and Automation concern

## Runtime Binding Carry-Forward

Same-RC binding remains a separate and still-open evidence block.

Carried-forward runtime-binding evidence:

- `release-gate-runner` RC SHA: `a23d3cf4d82315c9861598e28ef5bfd2f2ce31db`
- `api-gateway` RC SHA: `011753c42cc2b0312bd5556ab5da25e873df19c5`
- `automation-service` RC SHA: `not_proven`
- same RC across all three: `false`
- `target_environment_release_gate_runner=production`
- `target_environment_api_gateway=production`
- `target_environment_automation_service=production`
- same target environment across all three: `aligned`
- same Railway project across all three: `aligned`
- same Railway environment identity across all three: `aligned`

Accepted interpretation:

- environment identity alignment is partial evidence only
- same-RC equality across `release-gate-runner`, `api-gateway`, and `automation-service` is still not proven
- runtime activation remains blocked independently of the signing configuration gap

## Blocking Gaps

- no accepted redacted target-runtime proof that `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` is present on `api-gateway`
- no accepted redacted target-runtime proof that `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` is present on `automation-service`
- no accepted redacted target-runtime proof that either service is set to `hmac_sha256`
- no accepted redacted proof that `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` is present on both services
- no accepted redacted proof that signing secret owner-path parity is aligned across both services
- same-RC binding across `release-gate-runner`, `api-gateway`, and `automation-service` remains not proven

## Secret-Safety Review

This report remains secret-safe:

- no secret values are printed
- no env dumps are printed
- no raw owner-path strings are printed
- no private URLs or full internal hostnames are printed
- no signatures, raw payloads, raw prompts, raw contexts, model responses, or raw errors are printed
- all status claims are derived only from previously committed redacted markdown artifacts

## Activation Boundary

This review confirms only a missing-or-incomplete target-runtime signing configuration state.

It does not permit:

- runtime activation
- opening `productGate`
- moving `routeMode` out of `disabled`
- making Gateway or Automation runtime status productive
- allowing a productive downstream for the AI Assistant path

Mandatory result:

- `activation_not_allowed_now`

## Recommended Next Slice

`AI Assistant Signing Runtime Configuration Operator Action`

Reason:

- the current evidence body still shows missing signing configuration on both services
- the next required movement is operator-side target-runtime configuration and redacted proof collection, not activation
- same-RC runtime binding remains a separate follow-up after signing configuration evidence becomes complete enough to review

## Checks

- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant-target-runtime-signing-configuration-evidence-review-2026-06-30.md`

`pnpm validate` may remain skipped if this slice changes only this markdown file.
