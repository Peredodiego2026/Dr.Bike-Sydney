// Handles admin auth (?role=admin) and mechanic auth (?role=mechanic).
// Vercel rewrites map /api/admin-auth and /api/mechanic-auth to this file.
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import crypto from 'crypto';
import {
  guard,
  isLoginLocked,
  recordLoginFailure,
  clearLoginFailures,
  LOGIN_LOCK_MINUTES,
} from './_security.js';
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  isGoogleCalendarConfigured,
  saveGoogleRefreshToken,
} from './_google-calendar.js';

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
function verifyToken(token) {
  try {
    const secret = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '';
    const [payload, sig] = String(token).split('.');
    if (!payload || !sig) return null;
    const expected = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
    const a = Buffer.from(sig),
      b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
    );
    if (!data.mid || !data.exp || Date.now() > data.exp) return null;
    return data.mid;
  } catch {
    return null;
  }
}

// Shared mechanic auth: accepts a session token OR a PIN (dual-accept during
// migration). Returns { mechanic } on success, or { error, status } on failure.
async function authMechanic(req) {
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const token = req.body?.token;
  const pin = req.body?.pin;
  if (!token && (!pin || String(pin).trim().length < 4))
    return { error: 'PIN required', status: 401 };

  const resp = await fetch(`${SUPABASE_URL}/rest/v1/escalation_contacts?select=*`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!resp.ok) return { error: 'Database error', status: 500 };
  const contacts = await resp.json();

  let mechanic = null;
  let matchedByPlaintext = false;
  const mid = token ? verifyToken(token) : null;
  if (mid) {
    mechanic = contacts.find((c) => c.id === mid);
  }
  if (!mechanic && pin) {
    const cleanPin = String(pin).trim();
    const pinHash = hashPin(cleanPin);
    mechanic = contacts.find((c) => c.pin_hash && c.pin_hash === pinHash);
    if (!mechanic) {
      mechanic = contacts.find((c) => c.pin && c.pin === cleanPin);
      matchedByPlaintext = !!mechanic;
    }
    if (mechanic && matchedByPlaintext && !mechanic.pin_hash) {
      fetch(
        `${SUPABASE_URL}/rest/v1/escalation_contacts?id=eq.${encodeURIComponent(mechanic.id)}`,
        {
          method: 'PATCH',
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ pin_hash: pinHash }),
        }
      ).catch(() => {});
    }
  }

  if (!mechanic) return { error: 'Invalid PIN', status: 401 };
  if (mechanic.active === false) return { error: 'Account disabled', status: 403 };
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
  const { data: vz } = await sb.from('van_zones').select('van_number,suburb').neq('van_number', 0);
  const addr = (address || '').toLowerCase();
  const match = (vz || []).find((z) => z.suburb && addr.includes(String(z.suburb).toLowerCase()));
  return match && Number(match.van_number) ? Number(match.van_number) : null;
}

