create or replace function public.resolve_brand_asset_upload_metadata_status(
  asset_metadata jsonb
)
returns text
language plpgsql
immutable
as $$
declare
  upload jsonb;
  file_size_bytes_text text;
  normalized_filename text;
  has_invalid_field boolean := false;
  has_missing_field boolean := false;
begin
  if asset_metadata is null or jsonb_typeof(asset_metadata) <> 'object' then
    return 'unavailable';
  end if;

  if not (asset_metadata ? 'upload') or asset_metadata -> 'upload' is null then
    return 'unavailable';
  end if;

  upload := asset_metadata -> 'upload';

  if jsonb_typeof(upload) <> 'object' then
    return 'invalid';
  end if;

  if not (upload ? 'content_type') or upload -> 'content_type' is null then
    has_missing_field := true;
  elsif
    jsonb_typeof(upload -> 'content_type') <> 'string'
    or char_length(btrim(upload ->> 'content_type')) = 0
  then
    has_invalid_field := true;
  end if;

  if not (upload ? 'file_extension') or upload -> 'file_extension' is null then
    has_missing_field := true;
  elsif
    jsonb_typeof(upload -> 'file_extension') <> 'string'
    or char_length(btrim(upload ->> 'file_extension')) = 0
  then
    has_invalid_field := true;
  end if;

  if not (upload ? 'file_size_bytes') or upload -> 'file_size_bytes' is null then
    has_missing_field := true;
  elsif jsonb_typeof(upload -> 'file_size_bytes') <> 'number' then
    has_invalid_field := true;
  else
    file_size_bytes_text := upload ->> 'file_size_bytes';

    if file_size_bytes_text !~ '^[0-9]+$' then
      has_invalid_field := true;
    elsif file_size_bytes_text::numeric <= 0 then
      has_invalid_field := true;
    end if;
  end if;

  if not (upload ? 'stored_filename') or upload -> 'stored_filename' is null then
    has_missing_field := true;
  elsif jsonb_typeof(upload -> 'stored_filename') <> 'string' then
    has_invalid_field := true;
  else
    normalized_filename := btrim(upload ->> 'stored_filename');

    if
      char_length(normalized_filename) = 0
      or position('/' in normalized_filename) > 0
      or position(E'\\' in normalized_filename) > 0
      or position('://' in normalized_filename) > 0
      or position('?' in normalized_filename) > 0
      or position('#' in normalized_filename) > 0
    then
      has_invalid_field := true;
    end if;
  end if;

  if has_invalid_field then
    return 'invalid';
  end if;

  if has_missing_field then
    return 'unavailable';
  end if;

  return 'available';
end;
$$;

create or replace function public.resolve_brand_asset_preview_capability_status(
  asset_storage_bucket text,
  asset_storage_path text,
  asset_user_id uuid,
  asset_metadata jsonb
)
returns text
language plpgsql
immutable
as $$
declare
  path_segments text[];
  basename text;
  path_extension text;
  normalized_content_type text;
  normalized_file_extension text;
  upload_metadata_status text;
begin
  if asset_storage_bucket is null and asset_storage_path is null then
    return 'missing_storage';
  end if;

  if
    asset_storage_bucket is distinct from 'brand-assets'
    or asset_storage_path is null
    or char_length(btrim(asset_storage_path)) = 0
    or asset_storage_path like '/%'
    or position(E'\\' in asset_storage_path) > 0
    or position('://' in asset_storage_path) > 0
    or position('?' in asset_storage_path) > 0
    or position('#' in asset_storage_path) > 0
  then
    return 'invalid_storage';
  end if;

  path_segments := string_to_array(asset_storage_path, '/');

  if array_length(path_segments, 1) < 4 then
    return 'invalid_storage';
  end if;

  if path_segments[1] is distinct from asset_user_id::text then
    return 'invalid_storage';
  end if;

  if exists (
    select 1
    from unnest(path_segments) as path_segment(value)
    where
      value is null
      or char_length(value) = 0
      or value in ('.', '..')
  ) then
    return 'invalid_storage';
  end if;

  basename := path_segments[array_length(path_segments, 1)];
  path_extension := lower(reverse(split_part(reverse(basename), '.', 1)));

  if
    char_length(path_extension) = 0
    or path_extension = lower(basename)
    or path_extension not in ('png', 'jpg', 'jpeg', 'webp')
  then
    return 'unsupported';
  end if;

  upload_metadata_status :=
    public.resolve_brand_asset_upload_metadata_status(asset_metadata);

  if upload_metadata_status = 'invalid' then
    return 'unsupported';
  end if;

  if upload_metadata_status <> 'available' then
    return 'previewable';
  end if;

  normalized_content_type :=
    lower(btrim(asset_metadata -> 'upload' ->> 'content_type'));
  normalized_file_extension :=
    lower(btrim(asset_metadata -> 'upload' ->> 'file_extension'));

  if
    char_length(normalized_content_type) = 0
    or char_length(normalized_file_extension) = 0
    or normalized_file_extension <> path_extension
  then
    return 'unsupported';
  end if;

  if normalized_content_type = 'image/png' then
    return case
      when normalized_file_extension = 'png' then 'previewable'
      else 'unsupported'
    end;
  end if;

  if normalized_content_type = 'image/jpeg' then
    return case
      when normalized_file_extension in ('jpg', 'jpeg') then 'previewable'
      else 'unsupported'
    end;
  end if;

  if normalized_content_type = 'image/webp' then
    return case
      when normalized_file_extension = 'webp' then 'previewable'
      else 'unsupported'
    end;
  end if;

  return 'unsupported';
end;
$$;

alter table public.brand_assets
add column if not exists upload_metadata_status text
generated always as (
  public.resolve_brand_asset_upload_metadata_status(metadata)
) stored,
add column if not exists preview_capability_status text
generated always as (
  public.resolve_brand_asset_preview_capability_status(
    storage_bucket,
    storage_path,
    user_id,
    metadata
  )
) stored;

alter table public.brand_assets
alter column upload_metadata_status set not null,
alter column preview_capability_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'brand_assets_upload_metadata_status_check'
      and conrelid = 'public.brand_assets'::regclass
  ) then
    alter table public.brand_assets
    add constraint brand_assets_upload_metadata_status_check
    check (
      upload_metadata_status in ('available', 'invalid', 'unavailable')
    )
    not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'brand_assets_preview_capability_status_check'
      and conrelid = 'public.brand_assets'::regclass
  ) then
    alter table public.brand_assets
    add constraint brand_assets_preview_capability_status_check
    check (
      preview_capability_status in (
        'previewable',
        'unsupported',
        'missing_storage',
        'invalid_storage'
      )
    )
    not valid;
  end if;
end;
$$;

alter table public.brand_assets
validate constraint brand_assets_upload_metadata_status_check;

alter table public.brand_assets
validate constraint brand_assets_preview_capability_status_check;
