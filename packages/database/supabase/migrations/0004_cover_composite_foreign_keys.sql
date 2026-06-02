create index if not exists channels_creator_user_fk_idx
on public.channels(creator_id, user_id);

create index if not exists platform_connections_creator_user_fk_idx
on public.platform_connections(creator_id, user_id);

create index if not exists platform_connections_channel_user_fk_idx
on public.platform_connections(channel_id, user_id);

create index if not exists metrics_snapshots_creator_user_fk_idx
on public.metrics_snapshots(creator_id, user_id);

create index if not exists metrics_snapshots_channel_user_fk_idx
on public.metrics_snapshots(channel_id, user_id);

create index if not exists streams_channel_user_fk_idx
on public.streams(channel_id, user_id);

create index if not exists content_jobs_stream_user_fk_idx
on public.content_jobs(stream_id, user_id);
