create index if not exists brand_assets_user_upload_metadata_status_updated_idx
on public.brand_assets(user_id, upload_metadata_status, updated_at desc);

create index if not exists brand_assets_user_preview_capability_status_updated_idx
on public.brand_assets(user_id, preview_capability_status, updated_at desc);
