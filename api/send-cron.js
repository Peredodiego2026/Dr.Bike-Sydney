import { createClient } from '@supabase/supabase-js';
import { guard } from './_security.js';

// api/send-cron.js — All scheduled/cron email jobs in one function
// Routes: ?type=birthday | reengagement | abandoned | service
// Cron schedule (vercel.json):
//   birthday:     0 8 * * *   (daily 8am UTC)
//   reengagement: 0 10 * * 1  (weekly Mon 10am)
//   abandoned:    0 * * * *   (hourly)
//   service:      0 9 1 * *   (monthly 1st)

const SB_URL = 'https://tgpipbloisahufaywhqb.supabase.co';
const BASE    = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://drbikesydney.com.au';

function makeSb() {
  return createClient(SB_URL, process.env.SUPABASE_SERVICE_KEY);
}

function checkSecret(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = (req.headers.authorization || '').replace('Bearer ', '') || req.query?.key;
  if (provided !== secret) { res.status(401).json({ error: 'Unauthorized' }); return true; }
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
    .select('id, full_name, email, birthday, birthday_promo_sent_year')
    .not('birthday', 'is', null).not('email', 'is', null);

  if (error) return res.status(500).json({ error: error.message });

  const targets = (profiles || []).filter(p => {
    const [, bMm, bDd] = (p.birthday || '').split('-');
    return bMm === mm && bDd === dd && p.birthday_promo_sent_year !== thisYear;
  });

  let sent = 0;
  for (const p of targets) {
    const r = await fetch(`${BASE}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-token': process.env.INTERNAL_API_SECRET || '' },
      body: JSON.stringify({ to: p.email, name: p.full_name || p.email.split('@')[0], type: 'birthday_promo' })
    }).catch(() => ({ ok: false }));
    if (r.ok) { await sb.from('profiles').update({ birthday_promo_sent_year: thisYear }).eq('id', p.id); sent++; }
  }
  return res.status(200).json({ sent, checked: targets.length });
}

// ── Reengagement ──────────────────────────────────────────────────────────────
async function handleReengagement(req, res) {
  const sb = makeSb();
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  const { data: bookings, error } = await sb
    .from('bookings').select('client_email, client_name, service_name, completed_at')
    .eq('status', 'completed').lte('completed_at', twelveMonthsAgo.toISOString())
    .order('completed_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const clientMap = {};
  for (const b of (bookings || [])) {
    if (b.client_email && !clientMap[b.client_email]) clientMap[b.client_email] = b;
  }

  const { data: recent } = await sb.from('bookings').select('client_email')
    .gt('completed_at', twelveMonthsAgo.toISOString());
  const recentEmails = new Set((recent || []).map(b => b.client_email).filter(Boolean));

  const targetEmails = Object.keys(clientMap).filter(e => !recentEmails.has(e));
  if (!targetEmails.length) return res.status(200).json({ sent: 0, message: 'No targets' });

  const { data: profiles } = await sb.from('profiles').select('email, reengagement_sent_at').in('email', targetEmails);
  const sentRecently = new Set((profiles || []).filter(p => {
    if (!p.reengagement_sent_at) return false;
    return (Date.now() - new Date(p.reengagement_sent_at).getTime()) < 365 * 24 * 60 * 60 * 1000;
  }).map(p => p.email));

  const finalTargets = targetEmails.filter(e => !sentRecently.has(e));
  let sent = 0;
  for (const email of finalTargets) {
    const b = clientMap[email];
    const monthsAgo = Math.floor((Date.now() - new Date(b.completed_at).getTime()) / (1000*60*60*24*30));
    const r = await fetch(`${BASE}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-token': process.env.INTERNAL_API_SECRET || '' },
      body: JSON.stringify({ to: email, name: b.client_name || email.split('@')[0], service: b.service_name, type: 'reengagement', monthsAgo })
    }).catch(() => ({ ok: false }));
    if (r.ok) { await sb.from('profiles').update({ reengagement_sent_at: new Date().toISOString() }).eq('email', email); sent++; }
  }
  return res.status(200).json({ sent, checked: finalTargets.length });
}

