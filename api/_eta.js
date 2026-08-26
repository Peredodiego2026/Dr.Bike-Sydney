// Real driving ETA from the mechanic's live position to the client's address.
//
// Both the geocoding and the routing run server-side on purpose: the browser
// CSP would have to whitelist another host, and Nominatim's usage policy is
// per-client, so doing it here keeps one caller instead of one per mechanic
// device. Everything is best-effort - any failure returns null and the caller
// sends its message without an ETA rather than inventing one.

import { createClient } from '@supabase/supabase-js';
import { TRAFFIC_FACTOR } from './_coverage.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const UA = 'DrBikeSydney/1.0 (contact@drbikesydney.com.au)';

// ── Cache ────────────────────────────────────────────────────────────────────
// Nominatim allows one request per second and asks that results be cached.
// OSRM's demo server promises nothing at all. Before this, one booking could
// geocode the same address three or four times over, and the browser's
// autocomplete added five to ten more per person while they typed.
//
// The failure mode is what makes this worth fixing rather than watching: a
// rate-limited lookup returns null, coverage silently falls back to the zone
// table, and a customer who should have been quoted a price lands in the
// manual WhatsApp queue instead. It degrades quietly, which is the kind of
// bug this project keeps finding months late.
const CACHE_TTL_DAYS = 90;
const MISS_TTL_DAYS = 7; // a "found nothing" is remembered briefly, not for 90 days

const cacheKey = (kind, value) =>
  `${kind}:${String(value).toLowerCase().replace(/\s+/g, ' ').trim()}`;

function cacheClient() {
  const url = process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!key) return null;
  return createClient(url, key);
}

// Never throws and never blocks the caller: a cache that is down must not be
// able to stop a booking, it just means the lookup runs as it did before.
async function cacheGet(kind, value) {
  const sb = cacheClient();
  if (!sb) return undefined;
  try {
    const { data } = await sb
      .from('geo_cache')
      .select('payload, created_at')
      .eq('cache_key', cacheKey(kind, value))
      .maybeSingle();
    if (!data) return undefined;
    const ageDays = (Date.now() - new Date(data.created_at).getTime()) / 86400000;
    const ttl = data.payload === null ? MISS_TTL_DAYS : CACHE_TTL_DAYS;
    if (ageDays > ttl) return undefined;
    return data.payload; // null is a real answer here: "looked up, found nothing"
  } catch {
    return undefined;
  }
}

async function cacheSet(kind, value, payload) {
  const sb = cacheClient();
  if (!sb) return;
  try {
    await sb
      .from('geo_cache')
      .upsert({ cache_key: cacheKey(kind, value), kind, payload, created_at: new Date() });
  } catch {
    /* a cache that cannot be written is still a working app */
  }
}

async function geocodeLive(address, signal) {
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

async function geocode(address, signal) {
  const cached = await cacheGet('geocode', address);
  if (cached !== undefined) return cached;
  const hit = await geocodeLive(address, signal);
  await cacheSet('geocode', address, hit);
  return hit;
}

// The address autocomplete. Was called straight from every customer's browser
// on a 250 ms debounce - five to ten requests per address typed, per person,
// with no way to identify the app: browsers silently drop a `User-Agent`
// header set by fetch(), so the "DrBikeSydney/1.0" the old code passed never
// left the machine. Nominatim's policy requires an application to identify
// itself, and this now does, from one server instead of every device - which
// is what this file's opening comment always said the design was.
export async function suggestAddresses(query, { limit = 5, timeoutMs = 4000 } = {}) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  const cached = await cacheGet('suggest', q);
  if (cached !== undefined) return cached || [];

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const enc = encodeURIComponent(`${q}, Sydney, NSW, Australia`);
    const r = await fetch(
      `${NOMINATIM}?format=json&limit=${limit}&addressdetails=1&countrycodes=au&q=${enc}`,
      { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: ctl.signal }
    );
    if (!r.ok) return [];
    const raw = await r.json();
    // Nominatim returns separate OSM records that render to the same text
    // (different way segments of one street), so the dropdown used to show
    // the identical line two or three times.
    const seen = new Set();
    const out = (Array.isArray(raw) ? raw : [])
      .filter((i) => i?.display_name && !seen.has(i.display_name) && seen.add(i.display_name))
      .map((i) => ({ display_name: i.display_name, lat: i.lat, lon: i.lon }));
    await cacheSet('suggest', q, out);
    return out;
  } catch (e) {
    console.warn('[geo] suggest failed:', e.message);
    return [];
  } finally {
    clearTimeout(timer);
  }
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

