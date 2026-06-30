# AI Assistant Operator Proof Redacted Evidence Candidate - 2026-06-30

## Decision

Primary decisions:

- `operator_evidence_candidate_collected`
- `candidate_collection_blocked`
- `activation_not_allowed_now`

Why:

- this artifact is based on real target-runtime collection from Railway production and live deployment metadata, not only on repository-local structure
- private Gateway-to-Automation reachability was confirmed from `release-gate-runner`
- private Automation exposure remained absent in the live Railway service list
- the signing path is still blocked because Gateway and Automation both reported no runtime signing configuration for the AI Assistant assertion path
- same-RC proof across the live Gateway and Automation runtimes is still incomplete because no runtime commit binding was exposed from those services during this collection

No additional decision is granted for:

- `proof_ready_for_reachability_and_signing_only`
- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`

## Scope

This artifact includes only redacted, secret-safe target-runtime evidence from:

- Railway production `release-gate-runner`
- Railway production `api-gateway`
- Railway production `automation-service`
- Railway production service metadata
- Vercel production environment key presence metadata

Not done:

- no runtime activation
- no route change
- no UI, env, DB, worker, provider, or OpenAI change
- no raw secret extraction
- no raw private URL reporting
- no raw shell transcript reporting

Collection window:

- collected on `2026-06-30T16:42:01.0000000Z`

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

## Proof Manifest

```yaml
proof_manifest:
  package_scope: ai_assistant_operator_proof
  candidate_collection_status: candidate_collection_blocked
  evidence_source_class: target_runtime_collected
  rc_sha: a23d3cf4d82315c9861598e28ef5bfd2f2ce31db
  target_environment: production
  proof_runtime_class: release-gate-runner
  proof_runtime_scope: release-gate-runner
  collected_at: 2026-06-30T16:42:01.0000000Z
  operator_scope: codex_via_railway_and_vercel_cli
  activation_status: activation_not_allowed_now
  secret_safe_review_status: secret_safe
```

Observed provenance source:

- `release-gate-runner` runtime provenance file was present and readable
- `schemaVersion=1`
- `runnerService=release-gate-runner`
- `environment=production`
- `gitCommit=a23d3cf4d82315c9861598e28ef5bfd2f2ce31db`

## Reachability Summary

```yaml
reachability_summary:
  category: private_gateway_to_automation_reachability
  candidate_collection_status: candidate_collection_blocked
  evidence_source_class: target_runtime_collected
  rc_sha_matches_manifest: true
  target_environment_matches_manifest: true
  proof_runtime_matches_manifest: true
  reachable_from_private_boundary: true
  browser_boundary_used: false
  vercel_boundary_used: false
  automation_private_boundary_preserved: true
  evidence_secret_safe: true
  result_status: reachable_private_boundary_confirmed
```

Observed redacted facts:

- the private reachability check ran from `release-gate-runner`
- the internal Automation health response returned `httpStatus=200`
- the internal Automation health response reported `status=ok`
- the live Railway service list showed:
  - `api-gateway` public URL present
  - `automation-service` public URL absent
  - `release-gate-runner` public URL absent

Interpretation:

- private-boundary reachability is positively evidenced
- the candidate remains blocked for other reasons, not because reachability is missing

## Signing Parity Summary

```yaml
signing_parity_summary:
  category: gateway_automation_signing_parity
  candidate_collection_status: candidate_collection_blocked
  evidence_source_class: target_runtime_collected
  rc_sha_matches_manifest: false
  target_environment_matches_manifest: true
  proof_runtime_matches_manifest: false
  signing_mode_parity: aligned
  signing_owner_path_parity: aligned
  gateway_env_ownership: gateway_runtime_signing_env_absent_not_browser_exposed
  automation_env_ownership: automation_runtime_signing_env_absent_not_browser_exposed
  browser_exposed: false
  evidence_secret_safe: true
```

Observed redacted facts:

- live `api-gateway` runtime reported:
  - `environment=production`
  - `signingMode=null`
  - `signingSecretPresent=false`
  - `rcSha=null`
- live `automation-service` runtime reported:
  - `environment=production`
  - `signingMode=null`
  - `signingSecretPresent=false`
  - `rcSha=null`
- Vercel production env key presence reported:
  - `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` absent
  - `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` absent
  - `API_GATEWAY_SECRET` present

Interpretation:

- both server runtimes matched each other on absence of AI Assistant signing mode and signing secret
- browser exposure for the AI Assistant signing env names was not observed in Vercel production env keys
- this is still a blocker because the required target-runtime signing configuration is absent, even though the absence state is itself aligned
- same-RC signing binding is not proven because neither live service exposed an RC SHA during this collection

## Secret Safety Review

```yaml
secret_safety_review:
  category: activation_evidence_secret_safe
  candidate_collection_status: candidate_collection_blocked
  evidence_source_class: target_runtime_collected
  secrets_present: false
  tokens_present: false
  private_urls_present: false
  signatures_present: false
  raw_payloads_present: false
  raw_prompts_present: false
  raw_contexts_present: false
  model_responses_present: false
  raw_errors_present: false
  review_result: secret_safe
```

Redaction notes:

- no secret values were copied
- no env values were copied
- no private Railway hostnames were copied
- no raw request or response bodies were copied
- no raw shell transcripts were copied

## Live Binding Gaps

This first real candidate is still blocked by the following observed gaps:

- `api-gateway` did not expose runtime provenance headers on `/health`
- `api-gateway` did not expose an RC SHA in the live runtime collection path used here
- `automation-service` did not expose an RC SHA in the live runtime collection path used here
- AI Assistant signing mode was absent in both server runtimes
- AI Assistant signing secret presence was absent in both server runtimes

Because of those gaps, this candidate does not yet prove:

- same RC SHA across all collected sections
- activation-grade signing readiness
- `proof_ready_for_reachability_and_signing_only`

## Activation Boundary

This evidence candidate does not allow activation.

Conservative boundary result:

- `operator_evidence_candidate_collected` is justified
- `candidate_collection_blocked` remains mandatory
- `activation_not_allowed_now` remains mandatory

This artifact does not justify:

- `proof_ready_for_reachability_and_signing_only`
- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`

Even if the signing and RC-binding gaps were resolved later, these separate blockers would still remain:

- budget and metering operational proof
- `productGate` opening proof
- `routeMode` transition proof
- coordinated productive `runtimeStatus` proof
- rollback proof
- productive downstream implementation in `services/automation-service`

## Recommended Next Slice

Exactly one next slice is recommended:

`AI Assistant Operator Proof Real Candidate Review`

Why:

- a first real redacted target-runtime candidate now exists
- it should be reviewed as collected evidence, not as abstract documentation
- the review must confirm the positive reachability proof and explicitly uphold the current signing and RC-binding blockers

## Checks

Executed for this evidence-candidate slice:

- live Railway CLI identity check
- live Railway production service list check
- live `release-gate-runner` provenance check
- live `release-gate-runner` private Automation reachability check
- live `api-gateway` signing env presence check
- live `automation-service` signing env presence check
- live Vercel production env-key presence check
- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant-operator-proof-redacted-evidence-candidate-2026-06-30.md`

Not executed:

- `pnpm validate`
- `pnpm rollout:check:production`

Why skipped:

- this slice adds one evidence document only and does not change code
- the first target-runtime candidate needed bounded evidence collection before a full production-gate run
