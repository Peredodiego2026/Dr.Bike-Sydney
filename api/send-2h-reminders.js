import { createClient } from '@supabase/supabase-js';

// Sends an email reminder ~2 hours before each upcoming booking.
// Designed to be hit by a Vercel Cron every 15 minutes.
// Uses a tolerance window so no booking is missed between cron runs,
// and a `reminder_2h_sent` flag so each booking is reminded only once.

const sb = createClient(
  'https://tgpipbloisahufaywhqb.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);

// Build a Date (UTC) from a Sydney local date "YYYY-MM-DD" + time "HH:MM" (24h).
// Sydney is UTC+10 (AEST) or UTC+11 (AEDT). We compute the offset for that date.
function sydneyLocalToUtc(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const t = timeStr.trim();
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [hh, mm] = [parseInt(m[1], 10), parseInt(m[2], 10)];
  const [Y, Mo, D] = dateStr.split('-').map(n => parseInt(n, 10));
  if (!Y || !Mo || !D) return null;
  // Determine Sydney's UTC offset on that date using Intl (DST-aware).
  const probe = new Date(Date.UTC(Y, Mo - 1, D, hh, mm));
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Australia/Sydney', timeZoneName: 'shortOffset'
  });
  const part = fmt.formatToParts(probe).find(p => p.type === 'timeZoneName');
  let offsetHours = 10; // fallback AEST
  if (part) {
    const om = part.value.match(/GMT([+-]\d{1,2})/);
    if (om) offsetHours = parseInt(om[1], 10);
  }
  // Sydney local time minus offset = UTC
  return new Date(Date.UTC(Y, Mo - 1, D, hh - offsetHours, mm));
}

export default async function handler(req, res) {
  // Allow Vercel Cron (GET) and manual admin trigger (POST).
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Optional shared-secret check for the cron.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || '';
    const provided = auth.replace('Bearer ', '') || req.query?.key;
    if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = Date.now();
    const WINDOW_MIN = 15;          // cron runs every 15 min
    const targetMs = 2 * 60 * 60 * 1000; // 2 hours
    const lo = now + targetMs - (WINDOW_MIN * 60 * 1000) / 2;
    const hi = now + targetMs + (WINDOW_MIN * 60 * 1000) / 2;

    // Pull upcoming, still-active bookings not yet reminded.
    const today = new Date().toISOString().slice(0, 10);
    const { data: bookings, error } = await sb
      .from('bookings')
      .select('id, client_email, client_name, service_name, service_price, scheduled_date, scheduled_time, address, status, reminder_2h_sent')
      .in('status', ['confirmed', 'pending'])
      .gte('scheduled_date', today)
      .or('reminder_2h_sent.is.null,reminder_2h_sent.eq.false');

    if (error) return res.status(500).json({ error: error.message });
    if (!bookings?.length) return res.status(200).json({ sent: 0, message: 'No bookings due' });

    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://drbikesydney.com.au';

    let sent = 0;
    const errors = [];

    for (const b of bookings) {
      const when = sydneyLocalToUtc(b.scheduled_date, b.scheduled_time);
      if (!when) continue;
      const ms = when.getTime();
      if (ms < lo || ms > hi) continue; // not ~2h away right now
      if (!b.client_email) continue;

      const dateLabel = new Date(b.scheduled_date).toLocaleDateString('en-AU', {
        weekday: 'short', day: 'numeric', month: 'short'
      });

      try {
        const r = await fetch(`${base}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: b.client_email,
            name: b.client_name || b.client_email.split('@')[0],
            service: b.service_name,
            date: dateLabel,
            time: b.scheduled_time,
            address: b.address || '',
            price: b.service_price || 0,
            type: 'reminder2h',
            bookingId: b.id
          })
        });
        if (r.ok) {
          await sb.from('bookings').update({ reminder_2h_sent: true }).eq('id', b.id);
          sent++;
        } else {
          errors.push({ id: b.id, status: r.status });
        }
      } catch (e) {
        errors.push({ id: b.id, error: e.message });
      }
    }

    return res.status(200).json({ sent, checked: bookings.length, errors });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
