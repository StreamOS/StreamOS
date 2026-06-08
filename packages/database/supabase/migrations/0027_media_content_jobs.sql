alter table public.content_jobs
add column if not exists started_at timestamptz,
add column if not exists completed_at timestamptz;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'content_jobs_job_type_check'
      and conrelid = 'public.content_jobs'::regclass
  ) then
    alter table public.content_jobs drop constraint content_jobs_job_type_check;
  end if;

  alter table public.content_jobs
  add constraint content_jobs_job_type_check
  check (job_type in ('transcription', 'repurposing', 'clip_scoring', 'title_generation'));

  if exists (
    select 1
    from pg_constraint
    where conname = 'content_jobs_type_check'
      and conrelid = 'public.content_jobs'::regclass
  ) then
    alter table public.content_jobs drop constraint content_jobs_type_check;
  end if;

  alter table public.content_jobs
  add constraint content_jobs_type_check
  check ("type" in ('transcription', 'repurposing', 'clip_scoring', 'title_generation'));

  if exists (
    select 1
    from pg_constraint
    where conname = 'content_jobs_status_check'
      and conrelid = 'public.content_jobs'::regclass
  ) then
    alter table public.content_jobs drop constraint content_jobs_status_check;
  end if;

  alter table public.content_jobs
  add constraint content_jobs_status_check
  check (status in ('pending', 'running', 'processing', 'done', 'completed', 'failed', 'cancelled'));
end;
$$;

create index if not exists content_jobs_user_status_idx
on public.content_jobs(user_id, status);

create index if not exists content_jobs_status_retry_count_idx
on public.content_jobs(status, retry_count);

revoke insert, update, delete on public.content_jobs from authenticated;

grant insert (
  user_id,
  stream_id,
  queue_job_id,
  job_type,
  payload
) on public.content_jobs to authenticated;

grant select on public.content_jobs to authenticated;
grant all on public.content_jobs to service_role;
