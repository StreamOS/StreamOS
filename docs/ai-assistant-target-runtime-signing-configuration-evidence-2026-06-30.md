# AI Assistant Target Runtime Signing Configuration Evidence - 2026-06-30

## Decision

Primary decisions:

- `target_runtime_signing_configuration_evidence_defined`
- `target_runtime_signing_configuration_operator_proof_required`
- `runtime_binding_still_pending`
- `activation_not_allowed_now`

Why:

- the reviewed repository already defines the canonical signing env names, HMAC enforcement path, and fail-closed behavior for the AI Assistant route
- the real target-runtime candidate review already confirmed that signing was absent in both live server runtimes during the last collected evidence pass
- the next safe step is not activation work, but a redacted operator evidence artifact that proves the intended signing configuration exists in the target environment
- runtime binding to the same RC SHA and same environment still remains a separate blocker even after signing configuration evidence is collected

No additional decision is granted for:

- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`

No `blocked_by_repo_contract_drift` decision is added because this slice found no hard repo-level mismatch in the AI Assistant signing contract itself.

## Scope

This slice defines only:

- the target-runtime signing configuration evidence shape
- the minimal redacted fields Thomas must later collect
- the signing-specific acceptance and rejection criteria
- the signing-specific handoff boundary between repo evidence and operator evidence

Not done:

- no Railway, Vercel, Supabase, Automation Service, OpenAI, `curl`, or network call
- no runtime activation
- no `productGate` opening
- no `routeMode` transition
- no productive `runtimeStatus`
- no UI, env, DB, worker, provider, or deployment change

Reviewed on current `main` at `e22f5ce6348f9b3702be74db7f2cc8fa044010cc`.

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
- no OpenAI call is reachable

Current internal automation endpoints remain unchanged core/internal surfaces:

- `/clips/analyze`
- `/repurposing/plan`
- `/transcriptions/process`

## Source Evidence Reviewed

- `docs/ai-assistant-signing-runtime-binding-gap-closure-2026-06-30.md`
- `docs/ai-assistant-operator-proof-real-candidate-review-2026-06-30.md`
- `docs/ai-assistant-operator-proof-redacted-evidence-candidate-2026-06-30.md`
- `docs/ai-assistant-private-downstream-reachability-signing-proof-runbook-2026-06-30.md`
- `docs/ai-assistant-signing-parity-verification-2026-06-30.md`
- `docs/deployment.md`
- `services/api-gateway/src/lib/ai-usage-context-issuance.ts`
- `services/api-gateway/src/lib/automation-entitlement-signing.ts`
- `services/api-gateway/src/lib/automation-entitlement-issuer.ts`
- `services/automation-service/src/settings.py`
- `services/automation-service/src/ai_usage_context_enforcement.py`
- `services/automation-service/src/premium_runtime_enforcement.py`
- `packages/types/src/automation-entitlement-assertions.ts`

## Signing Evidence Goal

This evidence artifact exists to prove only the target-runtime signing configuration state for the AI Assistant path.

It must prove:

- which signing mode is configured on Gateway
- which signing mode is configured on Automation
- whether the required signing secret is present on Gateway
- whether the required signing secret is present on Automation
- whether both services classify the secret-owner path as aligned
- whether the signing env names remain server-only and not browser-exposed

It must not prove:

- private reachability by itself
- same-RC runtime binding by itself
- productive runtime readiness
- activation permission

## Repo-Backed Signing Baseline

The reviewed repo establishes these local contract facts:

- canonical signing env names are:
  - `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE`
  - `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET`
- both env names belong to `services/api-gateway` and `services/automation-service`
- both env names remain forbidden in `apps/web`, `NEXT_PUBLIC_*`, browser bundles, and reports
- AI Assistant usage-context issuance is HMAC-only in the reviewed Gateway path
- AI Assistant usage-context enforcement is HMAC-only in the reviewed Automation path
- AI Assistant premium-runtime enforcement is HMAC-only in the reviewed Automation path

Conservative repo interpretation:

- the generic entitlement layer still models `unsigned_internal_contract` and `hmac_sha256`
- the currently reviewed AI Assistant path does not accept unsigned runtime operation as target-runtime-ready signing evidence
- therefore the later operator artifact must prove an HMAC-compatible target-runtime configuration, not only generic contract availability

## Required Target Runtime Signing Evidence

Exactly one signing evidence artifact should later be collected.

It must contain:

1. one signing evidence manifest
2. one Gateway signing status section
3. one Automation signing status section
4. one signing parity summary
5. one secret-safety review

## Signing Evidence Manifest

The signing evidence manifest is the anchor for later review.

Required fields:

| Field                       | Required content                                                  | Why it matters                                | Blocks if missing |
| --------------------------- | ----------------------------------------------------------------- | --------------------------------------------- | ----------------- |
| `evidence_scope`            | `ai_assistant_target_runtime_signing_configuration`               | prevents reuse from another feature           | yes               |
| `rc_sha`                    | exact RC SHA only                                                 | binds evidence to one candidate               | yes               |
| `target_environment`        | one named target environment                                      | prevents mixed-environment evidence           | yes               |
| `proof_runtime_class`       | `release-gate-runner` or equivalent proof-capable Railway runtime | preserves correct collection boundary         | yes               |
| `proof_runtime_scope`       | non-secret service label only                                     | preserves provenance without topology leakage | yes               |
| `collected_at`              | safe timestamp                                                    | supports staleness review                     | yes               |
| `operator_scope`            | redacted operator scope label only                                | proves operator ownership without secrets     | yes               |
| `activation_status`         | `activation_not_allowed_now`                                      | prevents misuse as activation approval        | yes               |
| `secret_safe_review_status` | summarized result only                                            | forces explicit redaction review              | yes               |

## Gateway Signing Status

Required Gateway section fields:

| Field                             | Allowed values                                                    | Reject if                           |
| --------------------------------- | ----------------------------------------------------------------- | ----------------------------------- |
| `service`                         | `api-gateway`                                                     | missing or renamed                  |
| `signing_mode_env_name`           | `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE`                   | wrong env name                      |
| `signing_secret_env_name`         | `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET`                         | wrong env name                      |
| `signing_mode_present`            | `true` or `false`                                                 | missing                             |
| `signing_mode_value_class`        | `hmac_sha256`, `unsigned_internal_contract`, `missing`, `invalid` | raw env dump or secret-like content |
| `signing_secret_present`          | `true` or `false`                                                 | missing                             |
| `signing_secret_owner_path_class` | `server_only_present`, `server_only_missing`, `unknown`           | raw secret value or path disclosure |
| `browser_exposed`                 | `false`                                                           | `true` or missing                   |
| `evidence_secret_safe`            | `true`                                                            | `false` or missing                  |

## Automation Signing Status

Required Automation section fields:

| Field                             | Allowed values                                                    | Reject if                           |
| --------------------------------- | ----------------------------------------------------------------- | ----------------------------------- |
| `service`                         | `automation-service`                                              | missing or renamed                  |
| `signing_mode_env_name`           | `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE`                   | wrong env name                      |
| `signing_secret_env_name`         | `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET`                         | wrong env name                      |
| `signing_mode_present`            | `true` or `false`                                                 | missing                             |
| `signing_mode_value_class`        | `hmac_sha256`, `unsigned_internal_contract`, `missing`, `invalid` | raw env dump or secret-like content |
| `signing_secret_present`          | `true` or `false`                                                 | missing                             |
| `signing_secret_owner_path_class` | `server_only_present`, `server_only_missing`, `unknown`           | raw secret value or path disclosure |
| `browser_exposed`                 | `false`                                                           | `true` or missing                   |
| `evidence_secret_safe`            | `true`                                                            | `false` or missing                  |

## Signing Parity Summary

The signing parity summary must reduce the two service sections into one operator-readable result.

Required fields:

| Field                                         | Allowed values                        | Reject if          |
| --------------------------------------------- | ------------------------------------- | ------------------ |
| `category`                                    | `gateway_automation_signing_parity`   | missing or renamed |
| `gateway_mode_expected_for_ai_assistant`      | `hmac_sha256`                         | missing            |
| `automation_mode_expected_for_ai_assistant`   | `hmac_sha256`                         | missing            |
| `signing_mode_parity`                         | `aligned` or `misaligned`             | missing            |
| `signing_secret_presence_parity`              | `aligned` or `misaligned`             | missing            |
| `signing_owner_path_parity`                   | `aligned`, `misaligned`, or `unknown` | missing            |
| `browser_exposed`                             | `false`                               | `true` or missing  |
| `evidence_secret_safe`                        | `true`                                | `false` or missing |
| `signing_configuration_ready_for_next_review` | `true` or `false`                     | missing            |

Interpretation:

- `signing_mode_parity=aligned` is necessary but not sufficient
- `signing_secret_presence_parity=aligned` is necessary but not sufficient
- `signing_owner_path_parity=aligned` is necessary for later activation-grade review
- `signing_configuration_ready_for_next_review=true` still does not allow activation

## Secret-Safety Review

The signing evidence artifact must include one explicit secret-safety review.

Required fields:

| Field                  | Allowed values                    | Reject if         |
| ---------------------- | --------------------------------- | ----------------- |
| `category`             | `activation_evidence_secret_safe` | missing           |
| `secrets_present`      | `false`                           | `true` or missing |
| `tokens_present`       | `false`                           | `true` or missing |
| `private_urls_present` | `false`                           | `true` or missing |
| `signatures_present`   | `false`                           | `true` or missing |
| `raw_payloads_present` | `false`                           | `true` or missing |
| `raw_errors_present`   | `false`                           | `true` or missing |
| `review_result`        | `secret_safe` or `rejected`       | missing           |

## Target Runtime Signing Evidence Template

```yaml
signing_evidence_manifest:
  evidence_scope: ai_assistant_target_runtime_signing_configuration
  rc_sha: <rc_sha_only>
  target_environment: <environment_name_only>
  proof_runtime_class: release-gate-runner
  proof_runtime_scope: <service_label_only>
  collected_at: <timestamp_only>
  operator_scope: <redacted_operator_scope_only>
  activation_status: activation_not_allowed_now
  secret_safe_review_status: <secret_safe_or_rejected>

