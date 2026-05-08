export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, name, service, date, time, address, price, type } = req.body;

  const templates = {
    confirmation: {
      subject: `✅ Booking confirmed — ${service}`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff">
          <div style="background:#0D1F3C;padding:32px 28px;text-align:center;border-radius:16px 16px 0 0">
            <div style="font-size:32px;margin-bottom:8px">🚲</div>
            <div style="font-size:22px;font-weight:800;color:#fff">Dr. Bike Sydney</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:4px">Mobile Bicycle Repair</div>
          </div>
          <div style="padding:32px 28px">
            <h1 style="font-size:22px;font-weight:700;color:#0D1F3C;margin:0 0 8px">Booking confirmed! 🎉</h1>
            <p style="color:#6B7280;font-size:14px;margin:0 0 28px">Hi ${name}, your booking is confirmed. Here are the details:</p>
            <div style="background:#F7F8FA;border-radius:12px;padding:20px;margin-bottom:24px">
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px 0;color:#6B7280;font-size:13px">Service</td><td style="padding:8px 0;font-weight:600;color:#0D1F3C;font-size:13px;text-align:right">${service}</td></tr>
                <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;border-top:1px solid #E5E7EB">Date & time</td><td style="padding:8px 0;font-weight:600;color:#0D1F3C;font-size:13px;text-align:right;border-top:1px solid #E5E7EB">${date} · ${time}</td></tr>
                <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;border-top:1px solid #E5E7EB">Address</td><td style="padding:8px 0;font-weight:600;color:#0D1F3C;font-size:13px;text-align:right;border-top:1px solid #E5E7EB">${address}</td></tr>
                <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;border-top:1px solid #E5E7EB">Total</td><td style="padding:8px 0;font-weight:800;color:#1848C8;font-size:16px;text-align:right;border-top:1px solid #E5E7EB">$${price} AUD</td></tr>
              </table>
            </div>
            <div style="background:#EEF3FC;border-radius:12px;padding:16px;margin-bottom:28px">
              <p style="font-size:13px;color:#1848C8;font-weight:600;margin:0 0 4px">📍 We come to you</p>
              <p style="font-size:12px;color:#1848C8;margin:0;opacity:0.8">Our mechanic will arrive at your address. No need to go anywhere!</p>
            </div>
            <a href="https://dr-bike-sydney.vercel.app" style="display:block;background:#1848C8;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px;margin-bottom:16px">View my booking →</a>
            <p style="font-size:12px;color:#9CA3AF;text-align:center;margin:0">Questions? WhatsApp us at +61 433 963 250</p>
          </div>
          <div style="background:#F7F8FA;padding:20px 28px;text-align:center;border-radius:0 0 16px 16px;border-top:1px solid #E5E7EB">
            <p style="font-size:12px;color:#9CA3AF;margin:0">Dr. Bike Sydney · Mobile Bicycle Repair · Sydney, NSW</p>
          </div>
        </div>`
    },
    enroute: {
      subject: `🚐 Your mechanic is on the way! — ${service}`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff">
          <div style="background:#D97706;padding:32px 28px;text-align:center;border-radius:16px 16px 0 0">
            <div style="font-size:40px;margin-bottom:8px">🚐</div>
            <div style="font-size:22px;font-weight:800;color:#fff">On the way!</div>
          </div>
          <div style="padding:32px 28px;text-align:center">
            <h1 style="font-size:20px;font-weight:700;color:#0D1F3C;margin:0 0 12px">Your mechanic is heading to you</h1>
            <p style="color:#6B7280;font-size:14px;margin:0 0 24px">Hi ${name}, your Dr. Bike mechanic is on the way to <strong>${address}</strong>. Please make sure someone is available.</p>
            <div style="background:#FEF3C7;border-radius:12px;padding:16px;margin-bottom:24px">
              <p style="font-size:13px;color:#D97706;font-weight:600;margin:0">⏱ Estimated arrival: 10–20 minutes</p>
            </div>
            <p style="font-size:12px;color:#9CA3AF;">Questions? WhatsApp +61 433 963 250</p>
          </div>
        </div>`
    },
    completed: {
      subject: `✅ Service completed — How did we do?`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff">
          <div style="background:#059669;padding:32px 28px;text-align:center;border-radius:16px 16px 0 0">
            <div style="font-size:40px;margin-bottom:8px">✅</div>
            <div style="font-size:22px;font-weight:800;color:#fff">Service complete!</div>
          </div>
          <div style="padding:32px 28px;text-align:center">
            <h1 style="font-size:20px;font-weight:700;color:#0D1F3C;margin:0 0 12px">Thanks for choosing Dr. Bike, ${name}!</h1>
            <p style="color:#6B7280;font-size:14px;margin:0 0 24px">Your <strong>${service}</strong> has been completed. We hope your bike is running perfectly!</p>
            <a href="https://dr-bike-sydney.vercel.app" style="display:block;background:#059669;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px;margin-bottom:16px">Leave a review ⭐</a>
            <a href="https://dr-bike-sydney.vercel.app/?view=book" style="display:block;background:#F7F8FA;color:#0D1F3C;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:600;font-size:14px;border:1.5px solid #E5E7EB">Book next service</a>
          </div>
        </div>`
    }
  };

  const template = templates[type] || templates.confirmation;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Dr. Bike Sydney <onboarding@resend.dev>',
        to: [to],
        subject: template.subject,
        html: template.html
      })
    });

    const data = await response.json();
    if(!response.ok) throw new Error(data.message || 'Email failed');
    return res.status(200).json({ success: true, id: data.id });
  } catch(error) {
    return res.status(500).json({ error: error.message });
  }
}
