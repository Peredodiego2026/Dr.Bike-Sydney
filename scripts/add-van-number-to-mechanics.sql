-- Migration: bind each mechanic's PIN to a specific van, server-side.
-- Run in Supabase SQL Editor
--
-- Previously van selection was a plain client-side dropdown on the mechanic
-- login screen with zero server-side binding - any mechanic's PIN could pick
-- any van and see/accept that van's jobs. This column is the real source of
-- truth admin.html's mechanic-profile "Van" field writes to, and every
-- van-scoped handler in api/auth.js (handleMechanicJobs, handleMechanicAccept,
-- handleMechanicLocation) now reads from here instead of trusting the client.
--
-- NULL = "all zones" - for one person covering every van (e.g. Diego while
-- he's the only one working). Leave it unset for that case; no data change
-- needed beyond not setting it.

ALTER TABLE escalation_contacts
  ADD COLUMN IF NOT EXISTS van_number INTEGER DEFAULT NULL;

COMMENT ON COLUMN escalation_contacts.van_number IS 'Which van this mechanic''s PIN is scoped to (1 or 2). NULL = all zones/vans - set via Admin > Mechanic Profiles > Edit profile > Van.';
