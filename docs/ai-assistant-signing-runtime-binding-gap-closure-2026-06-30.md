# AI Assistant Signing and Runtime Binding Gap Closure - 2026-06-30

## Decision

Primary decisions:

- `signing_runtime_config_gap_reviewed`
- `runtime_binding_gap_reviewed`
- `operator_gap_closure_required`
- `operator_env_action_required`
- `activation_not_allowed_now`

Why:

- the reviewed repository still models the AI Assistant route as fail-closed and not yet productive
- the reviewed repository provides local contract foundations for HMAC-based AI Assistant usage-context signing, downstream contract validation, and Gateway runtime provenance headers
- the real redacted evidence candidate already accepted private reachability and artifact-level redaction
- the remaining gaps are target-runtime signing configuration and same-RC binding evidence, not route exposure or UI/runtime activation work
- no hard signing-contract drift was found in the reviewed repo contracts

No additional decision is granted for:

- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`

No `blocked_by_repo_contract_drift` decision is added because no hard repo-level signing contract mismatch was found in the reviewed AI Assistant path. The remaining gap is dominated by operator-owned target-environment evidence and configuration.

## Scope

This slice reviews only:

- existing AI Assistant proof and runbook docs merged through PR `#231`
- local repository code and contract files relevant to signing and runtime binding
- which gap-closure steps are already possible from repo contracts
- which gap-closure steps still require Thomas as operator in the target environment

Not done:

- no Railway, Vercel, Supabase, Automation Service, OpenAI, `curl`, or network call
- no runtime activation
- no `productGate` opening
- no `routeMode` transition
- no productive `runtimeStatus`
- no UI, env, DB, worker, provider, or deployment change

Reviewed on current `main` at `e9fefa77ce9d461ec8aa91cd40045d4d020bd60b`.

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

- `docs/ai-assistant-operator-proof-real-candidate-review-2026-06-30.md`
- `docs/ai-assistant-operator-proof-redacted-evidence-candidate-2026-06-30.md`
- `docs/ai-assistant-operator-proof-evidence-collection-follow-up-2026-06-30.md`
- `docs/ai-assistant-private-downstream-reachability-signing-proof-runbook-2026-06-30.md`
- `docs/ai-assistant-signing-parity-verification-2026-06-30.md`
- `docs/ai-assistant-private-reachability-proof-2026-06-30.md`
- `docs/ai-assistant-budget-metering-production-proof-2026-06-30.md`
- `docs/deployment.md`
- `services/api-gateway/src/app.ts`
- `services/api-gateway/src/runtimeProvenance.ts`
- `services/api-gateway/src/lib/ai-assistant-activation-preflight.ts`
- `services/api-gateway/src/lib/ai-assistant-automation-downstream-contract.ts`
- `services/api-gateway/src/lib/ai-assistant-activation-transition-contract.ts`
- `services/api-gateway/src/lib/ai-usage-context-issuance.ts`
- `services/api-gateway/src/lib/automation-entitlement-signing.ts`
- `services/api-gateway/src/lib/automation-entitlement-issuer.ts`
- `services/api-gateway/src/lib/fixtures/ai-assistant-gateway-automation-contract.json`
- `services/automation-service/src/settings.py`
- `services/automation-service/src/ai_usage_context_enforcement.py`
- `services/automation-service/src/premium_runtime_enforcement.py`
- `services/automation-service/src/ai_assistant_downstream_contract.py`
- `services/automation-service/src/ai_assistant_backend_contract.py`
- `packages/types/src/automation-entitlement-assertions.ts`

## Accepted Evidence Carried Forward

The following evidence from PR `#231` may be carried forward as accepted partial proof:

- `operator_evidence_real_candidate_reviewed`
- `private_reachability_section_accepted`
- `reachability_summary.reachable_from_private_boundary=true`
- `reachability_summary.browser_boundary_used=false`
- `reachability_summary.vercel_boundary_used=false`
- `reachability_summary.automation_private_boundary_preserved=true`
- `secret_safety_review.review_result=secret_safe`

Carry-forward boundary:

- this reachability evidence remains only a partial proof
- it must stay bound to one RC SHA, one target environment, and one proof-runtime class
- it must not be re-labeled as activation approval
- it becomes stale if the target RC, target environment, or proof-runtime class changes

## Signing Runtime Configuration Gap

Current repo-level reading:

