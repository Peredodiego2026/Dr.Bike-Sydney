-- fix-availability-blocks.sql — que el boton "Block availability" del admin
-- pueda guardar algo. 2026-08-16.
--
-- POR QUE
-- La tabla `availability` se diseno POR SERVICIO (`service_id NOT NULL`, y
-- dentro de la clave unica). El modal del admin no pregunta por servicio:
-- Diego bloquea *un horario*, no *un horario de un servicio*. Diego eligio el
-- 16-ago-2026 el modelo A: un bloqueo tapa esa hora entera.
--
-- Verificado ese mismo dia contra produccion: la tabla tenia 0 filas. El boton
-- escribia una columna `blocked` que no existe (42703), asi que ningun bloqueo
-- se guardo nunca. No hay datos que migrar.
--
-- QUE HACE
--   1. service_id deja de ser obligatorio (un bloqueo no es de un servicio).
--   2. van_number pasa a 0 = "todas las vans", nunca NULL: en un indice unico
--      NULL nunca choca con NULL, asi que un bloqueo de todas las vans se
--      insertaba duplicado en vez de actualizarse. 0 es el mismo centinela que
--      ya usa van_zones.
--   3. La clave unica pasa a (date, time_slot, van_number), que es contra la
--      que el upsert del panel hace onConflict.
--
-- COMO SE CORRE
-- Supabase > SQL Editor > pegar todo > Run. Es idempotente: se puede correr
-- dos veces sin romper nada.
--
-- DESPUES DE CORRERLO
-- Bloquear un dia en Admin > Calendar y comprobar que esos horarios dejan de
-- ofrecerse en la reserva del cliente.

begin;

-- 1. Un bloqueo no pertenece a ningun servicio.
alter table public.availability
  alter column service_id drop not null;

-- 2. "Todas las vans" es 0, no NULL.
update public.availability
   set van_number = 0
 where van_number is null;

alter table public.availability
  alter column van_number set default 0;

alter table public.availability
  alter column van_number set not null;

-- 3. La clave unica que el upsert espera.
alter table public.availability
  drop constraint if exists availability_date_service_id_time_slot_van_number_key;

drop index if exists public.availability_date_time_slot_van_number_key;

create unique index availability_date_time_slot_van_number_key
  on public.availability (date, time_slot, van_number);

commit;

-- Comprobacion: deberia listar el indice nuevo y ya no el viejo.
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and tablename = 'availability'
 order by indexname;

-- Y service_id nullable = YES, van_number nullable = NO, default 0.
select column_name, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'availability'
   and column_name in ('service_id', 'van_number')
 order by column_name;
