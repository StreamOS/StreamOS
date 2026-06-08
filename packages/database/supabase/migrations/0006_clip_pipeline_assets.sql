create table if not exists public.vod_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stream_id uuid not null,
  platform public.stream_platform not null,
  source_url text not null,
  external_asset_id text,
  status text not null default 'ingested',
  duration_seconds numeric(12, 3),
  ingested_at timestamptz not null default now(),
  transcribed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vod_assets_id_user_id_unique unique (id, user_id),
  constraint vod_assets_stream_user_unique unique (stream_id, user_id),
  constraint vod_assets_stream_user_fkey foreign key (stream_id, user_id)
    references public.streams(id, user_id) on delete cascade,
  constraint vod_assets_source_url_length check (char_length(source_url) between 1 and 2048),
  constraint vod_assets_external_asset_id_length check (
    external_asset_id is null or char_length(external_asset_id) between 1 and 220
  ),
  constraint vod_assets_status_check check (
    status in ('ingested', 'transcribing', 'transcribed', 'failed')
  ),
  constraint vod_assets_duration_seconds_check check (
    duration_seconds is null or duration_seconds >= 0
  ),
  constraint vod_assets_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.stream_transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stream_id uuid not null,
  vod_asset_id uuid,
  language text not null default 'auto',
  provider text not null,
  model text not null,
  transcript_text text not null,
  segments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stream_transcripts_id_user_id_unique unique (id, user_id),
  constraint stream_transcripts_stream_language_unique unique (stream_id, user_id, language),
  constraint stream_transcripts_stream_user_fkey foreign key (stream_id, user_id)
    references public.streams(id, user_id) on delete cascade,
  constraint stream_transcripts_vod_asset_user_fkey foreign key (vod_asset_id, user_id)
    references public.vod_assets(id, user_id) on delete set null (vod_asset_id),
  constraint stream_transcripts_language_length check (char_length(language) between 1 and 32),
  constraint stream_transcripts_provider_length check (char_length(provider) between 1 and 80),
  constraint stream_transcripts_model_length check (char_length(model) between 1 and 120),
  constraint stream_transcripts_text_length check (char_length(transcript_text) between 1 and 500000),
  constraint stream_transcripts_segments_array_check check (jsonb_typeof(segments) = 'array')
);

create table if not exists public.stream_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stream_id uuid not null,
  transcript_id uuid,
  source_queue_job_id text,
  source text not null,
  rank integer not null default 1,
  score numeric(5, 2),
  title text,
  summary text not null,
  source_start_seconds numeric(12, 3),
  source_end_seconds numeric(12, 3),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stream_highlights_id_user_id_unique unique (id, user_id),
  constraint stream_highlights_stream_user_fkey foreign key (stream_id, user_id)
    references public.streams(id, user_id) on delete cascade,
  constraint stream_highlights_transcript_user_fkey foreign key (transcript_id, user_id)
    references public.stream_transcripts(id, user_id) on delete set null (transcript_id),
  constraint stream_highlights_source_queue_job_id_length check (
    source_queue_job_id is null or char_length(source_queue_job_id) between 1 and 220
  ),
  constraint stream_highlights_queue_rank_unique unique (
    user_id,
    stream_id,
    source,
    source_queue_job_id,
    rank
  ),
  constraint stream_highlights_source_check check (
    source in ('transcript', 'clip_scoring', 'manual')
  ),
  constraint stream_highlights_rank_check check (rank between 1 and 500),
  constraint stream_highlights_score_check check (score is null or (score >= 0 and score <= 100)),
  constraint stream_highlights_title_length check (title is null or char_length(title) <= 180),
  constraint stream_highlights_summary_length check (char_length(summary) between 1 and 2000),
  constraint stream_highlights_time_range_check check (
    source_end_seconds is null
    or source_start_seconds is null
    or source_end_seconds >= source_start_seconds
  ),
  constraint stream_highlights_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stream_id uuid not null,
  highlight_id uuid,
  source_queue_job_id text,
  title text not null,
  description text,
  source_url text,
  source_start_seconds numeric(12, 3),
  source_end_seconds numeric(12, 3),
  virality_score integer,
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clips_id_user_id_unique unique (id, user_id),
  constraint clips_stream_user_fkey foreign key (stream_id, user_id)
    references public.streams(id, user_id) on delete cascade,
  constraint clips_highlight_user_fkey foreign key (highlight_id, user_id)
    references public.stream_highlights(id, user_id) on delete set null (highlight_id),
  constraint clips_source_queue_job_id_length check (
    source_queue_job_id is null or char_length(source_queue_job_id) between 1 and 220
  ),
  constraint clips_queue_title_unique unique (
    user_id,
    stream_id,
    source_queue_job_id,
    title
  ),
  constraint clips_title_length check (char_length(title) between 1 and 180),
  constraint clips_description_length check (description is null or char_length(description) <= 1000),
  constraint clips_source_url_length check (source_url is null or char_length(source_url) <= 2048),
  constraint clips_time_range_check check (
    source_end_seconds is null
    or source_start_seconds is null
    or source_end_seconds >= source_start_seconds
  ),
  constraint clips_virality_score_check check (
    virality_score is null or (virality_score between 1 and 100)
  ),
  constraint clips_status_check check (
    status in ('draft', 'queued', 'rendering', 'ready', 'failed', 'published')
  ),
  constraint clips_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.clip_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clip_id uuid not null,
  target_platform public.stream_platform,
  export_format text not null,
  status text not null default 'draft',
  render_url text,
  published_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clip_exports_id_user_id_unique unique (id, user_id),
  constraint clip_exports_clip_user_fkey foreign key (clip_id, user_id)
    references public.clips(id, user_id) on delete cascade,
  constraint clip_exports_clip_format_unique unique (clip_id, user_id, export_format),
  constraint clip_exports_format_length check (char_length(export_format) between 1 and 80),
  constraint clip_exports_render_url_length check (render_url is null or char_length(render_url) <= 2048),
  constraint clip_exports_published_url_length check (published_url is null or char_length(published_url) <= 2048),
  constraint clip_exports_status_check check (
    status in ('draft', 'queued', 'rendering', 'ready', 'failed', 'published')
  ),
  constraint clip_exports_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists vod_assets_user_stream_idx
