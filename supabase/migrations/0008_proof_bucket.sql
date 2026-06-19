-- 0008_proof_bucket.sql
-- Private storage bucket for challenge proof media (photos in Slice 1).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'proof',
  'proof',
  false,
  10 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy proof_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'proof'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy proof_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'proof'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy proof_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'proof'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
