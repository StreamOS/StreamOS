create extension if not exists pgcrypto;

create type public.stream_platform as enum ('twitch', 'youtube', 'tiktok', 'kick');
create type public.connection_status as enum ('connected', 'expired', 'revoked', 'pending');

create table public.creators (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  handle text,
  niche text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creators_display_name_length check (char_length(display_name) between 1 and 120),
  constraint creators_handle_length check (handle is null or char_length(handle) between 2 and 80)
);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  platform public.stream_platform not null,
  external_channel_id text,
  display_name text not null,
  follower_count integer not null default 0 check (follower_count >= 0),
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channels_display_name_length check (char_length(display_name) between 1 and 160),
  constraint channels_creator_platform_external_unique unique (creator_id, platform, external_channel_id)
);

create table public.platform_connections (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete set null,
  platform public.stream_platform not null,
  provider_account_id text not null,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  connected_at timestamptz not null default now(),
  status public.connection_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_connections_provider_account_length check (char_length(provider_account_id) between 1 and 180),
  constraint platform_connections_creator_platform_account_unique unique (creator_id, platform, provider_account_id)
);

create table public.metrics_snapshots (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  platform public.stream_platform not null,
  captured_at timestamptz not null default now(),
  viewer_count integer not null default 0 check (viewer_count >= 0),
  follower_count integer not null default 0 check (follower_count >= 0),
  watch_time_minutes integer not null default 0 check (watch_time_minutes >= 0),
  revenue_cents integer not null default 0 check (revenue_cents >= 0),
  engagement_rate numeric(6, 4) check (engagement_rate is null or (engagement_rate >= 0 and engagement_rate <= 1)),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index creators_owner_id_idx on public.creators(owner_id);
create index channels_creator_id_idx on public.channels(creator_id);
create index channels_platform_idx on public.channels(platform);
create index platform_connections_creator_id_idx on public.platform_connections(creator_id);
create index platform_connections_channel_id_idx on public.platform_connections(channel_id);
create index metrics_snapshots_creator_captured_idx on public.metrics_snapshots(creator_id, captured_at desc);
create index metrics_snapshots_channel_captured_idx on public.metrics_snapshots(channel_id, captured_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger creators_set_updated_at
before update on public.creators
for each row execute function public.set_updated_at();

create trigger channels_set_updated_at
before update on public.channels
for each row execute function public.set_updated_at();

create trigger platform_connections_set_updated_at
before update on public.platform_connections
for each row execute function public.set_updated_at();

alter table public.creators enable row level security;
alter table public.channels enable row level security;
alter table public.platform_connections enable row level security;
alter table public.metrics_snapshots enable row level security;

create policy "Creators are visible to their owner"
on public.creators for select
to authenticated
using (owner_id = (select auth.uid()));

create policy "Creators can be inserted by their owner"
on public.creators for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy "Creators can be updated by their owner"
on public.creators for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "Creators can be deleted by their owner"
on public.creators for delete
to authenticated
using (owner_id = (select auth.uid()));

create policy "Creator channels are visible to their owner"
on public.channels for select
to authenticated
using (
  exists (
    select 1 from public.creators
    where creators.id = channels.creator_id
      and creators.owner_id = (select auth.uid())
  )
);

create policy "Creator channels can be inserted by their owner"
on public.channels for insert
to authenticated
with check (
  exists (
    select 1 from public.creators
    where creators.id = channels.creator_id
      and creators.owner_id = (select auth.uid())
  )
);

create policy "Creator channels can be updated by their owner"
on public.channels for update
to authenticated
using (
  exists (
    select 1 from public.creators
    where creators.id = channels.creator_id
      and creators.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.creators
    where creators.id = channels.creator_id
      and creators.owner_id = (select auth.uid())
  )
);

create policy "Creator channels can be deleted by their owner"
on public.channels for delete
to authenticated
using (
  exists (
    select 1 from public.creators
    where creators.id = channels.creator_id
      and creators.owner_id = (select auth.uid())
  )
);

create policy "Platform connections are visible to their owner"
on public.platform_connections for select
to authenticated
using (
  exists (
    select 1 from public.creators
    where creators.id = platform_connections.creator_id
      and creators.owner_id = (select auth.uid())
  )
);

create policy "Platform connections can be inserted by their owner"
on public.platform_connections for insert
to authenticated
with check (
  exists (
    select 1 from public.creators
    where creators.id = platform_connections.creator_id
      and creators.owner_id = (select auth.uid())
  )
);

create policy "Platform connections can be updated by their owner"
on public.platform_connections for update
to authenticated
using (
  exists (
    select 1 from public.creators
    where creators.id = platform_connections.creator_id
      and creators.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.creators
    where creators.id = platform_connections.creator_id
      and creators.owner_id = (select auth.uid())
  )
);

create policy "Metrics snapshots are visible to their owner"
on public.metrics_snapshots for select
to authenticated
using (
  exists (
    select 1 from public.creators
    where creators.id = metrics_snapshots.creator_id
      and creators.owner_id = (select auth.uid())
  )
);

create policy "Metrics snapshots can be inserted by their owner"
on public.metrics_snapshots for insert
to authenticated
with check (
  exists (
    select 1 from public.creators
    where creators.id = metrics_snapshots.creator_id
      and creators.owner_id = (select auth.uid())
  )
);
