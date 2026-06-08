alter table public.platform_connections
add column if not exists provider_profile jsonb not null default '{}'::jsonb;
