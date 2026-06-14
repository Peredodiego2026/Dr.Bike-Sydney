-- Migration: shareable tracking token for bookings (task 2.4)
-- Run in Supabase SQL Editor

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS tracking_token UUID DEFAULT gen_random_uuid();

-- Unique index for token lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_tracking_token
  ON bookings(tracking_token);

-- Public policy: anyone with the token can read basic booking info (for track.html)
-- Note: This requires a separate anon-safe view or RLS adjustment.
-- Safe approach: create a view exposing only non-sensitive fields.
CREATE OR REPLACE VIEW public_booking_tracking AS
  SELECT 
    b.id,
    b.tracking_token,
    b.status,
    b.scheduled_date,
    b.scheduled_time,
    b.service_type,
    b.mechanic_id,
    p.full_name AS mechanic_name,
    p.avatar_url AS mechanic_avatar,
    b.mechanic_lat,
    b.mechanic_lng,
    b.eta_minutes,
    b.started_at,
    b.completed_at
  FROM bookings b
  LEFT JOIN profiles p ON b.mechanic_id = p.id;

COMMENT ON COLUMN bookings.tracking_token IS 'UUID token for public booking tracking — shareable via URL: /track?token=UUID';