- `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` is the canonical signing-mode env name for both Gateway and Automation
- `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` is the canonical signing-secret env name for both Gateway and Automation
- Gateway AI Assistant usage-context issuance is HMAC-only in the reviewed repo path
- Automation AI Assistant usage-context enforcement is HMAC-only in the reviewed repo path
- Automation premium runtime enforcement for `ai_assistant` is also HMAC-only in the reviewed repo path

Repo-backed interpretation:

- the shared entitlement contract still models both `unsigned_internal_contract` and `hmac_sha256` at the generic assertion layer
- the AI Assistant-specific activation-adjacent path is narrower than that generic layer
- for the current AI Assistant path, `hmac_sha256` is the only reviewed contract mode that can satisfy both usage-context and premium-runtime enforcement

Gateway-side signing env ownership required for later activation-grade proof:

- `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE`
- `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET`

Automation-side signing env ownership required for later activation-grade proof:

- `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE`
- `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET`

Operator action required:

- set the intended AI Assistant signing mode on both services in the same target environment
- if `hmac_sha256` is used, configure the same server-only secret owner path on both services without disclosing the secret value
- capture only boolean or summarized parity outcomes such as `present`, `missing`, `aligned`, `misaligned`, `server_only`, `not_browser_exposed`

Unsigned-mode note:

- `unsigned_internal_contract` remains modeled generically in shared repo contracts and settings parsing
- it does not close the reviewed AI Assistant gap because the current AI Assistant usage-context and premium-runtime enforcement both reject non-HMAC runtime configuration
- therefore an operator cannot close this slice by proving only a private internal boundary while leaving the AI Assistant path unsigned

Repo-side status:

- no hard signing-contract drift found
- no code change is required for this docs-only slice
- the missing step is target-environment configuration and secret-owner-path proof

## Runtime Binding Gap

Current repo-level binding surfaces:

- `release-gate-runner` provenance is modeled as a non-secret proof-runtime artifact
- `services/api-gateway` supports non-secret runtime provenance headers on `/health`
- `docs/deployment.md` requires same RC SHA and same environment proof between runner and Gateway

Allowed non-secret runtime provenance markers in later evidence:

- RC SHA
- target environment name
- proof-runtime service label
- hosted service label
- boolean equality markers such as `rc_sha_matches=true`
- non-secret provenance classifications such as `runtime_provenance_present=true`

Current binding gap from reviewed materials:

- the real candidate reported no Gateway RC binding in the collected live result
- the real candidate reported no Automation RC binding in the collected live result
- the reviewed repository does not expose an explicit automation-service provenance marker comparable to Gateway `/health`

What the next review must be able to prove:

- `release-gate-runner` and Gateway use the same RC SHA
- `release-gate-runner` and Automation use the same RC SHA
- all three runtimes belong to the same target environment
- signing evidence and reachability evidence are bound to the same RC/environment bundle

Missing markers that block the next review:

- missing non-secret Gateway runtime provenance in the target evidence bundle
- missing non-secret Automation runtime RC classification in the target evidence bundle
- missing explicit equality result between runner RC and Gateway RC
- missing explicit equality result between runner RC and Automation RC
- missing explicit equality result between runner environment, Gateway environment, and Automation environment

Repo-side status:

- Gateway provenance support exists in code
- proof-runner provenance support exists in repo process/docs
- no hard repo mismatch was found
- Automation provenance remains an evidence-collection gap because no explicit repo-owned marker surface was found in the reviewed code

Conservative implication:

- Thomas can still close the binding gap with target-environment evidence if the collected artifact records one accepted non-secret automation RC/environment classification
- if a later operator review cannot produce that classification cleanly, a later repo slice may need an explicit automation provenance surface

## Operator Gap Closure Matrix

