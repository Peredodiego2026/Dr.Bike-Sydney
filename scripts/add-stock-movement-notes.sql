-- Inventory: a note on each stock movement (why stock went up or down
-- outside a job - damaged, lost, miscounted, which supplier).
-- Run in Supabase SQL editor. Idempotent: safe to run more than once.
--
-- adjust_part_stock gains a 6th parameter, p_note. Adding a parameter with
-- CREATE OR REPLACE does not replace the old function, it creates a second
-- one next to it - and then every call that leaves p_note out matches both,
-- which PostgREST refuses as ambiguous. So the 5-argument version is dropped
-- and the 6-argument one created in the same transaction: there is never a
-- moment with no function, and existing callers (which pass 5 named
-- arguments) resolve to the new one through p_note's default.

begin;

alter table public.stock_movements add column if not exists note text;

drop function if exists public.adjust_part_stock(uuid, int, text, uuid, text);

create or replace function public.adjust_part_stock(
  p_part_id    uuid,
  p_delta      int,
  p_reason     text,
  p_job_id     uuid default null,
  p_created_by text default 'system',
  p_note       text default null
)
returns table (id uuid, name text, new_stock int, min_stock int, applied int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old int;
  v_new int;
  v_applied int;
  v_name text;
  v_min int;
begin
  select pi.stock, pi.name, pi.min_stock into v_old, v_name, v_min
  from public.parts_inventory pi where pi.id = p_part_id
  for update;
  if not found then
    return;  -- unknown part: no row, caller treats as failure
  end if;
  v_new := greatest(0, v_old + p_delta);
  v_applied := v_new - v_old;  -- the real change after clamping
  if v_applied <> 0 then
    update public.parts_inventory set stock = v_new where parts_inventory.id = p_part_id;
    insert into public.stock_movements (part_id, job_id, delta, reason, created_by, note)
      values (p_part_id, p_job_id, v_applied, p_reason, p_created_by,
              nullif(left(trim(p_note), 200), ''));
  end if;
  return query select p_part_id, v_name, v_new, v_min, v_applied;
end;
$$;

revoke execute on function public.adjust_part_stock(uuid, int, text, uuid, text, text) from public;
grant  execute on function public.adjust_part_stock(uuid, int, text, uuid, text, text) to service_role;

commit;

-- Verify (expect: true | 1 | 6):
--   select exists (select 1 from information_schema.columns
--                  where table_name='stock_movements' and column_name='note') as has_note,
--          (select count(*) from pg_proc where proname='adjust_part_stock') as versions,
--          (select pronargs from pg_proc where proname='adjust_part_stock') as args;
