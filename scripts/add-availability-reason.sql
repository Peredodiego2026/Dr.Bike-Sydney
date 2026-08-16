-- availability.reason no existe. saveBlocks() en js/admin.js manda `reason`
-- desde ANTES de fix-availability-blocks.sql (PR #253) - ya estaba en el
-- payload roto que escribia `blocked`. Nadie la creo nunca: ningun script del
-- repo la menciona, y fix-availability-blocks.sql solo toco service_id,
-- van_number y el indice unico. Con el `?v=` de admin.html ya arreglado
-- (docs/PENDIENTES.md 21.5), el upsert llega a Supabase de verdad y
-- PostgREST devuelve 42703 en esta columna en vez de la anterior.
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run. Idempotente.

alter table public.availability add column if not exists reason text;
