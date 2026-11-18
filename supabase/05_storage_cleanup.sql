-- JewelAR: let shop owners see their stored images.
-- Supabase Storage only deletes a file when the user can also SELECT it. Without this policy,
-- deleting a piece left its image behind on the server.
-- Run once in Supabase Dashboard -> SQL Editor.

drop policy if exists "owners see images" on storage.objects;
create policy "owners see images" on storage.objects
  for select to authenticated using (bucket_id = 'jewellery' and public.is_shop_owner());
