-- Dr. Bike - una gift card usada en una reserva cuenta como venta (25-oct-2026).
--
-- Una gift card no es un descuento: el cliente la pago cuando la compro, y la
-- venta es el trabajo donde la usa. Hasta hoy el valor de la gift card quedaba
-- mezclado en bookings.discount_applied, y desde #521 la facturacion resta ese
-- campo - asi que un trabajo pagado con gift card habria quedado fuera del BAS.
-- Esta columna guarda la parte que vino de un codigo GIFT-, y Finanzas la suma.
--
-- ORDEN: correr ESTE SQL primero y mergear el PR despues (Analytics pide la
-- columna por nombre). Seguro de correr dos veces.

alter table public.bookings add column if not exists gift_applied numeric;

-- Reservas que ya usaron una gift card: el mismo calculo que hace el servidor
-- (el valor de la tarjeta, como maximo el precio del servicio).
update public.bookings b
   set gift_applied = least(dc.discount_value, b.service_price)
  from public.discount_codes dc
 where b.discount_code = dc.code
   and dc.code like 'GIFT-%'
   and b.gift_applied is null;

-- Verificacion. Tiene que dar:  true | 0
-- select
--   exists (select 1 from information_schema.columns
--           where table_schema = 'public' and table_name = 'bookings'
--             and column_name = 'gift_applied') as columna,
--   (select count(*) from public.bookings
--     where discount_code like 'GIFT-%' and gift_applied is null) as canjes_sin_registrar;
