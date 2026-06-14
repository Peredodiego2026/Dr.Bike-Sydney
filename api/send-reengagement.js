import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://tgpipbloisahufaywhqb.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);

const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'https://drbikesydney.com.au';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = (req.headers.authorization || '').replace('Bearer ', '') || req.query?.key;
    if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  }

  // Find clients whose last completed booking was 12+ months ago
  // and haven't received a re-engagement email in the last 12 months
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  const { data: bookings, error } = await sb
    .from('bookings')
    .select('client_email, client_name, service_name, completed_at')
    .eq('status', 'completed')
    .lte('completed_at', twelveMonthsAgo.toISOString())
    .order('completed_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  if (!bookings?.length) return res.status(200).json({ sent: 0, message: 'No inactive clients' });

  // Deduplicate: one email per client, most recent booking
  const clientMap = {};
  for (const b of bookings) {
    if (b.client_email && !clientMap[b.client_email]) clientMap[b.client_email] = b;
  }

  // Exclude clients who have a newer booking (active in last 12 months)
  const { data: recentBookings } = await sb
    .from('bookings')
    .select('client_email')
    .gt('completed_at', twelveMonthsAgo.toISOString());

  const recentEmails = new Set((recentBookings || []).map(b => b.client_email).filter(Boolean));

  // Exclude clients who already got re-engagement email (check profiles)
  const targetEmails = Object.keys(clientMap).filter(e => !recentEmails.has(e));
  if (!targetEmails.length) return res.status(200).json({ sent: 0, message: 'No targets after filtering' });

  const { data: profiles } = await sb
    .from('profiles')
    .select('email, reengagement_sent_at')
    .in('email', targetEmails);

  const sentRecently = new Set(
    (profiles || []).filter(p => {
      if (!p.reengagement_sent_at) return false;
      const sent = new Date(p.reengagement_sent_at);
      return (Date.now() - sent.getTime()) < 365 * 24 * 60 * 60 * 1000;
    }).map(p => p.email)
  );

  const finalTargets = targetEmails.filter(e => !sentRecently.has(e));
  if (!finalTargets.length) return res.status(200).json({ sent: 0, message: 'All already contacted this year' });

  let sent = 0;
  for (const email of finalTargets) {
    const booking = clientMap[email];
    const name = booking.client_name || email.split('@')[0];
    const monthsAgo = Math.floor(
      (Date.now() - new Date(booking.completed_at).getTime()) / (1000 * 60 * 60 * 24 * 30)
    );

    const r = await fetch(`${BASE_URL}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': process.env.INTERNAL_API_SECRET || '',
      },
      body: JSON.stringify({
        to: email,
        name,
        service: booking.service_name,
        type: 'reengagement',
        monthsAgo,
      }),
    }).catch(() => ({ ok: false }));

    if (r.ok) {
      // Mark in profiles (upsert by email)
      await sb.from('profiles')
        .update({ reengagement_sent_at: new Date().toISOString() })
        .eq('email', email);
      sent++;
    }
  }

  return res.status(200).json({ sent, checked: finalTargets.length });
}
