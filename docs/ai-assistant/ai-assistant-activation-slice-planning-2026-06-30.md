# AI Assistant Activation Slice Planning - 2026-06-30

## Decision

Primary decision: `activation_sequence_planned`

Additional decision: `proof_collection_required_before_activation`

Current activation state: `activation_not_allowed_now`

Why:

- `/api/ai-assistant` is mounted, but the route remains fail-closed.
- local preflight can produce at most `preflight_ready` and still returns `activationPermittedNow=false`
- operator proof categories are documented, but target-environment proof is still missing
- no productive AI Assistant downstream exists today
- `productive_activation` is not allowed by this planning slice

## Current State

Current verified state on `main` at `e1203462788699b03dba5b1935b1e7e64332ff69`:

- `/api/ai-assistant` is mounted in `services/api-gateway`
- `productGate=closed`
- `routeMode=disabled`
- Gateway `runtimeStatus=not_yet_productive`
- Automation `runtimeStatus=not_yet_productive`
- no productive AI Assistant downstream is configured
- local activation preflight is `localOnly=true`
- local activation preflight is `operatorProofRequired=true`
- local activation preflight does not permit activation now
- observability is secret-safe and operator-readable at the contract level

Additional repo facts used for this plan:

- route contract modes remain `disabled` and `test_only_mock`
- current core/internal automation endpoints remain `/clips/analyze`, `/repurposing/plan`, and `/transcriptions/process`
- browser and Vercel must not call the private Automation Service directly
- `02_roadmap_and_next_slices.md` and `streamos_produkt_feature_roadmap.md` are not present on current `main`
- `docs/p4-product-roadmap-update.md` is the available roadmap source

## Non-Goals

- activating runtime
- opening `productGate`
- transitioning `routeMode` out of `disabled`
- setting Gateway or Automation runtime status to productive
- adding UI
- adding a productive Automation downstream
- changing env, DB, workers, provider integration, Railway, Vercel, Supabase, or OpenAI behavior
- treating local tests as production or runtime proof

## Activation Boundary

This planning document separates future work into these slice types:

- `planning_only`: planning and sequencing only, no runtime change
- `proof_collection`: operator-readable evidence collection, no runtime change
- `contract_foundation`: code or contract preparation, still fail-closed
- `gate_transition`: controlled gate change with rollback, but not combined with other activation steps
- `limited_internal_activation`: narrow internal-only runtime activation with hard rollback and usage limits
- `productive_activation`: later product-grade activation step, not allowed now
- `ui_exposure`: later user-visible surface, only after backend and runtime are already proven safe

Boundary rules for this sequence:

- no single slice may perform full activation
- no local-only proof may count as target-environment proof
- no slice may treat mounted route presence as activation readiness
- no slice may bypass server-owned entitlement, rate, concurrency, ledger, metering, or rollback controls

## Required Sequence

| Order | Slice Name                                                | Type                          | Allowed to Change Runtime? | Required Operator Proof                                | Blocks If Missing                                     | Rollback Requirement                              |
| ----- | --------------------------------------------------------- | ----------------------------- | -------------------------- | ------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------- |
| 1     | `AI Assistant Activation Proof Collection Report`         | `proof_collection`            | no                         | existing operator proof artifacts only                 | incomplete or missing proof bundle                    | not applicable; reporting only                    |
| 2     | `AI Assistant Signing Parity Verification`                | `proof_collection`            | no                         | signing mode parity and secret-owner-path parity       | any signing ambiguity or target-env mismatch          | retain fail-closed state                          |
| 3     | `AI Assistant Private Reachability Proof`                 | `proof_collection`            | no                         | Railway-internal reachability evidence                 | no target-runtime private reachability proof          | retain fail-closed state                          |
| 4     | `AI Assistant Budget and Metering Production Proof`       | `proof_collection`            | no                         | budget, rate, concurrency, ledger, metering evidence   | any missing productive usage-governance proof         | retain fail-closed state                          |
| 5     | `AI Assistant Automation Downstream Contract Foundation`  | `contract_foundation`         | no                         | proofs 1-4 complete                                    | no safe downstream contract basis                     | downstream remains non-productive                 |
| 6     | `AI Assistant Product Gate Controlled Opening`            | `gate_transition`             | yes, gate only             | proofs 1-5 complete plus rollback proof                | no operator-owned open/close evidence                 | immediate return to `productGate=closed`          |
| 7     | `AI Assistant Route Mode Limited Transition`              | `gate_transition`             | yes, route mode only       | proofs 1-6 complete                                    | no bounded route-mode transition proof                | immediate return to `routeMode=disabled`          |
| 8     | `AI Assistant Runtime Status Limited Internal Activation` | `limited_internal_activation` | yes, internal-only         | proofs 1-7 complete                                    | no coordinated runtime-status proof or rollback proof | immediate return to non-productive runtime status |
| 9     | `AI Assistant UI MVP`                                     | `ui_exposure`                 | no direct runtime change   | backend and limited internal activation already proven | any backend or entitlement gap                        | UI must degrade cleanly without activation        |

