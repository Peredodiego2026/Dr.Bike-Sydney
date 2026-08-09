-- Migration: remember which completion notifications actually went out (14.8, paso B)
-- Run in the Supabase SQL editor.
--
-- Paso A moved the invoice / review email / review SMS off the mechanic's phone
-- and into api/auth.js. That closes the "the phone lost signal" hole, but not
-- the "our own send failed" one: if Resend or Twilio is down at that second,
-- the client still ends up with no invoice and the only trace is a console
-- line nobody reads.
--
-- This column is that trace, in the database, per booking:
--
--   {"send-invoice":"sent","send-email":"sent","send-sms":"failed"}
--
-- api/send-cron.js?type=completion-retry picks up any booking with an entry
-- that is not "sent" and re-sends ONLY that entry - never the ones that
-- already landed, so a failed SMS can't produce a second invoice.
--
-- NULL means "this booking was completed before the column existed", not
-- "nothing was sent". The sweep ignores NULL on purpose: it can't tell the
-- difference, and guessing would email old clients a second invoice.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS completion_notifications JSONB DEFAULT NULL;

-- The sweep asks for completed bookings with a non-null value, newest first.
CREATE INDEX IF NOT EXISTS idx_bookings_completion_notifications
  ON bookings(status, completed_at)
  WHERE completion_notifications IS NOT NULL;

COMMENT ON COLUMN bookings.completion_notifications IS
  'Per-channel outcome of the job-completion chain: {"send-invoice":"sent"|"failed", ...}. Written by api/auth.js mechanic-complete, retried by api/send-cron.js?type=completion-retry. NULL = completed before this column existed.';
