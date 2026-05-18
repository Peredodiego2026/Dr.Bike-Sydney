import { createClient } from '@supabase/supabase-js';
import { guard, sanitize, sanitizeObj, rateLimit } from './_security.js';

const sb = createClient(
  'https://tgpipbloisahufaywhqb.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'sb_publishable_zL6EV0_qG2SccuRYBm6BZQ_psf806jn'
);

export default async function handler(req, res) {
  if(guard(req, res, { rateMax: 30, rateWindow: 60000 })) return; // 30/min default
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
    bookings.forEach(b => {
      const email = b.profiles?.email;
      if (email && !clientMap[email]) clientMap[email] = b;
    });

    let sent = 0;
    for (const [email, booking] of Object.entries(clientMap)) {
      const name = booking.profiles?.full_name || email.split('@')[0];
      const lastService = new Date(booking.completed_at).toLocaleDateString('en-AU', { day:'numeric', month:'long', year:'numeric' });
      const monthsAgo = Math.floor((Date.now() - new Date(booking.completed_at)) / (1000*60*60*24*30));

      await fetch(`${process.env.VERCEL_URL || 'https://drbikesydney.com.au'}/api/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          name,
          service: booking.service_name,
          type: 'reminder',
          monthsAgo,
          lastService,
          bookingId: booking.id
        })
      });
      sent++;
    }

    return res.status(200).json({ sent, message: `Sent ${sent} reminders` });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
