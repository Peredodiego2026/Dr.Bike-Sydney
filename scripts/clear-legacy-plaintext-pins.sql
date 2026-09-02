-- Clear the legacy plaintext PINs from escalation_contacts - Dr. Bike Sydney
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- Run the steps IN ORDER and read step 1 before running step 3.
--
-- WHY THIS EXISTS
-- `escalation_contacts` has two PIN columns: `pin_hash` (an HMAC keyed on the
-- service key, written by hashPin() in api/auth.js) and `pin`, the legacy
-- plaintext column. `authMechanic()` still accepts a plaintext match as a
-- fallback (api/auth.js, the `c.pin === cleanPin` branch), so any row that
-- still carries a value there is a readable PIN sitting in the database.
--
-- Two things already write the hash and null the plaintext on their own:
--   - authMechanic(): a mechanic who logs in with a legacy plaintext PIN gets
--     `pin_hash` backfilled in the background.
--   - handleAdminSetMechanicPin(): Admin > Mechanic Profiles > set PIN writes
--     `{ pin_hash: ..., pin: null }`.
-- So the rows left over are the ones nobody has logged in with, or rotated,
-- since the hash was introduced.
--
-- THE ONE WAY THIS CAN HURT
-- Nulling `pin` on a row that has NO `pin_hash` locks that mechanic out - the
-- plaintext was their only credential. Step 3 therefore only touches rows that
-- already have a hash. Step 1 lists the rows that would have been locked out,
-- so you can fix them first. Do not "simplify" step 3 by dropping its
-- `pin_hash is not null` guard.

-- ── Step 1: what is actually in there ───────────────────────────────────────
-- Read this before changing anything.
select
  count(*) filter (where pin is not null)                          as plaintext_total,
  count(*) filter (where pin is not null and pin_hash is not null) as safe_to_clear,
  count(*) filter (where pin is not null and pin_hash is null)     as would_lose_access
from public.escalation_contacts;

-- ── Step 2: the rows that need a human first ────────────────────────────────
-- If this returns nothing, skip to step 3.
-- If it returns rows, each one has a plaintext PIN and no hash. Fix each by
-- EITHER having that mechanic log in once (the app backfills the hash by
-- itself) OR re-setting their PIN from Admin > Mechanic Profiles, which writes
-- the hash and nulls the plaintext in the same update. Then re-run step 1.
select id, first_name, last_name, van_number, active
from public.escalation_contacts
where pin is not null
  and pin_hash is null
order by active desc nulls last, first_name;

-- ── Step 3: clear the plaintext where a hash already exists ─────────────────
-- Safe by construction: every row it touches can still authenticate by hash.
update public.escalation_contacts
set pin = null
where pin is not null
  and pin_hash is not null;

-- ── Step 4: verify ──────────────────────────────────────────────────────────
-- `remaining_plaintext` should be 0. If it is not, those are the step-2 rows -
-- they still need a human, and step 3 deliberately left them alone.
select
  count(*) filter (where pin is not null) as remaining_plaintext,
  count(*) filter (where pin_hash is not null) as have_hash,
  count(*) as total_contacts
from public.escalation_contacts;

-- ── After this reaches 0 ────────────────────────────────────────────────────
-- Once `remaining_plaintext` is 0 AND stays 0, the plaintext fallback in
-- authMechanic() is dead code and can be deleted. Do NOT delete it before
-- then: it is what lets a not-yet-migrated mechanic log in at all. Removing it
-- early locks them out with a wrong "Invalid PIN".
