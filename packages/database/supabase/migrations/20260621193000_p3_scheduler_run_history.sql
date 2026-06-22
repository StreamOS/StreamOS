do $$
begin
  if to_regclass('public.content_publication_scheduler_runs') is null then
    create table public.content_publication_scheduler_runs (
      id uuid primary key,
      scheduler_name text not null default 'publishing-scheduler-worker',
      worker_id text not null,
      run_status text not null default 'running',
      started_at timestamptz not null default now(),
      completed_at timestamptz,
      batch_size integer not null default 25,
      claim_timeout_ms integer not null default 300000,
      poll_interval_ms integer not null default 30000,
      scanned_count integer not null default 0,
      stale_claim_count integer not null default 0,
      due_claim_count integer not null default 0,
      queued_count integer not null default 0,
      recovered_count integer not null default 0,
      retryable_failed_count integer not null default 0,
      permanent_failed_count integer not null default 0,
      skipped_count integer not null default 0,
      stuck_claim_count integer not null default 0,
      last_attempt_at timestamptz,
      last_error_code text,
      last_error_message text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint content_publication_scheduler_runs_run_status_check
        check (
          run_status in (
            'running',
            'completed',
            'completed_with_warnings',
            'failed',
            'canceled',
            'unknown'
          )
        ),
      constraint content_publication_scheduler_runs_scheduler_name_check
        check (char_length(scheduler_name) between 1 and 220),
      constraint content_publication_scheduler_runs_worker_id_check
        check (char_length(worker_id) between 1 and 220),
      constraint content_publication_scheduler_runs_metadata_object_check
        check (jsonb_typeof(metadata) = 'object')
    );
  end if;
end
$$;

do $$
begin
  if to_regclass('public.content_publication_scheduler_run_attempts') is null then
    create table public.content_publication_scheduler_run_attempts (
      id uuid primary key default gen_random_uuid(),
      scheduler_run_id uuid not null,
      user_id uuid not null references auth.users(id) on delete cascade,
      content_publication_id uuid not null,
      attempt_kind text not null,
      attempt_status text not null,
      retryable boolean not null default false,
      stuck_claim boolean not null default false,
      attempt_count integer not null default 0,
      claimed_at timestamptz,
      claimed_by text,
      scheduled_at_utc timestamptz,
      next_attempt_at timestamptz,
      queue_job_id text,
      error_code text,
      error_message text,
      metadata jsonb not null default '{}'::jsonb,
      source text not null default 'publishing-scheduler-worker',
      created_at timestamptz not null default now(),
      constraint content_publication_scheduler_run_attempts_run_fkey
        foreign key (scheduler_run_id)
        references public.content_publication_scheduler_runs(id) on delete cascade,
      constraint content_publication_scheduler_run_attempts_publication_user_fkey
        foreign key (content_publication_id, user_id)
        references public.content_publications(id, user_id) on delete cascade,
      constraint content_publication_scheduler_run_attempts_attempt_kind_check
        check (attempt_kind in ('stale_claim', 'due_claim')),
      constraint content_publication_scheduler_run_attempts_attempt_status_check
        check (
          attempt_status in (
            'recovered',
            'queued',
            'retryable_failed',
            'permanent_failed',
            'skipped',
            'stuck_claim'
          )
        ),
      constraint content_publication_scheduler_run_attempts_source_length_check
        check (char_length(source) between 1 and 220),
      constraint content_publication_scheduler_run_attempts_error_code_length_check
        check (error_code is null or char_length(error_code) between 1 and 120),
      constraint content_publication_scheduler_run_attempts_error_message_length_check
        check (error_message is null or char_length(error_message) <= 4000),
      constraint content_publication_scheduler_run_attempts_claimed_by_length_check
        check (claimed_by is null or char_length(claimed_by) between 1 and 220),
      constraint content_publication_scheduler_run_attempts_queue_job_id_length_check
        check (queue_job_id is null or char_length(queue_job_id) between 1 and 220),
      constraint content_publication_scheduler_run_attempts_metadata_object_check
        check (jsonb_typeof(metadata) = 'object')
    );
  end if;
end
$$;

alter table public.content_publication_scheduler_runs enable row level security;
alter table public.content_publication_scheduler_run_attempts enable row level security;

create index if not exists content_publication_scheduler_runs_name_started_idx
on public.content_publication_scheduler_runs(scheduler_name, started_at desc);

create index if not exists content_publication_scheduler_runs_status_started_idx
on public.content_publication_scheduler_runs(run_status, started_at desc);

create index if not exists content_publication_scheduler_run_attempts_user_created_idx
on public.content_publication_scheduler_run_attempts(user_id, created_at desc);

create index if not exists content_publication_scheduler_run_attempts_run_created_idx
on public.content_publication_scheduler_run_attempts(scheduler_run_id, created_at desc);

create index if not exists content_publication_scheduler_run_attempts_publication_created_idx
on public.content_publication_scheduler_run_attempts(content_publication_id, created_at desc);

drop policy if exists "Scheduler runs are visible to their user" on public.content_publication_scheduler_runs;
drop policy if exists "Scheduler runs can be inserted by service role" on public.content_publication_scheduler_runs;
drop policy if exists "Scheduler run attempts are visible to their user" on public.content_publication_scheduler_run_attempts;
drop policy if exists "Scheduler run attempts can be inserted by service role" on public.content_publication_scheduler_run_attempts;

revoke insert, update, delete on public.content_publication_scheduler_runs from authenticated;
revoke insert, update, delete on public.content_publication_scheduler_run_attempts from authenticated;

grant all on public.content_publication_scheduler_runs to service_role;
grant all on public.content_publication_scheduler_run_attempts to service_role;
