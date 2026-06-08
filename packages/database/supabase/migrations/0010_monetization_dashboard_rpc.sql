create or replace function public.get_monetization_dashboard(
  p_period text default 'last_30_days'
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with selected_period as (
  select case
    when p_period in ('last_7_days', 'last_30_days', 'all_time') then p_period
    else 'last_30_days'
  end as value
),
bounds as (
  select
    value as period,
    case value
      when 'last_7_days' then now() - interval '7 days'
      when 'last_30_days' then now() - interval '30 days'
      else null
    end as since
  from selected_period
),
filtered_events as (
  select
    monetization_events.id,
    monetization_events.provider,
    monetization_events.event_type,
    monetization_events.status,
    monetization_events.source,
    monetization_events.amount_cents,
    monetization_events.currency,
    monetization_events.occurred_at
  from public.monetization_events
  cross join bounds
  where monetization_events.user_id = (select auth.uid())
    and (
      bounds.since is null
      or monetization_events.occurred_at >= bounds.since
    )
),
confirmed_events as (
  select *
  from filtered_events
  where status = 'confirmed'
),
total_revenue as (
  select coalesce(sum(amount_cents), 0)::bigint as amount_cents
  from confirmed_events
),
reporting_window as (
  select greatest(
    1,
    case
      when bounds.since is null then (
        select greatest(
          1,
          count(distinct date_trunc('day', occurred_at)::date)
        )
        from confirmed_events
      )
      else ceil(extract(epoch from (now() - bounds.since)) / 86400)::integer
    end
  ) as day_count
  from bounds
),
primary_currency as (
  select coalesce(
    (
      select currency
      from confirmed_events
      group by currency
      order by sum(amount_cents) desc, currency asc
      limit 1
    ),
    'USD'
  ) as currency
),
platform_revenue as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'provider',
        provider,
        'amount_cents',
        amount_cents,
        'event_count',
        event_count
      )
      order by amount_cents desc, provider asc
    ),
    '[]'::jsonb
  ) as items
  from (
    select
      provider,
      coalesce(sum(amount_cents), 0)::bigint as amount_cents,
      count(*)::integer as event_count
    from confirmed_events
    group by provider
  ) grouped
),
event_type_revenue as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'event_type',
        event_type,
        'amount_cents',
        amount_cents,
        'event_count',
        event_count
      )
      order by amount_cents desc, event_type asc
    ),
    '[]'::jsonb
  ) as items
  from (
    select
      event_type,
      coalesce(sum(amount_cents), 0)::bigint as amount_cents,
      count(*)::integer as event_count
    from confirmed_events
    group by event_type
  ) grouped
),
daily_revenue as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day',
        day,
        'amount_cents',
        amount_cents
      )
      order by day asc
    ),
    '[]'::jsonb
  ) as items
  from (
    select
      date_trunc('day', occurred_at)::date as day,
      coalesce(sum(amount_cents), 0)::bigint as amount_cents
    from confirmed_events
    group by date_trunc('day', occurred_at)::date
  ) grouped
),
recent_events as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',
        id,
        'provider',
        provider,
        'event_type',
        event_type,
        'status',
        status,
        'source',
        source,
        'amount_cents',
        amount_cents,
        'currency',
        currency,
        'occurred_at',
        occurred_at
      )
      order by occurred_at desc
    ),
    '[]'::jsonb
  ) as items
  from (
    select *
    from filtered_events
    order by occurred_at desc
    limit 12
  ) latest
)
select jsonb_build_object(
  'period',
  (select period from bounds),
  'currency',
  (select currency from primary_currency),
  'total_revenue_cents',
  (select amount_cents from total_revenue),
  'active_platforms',
  (
    select count(distinct provider)::integer
    from confirmed_events
    where amount_cents > 0
  ),
  'avg_revenue_per_day_cents',
  (
    select floor(total_revenue.amount_cents::numeric / reporting_window.day_count)::bigint
    from total_revenue
    cross join reporting_window
  ),
  'revenue_by_platform',
  (select items from platform_revenue),
  'revenue_by_event_type',
  (select items from event_type_revenue),
  'revenue_over_time',
  (select items from daily_revenue),
  'recent_events',
  (select items from recent_events)
);
$$;

grant execute on function public.get_monetization_dashboard(text) to authenticated;
