// api/_email-i18n.js — server-side counterpart of js/i18n.js, for outgoing mail.
//
// The templates in send-email.js are authored in English and stay that way; the
// translation is a final pass over the already-rendered subject and HTML. Every
// key below is the exact text that sits between two tags (or the literal part of
// a subject line), so a straight string replacement leaves the markup, the
// interpolated values, the amounts and the URLs untouched - the same trade-off
// js/i18n.js makes on the client, for the same reason: no build step.
//
// Replacement is longest-first so that a short key can never eat part of a
// longer phrase that contains it.
//
// Only client-facing copy is translated. Mail that goes to Diego or to a
// mechanic (mechanic_new_booking, cancellation_admin, booking_confirmation)
// stays in English on purpose - the team works in English.

const dict = {
  es: {
    // ── Shared header/footer/table ──────────────────────────────────────────
    'Dr. Bike Sydney · drbikesydney.com.au · Sydney NSW':
      'Dr. Bike Sydney · drbikesydney.com.au · Sídney NSW',
    'ABN: 87 654 025 287 · contact@drbikesydney.com.au':
      'ABN: 87 654 025 287 · contact@drbikesydney.com.au',
    'We come to you &mdash; home, work or park &middot; Mon&ndash;Sat':
      'Vamos a donde estés &mdash; casa, trabajo o parque &middot; lun&ndash;sáb',
    'We come to you — home, work or park · Mon–Sat':
      'Vamos a donde estés — casa, trabajo o parque · lun–sáb',
    'We come to you &mdash; home, work or park &middot; 0433 963 250':
      'Vamos a donde estés &mdash; casa, trabajo o parque &middot; 0433 963 250',
    'Questions? Reply to this email or WhatsApp us at +61 433 963 250':
      '¿Dudas? Responde este correo o escríbenos por WhatsApp al +61 433 963 250',
    'Questions? Call us on 0433 963 250.': '¿Dudas? Llámanos al 0433 963 250.',
    'Need to change something? Call or text 0433 963 250.':
      '¿Necesitas cambiar algo? Llama o escribe al 0433 963 250.',
    'Date & time': 'Fecha y hora',
    'Net amount': 'Importe neto',
    'GST (10%)': 'GST (10%)',
    'Total (AUD)': 'Total (AUD)',
    'Subtotal (excl. GST)': 'Subtotal (sin GST)',
    'Tax Invoice': 'Factura',
    Service: 'Servicio',
    Address: 'Dirección',
    Location: 'Ubicación',

    // ── confirmation ────────────────────────────────────────────────────────
    ', your booking is confirmed ✅ Your mechanic will contact you 30 min before arrival.':
      ', tu reserva está confirmada ✅ El mecánico te contactará 30 minutos antes de llegar.',
    '📍 What happens next': '📍 Qué sigue ahora',
    '1. Your mechanic will be assigned shortly': '1. Te asignaremos un mecánico en breve',
    "2. You'll get a notification when they're on the way":
      '2. Te avisaremos cuando vaya en camino',
    '3. Payment collected on completion': '3. El pago se cobra al finalizar',
    'View your booking →': 'Ver mi reserva →',
    '🎁 Share Dr. Bike — earn $15 off your next service':
      '🎁 Comparte Dr. Bike — gana $15 de descuento en tu próximo servicio',
    'You and your friend each get $15 off when they use your code':
      'Tú y tu amigo reciben $15 de descuento cada uno cuando use tu código',
    'Your code': 'Tu código',

    // ── upcoming / reminder ─────────────────────────────────────────────────
    ", a reminder that your booking with Dr. Bike Sydney is coming up. We'll message you again on the day, and your mechanic will let you know when they're on the way.":
      ', te recordamos que tu reserva con Dr. Bike Sydney se acerca. Te escribiremos de nuevo ese día, y el mecánico te avisará cuando vaya en camino.',
    ', just a friendly reminder that your booking is coming up in about':
      ', te recordamos que tu reserva es en aproximadamente',
    '. Your mechanic will contact you ~30 min before arrival.':
      '. El mecánico te contactará unos 30 minutos antes de llegar.',
    '2 hours': '2 horas',
    'Your booking details': 'Detalles de tu reserva',
    '✅ Quick checklist': '✅ Checklist rápido',
    '✅ Before the day': '✅ Antes del día',
    '• Have your bike accessible at the address': '• Ten la bici accesible en la dirección',
    '• Make sure the bike will be accessible at the address':
      '• Asegúrate de que la bici esté accesible en la dirección',
    '• Clear a small space for the mechanic to work':
      '• Deja un espacio libre para que el mecánico trabaje',
    '• Free to cancel or reschedule up to 2h before':
      '• Cancelar o reprogramar es gratis hasta 2 h antes',
    '• Need to change something? Free to cancel up to 2h before':
      '• ¿Necesitas cambiar algo? Cancelar es gratis hasta 2 h antes',
    '• Let us know now if the time no longer works':
      '• Avísanos ahora si el horario ya no te sirve',

    // ── review_request ──────────────────────────────────────────────────────
    "is complete! We'd love to hear how it went.": 'está listo. Nos encantaría saber cómo te fue.',
    'It takes less than 30 seconds and helps other Sydney cyclists find us 🙏':
      'Toma menos de 30 segundos y ayuda a que otros ciclistas de Sídney nos encuentren 🙏',
    'Leave a review →': 'Dejar una reseña →',
    'Rate your experience': 'Califica tu experiencia',

    // ── cancellation_client ─────────────────────────────────────────────────
    ', your booking has been cancelled as requested.': ', tu reserva fue cancelada como pediste.',
    'Refund information': 'Información del reembolso',
    'If you paid online, your refund will be processed within 5–7 business days. For questions contact contact@drbikesydney.com.au':
      'Si pagaste en línea, el reembolso se procesa en 5–7 días hábiles. Ante cualquier duda escribe a contact@drbikesydney.com.au',
    'Book a service →': 'Reservar un servicio →',
    'Book a service now →': 'Reservar un servicio ahora →',

    // ── waitlist_confirmation ───────────────────────────────────────────────
    ", you're on the waitlist for": ', estás en la lista de espera para',
    "We'll send you an email the moment a slot opens up on that day. You'll have 30 minutes to complete your booking before it's offered to the next person on the list.":
      'Te escribiremos apenas se libere un turno ese día. Tendrás 30 minutos para completar tu reserva antes de ofrecérsela a la siguiente persona de la lista.',
    'Check other dates →': 'Ver otras fechas →',

    // ── referral_success ────────────────────────────────────────────────────
    '$15 credit earned': '$15 de crédito ganados',
    'Applied automatically to your next service': 'Se aplica solo en tu próximo servicio',
    'Total referrals': 'Referidos totales',
    'Keep sharing your code — every referral earns you both $15 off. 🚲':
      'Sigue compartiendo tu código — cada referido les da $15 de descuento a los dos. 🚲',
    'How to redeem': 'Cómo usarlo',
    '1. Book any service at drbikesydney.com.au':
      '1. Reserva cualquier servicio en drbikesydney.com.au',
    '2. Enter code': '2. Ingresa el código',
    'at checkout': 'al pagar',
    '3. The value is deducted from your service total':
      '3. El valor se descuenta del total de tu servicio',

    // ── gift_card ───────────────────────────────────────────────────────────
    'sent you a Dr. Bike Sydney gift card 🚲': 'te envió una gift card de Dr. Bike Sydney 🚲',
    'Gift card value': 'Valor de la gift card',

    // ── payment_failed / payment_action_required ────────────────────────────
    ", we couldn't process your membership payment of":
      ', no pudimos procesar el pago de tu membresía de',
    'Please update your payment method to keep your membership active. Your access will be paused if payment fails again.':
      'Actualiza tu método de pago para mantener la membresía activa. Si el pago vuelve a fallar, tu acceso quedará pausado.',
    'Update payment method →': 'Actualizar método de pago →',
    '⚡ Action needed': '⚡ Acción necesaria',
    'Action required': 'Acción requerida',
    ', your bank requires additional verification for your membership renewal.':
      ', tu banco pide una verificación adicional para renovar tu membresía.',
    '🔐 One more step': '🔐 Un paso más',
    'Your bank uses 3D Secure authentication. Click below to complete verification and keep your membership active.':
      'Tu banco usa autenticación 3D Secure. Haz clic abajo para completar la verificación y mantener la membresía activa.',
    'Complete verification →': 'Completar verificación →',

    // ── reengagement ────────────────────────────────────────────────────────
    ", it's been 6+ months since your last service. Regular maintenance keeps your bike safe and riding smoothly!":
      ', pasaron más de 6 meses desde tu último servicio. El mantenimiento regular mantiene tu bici segura y andando suave.',
    '🔧 Why regular servicing matters': '🔧 Por qué importa el mantenimiento regular',
    '&bull; Brake pads wear out and can become unsafe':
      '&bull; Las pastillas de freno se gastan y pueden volverse inseguras',
    '&bull; Cables stretch and affect shifting precision':
      '&bull; Los cables se estiran y afectan la precisión de los cambios',
    '&bull; Chain wear accelerates drivetrain damage':
      '&bull; Una cadena gastada acelera el desgaste de la transmisión',
    '&bull; A Tune-Up takes ~1h and keeps you safe':
      '&bull; Un ajuste toma ~1 h y te mantiene seguro',
    "Worn brake pads, stretched cables and dirty drivetrains reduce performance and can be dangerous. A quick tune-up extends your bike's life significantly.":
      'Las pastillas gastadas, los cables estirados y una transmisión sucia bajan el rendimiento y pueden ser peligrosos. Un ajuste rápido alarga bastante la vida de tu bici.',
    'Welcome back offer': 'Oferta de bienvenida',
    'Book now — use BACK15 &rarr;': 'Reserva ahora — usa BACK15 &rarr;',
    'Book again →': 'Reservar de nuevo →',
    'any service booked this week': 'en cualquier servicio reservado esta semana',
    'your next service — valid 14 days': 'tu próximo servicio — válido 14 días',

    // ── abandoned_recovery ──────────────────────────────────────────────────
    ', you started booking a': ', empezaste a reservar un',
    'Complete my booking &rarr;': 'Completar mi reserva &rarr;',

    // ── birthday_promo ──────────────────────────────────────────────────────
    ', wishing you an amazing birthday from the whole Dr. Bike team! 🚲':
      ', ¡todo el equipo de Dr. Bike te desea un feliz cumpleaños! 🚲',
    'Your birthday gift': 'Tu regalo de cumpleaños',
    '&bull; Valid for 7 days from your birthday': '&bull; Válido por 7 días desde tu cumpleaños',
    '&bull; Applies to any service $109+': '&bull; Aplica a cualquier servicio de $109 o más',
    '&bull; Enter code at checkout': '&bull; Ingresa el código al pagar',
    '&bull; One use per customer': '&bull; Un uso por cliente',
    'Redeem my birthday gift &rarr;': 'Usar mi regalo de cumpleaños &rarr;',

    // ── tip_received ────────────────────────────────────────────────────────
    'Goes directly to the mechanic': 'Va directo al mecánico',
  },

  zh: {
    'Dr. Bike Sydney · drbikesydney.com.au · Sydney NSW':
      'Dr. Bike Sydney · drbikesydney.com.au · 悉尼 NSW',
    'ABN: 87 654 025 287 · contact@drbikesydney.com.au':
      'ABN: 87 654 025 287 · contact@drbikesydney.com.au',
    'We come to you &mdash; home, work or park &middot; Mon&ndash;Sat':
      '我们上门服务 &mdash; 家里、公司或公园 &middot; 周一至周六',
    'We come to you — home, work or park · Mon–Sat': '我们上门服务 — 家里、公司或公园 · 周一至周六',
    'We come to you &mdash; home, work or park &middot; 0433 963 250':
      '我们上门服务 &mdash; 家里、公司或公园 &middot; 0433 963 250',
    'Questions? Reply to this email or WhatsApp us at +61 433 963 250':
      '有疑问？回复此邮件，或通过 WhatsApp 联系 +61 433 963 250',
    'Questions? Call us on 0433 963 250.': '有疑问？请致电 0433 963 250。',
    'Need to change something? Call or text 0433 963 250.': '需要更改？请致电或短信 0433 963 250。',
    'Date & time': '日期和时间',
    'Net amount': '不含税金额',
    'GST (10%)': 'GST（10%）',
    'Total (AUD)': '总计（澳元）',
    'Subtotal (excl. GST)': '小计（不含 GST）',
    'Tax Invoice': '税务发票',
    Service: '服务',
    Address: '地址',
    Location: '地点',

    ', your booking is confirmed ✅ Your mechanic will contact you 30 min before arrival.':
      '，您的预订已确认 ✅ 技师会在到达前 30 分钟与您联系。',
    '📍 What happens next': '📍 接下来会怎样',
    '1. Your mechanic will be assigned shortly': '1. 我们会尽快为您安排技师',
    "2. You'll get a notification when they're on the way": '2. 技师出发时您会收到通知',
    '3. Payment collected on completion': '3. 服务完成后收款',
    'View your booking →': '查看我的预订 →',
    '🎁 Share Dr. Bike — earn $15 off your next service': '🎁 分享 Dr. Bike — 下次服务立减 $15',
    'You and your friend each get $15 off when they use your code':
      '朋友使用您的邀请码后，你们各得 $15 优惠',
    'Your code': '您的邀请码',

    ", a reminder that your booking with Dr. Bike Sydney is coming up. We'll message you again on the day, and your mechanic will let you know when they're on the way.":
      '，提醒您与 Dr. Bike Sydney 的预约就快到了。当天我们会再次通知您，技师出发时也会告知。',
    ', just a friendly reminder that your booking is coming up in about':
      '，温馨提醒：您的预约大约还有',
    '. Your mechanic will contact you ~30 min before arrival.':
      '。技师会在到达前约 30 分钟与您联系。',
    '2 hours': '2 小时',
    'Your booking details': '您的预订详情',
    '✅ Quick checklist': '✅ 快速清单',
    '✅ Before the day': '✅ 服务当天之前',
    '• Have your bike accessible at the address': '• 请把自行车放在方便取用的位置',
    '• Make sure the bike will be accessible at the address': '• 请确保技师到达时能拿到自行车',
    '• Clear a small space for the mechanic to work': '• 为技师留出一小块工作空间',
    '• Free to cancel or reschedule up to 2h before': '• 服务前 2 小时可免费取消或改期',
    '• Need to change something? Free to cancel up to 2h before':
      '• 需要更改？服务前 2 小时可免费取消',
    '• Let us know now if the time no longer works': '• 如果时间不合适，请尽早告知我们',

    "is complete! We'd love to hear how it went.": '已完成！很想知道您的体验如何。',
    'It takes less than 30 seconds and helps other Sydney cyclists find us 🙏':
      '只需不到 30 秒，还能帮助更多悉尼骑行者找到我们 🙏',
    'Leave a review →': '去留下评价 →',
    'Rate your experience': '为您的体验评分',

    ', your booking has been cancelled as requested.': '，您的预订已按要求取消。',
    'Refund information': '退款说明',
    'If you paid online, your refund will be processed within 5–7 business days. For questions contact contact@drbikesydney.com.au':
      '如果您已在线付款，退款将在 5–7 个工作日内处理。如有疑问请联系 contact@drbikesydney.com.au',
    'Book a service →': '预订服务 →',
    'Book a service now →': '立即预订服务 →',

    ", you're on the waitlist for": '，您已加入候补名单：',
    "We'll send you an email the moment a slot opens up on that day. You'll have 30 minutes to complete your booking before it's offered to the next person on the list.":
      '当天一有空位我们就会发邮件通知您。您有 30 分钟完成预订，逾期将让给名单上的下一位。',
    'Check other dates →': '查看其他日期 →',

    '$15 credit earned': '获得 $15 抵扣',
    'Applied automatically to your next service': '下次服务自动抵扣',
    'Total referrals': '累计推荐',
    'Keep sharing your code — every referral earns you both $15 off. 🚲':
      '继续分享您的邀请码 — 每成功推荐一位，双方各得 $15 优惠。🚲',
    'How to redeem': '如何使用',
    '1. Book any service at drbikesydney.com.au': '1. 在 drbikesydney.com.au 预订任意服务',
    '2. Enter code': '2. 输入优惠码',
    'at checkout': '结算时',
    '3. The value is deducted from your service total': '3. 金额会从服务总价中扣除',

    'sent you a Dr. Bike Sydney gift card 🚲': '给您送了一张 Dr. Bike Sydney 礼品卡 🚲',
    'Gift card value': '礼品卡金额',

    ", we couldn't process your membership payment of": '，我们无法处理您的会员付款',
    'Please update your payment method to keep your membership active. Your access will be paused if payment fails again.':
      '请更新支付方式以保持会员有效。如再次扣款失败，您的权益将被暂停。',
    'Update payment method →': '更新支付方式 →',
    '⚡ Action needed': '⚡ 需要处理',
    'Action required': '需要您操作',
    ', your bank requires additional verification for your membership renewal.':
      '，您的银行要求为会员续费进行额外验证。',
    '🔐 One more step': '🔐 还差一步',
    'Your bank uses 3D Secure authentication. Click below to complete verification and keep your membership active.':
      '您的银行使用 3D Secure 验证。请点击下方完成验证，以保持会员有效。',
    'Complete verification →': '完成验证 →',

    ", it's been 6+ months since your last service. Regular maintenance keeps your bike safe and riding smoothly!":
      '，距离您上次保养已超过 6 个月。定期保养能让您的自行车更安全、更顺畅！',
    '🔧 Why regular servicing matters': '🔧 为什么要定期保养',
    '&bull; Brake pads wear out and can become unsafe': '&bull; 刹车皮会磨损，继续使用不安全',
    '&bull; Cables stretch and affect shifting precision': '&bull; 线缆会拉伸，影响变速精度',
    '&bull; Chain wear accelerates drivetrain damage': '&bull; 链条磨损会加速传动系统损坏',
    '&bull; A Tune-Up takes ~1h and keeps you safe': '&bull; 一次基础保养约 1 小时，让您骑得安心',
    "Worn brake pads, stretched cables and dirty drivetrains reduce performance and can be dangerous. A quick tune-up extends your bike's life significantly.":
      '磨损的刹车皮、拉伸的线缆和脏污的传动系统会降低性能，也可能带来危险。一次快速保养能显著延长车子的寿命。',
    'Welcome back offer': '回归优惠',
    'Book now — use BACK15 &rarr;': '立即预订 — 使用 BACK15 &rarr;',
    'Book again →': '再次预订 →',
    'any service booked this week': '本周预订的任意服务',
    'your next service — valid 14 days': '您的下次服务 — 14 天内有效',

    ', you started booking a': '，您开始预订了',
    'Complete my booking &rarr;': '完成我的预订 &rarr;',

    ', wishing you an amazing birthday from the whole Dr. Bike team! 🚲':
      '，Dr. Bike 全体团队祝您生日快乐！🚲',
    'Your birthday gift': '您的生日礼物',
    '&bull; Valid for 7 days from your birthday': '&bull; 自生日起 7 天内有效',
    '&bull; Applies to any service $109+': '&bull; 适用于 $109 及以上的任意服务',
    '&bull; Enter code at checkout': '&bull; 结算时输入优惠码',
    '&bull; One use per customer': '&bull; 每位客户限用一次',
    'Redeem my birthday gift &rarr;': '领取我的生日礼物 &rarr;',

    'Goes directly to the mechanic': '全额直接给技师',
  },
};

