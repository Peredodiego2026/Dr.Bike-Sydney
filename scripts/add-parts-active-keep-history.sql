-- Inventory: parts are deactivated, never deleted, and their history stays.
-- Run in Supabase SQL editor. Idempotent: safe to run more than once.
--
-- Diego, 23-oct-2026: "solo desactivar... en algun momento querremos saber
-- cuando usamos de que para hacer un estudio de re compra de repuestos...
-- debemos saber el stock que se uso en todo momento".
--
-- 1. parts_inventory.active - false hides a part from the mechanic's lists
--    and the admin's working list, without losing it or its movements.
-- 2. stock_movements.part_id goes from ON DELETE CASCADE (deleting a part
--    erased its whole history) to ON DELETE RESTRICT: the database itself
--    refuses to delete a part that has any movement, from the app or from the
--    Supabase dashboard alike. A part that never moved can still be deleted.

begin;

alter table public.parts_inventory
  add column if not exists active boolean not null default true;

alter table public.stock_movements
  drop constraint if exists stock_movements_part_id_fkey;
alter table public.stock_movements
  add constraint stock_movements_part_id_fkey
  foreign key (part_id) references public.parts_inventory(id) on delete restrict;

commit;

-- Verify (expect: true | r):
--   select exists (select 1 from information_schema.columns
--                  where table_name='parts_inventory' and column_name='active') as has_active,
--          (select confdeltype from pg_constraint
--           where conname='stock_movements_part_id_fkey') as on_delete;  -- r = restrict
