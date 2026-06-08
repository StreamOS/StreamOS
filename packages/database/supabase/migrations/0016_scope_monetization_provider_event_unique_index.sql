drop index if exists public.monetization_events_provider_event_unique_idx;

create unique index monetization_events_provider_event_unique_idx
on public.monetization_events(user_id, provider, provider_event_id)
where provider_event_id is not null;
