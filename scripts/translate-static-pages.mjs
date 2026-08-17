// scripts/translate-static-pages.mjs — es/zh versions of business.html and bike-check.html
//
// Run: node scripts/translate-static-pages.mjs
//
// Why not a template, unlike scripts/generate-suburb-pages.mjs: these two pages
// were never 20 near-identical copies of one layout, they are two one-off pages
// with their own structure. docs/PENDIENTES.md 4.1 decided the mechanism: the
// English file stays the source of truth, and this script does a whole-fragment
// find/replace over the rendered HTML - same approach as api/_email-i18n.js for
// outgoing mail. Markup, inline JS, prices and URLs are never touched, only the
// prose between tags (and label/placeholder attributes) that appears as a
// dictionary key.
//
// Every key is checked against the English source before anything is written:
// a key that no longer matches (typo, or the English copy changed underneath
// it) fails the run instead of silently shipping that one phrase in English -
// exactly the failure mode 22.1's lesson is about, applied here to content
// instead of a time format.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const SITE = 'https://drbikesydney.com.au';
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const LANGS = {
  en: { hreflang: 'en-AU', htmlLang: 'en', prefix: '' },
  es: { hreflang: 'es', htmlLang: 'es', prefix: '/es' },
  zh: { hreflang: 'zh-Hans', htmlLang: 'zh-Hans', prefix: '/zh' },
};

const PAGES = [
  { slug: 'business', file: 'business.html' },
  { slug: 'bike-check', file: 'bike-check.html' },
];

// ── Dictionaries ────────────────────────────────────────────────────────────
// Longest-key-first replacement (see replaceAll below) so a short key can never
// eat part of a longer phrase that contains it - same rule api/_email-i18n.js
// uses, for the same reason.

