import { createClient } from '@supabase/supabase-js';
import { guard, sanitize, isValidEmail } from './_security.js';

export default async function handler(req, res) {
  if (await guard(req, res, { rateMax: 20, rateWindow: 60000 })) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let { email, name, source = 'website', tags = [] } = req.body || {};
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  email = email.toLowerCase().trim();
  name = sanitize(name || '');
  if (!Array.isArray(tags)) tags = [];
  tags = tags.map(t => sanitize(String(t))).filter(Boolean).slice(0, 10);

  const supabase = createClient(
    process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  const { error } = await supabase
    .from('newsletter_subscribers')
    .upsert({ email, name: name || null, source, tags, active: true }, { onConflict: 'email' });

  if (error) {
    console.error('[newsletter] Supabase error:', error.message);
    return res.status(500).json({ error: 'Could not subscribe' });
  }

  // Send welcome email via Resend
  try {
    const welcomeHtml = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
      <div style="background:#0D1F3C;padding:24px;text-align:center">
        <h1 style="color:#fff;font-size:20px;margin:0">DR BIKE SYDNEY</h1>
      </div>
      <div style="padding:32px 24px">
        <h2 style="color:#0D1F3C">Thanks for subscribing${name ? ', ' + name : ''}! 🚲</h2>
        <p style="color:#374151;line-height:1.7;margin-top:12px">
          You'll receive cycling tips, maintenance reminders and exclusive offers for Dr. Bike Sydney members.
        </p>
        <div style="margin:24px 0">
          <a href="https://drbikesydney.com.au" style="background:#0A58CA;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">Book a Service →</a>
        </div>
        <p style="font-size:13px;color:#9CA3AF">Use code <strong>WELCOME10</strong> for 10% off your first booking.</p>
      </div>
      <div style="padding:16px 24px;background:#F7F8FA;font-size:12px;color:#9CA3AF;text-align:center">
        Dr. Bike Sydney · 0433 963 250 · contact@drbikesydney.com.au<br>
        <a href="https://drbikesydney.com.au/unsubscribe?email=${encodeURIComponent(email)}" style="color:#9CA3AF">Unsubscribe</a>
      </div>
    </div>`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
        to: email,
        subject: "You're subscribed — Dr. Bike Sydney 🚲",
        html: welcomeHtml
      })
    });
  } catch (e) {
    // Non-fatal: subscriber saved, email failed
    console.warn('[newsletter] Welcome email failed:', e.message);
  }

  return res.status(200).json({ success: true, message: 'Subscribed!' });
}
