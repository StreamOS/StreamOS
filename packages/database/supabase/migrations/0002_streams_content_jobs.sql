alter table public.creators
add column if not exists user_id uuid;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'creators'
      and column_name = 'owner_id'
  ) then
    update public.creators
    set user_id = owner_id
    where user_id is null;
  end if;
end;
$$;

alter table public.creators
alter column user_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'creators_user_id_fkey'
      and conrelid = 'public.creators'::regclass
  ) then
    alter table public.creators
    add constraint creators_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'creators_id_user_id_unique'
      and conrelid = 'public.creators'::regclass
  ) then
    alter table public.creators
    add constraint creators_id_user_id_unique unique (id, user_id);
  end if;
end;
$$;

create or replace function public.sync_creator_user_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is null then
    new.user_id = new.owner_id;
  end if;

  if new.owner_id is null then
    new.owner_id = new.user_id;
  end if;

  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'creators'
      and column_name = 'owner_id'
  ) and not exists (
    select 1
    from pg_trigger
    where tgname = 'creators_sync_user_id'
      and tgrelid = 'public.creators'::regclass
  ) then
    create trigger creators_sync_user_id
    before insert or update on public.creators
    for each row execute function public.sync_creator_user_id();
  end if;
end;
$$;

alter table public.channels
add column if not exists user_id uuid;

update public.channels as channels
set user_id = creators.user_id
from public.creators as creators
where channels.creator_id = creators.id
  and channels.user_id is null;

alter table public.channels
alter column user_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'channels_id_user_id_unique'
      and conrelid = 'public.channels'::regclass
  ) then
    alter table public.channels
    add constraint channels_id_user_id_unique unique (id, user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'channels_creator_user_fkey'
      and conrelid = 'public.channels'::regclass
  ) then
    alter table public.channels
    add constraint channels_creator_user_fkey
    foreign key (creator_id, user_id)
    references public.creators(id, user_id) on delete cascade;
  end if;
end;
$$;

alter table public.platform_connections
add column if not exists user_id uuid;

update public.platform_connections as platform_connections
set user_id = creators.user_id
from public.creators as creators
where platform_connections.creator_id = creators.id
  and platform_connections.user_id is null;

alter table public.platform_connections
alter column user_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'platform_connections_creator_user_fkey'
      and conrelid = 'public.platform_connections'::regclass
  ) then
    alter table public.platform_connections
    add constraint platform_connections_creator_user_fkey
    foreign key (creator_id, user_id)
    references public.creators(id, user_id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'platform_connections_channel_user_fkey'
      and conrelid = 'public.platform_connections'::regclass
  ) then
    alter table public.platform_connections
    add constraint platform_connections_channel_user_fkey
    foreign key (channel_id, user_id)
    references public.channels(id, user_id) on delete set null (channel_id);
  end if;
end;
$$;

alter table public.metrics_snapshots
add column if not exists user_id uuid;

update public.metrics_snapshots as metrics_snapshots
set user_id = creators.user_id
from public.creators as creators
where metrics_snapshots.creator_id = creators.id
  and metrics_snapshots.user_id is null;

alter table public.metrics_snapshots
alter column user_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'metrics_snapshots_creator_user_fkey'
      and conrelid = 'public.metrics_snapshots'::regclass
  ) then
    alter table public.metrics_snapshots
    add constraint metrics_snapshots_creator_user_fkey
    foreign key (creator_id, user_id)
    references public.creators(id, user_id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'metrics_snapshots_channel_user_fkey'
      and conrelid = 'public.metrics_snapshots'::regclass
  ) then
    alter table public.metrics_snapshots
    add constraint metrics_snapshots_channel_user_fkey
    foreign key (channel_id, user_id)
    references public.channels(id, user_id) on delete cascade;
  end if;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create index if not exists creators_user_id_idx
on public.creators(user_id);

create index if not exists channels_user_creator_idx
on public.channels(user_id, creator_id);

create index if not exists channels_user_platform_idx
on public.channels(user_id, platform);

create index if not exists platform_connections_user_creator_idx
on public.platform_connections(user_id, creator_id);

create index if not exists platform_connections_user_channel_idx
on public.platform_connections(user_id, channel_id);

create index if not exists metrics_snapshots_user_creator_captured_idx
on public.metrics_snapshots(user_id, creator_id, captured_at desc);

create index if not exists metrics_snapshots_user_channel_captured_idx
on public.metrics_snapshots(user_id, channel_id, captured_at desc);

drop policy if exists "Creators are visible to their owner" on public.creators;
drop policy if exists "Creators can be inserted by their owner" on public.creators;
drop policy if exists "Creators can be updated by their owner" on public.creators;
drop policy if exists "Creators can be deleted by their owner" on public.creators;

drop policy if exists "Creator channels are visible to their owner" on public.channels;
drop policy if exists "Creator channels can be inserted by their owner" on public.channels;
drop policy if exists "Creator channels can be updated by their owner" on public.channels;
drop policy if exists "Creator channels can be deleted by their owner" on public.channels;

drop policy if exists "Platform connections are visible to their owner" on public.platform_connections;
drop policy if exists "Platform connections can be inserted by their owner" on public.platform_connections;
drop policy if exists "Platform connections can be updated by their owner" on public.platform_connections;

