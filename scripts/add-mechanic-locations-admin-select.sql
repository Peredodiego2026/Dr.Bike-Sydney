-- ═══════════════════════════════════════════════════════════════════════
-- mechanic_locations: policy de admin para SELECT — Dr. Bike Sydney — 2026-08-18
-- ═══════════════════════════════════════════════════════════════════════
--
-- harden-security-2026-07-17.sql le puso una sola policy a esta tabla:
-- mechanic_locations_select_active_booking, que solo deja ver la ubicacion
-- de un mecanico al CLIENTE que tiene una reserva activa con el. El admin
-- nunca quedo cubierto - ni siquiera Diego, con su propia sesion
-- autenticada, puede leer "donde estan mis vans ahora" directo desde el
-- navegador. El lector server-side (api/auth.js, service key) ya bypasea
-- RLS y no lo toca este script.
--
-- Mismo patron que availability_admin_select (docs/PENDIENTES.md 21.7):
-- una policy mas, sin tocar la que ya existe.
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- Seguro de correr dos veces: el DROP es IF EXISTS.

drop policy if exists mechanic_locations_admin_select on public.mechanic_locations;

create policy mechanic_locations_admin_select on public.mechanic_locations
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Comprobacion: deberia listar las 2 policies (la del cliente + esta).
select policyname, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'mechanic_locations'
 order by policyname;
