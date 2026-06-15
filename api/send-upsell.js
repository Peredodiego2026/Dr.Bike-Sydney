import { createClient } from '@supabase/supabase-js';
import { guard, sanitize } from './_security.js';

const UPSELL_ITEMS = {
  brakes_front: { label: 'Front brake pads',           price: 45,  desc: 'Your front brake pads are worn — replacing them now prevents rotor damage (much more expensive).' },
  brakes_rear:  { label: 'Rear brake pads',            price: 45,  desc: 'Rear brake pads are due for replacement.' },
  chain:        { label: 'Chain replacement',          price: 55,  desc: 'Your chain is stretched and will soon damage the cassette. A chain now saves ~$150 in cassette replacement.' },
  cassette:     { label: 'Cassette replacement',       price: 95,  desc: 'Cassette cogs are worn. Best replaced together with a new chain.' },
  cables:       { label: 'Cable set (gear + brake)',   price: 65,  desc: 'Cables are frayed or stiff — replacing improves shifting and braking immediately.' },
  tyres:        { label: 'Tyre replacement (pair)',    price: 120, desc: 'Tyres are cracked or have visible thread wear — a safety concern.' },
  wheels:       { label: 'Wheel true & tension',       price: 40,  desc: 'Wheels are out of true — affects handling and can damage the rim.' },
  bb:           { label: 'Bottom bracket service',     price: 70,  desc: 'Bottom bracket has play or creaks — replace before it seizes.' },
  headset:      { label: 'Headset overhaul',           price: 55,  desc: 'Headset has play — affects steering safety.' },
};

export default async function handler(req, res) {
  if (await guard(req, res, { rateMax: 30, rateWindow: 60000 })) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { bookingId, criticalItems } = req.body || {};
  if (!bookingId || !Array.isArray(criticalItems) || !criticalItems.length) {
    return res.status(400).json({ error: 'bookingId and criticalItems required' });
  }

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  const { data: booking } = await sb
    .from('bookings')
    .select('service_type, profiles(email, full_name)')
    .eq('id', bookingId)
    .single();

  if (!booking?.profiles?.email) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const email = booking.profiles.email;
  const name  = sanitize(booking.profiles.full_name?.split(' ')[0] || 'there');

  const upsellRows = criticalItems
    .filter(item => UPSELL_ITEMS[item])
    .map(item => {
      const u = UPSELL_ITEMS[item];
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB">
          <strong>${sanitize(u.label)}</strong><br>
          <span style="font-size:12px;color:#6B7280">${sanitize(u.desc)}</span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:700;color:#0A58CA">$${u.price}</td>
      </tr>`;
    }).join('');

  if (!upsellRows) return res.status(200).json({ success: true, sent: false, reason: 'no_matching_items' });

  const emailHtml = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
    <div style="background:#0D1F3C;padding:24px;text-align:center">
      <h1 style="color:#fff;font-size:20px;margin:0">DR BIKE SYDNEY</h1>
    </div>
    <div style="padding:32px 24px">
      <h2 style="font-size:20px;color:#0D1F3C">Hi ${name}, your mechanic found some things that need attention 🔧</h2>
      <p style="color:#374151;line-height:1.7;margin-top:12px">
        During your pre-service inspection, we identified items that should be addressed soon for safety and to avoid more costly repairs later.
      </p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden">
        <thead><tr style="background:#F7F8FA">
          <th style="padding:10px 12px;text-align:left;font-size:13px;color:#6B7280">Recommended Service</th>
          <th style="padding:10px 12px;text-align:right;font-size:13px;color:#6B7280">Price</th>
        </tr></thead>
        <tbody>${upsellRows}</tbody>
      </table>
      <p style="color:#374151;line-height:1.7;font-size:14px">
        Reply to this email or call <a href="tel:+61433963250">0433 963 250</a> to add any of these to your current service or book a follow-up.
      </p>
      <a href="https://drbikesydney.com.au" style="display:inline-block;background:#0A58CA;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:8px">Book Follow-Up →</a>
    </div>
    <div style="padding:16px 24px;background:#F7F8FA;font-size:12px;color:#9CA3AF;text-align:center">
      Dr. Bike Sydney · 0433 963 250 · contact@drbikesydney.com.au
    </div>
  </div>`;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
        to: email,
        subject: `Your mechanic found items that need attention — ${sanitize(booking.service_type || 'your service')}`,
        html: emailHtml
      })
    });
    if (!resp.ok) throw new Error(await resp.text());
    return res.status(200).json({ success: true, sent: true });
  } catch(e) {
    console.error('[send-upsell] Email error:', e.message);
    return res.status(500).json({ error: 'Email failed' });
  }
}