const DICT = {
  business: {
    es: {
      'Fleet Bike Servicing for Sydney Businesses | Dr. Bike Sydney':
        'Mantenimiento de Flotas de Bicicletas para Empresas en Sídney | Dr. Bike Sydney',
      'Mobile bicycle fleet maintenance for Sydney businesses. Courier fleets, corporate wellness programs, hospitality & rental fleets. On-site service, no downtime. Get a quote today.':
        'Mantenimiento a domicilio de flotas de bicicletas para empresas de Sídney. Flotas de delivery, programas de bienestar corporativo, hotelería y alquiler. Servicio en el lugar, sin tiempos muertos. Pedí una cotización hoy.',
      'Mobile bicycle fleet maintenance for Sydney businesses. Courier fleets, corporate wellness, rental fleets. On-site, no downtime.':
        'Mantenimiento a domicilio de flotas de bicicletas para empresas de Sídney. Flotas de delivery, bienestar corporativo, alquiler. En el lugar, sin tiempos muertos.',
      'Mobile bicycle fleet maintenance for Sydney businesses.':
        'Mantenimiento a domicilio de flotas de bicicletas para empresas de Sídney.',
      '🏢 B2B Fleet Services': '🏢 Servicios de Flota B2B',
      'Mobile Bike Servicing<br>for Sydney Businesses':
        'Mantenimiento de Bicicletas a Domicilio<br>para Empresas de Sídney',
      'We come to your premises and service your entire fleet on-site. No downtime, no transport — your bikes are ready faster.':
        'Vamos a tus instalaciones y mantenemos toda tu flota en el lugar. Sin tiempos muertos, sin traslados: tus bicis están listas más rápido.',
      'Get a Fleet Quote': 'Pedí una Cotización de Flota',
      'Call 0433 963 250': 'Llamar al 0433 963 250',
      'Average on-site time': 'Tiempo promedio en el lugar',
      'Transport cost': 'Costo de traslado',
      'Years experience': 'Años de experiencia',
      'Satisfaction guarantee': 'Garantía de satisfacción',
      'Why Choose Dr. Bike for Your Fleet?': '¿Por qué elegir Dr. Bike para tu flota?',
      'Managing a bike fleet is time-consuming and costly. We eliminate the logistics — one call and we come to you.':
        'Gestionar una flota de bicicletas consume tiempo y plata. Nosotros nos encargamos de la logística: un llamado y vamos hasta vos.',
      'On-Site Service': 'Servicio en el Lugar',
      'Our fully-equipped van arrives at your premises. No need to transport bikes anywhere.':
        'Nuestra camioneta totalmente equipada llega hasta tus instalaciones. No hace falta trasladar las bicis a ningún lado.',
      'Zero Downtime': 'Cero Tiempos Muertos',
      'We service multiple bikes simultaneously. Fleet of 10 bikes done in under 3 hours.':
        'Mantenemos varias bicis al mismo tiempo. Una flota de 10 bicis, lista en menos de 3 horas.',
      'Digital Service Report': 'Informe Digital del Servicio',
      'Every bike gets a digital health report emailed to your manager after each visit.':
        'Cada bici recibe un informe digital de estado, que le enviamos por mail a tu encargado después de cada visita.',
      'All Repairs Included': 'Todas las Reparaciones Incluidas',
      'Tune-ups, brake bleeds, tyre changes, gear adjustments — all done on the spot.':
        'Ajustes, purgado de frenos, cambio de cubiertas, regulación de cambios: todo se hace en el momento.',
      'Scheduled Visits': 'Visitas Programadas',
      'Set a recurring maintenance schedule — monthly, quarterly or as-needed.':
        'Armá un cronograma de mantenimiento recurrente: mensual, trimestral o cuando lo necesites.',
      'Invoiced Billing': 'Facturación Simple',
      'Single invoice per visit. ABN billing, GST receipts provided for your accounts.':
        'Una sola factura por visita. Facturación con ABN y comprobantes de GST para tu contabilidad.',
      'Who We Serve': 'A Quién Atendemos',
      'Any Sydney business with bikes benefits from a regular fleet service.':
        'Cualquier empresa de Sídney con bicicletas se beneficia de un servicio de flota regular.',
      'Courier Fleets': 'Flotas de Delivery',
      'DoorDash, Uber Eats, delivery companies': 'DoorDash, Uber Eats, empresas de delivery',
      'Hotels & Resorts': 'Hoteles y Resorts',
      'Guest amenity bikes, concierge fleets': 'Bicis de cortesía para huéspedes, flotas de conserjería',
      'Rental Operators': 'Operadores de Alquiler',
      'Bike share, tour operators, hire shops': 'Bicis compartidas, operadores turísticos, tiendas de alquiler',
      'Corporate Wellness': 'Bienestar Corporativo',
      'Employee bike-to-work programs': 'Programas de bici al trabajo para empleados',
      'Schools & Unis': 'Colegios y Universidades',
      'Campus fleets, cycling programs': 'Flotas de campus, programas de ciclismo',
      'Property Managers': 'Administradores de Propiedades',
      'Apartment complex shared bikes': 'Bicis compartidas de complejos de departamentos',
      'Fleet Pricing': 'Precios para Flotas',
      'Volume pricing — the more bikes, the lower the per-bike cost. All prices include GST.':
        'Precios por volumen: cuantas más bicis, más bajo el costo por bici. Todos los precios incluyen GST.',
      'Fleet Size': 'Tamaño de Flota',
      'Service Type': 'Tipo de Servicio',
      'Per Bike': 'Por Bici',
      'Est. Total': 'Total Estimado',
      '1–4 bikes': '1–4 bicis',
      '5–9 bikes': '5–9 bicis',
      '10–19 bikes': '10–19 bicis',
      '20+ bikes': '20+ bicis',
      'Basic Tune-Up': 'Ajuste Básico',
      'Custom quote': 'Cotización personalizada',
      'Contact us': 'Contactanos',
      '📌 Standard, Major and Ultimate services available at equivalent volume discounts. Emergency callout available.':
        '📌 Los servicios Estándar, Mayor y Definitivo también tienen descuentos por volumen equivalentes. Servicio de urgencia disponible.',
      'Tell us about your fleet and we\'ll get back to you within 2 business hours.':
        'Contanos sobre tu flota y te respondemos dentro de 2 horas hábiles.',
      'Business Name *': 'Nombre de la Empresa *',
      'e.g. Acme Deliveries Pty Ltd': 'ej. Acme Deliveries Pty Ltd',
      'Contact Name *': 'Nombre de Contacto *',
      'Your name': 'Tu nombre',
      'Email *': 'Email *',
      Phone: 'Teléfono',
      'Number of Bikes *': 'Cantidad de Bicis *',
      'Select fleet size': 'Elegí el tamaño de la flota',
      'Service Frequency': 'Frecuencia del Servicio',
      'Select frequency': 'Elegí la frecuencia',
      Monthly: 'Mensual',
      Quarterly: 'Trimestral',
      'One-off': 'Una sola vez',
      'As needed': 'Cuando haga falta',
      'Tell us more (optional)': 'Contanos más (opcional)',
      'Type of bikes, location, any specific issues...':
        'Tipo de bicis, ubicación, algún problema en particular...',
      'Send Enquiry →': 'Enviar Consulta →',
      '✅ Enquiry sent! We\'ll be in touch within 2 business hours.':
        '✅ ¡Consulta enviada! Te contactamos dentro de 2 horas hábiles.',
      Home: 'Inicio',
      'For Business': 'Para Empresas',
      'Bike Safety Check': 'Chequeo de Seguridad',
      'Cycling Map': 'Mapa de Ciclismo',
      'Privacy Policy': 'Política de Privacidad',
      Terms: 'Términos',
      'Please fill in all required fields.': 'Completá todos los campos obligatorios.',
      'Sending...': 'Enviando...',
      'Something went wrong. Please email us at contact@drbikesydney.com.au':
        'Algo salió mal. Escribinos a contact@drbikesydney.com.au',
    },
    zh: {
      'Fleet Bike Servicing for Sydney Businesses | Dr. Bike Sydney':
        '悉尼企业自行车车队维保服务 | Dr. Bike Sydney',
      'Mobile bicycle fleet maintenance for Sydney businesses. Courier fleets, corporate wellness programs, hospitality & rental fleets. On-site service, no downtime. Get a quote today.':
        '为悉尼企业提供上门自行车车队维保服务。适用于配送车队、企业健康计划、酒店及租赁车队。现场服务，零停工。立即获取报价。',
      'Mobile bicycle fleet maintenance for Sydney businesses. Courier fleets, corporate wellness, rental fleets. On-site, no downtime.':
        '为悉尼企业提供上门自行车车队维保服务。适用于配送车队、企业健康计划、租赁车队。现场服务，零停工。',
      'Mobile bicycle fleet maintenance for Sydney businesses.': '为悉尼企业提供上门自行车车队维保服务。',
      '🏢 B2B Fleet Services': '🏢 企业车队服务',
      'Mobile Bike Servicing<br>for Sydney Businesses': '为悉尼企业提供<br>上门自行车维保服务',
      'We come to your premises and service your entire fleet on-site. No downtime, no transport — your bikes are ready faster.':
        '我们上门到您的场所，现场维保整个车队。无需停工、无需运输——您的自行车更快就绪。',
      'Get a Fleet Quote': '获取车队报价',
      'Call 0433 963 250': '致电 0433 963 250',
      'Average on-site time': '平均现场服务时长',
      'Transport cost': '运输费用',
      'Years experience': '年经验',
      'Satisfaction guarantee': '满意保证',
      'Why Choose Dr. Bike for Your Fleet?': '为什么为您的车队选择 Dr. Bike？',
      'Managing a bike fleet is time-consuming and costly. We eliminate the logistics — one call and we come to you.':
        '管理自行车车队既耗时又费钱。我们帮您搞定所有物流——一通电话，我们就上门服务。',
      'On-Site Service': '现场服务',
      'Our fully-equipped van arrives at your premises. No need to transport bikes anywhere.':
        '我们装备齐全的服务车会开到您的场所。无需将自行车运往任何地方。',
      'Zero Downtime': '零停工',
      'We service multiple bikes simultaneously. Fleet of 10 bikes done in under 3 hours.':
        '我们可同时维保多辆自行车。10 辆车的车队不到 3 小时即可完成。',
      'Digital Service Report': '数字化服务报告',
      'Every bike gets a digital health report emailed to your manager after each visit.':
        '每辆自行车都会生成数字化状态报告，在每次上门服务后通过邮件发送给您的负责人。',
      'All Repairs Included': '包含所有维修',
      'Tune-ups, brake bleeds, tyre changes, gear adjustments — all done on the spot.':
        '调校、刹车排气、换胎、变速调整——全部现场完成。',
      'Scheduled Visits': '定期上门',
      'Set a recurring maintenance schedule — monthly, quarterly or as-needed.':
        '设置定期维保计划——每月、每季度，或按需安排。',
      'Invoiced Billing': '统一开票',
      'Single invoice per visit. ABN billing, GST receipts provided for your accounts.':
        '每次上门开具一张发票。提供 ABN 抬头和 GST 收据，方便您做账。',
      'Who We Serve': '我们的服务对象',
      'Any Sydney business with bikes benefits from a regular fleet service.':
        '任何拥有自行车的悉尼企业，都能从定期车队服务中受益。',
      'Courier Fleets': '配送车队',
      'DoorDash, Uber Eats, delivery companies': 'DoorDash、Uber Eats、配送公司',
      'Hotels & Resorts': '酒店及度假村',
      'Guest amenity bikes, concierge fleets': '宾客礼宾自行车、礼宾车队',
      'Rental Operators': '租赁运营商',
      'Bike share, tour operators, hire shops': '共享单车、旅游运营商、租赁店',
      'Corporate Wellness': '企业健康计划',
      'Employee bike-to-work programs': '员工骑行上班计划',
      'Schools & Unis': '学校及大学',
      'Campus fleets, cycling programs': '校园车队、骑行项目',
      'Property Managers': '物业管理方',
      'Apartment complex shared bikes': '公寓楼共享自行车',
      'Fleet Pricing': '车队价格',
      'Volume pricing — the more bikes, the lower the per-bike cost. All prices include GST.':
        '按数量计价——车辆越多，单车成本越低。所有价格均含 GST。',
      'Fleet Size': '车队规模',
      'Service Type': '服务类型',
      'Per Bike': '单车价格',
      'Est. Total': '预估总价',
      '1–4 bikes': '1–4 辆',
      '5–9 bikes': '5–9 辆',
      '10–19 bikes': '10–19 辆',
      '20+ bikes': '20+ 辆',
      'Basic Tune-Up': '基础保养',
      'Custom quote': '定制报价',
      'Contact us': '联系我们',
      '📌 Standard, Major and Ultimate services available at equivalent volume discounts. Emergency callout available.':
        '📌 标准、中级和全面保养服务同样享有相应的批量折扣。可提供紧急上门服务。',
      'Tell us about your fleet and we\'ll get back to you within 2 business hours.':
        '告诉我们您的车队情况，我们会在 2 个工作小时内回复您。',
      'Business Name *': '企业名称 *',
      'e.g. Acme Deliveries Pty Ltd': '例如 Acme Deliveries Pty Ltd',
      'Contact Name *': '联系人姓名 *',
      'Your name': '您的姓名',
      'Email *': '邮箱 *',
      Phone: '电话',
      'Number of Bikes *': '自行车数量 *',
      'Select fleet size': '请选择车队规模',
      'Service Frequency': '服务频率',
      'Select frequency': '请选择频率',
      Monthly: '每月',
      Quarterly: '每季度',
      'One-off': '单次',
      'As needed': '按需',
      'Tell us more (optional)': '补充说明（可选）',
      'Type of bikes, location, any specific issues...': '自行车类型、地点、具体问题……',
      'Send Enquiry →': '发送咨询 →',
      '✅ Enquiry sent! We\'ll be in touch within 2 business hours.':
        '✅ 咨询已发送！我们会在 2 个工作小时内与您联系。',
      Home: '首页',
      'For Business': '企业服务',
      'Bike Safety Check': '自行车安全检测',
      'Cycling Map': '骑行地图',
      'Privacy Policy': '隐私政策',
      Terms: '条款',
      'Please fill in all required fields.': '请填写所有必填字段。',
      'Sending...': '发送中……',
      'Something went wrong. Please email us at contact@drbikesydney.com.au':
        '出了点问题。请发邮件至 contact@drbikesydney.com.au',
    },
  },

  'bike-check': {
    es: {
      'Is My Bike Safe to Ride? Free Bike Safety Check | Dr. Bike Sydney':
        '¿Mi Bici es Segura para Andar? Chequeo de Seguridad Gratis | Dr. Bike Sydney',
      'Take our free 5-question bike safety check. Find out if your bike is safe to ride in Sydney. Instant diagnosis — Green, Yellow or Red. Book a mobile mechanic if needed.':
        'Hacé nuestro chequeo de seguridad gratis de 5 preguntas. Enterate si tu bici es segura para andar en Sídney. Diagnóstico instantáneo: Verde, Amarillo o Rojo. Reservá un mecánico a domicilio si hace falta.',
      'Take our free 5-question bike safety check. Find out if your bike is safe to ride in Sydney. Instant diagnosis — Green, Yellow or Red.':
        'Hacé nuestro chequeo de seguridad gratis de 5 preguntas. Enterate si tu bici es segura para andar en Sídney. Diagnóstico instantáneo: Verde, Amarillo o Rojo.',
      'Is My Bike Safe to Ride? 5-Step Safety Check':
        '¿Mi Bici es Segura para Andar? Chequeo de Seguridad en 5 Pasos',
      'A quick 5-step checklist to assess whether your bicycle is safe to ride. Check brakes, tyres, chain, gears and lights before every ride in Sydney.':
        'Una checklist rápida de 5 pasos para saber si tu bicicleta es segura para andar. Revisá frenos, cubiertas, cadena, cambios y luces antes de cada salida en Sídney.',
      Brakes: 'Frenos',
      Tyres: 'Cubiertas',
      Chain: 'Cadena',
      Gears: 'Cambios',
      Lights: 'Luces',
      'Squeeze both brake levers. Bike should stop within 1 bike length. Levers should not touch the handlebar.':
        'Apretá ambas palancas de freno. La bici debería frenar en menos de un largo de bici. Las palancas no deberían tocar el manubrio.',
      'Check tyre pressure and inspect for cuts, bulges or embedded glass. Tyres should feel firm, not soft.':
        'Revisá la presión de las cubiertas e inspeccioná si hay cortes, bultos o vidrio incrustado. Las cubiertas deberían sentirse firmes, no blandas.',
      'Check chain for rust, stiff links or excessive wear. A clean, lubricated chain runs smoothly and quietly.':
        'Revisá la cadena por óxido, eslabones duros o desgaste excesivo. Una cadena limpia y lubricada anda suave y silenciosa.',
      'Shift through all gears while pedalling. Each gear should engage cleanly without skipping or chain drop.':
        'Probá todos los cambios mientras pedaleás. Cada cambio debería entrar limpio, sin saltos ni que se caiga la cadena.',
      'Front white light and rear red light are legally required at night in NSW. Check batteries and mounting.':
        'En NSW es obligatorio por ley andar de noche con luz blanca adelante y luz roja atrás. Revisá las pilas y que estén bien sujetas.',
      'Book Now': 'Reservar',
      '🚲 Is My Bike Safe to Ride?': '🚲 ¿Mi Bici es Segura para Andar?',
      'Answer 5 quick questions to get an instant safety diagnosis. Takes less than 2 minutes.':
        'Respondé 5 preguntas rápidas y obtené un diagnóstico de seguridad al instante. Lleva menos de 2 minutos.',
      'Question 1 of 5': 'Pregunta 1 de 5',
      'Question 2 of 5': 'Pregunta 2 de 5',
      'Question 3 of 5': 'Pregunta 3 de 5',
      'Question 4 of 5': 'Pregunta 4 de 5',
      'Question 5 of 5': 'Pregunta 5 de 5',
      'How are your brakes?': '¿Cómo están tus frenos?',
      'Squeeze both brake levers firmly. Does the bike stop quickly and cleanly? Do the levers feel firm, not spongy?':
        'Apretá firmemente ambas palancas de freno. ¿La bici frena rápido y limpio? ¿Las palancas se sienten firmes, no esponjosas?',
      'Brakes are sharp and responsive': 'Los frenos están afilados y responden bien',
      'A bit spongy or slow to stop': 'Un poco esponjosos o tardan en frenar',
      'Barely working or lever touches handlebar': 'Casi no frenan o la palanca toca el manubrio',
      'What about your tyres?': '¿Y tus cubiertas?',
      'Squeeze each tyre — does it feel firm? Look for cuts, bulges, embedded glass, or worn-down tread.':
        'Apretá cada cubierta: ¿se siente firme? Fijate si hay cortes, bultos, vidrio incrustado o dibujo gastado.',
      'Firm, no visible damage': 'Firmes, sin daños visibles',
      'Slightly soft or minor wear': 'Un poco blandas o desgaste leve',
      'Flat, cuts, bulge or very worn': 'Pinchada, con cortes, bultos o muy gastada',
      'How\'s your chain?': '¿Cómo está tu cadena?',
      'Lift the rear wheel and spin the pedals slowly. Does the chain run smoothly? Is it clean, or rusty and dry?':
        'Levantá la rueda trasera y girá los pedales despacio. ¿La cadena anda suave? ¿Está limpia, o oxidada y seca?',
      'Smooth, lubricated, no rust': 'Suave, lubricada, sin óxido',
      'A little dry or starting to rust': 'Un poco seca o empezando a oxidarse',
      'Very rusty, stiff links or skipping': 'Muy oxidada, eslabones duros o salta',
      'Do your gears shift cleanly?': '¿Tus cambios entran limpio?',
      'Ride or spin the pedals and shift through all gears. Do they engage without skipping, hesitation or chain drop?':
        'Andá o girá los pedales y probá todos los cambios. ¿Entran sin saltos, dudas ni que se caiga la cadena?',
      'All gears shift clean and fast': 'Todos los cambios entran limpios y rápidos',
      'Occasional slip or slow to engage': 'A veces patinan o tardan en entrar',
      'Skipping, dropping chain or stuck': 'Saltan, se cae la cadena o se traban',
      'Lights and visibility?': '¿Luces y visibilidad?',
      'NSW law requires a white front light and red rear light when riding at night. Are yours working and mounted securely?':
        'La ley de NSW exige luz blanca adelante y luz roja atrás para andar de noche. ¿Las tuyas funcionan y están bien sujetas?',
      'Both lights working fine': 'Las dos luces andan bien',
      'One light missing or low battery': 'Falta una luz o tiene poca batería',
      'No lights at all': 'No tiene luces',
      'Issues detected': 'Problemas detectados',
      '↩ Start over': '↩ Empezar de nuevo',
      '5 Safety Checks Every Sydney Rider Should Know':
        '5 Chequeos de Seguridad que Todo Ciclista de Sídney Debería Conocer',
      'Before every ride, run through this quick routine — the <strong>ABC Quick Check</strong>. It takes under 2 minutes and can prevent accidents.':
        'Antes de cada salida, hacé esta rutina rápida: el <strong>Chequeo Rápido ABC</strong>. Lleva menos de 2 minutos y puede evitar accidentes.',
      'Brakes — most critical': 'Frenos — lo más crítico',
      'Worn brake pads can double your stopping distance. Replace when pad material is below 1mm or if you hear metal-on-metal grinding.':
        'Las pastillas de freno gastadas pueden duplicar tu distancia de frenado. Cambialas cuando queden menos de 1mm o si escuchás un roce metálico.',
      'Tyres — check weekly': 'Cubiertas — revisá cada semana',
      'Road bike: 90–120 PSI. Hybrid: 50–70 PSI. MTB: 25–35 PSI. A soft tyre increases puncture risk and rolling resistance.':
        'Bici de ruta: 90–120 PSI. Híbrida: 50–70 PSI. Montaña: 25–35 PSI. Una cubierta blanda aumenta el riesgo de pinchadura y la resistencia al rodar.',
      'Chain — lube monthly': 'Cadena — lubricá todos los meses',
      'A dry chain wears out your cassette 3–5x faster. Wipe with a rag and apply a quality wet or dry lube every 200–300 km.':
        'Una cadena seca desgasta el cassette 3 a 5 veces más rápido. Pasale un trapo y aplicá un buen lubricante húmedo o seco cada 200–300 km.',
      'Gears — tune annually': 'Cambios — ajustalos una vez al año',
      'Cables stretch over time. A proper gear tune takes 15 minutes but prevents chain drops, especially on hills like Anzac Bridge or Military Road.':
        'Los cables se estiran con el tiempo. Un buen ajuste de cambios lleva 15 minutos pero evita que se caiga la cadena, sobre todo en subidas como Anzac Bridge o Military Road.',
      'Lights — NSW law': 'Luces — exigencia de NSW',
      'You must have a white front light and red rear light when riding between sunset and sunrise. Fines up to $106 for non-compliance.':
        'Es obligatorio andar con luz blanca adelante y luz roja atrás entre la puesta y la salida del sol. Las multas por incumplimiento llegan a $106.',
      'Not Safe to Ride': 'No es Segura para Andar',
      'Your bike has one or more critical safety issues. Riding in this condition puts you at risk of injury and could result in a fine. We recommend a professional service before your next ride.':
        'Tu bici tiene uno o más problemas críticos de seguridad. Andar así te expone a lesionarte y podría resultar en una multa. Te recomendamos un servicio profesional antes de tu próxima salida.',
      'Book a Safety Service →': 'Reservar un Servicio de Seguridad →',
      'Needs Attention Soon': 'Necesita Atención Pronto',
      'Your bike is rideable but has a few issues that should be fixed soon. Left unattended, these can develop into costly repairs or cause you to get stranded mid-ride.':
        'Tu bici se puede andar, pero tiene algunos problemas que conviene arreglar pronto. Si los dejás pasar, pueden convertirse en reparaciones costosas o dejarte varado a mitad de camino.',
      'Book a Tune-Up ($109) →': 'Reservar un Ajuste ($109) →',
      'Mostly Good — Minor Fix Needed': 'Casi Perfecta — Necesita un Ajuste Menor',
      'Your bike is generally safe but has one minor issue. A quick service call can resolve it before it becomes a bigger problem.':
        'Tu bici en general es segura, pero tiene un problema menor. Un servicio rápido puede resolverlo antes de que se convierta en algo más grande.',
      'Your Bike is Safe to Ride!': '¡Tu Bici es Segura para Andar!',
      'Great news — your bike passed all 5 safety checks. Keep it that way with a professional service every 6 months or every 500 km.':
        'Buenas noticias: tu bici pasó los 5 chequeos de seguridad. Mantenela así con un servicio profesional cada 6 meses o cada 500 km.',
      'Schedule Next Service →': 'Programar tu Próximo Servicio →',
      'Call Us': 'Llamanos',
      'Call 0433 963 250': 'Llamar al 0433 963 250',
      'Brakes failing': 'Frenos fallando',
      'Brakes marginal': 'Frenos al límite',
      'Flat/damaged tyre': 'Cubierta pinchada o dañada',
      'Tyre pressure low': 'Presión de cubierta baja',
      'Chain needs replacing': 'Cadena para cambiar',
      'Chain needs lube': 'Cadena necesita lubricación',
      'Gears need tuning': 'Cambios necesitan ajuste',
      'Gears slipping': 'Cambios patinando',
      'No lights (illegal)': 'Sin luces (ilegal)',
      'Lights need attention': 'Luces necesitan atención',
      Home: 'Inicio',
      'Sydney Cycling Map': 'Mapa de Ciclismo de Sídney',
      'For Business': 'Para Empresas',
      'Privacy Policy': 'Política de Privacidad',
      Terms: 'Términos',
      '📧 Get monthly maintenance tips': '📧 Recibí tips de mantenimiento todos los meses',
      'Subscribe for seasonal bike care guides + WELCOME10 discount code.':
        'Suscribite y recibí guías de cuidado según la temporada + el código de descuento WELCOME10.',
      'Email address': 'Correo electrónico',
      Join: 'Unirme',
      '✅ You\'re subscribed!': '✅ ¡Ya estás suscripto!',
      'Bike Safety Check': 'Chequeo de Seguridad',
    },
    zh: {
      'Is My Bike Safe to Ride? Free Bike Safety Check | Dr. Bike Sydney':
        '我的自行车安全吗？免费自行车安全检测 | Dr. Bike Sydney',
      'Take our free 5-question bike safety check. Find out if your bike is safe to ride in Sydney. Instant diagnosis — Green, Yellow or Red. Book a mobile mechanic if needed.':
        '参加我们免费的 5 道题自行车安全检测。了解您的自行车在悉尼骑行是否安全。即时诊断结果——绿色、黄色或红色。如有需要，可预订上门技师。',
      'Take our free 5-question bike safety check. Find out if your bike is safe to ride in Sydney. Instant diagnosis — Green, Yellow or Red.':
        '参加我们免费的 5 道题自行车安全检测。了解您的自行车在悉尼骑行是否安全。即时诊断结果——绿色、黄色或红色。',
      'Is My Bike Safe to Ride? 5-Step Safety Check': '我的自行车安全吗？5 步安全检测',
      'A quick 5-step checklist to assess whether your bicycle is safe to ride. Check brakes, tyres, chain, gears and lights before every ride in Sydney.':
        '快速的 5 步检查清单，帮您判断自行车是否安全可骑。每次在悉尼出行前，检查刹车、轮胎、链条、变速器和车灯。',
      Brakes: '刹车',
      Tyres: '轮胎',
      Chain: '链条',
      Gears: '变速器',
      Lights: '车灯',
      'Squeeze both brake levers. Bike should stop within 1 bike length. Levers should not touch the handlebar.':
        '同时捏紧两个刹车把。自行车应能在一个车身长度内停下。刹车把不应碰到车把。',
      'Check tyre pressure and inspect for cuts, bulges or embedded glass. Tyres should feel firm, not soft.':
        '检查胎压，查看是否有割伤、鼓包或嵌入的玻璃碎片。轮胎应感觉紧实，而不是软塌塌的。',
      'Check chain for rust, stiff links or excessive wear. A clean, lubricated chain runs smoothly and quietly.':
        '检查链条是否生锈、有卡链或磨损过度。干净且上油良好的链条运转顺畅、安静。',
      'Shift through all gears while pedalling. Each gear should engage cleanly without skipping or chain drop.':
        '边蹬踏边切换所有档位。每个档位都应顺畅衔接，不打滑、不脱链。',
      'Front white light and rear red light are legally required at night in NSW. Check batteries and mounting.':
        '在新南威尔士州，夜间骑行法律要求前方装白灯、后方装红灯。请检查电池和安装是否牢固。',
      'Book Now': '立即预订',
      '🚲 Is My Bike Safe to Ride?': '🚲 我的自行车安全吗？',
      'Answer 5 quick questions to get an instant safety diagnosis. Takes less than 2 minutes.':
        '回答 5 个简短问题，即刻获得安全诊断。用时不到 2 分钟。',
      'Question 1 of 5': '第 1 题，共 5 题',
      'Question 2 of 5': '第 2 题，共 5 题',
      'Question 3 of 5': '第 3 题，共 5 题',
      'Question 4 of 5': '第 4 题，共 5 题',
      'Question 5 of 5': '第 5 题，共 5 题',
      'How are your brakes?': '您的刹车状况如何？',
      'Squeeze both brake levers firmly. Does the bike stop quickly and cleanly? Do the levers feel firm, not spongy?':
        '用力捏紧两个刹车把。自行车能否快速、干净利落地停下？刹车把感觉是否紧实，而不是软绵绵的？',
      'Brakes are sharp and responsive': '刹车灵敏有力',
      'A bit spongy or slow to stop': '有点发软或刹车较慢',
      'Barely working or lever touches handlebar': '几乎失灵，或刹车把碰到车把',
      'What about your tyres?': '轮胎情况怎么样？',
      'Squeeze each tyre — does it feel firm? Look for cuts, bulges, embedded glass, or worn-down tread.':
        '捏一捏每个轮胎——感觉紧实吗？留意是否有割伤、鼓包、嵌入的玻璃碎片，或胎纹磨损严重。',
      'Firm, no visible damage': '紧实，无明显损坏',
      'Slightly soft or minor wear': '略软或轻微磨损',
      'Flat, cuts, bulge or very worn': '漏气、割伤、鼓包或严重磨损',
      'How\'s your chain?': '链条状况如何？',
      'Lift the rear wheel and spin the pedals slowly. Does the chain run smoothly? Is it clean, or rusty and dry?':
        '抬起后轮，缓慢转动脚踏。链条运转是否顺畅？是干净的，还是生锈发干？',
      'Smooth, lubricated, no rust': '顺畅、有润滑、无锈迹',
      'A little dry or starting to rust': '有点发干或开始生锈',
      'Very rusty, stiff links or skipping': '严重生锈、卡链或打滑',
      'Do your gears shift cleanly?': '变速是否顺畅？',
      'Ride or spin the pedals and shift through all gears. Do they engage without skipping, hesitation or chain drop?':
        '骑行或转动脚踏，切换所有档位。是否顺畅衔接，没有打滑、迟滞或脱链？',
      'All gears shift clean and fast': '所有档位切换干脆利落',
      'Occasional slip or slow to engage': '偶尔打滑或反应较慢',
      'Skipping, dropping chain or stuck': '打滑、脱链或卡住',
      'Lights and visibility?': '车灯和能见度？',
      'NSW law requires a white front light and red rear light when riding at night. Are yours working and mounted securely?':
        '新南威尔士州法律规定夜间骑行需装前白灯和后红灯。您的车灯是否正常工作、安装牢固？',
      'Both lights working fine': '两个车灯都正常',
      'One light missing or low battery': '缺一个车灯，或电量不足',
      'No lights at all': '完全没有车灯',
      'Issues detected': '检测到的问题',
      '↩ Start over': '↩ 重新开始',
      '5 Safety Checks Every Sydney Rider Should Know': '每位悉尼骑行者都应知道的 5 项安全检查',
      'Before every ride, run through this quick routine — the <strong>ABC Quick Check</strong>. It takes under 2 minutes and can prevent accidents.':
        '每次骑行前，做一遍这个快速流程——<strong>ABC 快速检查</strong>。不到 2 分钟即可完成，能有效预防事故。',
      'Brakes — most critical': '刹车 — 最关键',
      'Worn brake pads can double your stopping distance. Replace when pad material is below 1mm or if you hear metal-on-metal grinding.':
        '磨损的刹车皮会让制动距离延长一倍。当刹车皮厚度低于 1 毫米，或听到金属摩擦声时，请及时更换。',
      'Tyres — check weekly': '轮胎 — 每周检查',
      'Road bike: 90–120 PSI. Hybrid: 50–70 PSI. MTB: 25–35 PSI. A soft tyre increases puncture risk and rolling resistance.':
        '公路车：90–120 PSI。混合车：50–70 PSI。山地车：25–35 PSI。胎压不足会增加爆胎风险并加大滚动阻力。',
      'Chain — lube monthly': '链条 — 每月上油',
      'A dry chain wears out your cassette 3–5x faster. Wipe with a rag and apply a quality wet or dry lube every 200–300 km.':
        '干燥的链条会让飞轮的磨损速度加快 3 到 5 倍。请用布擦拭，并每 200–300 公里涂一次优质湿性或干性润滑油。',
      'Gears — tune annually': '变速 — 每年调校一次',
      'Cables stretch over time. A proper gear tune takes 15 minutes but prevents chain drops, especially on hills like Anzac Bridge or Military Road.':
        '线缆会随时间拉伸。一次到位的变速调校只需 15 分钟，却能有效防止脱链，在 Anzac Bridge 或 Military Road 这类坡道上尤其重要。',
      'Lights — NSW law': '车灯 — 新州法规',
      'You must have a white front light and red rear light when riding between sunset and sunrise. Fines up to $106 for non-compliance.':
        '日落至日出期间骑行必须装有前白灯和后红灯。不合规最高可被罚款 $106。',
      'Not Safe to Ride': '不宜骑行',
      'Your bike has one or more critical safety issues. Riding in this condition puts you at risk of injury and could result in a fine. We recommend a professional service before your next ride.':
        '您的自行车存在一个或多个严重的安全隐患。在此状态下骑行有受伤风险，也可能被罚款。建议您在下次骑行前进行专业保养。',
      'Book a Safety Service →': '预订安全保养 →',
      'Needs Attention Soon': '需尽快处理',
      'Your bike is rideable but has a few issues that should be fixed soon. Left unattended, these can develop into costly repairs or cause you to get stranded mid-ride.':
        '您的自行车目前可以骑行，但有一些问题应尽快处理。放任不管可能发展成代价更高的维修，或让您在半路抛锚。',
      'Book a Tune-Up ($109) →': '预订基础保养（$109）→',
      'Mostly Good — Minor Fix Needed': '基本良好 — 需小修',
      'Your bike is generally safe but has one minor issue. A quick service call can resolve it before it becomes a bigger problem.':
        '您的自行车总体安全，但有一个小问题。一次快速的上门服务即可解决，避免它演变成更大的麻烦。',
      'Your Bike is Safe to Ride!': '您的自行车可以安全骑行！',
      'Great news — your bike passed all 5 safety checks. Keep it that way with a professional service every 6 months or every 500 km.':
        '好消息——您的自行车通过了全部 5 项安全检查。建议每 6 个月或每骑行 500 公里进行一次专业保养，保持良好状态。',
      'Schedule Next Service →': '预约下次保养 →',
      'Call Us': '致电我们',
      'Call 0433 963 250': '致电 0433 963 250',
      'Brakes failing': '刹车失灵',
      'Brakes marginal': '刹车临界',
      'Flat/damaged tyre': '轮胎漏气/损坏',
      'Tyre pressure low': '胎压不足',
      'Chain needs replacing': '链条需更换',
      'Chain needs lube': '链条需要上油',
      'Gears need tuning': '变速需要调校',
      'Gears slipping': '变速打滑',
      'No lights (illegal)': '无车灯（违法）',
      'Lights need attention': '车灯需要检查',
      Home: '首页',
      'Sydney Cycling Map': '悉尼骑行地图',
      'For Business': '企业服务',
      'Privacy Policy': '隐私政策',
      Terms: '条款',
      '📧 Get monthly maintenance tips': '📧 获取每月维护小贴士',
      'Subscribe for seasonal bike care guides + WELCOME10 discount code.':
        '订阅即可获取季节性自行车养护指南，外加 WELCOME10 折扣码。',
      'Email address': '电子邮箱',
      Join: '加入',
      '✅ You\'re subscribed!': '✅ 订阅成功！',
      'Bike Safety Check': '自行车安全检测',
    },
  },
};

