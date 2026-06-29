create table if not exists public.ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id text not null,
  request_id text not null,
  feature text not null,
  plan_at_request_time text not null,
  plan_source text not null,
  request_classification text not null,
  ledger_status text not null default 'reserved',
  estimated_usage_units integer not null,
  final_usage_units integer,
  error_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  usage_month date generated always as (
    date_trunc('month', created_at at time zone 'utc')::date
  ) stored,
  constraint ai_usage_ledger_user_request_unique unique (user_id, request_id),
  constraint ai_usage_ledger_id_user_id_unique unique (id, user_id),
  constraint ai_usage_ledger_feature_check
    check (feature in ('ai_assistant')),
  constraint ai_usage_ledger_plan_check
    check (plan_at_request_time in ('free', 'pro', 'agency')),
  constraint ai_usage_ledger_plan_source_check
    check (plan_source in ('persisted_server_plan', 'server_verified_billing')),
  constraint ai_usage_ledger_status_check
    check (ledger_status in ('reserved', 'recorded', 'denied')),
  constraint ai_usage_ledger_estimated_usage_units_check
    check (estimated_usage_units > 0),
  constraint ai_usage_ledger_final_usage_units_check
    check (final_usage_units is null or final_usage_units > 0),
  constraint ai_usage_ledger_error_category_check
    check (
      error_category is null
      or error_category in (
        'admission_denied',
        'budget_unavailable',
        'provider_rate_limit',
        'request_timeout',
        'policy_blocked',
        'upstream_unavailable',
        'unknown_failure'
      )
    ),
  constraint ai_usage_ledger_tenant_id_length_check
    check (char_length(tenant_id) between 1 and 200),
  constraint ai_usage_ledger_request_id_length_check
    check (char_length(request_id) between 1 and 120),
  constraint ai_usage_ledger_request_classification_length_check
    check (char_length(request_classification) between 1 and 120),
  constraint ai_usage_ledger_status_payload_check
    check (
      (
        ledger_status = 'reserved'
        and final_usage_units is null
        and error_category is null
      )
      or (
        ledger_status = 'recorded'
        and final_usage_units is not null
        and error_category is null
      )
      or (
        ledger_status = 'denied'
        and final_usage_units is null
        and error_category is not null
      )
    )
);

create index if not exists ai_usage_ledger_user_feature_month_created_idx
on public.ai_usage_ledger(user_id, feature, usage_month, created_at desc);

create index if not exists ai_usage_ledger_user_tenant_month_idx
on public.ai_usage_ledger(user_id, tenant_id, usage_month, created_at desc);

drop trigger if exists ai_usage_ledger_set_updated_at on public.ai_usage_ledger;

create trigger ai_usage_ledger_set_updated_at
before update on public.ai_usage_ledger
for each row execute function public.set_updated_at();

alter table public.ai_usage_ledger enable row level security;

drop policy if exists "AI usage ledger entries are visible to their user" on public.ai_usage_ledger;
drop policy if exists "AI usage ledger entries can be inserted by their user" on public.ai_usage_ledger;
drop policy if exists "AI usage ledger entries can be updated by their user" on public.ai_usage_ledger;
drop policy if exists "AI usage ledger entries can be deleted by their user" on public.ai_usage_ledger;

create policy "AI usage ledger entries are visible to their user"
on public.ai_usage_ledger for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

revoke insert, update, delete on public.ai_usage_ledger from authenticated;

grant select on public.ai_usage_ledger to authenticated;
grant all on public.ai_usage_ledger to service_role;
