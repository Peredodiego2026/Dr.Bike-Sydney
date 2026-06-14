-- Migration: bikes table for bike history (task 1.3)
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS bikes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL DEFAULT 'My Bike',      -- e.g. "Red Trek", "Commuter"
  brand TEXT,
  model TEXT,
  color TEXT,
  year INTEGER,
  bike_type TEXT,  -- 'road', 'mtb', 'hybrid', 'ebike', 'cargo', 'folding'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE bikes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_bikes" ON bikes
  FOR ALL USING (auth.uid() = client_id);

CREATE POLICY "admin_read_all_bikes" ON bikes
  FOR SELECT USING (auth.role() = 'service_role');

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_bikes_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bikes_updated
  BEFORE UPDATE ON bikes
  FOR EACH ROW EXECUTE FUNCTION update_bikes_timestamp();

-- Link bookings to bikes (optional, null if not specified)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS bike_id UUID REFERENCES bikes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bikes_client ON bikes(client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_bike ON bookings(bike_id) WHERE bike_id IS NOT NULL;

COMMENT ON TABLE bikes IS 'Client-owned bikes for history tracking and multi-bike households';
