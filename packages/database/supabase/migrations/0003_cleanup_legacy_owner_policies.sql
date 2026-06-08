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

grant select, insert, update, delete on public.creators to authenticated;
grant select, insert, update, delete on public.channels to authenticated;
grant select, insert, update, delete on public.platform_connections to authenticated;
grant select, insert, update, delete on public.metrics_snapshots to authenticated;
grant select, insert, update, delete on public.streams to authenticated;
grant select, insert, update, delete on public.content_jobs to authenticated;

grant all on public.creators to service_role;
grant all on public.channels to service_role;
grant all on public.platform_connections to service_role;
grant all on public.metrics_snapshots to service_role;
grant all on public.streams to service_role;
grant all on public.content_jobs to service_role;