drop policy if exists "Metrics snapshots are visible to their owner" on public.metrics_snapshots;
drop policy if exists "Metrics snapshots can be inserted by their owner" on public.metrics_snapshots;

drop policy if exists "Creators are visible to their user" on public.creators;
drop policy if exists "Creators can be inserted by their user" on public.creators;
drop policy if exists "Creators can be updated by their user" on public.creators;
drop policy if exists "Creators can be deleted by their user" on public.creators;

drop policy if exists "Channels are visible to their user" on public.channels;
drop policy if exists "Channels can be inserted by their user" on public.channels;
drop policy if exists "Channels can be updated by their user" on public.channels;
drop policy if exists "Channels can be deleted by their user" on public.channels;

drop policy if exists "Platform connections are visible to their user" on public.platform_connections;
drop policy if exists "Platform connections can be inserted by their user" on public.platform_connections;
drop policy if exists "Platform connections can be updated by their user" on public.platform_connections;
drop policy if exists "Platform connections can be deleted by their user" on public.platform_connections;

drop policy if exists "Metrics snapshots are visible to their user" on public.metrics_snapshots;
drop policy if exists "Metrics snapshots can be inserted by their user" on public.metrics_snapshots;
drop policy if exists "Metrics snapshots can be deleted by their user" on public.metrics_snapshots;

create policy "Creators are visible to their user"
on public.creators for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Creators can be inserted by their user"
on public.creators for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Creators can be updated by their user"
on public.creators for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Creators can be deleted by their user"
on public.creators for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "Channels are visible to their user"
on public.channels for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Channels can be inserted by their user"
on public.channels for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Channels can be updated by their user"
on public.channels for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Channels can be deleted by their user"
on public.channels for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "Platform connections are visible to their user"
on public.platform_connections for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Platform connections can be inserted by their user"
on public.platform_connections for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Platform connections can be updated by their user"
on public.platform_connections for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Platform connections can be deleted by their user"
on public.platform_connections for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "Metrics snapshots are visible to their user"
on public.metrics_snapshots for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Metrics snapshots can be inserted by their user"
on public.metrics_snapshots for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Metrics snapshots can be deleted by their user"
on public.metrics_snapshots for delete
to authenticated
using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.creators to authenticated;
grant select, insert, update, delete on public.channels to authenticated;
grant select, insert, update, delete on public.platform_connections to authenticated;
grant select, insert, update, delete on public.metrics_snapshots to authenticated;

grant all on public.creators to service_role;
grant all on public.channels to service_role;
grant all on public.platform_connections to service_role;
grant all on public.metrics_snapshots to service_role;

create table public.streams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null,
  platform_stream_id text not null,
  started_at timestamptz,
  ended_at timestamptz,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint streams_id_user_id_unique unique (id, user_id),
  constraint streams_channel_user_fkey foreign key (channel_id, user_id)
    references public.channels(id, user_id) on delete cascade,
  constraint streams_platform_stream_id_length check (char_length(platform_stream_id) between 1 and 220),
  constraint streams_title_length check (title is null or char_length(title) <= 300),
  constraint streams_time_range_check check (ended_at is null or started_at is null or ended_at >= started_at),
  constraint streams_channel_platform_stream_unique unique (channel_id, platform_stream_id)
);

create table public.content_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stream_id uuid,
  queue_job_id text unique,
  job_type text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_jobs_id_user_id_unique unique (id, user_id),
  constraint content_jobs_stream_user_fkey foreign key (stream_id, user_id)
    references public.streams(id, user_id) on delete set null (stream_id),
  constraint content_jobs_queue_job_id_length check (queue_job_id is null or char_length(queue_job_id) between 1 and 220),
  constraint content_jobs_job_type_check check (job_type in ('transcription', 'clip_scoring', 'title_generation')),
  constraint content_jobs_status_check check (status in ('pending', 'running', 'done', 'failed'))
);

create index streams_user_channel_started_idx
on public.streams(user_id, channel_id, started_at desc);

create index streams_user_platform_stream_idx
on public.streams(user_id, platform_stream_id);

create index content_jobs_user_stream_created_idx
on public.content_jobs(user_id, stream_id, created_at desc);

create index content_jobs_user_status_updated_idx
on public.content_jobs(user_id, status, updated_at desc);

create trigger streams_set_updated_at
before update on public.streams
for each row execute function public.set_updated_at();

create trigger content_jobs_set_updated_at
before update on public.content_jobs
for each row execute function public.set_updated_at();

alter table public.streams enable row level security;
alter table public.content_jobs enable row level security;

create policy "Streams are visible to their user"
on public.streams for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Streams can be inserted by their user"
on public.streams for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Streams can be updated by their user"
on public.streams for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Streams can be deleted by their user"
on public.streams for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "Content jobs are visible to their user"
on public.content_jobs for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Content jobs can be inserted by their user"
on public.content_jobs for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Content jobs can be updated by their user"
on public.content_jobs for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Content jobs can be deleted by their user"
on public.content_jobs for delete
to authenticated
using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.streams to authenticated;
grant select, insert, update, delete on public.content_jobs to authenticated;
grant all on public.streams to service_role;
grant all on public.content_jobs to service_role;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    alter publication supabase_realtime add table public.content_jobs;
  end if;
exception
  when duplicate_object then null;
end;
$$;