## Slice Details

### 1. `AI Assistant Activation Proof Collection Report`

Goal:
collect existing operator-readable proof artifacts and classify them without generating new live proof.

Scope:

- docs-only report
- summarize already available operator evidence
- classify outcome as `proofs_complete`, `proofs_incomplete`, or `blocked`

Out of Scope:

- live Railway, Vercel, Supabase, Automation, or OpenAI checks
- runtime activation
- code changes

Required Proofs:

- existing product gate ownership evidence
- existing route-mode transition evidence
- existing runtime coordination evidence
- existing signing, reachability, budget, and rollback evidence

Validation:

- `git diff --check`
- `pnpm exec prettier --check` on the new report

Operator Gate:

- `operator_proof_required`

Exit Criteria:

- one secret-safe report exists
- missing proofs are explicitly listed
- no activation permission is inferred

### 2. `AI Assistant Signing Parity Verification`

Goal:
prove that Gateway and Automation use compatible assertion-signing semantics in the target environment without exposing secrets.

Scope:

- operator-guided parity verification plan or report
- shared interpretation of signing mode and secret ownership path

Out of Scope:

- changing signing mode
- printing secret values or signatures
- runtime activation

Required Proofs:

- Gateway signing mode evidence
- Automation signing mode evidence
- same-owner-path evidence if HMAC is enabled later

Validation:

- docs-only checks for a planning/report slice
- any later live parity probe must be operator-run and secret-safe

Operator Gate:

- `gateway_automation_signing_parity`

Exit Criteria:

- parity is classified as compatible or blocked
- no secret material appears in artifacts

### 3. `AI Assistant Private Reachability Proof`

Goal:
prove that the private Automation Service is reachable only from the intended internal runtime boundary.

Scope:

- operator proof from Railway-internal or proof-capable runtime context
- secret-safe reachability evidence

Out of Scope:

- browser or Vercel path
- local shell diagnostic counted as production proof
- private URLs in the report

Required Proofs:

- proof source from intended runtime boundary
- proof that Automation remains private
- proof that Vercel and browser code are not used for this path

Validation:

- docs-only checks for the planning/report slice
- any live check must be operator-run, target-boundary, and secret-safe

Operator Gate:

- `private_gateway_to_automation_reachability`

Exit Criteria:

- proof clearly states reachable from correct boundary
- report excludes private endpoints and raw connection details

### 4. `AI Assistant Budget and Metering Production Proof`

Goal:
prove productive readiness of budget mode, rate guard, concurrency guard, ledger, metering, and reconciliation.

Scope:

- operator-readable proof of productive governance readiness
- tenant-safe and secret-safe evidence only

Out of Scope:

- OpenAI cost execution unless a later operator slice explicitly allows it
- public UI exposure
- runtime activation

Required Proofs:

- `budget_mode_productive_ready`
- `rate_guard_ready`
- `concurrency_guard_ready`
- `ledger_metering_ready`
- rollback compatibility evidence for usage governance

Validation:

- docs-only checks for the planning/report slice
- any later production-like proof must avoid raw payloads and cross-tenant data

Operator Gate:

- budget and metering operator proof set

Exit Criteria:

- evidence shows deny-safe and reconcile-safe behavior
- local implementation evidence is clearly separated from target proof

### 5. `AI Assistant Automation Downstream Contract Foundation`

Goal:
prepare the first productive downstream contract shape without activating it.

Scope:

- code or contract foundation in `services/automation-service`
- private Automation ownership preserved
- no visible chat or UI scope

Out of Scope:

- productive runtime
- public route launch
- browser-to-Automation path

Required Proofs:

- slices 1-4 complete
- operator proof that downstream remains private and non-productive during the slice

Validation:

- automation and gateway contract tests
- gateway lint, test, build
- automation tests

