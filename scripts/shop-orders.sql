-- Los pedidos de la tienda LEBYCLE.
--
-- Correr entero en Supabase > SQL Editor, DESPUES de scripts/shop-catalog.sql.
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- POR QUE EL PEDIDO GUARDA EL PRECIO Y EL CATALOGO NO LO DECIDE
--
-- El navegador manda SKU y cantidad, nunca importes. El servidor
-- (api/shop.js, accion checkout) lee shop_variants, recalcula el total y
-- recien ahi crea el cobro en Stripe. Lo que se guarda aca es el resultado de
-- ESA cuenta, congelado: si manana sube el precio de una camara, el pedido de
-- hoy tiene que seguir diciendo lo que el cliente pago.
--
-- Por eso shop_order_items duplica el precio en vez de apuntar a la variante.
-- No es redundancia: un pedido es un documento historico, no una vista del
-- catalogo.

create table if not exists shop_orders (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid references auth.users(id) on delete set null,
  client_email    text not null,
  client_name     text,
  client_phone    text,
  -- La direccion va en texto plano, como la escribio el cliente. Un pedido se
  -- despacha a lo que la persona escribio, no a lo que un geocodificador creyo
  -- entender.
  ship_address    text,
  ship_suburb     text,
  ship_postcode   text,
  subtotal        numeric(10,2) not null check (subtotal >= 0),
  shipping        numeric(10,2) not null default 0 check (shipping >= 0),
  total           numeric(10,2) not null check (total >= 0),
  currency        text not null default 'AUD',
  status          text not null default 'pending'
                    check (status in ('pending','paid','packed','sent','delivered','cancelled','refunded')),
  payment_intent_id text unique,
  -- 'test' mientras la tienda sea un preview. Un pedido de prueba y uno real
  -- no se pueden confundir ni en los informes ni en el panel.
  mode            text not null default 'test' check (mode in ('test','live')),
  tracking_number text,
  notes           text,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz
);

create table if not exists shop_order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references shop_orders(id) on delete cascade,
  sku        text not null,
  name       text not null,
  variant    text,
  qty        int not null check (qty > 0 and qty <= 20),
  unit_price numeric(10,2) not null check (unit_price > 0),
  line_total numeric(10,2) not null check (line_total > 0)
);

create index if not exists shop_order_items_order_idx on shop_order_items(order_id);
create index if not exists shop_orders_client_idx on shop_orders(client_id);
create index if not exists shop_orders_status_idx on shop_orders(status);

alter table shop_orders enable row level security;
alter table shop_order_items enable row level security;

-- Mismo criterio que shop_products y shop_variants: cero politicas. Un pedido
-- lleva nombre, telefono y direccion de una persona. Que la unica puerta sea
-- el servidor no es exceso de celo: una politica mal escrita sobre una tabla
-- con direcciones es una fuga de datos personales, no un bug de precios.
drop policy if exists shop_orders_read on shop_orders;
drop policy if exists shop_order_items_read on shop_order_items;

revoke all on shop_orders from anon;
revoke all on shop_order_items from anon;
revoke all on shop_orders from authenticated;
revoke all on shop_order_items from authenticated;

-- Comprobacion: dos filas, las dos con ok = true.
select
  c.relname                                    as tabla,
  c.relrowsecurity                             as rls_encendido,
  count(p.polname)                             as politicas,
  (c.relrowsecurity and count(p.polname) = 0)  as ok
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('shop_orders','shop_order_items')
group by c.relname, c.relrowsecurity;
