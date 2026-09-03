// Handles admin auth (?role=admin) and mechanic auth (?role=mechanic).
// Vercel rewrites map /api/admin-auth and /api/mechanic-auth to this file.
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import crypto from 'crypto';
import { geocodeAddress, drivingRoute, drivingRouteGeometry, suggestAddresses } from './_eta.js';
import { resolveCoverage, needsQuote, BASE, VALID_FEES, formatMinutes } from './_coverage.js';
import {
  guard,
  rateLimit,
  isLoginLocked,
  recordLoginFailure,
  clearLoginFailures,
  verifyMechanicToken,
  LOGIN_LOCK_MINUTES,
  SELF_BASE_URL,
  normalizeAUPhone,
} from './_security.js';
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  isGoogleCalendarConfigured,
  saveGoogleRefreshToken,
} from './_google-calendar.js';
import {
  buildCompletionCalls,
  dispatchCompletionCalls,
  recordCompletionOutcome,
} from './_completion-notify.js';
import { completionVerdict } from './_completion-guard.js';
import { occupiedBookings, expiredHoldIds, slotVerdict, HOLD_MINUTES } from './_slot-hold.js';
import { trackingScope, applyTrackingScope } from './_tracking-scope.js';
import { reviewCredential, reviewGate } from './_review-auth.js';
import { auditOrphanPayments } from './_orphan-audit.js';

const ADMIN_TEST_EMAIL = 'peredo.dm@gmail.com';

// Only these emails may hold an admin session (see handleAdmin). Add more
// here if other staff need admin access later.
const ADMIN_ALLOWED_EMAILS = [ADMIN_TEST_EMAIL];

// HMAC-SHA256 of a PIN keyed on the service key. No new env var needed.
// Used to store/verify escalation_contacts.pin_hash without keeping the PIN in plaintext.
function hashPin(pin) {
  const secret = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '';
  return crypto.createHmac('sha256', secret).update(String(pin).trim()).digest('hex');
}

// ── Mechanic session token (stateless, HMAC-signed) ──────────────────────────
// token = base64url(payload).base64url(sig). Lets the mechanic app prove an
// earlier successful login without resending the raw PIN on every request.
const TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function makeToken(mid) {
  const secret = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '';
  const payload = b64url(JSON.stringify({ mid, exp: Date.now() + TOKEN_TTL_MS }));
  const sig = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
  return `${payload}.${sig}`;
}
// One implementation, in _security.js, so /api/send-push can identify a mechanic
// without importing this whole module.
const verifyToken = verifyMechanicToken;

// Shared mechanic auth: accepts a session token OR a PIN (dual-accept during
// migration). Returns { mechanic } on success, or { error, status } on failure.
//
// The lockout lives HERE, not in the login handler, and that is the whole point
// of this function existing. Until 2026-08-30 only role=mechanic (the login
// screen) checked isLoginLocked; the other thirteen mechanic-* routes - jobs,
// update-status, parts, messages, location, ... - all funnel through
// authMechanic and every one accepted an unlimited stream of PIN guesses,
// capped only by the 30/min per-IP rate limit. The PIN is four digits: 10,000
// possibilities, ~5 hours to walk at 30/min from one IP and minutes across a
// handful. Whoever lands it sees every client's name, phone and exact address
// for the day. Confirmed against production: role=mechanic returned 429 on the
// 6th bad PIN, role=mechanic-jobs returned 401 forever. Checking it in the
// shared path covers all fourteen at once.
export async function authMechanic(req) {
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const token = req.body?.token;
  const pin = req.body?.pin;
  // Minimum stays 4, not 6, even though handleAdminSetMechanicPin now issues
  // six digits: pin_hash is one-way, so a PIN handed out before 2026-09-01
  // cannot be detected or migrated here - raising this floor would lock those
  // mechanics out with a misleading "PIN required". They keep working until
  // Diego reissues them from Admin, which is the step that actually retires
  // the short ones.
  if (!token && (!pin || String(pin).trim().length < 4))
    return { error: 'PIN required', status: 401 };

  // The lockout applies to the PIN path only. A session token is a 256-bit
  // HMAC - not something you guess four digits at a time - and an expired one
  // is a normal event, not an attack, so a token-only request must never trip
  // the lock or feed its counter.
  const pinAttempt = !!pin;
  if (pinAttempt && (await isLoginLocked(req)))
    return {
      error: `Too many attempts. Try again in ${LOGIN_LOCK_MINUTES} minutes.`,
      status: 429,
    };

  const resp = await fetch(`${SUPABASE_URL}/rest/v1/escalation_contacts?select=*`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!resp.ok) return { error: 'Database error', status: 500 };
  const contacts = await resp.json();

  let mechanic = null;
  const mid = token ? verifyToken(token) : null;
  if (mid) {
    mechanic = contacts.find((c) => c.id === mid);
  }
  if (!mechanic && pin) {
    // pin_hash only. There used to be a second lookup here against a plaintext
    // `pin` column, plus a background PATCH that back-filled the hash the first
    // time someone logged in with a legacy PIN. Both are gone: that column does
    // not exist in this database (verified 2026-09-03 - `where pin is not null`
    // fails with `42703: column "pin" does not exist`), so `c.pin` was always
    // undefined and neither branch could ever run. Removing them changes no
    // behaviour; it removes a fallback that read as a live risk in every
    // security review and was not one.
    mechanic = contacts.find((c) => c.pin_hash && c.pin_hash === hashPin(String(pin).trim()));
  }

  if (!mechanic) {
    // Only a PIN guess feeds the lockout counter; a bad/expired token does not.
    if (pinAttempt) await recordLoginFailure(req);
    return { error: 'Invalid PIN', status: 401 };
  }
  if (mechanic.active === false) return { error: 'Account disabled', status: 403 };
  // A correct PIN wipes the slate so a mechanic who mistyped a few times is not
  // still counted against once they get it right.
  if (pinAttempt) await clearLoginFailures(req);
  return { mechanic };
}

function mechanicName(m) {
  return [m.first_name, m.last_name].filter(Boolean).join(' ').trim() || m.name || '';
}

// Convert Sydney local date+time to UTC Date (DST-aware). Same approach as
// api/send-reminders.js's sydneyLocalToUtc - kept as a local copy since there's
// no shared utils module for these two small files.
function sydneyLocalToUtc(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [hh, mm] = [parseInt(m[1], 10), parseInt(m[2], 10)];
  const [Y, Mo, D] = dateStr.split('-').map(Number);
  const probe = new Date(Date.UTC(Y, Mo - 1, D, hh, mm));
  const part = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Australia/Sydney',
    timeZoneName: 'shortOffset',
  })
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName');
  const offset = part ? parseInt((part.value.match(/GMT([+-]\d{1,2})/) || [0, 10])[1], 10) : 10;
  return new Date(Date.UTC(Y, Mo - 1, D, hh - offset, mm));
}

// Whole hours of notice between `nowMs` and the Sydney-local scheduled_date/time,
// floored and clamped at 0 (never negative). Used to decide whether a client
// cancellation qualifies for a refund per the 24h policy in terms.html section 6.
export function hoursUntilAppointment(dateStr, timeStr, nowMs = Date.now()) {
  const when = sydneyLocalToUtc(dateStr, timeStr);
  if (!when) return 0;
  return Math.max(0, Math.floor((when.getTime() - nowMs) / 3600000));
}

// NSW public holidays 2026 (source: nsw.gov.au / Fair Work Ombudsman, checked
// 12 Jul 2026). Needs a new entry added each year - there's no API for this,
// and a wrong date here means a Sunday-rate day silently charges normal price
// or vice versa, so keep this list verified against an official source, not
// guessed.
const NSW_PUBLIC_HOLIDAYS_2026 = [
  '2026-01-01', // New Year's Day
  '2026-01-26', // Australia Day
  '2026-04-03', // Good Friday
  '2026-04-04', // Easter Saturday
  '2026-04-05', // Easter Sunday
  '2026-04-06', // Easter Monday
  '2026-04-25', // Anzac Day
  '2026-04-27', // Anzac Day additional public holiday
  '2026-06-08', // King's Birthday
  '2026-10-05', // Labour Day
  '2026-12-25', // Christmas Day
  '2026-12-26', // Boxing Day
  '2026-12-28', // Boxing Day additional public holiday
];

// Diego's rule (confirmed): Sundays and NSW public holidays cost 20% more -
// the standard AU trade "penalty rate" convention. Saturdays are normal price.
export const SURCHARGE_MULTIPLIER = 1.2;

export function isSurchargeDay(dateStr) {
  const [Y, Mo, D] = String(dateStr || '')
    .split('-')
    .map(Number);
  if (!Y || !Mo || !D) return false;
  const dow = new Date(Y, Mo - 1, D).getDay(); // 0 = Sunday
  if (dow === 0) return true;
  return NSW_PUBLIC_HOLIDAYS_2026.includes(dateStr);
}

// Rounds to the nearest cent so $109 * 1.2 comes out as a clean $130.80, not a
// floating-point remainder.
export function applySurcharge(amount, dateStr) {
  if (!isSurchargeDay(dateStr)) return amount;
  return Math.round(amount * SURCHARGE_MULTIPLIER * 100) / 100;
}

// Membership plans (confirmed with Diego, revised version): each plan gets
// 3 separate monthly quotas - "minor" (any service under $60), "wash" (the
// Bike Wash service), and "tuneup" (the Tune-Up service) - matched against
// the real services table by price/name, not a hardcoded list. Basic's
// included visits still incur the callout fee ("solo por ir" - Diego's
// words); Standard/VIP's waive it entirely. A booking that doesn't fall into
// any of the 3 categories (e.g. a Standard Service or a repair >= $60), or
// one that does but has used up that category's quota, is full price with
// the plan's ongoing discount applied to both price and fee (same
// both-components convention the Sunday surcharge already uses). VIP's
// discount gets a further +5 points because there's no separate "parts"
// line item to discount on its own - it stacks onto the whole beyond-quota
// price instead.
//
// "Emergency" callout terms and VIP's "unless outside your zone" fee waiver
// are policy stated in the plan copy, not enforced here - there's no
// "is_emergency" flag or "client's home zone" concept in the booking flow
// today, so those stay a manual call at booking/admin time rather than an
// automated check.
export const MEMBERSHIP_PLANS = {
  basic: { quotas: { minor: 1, wash: 1, tuneup: 0 }, waiveCallout: false, discountPct: 5 },
  standard: { quotas: { minor: 2, wash: 1, tuneup: 1 }, waiveCallout: true, discountPct: 10 },
  vip: {
    quotas: { minor: 3, wash: 2, tuneup: 1 },
    waiveCallout: true,
    discountPct: 15,
    bonusDiscountPct: 5,
  },
};

const MINOR_SERVICE_MAX_PRICE = 60;

// Which free-quota bucket (if any) a service falls into, matched against the
// base (pre-surcharge) price/name so a Sunday surcharge never pushes a
// service in or out of the "minor" bucket.
export function membershipCategoryFor(serviceName, basePrice) {
  if (serviceName === 'Bike Wash') return 'wash';
  if (serviceName === 'Tune-Up') return 'tuneup';
  if (Number(basePrice) < MINOR_SERVICE_MAX_PRICE) return 'minor';
  return null;
}

// Counts this client's non-cancelled bookings already scheduled in the same
// calendar month as scheduledDate, broken down by membership category - i.e.
// how many of each monthly quota they've already used, so this NEW booking
// knows whether it's an included visit or an extra one. Uses the booking
// being scheduled's own month, not today's, so booking ahead into next month
// checks next month's quota.
async function countMonthlyBookingsByCategory(sb, clientId, scheduledDate) {
  const [y, m] = String(scheduledDate).split('-');
  const monthStart = `${y}-${m}-01`;
  const nextMonth = new Date(Number(y), Number(m), 1); // JS month is 0-based, so this is already +1
  const monthEnd = nextMonth.toISOString().split('T')[0];
  const { data } = await sb
    .from('bookings')
    .select('service_name, service_price')
    .eq('client_id', clientId)
    .neq('status', 'cancelled')
    .gte('scheduled_date', monthStart)
    .lt('scheduled_date', monthEnd);
  const counts = { minor: 0, wash: 0, tuneup: 0 };
  for (const b of data || []) {
    const cat = membershipCategoryFor(b.service_name, b.service_price);
    if (cat) counts[cat]++;
  }
  return counts;
}

// Authoritative pricing: base prices in, membership-adjusted prices out.
// Shared by the client-facing quote endpoint (so what Stripe charges is
// already correct) and handleCreateBooking's own verification (so a booking
// can never be created for less than what membership rules actually allow).
export async function applyMembershipPricing(
  sb,
  clientId,
  scheduledDate,
  servicePrice,
  calloutFee,
  serviceName,
  basePrice
) {
  const { data: profile } = await sb
    .from('profiles')
    .select('membership_plan, membership_status')
    .eq('id', clientId)
    .maybeSingle();
  const plan = MEMBERSHIP_PLANS[profile?.membership_plan];
  if (!plan || profile.membership_status !== 'active')
    return { servicePrice, calloutFee, plan: null, included: false };

  const category = membershipCategoryFor(serviceName, basePrice);
  if (category && plan.quotas[category] > 0) {
    const usedThisMonth = await countMonthlyBookingsByCategory(sb, clientId, scheduledDate);
    if (usedThisMonth[category] < plan.quotas[category]) {
      return {
        servicePrice: 0,
        calloutFee: plan.waiveCallout ? 0 : calloutFee,
        plan: profile.membership_plan,
        included: true,
      };
    }
  }
  const pct = (100 - plan.discountPct - (plan.bonusDiscountPct || 0)) / 100;
  return {
    servicePrice: Math.round(servicePrice * pct * 100) / 100,
    calloutFee: Math.round(calloutFee * pct * 100) / 100,
    plan: profile.membership_plan,
    included: false,
  };
}

// Privacy-safe display name for a client's review shown publicly (e.g. "Sarah M.")
export function shortClientName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/);
  if (!parts[0]) return 'Dr. Bike client';
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
}

// Aggregates a mechanic's completed-job rows (client_rating/client_review/client_name)
// into { jobs_completed, rating, reviews } - shared by handlePublicTrack (one mechanic)
// and handlePublicMechanics (all mechanics), so the two never drift out of sync.
export function aggregateMechanicStats(jobs, { maxReviews = 8 } = {}) {
  const rated = jobs.filter((j) => j.client_rating !== null && j.client_rating !== undefined);
  const rating = rated.length
    ? Math.round((rated.reduce((s, j) => s + j.client_rating, 0) / rated.length) * 10) / 10
    : null;
  const reviews = jobs
    .filter((j) => j.client_review)
    .slice(0, maxReviews)
    .map((j) => ({
      rating: j.client_rating || null,
      comment: j.client_review,
      client_name: shortClientName(j.client_name),
    }));
  return { jobs_completed: jobs.length, rating, reviews };
}

// Matches an address's suburb against van_zones. Returns the covering van_number,
// or null if the address isn't in any configured zone - shared by the coverage
// pre-check (handleCheckCoverage) and handleCreateBooking's own dispatch step,
// so the two can never disagree about what counts as "covered".
async function matchVanZone(sb, address) {
  // `active` is honoured here too. Every other reader filters on it - Zone
  // Manager, the van cards, the availability count - so a zone switched off in
  // Admin vanishes from the screen while this line kept dispatching to it. The
  // one place the flag has to bite is the one deciding which mechanic gets the
  // job, and it was the only one ignoring it.
  const { data: vz } = await sb
    .from('van_zones')
    .select('van_number,suburb')
    .neq('van_number', 0)
    .eq('active', true);
  const addr = (address || '').toLowerCase();
  const match = (vz || []).find((z) => z.suburb && addr.includes(String(z.suburb).toLowerCase()));
  return match && Number(match.van_number) ? Number(match.van_number) : null;
}

// The single place that answers "do we go there, and what does the trip cost".
// Runs the two lookups in parallel and hands both to resolveCoverage(), which
// holds the rules (see api/_coverage.js for why driving time and not distance,
// and why a failed lookup must never read as "no").
//
// Neither lookup is allowed to throw out of here: OSRM and Nominatim are
// public demo servers with no availability promise, and this sits on the
// booking path. A failure just means one less layer of evidence.
async function resolveAddressCoverage(address) {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const [route, zone] = await Promise.all([
    drivingRoute({ fromLat: BASE.lat, fromLng: BASE.lng, address }).catch((e) => {
      console.warn('[coverage] routing failed:', e.message);
      return null;
    }),
    matchCalloutZone(sb, address).catch((e) => {
      console.warn('[coverage] callout_zones lookup failed:', e.message);
      return null;
    }),
  ]);
  return resolveCoverage({ minutes: route?.minutes ?? null, km: route?.km ?? null, zone, address });
}

// ONE calculator. Every place that quotes or charges a visit & diagnosis fee reads the
// number from here.
//
// It did not use to. handleCreateBooking resolved the fee from driving time
// (api/_coverage.js) while handleGetPrice, rescheduleBookingCore and the
// admin booking form each did their own `callout_zones` lookup defaulting to
// $20. js/app.js says it out loud on the payment screen - the quote "must
// match exactly what handleCreateBooking will verify, or a paid charge gets
// rejected as amount mismatch" - and it did not match.
//
// North Sydney is the clearest case: $45 by driving time, and no row at all
// in `callout_zones`. A logged-in customer there saw $20 on the payment
// screen, paid $20, and handleCreateBooking recomputed $45, refused the
// amount and REFUNDED them. From their side the booking simply failed.
async function calloutFeeForAddress(address, scheduledDate) {
  const coverage = await resolveAddressCoverage(address);
  return {
    coverage,
    // null (out of the perimeter, or unresolvable) is not a fee. Callers
    // decide what to do about it - nobody invents a number here.
    fee: coverage.calloutFee === null ? null : applySurcharge(coverage.calloutFee, scheduledDate),
  };
}

// The birthday greeting, sent the moment the person opens the app on the day.
//
// The cron in api/send-cron.js runs once, at 09:00 UTC - 19:00 in Sydney - so
// the email arrived in the evening, and anyone who filled in their birthday
// after that got nothing at all. Diego hit exactly that on 25-aug-2026.
//
// Now whoever visits gets it on arrival, and the cron is the fallback for
// whoever does not. Both stamp `birthday_promo_sent_year`, so it is sent once
// a year whichever gets there first.
//
// The date is computed in SYDNEY, not UTC. That is the calendar the business
// and the customer share; UTC would move the birthday to the previous day for
// every Sydney morning.
function sydneyMonthDay(now = new Date()) {
  // en-CA gives YYYY-MM-DD, which slices cleanly.
  const iso = now.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
  const [year, mm, dd] = iso.split('-');
  return { year: Number(year), mm, dd };
}

async function handleBirthdayGreeting(req, res) {
  const { access_token } = req.body || {};
  if (!access_token) return res.status(401).json({ error: 'Sign in required' });

  // Service key: this reads and writes another user's profile row after
  // verifying their token, which the anon key's RLS would refuse.
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const {
    data: { user },
    error: uErr,
  } = await sb.auth.getUser(access_token);
  if (uErr || !user) return res.status(401).json({ error: 'Invalid session' });

  const { data: profile } = await sb
    .from('profiles')
    .select('full_name, email, birthday, birthday_promo_sent_year, preferred_lang')
    .eq('id', user.id)
    .single();

  if (!profile?.birthday) return res.status(200).json({ greet: false });

  const { year, mm, dd } = sydneyMonthDay();
  const [, bMm, bDd] = String(profile.birthday).split('-');
  if (bMm !== mm || bDd !== dd) return res.status(200).json({ greet: false });

  // Already sent this year, by this route or by the cron. Still greet - it is
  // their birthday - but do not promise a second email.
  if (Number(profile.birthday_promo_sent_year) === year) {
    return res.status(200).json({ greet: true, emailSent: true });
  }

  const to = profile.email || user.email;
  if (!to) return res.status(200).json({ greet: true, emailSent: false });

  // CLAIM, send, and put the claim back if the send fails.
  //
  // The first version stamped the year and never undid it, so ONE failed send
  // burned the whole year - the next visit read the stamp, said "already sent"
  // and stayed quiet forever. That is what happened on 25-aug-2026: Diego got
  // the panel and no email, twice, because the year was already stamped by the
  // first attempt.
  //
  // `.neq()` is not enough on its own either: in SQL, `column <> 2026` is NULL
  // for a NULL column, so it does NOT match - and NULL is exactly what every
  // first-time row holds. The claim silently matched zero rows and the code
  // sent anyway, every single visit.
  const previous = profile.birthday_promo_sent_year ?? null;
  const { data: claimed, error: stampErr } = await sb
    .from('profiles')
    .update({ birthday_promo_sent_year: year })
    .eq('id', user.id)
    .or(`birthday_promo_sent_year.is.null,birthday_promo_sent_year.neq.${year}`)
    .select('id');

  if (stampErr) {
    console.error('[birthday-greeting] could not claim the year:', stampErr.message);
    return res.status(200).json({ greet: true, emailSent: false, reason: 'claim-failed' });
  }
  // Zero rows means another tab claimed it between the read and here. It is
  // sending; this one must not.
  if (!claimed?.length) {
    return res.status(200).json({ greet: true, emailSent: true, reason: 'claimed-elsewhere' });
  }

  try {
    const r = await fetch(`${SELF_BASE_URL}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': process.env.INTERNAL_API_SECRET || '',
      },
      body: JSON.stringify({
        to,
        name: profile.full_name || to.split('@')[0],
        type: 'birthday_promo',
        lang: ['en', 'es', 'zh'].includes(profile.preferred_lang) ? profile.preferred_lang : 'en',
      }),
    });
    if (!r.ok)
      throw new Error('send-email returned ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return res.status(200).json({ greet: true, emailSent: true, reason: 'sent' });
  } catch (e) {
    console.error('[birthday-greeting] send failed, releasing the claim:', e.message);
    // Give the year back, or this birthday is lost until next year over a
    // transient failure.
    await sb
      .from('profiles')
      .update({ birthday_promo_sent_year: previous })
      .eq('id', user.id)
      .then(({ error }) => {
        if (error) console.error('[birthday-greeting] could not release the claim:', error.message);
      });
    return res.status(200).json({ greet: true, emailSent: false, reason: 'send-failed' });
  }
}

// Lets the client check coverage before paying, so someone outside the service
// area finds out at the address step instead of after being charged.
//
// `coverage` is the real answer - 'in' | 'out' | 'unknown'. The old boolean
// `covered` is kept for callers not yet updated, and it is FALSE for BOTH
// 'out' and 'unknown': in neither case do we know what the trip costs, so in
// neither case do we take a card. That is not a rejection - a caller reading
// only the boolean shows the WhatsApp panel, which is where both belong.
async function handleCheckCoverage(req, res) {
  const { address } = req.body || {};
  if (!address) return res.status(400).json({ error: 'address required' });
  const r = await resolveAddressCoverage(address);
  return res.status(200).json({
    covered: !needsQuote(r),
    coverage: r.covered,
    calloutFee: r.calloutFee,
    minutes: r.minutes,
    km: r.km,
    needsQuote: needsQuote(r),
  });
}

// Matches an address's suburb against callout_zones. Returns { calloutFee,
// zoneName } or null if the address isn't in any configured zone - shared by
// the public price-check (handleZonePrice) and every place that charges a
// callout fee (handleGetPrice, handleCreateBooking, rescheduleBookingCore,
// handleAdminCreateBooking), so none of them can ever quote a different
// number than what actually gets charged. Same idea as matchVanZone above.
export async function matchCalloutZone(sb, address) {
  const { data: zones } = await sb.from('callout_zones').select('name,callout_fee,suburbs');
  const addr = (address || '').trim().toLowerCase();
  // Bidirectional on purpose: a full booking address ("123 Beach Rd, Bondi
  // Beach NSW") CONTAINS the shorter DB suburb, but "Check my diagnosis fee" takes a
  // bare suburb name and the DB entry is sometimes the more specific "Bondi
  // Beach"/"Bondi Junction" - "bondi" alone never contains either, so every
  // plain suburb name silently reported "not covered" (found in production,
  // 2026-08-24, reported by Diego - "Bondi" is literally this file's own
  // placeholder example). The addr.length >= 3 guard matches the frontend's
  // own minimum and stops a near-empty address from matching every zone
  // whose suburb list contains a space.
  const zone = (zones || []).find((z) =>
    (z.suburbs || []).some((s) => {
      const suburb = String(s).toLowerCase();
      return addr.includes(suburb) || (addr.length >= 3 && suburb.includes(addr));
    })
  );
  return zone ? { calloutFee: Number(zone.callout_fee), zoneName: zone.name } : null;
}

// The "Check my diagnosis fee" button on the marketing page - public/no-auth on
// purpose, same reasoning as handleCheckCoverage: a visitor should be able to
// see their price before creating an account or starting a booking, not just
// after. Returns the fee so the UI can show it (handleCheckCoverage only
// returns a boolean).
// Used to answer straight from `callout_zones`, so any suburb missing from
// that hand-typed list came back "not covered" - which is how a tool built to
// win trust was telling people in Newport and Castle Hill to go elsewhere.
// Now it runs the same resolution as the booking path, so the fee quoted here
// and the fee charged later cannot disagree.
// Address autocomplete, moved off the customer's browser. It used to call
// Nominatim directly from every device on a 250 ms debounce - five to ten
// requests per address typed, per person - and the `User-Agent` the old code
// passed was silently dropped, because browsers do not let fetch() set it. So
// the app was anonymous to a service whose policy requires applications to
// identify themselves, and there was no way to cache anything.
//
// Public and unauthenticated on purpose, same as the coverage and fee checks:
// this runs while somebody is still deciding whether to book.
async function handleAddressSuggest(req, res) {
  const { query } = req.body || {};
  const results = await suggestAddresses(query);
  return res.status(200).json({ results });
}

// An enquiry from someone we cannot serve same-day, or whose address we could
// not place. Not a booking: nothing is charged, and it does NOT hold the slot
// (Diego's call - a Katoomba enquiry he has not answered yet must not block a
// Saturday somebody in Dee Why would pay for). If he takes the job he enters
// it himself with "+ New booking", and that is when the slot is taken.
//
// Stored as a booking row with status 'quote_requested' so it inherits the
// admin detail view, the chat and the client history for free. Every revenue
// figure keys off 'completed', so an unanswered enquiry cannot inflate them.
async function handleRequestQuote(req, res) {
  const {
    access_token,
    service_id,
    service_name,
    service_price,
    scheduled_date,
    scheduled_time,
    address,
    client_name,
    client_email,
    client_phone,
    client_lang,
    trip_minutes,
    trip_km,
  } = req.body || {};

  if (!address || !service_name)
    return res.status(400).json({ error: 'address and service_name required' });
  // The phone is the whole point: it is how Diego answers.
  if (!client_phone || String(client_phone).replace(/\D/g, '').length < 8)
    return res.status(400).json({ error: 'A mobile number is required so we can reply' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  let userId = null;
  if (access_token) {
    const { data } = await sb.auth.getUser(access_token);
    userId = data?.user?.id || null;
  }

  const { data: row, error } = await sb
    .from('bookings')
    .insert([
      {
        user_id: userId,
        client_id: userId,
        client_name: String(client_name || '').slice(0, 120),
        client_email: String(client_email || '').slice(0, 160) || null,
        client_phone: String(client_phone).slice(0, 40),
        service_name: String(service_name).slice(0, 120),
        service_price: Number(service_price) || 0,
        // No trip, no fee. Nothing is charged for an enquiry.
        callout_fee: 0,
        scheduled_date: scheduled_date || null,
        scheduled_time: scheduled_time || null,
        address: String(address).slice(0, 300),
        status: 'quote_requested',
        van_number: 1,
        client_lang: ['en', 'es', 'zh'].includes(client_lang) ? client_lang : 'en',
      },
    ])
    .select('id')
    .single();

  if (error) {
    console.error('[request-quote] insert failed:', error.message);
    return res.status(500).json({ error: 'Could not save your enquiry' });
  }

  const trip =
    Number.isFinite(Number(trip_km)) && Number.isFinite(Number(trip_minutes))
      ? `${Math.round(trip_km)} km · ${formatMinutes(trip_minutes)}`
      : 'distancia no calculada';

  // The message the CUSTOMER sends, pre-written. Their own number, their own
  // WhatsApp - so it reaches Diego as a genuine chat he can reply to.
  // Same shape as the address-step message in js/app.js, so both land in
  // Diego's WhatsApp looking alike. The blank lines are in the join, not in
  // the array: filter(Boolean) drops an empty string, so the '' separators
  // that used to sit in here were removed and never printed.
  const waFields = [
    `Servicio: ${service_name}`,
    scheduled_date ? `Fecha que necesito: ${scheduled_date} ${scheduled_time || ''}`.trim() : '',
    `Direccion: ${address}`,
    client_name ? `Nombre: ${client_name}` : '',
  ].filter(Boolean);
  const waText =
    'Hola Dr. Bike! Quiero consultar el precio para:' +
    '\n\n' +
    waFields.join('\n') +
    '\n\n' +
    `Su sistema me marco: ${trip} desde su zona`;

  // Backstop: if they never tap send, Diego still finds out. Best-effort -
  // a notification that fails must not lose the enquiry, which is already
  // saved above.
  fetch(`${SELF_BASE_URL}/api/send-message?channel=whatsapp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-token': process.env.INTERNAL_API_SECRET || '',
    },
    body: JSON.stringify({
      to: '0433963250',
      template: 'quote_requested',
      data: {
        clientName: client_name || 'Cliente',
        clientPhone: client_phone,
        service: service_name,
        date: scheduled_date,
        time: scheduled_time,
        address,
        trip,
        replyUrl: `https://wa.me/${String(client_phone).replace(/\D/g, '').replace(/^0/, '61')}`,
      },
    }),
  }).catch((e) => console.error('[request-quote] admin notify failed:', e.message));

  return res.status(200).json({
    ok: true,
    reference: row.id,
    whatsappUrl: `https://wa.me/61433963250?text=${encodeURIComponent(waText)}`,
  });
}

