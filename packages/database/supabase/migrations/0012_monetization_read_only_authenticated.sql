drop policy if exists "Monetization events can be inserted by their user" on public.monetization_events;
drop policy if exists "Monetization events can be updated by their user" on public.monetization_events;
drop policy if exists "Monetization events can be deleted by their user" on public.monetization_events;

drop policy if exists "Monetization summaries can be inserted by their user" on public.monetization_summaries;
drop policy if exists "Monetization summaries can be updated by their user" on public.monetization_summaries;
drop policy if exists "Monetization summaries can be deleted by their user" on public.monetization_summaries;

revoke insert, update, delete on public.monetization_events from authenticated;
revoke insert, update, delete on public.monetization_summaries from authenticated;

grant select on public.monetization_events to authenticated;
grant select on public.monetization_summaries to authenticated;

grant all on public.monetization_events to service_role;
grant all on public.monetization_summaries to service_role;
