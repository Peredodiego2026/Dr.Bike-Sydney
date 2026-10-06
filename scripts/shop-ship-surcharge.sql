-- Recargo de envio por producto, para los pocos pesados/voluminosos de la
-- tienda (soportes de taller, ruedas, horquillas). Con la tarifa fija sola,
-- esos perdian plata: cuestan $25-55 de envio y la base es $13.95.
--
-- Correr en Supabase > SQL Editor, DESPUES de scripts/shop-catalog.sql.
-- Es idempotente.
--
-- COMO SE COBRA
--   envio = base (la fija, gratis si el pedido pasa del umbral)
--         + suma de (ship_surcharge de cada producto * cantidad)
-- El "gratis desde" libera SOLO la base; el recargo del pesado siempre se
-- cobra, porque es flete real. null o 0 = sin recargo (la gran mayoria).

alter table shop_products add column if not exists ship_surcharge numeric;
alter table shop_products drop constraint if exists shop_products_ship_surcharge_check;
alter table shop_products add constraint shop_products_ship_surcharge_check
  check (ship_surcharge is null or (ship_surcharge >= 0 and ship_surcharge <= 500));

-- Comprobacion: una fila, ok = true.
select
  exists (select 1 from information_schema.columns
            where table_name = 'shop_products' and column_name = 'ship_surcharge')
  and exists (select 1 from pg_constraint where conname = 'shop_products_ship_surcharge_check') as ok;
