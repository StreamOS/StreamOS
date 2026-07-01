# AI Assistant Product-Gate and Route-Mode State Machine - 2026-07-01

## Decision

Primary decision: `activation_not_allowed_now`

This document is docs-only and does not authorize:

- Product-Gate opening
- Route-Mode transition
- productive runtime status
- productive downstream enablement
- production deployment
- production-gate execution

## Purpose

This document defines the docs-only state machine for AI Assistant
`productGate` and `routeMode`.

It exists to make later slices testable against one explicit contract:

- which states exist
- which transitions are allowed
- which evidence is required per transition
- which operator gates block each transition
- which rollback path must exist before a transition can be attempted

## Related Documents

- Current readiness status:
  [ai-assistant-activation-readiness-status-consolidation-2026-07-01.md](./ai-assistant-activation-readiness-status-consolidation-2026-07-01.md)
- Deployment and proof-runtime boundaries:
  [deployment.md](./deployment.md)
- Production-gate trigger blocker:
  [production-gate-trigger-contract-design-audit-2026-07-01.md](./production-gate-trigger-contract-design-audit-2026-07-01.md)
- Earlier activation sequencing:
  [ai-assistant-activation-slice-planning-2026-06-30.md](./ai-assistant-activation-slice-planning-2026-06-30.md)

## Current Authoritative State

The current state remains:

- `activation_not_allowed_now`
- Product Gate: `closed`
- Route Mode: `disabled`
- Gateway runtime status: non-productive
- Automation runtime status: non-productive
- no productive AI Assistant downstream
- full Production-Gate blocked until a proof-safe trigger contract exists
- `release-gate-runner` remains proof-only and does not receive
  `STREAM_EVENT_WEBHOOK_SECRET`

The current `main` SHA referenced by the readiness consolidation is a repo-state
reference only. It must not be interpreted here as a deployed production
release candidate.

## Evidence Vocabulary

This state machine uses these evidence classes strictly:

| Evidence class           | Meaning                                                                                                      | What it does not mean                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `docs_ready`             | documentation exists and state/transition language is defined                                                | no runtime proof, no approval, no deployment proof        |
| `contract_ready`         | repo/docs contract shape is defined and consistent enough for later implementation or review                 | no operator approval, no target-runtime proof             |
| `operator_approved`      | an operator-owned decision exists for the named transition or gate                                           | no target-runtime proof, no production approval by itself |
| `target_runtime_proven`  | redacted evidence from the intended runtime boundary proves the relevant condition in the target environment | no full production-gate result by itself                  |
| `production_gate_proven` | the required production-gate proof ran from a proof-capable runtime and passed for the relevant gate scope   | no permission to expand beyond the proven scope           |

Rule:

- no state transition in this document implies activation unless the required
  operator gate and the required evidence class are both satisfied
- `operator_approved` is necessary but not sufficient for any productive AI
  Assistant behavior
- documented reachability is not target-runtime-proven reachability
- documented signing expectations are not target-runtime-proven signing parity

## Product-Gate States

| State                               | Purpose                                                                                                                      | Allowed runtime effect                                                      | Forbidden runtime effect                                                                                | Required evidence                                                                                                                                                                   | Operator-Gate | Rollback / close condition                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------- |
| `closed`                            | default fail-closed posture                                                                                                  | route remains closed to product activation semantics                        | no productive activation path, no user-visible opening semantics, no assumption of target-runtime proof | `docs_ready` only for the state definition; current deployed posture still needs separate proof if asserted                                                                         | no            | remain closed until a separate opening transition is operator-approved                             |
| `operator_approved_opening_pending` | records that an operator-approved opening decision exists but has not yet been executed as runtime state                     | documentation and operational sequencing may proceed                        | no runtime opening, no route-mode implication, no productive runtime implication                        | `contract_ready` plus `operator_approved` for opening and rollback procedure                                                                                                        | yes           | any missing proof, stale approval, or scope drift returns to `closed`                              |
| `open_for_internal_runtime_proof`   | permits a narrowly scoped internal runtime-proof window only after preconditions are satisfied                               | limited internal proof activity may be evaluated against the approved scope | no broad production access, no customer-facing activation, no bypass of budget/metering/guard proofs    | `operator_approved` plus `target_runtime_proven` for signing, same-RC binding, private reachability, and rollback readiness                                                         | yes           | any proof failure, guard failure, rollback trigger, or scope drift returns to `closed_by_rollback` |
| `open_for_limited_production`       | permits a later tightly bounded production-facing scope after internal proof and activation prerequisites are already proven | only the separately approved limited-production scope may run               | no unrestricted production launch, no secret-scope expansion, no proof-runtime bypass                   | `operator_approved`, `target_runtime_proven`, and the required activation-specific proofs; if the scope depends on the full production gate, it also needs `production_gate_proven` | yes           | any error budget breach, rollback trigger, or proof invalidation returns to `closed_by_rollback`   |
| `closed_by_rollback`                | explicit post-open fail-closed state after an operator-owned close or rollback action                                        | no productive activation path remains open                                  | no continued runtime proof, no residual open semantics                                                  | `operator_approved` for rollback execution plus operator-readable rollback evidence; target-runtime proof may be required for claims about the deployed close state                 | yes           | may return to `closed` as the steady default only after rollback evidence is recorded              |

