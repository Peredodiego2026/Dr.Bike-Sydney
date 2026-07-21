-- Migration: optional client-preferred-mechanic on bookings
-- Run in Supabase SQL Editor
--
-- The on/off admin toggle for this feature does NOT need a schema change -
-- it reuses the existing van_zones(van_number=0) sentinel-row settings
-- pattern already used for business details / WhatsApp number / alert
-- triggers (see js/admin.js toggleTrigger()).

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS preferred_mechanic_id UUID DEFAULT NULL REFERENCES escalation_contacts(id);

CREATE INDEX IF NOT EXISTS idx_bookings_preferred_mechanic
  ON bookings(preferred_mechanic_id) WHERE preferred_mechanic_id IS NOT NULL;

COMMENT ON COLUMN bookings.preferred_mechanic_id IS 'Client''s optional preferred mechanic, chosen at booking time. Gets first crack at the job for MECHANIC_PREFERENCE_WINDOW_MIN minutes (api/auth.js) before it opens to the general van queue. Only honored while the "Let clients choose a mechanic" toggle in Admin > Settings is on.';
