# AI Assistant Private Reachability Proof - 2026-06-30

## Decision

Primary decisions:

- `private_reachability_requirements_reviewed`
- `target_environment_private_reachability_operator_proof_required`
- `activation_not_allowed_now`

Why:

- reviewed repository docs and preflight evidence consistently require `services/automation-service` to remain private
- reviewed docs consistently require Gateway-to-Automation reachability proof to come from a proof-capable Railway runtime, not from local shell or Vercel
- reviewed repository evidence shows requirement shape and fail-closed blocking behavior, but not actual target-environment operator proof
- this slice is docs-only and does not permit runtime activation, gate opening, route-mode transition, or downstream activation

No `blocked_by_private_reachability_drift` decision is added because no hard repo-level drift was found in the reviewed materials.

## Scope

This slice reviews only:

- repository documentation
- repository source and tests needed to classify existing AI Assistant reachability evidence

Not done:

- no live Railway, Vercel, Supabase, Automation Service, or OpenAI check
- no `curl`
- no private-network probe
- no runtime activation
- no code, test, env, DB, worker, provider, or deployment change

Reviewed on current `main` at `e36fb4fb39d706a6803ca381f7523a7485bc06c1`.

## Current Fail-Closed State

Current repository-backed state remains:

- `/api/ai-assistant` is mounted in `services/api-gateway`
- `productGate=closed`
- `routeMode=disabled`
- Gateway `runtimeStatus=not_yet_productive`
- Automation `runtimeStatus=not_yet_productive`
- no productive AI Assistant downstream is configured
- activation remains not allowed now

Reachability review does not change that state. Missing private Gateway-to-Automation proof remains an activation blocker even if the private boundary expectations are documented.

## Evidence Sources Reviewed

- `docs/ai-assistant-signing-parity-verification-2026-06-30.md`
- `docs/ai-assistant-activation-proof-collection-report-2026-06-30.md`
- `docs/ai-assistant-activation-slice-planning-2026-06-30.md`
- `docs/ai-assistant-operator-proof-runbook-2026-06-30.md`
- `docs/ai-assistant-runtime-activation-readiness-audit-2026-06-30.md`
- `docs/architecture.md`
- `docs/deployment.md`
- `docs/operator-live-env-audit.md`
- `docs/transcription-e2e.md`
- `services/api-gateway/src/lib/ai-assistant-activation-preflight.ts`
- `services/api-gateway/src/lib/ai-assistant-activation-preflight.test.ts`

## Reachability Proof Matrix

| Area                                                                | Evidence Source                                                                      | Status                   | Gap                                                                                                  | Required Operator Proof                                                                                                  | Secret-Safety Rule                                                                         | Blocks Activation |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------- |
| Automation remains private                                          | `docs/deployment.md`, `docs/architecture.md`, runbook                                | `present_docs_evidence`  | documented boundary exists, but not target-environment proof                                         | proof that the intended Automation service is private in the target Railway environment                                  | no private URL, no full internal hostname, no raw service inventory dump                   | yes               |
| browser and Vercel must not call Automation directly                | `docs/deployment.md`, slice-planning doc, runbook                                    | `present_docs_evidence`  | documented prohibition exists, but no operator evidence for the target deployment                    | proof that AI Assistant path is server-side and not browser/Vercel-routed in the target environment                      | no browser-visible private endpoint details, no raw env export                             | yes               |
| proof-capable Railway runtime requirement                           | `docs/deployment.md`, `docs/operator-live-env-audit.md`, runbook                     | `present_docs_evidence`  | proof runtime requirement is documented, but no AI Assistant operator proof from that runtime exists | proof collected from `release-gate-runner` or equivalent Railway runtime in the same project/environment and RC snapshot | do not expose runner private URL, shell transcript, or internal topology details           | yes               |
| local diagnostic is not production proof                            | `docs/deployment.md`, runbook, operator live env audit                               | `present_docs_evidence`  | local non-proof rule is documented, but no replacement target proof exists yet                       | explicit operator evidence from target runtime boundary                                                                  | no raw local probe output misrepresented as production evidence                            | yes               |
| AI Assistant preflight blocks without private reachability evidence | `services/api-gateway/src/lib/ai-assistant-activation-preflight.ts`, `.test.ts`      | `present_repo_evidence`  | local fail-closed blocking exists, but is not reachability proof                                     | operator proof for `private_gateway_to_automation_reachability` gate                                                     | no raw request/response payloads, no internal endpoint details                             | yes               |
| existing AI Assistant proof collection                              | proof-collection report, readiness audit, slice-planning doc                         | `present_docs_evidence`  | current AI Assistant docs only classify the gap; they do not close it                                | target-environment private reachability evidence for the intended AI Assistant path                                      | keep reports redacted and topology-safe                                                    | yes               |
| adjacent release-gate and transcription patterns                    | `docs/transcription-e2e.md`, `docs/operator-live-env-audit.md`, `docs/deployment.md` | `present_docs_evidence`  | adjacent proof patterns exist, but they are not AI Assistant-specific operator evidence              | AI Assistant-specific reuse of the same proof-capable runtime model                                                      | do not copy raw production gate output or private Automation endpoint data into the report | yes               |
| target-environment operator evidence package                        | no reviewed AI Assistant operator evidence artifact present                          | `missing_operator_proof` | no secret-safe redacted operator proof artifact was found for this slice                             | redacted confirmation of private reachability from intended internal runtime boundary                                    | no tokens, no full internal hostnames, no raw logs, no raw `curl`                          | yes               |

