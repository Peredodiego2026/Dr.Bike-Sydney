import { guard, sanitize, isValidEmail } from './_security.js';

export default async function handler(req, res) {
  if (await guard(req, res, { rateMax: 10, rateWindow: 60000 })) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let { businessName, contactName, email, phone, fleetSize, frequency, notes } = req.body || {};
  if (!businessName || !contactName || !email || !fleetSize) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email' });

  businessName = sanitize(businessName); contactName = sanitize(contactName);
  phone = sanitize(phone || ''); fleetSize = sanitize(fleetSize);
  frequency = sanitize(frequency || ''); notes = sanitize(notes || '');

  const sendEmail = async (payload) => {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return resp;
  };

  try {
    // Internal notification
    await sendEmail({
      from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
      to: 'contact@drbikesydney.com.au',
      subject: `New B2B Fleet Enquiry — ${businessName} (${fleetSize} bikes)`,
      html: `<h2>New B2B Fleet Enquiry</h2>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600">Business</td><td style="padding:8px;border-bottom:1px solid #eee">${businessName}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600">Contact</td><td style="padding:8px;border-bottom:1px solid #eee">${contactName}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600">Email</td><td style="padding:8px;border-bottom:1px solid #eee">${email}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600">Phone</td><td style="padding:8px;border-bottom:1px solid #eee">${phone || 'N/A'}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600">Fleet Size</td><td style="padding:8px;border-bottom:1px solid #eee">${fleetSize}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600">Frequency</td><td style="padding:8px;border-bottom:1px solid #eee">${frequency || 'N/A'}</td></tr>
          <tr><td style="padding:8px;font-weight:600">Notes</td><td style="padding:8px">${notes || 'N/A'}</td></tr>
        </table>
        <p style="margin-top:16px;color:#666">Reply within 2 business hours per our SLA.</p>`
    });

    // Auto-reply to business
    await sendEmail({
      from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
      to: email,
      subject: `We received your fleet enquiry — Dr. Bike Sydney`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
        <div style="background:#0D1F3C;padding:24px;text-align:center"><h1 style="color:#fff;font-size:20px;margin:0">DR BIKE SYDNEY</h1></div>
        <div style="padding:32px 24px">
          <h2>Thanks for your enquiry, ${contactName}!</h2>
          <p style="color:#374151;line-height:1.7">We've received your fleet servicing enquiry for <strong>${businessName}</strong> (${fleetSize} bikes).</p>
          <p style="color:#374151;line-height:1.7">A member of our team will get back to you within <strong>2 business hours</strong> (Mon–Sat 8am–6pm AEST).</p>
        </div>
        <div style="padding:16px 24px;background:#F7F8FA;font-size:12px;color:#9CA3AF;text-align:center">
          Dr. Bike Sydney · 0433 963 250 · contact@drbikesydney.com.au
        </div>
      </div>`
    });
  } catch(e) {
    console.error('[send-b2b] Email error:', e.message);
  }

  return res.status(200).json({ success: true });
}
