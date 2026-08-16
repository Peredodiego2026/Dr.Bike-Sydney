-- ═══════════════════════════════════════════════════════════════════════
-- RLS para availability — Dr. Bike Sydney — 2026-08-16
-- ═══════════════════════════════════════════════════════════════════════
--
-- La tabla `availability` nacio con el PR #253 (16-ago), semanas despues de
-- harden-security-2026-07-17.sql - el script que le puso policies de admin
-- a bookings, discount_codes y van_zones. Nunca la incluyo porque no
-- existia todavia, asi que RLS quedo encendido (por default o por herencia)
-- sin ninguna policy de escritura: `saveBlocks()` y `unblockDate()` en
-- js/admin.js escriben con la sesion autenticada del admin (igual que
-- van_zones), no con la service key, y Postgres los rechazo con 403 "new
-- row violates row-level security policy" en cuanto el nombre de columna
-- (docs/PENDIENTES.md 21.5) y la columna faltante (21.6) dejaron de tapar
-- el problema real.
--
-- El lector server-side (api/auth.js handleGetAvailability) usa la service
-- key y ya bypassea RLS - no lo toca este script.
--
-- Mismo patron exacto que van_zones_admin_write/update/delete en
-- harden-security-2026-07-17.sql: solo un usuario autenticado cuyo
-- profiles.role sea 'admin' puede leer, escribir, actualizar o borrar.
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- Seguro de correr dos veces: cada DROP es IF EXISTS y cada CREATE
-- recrea desde cero.

alter table public.availability enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'availability'
  loop
    execute format('drop policy if exists %I on public.availability', pol.policyname);
  end loop;
end $$;

create policy availability_admin_select on public.availability
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy availability_admin_write on public.availability
  for insert with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy availability_admin_update on public.availability
  for update using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy availability_admin_delete on public.availability
  for delete using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Comprobacion: 4 filas, rowsecurity = true.
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'availability'
 order by policyname;