// Subject lines are built with interpolations, so the keys here are the literal
// parts around them. Same longest-first replacement, applied to the rendered
// subject string.
const subjectDict = {
  es: {
    '✅ Booking confirmed —': '✅ Reserva confirmada —',
    '⏰ Reminder — your Dr. Bike service is in ~2 hours':
      '⏰ Recordatorio — tu servicio Dr. Bike es en ~2 horas',
    '📅 Your Dr. Bike service is coming up': '📅 Tu servicio Dr. Bike se acerca',
    '🚲 Time for a bike check-up,': '🚲 Es hora de revisar tu bici,',
    '⭐ How was your': '⭐ ¿Cómo estuvo tu',
    'with Dr. Bike?': 'con Dr. Bike?',
    'sent you a $': 'te envió una gift card de $',
    'Dr. Bike Sydney gift card': 'de Dr. Bike Sydney',
    '❌ Booking cancelled —': '❌ Reserva cancelada —',
    '🎉 Your referral worked — $15 credit earned!':
      '🎉 Tu referido funcionó — ¡ganaste $15 de crédito!',
    "🔔 You're on the waitlist — Dr. Bike Sydney":
      '🔔 Estás en la lista de espera — Dr. Bike Sydney',
    '💛 Tip received — $': '💛 Propina recibida — $',
    '⚠️ Payment failed — Dr. Bike Sydney membership':
      '⚠️ Pago rechazado — membresía Dr. Bike Sydney',
    '🚲 We miss you,': '🚲 Te extrañamos,',
    "— here's $15 to come back": '— aquí tienes $15 para volver',
    '🚲 You left something behind,': '🚲 Dejaste algo pendiente,',
    '🎂 Happy Birthday,': '🎂 ¡Feliz cumpleaños,',
    '! A gift from Dr. Bike Sydney': '! Un regalo de Dr. Bike Sydney',
    '🔐 Action required — verify your Dr. Bike payment':
      '🔐 Acción requerida — verifica tu pago de Dr. Bike',
  },
  zh: {
    '✅ Booking confirmed —': '✅ 预订已确认 —',
    '⏰ Reminder — your Dr. Bike service is in ~2 hours':
      '⏰ 提醒 — 您的 Dr. Bike 服务约在 2 小时后',
    '📅 Your Dr. Bike service is coming up': '📅 您的 Dr. Bike 服务即将到来',
    '🚲 Time for a bike check-up,': '🚲 该给自行车做保养了，',
    '⭐ How was your': '⭐ 您的',
    'with Dr. Bike?': '体验如何？',
    'sent you a $': '给您送了一张 $',
    'Dr. Bike Sydney gift card': ' 的 Dr. Bike Sydney 礼品卡',
    '❌ Booking cancelled —': '❌ 预订已取消 —',
    '🎉 Your referral worked — $15 credit earned!': '🎉 推荐成功 — 获得 $15 抵扣！',
    "🔔 You're on the waitlist — Dr. Bike Sydney": '🔔 您已加入候补名单 — Dr. Bike Sydney',
    '💛 Tip received — $': '💛 收到小费 — $',
    '⚠️ Payment failed — Dr. Bike Sydney membership': '⚠️ 扣款失败 — Dr. Bike Sydney 会员',
    '🚲 We miss you,': '🚲 我们想念您，',
    "— here's $15 to come back": '— 这是 $15 欢迎您回来',
    '🚲 You left something behind,': '🚲 您还有未完成的预订，',
    '🎂 Happy Birthday,': '🎂 生日快乐，',
    '! A gift from Dr. Bike Sydney': '！来自 Dr. Bike Sydney 的礼物',
    '🔐 Action required — verify your Dr. Bike payment': '🔐 需要您操作 — 请验证 Dr. Bike 付款',
  },
};

