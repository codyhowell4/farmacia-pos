-- Run this in the Supabase SQL Editor to create the missing membership revision products.
-- It creates them for every organization that does not already have them.

do $$
declare
  r record;
begin
  for r in select id from organizations loop
    perform ensure_membership_revision_products(r.id);
  end loop;
end $$;
