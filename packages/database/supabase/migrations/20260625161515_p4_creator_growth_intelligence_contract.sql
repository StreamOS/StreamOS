do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.metrics_snapshots'::regclass
      and contype in ('p', 'u')
      and conkey = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.metrics_snapshots'::regclass
            and attname = 'id'
            and attnum > 0
            and not attisdropped
        ),
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.metrics_snapshots'::regclass
            and attname = 'user_id'
            and attnum > 0
            and not attisdropped
        )
      ]::smallint[]
  )
  and not exists (
    select 1
    from pg_index
    where indrelid = 'public.metrics_snapshots'::regclass
      and indisunique
      and indpred is null
      and indexprs is null
      and indnkeyatts = 2
      and indnatts = 2
      and indkey::smallint[] = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.metrics_snapshots'::regclass
            and attname = 'id'
            and attnum > 0
            and not attisdropped
        ),
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.metrics_snapshots'::regclass
            and attname = 'user_id'
            and attnum > 0
            and not attisdropped
        )
      ]::smallint[]
  ) then
    alter table public.metrics_snapshots
    add constraint metrics_snapshots_id_user_id_unique unique (id, user_id);
  end if;
end
$$;

do $$
begin
  if to_regclass('public.creator_growth_intelligence') is null then
    create table public.creator_growth_intelligence (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      creator_id uuid,
      channel_id uuid,
      platform public.stream_platform,
      content_publication_id uuid,
      content_job_id uuid,
      metrics_snapshot_id uuid,
      intelligence_category text not null,
      recommendation_type text not null,
      recommendation_status text not null default 'needs_review',
      title text not null,
      summary text not null,
      rationale text,
      score integer,
      confidence integer,
      evidence jsonb not null default '{}'::jsonb,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint creator_growth_intelligence_id_user_id_unique unique (id, user_id),
      constraint creator_growth_intelligence_creator_user_fkey
        foreign key (creator_id, user_id)
        references public.creators(id, user_id) on delete set null (creator_id),
      constraint creator_growth_intelligence_channel_user_fkey
        foreign key (channel_id, user_id)
        references public.channels(id, user_id) on delete set null (channel_id),
      constraint creator_growth_intelligence_content_publication_user_fkey
        foreign key (content_publication_id, user_id)
        references public.content_publications(id, user_id)
        on delete set null (content_publication_id),
      constraint creator_growth_intelligence_content_job_user_fkey
        foreign key (content_job_id, user_id)
        references public.content_jobs(id, user_id)
        on delete set null (content_job_id),
      constraint creator_growth_intelligence_metrics_snapshot_user_fkey
        foreign key (metrics_snapshot_id, user_id)
        references public.metrics_snapshots(id, user_id)
        on delete set null (metrics_snapshot_id),
      constraint creator_growth_intelligence_category_check check (
        intelligence_category in (
          'channel_seo',
          'content_metadata',
          'publish_timing',
          'platform_fit',
          'engagement_opportunity'
        )
      ),
      constraint creator_growth_intelligence_type_check check (
        recommendation_type in (
          'title',
          'description',
          'tags',
          'hashtags',
          'thumbnail_prompt',
          'schedule_hint',
          'platform_positioning'
        )
      ),
      constraint creator_growth_intelligence_status_check check (
        recommendation_status in ('needs_review', 'approved', 'rejected', 'needs_changes')
      ),
      constraint creator_growth_intelligence_title_length_check check (
        char_length(title) between 1 and 180
      ),
      constraint creator_growth_intelligence_summary_length_check check (
        char_length(summary) between 1 and 4000
      ),
      constraint creator_growth_intelligence_rationale_length_check check (
        rationale is null or char_length(rationale) <= 4000
      ),
      constraint creator_growth_intelligence_score_check check (
        score is null or score between 1 and 100
      ),
      constraint creator_growth_intelligence_confidence_check check (
        confidence is null or confidence between 1 and 100
      ),
      constraint creator_growth_intelligence_evidence_object_check check (
        jsonb_typeof(evidence) = 'object'
      ),
      constraint creator_growth_intelligence_metadata_object_check check (
        jsonb_typeof(metadata) = 'object'
      )
    );
  end if;
end
$$;

alter table public.creator_growth_intelligence enable row level security;

create index if not exists creator_growth_intelligence_user_created_idx
on public.creator_growth_intelligence(user_id, created_at desc);

create index if not exists creator_growth_intelligence_user_status_created_idx
on public.creator_growth_intelligence(user_id, recommendation_status, created_at desc);

create index if not exists creator_growth_intelligence_user_category_created_idx
on public.creator_growth_intelligence(user_id, intelligence_category, created_at desc);

create index if not exists creator_growth_intelligence_user_platform_created_idx
on public.creator_growth_intelligence(user_id, platform, created_at desc);

create index if not exists creator_growth_intelligence_creator_user_created_idx
on public.creator_growth_intelligence(creator_id, user_id, created_at desc);

create index if not exists creator_growth_intelligence_channel_user_created_idx
on public.creator_growth_intelligence(channel_id, user_id, created_at desc);

create index if not exists creator_growth_intelligence_publication_user_created_idx
on public.creator_growth_intelligence(content_publication_id, user_id, created_at desc);

create index if not exists creator_growth_intelligence_job_user_created_idx
on public.creator_growth_intelligence(content_job_id, user_id, created_at desc);

create index if not exists creator_growth_intelligence_metrics_user_created_idx
on public.creator_growth_intelligence(metrics_snapshot_id, user_id, created_at desc);

drop trigger if exists creator_growth_intelligence_set_updated_at on public.creator_growth_intelligence;
create trigger creator_growth_intelligence_set_updated_at
before update on public.creator_growth_intelligence
for each row execute function public.set_updated_at();

drop policy if exists "Creator growth intelligence are visible to their user" on public.creator_growth_intelligence;
drop policy if exists "Creator growth intelligence can be inserted by their user" on public.creator_growth_intelligence;
drop policy if exists "Creator growth intelligence can be updated by their user" on public.creator_growth_intelligence;
drop policy if exists "Creator growth intelligence can be deleted by their user" on public.creator_growth_intelligence;

create policy "Creator growth intelligence are visible to their user"
on public.creator_growth_intelligence for select
to authenticated
using (user_id = (select auth.uid()));

revoke insert, update, delete on public.creator_growth_intelligence from authenticated;

grant select on public.creator_growth_intelligence to authenticated;
grant all on public.creator_growth_intelligence to service_role;
