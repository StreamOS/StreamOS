create table if not exists public.content_job_export_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  content_job_id uuid not null,
  event_type text not null,
  target_platform text not null,
  template_key text not null,
  review_status_at_export text not null,
  bundle_hash text,
  source text not null default 'repurposing-review-console',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint content_job_export_events_content_job_user_fkey
    foreign key (content_job_id, user_id)
    references public.content_jobs(id, user_id) on delete cascade,
  constraint content_job_export_events_event_type_check
    check (event_type in ('copy_bundle', 'copy_template')),
  constraint content_job_export_events_target_platform_check
    check (target_platform in ('tiktok', 'youtube_shorts')),
  constraint content_job_export_events_template_key_check
    check (template_key in ('bundle', 'tiktok', 'youtube_shorts')),
  constraint content_job_export_events_review_status_check
    check (review_status_at_export in ('needs_review', 'approved', 'rejected', 'needs_changes')),
  constraint content_job_export_events_bundle_hash_check
    check (bundle_hash is null or char_length(bundle_hash) = 64),
  constraint content_job_export_events_source_length_check
    check (char_length(source) between 1 and 220)
);

alter table public.content_job_export_events enable row level security;

create index if not exists content_job_export_events_user_job_created_idx
on public.content_job_export_events(user_id, content_job_id, created_at desc);

create index if not exists content_job_export_events_user_platform_created_idx
on public.content_job_export_events(user_id, target_platform, created_at desc);

drop policy if exists "Content job export events are visible to their user" on public.content_job_export_events;
drop policy if exists "Content job export events can be inserted by their user" on public.content_job_export_events;
drop policy if exists "Content job export events can be updated by their user" on public.content_job_export_events;
drop policy if exists "Content job export events can be deleted by their user" on public.content_job_export_events;

create policy "Content job export events are visible to their user"
on public.content_job_export_events for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

create policy "Content job export events can be inserted by their user"
on public.content_job_export_events for insert
to authenticated
with check (
  auth.uid() is not null
  and user_id = auth.uid()
  and actor_id = auth.uid()
);

revoke update, delete on public.content_job_export_events from authenticated;

grant select, insert on public.content_job_export_events to authenticated;
grant all on public.content_job_export_events to service_role;
