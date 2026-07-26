// Handles both SMS (?channel=sms) and WhatsApp (?channel=whatsapp).
// Vercel rewrites map /api/send-sms and /api/send-whatsapp to this file.
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';
import {
  guard,
  verifyInternalAuth,
  normalizeAUPhone,
  isInternalCall,
  isBusinessRecipient,
  isStaffPhone,
  recipientForBooking,
} from './_security.js';
import { smsBody, waBody, normalizeLang } from './_message-i18n.js';
import { drivingEtaMinutes } from './_eta.js';

const sb = createClient(
  process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// Retry a send up to `attempts` times with linear backoff. Returns {ok,result,attempts,error}.
async function sendWithRetry(fn, { attempts = 3, delayMs = 500 } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return { ok: true, result: await fn(), attempts: i };
    } catch (e) {
      lastErr = e;
      if (i < attempts) await new Promise((r) => setTimeout(r, delayMs * i));
    }
  }
  return { ok: false, error: lastErr, attempts };
}

// Best-effort log to notification_log (no-op if the table doesn't exist yet).
async function logNotification(row) {
  try {
    await sb.from('notification_log').insert(row);
  } catch {}
}

// ── SMS ───────────────────────────────────────────────────────────────────────
async function handleSMS(req, res) {
  const {
    to,
    name,
    service,
    address,
    price,
    type,
    bookingId,
    mechName,
    reviewLink,
    customMsg,
    time,
    mechLat,
    mechLng,
    destAddress,
  } = req.body;
  if (!to) return res.status(400).json({ error: 'Missing phone number' });

  const safeName = String(name || 'Client')
    .replace(/[\r\n]/g, ' ')
    .slice(0, 50);
  const safeService = String(service || '')
    .replace(/[\r\n]/g, ' ')
    .slice(0, 100);
  const safeAddress = String(address || '')
    .replace(/[\r\n]/g, ' ')
    .slice(0, 100);
  const safeMsg = customMsg
    ? String(customMsg)
        .replace(/[\r\n]/g, ' ')
        .slice(0, 160)
    : null;

  let phone = normalizeAUPhone(to);
  if (!phone) return res.status(400).json({ error: 'Invalid Australian phone number' });

  // Same rule as send-email: a browser call cannot pick the destination number.
  // Twilio messages cost real money and land as the business, so the number has
  // to be one we already know - our own, one of our staff, or the phone stored
  // on the booking being notified.
  if (!isInternalCall(req) && !isBusinessRecipient(phone) && !(await isStaffPhone(phone))) {
    const bound = normalizeAUPhone(await recipientForBooking(bookingId, 'client_phone'));
    if (!bound) {
      return res.status(403).json({ error: 'A booking id is required to text this number' });
    }
    phone = bound;
  }

  const trackUrl = `https://drbikesydney.com.au/track.html?id=${bookingId || ''}`;

  // Real driving time from where the mechanic actually is to the client's
  // street address. If it can't be worked out we say nothing about timing
  // rather than repeating the old hardcoded "10-20 min" to everyone.
  const etaMin =
    type === 'enroute'
      ? await drivingEtaMinutes({
          fromLat: mechLat,
          fromLng: mechLng,
          address: destAddress || address,
        })
      : null;
  // Language: the caller can pass it (the app knows what the client is reading),
  // otherwise it comes off the booking - the crons run server-side with no
  // browser to ask. Unknown values fall back to English.
  const lang = normalizeLang(
    req.body?.lang || (await recipientForBooking(bookingId, 'client_lang'))
  );

  // Messages addressed to Diego, not to a client: they stay as they are (he
  // reads them in Spanish) and are never affected by the client's language.
  const INTERNAL = {
    test: `Dr. Bike Sydney SMS active`,
    cancellation_alert: safeMsg || `CANCELLED: ${name} cancelled their ${safeService} booking.`,
    new_booking: `NUEVA RESERVA: ${safeService} a las ${time || ''} - ${safeAddress}`,
  };

  const safeTime = (max) =>
    time
      ? String(time)
          .replace(/[\r\n]/g, ' ')
          .slice(0, max)
      : '';

  const body =
    (Object.hasOwn(INTERNAL, type) ? INTERNAL[type] : null) ??
    smsBody(type, lang, {
      name: safeName,
      service: safeService,
      address: safeAddress,
      price,
      mechName,
      etaMin,
      trackUrl,
      reviewLink,
      time: type === 'accepted' ? safeTime(40) : safeTime(60),
    }) ??
    smsBody('confirmation', lang, {
      service: safeService,
      address: safeAddress,
      price,
    });

  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const r = await sendWithRetry(() =>
    client.messages.create({ body, from: process.env.TWILIO_PHONE_NUMBER, to: phone })
  );
  await logNotification({
    channel: 'sms',
    recipient: phone,
    type: type || 'confirmation',
    status: r.ok ? 'sent' : 'failed',
    attempts: r.attempts,
    error: r.ok ? null : String(r.error?.message || r.error).slice(0, 300),
    booking_id: bookingId ? String(bookingId) : null,
  });
  if (!r.ok) {
    console.error('[send-sms] error after retries:', r.error);
    return res.status(500).json({ error: 'SMS send failed' });
  }
  return res.status(200).json({ success: true, sid: r.result.sid });
}

