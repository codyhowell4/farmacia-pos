-- Fix: sales_void_cascade rompía TODA anulación de venta con ERROR 42804
-- (coalesce uuid vs text): sales.voided_by es text (nombre del cajero) y
-- prescriptions.voided_by es uuid. Rota desde ~2026-09-02 — ninguna venta se
-- anulaba y, peor, voidSale ya había repuesto el inventario antes de fallar.
-- Ahora solo propaga voided_by cuando el valor realmente es un uuid; si es un
-- nombre, prescriptions.voided_by queda NULL (el nombre ya queda en la venta).
create or replace function public.sales_void_cascade()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.voided = true and old.voided is distinct from true then
    update public.prescriptions
       set is_voided = true,
           voided_at = coalesce(voided_at, now()),
           voided_by = coalesce(voided_by,
                         case
                           when new.voided_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                           then new.voided_by::uuid
                         end),
           voided_reason = coalesce(voided_reason, new.voided_reason, 'Venta anulada')
     where sale_id = new.id and is_voided is not true;
  end if;
  return new;
end $$;
