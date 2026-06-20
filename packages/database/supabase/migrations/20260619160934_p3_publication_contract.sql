do $$
begin
  if to_regclass('public.content_publications') is null then
    create table public.content_publications (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      content_job_id uuid not null,
      platform_connection_id uuid not null,
      target_platform public.stream_platform not null,
      publication_status text not null default 'requested',
      review_status_at_request text not null,
      requested_by uuid not null,
      requested_at timestamptz not null default now(),
      validated_at timestamptz,
      request_intent_hash text not null,
      snapshot_hash text not null,
      snapshot jsonb not null default '{}'::jsonb,
      validation_code text,
      validation_message text,
      validation_metadata jsonb not null default '{}'::jsonb,
      retry_count integer not null default 0,
      max_retries integer not null default 0,
      next_retry_at timestamptz,
      external_post_id text,
      external_url text,
      published_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint content_publications_id_user_id_unique unique (id, user_id),
      constraint content_publications_publication_status_check
        check (
          publication_status in (
            'requested',
            'validated',
            'queued',
            'publishing',
            'published',
            'failed_retryable',
            'failed_permanent',
            'canceled',
            'rejected'
          )
        ),
      constraint content_publications_review_status_check
        check (review_status_at_request in ('needs_review', 'approved', 'rejected', 'needs_changes')),
      constraint content_publications_request_intent_hash_length
        check (char_length(request_intent_hash) = 64),
      constraint content_publications_snapshot_hash_length
        check (char_length(snapshot_hash) = 64),
      constraint content_publications_validation_code_length
        check (validation_code is null or char_length(validation_code) between 1 and 120),
      constraint content_publications_validation_message_length
        check (validation_message is null or char_length(validation_message) <= 4000),
      constraint content_publications_external_post_id_length
        check (external_post_id is null or char_length(external_post_id) <= 180),
      constraint content_publications_external_url_length
        check (external_url is null or char_length(external_url) <= 2048),
      constraint content_publications_requested_by_fkey
        foreign key (requested_by)
        references auth.users(id) on delete cascade,
      constraint content_publications_content_job_user_fkey
        foreign key (content_job_id, user_id)
        references public.content_jobs(id, user_id) on delete cascade,
      constraint content_publications_connection_user_fkey
        foreign key (platform_connection_id, user_id)
        references public.platform_connections(id, user_id) on delete cascade
    );
  end if;
end
$$;

alter table public.content_publications enable row level security;

create index if not exists content_publications_user_request_intent_unique_idx
on public.content_publications(user_id, request_intent_hash);

create index if not exists content_publications_user_status_created_idx
on public.content_publications(user_id, publication_status, created_at desc);

create index if not exists content_publications_user_job_created_idx
on public.content_publications(user_id, content_job_id, created_at desc);

create index if not exists content_publications_user_platform_created_idx
on public.content_publications(user_id, target_platform, created_at desc);

drop policy if exists "Content publications are visible to their user" on public.content_publications;
drop policy if exists "Content publications can be inserted by their user" on public.content_publications;
drop policy if exists "Content publications can be updated by their user" on public.content_publications;
drop policy if exists "Content publications can be deleted by their user" on public.content_publications;

create policy "Content publications are visible to their user"
on public.content_publications for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

revoke insert, update, delete on public.content_publications from authenticated;

grant select on public.content_publications to authenticated;
grant all on public.content_publications to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publications_id_user_id_unique'
      and conrelid = 'public.content_publications'::regclass
  ) then
    alter table public.content_publications
      add constraint content_publications_id_user_id_unique unique (id, user_id);
  end if;
end
$$;

do $$
begin
  if to_regclass('public.content_publication_events') is null then
    create table public.content_publication_events (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      content_publication_id uuid not null,
      actor_id uuid not null references auth.users(id) on delete cascade,
      event_type text not null,
      previous_publication_status text,
      publication_status text not null,
      source text not null default 'api-gateway',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      constraint content_publication_events_publication_user_fkey
        foreign key (content_publication_id, user_id)
        references public.content_publications(id, user_id) on delete cascade,
      constraint content_publication_events_event_type_check
        check (
          event_type in (
            'requested',
            'validated',
            'rejected',
            'canceled',
            'queued',
            'publishing',
            'published',
            'failed_retryable',
            'failed_permanent'
          )
        ),
      constraint content_publication_events_previous_status_check
        check (
          previous_publication_status is null
          or previous_publication_status in (
            'requested',
            'validated',
            'queued',
            'publishing',
            'published',
            'failed_retryable',
            'failed_permanent',
            'canceled',
            'rejected'
          )
        ),
      constraint content_publication_events_publication_status_check
        check (
          publication_status in (
            'requested',
            'validated',
            'queued',
            'publishing',
            'published',
            'failed_retryable',
            'failed_permanent',
            'canceled',
            'rejected'
          )
        ),
      constraint content_publication_events_source_length_check
        check (char_length(source) between 1 and 220)
    );
  end if;
end
$$;

alter table public.content_publication_events enable row level security;

create index if not exists content_publication_events_user_publication_created_idx
on public.content_publication_events(user_id, content_publication_id, created_at desc);

create index if not exists content_publication_events_user_event_created_idx
on public.content_publication_events(user_id, event_type, created_at desc);

drop policy if exists "Content publication events are visible to their user" on public.content_publication_events;
drop policy if exists "Content publication events can be inserted by their user" on public.content_publication_events;
drop policy if exists "Content publication events can be updated by their user" on public.content_publication_events;
drop policy if exists "Content publication events can be deleted by their user" on public.content_publication_events;

create policy "Content publication events are visible to their user"
on public.content_publication_events for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

revoke insert, update, delete on public.content_publication_events from authenticated;

grant select on public.content_publication_events to authenticated;
grant all on public.content_publication_events to service_role;
