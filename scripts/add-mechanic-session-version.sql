-- Dr. Bike Sydney - add escalation_contacts.session_version
-- Audit finding 4 (2026-09-04): rotating a mechanic's PIN revoked nothing.
--
-- A mechanic session token is an HMAC of { mid, exp } and nothing else. It used
-- to last 60 days (now 14), and verifyMechanicToken only ever checked the
-- signature and the expiry. So "Reset PIN" in Admin changed what the NEXT login
-- needs and left every token already issued working until it expired on its
-- own. That is the middle link of the chain the audit found:
--
--   4-digit PIN (10,000 combinations, locked per IP but not per account)
--     -> a token rotating the PIN does not kill
--       -> an arbitrary charge to a saved card
--
-- After this runs, every PIN rotation increments session_version and every
-- token minted before that moment stops being accepted.
--
-- SAFE TO RUN TWICE. Adds nothing if it is already there, and existing rows get
-- 0 - which is the value tokens already carry, so nobody is signed out by the
-- migration itself. Sessions only end when a PIN is actually rotated.
--
-- Run it in Supabase: SQL Editor -> New query -> paste -> Run.

alter table public.escalation_contacts
  add column if not exists session_version integer not null default 0;

comment on column public.escalation_contacts.session_version is
  'Bumped by admin-set-mechanic-pin. A mechanic token carries the value it was minted with; authMechanic refuses a token whose value is behind this one.';

-- Check: every mechanic should come back with session_version 0.
select id, first_name, last_name, session_version
from public.escalation_contacts
order by first_name;