async function handleZonePrice(req, res) {
  const { address } = req.body || {};
  if (!address) return res.status(400).json({ error: 'address required' });
  const r = await resolveAddressCoverage(address);
  return res.status(200).json({
    covered: !needsQuote(r),
    coverage: r.covered,
    calloutFee: r.calloutFee,
    zoneName: r.zoneName,
    minutes: r.minutes,
    km: r.km,
    needsQuote: needsQuote(r),
  });
}

// The client needs to know the REAL price (including any membership waiver/
// discount) before it ever asks Stripe to charge anything - otherwise a
// member either gets overcharged, or the amount Stripe actually collects
// won't match what handleCreateBooking's own verification expects, and the
// booking gets rejected (with a refund) after a successful-looking payment.
// This does the exact same price derivation handleCreateBooking uses, minus
// creating anything, so "what will I pay" and "what did they pay" can never
// drift apart.
async function handleGetPrice(req, res) {
  const { access_token, service_id, service_name, scheduled_date, address } = req.body || {};
  if (!access_token) return res.status(401).json({ error: 'Sign in required' });
  if (!scheduled_date) return res.status(400).json({ error: 'scheduled_date required' });
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const {
    data: { user },
    error: uErr,
  } = await sb.auth.getUser(access_token);
  if (uErr || !user) return res.status(401).json({ error: 'Invalid session' });

  let svc = null;
  if (service_id) {
    const r = await sb.from('services').select('name,price').eq('id', service_id).maybeSingle();
    svc = r.data;
  }
  if (!svc && service_name) {
    const r = await sb.from('services').select('name,price').eq('name', service_name).maybeSingle();
    svc = r.data;
  }
  if (!svc) return res.status(400).json({ error: 'Unknown service' });
  const baseServicePrice = applySurcharge(Number(svc.price), scheduled_date);

  // Same resolution handleCreateBooking will verify against. An address with
  // no fee belongs in the quote flow, not on a card form, so it is reported
  // as such instead of being priced at a default.
  const { coverage: priceCoverage, fee: resolvedFee } = await calloutFeeForAddress(
    address,
    scheduled_date
  );
  if (resolvedFee === null) {
    return res.status(200).json({
      calloutFee: 0,
      needsQuote: true,
      servicePrice: baseServicePrice,
      isIncludedVisit: false,
      plan: null,
    });
  }
  const baseCalloutFee = resolvedFee;

  const priced = await applyMembershipPricing(
    sb,
    user.id,
    scheduled_date,
    baseServicePrice,
    baseCalloutFee,
    svc.name,
    svc.price
  );
  return res.status(200).json({
    servicePrice: priced.servicePrice,
    calloutFee: priced.calloutFee,
    total: Math.round((priced.servicePrice + priced.calloutFee) * 100) / 100,
    membershipPlan: priced.plan,
    isIncludedVisit: priced.included,
  });
}

