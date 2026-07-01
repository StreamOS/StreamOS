# AI Assistant Operator Proof Target Runtime Collection Handoff - 2026-06-30

## Decision

Primary decisions:

- `operator_target_runtime_collection_handoff_defined`
- `target_runtime_collection_required`
- `activation_not_allowed_now`

Why:

- the repository now contains a reviewed but incomplete AI Assistant operator proof bundle candidate shell
- the next safe step is a secret-safe operator handoff that explains how the shell may be filled from the correct runtime boundary
- the handoff must keep local repository state, target-runtime collection, and later proof review clearly separated

No additional decision is granted for:

- `proof_ready_for_reachability_and_signing_only`
- `operator_proof_bundle_reviewed`
- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`

## Scope

This slice defines only:

- the operator handoff packet for target-runtime collection
- which parts of the candidate shell travel into the handoff
- which target-runtime collection steps are required before a later proof review
- which immediate reject conditions must stop collection

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

## Handoff Goal

This handoff exists to move exactly one thing into later operator execution:

- a reviewed, secret-safe candidate shell that still contains no target-runtime proof

It must not move:

- activation permission
- route-mode permission
- productive runtime status permission
- any local guess about reachability or signing outcomes

## Handoff Packet

The handoff packet may contain only:

- reference to the candidate shell structure
- reference to the bundle contract
- reference to the template rules
- reference to the candidate review outcome
- safe instructions for target-runtime collection order
- safe reject conditions

The handoff packet must not contain:

- secrets
- tokens
- private URLs
- full internal hostnames
- signatures
- raw shell transcripts
- raw `curl` output
- raw provider payloads
- raw prompts
- raw contexts
- model responses
- raw errors

## Handoff Inputs

The operator receiving the handoff needs only these safe inputs:

| Input                           | Allowed content                                                                                                                                                                                                              | Forbidden content                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `candidate_shell_ref`           | candidate document name only                                                                                                                                                                                                 | copied secret-bearing content         |
| `bundle_contract_ref`           | document name only                                                                                                                                                                                                           | improvised contract rewrite           |
| `target_runtime_class`          | `release-gate-runner` or explicitly equivalent proof-capable Railway runtime (equivalent means Railway-hosted runtime boundary, same proof artifact collection capability, and no expansion of activation/route permissions) | local shell, browser, Vercel function |
| `target_environment_name`       | named environment only                                                                                                                                                                                                       | private topology coordinates          |
| `rc_sha_to_collect`             | exact RC SHA only                                                                                                                                                                                                            | deployment transcript                 |
| `activation_status_requirement` | `activation_not_allowed_now`                                                                                                                                                                                                 | any activation-ready wording          |

## Required Collection Order

Later target-runtime collection must follow this order:

1. confirm the intended RC SHA and target environment for the handoff packet (see [Handoff Inputs](#handoff-inputs): `rc_sha_to_collect`, `target_environment_name`)
2. confirm the proof runtime is `release-gate-runner` or an explicitly equivalent proof-capable Railway runtime (see [Handoff Inputs](#handoff-inputs): `target_runtime_class`)
3. fill the manifest fields from the target runtime context (see [Fill Permissions](#fill-permissions))
4. collect private reachability results from the Railway-internal boundary only (see [Fill Permissions](#fill-permissions): reachability fields)
5. collect signing parity results from the target Gateway and Automation runtime context only (see [Fill Permissions](#fill-permissions))
6. perform the artifact-level secret-safety review over the filled candidate (apply allowed/forbidden constraints in [Handoff Inputs](#handoff-inputs))
7. stop with `activation_not_allowed_now` regardless of collection outcome (see [Handoff Inputs](#handoff-inputs): `activation_status_requirement`)

## Fill Permissions

Allowed later target-runtime fills:

- `proof_manifest.rc_sha`
- `proof_manifest.target_environment`
- `proof_manifest.proof_runtime_class`
- `proof_manifest.proof_runtime_scope`
- `proof_manifest.collected_at`
- `proof_manifest.operator_scope`
- all reachability booleans and summarized reachability result
- all signing parity booleans and summarized ownership classes
- all secret-safety booleans and final `review_result`

Forbidden later fills:

- secret values
- raw env dumps
- private URLs
- raw request or response bodies
- signatures
- raw assertion payloads
- raw probe output
- wording that implies activation approval

## Immediate Reject Conditions

The handoff must be rejected before any later review if one of the following is observed during collection:

- RC SHA under collection differs from the handoff packet RC SHA
- target environment under collection differs from the handoff packet target environment
- collection is attempted from local shell, browser, or Vercel boundary
- any field is filled with secret-bearing material
- reachability is derived from non-private boundary checks
- signing parity is described with raw env values or raw signature output
- secret-safety review is skipped

## Partial Collection States

Allowed partial outcomes after handoff execution:

- `candidate_collection_incomplete`
- `candidate_collection_blocked`

Not allowed as a handoff outcome:

- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`

If collection stops early, the candidate remains non-reviewable until:

- all `<not_collected>` markers are removed, and
- the filled artifact remains secret-safe, and
- all sections are bound to one RC SHA, one environment, and one proof-runtime class

## Operator Receipt Checklist

- confirm the candidate shell reference is the intended one
- confirm the RC SHA to collect is named explicitly
- confirm the target environment to collect is named explicitly
- confirm the proof runtime class is acceptable
- confirm the collection boundary excludes browser and Vercel
- confirm the handoff contains no secret-bearing material
- confirm the handoff still requires `activation_not_allowed_now`
- confirm the filled artifact must later return for separate review

## Activation Boundary

This handoff does not allow activation.

Even if the later collection succeeds, the result still requires a separate proof review and still does not by itself allow:

- `runtime_activation_allowed`
- `productGate` opening
- `routeMode` transition
- productive `runtimeStatus`
- productive downstream enablement

Even a later complete reachability-and-signing artifact would still leave these separate blockers:

- budget and metering operational proof
- `productGate` opening proof
- `routeMode` transition proof
- coordinated productive `runtimeStatus` proof
- rollback proof
- productive downstream implementation in `services/automation-service`

## Recommended Next Slice

Exactly one next slice is recommended:

`AI Assistant Operator Proof Filled Candidate Review`

Why:

- the candidate shell exists
- the candidate review exists
- the target-runtime handoff now exists
- the next safe step, after real target-runtime collection, is a strict review of the filled candidate artifact against the existing bundle contract

## Checks

Executed for this docs-only slice:

- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant/ai-assistant-operator-proof-target-runtime-collection-handoff-2026-06-30.md`

Not executed:

- `pnpm validate`

Why skipped:

- only one docs-only Markdown file was added
- no code, tests, env, DB, worker, provider, or deployment contract changed
