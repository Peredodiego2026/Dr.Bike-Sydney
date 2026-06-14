const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const now = new Date();
  const results = { sent: 0, errors: 0 };

  // Tune-Up: remind after 6 months
  const tuneupCutoff = new Date(now);
  tuneupCutoff.setMonth(tuneupCutoff.getMonth() - 6);
  const tuneupWindow = new Date(tuneupCutoff);
  tuneupWindow.setDate(tuneupWindow.getDate() - 3); // 3-day window

  // Major/Ultimate: remind after 12 months
  const majorCutoff = new Date(now);
  majorCutoff.setMonth(majorCutoff.getMonth() - 12);
  const majorWindow = new Date(majorCutoff);
  majorWindow.setDate(majorWindow.getDate() - 3);

  async function sendReminder(booking) {
    const serviceType = booking.service_type || 'service';
    const isMajor = serviceType.includes('Major') || serviceType.includes('Ultimate');
    const monthsAgo = isMajor ? 12 : 6;

    const emailBody = {
      from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
      to: booking.profiles?.email,
      subject: `Time for your next bike service — ${monthsAgo} months since your ${serviceType}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
          <div style="background:#0D1F3C;padding:24px;text-align:center">
            <h1 style="color:#fff;font-size:20px;margin:0">DR BIKE SYDNEY</h1>
          </div>
          <div style="padding:32px 24px">
            <h2 style="font-size:22px;color:#0D1F3C">Time for your next service! 🚲</h2>
            <p style="color:#374151;line-height:1.7">Hi ${booking.profiles?.full_name?.split(' ')[0] || 'there'},</p>
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
            Dr. Bike Sydney · 0433 963 250 · contact@drbikesydney.com.au<br>
            <a href="https://drbikesydney.com.au" style="color:#9CA3AF">Unsubscribe</a>
          </div>
        </div>
      `
    };

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emailBody)
    });
    return resp.ok;
  }

  // Query tune-up bookings due for reminder
  try {
    const { data: tuneups } = await supabase
      .from('bookings')
      .select('*, profiles(email, full_name)')
      .eq('status', 'completed')
      .ilike('service_type', '%Tune-Up%')
      .gte('scheduled_date', tuneupWindow.toISOString().split('T')[0])
      .lte('scheduled_date', tuneupCutoff.toISOString().split('T')[0])
      .is('next_service_reminder_sent', null);

    for (const booking of (tuneups || [])) {
      if (!booking.profiles?.email) continue;
      const ok = await sendReminder(booking);
      if (ok) {
        await supabase.from('bookings').update({ next_service_reminder_sent: new Date().toISOString() }).eq('id', booking.id);
        results.sent++;
      } else {
        results.errors++;
      }
    }

    // Query major/ultimate bookings
    const { data: majors } = await supabase
      .from('bookings')
      .select('*, profiles(email, full_name)')
      .eq('status', 'completed')
      .or('service_type.ilike.%Major%,service_type.ilike.%Ultimate%')
      .gte('scheduled_date', majorWindow.toISOString().split('T')[0])
      .lte('scheduled_date', majorCutoff.toISOString().split('T')[0])
      .is('next_service_reminder_sent', null);

    for (const booking of (majors || [])) {
      if (!booking.profiles?.email) continue;
      const ok = await sendReminder(booking);
      if (ok) {
        await supabase.from('bookings').update({ next_service_reminder_sent: new Date().toISOString() }).eq('id', booking.id);
        results.sent++;
      } else {
        results.errors++;
      }
    }

  } catch (err) {
    console.error('Service reminder error:', err);
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({ success: true, ...results });
};
