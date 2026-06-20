do $$
begin
  if to_regclass('public.content_publication_fanouts') is null then
    create table public.content_publication_fanouts (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      content_job_id uuid not null,
      requested_by uuid not null,
      request_intent_hash text not null,
      snapshot_hash text not null,
      snapshot jsonb not null default '{}'::jsonb,
      fanout_policy text not null default 'prepare_valid_targets',
      fanout_status text not null default 'requested',
      review_status_at_request text not null,
      target_count integer not null default 0,
      validated_target_count integer not null default 0,
      blocked_target_count integer not null default 0,
      requested_at timestamptz not null default now(),
      validated_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint content_publication_fanouts_id_user_id_unique unique (id, user_id),
      constraint content_publication_fanouts_user_request_intent_unique unique (user_id, request_intent_hash),
      constraint content_publication_fanouts_content_job_user_fkey
        foreign key (content_job_id, user_id)
        references public.content_jobs(id, user_id) on delete cascade,
      constraint content_publication_fanouts_requested_by_fkey
        foreign key (requested_by)
        references auth.users(id) on delete cascade,
      constraint content_publication_fanouts_request_intent_hash_length
        check (char_length(request_intent_hash) = 64),
      constraint content_publication_fanouts_snapshot_hash_length
        check (char_length(snapshot_hash) = 64),
      constraint content_publication_fanouts_snapshot_object_check
        check (jsonb_typeof(snapshot) = 'object'),
      constraint content_publication_fanouts_fanout_policy_check
        check (
          fanout_policy in (
            'all_or_nothing_preflight',
            'prepare_valid_targets'
          )
        ),
      constraint content_publication_fanouts_fanout_status_check
        check (
          fanout_status in (
            'requested',
            'validated',
            'partially_validated',
            'blocked',
            'canceled'
          )
        ),
      constraint content_publication_fanouts_review_status_check
        check (
          review_status_at_request in (
            'needs_review',
            'approved',
            'rejected',
            'needs_changes'
          )
        ),
      constraint content_publication_fanouts_counts_check
        check (
          target_count >= 0
          and validated_target_count >= 0
          and blocked_target_count >= 0
          and target_count = validated_target_count + blocked_target_count
        )
    );
  end if;
end
$$;

alter table public.content_publication_fanouts enable row level security;

create index if not exists content_publication_fanouts_user_request_intent_unique_idx
on public.content_publication_fanouts(user_id, request_intent_hash);

create index if not exists content_publication_fanouts_user_status_created_idx
on public.content_publication_fanouts(user_id, fanout_status, created_at desc);

create index if not exists content_publication_fanouts_user_job_created_idx
on public.content_publication_fanouts(user_id, content_job_id, created_at desc);

drop policy if exists "Content publication fanouts are visible to their user" on public.content_publication_fanouts;
drop policy if exists "Content publication fanouts can be inserted by their user" on public.content_publication_fanouts;
drop policy if exists "Content publication fanouts can be updated by their user" on public.content_publication_fanouts;
drop policy if exists "Content publication fanouts can be deleted by their user" on public.content_publication_fanouts;

create policy "Content publication fanouts are visible to their user"
on public.content_publication_fanouts for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

revoke insert, update, delete on public.content_publication_fanouts from authenticated;

grant select on public.content_publication_fanouts to authenticated;
grant all on public.content_publication_fanouts to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publication_fanouts_id_user_id_unique'
      and conrelid = 'public.content_publication_fanouts'::regclass
  ) then
    alter table public.content_publication_fanouts
      add constraint content_publication_fanouts_id_user_id_unique unique (id, user_id);
  end if;
end
$$;

drop trigger if exists content_publication_fanouts_set_updated_at on public.content_publication_fanouts;
create trigger content_publication_fanouts_set_updated_at
before update on public.content_publication_fanouts
for each row execute function public.set_updated_at();

