import { createClient } from '@supabase/supabase-js';
import { guard } from './_security.js';

export default async function handler(req, res) {
  if (await guard(req, res, { rateMax: 5, rateWindow: 3600000 })) return;
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  const now = new Date();
  const results = { sent: 0, errors: 0 };

  function dateCutoff(months) {
    const d = new Date(now); d.setMonth(d.getMonth() - months); return d;
  }
  function dateWindow(cutoff, days = 3) {
    const d = new Date(cutoff); d.setDate(d.getDate() - days); return d;
  }

  async function sendReminder(booking) {
    const serviceType = booking.service_type || 'service';
    const isMajor = serviceType.includes('Major') || serviceType.includes('Ultimate');
    const monthsAgo = isMajor ? 12 : 6;
    const email = booking.profiles?.email;
    const name  = booking.profiles?.full_name?.split(' ')[0] || 'there';
    if (!email) return false;

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
        to: email,
        subject: `Time for your next bike service — ${monthsAgo} months since your ${serviceType}`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
          <div style="background:#0D1F3C;padding:24px;text-align:center">
            <h1 style="color:#fff;font-size:20px;margin:0">DR BIKE SYDNEY</h1>
          </div>
          <div style="padding:32px 24px">
            <h2 style="font-size:22px;color:#0D1F3C">Time for your next service! 🚲</h2>
            <p style="color:#374151;line-height:1.7">Hi ${name},</p>
            <p style="color:#374151;line-height:1.7">
              It's been ${monthsAgo} months since your <strong>${serviceType}</strong>.
              Regular servicing keeps your bike performing safely and extends component life.
            </p>
            <div style="background:#F7F8FA;border-radius:10px;padding:16px;margin:20px 0">
              <p style="margin:0;font-size:13px;color:#6B7280">Your last service</p>
              <p style="margin:4px 0 0;font-weight:700;color:#0D1F3C">${serviceType} · ${new Date(booking.scheduled_date).toLocaleDateString('en-AU', {day:'numeric',month:'long',year:'numeric'})}</p>
            </div>
            <a href="https://drbikesydney.com.au" style="display:inline-block;background:#0A58CA;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">Book Your Next Service →</a>
          </div>
          <div style="padding:16px 24px;background:#F7F8FA;font-size:12px;color:#9CA3AF;text-align:center">
            Dr. Bike Sydney · 0433 963 250 · contact@drbikesydney.com.au
          </div>
        </div>`
      })
    });
    return resp.ok;
  }

  async function processBookings(serviceFilter, months) {
    const cutoff = dateCutoff(months);
    const window = dateWindow(cutoff);
    const { data } = await sb.from('bookings')
      .select('id, service_type, scheduled_date, profiles(email, full_name)')
      .eq('status', 'completed')
      .ilike('service_type', serviceFilter)
      .gte('scheduled_date', window.toISOString().split('T')[0])
      .lte('scheduled_date', cutoff.toISOString().split('T')[0])
      .is('next_service_reminder_sent', null);

    for (const booking of (data || [])) {
      const ok = await sendReminder(booking);
      if (ok) {
        await sb.from('bookings').update({ next_service_reminder_sent: new Date().toISOString() }).eq('id', booking.id);
        results.sent++;
      } else {
        results.errors++;
      }
    }
  }

  try {
    await processBookings('%Tune-Up%', 6);
    await processBookings('%Major%', 12);
    await processBookings('%Ultimate%', 12);
  } catch(err) {
    console.error('[send-service-reminders] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({ success: true, ...results });
}
