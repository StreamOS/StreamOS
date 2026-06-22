alter table public.content_publications
  add column if not exists scheduled_at_utc timestamptz,
  add column if not exists scheduled_timezone text,
  add column if not exists schedule_block_message text,
  add column if not exists schedule_block_reason text,
  add column if not exists schedule_canceled_at timestamptz,
  add column if not exists schedule_canceled_reason text,
  add column if not exists schedule_capability_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists schedule_created_at timestamptz,
  add column if not exists schedule_expired_at timestamptz,
  add column if not exists schedule_replaced_at timestamptz,
  add column if not exists schedule_source text not null default 'api-gateway',
  add column if not exists schedule_status text not null default 'not_scheduled',
  add column if not exists schedule_updated_at timestamptz,
  add column if not exists schedule_validation_metadata jsonb not null default '{}'::jsonb;

alter table public.content_publication_fanouts
  add column if not exists scheduled_at_utc timestamptz,
  add column if not exists scheduled_timezone text,
  add column if not exists schedule_block_message text,
  add column if not exists schedule_block_reason text,
  add column if not exists schedule_canceled_at timestamptz,
  add column if not exists schedule_canceled_reason text,
  add column if not exists schedule_capability_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists schedule_created_at timestamptz,
  add column if not exists schedule_expired_at timestamptz,
  add column if not exists schedule_replaced_at timestamptz,
  add column if not exists schedule_source text not null default 'api-gateway',
  add column if not exists schedule_status text not null default 'not_scheduled',
  add column if not exists schedule_updated_at timestamptz,
  add column if not exists schedule_validation_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'content_publication_events_event_type_check'
      and conrelid = 'public.content_publication_events'::regclass
  ) then
    alter table public.content_publication_events
      drop constraint content_publication_events_event_type_check;
  end if;

  alter table public.content_publication_events
    add constraint content_publication_events_event_type_check
    check (
      event_type in (
        'requested',
        'validated',
        'rejected',
        'canceled',
        'schedule_blocked',
        'schedule_canceled',
        'schedule_created',
        'schedule_expired',
        'schedule_replaced',
        'schedule_updated',
        'schedule_validation_failed',
        'queued',
        'publishing',
        'published',
        'failed_retryable',
        'failed_permanent',
        'reconcile_requested',
        'reconcile_skipped',
        'reconcile_failed_retryable',
        'reconcile_failed_permanent',
        'reconciled'
      )
    );
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'content_publication_fanout_events_event_type_check'
      and conrelid = 'public.content_publication_fanout_events'::regclass
  ) then
    alter table public.content_publication_fanout_events
      drop constraint content_publication_fanout_events_event_type_check;
  end if;

  alter table public.content_publication_fanout_events
    add constraint content_publication_fanout_events_event_type_check
    check (
      event_type in (
        'child_retry_queued',
        'child_retry_requested',
        'fanout_blocked',
        'fanout_requested',
        'fanout_schedule_blocked',
        'fanout_schedule_canceled',
        'fanout_schedule_created',
        'fanout_schedule_expired',
        'fanout_schedule_replaced',
        'fanout_schedule_updated',
        'fanout_schedule_validation_failed',
        'fanout_target_schedule_blocked',
        'fanout_target_schedule_inherited',
        'fanout_validated',
        'manual_action_blocked',
        'parent_aggregate_refreshed',
        'target_rechecked'
      )
    );
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publications_schedule_status_check'
      and conrelid = 'public.content_publications'::regclass
  ) then
    alter table public.content_publications
      add constraint content_publications_schedule_status_check
      check (
        schedule_status in (
          'not_scheduled',
          'scheduled',
          'schedule_blocked',
          'schedule_expired',
          'schedule_canceled',
          'schedule_replaced',
          'schedule_ready',
          'schedule_unknown'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publications_schedule_source_check'
      and conrelid = 'public.content_publications'::regclass
  ) then
    alter table public.content_publications
      add constraint content_publications_schedule_source_check
      check (schedule_source in ('api-gateway', 'dashboard', 'manual', 'system'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publications_scheduled_timezone_length_check'
      and conrelid = 'public.content_publications'::regclass
  ) then
    alter table public.content_publications
      add constraint content_publications_scheduled_timezone_length_check
      check (scheduled_timezone is null or char_length(scheduled_timezone) between 1 and 120);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publications_schedule_block_message_length_check'
      and conrelid = 'public.content_publications'::regclass
  ) then
    alter table public.content_publications
      add constraint content_publications_schedule_block_message_length_check
      check (schedule_block_message is null or char_length(schedule_block_message) <= 4000);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publications_schedule_block_reason_check'
      and conrelid = 'public.content_publications'::regclass
  ) then
    alter table public.content_publications
      add constraint content_publications_schedule_block_reason_check
      check (
        schedule_block_reason is null
        or schedule_block_reason in (
          'child_not_part_of_parent',
          'content_job_not_approved',
          'content_job_not_complete',
          'fanout_finalized',
          'fanout_not_ready',
          'missing_publish_scopes',
          'platform_connection_missing',
          'platform_connection_not_connected',
          'publication_finalized',
          'publication_processing',
          'publication_reauth_required',
          'publication_status_not_schedulable',
          'publishable_asset_missing',
          'publishable_bundle_missing',
          'schedule_time_invalid',
          'schedule_timezone_invalid',
          'scheduling_not_allowed',
          'target_unsupported',
          'tenant_mismatch'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publications_schedule_capability_snapshot_object_check'
      and conrelid = 'public.content_publications'::regclass
  ) then
    alter table public.content_publications
      add constraint content_publications_schedule_capability_snapshot_object_check
      check (jsonb_typeof(schedule_capability_snapshot) = 'object');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publications_schedule_validation_metadata_object_check'
      and conrelid = 'public.content_publications'::regclass
  ) then
    alter table public.content_publications
      add constraint content_publications_schedule_validation_metadata_object_check
      check (jsonb_typeof(schedule_validation_metadata) = 'object');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publication_fanouts_schedule_status_check'
      and conrelid = 'public.content_publication_fanouts'::regclass
  ) then
    alter table public.content_publication_fanouts
      add constraint content_publication_fanouts_schedule_status_check
      check (
        schedule_status in (
          'not_scheduled',
          'scheduled',
          'schedule_blocked',
          'schedule_expired',
          'schedule_canceled',
          'schedule_replaced',
          'schedule_ready',
          'schedule_unknown'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publication_fanouts_schedule_source_check'
      and conrelid = 'public.content_publication_fanouts'::regclass
  ) then
    alter table public.content_publication_fanouts
      add constraint content_publication_fanouts_schedule_source_check
      check (schedule_source in ('api-gateway', 'dashboard', 'manual', 'system'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publication_fanouts_scheduled_timezone_length_check'
      and conrelid = 'public.content_publication_fanouts'::regclass
  ) then
    alter table public.content_publication_fanouts
      add constraint content_publication_fanouts_scheduled_timezone_length_check
      check (scheduled_timezone is null or char_length(scheduled_timezone) between 1 and 120);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publication_fanouts_schedule_block_message_length_check'
      and conrelid = 'public.content_publication_fanouts'::regclass
  ) then
    alter table public.content_publication_fanouts
      add constraint content_publication_fanouts_schedule_block_message_length_check
      check (schedule_block_message is null or char_length(schedule_block_message) <= 4000);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publication_fanouts_schedule_block_reason_check'
      and conrelid = 'public.content_publication_fanouts'::regclass
  ) then
    alter table public.content_publication_fanouts
      add constraint content_publication_fanouts_schedule_block_reason_check
      check (
        schedule_block_reason is null
        or schedule_block_reason in (
          'child_not_part_of_parent',
          'content_job_not_approved',
          'content_job_not_complete',
          'fanout_finalized',
          'fanout_not_ready',
          'missing_publish_scopes',
          'platform_connection_missing',
          'platform_connection_not_connected',
          'publication_finalized',
          'publication_processing',
          'publication_reauth_required',
          'publication_status_not_schedulable',
          'publishable_asset_missing',
          'publishable_bundle_missing',
          'schedule_time_invalid',
          'schedule_timezone_invalid',
          'scheduling_not_allowed',
          'target_unsupported',
          'tenant_mismatch'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publication_fanouts_schedule_capability_snapshot_object_check'
      and conrelid = 'public.content_publication_fanouts'::regclass
  ) then
    alter table public.content_publication_fanouts
      add constraint content_publication_fanouts_schedule_capability_snapshot_object_check
      check (jsonb_typeof(schedule_capability_snapshot) = 'object');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publication_fanouts_schedule_validation_metadata_object_check'
      and conrelid = 'public.content_publication_fanouts'::regclass
  ) then
    alter table public.content_publication_fanouts
      add constraint content_publication_fanouts_schedule_validation_metadata_object_check
      check (jsonb_typeof(schedule_validation_metadata) = 'object');
  end if;
