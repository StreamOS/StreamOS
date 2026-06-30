# AI Assistant Signing Runtime Configuration Plan - 2026-06-30

## Decision

Primary decisions:

- `signing_runtime_configuration_plan_created`
- `operator_env_configuration_required`
- `same_rc_binding_still_required`
- `activation_not_allowed_now`

Why:

- the current reviewed target-runtime evidence shows that AI Assistant signing runtime configuration is absent on both `services/api-gateway` and `services/automation-service`
- repo and docs evidence already define the canonical signing env names, server-only ownership, and fail-closed behavior
- the next safe step is a secret-safe operator handoff and evidence plan, not live configuration or runtime activation
- same-RC runtime binding remains a separate proof requirement and is not closed by this planning slice

No additional decision is granted for:

- `signing_runtime_config_applied`
- `signing_ready_for_activation`
- `same_rc_binding_proven`
- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`

No `blocked_by_signing_config_contract_drift` decision is added because the reviewed repo contracts still align on the AI Assistant fail-closed boundary. The gap is target-runtime configuration and later operator proof, not repo-level contract drift.

## Scope

This slice defines only:

- a secret-safe plan for later AI Assistant signing runtime configuration
- env-name ownership and owner-service expectations
- a redacted operator handoff for later target-runtime configuration and evidence collection
- the boundary between signing configuration planning and separate same-RC runtime binding proof

Not done:

- no code change
- no test change
- no env change
- no live Railway, Vercel, Supabase, Automation Service, OpenAI, `curl`, or network call
- no runtime activation
- no `productGate` opening
- no `routeMode` transition
- no productive `runtimeStatus`

Reviewed on current branch descendant at `35bd1b7ced1cb7124a64d8c8c457c3bbf58fff93`.

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

## Source Evidence Reviewed

- `docs/ai-assistant-target-runtime-signing-binding-evidence-review-2026-06-30.md`
- `docs/ai-assistant-target-runtime-signing-runtime-binding-redacted-evidence-2026-06-30.md`
- `docs/ai-assistant-signing-runtime-binding-gap-closure-2026-06-30.md`
- `docs/ai-assistant-operator-proof-real-candidate-review-2026-06-30.md`
- `docs/ai-assistant-private-downstream-reachability-signing-proof-runbook-2026-06-30.md`
- `docs/ai-assistant-signing-parity-verification-2026-06-30.md`
- `docs/deployment.md`
- `docs/architecture.md`
- `packages/types/src/automation-entitlement-assertions.ts`
- `services/api-gateway/src/lib/ai-assistant-automation-downstream-contract.ts`
- `services/api-gateway/src/lib/ai-assistant-activation-transition-contract.ts`
- `services/api-gateway/src/lib/ai-assistant-activation-preflight.ts`
- `services/api-gateway/src/lib/ai-usage-context-issuance.ts`
- `services/api-gateway/src/lib/automation-entitlement-signing.ts`
- `services/automation-service/src/ai_assistant_downstream_contract.py`
- `services/automation-service/src/ai_assistant_backend_contract.py`
- `services/automation-service/src/ai_usage_context_enforcement.py`
- `services/automation-service/src/premium_runtime_enforcement.py`
- `services/automation-service/src/settings.py`

## Signing Mode Options

### `unsigned_internal_contract`

What repo/docs evidence says:

- the generic shared assertion layer still models `unsigned_internal_contract`
- `docs/deployment.md` still shows `unsigned_internal_contract` as a generic default on both services

Why it is not sufficient for the AI Assistant path:

- Gateway AI Assistant usage-context issuance denies when the runtime signing config is not HMAC-ready
- Automation AI Assistant usage-context enforcement is HMAC-only for the reviewed path
- Automation premium runtime enforcement for `ai_assistant` is also HMAC-only

Planning conclusion:

- `unsigned_internal_contract` remains a generic contract mode
- it is not the recommended next proof path for the AI Assistant runtime configuration gap
- using it would preserve the current fail-closed block rather than close the missing-signing gap

### `hmac_sha256`

What repo/docs evidence says:

- this is the required AI Assistant runtime mode for the reviewed Gateway issuance path
- this is the required AI Assistant runtime mode for the reviewed Automation usage-context and premium-runtime enforcement path
- if `hmac_sha256` is used, `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` must be present and server-only on both services

Planning consequences:

- Gateway and Automation must use the same signing mode
- Gateway and Automation must both show secret-presence parity
- later operator evidence must show secret-owner-path parity without revealing any secret value
- `apps/web`, Vercel browser env, and any `NEXT_PUBLIC_*` path remain forbidden owners

## Recommended Signing Configuration Path

Recommended next proof-oriented configuration path:

- use `hmac_sha256` as the later operator-applied target-runtime mode for the AI Assistant path

Why this is the conservative recommendation:

- it is the only reviewed mode that can satisfy both Gateway AI usage-context issuance and Automation AI Assistant runtime enforcement
- it closes the missing-signing-runtime-config gap in a way that is consistent with the fail-closed AI Assistant path
- it avoids pretending that generic `unsigned_internal_contract` compatibility is enough for the narrower AI Assistant route contract

What this plan does not do:

- it does not set the mode
- it does not create or rotate any secret
- it does not prove the shared secret owner path
- it does not prove same-RC runtime binding
- it does not allow activation

## Env Ownership Matrix

| Env Name                                        | Owner Service                 | Required When                                             | Must Not Exist In                                              | Secret-Safety Rule                                                        | Evidence Required                                     |
| ----------------------------------------------- | ----------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` | `services/api-gateway`        | always for later AI Assistant signing proof               | `apps/web`, Vercel browser env, `NEXT_PUBLIC_*`, reports       | document env name only, never dump values beyond redacted class           | `signing_mode_present`, `signing_mode_value_class`    |
| `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` | `services/automation-service` | always for later AI Assistant signing proof               | `apps/web`, Vercel browser env, `NEXT_PUBLIC_*`, reports       | document env name only, never dump values beyond redacted class           | `signing_mode_present`, `signing_mode_value_class`    |
| `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET`       | `services/api-gateway`        | only when later operator configuration uses `hmac_sha256` | `apps/web`, Vercel browser env, `NEXT_PUBLIC_*`, logs, reports | never print or store the secret value, only presence and owner-path class | `signing_secret_present`, `signing_owner_path_parity` |
| `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET`       | `services/automation-service` | only when later operator configuration uses `hmac_sha256` | `apps/web`, Vercel browser env, `NEXT_PUBLIC_*`, logs, reports | never print or store the secret value, only presence and owner-path class | `signing_secret_present`, `signing_owner_path_parity` |

