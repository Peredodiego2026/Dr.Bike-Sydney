import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://tgpipbloisahufaywhqb.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncGlwYmxvaXNhaHVmYXl3aHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTM4NjgsImV4cCI6MjA5MzQ4OTg2OH0.P1lpqPVmW0HE3PwHeUhRw20eRP3ApdDGYuiwtJhRD9U';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// There used to be MOCK_SERVICES and MOCK_BOOKINGS here, returned whenever a
// query failed or nobody was signed in. They are gone (2026-07-28) because
// both of them lied to real clients on production:
//
//   - getServices() fell back to four hardcoded prices. The whole point of
//     keeping prices in the `services` table is that they change; a network
//     blip showed a stale price list as if it were current.
//   - getMyBookings() handed MOCK_BOOKINGS to anyone without a session, so a
//     logged-out visitor tapping "Bookings" saw a confirmed Tune-Up for today
//     and a completed service from last week. Neither existed.
//
// The rule these broke is already in CLAUDE.md: no silent errors. A failure
// has to reach the screen as a failure, which is what the callers now do.

// On a bad mobile connection a request does not usually fail - it just sits
// there, unanswered. Without a deadline that is a spinner the reader watches
// forever, which is the same lie as mock data wearing a different hat. Twelve
// seconds is long enough for a slow 3G round trip and short enough to still
// feel like an answer.
const REQUEST_TIMEOUT_MS = 12000;
function withDeadline(promise, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + ' timed out')), REQUEST_TIMEOUT_MS);
    }),
  ]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Rejects rather than returning something plausible - same contract as
// getAvailableSlots below, and for the same reason.
export async function getServices() {
  const { data, error } = await withDeadline(
    sb.from('services').select('*').order('price'),
    'services'
  );
  if (error) throw new Error(error.message || 'services fetch failed');
  if (!data?.length) throw new Error('services table returned nothing');
  return data;
}

export async function getAvailableSlots(date, serviceId) {
  // No fallback to "all available" here on purpose: a failed check must never
  // let a client see a slot as bookable that we couldn't actually verify -
  // callers must handle the rejection (show retry, not a slot grid).
  const svcParam = serviceId ? `&serviceId=${encodeURIComponent(serviceId)}` : '';
  const res = await fetch(
    `/api/auth?role=get-availability&date=${encodeURIComponent(date)}${svcParam}`
  );
  if (!res.ok) throw new Error('availability fetch failed');
  return await res.json();
}

const DEFAULT_CALLOUT_FEE = 20;

export async function getCalloutFee(address) {
  try {
    const { data, error } = await sb.from('callout_zones').select('callout_fee, suburbs');
    // A query error is NOT the same as "no zones configured": if it fails, the
    // client shows (and tries to pay) the flat $20 while the server recomputes
    // the real suburb fee and rejects the mismatch - the client just can't
    // book, with no clue why. Silent until now (audit 2026-08-23) - at least
    // leave a trace so a broken callout_zones read is diagnosable.
    if (error) {
      console.error('[getCalloutFee] callout_zones read failed, showing $20:', error.message);
      return DEFAULT_CALLOUT_FEE;
    }
    if (!data?.length) return DEFAULT_CALLOUT_FEE;
    const addr = (address || '').toLowerCase();
    const zone = data.find((z) =>
      (z.suburbs || []).some((s) => addr.includes(String(s).toLowerCase()))
    );
    return zone ? Number(zone.callout_fee) : DEFAULT_CALLOUT_FEE;
  } catch (e) {
    console.error('[getCalloutFee] threw, showing $20:', e.message);
    return DEFAULT_CALLOUT_FEE;
  }
}

export async function getMechanicInfo(mechanicId) {
  try {
    const { data, error } = await sb
      .from('escalation_contacts')
      .select('*')
      .eq('id', mechanicId)
      .single();
    if (error) return { name: 'Your Mechanic', phone: '0433 963 250' };
    return data;
  } catch (e) {
    console.error('[getMechanicInfo] failed, showing generic contact:', e.message);
    return { name: 'Your Mechanic', phone: '0433 963 250' };
  }
}

export async function getBookingStatus(bookingId) {
  const { data, error } = await sb.from('bookings').select('*').eq('id', bookingId).single();
  if (error) throw error;
  return data;
}

export async function submitReview(bookingId, rating, comment, photoBase64) {
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session?.user) throw new Error('Please sign in to leave a review.');
  const resp = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'client-review',
      booking_id: bookingId,
      access_token: session.access_token,
      client_id: session.user.id,
      rating,
      comment,
      photo_base64: photoBase64 || null,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Could not submit review');
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, name) {
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });
  if (error) throw error;
  return data;
}

// subscribeToMechanicLocation() lived here until 2026-08-02. It was imported by
// js/app.js and never called - grep across the repo found zero invocations - so
// it shipped in every bundle without doing anything. Deleted rather than left
// dormant because of WHAT it did: while no real GPS row arrived, it invented
// one, walking a fake pin toward the centre of Sydney every 3 seconds. Any
// future caller would have shown a paying client their mechanic driving over
// when nobody had moved. Same family as MOCK_BOOKINGS and MOCK_SERVICES above,
// and it survived the 2026-07-28 purge only because it was already unreachable.
//
// Live tracking, when it is built, reads `mechanic_locations` and shows nothing
// until a real row exists.

// Three outcomes the caller has to tell apart, because they read completely
// differently on screen: null = nobody is signed in (ask them to), [] = signed
// in with nothing booked yet, throw = we could not find out.
// Set on every getMyBookings() call - true when the server had to cap the
// result (5.1). A live binding: importers see the update from the same call
// that returned the data, no extra round trip.
export let bookingsTruncated = false;

export async function getMyBookings() {
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) return null;
  const res = await withDeadline(
    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'client-bookings',
        access_token: session.access_token,
        client_id: session.user.id,
      }),
    }),
    'bookings'
  );
  if (!res.ok) throw new Error('bookings fetch failed');
  bookingsTruncated = res.headers.get('x-truncated') === 'true';
  return await res.json();
}
