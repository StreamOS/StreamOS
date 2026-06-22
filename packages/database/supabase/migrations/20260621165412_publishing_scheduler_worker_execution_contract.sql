alter table public.content_publications
  add column if not exists schedule_execution_attempt_count integer not null default 0,
  add column if not exists schedule_execution_claimed_at timestamptz,
  add column if not exists schedule_execution_claimed_by text,
  add column if not exists schedule_execution_completed_at timestamptz,
  add column if not exists schedule_execution_error_code text,
  add column if not exists schedule_execution_error_message text,
  add column if not exists schedule_execution_last_attempt_at timestamptz,
  add column if not exists schedule_execution_max_retries integer not null default 3,
  add column if not exists schedule_execution_metadata jsonb not null default '{}'::jsonb,
  add column if not exists schedule_execution_next_attempt_at timestamptz,
  add column if not exists schedule_execution_queue_job_id text,
  add column if not exists schedule_execution_status text not null default 'idle';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publications_schedule_execution_status_check'
      and conrelid = 'public.content_publications'::regclass
  ) then
    alter table public.content_publications
      add constraint content_publications_schedule_execution_status_check
      check (
        schedule_execution_status in (
          'idle',
          'claimed',
          'queued',
          'failed_retryable',
          'failed_permanent',
          'canceled',
          'expired',
          'unknown'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publications_schedule_execution_attempt_count_check'
      and conrelid = 'public.content_publications'::regclass
  ) then
    alter table public.content_publications
      add constraint content_publications_schedule_execution_attempt_count_check
      check (schedule_execution_attempt_count >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publications_schedule_execution_max_retries_check'
      and conrelid = 'public.content_publications'::regclass
  ) then
    alter table public.content_publications
      add constraint content_publications_schedule_execution_max_retries_check
      check (schedule_execution_max_retries >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publications_schedule_execution_metadata_object_check'
      and conrelid = 'public.content_publications'::regclass
  ) then
    alter table public.content_publications
      add constraint content_publications_schedule_execution_metadata_object_check
      check (jsonb_typeof(schedule_execution_metadata) = 'object');
  end if;
end
$$;

create index if not exists content_publications_schedule_execution_due_idx
on public.content_publications(schedule_status, schedule_execution_status, scheduled_at_utc asc, schedule_execution_next_attempt_at asc, user_id);

drop function if exists public.claim_due_content_publication_executions(integer, text, integer);

create function public.claim_due_content_publication_executions(
  p_limit integer default 25,
  p_worker_id text default 'publishing-scheduler-worker',
  p_claim_timeout_ms integer default 300000
)
returns setof public.content_publications
language plpgsql
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  return query
  with candidate_rows as (
    select cp.id
    from public.content_publications cp
    where cp.publication_status in ('validated', 'failed_retryable')
      and cp.review_status_at_request = 'approved'
      and cp.schedule_status in ('scheduled', 'schedule_ready')
      and cp.scheduled_at_utc is not null
      and cp.scheduled_at_utc <= v_now
      and cp.schedule_canceled_at is null
      and cp.schedule_expired_at is null
      and cp.schedule_replaced_at is null
      and cp.schedule_execution_status in ('idle', 'failed_retryable')
      and (
        cp.schedule_execution_next_attempt_at is null
        or cp.schedule_execution_next_attempt_at <= v_now
      )
      and coalesce(cp.schedule_execution_attempt_count, 0) < coalesce(cp.schedule_execution_max_retries, 0)
    order by cp.scheduled_at_utc asc, cp.id asc
    limit greatest(coalesce(p_limit, 1), 1)
    for update skip locked
  )
  update public.content_publications cp
  set schedule_execution_attempt_count = coalesce(cp.schedule_execution_attempt_count, 0) + 1,
      schedule_execution_claimed_at = v_now,
      schedule_execution_claimed_by = p_worker_id,
      schedule_execution_completed_at = null,
      schedule_execution_error_code = null,
      schedule_execution_error_message = null,
      schedule_execution_last_attempt_at = v_now,
      schedule_execution_metadata = jsonb_strip_nulls(
        coalesce(cp.schedule_execution_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'claim_timeout_ms', p_claim_timeout_ms,
          'claimed_at', v_now,
          'claimed_by', p_worker_id,
          'queue_job_id', concat('publication-execution-', cp.id::text),
          'scheduler_worker_id', p_worker_id
        )
      ),
      schedule_execution_next_attempt_at = null,
      schedule_execution_queue_job_id = concat('publication-execution-', cp.id::text),
      schedule_execution_status = 'claimed',
      updated_at = v_now
  from candidate_rows
  where cp.id = candidate_rows.id
  returning cp.*;
end;
$$;

revoke execute on function public.claim_due_content_publication_executions(
  integer,
  text,
  integer
) from public, authenticated;

grant execute on function public.claim_due_content_publication_executions(
  integer,
  text,
  integer
) to service_role;