// ── Abandoned bookings ────────────────────────────────────────────────────────
async function handleAbandoned(req, res) {
  const sb = makeSb();
  const now = new Date();
  const oneHourAgo = new Date(now - 60*60*1000).toISOString();
  const oneDayAgo  = new Date(now - 24*60*60*1000).toISOString();

  const { data: bookings, error } = await sb
    .from('bookings')
    .select('id, client_email, client_name, service_name, service_price, scheduled_date, scheduled_time, address')
    .eq('status', 'pending')
    .or('abandoned_recovery_sent.is.null,abandoned_recovery_sent.eq.false')
    .lte('created_at', oneHourAgo).gte('created_at', oneDayAgo);

  if (error) return res.status(500).json({ error: error.message });

  let sent = 0;
  for (const b of (bookings || [])) {
    if (!b.client_email) continue;
    const dateLabel = b.scheduled_date
      ? new Date(b.scheduled_date).toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' })
      : '';
    const r = await fetch(`${BASE}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-token': process.env.INTERNAL_API_SECRET || '' },
      body: JSON.stringify({ to: b.client_email, name: b.client_name || b.client_email.split('@')[0], service: b.service_name, date: dateLabel, time: b.scheduled_time, price: b.service_price || 0, bookingId: b.id, type: 'abandoned_recovery' })
    }).catch(() => ({ ok: false }));
    if (r.ok) { await sb.from('bookings').update({ abandoned_recovery_sent: true }).eq('id', b.id); sent++; }
  }
  return res.status(200).json({ sent, checked: (bookings||[]).length });
}

// ── Service reminders (6mo Tune-Up, 12mo Major/Ultimate) ─────────────────────
async function handleServiceReminders(req, res) {
  const sb = makeSb();
  const now = new Date();
  const results = { sent: 0, errors: 0 };

  function cutoff(months) { const d = new Date(now); d.setMonth(d.getMonth()-months); return d; }
  function window(d, days=3) { const w = new Date(d); w.setDate(w.getDate()-days); return w; }

  async function processGroup(filter, months) {
    const c = cutoff(months);
    const { data } = await sb.from('bookings')
      .select('id, service_name, scheduled_date, profiles(email, full_name)')
      .eq('status','completed').ilike('service_name', filter)
      .gte('scheduled_date', window(c).toISOString().split('T')[0])
      .lte('scheduled_date', c.toISOString().split('T')[0])
      .is('next_service_reminder_sent', null);

    for (const b of (data||[])) {
      const email = b.profiles?.email;
      if (!email) continue;
      const name = b.profiles?.full_name?.split(' ')[0] || 'there';
      const r = await fetch('https://api.resend.com/emails', {
        method:'POST',
        headers:{ 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type':'application/json' },
        body: JSON.stringify({
          from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
          to: email,
          subject: `Time for your next bike service — ${months} months since your ${b.service_name}`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
            <div style="background:#0D1F3C;padding:24px;text-align:center"><h1 style="color:#fff;font-size:20px;margin:0">DR BIKE SYDNEY</h1></div>
            <div style="padding:32px 24px">
              <h2 style="color:#0D1F3C">Time for your next service! 🚲</h2>
              <p style="color:#374151;line-height:1.7">Hi ${name}, it's been ${months} months since your <strong>${b.service_name}</strong>.</p>
              <a href="https://drbikesydney.com.au" style="display:inline-block;background:#0A58CA;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700">Book Your Next Service →</a>
            </div>
            <div style="padding:16px 24px;background:#F7F8FA;font-size:12px;color:#9CA3AF;text-align:center">Dr. Bike Sydney · contact@drbikesydney.com.au</div>
          </div>`
        })
      });
      if (r.ok) { await sb.from('bookings').update({ next_service_reminder_sent: new Date().toISOString() }).eq('id', b.id); results.sent++; }
      else results.errors++;
    }
  }

  try {
    await processGroup('%Tune-Up%', 6);
    await processGroup('%Major%', 12);
    await processGroup('%Ultimate%', 12);
  } catch(e) { return res.status(500).json({ error: e.message }); }
  return res.status(200).json({ success: true, ...results });
}

// ── Router ────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });
  if (checkSecret(req, res)) return;

  const type = req.query?.type || req.body?.type;
  if (type === 'birthday')     return handleBirthday(req, res);
  if (type === 'reengagement') return handleReengagement(req, res);
  if (type === 'abandoned')    return handleAbandoned(req, res);
  if (type === 'service')      return handleServiceReminders(req, res);
  return res.status(400).json({ error: 'Missing ?type= (birthday|reengagement|abandoned|service)' });
}
