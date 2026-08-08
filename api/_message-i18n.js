// api/_message-i18n.js — SMS and WhatsApp bodies in the client's language.
//
// Different approach from api/_email-i18n.js on purpose. The email templates are
// HTML, so the layout carries the structure and whole sentences can be swapped
// by a final replacement pass. An SMS is one short sentence with the values
// interleaved ("Hi NAME! MECH has accepted your SERVICE for TIME"), and Spanish
// and Chinese put those parts in a different order - a fragment swap would
// produce English word order with Spanish words in it. So each language gets its
// own builder.
//
// Only client-facing messages are here. The ones addressed to Diego
// (cancellation_alert, new_booking, noshow_alert, client_cancelled) are left in
// send-message.js as they are: he reads them in Spanish and they are not
// client-visible.
//
// An unknown language or type falls back to English rather than sending nothing.

const SUPPORTED = ['en', 'es', 'zh'];

export function normalizeLang(value) {
  const lang = String(value || '')
    .slice(0, 2)
    .toLowerCase();
  return SUPPORTED.includes(lang) ? lang : 'en';
}

const SITE = 'https://drbikesydney.com.au';

// `v` carries everything the callers already sanitised: name, service, address,
// price, time, mechName, etaMin, trackUrl, reviewLink.
const SMS = {
  en: {
    confirmation: (v) =>
      `Dr. Bike Sydney ${v.service} confirmed at ${v.address}. Total: $${v.price}`,
    accepted: (v) =>
      `Hi ${v.name}! ${v.mechName || 'Your mechanic'} has accepted your ${v.service}${v.time ? ` for ${v.time}` : ''}. We'll message you when they're on the way. Dr. Bike Sydney`,
    arrived: (v) =>
      `Hi ${v.name}! ${v.mechName || 'Your mechanic'} has arrived at ${v.address} and is starting your ${v.service}.`,
    upcoming: (v) =>
      `Hi ${v.name}! Reminder: your ${v.service} with Dr. Bike Sydney is coming up${v.time ? ` on ${v.time}` : ''}${v.address ? ` at ${v.address}` : ''}. Need to reschedule? Reply or call 0433 963 250.`,
    enroute: (v) =>
      `Hi ${v.name}! Your mechanic ${v.mechName ? v.mechName + ' ' : ''}is on the way to ${v.address}.${v.etaMin ? ` Est. arrival: ~${v.etaMin} min.` : ''} Track live: ${v.trackUrl}`,
    completed: (v) =>
      `Hi ${v.name}! Your ${v.service} is complete. Total: $${v.price} AUD. Book again: ${SITE}`,
    reminder: (v) => `Hi ${v.name}! Time for a bike check-up. Book your next service at ${SITE}`,
    review_request: (v) =>
      `Hi ${v.name}! Your ${v.service} is done. How did we do? ${v.reviewLink || SITE}`,
    // Reply to "I forgot which email I used". The address is masked: whoever
    // is holding this phone should be reminded, not handed the full address.
    email_recovery: (v) => `Dr. Bike Sydney: your account email is ${v.maskedEmail}. Sign in at ${SITE}`,
  },

  es: {
    confirmation: (v) =>
      `Dr. Bike Sydney: ${v.service} confirmado en ${v.address}. Total: $${v.price}`,
    accepted: (v) =>
      `¡Hola ${v.name}! ${v.mechName || 'Tu mecánico'} aceptó tu ${v.service}${v.time ? ` para ${v.time}` : ''}. Te escribimos cuando vaya en camino. Dr. Bike Sydney`,
    arrived: (v) =>
      `¡Hola ${v.name}! ${v.mechName || 'Tu mecánico'} llegó a ${v.address} y está empezando tu ${v.service}.`,
    upcoming: (v) =>
      `¡Hola ${v.name}! Recordatorio: tu ${v.service} con Dr. Bike Sydney se acerca${v.time ? `, el ${v.time}` : ''}${v.address ? ` en ${v.address}` : ''}. ¿Necesitás reprogramar? Respondé este mensaje o llamá al 0433 963 250.`,
    enroute: (v) =>
      `¡Hola ${v.name}! Tu mecánico ${v.mechName ? v.mechName + ' ' : ''}va en camino a ${v.address}.${v.etaMin ? ` Llegada estimada: ~${v.etaMin} min.` : ''} Seguilo en vivo: ${v.trackUrl}`,
    completed: (v) =>
      `¡Hola ${v.name}! Tu ${v.service} está listo. Total: $${v.price} AUD. Reservá de nuevo: ${SITE}`,
    reminder: (v) =>
      `¡Hola ${v.name}! Es hora de revisar tu bici. Reservá tu próximo servicio en ${SITE}`,
    review_request: (v) =>
      `¡Hola ${v.name}! Tu ${v.service} está terminado. ¿Cómo nos fue? ${v.reviewLink || SITE}`,
    email_recovery: (v) =>
      `Dr. Bike Sydney: tu email de la cuenta es ${v.maskedEmail}. Iniciá sesión en ${SITE}`,
  },

  zh: {
    confirmation: (v) =>
      `Dr. Bike Sydney：${v.service} 已确认，地点 ${v.address}。合计：$${v.price}`,
    accepted: (v) =>
      `${v.name} 您好！${v.mechName || '您的技师'} 已接受您的${v.service}${v.time ? `（${v.time}）` : ''}。技师出发时我们会再通知您。Dr. Bike Sydney`,
    arrived: (v) =>
      `${v.name} 您好！${v.mechName || '您的技师'} 已到达 ${v.address}，正在开始您的${v.service}。`,
    upcoming: (v) =>
      `${v.name} 您好！提醒：您在 Dr. Bike Sydney 的${v.service}即将开始${v.time ? `，时间 ${v.time}` : ''}${v.address ? `，地点 ${v.address}` : ''}。需要改期？回复本短信或致电 0433 963 250。`,
    enroute: (v) =>
      `${v.name} 您好！您的技师 ${v.mechName ? v.mechName + ' ' : ''}正在前往 ${v.address}。${v.etaMin ? `预计到达：约 ${v.etaMin} 分钟。` : ''} 实时追踪：${v.trackUrl}`,
    completed: (v) =>
      `${v.name} 您好！您的${v.service}已完成。合计：$${v.price} 澳元。再次预订：${SITE}`,
    reminder: (v) => `${v.name} 您好！该给自行车做保养了。在 ${SITE} 预订下次服务。`,
    review_request: (v) =>
      `${v.name} 您好！您的${v.service}已完成。您觉得怎么样？${v.reviewLink || SITE}`,
    email_recovery: (v) => `Dr. Bike Sydney：您账户的邮箱是 ${v.maskedEmail}。登录：${SITE}`,
  },
};

