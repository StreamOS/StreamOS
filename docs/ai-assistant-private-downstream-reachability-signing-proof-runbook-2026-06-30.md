# AI Assistant Private Downstream Reachability and Signing Proof Runbook - 2026-06-30

## Purpose

This runbook defines how Thomas can later collect the two remaining operator-owned proof categories that sit directly in front of later AI Assistant gate-transition work:

- private Gateway-to-Automation downstream reachability proof
- Gateway-and-Automation signing parity proof

This runbook is needed after PR #228 because `main` now contains:

- the Gateway-to-Automation downstream contract foundation
- the local activation transition contract foundation

Those foundations improve local contract readiness, but they do not provide target-environment proof and they do not allow runtime activation.

Reviewed repository anchor:

- current `main` SHA: `6b0355864958fe2bf8bd9b10c1b3a255f90a7bc4`

This runbook is proof-only:

- no runtime activation
- no `productGate` opening
- no `routeMode` transition
- no productive `runtimeStatus`
- no productive downstream enablement
- no UI scope

## Current Fail-Closed State

Current expected AI Assistant state on `main`:

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

Current contract foundations relevant to this runbook:

- Gateway downstream request contract requires `context_boundary_version`
- Gateway downstream request contract requires `runtime_status=not_yet_productive`
- Gateway downstream request contract requires `request_classification`
- Gateway downstream request contract requires signed `usage_context`
- Gateway downstream request contract requires `usage_context_signature`
- Automation downstream validation remains fail-closed on contract mismatch
- transition helper models only local review-readiness for:
  - `product_gate_controlled_opening`
  - `route_mode_limited_transition`
  - `runtime_status_limited_internal_activation`

Current core/internal automation endpoints remain unchanged:

- `/clips/analyze`
- `/repurposing/plan`
- `/transcriptions/process`

## Proof Runtime Requirements

Target-environment proof for this runbook must come from:

- `release-gate-runner`, or
- an equivalent proof-capable Railway runtime

That proof runtime must satisfy all of the following:

- same RC SHA as the release candidate under review
- same Railway project
- same target Railway environment
- same release-candidate snapshot class as the services being evaluated
- not a product service
- able to emit non-secret runtime provenance
- able to produce operator-readable, secret-safe evidence only

Required proof-runtime properties:

- public URLs are not required for the proof runtime itself
- private Automation reachability must be evaluated from the Railway-internal boundary, not from local shell or Vercel
- no secret values may be printed, copied, or embedded in the report
- local diagnostic evidence is not promotable proof

## Private Reachability Proof Plan

Thomas must later collect operator-readable evidence that the intended Gateway-to-Automation path is privately reachable from the correct runtime boundary without exposing private topology.

Required future evidence:

- proof that the evaluation happened from `release-gate-runner` or an equivalent proof-capable Railway runtime
- proof that the runtime belongs to the same Railway project and target environment as the release candidate
- proof that the evaluated snapshot matches the intended RC SHA
- proof that the Gateway-side AI Assistant path, or the equivalent proof-capable Railway context, can reach the private Automation boundary
- proof that browser code is not the boundary used for the check
- proof that Vercel is not the boundary used for the check
- proof that `services/automation-service` remains private while the check succeeds
- proof that the resulting artifact is redacted and secret-safe

Evidence shape Thomas should later produce:

- service names only
- target environment name
- RC SHA
- proof-runtime identity as a non-secret service label
- summarized reachability result such as `reachable_from_private_boundary=true` or `false`
- summarized boundary classification such as `browser_boundary_used=false`
- summarized privacy classification such as `automation_private_boundary_preserved=true`
- safe timestamp and operator scope metadata

Evidence the report must not contain:

- private URLs
- full internal hostnames
- raw `curl`
- raw shell transcripts
- raw request or response bodies
- headers
- raw logs
- tokens
- secrets
- signatures

If any of the following drift is later observed, activation must remain blocked:

