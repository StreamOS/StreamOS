drop policy if exists "Creators are visible to their user" on public.creators;
drop policy if exists "Creators can be inserted by their user" on public.creators;
drop policy if exists "Creators can be updated by their user" on public.creators;
drop policy if exists "Creators can be deleted by their user" on public.creators;

create policy "Creators are visible to their user"
on public.creators for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

create policy "Creators can be inserted by their user"
on public.creators for insert
to authenticated
with check (auth.uid() is not null and user_id = auth.uid());

create policy "Creators can be updated by their user"
on public.creators for update
to authenticated
using (auth.uid() is not null and user_id = auth.uid())
with check (auth.uid() is not null and user_id = auth.uid());

create policy "Creators can be deleted by their user"
on public.creators for delete
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Channels are visible to their user" on public.channels;
drop policy if exists "Channels can be inserted by their user" on public.channels;
drop policy if exists "Channels can be updated by their user" on public.channels;
drop policy if exists "Channels can be deleted by their user" on public.channels;

create policy "Channels are visible to their user"
on public.channels for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

create policy "Channels can be inserted by their user"
on public.channels for insert
to authenticated
with check (auth.uid() is not null and user_id = auth.uid());

create policy "Channels can be updated by their user"
on public.channels for update
to authenticated
using (auth.uid() is not null and user_id = auth.uid())
with check (auth.uid() is not null and user_id = auth.uid());

create policy "Channels can be deleted by their user"
on public.channels for delete
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Platform connections are visible to their user" on public.platform_connections;

create policy "Platform connections are visible to their user"
on public.platform_connections for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Metrics snapshots are visible to their user" on public.metrics_snapshots;

create policy "Metrics snapshots are visible to their user"
on public.metrics_snapshots for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Streams are visible to their user" on public.streams;
drop policy if exists "Streams can be inserted by their user" on public.streams;
drop policy if exists "Streams can be updated by their user" on public.streams;
drop policy if exists "Streams can be deleted by their user" on public.streams;

create policy "Streams are visible to their user"
on public.streams for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

create policy "Streams can be inserted by their user"
on public.streams for insert
to authenticated
with check (auth.uid() is not null and user_id = auth.uid());

create policy "Streams can be updated by their user"
on public.streams for update
to authenticated
using (auth.uid() is not null and user_id = auth.uid())
with check (auth.uid() is not null and user_id = auth.uid());

create policy "Streams can be deleted by their user"
on public.streams for delete
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Content jobs are visible to their user" on public.content_jobs;
drop policy if exists "Content jobs can be inserted by their user" on public.content_jobs;

create policy "Content jobs are visible to their user"
on public.content_jobs for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

create policy "Content jobs can be inserted by their user"
on public.content_jobs for insert
to authenticated
with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "VOD assets are visible to their user" on public.vod_assets;

create policy "VOD assets are visible to their user"
on public.vod_assets for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Stream transcripts are visible to their user" on public.stream_transcripts;

create policy "Stream transcripts are visible to their user"
on public.stream_transcripts for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Stream highlights are visible to their user" on public.stream_highlights;
drop policy if exists "Stream highlights can be inserted by their user" on public.stream_highlights;
drop policy if exists "Stream highlights can be updated by their user" on public.stream_highlights;
drop policy if exists "Stream highlights can be deleted by their user" on public.stream_highlights;

create policy "Stream highlights are visible to their user"
on public.stream_highlights for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

create policy "Stream highlights can be inserted by their user"
on public.stream_highlights for insert
to authenticated
with check (auth.uid() is not null and user_id = auth.uid());

create policy "Stream highlights can be updated by their user"
on public.stream_highlights for update
to authenticated
using (auth.uid() is not null and user_id = auth.uid())
with check (auth.uid() is not null and user_id = auth.uid());

create policy "Stream highlights can be deleted by their user"
on public.stream_highlights for delete
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Clips are visible to their user" on public.clips;
drop policy if exists "Clips can be inserted by their user" on public.clips;
drop policy if exists "Clips can be updated by their user" on public.clips;
drop policy if exists "Clips can be deleted by their user" on public.clips;

create policy "Clips are visible to their user"
on public.clips for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

create policy "Clips can be inserted by their user"
on public.clips for insert
to authenticated
with check (auth.uid() is not null and user_id = auth.uid());

create policy "Clips can be updated by their user"
on public.clips for update
to authenticated
using (auth.uid() is not null and user_id = auth.uid())
with check (auth.uid() is not null and user_id = auth.uid());

create policy "Clips can be deleted by their user"
on public.clips for delete
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Clip exports are visible to their user" on public.clip_exports;

create policy "Clip exports are visible to their user"
on public.clip_exports for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Brand assets are visible to their user" on public.brand_assets;
drop policy if exists "Brand assets can be inserted by their user" on public.brand_assets;
drop policy if exists "Brand assets can be updated by their user" on public.brand_assets;
drop policy if exists "Brand assets can be deleted by their user" on public.brand_assets;

create policy "Brand assets are visible to their user"
on public.brand_assets for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

create policy "Brand assets can be inserted by their user"
on public.brand_assets for insert
to authenticated
with check (auth.uid() is not null and user_id = auth.uid());

create policy "Brand assets can be updated by their user"
on public.brand_assets for update
to authenticated
using (auth.uid() is not null and user_id = auth.uid())
with check (auth.uid() is not null and user_id = auth.uid());

create policy "Brand assets can be deleted by their user"
on public.brand_assets for delete
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Monetization events are visible to their user" on public.monetization_events;

create policy "Monetization events are visible to their user"
on public.monetization_events for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Monetization summaries are visible to their user" on public.monetization_summaries;

create policy "Monetization summaries are visible to their user"
on public.monetization_summaries for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());