do $$
begin
  if to_regclass('public.content_publication_fanout_targets') is null then
    create table public.content_publication_fanout_targets (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      content_publication_fanout_id uuid not null,
      target_platform public.stream_platform not null,
      platform_connection_id uuid not null,
      content_publication_id uuid,
      request_intent_hash text not null,
      target_status text not null,
      block_reason text,
      block_message text,
      provider_overrides jsonb not null default '{}'::jsonb,
      capability_version text not null default '2026.06.p3.2.v1',
      capability_snapshot jsonb not null default '{}'::jsonb,
      validated_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint content_publication_fanout_targets_id_user_id_unique unique (id, user_id),
      constraint content_publication_fanout_targets_user_request_intent_unique unique (user_id, request_intent_hash),
      constraint content_publication_fanout_targets_fanout_user_fkey
        foreign key (content_publication_fanout_id, user_id)
        references public.content_publication_fanouts(id, user_id) on delete cascade,
      constraint content_publication_fanout_targets_publication_user_fkey
        foreign key (content_publication_id, user_id)
        references public.content_publications(id, user_id) on delete set null,
      constraint content_publication_fanout_targets_connection_user_fkey
        foreign key (platform_connection_id, user_id)
        references public.platform_connections(id, user_id) on delete cascade,
      constraint content_publication_fanout_targets_request_intent_hash_length
        check (char_length(request_intent_hash) = 64),
      constraint content_publication_fanout_targets_target_status_check
        check (target_status in ('validated', 'blocked')),
      constraint content_publication_fanout_targets_target_platform_check
        check (target_platform in ('youtube', 'tiktok')),
      constraint content_publication_fanout_targets_block_reason_length
        check (block_reason is null or char_length(block_reason) between 1 and 120),
      constraint content_publication_fanout_targets_block_message_length
        check (block_message is null or char_length(block_message) <= 4000),
      constraint content_publication_fanout_targets_provider_overrides_object_check
        check (jsonb_typeof(provider_overrides) = 'object'),
      constraint content_publication_fanout_targets_capability_snapshot_object_check
        check (jsonb_typeof(capability_snapshot) = 'object'),
      constraint content_publication_fanout_targets_status_consistency_check
        check (
          (target_status = 'validated' and content_publication_id is not null and block_reason is null)
          or (target_status = 'blocked' and content_publication_id is null and block_reason is not null)
        )
    );
  end if;
end
$$;

alter table public.content_publication_fanout_targets enable row level security;

create index if not exists content_publication_fanout_targets_user_fanout_created_idx
on public.content_publication_fanout_targets(user_id, content_publication_fanout_id, created_at desc);

create index if not exists content_publication_fanout_targets_user_platform_created_idx
on public.content_publication_fanout_targets(user_id, target_platform, created_at desc);

create index if not exists content_publication_fanout_targets_user_publication_idx
on public.content_publication_fanout_targets(user_id, content_publication_id);

drop policy if exists "Content publication fanout targets are visible to their user" on public.content_publication_fanout_targets;
drop policy if exists "Content publication fanout targets can be inserted by their user" on public.content_publication_fanout_targets;
drop policy if exists "Content publication fanout targets can be updated by their user" on public.content_publication_fanout_targets;
drop policy if exists "Content publication fanout targets can be deleted by their user" on public.content_publication_fanout_targets;

create policy "Content publication fanout targets are visible to their user"
on public.content_publication_fanout_targets for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

revoke insert, update, delete on public.content_publication_fanout_targets from authenticated;

grant select on public.content_publication_fanout_targets to authenticated;
grant all on public.content_publication_fanout_targets to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_publication_fanout_targets_id_user_id_unique'
      and conrelid = 'public.content_publication_fanout_targets'::regclass
  ) then
    alter table public.content_publication_fanout_targets
      add constraint content_publication_fanout_targets_id_user_id_unique unique (id, user_id);
  end if;
end
$$;

drop trigger if exists content_publication_fanout_targets_set_updated_at on public.content_publication_fanout_targets;
create trigger content_publication_fanout_targets_set_updated_at
before update on public.content_publication_fanout_targets
for each row execute function public.set_updated_at();
