-- Admin > Shop Products, y lo que necesitan los pasos siguientes de la tienda.
--
-- Correr entero en Supabase > SQL Editor, DESPUES de scripts/shop-catalog.sql.
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- Va todo junto a proposito: descripcion, stock, destacados, fotos extra y
-- los ajustes (envio, plazo, reglas de precio). Diego corre un SQL en vez de
-- tres, y el codigo de cada parte llega a produccion con la base ya lista.
--
-- STOCK
--   null -> sin limite (lo normal en dropshipping: lo tiene LEBYCLE)
--   0    -> agotado: se ve, no se puede comprar
--   n    -> quedan n; no se vende mas que eso, y baja al pagarse un pedido

alter table shop_products add column if not exists description text;
alter table shop_products add column if not exists featured    boolean not null default false;
alter table shop_products add column if not exists gallery     text[]  not null default '{}';
alter table shop_products add column if not exists updated_at  timestamptz;

alter table shop_variants add column if not exists stock int;
alter table shop_variants drop constraint if exists shop_variants_stock_check;
alter table shop_variants add constraint shop_variants_stock_check check (stock is null or stock >= 0);

-- Ajustes de la tienda, uno por fila: 'shipping', 'delivery', 'pricing'.
-- Mismo cerrojo que el resto de la tienda: RLS encendido y cero politicas.
-- Solo el servidor (service key) los lee y los escribe.
create table if not exists shop_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table shop_settings enable row level security;
drop policy if exists shop_settings_read on shop_settings;
revoke all on shop_settings from anon;
revoke all on shop_settings from authenticated;

-- Comprobacion: una fila, ok = true.
select
  (select count(*) from information_schema.columns
     where (table_name = 'shop_products' and column_name in ('description','featured','gallery','updated_at'))
        or (table_name = 'shop_variants' and column_name = 'stock')) = 5
  and exists (select 1 from information_schema.tables where table_name = 'shop_settings')
  and coalesce((select relrowsecurity from pg_class where relname = 'shop_settings'), false)
  and not exists (select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
                    where c.relname in ('shop_settings','shop_products','shop_variants')) as ok;
