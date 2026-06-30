# AI Assistant Runtime Activation Readiness Audit - 2026-06-30

## Decision

Decision: `blocked_for_runtime_activation`

Why:

- `/api/ai-assistant` is mounted and fail-closed, but the runtime is still intentionally non-productive.
- `productGate`, `routeMode`, and `runtimeStatus` are separated, yet there is no operator-proven activation path for opening them safely.
- No productive AI Assistant downstream endpoint exists in `services/automation-service`.
- Shared signing, private Gateway -> Automation reachability, usage-budget operation, and rollback evidence still require `operator_proof_required`.
- Local green route/contract tests are implementation evidence, not production activation proof.

## Scope

Reviewed on current `main` at `3fce288f5aa44d30f3c9b678573b0594a1aa1e63`.

Reviewed sources:

- `docs/architecture.md`
- `docs/deployment.md`
- `docs/ai-assistant-runtime-activation-audit-2026-06-29.md`
- `docs/ai-assistant-route-mount-readiness-audit-2026-06-29.md`
- `docs/p4-product-roadmap-update.md`
- `services/api-gateway/src/app.ts`
- `services/api-gateway/src/routes/aiAssistant.ts`
- `services/api-gateway/src/lib/ai-assistant-route-contract.ts`
- `services/api-gateway/src/lib/ai-assistant-route-observability.ts`
- `services/api-gateway/src/lib/ai-assistant-gateway-automation-contract.test.ts`
- `services/api-gateway/src/lib/ai-usage-admission.ts`
- `services/api-gateway/src/lib/ai-usage-context-issuance.ts`
- `services/api-gateway/src/lib/ai-usage-metering-reconciliation.ts`
- `services/automation-service/src/ai_usage_context_enforcement.py`
- `services/automation-service/src/ai_trusted_context_client.py`
- `services/automation-service/src/ai_guardrails.py`
- `services/automation-service/src/main.py`
- `services/automation-service/src/settings.py`

Not done:

- no runtime activation
- no code, env, DB, worker, UI, provider, or OpenAI change
- no live Railway, Vercel, Supabase, or OpenAI action
- no private-network probe

Note:

- `02_roadmap_and_next_slices.md` and `streamos_produkt_feature_roadmap.md` were not present on current `main`. `docs/p4-product-roadmap-update.md` was used as the available roadmap source.

## Current State

- `/api/ai-assistant` is mounted in the Gateway and protected by the shared app API secret middleware.
- The mounted route stays fail-closed by default:
  - `productGate=closed`
  - `routeMode=disabled`
  - Gateway admission `runtimeStatus=not_yet_productive`
  - Automation guardrail `runtime_status=not_yet_productive`
- Denials are secret-safe and observable through the AI Assistant observability contract.
- The shared Gateway -> Automation contract fixture covers issuance, signature validation, tenant/user/request binding, allowed `plan_source` values, mocked downstream behavior, metering reconciliation, and concurrency release.
- `plan_source` is aligned to `persisted_server_plan` and `server_verified_billing`.
- `/clips/analyze`, `/repurposing/plan`, and `/transcriptions/process` remain unchanged core/internal automation endpoints.
- No productive AI Assistant endpoint was found in `services/automation-service/src/main.py`.

## Readiness Matrix

| Area                              | Status  | Evidence                                                                                                            | Blocker                                                                                                                 | Required next proof                                                                            |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Route readiness                   | ready   | mounted route, shared API secret middleware, default closed route semantics                                         | none for docs-only audit                                                                                                | mounted-route behavior already covered locally; production remains separate                    |
| Fail-closed semantics             | ready   | `productGate=closed`, `routeMode=disabled`, `runtimeStatus=not_yet_productive`, Automation guardrail non-productive | none                                                                                                                    | operator proof that these defaults remain closed in target env                                 |
| Product gate readiness            | blocked | route supports `productGateStatus`, but only as router configuration                                                | no explicit operator-controlled gate opening contract or proof                                                          | `operator_proof_required` for gate owner, open procedure, close procedure, and audit evidence  |
| Route mode readiness              | blocked | only `disabled` and `test_only_mock` exist                                                                          | no productive route mode and no operator semantics for leaving `disabled`                                               | `operator_proof_required` for allowed mode transitions and rollback path                       |
| Runtime status readiness          | blocked | Gateway and Automation both still mark assistant non-productive                                                     | runtime switch is intentionally blocked in both runtimes                                                                | `operator_proof_required` for coordinated Gateway + Automation runtime status activation proof |
| Downstream readiness              | blocked | no productive AI Assistant endpoint in Automation main app                                                          | no productive downstream path exists                                                                                    | implement downstream contract first, then prove private reachability                           |
| Signing / usage context readiness | partial | HMAC-signed usage context path exists and is validated                                                              | shared signing mode/secret parity is not proven in target runtime                                                       | `operator_proof_required` for shared config parity without exposing values                     |
| Entitlement readiness             | partial | server-side trusted plan source set is aligned; server-side feature checks exist                                    | no activation-grade proof that server-side `ai_assistant` entitlement and budget policy are configured for live runtime | `operator_proof_required` for entitlement and budget policy activation evidence                |
| Usage / cost / abuse readiness    | partial | admission, Redis burst/concurrency guard, ledger reservation, usage context, metering, reconciliation exist         | budget mode defaults to `not_configured`; no live budget/cost operating proof                                           | `operator_proof_required` for active budget policy, guard health, and failure handling         |
| Observability readiness           | partial | secret-safe evidence classes exist and cover denial/issuance/metering/release phases                                | no assistant-specific operator read model or activation dashboard path                                                  | `operator_proof_required` for operator-readable activation and rollback evidence               |
| Rollback readiness                | partial | fail-closed switches exist in principle                                                                             | no documented activation rollback runbook/evidence contract                                                             | `operator_proof_required` for immediate close procedure and post-rollback evidence             |
| Deployment / env readiness        | partial | docs define relevant Gateway and Automation env names and private networking expectations                           | live env parity, private reachability, and proof-capable rollout context are not established by this audit              | `operator_proof_required` for target env verification                                          |