## Route-Mode States

| State      | Purpose                                                                                               | Allowed runtime effect                                                         | Forbidden runtime effect                                                                      | Required evidence                                                                                                               | Operator-Gate | Rollback / close condition                                                |
| ---------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------- |
| `disabled` | default fail-closed route mode                                                                        | route remains non-active for productive AI Assistant execution                 | no downstream execution, no customer-serving mode, no implicit activation by deploy drift     | `docs_ready` for state definition; deployed-state claims still require separate proof                                           | no            | remain disabled until a separate transition is operator-approved          |
| `shadow`   | bounded observational mode intended for future non-productive comparison or instrumentation semantics | secret-safe non-productive observation only within the approved scope          | no user-visible activation, no productive downstream writes, no bypass of closed product gate | `contract_ready`; any actual runtime use also needs the matching Product-Gate state and operator approval                       | yes           | any ambiguity, drift, or missing rollback path returns to `disabled`      |
| `internal` | narrow internal-only route mode for operator-controlled runtime proof                                 | internal-only bounded requests within the separately approved proof scope      | no customer rollout, no broad production serving, no proof without private-boundary controls  | `operator_approved` plus `target_runtime_proven` for the approved internal scope                                                | yes           | any proof failure, rollback trigger, or scope drift returns to `disabled` |
| `limited`  | tightly constrained limited-production mode after internal proof succeeds                             | only the approved limited audience/scope may run                               | no full enablement, no operator-gate bypass, no missing-governance operation                  | `operator_approved`, `target_runtime_proven`, and any additional activation proofs required for the limited scope               | yes           | any rollback trigger or proof invalidation returns to `disabled`          |
| `enabled`  | later fully enabled route mode                                                                        | only possible after all required activation and governance proofs are complete | no use as a shortcut around production-gate obligations or downstream/operator requirements   | `operator_approved`; `target_runtime_proven`; if applicable `production_gate_proven`; all productive governance proofs complete | yes           | any rollback trigger returns to `disabled`                                |

## Product-Gate Transition Rules

Allowed Product-Gate transitions:

1. `closed -> operator_approved_opening_pending`
2. `operator_approved_opening_pending -> open_for_internal_runtime_proof`
3. `open_for_internal_runtime_proof -> open_for_limited_production`
4. `open_for_internal_runtime_proof -> closed_by_rollback`
5. `open_for_limited_production -> closed_by_rollback`
6. `closed_by_rollback -> closed`

Blocked Product-Gate transitions:

1. `closed -> open_for_internal_runtime_proof`
2. `closed -> open_for_limited_production`
3. `operator_approved_opening_pending -> open_for_limited_production`
4. any transition that skips rollback evidence once a rollback-triggered close occurred

Product-Gate transition evidence matrix:

| Transition                                                             | Minimum evidence class                                                                         | Additional required proofs                                                                                                                           | Operator-Gate required |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `closed -> operator_approved_opening_pending`                          | `operator_approved`                                                                            | named operator owner, explicit open/close procedure, explicit rollback condition                                                                     | yes                    |
| `operator_approved_opening_pending -> open_for_internal_runtime_proof` | `target_runtime_proven`                                                                        | redacted signing parity, same-RC binding, private reachability, rollback readiness, non-productive runtime coordination proof for the intended scope | yes                    |
| `open_for_internal_runtime_proof -> open_for_limited_production`       | `target_runtime_proven` and, where applicable, `production_gate_proven`                        | productive governance proofs, approved limited scope, no secret-scope expansion                                                                      | yes                    |
| `open_for_internal_runtime_proof -> closed_by_rollback`                | `operator_approved`                                                                            | operator-readable rollback evidence; deployed-state claims require redacted proof from target runtime                                                | yes                    |
| `open_for_limited_production -> closed_by_rollback`                    | `operator_approved`                                                                            | operator-readable rollback evidence; deployed-state claims require redacted proof from target runtime                                                | yes                    |
| `closed_by_rollback -> closed`                                         | `docs_ready` for the state model, plus operator evidence if asserting runtime close completion | closed rollback record remains attached to the prior opening scope                                                                                   | yes                    |

## Route-Mode Transition Rules

Allowed Route-Mode transitions:

1. `disabled -> shadow`
2. `shadow -> internal`
3. `internal -> limited`
4. `limited -> enabled`
5. `shadow -> disabled`
6. `internal -> disabled`
7. `limited -> disabled`
8. `enabled -> disabled`

Blocked Route-Mode transitions:

1. `disabled -> internal`
2. `disabled -> limited`
3. `disabled -> enabled`
4. `shadow -> limited`
5. `shadow -> enabled`
6. `internal -> enabled`

