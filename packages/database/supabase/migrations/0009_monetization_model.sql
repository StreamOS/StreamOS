alter table public.monetization_events
add column if not exists provider public.stream_platform,
add column if not exists provider_event_id text,
add column if not exists raw_event_id text,
add column if not exists raw_payload jsonb not null default '{}'::jsonb,
add column if not exists attribution jsonb not null default '{}'::jsonb,
add column if not exists ingested_at timestamptz not null default now();

update public.monetization_events as monetization_events
set provider = coalesce(monetization_events.provider, monetization_events.platform, channels.platform)
from public.channels as channels
where monetization_events.channel_id = channels.id
  and monetization_events.user_id = channels.user_id
  and monetization_events.provider is null;

update public.monetization_events
set provider = coalesce(provider, platform),
    provider_event_id = coalesce(provider_event_id, external_event_id)
where provider is null
   or provider_event_id is null;

alter table public.monetization_events
alter column provider set not null,
alter column channel_id set not null;

alter table public.monetization_events
drop constraint if exists monetization_events_channel_user_fkey;

alter table public.monetization_events
add constraint monetization_events_channel_user_fkey foreign key (channel_id, user_id)
references public.channels(id, user_id) on delete cascade;

alter table public.monetization_events
drop constraint if exists monetization_events_type_check;

alter table public.monetization_events
add constraint monetization_events_type_check check (
  event_type in (
    'subscription',
    'membership',
    'tip',
    'donation',
    'bits',
    'ad_revenue',
    'merch_sale',
    'sponsorship',
    'affiliate',
    'other'
  )
);

alter table public.monetization_events
drop constraint if exists monetization_events_status_check;

alter table public.monetization_events
add constraint monetization_events_status_check check (
  status in (
    'pending',
    'confirmed',
    'void',
    'disputed',
    'refunded',
    'failed'
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'monetization_events_provider_event_id_length'
      and conrelid = 'public.monetization_events'::regclass
  ) then
    alter table public.monetization_events
    add constraint monetization_events_provider_event_id_length
    check (
      provider_event_id is null
      or char_length(provider_event_id) between 1 and 220
    );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'monetization_events_raw_event_id_length'
      and conrelid = 'public.monetization_events'::regclass
  ) then
    alter table public.monetization_events
    add constraint monetization_events_raw_event_id_length
    check (
      raw_event_id is null
      or char_length(raw_event_id) between 1 and 220
    );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'monetization_events_raw_payload_object_check'
      and conrelid = 'public.monetization_events'::regclass
  ) then
    alter table public.monetization_events
    add constraint monetization_events_raw_payload_object_check
    check (jsonb_typeof(raw_payload) = 'object');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'monetization_events_attribution_object_check'
      and conrelid = 'public.monetization_events'::regclass
  ) then
    alter table public.monetization_events
    add constraint monetization_events_attribution_object_check
    check (jsonb_typeof(attribution) = 'object');
  end if;
end;
$$;

create unique index if not exists monetization_events_provider_event_unique_idx
on public.monetization_events(provider, provider_event_id)
where provider_event_id is not null;

create index if not exists monetization_events_channel_id_idx
on public.monetization_events(channel_id);

create index if not exists monetization_events_provider_idx
on public.monetization_events(provider);

create index if not exists monetization_events_occurred_at_idx
on public.monetization_events(occurred_at desc);

create index if not exists monetization_events_user_provider_occurred_idx
on public.monetization_events(user_id, provider, occurred_at desc);

create table if not exists public.monetization_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid,
  channel_id uuid not null,
  provider public.stream_platform not null,
  period text not null,
  period_start date not null,
  period_end date not null,
  currency text not null default 'USD',
  gross_amount_cents bigint not null default 0,
  net_amount_cents bigint not null default 0,
  event_count integer not null default 0,
  subscription_count integer not null default 0,
  tip_count integer not null default 0,
  donation_count integer not null default 0,
  ad_revenue_count integer not null default 0,
  sponsorship_count integer not null default 0,
  merch_sale_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monetization_summaries_id_user_id_unique unique (id, user_id),
  constraint monetization_summaries_creator_user_fkey foreign key (creator_id, user_id)
    references public.creators(id, user_id) on delete set null (creator_id),
  constraint monetization_summaries_channel_user_fkey foreign key (channel_id, user_id)
    references public.channels(id, user_id) on delete cascade,
  constraint monetization_summaries_unique_period unique (
    user_id,
    channel_id,
    provider,
    period,
    period_start,
    currency
  ),
  constraint monetization_summaries_period_check check (
    period in ('daily', 'weekly')
  ),
  constraint monetization_summaries_period_range_check check (
    period_start < period_end
  ),
  constraint monetization_summaries_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint monetization_summaries_gross_amount_cents_check check (
    gross_amount_cents >= 0
  ),
  constraint monetization_summaries_net_amount_cents_check check (
    net_amount_cents >= 0
  ),
  constraint monetization_summaries_event_count_check check (event_count >= 0),
  constraint monetization_summaries_subscription_count_check check (
    subscription_count >= 0
  ),
  constraint monetization_summaries_tip_count_check check (tip_count >= 0),
  constraint monetization_summaries_donation_count_check check (
    donation_count >= 0
  ),
  constraint monetization_summaries_ad_revenue_count_check check (
    ad_revenue_count >= 0
  ),
  constraint monetization_summaries_sponsorship_count_check check (
    sponsorship_count >= 0
  ),
  constraint monetization_summaries_merch_sale_count_check check (
    merch_sale_count >= 0
  ),
  constraint monetization_summaries_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create index if not exists monetization_summaries_user_period_idx
on public.monetization_summaries(user_id, period, period_start desc);

create index if not exists monetization_summaries_user_channel_period_idx
on public.monetization_summaries(user_id, channel_id, period, period_start desc);

create index if not exists monetization_summaries_channel_id_idx
on public.monetization_summaries(channel_id);

create index if not exists monetization_summaries_provider_idx
on public.monetization_summaries(provider);

create index if not exists monetization_summaries_period_start_idx
on public.monetization_summaries(period_start desc);

drop trigger if exists monetization_summaries_set_updated_at on public.monetization_summaries;
create trigger monetization_summaries_set_updated_at
before update on public.monetization_summaries
for each row execute function public.set_updated_at();

alter table public.monetization_summaries enable row level security;

drop policy if exists "Monetization summaries are visible to their user" on public.monetization_summaries;
drop policy if exists "Monetization summaries can be inserted by their user" on public.monetization_summaries;
drop policy if exists "Monetization summaries can be updated by their user" on public.monetization_summaries;
drop policy if exists "Monetization summaries can be deleted by their user" on public.monetization_summaries;

create policy "Monetization summaries are visible to their user"
on public.monetization_summaries for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Monetization summaries can be inserted by their user"
on public.monetization_summaries for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Monetization summaries can be updated by their user"
on public.monetization_summaries for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Monetization summaries can be deleted by their user"
on public.monetization_summaries for delete
to authenticated
using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.monetization_summaries to authenticated;
grant all on public.monetization_summaries to service_role;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    alter publication supabase_realtime add table public.monetization_summaries;
  end if;
exception
  when duplicate_object then null;
end;
$$;
