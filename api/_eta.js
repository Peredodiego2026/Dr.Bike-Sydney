// Real driving ETA from the mechanic's live position to the client's address.
//
// Both the geocoding and the routing run server-side on purpose: the browser
// CSP would have to whitelist another host, and Nominatim's usage policy is
// per-client, so doing it here keeps one caller instead of one per mechanic
// device. Everything is best-effort - any failure returns null and the caller
// sends its message without an ETA rather than inventing one.

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const UA = 'DrBikeSydney/1.0 (contact@drbikesydney.com.au)';

async function geocode(address, signal) {
  const q = encodeURIComponent(address);
  const r = await fetch(`${NOMINATIM}?format=json&limit=1&countrycodes=au&q=${q}`, {
    headers: { 'User-Agent': UA },
    signal,
  });
  if (!r.ok) return null;
  const hits = await r.json();
  const hit = Array.isArray(hits) ? hits[0] : null;
  if (!hit) return null;
  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

// Same lookup, on its own, for the one caller that wants coordinates rather
// than a duration: handleCreateBooking stores them on the booking so the
// tracking page never has to geocode from the client's browser
// (docs/PENDIENTES.md 13.1). Kept here rather than copied into api/auth.js so
// there stays exactly one Nominatim caller, with one User-Agent and one
// countrycodes filter, as the note at the top of this file intends.
//
// Never throws: a map service must not be able to stop a booking.
export async function geocodeAddress(address, { timeoutMs = 4000 } = {}) {
  if (!address || String(address).trim().length < 4) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await geocode(String(address).trim(), ctl.signal);
  } catch (e) {
    console.warn('[geocode] could not resolve address:', e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Returns whole minutes of driving time, or null if it could not be worked out.
export async function drivingEtaMinutes({ fromLat, fromLng, address, timeoutMs = 5000 }) {
  const lat = Number(fromLat);
  const lng = Number(fromLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (!address || String(address).trim().length < 4) return null;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const dest = await geocode(String(address).trim(), ctl.signal);
    if (!dest) return null;
    const r = await fetch(`${OSRM}/${lng},${lat};${dest.lng},${dest.lat}?overview=false`, {
      signal: ctl.signal,
    });
    if (!r.ok) return null;
    const data = await r.json();
    const seconds = data?.routes?.[0]?.duration;
    if (!Number.isFinite(seconds)) return null;
    return Math.max(1, Math.round(seconds / 60));
  } catch (e) {
    console.warn('[eta] could not compute:', e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
