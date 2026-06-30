# AI Assistant Operator Proof Bundle Candidate Collection - 2026-06-30

## Decision

Primary decisions:

- `operator_proof_bundle_candidate_collection_defined`
- `candidate_collection_not_started`
- `activation_not_allowed_now`

Why:

- the bundle contract exists
- the bundle review confirmed that no candidate artifact exists yet
- the template exists, but operators still need one explicit candidate-collection shell that distinguishes local prefill from target-runtime evidence collection

No additional decision is granted for:

- `proof_ready_for_reachability_and_signing_only`
- `operator_proof_bundle_reviewed`
- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`

## Scope

This slice defines only:

- one AI Assistant operator proof bundle candidate shell
- which fields may be prefilled from repository-safe context
- which fields require target-runtime collection
- which collection states keep the candidate non-reviewable

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

## Candidate Collection Goal

This candidate collection step creates the smallest safe bridge between:

- the reusable template, and
- a later target-environment candidate artifact

It does not collect proof. It only defines how a future candidate bundle may start existing without being mistaken for evidence.

## Candidate Collection States

Only these collection states are allowed for this slice:

- `candidate_collection_not_started`
- `candidate_collection_incomplete`
- `candidate_collection_blocked`

This slice must not claim:

- `candidate_collection_complete`
- `proof_ready_for_reachability_and_signing_only`
- `runtime_activation_allowed`

## Prefill Rules

The candidate shell may prefill only repository-safe constant fields.

Allowed local prefill:

- section names
- category names
- `package_scope=ai_assistant_operator_proof`
- `activation_status=activation_not_allowed_now`
- `candidate_collection_status`
- `evidence_source_class`
- placeholder markers that clearly indicate missing collection

Target-runtime required later:

- RC SHA
- target environment
- proof runtime class
- proof runtime scope
- collection timestamp
- operator scope
- reachability booleans and result summary
- signing parity results
- env ownership summaries
- secret-safety review booleans and result

Forbidden local behavior:

- guessing target environment values
- copying env values
- copying internal URLs
- filling parity or reachability outcomes from local assumptions
- converting placeholders into fake evidence

## Candidate Shell

```yaml
proof_manifest:
  package_scope: ai_assistant_operator_proof
  candidate_collection_status: candidate_collection_not_started
  evidence_source_class: target_runtime_required
  rc_sha: <not_collected>
  target_environment: <not_collected>
  proof_runtime_class: <not_collected>
  proof_runtime_scope: <not_collected>
  collected_at: <not_collected>
  operator_scope: <not_collected>
  activation_status: activation_not_allowed_now
  secret_safe_review_status: <not_collected>

reachability_summary:
  category: private_gateway_to_automation_reachability
  candidate_collection_status: candidate_collection_not_started
  evidence_source_class: target_runtime_required
  rc_sha_matches_manifest: <not_collected>
  target_environment_matches_manifest: <not_collected>
  proof_runtime_matches_manifest: <not_collected>
  reachable_from_private_boundary: <not_collected>
  browser_boundary_used: <not_collected>
  vercel_boundary_used: <not_collected>
  automation_private_boundary_preserved: <not_collected>
  evidence_secret_safe: <not_collected>
  result_status: <not_collected>

signing_parity_summary:
  category: gateway_automation_signing_parity
  candidate_collection_status: candidate_collection_not_started
  evidence_source_class: target_runtime_required
  rc_sha_matches_manifest: <not_collected>
  target_environment_matches_manifest: <not_collected>
  proof_runtime_matches_manifest: <not_collected>
  signing_mode_parity: <not_collected>
  signing_owner_path_parity: <not_collected>
  gateway_env_ownership: <not_collected>
  automation_env_ownership: <not_collected>
  browser_exposed: <not_collected>
  evidence_secret_safe: <not_collected>

secret_safety_review:
  category: activation_evidence_secret_safe
  candidate_collection_status: candidate_collection_not_started
  evidence_source_class: target_runtime_required
  secrets_present: <not_collected>
  tokens_present: <not_collected>
  private_urls_present: <not_collected>
  signatures_present: <not_collected>
  raw_payloads_present: <not_collected>
  raw_prompts_present: <not_collected>
  raw_contexts_present: <not_collected>
  model_responses_present: <not_collected>
  raw_errors_present: <not_collected>
  review_result: <not_collected>
```

## Section Ownership Matrix

| Section                  | May be created locally | May be completed locally | Required later collection boundary                                |
| ------------------------ | ---------------------- | ------------------------ | ----------------------------------------------------------------- |
| `proof_manifest`         | yes                    | no                       | `release-gate-runner` or equivalent proof-capable Railway runtime |
| `reachability_summary`   | yes                    | no                       | Railway-internal private boundary only                            |
| `signing_parity_summary` | yes                    | no                       | target Gateway and Automation runtime context only                |
| `secret_safety_review`   | yes                    | no                       | review of the filled target-runtime candidate artifact only       |

Interpretation:

- local creation of the shell is allowed
- local completion of any evidence field is not allowed
- all four sections remain non-reviewable until target-runtime collection happens

## Collection Reject Rules

The candidate remains `candidate_collection_blocked` if any of the following happens later:

- RC SHA is missing
- target environment is missing
- proof runtime class is missing
- browser or Vercel is used as the reachability boundary
- raw secret-bearing material appears anywhere
- signing parity is described with raw env dumps or signatures
- one section is collected from a different environment or runtime class than the others

The candidate remains `candidate_collection_incomplete` if:

- only the manifest is filled
- only reachability is filled
- only signing is filled
- secret-safety review is absent
- any section still contains `<not_collected>`

## Safe Placeholder Rules

Allowed placeholder markers for this candidate shell:

- `<not_collected>`
- `<target_runtime_required>`
- `<review_required_after_collection>`

Forbidden placeholder markers:

- `<paste_private_url_here>`
- `<paste_secret_here>`
- `<paste_signature_here>`
- `<paste_raw_log_here>`
- `<paste_provider_payload_here>`

## Review Handoff Rules

This candidate shell may be handed to a later review only if:

- all `<not_collected>` markers are gone
- the filled artifact remains secret-safe
- the filled artifact is bound to one RC SHA
- the filled artifact is bound to one target environment
- the filled artifact is bound to one proof-runtime class
- the filled artifact still declares `activation_not_allowed_now`

Until then, the correct handoff result remains:

- `operator_proof_bundle_missing`, or
- `operator_proof_bundle_not_reviewable`

## Activation Boundary

This candidate collection does not allow activation.

Even after the shell exists, all of the following remain blocked:

- `runtime_activation_allowed`
- `productGate` opening
- `routeMode` transition
- productive `runtimeStatus`
- productive downstream enablement

Even a later filled reachability-and-signing candidate would still leave these separate blockers:

- budget and metering operational proof
- `productGate` opening proof
- `routeMode` transition proof
- coordinated productive `runtimeStatus` proof
- rollback proof
- productive downstream implementation in `services/automation-service`

## Recommended Next Slice

Exactly one next slice is recommended:

`AI Assistant Operator Proof Bundle Candidate Review`

Why:

- the bundle contract exists
- the template exists
- the candidate shell now exists
- the next safe step, once target-runtime evidence is actually collected, is a strict review of that filled candidate against the existing bundle contract

## Checks

Executed for this docs-only slice:

- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant-operator-proof-bundle-candidate-collection-2026-06-30.md`

Not executed:

- `pnpm validate`

Why skipped:

- only one docs-only Markdown file was added
- no code, tests, env, DB, worker, provider, or deployment contract changed
