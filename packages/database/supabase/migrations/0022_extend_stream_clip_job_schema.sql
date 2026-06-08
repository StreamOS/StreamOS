alter table public.streams
add column if not exists peak_viewers integer,
add column if not exists average_viewers integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'streams_peak_viewers_check'
      and conrelid = 'public.streams'::regclass
  ) then
    alter table public.streams
    add constraint streams_peak_viewers_check
    check (peak_viewers is null or peak_viewers >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'streams_average_viewers_check'
      and conrelid = 'public.streams'::regclass
  ) then
    alter table public.streams
    add constraint streams_average_viewers_check
    check (average_viewers is null or average_viewers >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'streams_viewer_totals_check'
      and conrelid = 'public.streams'::regclass
  ) then
    alter table public.streams
    add constraint streams_viewer_totals_check
    check (
      peak_viewers is null
      or average_viewers is null
      or peak_viewers >= average_viewers
    );
  end if;
end;
$$;

create index if not exists streams_user_started_idx
on public.streams(user_id, started_at desc);

create index if not exists streams_user_peak_viewers_idx
on public.streams(user_id, peak_viewers desc nulls last, started_at desc);

alter table public.clips
add column if not exists clip_url text,
add column if not exists thumbnail_url text,
add column if not exists viral_score numeric,
add column if not exists duration_seconds integer;

update public.clips
set
  clip_url = coalesce(clip_url, source_url),
  viral_score = coalesce(viral_score, virality_score::numeric),
  duration_seconds = coalesce(
    duration_seconds,
    case
      when source_start_seconds is not null
        and source_end_seconds is not null
        and source_end_seconds >= source_start_seconds
      then ceiling(source_end_seconds - source_start_seconds)::integer
      else null
    end
  )
where clip_url is null
  or viral_score is null
  or duration_seconds is null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'clips_status_check'
      and conrelid = 'public.clips'::regclass
  ) then
    alter table public.clips
    drop constraint clips_status_check;
  end if;

  alter table public.clips
  add constraint clips_status_check
  check (
    status in (
      'pending',
      'draft',
      'queued',
      'rendering',
      'ready',
      'failed',
      'published'
    )
  );

  if not exists (
    select 1
    from pg_constraint
    where conname = 'clips_clip_url_length'
      and conrelid = 'public.clips'::regclass
  ) then
    alter table public.clips
    add constraint clips_clip_url_length
    check (clip_url is null or char_length(clip_url) <= 2048);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'clips_thumbnail_url_length'
      and conrelid = 'public.clips'::regclass
  ) then
    alter table public.clips
    add constraint clips_thumbnail_url_length
    check (thumbnail_url is null or char_length(thumbnail_url) <= 2048);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'clips_viral_score_check'
      and conrelid = 'public.clips'::regclass
  ) then
    alter table public.clips
    add constraint clips_viral_score_check
    check (viral_score is null or (viral_score >= 0 and viral_score <= 100));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'clips_duration_seconds_check'
      and conrelid = 'public.clips'::regclass
  ) then
    alter table public.clips
    add constraint clips_duration_seconds_check
    check (duration_seconds is null or duration_seconds >= 0);
  end if;
end;
$$;

alter table public.clips
alter column status set default 'pending';

create or replace function public.sync_clip_compatibility_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.clip_url is null and new.source_url is not null then
    new.clip_url = new.source_url;
  elsif new.source_url is null and new.clip_url is not null then
    new.source_url = new.clip_url;
  end if;

  if new.viral_score is null and new.virality_score is not null then
    new.viral_score = new.virality_score::numeric;
  elsif new.virality_score is null
    and new.viral_score is not null
    and new.viral_score between 1 and 100
  then
    new.virality_score = round(new.viral_score)::integer;
  end if;

  if new.duration_seconds is null
    and new.source_start_seconds is not null
    and new.source_end_seconds is not null
    and new.source_end_seconds >= new.source_start_seconds
  then
    new.duration_seconds =
      ceiling(new.source_end_seconds - new.source_start_seconds)::integer;
  end if;

  return new;
end;
$$;

drop trigger if exists clips_sync_compatibility_columns on public.clips;
create trigger clips_sync_compatibility_columns
before insert or update on public.clips
for each row execute function public.sync_clip_compatibility_columns();

create index if not exists clips_user_viral_score_idx
on public.clips(user_id, viral_score desc nulls last, updated_at desc);

create index if not exists clips_user_status_created_idx
on public.clips(user_id, status, created_at desc);

alter table public.content_jobs
add column if not exists "type" text;

update public.content_jobs
set "type" = job_type
where "type" is null;

create or replace function public.sync_content_job_type_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.job_type is null and new."type" is not null then
    new.job_type = new."type";
  elsif new."type" is null or new."type" is distinct from new.job_type then
    new."type" = new.job_type;
  end if;

  return new;
end;
$$;

drop trigger if exists content_jobs_sync_type_columns on public.content_jobs;
create trigger content_jobs_sync_type_columns
before insert or update on public.content_jobs
for each row execute function public.sync_content_job_type_columns();

alter table public.content_jobs
alter column "type" set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_jobs_type_check'
      and conrelid = 'public.content_jobs'::regclass
  ) then
    alter table public.content_jobs
    add constraint content_jobs_type_check
    check ("type" in ('transcription', 'clip_scoring', 'title_generation'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_jobs_type_job_type_match_check'
      and conrelid = 'public.content_jobs'::regclass
  ) then
    alter table public.content_jobs
    add constraint content_jobs_type_job_type_match_check
    check ("type" = job_type);
  end if;
end;
$$;

create index if not exists content_jobs_user_type_status_idx
on public.content_jobs(user_id, "type", status, updated_at desc);

grant insert (
  user_id,
  stream_id,
  queue_job_id,
  "type",
  payload
) on public.content_jobs to authenticated;

grant all on public.streams to service_role;
grant all on public.clips to service_role;
grant all on public.content_jobs to service_role;
