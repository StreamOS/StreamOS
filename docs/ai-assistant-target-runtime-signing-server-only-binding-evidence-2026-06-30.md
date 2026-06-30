# AI Assistant Target Runtime Signing Server-Only and Binding Evidence - 2026-06-30

## Decision

Primary decisions:

- `planned_hmac_pairing_required`
- `signing_runtime_config_still_missing`
- `signing_server_only_ownership_accepted`
- `same_railway_project_environment_accepted`
- `same_rc_binding_not_proven`
- `activation_not_allowed_now`

Why:

- the reviewed AI Assistant path remains HMAC-only and fail-closed for the relevant Gateway issuance and Automation runtime enforcement path
- later target-runtime configuration must bring both `services/api-gateway` and `services/automation-service` to the same `hmac_sha256` mode, not only one service
- if `hmac_sha256` is used later, `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` must also be present on both services and must remain server-only
- the signing env names are not present in `apps/web` and were not observed in the Vercel `apps/web` environment-key inventory
- Railway project/environment alignment is positively evidenced, but same-RC binding is still not proven because the runner and Gateway already show different RC SHAs and Automation RC remains unproven

No additional decision is granted for:

- `signing_runtime_config_applied`
- `signing_ready_for_activation`
- `same_rc_binding_proven`
- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`

## Scope

This artifact records only:

- the later required target signing state for the AI Assistant path
- current redacted signing presence and value-class evidence for Gateway and Automation
- server-only ownership evidence for the signing env names
- a separate runtime-binding evidence block

Not done:

- no env change
- no secret creation or rotation
- no runtime activation
- no `productGate` opening
- no `routeMode` transition
- no productive `runtimeStatus`
- no UI, DB, worker, provider, Railway deploy, Vercel deploy, Supabase, or OpenAI change

## Current Fail-Closed State

Current AI Assistant state remains:

- `/api/ai-assistant` is mounted in `services/api-gateway`
- `productGate=closed`
- `routeMode=disabled`
- Gateway `runtimeStatus=not_yet_productive`
- Automation `runtimeStatus=not_yet_productive`
- `activationPermittedNow=false`
- `transitionPermittedNow=false`
- `localOnly=true`
- `operatorProofRequired=true`
- no productive downstream is enabled
- no OpenAI call is reachable through the AI Assistant path

Current internal automation endpoints remain unchanged core/internal surfaces:

- `/clips/analyze`
- `/repurposing/plan`
- `/transcriptions/process`

## Signing Target State

The later planned AI Assistant target state is:

- `services/api-gateway` signing mode: `hmac_sha256`
- `services/automation-service` signing mode: `hmac_sha256`
- `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` present on both services
- same server-only owner path for the secret on both services
- no ownership in `apps/web`
- no ownership in Vercel browser env
- no ownership in any `NEXT_PUBLIC_*` path

This document does not apply that state. It only records what must later be proven.

## Current Target-Runtime Signing Evidence

```yaml
gateway_signing_status:
  signing_mode_present: false
  signing_mode_value_class: missing
  signing_secret_present: false

automation_signing_status:
  signing_mode_present: false
  signing_mode_value_class: missing
  signing_secret_present: false

signing_pairing_requirement:
  required_target_mode_gateway: hmac_sha256
  required_target_mode_automation: hmac_sha256
  required_secret_presence_gateway: true
  required_secret_presence_automation: true
```

Current interpretation:

- current parity is shared absence, not readiness
- the planned target state requires both services to move together to `hmac_sha256`
- moving only one service would create contract drift and must remain blocked
- current `signing_owner_path_parity` remains `unknown`

## Server-Only Ownership Evidence

```yaml
server_only_ownership_evidence:
  apps_web_signing_env_reference_count: 0
  vercel_apps_web_signing_mode_key_present: false
  vercel_apps_web_signing_secret_key_present: false
  vercel_apps_web_next_public_signing_mode_key_present: false
  vercel_apps_web_next_public_signing_secret_key_present: false
  browser_exposed: false
