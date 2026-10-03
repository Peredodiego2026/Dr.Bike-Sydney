-- Lo que pasa con un pedido de la tienda despues de pagado: Admin > Shop Orders.
--
-- Correr entero en Supabase > SQL Editor, DESPUES de scripts/shop-orders.sql.
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- EL CAMINO DE UN PEDIDO
--
--   pending  -> el cliente lleno los datos y se creo el cobro; todavia no pago
--   paid     -> Stripe cobro. Diego recibe el WhatsApp.
--   ordered  -> Diego se lo pidio a LEBYCLE. Se guarda el numero de pedido de
--               ELLOS (supplier_ref), que es lo que hay que citar si algo no llega.
--   sent     -> salio, con numero de seguimiento. El cliente recibe un email.
--   delivered-> llego.
--   cancelled / refunded -> no se cobro, o se devolvio.
--
-- 'packed' sigue en la lista solo porque la version anterior la tenia: si
-- alguna fila la usara, quitarla haria fallar este script.

alter table shop_orders add column if not exists supplier_ref  text;
alter table shop_orders add column if not exists carrier       text;
alter table shop_orders add column if not exists tracking_url  text;
alter table shop_orders add column if not exists ordered_at    timestamptz;
alter table shop_orders add column if not exists sent_at       timestamptz;
alter table shop_orders add column if not exists delivered_at  timestamptz;
alter table shop_orders add column if not exists refunded_at   timestamptz;
alter table shop_orders add column if not exists refund_id     text;

-- La lista de estados vive en un CHECK que Postgres nombro solo al crear la
-- tabla. En vez de adivinar ese nombre, se borra todo CHECK de la tabla que
-- hable de `status` y se vuelve a crear uno, con nombre fijo.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.shop_orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.shop_orders drop constraint %I', c.conname);
  end loop;
end $$;

alter table shop_orders add constraint shop_orders_status_check
  check (status in ('pending','paid','ordered','packed','sent','delivered','cancelled','refunded'));

-- Comprobacion: una fila, ok = true.
select
  (select count(*) from information_schema.columns
     where table_name = 'shop_orders'
       and column_name in ('supplier_ref','carrier','tracking_url','ordered_at','sent_at','delivered_at','refunded_at','refund_id')) = 8
  and exists (select 1 from pg_constraint
                where conname = 'shop_orders_status_check'
                  and pg_get_constraintdef(oid) ilike '%ordered%')
  and not exists (select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
                    where c.relname = 'shop_orders') as ok;
