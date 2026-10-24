-- Dr. Bike - el costo de los repuestos de cada trabajo, donde el cliente NO lo
-- puede leer. Diego, 25-oct-2026: "el cliente nunca debe saber cuanto me costo
-- comprar las camaras... solo debe saber el precio final".
--
-- Hasta hoy el costo vivia en bookings.parts_cost_actual, y un cliente con
-- sesion puede leer su propia fila de bookings (policy bookings_select_own_or_admin):
-- ninguna pantalla lo mostraba, pero llegaba a su navegador. Ahora vive en
-- booking_costs, que solo el admin puede leer (misma regla que usa el admin
-- para leer todas las reservas: profiles.role = 'admin').
--
-- ORDEN: mergear el PR primero, despues correr esto. El codigo nuevo funciona
-- con o sin esta tabla; el viejo no conoce la tabla.
--
-- Seguro de correr dos veces. No se pierde ningun dato: primero se COPIA cada
-- costo a booking_costs, y solo despues se borra de bookings, y unicamente
-- donde la copia quedo igual.

begin;

create table if not exists public.booking_costs (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  parts_cost numeric not null,
  updated_at timestamptz not null default now()
);

alter table public.booking_costs enable row level security;

drop policy if exists booking_costs_admin_select on public.booking_costs;
create policy booking_costs_admin_select on public.booking_costs
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- 1) Copiar los costos que hoy estan en bookings.
insert into public.booking_costs (booking_id, parts_cost)
  select id, parts_cost_actual from public.bookings where parts_cost_actual is not null
  on conflict (booking_id) do nothing;

-- 2) Sacarlos de bookings, solo donde la copia es identica.
update public.bookings b
   set parts_cost_actual = null
  from public.booking_costs c
 where c.booking_id = b.id
   and b.parts_cost_actual is not null
   and c.parts_cost = b.parts_cost_actual;

commit;

-- Verificacion. Tiene que dar:  true | true | 0
-- select
--   exists (select 1 from information_schema.tables
--           where table_schema = 'public' and table_name = 'booking_costs') as tabla,
--   (select relrowsecurity from pg_class where oid = to_regclass('public.booking_costs')) as rls,
--   (select count(*) from public.bookings where parts_cost_actual is not null) as costos_visibles_al_cliente;