Operator Gate:

- proofs complete before code slice starts

Exit Criteria:

- productive downstream contract exists only as fail-closed foundation
- no runtime activation is introduced

### 6. `AI Assistant Product Gate Controlled Opening`

Goal:
introduce a separately reviewed, operator-controlled opening of `productGate`.

Scope:

- gate-opening contract only
- explicit close path
- auditability and rollback evidence

Out of Scope:

- `routeMode` transition
- productive runtime-status change
- UI

Required Proofs:

- slices 1-5 complete
- rollback proof available
- operator-owned open and close procedure confirmed

Validation:

- gateway tests around gate semantics
- gateway lint, test, build

Operator Gate:

- `product_gate_operator_approval`

Exit Criteria:

- gate can be opened and closed deliberately
- closing back to `closed` is immediate and auditable

### 7. `AI Assistant Route Mode Limited Transition`

Goal:
add a separately reviewed, bounded route-mode transition after product-gate proof exists.

Scope:

- route-mode transition only
- rollback to `disabled`
- bounded behavior semantics

Out of Scope:

- productive runtime-status change
- public product launch
- UI

Required Proofs:

- slices 1-6 complete
- operator proof that route-mode transition is bounded and reversible

Validation:

- gateway route and contract tests
- gateway lint, test, build

Operator Gate:

- `route_mode_transition_approval`

Exit Criteria:

- route mode can change without implying productive runtime
- rollback to `disabled` is immediate

### 8. `AI Assistant Runtime Status Limited Internal Activation`

Goal:
allow a narrow internal-only runtime activation after all prior gates and proofs are complete.

Scope:

- internal or test-limited runtime activation only
- hard budget, usage, observability, and rollback limits
- no autonomous provider write

Out of Scope:

- public product launch
- UI launch
- broad customer activation

Required Proofs:

- slices 1-7 complete
- coordinated Gateway and Automation runtime-status proof
- rollback evidence ready before the slice starts

Validation:

- gateway tests
- automation tests
- gateway lint, test, build
- any target-environment validation must be operator-run and secret-safe

Operator Gate:

- `runtime_status_coordination`
- rollback readiness proof

Exit Criteria:

- internal-only runtime path is bounded
- immediate return to non-productive state is proven
- no public launch semantics are introduced

### 9. `AI Assistant UI MVP`

Goal:
add a later user-visible surface only after backend contract safety and limited internal activation are already proven.

Scope:

- UI affordance
- upgrade communication
- fail-closed disabled states

Out of Scope:

- browser OpenAI calls
- browser-owned entitlement decisions
- backend gate bypass

Required Proofs:

- slices 1-8 complete
- backend entitlement and activation boundaries already proven

Validation:

- web lint, test, build
- gateway validation if API shape changes

Operator Gate:

- backend remains source of truth

Exit Criteria:

- UI does not imply runtime readiness on its own
- upgrade or unavailable states remain safe and explicit

## Forbidden Combined Changes

The following must not be combined into a single slice:

- `productGate` opening plus `routeMode` activation
- `routeMode` activation plus productive runtime-status change
- Automation downstream introduction plus UI exposure
- OpenAI cost path plus public UI launch
- env, signing, or private-networking change plus code activation without proof
- product launch plus runtime activation

## Secret-Safety Rules

- no secret values
- no tokens
- no private URLs
- no signatures
- no raw entitlement assertions
- no raw prompts
- no raw trusted-context or resolved-context payloads
- no raw model responses
- no raw provider payloads
- no raw OpenAI payloads
- no raw unsanitized errors
- no cross-tenant evidence beyond minimal safe operator metadata

## Rollback Planning

Every activation-capable slice must define rollback before any runtime-affecting change is allowed.

Required rollback boundaries:

- `productGate` can return to `closed`
- `routeMode` can return to `disabled`
- Gateway runtime status can return to `not_yet_productive`
- Automation runtime status can return to `not_yet_productive`
- productive downstream execution can be blocked again without UI dependency

Rollback rules:

- rollback evidence must be operator-readable and secret-safe
- rollback must be separable from UI
- rollback must not depend on browser behavior
- rollback proof must exist before limited internal activation is attempted

## Recommended Immediate Next Slice

`AI Assistant Activation Proof Collection Report`

That next slice should remain docs-only and should do only this:

- collect existing operator proofs
- classify them as complete, incomplete, or blocked
- keep runtime, gates, route mode, and UI unchanged
