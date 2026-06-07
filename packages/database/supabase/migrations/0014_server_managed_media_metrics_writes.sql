drop policy if exists "Metrics snapshots can be inserted by their user" on public.metrics_snapshots;
drop policy if exists "Metrics snapshots can be updated by their user" on public.metrics_snapshots;
drop policy if exists "Metrics snapshots can be deleted by their user" on public.metrics_snapshots;

drop policy if exists "VOD assets can be inserted by their user" on public.vod_assets;
drop policy if exists "VOD assets can be updated by their user" on public.vod_assets;
drop policy if exists "VOD assets can be deleted by their user" on public.vod_assets;

drop policy if exists "Stream transcripts can be inserted by their user" on public.stream_transcripts;
drop policy if exists "Stream transcripts can be updated by their user" on public.stream_transcripts;
drop policy if exists "Stream transcripts can be deleted by their user" on public.stream_transcripts;

drop policy if exists "Clip exports can be inserted by their user" on public.clip_exports;
drop policy if exists "Clip exports can be updated by their user" on public.clip_exports;
drop policy if exists "Clip exports can be deleted by their user" on public.clip_exports;

revoke insert, update, delete on public.metrics_snapshots from authenticated;
revoke insert, update, delete on public.vod_assets from authenticated;
revoke insert, update, delete on public.stream_transcripts from authenticated;
revoke insert, update, delete on public.clip_exports from authenticated;

grant select on public.metrics_snapshots to authenticated;
grant select on public.vod_assets to authenticated;
grant select on public.stream_transcripts to authenticated;
grant select on public.clip_exports to authenticated;

grant all on public.metrics_snapshots to service_role;
grant all on public.vod_assets to service_role;
grant all on public.stream_transcripts to service_role;
grant all on public.clip_exports to service_role;