// ── Card on file (Diego, 2026-07-22) ─────────────────────────────────────────
// Lets a client save a card once so the mechanic can auto-charge the final
// amount at job completion instead of physical EFTPOS every time. Reuses the
// same Stripe Customer membership subscriptions already create
// (api/create-subscription.js) rather than a separate concept - a member's
// card-on-file and their subscription billing are the same Stripe Customer.
async function handleSaveCardSetupIntent(req, res) {
  const { access_token, client_id } = req.body || {};
  if (!access_token || !client_id)
    return res.status(400).json({ error: 'access_token, client_id required' });
  if (!process.env.STRIPE_SECRET_KEY)
    return res.status(500).json({ error: 'Payments unavailable' });
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${access_token}` },
  });
  if (!userResp.ok) return res.status(401).json({ error: 'Invalid session' });
  const userData = await userResp.json();
  if (userData.id !== client_id) return res.status(403).json({ error: 'Forbidden' });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: profile } = await sb
    .from('profiles')
    .select('stripe_customer_id, full_name')
    .eq('id', client_id)
    .maybeSingle();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let customerId = profile?.stripe_customer_id || null;
  if (customerId) {
    try {
      const c = await stripe.customers.retrieve(customerId);
      if (c.deleted) customerId = null;
    } catch {
      customerId = null;
    }
  }
  if (!customerId) {
    const existing = await stripe.customers.list({ email: userData.email, limit: 1 });
    const customer =
      existing.data[0] ||
      (await stripe.customers.create({
        email: userData.email,
        name: profile?.full_name || undefined,
        metadata: { supabase_user: client_id },
      }));
    customerId = customer.id;
    await sb.from('profiles').update({ stripe_customer_id: customerId }).eq('id', client_id);
  }

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    usage: 'off_session',
  });
  return res.status(200).json({ clientSecret: setupIntent.client_secret });
}

// Called after the client confirms the SetupIntent card-side
// (stripe.confirmCardSetup in the browser). Never trusts the client's "it
// worked" claim - retrieves the SetupIntent from Stripe directly and only
// persists if Stripe itself says succeeded and it belongs to this client's
// own Customer.
async function handleSaveCardConfirm(req, res) {
  const { access_token, client_id, setup_intent_id } = req.body || {};
  if (!access_token || !client_id || !setup_intent_id)
    return res.status(400).json({ error: 'access_token, client_id, setup_intent_id required' });
  if (!process.env.STRIPE_SECRET_KEY)
    return res.status(500).json({ error: 'Payments unavailable' });
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${access_token}` },
  });
  if (!userResp.ok) return res.status(401).json({ error: 'Invalid session' });
  const userData = await userResp.json();
  if (userData.id !== client_id) return res.status(403).json({ error: 'Forbidden' });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: profile } = await sb
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', client_id)
    .maybeSingle();
  if (!profile?.stripe_customer_id)
    return res.status(400).json({ error: 'No Stripe customer on file' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const si = await stripe.setupIntents.retrieve(setup_intent_id);
  if (si.status !== 'succeeded' || si.customer !== profile.stripe_customer_id)
    return res.status(400).json({ error: 'Card could not be verified' });

  const pm = await stripe.paymentMethods.retrieve(si.payment_method);
  await sb
    .from('profiles')
    .update({ stripe_default_payment_method_id: si.payment_method })
    .eq('id', client_id);
  return res
    .status(200)
    .json({ ok: true, brand: pm.card?.brand || null, last4: pm.card?.last4 || null });
}

// Detaches the saved payment method from Stripe (so it can't be charged even
// if the DB clear below somehow failed) and clears it from the profile.
async function handleRemoveCard(req, res) {
  const { access_token, client_id } = req.body || {};
  if (!access_token || !client_id)
    return res.status(400).json({ error: 'access_token, client_id required' });
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${access_token}` },
  });
  if (!userResp.ok) return res.status(401).json({ error: 'Invalid session' });
  const userData = await userResp.json();
  if (userData.id !== client_id) return res.status(403).json({ error: 'Forbidden' });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: profile } = await sb
    .from('profiles')
    .select('stripe_default_payment_method_id')
    .eq('id', client_id)
    .maybeSingle();

  if (profile?.stripe_default_payment_method_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      await stripe.paymentMethods.detach(profile.stripe_default_payment_method_id);
    } catch (e) {
      console.error('[remove-card] detach failed:', e.message);
    }
  }
  await sb.from('profiles').update({ stripe_default_payment_method_id: null }).eq('id', client_id);
  return res.status(200).json({ ok: true });
}

// ── Server-authoritative booking creation ────────────────────────────────────
// Price comes from the DB (never the client). Payment is verified with Stripe
// before a non-admin booking is created. The admin test account bypasses payment.
async function handleCreateBooking(req, res) {
  const {
    access_token,
    service_id,
    service_name,
    scheduled_date,
    scheduled_time,
    address,
    bike_id,
    payment_intent_id,
    checkout_session_id,
    discount_code,
    utm_source,
    utm_medium,
    utm_campaign,
    time_to_book_seconds,
    preferred_mechanic_id,
    client_lang,
    // Reserve the slot BEFORE charging. `hold_only` runs every check below and
    // writes the row with no payment attached; `hold_booking_id` comes back on
    // the second call, after the card cleared, and updates that same row
    // instead of inserting a new one. See api/_slot-hold.js for why.
    hold_only,
    hold_booking_id,
  } = req.body;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!scheduled_date || !scheduled_time)
    return res.status(400).json({ error: 'Date and time required' });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1. Who is booking.
  //
  // An account is no longer required. Being asked to register is the barrier,
  // not being asked for an email - and until 2026-08-05 this endpoint answered
  // 401 to anyone without one while the front let them pay first, which took
  // $20 off a real customer and gave her nothing (docs/PENDIENTES.md 14).
  //
  // For a guest the PAYMENT is the credential. Step 4 below retrieves the
  // PaymentIntent from Stripe and refuses to continue unless it really
  // succeeded for the right amount, so a booking cannot be conjured without
  // paying for it - and bookings_unique_payment_intent stops one payment being
  // spent twice.
  let user = null;
  if (access_token) {
    const { data, error: uErr } = await sb.auth.getUser(access_token);
    if (uErr || !data?.user) return res.status(401).json({ error: 'Invalid session' });
    user = data.user;
  }

  // Declared here, not beside the payment gate that also reads it: the
  // coverage check further down uses it too, and a `const` read before its
  // declaration throws at runtime - which `node --check` does not catch.
  // Found in review, before it shipped.
  const holdOnly = hold_only === true;
  const guestEmail = String(req.body.client_email || '').trim();
  const isGuest = !user;
  if (isGuest) {
    // We do not need an account, but we do need a way to reach them: the
    // receipt, the confirmation and the tracking link all go to this address.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail))
      return res.status(400).json({ error: 'An email is required so we can confirm your booking' });
    // Membership pricing is looked up by account, so a guest can never reach a
    // waived $0 call-out - and with no charge there would be nothing
    // authenticating the request at all.
    if (!payment_intent_id && !checkout_session_id)
      return res.status(402).json({ error: 'Payment required' });
  }

  const isAdmin = !isGuest && (user.email || '').toLowerCase() === ADMIN_TEST_EMAIL;

  // 2. Authoritative service price from the services table
  let svc = null;
  if (service_id) {
    const r = await sb
      .from('services')
      .select('id,name,price,duration_max')
      .eq('id', service_id)
      .maybeSingle();
    svc = r.data;
  }
  if (!svc && service_name) {
    const r = await sb
      .from('services')
      .select('id,name,price,duration_max')
      .eq('name', service_name)
      .maybeSingle();
    svc = r.data;
  }
  if (!svc) return res.status(400).json({ error: 'Unknown service' });
  // Sunday/NSW public holiday surcharge (+20%, confirmed with Diego) - applied
  // to both components so the itemized quote stays honest line-by-line rather
  // than a mystery lump surcharge.
  let servicePrice = applySurcharge(Number(svc.price), scheduled_date);

  // 3. Authoritative visit & diagnosis fee, from the same resolution the client was
  // quoted (driving time from the base, falling back to the priced zone -
  // api/_coverage.js). Was a direct `callout_zones` lookup defaulting to $20,
  // which is how Balmain, Potts Point, North Sydney and Maroubra - all $45
  // suburbs - were being served at $20: they had a van but no row in the
  // price table.
  const coverage = await resolveAddressCoverage(address);
  let calloutFee = applySurcharge(coverage.calloutFee ?? 0, scheduled_date);

  const hasPaymentRef = Boolean(payment_intent_id || checkout_session_id);

  // A booking whose address cannot be resolved is sent to the quote flow and
  // never charged, so one should not arrive here at all. One still can: the
  // client resolved the address confidently a minute ago, paid, and by the
  // time this runs the geocoder is rate-limited or down. Refunding then would
  // punish a paying customer for someone else's outage - so step 4 below
  // accepts the amount they actually paid, provided it is a real band fee.
  //
  // With NO payment behind it, though, an unresolved address must not become
  // a booking: that is the free-booking hole. It goes to the quote flow.
  if (coverage.covered === 'unknown') {
    // `holdOnly` belongs here, and leaving it out was a regression found in
    // review. A hold never carries a payment - that is its definition - so
    // without this every unresolvable address would be turned away at the
    // hold, and those bookings are ones Diego can still serve: the warning
    // below exists precisely so he can confirm them by hand.
    //
    // Nothing is weakened. The hold takes no money and expires on its own;
    // the real booking runs this same check again, and by then a payment IS
    // present, which is the condition that was always required.
    if (!hasPaymentRef && !isAdmin && !holdOnly) {
      return res.status(400).json({
        error:
          "We couldn't work out the trip to that address - message us on WhatsApp and we'll sort it out.",
      });
    }
    console.warn(
      '[create-booking] coverage unresolved but payment present, accepting a band fee - confirm by hand:',
      address
    );
  }

  // 3a. Membership pricing: waives/discounts servicePrice and calloutFee per
  // the client's active plan and how much of their monthly quota is left
  // (see applyMembershipPricing - was previously never applied at all, so
  // "1 service/month included" was purely marketing copy with nothing
  // enforcing it). Runs before payment verification below because the
  // Stripe charge itself only ever covers the callout fee (the service
  // price is collected later, in person, by the mechanic) - a waived
  // calloutFee of $0 means there's no Stripe charge to verify at all.
  let membershipPlan = null;
  let isIncludedVisit = false;
  // Guests have no membership to price against - a membership needs an account.
  if (!isAdmin && !isGuest) {
    const priced = await applyMembershipPricing(
      sb,
      user.id,
      scheduled_date,
      servicePrice,
      calloutFee,
      svc.name,
      svc.price
    );
    servicePrice = priced.servicePrice;
    calloutFee = priced.calloutFee;
    membershipPlan = priced.plan;
    isIncludedVisit = priced.included;
  }

  // Start the geocode now, not after the insert: it runs while Stripe is being
  // verified below, so by the time step 5b needs it there is nothing to wait
  // for. Deliberately not awaited here - a map service must never be able to
  // delay taking a booking.
  const geoPromise = geocodeAddress(address);

  // 3b. Dispatch. With one van there is no choice to make, and `van_zones`
  // was never really a dispatch table - it was acting as a coverage
  // whitelist, rejecting 59 of the 92 suburbs that had a price. Coverage is
  // now decided in step 3 by driving time; this only records which van goes.
  //
  // Kept as a lookup rather than a constant so the day a second van has its
  // own zones, this line already reads them. `|| 1` is what makes today's
  // single-van reality work without every suburb having to be typed in.
  const vanNumber = (await matchVanZone(sb, address)) || 1;

  // Beyond the perimeter this is a quote request, not a booking - the client
  // is sent to WhatsApp instead of a card form, so it should never arrive
  // here. If one does (a stale tab, a direct API call), refuse it rather than
  // commit the van to a trip that loses money, and refund anything taken.
  // Note 'unknown' is NOT refused: an address we could not resolve is booked
  // at the base fee and confirmed by hand (api/_coverage.js).
  if (coverage.covered === 'out' && !isAdmin) {
    if (payment_intent_id) {
      try {
        await new Stripe(process.env.STRIPE_SECRET_KEY).refunds.create({
          payment_intent: payment_intent_id,
        });
      } catch (e) {
        console.error('[create-booking] out-of-perimeter refund failed:', e.message);
      }
    }
    return res.status(400).json({
      error:
        "That address is outside our same-day area - message us on WhatsApp and we'll work it out." +
        (payment_intent_id ? ' Your payment has been refunded.' : ''),
    });
  }

  // 3c. Reject a slot the admin blocked for THIS van (docs/PENDIENTES.md
  // 21.8). handleGetAvailability's "at least one van is free" display can
  // still show this slot on a multi-van fleet even though vanNumber's own
  // schedule is blocked - this is the actual enforcement, not just the list.
  {
    const { data: blockRows } = await sb
      .from('availability')
      .select('time_slot, available, van_number')
      .eq('date', scheduled_date);
    const neededMin = (svc.duration_max || DEFAULT_SERVICE_DURATION_MIN) + SLOT_BUFFER_MIN;
    if (isSlotBlocked(blockRows, vanNumber, scheduled_time, neededMin)) {
      if (payment_intent_id) {
        try {
          await new Stripe(process.env.STRIPE_SECRET_KEY).refunds.create({
            payment_intent: payment_intent_id,
          });
        } catch (e) {
          console.error('[create-booking] blocked-slot refund failed:', e.message);
        }
      }
      return res.status(409).json({
        error:
          'That time is no longer available.' +
          (payment_intent_id ? ' Your payment has been refunded.' : ' Please pick another time.'),
      });
    }
  }

  // When the address could not be resolved there is no authoritative fee to
  // check a payment against. `acceptablePaidCents` is the set the amount is
  // allowed to be instead: the real band fees, surcharged for the date. That
  // covers the transient geocoder-outage case (client resolved it fine, paid,
  // then the lookup broke) without reopening the tampered-amount hole closed
  // in PR #318 - an invented $0.50 is not a band.
  const acceptablePaidCents =
    coverage.covered === 'unknown'
      ? VALID_FEES.map((f) => Math.round(applySurcharge(f, scheduled_date) * 100))
      : null;
  const amountIsAcceptable = (cents) =>
    acceptablePaidCents
      ? acceptablePaidCents.includes(Math.round(cents))
      : Math.round(cents) === Math.round(calloutFee * 100);

  // 4. Verify payment (skipped for the admin test account, and for a
  // membership visit that waived the callout fee down to $0 - there's no
  // Stripe charge to verify since nothing was ever going to be charged).
  //
  // The `calloutFee > 0` test alone was a hole once 'unknown' started
  // quoting no fee: calloutFee came out 0, this block was skipped entirely,
  // and an unresolvable address produced a booking with no payment checked at
  // all. Any request carrying a payment reference is verified now, whatever
  // the computed fee - a payment that exists must always be checked.
  let verifiedPI = null;
  // A hold is the step BEFORE the card is touched, so there is nothing to
  // verify. Everything above this line - coverage, the zone fee, the blocked
  // slot, membership pricing - already ran, which is the point of reusing this
  // handler instead of writing a second one that would drift out of step.
  // (`holdOnly` is declared at the top of the function - it is read long
  // before this point, by the coverage check.)
  // A hold is by definition BEFORE any payment. A request that both carries a
  // payment reference and asks to skip verification is not a hold, and
  // resolving that ambiguity either way would put an exception into the one
  // invariant this handler cannot have exceptions in: a payment that exists is
  // always verified (tests/unit/coverage-resolution.test.js). So it is refused.
  if (holdOnly && hasPaymentRef)
    return res.status(400).json({ error: 'A hold cannot carry a payment' });
  if (!holdOnly && !isAdmin && (calloutFee > 0 || hasPaymentRef)) {
    if (!process.env.STRIPE_SECRET_KEY) return res.status(402).json({ error: 'Payment required' });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    try {
      if (checkout_session_id) {
        const sess = await stripe.checkout.sessions.retrieve(checkout_session_id);
        if (sess.payment_status !== 'paid')
          return res.status(402).json({ error: 'Payment not completed' });
        const sessPI =
          typeof sess.payment_intent === 'string' ? sess.payment_intent : sess.payment_intent?.id;
        if (!amountIsAcceptable(sess.amount_total)) {
          if (sessPI) {
            try {
              await stripe.refunds.create({ payment_intent: sessPI });
            } catch (e) {
              console.error('[create-booking] amount-mismatch refund failed:', e.message);
            }
          }
          return res.status(402).json({
            error: 'Payment amount mismatch' + (sessPI ? '. Your payment has been refunded.' : ''),
          });
        }
        if (coverage.covered === 'unknown') calloutFee = sess.amount_total / 100;
        verifiedPI = sessPI;
      } else if (payment_intent_id) {
        const p = await stripe.paymentIntents.retrieve(payment_intent_id);
        if (p.status !== 'succeeded')
          return res.status(402).json({ error: 'Payment not completed' });
        if (!amountIsAcceptable(p.amount)) {
          try {
            await stripe.refunds.create({ payment_intent: p.id });
          } catch (e) {
            console.error('[create-booking] amount-mismatch refund failed:', e.message);
          }
          return res
            .status(402)
            .json({ error: 'Payment amount mismatch. Your payment has been refunded.' });
        }
        // With an unresolved address the accepted band IS the fee - otherwise
        // the row would record a $0 call-out against a real payment.
        if (coverage.covered === 'unknown') calloutFee = p.amount / 100;
        verifiedPI = p.id;
      } else {
        return res.status(402).json({ error: 'Payment required' });
      }
    } catch (e) {
      return res.status(402).json({ error: 'Could not verify payment' });
    }
    // Single-use: a payment can back only one booking
    const { data: dup } = await sb
      .from('bookings')
      .select('id')
      .eq('stripe_payment_intent_id', verifiedPI)
      .maybeSingle();
    if (dup) return res.status(409).json({ error: 'This payment was already used for a booking' });
  }

  // 4b. Preferred mechanic: only honored while the admin toggle is on, and only
  // if it's a real, active mechanic - never trust the client id blindly.
  let preferredMechanicId = null;
  if (preferred_mechanic_id && (await isMechanicPreferenceEnabled(SERVICE_KEY))) {
    const { data: pm } = await sb
      .from('escalation_contacts')
      .select('id')
      .eq('id', preferred_mechanic_id)
      .eq('active', true)
      .maybeSingle();
    if (pm) preferredMechanicId = pm.id;
  }

  // 4c. Sweep abandoned holds off this slot before writing to it.
  //
  // `bookings_unique_slot` covers every status except cancelled, so a hold
  // somebody walked away from still blocks the index even though
  // handleGetAvailability has already stopped showing it as busy. Without
  // this the next person to want that hour gets a 23505 - which, on the paid
  // path, means a charge and a refund for a slot that was actually free.
  //
  // Lazy, because it has to be: the window is 15 minutes and Vercel Hobby
  // refuses crons more frequent than daily. Scoped to this slot and van so it
  // can never touch a booking nobody asked about.
  {
    const { data: sameSlot } = await sb
      .from('bookings')
      .select('id,status,created_at,stripe_payment_intent_id')
      .eq('scheduled_date', scheduled_date)
      .eq('scheduled_time', scheduled_time)
      .eq('van_number', vanNumber)
      .neq('status', 'cancelled');
    const stale = expiredHoldIds(sameSlot || []).filter((id) => id !== hold_booking_id);
    if (stale.length) {
      const { error: sweepErr } = await sb
        .from('bookings')
        .update({ status: 'cancelled', cancellation_reason: 'hold expired' })
        .in('id', stale);
      // Not fatal: if the sweep fails the insert below just hits the unique
      // index and is handled there. Silence would be the problem, not failure.
      if (sweepErr) console.error('[create-booking] hold sweep failed:', sweepErr.message);
    }
  }

  // 5. Insert with server-set fields only
  const meta = (user && user.user_metadata) || {};
  // A guest booking carries no account, only a way to reach the person.
  // bookings.user_id became nullable in scripts/add-guest-bookings.sql.
  const row = {
    user_id: user ? user.id : null,
    client_id: user ? user.id : null,
    client_name: meta.full_name || meta.name || String(req.body.client_name || '').trim(),
    client_email: user ? user.email || '' : guestEmail,
    client_phone: String(req.body.client_phone || '').trim() || null,
    service_name: svc.name,
    service_price: servicePrice,
    callout_fee: calloutFee,
    scheduled_date,
    scheduled_time,
    address: address || 'Home',
    status: 'pending',
    van_number: vanNumber,
    preferred_mechanic_id: preferredMechanicId,
    stripe_payment_intent_id: verifiedPI,
    // A bike belongs to an account (bikes.client_id), so a guest has none -
    // and must not be able to attach their booking to somebody else's by
    // passing an id.
    bike_id: (!isGuest && bike_id) || null,
    utm_source: utm_source || null,
    utm_medium: utm_medium || null,
    utm_campaign: utm_campaign || null,
    // Which language this client is reading the app in, so the confirmation
    // and every later reminder/cron email goes out in it. Whitelisted here
    // because the DB has a CHECK constraint on the column.
    client_lang: ['en', 'es', 'zh'].includes(client_lang) ? client_lang : 'en',
    // Client-reported elapsed time, only trusted within a sane range - a
    // bogus/manipulated value would just skew the "avg time to book" KPI,
    // it's never used for pricing or access control.
    time_to_book_seconds:
      Number.isFinite(Number(time_to_book_seconds)) &&
      Number(time_to_book_seconds) >= 0 &&
      Number(time_to_book_seconds) <= 86400
        ? Math.round(Number(time_to_book_seconds))
        : null,
  };

  // Two ways in. A hold inserts; the call that comes back after the card
  // cleared updates the row it already has, so the slot is never released
  // between the two - which is the whole reason the hold exists.
  //
  // The update is scoped to a row that is STILL an unpaid hold
  // (stripe_payment_intent_id is null): if it expired and was swept, or
  // somebody else has since paid for it, this matches nothing and the caller
  // is told rather than quietly overwriting a real booking.
  let booking = null;
  let insErr = null;
  if (hold_booking_id) {
    const { data, error } = await sb
      .from('bookings')
      .update(row)
      .eq('id', hold_booking_id)
      .is('stripe_payment_intent_id', null)
      .eq('status', 'pending')
      .select()
      .maybeSingle();
    booking = data;
    insErr = error;
    if (!error && !data) {
      // The hold is gone. Refunding here is the same duty as the 23505 path
      // below: money was taken for a slot that cannot be honoured.
      let refunded = false;
      if (verifiedPI) {
        try {
          await new Stripe(process.env.STRIPE_SECRET_KEY).refunds.create({
            payment_intent: verifiedPI,
          });
          refunded = true;
        } catch (e) {
          console.error('[create-booking] expired-hold refund failed:', verifiedPI, e.message);
        }
      }
      return res.status(409).json({
        error:
          'That time slot is no longer held for you.' +
          (refunded
            ? ' Your payment has been refunded.'
            : verifiedPI
              ? ' We could not process your refund automatically - contact us and we will sort it out.'
              : ' Please pick another time.'),
      });
    }
  } else {
    const { data, error } = await sb.from('bookings').insert([row]).select().single();
    booking = data;
    insErr = error;
  }

  if (insErr) {
    if (insErr.code === '23505') {
      // Slot was taken between payment and insert — refund a real payment, then reject
      let refunded = false;
      if (verifiedPI) {
        try {
          await new Stripe(process.env.STRIPE_SECRET_KEY).refunds.create({
            payment_intent: verifiedPI,
          });
          refunded = true;
        } catch (e) {
          // A charged customer with no booking and no refund is the exact
          // failure this whole retry path exists to prevent - if the refund
          // itself throws, that must not vanish silently (it did, until now).
          console.error('[create-booking] slot-conflict refund failed:', verifiedPI, e.message);
        }
      }
      return res.status(409).json({
        error:
          'That time slot was just booked.' +
          (refunded
            ? ' Your payment has been refunded.'
            : verifiedPI
              ? ' We could not process your refund automatically - contact us and we will sort it out.'
              : ' Please pick another time.'),
      });
    }
    return res.status(500).json({ error: 'Could not create booking', detail: insErr.message });
  }

  // 5b. Store the address as coordinates, so the tracking page can draw an ETA
  // without ever sending the address anywhere (PENDIENTES 13.1). The lookup was
  // started back at step 3 and has been running while Stripe was verified, so
  // this usually resolves immediately.
  //
  // Written by UPDATE rather than included in the INSERT above on purpose: if
  // scripts/add-address-coordinates.sql has not been run yet, the columns do
  // not exist. As an INSERT field that would fail the whole booking; as a
  // separate UPDATE it costs the ETA and nothing else. Not fire-and-forget
  // either - a serverless function is frozen once it responds, so an
  // un-awaited promise here would simply never finish.
  try {
    const coords = await geoPromise;
    if (coords) {
      const { error: geoErr } = await sb
        .from('bookings')
        .update({ address_lat: coords.lat, address_lng: coords.lng })
        .eq('id', booking.id);
      if (geoErr) console.error('[create-booking] could not store coordinates:', geoErr.message);
    }
  } catch (e) {
    console.error('[create-booking] geocode step failed:', e.message);
  }

  // 6. Discount/gift code (server-authoritative): atomic consume via RPC -
  // consume_discount_code() does the check-and-increment in one guarded
  // UPDATE, so two concurrent bookings can't both pass the "still has uses
  // left" check and double-spend a single-use code. Previously this used a
  // separate SELECT-then-UPDATE (racy), queried a discount_amount column
  // that doesn't exist (silently never matched, discount was never applied),
  // and compared discount_type to 'percentage' instead of the real 'percent'.
  //
  // NOT during a hold. Found in review: this block sits AFTER the insert, so a
  // hold would have reached it and burned a single-use code - and, further
  // down, spent the client's referral credits - for a booking nobody had paid
  // for yet. A checkout the client then abandons would have cost them both,
  // with nothing to show for it and no way to notice.
  //
  // The second call, the one that carries the payment, runs this block
  // normally. A discount is spent when the booking is BOUGHT.
  let codeDiscount = 0;
  if (discount_code && !holdOnly) {
    const code = String(discount_code).trim().toUpperCase();
    const { data: rows } = await sb.rpc('consume_discount_code', { p_code: code });
    const dc = rows && rows[0];
    if (dc) {
      codeDiscount =
        dc.discount_type === 'percent'
          ? Math.round(servicePrice * dc.discount_value) / 100
          : Math.min(dc.discount_value, servicePrice);
      await sb
        .from('bookings')
        .update({ discount_applied: codeDiscount, discount_code: code })
        .eq('id', booking.id);
    }
  }

  // 6b. Referral credit. Until now this was a number that only ever went UP:
  // handleApplyReferral credited both sides and nothing anywhere subtracted it
  // again - grep `referral_credits` across api/ and js/ before this commit and
  // the only writes are two increments. The client's profile showed "Credits
  // earned $30" and there was no screen, endpoint or checkout that could spend
  // a cent of it. A promise the code could not keep.
  //
  // Spent here, against the service price, as a booking-level discount: that is
  // the pipe that already exists (bookings.discount_applied), so the mechanic's
  // completion breakdown, the invoice email and the admin figures all pick it
  // up with no new plumbing. It stacks ON TOP of a promo code rather than
  // replacing it, and never takes the total below zero.
  //
  // A guest has no profile and therefore no credits - `user` is null and this
  // whole block is skipped.
  // Same reasoning as the discount code above: credits are spent when the
  // booking is paid for, never when the slot is merely held.
  if (user && !holdOnly) {
    const remaining = Math.max(0, servicePrice - codeDiscount);
    if (remaining > 0) {
      // Atomic: SELECT ... FOR UPDATE inside the function. Two bookings started
      // at the same second cannot both read the same balance and each spend it,
      // which is the exact race consume_discount_code() exists to stop for
      // promo codes.
      const { data: spentRows, error: spendErr } = await sb.rpc('spend_referral_credits', {
        p_user: user.id,
        p_max: remaining,
      });
      if (spendErr) {
        // Never fail the booking over this. The client keeps the credit and can
        // spend it next time; a lost booking is far worse than a late discount.
        console.error('[create-booking] referral credit spend failed:', spendErr.message);
      } else {
        const spent = Number(spentRows) || 0;
        if (spent > 0) {
          const { error: applyErr } = await sb
            .from('bookings')
            .update({
              discount_applied: codeDiscount + spent,
              referral_credit_applied: spent,
            })
            .eq('id', booking.id);
          if (applyErr) {
            // The credit left the profile but never reached the booking. Put it
            // back rather than swallowing the client's money.
            console.error('[create-booking] credit spent but not applied:', applyErr.message);
            await sb.rpc('refund_referral_credits', { p_user: user.id, p_amount: spent });
          }
        }
      }
    }
  }

  return res.status(200).json({ id: booking.id, tracking_token: booking.tracking_token || null });
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

async function handleAdmin(req, res) {
  const { email, password, totp_code, factor_id, challenge_id, temp_token } = req.body;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const AUTH = `${SUPABASE_URL}/auth/v1`;

  // ── Step 2: Verify TOTP code (login challenge) ───────────────────────────────
  if (totp_code && factor_id && challenge_id && temp_token && !email) {
    const r = await fetch(`${AUTH}/factors/${factor_id}/verify`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${temp_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ challenge_id, code: String(totp_code).replace(/\s/g, '') }),
    });
    const d = await r.json();
    if (!r.ok) return res.status(401).json({ error: d.message || 'Invalid authenticator code' });
    return res.status(200).json({ access_token: d.access_token, refresh_token: d.refresh_token });
  }

  // ── MFA Enrollment step 1: generate QR code ──────────────────────────────────
  if (req.body.type === 'mfa-enroll' && temp_token) {
    // Remove stale unverified factors first. GoTrue rejects a new factor when one with
    // the same friendly_name already exists, so a previous half-finished enrollment
    // makes every retry fail with "Enrollment failed".
    const meResp = await fetch(`${AUTH}/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${temp_token}` },
    });
    if (meResp.ok) {
      const me = await meResp.json();
      const stale = (Array.isArray(me.factors) ? me.factors : []).filter(
        (f) => f.factor_type === 'totp' && f.status !== 'verified'
      );
      for (const f of stale) {
        await fetch(`${AUTH}/factors/${f.id}`, {
          method: 'DELETE',
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${temp_token}` },
        });
      }
    }
    const r = await fetch(`${AUTH}/factors`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${temp_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ factor_type: 'totp', friendly_name: 'Dr.Bike Admin' }),
    });
    const d = await r.json();
    if (!r.ok) return res.status(500).json({ error: d.message || 'Enrollment failed' });
    return res
      .status(200)
      .json({ factor_id: d.id, qr_code: d.totp.qr_code, secret: d.totp.secret });
  }

  // ── MFA Enrollment step 2: verify code → activate factor ─────────────────────
  if (req.body.type === 'mfa-enroll-verify' && totp_code && factor_id && temp_token) {
    const chalR = await fetch(`${AUTH}/factors/${factor_id}/challenge`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${temp_token}`,
        'Content-Type': 'application/json',
      },
    });
    const chalD = await chalR.json();
    if (!chalR.ok) return res.status(500).json({ error: chalD.message || 'Challenge failed' });

    const verR = await fetch(`${AUTH}/factors/${factor_id}/verify`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${temp_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ challenge_id: chalD.id, code: String(totp_code).replace(/\s/g, '') }),
    });
    const verD = await verR.json();
    if (!verR.ok)
      return res.status(401).json({ error: verD.message || 'Invalid code — try again' });
    return res
      .status(200)
      .json({ access_token: verD.access_token, refresh_token: verD.refresh_token });
  }

  // ── Step 1: Email + password (same path as before) ───────────────────────────
  if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });

  // Any successfully-authenticated Supabase user (including regular clients who
  // signed up in the mobile app) could otherwise reach this far and be treated
  // as admin. Only emails on this list may hold an admin session.
  if (!ADMIN_ALLOWED_EMAILS.includes(String(email).toLowerCase().trim())) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  console.log('Admin login attempt:', email, 'Error:', error?.message);
  if (error) return res.status(401).json({ error: error.message });

  const userToken = data.session.access_token;
  const userRefresh = data.session.refresh_token;

  // Check for an enrolled+verified TOTP factor. Read it from the user object —
  // GoTrue has no standalone factors-list endpoint, so the previous GET /factors
  // always failed and every login fell through to re-enrollment.
  const meR = await fetch(`${AUTH}/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${userToken}` },
  });
  if (meR.ok) {
    const me = await meR.json();
    const factors = Array.isArray(me.factors) ? me.factors : [];
    const totp = factors.find((f) => f.factor_type === 'totp' && f.status === 'verified');
    if (totp) {
      const chalR = await fetch(`${AUTH}/factors/${totp.id}/challenge`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json',
        },
      });
      const chalD = await chalR.json();
      if (!chalR.ok) return res.status(500).json({ error: 'MFA challenge failed' });
      return res.status(200).json({
        mfa_required: true,
        factor_id: totp.id,
        challenge_id: chalD.id,
        temp_token: userToken,
        temp_refresh: userRefresh,
      });
    }
  }

  // No MFA enrolled yet — login OK, prompt to set up
  return res.status(200).json({
    access_token: userToken,
    refresh_token: userRefresh,
    setup_mfa: true,
  });
}

async function handleMechanic(req, res) {
  // The lockout, the failure counter and the success reset all live in
  // authMechanic now, so every mechanic-* route is guarded, not just this one
  // (see the note there). This handler only adds the Retry-After header, which
  // is specific to the login screen's own retry UI.
  const auth = await authMechanic(req);
  if (auth.error) {
    if (auth.status === 429) res.setHeader('Retry-After', LOGIN_LOCK_MINUTES * 60);
    return res.status(auth.status).json({ error: auth.error });
  }
  const mechanic = auth.mechanic;
  return res.status(200).json({
    id: mechanic.id,
    name: mechanicName(mechanic),
    phone: mechanic.phone,
    role: mechanic.role || 'mechanic',
    token: makeToken(mechanic.id),
    // null = "all zones" (see admin.html mechanic profile). The client used
    // to have no way to know this and just kept whatever van the mechanic
    // last picked on the login screen's own selector - harmless now that
    // every server-side handler re-derives van scope from the mechanic's
    // own record instead of trusting the client, but the client still needs
    // the real value to know whether to even show that selector.
    van_number: mechanic.van_number ?? null,
  });
}

async function handleMechanicJobs(req, res) {
  const auth = await authMechanic(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  const baseCols =
    'id,client_id,client_name,client_email,client_phone,service_name,service_price,callout_fee,scheduled_date,scheduled_time,status,suburb,address,van_number,notes,mechanic_notes,mechanic_id,client_rating,client_review,preferred_mechanic_id,created_at';
  const hdrs = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
  // Only recent + upcoming jobs (last 7 days onward) so the list stays small at scale.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  // Scoped to THIS MECHANIC'S OWN van (set on their escalation_contacts row
  // by admin, never client-supplied) - previously "van" came straight from
  // req.body with no check that it was actually theirs, so any mechanic
  // could read any other van's full job list by just claiming it. A mechanic
  // with no van_number set (van_number IS NULL) covers every zone - no
  // filter at all for them, by design (see admin.html mechanic profile van
  // field: "All zones" is for one person covering everything).
  const vanFilter =
    auth.mechanic.van_number !== null ? `van_number=eq.${auth.mechanic.van_number}&` : '';
  // A cap, not pagination - 300 recent+upcoming jobs for one van is not a
  // page size a mechanic would ever click "next" on. If it is ever hit, the
  // X-Truncated header below is the honest signal that some jobs are
  // missing, instead of silently dropping them (5.1).
  const MECHANIC_JOBS_LIMIT = 300;
  const order = `${vanFilter}scheduled_date=gte.${cutoff}&order=scheduled_date.asc,scheduled_time.asc&limit=${MECHANIC_JOBS_LIMIT}`;
  // Try richer select including discount columns; fall back if migration not yet run.
  let jobsResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=${baseCols},discount_applied,discount_code&${order}`,
    { headers: hdrs }
  );
  if (!jobsResp.ok) {
    jobsResp = await fetch(`${SUPABASE_URL}/rest/v1/bookings?select=${baseCols}&${order}`, {
      headers: hdrs,
    });
  }
  if (!jobsResp.ok) return res.status(500).json({ error: 'Failed to fetch jobs' });
  let jobs = await jobsResp.json();
  // Capture before the preference filter below can only shrink this - the cap
  // was hit against the raw fetch, not against whatever is left after filtering.
  const jobsCapped = jobs.length >= MECHANIC_JOBS_LIMIT;

  // Preferred-mechanic priority window: an unclaimed job someone else was
  // preferred for stays hidden from this mechanic until it expires, then
  // opens to the whole van same as any other job. Only filters open jobs -
  // never hides a mechanic's own already-accepted jobs.
  if (await isMechanicPreferenceEnabled(SERVICE_KEY)) {
    const windowMs = MECHANIC_PREFERENCE_WINDOW_MIN * 60 * 1000;
    jobs = jobs.filter((j) => {
      if (j.mechanic_id || !j.preferred_mechanic_id) return true;
      if (j.preferred_mechanic_id === auth.mechanic.id) return true;
      const ageMs = Date.now() - new Date(j.created_at).getTime();
      return ageMs >= windowMs;
    });
  }

  // Attach each client's membership status (so the mechanic can see, before
  // charging, whether this job is a covered/discounted visit and by how much
  // - Diego: "el mecanico debe ser capaz de ver que el cliente...tiene una
  // membresia activa para que sepa cuando aplicar descuento y cuanto") and
  // whether they have a card on file (so the mechanic knows completion will
  // auto-charge instead of needing EFTPOS - see handleMechanicComplete).
  const clientIds = [...new Set(jobs.map((j) => j.client_id).filter(Boolean))];
  if (clientIds.length) {
    const idsFilter = clientIds.map((id) => `"${id}"`).join(',');
    const profResp = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=id,membership_plan,membership_status,stripe_default_payment_method_id&id=in.(${idsFilter})`,
      { headers: hdrs }
    );
    if (profResp.ok) {
      const profiles = await profResp.json();
      const byId = new Map(profiles.map((p) => [p.id, p]));
      jobs = jobs.map((j) => {
        const p = byId.get(j.client_id);
        return {
          ...j,
          client_membership_plan: p?.membership_plan || null,
          client_membership_status: p?.membership_status || null,
          client_has_card_on_file: !!p?.stripe_default_payment_method_id,
        };
      });
    }
  }

  if (jobsCapped) res.setHeader('X-Truncated', 'true');
  return res.status(200).json(jobs);
}

async function handleMechanicLocation(req, res) {
  const { van_number, lat, lng } = req.body;
  if (lat === null || lat === undefined || lng === null || lng === undefined)
    return res.status(400).json({ error: 'Location required' });

  const auth = await authMechanic(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const mechanic = auth.mechanic;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  // A van-bound mechanic can only ever update THEIR OWN van's position (can't
  // overwrite another van's GPS trail by sending a different van_number). An
  // "all zones" mechanic (van_number null) has no single van to force, so
  // this one write still trusts which van they say they're currently driving.
  const van = mechanic.van_number !== null ? mechanic.van_number : parseInt(van_number) || 1;

  const now = new Date().toISOString();
  const SERVICE_URL = `${SUPABASE_URL}/rest/v1/mechanic_locations`;
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  };

  // UPSERT keyed on van_number (avoids mechanic_id FK issues entirely)
  // mechanic_id stored informational only
  const upsertResp = await fetch(`${SERVICE_URL}?van_number=eq.${van}`, {
    method: 'GET',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  const existing = upsertResp.ok ? await upsertResp.json() : [];

  let dbErr = null;
  if (existing && existing[0]) {
    const r = await fetch(`${SERVICE_URL}?van_number=eq.${van}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        lat,
        lng,
        is_online: true,
        updated_at: now,
        mechanic_id: mechanic.id,
      }),
    });
    if (!r.ok) dbErr = await r.text();
  } else {
    const r = await fetch(SERVICE_URL, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        van_number: van,
        lat,
        lng,
        is_online: true,
        updated_at: now,
        mechanic_id: mechanic.id,
      }),
    });
    if (!r.ok) dbErr = await r.text();
  }

  if (dbErr) {
    console.error('[mechanic-location] DB error:', dbErr);
    return res.status(500).json({ error: 'Failed to save location', detail: dbErr });
  }
  return res.status(200).json({ ok: true, van, lat, lng });
}

async function handleClientBookings(req, res) {
  const { access_token, client_id } = req.body;
  if (!access_token || !client_id)
    return res.status(400).json({ error: 'access_token and client_id required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  // Verify token server-side — confirms the token is valid and belongs to this user
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${access_token}` },
  });
  if (!userResp.ok) return res.status(401).json({ error: 'Invalid or expired session' });
  const userData = await userResp.json();
  if (userData.id !== client_id) return res.status(403).json({ error: 'Forbidden' });

  const base =
    'id,service_name,service_price,callout_fee,scheduled_date,scheduled_time,address,status,client_rating,client_review,tracking_token,mechanic_id,notes,photo_before_url,photo_after_url';
  const hdrs = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  // A cap, not pagination - see MECHANIC_JOBS_LIMIT above for why (5.1).
  const CLIENT_BOOKINGS_LIMIT = 100;
  const q = `client_id=eq.${client_id}&order=scheduled_date.desc&limit=${CLIENT_BOOKINGS_LIMIT}`;
  // Try with cancellation_reason; fall back if the column isn't there yet.
  let bookingsResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=${base},cancellation_reason&${q}`,
    { headers: hdrs }
  );
  if (!bookingsResp.ok)
    bookingsResp = await fetch(`${SUPABASE_URL}/rest/v1/bookings?select=${base}&${q}`, {
      headers: hdrs,
    });
  if (!bookingsResp.ok) return res.status(500).json({ error: 'Failed to fetch bookings' });
  const data = await bookingsResp.json();
  if ((data || []).length >= CLIENT_BOOKINGS_LIMIT) res.setHeader('X-Truncated', 'true');
  return res.status(200).json(data || []);
}

async function handleMechanicAccept(req, res) {
  const { booking_id } = req.body;
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });
  const auth = await authMechanic(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const mechanic = auth.mechanic;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  // Arrival PIN: client sees this in-app and reads it aloud when the mechanic arrives,
  // proving the right person is at the door - same pattern as Uber's rider PIN.
  const arrivalPin = String(crypto.randomInt(1000, 10000));
  // Van scope from the mechanic's own record, never the client - same reasoning
  // as handleMechanicJobs above. A mechanic with no van_number set (all zones)
  // can accept from either van, so no van filter at all for them.
  const vanFilter = mechanic.van_number !== null ? `&van_number=eq.${mechanic.van_number}` : '';
  // Atomic accept: only assign if no mechanic has taken it yet (mechanic_id is null)
  // AND it belongs to this mechanic's own van - a concurrent second accept, or an
  // accept attempt on another van's job, matches 0 rows → 409.
  const acceptResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}&mechanic_id=is.null${vanFilter}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        status: 'confirmed',
        mechanic_id: mechanic.id,
        arrival_pin: arrivalPin,
        mechanic_accepted_at: new Date().toISOString(),
      }),
    }
  );
  if (!acceptResp.ok) {
    const errText = await acceptResp.text();
    return res.status(500).json({ error: 'Failed to accept booking', detail: errText });
  }
  const acceptedRows = await acceptResp.json().catch(() => []);
  if (!Array.isArray(acceptedRows) || acceptedRows.length === 0) {
    return res.status(409).json({ error: 'This job was just taken by another mechanic' });
  }

  // Calendar sync (fire-and-forget) - only does anything once Google Calendar
  // is configured and connected; a no-op otherwise (see _google-calendar.js).
  syncBookingToCalendar(acceptedRows[0], mechanic.email, SERVICE_KEY).catch((e) =>
    console.error('[mechanic-accept] calendar sync failed:', e.message)
  );

  return res.status(200).json({ ok: true, mechanic_name: mechanic.name });
}

