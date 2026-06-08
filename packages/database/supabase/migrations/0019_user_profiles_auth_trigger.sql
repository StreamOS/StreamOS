create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  display_name text not null default 'StreamOS Creator',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_user_id_unique unique (user_id),
  constraint user_profiles_display_name_length check (char_length(display_name) between 1 and 120)
);

create index if not exists user_profiles_user_id_idx
on public.user_profiles(user_id);

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;

create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

alter table public.user_profiles enable row level security;

drop policy if exists "User profiles are visible to their user" on public.user_profiles;
drop policy if exists "User profiles can be inserted by their user" on public.user_profiles;
drop policy if exists "User profiles can be updated by their user" on public.user_profiles;
drop policy if exists "User profiles can be deleted by their user" on public.user_profiles;

create policy "User profiles are visible to their user"
on public.user_profiles for select
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

create policy "User profiles can be inserted by their user"
on public.user_profiles for insert
to authenticated
with check (auth.uid() is not null and user_id = auth.uid());

create policy "User profiles can be updated by their user"
on public.user_profiles for update
to authenticated
using (auth.uid() is not null and user_id = auth.uid())
with check (auth.uid() is not null and user_id = auth.uid());

create policy "User profiles can be deleted by their user"
on public.user_profiles for delete
to authenticated
using (auth.uid() is not null and user_id = auth.uid());

grant select, insert, update, delete on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;

create or replace function public.create_user_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_display_name text;
  profile_avatar_url text;
begin
  profile_display_name = nullif(
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    ),
    ''
  );
  profile_avatar_url = nullif(
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    ),
    ''
  );

  insert into public.user_profiles (
    user_id,
    email,
    display_name,
    avatar_url
  )
  values (
    new.id,
    new.email,
    coalesce(profile_display_name, 'StreamOS Creator'),
    profile_avatar_url
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_user_profile_for_auth_user() from public;
revoke all on function public.create_user_profile_for_auth_user() from anon;
revoke all on function public.create_user_profile_for_auth_user() from authenticated;

drop trigger if exists auth_users_create_user_profile on auth.users;

create trigger auth_users_create_user_profile
after insert on auth.users
for each row execute function public.create_user_profile_for_auth_user();

insert into public.user_profiles (
  user_id,
  email,
  display_name,
  avatar_url
)
select
  users.id,
  users.email,
  coalesce(
    nullif(users.raw_user_meta_data ->> 'name', ''),
    nullif(users.raw_user_meta_data ->> 'full_name', ''),
    nullif(split_part(users.email, '@', 1), ''),
    'StreamOS Creator'
  ),
  coalesce(
    nullif(users.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(users.raw_user_meta_data ->> 'picture', '')
  )
from auth.users
where not exists (
  select 1
  from public.user_profiles
  where user_profiles.user_id = users.id
);
