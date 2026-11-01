-- Dr. Bike - historial de cambios de fecha y hora de cada reserva (01-nov-2026).
--
-- Hasta hoy, mover una reserva (Admin > Reschedule, o el cliente desde su
-- cuenta) pisaba scheduled_date y scheduled_time y no dejaba rastro: la base
-- no sabia ni la fecha anterior ni quien la cambio. Caso real: Andrew Madry,
-- 11-nov - el cliente dijo "I changed yesterday" y no habia forma de ver en la
-- base que lo habia movido Diego desde el admin.
--
-- Una fila por cambio, escrita por el servidor (api/auth.js,
-- rescheduleBookingCore) con la service key. RLS activado y SIN policies: ni
-- el cliente ni el navegador del admin la leen directo.
--
-- ORDEN: da igual. El codigo funciona sin esta tabla - el correo al cliente
-- sale igual, con la fecha anterior que lee de la reserva antes de moverla;
-- lo unico que se pierde mientras falte es el historial. Seguro de correr dos
-- veces.

create table if not exists public.booking_reschedules (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  old_date    date,
  old_time    time,
  new_date    date not null,
  new_time    time not null,
  changed_by  text not null check (changed_by in ('admin', 'client')),
  changed_at  timestamptz not null default now()
);

create index if not exists booking_reschedules_booking_idx
  on public.booking_reschedules (booking_id, changed_at);

alter table public.booking_reschedules enable row level security;

-- Verificacion. Tiene que dar:  true | true
-- select
--   to_regclass('public.booking_reschedules') is not null as tabla,
--   coalesce((select relrowsecurity from pg_class
--              where oid = to_regclass('public.booking_reschedules')), false) as rls;
