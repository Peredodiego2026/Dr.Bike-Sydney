-- Two new cron jobs need a "already handled this booking" flag each, following
-- the same pattern as reminder_2h_sent / abandoned_recovery_sent /
-- next_service_reminder_sent that the existing crons already use.
--
-- RUN THIS BEFORE MERGING the PR that adds them. Until the columns exist the
-- crons find nothing to update and would re-send on every run.

-- Advance reminder: set once the "your booking is in N days" message goes out.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reminder_days_sent BOOLEAN DEFAULT FALSE;

-- No-show watch: set once the overdue-booking alert has gone to the admin, so
-- the same stuck booking does not alert every single day.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS noshow_alert_sent BOOLEAN DEFAULT FALSE;

-- Verify:
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'bookings'
  AND column_name IN ('reminder_days_sent', 'noshow_alert_sent');
