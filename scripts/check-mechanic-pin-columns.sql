-- Check the mechanic PIN columns on escalation_contacts - Dr. Bike Sydney
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- READ-ONLY. This script changes nothing.
--
-- WHAT THIS FILE USED TO BE, AND WHY IT CHANGED
-- It used to clear a legacy plaintext `pin` column, on the belief that old
-- mechanic PINs were sitting readable in the database. **That column does not
-- exist.** Diego ran the original on 2026-09-03 and it failed at the first
-- statement:
--
--   ERROR: 42703: column "pin" does not exist
--
-- So there was never anything to clean. The belief came from reading
-- api/auth.js, which queried `c.pin` as a fallback, instead of asking the
-- database - the exact mistake docs/RUNBOOK-SQL.md exists to prevent. That
-- fallback has since been deleted (it could never match), and
-- handleAdminSetMechanicPin no longer writes `pin: null` - naming a column that
-- does not exist made PostgREST reject the whole write, which is why Reset PIN
-- returned a 500 for every contact.
--
-- What is left here is the query that would have caught it in one run. Keep it:
-- if anyone proposes to "clean up the plaintext PINs" again, this answers it in
-- ten seconds.

-- ── The PIN columns that actually exist on escalation_contacts ──────────────
-- Expected: exactly one row, `pin_hash`. If a `pin` column ever appears here,
-- something re-added it - that IS a readable-credential problem, and the fix is
-- to migrate the values to pin_hash and drop the column, not to keep both.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'escalation_contacts'
  and column_name in ('pin', 'pin_hash')
order by column_name;

-- ── Who can actually log in to mechanic.html ────────────────────────────────
-- A contact with no pin_hash cannot log in at all. Fix from
-- Admin > Settings > Notification Numbers > edit the contact > Reset PIN.
select
  count(*)                                          as contacts_total,
  count(*) filter (where pin_hash is not null)      as can_log_in,
  count(*) filter (where pin_hash is null)          as no_pin_set
from public.escalation_contacts;

-- ── Which ones are missing a PIN ────────────────────────────────────────────
select id, first_name, last_name, role, van_number, active
from public.escalation_contacts
where pin_hash is null
order by active desc nulls last, first_name;