## Operator Configuration Handoff

Thomas should later do only operator-owned target-runtime work. This plan does not perform it.

Minimal operator handoff checklist:

- set one intended target environment and keep it stable across all later signing and runtime-binding evidence
- configure `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` on `services/api-gateway`
- configure `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` on `services/automation-service`
- if the target mode is `hmac_sha256`, ensure `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` is present on both services
- keep both env names server-only and absent from `apps/web`, Vercel browser env, and `NEXT_PUBLIC_*`
- collect only boolean or redacted evidence fields
- do not record raw env values, secret substrings, raw assertion payloads, or raw errors

Allowed later redacted evidence fields:

- `gateway_signing_mode_present`
- `gateway_signing_mode_value_class`
- `gateway_signing_secret_present`
- `automation_signing_mode_present`
- `automation_signing_mode_value_class`
- `automation_signing_secret_present`
- `signing_mode_parity`
- `signing_secret_presence_parity`
- `signing_owner_path_parity`
- `browser_exposed=false`
- `artifact_secret_safe=true`

Required interpretation rules for later evidence:

- both mode fields missing means `negative_parity_by_absence`, not readiness
- both secret-presence fields false means `negative_secret_presence_parity_by_absence`, not readiness
- both mode fields `hmac_sha256` plus both secret-presence fields true is necessary but still not sufficient without owner-path parity and same-RC proof

