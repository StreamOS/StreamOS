# AI Assistant Activation Proof Collection Report - 2026-06-30

## Decision

Primary decision: `proofs_incomplete`

Additional decisions:

- `activation_not_allowed_now`
- `next_slice_allowed_signing_parity_verification`

Why:

- only fail-closed route behavior, local contract behavior, and secret-safe observability behavior are repository-verifiable today
- target-environment operator proofs for product-gate opening, route-mode transition, runtime-status coordination, signing parity, private reachability, productive budget mode, and rollback execution are still missing
- local preflight remains `localOnly=true` and `operatorProofRequired=true`
- this report does not permit runtime activation

## Scope

This report collects only proof evidence that is already present in:

- repository source code
- repository tests
- existing AI Assistant docs on current `main`

Not done:

- no live Railway, Vercel, Supabase, Automation Service, or OpenAI check
- no runtime activation
- no route-mode transition
- no product-gate opening
- no code, env, DB, worker, UI, provider, or test change

Reviewed on current `main` at `a05c845fa0a05e3a07fc3f5e111a851a8df3b9cd`.

`02_roadmap_and_next_slices.md` and `streamos_produkt_feature_roadmap.md` are not present on current `main`. `docs/p4-product-roadmap-update.md` remains the available roadmap source.

## Current Fail-Closed State

Current repository-backed state:

- `/api/ai-assistant` is mounted in `services/api-gateway`
- `productGate=closed` by default
- `routeMode=disabled` by default
- Gateway `runtimeStatus=not_yet_productive` by default
- Automation `runtimeStatus=not_yet_productive` remains the expected paired state in existing docs and proofs
- no productive AI Assistant downstream is configured
- local preflight can return at most `preflight_ready`
- local preflight still returns `activationPermittedNow=false`
- local preflight still returns `localOnly=true`
- local preflight still returns `operatorProofRequired=true`
- activation remains not allowed now

Current internal automation endpoints remain unchanged core/internal surfaces:

- `/clips/analyze`
- `/repurposing/plan`
- `/transcriptions/process`

## Evidence Sources Reviewed

- `docs/ai-assistant-runtime-activation-readiness-audit-2026-06-30.md`
- `docs/ai-assistant-operator-proof-runbook-2026-06-30.md`
- `docs/ai-assistant-activation-slice-planning-2026-06-30.md`
- `docs/architecture.md`
- `docs/deployment.md`
- `docs/p4-product-roadmap-update.md`
- `services/api-gateway/src/lib/ai-assistant-activation-preflight.ts`
- `services/api-gateway/src/lib/ai-assistant-activation-preflight.test.ts`
- `services/api-gateway/src/lib/ai-assistant-route-observability.ts`
- `services/api-gateway/src/lib/ai-assistant-route-observability.test.ts`
- `services/api-gateway/src/lib/ai-assistant-route-contract.ts`
- `services/api-gateway/src/lib/ai-assistant-route-contract.test.ts`
- `services/api-gateway/src/lib/ai-assistant-gateway-automation-contract.test.ts`
- `services/api-gateway/src/routes/aiAssistant.ts`
- `services/api-gateway/src/routes/aiAssistant.test.ts`

## Proof Matrix

| Proof Category                               | Status                    | Evidence Source                                                                                                                 | Evidence Class                | Gap                                                                                                                                                  | Required Next Proof                                                           | Blocks Activation |
| -------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------- |
| `product_gate_operator_approval`             | `missing_operator_proof`  | route default in `services/api-gateway/src/routes/aiAssistant.ts`; audit, runbook, and planning docs                            | `docs_only_evidence`          | no real operator approval, no target-env open evidence, no executed operator close proof                                                             | operator-owned product-gate approval and rollback evidence                    | yes               |
| `route_mode_transition_approval`             | `missing_operator_proof`  | route contract modes in `services/api-gateway/src/lib/ai-assistant-route-contract.ts`; audit, runbook, and planning docs        | `docs_only_evidence`          | only `disabled` and `test_only_mock` exist; no approved productive transition evidence                                                               | operator-approved bounded route-mode transition proof                         | yes               |
| `runtime_status_coordination`                | `blocked`                 | preflight helper, route defaults, readiness audit, activation planning doc                                                      | `present_repo_evidence`       | both sides remain intentionally non-productive and no coordinated activation proof exists                                                            | coordinated Gateway and Automation runtime-status proof with rollback         | yes               |
| `gateway_automation_signing_parity`          | `operator_proof_required` | deployment env ownership docs; mocked Gateway-to-Automation contract fixture and signature verification test                    | `present_local_test_evidence` | local contract compatibility exists, but no target-env parity proof exists                                                                           | secret-safe target-environment signing parity verification                    | yes               |
| `private_gateway_to_automation_reachability` | `operator_proof_required` | `docs/deployment.md`, readiness audit, runbook, activation planning doc                                                         | `docs_only_evidence`          | private-boundary expectation is documented, but no proof-capable target-runtime reachability evidence exists                                         | operator-run private reachability proof from intended internal boundary       | yes               |
| `budget_mode_productive_ready`               | `operator_proof_required` | readiness audit, preflight gate category, activation planning doc                                                               | `docs_only_evidence`          | no productive budget-mode proof; current audit notes activation-grade budget policy is not proven                                                    | productive budget-policy proof with operator-readable evidence                | yes               |
| `rate_guard_ready`                           | `operator_proof_required` | route-contract tests and preflight tests verify local denial behavior                                                           | `present_local_test_evidence` | local rate-guard behavior is covered, but no production-grade operator proof exists                                                                  | operator proof that productive rate-guard policy is configured and observable | yes               |
| `concurrency_guard_ready`                    | `operator_proof_required` | route-contract tests, Gateway-to-Automation contract test, observability evidence classes, preflight tests                      | `present_local_test_evidence` | local concurrency denial and release behavior is covered, but no target-env proof exists                                                             | operator proof for productive concurrency guard and release observability     | yes               |
| `ledger_metering_ready`                      | `operator_proof_required` | route-contract tests, Gateway-to-Automation fixture test, readiness audit, preflight tests                                      | `present_local_test_evidence` | local reservation, reconciliation, deny, and release semantics are covered, but no operator proof exists for productive ledger and metering behavior | productive ledger, metering, and reconciliation proof                         | yes               |
| `rollback_switch_ready`                      | `operator_proof_required` | fail-closed route defaults, preflight helper, runbook rollback template, activation planning doc                                | `present_repo_evidence`       | rollback switches and templates exist, but no executed operator rollback proof exists                                                                | target-environment rollback proof with operator-readable evidence             | yes               |
| `activation_evidence_secret_safe`            | `present_repo_evidence`   | observability schema and sanitizer behavior, route tests, contract tests, observability tests, runbook forbidden-evidence rules | `present_local_test_evidence` | no gap found in reviewed repo/docs evidence; category still does not override other missing proofs                                                   | keep future activation evidence within the existing secret-safe contract      | no                |

