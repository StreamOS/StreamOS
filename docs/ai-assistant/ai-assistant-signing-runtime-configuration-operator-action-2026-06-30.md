# AI Assistant Signing Runtime Configuration Operator Action - 2026-06-30

## Purpose

This document defines the secret-safe operator action and evidence structure required to prepare later AI Assistant signing runtime configuration on `services/api-gateway` and `services/automation-service`.

This slice does not activate the AI Assistant. It does not open any product gate, does not change route mode, does not make any runtime productive, and does not prove same-RC binding.

Codex did not set secrets, did not mutate runtime configuration, and did not perform any live environment check for this document.

## Decision

- `operator_action_required`
- `runtime_signing_configuration_not_yet_proven`
- `activation_not_allowed_now`

## Starting Point

The current reviewed state remains:

- `api-gateway`: signing mode present `false`, value class `missing`, secret present `false`
- `automation-service`: signing mode present `false`, value class `missing`, secret present `false`
- both services are aligned only on absence, not on signing readiness
- owner-path parity is not proven
- same-RC binding across `release-gate-runner`, `api-gateway`, and `automation-service` is not proven
- activation remains blocked

Carry-forward boundary:

- signing configuration is server-only
- `apps/web` must not own these signing variables
- Vercel browser env for `apps/web` must not own these signing variables
- no `NEXT_PUBLIC_*` ownership is allowed

## Target State After Operator Action

The required target state after the operator action is:

- `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` is present on `services/api-gateway`
- `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` value class is `hmac_sha256` on `services/api-gateway`
- `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` is present on `services/api-gateway`
- `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` is present on `services/automation-service`
- `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` value class is `hmac_sha256` on `services/automation-service`
- `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` is present on `services/automation-service`
- both signing variables remain absent from `apps/web`
- both signing variables remain absent from Vercel browser-env ownership for `apps/web`
- no `NEXT_PUBLIC_AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE`
- no `NEXT_PUBLIC_AUTOMATION_ENTITLEMENT_ASSERTION_SECRET`

Even after that target state is reached, activation is still not allowed until separate evidence slices prove redacted signing presence, owner-path parity, and same-RC binding.

## Allowed Operator Actions

Allowed operator action is limited to server-side runtime configuration preparation:

- set `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` on `services/api-gateway` to `hmac_sha256`
- set `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE` on `services/automation-service` to `hmac_sha256`
- ensure `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` exists on `services/api-gateway`
- ensure `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` exists on `services/automation-service`
- keep both variables server-only
- preserve absence of both variables from `apps/web`
- preserve absence of both variables from Vercel browser env ownership for `apps/web`
- preserve absence of `NEXT_PUBLIC_*` variants
- collect only redacted evidence after the operator action is complete

## Forbidden Actions

The following actions remain forbidden:

- documenting, dumping, comparing, or logging any secret value
- printing full environment values
- printing private URLs or full internal hostnames
- storing screenshots with sensitive runtime data
- setting either signing variable in `apps/web`
- setting either signing variable in Vercel browser env for `apps/web`
- setting any `NEXT_PUBLIC_*` variant for these signing variables
- changing `productGate`
- changing `routeMode`
- marking Gateway or Automation runtime productive
- attempting AI Assistant runtime activation
- mounting a new route
- making any OpenAI call
- making any provider write
- treating local evidence as production activation approval

## Secret-Safe Evidence Checklist

After the operator action, allowed redacted evidence collection should prove only status, never values:

- Gateway signing mode present: `true`
- Gateway signing mode value class: `hmac_sha256`
- Gateway secret presence: `true`
- Automation signing mode present: `true`
- Automation signing mode value class: `hmac_sha256`
- Automation secret presence: `true`
- signing mode pairing: `aligned`
- signing secret presence parity: `aligned`
- signing owner-path parity: `aligned`, `misaligned`, or `unknown`
- web ownership: `absent`
- Vercel `apps/web` browser-env ownership: `absent`
- `NEXT_PUBLIC` exposure: `absent`
- activation status: `activation_not_allowed_now`

Allowed evidence forms:

- redacted presence booleans
- redacted value class labels
- redacted parity labels
- redacted owner-path status labels
- redacted runtime identity labels where already permitted by prior evidence policy

## Forbidden Evidence

The following evidence remains forbidden in docs, logs, reports, tests, and screenshots:

- secret values
- partial secret values
- raw environment dumps
- raw platform export payloads
- raw signing payloads
- raw request or response bodies
- raw prompts, raw contexts, or model responses
- private URLs
- full internal hostnames
- copied Railway, Vercel, or Supabase secret panels

## Service Ownership Matrix

| Surface                       | Allowed Ownership                                                                          | Required State                                     | Forbidden Ownership                                                          | Evidence Expectation                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| `services/api-gateway`        | `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE`, `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` | mode must be `hmac_sha256`; secret must be present | no disclosure outside server-only scope                                      | redacted mode-present, value-class, secret-present status |
| `services/automation-service` | `AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE`, `AUTOMATION_ENTITLEMENT_ASSERTION_SECRET` | mode must be `hmac_sha256`; secret must be present | no disclosure outside server-only scope                                      | redacted mode-present, value-class, secret-present status |
| `apps/web`                    | none                                                                                       | both signing variables absent                      | any direct ownership, any browser-safe exposure, any `NEXT_PUBLIC_*` variant | redacted absence evidence only                            |
| `release-gate-runner`         | none for signing ownership; separate runtime-binding proof role only                       | no signing ownership required for this slice       | do not use runner as justification for activation                            | separate same-RC binding evidence later                   |

## Expected Redacted Status Values After Successful Operator Action

- Gateway signing mode present: `true`
- Gateway signing mode value class: `hmac_sha256`
- Gateway secret presence: `true`
- Automation signing mode present: `true`
- Automation signing mode value class: `hmac_sha256`
- Automation secret presence: `true`
- Web ownership: `absent`
- `NEXT_PUBLIC` exposure: `absent`

These status values would still be configuration evidence only. They would not yet prove activation readiness.

## Blocker Catalog

- signing mode missing on either service
- signing mode mismatch between Gateway and Automation
- secret presence missing on either service
- secret ownership outside `services/api-gateway` or `services/automation-service`
- any secret value disclosure
- any Vercel or `apps/web` ownership
- any `NEXT_PUBLIC_*` exposure
- same-RC binding missing
- any attempted activation

## Follow-Up Boundary

This operator action slice is followed by evidence collection, not activation.

Required sequence:

1. `AI Assistant Signing Runtime Configuration Evidence Collection`
2. `AI Assistant Same RC Binding Evidence`

Only after those follow-up slices exist and remain secret-safe may a later review decide whether the runtime configuration is proven strongly enough for a separate activation-readiness assessment.

## Activation Boundary

This document does not authorize:

- runtime activation
- product gate opening
- route-mode transition
- productive runtime status
- productive downstream allowance

Mandatory result:

- `activation_not_allowed_now`

## Validation

- `git diff --check`
- `pnpm exec prettier --check docs/ai-assistant/ai-assistant-signing-runtime-configuration-operator-action-2026-06-30.md`

`pnpm validate` may be skipped for this slice because the change is docs-only and introduces no code, test, env, DB, worker, provider, or deployment mutation.
