import { createClient } from '@supabase/supabase-js';
import { guard, verifyTurnstile, SELF_BASE_URL } from './_security.js';

// api/send-cron.js — All scheduled/cron email jobs in one function
// Routes: ?type=birthday | reengagement | abandoned | service
// Cron schedule (vercel.json):
//   birthday:     0 8 * * *   (daily 8am UTC)
//   reengagement: 0 10 * * 1  (weekly Mon 10am)
//   abandoned:    part of ?type=all, so daily - NOT hourly, whatever this
//                 comment used to claim. Checked against vercel.json 28-jul.
//   abandoned-checkout: also part of ?type=all, so also daily. It was given an
//                 hourly entry of its own and Vercel refused the deploy:
//                 "Hobby accounts are limited to daily cron jobs". Which means
//                 "three hours later" is really "on the next daily run, at
//                 least three hours later" - see the window below.
//   service:      0 9 1 * *   (monthly 1st)

const SB_URL = 'https://tgpipbloisahufaywhqb.supabase.co';
const BASE = SELF_BASE_URL;
// Background jobs have nobody watching a screen, so a send that fails must
// leave a trace or it is indistinguishable from "nobody matched today".
// Callers here only ever tested `r.ok` and dropped everything else, which is
// exactly how the VERCEL_URL/SSO bug survived weeks of "the emails are not
// arriving": the cron reported 200 and sent: 0, every single day.
function logSendFailure(label, r, ref) {
  const why = r && r._err ? `threw ${r._err}` : `HTTP ${r && r.status}`;
  console.error(`[cron:${label}] send failed${ref ? ` for ${ref}` : ''}: ${why}`);
}

function makeSb() {
  return createClient(SB_URL, process.env.SUPABASE_SERVICE_KEY);
}

// Fails closed: an unset CRON_SECRET blocks the request rather than skipping
// the check, so a missing env var can never leave these endpoints wide open.
// Only guards the scheduled-only types (see router below) - b2b/upsell are
// meant to be called directly from a browser and never go through this.
function checkSecret(req, res) {
  const secret = process.env.CRON_SECRET;
  const provided = (req.headers.authorization || '').replace('Bearer ', '') || req.query?.key;
  if (!secret || provided !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return true;
  }
  return false;
}

// ── Birthday ──────────────────────────────────────────────────────────────────
async function handleBirthday(req, res) {
  const sb = makeSb();
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const thisYear = today.getFullYear();

  const { data: profiles, error } = await sb
    .from('profiles')
    .select('id, full_name, email, birthday, birthday_promo_sent_year, preferred_lang')
    .not('birthday', 'is', null)
    .not('email', 'is', null);

  if (error) return res.status(500).json({ error: error.message });

  const targets = (profiles || []).filter((p) => {
    const [, bMm, bDd] = (p.birthday || '').split('-');
    return bMm === mm && bDd === dd && p.birthday_promo_sent_year !== thisYear;
  });

  let sent = 0;
  for (const p of targets) {
    const r = await fetch(`${BASE}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': process.env.INTERNAL_API_SECRET || '',
      },
      body: JSON.stringify({
        to: p.email,
        name: p.full_name || p.email.split('@')[0],
        type: 'birthday_promo',
        // No browser in a cron, so the language comes off the profile.
        lang: p.preferred_lang || 'en',
      }),
    }).catch((e) => ({ ok: false, _err: e.message }));
    if (r.ok) {
      await sb.from('profiles').update({ birthday_promo_sent_year: thisYear }).eq('id', p.id);
      sent++;
    } else logSendFailure('birthday', r, p.id);
  }
  return res.status(200).json({ sent, checked: targets.length });
}

// ── Reengagement ──────────────────────────────────────────────────────────────
async function handleReengagement(req, res) {
  const sb = makeSb();
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  const { data: bookings, error } = await sb
    .from('bookings')
    .select('client_email, client_name, service_name, completed_at')
    .eq('status', 'completed')
    .lte('completed_at', twelveMonthsAgo.toISOString())
    .order('completed_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const clientMap = {};
  for (const b of bookings || []) {
    if (b.client_email && !clientMap[b.client_email]) clientMap[b.client_email] = b;
  }

  const { data: recent } = await sb
    .from('bookings')
    .select('client_email')
    .gt('completed_at', twelveMonthsAgo.toISOString());
  const recentEmails = new Set((recent || []).map((b) => b.client_email).filter(Boolean));

  const targetEmails = Object.keys(clientMap).filter((e) => !recentEmails.has(e));
  if (!targetEmails.length) return res.status(200).json({ sent: 0, message: 'No targets' });

  const { data: profiles } = await sb
    .from('profiles')
    .select('email, reengagement_sent_at, preferred_lang')
    .in('email', targetEmails);
  const langByEmail = new Map((profiles || []).map((p) => [p.email, p.preferred_lang || 'en']));
  const sentRecently = new Set(
    (profiles || [])
      .filter((p) => {
        if (!p.reengagement_sent_at) return false;
        return Date.now() - new Date(p.reengagement_sent_at).getTime() < 365 * 24 * 60 * 60 * 1000;
      })
      .map((p) => p.email)
  );

  const finalTargets = targetEmails.filter((e) => !sentRecently.has(e));
  let sent = 0;
  for (const email of finalTargets) {
    const b = clientMap[email];
    const monthsAgo = Math.floor(
      (Date.now() - new Date(b.completed_at).getTime()) / (1000 * 60 * 60 * 24 * 30)
    );
    const r = await fetch(`${BASE}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': process.env.INTERNAL_API_SECRET || '',
      },
      body: JSON.stringify({
        to: email,
        name: b.client_name || email.split('@')[0],
        service: b.service_name,
        type: 'reengagement',
        monthsAgo,
        lang: langByEmail.get(email) || 'en',
      }),
    }).catch((e) => ({ ok: false, _err: e.message }));
    if (!r.ok) logSendFailure('reengagement', r, email);
    if (r.ok) {
      await sb
        .from('profiles')
        .update({ reengagement_sent_at: new Date().toISOString() })
        .eq('email', email);
      sent++;
    }
  }
  return res.status(200).json({ sent, checked: finalTargets.length });
}

