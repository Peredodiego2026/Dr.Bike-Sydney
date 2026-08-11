-- Migration: service timing and checklist columns for bookings (tasks 4.1, 4.3)
-- Run in Supabase SQL editor

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS service_duration_seconds INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pre_service_checklist JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pre_service_notes TEXT DEFAULT NULL;

-- Index for KPI queries (admin average service time)
--
-- RE-RUN THIS FILE. Until 2026-08-11 the last column here read `service_type`,
-- which does not exist on bookings (the real one is `service_name` - see the
-- insert in restore-thais-booking-2026-08-05.sql). Postgres aborts the script
-- at the failing statement, so on the original run the five ALTERs above did
-- apply and NOTHING below this line did: no index, and none of the COMMENTs.
-- Verified 2026-08-11: the five columns answer 200 over PostgREST, so only the
-- tail needs replaying. Everything here is idempotent - re-running is safe.
CREATE INDEX IF NOT EXISTS idx_bookings_service_timing
  ON bookings(status, started_at, completed_at, service_name);

COMMENT ON COLUMN bookings.started_at IS 'Timestamp when mechanic pressed Start Service';
COMMENT ON COLUMN bookings.completed_at IS 'Timestamp when mechanic pressed Complete';
COMMENT ON COLUMN bookings.service_duration_seconds IS 'Elapsed seconds from start to complete';
COMMENT ON COLUMN bookings.pre_service_checklist IS 'JSON checklist: {brakes_front: ok|warn|critical, ...}';