// Lets the client check coverage before paying, so a client outside the service
// area finds out at the address step instead of after being charged.
async function handleCheckCoverage(req, res) {
  const { address } = req.body || {};
  if (!address) return res.status(400).json({ error: 'address required' });
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const vanNumber = await matchVanZone(sb, address);
  return res.status(200).json({ covered: vanNumber !== null });
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
  } = req.body;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!access_token) return res.status(401).json({ error: 'Sign in required' });
  if (!scheduled_date || !scheduled_time)
    return res.status(400).json({ error: 'Date and time required' });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1. Verify the user from their token
  const {
    data: { user },
    error: uErr,
  } = await sb.auth.getUser(access_token);
  if (uErr || !user) return res.status(401).json({ error: 'Invalid session' });
  const isAdmin = (user.email || '').toLowerCase() === ADMIN_TEST_EMAIL;

  // 2. Authoritative service price from the services table
  let svc = null;
  if (service_id) {
    const r = await sb.from('services').select('id,name,price').eq('id', service_id).maybeSingle();
    svc = r.data;
  }
  if (!svc && service_name) {
    const r = await sb
      .from('services')
      .select('id,name,price')
      .eq('name', service_name)
      .maybeSingle();
    svc = r.data;
  }
  if (!svc) return res.status(400).json({ error: 'Unknown service' });
  // Sunday/NSW public holiday surcharge (+20%, confirmed with Diego) - applied
  // to both components so the itemized quote stays honest line-by-line rather
  // than a mystery lump surcharge.
  const servicePrice = applySurcharge(Number(svc.price), scheduled_date);

  // 3. Authoritative call-out fee (callout_zones by address, default $20)
  let calloutFee = 20;
  try {
    const { data: zones } = await sb.from('callout_zones').select('callout_fee,suburbs');
    const addr = (address || '').toLowerCase();
    const zone = (zones || []).find((z) =>
      (z.suburbs || []).some((s) => addr.includes(String(s).toLowerCase()))
    );
    if (zone) calloutFee = Number(zone.callout_fee);
  } catch {}
  calloutFee = applySurcharge(calloutFee, scheduled_date);

  // 3b. Zone dispatch: reject bookings outside any configured coverage zone
  // instead of silently defaulting to van 1 - previously this accepted (and
  // charged) bookings no mechanic could actually reach. The admin test
  // account keeps the van-1 fallback so test addresses don't have to match
  // a real suburb.
  let vanNumber = await matchVanZone(sb, address);
  if (!vanNumber && isAdmin) vanNumber = 1;
  if (!vanNumber) {
    if (payment_intent_id) {
      try {
        await new Stripe(process.env.STRIPE_SECRET_KEY).refunds.create({
          payment_intent: payment_intent_id,
        });
      } catch (e) {
        console.error('[create-booking] out-of-zone refund failed:', e.message);
      }
    }
    return res.status(400).json({
      error:
        "Sorry, we don't currently service that address." +
        (payment_intent_id ? ' Your payment has been refunded.' : ''),
    });
  }

  // 4. Verify payment (skipped for the admin test account)
  let verifiedPI = null;
  if (!isAdmin) {
    if (!process.env.STRIPE_SECRET_KEY) return res.status(402).json({ error: 'Payment required' });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    try {
      if (checkout_session_id) {
        const sess = await stripe.checkout.sessions.retrieve(checkout_session_id);
        if (sess.payment_status !== 'paid')
          return res.status(402).json({ error: 'Payment not completed' });
        if (Math.round(sess.amount_total) !== Math.round(calloutFee * 100))
          return res.status(402).json({ error: 'Payment amount mismatch' });
        verifiedPI =
          typeof sess.payment_intent === 'string' ? sess.payment_intent : sess.payment_intent?.id;
      } else if (payment_intent_id) {
        const p = await stripe.paymentIntents.retrieve(payment_intent_id);
        if (p.status !== 'succeeded')
          return res.status(402).json({ error: 'Payment not completed' });
        if (Math.round(p.amount) !== Math.round(calloutFee * 100))
          return res.status(402).json({ error: 'Payment amount mismatch' });
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

  // 5. Insert with server-set fields only
  const meta = user.user_metadata || {};
  const { data: booking, error: insErr } = await sb
    .from('bookings')
    .insert([
      {
        user_id: user.id,
        client_id: user.id,
        client_name: meta.full_name || meta.name || '',
        client_email: user.email || '',
        service_name: svc.name,
        service_price: servicePrice,
        callout_fee: calloutFee,
        scheduled_date,
        scheduled_time,
        address: address || 'Home',
        status: 'pending',
        van_number: vanNumber,
        stripe_payment_intent_id: verifiedPI,
        bike_id: bike_id || null,
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
        // Client-reported elapsed time, only trusted within a sane range - a
        // bogus/manipulated value would just skew the "avg time to book" KPI,
        // it's never used for pricing or access control.
        time_to_book_seconds:
          Number.isFinite(Number(time_to_book_seconds)) &&
          Number(time_to_book_seconds) >= 0 &&
          Number(time_to_book_seconds) <= 86400
            ? Math.round(Number(time_to_book_seconds))
            : null,
      },
    ])
    .select()
    .single();

  if (insErr) {
    if (insErr.code === '23505') {
      // Slot was taken between payment and insert — refund a real payment, then reject
      if (verifiedPI) {
        try {
          await new Stripe(process.env.STRIPE_SECRET_KEY).refunds.create({
            payment_intent: verifiedPI,
          });
        } catch {}
      }
      return res.status(409).json({
        error:
          'That time slot was just booked.' +
          (verifiedPI ? ' Your payment has been refunded.' : ' Please pick another time.'),
      });
    }
    return res.status(500).json({ error: 'Could not create booking', detail: insErr.message });
  }

  // 6. Discount/gift code (server-authoritative): recompute, record, consume single-use
  if (discount_code) {
    const code = String(discount_code).trim().toUpperCase();
    const { data: dc } = await sb
      .from('discount_codes')
      .select('id,discount_amount,discount_type,max_uses,uses_count,active')
      .eq('code', code)
      .maybeSingle();
    if (dc && dc.active && !(dc.max_uses && dc.uses_count >= dc.max_uses)) {
      const disc =
        dc.discount_type === 'percentage'
          ? Math.round(servicePrice * dc.discount_amount) / 100
          : Math.min(dc.discount_amount, servicePrice);
      await sb
        .from('bookings')
        .update({ discount_applied: disc, discount_code: code })
        .eq('id', booking.id);
      const newCount = (dc.uses_count || 0) + 1;
      await sb
        .from('discount_codes')
        .update({
          uses_count: newCount,
          ...(dc.max_uses && newCount >= dc.max_uses ? { active: false } : {}),
        })
        .eq('id', dc.id);
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
  if (await isLoginLocked(req)) {
    res.setHeader('Retry-After', LOGIN_LOCK_MINUTES * 60);
    return res
      .status(429)
      .json({ error: `Too many attempts. Try again in ${LOGIN_LOCK_MINUTES} minutes.` });
  }
  const auth = await authMechanic(req);
  if (auth.error) {
    if (auth.status === 401) await recordLoginFailure(req);
    return res.status(auth.status).json({ error: auth.error });
  }
  await clearLoginFailures(req);
  const mechanic = auth.mechanic;
  return res.status(200).json({
    id: mechanic.id,
    name: mechanicName(mechanic),
    phone: mechanic.phone,
    role: mechanic.role || 'mechanic',
    token: makeToken(mechanic.id),
  });
}

async function handleMechanicJobs(req, res) {
  const van = parseInt(req.body?.van) || 1;
  const auth = await authMechanic(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  const baseCols =
    'id,client_id,client_name,client_email,client_phone,service_name,service_price,callout_fee,scheduled_date,scheduled_time,status,suburb,address,van_number,notes,mechanic_notes,mechanic_id,client_rating,client_review';
  const hdrs = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
  // Only recent + upcoming jobs (last 7 days onward) so the list stays small at scale.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const order = `scheduled_date=gte.${cutoff}&order=scheduled_date.asc,scheduled_time.asc&limit=300`;
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
  const jobs = await jobsResp.json();
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
  const van = parseInt(van_number) || 1;

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
  const q = `client_id=eq.${client_id}&order=scheduled_date.desc&limit=100`;
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
  // Atomic accept: only assign if no mechanic has taken it yet (mechanic_id is null).
  // A concurrent second accept matches 0 rows → 409, so two mechanics can't take one job.
  const acceptResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}&mechanic_id=is.null`,
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
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
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

  const bookingResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=arrival_pin&id=eq.${encodeURIComponent(booking_id)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!bookingResp.ok) return res.status(500).json({ error: 'Database error' });
  const bookingRows = await bookingResp.json();
  const storedPin = bookingRows?.[0]?.arrival_pin;
  if (storedPin && String(pin).trim() !== String(storedPin)) {
    return res.status(403).json({ error: 'Incorrect code - ask the client to read it again' });
  }

  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
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
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
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

  // Deduct used parts from inventory and build a readable summary stored on the booking.
  let partsText = null;
  const lowStock = [];
  if (Array.isArray(parts_used) && parts_used.length) {
    for (const p of parts_used) {
      const qty = parseInt(p?.qty, 10);
      if (!p?.id || !Number.isFinite(qty) || qty <= 0) continue;
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/parts_inventory?id=eq.${encodeURIComponent(p.id)}&select=name,stock,min_stock`,
        { headers: sbHdr }
      );
      if (!r.ok) continue;
      const row = (await r.json())[0];
      if (!row) continue;
      const newStock = Math.max(0, (row.stock || 0) - qty);
      await fetch(`${SUPABASE_URL}/rest/v1/parts_inventory?id=eq.${encodeURIComponent(p.id)}`, {
        method: 'PATCH',
        headers: { ...sbHdr, Prefer: 'return=minimal' },
        body: JSON.stringify({ stock: newStock }),
      });
      if (newStock <= (row.min_stock || 0)) lowStock.push(row.name);
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
    final_charge_amount:
      final_charge_amount !== null && final_charge_amount !== undefined
        ? Number(final_charge_amount)
        : null,
    final_charge_status: final_charge_status || null,
    tip_amount: Number(tip_amount) || 0,
    next_service_date: next_service_date || null,
  };
  if (photo_before_url) payload.photo_before_url = photo_before_url;
  if (photo_after_url) payload.photo_after_url = photo_after_url;
  if (client_signature_url) payload.client_signature_url = client_signature_url;
  if (duration_seconds) payload.service_duration_seconds = duration_seconds;

  // If a discount code was applied at completion time, record its use server-side
  const mechDiscCode = parts_charged?.discount_code;
  if (mechDiscCode) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/discount_codes?code=eq.${encodeURIComponent(mechDiscCode)}&select=id,max_uses,uses_count`,
        { headers: sbHdr }
      );
      const row = r.ok ? (await r.json())[0] : null;
      if (row) {
        const newCount = (row.uses_count || 0) + 1;
        const update = { uses_count: newCount };
        if (row.max_uses && newCount >= row.max_uses) update.active = false;
        await fetch(`${SUPABASE_URL}/rest/v1/discount_codes?id=eq.${encodeURIComponent(row.id)}`, {
          method: 'PATCH',
          headers: { ...sbHdr, Prefer: 'return=minimal' },
          body: JSON.stringify(update),
        });
      }
    } catch {}
  }

  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
    }
  );
  if (!updateResp.ok) {
    const errText = await updateResp.text();
    console.error('complete patch error:', updateResp.status, errText);
    return res.status(500).json({ error: 'Failed to complete booking', detail: errText });
  }
  return res.status(200).json({ ok: true, low_stock: lowStock });
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

  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ status: 'cancelled' }),
    }
  );
  if (!updateResp.ok) return res.status(500).json({ error: 'Failed to cancel booking' });

  // Notify first person on waitlist for this slot (fire-and-forget)
  notifyWaitlist(SERVICE_KEY, bk.scheduled_date, bk.scheduled_time).catch(() => {});

  // Remove the mechanic's calendar event, if one was ever created (fire-and-forget)
  if (bk.google_event_id) deleteCalendarEvent(bk.google_event_id).catch(() => {});

  // Auto-refund the $20 callout fee for >=24h notice (per terms.html section 6),
  // then tell Diego the outcome (fire-and-forget - never block the client's
  // cancel response on this).
  notifyAdminCancellation(bk).catch((e) =>
    console.error('[client-cancel] refund/notify failed:', e.message)
  );

  return res.status(200).json({ ok: true });
}

async function notifyAdminCancellation(bk) {
  const hours = hoursUntilAppointment(bk.scheduled_date, bk.scheduled_time);
  const eligibleForRefund = hours >= 24;

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

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://drbikesydney.com.au';
  await fetch(`${base}/api/send-message?channel=whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
        <div style="border:1px solid #E5E7EB;border-top:none;border-radius:0 0 12px 12px;padding:28px 24px">
          <p style="font-size:16px;font-weight:700;color:#0D1F3C;margin:0 0 8px">Good news, ${entry.client_name || 'there'}!</p>
          <p style="color:#374151;margin:0 0 20px">A slot just opened up on <strong>${date}</strong> at <strong>${time}</strong>${entry.service_name ? ' for ' + entry.service_name : ''}. Book now before it fills up again.</p>
          <a href="https://drbikesydney.com.au" style="display:inline-block;background:#2563EB;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Book Now</a>
          <p style="color:#9CA3AF;font-size:12px;margin-top:24px">You're receiving this because you joined the waitlist for ${date}.</p>
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

  const CREDIT = 10;
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
    `${SUPABASE_URL}/rest/v1/bookings?select=id,status,client_id,google_event_id,service_name&id=eq.${encodeURIComponent(booking_id)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!bkResp.ok) return res.status(500).json({ error: 'Database error' });
  const bkData = await bkResp.json();
  if (!bkData?.length) return res.status(404).json({ error: 'Booking not found' });
  const bk = bkData[0];
  if (bk.client_id !== client_id) return res.status(403).json({ error: 'Forbidden' });
  if (!['pending', 'confirmed'].includes(bk.status))
    return res.status(400).json({ error: 'Booking cannot be rescheduled' });

  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ scheduled_date, scheduled_time }),
    }
  );
  if (!updateResp.ok) return res.status(500).json({ error: 'Failed to reschedule booking' });

  if (bk.google_event_id) {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    sb.from('services')
      .select('duration_max')
      .eq('name', bk.service_name)
      .maybeSingle()
      .then(({ data: svc }) =>
        updateCalendarEvent(bk.google_event_id, {
          scheduledDate: scheduled_date,
          scheduledTime: scheduled_time,
          durationMin: (svc?.duration_max || DEFAULT_SERVICE_DURATION_MIN) + SLOT_BUFFER_MIN,
        })
      )
      .catch(() => {});
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

  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
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

async function notifyClientOfMechanicMessage(bookingId, message, SERVICE_KEY) {
  const bkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=client_id,service_name&id=eq.${encodeURIComponent(bookingId)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const bkData = bkResp.ok ? await bkResp.json() : [];
  const clientId = bkData?.[0]?.client_id;
  if (!clientId) return;

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://drbikesydney.com.au';
  await fetch(`${base}/api/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId,
      title: `Message about your ${bkData[0].service_name || 'service'}`,
      body: message.slice(0, 100),
      url: '/index.html#tracking',
      tag: 'mechanic-message',
    }),
  });
}

