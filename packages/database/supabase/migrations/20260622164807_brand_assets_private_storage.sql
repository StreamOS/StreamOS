insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', false)
on conflict (id) do update
set name = excluded.name,
    public = false;

drop policy if exists "Brand asset storage objects are visible to their owner" on storage.objects;
drop policy if exists "Brand asset storage objects can be inserted by their owner" on storage.objects;
drop policy if exists "Brand asset storage objects can be updated by their owner" on storage.objects;
drop policy if exists "Brand asset storage objects can be deleted by their owner" on storage.objects;

create policy "Brand asset storage objects are visible to their owner"
on storage.objects for select
to authenticated
using (
  bucket_id = 'brand-assets'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Brand asset storage objects can be inserted by their owner"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'brand-assets'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Brand asset storage objects can be deleted by their owner"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'brand-assets'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);