// Exported so tests can assert every key still matches the real templates: a key
// that drifts out of sync fails silently (the email just goes out in English),
// which is exactly how stale copy has slipped through in this project before.
export const dictionaries = { body: dict, subject: subjectDict };

const SUPPORTED = ['en', 'es', 'zh'];

export function normalizeLang(value) {
  const lang = String(value || '')
    .slice(0, 2)
    .toLowerCase();
  return SUPPORTED.includes(lang) ? lang : 'en';
}

function replaceAll(text, table) {
  // Longest key first: otherwise "Service" would eat the "Service" inside
  // "Service price" and leave a half-translated string behind.
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  let out = String(text ?? '');
  for (const key of keys) {
    if (!out.includes(key)) continue;
    // eslint-disable-next-line security/detect-object-injection -- key comes from Object.keys(table)
    out = out.split(key).join(table[key]);
  }
  return out;
}

// Translates a rendered email body (HTML) into `lang`. Unknown phrases are left
// in English, exactly like the client dictionary: a missing entry degrades to
// the source language instead of breaking the mail.
export function translateEmailHtml(html, lang) {
  const code = normalizeLang(lang);
  if (code === 'en') return html;
  // eslint-disable-next-line security/detect-object-injection -- code is one of SUPPORTED
  return replaceAll(html, dict[code] || {});
}

export function translateEmailSubject(subject, lang) {
  const code = normalizeLang(lang);
  if (code === 'en') return subject;
  // eslint-disable-next-line security/detect-object-injection -- code is one of SUPPORTED
  return replaceAll(subject, subjectDict[code] || {});
}