on public.vod_assets(user_id, stream_id);

create index if not exists vod_assets_user_status_idx
on public.vod_assets(user_id, status, updated_at desc);

create index if not exists stream_transcripts_user_stream_idx
on public.stream_transcripts(user_id, stream_id, updated_at desc);

create index if not exists stream_highlights_user_stream_rank_idx
on public.stream_highlights(user_id, stream_id, rank);

create index if not exists stream_highlights_user_score_idx
on public.stream_highlights(user_id, score desc nulls last, updated_at desc);

create index if not exists clips_user_stream_status_idx
on public.clips(user_id, stream_id, status, updated_at desc);

create index if not exists clips_user_score_idx
on public.clips(user_id, virality_score desc nulls last, updated_at desc);

create index if not exists clip_exports_user_clip_status_idx
on public.clip_exports(user_id, clip_id, status, updated_at desc);

create trigger vod_assets_set_updated_at
before update on public.vod_assets
for each row execute function public.set_updated_at();

create trigger stream_transcripts_set_updated_at
before update on public.stream_transcripts
for each row execute function public.set_updated_at();

create trigger stream_highlights_set_updated_at
before update on public.stream_highlights
for each row execute function public.set_updated_at();

create trigger clips_set_updated_at
before update on public.clips
for each row execute function public.set_updated_at();

create trigger clip_exports_set_updated_at
before update on public.clip_exports
for each row execute function public.set_updated_at();

alter table public.vod_assets enable row level security;
alter table public.stream_transcripts enable row level security;
alter table public.stream_highlights enable row level security;
alter table public.clips enable row level security;
alter table public.clip_exports enable row level security;

create policy "VOD assets are visible to their user"
on public.vod_assets for select
to authenticated
using (user_id = (select auth.uid()));

create policy "VOD assets can be inserted by their user"
on public.vod_assets for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "VOD assets can be updated by their user"
on public.vod_assets for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "VOD assets can be deleted by their user"
on public.vod_assets for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "Stream transcripts are visible to their user"
on public.stream_transcripts for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Stream transcripts can be inserted by their user"
on public.stream_transcripts for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Stream transcripts can be updated by their user"
on public.stream_transcripts for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Stream transcripts can be deleted by their user"
on public.stream_transcripts for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "Stream highlights are visible to their user"
on public.stream_highlights for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Stream highlights can be inserted by their user"
on public.stream_highlights for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Stream highlights can be updated by their user"
on public.stream_highlights for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Stream highlights can be deleted by their user"
on public.stream_highlights for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "Clips are visible to their user"
on public.clips for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Clips can be inserted by their user"
on public.clips for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Clips can be updated by their user"
on public.clips for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Clips can be deleted by their user"
on public.clips for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "Clip exports are visible to their user"
on public.clip_exports for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Clip exports can be inserted by their user"
on public.clip_exports for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Clip exports can be updated by their user"
on public.clip_exports for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Clip exports can be deleted by their user"
on public.clip_exports for delete
to authenticated
using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.vod_assets to authenticated;
grant select, insert, update, delete on public.stream_transcripts to authenticated;
grant select, insert, update, delete on public.stream_highlights to authenticated;
grant select, insert, update, delete on public.clips to authenticated;
grant select, insert, update, delete on public.clip_exports to authenticated;

grant all on public.vod_assets to service_role;
grant all on public.stream_transcripts to service_role;
grant all on public.stream_highlights to service_role;
grant all on public.clips to service_role;
grant all on public.clip_exports to service_role;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    alter publication supabase_realtime add table public.vod_assets;
    alter publication supabase_realtime add table public.stream_transcripts;
    alter publication supabase_realtime add table public.stream_highlights;
    alter publication supabase_realtime add table public.clips;
    alter publication supabase_realtime add table public.clip_exports;
  end if;
exception
  when duplicate_object then null;
end;
$$;
