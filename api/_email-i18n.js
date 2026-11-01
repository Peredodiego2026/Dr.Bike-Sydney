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
    'We come to you &mdash; home, work or park &middot; every day 8am&ndash;5pm':
      'Vamos a donde estés &mdash; casa, trabajo o parque &middot; todos los días de 8 a 17 h',
    'We come to you — home, work or park · every day 8am–5pm':
      'Vamos a donde estés — casa, trabajo o parque · todos los días de 8 a 17 h',
    'We come to you &mdash; home, work or park &middot; 0433 963 250':
      'Vamos a donde estés &mdash; casa, trabajo o parque &middot; 0433 963 250',
    'Questions? Reply to this email or WhatsApp us at +61 433 963 250':
      '¿Dudas? Responde este correo o escríbenos por WhatsApp al +61 433 963 250',
    'Questions? Call us on 0433 963 250.': '¿Dudas? Llámanos al 0433 963 250.',
    'Need to change something? Call or text 0433 963 250.':
      '¿Necesitas cambiar algo? Llama o escribe al 0433 963 250.',
    // El saludo de 14 plantillas. Con la etiqueta incluida: un 'Hi' suelto
    // se comeria cualquier palabra que lo contenga ("High", "This").
    '>Hi <strong': '>Hola <strong',
    'Date & time': 'Fecha y hora',
    'Net amount': 'Importe neto',
    'GST (10%)': 'GST (10%)',
    'Tax Invoice': 'Factura',
    // With their tags: a bare 'Service' also translated the service's own
    // name - "Standard Servicio" in every Spanish email until 01-nov-2026.
    '>Service<': '>Servicio<',
    '>Address<': '>Dirección<',

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

    // ── The big title in each header, and the half-sentences around values ──
    // Until 01-nov-2026 these went out in English inside Spanish and Chinese
    // emails: "Booking confirmed!" over a Spanish confirmation, and "Hola
    // Andrew, your Standard Service está listo".
    'Booking confirmed!': '¡Reserva confirmada!',
    'See you soon!': '¡Nos vemos pronto!',
    'Time for a service!': '¡Es hora de un servicio!',
    'How was your service?': '¿Qué tal el servicio?',
    'You received a gift card!': '¡Recibiste una gift card!',
    'Booking cancelled': 'Reserva cancelada',
    'Referral successful!': '¡Referido exitoso!',
    'On the waitlist!': '¡En la lista de espera!',
    'Payment failed': 'Pago rechazado',
    'Payment verification needed': 'Hay que verificar tu pago',
    'We miss you!': '¡Te extrañamos!',
    'Still thinking about it?': '¿Lo sigues pensando?',
    'Happy Birthday!': '¡Feliz cumpleaños!',
    ' The rest is paid on completion, by card or EFTPOS - and if the repair turns out not to be possible, they tell you on the spot and it is not charged.':
      ' El resto se paga al terminar, con tarjeta o EFTPOS - y si la reparación no es posible, te lo dice en el momento y no se cobra.',
    'Visit &amp; diagnosis &mdash; already paid: &minus;$':
      'Visita y diagnóstico &mdash; ya pagado: &minus;$',
    'To pay the mechanic on completion: $': 'A pagar al mecánico al terminar: $',
    ', your <strong>': ', tu <strong>',
    ', great news — ': ', buenas noticias — ',
    ' just used your referral code!': ' acaba de usar tu código de referido.',
    'View my dashboard →': 'Ver mi panel →',
    'What happens next?': '¿Qué sigue ahora?',
    '. This is attempt ': '. Intento número ',
    ", it's been a while since your last service with us":
      ', hace tiempo que no te vemos para un servicio',
    ' months ago)': ' meses)',
    ' months': ' meses',
    '. Your bike misses the open road!': '. ¡Tu bici extraña la calle!',
    '🔧 Your bike may need some love after': '🔧 Tu bici puede necesitar cariño después de',
    '$15 OFF': '$15 DE DESCUENTO',
    '$20 OFF': '$20 DE DESCUENTO',
    " but didn't complete it. Your bike is waiting!": ' pero no la terminaste. ¡Tu bici te espera!',

    // ── rescheduled ─────────────────────────────────────────────────────────
    // The buttons keep their tags: a bare "Call us" would also hit the longer
    // "Questions? Call us on..." line of every other template.
    'Rescheduled and confirmed': 'Reprogramada y confirmada',
    'New time received': 'Recibimos tu nuevo horario',
    ', your appointment has a new date and time. The previous slot is cancelled.':
      ', tu cita tiene nueva fecha y hora. El horario anterior quedó cancelado.',
    ", we've moved your appointment to the new date and time. We'll confirm it shortly. The previous slot is cancelled.":
      ', movimos tu cita a la nueva fecha y hora. Te la confirmamos en breve. El horario anterior quedó cancelado.',
    '>Add to calendar<': '>Agregar al calendario<',
    '>Call us<': '>Llámanos<',
    'Previous slot:': 'Horario anterior:',

    // ── cancellation_client ─────────────────────────────────────────────────
    ', your booking has been cancelled as requested.': ', tu reserva fue cancelada como pediste.',
    ", we're sorry: we had to cancel your booking because no mechanic is available at that time.":
      ', lo sentimos: tuvimos que cancelar tu reserva porque no hay un mecánico disponible a esa hora.',
    ", we're sorry: we had to cancel your booking because of the weather.":
      ', lo sentimos: tuvimos que cancelar tu reserva por el clima.',
    ', your booking has been cancelled.': ', tu reserva fue cancelada.',
    '>Visit fee<': '>Tarifa de visita<',
    "We've refunded your ": 'Te devolvimos los ',
    ' visit fee. It can take 5–10 business days to show on your card.':
      ' de la tarifa de visita. Puede tardar de 5 a 10 días hábiles en verse en tu tarjeta.',
    'It was cancelled less than 24 hours before the appointment, so the visit fee is not refundable under our terms.':
      'Se canceló con menos de 24 horas de anticipación, así que según nuestros términos la tarifa de visita no se reembolsa.',
    "We'll be in touch about the ": 'Te contactaremos por los ',
    ' visit fee you paid.': ' de la tarifa de visita que pagaste.',
    'Book a service →': 'Reservar un servicio →',
    'Book a service now →': 'Reservar un servicio ahora →',

    // ── waitlist_confirmation ───────────────────────────────────────────────
    ", you're on the waitlist for": ', estás en la lista de espera para',
    "If a slot opens up that day, we'll email you straight away. It goes to whoever books first, so book as soon as you get our email.":
      'Si se libera un horario ese día, te escribimos de inmediato. Se lo lleva quien reserve primero, así que reserva apenas te llegue nuestro correo.',
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
    // Its own tag so it can't match a "for" anywhere else.
    ' for <strong>': ' para el <strong>',
    'Complete my booking &rarr;': 'Completar mi reserva &rarr;',

    // ── birthday_promo ──────────────────────────────────────────────────────
    ', wishing you an amazing birthday from the whole Dr. Bike team! 🚲':
      ', ¡todo el equipo de Dr. Bike te desea un feliz cumpleaños! 🚲',
    'Your birthday gift': 'Tu regalo de cumpleaños',
    '&bull; Valid for 7 days from your birthday': '&bull; Válido por 7 días desde tu cumpleaños',
    '&bull; Applies to any service $119+': '&bull; Aplica a cualquier servicio de $119 o más',
    '&bull; Enter code at checkout': '&bull; Ingresa el código al pagar',
    '&bull; One use per customer': '&bull; Un uso por cliente',
    'Redeem my birthday gift &rarr;': 'Usar mi regalo de cumpleaños &rarr;',

    // ── tip_received ────────────────────────────────────────────────────────
    'Goes directly to the mechanic': 'Va directo al mecánico',

    // ── shop_order (api/_shop.js) ───────────────────────────────────────────
    // '>Shipping<' keeps its tags: a product name with the word in it must not
    // be translated along with the row label.
    'Order received!': '¡Pedido recibido!',
    'Thanks for your order,': 'Gracias por tu pedido,',
    '. We are ordering your parts now and will email you the tracking number as soon as they ship.':
      '. Ya estamos pidiendo tus repuestos y te mandaremos el número de seguimiento por correo apenas salgan.',
    'Test order &mdash; no money was taken.': 'Pedido de prueba &mdash; no se cobró dinero.',
    'Your order': 'Tu pedido',
    '>Shipping<': '>Envío<',
    'Total paid': 'Total pagado',

    // ── shop_shipped / shop_refunded (api/_shop-admin.js) ─────────────────────
    'Your order is on its way!': '¡Tu pedido va en camino!',
    'Your parts are on their way,': 'Tus repuestos van en camino,',
    '. Use the tracking number below to follow the parcel.':
      '. Usa el número de seguimiento de abajo para seguir el paquete.',
    '>Carrier<': '>Transportista<',
    'Tracking number': 'Número de seguimiento',
    'Track my parcel &rarr;': 'Seguir mi paquete &rarr;',
    'Your refund is on its way': 'Tu reembolso va en camino',
    'We refunded your order,': 'Te reembolsamos el pedido,',
    '. The money goes back to the card you paid with; banks usually take 5 to 10 business days to show it.':
      '. El dinero vuelve a la tarjeta con la que pagaste; los bancos suelen tardar de 5 a 10 días hábiles en mostrarlo.',
    '>Refunded<': '>Reembolsado<',
  },

  zh: {
    'Dr. Bike Sydney · drbikesydney.com.au · Sydney NSW':
      'Dr. Bike Sydney · drbikesydney.com.au · 悉尼 NSW',
    'ABN: 87 654 025 287 · contact@drbikesydney.com.au':
      'ABN: 87 654 025 287 · contact@drbikesydney.com.au',
    'We come to you &mdash; home, work or park &middot; every day 8am&ndash;5pm':
      '我们上门服务 &mdash; 家里、公司或公园 &middot; 每天 8:00&ndash;17:00',
    'We come to you — home, work or park · every day 8am–5pm':
      '我们上门服务 — 家里、公司或公园 · 每天 8:00–17:00',
    'We come to you &mdash; home, work or park &middot; 0433 963 250':
      '我们上门服务 &mdash; 家里、公司或公园 &middot; 0433 963 250',
    'Questions? Reply to this email or WhatsApp us at +61 433 963 250':
      '有疑问？回复此邮件，或通过 WhatsApp 联系 +61 433 963 250',
    'Questions? Call us on 0433 963 250.': '有疑问？请致电 0433 963 250。',
    'Need to change something? Call or text 0433 963 250.': '需要更改？请致电或短信 0433 963 250。',
    '>Hi <strong': '>您好 <strong',
    'Date & time': '日期和时间',
    'Net amount': '不含税金额',
    'GST (10%)': 'GST（10%）',
    'Tax Invoice': '税务发票',
    '>Service<': '>服务<',
    '>Address<': '>地址<',

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

    'Booking confirmed!': '预订已确认！',
    'See you soon!': '期待与您见面！',
    'Time for a service!': '该做保养啦！',
    'How was your service?': '服务体验如何？',
    'You received a gift card!': '您收到了一张礼品卡！',
    'Booking cancelled': '预订已取消',
    'Referral successful!': '推荐成功！',
    'On the waitlist!': '已加入候补名单！',
    'Payment failed': '扣款失败',
    'Payment verification needed': '需要验证付款',
    'We miss you!': '我们想念您！',
    'Still thinking about it?': '还在考虑吗？',
    'Happy Birthday!': '生日快乐！',
    ' The rest is paid on completion, by card or EFTPOS - and if the repair turns out not to be possible, they tell you on the spot and it is not charged.':
      '余款在服务完成后以银行卡或 EFTPOS 支付；如果无法维修，技师会当场告知，不收取费用。',
    'Visit &amp; diagnosis &mdash; already paid: &minus;$': '上门检测费 &mdash; 已支付：&minus;$',
    'To pay the mechanic on completion: $': '完成后支付给技师：$',
    ', your <strong>': '，您的 <strong>',
    ', great news — ': '，好消息 — ',
    ' just used your referral code!': ' 刚刚使用了您的邀请码！',
    'View my dashboard →': '查看我的账户 →',
    'What happens next?': '接下来会怎样？',
    '. This is attempt ': '。尝试次数：',
    ", it's been a while since your last service with us": '，您已经有一段时间没有来保养了',
    ' months ago)': ' 个月前)',
    ' months': ' 个月',
    '. Your bike misses the open road!': '。您的自行车想念骑行了！',
    '🔧 Your bike may need some love after': '🔧 您的自行车可能需要保养了，已过去',
    '$15 OFF': '立减 $15',
    '$20 OFF': '立减 $20',
    " but didn't complete it. Your bike is waiting!": '，但还没有完成。您的自行车在等您！',

    'Rescheduled and confirmed': '已改期并确认',
    'New time received': '已收到您的新时间',
    ', your appointment has a new date and time. The previous slot is cancelled.':
      '，您的预约已改到新的日期和时间。原来的时段已取消。',
    ", we've moved your appointment to the new date and time. We'll confirm it shortly. The previous slot is cancelled.":
      '，我们已把您的预约改到新的日期和时间，稍后会为您确认。原来的时段已取消。',
    '>Add to calendar<': '>添加到日历<',
    '>Call us<': '>致电我们<',
    'Previous slot:': '原时段：',

    ', your booking has been cancelled as requested.': '，您的预订已按要求取消。',
    ", we're sorry: we had to cancel your booking because no mechanic is available at that time.":
      '，非常抱歉：该时段没有可用的技师，我们不得不取消您的预订。',
    ", we're sorry: we had to cancel your booking because of the weather.":
      '，非常抱歉：由于天气原因，我们不得不取消您的预订。',
    ', your booking has been cancelled.': '，您的预订已取消。',
    '>Visit fee<': '>上门费<',
    "We've refunded your ": '我们已退还您支付的 ',
    ' visit fee. It can take 5–10 business days to show on your card.':
      ' 上门费。款项可能需要 5 到 10 个工作日才会显示在您的卡上。',
    'It was cancelled less than 24 hours before the appointment, so the visit fee is not refundable under our terms.':
      '此预订在预约前不到 24 小时取消，根据我们的条款，上门费不予退还。',
    "We'll be in touch about the ": '关于您已支付的 ',
    ' visit fee you paid.': ' 上门费，我们会与您联系。',
    'Book a service →': '预订服务 →',
    'Book a service now →': '立即预订服务 →',

    ", you're on the waitlist for": '，您已加入候补名单：',
    "If a slot opens up that day, we'll email you straight away. It goes to whoever books first, so book as soon as you get our email.":
      '当天一有空位，我们会立即发邮件通知您。名额先到先得，收到邮件后请尽快预订。',
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
    ' for <strong>': '，日期 <strong>',
    'Complete my booking &rarr;': '完成我的预订 &rarr;',

    ', wishing you an amazing birthday from the whole Dr. Bike team! 🚲':
      '，Dr. Bike 全体团队祝您生日快乐！🚲',
    'Your birthday gift': '您的生日礼物',
    '&bull; Valid for 7 days from your birthday': '&bull; 自生日起 7 天内有效',
    '&bull; Applies to any service $119+': '&bull; 适用于 $119 及以上的任意服务',
    '&bull; Enter code at checkout': '&bull; 结算时输入优惠码',
    '&bull; One use per customer': '&bull; 每位客户限用一次',
    'Redeem my birthday gift &rarr;': '领取我的生日礼物 &rarr;',

    'Goes directly to the mechanic': '全额直接给技师',

    'Order received!': '订单已收到！',
    'Thanks for your order,': '感谢您的订单，',
    '. We are ordering your parts now and will email you the tracking number as soon as they ship.':
      '。我们正在为您订购配件，发货后会立即通过邮件把物流单号发给您。',
    'Test order &mdash; no money was taken.': '测试订单 &mdash; 未扣款。',
    'Your order': '您的订单',
    '>Shipping<': '>运费<',
    'Total paid': '已付总额',

    'Your order is on its way!': '您的订单已发货！',
    'Your parts are on their way,': '您的配件正在路上，',
    '. Use the tracking number below to follow the parcel.': '。请使用下方的物流单号跟踪包裹。',
    '>Carrier<': '>承运商<',
    'Tracking number': '物流单号',
    'Track my parcel &rarr;': '跟踪我的包裹 &rarr;',
    'Your refund is on its way': '您的退款正在处理',
    'We refunded your order,': '我们已为您的订单退款，',
    '. The money goes back to the card you paid with; banks usually take 5 to 10 business days to show it.':
      '。款项将退回您付款时使用的银行卡；银行通常需要 5 到 10 个工作日才会显示。',
    '>Refunded<': '>已退款<',
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
    '📅 New time confirmed —': '📅 Nueva hora confirmada —',
    '📅 Booking rescheduled —': '📅 Reserva reprogramada —',
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
    '📦 Order received —': '📦 Pedido recibido —',
    '🚚 Your order is on its way —': '🚚 Tu pedido va en camino —',
    '↩️ Refund for order': '↩️ Reembolso del pedido',
  },
  zh: {
    '✅ Booking confirmed —': '✅ 预订已确认 —',
    '⏰ Reminder — your Dr. Bike service is in ~2 hours':
      '⏰ 提醒 — 您的 Dr. Bike 服务约在 2 小时后',
    '📅 Your Dr. Bike service is coming up': '📅 您的 Dr. Bike 服务即将到来',
    '📅 New time confirmed —': '📅 新时间已确认 —',
    '📅 Booking rescheduled —': '📅 预约已改期 —',
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
    '📦 Order received —': '📦 订单已收到 —',
    '🚚 Your order is on its way —': '🚚 您的订单已发货 —',
    '↩️ Refund for order': '↩️ 订单退款',
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