async function syncBookingToCalendar(booking, mechanicEmail, SERVICE_KEY) {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: svc } = await sb
    .from('services')
    .select('duration_max')
    .eq('name', booking.service_name)
    .maybeSingle();
  const eventId = await createCalendarEvent({
    scheduledDate: booking.scheduled_date,
    scheduledTime: booking.scheduled_time,
    durationMin: (svc?.duration_max || DEFAULT_SERVICE_DURATION_MIN) + SLOT_BUFFER_MIN,
    serviceName: booking.service_name,
    address: booking.address,
    clientName: booking.client_name,
    mechanicEmail,
  });
  if (eventId) {
    await sb.from('bookings').update({ google_event_id: eventId }).eq('id', booking.id);
  }
}

async function handleMechanicReject(req, res) {
  const { booking_id } = req.body;
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });
  const auth = await authMechanic(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const mechanic = auth.mechanic;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const updateResp = await fetch(
    // mechanic_id scope: a mechanic can only reject a job actually assigned
    // to them, not reopen anyone else's by guessing a booking_id.
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}&mechanic_id=eq.${encodeURIComponent(mechanic.id)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ status: 'pending', mechanic_id: null }),
    }
  );
  if (!updateResp.ok) {
    const errText = await updateResp.text();
    console.error('reject patch error:', updateResp.status, errText);
    return res.status(500).json({ error: 'Failed to reject booking', detail: errText });
  }
  return res.status(200).json({ ok: true });
}

async function handleMechanicArrived(req, res) {
  const { booking_id, pin } = req.body;
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });
  if (!pin) return res.status(400).json({ error: 'Ask the client for their 4-digit code' });
  const auth = await authMechanic(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  // mechanic_id scope on the lookup too - a mechanic should never be able to
  // read another mechanic's arrival_pin by guessing a booking_id, not just
  // be blocked from the later write.
  const bookingResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=arrival_pin&id=eq.${encodeURIComponent(booking_id)}&mechanic_id=eq.${encodeURIComponent(auth.mechanic.id)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!bookingResp.ok) return res.status(500).json({ error: 'Database error' });
  const bookingRows = await bookingResp.json();
  if (!bookingRows?.length) return res.status(404).json({ error: 'Booking not found' });
  const storedPin = bookingRows[0].arrival_pin;
  // A missing storedPin used to silently PASS this check instead of failing
  // it - every job gets a real arrival_pin at accept time, so a null one
  // here means something's wrong with the data, not a reason to wave the
  // mechanic through.
  if (!storedPin || String(pin).trim() !== String(storedPin)) {
    return res.status(403).json({ error: 'Incorrect code - ask the client to read it again' });
  }

  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}&mechanic_id=eq.${encodeURIComponent(auth.mechanic.id)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ status: 'inprogress', arrived_at: new Date().toISOString() }),
    }
  );
  if (!updateResp.ok) {
    const errText = await updateResp.text();
    console.error('arrived patch error:', updateResp.status, errText);
    return res.status(500).json({ error: 'Failed to mark arrived', detail: errText });
  }
  return res.status(200).json({ ok: true });
}

async function handleMechanicChecklist(req, res) {
  const { booking_id, started_at, pre_service_checklist, pre_service_notes } = req.body;
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });
  const auth = await authMechanic(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}&mechanic_id=eq.${encodeURIComponent(auth.mechanic.id)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ started_at, pre_service_checklist, pre_service_notes }),
    }
  );
  if (!updateResp.ok) {
    const errText = await updateResp.text();
    console.error('checklist patch error:', updateResp.status, errText);
    return res.status(500).json({ error: 'Failed to save checklist', detail: errText });
  }
  return res.status(200).json({ ok: true });
}

async function handleMechanicComplete(req, res) {
  const {
    booking_id,
    mechanic_notes,
    parts_used,
    parts_charged,
    final_charge_amount,
    final_charge_status,
    skip_auto_charge,
    tip_amount,
    photo_before_url,
    photo_after_url,
    client_signature_url,
    next_service_date,
    duration_seconds,
  } = req.body;
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });

  const auth = await authMechanic(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const sbHdr = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Is this the same completion arriving twice? The mechanic's phone parks a
  // completion in an offline outbox and resends it when the signal comes back,
  // so the second delivery must not charge the card again, must not decrement
  // the parts stock again, and must not send a second invoice. Everything below
  // this point runs at most once per booking. See api/_completion-guard.js.
  //
  // Read-then-act is not atomic: two requests fired within the same second can
  // both read "not completed". That window is still covered by the Stripe
  // idempotency key further down (keyed on booking_id), which is what it was
  // always for. This guard is for the other case - the replay minutes or hours
  // later, once that key has expired.
  const guardResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=status,final_charge_status&id=eq.${encodeURIComponent(booking_id)}&limit=1`,
    { headers: sbHdr }
  ).catch(() => null);
  const guardRow = guardResp?.ok ? (await guardResp.json().catch(() => []))?.[0] : null;
  if (!guardRow) {
    // Fail-open is the right call (a completion must not be blocked by a failed
    // SELECT) but it means the guard is doing NOTHING on this request, so say
    // so loudly. A silently dead guard is how a double charge comes back.
    console.error(
      '[mechanic-complete] duplicate guard could not read booking',
      booking_id,
      '- HTTP',
      guardResp?.status ?? 'no response',
      '- proceeding UNGUARDED'
    );
  }
  const verdict = completionVerdict(guardRow);
  if (verdict.action !== 'proceed') {
    console.warn(
      '[mechanic-complete]',
      verdict.action,
      'for booking',
      booking_id,
      '- status is',
      guardRow?.status
    );
    return res.status(verdict.status).json(verdict.body);
  }

  // Card-on-file auto-charge (Diego, 2026-07-22): if the client has a saved
  // card, charge them automatically here - no mechanic confirmation, matching
  // what Diego asked for. Unlike a plain "fall through on any failure", a
  // card that EXISTS but fails to charge blocks completion here (returns
  // AUTO_CHARGE_FAILED, booking stays incomplete) rather than silently
  // defaulting final_charge_status to "charged_manual" for a charge that
  // never actually happened - mechanic.js catches this code and reveals the
  // EFTPOS UI so the mechanic can retry with skip_auto_charge:true once they
  // 've actually collected payment (per Diego: "fallback a EFTPOS en el
  // momento"). Idempotency key keyed on booking_id so a retry (or a lost
  // response on a request that actually succeeded) can never double-charge.
  // No card on file at all is the normal, unaffected case - proceeds exactly
  // as before this feature existed.
  let autoChargeResult = null;
  if (!skip_auto_charge && Number(final_charge_amount) > 0 && process.env.STRIPE_SECRET_KEY) {
    const bkResp = await fetch(
      `${SUPABASE_URL}/rest/v1/bookings?select=client_id&id=eq.${encodeURIComponent(booking_id)}&limit=1`,
      { headers: sbHdr }
    );
    const bkRow = bkResp.ok ? (await bkResp.json())?.[0] : null;
    if (bkRow?.client_id) {
      const profResp = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?select=stripe_customer_id,stripe_default_payment_method_id&id=eq.${encodeURIComponent(bkRow.client_id)}&limit=1`,
        { headers: sbHdr }
      );
      const prof = profResp.ok ? (await profResp.json())?.[0] : null;
      if (prof?.stripe_customer_id && prof?.stripe_default_payment_method_id) {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        try {
          const pi = await stripe.paymentIntents.create(
            {
              amount: Math.round(Number(final_charge_amount) * 100),
              currency: 'aud',
              customer: prof.stripe_customer_id,
              payment_method: prof.stripe_default_payment_method_id,
              off_session: true,
              confirm: true,
              description: `Dr. Bike Sydney - booking ${booking_id}`,
            },
            { idempotencyKey: `complete-charge-${booking_id}` }
          );
          if (pi.status === 'succeeded') {
            autoChargeResult = { charged: true, paymentIntentId: pi.id };
          } else {
            return res.status(402).json({
              error: 'Card on file could not be charged - collect payment via EFTPOS/Cash instead.',
              code: 'AUTO_CHARGE_FAILED',
            });
          }
        } catch (e) {
          console.warn('[mechanic-complete] card-on-file auto-charge failed:', e.message);
          return res.status(402).json({
            error: 'Card on file could not be charged - collect payment via EFTPOS/Cash instead.',
            code: 'AUTO_CHARGE_FAILED',
          });
        }
      }
    }
  }

  // Deduct used parts from inventory and build a readable summary stored on
  // the booking. Uses the decrement_part_stock() RPC (atomic guarded UPDATE)
  // instead of read-then-write, so two mechanics completing jobs with the
  // same part at the same time can't both compute a decrement from the same
  // stale stock count and silently lose one of the two deductions.
  let partsText = null;
  // The real parts cost for THIS job, not the flat "total parts spend / total
  // jobs" estimate the Analytics/Finance margin tables used before this
  // (18.3). NULL means "we cannot say" (parts_used arrived as a plain string,
  // or was empty) - never 0, which would claim a measured job that used no
  // parts. Looked up in one batch query rather than inside the loop below so
  // one slow request doesn't become N.
  let partsCostActual = null;
  const lowStock = [];
  if (Array.isArray(parts_used) && parts_used.length) {
    // Only real parts_inventory ids (uuid, proper 8-4-4-4-12 shape - not just
    // "36 characters of hex or hyphen", which a first pass at this filter
    // used and which let strings like 36 hyphens or 36 hex digits with none
    // through) go into the PostgREST `in.()` filter below. A garbage id from
    // a corrupted client wouldn't just fail to price itself, it would break
    // the filter syntax for every OTHER id in the same batch (review
    // finding) - this is defence in depth, not a path the mechanic app's own
    // UI can reach today (parts always come from a server-sourced picker,
    // never free text), but the filter costs nothing to keep correct.
    const partIds = [
      ...new Set(
        parts_used
          .map((p) => p?.id)
          .filter(
            (id) =>
              typeof id === 'string' &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
          )
      ),
    ];
    let costById = new Map();
    // Whether the lookup below can be trusted. Starts false when there was
    // nothing valid to look up in the first place (every id missing or
    // malformed) rather than defaulting to true and letting the loop below
    // silently settle on $0 for a job that was never actually priced (review
    // finding: an earlier version of this fix missed exactly this case) -
    // then only gets set true once a real query has actually come back ok.
    let costLookupOk = false;
    if (partIds.length) {
      const idsFilter = partIds.map((id) => `"${id}"`).join(',');
      try {
        const costResp = await fetch(
          `${SUPABASE_URL}/rest/v1/parts_inventory?select=id,cost_price&id=in.(${idsFilter})`,
          { headers: sbHdr }
        );
        if (costResp.ok) {
          const rows = await costResp.json();
          costById = new Map(rows.map((r) => [r.id, Number(r.cost_price) || 0]));
          costLookupOk = true;
        }
      } catch (e) {
        // A completion must never be blocked by this lookup (it is not on
        // the critical path of actually completing the job), but a network
        // failure here used to propagate out of the whole function and 500
        // the completion - the opposite of that intent (review finding).
        console.warn('[mechanic-complete] parts_inventory cost lookup failed:', e.message);
      }
    }
    // NULL means "we cannot say" (parts_used arrived as a plain string, was
    // empty, or the lookup above failed) - never 0, which would claim a
    // measured job that used no parts (18.3).
    if (costLookupOk) partsCostActual = 0;
    for (const p of parts_used) {
      const qty = parseInt(p?.qty, 10);
      if (!p?.id || !Number.isFinite(qty) || qty <= 0) continue;
      if (costLookupOk) partsCostActual += qty * (costById.get(p.id) || 0);
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/decrement_part_stock`, {
        method: 'POST',
        headers: sbHdr,
        body: JSON.stringify({ p_part_id: p.id, p_qty: qty }),
      });
      if (!r.ok) continue;
      const row = (await r.json())[0];
      if (!row) continue;
      if (row.new_stock <= (row.min_stock || 0)) lowStock.push(row.name);
    }
    partsText =
      parts_used
        .filter((p) => p?.id && parseInt(p?.qty, 10) > 0)
        .map((p) => `${parseInt(p.qty, 10)}x ${p.name}`)
        .join(', ') || null;
  } else if (typeof parts_used === 'string') {
    partsText = parts_used || null;
  }

  const payload = {
    status: 'completed',
    completed_at: new Date().toISOString(),
    mechanic_notes: mechanic_notes || null,
    parts_used: partsText,
    parts_charged: parts_charged || null,
    parts_cost_actual: partsCostActual,
    final_charge_amount:
      final_charge_amount !== null && final_charge_amount !== undefined
        ? Number(final_charge_amount)
        : null,
    final_charge_status: autoChargeResult?.charged
      ? 'charged_card_on_file'
      : final_charge_status || null,
    completion_payment_intent_id: autoChargeResult?.paymentIntentId || null,
    tip_amount: Number(tip_amount) || 0,
    next_service_date: next_service_date || null,
  };
  if (photo_before_url) payload.photo_before_url = photo_before_url;
  if (photo_after_url) payload.photo_after_url = photo_after_url;
  if (client_signature_url) payload.client_signature_url = client_signature_url;
  if (duration_seconds) payload.service_duration_seconds = duration_seconds;

  // If a discount code was applied at completion time, record its use
  // server-side via the atomic consume_discount_code() RPC (see booking
  // creation above for why - same double-spend race, same fix). But
  // consume_discount_code() is keyed only on the code string, with no idea
  // which booking is using it - it happily lets the SAME booking consume a
  // code a second time here even though handleCreateBooking may have
  // already consumed one for it, discounting an already-discounted total
  // again. Skip the second consume if this booking already has one on file.
  const mechDiscCode = parts_charged?.discount_code;
  if (mechDiscCode) {
    try {
      const existingResp = await fetch(
        `${SUPABASE_URL}/rest/v1/bookings?select=discount_code,service_price&id=eq.${encodeURIComponent(booking_id)}&limit=1`,
        { headers: sbHdr }
      );
      const existing = existingResp.ok ? (await existingResp.json())?.[0] : null;
      if (existing?.discount_code) {
        console.warn(
          '[mechanic-complete] booking',
          booking_id,
          'already has discount_code',
          existing.discount_code,
          '- not consuming another'
        );
      } else {
        const rpcResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_discount_code`, {
          method: 'POST',
          headers: sbHdr,
          body: JSON.stringify({ p_code: String(mechDiscCode).trim().toUpperCase() }),
        });
        const dc = rpcResp.ok ? (await rpcResp.json())?.[0] : null;
        if (dc) {
          // Recorded on the booking (same fields handleCreateBooking writes)
          // so a second completion call - retry, double-tap - sees the code
          // as already spent instead of re-reading a still-empty column.
          const price = Number(existing?.service_price) || 0;
          payload.discount_code = String(mechDiscCode).trim().toUpperCase();
          payload.discount_applied =
            dc.discount_type === 'percent'
              ? Math.round(price * dc.discount_value) / 100
              : Math.min(dc.discount_value, price);
        }
      }
    } catch (e) {
      console.error('[mechanic-complete] discount-code consume failed:', booking_id, e.message);
    }
  }

  // Read the booking BEFORE the PATCH: the discount block above may be about to
  // overwrite discount_applied with the completion-time discount, and the
  // invoice needs the booking-time one, exactly as the browser used to compute
  // it from its own pre-completion copy of the row.
  const notifyRow = await readBookingForNotifications(booking_id, sbHdr);

  const patchHdr = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };
  let updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
    { method: 'PATCH', headers: patchHdr, body: JSON.stringify(payload) }
  );
  if (!updateResp.ok) {
    // scripts/add-parts-cost-actual.sql not run yet - retry without the new
    // column rather than failing a real completion over it (18.3). Same
    // fallback shape handleMechanicJobs uses for discount_applied/code.
    //
    // Logged even though the retry usually succeeds: silently swallowing the
    // first failure here was a review finding - without this line there is
    // no way to tell "migration not run yet" (expected, harmless) apart from
    // "this write is actually broken for an unrelated reason" (needs
    // attention) if the two ever produce different symptoms.
    console.warn(
      '[mechanic-complete] booking PATCH failed, retrying without parts_cost_actual:',
      updateResp.status
    );
    const { parts_cost_actual, ...withoutPartsCost } = payload;
    updateResp = await fetch(
      `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
      { method: 'PATCH', headers: patchHdr, body: JSON.stringify(withoutPartsCost) }
    );
  }
  if (!updateResp.ok) {
    const errText = await updateResp.text();
    console.error('complete patch error:', updateResp.status, errText);
    return res.status(500).json({ error: 'Failed to complete booking', detail: errText });
  }

  // The invoice, the review email and the review SMS. Awaited on purpose: this
  // request is the last moment we are certain something is running. It can
  // never fail the completion, though - the job IS completed at this point, and
  // answering 500 here would show the mechanic "could not complete job" for a
  // job that is done, and invite a second completion.
  const notified = await sendCompletionNotifications(
    {
      booking: notifyRow,
      mechanicName: mechanicName(auth.mechanic),
      partsCharged: parts_charged,
      tipAmount: tip_amount,
      mechanicNotes: mechanic_notes,
      nextServiceDate: next_service_date,
    },
    sbHdr
  );

  return res.status(200).json({
    ok: true,
    low_stock: lowStock,
    auto_charged: !!autoChargeResult?.charged,
    notified,
  });
}

const NOTIFY_COLS =
  'id,client_name,client_email,client_phone,service_name,service_price,callout_fee,scheduled_date,scheduled_time,address,suburb';

// discount_applied and tracking_token are behind migrations that may not have
// run on every environment - same try-then-fall-back handleMechanicJobs uses
// for it. PostgREST 400s the WHOLE query on an unknown column, so asking for
// them unconditionally would mean no invoice and no review request at all
// rather than one without a discount line.
//
// Verified against production on 2026-09-03: `tracking_token` exists there
// (POST /api/auth?role=public-track with a random UUID answers 404 "Booking
// not found", which it can only do after the column resolves). The fallback is
// for a fresh environment, not for prod.
async function readBookingForNotifications(bookingId, sbHdr) {
  const url = (cols) =>
    `${SUPABASE_URL}/rest/v1/bookings?select=${cols}&id=eq.${encodeURIComponent(bookingId)}&limit=1`;
  try {
    let r = await fetch(url(`${NOTIFY_COLS},discount_applied,tracking_token`), { headers: sbHdr });
    if (!r.ok) r = await fetch(url(`${NOTIFY_COLS},tracking_token`), { headers: sbHdr });
    if (!r.ok) r = await fetch(url(`${NOTIFY_COLS},discount_applied`), { headers: sbHdr });
    if (!r.ok) r = await fetch(url(NOTIFY_COLS), { headers: sbHdr });
    if (!r.ok) return null;
    return (await r.json())?.[0] || null;
  } catch (e) {
    console.error('[mechanic-complete] could not read booking for notifications:', e.message);
    return null;
  }
}

async function sendCompletionNotifications(args, sbHdr) {
  if (!args.booking) {
    console.error(
      '[mechanic-complete] booking row unavailable - no invoice, no review request sent'
    );
    return { sent: [], failed: ['booking-read'], skipped: [] };
  }
  const skipped = [];
  if (!args.booking.client_email) skipped.push('email:no-address-on-file');
  if (!args.booking.client_phone) skipped.push('sms:no-number-on-file');

  const calls = buildCompletionCalls(args);
  const summary = await dispatchCompletionCalls(calls, {
    baseUrl: SELF_BASE_URL,
    internalToken: process.env.INTERNAL_API_SECRET,
    bookingId: args.booking.id,
  });

  // Written down even when everything succeeded: the sweep needs to be able to
  // tell "all three landed" from "this booking predates the column", and only a
  // stored record can say that.
  await recordCompletionOutcome({
    bookingId: args.booking.id,
    outcome: summary.outcome,
    supabaseUrl: SUPABASE_URL,
    sbHdr,
  });

  return { ...summary, skipped };
}

async function handleClientCancel(req, res) {
  const { access_token, booking_id, client_id } = req.body;
  if (!access_token || !booking_id || !client_id)
    return res.status(400).json({ error: 'access_token, booking_id, client_id required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${access_token}` },
  });
  if (!userResp.ok) return res.status(401).json({ error: 'Invalid session' });
  const userData = await userResp.json();
  if (userData.id !== client_id) return res.status(403).json({ error: 'Forbidden' });

  const bkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=id,status,client_id,client_name,service_name,scheduled_date,scheduled_time,stripe_payment_intent_id,google_event_id&id=eq.${encodeURIComponent(booking_id)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!bkResp.ok) return res.status(500).json({ error: 'Database error' });
  const bkData = await bkResp.json();
  if (!bkData?.length) return res.status(404).json({ error: 'Booking not found' });
  const bk = bkData[0];
  if (bk.client_id !== client_id) return res.status(403).json({ error: 'Forbidden' });
  if (!['pending', 'confirmed'].includes(bk.status))
    return res.status(400).json({ error: 'Booking cannot be cancelled' });

  // El filtro de estado va TAMBIEN en la escritura, no solo en la lectura de
  // arriba. Sin el, esto era un check-then-act clasico: se leia 'confirmed', y
  // entre esa lectura y este PATCH el mecanico podia terminar el trabajo. El
  // PATCH pisaba 'completed' con 'cancelled' y despues reembolsaba un trabajo
  // que se hizo de verdad - la carrera exacta del punto 4 de la auditoria.
  //
  // Con el filtro, la base decide: si el estado ya se movio, no matchea ninguna
  // fila y la carrera esta perdida, sin haber tocado nada.
  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(
      booking_id
    )}&status=in.(pending,confirmed)`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        // representation, no minimal: hace falta SABER si actualizo algo.
        // `minimal` devuelve 204 tanto si cambio una fila como si no cambio
        // ninguna, y esa diferencia es justo lo que decide si se reembolsa.
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ status: 'cancelled' }),
    }
  );
  if (!updateResp.ok) return res.status(500).json({ error: 'Failed to cancel booking' });

  const updated = await updateResp.json().catch(() => []);
  if (!Array.isArray(updated) || updated.length === 0) {
    // Alguien llego primero. Puede ser el mecanico completando, o un segundo
    // toque del mismo boton. En los dos casos: no se reembolsa nada.
    return res.status(409).json({
      error: 'This booking was just updated - refresh to see its current state.',
      code: 'CANCEL_RACE_LOST',
    });
  }

  // Notify first person on waitlist for this slot (fire-and-forget)
  notifyWaitlist(SERVICE_KEY, bk.scheduled_date, bk.scheduled_time).catch(() => {});

  // Remove the mechanic's calendar event, if one was ever created (fire-and-forget)
  if (bk.google_event_id) deleteCalendarEvent(bk.google_event_id).catch(() => {});

  // Auto-refund the $20 callout fee for >=24h notice (per terms.html section 6),
  // then tell Diego the outcome (fire-and-forget - never block the client's
  // cancel response on this).
  notifyAdminCancellation(bk, SERVICE_KEY).catch((e) =>
    console.error('[client-cancel] refund/notify failed:', e.message)
  );

  return res.status(200).json({ ok: true });
}

async function notifyAdminCancellation(bk, SERVICE_KEY) {
  const hours = hoursUntilAppointment(bk.scheduled_date, bk.scheduled_time);
  const eligibleForRefund = hours >= 24;

  // A cancelled booking gives the referral credit back. Without this the credit
  // is burned by a booking that never happened - the client spends $15 they
  // earned, cancels the same afternoon, and the money is simply gone with no
  // screen anywhere admitting it. Zeroing the column in the same statement
  // makes it idempotent: a second cancel of the same booking restores nothing.
  if (bk.client_id) {
    try {
      const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
      // Asked for separately, and allowed to fail: scripts/*.sql in this repo
      // are run by hand, so this column exists in the code before it exists in
      // the database. A cancellation must not break in that window.
      const { data: creditRow, error: readErr } = await sbAdmin
        .from('bookings')
        .select('referral_credit_applied')
        .eq('id', bk.id)
        .single();
      if (readErr) throw new Error(readErr.message);
      const creditToRestore = Number(creditRow?.referral_credit_applied) || 0;
      if (creditToRestore <= 0) throw null;
      const { error: restoreErr } = await sbAdmin.rpc('refund_referral_credits', {
        p_user: bk.client_id,
        p_amount: creditToRestore,
      });
      if (restoreErr) throw new Error(restoreErr.message);
      await sbAdmin
        .from('bookings')
        .update({ referral_credit_applied: 0 })
        .eq('id', bk.id)
        .gt('referral_credit_applied', 0);
    } catch (e) {
      // `throw null` above is the "nothing to restore" path, not a failure.
      if (e) {
        console.error('[client-cancel] referral credit restore failed:', bk.id, e.message);
      }
    }
  }

  let refunded = false;
  let refundAttempted = false;
  if (eligibleForRefund && bk.stripe_payment_intent_id && process.env.STRIPE_SECRET_KEY) {
    refundAttempted = true;
    try {
      await new Stripe(process.env.STRIPE_SECRET_KEY).refunds.create({
        payment_intent: bk.stripe_payment_intent_id,
      });
      refunded = true;
    } catch (e) {
      console.error('[client-cancel] Stripe refund failed:', e.message);
    }
  }

  const base = SELF_BASE_URL;
  await fetch(`${base}/api/send-message?channel=whatsapp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-token': process.env.INTERNAL_API_SECRET || '',
    },
    body: JSON.stringify({
      to: '0433963250',
      template: 'client_cancelled',
      data: {
        clientName: bk.client_name || 'Cliente',
        service: bk.service_name || 'Servicio',
        date: bk.scheduled_date,
        time: bk.scheduled_time,
        hours,
        refund: eligibleForRefund,
        refunded,
        refundAttempted,
      },
    }),
  });
}