// ── Mechanics ───────────────────────────────────────────────────────────────

function replaceAll(text, table) {
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  let out = text;
  for (const key of keys) {
    if (!out.includes(key)) continue;
    out = out.split(key).join(table[key]);
  }
  return out;
}

function alternatesBlock(slug) {
  return Object.entries(LANGS)
    .map(([, l]) => `  <link rel="alternate" hreflang="${l.hreflang}" href="${SITE}${l.prefix}/${slug}">`)
    .concat([`  <link rel="alternate" hreflang="x-default" href="${SITE}/${slug}">`])
    .join('\n');
}

// Idempotency: this script's own English output (root business.html /
// bike-check.html) IS its English input, unlike generate-suburb-pages.mjs
// which always builds from a template that never changes shape. A second run
// would otherwise find its own previously-injected alternates block still
// sitting after the canonical link and inject a second copy on top of it -
// caught by running this script twice in a row and diffing. Stripping any
// existing alternate lines first makes every run start from the same clean
// state regardless of how many times it has already run.
// \r?\n, not \n: git's core.autocrlf checks these files out with CRLF line
// endings on Windows, so a plain \n here would silently fail to match the
// last line of a previously-injected block (the one immediately before
// whatever line ending the surrounding original text carries) and leave it
// behind for the next run to duplicate on top of.
const stripAlternates = (html) =>
  html.replace(/^ {2}<link rel="alternate" hreflang="[^"]+" href="[^"]+">\r?\n/gm, '');

