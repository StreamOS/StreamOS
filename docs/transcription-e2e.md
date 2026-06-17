# Transcription Job E2E Runbook

This runbook verifies the local backend path:

1. Docker Compose starts Redis, API Gateway, Automation Service, and
   `stream-job-worker` plus `transcription-worker`.
2. The E2E helper seeds a Supabase auth user, creator, channel, and stream.
3. The helper calls `POST /api/webhooks/streams/ended`.
4. API Gateway returns `status=queued` and writes a normalized `stream.offline`
   media event to `streamos-media`.
5. `stream-job-worker` materializes the stream state and enqueues the canonical
   `transcription.trigger` job into `streamos-transcription`.
6. `transcription-worker` consumes the downstream job, calls Automation
   Service, and upserts `content_jobs` from `running` to `done` or `failed`.

## Local Supabase Prerequisites

```bash
cp .env.test.example .env.test
npx supabase init --workdir packages/database --yes
npx supabase start --workdir packages/database
npx supabase db reset --workdir packages/database --local
```

Paste the local keys printed by `supabase start` into `.env.test`.

Keep these values for local Docker E2E:

```dotenv
SUPABASE_URL=http://localhost:54321
SUPABASE_DOCKER_URL=http://host.docker.internal:54321
STREAMOS_E2E_MODE=true
TRANSCRIPTION_PROCESSOR_MODE=stub
```

`STREAMOS_E2E_MODE=true` is required before the Automation Service accepts the
local `stub` or `fail` transcription processor. Without it, the service uses
the real OpenAI-backed processor.

## Success Path

```bash
pnpm e2e:transcription
```

Expected result:

- API Gateway returns `status=queued`.
- Redis contains a BullMQ job in `streamos-media`.
- Redis contains a BullMQ job in `streamos-transcription`.
- `content_jobs.status` becomes `done`.
- `content_jobs.result.transcript` contains the deterministic local E2E
  transcript.

## Rollout Modes

For local troubleshooting, use the bundled local diagnostic instead of calling
the E2E helper manually:

```bash
pnpm rollout:check:local
```

This mode keeps the same hard queue/job invariants, but it is diagnostic only
and never counts as a promotable release gate.

For deployed services, run the production gate from the dedicated
`release-gate-runner` runtime, or another Railway runtime with the same
gate-required release-candidate snapshot, that can reach the private
Automation Service URL:

```bash
pnpm rollout:check:production -- \
  --api-gateway-url https://streamos-api-gateway.up.railway.app \
  --automation-service-url http://automation-service.railway.internal:8000
```

Only this production gate counts for rollout. A local failure caused by missing
Docker or a missing local `api-gateway` is acceptable as diagnosis, but not as
promotion evidence.

The runner must exist as its own Railway service in the target environment and
must be deployed from the same release-candidate commit as the services under
test. Generic helper shells such as `railway-function-shell*` are not valid
proof runtimes, and a stopped runner cannot produce a promotable gate result.

The hosted proof runtime must contain the current root `package.json`,
`scripts/rollout-check.cjs`, `scripts/check-deployment.cjs`,
`scripts/e2e-transcription-job.cjs`, and the required workspace sources. The
gate now fails early with `snapshot_not_proof_capable` if a selectively copied
runtime image cannot prove the release-candidate snapshot, the generated
runner-provenance marker, or the current gate-sequence contract.

## Failure Path

```bash
pnpm e2e:transcription -- --expect=failed
```

The helper starts Compose with `TRANSCRIPTION_PROCESSOR_MODE=fail`, so the
Automation Service returns a controlled failure. Expected result:

- API Gateway still returns `status=queued`.
- `stream-job-worker` still materializes the stream and enqueues the canonical
  downstream job.
- `transcription-worker` calls Automation Service and persists the failure.
- `content_jobs.status` becomes `failed`.
- `content_jobs.error_message` contains the automation-service failure.

## Useful Variants

Skip Docker when the services are already running:

```bash
pnpm e2e:transcription -- --skip-docker
```

Use a specific Docker-compatible CLI:

```bash
pnpm e2e:transcription -- --docker-bin="C:\Program Files\Docker\Docker\resources\bin\docker.exe"
```

Run against a hosted Supabase project intentionally:

```bash
pnpm e2e:transcription -- --env-file=.env --allow-hosted
```

Wait longer for slow local machines:

```bash
pnpm e2e:transcription -- --wait-ms=240000 --poll-ms=5000
```

## Troubleshooting

- `API Gateway did not return a queued job`: check `STREAM_EVENT_WEBHOOK_SECRET`
  and API Gateway logs with `pnpm infra:logs`.
- `content_jobs` stays missing: confirm the worker has
  `SUPABASE_DOCKER_URL=http://host.docker.internal:54321` and a service-role
  key.
- Worker writes `failed` unexpectedly: check `automation-service` logs. In stub
  mode, this usually means the service was not restarted with
  `STREAMOS_E2E_MODE=true`.
- Supabase FK errors: run `supabase db reset` so migrations `0001` through
  `0005` are applied.
