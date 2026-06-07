drop policy if exists "Platform connections can be inserted by their user" on public.platform_connections;
drop policy if exists "Platform connections can be updated by their user" on public.platform_connections;
drop policy if exists "Platform connections can be deleted by their user" on public.platform_connections;

revoke select, insert, update, delete on public.platform_connections from authenticated;

grant select (
  id,
  user_id,
  creator_id,
  channel_id,
  platform,
  provider_account_id,
  scopes,
  expires_at,
  connected_at,
  status,
  created_at,
  updated_at
) on public.platform_connections to authenticated;

grant all on public.platform_connections to service_role;
