-- Inventory: audit ledger + revertible stock + Duro tube seed
-- Run in Supabase SQL editor. Idempotent: safe to run more than once.
--
-- Builds ON TOP of the existing parts_inventory system (do NOT recreate it):
--   - parts_inventory already holds id, name, category, stock, min_stock,
--     cost_price, sell_price and is what the admin UI, the mechanic parts
--     picker and mechanic-complete already read/write.
--   - decrement_part_stock() already does an atomic, non-negative decrement.
-- What this migration adds, and nothing else:
--   1. stock_movements  - one auditable row per stock change (who/why/when).
--   2. adjust_part_stock() - the atomic mover that ALSO writes the ledger, and
--      unlike decrement_part_stock can add stock back (revert / restock).
--   3. Four nullable tube columns on parts_inventory so the mechanic picker can
--      filter by wheel size and valve. Nullable: every existing part is fine.
--   4. The 61 Duro inner tubes (18 variants) at cost $2 / sell $15.

begin;

-- ── 1. Tube attributes (additive, nullable) ───────────────────────────────
alter table public.parts_inventory add column if not exists wheel_size      text;
alter table public.parts_inventory add column if not exists valve_type      text;
alter table public.parts_inventory add column if not exists valve_length_mm int;
alter table public.parts_inventory add column if not exists width_range     text;

-- ── 2. Movement ledger ────────────────────────────────────────────────────
-- Every change to parts_inventory.stock should leave one row here. stock stays
-- the live count on parts_inventory (fast to read); this is the history.
create table if not exists public.stock_movements (
  id         uuid primary key default gen_random_uuid(),
  part_id    uuid not null references public.parts_inventory(id) on delete cascade,
  job_id     uuid references public.bookings(id) on delete set null,
  delta      int  not null,                 -- the stock change actually applied (+/-)
  reason     text not null check (reason in
               ('initial','job_used','job_reverted','restock','adjustment')),
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_part_idx on public.stock_movements(part_id, created_at desc);
create index if not exists stock_movements_job_idx  on public.stock_movements(job_id);

-- Service key only. RLS on with no anon/authenticated policy => the public
-- keys see nothing; service_role bypasses RLS, like the rest of the app.
alter table public.stock_movements enable row level security;

-- ── 3. Atomic mover that writes the ledger ────────────────────────────────
-- One statement moves the stock (clamped at 0) and records the REAL delta
-- applied - a clamped decrement logs what actually left, not what was asked.
-- Used for job_used (negative), job_reverted/restock (positive) and manual
-- adjustment (either). decrement_part_stock() stays for the current callers
-- until the app is switched over in the next commit.
create or replace function public.adjust_part_stock(
  p_part_id    uuid,
  p_delta      int,
  p_reason     text,
  p_job_id     uuid default null,
  p_created_by text default 'system'
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
    insert into public.stock_movements (part_id, job_id, delta, reason, created_by)
      values (p_part_id, p_job_id, v_applied, p_reason, p_created_by);
  end if;
  return query select p_part_id, v_name, v_new, v_min, v_applied;
end;
$$;

revoke execute on function public.adjust_part_stock(uuid, int, text, uuid, text) from public;
grant  execute on function public.adjust_part_stock(uuid, int, text, uuid, text) to service_role;

-- ── 4. Seed: 61 Duro inner tubes, 18 variants ─────────────────────────────
-- Idempotent by name (each variant's name is unique). cost $2 / sell $15,
-- min_stock 2. ASCII only (2-1/4, not the fraction glyph).
insert into public.parts_inventory
  (name, category, stock, min_stock, cost_price, sell_price,
   wheel_size, valve_type, valve_length_mm, width_range)
select v.name, 'Tubes', v.qty, 2, 2.00, 15.00,
       v.wheel_size, v.valve_type, v.valve_length_mm, v.width_range
from (values
  ('Tube 29" Presta 40mm 2.25-2.50 Duro',     '29"',     'presta',   40,   '2.25-2.50',  4),
  ('Tube 29" Schrader 48mm 2.25-2.50 Duro',   '29"',     'schrader', 48,   '2.25-2.50',  4),
  ('Tube 28"/29" Schrader 1.75-1.95 Duro',    '28"/29"', 'schrader', null, '1.75-1.95',  5),
  ('Tube 27.5" Presta 40mm 2.25-2.50 Duro',   '27.5"',   'presta',   40,   '2.25-2.50',  3),
  ('Tube 27.5" Presta 40mm 1.95-2.125 Duro',  '27.5"',   'presta',   40,   '1.95-2.125', 3),
  ('Tube 27.5" Schrader 48mm 1.95-2.125 Duro','27.5"',   'schrader', 48,   '1.95-2.125', 2),
  ('Tube 26" Presta 40mm 2.25-2.50 Duro',     '26"',     'presta',   40,   '2.25-2.50',  4),
  ('Tube 26" Presta 33mm 1.90-2.125 Duro',    '26"',     'presta',   33,   '1.90-2.125', 4),
  ('Tube 26" Schrader 1.90-2.125 Duro',       '26"',     'schrader', null, '1.90-2.125', 4),
  ('Tube 26" Schrader 2.35 Duro',             '26"',     'schrader', null, '2.35',       3),
  ('Tube 24" Schrader 1.90-2.125 Duro',       '24"',     'schrader', null, '1.90-2.125', 2),
  ('Tube 20" Schrader 1.75-2.125 Duro',       '20"',     'schrader', null, '1.75-2.125', 1),
  ('Tube 18" Schrader 1.75-2.125 Duro',       '18"',     'schrader', null, '1.75-2.125', 4),
  ('Tube 14" Schrader 1.75-2.125 Duro',       '14"',     'schrader', null, '1.75-2.125', 4),
  ('Tube 12" Schrader 2-1/4 Duro',            '12"',     'schrader', null, '2-1/4',      4),
  ('Tube 700C Presta 80mm 18-25C Duro',       '700C',    'presta',   80,   '18-25C',     5),
  ('Tube 700C Presta 33mm 35-43C Duro',       '700C',    'presta',   33,   '35-43C',     4),
  ('Tube 700C Presta 52mm 35-43C Duro',       '700C',    'presta',   52,   '35-43C',     1)
) as v(name, wheel_size, valve_type, valve_length_mm, width_range, qty)
where not exists (
  select 1 from public.parts_inventory p where p.name = v.name
);

-- One 'initial' movement per seeded tube, only if it has none yet.
insert into public.stock_movements (part_id, delta, reason, created_by)
select p.id, p.stock, 'initial', 'seed'
from public.parts_inventory p
where p.category = 'Tubes'
  and p.name like 'Tube %Duro'
  and not exists (
    select 1 from public.stock_movements m where m.part_id = p.id and m.reason = 'initial'
  );

commit;

-- Verify (expect 61 tube units across 18 rows, and a matching initial ledger):
--   select count(*) variants, sum(stock) units from parts_inventory
--     where category='Tubes' and name like 'Tube %Duro';          -- 18 | 61
--   select count(*) from stock_movements where reason='initial';   -- >= 18
