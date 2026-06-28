do $$
begin
  if to_regclass('public.user_plan_models') is null then
    create table public.user_plan_models (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      plan text not null default 'free',
      source text not null default 'persisted_server_plan',
      billing_status text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint user_plan_models_user_id_unique unique (user_id),
      constraint user_plan_models_id_user_id_unique unique (id, user_id),
      constraint user_plan_models_plan_check
        check (plan in ('free', 'pro', 'agency')),
      constraint user_plan_models_source_check
        check (source in ('persisted_server_plan', 'server_verified_billing')),
      constraint user_plan_models_billing_status_check
        check (
          billing_status is null
          or billing_status in (
            'active',
            'trialing',
            'past_due',
            'canceled',
            'incomplete',
            'unknown'
          )
        )
    );
  end if;
end
$$;

create index if not exists user_plan_models_user_id_idx
on public.user_plan_models(user_id);

drop trigger if exists user_plan_models_set_updated_at on public.user_plan_models;

create trigger user_plan_models_set_updated_at
before update on public.user_plan_models
for each row execute function public.set_updated_at();

alter table public.user_plan_models enable row level security;

drop policy if exists "User plan models are visible to their user" on public.user_plan_models;
drop policy if exists "User plan models can be inserted by their user" on public.user_plan_models;
drop policy if exists "User plan models can be updated by their user" on public.user_plan_models;
drop policy if exists "User plan models can be deleted by their user" on public.user_plan_models;

create policy "User plan models are visible to their user"
on public.user_plan_models for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

revoke insert, update, delete on public.user_plan_models from authenticated;

grant select on public.user_plan_models to authenticated;
grant all on public.user_plan_models to service_role;

create or replace function public.create_user_plan_model_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_plan_models (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_user_plan_model_for_auth_user() from public;
revoke all on function public.create_user_plan_model_for_auth_user() from anon;
revoke all on function public.create_user_plan_model_for_auth_user() from authenticated;

drop trigger if exists auth_users_create_user_plan_model on auth.users;

create trigger auth_users_create_user_plan_model
after insert on auth.users
for each row execute function public.create_user_plan_model_for_auth_user();

insert into public.user_plan_models (user_id)
select
  users.id
from auth.users users
where not exists (
  select 1
  from public.user_plan_models
  where user_plan_models.user_id = users.id
);
