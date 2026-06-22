alter table public.content_publication_fanouts
  add column if not exists last_action_at timestamptz,
  add column if not exists last_action_key text,
  add column if not exists last_action_result text,
  add column if not exists last_aggregate_refreshed_at timestamptz;

alter table public.content_publication_fanout_targets
  add column if not exists last_action_at timestamptz,
  add column if not exists last_action_key text,
  add column if not exists last_action_result text,
  add column if not exists last_block_reason text,
  add column if not exists last_rechecked_at timestamptz;

do $$
begin
  if to_regclass('public.content_publication_fanout_events') is null then
    create table public.content_publication_fanout_events (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      content_publication_fanout_id uuid not null,
      content_publication_fanout_target_id uuid,
      content_publication_id uuid,
      actor_id uuid not null references auth.users(id) on delete cascade,
      action_key text,
      event_type text not null,
      action_result text not null,
      previous_fanout_status text,
      previous_target_status text,
      fanout_status text not null,
      target_status text,
      source text not null default 'api-gateway',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      constraint content_publication_fanout_events_fanout_user_fkey
        foreign key (content_publication_fanout_id, user_id)
        references public.content_publication_fanouts(id, user_id) on delete restrict,
      constraint content_publication_fanout_events_target_user_fkey
        foreign key (content_publication_fanout_target_id, user_id)
        references public.content_publication_fanout_targets(id, user_id) on delete set null,
      constraint content_publication_fanout_events_publication_user_fkey
        foreign key (content_publication_id, user_id)
        references public.content_publications(id, user_id) on delete set null,
      constraint content_publication_fanout_events_event_type_check
        check (
          event_type in (
            'fanout_requested',
            'fanout_validated',
            'fanout_blocked',
            'target_rechecked',
            'child_retry_requested',
            'child_retry_queued',
            'parent_aggregate_refreshed',
            'manual_action_blocked'
          )
        ),
      constraint content_publication_fanout_events_action_key_check
        check (
          action_key is null
          or action_key in (
            'recheck_target',
            'refresh_parent_aggregate',
            'retry_child'
          )
        ),
      constraint content_publication_fanout_events_action_result_check
        check (
          action_result in (
            'blocked',
            'partial',
            'queued',
            'rechecked',
            'refreshed',
            'validated'
          )
        ),
      constraint content_publication_fanout_events_fanout_status_check
        check (
          fanout_status in (
            'requested',
            'validated',
            'partially_validated',
            'blocked',
            'canceled'
          )
        ),
      constraint content_publication_fanout_events_target_status_check
        check (
          target_status is null
          or target_status in ('validated', 'blocked')
        ),
      constraint content_publication_fanout_events_source_length_check
        check (char_length(source) between 1 and 220)
    );
  end if;
end
$$;

alter table public.content_publication_fanout_events enable row level security;

create index if not exists content_publication_fanout_events_user_fanout_created_idx
on public.content_publication_fanout_events(user_id, content_publication_fanout_id, created_at desc);

create index if not exists content_publication_fanout_events_user_target_created_idx
on public.content_publication_fanout_events(user_id, content_publication_fanout_target_id, created_at desc);

create index if not exists content_publication_fanout_events_user_event_created_idx
on public.content_publication_fanout_events(user_id, event_type, created_at desc);

drop policy if exists "Content publication fanout events are visible to their user" on public.content_publication_fanout_events;
drop policy if exists "Content publication fanout events can be inserted by their user" on public.content_publication_fanout_events;
drop policy if exists "Content publication fanout events can be updated by their user" on public.content_publication_fanout_events;
drop policy if exists "Content publication fanout events can be deleted by their user" on public.content_publication_fanout_events;

create policy "Content publication fanout events are visible to their user"
on public.content_publication_fanout_events for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

revoke insert, update, delete on public.content_publication_fanout_events from authenticated;

grant select on public.content_publication_fanout_events to authenticated;
grant all on public.content_publication_fanout_events to service_role;
