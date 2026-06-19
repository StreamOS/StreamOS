alter table public.content_jobs
add column if not exists review_status text not null default 'needs_review',
add column if not exists reviewer_notes text not null default '',
add column if not exists reviewed_by uuid,
add column if not exists reviewed_at timestamptz;

update public.content_jobs
set
  review_status = coalesce(review_status, 'needs_review'),
  reviewer_notes = coalesce(reviewer_notes, '')
where review_status is null
   or reviewer_notes is null;

alter table public.content_jobs
alter column review_status set default 'needs_review',
alter column reviewer_notes set default '',
alter column review_status set not null,
alter column reviewer_notes set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'content_jobs_review_status_check'
      and conrelid = 'public.content_jobs'::regclass
  ) then
    alter table public.content_jobs drop constraint content_jobs_review_status_check;
  end if;

  alter table public.content_jobs
  add constraint content_jobs_review_status_check
  check (review_status in ('needs_review', 'approved', 'rejected', 'needs_changes'));
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_jobs_reviewed_by_fkey'
      and conrelid = 'public.content_jobs'::regclass
  ) then
    alter table public.content_jobs
    add constraint content_jobs_reviewed_by_fkey
    foreign key (reviewed_by)
    references auth.users(id) on delete set null;
  end if;
end;
$$;

create index if not exists content_jobs_user_review_status_updated_idx
on public.content_jobs(user_id, review_status, updated_at desc);

create table if not exists public.content_job_review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_job_id uuid not null,
  previous_review_status text,
  review_status text not null,
  reviewer_notes text not null default '',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint content_job_review_events_content_job_user_fkey
    foreign key (content_job_id, user_id)
    references public.content_jobs(id, user_id) on delete cascade,
  constraint content_job_review_events_review_status_check
    check (review_status in ('needs_review', 'approved', 'rejected', 'needs_changes')),
  constraint content_job_review_events_previous_review_status_check
    check (
      previous_review_status is null
      or previous_review_status in ('needs_review', 'approved', 'rejected', 'needs_changes')
    )
);

alter table public.content_job_review_events enable row level security;

create index if not exists content_job_review_events_user_job_created_idx
on public.content_job_review_events(user_id, content_job_id, created_at desc);

drop policy if exists "Content job review events are visible to their user" on public.content_job_review_events;

create policy "Content job review events are visible to their user"
on public.content_job_review_events for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

grant select on public.content_job_review_events to authenticated;
grant all on public.content_job_review_events to service_role;

drop function if exists public.record_content_job_review(
  uuid,
  uuid,
  text,
  text,
  uuid,
  timestamptz
);

create function public.record_content_job_review(
  p_content_job_id uuid,
  p_user_id uuid,
  p_review_status text,
  p_reviewer_notes text,
  p_reviewed_by uuid,
  p_reviewed_at timestamptz default now()
)
returns public.content_jobs
language plpgsql
set search_path = ''
as $$
declare
  v_existing_job public.content_jobs%rowtype;
  v_updated_job public.content_jobs%rowtype;
  v_review_notes text := coalesce(btrim(p_reviewer_notes), '');
begin
  if p_review_status not in ('needs_review', 'approved', 'rejected', 'needs_changes') then
    raise exception 'invalid_review_status'
      using errcode = '22023';
  end if;

  select *
  into v_existing_job
  from public.content_jobs
  where id = p_content_job_id
    and user_id = p_user_id
    and job_type = 'repurposing'
    and type = 'repurposing'
  for update;

  if not found then
    raise exception 'content_job_not_found'
      using errcode = 'P0002';
  end if;

  update public.content_jobs
  set
    review_status = p_review_status,
    reviewer_notes = v_review_notes,
    reviewed_by = p_reviewed_by,
    reviewed_at = p_reviewed_at,
    updated_at = now()
  where id = p_content_job_id
    and user_id = p_user_id
  returning * into v_updated_job;

  insert into public.content_job_review_events (
    content_job_id,
    previous_review_status,
    review_status,
    reviewed_at,
    reviewed_by,
    reviewer_notes,
    user_id
  ) values (
    v_updated_job.id,
    v_existing_job.review_status,
    v_updated_job.review_status,
    v_updated_job.reviewed_at,
    v_updated_job.reviewed_by,
    v_updated_job.reviewer_notes,
    v_updated_job.user_id
  );

  return v_updated_job;
end;
$$;

revoke execute on function public.record_content_job_review(
  uuid,
  uuid,
  text,
  text,
  uuid,
  timestamptz
) from public, authenticated;

grant execute on function public.record_content_job_review(
  uuid,
  uuid,
  text,
  text,
  uuid,
  timestamptz
) to service_role;
