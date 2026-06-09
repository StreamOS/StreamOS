alter table public.metrics_snapshots
add column if not exists captured_hour timestamptz;

update public.metrics_snapshots
set captured_hour = date_trunc('hour', captured_at)
where captured_hour is null;

with ranked_snapshots as (
  select
    id,
    row_number() over (
      partition by user_id, platform, captured_hour
      order by captured_at desc, created_at desc, id desc
    ) as snapshot_rank
  from public.metrics_snapshots
)
delete from public.metrics_snapshots as metrics_snapshot
using ranked_snapshots
where metrics_snapshot.id = ranked_snapshots.id
  and ranked_snapshots.snapshot_rank > 1;

alter table public.metrics_snapshots
alter column captured_hour set not null;

create or replace function public.set_metrics_snapshot_captured_hour()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.captured_hour = date_trunc('hour', new.captured_at);
  return new;
end;
$$;

drop trigger if exists metrics_snapshots_set_captured_hour on public.metrics_snapshots;

create trigger metrics_snapshots_set_captured_hour
before insert or update of captured_at on public.metrics_snapshots
for each row execute function public.set_metrics_snapshot_captured_hour();

create unique index if not exists metrics_snapshots_user_platform_captured_hour_key
on public.metrics_snapshots(user_id, platform, captured_hour);