async function notifyWaitlist(SERVICE_KEY, date, time) {
  if (!date || !time) return;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: entries } = await sb
    .from('waitlist')
    .select('id, client_email, client_name, service_name, preferred_date')
    .eq('preferred_date', date)
    .eq('status', 'waiting')
    .contains('preferred_times', [time])
    .order('created_at', { ascending: true })
    .limit(1);
  if (!entries?.length) return;
  const entry = entries[0];
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
      to: [entry.client_email],
      subject: `A slot just opened up for ${date}!`,
      html: `<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <div style="background:#0D1F3C;border-radius:12px 12px 0 0;padding:20px 24px">
          <span style="color:#fff;font-weight:800;font-size:18px">Dr. Bike Sydney</span>
        </div>
        <div style="border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;padding:28px 24px">
          <p style="font-size:16px;font-weight:700;color:#0D1F3C;margin:0 0 8px">Good news, ${entry.client_name || 'there'}!</p>
          <p style="color:#475569;margin:0 0 20px">A slot just opened up on <strong>${date}</strong> at <strong>${time}</strong>${entry.service_name ? ' for ' + entry.service_name : ''}. Book now before it fills up again.</p>
          <a href="https://drbikesydney.com.au" style="display:inline-block;background:#2563EB;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Book Now</a>
          <p style="color:#94A3B8;font-size:12px;margin-top:24px">You're receiving this because you joined the waitlist for ${date}.</p>
        </div>
      </div>`,
    }),
  });
  await sb
    .from('waitlist')
    .update({ status: 'notified', notified_at: new Date().toISOString() })
    .eq('id', entry.id);
}

async function handleJoinWaitlist(req, res) {
  const { access_token, client_id, email, name, date, preferred_times, service_name } = req.body;
  if (!email || !date || !Array.isArray(preferred_times) || !preferred_times.length)
    return res.status(400).json({ error: 'email, date, preferred_times required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({ error: 'Invalid date (YYYY-MM-DD)' });

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  let uid = null;
  let clientName = name || '';

  if (access_token) {
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${access_token}` },
    });
    if (userResp.ok) {
      const u = await userResp.json();
      uid = u.id || null;
      clientName = clientName || u.user_metadata?.full_name || u.user_metadata?.name || '';
    }
  }

  // Avoid duplicate entries for same client + date
  if (uid) {
    const { data: existing } = await sb
      .from('waitlist')
      .select('id')
      .eq('client_id', uid)
      .eq('preferred_date', date)
      .eq('status', 'waiting')
      .limit(1);
    if (existing?.length) return res.status(200).json({ ok: true, already: true });
  }

  await sb.from('waitlist').insert([
    {
      client_id: uid,
      client_name: clientName,
      client_email: email,
      service_name: service_name || null,
      preferred_date: date,
      preferred_times,
      status: 'waiting',
    },
  ]);

  return res.status(200).json({ ok: true });
}

// Password reset: generates a real recovery link via the Supabase Admin API
// and emails it through Resend - the same pathway every other transactional
// email in this app already uses. Supabase Auth's own built-in email sending
// was never configured for this project (nothing else here relies on it) -
// sb.auth.resetPasswordForEmail() always reports success client-side even
// when delivery silently fails, so this bypasses it entirely rather than
// depending on a second, unconfigured email pathway.
// "I forgot which email I signed up with." Not the same problem as forgetting
// a password: an address cannot be reset, only recalled, so it needs a second
// identifier - the phone number on the account.
//
// The answer goes to that phone by SMS and never to the screen. Otherwise
// anyone could type numbers into a form and harvest addresses. It also always
// replies the same way, registered or not, for the same reason the password
// reset does: never confirm to a stranger whether an account exists.
//
// The address is masked (t***s@gmail.com). Whoever holds the phone should be
// reminded which address they used, not handed a full one to reuse elsewhere.
export function maskEmail(email) {
  const [name, domain] = String(email || '').split('@');
  if (!name || !domain) return '';
  const shown = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 1) + '***' + name.slice(-1);
  return `${shown}@${domain}`;
}

async function handleRecoverEmail(req, res) {
  // Tighter than the shared guard: a hit here sends a real SMS to a real
  // person, so this is the one endpoint where abuse costs money and annoys
  // somebody who did nothing.
  if (await rateLimit(req, res, { max: 3, windowMs: 600000, key: 'recover-email' })) return;

  const phone = normalizeAUPhone(req.body?.phone);
  // Same answer either way - this must never become a way to test which
  // numbers have accounts.
  const genericOk = () => res.status(200).json({ ok: true });
  if (!phone) return genericOk();

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!SERVICE_KEY) {
    console.error('[recover-email] missing SERVICE_KEY');
    return genericOk();
  }

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    // Stored formats vary by how the profile was created, so ask for the ones
    // that actually occur rather than scanning every profile.
    const local = '0' + phone.slice(3);
    const { data, error } = await sb
      .from('profiles')
      .select('email,full_name')
      .in('phone', [phone, local, phone.slice(1), local.replace(/^0/, '')])
      .limit(1);
    if (error) {
      console.error('[recover-email] profiles lookup:', error.message);
      return genericOk();
    }
    const hit = data?.[0];
    if (!hit?.email) return genericOk();

    const r = await fetch(`${SELF_BASE_URL}/api/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: phone,
        type: 'email_recovery',
        name: hit.full_name || '',
        lang: ['en', 'es', 'zh'].includes(req.body?.lang) ? req.body.lang : 'en',
        maskedEmail: maskEmail(hit.email),
      }),
    });
    if (!r.ok) console.error('[recover-email] SMS send failed:', r.status, await r.text());
  } catch (e) {
    console.error('[recover-email] failed:', e.message);
  }
  return genericOk();
}

async function handleRequestPasswordReset(req, res) {
  const { email } = req.body;
  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'email required' });
  const cleanEmail = email.trim().toLowerCase();

  // Always respond the same way regardless of outcome - never reveal whether
  // an email is registered (same principle Supabase's own endpoint follows).
  const genericOk = () => res.status(200).json({ ok: true });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!SERVICE_KEY || !process.env.RESEND_API_KEY) {
    console.error('[request-password-reset] missing SERVICE_KEY or RESEND_API_KEY');
    return genericOk();
  }

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await sb.auth.admin.generateLink({
      type: 'recovery',
      email: cleanEmail,
      options: { redirectTo: 'https://drbikesydney.com.au/index.html' },
    });
    if (error || !data?.properties?.action_link) {
      if (error) console.warn('[request-password-reset] generateLink:', error.message);
      return genericOk();
    }

    const actionLink = data.properties.action_link;
    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
        to: [cleanEmail],
        subject: '🔐 Reset your Dr. Bike Sydney password',
        html: `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:#2563EB;padding:32px 28px;text-align:center">
            <div style="display:inline-block;background:#fff;border-radius:14px;padding:10px 18px;margin-bottom:14px">
              <img src="https://drbikesydney.com.au/images/logo-db.png" alt="Dr. Bike Sydney" height="26" style="display:block;width:auto">
            </div>
            <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.65);letter-spacing:0.12em;text-transform:uppercase;margin-bottom:8px">Dr. Bike Sydney</div>
            <div style="font-size:22px;font-weight:800;color:#fff">Reset your password</div>
          </div>
          <div style="padding:36px 28px">
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 28px;text-align:center">We received a request to reset the password for your Dr. Bike Sydney account. Click below to choose a new one.</p>
            <div style="text-align:center;margin-bottom:22px">
              <a href="${actionLink}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-weight:700;font-size:15px">Reset password</a>
            </div>
            <p style="color:#94A3B8;font-size:12px;text-align:center;margin:0 0 28px">This link expires in 1 hour, for your security.</p>
            <div style="border-top:1px solid #E2E8F0;padding-top:18px;margin-bottom:20px">
              <p style="color:#94A3B8;font-size:11px;margin:0 0 6px">Button not working? Paste this link into your browser:</p>
              <p style="color:#2563EB;font-size:11px;word-break:break-all;margin:0">${actionLink}</p>
            </div>
            <div style="background:#EEF3FC;border-radius:12px;padding:16px">
              <p style="font-size:12px;color:#2563EB;margin:0;line-height:1.6;opacity:0.9">Didn't request this? No action needed - you can safely ignore this email and your password will stay the same.</p>
            </div>
          </div>
          <div style="background:#F8FAFC;padding:20px 28px;text-align:center;border-top:1px solid #E2E8F0">
            <p style="font-size:12px;color:#94A3B8;margin:0 0 4px">Dr. Bike Sydney · drbikesydney.com.au · Sydney NSW</p>
            <p style="font-size:11px;color:#D1D5DB;margin:0">ABN: 87 654 025 287 · contact@drbikesydney.com.au</p>
          </div>
        </div>`,
      }),
    });
    if (!emailResp.ok)
      console.error('[request-password-reset] Resend send failed:', await emailResp.text());
  } catch (e) {
    console.error('[request-password-reset] failed:', e.message);
  }
  return genericOk();
}

async function handleApplyReferral(req, res) {
  const { access_token, referral_code } = req.body;
  if (!access_token || !referral_code)
    return res.status(400).json({ error: 'access_token and referral_code required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${access_token}` },
  });
  if (!userResp.ok) return res.status(401).json({ error: 'Invalid session' });
  const user = await userResp.json();

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const code = referral_code.trim().toUpperCase();

  const { data: myProfile } = await sb
    .from('profiles')
    .select('referred_by, referral_credits')
    .eq('id', user.id)
    .single();

  if (myProfile?.referred_by)
    return res.status(400).json({ error: 'You have already used a referral code' });

  const { data: referrer } = await sb
    .from('profiles')
    .select('id, referral_count, referral_credits')
    .eq('referral_code', code)
    .single();

  if (!referrer) return res.status(404).json({ error: 'Invalid referral code' });
  if (referrer.id === user.id)
    return res.status(400).json({ error: 'You cannot use your own referral code' });

  // $15, matching what js/app.js tells the customer in all three languages
  // ("You and your friend each get $15 off"). This was 10 - the app promised
  // one number and the server paid another, and nobody could tell because the
  // credit was unspendable either way.
  const CREDIT = 15;
  await Promise.all([
    sb
      .from('profiles')
      .update({
        referral_credits: (referrer.referral_credits || 0) + CREDIT,
        referral_count: (referrer.referral_count || 0) + 1,
      })
      .eq('id', referrer.id),
    sb
      .from('profiles')
      .update({
        referral_credits: (myProfile?.referral_credits || 0) + CREDIT,
        referred_by: code,
      })
      .eq('id', user.id),
  ]);

  return res.status(200).json({ ok: true, credit: CREDIT });
}

// Shared by handleClientReschedule and handleAdminReschedule so the two can
// never disagree about what a reschedule is allowed to do. `bk` needs id,
// status, google_event_id, service_name, address, van_number.
//
// Neither caller checked isSlotBlocked before this (docs/PENDIENTES.md 21.8
// closed that hole for NEW bookings via handleCreateBooking, but moving an
// EXISTING one was never wired to it) - a reschedule could land a booking
// on a slot the admin had specifically blocked, same gap, different door.
async function rescheduleBookingCore(SERVICE_KEY, bk, scheduled_date, scheduled_time) {
  if (!['pending', 'confirmed'].includes(bk.status))
    return { ok: false, status: 400, error: 'Booking cannot be rescheduled' };

  // Re-derive price + callout fee for the NEW date, same lookups
  // handleCreateBooking uses - previously this only updated date/time, so
  // moving a booking onto or off a Sunday/NSW-holiday silently left the
  // stale price in place (undercharging or overcharging by the 20%
  // surcharge). Recomputing fresh from the base service/zone price is
  // correct regardless of whether the OLD date was a surcharge day too -
  // adjusting the already-surcharged stored value in place would double
  // (or wrongly drop) the surcharge instead.
  const svcResp = await fetch(
    `${SUPABASE_URL}/rest/v1/services?select=price,duration_max&name=eq.${encodeURIComponent(bk.service_name)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const svcData = svcResp.ok ? await svcResp.json() : [];
  const newServicePrice = svcData?.[0]
    ? applySurcharge(Number(svcData[0].price), scheduled_date)
    : null;

  const neededMin = (svcData?.[0]?.duration_max || DEFAULT_SERVICE_DURATION_MIN) + SLOT_BUFFER_MIN;
  const blockResp = await fetch(
    `${SUPABASE_URL}/rest/v1/availability?select=time_slot,available,van_number&date=eq.${encodeURIComponent(scheduled_date)}`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const blockRows = blockResp.ok ? await blockResp.json() : [];
  if (isSlotBlocked(blockRows, Number(bk.van_number) || 1, scheduled_time, neededMin))
    return { ok: false, status: 409, error: 'That time is not available. Please pick another.' };

  // Same calculator as the original booking. If the address cannot be priced
  // now - the router is down, the geocoder does not know it - the booking
  // KEEPS the fee it was taken on. Zeroing it, or defaulting it to $20, would
  // silently rewrite what an existing customer agreed to pay.
  const { fee: reFee } = await calloutFeeForAddress(bk.address, scheduled_date);
  const newCalloutFee = reFee === null ? Number(bk.callout_fee) || 0 : reFee;

  const updatePayload = { scheduled_date, scheduled_time, callout_fee: newCalloutFee };
  if (newServicePrice !== null) updatePayload.service_price = newServicePrice;

  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(bk.id)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(updatePayload),
    }
  );
  if (!updateResp.ok) {
    // 23505 = unique_violation on bookings_unique_slot (van_number, scheduled_date,
    // scheduled_time) - someone else took that slot between the caller loading
    // availability and confirming. Tell them that specifically instead of a
    // generic failure so they know to just pick another time.
    const errBody = await updateResp.json().catch(() => ({}));
    if (errBody.code === '23505')
      return {
        ok: false,
        status: 409,
        error: 'That time was just taken by another booking - please pick another.',
      };
    return { ok: false, status: 500, error: 'Failed to reschedule booking' };
  }

  if (bk.google_event_id) {
    updateCalendarEvent(bk.google_event_id, {
      scheduledDate: scheduled_date,
      scheduledTime: scheduled_time,
      durationMin: neededMin,
    }).catch(() => {});
  }

  return { ok: true };
}

async function handleClientReschedule(req, res) {
  const { access_token, booking_id, client_id, scheduled_date, scheduled_time } = req.body;
  if (!access_token || !booking_id || !client_id || !scheduled_date || !scheduled_time)
    return res.status(400).json({
      error: 'access_token, booking_id, client_id, scheduled_date, scheduled_time required',
    });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduled_date))
    return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD)' });
  if (!/^\d{2}:\d{2}$/.test(scheduled_time))
    return res.status(400).json({ error: 'Invalid time format (HH:MM)' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${access_token}` },
  });
  if (!userResp.ok) return res.status(401).json({ error: 'Invalid session' });
  const userData = await userResp.json();
  if (userData.id !== client_id) return res.status(403).json({ error: 'Forbidden' });

  const bkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=id,status,client_id,google_event_id,service_name,address,van_number&id=eq.${encodeURIComponent(booking_id)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!bkResp.ok) return res.status(500).json({ error: 'Database error' });
  const bkData = await bkResp.json();
  if (!bkData?.length) return res.status(404).json({ error: 'Booking not found' });
  const bk = bkData[0];
  if (bk.client_id !== client_id) return res.status(403).json({ error: 'Forbidden' });

  const result = await rescheduleBookingCore(SERVICE_KEY, bk, scheduled_date, scheduled_time);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  return res.status(200).json({ ok: true });
}

// Admin-side equivalent - the calendar's own reschedule (docs/PENDIENTES.md
// 25.4). Before this, only the client could move their own booking; there
// was no admin path at all for "move this job to a different time".
async function handleAdminReschedule(req, res) {
  const { access_token, booking_id, scheduled_date, scheduled_time } = req.body;
  if (!booking_id || !scheduled_date || !scheduled_time)
    return res.status(400).json({ error: 'booking_id, scheduled_date, scheduled_time required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduled_date))
    return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD)' });
  if (!/^\d{2}:\d{2}$/.test(scheduled_time))
    return res.status(400).json({ error: 'Invalid time format (HH:MM)' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const auth = await verifyAdminSession(access_token, SERVICE_KEY);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const { data: bk, error: bkErr } = await auth.sb
    .from('bookings')
    .select('id,status,google_event_id,service_name,address,van_number')
    .eq('id', booking_id)
    .maybeSingle();
  if (bkErr) return res.status(500).json({ error: 'Database error' });
  if (!bk) return res.status(404).json({ error: 'Booking not found' });

  const result = await rescheduleBookingCore(SERVICE_KEY, bk, scheduled_date, scheduled_time);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  return res.status(200).json({ ok: true });
}

// Admin's "Reassign van" button (docs/PENDIENTES.md 25.2) used to write
// straight to `bookings` from the browser with `sb.from('bookings').update(...)`
// and no error check at all - on an RLS denial or a bookings_unique_slot
// conflict, the row never moved but the UI still said "Reassigned to Van X
// ✓". It also never checked whether the NEW van was actually free at that
// slot (isSlotBlocked), unlike every other booking-mutating action in this
// file. Found in audit, 2026-08-23. Same server-side pattern as
// handleAdminReschedule: verify, re-check the slot for the target van,
// write, tell the truth about the result.
async function handleAdminReassignVan(req, res) {
  const { access_token, booking_id, van_number } = req.body;
  const vanNum = Number(van_number);
  if (!booking_id || !vanNum)
    return res.status(400).json({ error: 'booking_id, van_number required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const auth = await verifyAdminSession(access_token, SERVICE_KEY);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const { data: bk, error: bkErr } = await auth.sb
    .from('bookings')
    .select('id,status,scheduled_date,scheduled_time,service_name')
    .eq('id', booking_id)
    .maybeSingle();
  if (bkErr) return res.status(500).json({ error: 'Database error' });
  if (!bk) return res.status(404).json({ error: 'Booking not found' });
  if (!['pending', 'confirmed'].includes(bk.status))
    return res.status(400).json({ error: 'Booking cannot be reassigned' });

  const svcResp = await fetch(
    `${SUPABASE_URL}/rest/v1/services?select=duration_max&name=eq.${encodeURIComponent(bk.service_name)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const svcData = svcResp.ok ? await svcResp.json() : [];
  const neededMin = (svcData?.[0]?.duration_max || DEFAULT_SERVICE_DURATION_MIN) + SLOT_BUFFER_MIN;

  const { data: blockRows } = await auth.sb
    .from('availability')
    .select('time_slot, available, van_number')
    .eq('date', bk.scheduled_date);
  if (isSlotBlocked(blockRows, vanNum, bk.scheduled_time, neededMin))
    return res.status(409).json({ error: 'That van is blocked at this time.' });

  const { error: updErr } = await auth.sb
    .from('bookings')
    .update({ van_number: vanNum })
    .eq('id', booking_id);
  if (updErr) {
    // 23505 = bookings_unique_slot (van_number, scheduled_date, scheduled_time)
    if (updErr.code === '23505')
      return res.status(409).json({ error: 'That van already has a booking at this time.' });
    return res.status(500).json({ error: 'Failed to reassign van' });
  }

  return res.status(200).json({ ok: true });
}

async function handleClientHistory(req, res) {
  const { client_id, client_email, booking_id } = req.body;
  if (!client_id && !client_email && !booking_id)
    return res.status(400).json({ error: 'client_id, client_email or booking_id required' });

  const auth = await authMechanic(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const cols =
    'id,service_name,service_price,scheduled_date,status,client_rating,client_review,mechanic_notes';
  let query = supabase
    .from('bookings')
    .select(cols)
    .eq('status', 'completed')
    .order('scheduled_date', { ascending: false })
    .limit(10);

  // A valid mechanic token was the only gate here, and the lookup key came
  // straight from the caller - so any mechanic (the PIN is a shared 4-digit
  // code) could pull any client's full history: prices, ratings, reviews and
  // private mechanic notes, for clients they had never worked with. Reading a
  // client's history is legitimate when you are about to service their bike,
  // which means you hold a booking for them - so that is the requirement.
  const link = supabase.from('bookings').select('id').eq('mechanic_id', auth.mechanic.id).limit(1);
  const linkQuery = client_id
    ? link.eq('client_id', client_id)
    : client_email
      ? link.eq('client_email', client_email)
      : link.eq('id', booking_id);
  const { data: own, error: linkErr } = await linkQuery;
  if (linkErr) return res.status(500).json({ error: linkErr.message });
  if (!own || own.length === 0)
    return res.status(403).json({ error: 'You have no booking with this client' });

  if (client_id) query = query.eq('client_id', client_id);
  else if (client_email) query = query.eq('client_email', client_email);
  else query = query.eq('id', booking_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(data || []);
}

async function handleMechanicUpdateStatus(req, res) {
  const { booking_id, status, mechanic_notes } = req.body;
  if (!booking_id || !status)
    return res.status(400).json({ error: 'booking_id and status required' });

  const ALLOWED = ['pending', 'confirmed', 'enroute', 'in_progress', 'completed', 'cancelled'];
  if (!ALLOWED.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const auth = await authMechanic(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const mechanic = auth.mechanic;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  // Ownership scope: 'enroute' is this endpoint's own claim path (sets
  // mechanic_id), so it's allowed on an unclaimed job OR one already theirs;
  // every other status transition requires the job to already be theirs -
  // previously nothing here checked that, so any mechanic could complete,
  // cancel, or reopen any booking company-wide by id alone.
  const ownershipFilter =
    status === 'enroute'
      ? `&or=(mechanic_id.is.null,mechanic_id.eq.${encodeURIComponent(mechanic.id)})`
      : `&mechanic_id=eq.${encodeURIComponent(mechanic.id)}`;
  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}${ownershipFilter}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        status,
        ...(mechanic_notes !== undefined ? { mechanic_notes } : {}),
        ...(status === 'enroute' ? { mechanic_id: mechanic.id } : {}),
      }),
    }
  );
  if (!updateResp.ok) {
    const errText = await updateResp.text();
    console.error('update-status error:', updateResp.status, errText);
    return res.status(500).json({ error: 'Failed to update booking', detail: errText });
  }
  return res.status(200).json({ ok: true });
}

async function handleMechanicParts(req, res) {
  const auth = await authMechanic(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/parts_inventory?select=*&order=category.asc,name.asc`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!resp.ok) return res.status(500).json({ error: 'Failed to load inventory' });
  return res.status(200).json(await resp.json());
}

async function handleMechanicPartsUpdate(req, res) {
  const auth = await authMechanic(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { id, stock } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  const qty = parseInt(stock, 10);
  if (!Number.isFinite(qty) || qty < 0) return res.status(400).json({ error: 'Invalid stock' });
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/parts_inventory?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ stock: qty }),
    }
  );
  if (!resp.ok) return res.status(500).json({ error: 'Failed to update stock' });
  return res.status(200).json({ ok: true });
}

async function handleMechanicMessages(req, res) {
  const auth = await authMechanic(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { booking_id } = req.body;
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  // Ownership: only on a job actually assigned to this mechanic - previously
  // any mechanic could read (or send into, below) any booking's chat by id.
  const bkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=mechanic_id&id=eq.${encodeURIComponent(booking_id)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const bk = bkResp.ok ? (await bkResp.json())?.[0] : null;
  if (!bk) return res.status(404).json({ error: 'Booking not found' });
  if (bk.mechanic_id !== auth.mechanic.id) return res.status(403).json({ error: 'Forbidden' });

  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/job_messages?select=*&booking_id=eq.${encodeURIComponent(booking_id)}&order=created_at.asc`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!resp.ok) return res.status(500).json({ error: 'Failed to load messages' });
  return res.status(200).json(await resp.json());
}

async function handleMechanicMessageSend(req, res) {
  const auth = await authMechanic(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { booking_id, message } = req.body;
  if (!booking_id || !message)
    return res.status(400).json({ error: 'booking_id and message required' });
  const msg = String(message).slice(0, 1000);
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  const bkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=mechanic_id&id=eq.${encodeURIComponent(booking_id)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const bk = bkResp.ok ? (await bkResp.json())?.[0] : null;
  if (!bk) return res.status(404).json({ error: 'Booking not found' });
  if (bk.mechanic_id !== auth.mechanic.id) return res.status(403).json({ error: 'Forbidden' });

  const resp = await fetch(`${SUPABASE_URL}/rest/v1/job_messages`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      booking_id,
      sender_role: 'mechanic',
      sender_id: auth.mechanic.id,
      message: msg,
    }),
  });
  if (!resp.ok) return res.status(500).json({ error: 'Failed to send message' });

  // Push-notify the client, if they've enabled notifications (fire-and-forget -
  // a client with no push_subscription on file just gets a no-op 404 from
  // send-push, which we don't need to react to here).
  notifyClientOfMechanicMessage(booking_id, msg, SERVICE_KEY).catch(() => {});

  return res.status(200).json({ ok: true });
}

// ── Client Chat (mirrors the mechanic handlers above) ────────────────────────
// The client side used to write straight to job_messages via the browser's
// own Supabase session (sb.from('job_messages').insert(...)), which is
// subject to RLS - unlike the mechanic side, which always went through this
// server with the service_role key. That mismatch is exactly the kind of gap
// that fails silently as "works for the mechanic, not the client": if
// job_messages has no INSERT policy for authenticated users (likely, since
// nothing else in this schema grants direct client writes to a table that
// also holds mechanic-authored content), the client's insert is denied by
// Postgres before it ever reaches application code, and Supabase surfaces
// that as a plain error with no useful detail - "Message failed to send".
async function handleClientMessages(req, res) {
  const { booking_id, access_token, client_id } = req.body;
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });
  if (!access_token || !client_id)
    return res.status(400).json({ error: 'access_token and client_id required' });
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${access_token}` },
  });
  if (!userResp.ok) return res.status(401).json({ error: 'Invalid or expired session' });
  const userData = await userResp.json();
  if (userData.id !== client_id) return res.status(403).json({ error: 'Forbidden' });

  const bkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=client_id&id=eq.${encodeURIComponent(booking_id)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const bk = bkResp.ok ? (await bkResp.json())?.[0] : null;
  if (!bk) return res.status(404).json({ error: 'Booking not found' });
  if (bk.client_id !== client_id) return res.status(403).json({ error: 'Forbidden' });

  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/job_messages?select=*&booking_id=eq.${encodeURIComponent(booking_id)}&order=created_at.asc`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!resp.ok) return res.status(500).json({ error: 'Failed to load messages' });
  return res.status(200).json(await resp.json());
}

async function handleClientMessageSend(req, res) {
  const { booking_id, access_token, client_id, message } = req.body;
  if (!booking_id || !message)
    return res.status(400).json({ error: 'booking_id and message required' });
  if (!access_token || !client_id)
    return res.status(400).json({ error: 'access_token and client_id required' });
  const msg = String(message).slice(0, 1000);
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${access_token}` },
  });
  if (!userResp.ok) return res.status(401).json({ error: 'Invalid or expired session' });
  const userData = await userResp.json();
  if (userData.id !== client_id) return res.status(403).json({ error: 'Forbidden' });

  const bkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=client_id&id=eq.${encodeURIComponent(booking_id)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const bk = bkResp.ok ? (await bkResp.json())?.[0] : null;
  if (!bk) return res.status(404).json({ error: 'Booking not found' });
  if (bk.client_id !== client_id) return res.status(403).json({ error: 'Forbidden' });

  const resp = await fetch(`${SUPABASE_URL}/rest/v1/job_messages`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ booking_id, sender_role: 'client', sender_id: client_id, message: msg }),
  });
  if (!resp.ok) return res.status(500).json({ error: 'Failed to send message' });
  return res.status(200).json({ ok: true });
}

