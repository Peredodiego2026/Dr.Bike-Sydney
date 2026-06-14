-- Migration: service timing and checklist columns for bookings (tasks 4.1, 4.3)
-- Run in Supabase SQL editor

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS service_duration_seconds INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pre_service_checklist JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pre_service_notes TEXT DEFAULT NULL;

-- Index for KPI queries (admin average service time)
CREATE INDEX IF NOT EXISTS idx_bookings_service_timing
  ON bookings(status, started_at, completed_at, service_type);

COMMENT ON COLUMN bookings.started_at IS 'Timestamp when mechanic pressed Start Service';
COMMENT ON COLUMN bookings.completed_at IS 'Timestamp when mechanic pressed Complete';
COMMENT ON COLUMN bookings.service_duration_seconds IS 'Elapsed seconds from start to complete';
COMMENT ON COLUMN bookings.pre_service_checklist IS 'JSON checklist: {brakes_front: ok|warn|critical, ...}';
