import { guard, sanitize, sanitizeObj, rateLimit } from './_security.js';
export default async function handler(req, res) {
  if(guard(req, res, { rateMax: 20, rateWindow: 60000 })) return; // 20/min messaging
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, name, service, date, time, address, price, type, bookingId, mechNotes, nextService, referralCode } = req.body;

  const gst = Math.round((price||0) / 11);
  const net = (price||0) - gst;
  const year = new Date().getFullYear();

  const header = (color, emoji, title) => `
    <div style="font-family:Inter,Arial,sans-serif;max-width:580px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
    <div style="background:${color};padding:32px 28px;text-align:center">
      <div style="font-size:38px;margin-bottom:8px">${emoji}</div>
      <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.6);letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px">Dr. Bike Sydney</div>
      <div style="font-size:22px;font-weight:800;color:#fff">${title}</div>
    </div>`;

  const footer = () => `
    <div style="background:#F7F8FA;padding:20px 28px;text-align:center;border-top:1px solid #E5E7EB">
      <p style="font-size:12px;color:#9CA3AF;margin:0 0 4px">Dr. Bike Sydney · drbikesydney.com.au · Sydney NSW</p>
      <p style="font-size:11px;color:#D1D5DB;margin:0">ABN: 87 654 025 287 · hello@drbikesydney.com.au</p>
    </div></div>`;

  const bookingTable = () => `
    <div style="background:#F7F8FA;border-radius:12px;padding:20px;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px 0;color:#6B7280;font-size:13px">Service</td><td style="padding:8px 0;font-weight:600;color:#0D1F3C;font-size:13px;text-align:right">${service}</td></tr>
        ${date?`<tr><td style="padding:8px 0;color:#6B7280;font-size:13px;border-top:1px solid #E5E7EB">Date & time</td><td style="padding:8px 0;font-weight:600;color:#0D1F3C;font-size:13px;text-align:right;border-top:1px solid #E5E7EB">${date}${time?' · '+time:''}</td></tr>`:''}
        ${address?`<tr><td style="padding:8px 0;color:#6B7280;font-size:13px;border-top:1px solid #E5E7EB">Address</td><td style="padding:8px 0;font-weight:600;color:#0D1F3C;font-size:13px;text-align:right;border-top:1px solid #E5E7EB">${address}</td></tr>`:''}
        <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;border-top:1px solid #E5E7EB">Net amount</td><td style="padding:8px 0;font-weight:600;color:#0D1F3C;font-size:13px;text-align:right;border-top:1px solid #E5E7EB">$${net} AUD</td></tr>
        <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;border-top:1px solid #E5E7EB">GST (10%)</td><td style="padding:8px 0;font-weight:600;color:#6B7280;font-size:13px;text-align:right;border-top:1px solid #E5E7EB">$${gst} AUD</td></tr>
        <tr><td style="padding:10px 0 0;font-weight:700;color:#0D1F3C;font-size:14px;border-top:2px solid #E5E7EB">Total</td><td style="padding:10px 0 0;font-weight:800;color:#1848C8;font-size:18px;text-align:right;border-top:2px solid #E5E7EB">$${price} AUD</td></tr>
      </table>
    </div>`;

  const templates = {
    confirmation: {
      subject: `✅ Booking confirmed — ${service} · ${date}`,
      html: `${header('#0D1F3C','🚲','Booking confirmed!')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 20px;line-height:1.6">Hi <strong style="color:#0D1F3C">${name}</strong>, your booking is confirmed ✅ Your mechanic will contact you 30 min before arrival.</p>

          <!-- Booking details -->
          ${bookingTable()}

          <!-- What to expect -->
          <div style="background:#EEF3FC;border-radius:12px;padding:16px;margin-bottom:20px">
            <p style="font-size:13px;color:#1848C8;font-weight:600;margin:0 0 8px">📍 What happens next</p>
            <p style="font-size:12px;color:#1848C8;margin:0;line-height:1.8;opacity:0.9">
              1. Your mechanic will be assigned shortly<br>
              2. You'll get a notification when they're on the way<br>
              3. Payment collected on completion
            </p>
          </div>

          <!-- Tax Invoice section -->
          <div style="border:1.5px solid #E5E7EB;border-radius:12px;overflow:hidden;margin-bottom:20px">
            <div style="background:#F7F8FA;padding:12px 16px;border-bottom:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:12px;font-weight:700;color:#0D1F3C;text-transform:uppercase;letter-spacing:0.06em">Tax Invoice</span>
              <span style="font-size:11px;color:#6B7280;font-weight:600">DRBK-${bookingId ? bookingId.slice(0,8).toUpperCase() : 'PENDING'}</span>
            </div>
            <div style="padding:16px">
              <table style="width:100%;border-collapse:collapse;font-size:13px">
                <tr><td style="color:#6B7280;padding:5px 0">Service</td><td style="text-align:right;font-weight:600;color:#0D1F3C">${service}</td></tr>
                <tr><td style="color:#6B7280;padding:5px 0;border-top:1px solid #F3F4F6">Date & time</td><td style="text-align:right;font-weight:600;color:#0D1F3C;border-top:1px solid #F3F4F6">${date}${time ? ' at ' + time : ''}</td></tr>
                <tr><td style="color:#6B7280;padding:5px 0;border-top:1px solid #F3F4F6">Location</td><td style="text-align:right;font-weight:600;color:#0D1F3C;border-top:1px solid #F3F4F6">${address || '—'}</td></tr>
                <tr><td style="color:#6B7280;padding:5px 0;border-top:1px solid #F3F4F6">Subtotal (excl. GST)</td><td style="text-align:right;color:#6B7280;border-top:1px solid #F3F4F6">$${net}</td></tr>
                <tr><td style="color:#6B7280;padding:5px 0;border-top:1px solid #F3F4F6">GST (10%)</td><td style="text-align:right;color:#6B7280;border-top:1px solid #F3F4F6">$${gst}</td></tr>
                <tr style="border-top:2px solid #E5E7EB">
                  <td style="padding:10px 0 0;font-weight:700;color:#0D1F3C;font-size:14px">Total (AUD)</td>
                  <td style="padding:10px 0 0;text-align:right;font-weight:800;color:#1848C8;font-size:18px">$${price}</td>
                </tr>
              </table>
              <p style="font-size:10px;color:#9CA3AF;margin:12px 0 0">ABN: 87 654 025 287 · Dr. Bike Sydney · drbikesydney.com.au</p>
            </div>
          </div>

          <!-- Referral code -->
          ${referralCode ? `<div style="background:#FEF3C7;border-radius:12px;padding:16px;margin-bottom:20px;text-align:center">
            <p style="font-size:12px;color:#D97706;font-weight:700;margin:0 0 4px">🎁 Share Dr. Bike — earn $15 off your next service</p>
            <p style="font-size:16px;font-weight:800;color:#D97706;letter-spacing:0.12em;margin:0 0 4px">${referralCode}</p>
            <p style="font-size:11px;color:#D97706;margin:0;opacity:0.8">You and your friend each get $15 off when they use your code</p>
          </div>` : ''}

          <a href="https://drbikesydney.com.au" style="display:block;background:#0D1F3C;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px">View your booking →</a>
        </div>${footer()}`
    },
    mechanic_new_booking: {
      subject: `🔔 New booking — ${service} · ${date}`,
      html: `${header('#1848C8','🔔','New booking!')}
        <div style="padding:32px 28px">
          <h1 style="font-size:20px;font-weight:700;color:#0D1F3C;margin:0 0 16px">New job assigned to you</h1>
          ${bookingTable()}
          <div style="background:#EEF3FC;border-radius:12px;padding:16px;margin-bottom:16px">
            <p style="font-size:13px;color:#1848C8;font-weight:600;margin:0 0 4px">📱 Open your mechanic app</p>
            <p style="font-size:12px;color:#1848C8;margin:0">Log in to accept and see full client details</p>
          </div>
          <a href="https://dr-bike-sydney.vercel.app/mechanic.html" style="display:block;background:#1848C8;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px">Open mechanic app →</a>
        </div>${footer()}`
    },
    reminder: {
      subject: `🚲 Time for a bike check-up, ${name}!`,
      html: `${header('#059669','🚲','Time for a service!')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 24px;line-height:1.6">Hi <strong style="color:#0D1F3C">${name}</strong>, it's been 6+ months since your last service. Regular maintenance keeps your bike safe and riding smoothly!</p>
          <div style="background:#EEF3FC;border-radius:12px;padding:16px;margin-bottom:24px">
            <p style="font-size:13px;color:#1848C8;font-weight:700;margin:0 0 8px">🔧 Why regular servicing matters</p>
            <p style="font-size:12px;color:#1848C8;margin:0;line-height:1.6;opacity:0.8">Worn brake pads, stretched cables and dirty drivetrains reduce performance and can be dangerous. A quick tune-up extends your bike's life significantly.</p>
          </div>
          <a href="https://dr-bike-sydney.vercel.app" style="display:block;background:#059669;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px;margin-bottom:12px">Book a service now →</a>
          <p style="font-size:12px;color:#9CA3AF;text-align:center;margin:0">We come to you — home, work or park · Mon–Sat</p>
        </div>${footer()}`
    },
  };

  const template = templates[type] || templates.confirmation;

  // Recipients
  const recipients = [to];
  
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Dr. Bike Sydney <onboarding@resend.dev>',
        to: recipients,
        subject: template.subject,
        html: template.html
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Email failed');
    return res.status(200).json({ success: true, id: data.id });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
