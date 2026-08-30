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
--
-- 2026-08-30: "non-sensitive fields" was wrong, and the view turned out to be
-- unused. It selects `tracking_token` itself, so listing it with no filter
-- handed out the credential for every booking - and that credential buys the
-- client's street address and 4-digit arrival PIN from
-- /api/auth?role=public-track. Confirmed exploitable end to end against
-- production with nothing but the anon key.
--
-- track.html goes through that endpoint, which reads `bookings` directly with
-- the service key. It never queried this view, and neither does anything else
-- in the repo. The REVOKE at the bottom of this file is what makes the view
-- safe to keep; see scripts/lock-public-views.sql for the full write-up.
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

-- Supabase's default grants give anon and authenticated every privilege on
-- objects created in `public`, and a view runs with its OWNER's rights, so
-- without this the view is a hole straight through bookings' RLS. Re-running
-- this file without this line would reopen it.
REVOKE ALL ON public.public_booking_tracking FROM anon, authenticated;
ALTER VIEW public.public_booking_tracking SET (security_invoker = on);

COMMENT ON COLUMN bookings.tracking_token IS 'UUID token for public booking tracking — shareable via URL: /track?token=UUID. NEVER expose this column through a view granted to anon: it is the credential /api/auth?role=public-track trades for the address and arrival PIN.';
