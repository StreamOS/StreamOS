alter table public.content_publications
  add column if not exists capability_version text not null default '2026.06.p3.2.v1',
  add column if not exists provider_overrides jsonb not null default '{}'::jsonb,
  add column if not exists capability_snapshot jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publications_capability_version_length'
      and conrelid = 'public.content_publications'::regclass
  ) then
    alter table public.content_publications
      add constraint content_publications_capability_version_length
      check (char_length(capability_version) between 1 and 80);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publications_provider_overrides_object_check'
      and conrelid = 'public.content_publications'::regclass
  ) then
    alter table public.content_publications
      add constraint content_publications_provider_overrides_object_check
      check (jsonb_typeof(provider_overrides) = 'object');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publications_capability_snapshot_object_check'
      and conrelid = 'public.content_publications'::regclass
  ) then
    alter table public.content_publications
      add constraint content_publications_capability_snapshot_object_check
      check (jsonb_typeof(capability_snapshot) = 'object');
  end if;
end
$$;

drop function if exists public.record_content_publication_request(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  jsonb,
  text,
  text,
  text,
  text,
  jsonb,
  timestamptz
);

create function public.record_content_publication_request(
  p_content_job_id uuid,
  p_platform_connection_id uuid,
  p_target_platform text,
  p_user_id uuid,
  p_requested_by uuid,
  p_snapshot jsonb,
  p_request_intent_hash text,
  p_snapshot_hash text,
  p_validation_code text default 'validated',
  p_validation_message text default 'Publish request validated by the gateway.',
  p_validation_metadata jsonb default '{}'::jsonb,
  p_requested_at timestamptz default now(),
  p_capability_version text default '2026.06.p3.2.v1',
  p_provider_overrides jsonb default '{}'::jsonb,
  p_capability_snapshot jsonb default '{}'::jsonb
)
returns public.content_publications
language plpgsql
set search_path = ''
as $$
declare
  v_content_job public.content_jobs%rowtype;
  v_existing_publication public.content_publications%rowtype;
  v_platform_connection public.platform_connections%rowtype;
  v_publication public.content_publications%rowtype;
  v_requested_at timestamptz := coalesce(p_requested_at, now());
  v_validation_metadata jsonb := coalesce(p_validation_metadata, '{}'::jsonb);
  v_provider_overrides jsonb := coalesce(p_provider_overrides, '{}'::jsonb);
  v_capability_snapshot jsonb := coalesce(p_capability_snapshot, '{}'::jsonb);
begin
  if p_target_platform not in ('twitch', 'youtube', 'tiktok', 'kick') then
    raise exception 'unsupported_target_platform'
      using errcode = '22023';
  end if;

  if char_length(p_request_intent_hash) <> 64 then
    raise exception 'invalid_request_intent_hash'
      using errcode = '22023';
  end if;

  if char_length(p_snapshot_hash) <> 64 then
    raise exception 'invalid_snapshot_hash'
      using errcode = '22023';
  end if;

  select *
  into v_existing_publication
  from public.content_publications
  where user_id = p_user_id
    and request_intent_hash = p_request_intent_hash
  for update;

  if found then
    return v_existing_publication;
  end if;

  select *
  into v_content_job
  from public.content_jobs
  where id = p_content_job_id
    and user_id = p_user_id
    and job_type = 'repurposing'
    and type = 'repurposing'
  for update;

  if not found then
    raise exception 'content_job_not_found'
      using errcode = 'P0002';
  end if;

  if v_content_job.review_status <> 'approved'
    or v_content_job.status not in ('done', 'completed') then
    raise exception 'publication_not_ready'
      using errcode = 'P0002';
  end if;

  if v_content_job.result is null
    or jsonb_typeof(v_content_job.result) <> 'object'
    or coalesce(v_content_job.result->>'manual_review_required', 'false') <> 'true'
    or coalesce(v_content_job.result->>'content_job_id', '') <> v_content_job.id::text
    or coalesce(v_content_job.result->>'queue_job_id', '') = ''
    or not (v_content_job.result ? 'title_suggestions')
    or not (v_content_job.result ? 'captions')
    or not (v_content_job.result ? 'descriptions')
    or not (v_content_job.result ? 'hashtag_sets')
    or not (v_content_job.result ? 'hook_ideas')
    or not (v_content_job.result ? 'short_form_plan')
    or not (v_content_job.result ? 'warnings')
    or not (v_content_job.result ? 'confidence')
    or not (v_content_job.result ? 'provider')
    or not (v_content_job.result ? 'model') then
    raise exception 'publishable_bundle_missing'
      using errcode = 'P0002';
  end if;

  select *
  into v_platform_connection
  from public.platform_connections
  where id = p_platform_connection_id
    and user_id = p_user_id
    and platform = p_target_platform::public.stream_platform
    and status = 'connected'
  for update;

  if not found then
    raise exception 'platform_connection_not_found'
      using errcode = 'P0002';
  end if;

  if coalesce(array_length(v_platform_connection.scopes, 1), 0) = 0 then
    raise exception 'missing_publish_scopes'
      using errcode = 'P0002';
  end if;

  insert into public.content_publications (
    user_id,
    content_job_id,
    platform_connection_id,
    target_platform,
    publication_status,
    review_status_at_request,
    requested_by,
    requested_at,
    validated_at,
    request_intent_hash,
    snapshot_hash,
    snapshot,
    validation_code,
    validation_message,
    validation_metadata,
    retry_count,
    max_retries,
    next_retry_at,
    external_post_id,
    external_url,
    published_at,
    capability_version,
    provider_overrides,
    capability_snapshot
  ) values (
    p_user_id,
    p_content_job_id,
    p_platform_connection_id,
    p_target_platform::public.stream_platform,
    'validated',
    v_content_job.review_status,
    p_requested_by,
    v_requested_at,
    v_requested_at,
    p_request_intent_hash,
    p_snapshot_hash,
    p_snapshot,
    p_validation_code,
    p_validation_message,
    v_validation_metadata,
    0,
    0,
    null,
    null,
    null,
    null,
    coalesce(nullif(trim(p_capability_version), ''), '2026.06.p3.2.v1'),
    v_provider_overrides,
    v_capability_snapshot
  )
  returning * into v_publication;

  insert into public.content_publication_events (
    user_id,
    content_publication_id,
    actor_id,
    event_type,
    previous_publication_status,
    publication_status,
    source,
    metadata
  ) values (
    v_publication.user_id,
    v_publication.id,
    p_requested_by,
    'requested',
    null,
    'requested',
    'api-gateway',
    jsonb_build_object(
      'content_job_id', v_publication.content_job_id,
      'platform_connection_id', v_publication.platform_connection_id,
      'request_intent_hash', v_publication.request_intent_hash,
      'snapshot_hash', v_publication.snapshot_hash,
      'target_platform', v_publication.target_platform
    )
  ), (
    v_publication.user_id,
    v_publication.id,
    p_requested_by,
    'validated',
    'requested',
    'validated',
    'api-gateway',
    v_validation_metadata
  );

  return v_publication;
end;
$$;

revoke execute on function public.record_content_publication_request(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  jsonb,
  text,
  text,
  text,
  text,
  jsonb,
  timestamptz,
  text,
  jsonb,
  jsonb
) from public, authenticated;

grant execute on function public.record_content_publication_request(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  jsonb,
  text,
  text,
  text,
  text,
  jsonb,
  timestamptz,
  text,
  jsonb,
  jsonb
) to service_role;