## Service Boundary Review

Boundary result: repo/docs-consistent.

Reviewed evidence shows:

- `services/api-gateway` remains the public backend entrypoint
- `services/automation-service` is expected to stay private in steady-state production
- browser code must call the Next.js app or Gateway, not the private Automation Service
- Vercel client bundles must not call the Automation Service directly
- the AI Assistant path is intended to stay server-owned

No boundary drift was found in the reviewed docs. The gap is not boundary definition; the gap is target-environment operator proof.

## Proof Runtime Review

Proof runtime result: requirement documented, proof absent.

Reviewed docs consistently state:

- production-grade private reachability proof must come from `release-gate-runner` or an equivalent proof-capable Railway runtime
- that runtime must be in the same Railway project and environment as the release candidate
- that runtime must contain the same release-candidate snapshot
- local shell and Vercel are not proof-capable for Railway-private reachability

This is strong requirement evidence, but it is still:

- `present_docs_evidence`

not:

- `present_operator_evidence`

## Existing Evidence

Existing repo/docs evidence is sufficient to review requirements and failure semantics, but not sufficient to prove target-environment reachability.

What exists:

- deployment docs that define private Automation ownership and Railway-internal proof expectations
- runbook guidance that explicitly separates local evidence from production proof
- preflight code and tests that keep activation blocked when private reachability evidence is missing
- adjacent release-gate/transcription documentation that demonstrates the repository already uses proof-capable Railway runtime concepts

What does not exist in reviewed materials:

- AI Assistant-specific operator evidence showing that Gateway can reach the private Automation Service from the intended target runtime boundary
- AI Assistant-specific redacted artifact proving the boundary without exposing private networking details
- reviewed operator artifact tying that reachability proof to the intended release candidate

Conclusion for this section:

- private Reachability is not repo/docs-seitig ausreichend belegt for activation
- private Reachability requirements are repo/docs-seitig well defined

## Missing Operator Proofs

The following target-environment proofs are still required:

- proof that the AI Assistant-relevant Gateway-to-Automation path is reachable from the intended Railway-internal runtime boundary
- proof that the Automation Service remains private while that path works
- proof that browser and Vercel are not the runtime boundary used for this path
- proof that the evidence was collected from a proof-capable Railway runtime in the same project/environment and release-candidate snapshot
- proof artifact that is operator-readable and secret-safe

These remain:

- `operator_proof_required`

## Forbidden Evidence

The future operator proof must not place any of the following into this report or similar docs:

- private URLs
- full internal hostnames
- secrets
- tokens
- headers
- signatures
- raw shell transcripts
- raw `curl` output
- raw logs
- raw request or response payloads
- raw prompts, contexts, model responses, or unsanitized errors

Acceptable evidence must stay redacted and classification-oriented rather than payload-oriented.

## Secret-Safety Review

Result: secret-safe.

This report includes only:

- boundary ownership statements
- proof-runtime requirements
- evidence classifications
- activation constraints

This report does not include:

- private networking coordinates
- service secrets
- tokens
- raw operator output
- raw provider or AI payloads

## Activation Boundary

This slice does not permit activation.

Conservative boundary result:

- `private_reachability_requirements_reviewed` is justified
- `target_environment_private_reachability_operator_proof_required` remains mandatory
- `activation_not_allowed_now` remains mandatory

This slice cannot conclude:

- `private_reachability_proven_for_activation`
- `activation_slice_allowed`
- `runtime_activation_allowed`

Even a future positive private reachability proof would still leave separate activation gates in place for:

- `productGate`
- `routeMode`
- coordinated `runtimeStatus`
- budget and metering
- rollback readiness

## Recommended Next Slice

`AI Assistant Budget and Metering Production Proof`

Why:

- no hard reachability-contract drift was found
- private reachability requirements are now reviewed and still correctly held behind operator proof
- the next missing activation-grade area after this review is productive budget, guard, ledger, metering, and reconciliation evidence

## Checks

Executed for this docs-only slice:

- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant-private-reachability-proof-2026-06-30.md`

Not executed:

- `pnpm validate`

Why skipped:

- only one docs-only Markdown file was added
- no code, tests, env, DB, worker, provider, or deployment contract changed
