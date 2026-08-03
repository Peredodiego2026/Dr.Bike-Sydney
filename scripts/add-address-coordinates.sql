-- Migration: store the booking address as coordinates (Diego, 2026-08-03)
-- Run in Supabase SQL Editor.
--
-- WHY. track.html shows a live ETA ("arrives in ~12 min"). To compute it, the
-- CLIENT'S BROWSER was sending their full street address to
-- nominatim.openstreetmap.org in a URL query string, on every tracking page
-- load - a third-party server we do not control, and query strings are what
-- every server logs by default. That is finding 13.1 in docs/PENDIENTES.md.
--
-- The fix is to translate the address to coordinates ONCE, server-side, when
-- the booking is created (api/auth.js handleCreateBooking), and store the
-- result here. After that the tracking page never needs to ask anyone where
-- the address is: it already has the numbers. The routing service still gets
-- two lat/lng pairs, which name no street and no person.
--
-- Safe to run more than once. Existing bookings stay NULL and simply show no
-- ETA - the code treats missing coordinates as "no ETA", never as a reason to
-- fall back to sending the address out.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS address_lat DOUBLE PRECISION DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS address_lng DOUBLE PRECISION DEFAULT NULL;

COMMENT ON COLUMN bookings.address_lat IS
  'Latitude of bookings.address, geocoded server-side at creation so the client browser never sends the address to a third party (PENDIENTES 13.1).';
COMMENT ON COLUMN bookings.address_lng IS
  'Longitude of bookings.address. See address_lat.';

-- Verification - two rows means the migration is applied:
--
--   select column_name
--   from information_schema.columns
--   where table_name = 'bookings'
--     and column_name in ('address_lat', 'address_lng');
