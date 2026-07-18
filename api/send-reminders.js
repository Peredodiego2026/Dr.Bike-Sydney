// Also handles ?type=2h (2h-before reminders, formerly send-2h-reminders.js).
// Vercel cron for 2h reminders calls /api/send-reminders?type=2h
import { createClient } from '@supabase/supabase-js';
import { guard } from './_security.js';

const sb = createClient(
  'https://tgpipbloisahufaywhqb.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);

// Convert Sydney local date+time to UTC Date (DST-aware)
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

async function handle2hReminders(req, res) {
  // Allow both GET (cron) and POST (manual)
  if (req.method !== 'GET' && req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = (req.headers.authorization || '').replace('Bearer ', '') || req.query?.key;
    if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = Date.now();
  const WINDOW_MIN = 60; // cron now runs hourly
  const targetMs = 2 * 60 * 60 * 1000;
  const lo = now + targetMs - (WINDOW_MIN * 60 * 1000) / 2;
  const hi = now + targetMs + (WINDOW_MIN * 60 * 1000) / 2;
  const today = new Date().toISOString().slice(0, 10);

  const { data: bookings, error } = await sb
    .from('bookings')
    .select(
      'id, client_email, client_name, service_name, service_price, scheduled_date, scheduled_time, address'
    )
    .in('status', ['confirmed', 'pending'])
    .gte('scheduled_date', today)
    .or('reminder_2h_sent.is.null,reminder_2h_sent.eq.false');

  if (error) return res.status(500).json({ error: error.message });
  if (!bookings?.length) return res.status(200).json({ sent: 0, message: 'No bookings due' });

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://drbikesydney.com.au';
  let sent = 0;
  for (const b of bookings) {
    const when = sydneyLocalToUtc(b.scheduled_date, b.scheduled_time);
    if (!when || when.getTime() < lo || when.getTime() > hi) continue;
    if (!b.client_email) continue;
    const dateLabel = new Date(b.scheduled_date).toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const r = await fetch(`${base}/api/send-email`, {
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
        address: b.address || '',
        price: b.service_price || 0,
        type: 'reminder2h',
        bookingId: b.id,
      }),
    }).catch(() => ({ ok: false }));
    if (r.ok) {
      await sb.from('bookings').update({ reminder_2h_sent: true }).eq('id', b.id);
      sent++;
    }
  }
  return res.status(200).json({ sent, checked: bookings.length });
}

export default async function handler(req, res) {
  // 2h reminders: called by cron as GET /api/send-reminders?type=2h
  if (req.query?.type === '2h') return handle2hReminders(req, res);

  if (await guard(req, res, { rateMax: 30, rateWindow: 60000 })) return;
  // Can be called by a cron job or manually from admin
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  try {
    // Find clients whose last completed booking was 6+ months ago
    const { data: bookings } = await sb
      .from('bookings')
      .select('*, profiles(full_name, email)')
      .eq('status', 'completed')
      .lte('completed_at', sixMonthsAgo.toISOString())
      .order('completed_at', { ascending: false });

    if (!bookings?.length) return res.status(200).json({ sent: 0, message: 'No reminders needed' });

    // Group by client email, take most recent booking per client
    const clientMap = {};
    bookings.forEach((b) => {
      const email = b.profiles?.email;
      if (email && !clientMap[email]) clientMap[email] = b;
    });

    let sent = 0;
    for (const [email, booking] of Object.entries(clientMap)) {
      const name = booking.profiles?.full_name || email.split('@')[0];
      const lastService = new Date(booking.completed_at).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const monthsAgo = Math.floor(
        (Date.now() - new Date(booking.completed_at)) / (1000 * 60 * 60 * 24 * 30)
      );

      await fetch(`${process.env.VERCEL_URL || 'https://drbikesydney.com.au'}/api/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': process.env.INTERNAL_API_SECRET || '',
        },
        body: JSON.stringify({
          to: email,
          name,
          service: booking.service_name,
          type: 'reminder',
          monthsAgo,
          lastService,
          bookingId: booking.id,
        }),
      });
      sent++;
    }

    return res.status(200).json({ sent, message: `Sent ${sent} reminders` });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