let written = 0;
for (const p of PAGES) {
  const en = stripAlternates(read(p.file));

  // Fail loudly if a dictionary key no longer matches the source, instead of
  // silently shipping that one phrase in English (22.1's lesson, applied here).
  for (const lang of ['es', 'zh']) {
    const table = DICT[p.slug][lang];
    const missing = Object.keys(table).filter((k) => !en.includes(k));
    if (missing.length) {
      console.error(`${p.file} (${lang}): ${missing.length} key(s) not found in source:`);
      for (const k of missing) console.error('  - ' + JSON.stringify(k));
      process.exit(1);
    }
  }

  const canonicalEn = `<link rel="canonical" href="${SITE}/${p.slug}">`;
  const ogUrlEn = `<meta property="og:url" content="${SITE}/${p.slug}">`;
  if (!en.includes(canonicalEn)) {
    console.error(`${p.file}: canonical link "${canonicalEn}" not found - aborting`);
    process.exit(1);
  }
  if (!en.includes(ogUrlEn)) {
    console.error(`${p.file}: og:url "${ogUrlEn}" not found - aborting`);
    process.exit(1);
  }

  for (const [code, meta] of Object.entries(LANGS)) {
    const table = code === 'en' ? {} : DICT[p.slug][code];
    let html = replaceAll(en, table);
    html = html.replace('<html lang="en">', `<html lang="${meta.htmlLang}">`);
    html = html.replace(
      canonicalEn,
      `<link rel="canonical" href="${SITE}${meta.prefix}/${p.slug}">\n${alternatesBlock(p.slug)}`
    );
    html = html.replace(ogUrlEn, `<meta property="og:url" content="${SITE}${meta.prefix}/${p.slug}">`);

    // The two pages cross-link to each other in their footers. Both now have
    // es/zh versions, so - same rule generate-suburb-pages.mjs uses for
    // suburb-to-suburb links - the cross-link stays in the current language
    // instead of jumping the reader back to English. Home/Privacy/Terms/
    // Cycling Map are untouched: those pages have no translation to link to.
    if (code !== 'en') {
      for (const other of PAGES) {
        html = html.split(`href="/${other.slug}"`).join(`href="${meta.prefix}/${other.slug}"`);
      }
    }

    const dir = code === 'en' ? ROOT : path.join(ROOT, code);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, p.file), html);
    written++;
  }
  console.log(`${p.file}: en/es/zh written (hreflang added to all 3, including the English source)`);
}

console.log(`done: ${written} files written`);