async function handlePublicTrack(req, res) {
  const { tracking_token, booking_id } = req.body;
  if (!tracking_token && !booking_id)
    return res.status(400).json({ error: 'tracking_token or booking_id required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const cols =
    'id,status,scheduled_date,scheduled_time,service_name,service_price,address,van_number,mechanic_id,mechanic_notes,parts_used,next_service_date,tracking_token,client_rating,client_review,arrival_pin';
  const filter = tracking_token
    ? `tracking_token=eq.${encodeURIComponent(tracking_token)}`
    : `id=eq.${encodeURIComponent(booking_id)}`;

  const resp = await fetch(`${SUPABASE_URL}/rest/v1/bookings?select=${cols}&${filter}&limit=1`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!resp.ok) return res.status(500).json({ error: 'Database error' });
  const data = await resp.json();
  if (!data?.length) return res.status(404).json({ error: 'Booking not found' });
  const booking = data[0];

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

  return res.status(200).json({
    ...booking,
    mechanic_location,
    mechanic_profile,
    _dbg: { van: booking.van_number, mechId: booking.mechanic_id, active: isActive },
  });
}

// Increment uses_count on a discount/gift code after it is actually used in a booking.
// Server-side only (service key) so clients cannot self-redeem repeatedly.
async function handleConsumeCode(req, res) {
  const code = (req.body?.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'code required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: row, error } = await sb
    .from('discount_codes')
    .select('id, max_uses, uses_count, active')
    .eq('code', code)
    .single();
  if (error || !row) return res.status(404).json({ error: 'Code not found' });
  if (!row.active) return res.status(409).json({ error: 'Code no longer active' });
  if (row.max_uses && row.uses_count >= row.max_uses)
    return res.status(409).json({ error: 'Code already used' });

  const newCount = (row.uses_count || 0) + 1;
  const update = { uses_count: newCount };
  if (row.max_uses && newCount >= row.max_uses) update.active = false;

  const { error: upErr } = await sb.from('discount_codes').update(update).eq('id', row.id);
  if (upErr) return res.status(500).json({ error: 'Could not consume code' });

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
  return res
    .status(200)
    .json({ ok: true, remaining: row.max_uses ? Math.max(0, row.max_uses - newCount) : null });
}

async function handlePublicBookingList(req, res) {
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Email required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const cols = 'id,service_name,scheduled_date,scheduled_time,status,tracking_token';
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=${cols}&client_email=eq.${encodeURIComponent(email)}&status=neq.cancelled&order=scheduled_date.desc&limit=10`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!resp.ok) return res.status(500).json({ error: 'Database error' });
  const data = await resp.json();
  return res.status(200).json(data || []);
}

// Public, aggregated roster for the landing page: every mechanic who has
// completed at least one job, with their average rating and client reviews.
async function handlePublicMechanics(req, res) {
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const hdrs = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

  const bookingsResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=mechanic_id,client_rating,client_review,client_name&status=eq.completed&mechanic_id=not.is.null`,
    { headers: hdrs }
  );
  if (!bookingsResp.ok) return res.status(500).json({ error: 'Database error' });
  const bookings = await bookingsResp.json();
  const mechIds = [...new Set(bookings.map((b) => b.mechanic_id))];
  if (!mechIds.length) return res.status(200).json([]);

  const contactsResp = await fetch(
    `${SUPABASE_URL}/rest/v1/escalation_contacts?select=id,first_name,last_name,photo_url,bio&active=eq.true&id=in.(${mechIds.map(encodeURIComponent).join(',')})`,
    { headers: hdrs }
  );
  if (!contactsResp.ok) return res.status(500).json({ error: 'Database error' });
  const contacts = await contactsResp.json();

  const mechanics = contacts
    .map((c) => {
      const jobs = bookings.filter((b) => b.mechanic_id === c.id);
      const { jobs_completed, rating, reviews } = aggregateMechanicStats(jobs, { maxReviews: 12 });
      return {
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

async function handleClientReview(req, res) {
  const { booking_id, rating, comment, photo_base64 } = req.body;
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });
  if (!rating || rating < 1 || rating > 5)
    return res.status(400).json({ error: 'rating must be 1-5' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const checkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=id,status,client_rating&id=eq.${encodeURIComponent(booking_id)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!checkResp.ok) return res.status(500).json({ error: 'Database error' });
  const rows = await checkResp.json();
  if (!rows?.length) return res.status(404).json({ error: 'Booking not found' });
  const booking = rows[0];
  if (booking.status !== 'completed')
    return res.status(400).json({ error: 'Booking not completed yet' });
  if (booking.client_rating) return res.status(409).json({ error: 'Already reviewed' });

  // Upload photo to Supabase Storage if provided
  let client_photo_url = null;
  if (photo_base64) {
    try {
      const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const ts = Date.now();
      const storagePath = `reviews/${booking_id}/client_${ts}.jpg`;
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
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
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

export function slotToMinutes(slot) {
  const m = slot.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return -1;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
  return h * 60 + min;
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
export function buildBusyIntervals(bookings, durationByService) {
  return bookings
    .filter((b) => b.scheduled_time && b.van_number)
    .map((b) => {
      const start = slotToMinutes(b.scheduled_time);
      const dur = durationByService[b.service_name] ?? DEFAULT_SERVICE_DURATION_MIN;
      return { van: b.van_number, start, end: start + dur + SLOT_BUFFER_MIN };
    });
}

// A slot is bookable if AT LEAST ONE van has no busy interval overlapping the
// full window the new booking would occupy (its own duration + buffer) - not
// just a free slot at the start time, which is what the old van-count-only
// check effectively assumed.
export function computeAvailableSlots({
  allSlots,
  vans,
  busyIntervals,
  neededMin,
  manualUnavailable,
  isToday,
  nowMin,
}) {
  return allSlots.map((time) => {
    const slotMin = slotToMinutes(time);
    const slotEnd = slotMin + neededMin;
    let available = vans.some(
      (van) => !busyIntervals.some((iv) => iv.van === van && slotMin < iv.end && iv.start < slotEnd)
    );
    if (manualUnavailable.has(time)) available = false;
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
        .select('scheduled_time,van_number,service_name')
        .eq('scheduled_date', date)
        .in('status', ['pending', 'confirmed', 'enroute', 'in_progress', 'arrived']),
      sb.from('availability').select('time_slot, available').eq('date', date),
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

  const busyIntervals = buildBusyIntervals(bookings || [], durationByService);
  const manualUnavailable = new Set(
    (overrides || []).filter((r) => !r.available).map((r) => r.time_slot)
  );

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
    manualUnavailable,
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
async function handleGoogleCalendarConnect(req, res) {
  if (!isGoogleCalendarConfigured()) {
    return res
      .status(503)
      .send('Google Calendar is not configured yet (missing Client ID/Secret).');
  }
  const redirectUri = `https://${req.headers.host}/api/google-calendar-callback`;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent', // forces a refresh_token even if this account connected before
    scope: 'https://www.googleapis.com/auth/calendar',
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
async function verifyAdminSession(access_token, SERVICE_KEY) {
  if (!access_token) return { error: 'Sign in required', status: 401 };
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const {
    data: { user },
    error: uErr,
  } = await sb.auth.getUser(access_token);
  if (uErr || !user) return { error: 'Invalid session', status: 401 };
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

import { withSentry } from './_sentry.js';
export default withSentry(handler, 'auth');
async function handler(req, res) {
  const role = req.body?.type || req.body?.role || req.query?.role || 'admin';

  if (role === 'get-availability') return handleGetAvailability(req, res);
  if (role === 'google-calendar-connect') return handleGoogleCalendarConnect(req, res);
  if (role === 'google-calendar-callback') return handleGoogleCalendarCallback(req, res);
  if (role === 'vapid-public-key') return handleVapidPublicKey(req, res);

  const rateMax = role.startsWith('mechanic-')
    ? 30
    : role === 'mechanic'
      ? 20
      : role === 'public-track' ||
          role === 'public-booking-list' ||
          role === 'public-mechanics' ||
          role === 'consume-code' ||
          role === 'join-waitlist' ||
          role === 'apply-referral' ||
          role === 'create-booking' ||
          role === 'check-coverage' ||
          role.startsWith('client-')
        ? 20
        : 5;
  // Per-role rate-limit bucket — otherwise frequent calls (GPS, jobs) saturate one
  // shared per-IP counter and block low-limit calls like login ("too many requests").
  if (await guard(req, res, { method: 'POST', rateMax, rateWindow: 60000, rateKey: role })) return;

  if (role === 'public-track') return handlePublicTrack(req, res);
  if (role === 'public-booking-list') return handlePublicBookingList(req, res);
  if (role === 'public-mechanics') return handlePublicMechanics(req, res);
  if (role === 'consume-code') return handleConsumeCode(req, res);
  if (role === 'client-review') return handleClientReview(req, res);
  if (role === 'mechanic-update-status') return handleMechanicUpdateStatus(req, res);
  if (role === 'mechanic-parts') return handleMechanicParts(req, res);
  if (role === 'mechanic-parts-update') return handleMechanicPartsUpdate(req, res);
  if (role === 'mechanic-messages') return handleMechanicMessages(req, res);
  if (role === 'mechanic-message-send') return handleMechanicMessageSend(req, res);
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
  if (role === 'apply-referral') return handleApplyReferral(req, res);
  if (role === 'client-reschedule') return handleClientReschedule(req, res);
  if (role === 'client-history') return handleClientHistory(req, res);
  if (role === 'client-bookings') return handleClientBookings(req, res);
  if (role === 'create-booking') return handleCreateBooking(req, res);
  if (role === 'check-coverage') return handleCheckCoverage(req, res);
  if (role === 'admin-services-save') return handleAdminServicesSave(req, res);
  if (role === 'admin-services-delete') return handleAdminServicesDelete(req, res);
  if (role === 'admin-delete-calendar-event') return handleAdminDeleteCalendarEvent(req, res);
  if (role === 'submit-claim') return handleSubmitClaim(req, res);
  if (role === 'admin-claims-list') return handleAdminClaimsList(req, res);
  if (role === 'admin-claims-update') return handleAdminClaimsUpdate(req, res);
  return handleAdmin(req, res);
}