end
$$;

create index if not exists content_publications_user_schedule_status_created_idx
on public.content_publications(user_id, schedule_status, scheduled_at_utc desc);

create index if not exists content_publications_user_schedule_platform_idx
on public.content_publications(user_id, target_platform, schedule_status, scheduled_at_utc desc);

create index if not exists content_publication_fanouts_user_schedule_status_created_idx
on public.content_publication_fanouts(user_id, schedule_status, scheduled_at_utc desc);

create index if not exists content_publication_fanouts_user_schedule_created_idx
on public.content_publication_fanouts(user_id, scheduled_at_utc desc);

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
  timestamptz,
  text,
  jsonb,
  jsonb
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
  p_capability_snapshot jsonb default '{}'::jsonb,
  p_scheduled_at_utc timestamptz default null,
  p_scheduled_timezone text default null,
  p_schedule_block_message text default null,
  p_schedule_block_reason text default null,
  p_schedule_canceled_at timestamptz default null,
  p_schedule_canceled_reason text default null,
  p_schedule_capability_snapshot jsonb default '{}'::jsonb,
  p_schedule_created_at timestamptz default null,
  p_schedule_expired_at timestamptz default null,
  p_schedule_replaced_at timestamptz default null,
  p_schedule_source text default 'api-gateway',
  p_schedule_status text default 'not_scheduled',
  p_schedule_updated_at timestamptz default null,
  p_schedule_validation_metadata jsonb default '{}'::jsonb
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
  v_schedule_capability_snapshot jsonb := coalesce(p_schedule_capability_snapshot, '{}'::jsonb);
  v_schedule_validation_metadata jsonb := coalesce(p_schedule_validation_metadata, '{}'::jsonb);
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

  if p_schedule_status not in (
    'not_scheduled',
    'scheduled',
    'schedule_blocked',
    'schedule_expired',
    'schedule_canceled',
    'schedule_replaced',
    'schedule_ready',
    'schedule_unknown'
  ) then
    raise exception 'invalid_schedule_status'
      using errcode = '22023';
  end if;

  if p_schedule_source not in ('api-gateway', 'dashboard', 'manual', 'system') then
    raise exception 'invalid_schedule_source'
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
    capability_snapshot,
    scheduled_at_utc,
    scheduled_timezone,
    schedule_block_message,
    schedule_block_reason,
    schedule_canceled_at,
    schedule_canceled_reason,
    schedule_capability_snapshot,
    schedule_created_at,
    schedule_expired_at,
    schedule_replaced_at,
    schedule_source,
    schedule_status,
    schedule_updated_at,
    schedule_validation_metadata
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
    v_capability_snapshot,
    p_scheduled_at_utc,
    p_scheduled_timezone,
    p_schedule_block_message,
    p_schedule_block_reason,
    p_schedule_canceled_at,
    p_schedule_canceled_reason,
    v_schedule_capability_snapshot,
    p_schedule_created_at,
    p_schedule_expired_at,
    p_schedule_replaced_at,
    p_schedule_source,
    p_schedule_status,
    p_schedule_updated_at,
    v_schedule_validation_metadata
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

  if v_publication.schedule_status <> 'not_scheduled' then
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
      case
        when v_publication.schedule_status = 'schedule_blocked' then 'schedule_blocked'
        when v_publication.schedule_status = 'schedule_canceled' then 'schedule_canceled'
        when v_publication.schedule_status = 'schedule_expired' then 'schedule_expired'
        when v_publication.schedule_status = 'schedule_replaced' then 'schedule_replaced'
        when v_publication.schedule_status in ('scheduled', 'schedule_ready') then 'schedule_created'
        else 'schedule_updated'
      end,
      'validated',
      'validated',
      'api-gateway',
      jsonb_build_object(
        'schedule_block_reason', v_publication.schedule_block_reason,
        'schedule_status', v_publication.schedule_status,
        'scheduled_at_utc', v_publication.scheduled_at_utc,
        'scheduled_timezone', v_publication.scheduled_timezone,
        'schedule_source', v_publication.schedule_source,
        'schedule_validation_metadata', v_publication.schedule_validation_metadata
      )
    );
  end if;

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
  jsonb,
  timestamptz,
  text,
  text,
  text,
  timestamptz,
  text,
  jsonb,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  text,
  timestamptz,
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
  jsonb,
  timestamptz,
  text,
  text,
  text,
  timestamptz,
  text,
  jsonb,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  text,
  timestamptz,
  jsonb
) to service_role;
