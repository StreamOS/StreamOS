alter table public.streams enable row level security;
alter table public.content_jobs enable row level security;
alter table public.clips enable row level security;

grant select, insert, update, delete on public.streams to authenticated;
grant select, insert, update, delete on public.content_jobs to authenticated;
grant select, insert, update, delete on public.clips to authenticated;
grant all on public.streams to service_role;
grant all on public.content_jobs to service_role;
grant all on public.clips to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_jobs_payload_object_check'
      and conrelid = 'public.content_jobs'::regclass
  ) then
    alter table public.content_jobs
    add constraint content_jobs_payload_object_check
    check (jsonb_typeof(payload) = 'object')
    not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_jobs_done_consistency_check'
      and conrelid = 'public.content_jobs'::regclass
  ) then
    alter table public.content_jobs
    add constraint content_jobs_done_consistency_check
    check (
      status <> 'done'
      or (
        result is not null
        and error_message is null
        and next_retry_at is null
      )
    )
    not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_jobs_failed_consistency_check'
      and conrelid = 'public.content_jobs'::regclass
  ) then
    alter table public.content_jobs
    add constraint content_jobs_failed_consistency_check
    check (status <> 'failed' or error_message is not null)
    not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_jobs_retry_status_check'
      and conrelid = 'public.content_jobs'::regclass
  ) then
    alter table public.content_jobs
    add constraint content_jobs_retry_status_check
    check (status = 'failed' or next_retry_at is null)
    not valid;
  end if;
end;
$$;

create table if not exists public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid,
  channel_id uuid,
  asset_type text not null,
  status text not null default 'draft',
  name text not null,
  description text,
  storage_bucket text,
  storage_path text,
  public_url text,
  config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_assets_id_user_id_unique unique (id, user_id),
  constraint brand_assets_creator_user_fkey foreign key (creator_id, user_id)
    references public.creators(id, user_id) on delete set null (creator_id),
  constraint brand_assets_channel_user_fkey foreign key (channel_id, user_id)
    references public.channels(id, user_id) on delete set null (channel_id),
  constraint brand_assets_type_check check (
    asset_type in (
      'overlay',
      'alert',
      'logo',
      'banner',
      'panel',
      'emote',
      'color_palette',
      'typography',
      'scene'
    )
  ),
  constraint brand_assets_status_check check (
    status in ('draft', 'active', 'archived')
  ),
  constraint brand_assets_name_length check (char_length(name) between 1 and 160),
  constraint brand_assets_description_length check (
    description is null or char_length(description) <= 1000
  ),
  constraint brand_assets_storage_bucket_length check (
    storage_bucket is null or char_length(storage_bucket) between 1 and 120
  ),
  constraint brand_assets_storage_path_length check (
    storage_path is null or char_length(storage_path) between 1 and 1024
  ),
  constraint brand_assets_public_url_length check (
    public_url is null or char_length(public_url) <= 2048
  ),
  constraint brand_assets_config_object_check check (jsonb_typeof(config) = 'object'),
  constraint brand_assets_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.monetization_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid,
  channel_id uuid,
  stream_id uuid,
  platform public.stream_platform,
  event_type text not null,
  status text not null default 'confirmed',
  source text not null,
  external_event_id text,
  amount_cents integer not null,
  currency text not null default 'USD',
  quantity integer not null default 1,
  payer_handle text,
  sponsor_name text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monetization_events_id_user_id_unique unique (id, user_id),
  constraint monetization_events_creator_user_fkey foreign key (creator_id, user_id)
    references public.creators(id, user_id) on delete set null (creator_id),
  constraint monetization_events_channel_user_fkey foreign key (channel_id, user_id)
    references public.channels(id, user_id) on delete set null (channel_id),
  constraint monetization_events_stream_user_fkey foreign key (stream_id, user_id)
    references public.streams(id, user_id) on delete set null (stream_id),
  constraint monetization_events_type_check check (
    event_type in (
      'subscription',
      'membership',
      'donation',
      'bits',
      'ad_revenue',
      'merch_sale',
      'sponsorship',
      'affiliate',
      'other'
    )
  ),
  constraint monetization_events_status_check check (
    status in ('pending', 'confirmed', 'disputed', 'refunded', 'failed')
  ),
  constraint monetization_events_source_length check (char_length(source) between 1 and 120),
  constraint monetization_events_external_event_id_length check (
    external_event_id is null or char_length(external_event_id) between 1 and 220
  ),
  constraint monetization_events_amount_cents_check check (amount_cents >= 0),
  constraint monetization_events_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint monetization_events_quantity_check check (quantity >= 1),
  constraint monetization_events_payer_handle_length check (
    payer_handle is null or char_length(payer_handle) <= 120
  ),
  constraint monetization_events_sponsor_name_length check (
    sponsor_name is null or char_length(sponsor_name) <= 180
  ),
  constraint monetization_events_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists brand_assets_user_type_status_idx
