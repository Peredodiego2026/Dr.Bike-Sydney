export default async function handler(req, res) {
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
      <p style="font-size:12px;color:#9CA3AF;margin:0 0 4px">Dr. Bike Sydney · drbike.com.au · Sydney NSW</p>
      <p style="font-size:11px;color:#D1D5DB;margin:0">ABN: [Your ABN] · Questions: +61 400 000 000</p>
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
      subject: `✅ Booking confirmed — ${service} on ${date}`,
      html: `${header('#0D1F3C','🚲','Booking confirmed!')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 24px;line-height:1.6">Hi <strong style="color:#0D1F3C">${name}</strong>, your booking is confirmed. Your mechanic will contact you 30 minutes before arrival.</p>
          ${bookingTable()}
          <div style="background:#EEF3FC;border-radius:12px;padding:16px;margin-bottom:24px">
            <p style="font-size:13px;color:#1848C8;font-weight:600;margin:0 0 4px">📍 We come to you — no workshop needed</p>
            <p style="font-size:12px;color:#1848C8;margin:0;opacity:0.8">Stay at home, work or the park. We bring the workshop to you, Mon–Sat.</p>
          </div>
          ${referralCode ? `<div style="background:#F0FDF4;border:1.5px solid #6EE7B7;border-radius:12px;padding:16px;margin-bottom:24px">
            <p style="font-size:13px;color:#065F46;font-weight:700;margin:0 0 4px">🎁 Your referral code: <span style="font-size:16px;letter-spacing:0.08em">${referralCode}</span></p>
            <p style="font-size:12px;color:#065F46;margin:0;opacity:0.8">Share with friends — you both get $15 off your next service!</p>
          </div>` : ''}
          <a href="https://dr-bike-sydney.vercel.app" style="display:block;background:#1848C8;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px;margin-bottom:12px">View my booking →</a>
          <p style="font-size:12px;color:#9CA3AF;text-align:center;margin:0">Need to cancel or reschedule? Reply to this email or WhatsApp +61 400 000 000</p>
        </div>${footer()}`
    },
    enroute: {
      subject: `🚐 Your mechanic is on the way! — ${service}`,
      html: `${header('#D97706','🚐','On the way!')}
        <div style="padding:32px 28px;text-align:center">
          <h1 style="font-size:20px;font-weight:700;color:#0D1F3C;margin:0 0 12px">Your mechanic is heading to you now</h1>
          <p style="color:#6B7280;font-size:14px;margin:0 0 24px;line-height:1.6">Hi <strong>${name}</strong>, your Dr. Bike mechanic is on the way to <strong>${address}</strong>. Please make sure someone is available to let them in.</p>
          <div style="background:#FEF3C7;border-radius:12px;padding:16px;margin-bottom:24px">
            <p style="font-size:13px;color:#D97706;font-weight:700;margin:0">⏱ Estimated arrival: 10–20 minutes</p>
          </div>
          <div style="background:#F7F8FA;border-radius:12px;padding:16px;margin-bottom:24px;text-align:left">
            <p style="font-size:12px;font-weight:600;color:#0D1F3C;margin:0 0 4px">Service booked</p>
            <p style="font-size:14px;font-weight:700;color:#1848C8;margin:0">${service} · $${price} AUD</p>
          </div>
          <p style="font-size:12px;color:#9CA3AF;">Questions? WhatsApp +61 400 000 000</p>
        </div>${footer()}`
    },
    completed: {
      subject: `✅ Service completed — Invoice #${bookingId?.slice(-6)?.toUpperCase()||'DR0001'}`,
      html: `${header('#059669','✅','Service complete!')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 24px;line-height:1.6">Hi <strong style="color:#0D1F3C">${name}</strong>, your <strong>${service}</strong> has been completed. Here is your tax invoice.</p>
          <div style="background:#F7F8FA;border-radius:12px;padding:20px;margin-bottom:24px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #E5E7EB">
              <div><div style="font-size:16px;font-weight:700;color:#0D1F3C">TAX INVOICE</div><div style="font-size:12px;color:#6B7280">Dr. Bike Sydney · ABN: [Your ABN]</div></div>
              <div style="text-align:right"><div style="font-size:12px;color:#6B7280">#${bookingId?.slice(-6)?.toUpperCase()||'DR0001'}</div><div style="font-size:12px;color:#6B7280">${new Date().toLocaleDateString('en-AU')}</div></div>
            </div>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:6px 0;color:#6B7280;font-size:13px">Service</td><td style="padding:6px 0;font-weight:600;color:#0D1F3C;font-size:13px;text-align:right">${service}</td></tr>
              <tr><td style="padding:6px 0;color:#6B7280;font-size:13px;border-top:1px solid #E5E7EB">Net amount</td><td style="padding:6px 0;font-weight:600;color:#0D1F3C;font-size:13px;text-align:right;border-top:1px solid #E5E7EB">$${net}.00</td></tr>
              <tr><td style="padding:6px 0;color:#6B7280;font-size:13px;border-top:1px solid #E5E7EB">GST (10%)</td><td style="padding:6px 0;font-weight:600;color:#6B7280;font-size:13px;text-align:right;border-top:1px solid #E5E7EB">$${gst}.00</td></tr>
              <tr><td style="padding:10px 0 0;font-weight:700;color:#0D1F3C;font-size:14px;border-top:2px solid #E5E7EB">Total (incl. GST)</td><td style="padding:10px 0 0;font-weight:800;color:#059669;font-size:18px;text-align:right;border-top:2px solid #E5E7EB">$${price}.00 AUD</td></tr>
            </table>
          </div>
          ${mechNotes ? `<div style="background:#EEF3FC;border-radius:12px;padding:16px;margin-bottom:24px">
            <p style="font-size:12px;font-weight:700;color:#1848C8;margin:0 0 6px">🔧 Mechanic notes</p>
            <p style="font-size:13px;color:#0D1F3C;margin:0;line-height:1.6">${mechNotes}</p>
          </div>` : ''}
          ${nextService ? `<div style="background:#F0FDF4;border-radius:12px;padding:16px;margin-bottom:24px">
            <p style="font-size:12px;font-weight:700;color:#065F46;margin:0 0 4px">📅 Next service recommendation</p>
            <p style="font-size:13px;color:#065F46;margin:0">${nextService}</p>
          </div>` : ''}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
            <a href="https://dr-bike-sydney.vercel.app" style="display:block;background:#059669;color:#fff;text-decoration:none;text-align:center;padding:13px;border-radius:10px;font-weight:700;font-size:13px">Leave a review ⭐</a>
            <a href="https://dr-bike-sydney.vercel.app" style="display:block;background:#F7F8FA;color:#0D1F3C;text-decoration:none;text-align:center;padding:13px;border-radius:10px;font-weight:600;font-size:13px;border:1.5px solid #E5E7EB">Book next service</a>
          </div>
          ${referralCode ? `<div style="background:#FEF3C7;border-radius:12px;padding:16px;text-align:center">
            <p style="font-size:13px;color:#D97706;font-weight:700;margin:0 0 4px">🎁 Share Dr. Bike — earn $15</p>
            <p style="font-size:14px;font-weight:800;color:#D97706;letter-spacing:0.1em;margin:0 0 4px">${referralCode}</p>
            <p style="font-size:12px;color:#D97706;margin:0;opacity:0.8">You and your friend each get $15 off when they book using your code</p>
          </div>` : ''}
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
    }
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
