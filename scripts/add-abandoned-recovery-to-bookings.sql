-- Migration: abandoned booking recovery tracking
-- Run in Supabase SQL Editor
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS abandoned_recovery_sent BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN bookings.abandoned_recovery_sent IS 'True after abandoned booking recovery email+SMS sent.';
