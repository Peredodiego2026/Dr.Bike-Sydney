const { createClient } = require('@supabase/supabase-js');

const ALLOWED_ORIGINS = [
  'https://drbikesydney.com.au',
  'https://dr-bike-sydney.vercel.app'
];

function esc(s) {
  return typeof s === 'string' ? s.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c])) : '';
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, source = 'website', tags = [] } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from('newsletter_subscribers')
    .upsert({ email: email.toLowerCase(), name, source, tags, active: true }, { onConflict: 'email' })
    .select('id')
    .single();

  if (error) {
    console.error('Newsletter subscribe error:', error);
    return res.status(500).json({ error: 'Could not subscribe' });
  }

  // Send welcome email
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
        to: email,
        subject: "You're subscribed — Dr. Bike Sydney",
        html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
          <div style="background:#0D1F3C;padding:24px;text-align:center">
            <h1 style="color:#fff;font-size:20px;margin:0">DR BIKE SYDNEY</h1>
          </div>
          <div style="padding:32px 24px">
            <h2>Thanks for subscribing${esc(name) ? ', ' + esc(name) : ''}! 🚲</h2>
            <p style="color:#374151;line-height:1.7;margin-top:12px">
              You'll receive cycling tips, maintenance reminders and exclusive offers for Dr. Bike Sydney members.
            </p>
            <div style="margin:24px 0">
              <a href="https://drbikesydney.com.au" style="background:#0A58CA;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700">Book a Service →</a>
            </div>
            <p style="font-size:13px;color:#9CA3AF">Use code <strong>WELCOME10</strong> for 10% off your first booking.</p>
          </div>
          <div style="padding:16px 24px;background:#F7F8FA;font-size:12px;color:#9CA3AF;text-align:center">
            Dr. Bike Sydney · 0433 963 250 · contact@drbikesydney.com.au<br>
            <a href="https://drbikesydney.com.au/unsubscribe?email=${encodeURIComponent(email)}" style="color:#9CA3AF">Unsubscribe</a>
          </div>
        </div>`
      })
    });
  } catch(e) { console.warn('Newsletter welcome email failed:', e); }

  return res.status(200).json({ success: true });
};