async function notifyClientOfMechanicMessage(bookingId, message, SERVICE_KEY) {
  const bkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=client_id,service_name&id=eq.${encodeURIComponent(bookingId)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const bkData = bkResp.ok ? await bkResp.json() : [];
  const clientId = bkData?.[0]?.client_id;
  if (!clientId) return;

  const base = SELF_BASE_URL;
  await fetch(`${base}/api/send-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-token': process.env.INTERNAL_API_SECRET || '',
    },
    body: JSON.stringify({
      clientId,
      title: `Message about your ${bkData[0].service_name || 'service'}`,
      body: message.slice(0, 100),
      url: '/index.html#tracking',
      tag: 'mechanic-message',
    }),
  });
}

// The road between the mechanic and the client, for the tracking map.
//
// Diego, watching his own booking go out: "cuando estaba en ruta tampoco vio ni
// una ruta ni un tiempo ni nada... se debe ver el camino hacia el mechanico y
// la ubicacion del mechanico". Nothing was drawn because nothing had ever been
// built - grep `polyline` in js/app.js and the only hits are icons.
//
// A separate role from public-track on purpose. That one polls every 5 seconds
// to keep the status honest, and a routing call on that cadence would hammer a
// free service for a line that barely changes. The client asks for this one
// when it opens the screen and then about once a minute.
//
// Authenticated exactly like public-track: the tracking token IS the
// credential, and it never leaves the server with anything the client could not
// already see there.
async function handleTrackRoute(req, res) {
  const { tracking_token } = req.body;
  if (!tracking_token) return res.status(400).json({ error: 'tracking_token required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const filter = `tracking_token=eq.${encodeURIComponent(tracking_token)}`;

  // address_lat/address_lng come from scripts/add-address-coordinates.sql,
  // which is run by hand. Asked for tolerantly, because PostgREST rejects the
  // WHOLE query on an unknown column - the same guard handlePublicTrack uses.
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=status,van_number,mechanic_id,address_lat,address_lng&${filter}&limit=1`,
    { headers }
  );
  if (!resp.ok) return res.status(200).json({ route: null, reason: 'no-coordinates-column' });
  const rows = await resp.json();
  const booking = rows?.[0];
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  // Only while somebody is actually driving to you. A route drawn for a job
  // that is finished, or one that has not been dispatched, is a line to
  // nowhere.
  if (!['enroute', 'en_route'].includes(booking.status)) {
    return res.status(200).json({ route: null, reason: 'not-en-route' });
  }
  if (!booking.address_lat || !booking.address_lng) {
    return res.status(200).json({ route: null, reason: 'address-not-geocoded' });
  }

  const locResp = await fetch(
    `${SUPABASE_URL}/rest/v1/mechanic_locations?select=lat,lng&${
      booking.van_number
        ? `van_number=eq.${booking.van_number}`
        : `mechanic_id=eq.${encodeURIComponent(booking.mechanic_id || '')}`
    }&order=updated_at.desc&limit=1`,
    { headers }
  );
  const loc = locResp.ok ? (await locResp.json())?.[0] : null;
  if (!loc?.lat || !loc?.lng) {
    return res.status(200).json({ route: null, reason: 'no-mechanic-fix' });
  }

  const route = await drivingRouteGeometry({
    fromLat: loc.lat,
    fromLng: loc.lng,
    toLat: booking.address_lat,
    toLng: booking.address_lng,
  });

  // A missing route is a normal answer, not an error: the map keeps its markers
  // and the straight-line estimate rather than showing the client a failure.
  return res.status(200).json({ route: route || null, reason: route ? null : 'routing-failed' });
}

async function handlePublicTrack(req, res) {
  // tracking_token ONLY - it's the one credential this endpoint is meant to
  // accept (a long random UUID, unguessable). Raw booking_id used to work
  // here too, which defeated the entire point of having a separate secret
  // token: every booking already gets a tracking_token via the DB column's
  // DEFAULT gen_random_uuid() (backfilled for existing rows too when that
  // migration ran), so nothing legitimate ever needed the booking_id path -
  // it just let anyone who obtained a booking_id (e.g. via the email-lookup
  // endpoint below, before ITS fix) pull address/arrival_pin/live GPS with
  // no authentication at all.
  const { tracking_token } = req.body;
  if (!tracking_token) return res.status(400).json({ error: 'tracking_token required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const baseCols =
    'id,status,scheduled_date,scheduled_time,service_name,service_price,address,van_number,mechanic_id,mechanic_notes,parts_used,next_service_date,tracking_token,client_rating,client_review,arrival_pin';
  const filter = `tracking_token=eq.${encodeURIComponent(tracking_token)}`;
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

  // address_lat/address_lng feed the tracking page's ETA without the client's
  // browser ever having to geocode the address itself (PENDIENTES 13.1). They
  // are asked for separately-tolerantly because PostgREST 400s the WHOLE query
  // on an unknown column: until scripts/add-address-coordinates.sql has been
  // run, requesting them unconditionally would break tracking outright. One
  // request in the normal case, two only while that migration is pending.
  const get = (cols) =>
    fetch(`${SUPABASE_URL}/rest/v1/bookings?select=${cols}&${filter}&limit=1`, { headers });

  let resp = await get(baseCols + ',address_lat,address_lng');
  if (!resp.ok) {
    console.warn('[public-track] coordinate columns unavailable, falling back without ETA');
    resp = await get(baseCols);
  }
  if (!resp.ok) return res.status(500).json({ error: 'Database error' });
  const data = await resp.json();
  if (!data?.length) return res.status(404).json({ error: 'Booking not found' });
  const booking = data[0];

  // Hasta cuando vale este link. Ver api/_tracking-scope.js: un link mandado
  // por email en agosto devolvia la direccion exacta y el PIN de llegada en
  // diciembre, con el trabajo terminado hace meses.
  //
  // Se corta ACA, antes de ir a buscar la posicion del mecanico: un link
  // vencido no tiene por que costar una consulta mas.
  const scope = trackingScope(booking);
  if (scope === 'expired') {
    return res.status(410).json({
      error: 'This tracking link has expired.',
      expired: true,
    });
  }

  // Fetch mechanic location server-side (bypasses RLS on mechanic_locations)
  let mechanic_location = null;
  const isActive = ['confirmed', 'enroute', 'en_route', 'in_progress', 'arrived'].includes(
    booking.status
  );

  // PRIMARY: lookup by van_number (most reliable - keyed on van, not mechanic FK)
  if (isActive && booking.van_number) {
    const locResp = await fetch(
      `${SUPABASE_URL}/rest/v1/mechanic_locations?select=lat,lng,updated_at,van_number,mechanic_id&van_number=eq.${booking.van_number}&order=updated_at.desc&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (locResp.ok) {
      const locData = await locResp.json();
      if (locData?.length && locData[0].lat && locData[0].lng) {
        mechanic_location = {
          lat: locData[0].lat,
          lng: locData[0].lng,
          mechanic_id: locData[0].mechanic_id,
        };
      }
    }
  }

  // FALLBACK A: mechanic_id known (for old rows or when van_number not set)
  if (!mechanic_location && booking.mechanic_id) {
    const locResp = await fetch(
      `${SUPABASE_URL}/rest/v1/mechanic_locations?select=lat,lng,updated_at,mechanic_id&mechanic_id=eq.${encodeURIComponent(booking.mechanic_id)}&order=updated_at.desc&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (locResp.ok) {
      const locData = await locResp.json();
      if (locData?.length && locData[0].lat && locData[0].lng) {
        mechanic_location = {
          lat: locData[0].lat,
          lng: locData[0].lng,
          mechanic_id: locData[0].mechanic_id,
        };
      }
    }
  }

  // Removed: a third fallback used to show ANY online mechanic's location
  // (regardless of whether they were assigned to this booking) when the
  // van_number/mechanic_id lookups above found nothing. That's the exact
  // "pin shows up anywhere on the map" bug - a client would see a random
  // unrelated mechanic's position labelled "Your mechanic". If we can't
  // find the actual assigned mechanic's location, show no pin instead of
  // a wrong one.

  // Real mechanic profile (photo/bio) + real stats (rating/completed jobs) - no fabricated numbers.
  // Looked up directly by mechanic_id (the exact contact who accepted) - not by zone/role, since
  // a solo operator's escalation_contacts row may be labelled role='manager' rather than 'mechanic'.
  let mechanic_profile = null;
  if (booking.mechanic_id) {
    const profResp = await fetch(
      `${SUPABASE_URL}/rest/v1/escalation_contacts?select=first_name,last_name,photo_url,bio&id=eq.${encodeURIComponent(booking.mechanic_id)}&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (profResp.ok) {
      const profData = await profResp.json();
      if (profData?.length) {
        const p = profData[0];
        const statsResp = await fetch(
          `${SUPABASE_URL}/rest/v1/bookings?select=client_rating,client_review,client_name&mechanic_id=eq.${encodeURIComponent(booking.mechanic_id)}&status=eq.completed`,
          { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
        );
        let jobs_completed = 0,
          rating = null,
          reviews = [];
        if (statsResp.ok) {
          const jobs = await statsResp.json();
          ({ jobs_completed, rating, reviews } = aggregateMechanicStats(jobs));
        }
        mechanic_profile = {
          name: [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
          photo_url: p.photo_url || null,
          bio: p.bio || null,
          jobs_completed,
          rating,
          reviews,
        };
      }
    }
  }

  // _dbg used to ride along here: { van, mechId, active }. It was a debug aid
  // shipped to production, re-sent on every 15-second poll, and it put the
  // mechanic's internal UUID in a response that anyone holding a forwarded
  // tracking link can read. Nothing consumed it (PENDIENTES 13.10).
  //
  // The rest of the row stays: track.html and the SPA's tracking screen
  // between them read status, address, service_name, mechanic_id,
  // tracking_token and arrival_pin. arrival_pin belongs here - it is the code
  // the client reads out to the mechanic on arrival, so the client is exactly
  // who is meant to have it.
  // Pasada la ventana, el link sigue vivo - la resena se deja con el mismo
  // link - pero deja de entregar direccion, PIN y posicion. Ninguno de los tres
  // significa nada para un trabajo terminado hace semanas, y son exactamente
  // los que dolerian si el link se filtra.
  return res
    .status(200)
    .json(applyTrackingScope({ ...booking, mechanic_location, mechanic_profile }, scope));
}

// Increment uses_count on a discount/gift code after it is actually used in a booking.
// Server-side only (service key) so clients cannot self-redeem repeatedly.
async function handleConsumeCode(req, res) {
  const code = (req.body?.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'code required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Read first only to give a specific, friendly error message - the actual
  // consume below is a single atomic guarded UPDATE (consume_discount_code
  // RPC), so a second request racing this one can't also succeed: it
  // re-reads the row under lock and correctly finds it already exhausted.
  const { data: row, error } = await sb
    .from('discount_codes')
    .select('id, max_uses, uses_count, active')
    .eq('code', code)
    .single();
  if (error || !row) return res.status(404).json({ error: 'Code not found' });
  if (!row.active) return res.status(409).json({ error: 'Code no longer active' });
  if (row.max_uses && row.uses_count >= row.max_uses)
    return res.status(409).json({ error: 'Code already used' });

  const { data: consumed } = await sb.rpc('consume_discount_code', { p_code: code });
  if (!consumed || !consumed[0]) return res.status(409).json({ error: 'Code already used' });

  // Mark gift card ledger as redeemed if this was a gift card (best-effort)
  if (code.startsWith('GIFT-')) {
    await sb
      .from('gift_cards')
      .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
      .eq('code', code)
      .then(
        () => {},
        () => {}
      );
  }
  return res.status(200).json({ ok: true, remaining: consumed[0].remaining });
}

// "Forgot my tracking link" recovery. Used to hand back every tracking_token
// for the typed email directly in the response - anyone could type in
// someone else's email and get their tracking_token(s), which is the exact
// credential handlePublicTrack treats as proof of ownership (chained: their
// home address, arrival_pin, live mechanic GPS). Now mirrors the password-
// reset endpoint's anti-enumeration pattern - always the same generic
// response, actual links only ever go out via email to the address that
// was typed, never in the API response itself.
async function handlePublicBookingList(req, res) {
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Email required' });
  const cleanEmail = email.trim().toLowerCase();
  const genericOk = () => res.status(200).json({ ok: true });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!SERVICE_KEY || !process.env.RESEND_API_KEY) {
    console.error('[public-booking-list] missing SERVICE_KEY or RESEND_API_KEY');
    return genericOk();
  }

  try {
    const cols = 'service_name,scheduled_date,scheduled_time,status,tracking_token';
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/bookings?select=${cols}&client_email=eq.${encodeURIComponent(cleanEmail)}&status=neq.cancelled&order=scheduled_date.desc&limit=10`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (!resp.ok) return genericOk();
    const bookings = await resp.json();
    if (!Array.isArray(bookings) || !bookings.length) return genericOk();

    const rows = bookings
      .map(
        (b) => `
        <div style="padding:14px 0;border-top:1px solid #E2E8F0">
          <div style="font-weight:700;color:#0D1F3C;font-size:14px">${b.service_name || 'Service'}</div>
          <div style="color:#475569;font-size:13px;margin:2px 0 8px">${b.scheduled_date || ''}${b.scheduled_time ? ' · ' + b.scheduled_time : ''} · ${b.status}</div>
          <a href="https://drbikesydney.com.au/track.html?token=${b.tracking_token}" style="color:#2563EB;font-size:13px;font-weight:600">Track this booking →</a>
        </div>`
      )
      .join('');

    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
        to: [cleanEmail],
        subject: 'Your Dr. Bike Sydney booking tracking links',
        html: `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <div style="background:#2563EB;padding:32px 28px;text-align:center">
            <div style="display:inline-block;background:#fff;border-radius:14px;padding:10px 18px;margin-bottom:14px">
              <img src="https://drbikesydney.com.au/images/logo-db.png" alt="Dr. Bike Sydney" height="26" style="display:block;width:auto">
            </div>
            <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.65);letter-spacing:0.12em;text-transform:uppercase;margin-bottom:8px">Dr. Bike Sydney</div>
            <div style="font-size:22px;font-weight:800;color:#fff">Your booking links</div>
          </div>
          <div style="padding:28px">
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 8px">Here's every active booking on file for this email:</p>
            ${rows}
            <p style="color:#94A3B8;font-size:11px;margin:20px 0 0">Didn't request this? You can safely ignore this email.</p>
          </div>
          <div style="background:#F8FAFC;padding:20px 28px;text-align:center;border-top:1px solid #E2E8F0">
            <p style="font-size:12px;color:#94A3B8;margin:0 0 4px">Dr. Bike Sydney · drbikesydney.com.au · Sydney NSW</p>
            <p style="font-size:11px;color:#D1D5DB;margin:0">ABN: 87 654 025 287 · contact@drbikesydney.com.au</p>
          </div>
        </div>`,
      }),
    });
    if (!emailResp.ok)
      console.error('[public-booking-list] Resend send failed:', await emailResp.text());
  } catch (e) {
    console.error('[public-booking-list] failed:', e.message);
  }
  return genericOk();
}

// Public, aggregated roster for the landing page: every mechanic who has
// completed at least one job, with their average rating and client reviews.
async function handlePublicMechanics(req, res) {
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const hdrs = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

  // The active mechanics first. This used to run the other way round - start
  // from completed bookings, keep the mechanics who appeared in them - which
  // meant the team section was empty until the first job was finished. On a
  // brand-new business that is every visitor, forever, right up to the moment
  // the page stops needing to convince anybody.
  const contactsResp = await fetch(
    `${SUPABASE_URL}/rest/v1/escalation_contacts?select=id,first_name,last_name,photo_url,bio&active=eq.true`,
    { headers: hdrs }
  );
  if (!contactsResp.ok) return res.status(500).json({ error: 'Database error' });
  const contacts = await contactsResp.json();
  if (!contacts.length) return res.status(200).json([]);

  // Then whatever record they have, which may be none. A mechanic with no
  // completed jobs yet is still a real, background-checked person to introduce.
  const bookingsResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=mechanic_id,client_rating,client_review,client_name&status=eq.completed&mechanic_id=not.is.null`,
    { headers: hdrs }
  );
  if (!bookingsResp.ok) return res.status(500).json({ error: 'Database error' });
  const bookings = await bookingsResp.json();

  const mechanics = contacts
    .map((c) => {
      const jobs = bookings.filter((b) => b.mechanic_id === c.id);
      const { jobs_completed, rating, reviews } = aggregateMechanicStats(jobs, { maxReviews: 12 });
      return {
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(' ').trim(),
        photo_url: c.photo_url || null,
        bio: c.bio || null,
        jobs_completed,
        rating,
        reviews,
      };
    })
    .filter((m) => m.name);

  return res.status(200).json(mechanics);
}

// ── Client-preferred-mechanic (optional, admin-toggleable) ──────────────────
// Reuses the van_zones(van_number=0) sentinel-row settings pattern already
// used for business details / WhatsApp number / alert triggers, so this
// doesn't need its own settings table - see js/admin.js toggleTrigger().
const MECHANIC_PREFERENCE_WINDOW_MIN = 30;

async function isMechanicPreferenceEnabled(SERVICE_KEY) {
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/van_zones?select=postcode&van_number=eq.0&suburb=eq.__trig_mechanic_preference__`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (!resp.ok) return false;
    const rows = await resp.json();
    return rows[0]?.postcode === '1';
  } catch {
    return false;
  }
}

async function handleMechanicPreferenceStatus(req, res) {
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const enabled = await isMechanicPreferenceEnabled(SERVICE_KEY);
  return res.status(200).json({ enabled });
}

