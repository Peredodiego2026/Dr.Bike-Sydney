import { createClient } from '@supabase/supabase-js';
import { guard, verifyTurnstile, SELF_BASE_URL } from './_security.js';
import {
  buildCompletionCalls,
  pendingCalls,
  dispatchCompletionCalls,
  recordCompletionOutcome,
} from './_completion-notify.js';
import { isOrphanCandidate, orphanAction, ORPHAN_REFUND_AFTER_HOURS } from './_orphan-audit.js';
import {
  buildBackup,
  backupSubject,
  backupBody,
  backupFilename,
  MAX_JSON_BYTES,
} from './_backup.js';
import { withSentry } from './_sentry.js';

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
const ORPHAN_LOOKBACK_HOURS = 48;

// The nightly backup is every client's name, phone and address in one file.
// It goes to the owner's own inbox and nowhere else - hardcoded rather than
// configurable, so no env var or admin field can ever redirect it.
const BACKUP_RECIPIENT = 'peredo.dm@gmail.com';

// The filter moved to api/_orphan-audit.js, unchanged, so the admin panel's
// one-off audit over an arbitrary date range and this daily sweep can never
// disagree about what counts as an orphan. Re-exported because
// tests/unit/orphan-payments.test.js imports it from here.
export { isOrphanCandidate };

// ── Completion notifications that did not land ───────────────────────────────
// api/auth.js sends the invoice, the review email and the review SMS itself now
// (14.8 step A), which fixed the mechanic's phone dropping out mid-chain. It did
// not fix OUR side failing: Resend down, Twilio down, the function cut short. In
// that case the client still has no invoice.
//
// So every send writes its outcome onto the booking, and this sweep re-sends
// only the entries that are not 'sent'. Never the ones that landed - a failed
// SMS must not produce a second invoice.
//
// Daily, because Vercel Hobby only allows daily crons (see the header of this
// file). A missing invoice is therefore repaired within a day, not within
// minutes. It can also be triggered by hand at /api/retry-completion.
const COMPLETION_RETRY_LOOKBACK_DAYS = 14;

