alter table public.streams
add column if not exists provider public.stream_platform,
add column if not exists stream_id text,
add column if not exists game_name text,
add column if not exists viewer_peak integer,
add column if not exists status text default 'live';

update public.streams as streams
set
  provider = coalesce(streams.provider, channels.platform),
  stream_id = coalesce(streams.stream_id, streams.platform_stream_id),
  viewer_peak = coalesce(streams.viewer_peak, streams.peak_viewers),
  status = coalesce(
    streams.status,
    case
      when streams.ended_at is not null then 'ended'
      else 'live'
    end
  )
from public.channels as channels
where streams.channel_id = channels.id
  and streams.user_id = channels.user_id
  and (
    streams.provider is null
    or streams.stream_id is null
    or streams.viewer_peak is null
    or streams.status is null
  );

alter table public.streams
alter column provider set not null,
alter column stream_id set not null,
alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'streams_stream_id_length'
      and conrelid = 'public.streams'::regclass
  ) then
    alter table public.streams
    add constraint streams_stream_id_length
    check (stream_id is null or char_length(stream_id) between 1 and 220);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'streams_stream_id_match_check'
      and conrelid = 'public.streams'::regclass
  ) then
    alter table public.streams
    add constraint streams_stream_id_match_check
    check (stream_id = platform_stream_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'streams_game_name_length'
      and conrelid = 'public.streams'::regclass
  ) then
    alter table public.streams
    add constraint streams_game_name_length
    check (game_name is null or char_length(game_name) <= 180);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'streams_viewer_peak_check'
      and conrelid = 'public.streams'::regclass
  ) then
    alter table public.streams
    add constraint streams_viewer_peak_check
    check (viewer_peak is null or viewer_peak >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'streams_status_check'
      and conrelid = 'public.streams'::regclass
  ) then
    alter table public.streams
    add constraint streams_status_check
    check (status in ('live', 'updated', 'ended', 'published'));
  end if;
end;
$$;

create or replace function public.sync_stream_webhook_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stream_id is null and new.platform_stream_id is not null then
    new.stream_id = new.platform_stream_id;
  elsif new.platform_stream_id is null and new.stream_id is not null then
    new.platform_stream_id = new.stream_id;
  end if;

  if new.viewer_peak is null and new.peak_viewers is not null then
    new.viewer_peak = new.peak_viewers;
  elsif new.peak_viewers is null and new.viewer_peak is not null then
    new.peak_viewers = new.viewer_peak;
  end if;

  if new.status is null then
    new.status = case
      when new.ended_at is not null then 'ended'
      else 'live'
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists streams_sync_webhook_columns on public.streams;
create trigger streams_sync_webhook_columns
before insert or update on public.streams
for each row execute function public.sync_stream_webhook_columns();

create index if not exists streams_user_provider_status_started_idx
on public.streams(user_id, provider, status, started_at desc);

alter table public.content_jobs
add column if not exists channel_id uuid;

update public.content_jobs as content_jobs
set channel_id = streams.channel_id
from public.streams as streams
where content_jobs.stream_id = streams.id
  and content_jobs.user_id = streams.user_id
  and content_jobs.channel_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_jobs_channel_user_fkey'
      and conrelid = 'public.content_jobs'::regclass
  ) then
    alter table public.content_jobs
    add constraint content_jobs_channel_user_fkey
    foreign key (channel_id, user_id)
    references public.channels(id, user_id) on delete set null (channel_id);
  end if;
end;
$$;

create index if not exists content_jobs_user_channel_created_idx
on public.content_jobs(user_id, channel_id, created_at desc);

grant insert (
  user_id,
  stream_id,
  channel_id,
  queue_job_id,
  job_type,
  "type",
  payload
) on public.content_jobs to authenticated;

grant all on public.streams to service_role;
grant all on public.content_jobs to service_role;
