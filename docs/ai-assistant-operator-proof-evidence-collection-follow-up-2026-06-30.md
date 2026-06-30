# AI Assistant Operator Proof Evidence Collection Follow-up - 2026-06-30

## Decision

Primary decisions:

- `operator_follow_up_defined`
- `operator_evidence_package_required`
- `activation_not_allowed_now`

Why:

- the prior evidence-collection review found no AI Assistant-specific operator artifact for private reachability, signing parity, or combined proof binding
- the repository already contains proof requirements and fail-closed implementation evidence, but not a target-environment evidence package
- the next safe step is to define the minimum acceptable secret-safe evidence package so a later operator review can reject incomplete or unsafe proof consistently

## Scope

This slice defines only:

- the minimum AI Assistant operator evidence package shape
- the required fields for private reachability proof
- the required fields for signing parity proof
- the required fields for same-RC and same-environment proof binding
- the reject conditions for incomplete, unsafe, or activation-like evidence

Not done:

- no live Railway check
- no live Vercel check
- no live Supabase check
- no live Automation Service check
- no network probe
- no `curl`
- no runtime activation
- no route change
- no UI, env, DB, worker, provider, or OpenAI change

Reviewed on current `main` descendant at `b3335fb9c8355467f04cb2547c70d60b9acab492`.

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

## Follow-up Goal

This follow-up exists so that a later operator evidence bundle can be judged against one stable contract instead of ad hoc reviewer expectations.

The bundle must prove only these still-missing categories:

- `private_gateway_to_automation_reachability`
- `gateway_automation_signing_parity`
- `combined_proof_binding`
- `activation_evidence_secret_safe`

The bundle must not be interpreted as:

- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`

## Required Evidence Package

Exactly one AI Assistant operator evidence package is required for the next review.

It must contain four logical sections:

1. `proof_manifest`
2. `reachability_summary`
3. `signing_parity_summary`
4. `secret_safety_review`

The package may be stored as one document or multiple redacted companion artifacts, but the next review must be able to prove that all sections belong to the same package.

## Proof Manifest

The manifest is the package anchor. Without it, the rest of the bundle is incomplete.

Required manifest fields:

| Field                       | Required value or class                                                      | Why it matters                                               | Blocks if missing |
| --------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------- |
| `package_scope`             | `ai_assistant_operator_proof`                                                | prevents generic proof reuse from another feature            | yes               |
| `rc_sha`                    | exact release-candidate SHA only                                             | binds the package to one reviewed code snapshot              | yes               |
| `target_environment`        | named Railway target environment only                                        | prevents mixed-environment evidence                          | yes               |
| `proof_runtime_class`       | `release-gate-runner` or explicitly equivalent proof-capable Railway runtime | proves the correct collection boundary                       | yes               |
| `proof_runtime_scope`       | non-secret service label only                                                | records runtime provenance without topology leakage          | yes               |
| `collected_at`              | safe timestamp                                                               | supports freshness review                                    | yes               |
| `operator_scope`            | role or operator-owned scope label only                                      | proves operator ownership without personal secret data       | yes               |
| `activation_status`         | `activation_not_allowed_now`                                                 | prevents proof packaging from implying activation permission | yes               |
| `secret_safe_review_status` | summarized result only                                                       | forces explicit redaction review                             | yes               |

## Reachability Summary

The reachability summary proves only that the private Gateway-to-Automation path was evaluated from the correct runtime boundary.

Required reachability fields:

| Field                                   | Allowed values                               | Reject if                                              |
| --------------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| `category`                              | `private_gateway_to_automation_reachability` | category is omitted or renamed                         |
| `rc_sha_matches_manifest`               | `true`                                       | `false` or missing                                     |
| `target_environment_matches_manifest`   | `true`                                       | `false` or missing                                     |
| `proof_runtime_matches_manifest`        | `true`                                       | `false` or missing                                     |
| `reachable_from_private_boundary`       | `true` or `false`                            | missing                                                |
| `browser_boundary_used`                 | `false`                                      | `true` or missing                                      |
| `vercel_boundary_used`                  | `false`                                      | `true` or missing                                      |
| `automation_private_boundary_preserved` | `true`                                       | `false` or missing                                     |
| `evidence_secret_safe`                  | `true`                                       | `false` or missing                                     |
| `result_status`                         | summarized outcome only                      | raw logs, raw probe output, or private topology appear |

Interpretation:

- `reachable_from_private_boundary=true` is required for later proof readiness
- `browser_boundary_used=false` and `vercel_boundary_used=false` are mandatory
- `automation_private_boundary_preserved=true` is mandatory
- a local shell, laptop terminal, or browser-based probe is never acceptable for this category

## Signing Parity Summary

The signing summary proves only that Gateway and Automation are aligned on signing mode and secret-owner path semantics in the target environment.

Required signing fields:

| Field                                 | Allowed values                      | Reject if                            |
| ------------------------------------- | ----------------------------------- | ------------------------------------ |
| `category`                            | `gateway_automation_signing_parity` | category is omitted or renamed       |
| `rc_sha_matches_manifest`             | `true`                              | `false` or missing                   |
| `target_environment_matches_manifest` | `true`                              | `false` or missing                   |
| `proof_runtime_matches_manifest`      | `true`                              | `false` or missing                   |
| `signing_mode_parity`                 | `aligned` or `misaligned`           | missing                              |
| `signing_owner_path_parity`           | `aligned` or `misaligned`           | missing                              |
| `gateway_env_ownership`               | summarized ownership class only     | raw env dump or secret value appears |
| `automation_env_ownership`            | summarized ownership class only     | raw env dump or secret value appears |
| `browser_exposed`                     | `false`                             | `true` or missing                    |
| `evidence_secret_safe`                | `true`                              | `false` or missing                   |

Interpretation:

- later proof readiness requires `signing_mode_parity=aligned`
- later proof readiness requires `signing_owner_path_parity=aligned`
- later proof readiness requires `browser_exposed=false`
- env names are acceptable; env values, signatures, and raw assertions are forbidden

## Secret Safety Review

The package must include an explicit redaction review. Secret-safety cannot be implied.

Required secret-safety fields:

| Field                     | Allowed values                    | Reject if         |
| ------------------------- | --------------------------------- | ----------------- |
| `category`                | `activation_evidence_secret_safe` | missing           |
| `secrets_present`         | `false`                           | `true` or missing |
| `tokens_present`          | `false`                           | `true` or missing |
| `private_urls_present`    | `false`                           | `true` or missing |
| `signatures_present`      | `false`                           | `true` or missing |
| `raw_payloads_present`    | `false`                           | `true` or missing |
| `raw_prompts_present`     | `false`                           | `true` or missing |
| `raw_contexts_present`    | `false`                           | `true` or missing |
| `model_responses_present` | `false`                           | `true` or missing |
| `raw_errors_present`      | `false`                           | `true` or missing |
| `review_result`           | `secret_safe` or `rejected`       | missing           |

If `review_result=rejected`, the whole package remains unusable even when the other sections are complete.

## Combined Proof Binding Rules

The next review must reject the package unless all of the following are true:

- the manifest `rc_sha` matches the reachability summary
- the manifest `rc_sha` matches the signing summary
- the manifest `target_environment` matches both summaries
- the manifest `proof_runtime_class` matches both summaries
- the manifest `proof_runtime_scope` matches both summaries
- both summaries are marked `evidence_secret_safe=true`
- the package still declares `activation_status=activation_not_allowed_now`

The next review must reject the package immediately if:

- reachability and signing come from different RC SHAs
- reachability and signing come from different target environments
- reachability and signing come from different proof-runtime classes without an explicitly documented equivalent proof-capable class
- any section contains raw secret-bearing output
- any section implies that proof completion alone permits activation

## Forbidden Evidence

The package must not contain:

- private URLs
- full internal hostnames
- secrets
- tokens
- signatures
- raw payloads
- raw prompts
- raw trusted-context payloads
- raw resolved-context payloads
- model responses
- raw provider payloads
- raw OpenAI payloads
- raw errors
- raw shell transcripts
- raw `curl` output

## Minimum Acceptance Outcome

The best possible outcome for a complete package in the next review is:

- `operator_evidence_reviewed`
- `proof_ready_for_reachability_and_signing_only`
- `activation_not_allowed_now`

The package must not grant:

- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`

Even a complete package leaves these separate blockers in place:

- budget and metering operational proof
- `productGate` opening proof
- `routeMode` transition proof
- coordinated productive `runtimeStatus` proof
- rollback proof
- productive downstream implementation in `services/automation-service`

## Operator Collection Order

The later operator flow should follow this order:

1. create the `proof_manifest` with one RC SHA, one target environment, and one proof-runtime class
2. collect the private reachability summary from the proof-capable Railway runtime boundary
3. collect the signing parity summary from the same RC, environment, and proof-runtime class
4. perform the explicit secret-safety review across the whole package
5. reject the package if any section is missing, unsafe, stale, or mismatched

## Recommended Next Slice

Exactly one next slice is recommended:

`AI Assistant Operator Proof Bundle Review`

Why:

- this follow-up now defines the minimum package contract
- the next review can evaluate a future operator evidence bundle against one stable reject or accept checklist
- activation still must remain blocked even if that later review finds the bundle complete

## Checks

Executed for this docs-only slice:

- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant-operator-proof-evidence-collection-follow-up-2026-06-30.md`

Not executed:

- `pnpm validate`

Why skipped:

- only one docs-only Markdown file was added
- no code, tests, env, DB, worker, provider, or deployment contract changed