async function handleCompletionRetry(req, res) {
  const sb = makeSb();
  const since = new Date(Date.now() - COMPLETION_RETRY_LOOKBACK_DAYS * 86400000).toISOString();

  // Toda columna que buildCompletionCalls lee de la fila tiene que estar aca.
  // Una que falte no rompe nada visible: llega `undefined`, y el reintento sale
  // con un dato menos que el envio original. `tracking_token` entro tarde por
  // eso mismo - el link de resena lo lleva desde 2026-09-03 y esta consulta no
  // lo pedia, asi que el reintento le mandaba al invitado el link viejo, el que
  // no lo deja resenar (docs/PENDIENTES.md 89). Lo vigila
  // tests/unit/completion-retry-columns.test.js.
  const { data: rows, error } = await sb
    .from('bookings')
    .select(
      'id, client_name, client_email, client_phone, service_name, service_price, callout_fee, ' +
        'scheduled_date, scheduled_time, address, suburb, discount_applied, parts_charged, ' +
        'tip_amount, mechanic_notes, next_service_date, mechanic_id, tracking_token, ' +
        'completion_notifications'
    )
    .eq('status', 'completed')
    .gte('completed_at', since)
    .not('completion_notifications', 'is', null)
    .limit(200);

  // A missing column means scripts/add-completion-notifications.sql has not been
  // run yet. Say so instead of reporting a clean zero, which is what "the cron
  // returned 200 and sent: 0 every day" looked like the last time (see
  // logSendFailure above).
  if (error) {
    console.error('[completion-retry]', error.message);
    return res.status(200).json({ skipped: 'query failed', detail: error.message });
  }

  const stale = (rows || []).filter((b) =>
    Object.values(b.completion_notifications || {}).some((v) => v !== 'sent')
  );
  if (!stale.length) return res.status(200).json({ checked: rows?.length || 0, retried: 0 });

  // One name lookup for the whole batch rather than one per booking.
  const mechIds = [...new Set(stale.map((b) => b.mechanic_id).filter(Boolean))];
  const names = new Map();
  if (mechIds.length) {
    const { data: mechs } = await sb
      .from('escalation_contacts')
      .select('id, first_name, last_name')
      .in('id', mechIds);
    (mechs || []).forEach((m) =>
      names.set(m.id, [m.first_name, m.last_name].filter(Boolean).join(' ').trim())
    );
  }

  let recovered = 0;
  let stillFailing = 0;
  for (const b of stale) {
    const calls = pendingCalls(
      buildCompletionCalls({
        booking: b,
        mechanicName: names.get(b.mechanic_id) || '',
        partsCharged: b.parts_charged,
        tipAmount: b.tip_amount,
        mechanicNotes: b.mechanic_notes,
        nextServiceDate: b.next_service_date,
      }),
      b.completion_notifications
    );
    if (!calls.length) continue;
    const summary = await dispatchCompletionCalls(calls, {
      baseUrl: BASE,
      internalToken: process.env.INTERNAL_API_SECRET,
      bookingId: b.id,
    });
    recovered += summary.sent.length;
    stillFailing += summary.failed.length;
    await recordCompletionOutcome({
      bookingId: b.id,
      // Merge, never replace: the entries that succeeded on the first attempt
      // are not in this batch and must keep their 'sent'.
      outcome: { ...b.completion_notifications, ...summary.outcome },
      supabaseUrl: SB_URL,
      sbHdr: {
        apikey: process.env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
    });
  }

  if (stillFailing) {
    console.error('[completion-retry] still failing after retry:', stillFailing, 'notifications');
  }
  return res
    .status(200)
    .json({ checked: rows.length, bookings: stale.length, recovered, stillFailing });
}

// ── Nightly off-site backup (?type=backup) ──────────────────────────────────
// The Supabase Free plan includes NO backups - confirmed from the dashboard on
// 2026-08-30: "Free Plan does not include project backups". Not "backups
// nobody has restored": none at all. So the whole database is dumped to JSON
// every night and emailed to Diego, which puts a copy OUTSIDE Supabase and
// therefore outside whatever kills the project.
//
// A stopgap, not point-in-time recovery, and the email body says so. It goes
// to the admin address only: the file is every client's name, phone and
// address, so it must never be sent anywhere else.
async function handleBackup(req, res) {
  if (!process.env.RESEND_API_KEY) return res.status(200).json({ skipped: 'no RESEND_API_KEY' });
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) return res.status(200).json({ skipped: 'no SUPABASE_SERVICE_KEY' });

  // The service key bypasses RLS, which is the point: a backup that only saw
  // what an anonymous visitor sees would save nothing at all.
  const fetchPage = async (table, offset, limit) => {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/${table}?select=*&offset=${offset}&limit=${limit}`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      });
      if (!r.ok)
        return { rows: null, error: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
      return { rows: await r.json() };
    } catch (e) {
      return { rows: null, error: e.message };
    }
  };

  const out = await buildBackup({ fetchPage });

  if (out.bytes > MAX_JSON_BYTES) {
    // Sending it anyway means Resend rejects the message and the backup fails
    // silently at 9am. Say so loudly instead - at this size the answer is a
    // plan with real backups, not a bigger email.
    const mb = (out.bytes / 1024 / 1024).toFixed(1);
    await sendBackupEmail({
      subject: `[!] Dr. Bike backup NO ENVIADO - ${mb} MB, demasiado grande`,
      body:
        `La base ya pesa ${mb} MB y no entra en un email.\n\n` +
        `El backup por correo dejo de alcanzar. Hay que pasar a un plan con\n` +
        `backups de verdad (Supabase Pro) o exportar a otro lado.\n\n` +
        `MIENTRAS TANTO NO HAY NINGUNA COPIA DE HOY.\n`,
      attachment: null,
    });
    return res.status(200).json({ skipped: 'too large', bytes: out.bytes });
  }

  const sent = await sendBackupEmail({
    subject: backupSubject({ ...out, date: new Date() }),
    body: backupBody(out),
    attachment: {
      filename: backupFilename(),
      content: Buffer.from(out.json, 'utf8').toString('base64'),
    },
  });

  if (!sent.ok) {
    // A backup that failed to send but reported success is the exact problem
    // this endpoint exists to avoid.
    console.error('[backup] email failed:', sent.error);
    return res.status(500).json({ error: sent.error, bytes: out.bytes });
  }

  return res.status(200).json({
    ok: true,
    complete: out.complete,
    rows: out.totalRows,
    bytes: out.bytes,
    errors: out.errors,
  });
}

async function sendBackupEmail({ subject, body, attachment }) {
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
        to: [BACKUP_RECIPIENT],
        subject,
        text: body,
        ...(attachment ? { attachments: [attachment] } : {}),
      }),
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}: ${(await r.text()).slice(0, 300)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
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

  // ignoreAlerted, deliberately. The default hides anything already carrying
  // `orphan_alerted` so Diego is not woken twice - which also meant a payment
  // he was told about once and never acted on left this cron's sight forever,
  // money kept and nobody looking. They come back in now; orphanAction is what
  // decides that an alerted payment is not re-alerted, and the refund deadline
  // is measured against every orphan, alerted or not.
  const candidates = (intents.data || []).filter((pi) =>
    isOrphanCandidate(pi, { nowSeconds, ignoreAlerted: true })
  );

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
  let refunded = 0;
  let refundedTotal = 0;
  for (const pi of orphans) {
    const action = orphanAction(pi, { nowSeconds });
    // 'done'  - a previous run already gave the money back.
    // 'wait'  - alerted, still inside the deadline; Diego may yet book it.
    if (action === 'done' || action === 'wait') continue;

    const amount = (pi.amount_received / 100).toFixed(2);
    const email = pi.metadata?.email || pi.receipt_email || 'unknown';
    const when = new Date(pi.created * 1000).toISOString().replace('T', ' ').slice(0, 16);
    let msg;

    if (action === 'refund') {
      // The refund happens FIRST and does not depend on the WhatsApp going
      // out. This used to be the other way round: no admin number configured,
      // or Twilio having a bad morning, meant `continue` - no alert, no mark,
      // no refund, and a console.error nobody reads. Whether a client gets
      // their own money back cannot hang on whether a message to Diego sent.
      try {
        await stripe.refunds.create({ payment_intent: pi.id });
      } catch (e) {
        // Left unmarked on purpose so tomorrow's run tries again. Giving up
        // quietly here is the failure this whole handler exists to end.
        console.error('[orphan-payments] refund FAILED for', pi.id, e.message);
        continue;
      }
      refunded++;
      refundedTotal += pi.amount_received / 100;

      // Belt and braces. If this mark fails the refund still stands, and
      // isOrphanCandidate filters the payment out tomorrow anyway once Stripe
      // reports latest_charge.refunded - two independent reasons not to
      // double-refund.
      try {
        await stripe.paymentIntents.update(pi.id, {
          metadata: { ...pi.metadata, orphan_refunded: String(Math.floor(Date.now() / 1000)) },
        });
      } catch (e) {
        console.error('[orphan-payments] refunded but could not mark', pi.id, e.message);
      }

      msg =
        `ORPHAN PAYMENT REFUNDED: $${amount} AUD went back to the client.\n` +
        `It was charged with no booking behind it and none appeared within ` +
        `${ORPHAN_REFUND_AFTER_HOURS}h.\n` +
        `Client: ${email}\nCharged: ${when} UTC\nStripe: ${pi.id}\n\n` +
        `Nothing to do. If this was a real job, contact the client and book it again.`;
    } else {
      // "within 24h" was a promise this could not keep: the sweep runs once a
      // day, so the next chance to act is the next run, not a rolling 24h from
      // now. Says what actually happens instead.
      msg =
        `ORPHAN PAYMENT: $${amount} AUD charged with no booking behind it.\n` +
        `Client: ${email}\nCharged: ${when} UTC\nStripe: ${pi.id}\n\n` +
        `Create the booking by hand today, or it refunds itself on the next ` +
        `daily run (never sooner than ${ORPHAN_REFUND_AFTER_HOURS}h after the charge).`;
    }

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

    // Marked only after Diego has actually been told. Only meaningful for an
    // alert - a refund marked itself above, whatever the messaging did.
    if (action === 'alert') {
      try {
        await stripe.paymentIntents.update(pi.id, {
          metadata: { ...pi.metadata, orphan_alerted: String(Math.floor(Date.now() / 1000)) },
        });
      } catch (e) {
        console.error('[orphan-payments] could not mark', pi.id, e.message);
      }
      alerted++;
    }
  }

  return res.status(200).json({
    checked: intents.data?.length || 0,
    orphans: orphans.length,
    alerted,
    refunded,
    refundedTotal: Math.round(refundedTotal * 100) / 100,
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
async function handler(req, res) {
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
  if (type === 'backup') return handleBackup(req, res);
  if (type === 'completion-retry') return handleCompletionRetry(req, res);

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
      completionRetry,
      backup,
    ] = await Promise.allSettled([
      wrap((r) => handleBirthday(req, r)),
      wrap((r) => handleReengagement(req, r)),
      wrap((r) => handleAbandoned(req, r)),
      wrap((r) => handleAbandonedCheckout(req, r)),
      wrap((r) => handleServiceReminders(req, r)),
      wrap((r) => handleAdvanceReminders(req, r)),
      wrap((r) => handleNoShowWatch(req, r)),
      wrap((r) => handleOrphanPayments(req, r)),
      wrap((r) => handleCompletionRetry(req, r)),
      // Last on purpose: it reads every table, so it sees the state after
      // the other jobs have finished writing rather than halfway through.
      wrap((r) => handleBackup(req, r)),
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
      completionRetry: completionRetry.value || completionRetry.reason?.message,
      backup: backup.value || backup.reason?.message,
    });
  }

  return res.status(400).json({
    error:
      'Missing ?type= (birthday|reengagement|abandoned|abandoned-checkout|service|upsell|b2b|completion-retry|all)',
  });
}

// Un error aca no puede quedar solo en los logs de Vercel, que nadie mira.
// Punto 20 de la auditoria: hasta el 2026-09-01 este archivo podia fallar en
// produccion sin dejar rastro en ningun lado accionable.
export default withSentry(handler, 'send-cron');
