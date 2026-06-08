alter type public.connection_status add value if not exists 'degraded';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'platform_connections_id_user_id_unique'
      and conrelid = 'public.platform_connections'::regclass
  ) then
    alter table public.platform_connections
    add constraint platform_connections_id_user_id_unique unique (id, user_id);
  end if;
end $$;

create table if not exists public.youtube_websub_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_connection_id uuid not null references public.platform_connections(id) on delete cascade,
  youtube_channel_id text not null,
  topic_url text not null,
  status text not null default 'pending',
  lease_seconds integer not null,
  subscribed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_renewed_at timestamptz,
  failed_renewals integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint youtube_websub_subscriptions_id_user_id_unique unique (id, user_id),
  constraint youtube_websub_subscriptions_connection_topic_unique unique (channel_connection_id, topic_url),
  constraint youtube_websub_subscriptions_connection_user_fkey foreign key (channel_connection_id, user_id)
    references public.platform_connections(id, user_id) on delete cascade,
  constraint youtube_websub_subscriptions_channel_id_length check (char_length(youtube_channel_id) between 1 and 180),
  constraint youtube_websub_subscriptions_topic_url_length check (char_length(topic_url) between 1 and 500),
  constraint youtube_websub_subscriptions_status_check check (
    status in ('pending', 'active', 'expired', 'failed', 'unsubscribed')
  ),
  constraint youtube_websub_subscriptions_lease_seconds_check check (
    lease_seconds > 0 and lease_seconds <= 864000
  ),
  constraint youtube_websub_subscriptions_failed_renewals_check check (failed_renewals >= 0)
);

create trigger youtube_websub_subscriptions_set_updated_at
before update on public.youtube_websub_subscriptions
for each row execute function public.set_updated_at();

create index if not exists youtube_websub_subscriptions_user_status_expires_idx
on public.youtube_websub_subscriptions(user_id, status, expires_at);

create index if not exists youtube_websub_subscriptions_user_connection_idx
on public.youtube_websub_subscriptions(user_id, channel_connection_id);

create index if not exists youtube_websub_subscriptions_connection_user_fk_idx
on public.youtube_websub_subscriptions(channel_connection_id, user_id);

alter table public.youtube_websub_subscriptions enable row level security;

drop policy if exists "YouTube WebSub subscriptions are visible to their user" on public.youtube_websub_subscriptions;
drop policy if exists "YouTube WebSub subscriptions can be inserted by their user" on public.youtube_websub_subscriptions;
drop policy if exists "YouTube WebSub subscriptions can be updated by their user" on public.youtube_websub_subscriptions;
drop policy if exists "YouTube WebSub subscriptions can be deleted by their user" on public.youtube_websub_subscriptions;

create policy "YouTube WebSub subscriptions are visible to their user"
on public.youtube_websub_subscriptions for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

revoke insert, update, delete on public.youtube_websub_subscriptions from authenticated;

grant select on public.youtube_websub_subscriptions to authenticated;
grant all on public.youtube_websub_subscriptions to service_role;
