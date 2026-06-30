# AI Assistant Operator Proof Bundle Template - 2026-06-30

## Decision

Primary decisions:

- `operator_proof_bundle_template_defined`
- `template_only_not_evidence`
- `activation_not_allowed_now`

Why:

- the prior bundle review confirmed that no candidate AI Assistant operator proof bundle exists yet
- operators need one stable, secret-safe structure for later target-environment evidence collection
- the template must remain explicitly non-evidentiary until it is filled from the correct runtime boundary and separately reviewed

## Scope

This slice provides only:

- a secret-safe AI Assistant operator proof bundle template
- fixed bundle section names
- placeholder fields for later reachability and signing evidence
- explicit rules that keep an unfilled or locally filled template non-reviewable

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

## Template Status Rules

This document is a template only.

It must not be treated as:

- operator evidence
- a candidate bundle
- `proof_ready_for_reachability_and_signing_only`
- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`

Until later filled from the correct target-environment proof boundary, its effective status remains:

- `template_only_not_evidence`
- `operator_proof_required`
- `activation_not_allowed_now`

## Usage Rules

Later operators may copy this structure into a candidate proof artifact only if all of the following are true:

- the bundle is bound to one RC SHA
- the bundle is bound to one Railway target environment
- the bundle is collected from `release-gate-runner` or an explicitly equivalent proof-capable Railway runtime
- the bundle remains secret-safe
- the filled artifact still declares `activation_not_allowed_now`

The template must be rejected immediately if later users:

- paste secret values
- paste tokens
- paste private URLs
- paste signatures
- paste raw shell transcripts
- paste raw `curl` output
- paste raw prompt, context, provider, or model payloads
- imply that bundle completion alone permits activation

## Template Structure

Every later candidate bundle must preserve exactly these four sections:

1. `proof_manifest`
2. `reachability_summary`
3. `signing_parity_summary`
4. `secret_safety_review`

## Copyable Template

```yaml
proof_manifest:
  package_scope: ai_assistant_operator_proof
  template_status: template_only_not_evidence
  rc_sha: <fill_with_exact_rc_sha_only>
  target_environment: <fill_with_named_target_environment_only>
  proof_runtime_class: <fill_with_release-gate-runner_or_equivalent_only>
  proof_runtime_scope: <fill_with_non_secret_service_label_only>
  collected_at: <fill_with_safe_iso_timestamp_only>
  operator_scope: <fill_with_role_or_operator_scope_only>
  activation_status: activation_not_allowed_now
  secret_safe_review_status: <fill_with_secret_safe_or_rejected_only>

reachability_summary:
  category: private_gateway_to_automation_reachability
  template_status: template_only_not_evidence
  rc_sha_matches_manifest: <fill_with_true_or_false_only>
  target_environment_matches_manifest: <fill_with_true_or_false_only>
  proof_runtime_matches_manifest: <fill_with_true_or_false_only>
  reachable_from_private_boundary: <fill_with_true_or_false_only>
  browser_boundary_used: <fill_with_true_or_false_only>
  vercel_boundary_used: <fill_with_true_or_false_only>
  automation_private_boundary_preserved: <fill_with_true_or_false_only>
  evidence_secret_safe: <fill_with_true_or_false_only>
  result_status: <fill_with_secret_safe_summary_only>

signing_parity_summary:
  category: gateway_automation_signing_parity
  template_status: template_only_not_evidence
  rc_sha_matches_manifest: <fill_with_true_or_false_only>
  target_environment_matches_manifest: <fill_with_true_or_false_only>
  proof_runtime_matches_manifest: <fill_with_true_or_false_only>
  signing_mode_parity: <fill_with_aligned_or_misaligned_only>
  signing_owner_path_parity: <fill_with_aligned_or_misaligned_only>
  gateway_env_ownership: <fill_with_summarized_ownership_class_only>
  automation_env_ownership: <fill_with_summarized_ownership_class_only>
  browser_exposed: <fill_with_true_or_false_only>
  evidence_secret_safe: <fill_with_true_or_false_only>

