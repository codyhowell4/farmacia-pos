-- Monedas Apolo: tiers 1, 4 and 7 lose their cap (2026-11-25, owner request).
-- They become plain 5 % / 10 % / 15 % off one purchase, no maximum.
update public.coin_reward_tiers
   set cap_amount = null,
       title = case coins when 50 then '5% de descuento en una compra'
                          when 250 then '10% de descuento en una compra'
                          when 700 then '15% de descuento en una compra' end,
       updated_at = now()
 where kind = 'percent' and coins in (50, 250, 700) and percent in (5, 10, 15);
