alter table public.metrics_snapshots enable row level security;

drop policy if exists "Metrics snapshots can be updated by their user" on public.metrics_snapshots;

create policy "Metrics snapshots can be updated by their user"
on public.metrics_snapshots for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.metrics_snapshots to authenticated;
grant all on public.metrics_snapshots to service_role;
