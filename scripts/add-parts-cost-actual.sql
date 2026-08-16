-- Migration: the real parts cost per job, not a flat average (18.3)
-- Run in the Supabase SQL editor.
--
-- Analytics and Finance have shown a margin % since PR #251, but the cost
-- half of that number was always the same estimate for every job: total
-- parts spend for the period, divided by job count. A $17 puncture repair
-- and a $400 wheel rebuild came out with the identical "parts cost" and the
-- identical margin colour.
--
-- The mechanic already sends which parts they used, with quantity, when they
-- complete a job (js/mechanic.js -> api/auth.js handleMechanicComplete). That
-- was only ever kept as a display string ("2x Brake Pad, 1x Chain Lube") -
-- this column is the same data priced against parts_inventory.cost_price at
-- completion time and kept as a number.
--
-- NULL means "we cannot say" - completed before this column existed, or the
-- completion arrived as a plain string instead of the structured parts_used
-- the mechanic app has sent since it introduced quantities. NEVER read NULL
-- as $0: that would claim a measured job that used no parts. js/admin.js
-- falls back to the old flat-average estimate for exactly the rows where
-- this is NULL, and says on screen which one a number is.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS parts_cost_actual NUMERIC DEFAULT NULL;

COMMENT ON COLUMN bookings.parts_cost_actual IS
  'Real parts cost for this job: sum(qty * parts_inventory.cost_price) at completion time. Written by api/auth.js handleMechanicComplete. NULL = completed before this column existed, or parts_used arrived as a plain string - never treat NULL as 0.';