// Minutes AND road kilometres for one trip, or null if it could not be worked
// out. OSRM returns both in the same response - only the duration was ever
// read, so the distance came free once someone asked for it (the out-of-zone
// message to Diego quotes "78 km · 1h 5min" so he can judge a job at a
// glance).
export async function drivingRoute({ fromLat, fromLng, address, timeoutMs = 5000 }) {
  const lat = Number(fromLat);
  const lng = Number(fromLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (!address || String(address).trim().length < 4) return null;

  // Keyed on the origin too: the same address routed from a different van
  // base is a different trip, so a second van cannot inherit the first one's
  // cached times.
  const routeKey = `${lat.toFixed(4)},${lng.toFixed(4)}|${String(address).trim()}`;
  const cached = await cacheGet('route', routeKey);
  if (cached !== undefined) return cached;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const dest = await geocode(String(address).trim(), ctl.signal);
    if (!dest) {
      await cacheSet('route', routeKey, null);
      return null;
    }
    const r = await fetch(`${OSRM}/${lng},${lat};${dest.lng},${dest.lat}?overview=false`, {
      signal: ctl.signal,
    });
    if (!r.ok) return null; // transient - do NOT cache a service outage
    const data = await r.json();
    const seconds = data?.routes?.[0]?.duration;
    const metres = data?.routes?.[0]?.distance;
    if (!Number.isFinite(seconds)) return null;
    const out = {
      minutes: Math.max(1, Math.round(seconds / 60)),
      km: Number.isFinite(metres) ? Math.round(metres / 1000) : null,
    };
    await cacheSet('route', routeKey, out);
    return out;
  } catch (e) {
    console.warn('[eta] could not compute:', e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── The line on the client's map ────────────────────────────────────────────
// Diego, watching his own booking: "cuando estaba en ruta tampoco vio ni una
// ruta ni un tiempo ni nada... no se vio eso en ni un momento... se debe ver el
// camino hacia el mechanico y la ubicacion del mechanico".
//
// He was right that nothing was there. Grep `polyline` in js/app.js before this
// commit and the only hits are SVG icons - a route line was never drawn. The
// ETA beside it was a straight line divided by a fixed speed, which in Sydney
// reads "3.2 km away" for an eight-kilometre drive.
//
// Different from drivingRoute() above in two ways that matter:
//   - it asks OSRM for the geometry (`overview=full`), which is the actual line;
//   - it takes coordinates rather than an address, because the mechanic's
//     position is already a fix and geocoding it would be a lookup that can only
//     lose precision.
//
// Same reason as everything else in this file for living on the server: the
// browser's CSP does not whitelist the OSRM host, and the demo server's usage
// is per-caller.
export async function drivingRouteGeometry({ fromLat, fromLng, toLat, toLng, timeoutMs = 6000 }) {
  const a = [Number(fromLat), Number(fromLng)];
  const b = [Number(toLat), Number(toLng)];
  if (![...a, ...b].every(Number.isFinite)) return null;
  if (Math.abs(a[0]) > 90 || Math.abs(b[0]) > 90) return null;
  if (Math.abs(a[1]) > 180 || Math.abs(b[1]) > 180) return null;

  // Rounded to ~100m on the origin. A van that has crept forward twenty metres
  // is on the same road with the same route, and keying on its exact position
  // would mean a cache entry per GPS tick and a call to a free service every
  // five seconds.
  const routeKey = `${a[0].toFixed(3)},${a[1].toFixed(3)}|${b[0].toFixed(5)},${b[1].toFixed(5)}`;
  const cached = await cacheGet('routegeom', routeKey);
  if (cached !== undefined) return cached;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(
      `${OSRM}/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`,
      { signal: ctl.signal, headers: { 'User-Agent': UA } }
    );
    if (!r.ok) return null; // transient - do NOT cache a service outage
    const data = await r.json();
    const route = data?.routes?.[0];
    const seconds = route?.duration;
    const metres = route?.distance;
    // GeoJSON is [lng, lat]; Leaflet wants [lat, lng]. Getting this backwards
    // draws a line through the Indian Ocean, so it is flipped once, here.
    const coordinates = (route?.geometry?.coordinates || [])
      .filter((c) => Array.isArray(c) && c.length >= 2)
      .map(([lng, lat]) => [lat, lng]);
    if (!Number.isFinite(seconds) || coordinates.length < 2) return null;

    const out = {
      // OSRM returns free-flow times. TRAFFIC_FACTOR is the same calibration the
      // coverage map uses so a client is never quoted a rosier number than the
      // one the pricing was built on.
      minutes: Math.max(1, Math.round((seconds / 60) * TRAFFIC_FACTOR)),
      km: Number.isFinite(metres) ? Math.round((metres / 1000) * 10) / 10 : null,
      coordinates,
    };
    await cacheSet('routegeom', routeKey, out);
    return out;
  } catch (e) {
    console.warn('[eta] could not draw a route:', e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Kept as the ETA callers' shape: they only ever wanted the minutes.
export async function drivingEtaMinutes(opts) {
  const route = await drivingRoute(opts);
  return route ? route.minutes : null;
}