// Dos credenciales, porque hay dos clases de cliente. El razonamiento completo
// y las dos decisiones puras estan en api/_review-auth.js; aca queda solo la
// parte que habla con la base.
//
// Este endpoint no llevaba NINGUNA autenticacion en su momento: cualquiera con
// un booking_id (que ni siquiera era secreto, ver handlePublicTrack arriba)
// podia puntuar cualquier trabajo terminado.
async function handleClientReview(req, res) {
  const { booking_id, access_token, client_id, tracking_token, rating, comment, photo_base64 } =
    req.body;

  const cred = reviewCredential(req.body);
  if (cred.error) return res.status(cred.status).json({ error: cred.error });
  const byToken = cred.mode === 'token';

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  if (!byToken) {
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${access_token}` },
    });
    if (!userResp.ok) return res.status(401).json({ error: 'Invalid or expired session' });
    const userData = await userResp.json();
    if (userData.id !== client_id) return res.status(403).json({ error: 'Forbidden' });
  }

  // scheduled_date es contra lo que trackingScope() mide la edad del link; solo
  // hace falta en el camino del token, pero pedirla siempre deja una sola forma
  // de consulta.
  const filter = byToken
    ? `tracking_token=eq.${encodeURIComponent(tracking_token)}`
    : `id=eq.${encodeURIComponent(booking_id)}`;
  const checkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=id,status,client_id,client_rating,scheduled_date&${filter}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!checkResp.ok) return res.status(500).json({ error: 'Database error' });
  const rows = await checkResp.json();
  // Un token equivocado y un booking_id equivocado dan el mismo 404: la
  // respuesta no puede decirle a nadie si un token existe.
  const gate = reviewGate(rows?.[0], { mode: cred.mode, client_id });
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, ...(gate.expired && { expired: true }) });
  const booking = rows[0];

  // From here on the id comes off the row the checks above actually passed,
  // never off the request. On the token path booking_id is not a credential
  // and may be absent, stale or somebody else's; writing to it would let a
  // valid token for one booking review a different one.
  const targetId = booking.id;

  // Upload photo to Supabase Storage if provided
  let client_photo_url = null;
  if (photo_base64) {
    try {
      const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const ts = Date.now();
      const storagePath = `reviews/${targetId}/client_${ts}.jpg`;
      const storageResp = await fetch(
        `${SUPABASE_URL}/storage/v1/object/job-photos/${storagePath}`,
        {
          method: 'POST',
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'image/jpeg',
            'x-upsert': 'true',
          },
          body: buffer,
        }
      );
      if (storageResp.ok) {
        client_photo_url = `${SUPABASE_URL}/storage/v1/object/public/job-photos/${storagePath}`;
      } else {
        console.warn('[client-review] photo upload failed:', await storageResp.text());
      }
    } catch (e) {
      console.warn('[client-review] photo upload error:', e.message);
    }
  }

  const updateBody = {
    client_rating: rating,
    client_review: (comment || '').trim() || null,
    ...(client_photo_url && { client_photo_url }),
  };
  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(targetId)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(updateBody),
    }
  );
  if (!updateResp.ok) return res.status(500).json({ error: 'Failed to save review' });
  return res.status(200).json({ ok: true, photo_saved: !!client_photo_url });
}

const ALL_SLOTS = [
  '8:00 AM',
  '9:00 AM',
  '10:00 AM',
  '11:00 AM',
  '12:00 PM',
  '1:00 PM',
  '2:00 PM',
  '3:00 PM',
  '4:00 PM',
  '5:00 PM',
];

// Minutes since midnight, or -1 for anything this cannot read.
//
// Two formats arrive here and only one of them used to parse. ALL_SLOTS is
// written in 12-hour labels ("8:00 AM"), but buildBusyIntervals() feeds this
// `bookings.scheduled_time`, and that column is `time without time zone`, so
// PostgREST returns "10:00:00". The AM/PM-only regex answered -1 for every
// single one, which put each booking's busy interval at [-1, duration] - a
// window that overlaps no slot in the working day.
//
// The effect was not subtle: NO booking blocked its own hour. With one van,
// the same 10 AM slot stayed on offer to the next client, and the next.
// The unit tests never caught it because they only ever fed the 12-hour
// labels - a format that reaches this function from ALL_SLOTS but never from
// the database.
export function slotToMinutes(slot) {
  const s = String(slot ?? '').trim();

  const twelve = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (twelve) {
    let h = parseInt(twelve[1], 10);
    const min = parseInt(twelve[2], 10);
    if (h < 1 || h > 12 || min > 59) return -1;
    if (twelve[3].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (twelve[3].toUpperCase() === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  }

  // "10:00:00" (the column as PostgREST serialises it) and "14:30" (the shape
  // the reschedule endpoint validates and writes).
  const twentyFour = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (twentyFour) {
    const h = parseInt(twentyFour[1], 10);
    const min = parseInt(twentyFour[2], 10);
    const sec = twentyFour[3] === undefined ? 0 : parseInt(twentyFour[3], 10);
    if (h > 23 || min > 59 || sec > 59) return -1;
    return h * 60 + min;
  }

  return -1;
}

// A van is occupied for longer than the slot it was booked in - long services can
// run for hours. Every booking blocks its van for (service duration + this buffer),
// so the next job always has a realistic gap instead of stacking back-to-back.
export const SLOT_BUFFER_MIN = 30;
// Used when a booking's service can't be matched in the services table (renamed/
// deleted service, or a legacy row) - a full hour-slot is the safest assumption
// given ALL_SLOTS itself is on 1-hour granularity.
export const DEFAULT_SERVICE_DURATION_MIN = 60;

// Turns each existing booking into a per-van busy window in minutes-since-midnight,
// using that booking's own service duration (looked up by name) + the buffer.
//
// The trailing filter drops rows slotToMinutes cannot read. Now that it speaks
// the database's own format, that means genuinely corrupt data - and dropping
// it explicitly matters, because an interval starting at -1 covers no slot in
// the working day, so keeping it looked exactly like a booking that blocks
// nothing. Which is how this went unnoticed.
export function buildBusyIntervals(bookings, durationByService) {
  return bookings
    .filter((b) => b.scheduled_time && b.van_number)
    .map((b) => {
      const start = slotToMinutes(b.scheduled_time);
      const dur = durationByService[b.service_name] ?? DEFAULT_SERVICE_DURATION_MIN;
      return { van: b.van_number, start, end: start + dur + SLOT_BUFFER_MIN };
    })
    .filter((iv) => iv.start >= 0);
}

// A slot is bookable if AT LEAST ONE van has no busy interval overlapping the
// full window the new booking would occupy (its own duration + buffer) - not
// just a free slot at the start time, which is what the old van-count-only
// check effectively assumed.
// How long one row of `availability` takes a van off the road. The admin blocks
// on the half hour, so that is the unit.
export const BLOCK_SLOT_MIN = 30;

// The blocks Diego set for a day, as busy intervals - the same shape a booking
// produces, so one overlap check covers both.
//
// This used to be a Set of raw `time_slot` strings compared against ALL_SLOTS
// ("8:00 AM"), while the admin writes 24-hour half hours ("8:30"). No string
// ever matched, so no block ever blocked anything (PENDIENTES 21). Comparing in
// minutes fixes that AND makes a half-hour block mean something: a block at
// 8:30 collides with the 8:00 job that would still be running through it.
//
// van_number 0 is "all vans" - the same sentinel van_zones already uses.
export function buildBlockIntervals(overrides, vans) {
  const out = [];
  for (const row of overrides || []) {
    if (row.available !== false) continue;
    const start = slotToMinutes(row.time_slot);
    if (start < 0) continue;
    const end = start + BLOCK_SLOT_MIN;
    const van = Number(row.van_number);
    // A row with no van, or van 0, takes every van out.
    const targets = !van ? vans : [van];
    for (const v of targets) out.push({ van: v, start, end });
  }
  return out;
}

// handleGetAvailability computes this same clash to decide what the client
// sees, but that check is per date - it says a slot is on offer if AT LEAST
// ONE van is free, so blocking van 1 alone never removes the slot from a
// two-van fleet's display. handleCreateBooking already knows which SPECIFIC
// van the address belongs to (matchVanZone), so this checks that one van,
// not "any van" - the actual guarantee a block is supposed to give the
// person who blocked their own schedule. Before this, saveBlocks()/
// unblockDate() only ever fed the display list; nothing stopped a booking
// against a blocked slot server-side (docs/PENDIENTES.md 21.8).
export function isSlotBlocked(blockRows, vanNumber, timeSlot, neededMin) {
  const start = slotToMinutes(timeSlot);
  if (start < 0) return false;
  const end = start + neededMin;
  return buildBlockIntervals(blockRows, [vanNumber]).some(
    (iv) => iv.van === vanNumber && start < iv.end && iv.start < end
  );
}

export function computeAvailableSlots({
  allSlots,
  vans,
  busyIntervals,
  neededMin,
  blockIntervals,
  isToday,
  nowMin,
}) {
  const blocks = blockIntervals || [];
  return allSlots.map((time) => {
    const slotMin = slotToMinutes(time);
    const slotEnd = slotMin + neededMin;
    const clashes = (intervals, van) =>
      intervals.some((iv) => iv.van === van && slotMin < iv.end && iv.start < slotEnd);
    // A slot is on offer if AT LEAST ONE van is free of both bookings and
    // blocks for the whole window the job would occupy.
    let available = vans.some((van) => !clashes(busyIntervals, van) && !clashes(blocks, van));
    if (isToday && slotMin < nowMin) available = false;
    return { time, available };
  });
}

async function handleGetAvailability(req, res) {
  // Read-only query, no body - the client (js/supabase.js getAvailableSlots)
  // has always sent a plain GET with ?date= in the query string. guard()
  // defaults to requiring POST when no method is given, which made every
  // real call 405 (see tests/unit/get-availability-method.test.js).
  if (await guard(req, res, { method: 'GET', rateMax: 120, rateWindow: 60000 })) return;
  const date = req.query?.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });
  const serviceId = req.query?.serviceId || null;

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  const [{ data: bookings }, { data: overrides }, { data: vzrows }, { data: services }] =
    await Promise.all([
      sb
        .from('bookings')
        // created_at + stripe_payment_intent_id are what tell a live booking
        // apart from an abandoned hold. Both already exist on the table -
        // checked against the live schema on 2026-08-31 - so this select does
        // not depend on a migration having been run (CLAUDE.md: PostgREST
        // rejects the WHOLE query on an unknown column).
        .select(
          'id,scheduled_time,van_number,service_name,status,created_at,stripe_payment_intent_id'
        )
        .eq('scheduled_date', date)
        .in('status', ['pending', 'confirmed', 'enroute', 'in_progress', 'arrived']),
      // van_number too: a block is per van (0 = all of them), and reading only
      // the slot made one van's day off close the day for both.
      sb.from('availability').select('time_slot, available, van_number').eq('date', date),
      sb.from('van_zones').select('van_number').neq('van_number', 0),
      sb.from('services').select('id,name,duration_max'),
    ]);
  const vans = [...new Set((vzrows || []).map((r) => r.van_number))];
  if (!vans.length) vans.push(1); // never advertise zero capacity if van_zones is misconfigured

  const durationByService = {};
  for (const s of services || []) {
    if (s.name) durationByService[s.name] = s.duration_max || DEFAULT_SERVICE_DURATION_MIN;
  }
  const requestedService = (services || []).find((s) => String(s.id) === String(serviceId));
  const neededMin =
    (requestedService?.duration_max || DEFAULT_SERVICE_DURATION_MIN) + SLOT_BUFFER_MIN;

  // A hold is a booking that has not been paid for yet. An ABANDONED one
  // must stop blocking its slot, or every client who changes their mind at
  // the payment screen permanently retires a sellable hour.
  //
  // Expiry is lazy because it has to be: the window is 15 minutes and Vercel
  // Hobby refuses crons more frequent than daily (see the deploy error quoted
  // at the top of api/send-cron.js). Nothing here waits for a background job.
  const liveBookings = occupiedBookings(bookings || []);
  const busyIntervals = buildBusyIntervals(liveBookings, durationByService);
  const blockIntervals = buildBlockIntervals(overrides, vans);

  const nowSydney = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(
    new Date()
  );
  const isToday = date === todayStr;
  const nowMin = nowSydney.getHours() * 60 + nowSydney.getMinutes() + 120;

  const slots = computeAvailableSlots({
    allSlots: ALL_SLOTS,
    vans,
    busyIntervals,
    neededMin,
    blockIntervals,
    isToday,
    nowMin,
  });

  res.setHeader('Cache-Control', 'no-store, no-cache');
  return res.status(200).json(slots);
}

// ── Google Calendar OAuth (see api/_google-calendar.js) ─────────────────────────
// Both roles are reached via vercel.json rewrites (/api/google-calendar-connect,
// /api/google-calendar-callback) rather than their own files, to stay under
// Vercel's Hobby-plan 12-serverless-function limit - adding 2 more standalone
// route files pushed this project's deployment over that cap.
// Both OAuth routes used to be completely unauthenticated. Anyone who hit
// /api/google-calendar-connect could complete the flow with their own Google
// account, and the callback saved whatever refresh token came back - silently
// repointing every future booking sync (client name, address, phone, time) at
// a stranger's calendar. No login required.
//
// The connect route is a browser redirect, so it can't carry a POST body. It
// now needs a short-lived ticket that only an authenticated admin can mint,
// and that same ticket travels through Google as the OAuth `state` so the
// callback can prove the flow it is completing is the one an admin started.
const CAL_TICKET_TTL_MS = 5 * 60 * 1000;

function makeCalendarTicket() {
  const secret = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '';
  const payload = b64url(JSON.stringify({ cal: 1, exp: Date.now() + CAL_TICKET_TTL_MS }));
  const sig = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
  return `${payload}.${sig}`;
}

function verifyCalendarTicket(ticket) {
  try {
    const secret = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '';
    const [payload, sig] = String(ticket || '').split('.');
    if (!payload || !sig) return false;
    const expected = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const data = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
    );
    return data.cal === 1 && !!data.exp && Date.now() <= data.exp;
  } catch {
    return false;
  }
}

// Admin-only: mints the ticket the connect redirect needs.
async function handleGoogleCalendarTicket(req, res) {
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const auth = await verifyAdminSession(req.body?.access_token, SERVICE_KEY);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  return res.status(200).json({ ticket: makeCalendarTicket() });
}

async function handleGoogleCalendarConnect(req, res) {
  if (!isGoogleCalendarConfigured()) {
    return res
      .status(503)
      .send('Google Calendar is not configured yet (missing Client ID/Secret).');
  }
  if (!verifyCalendarTicket(req.query?.ticket)) {
    return res
      .status(403)
      .send('This link is invalid or has expired. Start again from Admin > Settings.');
  }
  const redirectUri = `https://${req.headers.host}/api/google-calendar-callback`;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent', // forces a refresh_token even if this account connected before
    scope: 'https://www.googleapis.com/auth/calendar',
    state: req.query.ticket,
  });
  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  return res.end();
}

async function handleGoogleCalendarCallback(req, res) {
  const code = req.query?.code;
  const err = req.query?.error;
  if (err || !code || !isGoogleCalendarConfigured()) {
    res.writeHead(302, { Location: '/admin.html?page=settings&calendar=error' });
    return res.end();
  }
  // Without this the callback would save a refresh token from any OAuth flow
  // that reached it, not just one an admin started.
  if (!verifyCalendarTicket(req.query?.state)) {
    console.error('[google-calendar-callback] rejected: missing or expired state ticket');
    res.writeHead(302, { Location: '/admin.html?page=settings&calendar=error' });
    return res.end();
  }
  try {
    const redirectUri = `https://${req.headers.host}/api/google-calendar-callback`;
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
        client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.refresh_token) {
      console.error('[google-calendar-callback] token exchange failed:', data);
      res.writeHead(302, { Location: '/admin.html?page=settings&calendar=error' });
      return res.end();
    }
    await saveGoogleRefreshToken(data.refresh_token);
    res.writeHead(302, { Location: '/admin.html?page=settings&calendar=connected' });
    return res.end();
  } catch (e) {
    console.error('[google-calendar-callback] error:', e.message);
    res.writeHead(302, { Location: '/admin.html?page=settings&calendar=error' });
    return res.end();
  }
}

// The VAPID public key is safe to expose (it's the whole point of the
// public/private keypair) but has no other way to reach a no-build-step
// static client, so it's served from here rather than hardcoded in js/app.js.
async function handleVapidPublicKey(req, res) {
  return res.status(200).json({ key: process.env.VAPID_PUBLIC_KEY || null });
}

// ── Claims (warranty/complaint reports) ─────────────────────────────────────
// Public submit endpoint + admin-only list/update. The claims table has RLS
// with no public policies - everything goes through here with the service key,
// same pattern as the admin services CRUD below.
async function handleSubmitClaim(req, res) {
  const { name, email, phone, service_date, description, invoice_base64, photos_base64 } =
    req.body || {};
  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '')
    .trim()
    .toLowerCase();
  const cleanDesc = String(description || '')
    .trim()
    .slice(0, 2000);
  if (!cleanName || !cleanDesc)
    return res.status(400).json({ error: 'Name and description are required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))
    return res.status(400).json({ error: 'A valid email is required' });
  if (service_date && !/^\d{4}-\d{2}-\d{2}$/.test(service_date))
    return res.status(400).json({ error: 'Invalid service date' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const ts = Date.now();

  // Photos arrive as client-side-compressed base64 JPEGs (claims.html caps
  // them at 1280px), max 3 + optional invoice screenshot, each <= ~1.5MB
  // decoded so the whole request stays under Vercel's body limit.
  async function uploadB64(b64, label, idx) {
    try {
      const data = String(b64).replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(data, 'base64');
      if (buffer.length > 1_500_000) return null;
      const path = `claims/${ts}/${label}_${idx}.jpg`;
      const up = await fetch(`${SUPABASE_URL}/storage/v1/object/job-photos/${path}`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'image/jpeg',
          'x-upsert': 'true',
        },
        body: buffer,
      });
      return up.ok ? `${SUPABASE_URL}/storage/v1/object/public/job-photos/${path}` : null;
    } catch {
      return null;
    }
  }

  const photoUrls = [];
  for (const [i, p] of (Array.isArray(photos_base64) ? photos_base64.slice(0, 3) : []).entries()) {
    const url = await uploadB64(p, 'photo', i);
    if (url) photoUrls.push(url);
  }
  const invoiceUrl = invoice_base64 ? await uploadB64(invoice_base64, 'invoice', 0) : null;

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: claim, error } = await sb
    .from('claims')
    .insert({
      client_name: cleanName,
      client_email: cleanEmail,
      phone: String(phone || '').trim() || null,
      service_date: service_date || null,
      description: cleanDesc,
      photo_urls: photoUrls,
      invoice_url: invoiceUrl,
      status: 'new',
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: 'Could not submit claim: ' + error.message });

  // Heads-up email to Diego (fire-and-forget, same direct-Resend pattern as
  // notifyWaitlist) so a claim never sits unseen until he opens Admin.
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (RESEND_KEY) {
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
        to: ['peredo.dm@gmail.com'],
        subject: `New claim from ${cleanName}`,
        html: `<p><strong>${cleanName}</strong> (${cleanEmail}) submitted a claim${service_date ? ` for a service on ${service_date}` : ''}.</p><p>${cleanDesc.replace(/</g, '&lt;')}</p><p>Review it in <a href="https://drbikesydney.com.au/admin.html">Admin &gt; Claims</a>.</p>`,
      }),
    }).catch(() => {});
  }

  return res.status(200).json({ ok: true, id: claim.id });
}

// Generates (or resets) a mechanic's login PIN for mechanic.html. The admin
// UI has always been able to add a name/phone/zone to escalation_contacts,
// but never a PIN - pin_hash is an HMAC keyed on the service key (see
// hashPin above), which the admin panel's browser client (anon key only)
// cannot compute itself. This is the one server hop needed to onboard a
// new mechanic without Diego running SQL by hand. The plaintext PIN is
// returned exactly once, in this response, for the admin to hand to the
// mechanic - it is never stored or retrievable again after this call.
export async function handleAdminSetMechanicPin(req, res) {
  const { access_token, contact_id, pin } = req.body || {};
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const auth = await verifyAdminSession(access_token, SERVICE_KEY);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!contact_id) return res.status(400).json({ error: 'contact_id required' });

  // Six digits, not four (2026-09-01). The mechanic login sends ONLY a PIN -
  // there is no username to attribute a failed attempt to - so the whole
  // namespace is one shared secret and its size is the defence. Four digits is
  // 10k combinations: against the per-IP lockout (5 tries / 15 min) an attacker
  // spread over ~100 addresses exhausts that in hours. Six digits is 1M, which
  // turns those hours into weeks.
  //
  // crypto.randomInt, not Math.random: Math.random is not meant to be
  // unguessable, which is exactly wrong for a credential. (The arrival PIN
  // already uses crypto.randomInt.)
  //
  // Login still ACCEPTS 4+ digits on purpose - see authMechanic. PINs issued
  // before today are stored as a one-way hash, so their length cannot be read
  // back and they cannot be migrated automatically; they keep working until
  // Diego reissues them from Admin. Reissuing every mechanic is what actually
  // retires the 4-digit ones.
  const finalPin = pin ? String(pin).trim() : String(crypto.randomInt(100000, 1000000));
  if (!/^\d{6}$/.test(finalPin)) return res.status(400).json({ error: 'PIN must be 6 digits' });

  // Only pin_hash. This also wrote `pin: null` to clear a legacy plaintext
  // column - but that column DOES NOT EXIST in this database. Verified against
  // production 2026-09-03: a `where pin is not null` on escalation_contacts
  // fails with `42703: column "pin" does not exist`. PostgREST rejects a write
  // naming an unknown column, so the `pin: null` turned every Reset PIN into a
  // 500. The button could not have worked for anyone, whatever their role.
  const { error } = await auth.sb
    .from('escalation_contacts')
    .update({ pin_hash: hashPin(finalPin) })
    .eq('id', contact_id);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, pin: finalPin });
}

// Payments Stripe took that no booking ever claimed, over a date range Diego
// picks. Read-only: it never refunds and never writes to Stripe. Giving money
// back stays a decision made by hand, in Stripe's own dashboard, one payment at
// a time - see PENDIENTES section 14 for why this exists.
async function handleAdminOrphanAudit(req, res) {
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const auth = await verifyAdminSession(req.body?.access_token, SERVICE_KEY);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!process.env.STRIPE_SECRET_KEY)
    return res.status(503).json({ error: 'Stripe is not configured on this deployment' });

  const from = String(req.body?.from || '');
  const to = String(req.body?.to || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    return res.status(400).json({ error: 'from and to must be YYYY-MM-DD' });

  // Inclusive of the whole `to` day, so picking the same date twice reads as
  // "that day" rather than as an empty range.
  const fromSeconds = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000);
  const toSeconds = Math.floor(new Date(`${to}T23:59:59Z`).getTime() / 1000);
  if (!Number.isFinite(fromSeconds) || !Number.isFinite(toSeconds) || toSeconds < fromSeconds)
    return res.status(400).json({ error: 'Invalid date range' });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const result = await auditOrphanPayments({
      stripe,
      sb: auth.sb,
      fromSeconds,
      toSeconds,
    });
    return res.status(200).json({ from, to, ...result });
  } catch (e) {
    console.error('[admin-orphan-audit]', e.message);
    return res.status(502).json({ error: e.message });
  }
}

async function handleAdminClaimsList(req, res) {
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const auth = await verifyAdminSession(req.body?.access_token, SERVICE_KEY);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { data, error } = await auth.sb
    .from('claims')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(data || []);
}

async function handleAdminClaimsUpdate(req, res) {
  const { access_token, id, status, resolution_notes } = req.body || {};
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const auth = await verifyAdminSession(access_token, SERVICE_KEY);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!id) return res.status(400).json({ error: 'id required' });
  if (!['new', 'reviewing', 'resolved', 'rejected'].includes(status))
    return res.status(400).json({ error: 'Invalid status' });
  const { error } = await auth.sb
    .from('claims')
    .update({ status, resolution_notes: String(resolution_notes || '').slice(0, 2000) || null })
    .eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}

// ── Admin: Services CRUD (server-authoritative, bypasses RLS via service key) ──
// The admin client uses the anon key for reads; writes go through here instead
// of direct sb.from('services') calls so they don't silently no-op under RLS.
export function isAdminEmail(email) {
  return ADMIN_ALLOWED_EMAILS.includes(
    String(email || '')
      .toLowerCase()
      .trim()
  );
}

async function verifyAdminSession(access_token, SERVICE_KEY) {
  if (!access_token) return { error: 'Sign in required', status: 401 };
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const {
    data: { user },
    error: uErr,
  } = await sb.auth.getUser(access_token);
  if (uErr || !user) return { error: 'Invalid session', status: 401 };
  // A valid Supabase session alone isn't enough - any signed-up client has one.
  // Only emails on the admin allowlist may use admin-* roles (same check the
  // admin login flow itself uses).
  if (!isAdminEmail(user.email)) return { error: 'Not authorized', status: 403 };
  return { sb, user };
}

// Cleans up a booking's synced calendar event after an admin-side cancel
// (admin.js's confirmCancel() cancels the booking directly via the browser
// Supabase client, so this is the one server hop needed to reach the Google
// Calendar credentials, which must never be exposed client-side).
async function handleAdminDeleteCalendarEvent(req, res) {
  const { access_token, event_id } = req.body;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const auth = await verifyAdminSession(access_token, SERVICE_KEY);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!event_id) return res.status(400).json({ error: 'event_id required' });
  const ok = await deleteCalendarEvent(event_id);
  return res.status(200).json({ ok });
}

async function handleAdminServicesSave(req, res) {
  const { access_token, id, name, category, price, duration_min, duration_max, description } =
    req.body;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const auth = await verifyAdminSession(access_token, SERVICE_KEY);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const cleanName = String(name || '').trim();
  if (!cleanName) return res.status(400).json({ error: 'Service name is required' });
  const cleanPrice = Number(price);
  if (!Number.isFinite(cleanPrice) || cleanPrice < 0)
    return res.status(400).json({ error: 'Valid price is required' });

  const payload = {
    name: cleanName,
    category: category || 'General & assembly',
    price: cleanPrice,
    duration_min: duration_min === '' || duration_min === null ? null : parseInt(duration_min),
    duration_max: duration_max === '' || duration_max === null ? null : parseInt(duration_max),
    description: description ? String(description).trim() : null,
  };

  const { data, error } = id
    ? await auth.sb.from('services').update(payload).eq('id', id).select().maybeSingle()
    : await auth.sb.from('services').insert(payload).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ service: data });
}

