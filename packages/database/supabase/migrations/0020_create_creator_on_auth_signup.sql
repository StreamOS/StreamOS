alter table public.creators
add column if not exists email text;

update public.creators
set email = auth_users.email
from auth.users as auth_users
where creators.user_id = auth_users.id
  and creators.email is null;

create or replace function public.create_creator_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_display_name text;
begin
  profile_display_name = nullif(
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    ),
    ''
  );

  insert into public.creators (
    id,
    user_id,
    email,
    display_name
  )
  select
    new.id,
    new.id,
    new.email,
    coalesce(profile_display_name, 'StreamOS Creator')
  where not exists (
    select 1
    from public.creators
    where creators.user_id = new.id
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_creator_for_auth_user() from public;
revoke all on function public.create_creator_for_auth_user() from anon;
revoke all on function public.create_creator_for_auth_user() from authenticated;

drop trigger if exists auth_users_create_creator on auth.users;

create trigger auth_users_create_creator
after insert on auth.users
for each row execute function public.create_creator_for_auth_user();

insert into public.creators (
  id,
  user_id,
  email,
  display_name
)
select
  users.id,
  users.id,
  users.email,
  coalesce(
    nullif(users.raw_user_meta_data ->> 'name', ''),
    nullif(users.raw_user_meta_data ->> 'full_name', ''),
    nullif(split_part(users.email, '@', 1), ''),
    'StreamOS Creator'
  )
from auth.users
where not exists (
  select 1
  from public.creators
  where creators.user_id = users.id
)
on conflict (id) do nothing;
