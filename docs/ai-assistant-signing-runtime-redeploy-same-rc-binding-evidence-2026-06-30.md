# AI Assistant Signing Runtime Redeploy and Same-RC Binding Evidence - 2026-06-30

## Decision

Primary decisions:

- `runtime_redeploy_completed`
- `same_rc_binding_proven`
- `runtime_binding_proven`
- `activation_not_allowed_now`

Why:

- `api-gateway`, `automation-service`, and `release-gate-runner` were redeployed in Railway `production`
- all three running instances now expose the same non-secret `STREAMOS_RC_COMMIT_SHA`
- all three running instances report the same target environment
- all three running instances remain in the same Railway project and environment scope
- no activation switch was opened

No additional decision is granted for:

- `product_gate_opening_allowed_now`
- `route_mode_transition_allowed_now`
- `productive_runtime_status_allowed_now`
- `runtime_activation_allowed`

## Scope

This artifact records only:

- runtime redeploy completion for `api-gateway`
- runtime redeploy completion for `automation-service`
- runtime redeploy completion for `release-gate-runner`
- same-RC binding evidence across those three running instances
- same target-environment binding evidence across those three running instances

Not done:

- no `productGate` opening
- no `routeMode` transition
- no productive `runtimeStatus`
- no UI, DB, worker, provider, or OpenAI activation
- no secret disclosure
- no private URL or hostname disclosure
- no env dump

Collection timestamp:

- `2026-07-01T00:19:35+02:00`

## Target RC

Redacted target runtime marker:

```yaml
target_rc_sha: 011753c42cc2b0312bd5556ab5da25e873df19c5
target_environment: production
```

Source verification:

- GitHub `origin/main` was verified at `011753c42cc2b0312bd5556ab5da25e873df19c5` before the redeploy

## Redeploy Result

```yaml
runtime_redeploy:
  api_gateway:
    latest_deployment_status: success
    latest_deployment_created_at_utc: 2026-06-30T22:18:57.439Z
    redeployed_for_this_slice: true
  automation_service:
    latest_deployment_status: success
    latest_deployment_created_at_utc: 2026-06-30T22:18:57.188Z
    redeployed_for_this_slice: true
  release_gate_runner:
    latest_deployment_status: success
    latest_deployment_created_at_utc: 2026-06-30T22:18:57.175Z
    redeployed_for_this_slice: true
```

## Runtime Binding Evidence

This proof uses only server-side non-secret runtime markers from the three live Railway instances.

```yaml
runtime_binding_evidence:
  proof_marker_kind: server_only_runtime_env
  gateway_runtime_rc_sha_present: true
  automation_runtime_rc_sha_present: true
  release_gate_runner_runtime_rc_sha_present: true
  gateway_runtime_rc_sha_matches_target: true
  automation_runtime_rc_sha_matches_target: true
  release_gate_runner_runtime_rc_sha_matches_target: true
  same_rc_sha_across_runner_gateway_automation: true
  gateway_environment_matches_target: true
  automation_environment_matches_target: true
  release_gate_runner_environment_matches_target: true
  same_target_environment_across_runner_gateway_automation: true
  same_railway_project_scope_across_runner_gateway_automation: true
```

Observed redacted facts:

- `api-gateway` running instance returned the target RC marker and `production`
- `automation-service` running instance returned the target RC marker and `production`
- `release-gate-runner` running instance returned the target RC marker and `production`
- the three live instances returned the same Railway project scope marker

## Public Health Provenance Note

```yaml
gateway_public_health_runtime_provenance_headers_present: false
gateway_public_health_runtime_binding_provenance_ready: false
```

Interpretation:

- the public `api-gateway` `/health` response still returned `200 OK`
- the public `api-gateway` `/health` response still did not expose `x-streamos-runtime-*` headers during this collection
- this does not reopen the live same-RC result above because the current proof is bound to live server-only runtime markers instead
- a separate repo/runtime hardening follow-up remains appropriate if public-health provenance must again become an independent production-gate surface

## Fail-Closed Boundary

Current activation boundary remains:

```yaml
activation_boundary:
  product_gate_status: closed
  route_mode: disabled
  activation_allowed_now: false
```

Why this remains unchanged:

- this slice performed redeploy and evidence collection only
- no activation switch was changed in Railway or application logic
- existing gateway tests still validated the fail-closed AI Assistant route path locally

Core/internal automation endpoints remain unchanged:

- `/clips/analyze`
- `/repurposing/plan`
- `/transcriptions/process`

## Secret-Safety Review

```yaml
secret_safety_review:
  secrets_present: false
  tokens_present: false
  private_urls_present: false
  private_hostnames_present: false
  env_dump_present: false
  raw_payloads_present: false
  raw_errors_present: false
  review_result: secret_safe
```

## Remaining Blockers

This slice closed the redeploy and same-RC runtime-binding blockers only.

Separate blockers still remain:

- `productGate` is still intentionally closed
- `routeMode` is still intentionally disabled
- no productive `runtimeStatus` is allowed
- no productive AI Assistant downstream is enabled
- public `api-gateway` `/health` provenance headers are still absent
- activation remains forbidden

## Checks

Executed locally:

- `git diff --check`
- `pnpm --filter @streamos/api-gateway lint`
- `pnpm --filter @streamos/api-gateway test -- src/app.test.ts`
- `pnpm --filter @streamos/api-gateway build`
- `pnpm test:railway-audit`
- bundled Python 3.12: `python -m pytest services/automation-service`
- `pnpm exec prettier --check docs/deployment.md scripts/config/railway-env-whitelist.cjs scripts/railway-audit-core.test.cjs`

Executed against Railway `production`:

- source redeploy for `api-gateway`
- source redeploy for `automation-service`
- source redeploy for `release-gate-runner`
- redacted live runtime readback of RC SHA, environment, project scope, and service name

Not executed:

- `pnpm validate`

Why skipped:

- the local validation already covered the changed deployment docs, Railway audit contract, FastAPI runtime provenance path, and Gateway regression path directly
- the slice did not change DB schema, web UI, worker logic, or provider execution behavior