| Gap                                      | Current Evidence                                                                    | Missing Evidence                                                             | Repo Action Required                                                             | Operator Action Required                                                                                                              | Secret-Safety Rule                                                     | Blocks Activation |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------- |
| Gateway signing runtime configuration    | repo contract supports canonical env names and HMAC signing wrapper                 | target-environment proof that Gateway uses intended mode                     | none for this slice                                                              | verify `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` presence/status and intended mode on Gateway                                   | env names allowed, values forbidden                                    | yes               |
| Automation signing runtime configuration | repo contract enforces HMAC for AI Assistant usage-context and premium-runtime path | target-environment proof that Automation uses intended mode                  | none for this slice                                                              | verify `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` presence/status and intended mode on Automation                                | env names allowed, values forbidden                                    | yes               |
| Shared signing secret-owner-path parity  | repo contract requires same server-only secret when HMAC is enabled                 | target-environment proof that both services use the same owner path          | none for this slice                                                              | verify `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` presence/status on both services and record parity only as `aligned` or `misaligned` | no secret values, no substrings, no signatures                         | yes               |
| Runner to Gateway RC binding             | runner provenance and Gateway runtime-provenance contract exist                     | one accepted target-runtime equality marker for same RC and same environment | none for this slice                                                              | collect non-secret equality results between runner and Gateway                                                                        | only RC/environment markers, no raw deploy transcript                  | yes               |
| Runner to Automation RC binding          | reviewed repo shows no explicit automation provenance marker surface                | one accepted target-runtime Automation RC/environment classification         | none required now; future repo slice only if operator evidence remains ambiguous | collect non-secret Automation RC/environment evidence from target environment and bind it to same bundle                              | no private URLs, no full hostnames, no raw CLI dumps                   | yes               |
| Reachability carry-forward reuse         | PR `#231` accepted private reachability section                                     | same RC/environment/proof-runtime binding to later bundle                    | none for this slice                                                              | keep later evidence bundle on same RC/environment or recollect reachability                                                           | partial proof only, never activation approval                          | yes               |
| Artifact-level redaction                 | real candidate already accepted as secret-safe                                      | same redaction standard on new signing/binding evidence                      | none for this slice                                                              | record only boolean/redacted classifications                                                                                          | no secrets, tokens, private URLs, signatures, raw payloads, raw errors | yes               |

## Operator Handoff Checklist

- confirm the target environment name once and reuse that exact value across runner, Gateway, and Automation evidence
- confirm one RC SHA for the bundle and reuse that exact value across all collected sections
- confirm `release-gate-runner` is the proof runtime used for the final bundle
- confirm Gateway runtime provenance is present as non-secret commit and environment metadata
- confirm Gateway signing mode status for `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE`
- confirm Gateway secret presence status for `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET`
- confirm Automation signing mode status for `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE`
- confirm Automation secret presence status for `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET`
- confirm signing mode parity is recorded only as `aligned` or `misaligned`
- confirm secret-owner-path parity is recorded only as `aligned` or `misaligned`
- confirm browser exposure remains `false` for the AI Assistant signing env names
- confirm the accepted private reachability artifact still belongs to the same RC/environment bundle, otherwise recollect it
- confirm the final bundle still says `activation_not_allowed_now`

Boolean or redacted status fields only:

- `gateway_signing_mode_present`
- `gateway_signing_mode_expected`
- `gateway_signing_secret_present`
- `automation_signing_mode_present`
- `automation_signing_mode_expected`
- `automation_signing_secret_present`
- `signing_mode_parity`
- `signing_owner_path_parity`
- `gateway_runtime_provenance_present`
- `gateway_rc_matches_runner`
- `gateway_environment_matches_runner`
- `automation_rc_matches_runner`
- `automation_environment_matches_runner`
- `reachability_bundle_still_current`
- `artifact_secret_safe`

## Forbidden Evidence

The report and any later operator artifact must not contain:

- private URLs
- full internal hostnames
- tokens
- secrets
- signatures
- raw payloads
- raw prompts
- raw trusted-context payloads
- raw resolved-context payloads
- model responses
- raw errors
- Redis URLs
- Supabase service-role values
- OpenAI keys
- raw env dumps
- raw CLI transcripts
- raw provider or OpenAI payloads

## Activation Boundary

This report does not allow activation.

Conservative boundary result:

- `signing_runtime_config_gap_reviewed` is justified
- `runtime_binding_gap_reviewed` is justified
- `operator_gap_closure_required` remains mandatory
- `operator_env_action_required` remains mandatory
- `activation_not_allowed_now` remains mandatory

This report does not justify:

- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`

Even if signing and same-RC binding are later proven, these separate blockers still remain:

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

- the reviewed repo contracts already define the local signing foundations and fail-closed behavior
- the remaining closure work is target-environment evidence, not local route or UI work
- the next smallest safe step is to collect one redacted operator bundle for signing configuration and same-RC runtime binding without permitting activation

## Checks

Executed for this docs-only slice:

- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant-signing-runtime-binding-gap-closure-2026-06-30.md`

Not executed:

- `pnpm validate`

Why skipped:

- only one docs-only Markdown file was added
- no code, tests, env, DB, worker, provider, or deployment contract changed