const TRACK_FALLBACK = `${SITE}/track.html`;

const WA = {
  en: {
    confirmation: (d) =>
      `Hi ${d.name || 'there'} 👋\n\nYour Dr. Bike booking is confirmed!\n\n🔧 Service: ${d.service || 'Bike repair'}\n📅 Date: ${d.date || 'TBD'}\n📍 Location: ${d.suburb || 'your area'}\n💰 Price: $${d.price || '—'}\n\nYou'll receive a message when your mechanic is on the way. Track live at ${d.trackUrl || TRACK_FALLBACK}\n\n— Dr. Bike Sydney 🚲`,
    enroute: (d) =>
      `Your Dr. Bike mechanic is on the way! 🚐\n\nHi ${d.name || 'there'}, *${d.mechanic || 'your mechanic'}* is heading to you now.\n${d.eta ? `\n⏱️ ETA: ~${d.eta} minutes` : ''}\n📍 Heading to: ${d.suburb || 'your location'}\n\nTrack live: ${d.trackUrl || TRACK_FALLBACK}\n\n— Dr. Bike Sydney 🚲`,
    completed: (d) =>
      `Job complete! ✅\n\nHi ${d.name || 'there'}, your bike has been serviced by *${d.mechanic || 'your mechanic'}*.\n\n🔧 ${d.service || 'Service'} — done!\n\nRate your experience: ${d.reviewUrl || SITE}\n\nThank you for choosing Dr. Bike Sydney! 🚲`,
    reminder: (d) =>
      `Service reminder 🔔\n\nHi ${d.name || 'there'}! Your Dr. Bike service is coming up:\n\n📅 ${d.date || 'soon'} at ${d.time || 'your selected time'}\n📍 ${d.suburb || 'your location'}\n\nNeed to reschedule? ${SITE}\n\n— Dr. Bike Sydney 🚲`,
  },

  es: {
    confirmation: (d) =>
      `¡Hola ${d.name || ''} 👋!\n\n¡Tu reserva con Dr. Bike está confirmada!\n\n🔧 Servicio: ${d.service || 'Reparación de bici'}\n📅 Fecha: ${d.date || 'a definir'}\n📍 Lugar: ${d.suburb || 'tu zona'}\n💰 Precio: $${d.price || '—'}\n\nTe avisamos cuando el mecánico vaya en camino. Seguilo en vivo en ${d.trackUrl || TRACK_FALLBACK}\n\n— Dr. Bike Sydney 🚲`,
    enroute: (d) =>
      `¡Tu mecánico de Dr. Bike va en camino! 🚐\n\nHola ${d.name || ''}, *${d.mechanic || 'tu mecánico'}* está yendo para allá.\n${d.eta ? `\n⏱️ Llegada estimada: ~${d.eta} minutos` : ''}\n📍 Rumbo a: ${d.suburb || 'tu ubicación'}\n\nSeguilo en vivo: ${d.trackUrl || TRACK_FALLBACK}\n\n— Dr. Bike Sydney 🚲`,
    completed: (d) =>
      `¡Trabajo terminado! ✅\n\nHola ${d.name || ''}, *${d.mechanic || 'tu mecánico'}* ya hizo el servicio de tu bici.\n\n🔧 ${d.service || 'Servicio'} — ¡listo!\n\nCalificá tu experiencia: ${d.reviewUrl || SITE}\n\n¡Gracias por elegir Dr. Bike Sydney! 🚲`,
    reminder: (d) =>
      `Recordatorio de servicio 🔔\n\n¡Hola ${d.name || ''}! Tu servicio con Dr. Bike se acerca:\n\n📅 ${d.date || 'pronto'} a las ${d.time || 'la hora que elegiste'}\n📍 ${d.suburb || 'tu ubicación'}\n\n¿Necesitás reprogramar? ${SITE}\n\n— Dr. Bike Sydney 🚲`,
  },

  zh: {
    confirmation: (d) =>
      `${d.name || ''} 您好 👋\n\n您在 Dr. Bike 的预订已确认！\n\n🔧 服务：${d.service || '自行车维修'}\n📅 日期：${d.date || '待定'}\n📍 地点：${d.suburb || '您所在区域'}\n💰 价格：$${d.price || '—'}\n\n技师出发时我们会通知您。实时追踪：${d.trackUrl || TRACK_FALLBACK}\n\n— Dr. Bike Sydney 🚲`,
    enroute: (d) =>
      `您的 Dr. Bike 技师正在路上！🚐\n\n${d.name || ''} 您好，*${d.mechanic || '您的技师'}* 正在前往您那里。\n${d.eta ? `\n⏱️ 预计到达：约 ${d.eta} 分钟` : ''}\n📍 前往：${d.suburb || '您的位置'}\n\n实时追踪：${d.trackUrl || TRACK_FALLBACK}\n\n— Dr. Bike Sydney 🚲`,
    completed: (d) =>
      `服务已完成！✅\n\n${d.name || ''} 您好，*${d.mechanic || '您的技师'}* 已完成您自行车的保养。\n\n🔧 ${d.service || '服务'} — 已完成！\n\n为您的体验评分：${d.reviewUrl || SITE}\n\n感谢您选择 Dr. Bike Sydney！🚲`,
    reminder: (d) =>
      `服务提醒 🔔\n\n${d.name || ''} 您好！您在 Dr. Bike 的服务即将开始：\n\n📅 ${d.date || '即将'} ${d.time || '您选择的时间'}\n📍 ${d.suburb || '您的位置'}\n\n需要改期？${SITE}\n\n— Dr. Bike Sydney 🚲`,
  },
};

export const CLIENT_SMS_TYPES = Object.keys(SMS.en);
export const CLIENT_WA_TEMPLATES = Object.keys(WA.en);

// Returns null when the type is not a client-facing one, so the caller keeps its
// own (internal, Spanish) copy for those.
export function smsBody(type, lang, vars) {
  const code = normalizeLang(lang);
  // eslint-disable-next-line security/detect-object-injection -- code is one of SUPPORTED
  const table = SMS[code] || SMS.en;
  const builder = Object.hasOwn(table, type)
    ? // eslint-disable-next-line security/detect-object-injection -- guarded by hasOwn
      table[type]
    : null;
  if (!builder) return null;
  return builder(vars || {});
}

export function waBody(template, lang, data) {
  const code = normalizeLang(lang);
  // eslint-disable-next-line security/detect-object-injection -- code is one of SUPPORTED
  const table = WA[code] || WA.en;
  const builder = Object.hasOwn(table, template)
    ? // eslint-disable-next-line security/detect-object-injection -- guarded by hasOwn
      table[template]
    : null;
  if (!builder) return null;
  return builder(data || {});
}

// Exported for the drift test: every client-facing type must exist in all three
// languages, or a client silently gets the English one.
export const tables = { sms: SMS, wa: WA };