gateway_signing_status:
  service: api-gateway
  signing_mode_env_name: AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE
  signing_secret_env_name: AUTOMATION_ENTITLEMENT_ASSERTION_SECRET
  signing_mode_present: <true_or_false>
  signing_mode_value_class: <hmac_sha256_or_unsigned_internal_contract_or_missing_or_invalid>
  signing_secret_present: <true_or_false>
  signing_secret_owner_path_class: <server_only_present_or_server_only_missing_or_unknown>
  browser_exposed: false
  evidence_secret_safe: true

automation_signing_status:
  service: automation-service
  signing_mode_env_name: AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE
  signing_secret_env_name: AUTOMATION_ENTITLEMENT_ASSERTION_SECRET
  signing_mode_present: <true_or_false>
  signing_mode_value_class: <hmac_sha256_or_unsigned_internal_contract_or_missing_or_invalid>
  signing_secret_present: <true_or_false>
  signing_secret_owner_path_class: <server_only_present_or_server_only_missing_or_unknown>
  browser_exposed: false
  evidence_secret_safe: true

signing_parity_summary:
  category: gateway_automation_signing_parity
  gateway_mode_expected_for_ai_assistant: hmac_sha256
  automation_mode_expected_for_ai_assistant: hmac_sha256
  signing_mode_parity: <aligned_or_misaligned>
  signing_secret_presence_parity: <aligned_or_misaligned>
  signing_owner_path_parity: <aligned_or_misaligned_or_unknown>
  browser_exposed: false
  evidence_secret_safe: true
  signing_configuration_ready_for_next_review: <true_or_false>

