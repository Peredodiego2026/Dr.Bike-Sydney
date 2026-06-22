// Handles both SMS (?channel=sms) and WhatsApp (?channel=whatsapp).
// Vercel rewrites map /api/send-sms and /api/send-whatsapp to this file.
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';
import { guard, verifyInternalAuth, normalizeAUPhone } from './_security.js';

const sb = createClient(
  process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// ── SMS ───────────────────────────────────────────────────────────────────────
async function handleSMS(req, res) {
  const { to, name, service, address, price, type, bookingId, mechName, reviewLink, customMsg, time } = req.body;
  if (!to) return res.status(400).json({ error: 'Missing phone number' });

  const safeName    = String(name    || 'Client').replace(/[\r\n]/g, ' ').slice(0, 50);
  const safeService = String(service || '').replace(/[\r\n]/g, ' ').slice(0, 100);
  const safeAddress = String(address || '').replace(/[\r\n]/g, ' ').slice(0, 100);
  const safeMsg     = customMsg ? String(customMsg).replace(/[\r\n]/g, ' ').slice(0, 160) : null;

  const phone = normalizeAUPhone(to);
  if (!phone) return res.status(400).json({ error: 'Invalid Australian phone number' });

  const trackUrl = `https://drbikesydney.com.au/track.html?id=${bookingId || ''}`;
  const messages = {
    test:                `Dr. Bike Sydney SMS active`,
    confirmation:        `Dr. Bike Sydney ${safeService} confirmed at ${safeAddress}. Total: $${price}`,
    enroute:             `Hi ${safeName}! Your mechanic ${mechName ? mechName + ' ' : ''}is on the way to ${safeAddress}. Est. arrival: 10-20 min. Track live: ${trackUrl}`,
    completed:           `Hi ${safeName}! Your ${safeService} is complete. Total: $${price} AUD. Book again: https://drbikesydney.com.au`,
    reminder:            `Hi ${safeName}! Time for a bike check-up. Book your next service at https://drbikesydney.com.au`,
    review_request:      `Hi ${safeName}! Your ${safeService} is done. How did we do? ${reviewLink || 'https://drbikesydney.com.au'}`,
    cancellation_alert:  safeMsg || `CANCELLED: ${name} cancelled their ${safeService} booking.`,
    new_booking:         `NUEVA RESERVA: ${safeService} a las ${time || ''} - ${safeAddress}`,
  };
  const body = messages[type] || messages.confirmation;

  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const message = await client.messages.create({ body, from: process.env.TWILIO_PHONE_NUMBER, to: phone });
    return res.status(200).json({ success: true, sid: message.sid });
  } catch (err) {
    console.error('[send-sms] error:', err);
    return res.status(500).json({ error: 'SMS send failed' });
  }
}

// ── WhatsApp ──────────────────────────────────────────────────────────────────
function buildWAMessage(template, data) {
  const d = data || {};
  switch (template) {
    case 'confirmation':
      return `Hi ${d.name || 'there'} 👋\n\nYour Dr. Bike booking is confirmed!\n\n🔧 Service: ${d.service || 'Bike repair'}\n📅 Date: ${d.date || 'TBD'}\n📍 Location: ${d.suburb || 'your area'}\n💰 Price: $${d.price || '—'}\n\nYou'll receive a message when your mechanic is on the way. Track live at ${d.trackUrl || 'https://drbikesydney.com.au/track.html'}\n\n— Dr. Bike Sydney 🚲`;
    case 'enroute':
      return `Your Dr. Bike mechanic is on the way! 🚐\n\nHi ${d.name || 'there'}, *${d.mechanic || 'your mechanic'}* is heading to you now.\n\n⏱️ ETA: ~${d.eta || '20'} minutes\n📍 Heading to: ${d.suburb || 'your location'}\n\nTrack live: ${d.trackUrl || 'https://drbikesydney.com.au/track.html'}\n\n— Dr. Bike Sydney 🚲`;
    case 'completed':
      return `Job complete! ✅\n\nHi ${d.name || 'there'}, your bike has been serviced by *${d.mechanic || 'your mechanic'}*.\n\n🔧 ${d.service || 'Service'} — done!\n\nRate your experience: ${d.reviewUrl || 'https://drbikesydney.com.au'}\n\nThank you for choosing Dr. Bike Sydney! 🚲`;
    case 'reminder':
      return `Service reminder 🔔\n\nHi ${d.name || 'there'}! Your Dr. Bike service is coming up:\n\n📅 ${d.date || 'soon'} at ${d.time || 'your selected time'}\n📍 ${d.suburb || 'your location'}\n\nNeed to reschedule? https://drbikesydney.com.au\n\n— Dr. Bike Sydney 🚲`;
    case 'new_booking':
      return `Nueva reserva recibida 🚲\n\n🔧 ${d.service || 'Bike repair'}\n📅 ${d.date || ''} a las ${d.time || ''}\n📍 ${d.address || ''}\n👤 ${d.clientName || 'Cliente'}\n💰 $${d.price || '—'}\n\nVer: ${d.trackUrl || 'https://drbikesydney.com.au'}`;
    default:
      return null;
  }
}

async function handleWhatsApp(req, res) {
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('application/json')) return res.status(415).json({ error: 'Content-Type must be application/json' });

  const { to, template, data } = req.body || {};
  if (!to || !template) return res.status(400).json({ error: 'Missing required fields: to, template' });
  if (!['confirmation','enroute','completed','reminder','new_booking'].includes(template)) {
    return res.status(400).json({ error: 'Invalid template' });
  }

  const toNorm = normalizeAUPhone(to);
  if (!toNorm) return res.status(400).json({ error: 'Invalid Australian phone number' });

  let fromNumber = process.env.TWILIO_WHATSAPP_FROM;
  if (!fromNumber) {
    const { data: waRow } = await sb.from('van_zones')
      .select('postcode').eq('van_number', 0).eq('suburb', '__whatsapp__').maybeSingle();
    fromNumber = waRow?.postcode;
  }
  if (!fromNumber) return res.status(503).json({ error: 'WhatsApp not configured' });

  const body = buildWAMessage(template, data);
  if (!body) return res.status(400).json({ error: 'Could not build message for template' });

  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token } = process.env;
  if (!sid || !token) return res.status(503).json({ error: 'Twilio not configured' });

  try {
    const params = new URLSearchParams({ From: `whatsapp:${fromNumber}`, To: `whatsapp:${toNorm}`, Body: body });
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const result = await resp.json();
    if (!resp.ok) return res.status(502).json({ error: result.message || 'Twilio API error' });
    return res.status(200).json({ success: true, sid: result.sid });
  } catch (err) {
    console.error('[send-whatsapp] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ── Router ────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (await guard(req, res, { rateMax: 5, rateWindow: 60000 })) return;
  if (verifyInternalAuth(req, res)) return;

  const channel = req.query?.channel || 'sms';
  if (channel === 'whatsapp') return handleWhatsApp(req, res);
  return handleSMS(req, res);
}
