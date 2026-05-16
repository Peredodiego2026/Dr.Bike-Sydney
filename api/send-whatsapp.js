// PRODUCTION ENV VARS (Vercel):
//   TWILIO_ACCOUNT_SID  → ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   TWILIO_AUTH_TOKEN   → your_auth_token
//   TWILIO_PHONE_NUMBER → +61XXXXXXXXX  (WhatsApp-enabled number from Twilio console)
//
// The WhatsApp Business number must be registered at:
//   console.twilio.com → Messaging → Senders → WhatsApp Senders
//
// POST /api/send-whatsapp
// Body: { to, template, data }
// Templates: confirmation | enroute | completed | reminder

import { createClient } from '@supabase/supabase-js';
import { guard, sanitize, sanitizeObj, rateLimit } from './_security.js';

const sb = createClient(
  process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

function normalizeAUPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('61') && digits.length === 11) return '+' + digits;
  if (digits.startsWith('0') && digits.length === 10) return '+61' + digits.slice(1);
  if (digits.length === 9) return '+61' + digits;
  return null;
}

function buildMessage(template, data) {
  const d = data || {};
  switch (template) {
    case 'confirmation':
      return `Hi ${d.name || 'there'} 👋\n\nYour Dr. Bike booking is confirmed!\n\n🔧 Service: ${d.service || 'Bike repair'}\n📅 Date: ${d.date || 'TBD'}\n📍 Location: ${d.suburb || 'your area'}\n💰 Price: $${d.price || '—'}\n\nYou'll receive a message when your mechanic is on the way. Track live at ${d.trackUrl || 'https://dr-bike-sydney.vercel.app/track.html'}\n\n— Dr. Bike Sydney 🚲`;

    case 'enroute':
      return `Your Dr. Bike mechanic is on the way! 🚐\n\nHi ${d.name || 'there'}, *${d.mechanic || 'your mechanic'}* is heading to you now.\n\n⏱️ ETA: ~${d.eta || '20'} minutes\n📍 Heading to: ${d.suburb || 'your location'}\n\nTrack live: ${d.trackUrl || 'https://dr-bike-sydney.vercel.app/track.html'}\n\n— Dr. Bike Sydney 🚲`;

    case 'completed':
      return `Job complete! ✅\n\nHi ${d.name || 'there'}, your bike has been serviced by *${d.mechanic || 'your mechanic'}*.\n\n🔧 ${d.service || 'Service'} — done!\n\nWe'd love your feedback — tap the link to rate your experience:\n${d.reviewUrl || 'https://dr-bike-sydney.vercel.app'}\n\nThank you for choosing Dr. Bike Sydney! 🚲`;

    case 'reminder':
      return `Service reminder 🔔\n\nHi ${d.name || 'there'}! Your Dr. Bike service is coming up:\n\n📅 ${d.date || 'soon'} at ${d.time || 'your selected time'}\n📍 ${d.suburb || 'your location'}\n\nNeed to reschedule? Reply to this message or visit:\nhttps://dr-bike-sydney.vercel.app\n\n— Dr. Bike Sydney 🚲`;

    default:
      return null;
  }
}

export default async function handler(req, res) {
  if(guard(req, res, { rateMax: 20, rateWindow: 60000 })) return; // 20/min messaging
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ct = req.headers['content-type'] || '';
  if (!ct.includes('application/json')) return res.status(415).json({ error: 'Content-Type must be application/json' });

  const { to, template, data } = req.body || {};

  if (!to || !template) return res.status(400).json({ error: 'Missing required fields: to, template' });
  if (!['confirmation','enroute','completed','reminder'].includes(template)) {
    return res.status(400).json({ error: 'Invalid template' });
  }

  const toNorm = normalizeAUPhone(to);
  if (!toNorm) return res.status(400).json({ error: 'Invalid Australian phone number' });

  // Fetch WhatsApp business number from Supabase settings
  let fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!fromNumber) {
    const { data: waRow } = await sb.from('van_zones')
      .select('postcode')
      .eq('van_number', 0)
      .eq('suburb', '__whatsapp__')
      .maybeSingle();
    fromNumber = waRow?.postcode;
  }

  if (!fromNumber) {
    console.warn('[send-whatsapp] No WhatsApp number configured — message not sent');
    return res.status(503).json({ error: 'WhatsApp not configured' });
  }

  const body = buildMessage(template, data);
  if (!body) return res.status(400).json({ error: 'Could not build message for template' });

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    console.warn('[send-whatsapp] Twilio credentials not set');
    return res.status(503).json({ error: 'Twilio not configured' });
  }

  try {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const params = new URLSearchParams({
      From: `whatsapp:${fromNumber}`,
      To:   `whatsapp:${toNorm}`,
      Body: body,
    });

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[send-whatsapp] Twilio error:', result);
      return res.status(502).json({ error: result.message || 'Twilio API error', code: result.code });
    }

    console.log(`[send-whatsapp] Sent ${template} to ${toNorm} (sid: ${result.sid})`);
    return res.status(200).json({ success: true, sid: result.sid });

  } catch (err) {
    console.error('[send-whatsapp] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
