-- Migration: cache for address lookups (geocoding, routing, autocomplete)
-- Run in the Supabase SQL editor.
--
-- Geocoding and routing run against Nominatim and OSRM, which are free public
-- servers. Nominatim's usage policy is one request per second and asks that
-- results be cached; OSRM's demo server offers no availability guarantee at
-- all. Neither is a service to lean on per-keystroke.
--
-- Before this table, one booking could trigger 3-4 geocodes of the SAME
-- address (the coverage check at the address step, the check again inside
-- create-booking, and the separate geocode that stores coordinates for the
-- tracking map), plus 5-10 more from the browser's address autocomplete while
-- the person typed. At Diego's current volume that is invisible. At fifty
-- bookings a day it is thousands of requests to a service that rate-limits by
-- IP, and the failure is silent: the lookup returns null, coverage falls back
-- to the zone table, and a customer who should have been quoted a price ends
-- up in the manual WhatsApp queue instead. Nobody would know why.
--
-- One row per distinct lookup. Repeat visits to the same street cost a local
-- index hit instead of an external round trip.

CREATE TABLE IF NOT EXISTS geo_cache (
  cache_key   text PRIMARY KEY,
  kind        text NOT NULL,          -- 'geocode' | 'route' | 'suggest'
  payload     jsonb,                  -- the result; NULL means "looked up, found nothing"
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE geo_cache IS
  'Cached Nominatim/OSRM lookups. Written and read only by the server (service_role). A NULL payload is a remembered miss, kept briefly so a bad address is not retried on every keystroke.';

CREATE INDEX IF NOT EXISTS idx_geo_cache_created ON geo_cache (created_at);

-- Locked to the server. The anon key must never read or write this: it is
-- keyed by customer addresses, and the whole point is that exactly one caller
-- talks to Nominatim. RLS on with no policy denies everyone except
-- service_role, which bypasses RLS by design - the same shape `claims` and
-- `notification_log` already use (verified 2026-08-23).
ALTER TABLE geo_cache ENABLE ROW LEVEL SECURITY;

-- Housekeeping: entries older than 90 days are dropped on read (see
-- api/_eta.js). This is here for a manual sweep if the table ever grows.
--   DELETE FROM geo_cache WHERE created_at < now() - interval '90 days';

SELECT
  (SELECT count(*) FROM geo_cache) AS filas,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'geo_cache') AS rls_activo;
