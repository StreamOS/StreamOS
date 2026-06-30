# AI Assistant Operator Proof Evidence Collection - 2026-06-30

## Decision

Primary decisions:

- `operator_evidence_reviewed`
- `operator_evidence_incomplete`
- `operator_proof_required`
- `activation_not_allowed_now`

Why:

- reviewed repository docs, contracts, fixtures, and tests still show only fail-closed implementation evidence and proof requirements
- no AI Assistant-specific redacted operator evidence artifact was found for private Gateway-to-Automation reachability
- no AI Assistant-specific redacted operator evidence artifact was found for Gateway-and-Automation signing parity
- no combined AI Assistant operator evidence package was found that binds both proof categories to the same RC SHA and target environment
- no existing repository artifact justifies `proof_ready`

No additional decision is granted for:

- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`

## Scope

This slice reviews only:

- repository documentation
- repository-local contract and test artifacts
- repository-local proof-runbook and deployment guidance

Not done:

- no live Railway check
- no live Vercel check
- no live Supabase check
- no live Automation Service check
- no live OpenAI check
- no network probe
- no `curl`
- no runtime activation
- no code, test, env, DB, worker, provider, or deployment change

Reviewed on current `main` at `0e280dc22937621b53e497fd84f9a1fff735d046`.

## Current Fail-Closed State

Current AI Assistant state remains:

- `/api/ai-assistant` is mounted in `services/api-gateway`
- `productGate=closed`
- `routeMode=disabled`
- Gateway `runtimeStatus=not_yet_productive`
- Automation `runtimeStatus=not_yet_productive`
- Gateway-to-Automation downstream contract foundation is present
- activation transition contract foundation is present
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

## Evidence Sources Reviewed

- `docs/ai-assistant-private-downstream-reachability-signing-proof-runbook-2026-06-30.md`
- `docs/ai-assistant-private-reachability-proof-2026-06-30.md`
- `docs/ai-assistant-signing-parity-verification-2026-06-30.md`
- `docs/ai-assistant-budget-metering-production-proof-2026-06-30.md`
- `docs/ai-assistant-activation-proof-collection-report-2026-06-30.md`
- `docs/ai-assistant-activation-slice-planning-2026-06-30.md`
- `docs/ai-assistant-operator-proof-runbook-2026-06-30.md`
- `docs/operator-live-env-audit.md`
- `docs/architecture.md`
- `docs/deployment.md`
- `services/api-gateway/src/lib/ai-assistant-automation-downstream-contract.ts`
- `services/api-gateway/src/lib/ai-assistant-activation-transition-contract.ts`
- `services/api-gateway/src/lib/ai-assistant-activation-preflight.ts`
- `services/api-gateway/src/lib/fixtures/ai-assistant-gateway-automation-contract.json`
- `services/automation-service/src/ai_assistant_downstream_contract.py`
- `services/automation-service/src/ai_assistant_backend_contract.py`

Repository search result:

- no AI Assistant-specific redacted operator proof artifact was found under `docs/` or `scripts/`
- only requirements, runbooks, deployment rules, local fixtures, and local contract evidence were found

## Evidence Rules Applied

Allowed evidence classes for this review:

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

Forbidden evidence classes for this review:

- private URLs
- full internal hostnames
- tokens
- secrets
- signatures
- raw payloads
- raw prompts
- raw contexts
- model responses
- raw errors
- `SUPABASE_SERVICE_ROLE_KEY` values
- `OPENAI_API_KEY` values
- Redis URLs

Promotion rules applied:

- docs-only requirement statements are not target-environment operator proof
- local tests are not target-environment operator proof
- local fixtures are not target-environment operator proof
- local fail-closed helper behavior is not target-environment operator proof
- evidence that is not RC-bound remains insufficient
- evidence that is not target-environment-bound remains insufficient

## Operator Evidence Matrix

| Proof Category                               | Evidence Status                | Evidence Source                                                                                                                                  | RC Bound         | Environment Bound | Secret-Safe      | Gap                                                                                                                                                                          | Blocks Activation |
| -------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ----------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `private_gateway_to_automation_reachability` | `operator_evidence_missing`    | no AI Assistant-specific redacted target-runtime artifact found; only runbooks, deployment rules, and local preflight evidence                   | no               | no                | `not_applicable` | no proof-capable Railway runtime artifact proves private reachability, private boundary preservation, or browser/Vercel exclusion for the intended RC and target environment | yes               |
| `gateway_automation_signing_parity`          | `operator_evidence_missing`    | no AI Assistant-specific redacted signing artifact found; only repo contracts, tests, and env-ownership docs                                     | no               | no                | `not_applicable` | no target-environment artifact proves aligned signing mode, aligned owner-path parity, or redacted env presence/ownership status for the intended RC and target environment  | yes               |
| `combined_proof_binding`                     | `operator_evidence_missing`    | no combined AI Assistant evidence package found that binds reachability and signing to one proof runtime, one RC SHA, and one target environment | no               | no                | `not_applicable` | no combined proof package exists to prove same RC, same environment, and same proof-runtime class across both categories                                                     | yes               |
| `activation_evidence_secret_safe`            | `operator_evidence_incomplete` | runbooks and prior docs are secret-safe, but no AI Assistant operator evidence package exists to evaluate as a target proof artifact             | `not_applicable` | `not_applicable`  | yes              | secret-safety rules are documented, but no target-evidence bundle exists to review against those rules                                                                       | yes               |

## Private Reachability Evidence Review

Result: no operator evidence present.

What was found:

- runbook guidance requiring proof from `release-gate-runner` or equivalent proof-capable Railway runtime
- deployment documentation that keeps `services/automation-service` private
- local preflight rules that block activation when private reachability evidence is missing
- adjacent operator-proof patterns for proof-capable Railway runtime usage

What was not found:

- AI Assistant-specific redacted artifact proving private reachability from a proof-capable Railway runtime
- AI Assistant-specific artifact bound to a concrete RC SHA for this proof category
- AI Assistant-specific artifact bound to a concrete Railway target environment for this proof category
- AI Assistant-specific artifact proving that browser and Vercel were not the evaluated boundary
- AI Assistant-specific artifact proving that Automation remained private while the proof succeeded

Status:

- `operator_evidence_missing`

## Signing Parity Evidence Review

Result: no operator evidence present.

What was found:

- repository-level contract evidence that Gateway and Automation model compatible signing semantics
- repository-level evidence that the AI Assistant path is HMAC-only where required
- deployment docs that keep signing env ownership on Gateway and Automation and away from `apps/web`
- local tests and shared fixture evidence that contract-level serialization and validation are aligned

What was not found:

- redacted operator artifact proving target-environment signing mode parity
- redacted operator artifact proving target-environment env presence or ownership status
- redacted operator artifact proving owner-path parity for the signing secret without exposing the secret
- AI Assistant-specific signing artifact bound to a concrete RC SHA and target environment

Status:

- `operator_evidence_missing`

## Combined Proof Binding Review

Result: no combined operator evidence package present.

What was found:

- runbook and deployment rules that require same-RC and same-environment binding
- generic proof-runtime requirements around `release-gate-runner`
- non-secret provenance concepts in deployment and operator-audit docs

What was not found:

- one AI Assistant-specific redacted evidence package that ties reachability and signing to the same RC SHA
- one AI Assistant-specific redacted evidence package that ties reachability and signing to the same Railway target environment
- one AI Assistant-specific redacted evidence package that ties both proof categories to the same proof-runtime class

Status:

- `operator_evidence_missing`

## Secret-Safety Review

Result: secret-safe for the reviewed repository materials, but incomplete for target proof review.

Observed secret-safe conditions:

- the reviewed AI Assistant docs avoid secret values, tokens, signatures, raw prompts, raw contexts, model responses, and private URLs
- the reviewed local fixture and contract docs stay below operator-proof level and do not expose target-environment secrets
- the current runbook defines explicit allowed and forbidden evidence classes

Limit of this review:

- no AI Assistant operator evidence package exists yet, so this review cannot certify a target proof bundle as `proof_ready`

Status:

- `operator_evidence_incomplete`

## Missing Evidence

Missing operator evidence categories:

- redacted private reachability artifact from proof-capable Railway runtime
- redacted signing parity artifact from proof-capable Railway runtime
- redacted proof that reachability artifact is bound to the intended RC SHA
- redacted proof that signing artifact is bound to the intended RC SHA
- redacted proof that reachability artifact is bound to the intended Railway target environment
- redacted proof that signing artifact is bound to the intended Railway target environment
- redacted proof that both categories were collected from the same proof-runtime class or an explicitly equivalent proof-capable runtime
- AI Assistant-specific operator evidence package that can actually be checked for secret-safe compliance

## Rejected Evidence

No redacted AI Assistant operator artifact was rejected for secret leakage because no candidate operator artifact was found.

The following existing repository materials were explicitly rejected from elevation to target-environment operator proof:

- `docs/ai-assistant-private-downstream-reachability-signing-proof-runbook-2026-06-30.md`
  Reason: proof instructions only; not operator evidence
- `docs/ai-assistant-private-reachability-proof-2026-06-30.md`
  Reason: reviews proof requirements only; not target-environment evidence
- `docs/ai-assistant-signing-parity-verification-2026-06-30.md`
  Reason: reviews repo-level compatibility only; not target-environment evidence
- `services/api-gateway/src/lib/fixtures/ai-assistant-gateway-automation-contract.json`
  Reason: local fixture only; `operator_evidence_rejected_not_rc_bound` and `operator_evidence_rejected_not_environment_bound`
- local Gateway and Automation AI Assistant tests
  Reason: local implementation evidence only; `operator_evidence_rejected_not_rc_bound` and `operator_evidence_rejected_not_environment_bound`
- local activation preflight and transition helpers
  Reason: fail-closed local readiness only; not operator proof

## Activation Boundary

This report does not allow activation.

Conservative boundary result:

- `operator_evidence_reviewed` is justified
- `operator_evidence_incomplete` remains mandatory
- `operator_proof_required` remains mandatory
- `activation_not_allowed_now` remains mandatory

This report does not justify:

- `proof_ready`
- `reachability_signing_operator_proofs_ready_for_next_review`
- `runtime_activation_allowed`
- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`

Even future complete reachability and signing evidence would still leave separate gates for:

- budget and metering
- `productGate`
- `routeMode`
- coordinated `runtimeStatus`
- rollback readiness

## Recommended Next Slice

Exactly one next slice is recommended:

`AI Assistant Operator Proof Evidence Collection Follow-up`

Why:

- operator evidence for reachability is still missing
- operator evidence for signing parity is still missing
- combined RC and environment binding evidence is still missing
- no target proof bundle exists yet to review for secret-safety compliance

## Checks

Executed for this docs-only slice:

- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant-operator-proof-evidence-collection-2026-06-30.md`

Not executed:

- `pnpm validate`

Why skipped:

- only one docs-only Markdown file was added
- no code, tests, env, DB, worker, provider, or deployment contract changed
