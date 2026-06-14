-- Migration: add next_service_reminder_sent column to bookings (task 4.4)
-- Run in Supabase SQL editor

ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS next_service_reminder_sent TIMESTAMPTZ DEFAULT NULL;

-- Index for efficient cron queries
CREATE INDEX IF NOT EXISTS idx_bookings_reminder_sent 
  ON bookings(next_service_reminder_sent, status, scheduled_date);

-- Comment
COMMENT ON COLUMN bookings.next_service_reminder_sent IS 'Timestamp when next-service reminder email was sent to client';
