# Content Jobs E2E Runbook

This runbook verifies the full local path:

1. Docker Compose starts Redis, API Gateway, and `content-job-retry-worker`.
2. A failed `content_jobs` row is seeded in Supabase.
3. `/dashboard/jobs` shows the failed row live.
4. The Retry button releases the row.
5. The retry worker claims it, requeues it into BullMQ, and writes `pending`.
6. The dashboard receives the status change through Supabase Realtime.

## Recommended Safe Path: Local Supabase

Use this path when you do not want the E2E helper to create rows in the hosted
Supabase project.

Supabase local development runs through the Supabase CLI and a Docker-compatible
container runtime. The official flow is `supabase init` and `supabase start`;
the CLI prints local API URL, anon key, and service-role key after startup.

```bash
cp .env.test.example .env.test
npx supabase init --workdir packages/database --yes
npx supabase start --workdir packages/database
npx supabase db reset --workdir packages/database --local
```

Paste the local keys printed by `supabase start` into `.env.test`.
Keep `SUPABASE_URL=http://localhost:54321` for the host-side script and
`SUPABASE_DOCKER_URL=http://host.docker.internal:54321` for the retry worker
inside Docker.

On Windows, Docker Desktop can install the CLI at
`%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe`. The E2E
helper detects that path automatically; otherwise pass it explicitly with
`--docker-bin`.

Run the E2E path with the local env file:

```bash
pnpm e2e:jobs
```

or explicitly:

```bash
pnpm e2e:jobs -- --env-file=.env.test
```

## Hosted Supabase Path

Use this only when you intentionally want to create disposable E2E rows in the
hosted project. The helper blocks non-local Supabase URLs unless
`--allow-hosted` is passed.

## Prerequisites

- Docker Desktop, Podman, or another Docker-compatible CLI is available. If it is not in `PATH`, set `DOCKER_BIN` or pass `--docker-bin`.
- Selected env file contains:

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_DOCKER_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- `packages/database/supabase/migrations/0002_*` through `0005_*` have been applied to Supabase.
- Supabase Realtime publication includes `public.content_jobs`.
- At least one Supabase Auth user exists. To force a specific user, set `E2E_USER_ID=<auth-user-uuid>` in your shell.

For faster local feedback, set this in `.env.test` or root `.env` before
starting Compose:

```dotenv
CONTENT_JOB_RETRY_WORKER_POLL_INTERVAL_MS=5000
```

## Scripted Path With Manual UI Retry

Start the dashboard in one terminal:

```bash
pnpm --filter @streamos/web dev
```

Run the E2E helper in another terminal:

```bash
pnpm e2e:jobs
```

The script will:

- start `docker compose up -d redis api-gateway content-job-retry-worker`,
- create an exhausted failed `clip_scoring` `content_jobs` row,
- print the seeded job ID,
- pause while you open `/dashboard/jobs` and click `Retry`,
- poll Supabase until the retry worker changes the row to `pending` and assigns a `content-job-...-retry-N` BullMQ job ID.

Open:

```text
http://localhost:3000/dashboard/jobs
```

Expected UI behavior:

- the seeded job appears under `Failed`,
- clicking `Retry` redirects back with `status=retry-requested`,
- within one retry-worker polling interval the row moves to `Pending`,
- the retry counter increments,
- the queue job ID changes to `content-job-clip_scoring-<job-id>-retry-<n>`.

## Fully Scripted Backend Shortcut

Use this when you only want to verify Supabase -> retry worker -> BullMQ without clicking the UI:

```bash
pnpm e2e:jobs -- --auto-release
```

This simulates the same database mutation the Retry server action performs. It does not prove the button renders or submits; the component coverage for that lives in `DashboardSmoke.test.tsx`.

## Useful Variants

Skip Docker when Compose is already running:

```bash
pnpm e2e:jobs -- --skip-docker
```

Use a Docker-compatible CLI that is not in `PATH`:

```bash
pnpm e2e:jobs -- --docker-bin="C:\Program Files\Docker\Docker\resources\bin\docker.exe"
```

Use Podman:

```bash
pnpm e2e:jobs -- --docker-bin=podman
```

Run against a hosted Supabase project intentionally:

```bash
pnpm e2e:jobs -- --env-file=.env --allow-hosted
```

Seed a failed row and stop:

```bash
pnpm e2e:jobs -- --seed-only
```

Use a specific Supabase Auth user:

```bash
pnpm e2e:jobs -- --user-id=00000000-0000-0000-0000-000000000000
```

Wait longer for a 60-second worker interval:

```bash
pnpm e2e:jobs -- --wait-ms=240000 --poll-ms=10000
```

## Troubleshooting

- `No Docker-compatible CLI was found`: start Docker Desktop, set `DOCKER_BIN`, pass `--docker-bin`, install Podman, or rerun with `--skip-docker`.
- `No Supabase auth users found`: create a user in Supabase Auth or pass `--user-id`.
- Job stays `failed`: check `pnpm infra:logs` and confirm `SUPABASE_SERVICE_ROLE_KEY` is set in root `.env`.
- Job moves to `pending`, but UI does not update: confirm migration `0002_streams_content_jobs.sql` added `public.content_jobs` to `supabase_realtime`.
- Job is marked unretryable: inspect the seeded row payload. The retry worker validates `clip_scoring` payloads before queuing.

## References

- [Supabase Local Development](https://supabase.com/docs/guides/local-development)
- [Supabase CLI getting started](https://supabase.com/docs/guides/local-development/cli/getting-started)