// ── Abandoned bookings ────────────────────────────────────────────────────────
async function handleAbandoned(req, res) {
  const sb = makeSb();
  const now = new Date();
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const { data: bookings, error } = await sb
    .from('bookings')
    .select(
      'id, client_email, client_name, service_name, service_price, scheduled_date, scheduled_time, address'
    )
    .eq('status', 'pending')
    .or('abandoned_recovery_sent.is.null,abandoned_recovery_sent.eq.false')
    .lte('created_at', oneHourAgo)
    .gte('created_at', oneDayAgo);

  if (error) return res.status(500).json({ error: error.message });

  let sent = 0;
  for (const b of bookings || []) {
    if (!b.client_email) continue;
    const dateLabel = b.scheduled_date
      ? new Date(b.scheduled_date).toLocaleDateString('en-AU', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })
      : '';
    const r = await fetch(`${BASE}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': process.env.INTERNAL_API_SECRET || '',
      },
      body: JSON.stringify({
        to: b.client_email,
        name: b.client_name || b.client_email.split('@')[0],
        service: b.service_name,
        date: dateLabel,
        time: b.scheduled_time,
        price: b.service_price || 0,
        bookingId: b.id,
        type: 'abandoned_recovery',
      }),
    }).catch((e) => ({ ok: false, _err: e.message }));
    if (r.ok) {
      await sb.from('bookings').update({ abandoned_recovery_sent: true }).eq('id', b.id);
      sent++;
    } else logSendFailure('abandoned', r, b.id);
  }
  return res.status(200).json({ sent, checked: (bookings || []).length });
}

// ── Abandoned checkout (reached the payment screen, never paid) ───────────────
// handleAbandoned above only sees people who already have a booking row. Until
// 2026-07-28 the ones who got as far as the payment screen and stopped were
// invisible: the booking is only written after the charge succeeds, so there
// was nothing to find. js/app.js now records the attempt in checkout_attempts
// and deletes it the moment the booking exists, which makes anything left in
// that table by definition an unfinished checkout.
//
// Three hours is the floor Diego asked for - long enough that we are not
// emailing someone who just went to find their card.
//
// The ceiling is seven days, and that number is the whole reason this comment
// exists. It was one day, which is wrong for a job that runs once a day: a
// checkout abandoned in the three hours before a run is too young for that
// run, and by the next one it is 27 hours old and falls out the other side.
// Those people would never have been emailed at all. A wide ceiling costs
// nothing because reminder_sent_at already guarantees one email each.
async function handleAbandonedCheckout(req, res) {
  const sb = makeSb();
  const now = new Date();
  const threeHoursAgo = new Date(now - 3 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: attempts, error } = await sb
    .from('checkout_attempts')
    .select('client_id, service_name, service_price, scheduled_date, scheduled_time')
    .is('reminder_sent_at', null)
    .lte('reached_payment_at', threeHoursAgo)
    .gte('reached_payment_at', sevenDaysAgo);

  if (error) return res.status(500).json({ error: error.message });
  if (!attempts?.length) return res.status(200).json({ sent: 0, checked: 0 });

  // The email and the language live on the profile, not on the attempt - one
  // query for all of them rather than one per person.
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, full_name, email, preferred_lang')
    .in(
      'id',
      attempts.map((a) => a.client_id)
    );
  const byId = new Map((profiles || []).map((p) => [p.id, p]));

  let sent = 0;
  for (const a of attempts) {
    const p = byId.get(a.client_id);
    if (!p?.email) continue;
    const dateLabel = a.scheduled_date
      ? new Date(a.scheduled_date).toLocaleDateString('en-AU', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })
      : '';
    // Reuses the abandoned_recovery template: it already says "you started
    // booking X and didn't finish", already exists in en/es/zh, and never used
    // the booking id - it links to the site, which is exactly right here since
    // there is no booking to link to.
    const r = await fetch(`${BASE}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': process.env.INTERNAL_API_SECRET || '',
      },
      body: JSON.stringify({
        to: p.email,
        name: p.full_name || p.email.split('@')[0],
        service: a.service_name || 'your service',
        date: dateLabel,
        time: a.scheduled_time || '',
        price: a.service_price || 0,
        lang: p.preferred_lang || 'en',
        type: 'abandoned_recovery',
      }),
    }).catch((e) => ({ ok: false, _err: e.message }));
    if (r.ok) {
      await sb
        .from('checkout_attempts')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('client_id', a.client_id);
      sent++;
    } else logSendFailure('abandoned-checkout', r, a.client_id);
  }
  return res.status(200).json({ sent, checked: attempts.length });
}