// ── Admin: manual booking (docs/PENDIENTES.md 25.5, item 5 de la lista) ──────
// Para un cliente que llama por telefono - hoy la unica forma de entrar una
// reserva era pagar online con la wizard del cliente. No cobra: el mecanico
// cobra al terminar (mismo patron que cash_settled_at, ya en produccion), asi
// que no hace falta Stripe aca. Precio SIEMPRE sale del catalogo, nunca
// escrito a mano - la leccion de siempre en este proyecto (CLAUDE.md, precio
// del 2026-07-22).
async function handleAdminCreateBooking(req, res) {
  const {
    access_token,
    client_name,
    client_phone,
    client_email,
    service_id,
    scheduled_date,
    scheduled_time,
    address,
    van_number, // optional override - if omitted, resolved from the address
  } = req.body;

  if (
    !client_name ||
    !client_phone ||
    !service_id ||
    !scheduled_date ||
    !scheduled_time ||
    !address
  )
    return res.status(400).json({
      error:
        'client_name, client_phone, service_id, scheduled_date, scheduled_time, address required',
    });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduled_date))
    return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD)' });
  if (!/^\d{2}:\d{2}$/.test(scheduled_time))
    return res.status(400).json({ error: 'Invalid time format (HH:MM)' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const auth = await verifyAdminSession(access_token, SERVICE_KEY);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const { data: svc } = await auth.sb
    .from('services')
    .select('id,name,price,duration_max')
    .eq('id', service_id)
    .maybeSingle();
  if (!svc) return res.status(400).json({ error: 'Unknown service' });

  // Never refuse an admin's own booking over zones. This is the path Diego
  // uses to enter a job he already agreed to by phone or WhatsApp - including
  // the out-of-perimeter ones the quote flow sends him, which by definition
  // match no zone. It used to reject those and tell him to pick a van
  // manually, adding friction to the exact flow that exists to rescue them.
  const vanNumber = van_number ? Number(van_number) : (await matchVanZone(auth.sb, address)) || 1;

  const neededMin = (svc.duration_max || DEFAULT_SERVICE_DURATION_MIN) + SLOT_BUFFER_MIN;
  const { data: blockRows } = await auth.sb
    .from('availability')
    .select('time_slot,available,van_number')
    .eq('date', scheduled_date);
  if (isSlotBlocked(blockRows, vanNumber, scheduled_time, neededMin))
    return res.status(409).json({ error: 'That time is not available for this van.' });

  const servicePrice = applySurcharge(Number(svc.price), scheduled_date);

  // Authoritative visit & diagnosis fee, from the same calculator every other path
  // uses. This comment used to claim it was "the same lookup
  // handleCreateBooking uses" - it had not been for a while.
  //
  // An address Diego types by hand is exactly the kind that fails to resolve
  // (a shorthand, a building name, a new street). It records $0 rather than
  // inventing a number, and says so in the log so it can be corrected in the
  // dashboard instead of quietly billing the wrong amount.
  const { fee: adminFee } = await calloutFeeForAddress(address, scheduled_date);
  if (adminFee === null) {
    console.warn('[admin-create-booking] no fee could be resolved, recording $0:', address);
  }
  const calloutFee = adminFee ?? 0;

  const { data: booking, error: insErr } = await auth.sb
    .from('bookings')
    .insert([
      {
        client_name: String(client_name).trim(),
        client_phone: String(client_phone).trim(),
        client_email: client_email ? String(client_email).trim() : null,
        service_name: svc.name,
        service_price: servicePrice,
        callout_fee: calloutFee,
        scheduled_date,
        scheduled_time,
        address: String(address).trim(),
        status: 'confirmed', // an admin deliberately booking it, not a self-service pending one
        van_number: vanNumber,
      },
    ])
    .select()
    .single();

  if (insErr) {
    if (insErr.code === '23505')
      return res.status(409).json({ error: 'That time was just taken by another booking.' });
    return res.status(500).json({ error: 'Could not create booking', detail: insErr.message });
  }

  // Best-effort, same "loud, not silent" rule as the rest of this file - a
  // booking that exists but whose confirmation email failed is recoverable
  // (2026-08-05 incident), a booking request that just vanishes is not.
  if (booking.client_email) {
    fetch(`${SELF_BASE_URL}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: booking.client_email,
        name: booking.client_name,
        service: booking.service_name,
        date: booking.scheduled_date,
        time: booking.scheduled_time,
        address: booking.address,
        price: servicePrice + calloutFee,
        bookingId: booking.id,
        type: 'confirmation',
        lang: 'en',
      }),
    }).catch((e) => console.error('[admin-create-booking] confirmation email failed:', e.message));
  }

  return res.status(200).json({ booking });
}

// ── Admin: Expenses ─────────────────────────────────────────────────────────
// The table is RLS-on with no policy, so nothing but the service role can read
// it - which is why these three exist rather than the panel querying Supabase
// directly the way it does for bookings (scripts/add-expenses-table.sql).
const EXPENSE_CATEGORIES = [
  'payroll',
  'fleet',
  'insurance',
  'marketing',
  'software',
  'parts',
  'other',
];

async function handleAdminExpensesList(req, res) {
  const { access_token } = req.body || {};
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const auth = await verifyAdminSession(access_token, SERVICE_KEY);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const { data, error } = await auth.sb
    .from('expenses')
    .select('id, spent_on, description, amount, category, recurring_monthly, notes')
    .order('spent_on', { ascending: false })
    .limit(500);
  if (error) {
    // 42P01 = undefined_table. "The migration has not been run" is a different
    // answer from "you have not spent anything", and the screen says which.
    const missing = error.code === '42P01' || /does not exist/i.test(error.message || '');
    return res.status(200).json({
      available: false,
      reason: missing
        ? 'Table expenses does not exist yet - run scripts/add-expenses-table.sql'
        : error.message,
    });
  }
  return res.status(200).json({ available: true, expenses: data || [] });
}

async function handleAdminExpensesSave(req, res) {
  const { access_token, id, spent_on, description, amount, category, recurring_monthly, notes } =
    req.body || {};
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const auth = await verifyAdminSession(access_token, SERVICE_KEY);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const cleanDesc = String(description || '').trim();
  if (!cleanDesc) return res.status(400).json({ error: 'A description is required' });
  const cleanAmount = Number(amount);
  // > 0, not >= 0: a zero-dollar expense is a typo, and it would sit in the P&L
  // looking like a real line.
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0)
    return res.status(400).json({ error: 'Amount must be a number greater than zero' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(spent_on || '')))
    return res.status(400).json({ error: 'A date (YYYY-MM-DD) is required' });

  const payload = {
    spent_on,
    description: cleanDesc,
    amount: Math.round(cleanAmount * 100) / 100,
    category: EXPENSE_CATEGORIES.includes(category) ? category : 'other',
    recurring_monthly: !!recurring_monthly,
    notes: notes ? String(notes).trim() : null,
  };

  const { data, error } = id
    ? await auth.sb.from('expenses').update(payload).eq('id', id).select().maybeSingle()
    : await auth.sb.from('expenses').insert(payload).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ expense: data });
}

async function handleAdminExpensesDelete(req, res) {
  const { access_token, id } = req.body || {};
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const auth = await verifyAdminSession(access_token, SERVICE_KEY);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!id) return res.status(400).json({ error: 'Expense id is required' });

  const { error } = await auth.sb.from('expenses').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true });
}

async function handleAdminServicesDelete(req, res) {
  const { access_token, id } = req.body;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const auth = await verifyAdminSession(access_token, SERVICE_KEY);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!id) return res.status(400).json({ error: 'Service id is required' });

  const { error } = await auth.sb.from('services').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true });
}

// ── Admin: Analytics (?role=admin-analytics, reachable as /api/analytics) ────
// Two things the Analytics screen cannot get from the browser:
//
//  1. `checkout_attempts` - RLS scopes it to `auth.uid() = client_id`, so an
//     admin session reads zero rows no matter how many exist. Only the service
//     role sees the table, which means only this file can count it.
//  2. PostHog - the Personal API Key reads every event of the business. It is
//     read here from the environment and never sent to the browser.
//
// Lives in auth.js rather than its own api/analytics.js because the Hobby plan
// caps a deployment at 12 Serverless Functions and /api is already at 12 (same
// reason api/chat.js carries reviews and api/send-message.js carries eta). The
// vercel.json rewrite gives it the clean /api/analytics URL anyway.
async function handleAdminAnalytics(req, res) {
  const { access_token } = req.body || {};
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const auth = await verifyAdminSession(access_token, SERVICE_KEY);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const days = Math.min(Math.max(parseInt(req.body?.days, 10) || 30, 1), 730);

  // allSettled-style independence: reconciliation talks to Stripe, and a slow
  // or down Stripe must not take the traffic card with it.
  const [checkout, traffic, recon] = await Promise.all([
    readCheckoutAttempts(auth.sb),
    readPostHog(days),
    readReconciliation(auth.sb, days).catch((e) => ({ days, error: e.message })),
  ]);
  return res.status(200).json({ checkout, traffic, recon });
}

// A snapshot, NOT a running total: js/app.js upserts one row per client when
// the payment screen opens and deletes it once the booking exists. So this
// answers "who is sitting on an unpaid checkout right now", and an empty table
// is the healthy state, not a broken one. Anything that framed it as an
// abandonment *rate* would be inventing the denominator - the paid ones are
// already gone.
//
// Deliberately returns no address and no client id: the screen only ever shows
// counts, and the row holds where somebody lives.
async function readCheckoutAttempts(sb) {
  const { data, error } = await sb
    .from('checkout_attempts')
    .select('service_name, service_price, reached_payment_at, reminder_sent_at')
    .order('reached_payment_at', { ascending: false })
    .limit(500);

  if (error) {
    // 42P01 = undefined_table: the migration has not been run yet. That is a
    // different answer from "nobody abandoned", and the screen says so.
    const missing = error.code === '42P01' || /does not exist/i.test(error.message || '');
    return {
      available: false,
      reason: missing
        ? 'Table checkout_attempts does not exist yet - run scripts/add-checkout-attempts.sql'
        : error.message,
    };
  }

  const rows = data || [];
  const now = Date.now();
  const ages = rows
    .map((r) => (r.reached_payment_at ? (now - new Date(r.reached_payment_at)) / 3600000 : null))
    .filter((h) => Number.isFinite(h));

  return {
    available: true,
    open: rows.length,
    reminded: rows.filter((r) => r.reminder_sent_at).length,
    oldest_hours: ages.length ? Math.round(Math.max(...ages)) : null,
    value: rows.reduce((s, r) => s + (Number(r.service_price) || 0), 0),
    by_service: Object.entries(
      rows.reduce((acc, r) => {
        const k = r.service_name || 'Unspecified';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {})
    )
      .map(([name, n]) => ({ name, n }))
      .sort((a, b) => b.n - a.n),
  };
}

// ── Reconciliation: three sources, one date range ────────────────────────────
// The funnel is a BROWSER measurement, and the browser is not the system of
// record. `booking_completed` fires from js/app.js after the payment returns;
// if the client closes the tab first - or the Stripe webhook writes the row
// server-side - the booking exists and the event never leaves the page.
//
// That is exactly how the Analytics screen came to show "0 bookings" above a
// funnel where 5 people reached payment, while the orphan audit found SIX real
// charges in an overlapping window with five bookings behind them. Three
// numbers, three sources, and no screen that put them side by side.
//
// So this asks all three for the same window and reports the gaps by name
// rather than picking a winner:
//   PostHog          - intent    (how many reached the payment screen)
//   Stripe           - money     (how many charges actually succeeded)
//   bookings table   - the truth (how many rows were actually written)
//
// It reads. It never writes and never refunds.
//
// The Stripe half calls auditOrphanPayments() - the SAME function the daily
// cron and the Orphan Payments screen use - rather than listing payments here.
// A second definition of "orphan" would drift from those two and the screens
// would start contradicting each other. It also already solves two things a
// fresh implementation gets wrong: it pages through Stripe, and it chunks the
// id lookup, because a month of ids in one `in.()` makes a URL long enough to
// be rejected - and a rejected lookup reports EVERY payment as an orphan.
const RECON_MAX_STRIPE_PAGES = 5; // 100 per page — see the note at the call

async function readReconciliation(sb, days) {
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString();
  const out = { days };

  // 1. What was actually written. Service role, so RLS hides nothing.
  const counted = async (q) => {
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  };
  try {
    out.bookings = await counted(
      sb.from('bookings').select('id', { count: 'exact', head: true }).gte('created_at', sinceIso)
    );
    out.bookings_paid = await counted(
      sb
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sinceIso)
        .not('stripe_payment_intent_id', 'is', null)
    );
  } catch (e) {
    out.bookings = null;
    out.bookings_error = e.message;
  }

  // 2. What Stripe charged, and how much of it has a booking behind it.
  if (!process.env.STRIPE_SECRET_KEY) {
    out.stripe_error = 'STRIPE_SECRET_KEY is not set in Vercel';
    return out;
  }
  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const audit = await auditOrphanPayments({
      stripe: new Stripe(process.env.STRIPE_SECRET_KEY),
      sb,
      fromSeconds: nowSeconds - days * 86400,
      toSeconds: nowSeconds,
      nowSeconds,
      // A BOUND OF ITS OWN, for the same reason POSTHOG_TIMEOUT_MS exists a few
      // lines down: this shares one Vercel function with the PostHog half and
      // the checkout card, and the function has a hard timeout. The default 20
      // pages is 2000 payments and an unbounded number of round trips to
      // Stripe - fine on the Orphan Payments screen, which is a screen of its
      // own, but here a long range ("All time" sends 730 days) could burn the
      // budget and take the traffic card down with it. Five pages is 500
      // payments; past that `truncated` says so on screen instead of the whole
      // card failing.
      maxPages: RECON_MAX_STRIPE_PAGES,
    });
    out.payments_checked = audit.checked;
    out.orphans = audit.orphans.length;
    out.orphans_value = audit.total;
    // Said out loud rather than quietly returning a number that is too low.
    out.truncated = audit.truncated;
  } catch (e) {
    out.stripe_error = e.message;
  }
  return out;
}

// ── PostHog (traffic half) ───────────────────────────────────────────────────
// Verified live on 2026-08-02: with both env vars set, all eight queries came
// back on the first run - 143 visitors, 528 views, the booking-step funnel and
// the CTA breakdown all rendered. What that run also exposed is that the
// project was recording our own dev traffic; see the $host filter below.
//
// Needs both:
//   POSTHOG_API_KEY     - Personal API Key (phx_...), scope "Query: read"
//   POSTHOG_PROJECT_ID  - numeric project id from the PostHog URL
const POSTHOG_HOST = 'https://eu.posthog.com';

// Anything PostHog says back is echoed to the admin's browser, so scrub
// anything key-shaped out of it first. PostHog does not echo the key today,
// but an error string is not the place to find out it started to.
function scrubKeys(text) {
  return String(text).replace(/\b(ph[a-z]_)[A-Za-z0-9_-]+/g, '$1[redacted]');
}

// The whole endpoint runs inside one Vercel function with a hard timeout, and
// checkout_attempts shares it. Without a bound of its own, a slow PostHog
// would take the unpaid-checkouts card down with it.
const POSTHOG_TIMEOUT_MS = 6000;

async function hogQuery(sql, key, projectId) {
  const r = await fetch(`${POSTHOG_HOST}/api/projects/${projectId}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: sql } }),
    signal: AbortSignal.timeout(POSTHOG_TIMEOUT_MS),
  });
  if (!r.ok)
    throw new Error(`PostHog HTTP ${r.status}: ${scrubKeys((await r.text()).slice(0, 200))}`);
  const json = await r.json();
  return json.results || [];
}

async function readPostHog(days) {
  const key = process.env.POSTHOG_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!key || !projectId) {
    return {
      configured: false,
      reason:
        !key && !projectId
          ? 'POSTHOG_API_KEY and POSTHOG_PROJECT_ID are not set in Vercel'
          : !key
            ? 'POSTHOG_API_KEY is not set in Vercel'
            : 'POSTHOG_PROJECT_ID is not set in Vercel',
    };
  }

  const since = `now() - interval ${days} day`;

  // Every query is scoped to the live domain. The pages guard added in
  // admin/mechanic/index/landing stops NEW dev traffic from being recorded,
  // but the events already in the project cannot be un-sent: the first real
  // run showed "/C:/Users/.../landing.html" with 25 views and referrers of
  // localhost:3000 and localhost:4173 sitting among real customers.
  //
  // Filtering here rather than in PostHog's "internal and test users" setting
  // because that one matches people, and this noise is mostly anonymous
  // pageviews from a hostname - there is no person to exclude.
  const LIVE_HOSTS = "('drbikesydney.com.au', 'www.drbikesydney.com.au')";
  // The staff tools stopped reporting once PostHog was removed from
  // admin.html and mechanic.html, but the views already recorded cannot be
  // un-sent: /admin.html and /admin alone were 79 of 528 page views, and they
  // sit on the live domain so the host filter does not touch them. Excluded by
  // path so the history reads like customer traffic too.
  const STAFF_PATHS = "('/admin', '/admin.html', '/mechanic', '/mechanic.html')";
  const live = `properties.$host in ${LIVE_HOSTS} and properties.$pathname not in ${STAFF_PATHS}`;
  const q = {
    totals: `select count() as views, count(distinct person_id) as visitors
             from events where event = '$pageview' and timestamp > ${since} and ${live}`,
    pages: `select properties.$pathname as path, count() as views
            from events where event = '$pageview' and timestamp > ${since} and ${live}
            group by path order by views desc limit 12`,
    countries: `select properties.$geoip_country_name as country, count(distinct person_id) as visitors
                from events where event = '$pageview' and timestamp > ${since} and ${live}
                group by country order by visitors desc limit 10`,
    referrers: `select properties.$referring_domain as source, count(distinct person_id) as visitors
                from events where event = '$pageview' and timestamp > ${since} and ${live}
                group by source order by visitors desc limit 10`,
    // Returning = seen on 2+ distinct days inside the window. A plain
    // "returning visitor" count from PostHog would also count someone who
    // reloaded twice in one session.
    //
    // toDate() resolves in the PROJECT's timezone, so this means Sydney days
    // only because the project is set to Australia/Sydney (UTC+10). CHECKED IN
    // THE POSTHOG UI on 2026-08-11: Project settings > Date & time > Time zone
    // reads "Australia / Sydney (UTC+10:00)". So the number is right as it
    // stands and needs no correction.
    //
    // This comment used to end "- it is UTC today, which puts the day boundary
    // at 10-11am Sydney time", written when that was true and never updated
    // after Diego changed the setting. On 2026-08-11 a session read it,
    // believed it, and told him the "Came back" figure was inflated and had to
    // be fixed. It was not. If you are about to repeat a claim about the
    // PostHog project's configuration, open the project and look: the setting
    // lives outside this repo and nothing here can keep it honest.
    returning: `select countIf(d >= 2) as returning, countIf(d = 1) as once from (
                  select person_id, count(distinct toDate(timestamp)) as d
                  from events where event = '$pageview' and timestamp > ${since} and ${live}
                  group by person_id)`,
    funnel: `select properties.step as step, count(distinct person_id) as people
             from events where event = 'booking_step_viewed' and timestamp > ${since} and ${live}
             group by step`,
    completed: `select count(distinct person_id) as people
                from events where event = 'booking_completed' and timestamp > ${since} and ${live}`,
    ctas: `select properties.button_text as label, properties.location as location, count() as clicks
           from events where event = 'cta_clicked' and timestamp > ${since} and ${live}
           group by label, location order by clicks desc limit 12`,
  };

  // allSettled, not all: these are eight independent questions, and one bad
  // one should cost its own section rather than the whole card. This path has
  // never run against the live API, so the first real query is exactly when a
  // single wrong property name is most likely - and losing seven good answers
  // to it would make the failure much harder to read.
  const names = Object.keys(q);
  const settled = await Promise.allSettled(
    Object.values(q).map((sql) => hogQuery(sql, key, projectId))
  );
  const res = {};
  const failed = {};
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') res[names[i]] = s.value;
    else failed[names[i]] = scrubKeys(s.reason?.message || 'query failed');
  });

  // Nothing at all came back: that is a connection problem, not empty data.
  if (!Object.keys(res).length) {
    return { configured: true, error: Object.values(failed)[0] || 'every PostHog query failed' };
  }

  // A section that failed is reported as null, never as zero - the screen shows
  // "could not load" for those and real numbers for the rest.
  const rows = (k) => (res[k] ? res[k] : null);
  const totals = rows('totals');
  const returning = rows('returning');
  const completed = rows('completed');
  const list = (k, fn) => (res[k] ? res[k].map(fn) : null);

  return {
    configured: true,
    days,
    failed: Object.keys(failed).length ? failed : null,
    views: totals ? (totals[0]?.[0] ?? 0) : null,
    visitors: totals ? (totals[0]?.[1] ?? 0) : null,
    returning: returning ? (returning[0]?.[0] ?? 0) : null,
    once: returning ? (returning[0]?.[1] ?? 0) : null,
    pages: list('pages', ([path, views]) => ({ path, views })),
    countries: list('countries', ([country, visitors]) => ({ country, visitors })),
    referrers: list('referrers', ([source, visitors]) => ({ source, visitors })),
    ctas: list('ctas', ([label, location, clicks]) => ({ label, location, clicks })),
    // The screen orders these itself - PostHog has no idea the steps are a
    // sequence, it just counts each value of the `step` property.
    funnel: list('funnel', ([step, people]) => ({ step, people })),
    booking_completed: completed ? (completed[0]?.[0] ?? 0) : null,
  };
}

import { withSentry } from './_sentry.js';
export default withSentry(handler, 'auth');
async function handler(req, res) {
  const role = req.body?.type || req.body?.role || req.query?.role || 'admin';

  // These four run before guard() because they are GET reads / browser OAuth
  // redirects rather than the POST+JSON shape guard() enforces. They still get
  // a limiter of their own - skipping guard() also skipped the rate limit,
  // which left them the only endpoints here free to hammer.
  if (role === 'get-availability') {
    if (await rateLimit(req, res, { max: 30, windowMs: 60000, key: 'get-availability' })) return;
    return handleGetAvailability(req, res);
  }
  if (role === 'google-calendar-connect') {
    if (await rateLimit(req, res, { max: 10, windowMs: 60000, key: 'cal-connect' })) return;
    return handleGoogleCalendarConnect(req, res);
  }
  if (role === 'google-calendar-callback') {
    if (await rateLimit(req, res, { max: 10, windowMs: 60000, key: 'cal-callback' })) return;
    return handleGoogleCalendarCallback(req, res);
  }
  if (role === 'vapid-public-key') {
    if (await rateLimit(req, res, { max: 30, windowMs: 60000, key: 'vapid' })) return;
    return handleVapidPublicKey(req, res);
  }

  const rateMax = role.startsWith('mechanic-')
    ? 30
    : role === 'mechanic'
      ? 20
      : role === 'public-track' ||
          role === 'track-route' ||
          role === 'public-booking-list' ||
          role === 'public-mechanics' ||
          role === 'consume-code' ||
          role === 'join-waitlist' ||
          role === 'apply-referral' ||
          role === 'create-booking' ||
          role === 'hold-slot' ||
          role === 'check-coverage' ||
          // Analytics is one authenticated admin changing a date filter, not a
          // login attempt - the default 5/min locks the screen out on the third
          // range change.
          role === 'admin-analytics' ||
          // Same reason: the Finance screen re-reads the expenses on every
          // change of month, quarter or year, and 5/min locks it on the third.
          role === 'admin-expenses-list' ||
          role.startsWith('client-')
        ? 20
        : 5;
  // Per-role rate-limit bucket — otherwise frequent calls (GPS, jobs) saturate one
  // shared per-IP counter and block low-limit calls like login ("too many requests").
  if (await guard(req, res, { method: 'POST', rateMax, rateWindow: 60000, rateKey: role })) return;

  if (role === 'public-track') return handlePublicTrack(req, res);
  if (role === 'track-route') return handleTrackRoute(req, res);
  if (role === 'public-booking-list') return handlePublicBookingList(req, res);
  if (role === 'public-mechanics') return handlePublicMechanics(req, res);
  if (role === 'consume-code') return handleConsumeCode(req, res);
  if (role === 'client-review') return handleClientReview(req, res);
  if (role === 'mechanic-update-status') return handleMechanicUpdateStatus(req, res);
  if (role === 'mechanic-parts') return handleMechanicParts(req, res);
  if (role === 'mechanic-parts-update') return handleMechanicPartsUpdate(req, res);
  if (role === 'mechanic-messages') return handleMechanicMessages(req, res);
  if (role === 'mechanic-message-send') return handleMechanicMessageSend(req, res);
  if (role === 'client-messages') return handleClientMessages(req, res);
  if (role === 'client-message-send') return handleClientMessageSend(req, res);
  if (role === 'mechanic-checklist') return handleMechanicChecklist(req, res);
  if (role === 'mechanic-complete') return handleMechanicComplete(req, res);
  if (role === 'mechanic-accept') return handleMechanicAccept(req, res);
  if (role === 'mechanic-reject') return handleMechanicReject(req, res);
  if (role === 'mechanic-arrived') return handleMechanicArrived(req, res);
  if (role === 'mechanic') return handleMechanic(req, res);
  if (role === 'mechanic-jobs') return handleMechanicJobs(req, res);
  if (role === 'mechanic-location') return handleMechanicLocation(req, res);
  if (role === 'client-cancel') return handleClientCancel(req, res);
  if (role === 'join-waitlist') return handleJoinWaitlist(req, res);
  if (role === 'request-password-reset') return handleRequestPasswordReset(req, res);
  if (role === 'recover-email') return handleRecoverEmail(req, res);
  if (role === 'mechanic-preference-status') return handleMechanicPreferenceStatus(req, res);
  if (role === 'apply-referral') return handleApplyReferral(req, res);
  if (role === 'client-reschedule') return handleClientReschedule(req, res);
  if (role === 'admin-reschedule') return handleAdminReschedule(req, res);
  if (role === 'admin-reassign-van') return handleAdminReassignVan(req, res);
  if (role === 'client-history') return handleClientHistory(req, res);
  if (role === 'google-calendar-ticket') return handleGoogleCalendarTicket(req, res);
  if (role === 'client-bookings') return handleClientBookings(req, res);
  if (role === 'create-booking') return handleCreateBooking(req, res);
  // Same handler, same checks. The flag is set HERE rather than trusted from
  // the body, so `create-booking` can never be talked into skipping payment
  // verification by passing hold_only itself.
  if (role === 'hold-slot') {
    req.body = { ...req.body, hold_only: true, hold_booking_id: null };
    return handleCreateBooking(req, res);
  }
  if (role === 'check-coverage') return handleCheckCoverage(req, res);
  if (role === 'zone-price') return handleZonePrice(req, res);
  if (role === 'address-suggest') return handleAddressSuggest(req, res);
  if (role === 'request-quote') return handleRequestQuote(req, res);
  if (role === 'get-price') return handleGetPrice(req, res);
  if (role === 'birthday-greeting') return handleBirthdayGreeting(req, res);
  if (role === 'save-card-setup') return handleSaveCardSetupIntent(req, res);
  if (role === 'save-card-confirm') return handleSaveCardConfirm(req, res);
  if (role === 'remove-card') return handleRemoveCard(req, res);
  if (role === 'admin-services-save') return handleAdminServicesSave(req, res);
  if (role === 'admin-create-booking') return handleAdminCreateBooking(req, res);
  if (role === 'admin-services-delete') return handleAdminServicesDelete(req, res);
  if (role === 'admin-delete-calendar-event') return handleAdminDeleteCalendarEvent(req, res);
  if (role === 'submit-claim') return handleSubmitClaim(req, res);
  if (role === 'admin-orphan-audit') return handleAdminOrphanAudit(req, res);
  if (role === 'admin-expenses-list') return handleAdminExpensesList(req, res);
  if (role === 'admin-expenses-save') return handleAdminExpensesSave(req, res);
  if (role === 'admin-expenses-delete') return handleAdminExpensesDelete(req, res);
  if (role === 'admin-claims-list') return handleAdminClaimsList(req, res);
  if (role === 'admin-claims-update') return handleAdminClaimsUpdate(req, res);
  if (role === 'admin-set-mechanic-pin') return handleAdminSetMechanicPin(req, res);
  if (role === 'admin-analytics') return handleAdminAnalytics(req, res);
  return handleAdmin(req, res);
}