// ── WhatsApp ──────────────────────────────────────────────────────────────────
// The four client-facing templates (confirmation, enroute, completed, reminder)
// live in api/_message-i18n.js, one builder per language. What is left in the
// switch below is only the mail addressed to Diego, which stays in Spanish.
function buildWAMessage(template, data, lang) {
  const fromDict = waBody(template, lang, data);
  if (fromDict) return fromDict;

  const d = data || {};
  switch (template) {
    case 'confirmation':
      return `Hi ${d.name || 'there'} 👋\n\nYour Dr. Bike booking is confirmed!\n\n🔧 Service: ${d.service || 'Bike repair'}\n📅 Date: ${d.date || 'TBD'}\n📍 Location: ${d.suburb || 'your area'}\n💰 Price: $${d.price || '—'}\n\nYou'll receive a message when your mechanic is on the way. Track live at ${d.trackUrl || 'https://drbikesydney.com.au/track.html'}\n\n— Dr. Bike Sydney 🚲`;
    case 'enroute':
      // The ETA line is dropped entirely when the real driving time is
      // unavailable - the old `d.eta || '20'` default sent every client the
      // same made-up number.
      return `Your Dr. Bike mechanic is on the way! 🚐\n\nHi ${d.name || 'there'}, *${d.mechanic || 'your mechanic'}* is heading to you now.\n${d.eta ? `\n⏱️ ETA: ~${d.eta} minutes` : ''}\n📍 Heading to: ${d.suburb || 'your location'}\n\nTrack live: ${d.trackUrl || 'https://drbikesydney.com.au/track.html'}\n\n— Dr. Bike Sydney 🚲`;
    case 'completed':
      return `Job complete! ✅\n\nHi ${d.name || 'there'}, your bike has been serviced by *${d.mechanic || 'your mechanic'}*.\n\n🔧 ${d.service || 'Service'} — done!\n\nRate your experience: ${d.reviewUrl || 'https://drbikesydney.com.au'}\n\nThank you for choosing Dr. Bike Sydney! 🚲`;
    case 'reminder':
      return `Service reminder 🔔\n\nHi ${d.name || 'there'}! Your Dr. Bike service is coming up:\n\n📅 ${d.date || 'soon'} at ${d.time || 'your selected time'}\n📍 ${d.suburb || 'your location'}\n\nNeed to reschedule? https://drbikesydney.com.au\n\n— Dr. Bike Sydney 🚲`;
    case 'new_booking':
      return `Nueva reserva recibida 🚲\n\n🔧 ${d.service || 'Bike repair'}\n📅 ${d.date || ''} a las ${d.time || ''}\n📍 ${d.address || ''}\n👤 ${d.clientName || 'Cliente'}\n💰 $${d.price || '—'}\n\nVer: ${d.trackUrl || 'https://drbikesydney.com.au'}`;
    case 'noshow_alert':
      return `⚠️ Reserva vencida sin completar\n\nDiego, esta reserva ya pasó su horario y sigue sin marcarse como completada. El cliente puede estar esperando.\n\n👤 ${d.clientName || 'Cliente'}\n🔧 ${d.service || 'Servicio'}\n📅 ${d.date || ''} a las ${d.time || ''}\n📍 ${d.suburb || ''}\n⏱️ ${d.hours ?? '—'} horas de retraso\n📋 Estado actual: ${d.status || '—'}${d.assigned ? '' : ' (SIN mecánico asignado)'}\n\nRevisar: https://drbikesydney.com.au/admin.html`;
    case 'client_cancelled': {
      if (!d.refund) {
        return `⚠️ Cancelación de cliente\n\nDiego, este cliente ha cancelado su servicio, pero no debes reembolsar su dinero. Lo canceló con ${d.hours ?? '—'} horas de anticipación antes del servicio.\n\n👤 ${d.clientName || 'Cliente'}\n🔧 ${d.service || 'Servicio'}\n📅 ${d.date || ''} a las ${d.time || ''}`;
      }
      const status = d.refunded
        ? `✅ Reembolso de $20 procesado automáticamente. Revisa que todo esté en orden.`
        : `⚠️ Debía reembolsarse $20 (más de 24h de anticipación) pero no se pudo procesar automáticamente. Revisa manualmente en Stripe.`;
      return `⚠️ Cancelación de cliente\n\n${status}\n\n👤 ${d.clientName || 'Cliente'}\n🔧 ${d.service || 'Servicio'}\n📅 ${d.date || ''} a las ${d.time || ''}\n⏱️ Canceló con ${d.hours ?? '—'} horas de anticipación (más de 24h)`;
    }
    default:
      return null;
  }
}