// ── Advance reminder (3 days before the appointment) ──────────────────────────
// The only reminder that existed fired 2h before. A booking made a week out
// went from "confirmed" to a message two hours before the mechanic showed up.
const ADVANCE_REMINDER_DAYS = 3;

async function handleAdvanceReminders(req, res) {
  const sb = makeSb();
  const target = new Date();
  target.setDate(target.getDate() + ADVANCE_REMINDER_DAYS);
  const targetDate = target.toISOString().split('T')[0];

  const { data: bookings, error } = await sb
    .from('bookings')
    .select(
      'id, client_email, client_phone, client_name, service_name, scheduled_date, scheduled_time, address, suburb'
    )
    .eq('scheduled_date', targetDate)
    .in('status', ['pending', 'confirmed'])
    .or('reminder_days_sent.is.null,reminder_days_sent.eq.false');

  if (error) return res.status(500).json({ error: error.message });

  let sent = 0;
  for (const b of bookings || []) {
    const dateLabel = new Date(b.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    });
    const results = await Promise.allSettled([
      b.client_email
        ? fetch(`${BASE}/api/send-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-token': process.env.INTERNAL_API_SECRET || '',
            },
            body: JSON.stringify({
              to: b.client_email,
              name: b.client_name || b.client_email.split('@')[0],
              service: b.service_name,
              date: dateLabel,
              time: b.scheduled_time,
              bookingId: b.id,
              type: 'upcoming',
            }),
          })
        : Promise.resolve(null),
      b.client_phone
        ? fetch(`${BASE}/api/send-sms`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-token': process.env.INTERNAL_API_SECRET || '',
            },
            body: JSON.stringify({
              to: b.client_phone,
              name: b.client_name,
              service: b.service_name,
              time: `${dateLabel} at ${b.scheduled_time || ''}`.trim(),
              address: b.suburb || b.address,
              type: 'upcoming',
              bookingId: b.id,
            }),
          })
        : Promise.resolve(null),
    ]);
    // One channel landing is enough to consider the client reminded; marking
    // it only on total failure means a flaky SMS never blocks the flag.
    if (results.some((r) => r.status === 'fulfilled' && r.value && r.value.ok)) {
      await sb.from('bookings').update({ reminder_days_sent: true }).eq('id', b.id);
      sent++;
    }
  }
  return res.status(200).json({ sent, checked: (bookings || []).length, targetDate });
}

// ── No-show watch ─────────────────────────────────────────────────────────────
// Nothing was watching for a booking whose slot came and went with nobody
// marking it arrived or completed. The client sat waiting and the system never
// noticed. Alerts the admin so a human can chase it.
const NOSHOW_GRACE_HOURS = 2;

async function handleNoShowWatch(req, res) {
  const sb = makeSb();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data: bookings, error } = await sb
    .from('bookings')
    .select(
      'id, client_name, client_phone, service_name, scheduled_date, scheduled_time, suburb, address, status, mechanic_id'
    )
    .in('scheduled_date', [yesterday, today])
    .in('status', ['pending', 'confirmed', 'enroute'])
    .or('noshow_alert_sent.is.null,noshow_alert_sent.eq.false');

  if (error) return res.status(500).json({ error: error.message });

  // The admin's WhatsApp lives in the van_zones sentinel row, same lookup
  // send-message.js uses for the sender number.
  const { data: waRow } = await sb
    .from('van_zones')
    .select('postcode')
    .eq('van_number', 0)
    .eq('suburb', '__whatsapp__')
    .maybeSingle();
  const adminPhone = waRow?.postcode;

  let alerted = 0;
  const overdue = [];
  for (const b of bookings || []) {
    // scheduled_time is a 24h string like "14:30" (see CLAUDE.md).
    const [h, m] = String(b.scheduled_time || '00:00')
      .split(':')
      .map(Number);
    const slot = new Date(`${b.scheduled_date}T00:00:00`);
    slot.setHours(h || 0, m || 0, 0, 0);
    const hoursLate = (now - slot) / (1000 * 60 * 60);
    if (hoursLate < NOSHOW_GRACE_HOURS) continue;

    overdue.push({ id: b.id, client: b.client_name, hoursLate: Math.round(hoursLate) });

    if (adminPhone) {
      const r = await fetch(`${BASE}/api/send-whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': process.env.INTERNAL_API_SECRET || '',
        },
        body: JSON.stringify({
          to: adminPhone,
          template: 'noshow_alert',
          data: {
            clientName: b.client_name,
            service: b.service_name,
            date: b.scheduled_date,
            time: b.scheduled_time,
            suburb: b.suburb || b.address,
            hours: Math.round(hoursLate),
            status: b.status,
            assigned: !!b.mechanic_id,
            bookingId: b.id,
          },
        }),
      }).catch((e) => ({ ok: false, _err: e.message }));
      if (r.ok) alerted++;
      else logSendFailure('noshow', r, b.id);
    }
    await sb.from('bookings').update({ noshow_alert_sent: true }).eq('id', b.id);
  }
  return res.status(200).json({ overdue: overdue.length, alerted, bookings: overdue });
}

