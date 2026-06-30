# AI Assistant Signing Parity Verification - 2026-06-30

## Decision

Primary decisions:

- `signing_contract_repo_reviewed`
- `target_environment_signing_parity_operator_proof_required`
- `activation_not_allowed_now`

Why:

- repository code, tests, and docs show contract-level signing parity between `services/api-gateway` and `services/automation-service`
- the AI Assistant path is stricter than the generic assertion contract and remains HMAC-only plus fail-closed on both sides
- no reviewed repository evidence proves that the intended target environment is configured with matching signing mode and shared secret ownership
- this slice is docs-only and does not activate runtime, open `productGate`, transition `routeMode`, or prove productive readiness

No `blocked_by_signing_contract_drift` decision is added because no repo-level signing contract drift was found in the reviewed sources.

## Scope

This slice reviews only:

- repository source code
- repository tests
- repository docs on current `main`

Not done:

- no live Railway, Vercel, Supabase, Automation Service, or OpenAI check
- no env value inspection
- no secret verification
- no runtime activation
- no route-mode transition
- no product-gate opening
- no UI, DB, worker, provider, or deployment change

Reviewed on current `main` at `ac36fc9a32de45f13f47abd28d8b654eaf918115`.

## Current Fail-Closed State

Current repository-backed state remains:

- `/api/ai-assistant` is mounted in `services/api-gateway`
- `productGate=closed`
- `routeMode=disabled`
- Gateway `runtimeStatus=not_yet_productive`
- Automation `runtimeStatus=not_yet_productive`
- no productive AI Assistant downstream is configured
- activation is not allowed now

Signing parity review does not change that state. Missing or incompatible signing configuration still cannot semantically activate the route.

## Evidence Sources Reviewed

- `docs/ai-assistant-activation-proof-collection-report-2026-06-30.md`
- `docs/ai-assistant-activation-slice-planning-2026-06-30.md`
- `docs/ai-assistant-operator-proof-runbook-2026-06-30.md`
- `docs/ai-assistant-runtime-activation-readiness-audit-2026-06-30.md`
- `docs/architecture.md`
- `docs/deployment.md`
- `packages/types/src/automation-entitlement-assertions.ts`
- `packages/types/test/automation-entitlement-assertions.test.ts`
- `services/api-gateway/src/lib/automation-entitlement-signing.ts`
- `services/api-gateway/src/lib/ai-usage-context-issuance.ts`
- `services/api-gateway/src/lib/ai-assistant-activation-preflight.ts`
- `services/automation-service/src/entitlement_assertions.py`
- `services/automation-service/src/ai_usage_context_enforcement.py`
- `services/automation-service/src/premium_runtime_enforcement.py`
- `services/automation-service/src/ai_assistant_backend_contract.py`
- `services/automation-service/src/settings.py`
- `services/automation-service/tests/test_ai_assistant_gateway_contract_fixture.py`
- `services/automation-service/tests/test_ai_boundaries.py`

## Signing Contract Matrix

| Area                                      | Gateway Evidence                                                                                                  | Automation Evidence                                                                                                             | Status                        | Gap                                                                          | Required Operator Proof                                                               | Blocks Activation |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------- |
| canonical env names and signing constants | `services/api-gateway` imports shared assertion constants from `packages/types`                                   | Python assertion module mirrors the same env names, issuer, audience, TTL, skew, algorithm label, and min secret length         | `present_repo_evidence`       | no repo drift found                                                          | none at repo-contract level                                                           | no                |
| generic supported signing modes           | signing helper models `unsigned_internal_contract` and `hmac_sha256`                                              | settings and assertion modules model `unsigned_internal_contract` and `hmac_sha256`                                             | `present_repo_evidence`       | no mode mismatch found                                                       | none at repo-contract level                                                           | no                |
| trusted plan-source contract              | Gateway usage context issuance is typed to trusted plan sources from shared types                                 | assertion validation and AI usage context validation accept trusted plan sources only                                           | `present_repo_evidence`       | no plan-source drift found in reviewed repo evidence                         | none at repo-contract level                                                           | no                |
| AI Assistant usage-context signing path   | usage-context issuance denies when signing mode is not `hmac_sha256` or secret is unavailable                     | usage-context enforcement returns unavailable when signing mode is not `hmac_sha256`                                            | `present_repo_evidence`       | no repo drift found; both sides are HMAC-only for AI Assistant usage context | target-environment proof that both services are configured for the intended HMAC path | yes               |
| AI Assistant runtime entitlement path     | preflight tracks `gateway_automation_signing_parity` as a required operator gate and never permits activation now | premium runtime enforcement requires signed runtime entitlement under `hmac_sha256` before backend contract execution           | `present_repo_evidence`       | no repo drift found; still no target-environment parity proof                | operator proof that deployed runtime signing mode matches on both services            | yes               |
| secret requirement contract               | deployment docs and gateway signing helper require server-only secret when `hmac_sha256` is selected              | settings enforce secret presence and min length when `hmac_sha256` is selected; boundary tests reject browser-exposed env names | `present_repo_evidence`       | no secret value or owner-path proof in target environment                    | operator proof that both services use the same secret owner path without disclosure   | yes               |
| local cross-runtime assertion evidence    | shared TypeScript tests lock canonical serialization and validation semantics                                     | Gateway fixture is consumed by Python tests and validated across runtime boundaries                                             | `present_local_test_evidence` | local tests are not target-environment proof                                 | secret-safe target-environment parity verification                                    | yes               |
| deployment and ownership docs             | `docs/deployment.md` keeps signing envs on server-owned services and forbids them in `apps/web`                   | same deployment doc marks joint ownership and shared-secret requirement for both services when HMAC is enabled                  | `docs_only`                   | docs do not prove real deployment state                                      | operator verification in intended environment                                         | yes               |