## Runtime Binding Follow-up

Same-RC binding remains a separate required proof track.

Later non-secret runtime-binding evidence still needed:

- `release-gate-runner` RC SHA
- `api-gateway` RC SHA
- `automation-service` RC SHA
- same target environment across all three runtimes
- same Railway project across all three runtimes
- same proof-runtime bundle binding between signing evidence and runtime-binding evidence

Allowed later runtime-binding fields:

- `rc_sha_release_gate_runner`
- `rc_sha_api_gateway`
- `rc_sha_automation_service`
- `same_rc_sha_across_runner_gateway_automation`
- `target_environment_release_gate_runner`
- `target_environment_api_gateway`
- `target_environment_automation_service`
- `same_target_environment_across_runner_gateway_automation`
- `same_railway_project_across_runner_gateway_automation`

This plan intentionally keeps runtime binding separate because:

- signing configuration can be planned without proving deployed commit equality
- same-RC proof requires different non-secret provenance surfaces than env-ownership proof
- mixing both categories too early makes drift harder to reject cleanly

## Evidence Acceptance Criteria

Positive signing evidence for the later proof slice requires all of the following:

- Gateway signing mode present
- Automation signing mode present
- Gateway signing mode value class `hmac_sha256`
- Automation signing mode value class `hmac_sha256`
- Gateway signing secret present when `hmac_sha256` is used
- Automation signing secret present when `hmac_sha256` is used
- `signing_mode_parity=aligned`
- `signing_secret_presence_parity=aligned`
- `signing_owner_path_parity=aligned`
- browser exposure absent
- no secret value disclosure

Negative parity by absence means:

- both signing-mode fields are missing, or
- both secret-presence fields are false

That evidence is accepted only as:

- shared absence without contract drift
- not activation readiness
- not proof that the AI Assistant signing runtime configuration exists

Rejected evidence includes:

- raw env dumps
- secret values or secret fragments
- `unsigned_internal_contract` presented as sufficient for the AI Assistant path
- browser-visible ownership of either signing env
- mixed-environment evidence
- mixed-RC evidence
- any artifact that cannot distinguish between shared absence and positive configured parity

Activation remains blocked if any of the following remain true:

- signing mode missing on either service
- signing mode not `hmac_sha256` for the reviewed AI Assistant path
- signing secret missing on either service when `hmac_sha256` is used
- `signing_owner_path_parity` is not proven
- same-RC runtime binding is not proven
- secret safety fails

## Forbidden Evidence

The plan and any later operator artifact must not contain:

- secret values
- secret substrings
- tokens
- private URLs
- full internal hostnames
- signatures
- raw payloads
- raw prompts
- raw trusted-context or resolved-context payloads
- model responses
- raw errors
- raw env dumps
- Redis URLs
- Supabase service-role values
- OpenAI keys
- raw CLI transcripts

## Activation Boundary

This plan does not allow activation.

Conservative boundary result:

- `signing_runtime_configuration_plan_created` is justified
- `operator_env_configuration_required` remains mandatory
- `same_rc_binding_still_required` remains mandatory
- `activation_not_allowed_now` remains mandatory

This plan does not justify:

- `signing_runtime_config_applied`
- `signing_ready_for_activation`
- `same_rc_binding_proven`
- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`

Even after later positive signing configuration evidence, these separate blockers still remain:

- private reachability bundle freshness under the same RC/environment context
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

- this planning slice defines the recommended HMAC-ready operator path without applying any runtime configuration
- the next smallest safe step is to collect one secret-safe, redacted target-runtime evidence artifact that proves the planned signing configuration exists
- same-RC runtime binding should remain separately reviewable while the signing evidence is collected

## Checks

Executed for this docs-only slice:

- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant-signing-runtime-configuration-plan-2026-06-30.md`

Not executed:

- `pnpm validate`

Why skipped:

- only one Markdown planning document was added
- no code, tests, env, DB, worker, provider, or deployment contract changed