// ── Service reminders ─────────────────────────────────────────────────────────
// ── Orphan payments (?type=orphan-payments) ─────────────────────────────────
// The $20 call-out is charged BEFORE the booking row is written. If
// create-booking then fails and the client closes the app instead of pressing
// Pay again, Stripe has the money and there is no booking, no confirmation
// email and no WhatsApp. Diego never finds out; the client does (PENDIENTES
// 12.3).
//
// Stripe is the source of truth for payments and bookings is the source of
// truth for bookings, so this needs no table of its own: sweep one, cross-check
// the other. Dedup lives in the PaymentIntent's own metadata, which is
// writable - without it this would re-alert about the same payment every day.
const ORPHAN_GRACE_MINUTES = 15; // a booking mid-flight is not an orphan
const ORPHAN_LOOKBACK_HOURS = 48;

// Exported so the filtering can be tested without a Stripe account. Every
// false here is a payment we must NOT wake Diego about; every true is a
// payment that still has to be checked against the bookings table.
export function isOrphanCandidate(pi, { nowSeconds, graceMinutes = ORPHAN_GRACE_MINUTES } = {}) {
  if (!pi || pi.status !== 'succeeded') return false;
  if (!(pi.amount_received > 0)) return false;
  // Inside the grace window the booking may simply still be being written.
  if (pi.created > nowSeconds - graceMinutes * 60) return false;
  // Refunded already, e.g. handleCreateBooking's out-of-zone path: money taken
  // and given back is not money kept without a booking. `charges` was dropped
  // from the PaymentIntent object in newer Stripe API versions, so read
  // latest_charge and fall back rather than trusting either one to exist.
  const charge = pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  if (charge && (charge.refunded || charge.amount_refunded > 0)) return false;
  if (pi.charges?.data?.some((c) => c.refunded || c.amount_refunded > 0)) return false;
  if (pi.invoice) return false; // subscription invoices, not call-out fees
  if (pi.metadata?.giftCard === 'true') return false;
  if (pi.metadata?.orphan_alerted) return false; // Diego has already been told
  return true;
}

