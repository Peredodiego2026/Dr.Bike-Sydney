-- ═══════════════════════════════════════════════════════════════════════
-- RLS Policies for bookings table - Dr. Bike Sydney
-- ═══════════════════════════════════════════════════════════════════════
--
-- HOW TO APPLY (manual - Supabase does not allow remote SQL execution):
--   1. Go to: https://supabase.com/dashboard/project/tgpipbloisahufaywhqb
--   2. Click "SQL Editor" in the left sidebar
--   3. Click "New query"
--   4. Paste this entire file and click "Run"
--
-- AFTER APPLYING:
--   - Clients authenticated via Supabase Auth can see/create/update
--     their own bookings (auth.uid() = client_id)
--   - Admin (api/admin-auth.js) uses service_role key -> bypasses RLS
--   - Mechanic (api/mechanic-auth.js) uses service_role key -> bypasses RLS
-- ═══════════════════════════════════════════════════════════════════════

-- Step 1: Enable Row Level Security on bookings
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop existing policies to allow re-running safely
DROP POLICY IF EXISTS bookings_select_own ON bookings;
DROP POLICY IF EXISTS bookings_insert_own ON bookings;
DROP POLICY IF EXISTS bookings_update_own ON bookings;

-- Step 3: Clients can view their own bookings
CREATE POLICY bookings_select_own ON bookings
  FOR SELECT USING (auth.uid() = client_id);

-- Step 4: Clients can create bookings for themselves
CREATE POLICY bookings_insert_own ON bookings
  FOR INSERT WITH CHECK (auth.uid() = client_id);

-- Step 5: Clients can update their own bookings (e.g., cancel)
CREATE POLICY bookings_update_own ON bookings
  FOR UPDATE USING (auth.uid() = client_id);

-- NOTE: service_role key bypasses RLS entirely.
-- Admin and mechanic server-side API routes use SUPABASE_SERVICE_KEY,
-- so they can read/write all bookings without additional policies.
