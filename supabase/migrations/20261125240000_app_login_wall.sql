-- ============================================================
-- Customer app login wall (2026-11-25): no prices for logged-out visitors.
-- The UI now shows only a welcome screen without a session; this closes
-- the same data at the API level (anon key is public):
--   · inventory_catalog (shop catalog + prices) → authenticated only
--   · apolo_generic_search (price comparison)   → authenticated only
-- inventory_catalog gains `laboratorio` (shown as the product's brand in
-- the shop instead of the barcode). Columns are appended → same view.
-- ============================================================
create or replace view public.inventory_catalog as
 select id, org_id, name, use, price, quantity, requires_prescription, category, image_url, barcode, low_stock_threshold, laboratorio
   from public.inventory;

revoke all on public.inventory_catalog from anon;
grant select on public.inventory_catalog to authenticated;

revoke execute on function public.apolo_generic_search(uuid, text) from anon;
