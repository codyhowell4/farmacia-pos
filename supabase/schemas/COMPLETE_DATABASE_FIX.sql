-- ============================================================
-- COMPLETE DATABASE FIX - Run this in Supabase SQL Editor
-- Fixes all column name mismatches between app and schema
-- ============================================================

-- ============================================================
-- 1. INVENTORY TABLE FIXES
-- ============================================================

-- Rename use_description to use (app expects "use")
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_name = 'inventory' and column_name = 'use_description'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_name = 'inventory' and column_name = 'use'
  ) then
    alter table inventory rename column use_description to "use";
    raise notice 'Renamed inventory.use_description to use';
  else
    raise notice 'inventory.use column already exists or use_description not found';
  end if;
end $$;

-- ============================================================
-- 2. SALES TABLE FIXES
-- ============================================================

-- Rename discount_percent to discount_value (app sends discount_value)
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_name = 'sales' and column_name = 'discount_percent'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_name = 'sales' and column_name = 'discount_value'
  ) then
    alter table sales rename column discount_percent to discount_value;
    raise notice 'Renamed sales.discount_percent to discount_value';
  else
    raise notice 'sales.discount_value column already exists or discount_percent not found';
  end if;
end $$;

-- Add iva_enabled column if missing
alter table sales add column if not exists iva_enabled boolean default true;

-- Add salesperson column if missing (app sends this directly)
alter table sales add column if not exists salesperson text;

-- ============================================================
-- 3. SALE_ITEMS TABLE FIXES
-- ============================================================

-- Rename unit_price to price (app sends price)
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_name = 'sale_items' and column_name = 'unit_price'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_name = 'sale_items' and column_name = 'price'
  ) then
    alter table sale_items rename column unit_price to price;
    raise notice 'Renamed sale_items.unit_price to price';
  else
    raise notice 'sale_items.price column already exists or unit_price not found';
  end if;
end $$;

-- ============================================================
-- 4. CREATE HELPER FUNCTION FOR INVENTORY DECREMENT
-- ============================================================

create or replace function decrement_inventory(p_id uuid, p_qty integer)
returns void language plpgsql security definer as $$
begin
  update inventory
  set 
    quantity = quantity - p_qty,
    sales_count = sales_count + p_qty,
    updated_at = now()
  where id = p_id;
end;
$$;

-- ============================================================
-- 5. VERIFY ALL FIXES
-- ============================================================

select 'INVENTORY COLUMNS' as table_name;
select column_name, data_type 
from information_schema.columns 
where table_name = 'inventory' 
order by ordinal_position;

select 'SALES COLUMNS' as table_name;
select column_name, data_type 
from information_schema.columns 
where table_name = 'sales' 
order by ordinal_position;

select 'SALE_ITEMS COLUMNS' as table_name;
select column_name, data_type 
from information_schema.columns 
where table_name = 'sale_items' 
order by ordinal_position;
