-- Migration: mechanic profile columns (task 1.1)
-- Run in Supabase SQL Editor

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS years_experience INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mechanic_zone TEXT DEFAULT NULL;  -- 'inner_west', 'north_shore', etc.

-- Index for mechanic lookup by zone
CREATE INDEX IF NOT EXISTS idx_profiles_mechanic_zone
  ON profiles(mechanic_zone) WHERE mechanic_zone IS NOT NULL;

COMMENT ON COLUMN profiles.avatar_url IS 'Public URL to mechanic/user profile photo (Supabase Storage)';
COMMENT ON COLUMN profiles.bio IS 'Short mechanic bio shown on booking confirmation';
COMMENT ON COLUMN profiles.years_experience IS 'Years as a bicycle mechanic';
COMMENT ON COLUMN profiles.mechanic_zone IS 'Primary service zone for this mechanic';