## Blockers

1. No productive AI Assistant downstream route or endpoint exists in `services/automation-service`.
2. No explicit operator-controlled product-gate opening contract was found; current open/closed state is a code-level router option, not activation-grade operator evidence.
3. `routeMode` has no productive mode today; leaving `disabled` would require a new bounded activation contract.
4. Gateway admission still defaults to `runtimeStatus=not_yet_productive`.
5. Automation guardrails still default to `runtime_status=not_yet_productive`.
6. Live budget mode is not activation-ready; Gateway admission defaults to `budgetMode=not_configured`.
7. Shared signing configuration between Gateway and Automation is not proven in the target runtime.
8. Private Gateway -> Automation reachability is documented as required, but not proven by any local check.
9. No assistant-specific operator read surface was found for activation/rollback evidence beyond emitted events.

## Warnings

- The route is mounted, but route presence must not be interpreted as runtime readiness.
- The synchronous trusted context client is not the primary blocker for route presence, but it remains a runtime concern because it is still a hot-path internal HTTP dependency.
- Shared API-secret middleware already protects the route. AI-assistant-specific auth evidence at that middleware layer is optional for route foundation, but recommended before activation if operators need explicit rejected-auth visibility for this feature.
- Local contract and route tests are useful implementation evidence only. They do not prove live env parity, private networking, or activation safety.

## Operator Proofs Required

- Proof that the target Gateway deployment keeps `/api/ai-assistant` protected by the shared API secret middleware.
- Proof that `productGate` can be opened only through a server-owned operator path and can be closed immediately without code changes.
- Proof that `routeMode` cannot leave `disabled` unintentionally and has a documented rollback path.
- Proof that Gateway and Automation switch runtime status in a coordinated way, or else remain fail-closed.
- Proof that Gateway and Automation share the same signing mode and, when required, the same signing secret configuration.
- Proof that Automation remains private and reachable only through the intended Railway-internal path.
- Proof that live budget policy, Redis guard health, ledger writes, metering reconciliation, and concurrency release are configured for activation.
- Proof that activation and rollback emit operator-readable, secret-safe evidence.
- Proof that no browser-visible env or UI path can open or bypass the gates.

## Raw Data Persistence Assessment

No persistence path was found in the reviewed AI Assistant route foundation for:

- raw prompt text
- full trusted-context payloads
- full resolved-context payloads
- raw model responses
- raw provider payloads
- raw OpenAI payloads
- secrets, tokens, or private URLs

Observed limitation:

- request data is still handled in memory for validation and bounded processing, but the reviewed AI Assistant ledger and observability paths remain secret-safe.

## Rollback Readiness

Immediate fail-closed rollback switches already exist in the current design:

- `productGate=closed`
- `routeMode=disabled`
- Gateway `runtimeStatus=not_yet_productive`
- Automation `runtime_status=not_yet_productive`
- shared API secret enforcement remains mandatory

What is still missing:

- a documented operator rollback sequence
- operator evidence that rollback prevented downstream execution
- activation-to-rollback traceability at the assistant-specific operator layer

## Deployment / Env Readiness

Relevant env names identified from current docs and settings, without values:

- Gateway:
  - `API_GATEWAY_SECRET`
  - `REDIS_URL`
  - `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE`
  - `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET`
- Automation:
  - `OPENAI_API_KEY`
  - `API_GATEWAY_URL`
  - `API_GATEWAY_SECRET`
  - `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE`
  - `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET`
  - model and timeout settings remain server-only runtime inputs

Required interpretation:

- env-name presence in docs is not activation proof
- private Automation reachability is `operator_proof_required`
- local diagnostics cannot count as production proof
- no new web, worker, or browser env should be required for a later activation slice

## Recommended Next Slice

Exactly one next safe slice:

`AI Assistant Activation Preflight Operator Gates`

That slice should stay non-productive and focus only on:

- defining the operator-owned `productGate` opening and rollback contract
- defining allowed `routeMode` transition semantics
- defining coordinated Gateway + Automation runtime status proof requirements
- defining signing/env parity checks
- defining private reachability proof requirements
- defining activation and rollback evidence requirements

It should not:

- activate runtime
- add UI
- add provider or OpenAI execution
- weaken fail-closed defaults

## Checks

Executed for this docs-only slice:

- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant-runtime-activation-readiness-audit-2026-06-30.md`

Not executed:

- `pnpm validate`

Why skipped:

- this slice adds exactly one docs-only Markdown file and does not touch code, contracts, env, DB, workers, or runtime behavior