secret_safety_review:
  category: activation_evidence_secret_safe
  template_status: template_only_not_evidence
  secrets_present: <fill_with_true_or_false_only>
  tokens_present: <fill_with_true_or_false_only>
  private_urls_present: <fill_with_true_or_false_only>
  signatures_present: <fill_with_true_or_false_only>
  raw_payloads_present: <fill_with_true_or_false_only>
  raw_prompts_present: <fill_with_true_or_false_only>
  raw_contexts_present: <fill_with_true_or_false_only>
  model_responses_present: <fill_with_true_or_false_only>
  raw_errors_present: <fill_with_true_or_false_only>
  review_result: <fill_with_secret_safe_or_rejected_only>
```

## Field Rules

Field-level restrictions for later filled artifacts:

| Section                  | Field                      | Allowed content                 | Forbidden content                                     |
| ------------------------ | -------------------------- | ------------------------------- | ----------------------------------------------------- |
| `proof_manifest`         | `rc_sha`                   | exact RC SHA only               | deploy transcript, commit range, secret-bearing logs  |
| `proof_manifest`         | `target_environment`       | named target environment only   | private topology details                              |
| `proof_manifest`         | `proof_runtime_scope`      | non-secret service label only   | private URL, full internal hostname                   |
| `reachability_summary`   | `result_status`            | summarized outcome only         | raw probe output, raw logs, raw headers               |
| `signing_parity_summary` | `gateway_env_ownership`    | summarized ownership class only | raw env value, full env dump                          |
| `signing_parity_summary` | `automation_env_ownership` | summarized ownership class only | raw env value, full env dump                          |
| `secret_safety_review`   | all boolean fields         | `true` or `false` only          | copied payload fragments or narrative secret excerpts |

## Review Preconditions

A later review may consider a filled artifact only if all of the following are satisfied:

- `template_status` has been removed or replaced by a candidate-bundle status outside this template file
- `proof_manifest` is fully populated
- `reachability_summary` is fully populated
- `signing_parity_summary` is fully populated
- `secret_safety_review` is fully populated
- all four sections remain bound to the same RC SHA
- all four sections remain bound to the same target environment
- both proof sections remain bound to the same proof-runtime class
- the artifact still declares `activation_not_allowed_now`

If any precondition is missing, the later review outcome must remain:

- `operator_proof_bundle_missing`, or
- `operator_proof_bundle_not_reviewable`

## Minimum Safe Placeholder Semantics

Safe placeholders in this template are intentionally non-evidentiary.

Examples:

- `<fill_with_exact_rc_sha_only>`
- `<fill_with_named_target_environment_only>`
- `<fill_with_secret_safe_summary_only>`
- `<fill_with_true_or_false_only>`
- `<fill_with_aligned_or_misaligned_only>`

Unsafe placeholder examples that must never appear in later filled artifacts:

- `<paste_private_url_here>`
- `<paste_env_dump_here>`
- `<paste_signature_here>`
- `<paste_request_payload_here>`
- `<paste_provider_response_here>`

## Activation Boundary

This template does not allow activation.

Even a fully structured but still unreviewed candidate artifact does not allow:

- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`

Even a later complete reachability-and-signing bundle would still leave these separate blockers:

- budget and metering operational proof
- `productGate` opening proof
- `routeMode` transition proof
- coordinated productive `runtimeStatus` proof
- rollback proof
- productive downstream implementation in `services/automation-service`

## Recommended Next Slice

Exactly one next slice is recommended:

`AI Assistant Operator Proof Bundle Candidate Collection`

Why:

- the contract exists
- the review exists
- the template now exists
- the next step is to collect a real candidate bundle from the correct proof-capable target-runtime boundary without changing runtime semantics

## Checks

Executed for this docs-only slice:

- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant-operator-proof-bundle-template-2026-06-30.md`

Not executed:

- `pnpm validate`

Why skipped:

- only one docs-only Markdown file was added
- no code, tests, env, DB, worker, provider, or deployment contract changed
