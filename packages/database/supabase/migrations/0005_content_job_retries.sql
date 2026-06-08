alter table public.content_jobs
add column if not exists retry_count integer not null default 0,
add column if not exists max_retries integer not null default 3,
add column if not exists last_retried_at timestamptz,
add column if not exists next_retry_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_jobs_retry_count_check'
      and conrelid = 'public.content_jobs'::regclass
  ) then
    alter table public.content_jobs
    add constraint content_jobs_retry_count_check
    check (retry_count >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_jobs_max_retries_check'
      and conrelid = 'public.content_jobs'::regclass
  ) then
    alter table public.content_jobs
    add constraint content_jobs_max_retries_check
    check (max_retries between 0 and 25);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_jobs_retry_count_limit_check'
      and conrelid = 'public.content_jobs'::regclass
  ) then
    alter table public.content_jobs
    add constraint content_jobs_retry_count_limit_check
    check (retry_count <= max_retries);
  end if;
end;
$$;

create index if not exists content_jobs_retry_due_idx
on public.content_jobs(status, next_retry_at, updated_at)
where status = 'failed';
