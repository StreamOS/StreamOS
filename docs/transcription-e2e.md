# Transcription Job E2E Runbook

This runbook verifies the local backend path:

1. Docker Compose starts Redis, API Gateway, Automation Service, and
   `transcription-worker`.
2. The E2E helper seeds a Supabase auth user, creator, channel, and stream.
3. The helper calls `POST /api/webhooks/streams/ended`.
4. API Gateway returns `status=queued` and writes a BullMQ job to Redis.
5. `transcription-worker` consumes the job and calls Automation Service.
6. The worker upserts `content_jobs` from `running` to `done` or `failed`.

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
- Redis contains a BullMQ job in `streamos-transcription`.
- `content_jobs.status` becomes `done`.
- `content_jobs.result.transcript` contains the deterministic local E2E
  transcript.

## Rollout Gate

Before promoting a release candidate, run the bundled rollout gate instead of
calling this E2E helper manually:

```bash
pnpm rolloutcheck -- --env-file=.env.test
```

For deployed services, run the same gate with `--skip-docker`,
`--allow-hosted-e2e`, and the deployed API Gateway URL. This keeps the signed
webhook trigger, BullMQ worker consumption, Supabase `content_jobs` write, and
service health checks mandatory for rollout.

## Failure Path

```bash
pnpm e2e:transcription -- --expect=failed
```

The helper starts Compose with `TRANSCRIPTION_PROCESSOR_MODE=fail`, so the
Automation Service returns a controlled failure. Expected result:

- API Gateway still returns `status=queued`.
- The worker calls Automation Service and persists the failure.
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
