alter table public.creators
add column if not exists avatar_url text,
add column if not exists bio text,
add column if not exists primary_language text not null default 'EN',
add column if not exists onboarding_step integer not null default 0,
add column if not exists onboarding_completed boolean not null default false;

alter table public.creators
drop constraint if exists creators_bio_length,
add constraint creators_bio_length
check (bio is null or char_length(bio) <= 280);

alter table public.creators
drop constraint if exists creators_primary_language_check,
add constraint creators_primary_language_check
check (primary_language in ('DE', 'EN', 'Other'));

alter table public.creators
drop constraint if exists creators_onboarding_step_check,
add constraint creators_onboarding_step_check
check (onboarding_step between 0 and 3);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'creators_user_id_unique'
      and conrelid = 'public.creators'::regclass
  ) then
    alter table public.creators
    add constraint creators_user_id_unique unique (user_id);
  end if;
end;
$$;

create or replace function public.create_creator_for_auth_user()
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

  insert into public.creators (
    id,
    user_id,
    email,
    display_name,
    avatar_url,
    onboarding_step,
    onboarding_completed
  )
  select
    new.id,
    new.id,
    new.email,
    coalesce(profile_display_name, 'StreamOS Creator'),
    profile_avatar_url,
    0,
    false
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
