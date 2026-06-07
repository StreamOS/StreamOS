drop policy if exists "Content jobs can be updated by their user" on public.content_jobs;
drop policy if exists "Content jobs can be deleted by their user" on public.content_jobs;

revoke insert, update, delete on public.content_jobs from authenticated;

grant insert (
  user_id,
  stream_id,
  queue_job_id,
  job_type,
  payload
) on public.content_jobs to authenticated;

grant select on public.content_jobs to authenticated;
grant all on public.content_jobs to service_role;
