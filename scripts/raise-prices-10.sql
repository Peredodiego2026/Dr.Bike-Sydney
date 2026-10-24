-- Dr. Bike - +$10 a todos los servicios y a la visita (Diego, 22-oct-2026:
-- "a todos los servicios hay que subirle 10 aus y a la visita tambien").
--
-- Va junto con el PR que sube los mismos precios en el codigo: las franjas de
-- la visita en api/_coverage.js (25/45 -> 35/55, peninsula 35 -> 45, Terrey
-- Hills 25 -> 35), las tarjetas, el JSON-LD, los terminos, el chat. ORDEN:
-- correr ESTE SQL primero y mergear el PR enseguida despues. Al reves, durante
-- el rato entre las dos cosas, una reserva hecha con el mapa caido se cotizaria
-- con callout_zones vieja contra las franjas nuevas.
--
-- Seguro de correr dos veces. Cada tabla tiene su propio candado y se sube
-- solo si sigue en el precio de antes: services si el Tune-Up esta en $109,
-- callout_zones si Northern Beaches esta en $25. La segunda vez no cambia nada.
--
-- Los servicios en $0 (Emergency Service = "a cotizar") no se tocan.

update public.services
   set price = price + 10
 where price > 0
   and exists (select 1 from public.services where name = 'Tune-Up' and price = 109);

update public.callout_zones
   set callout_fee = callout_fee + 10
 where callout_fee > 0
   and exists (select 1 from public.callout_zones
               where name = 'Northern Beaches' and callout_fee = 25);

-- Verificacion. Tiene que dar:  119 | 27 | 379 | 35 / 45 / 55 / 65 / 75
-- select
--   (select price from public.services where name = 'Tune-Up') as tune_up,
--   (select min(price) from public.services where price > 0 and active is not false) as mas_barato,
--   (select max(price) from public.services where active is not false) as mas_caro,
--   (select string_agg(callout_fee::text, ' / ' order by callout_fee)
--      from public.callout_zones) as visitas;