async function handleWhatsApp(req, res) {
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('application/json'))
    return res.status(415).json({ error: 'Content-Type must be application/json' });

  const { to, template, data } = req.body || {};
  if (!to || !template)
    return res.status(400).json({ error: 'Missing required fields: to, template' });
  if (
    ![
      'confirmation',
      'enroute',
      'completed',
      'reminder',
      'new_booking',
      'client_cancelled',
      'noshow_alert',
    ].includes(template)
  ) {
    return res.status(400).json({ error: 'Invalid template' });
  }

  let toNorm = normalizeAUPhone(to);
  if (!toNorm) return res.status(400).json({ error: 'Invalid Australian phone number' });

  // Browser calls cannot choose the destination - see handleSMS above.
  if (!isInternalCall(req) && !isBusinessRecipient(toNorm) && !(await isStaffPhone(toNorm))) {
    const bound = normalizeAUPhone(await recipientForBooking(data?.bookingId, 'client_phone'));
    if (!bound) {
      return res.status(403).json({ error: 'A booking id is required to message this number' });
    }
    toNorm = bound;
  }

  // Vercel has this as TWILIO_WHATSAPP_NUMBER while the code only ever read
  // TWILIO_WHATSAPP_FROM, so WhatsApp has been silently running off the
  // van_zones fallback row below - which breaks the day anyone edits that row.
  // Accept both names rather than making the env var the thing that has to be
  // renamed correctly.
  let fromNumber = process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_WHATSAPP_NUMBER;
  if (!fromNumber) {
    const { data: waRow } = await sb
      .from('van_zones')
      .select('postcode')
      .eq('van_number', 0)
      .eq('suburb', '__whatsapp__')
      .maybeSingle();
    fromNumber = waRow?.postcode;
  }
  if (!fromNumber) return res.status(503).json({ error: 'WhatsApp not configured' });

  if (normalizeAUPhone(fromNumber) === toNorm) {
    await logNotification({
      channel: 'whatsapp',
      recipient: toNorm,
      type: template,
      status: 'skipped_self',
      attempts: 0,
      error: 'to matches the business WhatsApp sender number',
      booking_id: data?.bookingId ? String(data.bookingId) : null,
    });
    return res.status(200).json({ success: true, skipped: true, reason: 'to_equals_from' });
  }

  // Same real-ETA lookup as the SMS path, so both channels quote the same number.
  const waData =
    template === 'enroute'
      ? {
          ...data,
          eta: await drivingEtaMinutes({
            fromLat: data?.mechLat,
            fromLng: data?.mechLng,
            address: data?.destAddress,
          }),
        }
      : data;

  const waLang = normalizeLang(
    req.body?.lang || (await recipientForBooking(data?.bookingId, 'client_lang'))
  );
  const body = buildWAMessage(template, waData, waLang);
  if (!body) return res.status(400).json({ error: 'Could not build message for template' });

  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token } = process.env;
  if (!sid || !token) return res.status(503).json({ error: 'Twilio not configured' });

  const params = new URLSearchParams({
    From: `whatsapp:${fromNumber}`,
    To: `whatsapp:${toNorm}`,
    Body: body,
  });
  const send = async () => {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.message || 'Twilio API error');
    return result;
  };
  const r = await sendWithRetry(send);
  await logNotification({
    channel: 'whatsapp',
    recipient: toNorm,
    type: template,
    status: r.ok ? 'sent' : 'failed',
    attempts: r.attempts,
    error: r.ok ? null : String(r.error?.message || r.error).slice(0, 300),
    booking_id: data?.bookingId ? String(data.bookingId) : null,
  });
  if (!r.ok) {
    console.error('[send-whatsapp] error after retries:', r.error);
    return res.status(502).json({ error: r.error?.message || 'WhatsApp send failed' });
  }
  return res.status(200).json({ success: true, sid: r.result.sid });
}

// ── Router ────────────────────────────────────────────────────────────────────
// ── ETA lookup ────────────────────────────────────────────────────────────────
// The mechanic app assembles the push body on the device, so it needs the same
// number this file puts in the SMS and WhatsApp.
async function handleEta(req, res) {
  const { mechLat, mechLng, destAddress } = req.body || {};
  const minutes = await drivingEtaMinutes({
    fromLat: mechLat,
    fromLng: mechLng,
    address: destAddress,
  });
  // 200 with minutes:null is the normal "couldn't work it out" answer - the
  // caller drops the ETA line rather than treating it as an error.
  return res.status(200).json({ minutes });
}

export default async function handler(req, res) {
  if (await guard(req, res, { rateMax: 5, rateWindow: 60000 })) return;
  if (verifyInternalAuth(req, res)) return;

  const channel = req.query?.channel || 'sms';
  if (channel === 'whatsapp') return handleWhatsApp(req, res);
  // Rides along on this file rather than becoming api/eta.js: the Hobby plan
  // caps a deployment at 12 Serverless Functions and we are already at 12.
  if (channel === 'eta') return handleEta(req, res);
  return handleSMS(req, res);
}
