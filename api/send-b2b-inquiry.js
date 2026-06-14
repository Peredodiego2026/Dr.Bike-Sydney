const { createClient } = require('@supabase/supabase-js');

const ALLOWED_ORIGINS = [
  'https://drbikesydney.com.au',
  'https://dr-bike-sydney.vercel.app'
];

function esc(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { businessName, contactName, email, phone, fleetSize, frequency, notes } = req.body || {};
  if (!businessName || !contactName || !email || !fleetSize) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Send internal notification email
  try {
    const emailBody = {
      from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
      to: 'contact@drbikesydney.com.au',
      subject: `New B2B Fleet Enquiry — ${esc(businessName)} (${esc(fleetSize)} bikes)`,
      html: `
        <h2>New B2B Fleet Enquiry</h2>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600">Business</td><td style="padding:8px;border-bottom:1px solid #eee">${esc(businessName)}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600">Contact</td><td style="padding:8px;border-bottom:1px solid #eee">${esc(contactName)}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600">Email</td><td style="padding:8px;border-bottom:1px solid #eee">${esc(email)}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600">Phone</td><td style="padding:8px;border-bottom:1px solid #eee">${esc(phone || 'N/A')}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600">Fleet Size</td><td style="padding:8px;border-bottom:1px solid #eee">${esc(fleetSize)}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600">Frequency</td><td style="padding:8px;border-bottom:1px solid #eee">${esc(frequency || 'N/A')}</td></tr>
          <tr><td style="padding:8px;font-weight:600">Notes</td><td style="padding:8px">${esc(notes || 'N/A')}</td></tr>
        </table>
        <p style="margin-top:16px;color:#666">Reply within 2 business hours per our SLA.</p>
      `
    };

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailBody)
    });

    // Auto-reply to business
    const autoReply = {
      from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
      to: email,
      subject: `We received your fleet enquiry — Dr. Bike Sydney`,
      html: `
        <h2>Thanks for your enquiry, ${esc(contactName)}!</h2>
        <p>We've received your fleet servicing enquiry for <strong>${esc(businessName)}</strong> (${esc(fleetSize)} bikes).</p>
        <p>A member of our team will get back to you within <strong>2 business hours</strong> (Mon–Sat 8am–6pm AEST).</p>
        <hr>
        <p style="color:#666;font-size:13px">Dr. Bike Sydney · Mobile Fleet Servicing · 0433 963 250 · contact@drbikesydney.com.au</p>
      `
    };
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(autoReply)
    });

  } catch (emailErr) {
    console.error('B2B email error:', emailErr);
  }

  return res.status(200).json({ success: true });
};
