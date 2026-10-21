-- ============================================================
-- MIGRATION: Inventory product photo + Laboratorio
-- 2026-10-19
--
-- 1. inventory.laboratorio — optional manufacturer/lab name.
-- 2. inventory.image_url — optional product photo (public URL into the
--    inventory-images storage bucket created below).
-- 3. storage bucket `inventory-images` (public read; product photos are
--    not sensitive — they render in POS/inventory without auth).
--    Writes restricted to org staff.
--
-- Run this in the Supabase SQL Editor (top to bottom).
-- ============================================================

alter table public.inventory
  add column if not exists laboratorio text,
  add column if not exists image_url text;

-- Bucket (idempotent), public read
insert into storage.buckets (id, name, public)
values ('inventory-images', 'inventory-images', true)
on conflict (id) do nothing;

-- Staff-only writes (upload/replace/delete); reads are public via the bucket
drop policy if exists "inventory_images_staff_write" on storage.objects;
create policy "inventory_images_staff_write" on storage.objects
  for all
  using (bucket_id = 'inventory-images' and is_org_staff())
  with check (bucket_id = 'inventory-images' and is_org_staff());

-- Verification
select
  (select count(*) from information_schema.columns
    where table_name = 'inventory' and column_name = 'laboratorio') as col_laboratorio,
  (select count(*) from information_schema.columns
    where table_name = 'inventory' and column_name = 'image_url') as col_image_url,
  (select count(*) from storage.buckets where id = 'inventory-images') as bucket;