on public.brand_assets(user_id, asset_type, status, updated_at desc);

create index if not exists brand_assets_creator_user_fk_idx
on public.brand_assets(creator_id, user_id);

create index if not exists brand_assets_channel_user_fk_idx
on public.brand_assets(channel_id, user_id);

create index if not exists monetization_events_user_occurred_idx
on public.monetization_events(user_id, occurred_at desc);

create index if not exists monetization_events_user_type_occurred_idx
on public.monetization_events(user_id, event_type, occurred_at desc);

create index if not exists monetization_events_user_platform_occurred_idx
on public.monetization_events(user_id, platform, occurred_at desc);

create index if not exists monetization_events_creator_user_fk_idx
on public.monetization_events(creator_id, user_id);

create index if not exists monetization_events_channel_user_fk_idx
on public.monetization_events(channel_id, user_id);

create index if not exists monetization_events_stream_user_fk_idx
on public.monetization_events(stream_id, user_id);

create unique index if not exists monetization_events_external_unique_idx
on public.monetization_events(user_id, source, external_event_id)
where external_event_id is not null;

drop trigger if exists brand_assets_set_updated_at on public.brand_assets;
create trigger brand_assets_set_updated_at
before update on public.brand_assets
for each row execute function public.set_updated_at();

drop trigger if exists monetization_events_set_updated_at on public.monetization_events;
create trigger monetization_events_set_updated_at
before update on public.monetization_events
for each row execute function public.set_updated_at();

alter table public.brand_assets enable row level security;
alter table public.monetization_events enable row level security;

drop policy if exists "Brand assets are visible to their user" on public.brand_assets;
drop policy if exists "Brand assets can be inserted by their user" on public.brand_assets;
drop policy if exists "Brand assets can be updated by their user" on public.brand_assets;
drop policy if exists "Brand assets can be deleted by their user" on public.brand_assets;

create policy "Brand assets are visible to their user"
on public.brand_assets for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Brand assets can be inserted by their user"
on public.brand_assets for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Brand assets can be updated by their user"
on public.brand_assets for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Brand assets can be deleted by their user"
on public.brand_assets for delete
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Monetization events are visible to their user" on public.monetization_events;
drop policy if exists "Monetization events can be inserted by their user" on public.monetization_events;
drop policy if exists "Monetization events can be updated by their user" on public.monetization_events;
drop policy if exists "Monetization events can be deleted by their user" on public.monetization_events;

create policy "Monetization events are visible to their user"
on public.monetization_events for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Monetization events can be inserted by their user"
on public.monetization_events for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Monetization events can be updated by their user"
on public.monetization_events for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Monetization events can be deleted by their user"
on public.monetization_events for delete
to authenticated
using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.brand_assets to authenticated;
grant select, insert, update, delete on public.monetization_events to authenticated;
grant all on public.brand_assets to service_role;
grant all on public.monetization_events to service_role;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    alter publication supabase_realtime add table public.brand_assets;
    alter publication supabase_realtime add table public.monetization_events;
  end if;
exception
  when duplicate_object then null;
end;
$$;