Route-Mode transition evidence matrix:

| Transition                   | Minimum evidence class                                                  | Additional required proofs                                                                                                  | Operator-Gate required |
| ---------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `disabled -> shadow`         | `operator_approved`                                                     | shadow semantics documented; no productive downstream effect; explicit rollback path to `disabled`                          | yes                    |
| `shadow -> internal`         | `target_runtime_proven`                                                 | matching Product-Gate state for internal proof, signing parity, same-RC binding, private reachability, runtime coordination | yes                    |
| `internal -> limited`        | `target_runtime_proven`                                                 | productive governance proofs complete for the limited scope; limited audience/scope defined                                 | yes                    |
| `limited -> enabled`         | `target_runtime_proven` and, where applicable, `production_gate_proven` | all productive governance proofs complete; no remaining blocker in consolidation                                            | yes                    |
| any `* -> disabled` rollback | `operator_approved`                                                     | operator-readable rollback evidence; target-runtime proof required only if asserting deployed rollback completion           | yes                    |

## Cross-State Constraints

These constraints always apply:

1. Product Gate and Route Mode must not be treated as interchangeable.
2. A more permissive Route Mode does not imply a more permissive Product Gate.
3. A more permissive Product Gate does not imply productive runtime status.
4. No state in this document overrides the requirement that Gateway and
   Automation runtime status stay coordinated.
5. No state in this document overrides the requirement that there is currently
   no productive AI Assistant downstream.
6. No state in this document changes the proof-only scope of
   `release-gate-runner`.
7. No state in this document authorizes adding provider, webhook, Redis, or
   gateway secret scope to `release-gate-runner`.

## Evidence Requirements That Still Block Productive Activation

The following remain required before any productive AI Assistant activation:

1. redacted target-runtime proof that documented private reachability is
   actually proven from the intended runtime boundary
2. redacted target-runtime proof that signing parity is real in the intended
   runtime
3. redacted target-runtime proof that same-RC binding across runner, gateway,
   and automation is real for the approved scope
4. operator-readable proof for budget mode, metering, rate guard, concurrency
   guard, and ledger behavior
5. coordinated runtime-status proof for Gateway and Automation
6. rollback evidence for any activation-capable transition

Important interpretation rules:

- documented reachability is not target-runtime-proven reachability
- documented signing expectations are not target-runtime-proven signing parity
- redacted target-runtime evidence is required before signing parity and
  same-RC binding are considered proof-capable
- local or docs-only evidence is not a production-gate result

## Full Production-Gate Dependency

The full Production-Gate remains blocked until a proof-safe trigger contract
exists.

Implications for this state machine:

- no transition in this document may imply that the full Production-Gate is
  already proven
- if a later transition depends on the full Production-Gate, that transition
  remains blocked until the proof-safe trigger contract is defined, approved,
  implemented, and proven in the correct scope
- `release-gate-runner` remains proof-only and does not receive
  `STREAM_EVENT_WEBHOOK_SECRET`

## Operator Gates

The following remain mandatory operator gates:

- Product-Gate opening
- Route-Mode transition
- runtime-status coordination
- target-runtime signing parity evidence acceptance
- target-runtime same-RC binding evidence acceptance
- target-runtime private reachability evidence acceptance
- productive budget, metering, rate, concurrency, and ledger evidence
- any production deployment or release-candidate deployment
- any full Production-Gate execution
- any real downstream activation
- any new secret or changed secret ownership scope
- any cost-intensive productive AI runtime path

## Rollback Rules

Before any transition beyond `closed` or `disabled` is attempted, the following
rollback rules must already be defined:

- Product Gate can return to `closed`
- Route Mode can return to `disabled`
- Gateway runtime status can return to non-productive
- Automation runtime status can return to non-productive
- productive downstream execution can be blocked again without depending on a
  browser path

Rollback evidence must remain secret-safe and operator-readable.

## Current Blocked Transitions

The following remain blocked now under the current readiness consolidation:

1. `closed -> operator_approved_opening_pending`
2. `operator_approved_opening_pending -> open_for_internal_runtime_proof`
3. `disabled -> shadow`
4. `shadow -> internal`
5. `internal -> limited`
6. `limited -> enabled`

Why they remain blocked:

- `activation_not_allowed_now` remains the current decision
- no Product-Gate opening approval exists
- no Route-Mode transition approval exists
- no productive downstream exists
- signing parity is not target-runtime-proven
- same-RC binding is not target-runtime-proven
- private reachability is not target-runtime-proven
- productive budget/metering/guard/ledger proofs are not complete
- the full Production-Gate remains blocked by the missing proof-safe trigger
  contract

## Next Safe Slice

The next safe slice after this document remains docs-only:

- redacted evidence planning or acceptance for one operator-reviewed runtime
  bundle, or
- docs-only architecture review for the proof-safe Production-Gate trigger
  contract

This document does not change the current runtime posture.

`activation_not_allowed_now` remains in force.
