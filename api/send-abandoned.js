import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://tgpipbloisahufaywhqb.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);
const BASE = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://drbikesydney.com.au';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = (req.headers.authorization || '').replace('Bearer ', '') || req.query?.key;
    if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  }

  // Bookings pending for 1-24h, no recovery sent yet
  const now = new Date();
  const oneHourAgo  = new Date(now - 60 * 60 * 1000).toISOString();
  const oneDayAgo   = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const { data: bookings, error } = await sb
    .from('bookings')
    .select('id, client_email, client_name, service_name, service_price, scheduled_date, scheduled_time, address')
    .eq('status', 'pending')
    .or('abandoned_recovery_sent.is.null,abandoned_recovery_sent.eq.false')
    .lte('created_at', oneHourAgo)
    .gte('created_at', oneDayAgo);

  if (error) return res.status(500).json({ error: error.message });
  if (!bookings?.length) return res.status(200).json({ sent: 0, message: 'No abandoned bookings' });

  let sent = 0;
  for (const b of bookings) {
    if (!b.client_email) continue;
    const name = b.client_name || b.client_email.split('@')[0];
    const dateLabel = b.scheduled_date
      ? new Date(b.scheduled_date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
      : '';

    // Email
    const emailRes = await fetch(`${BASE}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-token': process.env.INTERNAL_API_SECRET || '' },
      body: JSON.stringify({
        to: b.client_email, name, service: b.service_name,
        date: dateLabel, time: b.scheduled_time, price: b.service_price || 0,
        bookingId: b.id, type: 'abandoned_recovery',
      }),
    }).catch(() => ({ ok: false }));

    if (emailRes.ok) {
      await sb.from('bookings').update({ abandoned_recovery_sent: true }).eq('id', b.id);
      sent++;
    }
  }

  return res.status(200).json({ sent, checked: bookings.length });
}
