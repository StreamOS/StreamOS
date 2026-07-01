# AI Assistant Target Runtime Signing and Runtime-Binding Redacted Evidence - 2026-06-30

## Decision

Primary decisions:

- `target_runtime_signing_evidence_collected`
- `runtime_binding_partially_collected`
- `activation_not_allowed_now`

Why:

- live target-runtime signing evidence was collected for `api-gateway` and `automation-service` without copying any secret values
- signing parity can be classified from redacted presence and value-class results only
- target-environment binding is positively evidenced as `production` across `release-gate-runner`, `api-gateway`, and `automation-service`
- same-RC binding is not proven across all three runtimes because only `release-gate-runner` exposed a non-secret RC SHA in the collection paths used here

No additional decision is granted for:

- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`

## Scope

This artifact collects only:

- redacted AI Assistant signing evidence for `api-gateway`
- redacted AI Assistant signing evidence for `automation-service`
- redacted signing parity outcomes
- one separate runtime-binding evidence block

Not done:

- no runtime activation
- no `productGate` change
- no `routeMode` change
- no `runtimeStatus` change
- no UI, env, DB, worker, provider, or OpenAI change
- no secret extraction
- no env dump
- no private URL or hostname reporting

Collection timestamp:

- `2026-06-30T23:00:34.3616319+02:00`

## Current Activation Boundary

Current result remains:

- `activation_not_allowed_now`

This artifact does not permit:

- opening `productGate`
- moving `routeMode` out of `disabled`
- making Gateway productive
- making Automation productive
- enabling a productive downstream

Core/internal Automation endpoints remain unchanged:

- `/clips/analyze`
- `/repurposing/plan`
- `/transcriptions/process`

## Signing Evidence

```yaml
gateway_signing_status:
  gateway_signing_mode_present: false
  gateway_signing_mode_value_class: missing
  gateway_signing_secret_present: false

automation_signing_status:
  service: automation-service
  signing_mode_env_name: AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE
  signing_secret_env_name: AUTOMATION_ENTITLEMENT_ASSERTION_SECRET
  signing_secret_owner_path_class: unknown
  browser_exposed: false
  evidence_secret_safe: true
  automation_signing_mode_present: false
  automation_signing_mode_value_class: missing
  automation_signing_secret_present: false
```

Observed redacted facts:

- `api-gateway` target-runtime variable ownership path included neither AI Assistant signing variable as a present runtime value
- `automation-service` target-runtime variable ownership path included neither AI Assistant signing variable as a present runtime value
- no signing mode value other than the required class `hmac_sha256` was observed because both mode variables were absent
- no signing secret value was copied, printed, or stored

## Signing Parity

```yaml
signing_parity_summary:
  category: gateway_automation_signing_parity
  gateway_mode_expected_for_ai_assistant: hmac_sha256
  automation_mode_expected_for_ai_assistant: hmac_sha256
  browser_exposed: false
  evidence_secret_safe: true
  signing_configuration_ready_for_next_review: false
  signing_mode_parity: aligned
  signing_secret_presence_parity: aligned
  signing_owner_path_parity: unknown
```

Interpretation:

- `signing_mode_parity=aligned` here means both services are aligned on absence, not that they are activation-ready
- `signing_secret_presence_parity=aligned` here means both services are aligned on absence, not that they are activation-ready
- `signing_owner_path_parity=unknown` remains necessary because this collection intentionally did not disclose or compare raw owner-path details beyond server-side service scope

## Signing Evidence Manifest

```yaml
signing_evidence_manifest:
  evidence_scope:
    - target-runtime signing evidence (redacted) for api-gateway
    - target-runtime signing evidence (redacted) for automation-service
    - signing parity outcomes
    - runtime-binding evidence (separately collected)
  rc_sha: not_fully_proven_in_this_artifact
  target_environment: production
  proof_runtime_class: target_runtime
  collected_at: 2026-06-30T23:00:34.3616319+02:00
  operator_scope: redacted_evidence_collection_no_secret_extraction
  activation_status: activation_not_allowed_now
  secret_safe_review_status: passed_no_secret_values_copied_printed_or_stored
```

## Runtime-Binding Evidence

This block is intentionally separate from signing evidence.

```yaml
runtime_binding_evidence:
  proof_runtime_service: release-gate-runner
  rc_sha_release_gate_runner: a23d3cf4d82315c9861598e28ef5bfd2f2ce31db
  rc_sha_api_gateway: not_proven
  rc_sha_automation_service: not_proven
  same_rc_sha_across_runner_gateway_automation: not_proven
  target_environment_release_gate_runner: production
  target_environment_api_gateway: production
  target_environment_automation_service: production
  same_target_environment_across_runner_gateway_automation: aligned
```

Observed redacted facts:

- `release-gate-runner` exposed a non-secret provenance file with one concrete RC SHA and `environment=production`
- `api-gateway` exposed `target_environment=production` through target-runtime service metadata, but the collection paths used here did not yield a successful non-secret RC SHA proof
- `automation-service` exposed `target_environment=production` through target-runtime service metadata, but the collection paths used here did not yield a non-secret RC SHA proof
- live target-runtime searches for `runtime-provenance.json` in `api-gateway` and `automation-service` did not return a readable provenance file path during this collection
- target-environment consistency is proven; same-RC consistency is not

## Secret-Safety Review

```yaml
secret_safety_review:
  category: activation_evidence_secret_safe
  secrets_present: false
  tokens_present: false
  private_urls_present: false
  signatures_present: false
  raw_payloads_present: false
  raw_errors_present: false
  review_result: secret_safe
```

Redaction notes:

- no secret values were copied
- no env values were copied
- no private Railway URLs or hostnames were copied
- no raw request or response bodies were copied
- no raw provider payloads or OpenAI payloads were copied

## Result

Conservative result:

- signing evidence is collected and secret-safe
- runtime-binding evidence is collected separately and remains incomplete for same-RC proof
- `activation_not_allowed_now` remains mandatory

Remaining blockers from this artifact:

- `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` is not present in `api-gateway`
- `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` is not present in `api-gateway`
- `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` is not present in `automation-service`
- `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` is not present in `automation-service`
- same-RC proof is missing for `api-gateway`
- same-RC proof is missing for `automation-service`

## Evidence Sources

Redacted source classes used:

- Railway production service-variable ownership metadata for `api-gateway`
- Railway production service-variable ownership metadata for `automation-service`
- Railway production non-secret provenance file from `release-gate-runner`
- Railway production deployment metadata for `api-gateway`
- Railway production deployment metadata for `automation-service`
- Railway production deployment metadata for `release-gate-runner`

## Checks

Executed for this docs-only evidence slice:

- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant-target-runtime-signing-runtime-binding-redacted-evidence-2026-06-30.md`

Not executed:

- `pnpm validate`

Why skipped:

- only one docs-only Markdown artifact was added
- no code, tests, env, DB, worker, provider, or deployment contract changed
