// PRODUCTION ENV VARS (Vercel):
//   TWILIO_ACCOUNT_SID   → ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   TWILIO_AUTH_TOKEN    → your auth token
//   TWILIO_PHONE_NUMBER  → +61XXXXXXXXX  (or Messaging Service SID: MGxxxxxxx)
import twilio from 'twilio';
import { guard, sanitize, sanitizeObj, rateLimit } from './_security.js';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export default async function handler(req, res) {
  if(guard(req, res, { rateMax: 20, rateWindow: 60000 })) return; // 20/min messaging
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, name, service, address, price, type, bookingId, mechName, reviewLink, customMsg } = req.body;
  if (!to) return res.status(400).json({ error: 'Missing phone number' });
  // Sanitize user-facing text to prevent SMS injection (no newlines in sender fields)
  const safeName = String(name||'Client').replace(/[\r\n]/g, ' ').slice(0, 50);
  const safeService = String(service||'').replace(/[\r\n]/g, ' ').slice(0, 100);
  const safeAddress = String(address||'').replace(/[\r\n]/g, ' ').slice(0, 100);
  const safeMsg = customMsg ? String(customMsg).replace(/[\r\n]/g, ' ').slice(0, 160) : null;

  const phone = normalizeAUPhone(to);
  if (!phone) return res.status(400).json({ error: 'Invalid Australian phone number' });

  const trackUrl = `https://dr-bike-sydney.vercel.app/track.html?id=${bookingId || ''}`;

  const messages = {
    test: `Dr. Bike Sydney SMS active ✓`,
    confirmation: `Dr. Bike Sydney ✅ ${safeService} confirmed at ${safeAddress}. Total: $${price}`,
    enroute: `Hi ${safeName}! Your mechanic ${mechName ? mechName + ' ' : ''}is on the way to ${safeAddress} 🚐\nEst. arrival: 10-20 min\nTrack live: ${trackUrl}`,
    completed: `Hi ${safeName}! Your ${safeService} is complete ✅ Total: $${price} AUD\nBook again: https://dr-bike-sydney.vercel.app — Thanks for choosing Dr. Bike Sydney!`,
    reminder: `Hi ${safeName}! Time for a bike check-up 🚲 Book your next service at https://dr-bike-sydney.vercel.app — We come to you, Mon–Sat.`,
    review_request: `Hi ${safeName}! Your ${safeService} is done ✅ How did we do? Leave a quick review (30 sec): ${reviewLink || 'https://dr-bike-sydney.vercel.app'} — Thanks! ⭐`,
    cancellation_alert: safeMsg || `CANCELLED: ${name} cancelled their ${safeService} booking. Slot is now free.`,
  };

  const body = messages[type] || messages.confirmation;

  try {
    const message = await client.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });
    return res.status(200).json({ success: true, sid: message.sid });
  } catch (error) {
    console.error('Twilio SMS error:', error);
    return res.status(500).json({ error: error.message });
  }
}

function normalizeAUPhone(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('61') && digits.length === 11) return '+' + digits;
  if (digits.startsWith('0') && digits.length === 10) return '+61' + digits.slice(1);
  if (digits.length === 9) return '+61' + digits;
  return null;
}
