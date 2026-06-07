alter table public.platform_connections
add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'platform_connections_metadata_object_check'
      and conrelid = 'public.platform_connections'::regclass
  ) then
    alter table public.platform_connections
    add constraint platform_connections_metadata_object_check
    check (jsonb_typeof(metadata) = 'object');
  end if;
end $$;