async function handleOrphanPayments(req, res) {
  if (!process.env.STRIPE_SECRET_KEY)
    return res.status(200).json({ skipped: 'no STRIPE_SECRET_KEY' });

  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sb = makeSb();

  const nowSeconds = Math.floor(Date.now() / 1000);
  const since = nowSeconds - ORPHAN_LOOKBACK_HOURS * 3600;

  let intents;
  try {
    intents = await stripe.paymentIntents.list({
      created: { gte: since },
      limit: 100,
      expand: ['data.latest_charge'], // so a refund is visible without a second call
    });
  } catch (e) {
    console.error('[orphan-payments] could not list from Stripe:', e.message);
    return res.status(502).json({ error: e.message });
  }

  const candidates = (intents.data || []).filter((pi) => isOrphanCandidate(pi, { nowSeconds }));

  if (!candidates.length)
    return res.status(200).json({ checked: intents.data?.length || 0, orphans: 0 });

  // One query for all of them rather than one per payment.
  const ids = candidates.map((pi) => pi.id);
  const { data: matched, error } = await sb
    .from('bookings')
    .select('stripe_payment_intent_id')
    .in('stripe_payment_intent_id', ids);
  if (error) {
    console.error('[orphan-payments] booking lookup failed:', error.message);
    return res.status(500).json({ error: error.message });
  }
  const booked = new Set((matched || []).map((b) => b.stripe_payment_intent_id));
  const orphans = candidates.filter((pi) => !booked.has(pi.id));

  const { data: waRow } = await sb
    .from('van_zones')
    .select('postcode')
    .eq('van_number', 0)
    .eq('suburb', '__whatsapp__')
    .maybeSingle();
  const adminPhone = waRow?.postcode;

  let alerted = 0;
  for (const pi of orphans) {
    const amount = (pi.amount_received / 100).toFixed(2);
    const email = pi.metadata?.email || pi.receipt_email || 'unknown';
    const when = new Date(pi.created * 1000).toISOString().replace('T', ' ').slice(0, 16);
    const msg =
      `ORPHAN PAYMENT: $${amount} AUD charged with no booking behind it.\n` +
      `Client: ${email}\nCharged: ${when} UTC\nStripe: ${pi.id}\n\n` +
      `Either create the booking manually or refund it in Stripe.`;

    if (adminPhone) {
      const r = await fetch(`${BASE}/api/send-whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': process.env.INTERNAL_API_SECRET || '',
        },
        body: JSON.stringify({ to: adminPhone, message: msg }),
      });
      logSendFailure('orphan-payment', r, pi.id);
      if (!r.ok) continue; // no mark, so the next run tries again
    } else {
      console.error('[orphan-payments] no admin WhatsApp configured; not marking', pi.id);
      continue;
    }

    // Marked only after Diego has actually been told.
    try {
      await stripe.paymentIntents.update(pi.id, {
        metadata: { ...pi.metadata, orphan_alerted: String(Math.floor(Date.now() / 1000)) },
      });
    } catch (e) {
      console.error('[orphan-payments] could not mark', pi.id, e.message);
    }
    alerted++;
  }

  return res.status(200).json({
    checked: intents.data?.length || 0,
    orphans: orphans.length,
    alerted,
    ids: orphans.map((pi) => pi.id),
  });
}

async function handleServiceReminders(req, res) {
  const sb = makeSb();
  const now = new Date();
  const results = { sent: 0, errors: 0, date_based: 0, time_based: 0 };

  const toDate = (d) => d.toISOString().split('T')[0];
  const esc = (s) =>
    String(s || '').replace(
      /[<>&"']/g,
      (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]
    );

  async function sendReminder(email, name, serviceName, subject, bodyHtml) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
        to: email,
        subject,
        html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff">
          <div style="background:#0D1F3C;padding:28px 32px;display:flex;align-items:center;gap:12px">
            <img src="https://drbikesydney.com.au/images/logo-db.png" alt="Dr. Bike Sydney" height="28" style="width:auto;display:block">
            <span style="color:#fff;font-size:18px;font-weight:700">Dr. Bike Sydney</span>
          </div>
          <div style="padding:32px">
            ${bodyHtml}
            <div style="margin-top:28px">
              <a href="https://drbikesydney.com.au" style="display:inline-block;background:#2563EB;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700">Book Your Next Service →</a>
            </div>
          </div>
          <div style="padding:16px 32px;background:#F8FAFC;font-size:12px;color:#94A3B8;text-align:center">
            Dr. Bike Sydney · <a href="mailto:contact@drbikesydney.com.au" style="color:#475569;text-decoration:none">contact@drbikesydney.com.au</a> · 0433 963 250
          </div>
        </div>`,
      }),
    }).catch((e) => ({ ok: false, _err: e.message }));
    if (!r.ok) logSendFailure('service-reminder', r, email);
    return r.ok;
  }

  try {
    // ── Priority 1: bookings where mechanic set a next_service_date in next 7 days ──
    const in7days = new Date(now);
    in7days.setDate(in7days.getDate() + 7);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data: dateBased } = await sb
      .from('bookings')
      .select(
        'id, service_name, scheduled_date, next_service_date, client_email, client_name, client_id'
      )
      .eq('status', 'completed')
      .not('next_service_date', 'is', null)
      .is('next_service_reminder_sent', null)
      .gte('next_service_date', toDate(tomorrow))
      .lte('next_service_date', toDate(in7days));

    for (const b of dateBased || []) {
      const email = b.client_email;
      if (!email) continue;
      const name = esc(b.client_name?.split(' ')[0] || 'there');
      const svc = esc(b.service_name || 'service');
      const dateLabel = new Date(b.next_service_date).toLocaleDateString('en-AU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      const daysLeft = Math.ceil((new Date(b.next_service_date) - now) / (1000 * 60 * 60 * 24));
      const ok = await sendReminder(
        email,
        name,
        svc,
        `Your mechanic recommends a service soon — ${dateLabel}`,
        `<h2 style="color:#0D1F3C;margin:0 0 12px">Hi ${name}!</h2>
         <p style="color:#475569;line-height:1.7;margin:0 0 16px">
           Your mechanic recommended scheduling your next <strong>${svc}</strong> service soon.
           ${daysLeft <= 2 ? '<br><span style="color:#CF2020;font-weight:600">Your recommended service date is in ' + daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + '.</span>' : 'The recommended date is in <strong>' + daysLeft + ' days</strong> (' + dateLabel + ').'}
         </p>
         <div style="background:#EEF3FC;border-left:3px solid #2563EB;padding:12px 16px;border-radius:0 8px 8px 0;font-size:13px;color:#2563EB">
           Regular servicing keeps your bike safe and extends the life of components.
         </div>`
      );
      if (ok) {
        await sb
          .from('bookings')
          .update({ next_service_reminder_sent: now.toISOString() })
          .eq('id', b.id);
        results.date_based++;
        results.sent++;
      } else results.errors++;
    }

    // ── Priority 2: time-based fallback (no next_service_date set) ──────────────
    const cutoff = (months) => {
      const d = new Date(now);
      d.setMonth(d.getMonth() - months);
      return d;
    };
    const GROUPS = [
      { filter: '%Tune-Up%', months: 6 },
      { filter: '%Standard%', months: 9 },
      { filter: '%Major%', months: 12 },
      { filter: '%Ultimate%', months: 12 },
      { filter: '%Overhaul%', months: 12 },
    ];

    for (const { filter, months } of GROUPS) {
      const c = cutoff(months);
      const windowStart = new Date(c);
      windowStart.setDate(windowStart.getDate() - 4);
      const windowEnd = new Date(c);
      windowEnd.setDate(windowEnd.getDate() + 4);

      const { data } = await sb
        .from('bookings')
        .select('id, service_name, scheduled_date, client_email, client_name')
        .eq('status', 'completed')
        .is('next_service_date', null)
        .is('next_service_reminder_sent', null)
        .ilike('service_name', filter)
        .gte('scheduled_date', toDate(windowStart))
        .lte('scheduled_date', toDate(windowEnd));

      for (const b of data || []) {
        const email = b.client_email;
        if (!email) continue;
        const name = esc(b.client_name?.split(' ')[0] || 'there');
        const svc = esc(b.service_name || 'service');
        const ok = await sendReminder(
          email,
          name,
          svc,
          `Time for your next bike service — ${months} months since your ${svc}`,
          `<h2 style="color:#0D1F3C;margin:0 0 12px">Hi ${name}, time for a service! 🔧</h2>
           <p style="color:#475569;line-height:1.7;margin:0 0 16px">
             It's been about <strong>${months} months</strong> since your <strong>${svc}</strong>.
             Regular servicing keeps your bike running smoothly and prevents costly repairs.
           </p>
           <div style="background:#EEF3FC;border-left:3px solid #2563EB;padding:12px 16px;border-radius:0 8px 8px 0;font-size:13px;color:#2563EB">
             Book now and we'll come to you — home, office or local park across Sydney.
           </div>`
        );
        if (ok) {
          await sb
            .from('bookings')
            .update({ next_service_reminder_sent: now.toISOString() })
            .eq('id', b.id);
          results.time_based++;
          results.sent++;
        } else results.errors++;
      }
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  return res.status(200).json({ success: true, ...results });
}

// ── Upsell email (?type=upsell) ──────────────────────────────────────────────
async function handleUpsell(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { bookingId, criticalItems } = req.body || {};
  if (!bookingId || !Array.isArray(criticalItems) || !criticalItems.length)
    return res.status(400).json({ error: 'bookingId and criticalItems required' });

  const ITEMS = {
    brakes_front: {
      label: 'Front brake pads',
      price: 45,
      desc: 'Worn front brake pads — replacing now prevents rotor damage.',
    },
    brakes_rear: {
      label: 'Rear brake pads',
      price: 45,
      desc: 'Rear brake pads are due for replacement.',
    },
    chain: {
      label: 'Chain replacement',
      price: 55,
      desc: 'Chain is stretched and will damage cassette soon.',
    },
    cassette: {
      label: 'Cassette replacement',
      price: 95,
      desc: 'Cassette cogs are worn — best replaced with new chain.',
    },
    cables: {
      label: 'Cable set (gear + brake)',
      price: 65,
      desc: 'Cables are frayed — replacing improves shifting and braking.',
    },
    tyres: {
      label: 'Tyre replacement (pair)',
      price: 120,
      desc: 'Tyres cracked or worn — safety concern.',
    },
    wheels: {
      label: 'Wheel true & tension',
      price: 40,
      desc: 'Wheels out of true — affects handling.',
    },
    bb: {
      label: 'Bottom bracket service',
      price: 70,
      desc: 'Bottom bracket has play — replace before it seizes.',
    },
    headset: {
      label: 'Headset overhaul',
      price: 55,
      desc: 'Headset has play — affects steering safety.',
    },
  };

  const sb = makeSb();
  const { data: booking } = await sb
    .from('bookings')
    .select('service_name, profiles(email, full_name)')
    .eq('id', bookingId)
    .single();
  if (!booking?.profiles?.email) return res.status(404).json({ error: 'Booking not found' });

  const email = booking.profiles.email;
  const name = (booking.profiles.full_name?.split(' ')[0] || 'there').replace(/[<>&"']/g, '');
  const rows = criticalItems
    .filter((i) => ITEMS[i])
    .map((i) => {
      const u = ITEMS[i];
      return `<tr><td style="padding:10px 12px;border-bottom:1px solid #E2E8F0"><strong>${u.label}</strong><br><span style="font-size:12px;color:#475569">${u.desc}</span></td><td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;text-align:right;font-weight:700;color:#0A58CA">$${u.price}</td></tr>`;
    })
    .join('');
  if (!rows) return res.status(200).json({ success: true, sent: false });

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
      to: email,
      subject: `Your mechanic found items needing attention — ${booking.service_name || 'your service'}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
        <div style="background:#0D1F3C;padding:24px;text-align:center"><h1 style="color:#fff;font-size:20px;margin:0">DR BIKE SYDNEY</h1></div>
        <div style="padding:32px 24px">
          <h2 style="color:#0D1F3C">Hi ${name}, your mechanic found some things that need attention 🔧</h2>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;border:1px solid #E2E8F0"><thead><tr style="background:#F8FAFC"><th style="padding:10px 12px;text-align:left;font-size:13px;color:#475569">Recommended Service</th><th style="padding:10px 12px;text-align:right;font-size:13px;color:#475569">Price</th></tr></thead><tbody>${rows}</tbody></table>
          <p style="color:#475569;line-height:1.7;font-size:14px">Call <a href="tel:+61433963250">0433 963 250</a> to add these to your current service.</p>
          <a href="https://drbikesydney.com.au" style="display:inline-block;background:#0A58CA;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700">Book Follow-Up →</a>
        </div>
        <div style="padding:16px;background:#F8FAFC;font-size:12px;color:#94A3B8;text-align:center">Dr. Bike Sydney · contact@drbikesydney.com.au</div>
      </div>`,
    }),
  });
  return res.status(resp.ok ? 200 : 500).json({ success: resp.ok, sent: resp.ok });
}

