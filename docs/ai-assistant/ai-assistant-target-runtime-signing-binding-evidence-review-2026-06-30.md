# AI Assistant Target Runtime Signing Binding Evidence Review - 2026-06-30

## Decision

Primary decisions:

- `target_runtime_evidence_reviewed`
- `target_environment_binding_accepted`
- `signing_negative_parity_by_absence`
- `signing_runtime_config_missing`
- `signing_owner_path_unknown`
- `same_rc_binding_not_proven`
- `activation_not_allowed_now`

Why:

- the reviewed redacted evidence report is concrete enough to classify target-runtime signing and runtime-binding outcomes without re-running any live checks
- Gateway and Automation are aligned on signing-mode absence and signing-secret absence, but that alignment is negative parity by shared absence rather than productive readiness
- target-environment binding is positively accepted as partial evidence because all three runtimes are classified as `production`
- same-RC binding remains blocked because only `release-gate-runner` exposed a non-secret RC SHA in the reviewed evidence

No additional decision is granted for:

- `signing_ready_for_activation`
- `same_rc_binding_proven`
- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`

## Scope

This slice reviews only:

- the redacted target-runtime signing and runtime-binding evidence report
- prior AI Assistant proof and runbook docs needed to classify that evidence
- local repository contracts that confirm fail-closed behavior and non-productive runtime boundaries

Not done:

- no live Railway, Vercel, Supabase, Automation Service, OpenAI, `curl`, or network call
- no env read or env change
- no runtime activation
- no `productGate` opening
- no `routeMode` transition
- no productive `runtimeStatus`
- no code or test change

Reviewed on current `main` at `011753c42cc2b0312bd5556ab5da25e873df19c5`.

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

## Evidence Reviewed

- `docs/ai-assistant/ai-assistant-target-runtime-signing-runtime-binding-redacted-evidence-2026-06-30.md`
- `docs/ai-assistant/ai-assistant-signing-runtime-binding-gap-closure-2026-06-30.md`
- `docs/ai-assistant/ai-assistant-operator-proof-real-candidate-review-2026-06-30.md`
- `docs/ai-assistant/ai-assistant-operator-proof-redacted-evidence-candidate-2026-06-30.md`
- `docs/ai-assistant/ai-assistant-private-downstream-reachability-signing-proof-runbook-2026-06-30.md`
- `docs/ai-assistant/ai-assistant-signing-parity-verification-2026-06-30.md`
- `docs/ai-assistant/ai-assistant-private-reachability-proof-2026-06-30.md`
- `docs/architecture.md`
- `docs/deployment.md`
- `services/api-gateway/src/lib/ai-assistant-automation-downstream-contract.ts`
- `services/api-gateway/src/lib/ai-assistant-activation-transition-contract.ts`
- `services/api-gateway/src/lib/ai-assistant-activation-preflight.ts`
- `services/automation-service/src/ai_assistant_downstream_contract.py`
- `services/automation-service/src/ai_assistant_backend_contract.py`

## Review Rules Applied

- live target-runtime evidence was reviewed as submitted and was not re-collected
- local repo contracts, fixtures, and tests were not promoted to production proof
- negative parity by shared absence was kept separate from positive runtime readiness
- target-environment alignment was allowed as partial evidence only
- same-RC binding required explicit non-secret proof across runner, Gateway, and Automation
- activation remained blocked regardless of any partial evidence accepted here
- only secret-safe redacted metadata was treated as reviewable evidence

## Signing Evidence Matrix

| Area                     | Gateway Evidence                           | Automation Evidence                           | Parity Result | Accepted As                                  | Gap                                                        | Blocks Activation |
| ------------------------ | ------------------------------------------ | --------------------------------------------- | ------------- | -------------------------------------------- | ---------------------------------------------------------- | ----------------- |
| signing mode presence    | `gateway_signing_mode_present=false`       | `automation_signing_mode_present=false`       | `aligned`     | `negative_parity_aligned_by_absence`         | required runtime signing mode is missing on both services  | yes               |
| signing mode value class | `gateway_signing_mode_value_class=missing` | `automation_signing_mode_value_class=missing` | `aligned`     | `negative_parity_aligned_by_absence`         | no `hmac_sha256` runtime evidence exists on either side    | yes               |
| signing secret presence  | `gateway_signing_secret_present=false`     | `automation_signing_secret_present=false`     | `aligned`     | `negative_secret_presence_parity_by_absence` | shared signing secret presence is missing on both services | yes               |
| signing owner path       | no positive owner-path proof               | no positive owner-path proof                  | `unknown`     | `not_accepted_as_ready`                      | same server-only owner path is not proven                  | yes               |

## Runtime Binding Matrix

| Runtime               | Target Environment | RC SHA Status                                             | Accepted Evidence                          | Gap                                                        | Blocks Activation |
| --------------------- | ------------------ | --------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- | ----------------- |
| `release-gate-runner` | `production`       | `a23d3cf4d82315c9861598e28ef5bfd2f2ce31db`                | non-secret runner provenance accepted      | none within runner-only scope                              | yes               |
| `api-gateway`         | `production`       | `not_proven`                                              | target-environment classification accepted | no non-secret Gateway RC SHA proof in reviewed artifact    | yes               |
| `automation-service`  | `production`       | `not_proven`                                              | target-environment classification accepted | no non-secret Automation RC SHA proof in reviewed artifact | yes               |
| combined binding      | `aligned`          | `same_rc_sha_across_runner_gateway_automation=not_proven` | target-environment alignment accepted      | same-RC equality across all three runtimes is not proven   | yes               |

## Signing Runtime Configuration Review

Result: blocked.

The reviewed evidence shows that both services are aligned on missing AI Assistant signing configuration in the target runtime. That is useful to reject drift, but it is not useful to claim readiness.

Conservative interpretation:

- `signing_mode_parity=aligned` is accepted only as `signing_negative_parity_by_absence`
- `signing_secret_presence_parity=aligned` is accepted only as `negative_secret_presence_parity_by_absence`
- neither result proves that the target runtime is configured for the HMAC-only AI Assistant path
- activation therefore remains blocked by missing runtime signing configuration on both sides

## Signing Owner Path Review

Result: blocked.

The reviewed evidence report explicitly leaves `signing_owner_path_parity=unknown`. That is the correct conservative state because the collected artifact does not prove that Gateway and Automation share the same server-only secret owner path.

Accepted conclusion:

- no owner-path drift is positively proven
- no owner-path alignment is positively proven
- `signing_owner_path_unknown` remains a distinct blocker even beyond the shared-absence result

## Runtime Binding Review

Result: partially accepted, still blocked.

Accepted partial evidence:

- `release-gate-runner` provided one concrete non-secret RC SHA
- `target_environment_release_gate_runner=production`
- `target_environment_api_gateway=production`
- `target_environment_automation_service=production`
- `same_target_environment_across_runner_gateway_automation=aligned`

Blocked evidence:

- `rc_sha_api_gateway=not_proven`
- `rc_sha_automation_service=not_proven`
- `same_rc_sha_across_runner_gateway_automation=not_proven`

Conservative interpretation:

- environment binding is strong enough to accept as partial evidence
- same-RC binding is not strong enough to promote any activation-adjacent claim
- the combined artifact therefore remains blocked on runtime-binding completeness

## Accepted Evidence

The following evidence is accepted from the reviewed report:

- `target_environment_binding_accepted`
- signing mode alignment exists as shared absence only
- signing secret presence alignment exists as shared absence only
- `release-gate-runner` RC SHA evidence is concrete and non-secret
- target-environment alignment across runner, Gateway, and Automation is concrete
- artifact-level secret safety remains acceptable

Accepted evidence boundary:

- accepted evidence is partial and redacted
- accepted evidence is not activation evidence
- accepted evidence does not close runtime signing readiness
- accepted evidence does not close same-RC runtime binding

## Blocking Gaps

- `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` is missing in `api-gateway` target-runtime evidence
- `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` is missing in `automation-service` target-runtime evidence
- `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` presence is missing in `api-gateway` target-runtime evidence
- `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` presence is missing in `automation-service` target-runtime evidence
- `signing_owner_path_parity=unknown`
- `rc_sha_api_gateway=not_proven`
- `rc_sha_automation_service=not_proven`
- `same_rc_sha_across_runner_gateway_automation=not_proven`

## Secret-Safety Review

Result: `secret_safe`.

Accepted secret-safety basis:

- no secret values are included
- no tokens are included
- no private URLs or full internal hostnames are included
- no signatures are included
- no raw payloads, prompts, contexts, model responses, or raw errors are included

Therefore:

- `evidence_rejected_secret_safety_failure` does not apply to this review

## Activation Boundary

This review does not allow activation.

Conservative boundary result:

- `target_runtime_evidence_reviewed` is justified
- `target_environment_binding_accepted` is justified as partial evidence only
- `signing_negative_parity_by_absence` remains non-readiness evidence
- `signing_runtime_config_missing` remains mandatory
- `signing_owner_path_unknown` remains mandatory
- `same_rc_binding_not_proven` remains mandatory
- `activation_not_allowed_now` remains mandatory

This review does not justify:

- `signing_ready_for_activation`
- `same_rc_binding_proven`
- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`

Even if the signing and same-RC gaps were closed later, these separate blockers would still remain:

- budget and metering operational proof
- `productGate` opening proof
- `routeMode` transition proof
- coordinated productive `runtimeStatus` proof
- rollback proof
- productive downstream implementation in `services/automation-service`

## Recommended Next Slice

Exactly one next slice is recommended:

`AI Assistant Signing Runtime Configuration Plan`

Why:

- the reviewed evidence already distinguishes partial environment alignment from missing runtime signing readiness
- the next smallest safe step is to define how target-runtime signing configuration should be brought from shared absence to explicit HMAC-ready, server-only, secret-safe evidence
- a planning slice is safer than another live collection step while owner-path and same-RC gaps remain unresolved

## Checks

Executed for this docs-only slice:

- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant/ai-assistant-target-runtime-signing-binding-evidence-review-2026-06-30.md`

Not executed:

- `pnpm validate`

Why skipped:

- exactly one Markdown review report was added
- no code, tests, env, DB, worker, provider, or deployment contract changed