- proof runtime is not in the same Railway project
- proof runtime is not in the same target environment
- proof runtime is not on the same RC snapshot
- browser or Vercel becomes the evaluated path
- Automation is no longer private
- the artifact includes private topology details

## Signing Parity Proof Plan

Thomas must later collect operator-readable evidence that Gateway and Automation are aligned on signing mode and secret ownership without disclosing secret material.

Required future evidence:

- proof that Gateway and Automation both support the intended signing mode in the target environment
- proof that the AI Assistant path remains HMAC-only where required by the current contract
- proof that the env-name ownership remains server-only
- proof that browser-visible runtimes do not hold the signing envs
- if `hmac_sha256` is the deployed mode, proof that Gateway and Automation are wired to the same secret-owner path without revealing the secret
- proof that the parity result belongs to the same RC SHA and target environment as the reachability proof

Allowed evidence shape:

- env names only
- presence status such as `present` or `missing`
- ownership status such as `gateway_owned`, `automation_owned`, `not_browser_exposed`
- summarized mode parity such as `mode_parity=aligned`
- summarized owner-path parity such as `secret_owner_path_parity=aligned`
- non-secret runtime provenance
- safe timestamp and operator scope metadata

The report must not contain:

- secret values
- secret substrings
- HMAC material
- signatures
- raw assertion payloads
- full env dumps
- raw validation errors that echo secret-like content

If any of the following drift is later observed, activation must remain blocked:

- Gateway and Automation mode mismatch
- missing signing env on either service when required
- non-server exposure of signing env names
- missing proof that both sides share the intended secret-owner path
- artifact includes any secret material or raw signing payload

## Combined Proof Matrix

| Proof                                        | Required Runtime                                                                                                   | Evidence Required                                                                                                                                                 | Forbidden Evidence                                                                             | Secret-Safety Rule                                                                  | Blocks Activation If Missing | Rollback Expectation                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| `private_gateway_to_automation_reachability` | `release-gate-runner` or equivalent proof-capable Railway runtime in same project, environment, and RC snapshot    | RC SHA, target environment, proof-runtime identity, summarized private reachability result, summarized boundary classification, summarized privacy classification | private URLs, full internal hostnames, raw probe output, raw logs, raw headers, raw payloads   | report only classifications and redacted status fields                              | yes                          | retain fail-closed route and non-productive runtime state                                |
| `gateway_automation_signing_parity`          | `release-gate-runner` or equivalent proof-capable Railway runtime with access to non-secret env ownership evidence | env names, summarized signing mode parity, summarized owner-path parity, browser-exposure prohibition status, RC/environment binding                              | secret values, signatures, raw assertion payloads, full env exports, raw secret-bearing errors | report only env names, ownership classes, and boolean or summarized parity outcomes | yes                          | retain fail-closed route and non-productive runtime state                                |
| `combined_proof_binding`                     | same proof-capable Railway runtime class used for both proof categories                                            | same RC SHA, same target environment, same proof-runtime scope, same operator evidence class                                                                      | mixed-environment evidence, stale RC references, cross-runtime mismatch artifacts              | do not combine proofs across mismatched runtime contexts                            | yes                          | proof bundle is invalid until both categories are re-collected in one consistent context |
| `activation_evidence_secret_safe`            | any operator evidence packaging step                                                                               | redaction review result, safe evidence class, deny/fail-closed status                                                                                             | secrets, private URLs, raw prompts, raw contexts, model responses, raw errors                  | no raw values, only classifications and redacted metadata                           | yes                          | discard unsafe artifact and keep all activation gates blocked                            |

## Redaction Rules

The following must never appear in this runbook, later proof artifacts, comments, screenshots, reports, dashboards, or copied operator notes:

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
- `SUPABASE_SERVICE_ROLE_KEY` values
- `OPENAI_API_KEY` values
- Redis URLs

Additional redaction expectations:

- do not include full internal Railway endpoint names
- do not include raw env-file contents
- do not include raw secret presence logs when the log line contains a value fragment
- do not include raw proof-runtime transcripts if they reveal private network structure
- do not include raw assertion verification output if it contains secret-derived material

## Allowed Evidence

The following evidence classes are allowed in later operator artifacts:

- RC SHA
- target environment
- service names
- redacted ownership status
- boolean presence status
- non-secret runtime provenance
- summarized reachability result
- summarized signing mode parity
- deny/fail-closed status
- secret-safe observability class

Allowed formatting examples:

- `rc_sha_matches=true`
- `target_environment=production`
- `proof_runtime_service=release-gate-runner`
- `automation_private_boundary_preserved=true`
- `browser_boundary_used=false`
- `signing_mode_parity=aligned`
- `signing_owner_path_parity=aligned`
- `activation_status=activation_not_allowed_now`

## Decision States

Use only these decision states in later operator-facing proof artifacts that rely on this runbook:

- `proof_not_started`
- `operator_proof_required`
- `proof_incomplete`
- `proof_ready`
- `blocked_by_reachability_drift`
- `blocked_by_signing_drift`
- `activation_not_allowed_now`

Recommended interpretation:

- `proof_not_started`: no operator evidence has been collected yet
- `operator_proof_required`: repo foundations exist but target-environment proof is still missing
- `proof_incomplete`: partial evidence exists, but one or more required fields or bindings are missing
- `proof_ready`: evidence is complete and secret-safe for these two categories only
- `blocked_by_reachability_drift`: private-boundary assumptions no longer match target reality
- `blocked_by_signing_drift`: signing mode or owner-path assumptions no longer match target reality
- `activation_not_allowed_now`: always valid until all separate activation gates beyond this runbook are independently satisfied

## Activation Boundary

This runbook does not allow activation.

Even if both proof categories later reach `proof_ready`, the following remain separate activation gates:

- budget and metering proof
- `productGate`
- `routeMode`
- coordinated `runtimeStatus`
- rollback proof

This runbook does not authorize:

- public product launch
- AI Assistant UI exposure
- productive downstream enablement
- OpenAI accessibility through the AI Assistant path
- any runtime transition by itself

## Operator Checklist

- confirm the evaluated artifact still references RC SHA `6b0355864958fe2bf8bd9b10c1b3a255f90a7bc4` or the later intended RC SHA only
  Redaction rule: record the SHA only, never any secret-bearing deploy transcript
- confirm the proof runtime is `release-gate-runner` or an equivalent proof-capable Railway runtime
  Redaction rule: record service label only, not private runtime coordinates
- confirm the proof runtime is in the same Railway project and target environment as the release candidate
  Redaction rule: record project/environment names only, not internal IDs if they reveal private topology
- confirm the reachability artifact states that browser and Vercel were not the evaluated boundary
  Redaction rule: summarize as boolean or classification only
- confirm the reachability artifact states that Automation remained private
  Redaction rule: do not write private URLs or full internal hostnames
- confirm the signing artifact records env-name ownership only
  Redaction rule: never copy env values or raw env dumps
- confirm the signing artifact states whether mode parity is aligned
  Redaction rule: never include signatures or raw assertion payloads
- confirm the signing artifact states whether secret-owner-path parity is aligned
  Redaction rule: express as summarized ownership status only
- confirm the combined artifact is bound to one RC SHA and one target environment
  Redaction rule: do not merge evidence from mixed snapshots or mixed environments
- confirm the final artifact remains `activation_not_allowed_now`
  Redaction rule: no wording may imply runtime permission or product launch

## Recommended Next Slice

Exactly one next slice is recommended:

`AI Assistant Operator Proof Evidence Collection`

That slice should do only this:

- collect the later operator-owned private reachability proof artifact
- collect the later operator-owned signing parity proof artifact
- classify both artifacts with the decision states in this runbook
- keep runtime activation blocked