## Findings

1. Fail-closed route presence is repository-proven.
   The mounted route is real, but it defaults to `productGate=closed`, `routeMode=disabled`, and non-productive runtime semantics. This is repository evidence only, not activation proof.

2. Local preflight proves refusal semantics, not activation approval.
   The preflight helper and its tests prove that missing product-gate, signing, private-reachability, budget, guard, ledger, rollback, and secret-safety evidence keep activation blocked. Even complete local evidence can only yield `preflight_ready` while `activationPermittedNow=false`.

3. Local Gateway-to-Automation contract evidence exists.
   The mocked fixture proves issuance, signature verification, plan-source alignment, tenant/user/request binding, metering reconciliation, and concurrency release behavior locally. This is `present_local_test_evidence`, not target-environment proof.

4. Secret-safe observability is strongly evidenced in-repo.
   The observability contract, sanitizer behavior, and tests show that private URLs, tokens, prompts, signatures, and raw payloads are excluded or redacted from reviewed repo-visible evidence.

5. Product-gate, route-mode, runtime coordination, signing parity, private reachability, productive budget mode, and rollback execution still lack operator proof.
   Existing docs define the proof shape and sequencing, but they do not contain real operator approval or target-environment execution evidence.

6. No productive downstream exists today.
   The readiness audit remains valid: there is no productive AI Assistant downstream path, so activation remains blocked even before UI or product-launch concerns are considered.

## Missing Operator Proofs

- real operator approval for opening `productGate`
- real operator approval for leaving `routeMode=disabled`
- coordinated Gateway and Automation runtime-status activation proof
- target-environment signing parity proof
- Railway-internal private Gateway-to-Automation reachability proof
- productive budget-mode readiness proof
- productive rate-guard readiness proof
- productive concurrency-guard readiness proof
- productive ledger, metering, and reconciliation proof
- executed rollback proof with operator-readable evidence

## Secret-Safety Review

Result: secret-safe in the reviewed repository and documentation scope.

Observed secret-safe evidence:

- route tests verify that private prompt content and token-like text do not leak into responses or observability payloads
- observability tests verify URL and token redaction behavior
- Gateway-to-Automation fixture tests verify that prompts, signatures, and extra context details do not leak into usage-context, ledger, or observability evidence
- runbook and planning docs explicitly forbid secret values, private URLs, signatures, raw prompts, raw contexts, raw model responses, raw provider payloads, and raw errors

Not concluded by this review:

- no live log review
- no target-environment operator evidence review
- no production telemetry review

## Activation Boundary

This report does not allow activation.

Boundary conclusions:

- `proofs_incomplete` remains the correct conservative state
- `activation_not_allowed_now` remains the correct current state
- local repository evidence does not replace operator proof
- local tests do not replace staging or production proof
- no reviewed evidence authorizes `productive_activation`

## Recommended Next Slice

`AI Assistant Signing Parity Verification`

Why this next slice:

- activation planning already established proof collection as complete enough to move to the first target-environment proof slice
- signing parity is explicitly required before downstream foundation or any activation-capable gate change
- the repository already contains local contract evidence, so the next step is a tightly scoped operator-proof slice rather than another general planning step

## Checks

Executed for this docs-only slice:

- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant-activation-proof-collection-report-2026-06-30.md`

Not executed:

- `pnpm validate`

Why skipped:

- this slice adds exactly one docs-only Markdown file and does not change code, tests, env, DB, workers, providers, or runtime behavior