// ── B2B fleet enquiry (?type=b2b) ────────────────────────────────────────────
async function handleB2B(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email } = req.body || {};
  let { businessName, contactName, phone, fleetSize, frequency, notes } = req.body || {};
  if (!businessName || !contactName || !email || !fleetSize)
    return res.status(400).json({ error: 'Missing required fields' });

  // Bot check - each enquiry sends 2 Resend emails (one to Diego, one echo to
  // the submitted address, which spammers can point at anyone). The fleet form
  // posts FormData entries, so the implicit Turnstile widget's hidden input
  // arrives under its default cf-turnstile-response name.
  if (!(await verifyTurnstile(req, req.body?.['cf-turnstile-response']))) {
    return res.status(403).json({ error: 'Verification failed - please try again' });
  }

  const esc = (s) =>
    String(s || '').replace(
      /[<>&"']/g,
      (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]
    );
  businessName = esc(businessName);
  contactName = esc(contactName);
  phone = esc(phone);
  fleetSize = esc(fleetSize);
  frequency = esc(frequency || '');
  notes = esc(notes || '');

  const send = async (payload) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

  try {
    await send({
      from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
      to: 'contact@drbikesydney.com.au',
      subject: `New B2B Fleet Enquiry — ${businessName} (${fleetSize} bikes)`,
      html: `<h2>New B2B Fleet Enquiry</h2><table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px;border-bottom:1px solid #E2E8F0;font-weight:600">Business</td><td style="padding:8px;border-bottom:1px solid #E2E8F0">${businessName}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #E2E8F0;font-weight:600">Contact</td><td style="padding:8px;border-bottom:1px solid #E2E8F0">${contactName}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #E2E8F0;font-weight:600">Email</td><td style="padding:8px;border-bottom:1px solid #E2E8F0">${email}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #E2E8F0;font-weight:600">Fleet / Frequency</td><td style="padding:8px;border-bottom:1px solid #E2E8F0">${fleetSize} bikes · ${frequency || 'N/A'}</td></tr>
        <tr><td style="padding:8px;font-weight:600">Notes</td><td style="padding:8px">${notes || 'N/A'}</td></tr>
      </table><p style="color:#475569;margin-top:16px">Reply within 2 business hours.</p>`,
    });
    await send({
      from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
      to: email,
      subject: `We received your fleet enquiry — Dr. Bike Sydney`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
        <div style="background:#0D1F3C;padding:24px;text-align:center"><h1 style="color:#fff;font-size:20px;margin:0">DR BIKE SYDNEY</h1></div>
        <div style="padding:32px 24px">
          <h2>Thanks for your enquiry, ${contactName}!</h2>
          <p style="color:#475569;line-height:1.7">We received your fleet enquiry for <strong>${businessName}</strong> (${fleetSize} bikes). We'll get back to you within <strong>2 business hours</strong> (Mon–Sat 8am–6pm AEST).</p>
        </div>
        <div style="padding:16px;background:#F8FAFC;font-size:12px;color:#94A3B8;text-align:center">Dr. Bike Sydney · contact@drbikesydney.com.au</div>
      </div>`,
    });
  } catch (e) {
    console.error('[b2b]', e.message);
  }
  return res.status(200).json({ success: true });
}

// ── Router ────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const type = req.query?.type || req.body?.type;

  // Public, browser-triggered types - never gated by CRON_SECRET.
  if (type === 'b2b') return handleB2B(req, res);
  if (type === 'upsell') return handleUpsell(req, res);

  // Everything below only ever runs on Vercel's own cron schedule.
  if (checkSecret(req, res)) return;

  if (type === 'birthday') return handleBirthday(req, res);
  if (type === 'reengagement') return handleReengagement(req, res);
  if (type === 'abandoned') return handleAbandoned(req, res);
  if (type === 'abandoned-checkout') return handleAbandonedCheckout(req, res);
  if (type === 'service') return handleServiceReminders(req, res);
  if (type === 'advance') return handleAdvanceReminders(req, res);
  if (type === 'noshow') return handleNoShowWatch(req, res);
  if (type === 'orphan-payments') return handleOrphanPayments(req, res);

  // Consolidated daily cron: runs all background jobs in sequence
  if (type === 'all') {
    const wrap = (fn) =>
      new Promise((resolve) => {
        const mockRes = {
          _data: null,
          status(c) {
            this._code = c;
            return this;
          },
          json(d) {
            this._data = d;
            resolve({ code: this._code, ...d });
          },
        };
        fn(req, mockRes).catch((e) => resolve({ error: e.message }));
      });
    const [
      birthday,
      reengagement,
      abandoned,
      abandonedCheckout,
      service,
      advance,
      noshow,
      orphanPayments,
    ] = await Promise.allSettled([
      wrap((r) => handleBirthday(req, r)),
      wrap((r) => handleReengagement(req, r)),
      wrap((r) => handleAbandoned(req, r)),
      wrap((r) => handleAbandonedCheckout(req, r)),
      wrap((r) => handleServiceReminders(req, r)),
      wrap((r) => handleAdvanceReminders(req, r)),
      wrap((r) => handleNoShowWatch(req, r)),
      wrap((r) => handleOrphanPayments(req, r)),
    ]);
    return res.status(200).json({
      birthday: birthday.value || birthday.reason?.message,
      reengagement: reengagement.value || reengagement.reason?.message,
      abandoned: abandoned.value || abandoned.reason?.message,
      abandonedCheckout: abandonedCheckout.value || abandonedCheckout.reason?.message,
      service: service.value || service.reason?.message,
      advance: advance.value || advance.reason?.message,
      noshow: noshow.value || noshow.reason?.message,
      orphanPayments: orphanPayments.value || orphanPayments.reason?.message,
    });
  }

  return res.status(400).json({
    error:
      'Missing ?type= (birthday|reengagement|abandoned|abandoned-checkout|service|upsell|b2b|all)',
  });
}
