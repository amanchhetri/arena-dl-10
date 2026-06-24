-- 0020_storage_group_proof.sql
-- Widen proof bucket SELECT so group-mates can render each other's photos
-- inline in the activity feed. Coexists with proof_select_own from Slice 1
-- Plan 4 migration 0008.

create policy proof_select_group_mates on storage.objects
  for select to authenticated
  using (
    bucket_id = 'proof'
    and exists (
      select 1
      from public.group_members me
      join public.group_members them on me.group_id = them.group_id
      where me.user_id = auth.uid()
        and them.user_id::text = (storage.foldername(name))[1]
    )
  );