## Env Ownership Review

Repository and docs evidence align on env ownership:

- `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` belongs to `services/api-gateway` and `services/automation-service`
- `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` belongs to `services/api-gateway` and `services/automation-service`
- both env names are forbidden in `apps/web`, `NEXT_PUBLIC_*`, browser bundles, logs, and reports
- `services/automation-service/src/settings.py` explicitly rejects browser-style exposure for the signing env names

Status by category:

- Gateway ownership: `present_repo_evidence`
- Automation ownership: `present_repo_evidence`
- `apps/web` forbidden placement: `present_repo_evidence`
- target-environment ownership proof: `operator_proof_required`

## Signing Mode Compatibility

Contract-level result: repo-consistent.

Observed compatibility:

- the generic automation entitlement assertion contract supports `unsigned_internal_contract` and `hmac_sha256` on both sides
- the AI Assistant-specific path is intentionally narrower than the generic contract
- Gateway AI usage-context issuance signs only with `hmac_sha256`
- Automation AI usage-context enforcement accepts only `hmac_sha256`
- Automation premium runtime entitlement enforcement also requires `hmac_sha256`

This means:

- generic contract modeling is aligned
- AI Assistant enforcement is also aligned
- runtime activation is still blocked until target-environment parity is operator-proven

Status:

- repo contract compatibility: `present_repo_evidence`
- local cross-runtime evidence: `present_local_test_evidence`
- target-environment parity: `operator_proof_required`

## Secret Requirement Contract

When `hmac_sha256` is used, the reviewed repo contract requires:

- a server-only signing secret
- the same secret on Gateway and Automation
- minimum secret-length enforcement
- no exposure in browser-visible env or docs output

This review does not inspect:

- real secret values
- Railway env contents
- secret rotation state
- whether both services currently point to the same target-environment secret owner path

Status:

- repo requirement modeled: `present_repo_evidence`
- local enforcement evidence: `present_local_test_evidence`
- target-environment shared-secret proof: `operator_proof_required`

## Fail-Closed Review

Reviewed fail-closed behavior is sufficient for this slice:

- Gateway usage-context issuance denies when signing is unavailable instead of degrading to unsigned AI Assistant issuance
- Automation usage-context enforcement returns unavailable when signing mode is not the required HMAC mode
- Automation premium runtime enforcement rejects non-HMAC runtime entitlement mode
- preflight keeps signing parity as an operator gate and still cannot produce activation approval

Full local evidence could at most support a pre-activation proof step. It cannot authorize runtime activation.

Status:

- fail-closed contract behavior: `present_repo_evidence`
- activation authority from this slice: `not_applicable`

## Missing Operator Proofs

The following target-environment proofs are still required:

- proof that deployed Gateway and Automation use the intended signing mode in the same target environment
- proof that both services are wired to the same signing-secret owner path without exposing the secret
- proof that operator-readable evidence for signing parity is secret-safe
- proof that the signing-parity result is tied to the intended release candidate and not just local fixtures

These remain:

- `operator_proof_required`

## Secret-Safety Review

Result: secret-safe.

This report includes only:

- env names
- service ownership
- signing modes
- contract behavior
- test and docs evidence classes

This report does not include:

- secret values
- tokens
- private URLs
- signatures
- raw payloads
- raw prompts
- raw contexts
- model responses
- raw errors

Status:

- reviewed report content: `present_repo_evidence`

## Activation Boundary

This slice does not permit activation.

Conservative boundary result:

- `signing_contract_repo_reviewed` is justified
- `target_environment_signing_parity_operator_proof_required` remains mandatory
- `activation_not_allowed_now` remains mandatory

This slice cannot conclude:

- `signing_parity_proven_for_activation`
- productive runtime readiness
- product-gate opening approval
- route-mode transition approval

## Recommended Next Slice

`AI Assistant Private Reachability Proof`

Why:

- no repo-level signing contract drift was found
- signing parity is now reviewed at repo and docs level
- the next missing activation-grade dependency is operator proof that the intended private Gateway-to-Automation boundary is reachable from the correct target runtime without exposing private topology details

## Checks

Executed for this docs-only slice:

- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant-signing-parity-verification-2026-06-30.md`

Not executed:

- `pnpm validate`

Why skipped:

- only one docs-only Markdown file was added
- no code, tests, env, DB, worker, provider, or deployment contract changed
