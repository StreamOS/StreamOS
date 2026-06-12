drop policy if exists "Streams can be inserted by their user" on public.streams;
drop policy if exists "Streams can be updated by their user" on public.streams;
drop policy if exists "Streams can be deleted by their user" on public.streams;

drop policy if exists "Clips can be inserted by their user" on public.clips;
drop policy if exists "Clips can be updated by their user" on public.clips;
drop policy if exists "Clips can be deleted by their user" on public.clips;

drop policy if exists "Content jobs can be inserted by their user" on public.content_jobs;
drop policy if exists "Content jobs can be updated by their user" on public.content_jobs;
drop policy if exists "Content jobs can be deleted by their user" on public.content_jobs;

revoke insert, update, delete on public.streams from authenticated;
revoke insert, update, delete on public.clips from authenticated;
revoke insert, update, delete on public.content_jobs from authenticated;

revoke insert (
  user_id,
  stream_id,
  channel_id,
  queue_job_id,
  job_type,
  "type",
  payload
) on public.content_jobs from authenticated;

grant select on public.streams to authenticated;
grant select on public.clips to authenticated;
grant select on public.content_jobs to authenticated;

grant all on public.streams to service_role;
grant all on public.clips to service_role;
grant all on public.content_jobs to service_role;