```

Accepted redacted basis:

- repo search found no `apps/web` references for the two signing env names
- Vercel `apps/web` environment-key inventory did not show either signing env name
- Vercel `apps/web` environment-key inventory did not show either `NEXT_PUBLIC_` signing variant
- repository settings and tests still explicitly forbid `NEXT_PUBLIC_AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` and `NEXT_PUBLIC_AUTOMATION_ENTITLEMENT_ASSERTION_SECRET`

Conservative interpretation:

- server-only ownership is accepted as evidence
- current target-runtime signing readiness is still blocked because both owning services are still missing the required runtime configuration

## Runtime Binding Evidence

This block remains separate from signing evidence.

```yaml
runtime_binding_evidence:
  rc_sha_release_gate_runner: a23d3cf4d82315c9861598e28ef5bfd2f2ce31db
  rc_sha_api_gateway: 011753c42cc2b0312bd5556ab5da25e873df19c5
  rc_sha_automation_service: not_proven
  runner_gateway_rc_match: false
  runner_automation_rc_match: not_proven
  same_rc_across_runner_gateway_automation: false
  target_environment_release_gate_runner: production
  target_environment_api_gateway: production
  target_environment_automation_service: production
  same_target_environment_across_runner_gateway_automation: aligned
  same_railway_project_across_runner_gateway_automation: aligned
  same_railway_environment_identity_across_runner_gateway_automation: aligned
```

Accepted redacted basis:

- `release-gate-runner` exposed a concrete non-secret RC SHA via runner provenance
- `api-gateway` exposed a concrete non-secret RC SHA via current success deployment metadata
- `automation-service` did not expose a concrete RC SHA in the redacted collection paths used here
- all three services exposed the same target environment classification `production`
- all three services exposed the same Railway project/environment identity at the metadata level

Conservative interpretation:

- same Railway project/environment is accepted
- same target environment is accepted
- same RC is not proven and is already contradicted between runner and Gateway
- activation therefore remains blocked independently of the current signing absence

## Secret-Safety Review

```yaml
secret_safety_review:
  secrets_present: false
  tokens_present: false
  private_urls_present: false
  private_hostnames_present: false
  raw_env_dumps_present: false
  signatures_present: false
  raw_payloads_present: false
  raw_prompts_present: false
  raw_contexts_present: false
  model_responses_present: false
  raw_errors_present: false
  review_result: secret_safe
```

Redaction rules upheld in this artifact:

- no secret values are copied
- no env values are copied
- no private URLs or full internal hostnames are copied
- no raw provider payloads or OpenAI payloads are copied
- no raw runtime transcripts are copied into this document

## Activation Boundary

This artifact does not allow activation.

Conservative boundary result:

- later target signing must be paired across Gateway and Automation as `hmac_sha256`
- later secret presence must be paired across Gateway and Automation if `hmac_sha256` is used
- server-only ownership is accepted as a separate evidence category
- same-RC binding remains blocked
- `activation_not_allowed_now` remains mandatory

This artifact does not justify:

- `signing_runtime_config_applied`
- `signing_ready_for_activation`
- `same_rc_binding_proven`
- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`

Even after later positive signing configuration evidence, these separate blockers would still remain:

- owner-path parity proof if `hmac_sha256` is used
- fresh private-reachability proof under the same RC/environment context
- budget and metering operational proof
- `productGate` opening proof
- `routeMode` transition proof
- coordinated productive `runtimeStatus` proof
- rollback proof
- productive downstream implementation in `services/automation-service`

## Recommended Next Slice

Exactly one next slice is recommended:

`AI Assistant Target Runtime Signing Configuration Evidence`

Why:

- the later target state is now explicit: both services together on `hmac_sha256`, not one-sided
- server-only ownership evidence is now separated from runtime signing presence evidence
- the next safe step is to collect a fresh redacted artifact that proves the planned signing configuration exists on both services without disclosing any secret material

## Checks

Executed for this docs-only evidence slice:

- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant-target-runtime-signing-server-only-binding-evidence-2026-06-30.md`

Not executed:

- `pnpm validate`

Why skipped:

- only one docs-only Markdown artifact was added
- no code, tests, env, DB, worker, provider, or deployment contract changed