secret_safety_review:
  category: activation_evidence_secret_safe
  secrets_present: false
  tokens_present: false
  private_urls_present: false
  signatures_present: false
  raw_payloads_present: false
  raw_errors_present: false
  review_result: <secret_safe_or_rejected>
```

## Operator Collection Checklist

- confirm one RC SHA is recorded before collecting signing evidence
- confirm one target environment name is recorded before collecting signing evidence
- confirm the proof runtime class is `release-gate-runner` or equivalent
- confirm Gateway records one classified signing mode result
- confirm Gateway records one classified signing secret presence result
- confirm Automation records one classified signing mode result
- confirm Automation records one classified signing secret presence result
- confirm both service sections use only env names and redacted value classes
- confirm browser exposure is explicitly recorded as `false`
- confirm signing parity is reduced to summarized boolean or classification outcomes only
- confirm the evidence artifact still states `activation_not_allowed_now`

## Repo Boundary

Repo-seitig already available:

- canonical env-name ownership
- HMAC-only AI Assistant signing expectation
- fail-closed denial when HMAC signing is unavailable
- shared-secret requirement semantics when HMAC mode is selected

Repo-seitig not elevated by this slice:

- no live confirmation that target runtime envs are actually configured
- no live confirmation that the same secret-owner path is used on both services
- no live confirmation that the signing evidence belongs to the same RC as the reachability evidence

## Still-Pending Runtime Binding

Even a valid signing configuration artifact does not close the runtime-binding blocker.

Still pending after this slice:

- `release-gate-runner` to Gateway RC equality evidence
- `release-gate-runner` to Automation RC equality evidence
- same-environment evidence across all three runtimes
- one combined bundle that binds signing and reachability to the same RC/environment context

## Forbidden Evidence

The signing evidence artifact must not contain:

- secret values
- secret substrings
- HMAC material
- signatures
- raw assertion payloads
- raw env dumps
- private URLs
- full internal hostnames
- raw CLI output
- raw errors that echo secret-like content
- tokens
- provider payloads
- OpenAI payloads

## Activation Boundary

This slice does not allow activation.

Conservative boundary result:

- `target_runtime_signing_configuration_evidence_defined` is justified
- `target_runtime_signing_configuration_operator_proof_required` remains mandatory
- `runtime_binding_still_pending` remains mandatory
- `activation_not_allowed_now` remains mandatory

This slice cannot conclude:

- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`

Even after later positive signing evidence, these separate blockers still remain:

- private reachability bundle reuse or recollection under the same RC/environment
- same-RC runtime binding
- budget and metering operational proof
- `productGate` opening proof
- `routeMode` transition proof
- coordinated productive `runtimeStatus` proof
- rollback proof
- productive downstream implementation in `services/automation-service`

## Recommended Next Slice

Exactly one next slice is recommended:

`AI Assistant Target Runtime Runtime Binding Evidence`

Why:

- this slice narrows the operator work to one secret-safe signing artifact
- the next unresolved blocker after that artifact is still same-RC and same-environment runtime binding
- keeping signing and runtime binding as separate evidence slices makes later review stricter and easier to reject if they drift

## Checks

Executed for this docs-only slice:

- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant-target-runtime-signing-configuration-evidence-2026-06-30.md`

Not executed:

- `pnpm validate`

Why skipped:

- only one docs-only Markdown file was added
- no code, tests, env, DB, worker, provider, or deployment contract changed
