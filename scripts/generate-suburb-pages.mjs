// scripts/generate-suburb-pages.mjs — generates the suburb landing pages.
//
// Run: node scripts/generate-suburb-pages.mjs
//
// Why a generator: the 20 suburb pages were 20 hand-maintained copies of the
// same 155-line file, differing only in the suburb name and the list of areas.
// Every copy change had to be made 20 times (the Sunday-surcharge line was the
// most recent) and one missed file is silent stale copy in production. Now the
// copy lives here once per language and the files are output.
//
// Why separate URLs per language instead of translating in the browser: Google
// indexes the HTML it is served, so a client-side switcher would leave the
// Spanish and Chinese versions invisible to search. Each language gets its own
// crawlable URL, and the three point at each other with hreflang:
//   /bondi      (en-AU, x-default)
//   /es/bondi   (es)
//   /zh/bondi   (zh-Hans)
//
// The `data-service` attribute on each price card carries the canonical English
// service name, so js/live-prices.js can still match it against the Supabase
// `services` table on a translated page.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const SITE = 'https://drbikesydney.com.au';
const TODAY = new Date().toISOString().slice(0, 10);
// Cache-buster for the scripts these pages load. Bump it when js/live-prices.js
// changes: unlike the SPA, these pages are not covered by the service worker.
const ASSET_VERSION = '20260726';

// Suburb names and area lists are proper nouns: identical in all 3 languages.
const SUBURBS = [
  { slug: 'bondi', name: 'Bondi', areas: 'Bondi Beach, Bondi Junction, Bronte, Tamarama, Waverley' },
  { slug: 'cbd', name: 'Sydney CBD', areas: 'Sydney CBD, Pyrmont, Ultimo, Chippendale, Surry Hills' },
  { slug: 'chatswood', name: 'Chatswood', areas: 'Chatswood, Gordon, Killara, Lindfield, Roseville' },
  { slug: 'eastern-suburbs', name: 'Eastern Suburbs', areas: 'Bondi, Coogee, Randwick, Paddington, Double Bay' },
  { slug: 'hills-district', name: 'Hills District', areas: 'Castle Hill, Baulkham Hills, Kellyville, Rouse Hill, Bella Vista' },
  { slug: 'hornsby', name: 'Hornsby', areas: 'Hornsby, Waitara, Asquith, Mount Colah, Berowra' },
  { slug: 'inner-west', name: 'Inner West', areas: 'Newtown, Marrickville, Leichhardt, Petersham, Glebe' },
  { slug: 'manly', name: 'Manly', areas: 'Manly, Freshwater, Curl Curl, Dee Why, Queenscliff' },
  { slug: 'marrickville', name: 'Marrickville', areas: 'Marrickville, Dulwich Hill, Hurlstone Park, Tempe, Sydenham' },
  { slug: 'mosman', name: 'Mosman', areas: 'Mosman, Neutral Bay, Cremorne, Kirribilli, Milsons Point' },
  { slug: 'newtown', name: 'Newtown', areas: 'Newtown, Enmore, St Peters, Erskineville, Alexandria' },
  { slug: 'north-shore', name: 'North Shore', areas: 'Chatswood, Lane Cove, Willoughby, Mosman, Cremorne' },
  { slug: 'northern-beaches', name: 'Northern Beaches', areas: 'Narrabeen, Mona Vale, Avalon, Newport, Collaroy' },
  { slug: 'parramatta', name: 'Parramatta', areas: 'Parramatta, Westmead, Harris Park, Granville, Rosehill' },
  { slug: 'penrith', name: 'Penrith', areas: 'Penrith, Kingswood, Jamisontown, Glenmore Park, St Marys' },
  { slug: 'ryde', name: 'Ryde', areas: 'Ryde, West Ryde, Meadowbank, Shepherds Bay, Top Ryde' },
  { slug: 'st-george', name: 'St George', areas: 'Kogarah, Hurstville, Rockdale, Bexley, Carlton' },
  { slug: 'strathfield', name: 'Strathfield', areas: 'Strathfield, Burwood, Croydon, Homebush, Auburn' },
  { slug: 'surry-hills', name: 'Surry Hills', areas: 'Surry Hills, Darlinghurst, Redfern, Waterloo, Zetland' },
  { slug: 'sutherland-shire', name: 'Sutherland Shire', areas: 'Cronulla, Miranda, Caringbah, Engadine, Gymea' },
];

// Neighbouring areas, by Sydney geography. Used for internal links: every
// suburb page was a dead end that only linked to Home/Services/Terms/Privacy,
// so nothing passed authority between them and a visitor in the wrong suburb had
// no way across. Links always stay inside the same language.
const NEIGHBOURS = {
  bondi: ['eastern-suburbs', 'surry-hills', 'cbd'],
  cbd: ['surry-hills', 'inner-west', 'bondi'],
  chatswood: ['north-shore', 'mosman', 'hornsby'],
  'eastern-suburbs': ['bondi', 'surry-hills', 'cbd'],
  'hills-district': ['parramatta', 'penrith', 'hornsby'],
  hornsby: ['chatswood', 'north-shore', 'hills-district'],
  'inner-west': ['newtown', 'marrickville', 'cbd'],
  manly: ['northern-beaches', 'mosman', 'north-shore'],
  marrickville: ['newtown', 'inner-west', 'st-george'],
  mosman: ['north-shore', 'manly', 'chatswood'],
  newtown: ['inner-west', 'marrickville', 'surry-hills'],
  'north-shore': ['chatswood', 'mosman', 'hornsby'],
  'northern-beaches': ['manly', 'mosman', 'north-shore'],
  parramatta: ['hills-district', 'ryde', 'strathfield'],
  penrith: ['hills-district', 'parramatta', 'strathfield'],
  ryde: ['north-shore', 'parramatta', 'chatswood'],
  'st-george': ['sutherland-shire', 'marrickville', 'strathfield'],
  strathfield: ['inner-west', 'parramatta', 'ryde'],
  'surry-hills': ['cbd', 'newtown', 'bondi'],
  'sutherland-shire': ['st-george', 'marrickville', 'cbd'],
};

// Existing blog posts, linked from the English pages only - they have no
// translation yet, and sending a Spanish reader to an English article is worse
// than not linking it.
const BLOG_POSTS = [
  ['/blog/how-to-choose-a-bike-mechanic-sydney', 'How to choose a bike mechanic in Sydney'],
  ['/blog/how-to-clean-your-bike-chain-sydney', 'How to clean your bike chain'],
  ['/blog/cycling-safety-tips-sydney-roads', 'Cycling safety on Sydney roads'],
  ['/blog/best-bikes-for-sydney-commuting-2026', 'Best bikes for Sydney commuting'],
  ['/blog/electric-bike-laws-nsw-2026', 'Electric bike laws in NSW'],
];

// Prices are display defaults only - js/live-prices.js overwrites them from the
// Supabase `services` table on load, matching on data-service.
const SERVICE_KEYS = ['Tune-Up', 'Standard Service', 'Standard+ Service', 'Ultimate Overhaul'];
const SERVICE_PRICES = ['$109', '$149', '$199', '$369'];

// The visible prices get overwritten in the browser by js/live-prices.js from the
// Supabase `services` table, but the Service schema is static HTML - so when the
// defaults above drift, the structured data starts telling Google a price the
// page does not charge. Read the real ones at generation time; SERVICE_PRICES is
// only the offline fallback.
const SUPABASE_URL = 'https://tgpipbloisahufaywhqb.supabase.co';
// Public anon key - the `services` table is world-readable by design, the browser
// reads it exactly like this in js/live-prices.js.
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncGlwYmxvaXNhaHVmYXl3aHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTM4NjgsImV4cCI6MjA5MzQ4OTg2OH0.P1lpqPVmW0HE3PwHeUhRw20eRP3ApdDGYuiwtJhRD9U';

async function livePrices() {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/services?select=name,price`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const rows = await r.json();
    const missing = SERVICE_KEYS.filter((key) => !rows.some((s) => s.name === key));
    if (missing.length) console.warn(`  ! no Supabase row for ${missing.join(', ')} - kept default`);
    const prices = SERVICE_KEYS.map((key, i) => {
      const match = rows.find((s) => s.name === key);
      return typeof match?.price === 'number' ? `$${match.price}` : SERVICE_PRICES[i];
    });
    console.log(`prices: live from Supabase -> ${prices.join(' ')}`);
    return prices;
  } catch (e) {
    console.warn(`prices: Supabase unreachable (${e.message}) - using the built-in defaults`);
    return SERVICE_PRICES;
  }
}

const LANGS = {
  en: { hreflang: 'en-AU', htmlLang: 'en', prefix: '', label: 'EN' },
  es: { hreflang: 'es', htmlLang: 'es', prefix: '/es', label: 'ES' },
  zh: { hreflang: 'zh-Hans', htmlLang: 'zh-Hans', prefix: '/zh', label: '中文' },
};

const COPY = {
  en: {
    title: 'Mobile Bike Mechanic {name} | Dr. Bike Sydney',
    description:
      'Expert mobile bicycle mechanic in {name}, Sydney. We come to you — home, work or park. Serving {areas}. Book online, same-day service available.',
    bookNow: 'Book Now',
    badges: ['100% Satisfaction Guarantee', 'Verified Mechanic', 'Background Checked', 'Fully Insured'],
    heroH1: 'Mobile Bike Mechanic<br>{name}, Sydney',
    heroP:
      'Professional bicycle repair at your doorstep. We come to you — home, work or park. No need to transport your bike.',
    bookService: 'Book a Service',
    call: 'Call 0433 963 250',
    repairsH2: 'Bike Repairs in {name}',
    repairsP1:
      'Dr. Bike Sydney provides professional mobile bicycle repair and servicing throughout {name} and surrounding suburbs. Our qualified mechanic arrives in a fully-equipped van with all the tools and parts needed to fix your bike on the spot.',
    repairsP2:
      "We cover {areas} and all nearby streets. Whether you're at home, at work, or at the park — we come to you.",
    areasLabel: '📍 Areas covered: {areas}',
    servicesH2: 'Our Services &amp; Pricing',
    pricingNote:
      'All prices include the mobile call-out fee. No hidden charges. Sunday &amp; NSW public holiday bookings +20%; Saturday is normal price.',
    serviceNames: ['Tune-Up', 'Standard Service', 'Standard+ Service', 'Ultimate Overhaul'],
    serviceDescs: [
      'Gears, brakes, wheels trued · ~1 hour',
      'Full tune-up + drivetrain clean · ~1.5h',
      'Comprehensive overhaul · ~2.5h',
      'Complete rebuild · ~4 hours',
    ],
    whyH2: 'Why Choose Dr. Bike in {name}?',
    pillars: [
      ['🔧', 'Qualified Mechanic', 'Experienced bicycle technician with 5+ years of hands-on expertise'],
      ['🚐', 'Fully Equipped Van', 'Mobile workshop stocked with professional tools and common parts'],
      ['⭐', '5-Star Rated', 'Trusted by cyclists across {name} and greater Sydney'],
      ['📱', 'Easy Online Booking', 'Book in 4 taps. Same-day slots available most days'],
    ],
    faqH2: 'Frequently Asked Questions — {name}',
    faqs: [
      [
        'How quickly can you come to {name}?',
        'We typically offer same-day or next-day bookings in {name}. Book online and select your preferred date and time.',
      ],
      [
        'Do I need to take my bike anywhere?',
        'No. We come directly to your home, workplace, or any location in {name}. Just have your bike accessible and we handle the rest.',
      ],
      [
        'What payment methods do you accept?',
        'We accept all major credit cards, Apple Pay, Google Pay, and cash on completion. Secure payment via Stripe.',
      ],
      [
        'What types of bikes do you service in {name}?',
        'Road bikes, mountain bikes, hybrid bikes, commuter bikes, e-bikes, kids bikes and more. If it has wheels and pedals, we service it.',
      ],
      [
        'How much does a bike service cost in {name}?',
        'Our Tune-Up starts at $109 and includes the mobile call-out fee. Full pricing is listed above. No hidden charges.',
      ],
    ],
    ctaH2: 'Ready to book in {name}?',
    ctaP: 'Your bike deserves the best. Book online in 60 seconds.',
    ctaBtn: 'Book a Service in {name}',
    footer1: 'Dr. Bike Sydney · Mobile Bicycle Mechanic · ABN 87 654 025 287',
    footer2: 'Serving {name} and all of Sydney · Mon–Sat 8am–6pm',
    footerLinks: ['Home', 'Services', 'Terms', 'Privacy'],
    nearbyH2: 'Bike repair near {name}',
    nearbyP: 'We also service these neighbouring areas - same mechanic, same van, same day rates:',
    readMore: 'Bike care guides',
    breadcrumbHome: 'Home',
  },

  es: {
    title: 'Mecánico de Bicicletas a Domicilio en {name} | Dr. Bike Sydney',
    description:
      'Mecánico de bicicletas a domicilio en {name}, Sídney. Vamos a donde estés: casa, trabajo o parque. Cubrimos {areas}. Reserva online, con turnos el mismo día.',
    bookNow: 'Reservar',
    badges: [
      'Garantía de 100% de satisfacción',
      'Mecánico verificado',
      'Antecedentes verificados',
      'Totalmente asegurado',
    ],
    heroH1: 'Mecánico de Bicicletas a Domicilio<br>{name}, Sídney',
    heroP:
      'Reparación profesional de bicicletas en tu puerta. Vamos a donde estés: casa, trabajo o parque. No hace falta que traslades la bici.',
    bookService: 'Reservar un servicio',
    call: 'Llamar al 0433 963 250',
    repairsH2: 'Reparación de bicicletas en {name}',
    repairsP1:
      'Dr. Bike Sydney ofrece reparación y mantenimiento de bicicletas a domicilio en {name} y los barrios vecinos. Nuestro mecánico calificado llega en una camioneta totalmente equipada, con las herramientas y los repuestos necesarios para arreglar tu bici en el lugar.',
    repairsP2:
      'Cubrimos {areas} y todas las calles cercanas. Estés en casa, en el trabajo o en el parque, vamos a donde estés.',
    areasLabel: '📍 Zonas que cubrimos: {areas}',
    servicesH2: 'Servicios y precios',
    pricingNote:
      'Todos los precios incluyen la tarifa de visita a domicilio. Sin cargos ocultos. Las reservas de domingo y feriados de NSW tienen un 20% de recargo; el sábado tiene precio normal.',
    serviceNames: ['Ajuste', 'Servicio Estándar', 'Servicio Estándar+', 'Revisión Definitiva'],
    serviceDescs: [
      'Cambios, frenos y ruedas centradas · ~1 hora',
      'Ajuste completo + limpieza de transmisión · ~1,5 h',
      'Revisión integral · ~2,5 h',
      'Reconstrucción completa · ~4 horas',
    ],
    whyH2: '¿Por qué elegir Dr. Bike en {name}?',
    pillars: [
      ['🔧', 'Mecánico calificado', 'Técnico en bicicletas con más de 5 años de experiencia real'],
      ['🚐', 'Camioneta equipada', 'Taller móvil con herramientas profesionales y repuestos comunes'],
      ['⭐', 'Calificación 5 estrellas', 'Nos eligen ciclistas de {name} y de todo Sídney'],
      ['📱', 'Reserva online fácil', 'Reservá en 4 toques. Casi siempre hay turnos el mismo día'],
    ],
    faqH2: 'Preguntas frecuentes — {name}',
    faqs: [
      [
        '¿Qué tan rápido pueden ir a {name}?',
        'En {name} normalmente tenemos turnos el mismo día o el siguiente. Reservá online y elegí la fecha y la hora que te sirvan.',
      ],
      [
        '¿Tengo que llevar la bici a algún lado?',
        'No. Vamos directamente a tu casa, tu trabajo o cualquier punto de {name}. Solo dejá la bici accesible y del resto nos encargamos nosotros.',
      ],
      [
        '¿Qué medios de pago aceptan?',
        'Aceptamos todas las tarjetas de crédito principales, Apple Pay, Google Pay y efectivo al finalizar. Pago seguro con Stripe.',
      ],
      [
        '¿Qué tipos de bicicleta atienden en {name}?',
        'Bicis de ruta, de montaña, híbridas, urbanas, eléctricas, de niños y más. Si tiene ruedas y pedales, la atendemos.',
      ],
      [
        '¿Cuánto cuesta un servicio de bicicleta en {name}?',
        'El Ajuste arranca en $109 e incluye la tarifa de visita a domicilio. Los precios completos están más arriba. Sin cargos ocultos.',
      ],
    ],
    ctaH2: '¿Listo para reservar en {name}?',
    ctaP: 'Tu bici merece lo mejor. Reservá online en 60 segundos.',
    ctaBtn: 'Reservar un servicio en {name}',
    footer1: 'Dr. Bike Sydney · Mecánico de bicicletas a domicilio · ABN 87 654 025 287',
    footer2: 'Atendemos {name} y todo Sídney · lun–sáb 8:00–18:00',
    footerLinks: ['Inicio', 'Servicios', 'Términos', 'Privacidad'],
    nearbyH2: 'Reparación de bicicletas cerca de {name}',
    nearbyP: 'También atendemos estas zonas vecinas: el mismo mecánico, la misma camioneta y las mismas tarifas del día:',
    readMore: 'Guías de cuidado de la bici',
    breadcrumbHome: 'Inicio',
  },

  zh: {
    title: '{name} 上门自行车维修 | Dr. Bike Sydney',
    description:
      '{name}（悉尼）专业上门自行车维修。我们到您指定的地点服务：家里、公司或公园。服务范围：{areas}。可在线预订，多数日期当天可约。',
    bookNow: '立即预订',
    badges: ['100% 满意保证', '技师已认证', '已做背景核查', '全额投保'],
    heroH1: '{name}（悉尼）<br>上门自行车维修',
    heroP: '专业自行车维修，直接到您门口。家里、公司或公园都可以，无需自己搬运车子。',
    bookService: '预订服务',
    call: '致电 0433 963 250',
    repairsH2: '{name} 自行车维修',
    repairsP1:
      'Dr. Bike Sydney 为 {name} 及周边地区提供专业的上门自行车维修与保养。我们的持证技师开着装备齐全的服务车上门，带齐所需工具和常用零件，现场完成维修。',
    repairsP2:
      '我们的服务范围覆盖 {areas} 及附近街区。无论您在家、在公司还是在公园，我们都能上门。',
    areasLabel: '📍 服务范围：{areas}',
    servicesH2: '服务与价格',
    pricingNote:
      '所有价格均含上门服务费，无隐藏费用。周日及新南威尔士州公共假日预订加收 20%，周六按正常价格计算。',
    serviceNames: ['基础保养', '标准服务', '标准+服务', '全面翻新'],
    serviceDescs: [
      '变速、刹车调整，车轮校正 · 约 1 小时',
      '完整保养 + 传动系统清洁 · 约 1.5 小时',
      '全面检修 · 约 2.5 小时',
      '整车重装 · 约 4 小时',
    ],
    whyH2: '为什么在 {name} 选择 Dr. Bike？',
    pillars: [
      ['🔧', '持证技师', '拥有 5 年以上实战经验的自行车技师'],
      ['🚐', '装备齐全的服务车', '移动工作间，配备专业工具与常用零件'],
      ['⭐', '五星好评', '{name} 及大悉尼地区的骑行者都信赖我们'],
      ['📱', '在线预订便捷', '4 步完成预订，多数日期当天有空位'],
    ],
    faqH2: '常见问题 — {name}',
    faqs: [
      [
        '你们多快能到 {name}？',
        '在 {name}，我们通常当天或次日就能上门。在线预订并选择您方便的日期和时间即可。',
      ],
      [
        '我需要把车送到什么地方吗？',
        '不需要。我们直接上门到您家、公司或 {name} 的任何地点。请确保技师能拿到车，其余交给我们。',
      ],
      [
        '你们接受哪些付款方式？',
        '我们接受各大信用卡、Apple Pay、Google Pay，以及完工后现金付款。在线支付由 Stripe 提供安全保障。',
      ],
      [
        '你们在 {name} 维修哪些类型的自行车？',
        '公路车、山地车、混合车、通勤车、电动自行车、童车等等。只要有轮子和脚踏，我们都能修。',
      ],
      [
        '在 {name} 做一次保养要多少钱？',
        '基础保养 $109 起，已包含上门服务费。完整价格见上方，没有隐藏费用。',
      ],
    ],
    ctaH2: '准备在 {name} 预订了吗？',
    ctaP: '您的爱车值得最好的照顾。在线预订只需 60 秒。',
    ctaBtn: '在 {name} 预订服务',
    footer1: 'Dr. Bike Sydney · 上门自行车技师 · ABN 87 654 025 287',
    footer2: '服务 {name} 及整个悉尼 · 周一至周六 8:00–18:00',
    footerLinks: ['首页', '服务', '条款', '隐私'],
    nearbyH2: '{name} 附近的自行车维修',
    nearbyP: '我们同样服务这些邻近区域：同一位技师、同一辆服务车、同样的当日价格：',
    readMore: '自行车保养指南',
    breadcrumbHome: '首页',
  },
};

const fill = (text, sub) =>
  String(text).replaceAll('{name}', sub.name).replaceAll('{areas}', sub.areas);

const BADGE_STYLES = [
  ['#065F46', '#ECFDF5', '#059669', '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>'],
  ['#1e40af', '#EEF3FC', '#0A58CA', '<circle cx="12" cy="8" r="4"/><path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><polyline points="16 3 18 5 22 1"/>'],
  ['#92400e', '#FFFBEB', '#D97706', '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'],
  ['#5b21b6', '#F5F3FF', '#7C3AED', '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'],
];

function page(sub, lang) {
  const c = COPY[lang];
  const meta = LANGS[lang];
  const url = `${SITE}${meta.prefix}/${sub.slug}`;
  const title = fill(c.title, sub);
  const description = fill(c.description, sub);

  const alternates = Object.entries(LANGS)
    .map(
      ([code, l]) =>
        `  <link rel="alternate" hreflang="${l.hreflang}" href="${SITE}${l.prefix}/${sub.slug}">`
    )
    .concat([`  <link rel="alternate" hreflang="x-default" href="${SITE}/${sub.slug}">`])
    .join('\n');

  const langSwitcher = Object.entries(LANGS)
    .map(([code, l]) => {
      const active = code === lang;
      return `<a href="${l.prefix}/${sub.slug}" hreflang="${l.hreflang}"${active ? ' aria-current="true"' : ''} style="color:${active ? '#fff' : 'rgba(255,255,255,.6)'};text-decoration:none;font-size:12px;font-weight:${active ? '700' : '500'}">${l.label}</a>`;
    })
    .join('<span style="color:rgba(255,255,255,.3);font-size:12px">·</span>');

  const badges = c.badges
    .map((text, i) => {
      const [color, bg, stroke, svg] = BADGE_STYLES[i];
      return `    <span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:${color};background:${bg};border:1px solid ${stroke};border-radius:8px;padding:5px 10px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2.5">${svg}</svg>
      ${text}
    </span>`;
    })
    .join('\n');

  const services = c.serviceNames
    .map(
      (name, i) =>
        `      <div class="service-card" data-service="${SERVICE_KEYS[i]}"><h3>${name}</h3><div class="price">${PRICES[i]}</div><p style="font-size:12px;color:#6B7280;margin-top:4px">${c.serviceDescs[i]}</p></div>`
    )
    .join('\n');

  const pillars = c.pillars
    .map(
      ([icon, h3, p]) =>
        `    <div class="pillar"><div class="icon">${icon}</div><h3>${h3}</h3><p>${fill(p, sub)}</p></div>`
    )
    .join('\n');

  const faqs = c.faqs
    .map(
      ([q, a]) => `      <div class="faq-item">
        <h3>${fill(q, sub)}</h3>
        <p>${fill(a, sub)}</p>
      </div>`
    )
    .join('\n');

  // FAQPage structured data: these are real Q&As on the page, which is what
  // makes them eligible for the FAQ rich result.
  const faqSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: meta.hreflang,
    mainEntity: c.faqs.map(([q, a]) => ({
      '@type': 'Question',
      name: fill(q, sub),
      acceptedAnswer: { '@type': 'Answer', text: fill(a, sub) },
    })),
  });

  const businessSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'Dr. Bike Sydney',
    image: `${SITE}/images/hero-van.png`,
    description,
    inLanguage: meta.hreflang,
    address: {
      '@type': 'PostalAddress',
      addressLocality: sub.name,
      addressRegion: 'NSW',
      addressCountry: 'AU',
    },
    telephone: '+61433963250',
    url,
    priceRange: '$109-$369',
    openingHours: 'Mo-Sa 08:00-18:00',
    areaServed: { '@type': 'City', name: `${sub.name}, Sydney` },
  });

  // Service schema: says what we actually sell, in this area, at what price, in
  // the language of the page. LocalBusiness above describes who we are - this
  // describes the offer, and the two answer different questions for Google.
  // Prices come from Supabase at generation time (see livePrices), so the
  // structured data and the visible card can never quote different numbers.
  const serviceSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: 'Mobile bicycle repair and servicing',
    provider: { '@type': 'LocalBusiness', name: 'Dr. Bike Sydney', telephone: '+61433963250' },
    areaServed: { '@type': 'City', name: `${sub.name}, Sydney` },
    inLanguage: meta.hreflang,
    url,
    offers: c.serviceNames.map((name, i) => ({
      '@type': 'Offer',
      name,
      price: PRICES[i].replace(/^\$/, ''),
      priceCurrency: 'AUD',
      availability: 'https://schema.org/InStock',
      url,
    })),
  });

  const breadcrumbSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: c.breadcrumbHome, item: `${SITE}${meta.prefix}/` },
      { '@type': 'ListItem', position: 2, name: sub.name, item: url },
    ],
  });

  const neighbours = (NEIGHBOURS[sub.slug] || [])
    .map((slug) => SUBURBS.find((s) => s.slug === slug))
    .filter(Boolean);

  const nearbySection = neighbours.length
    ? `
<section class="section">
  <h2>${fill(c.nearbyH2, sub)}</h2>
  <p>${c.nearbyP}</p>
  <p class="links-row">${neighbours
    .map((n) => `<a href="${meta.prefix}/${n.slug}">${n.name}</a>`)
    .join('')}</p>
  ${
    lang === 'en'
      ? `<h3 class="links-h3">${c.readMore}</h3>
  <p class="links-row">${BLOG_POSTS.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}</p>`
      : ''
  }
</section>
`
    : '';

  return `<!DOCTYPE html>
<html lang="${meta.htmlLang}">
<head>
  <!-- Generated by scripts/generate-suburb-pages.mjs - do not edit by hand.
       Change the copy in that script and re-run it. -->
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${url}">
  <link rel="icon" href="/icon-512.svg?v=2" type="image/svg+xml">
  <link rel="icon" href="/favicon-32.png?v=2" sizes="32x32" type="image/png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2">
${alternates}
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${url}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="${lang === 'en' ? 'en_AU' : lang === 'es' ? 'es_ES' : 'zh_CN'}">
  <meta property="og:image" content="${SITE}/images/hero-van.png">
  <script type="application/ld+json">${businessSchema}</script>
  <script type="application/ld+json">${faqSchema}</script>
  <script type="application/ld+json">${breadcrumbSchema}</script>
  <script type="application/ld+json">${serviceSchema}</script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-GXYD68JXZW"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-GXYD68JXZW');</script>
  <link rel="stylesheet" href="/css/variables.css">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#0D1F3C}
    header{background:#0D1F3C;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .logo{color:#fff;font-weight:800;font-size:18px;text-decoration:none}
    .head-right{display:flex;align-items:center;gap:14px}
    .lang-links{display:flex;align-items:center;gap:6px}
    .cta-header{background:#0A58CA;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px}
    .hero{background:linear-gradient(135deg,#0D1F3C,#2563EB);color:#fff;padding:60px 24px;text-align:center}
    .hero h1{font-size:clamp(26px,5vw,42px);font-weight:900;margin-bottom:12px;line-height:1.2}
    .hero p{font-size:16px;opacity:.85;margin-bottom:32px;max-width:560px;margin-left:auto;margin-right:auto}
    .btn{display:inline-block;background:#0A58CA;color:#fff;padding:16px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;margin:8px}
    .btn.secondary{background:transparent;border:2px solid #fff}
    .section{padding:60px 24px;max-width:900px;margin:0 auto}
    .section h2{font-size:28px;font-weight:800;margin-bottom:16px;color:#0D1F3C}
    .section p{font-size:15px;color:#4B5563;line-height:1.7;margin-bottom:16px}
    .services{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-top:24px}
    .service-card{background:#F7F8FA;border-radius:12px;padding:20px;border-left:4px solid #0A58CA}
    .service-card h3{font-size:15px;font-weight:700;color:#0D1F3C;margin-bottom:4px}
    .service-card .price{font-size:20px;font-weight:900;color:#0A58CA}
    .pillars{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:20px;margin-top:24px}
    .pillar{text-align:center;padding:24px 16px}
    .pillar .icon{font-size:36px;margin-bottom:12px}
    .pillar h3{font-size:15px;font-weight:700;color:#0D1F3C}
    .pillar p{font-size:13px;color:#6B7280;margin-top:4px}
    .areas{background:#EEF3FC;border-radius:12px;padding:20px;margin-top:16px;font-size:14px;color:#2563EB;line-height:1.8}
    .faq{margin-top:16px}
    .faq-item{border-bottom:1px solid #E5E7EB;padding:16px 0}
    .faq-item h3{font-size:15px;font-weight:700;color:#0D1F3C;margin-bottom:8px}
    .faq-item p{font-size:14px;color:#4B5563;line-height:1.6}
    footer{background:#0D1F3C;color:rgba(255,255,255,.6);text-align:center;padding:32px 24px;font-size:13px}
    footer a{color:rgba(255,255,255,.8);text-decoration:none;margin:0 12px}
    .links-row{display:flex;flex-wrap:wrap;gap:10px 18px;margin-top:8px}
    .links-row a{color:#0A58CA;font-weight:600;text-decoration:none;font-size:15px}
    .links-row a:hover{text-decoration:underline}
    .links-h3{font-size:16px;font-weight:700;color:#0D1F3C;margin-top:28px}
  </style>
</head>
<body>
<header>
  <a href="${meta.prefix}/" class="logo" style="display:inline-flex;align-items:center;gap:8px"><img src="/images/logo-db.png" alt="Dr. Bike Sydney" style="height:28px;width:auto">Dr. <span style="color:#60A5FA">Bike</span> Sydney</a>
  <div class="head-right">
    <div class="lang-links">${langSwitcher}</div>
    <a href="/" class="cta-header">${c.bookNow}</a>
  </div>
</header>
<div style="background:#F7F8FA;border-bottom:1px solid #E5E7EB;padding:12px 24px">
  <div style="max-width:900px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:16px">
${badges}
  </div>
</div>

<section class="hero">
  <h1>${fill(c.heroH1, sub)}</h1>
  <p>${c.heroP}</p>
  <a href="/" class="btn" data-lead-cta>${c.bookService}</a>
  <a href="tel:+61433963250" class="btn secondary">${c.call}</a>
</section>

<section class="section">
  <h2>${fill(c.repairsH2, sub)}</h2>
  <p>${fill(c.repairsP1, sub)}</p>
  <p>${fill(c.repairsP2, sub)}</p>
  <div class="areas">${fill(c.areasLabel, sub)}</div>
</section>

<section class="section" style="background:#F7F8FA;max-width:100%;padding:60px 24px">
  <div style="max-width:900px;margin:0 auto">
    <h2>${c.servicesH2}</h2>
    <p>${c.pricingNote}</p>
    <div class="services">
${services}
    </div>
  </div>
</section>

<section class="section">
  <h2>${fill(c.whyH2, sub)}</h2>
  <div class="pillars">
${pillars}
  </div>
</section>

<section class="section" style="background:#F7F8FA;max-width:100%;padding:60px 24px">
  <div style="max-width:900px;margin:0 auto">
    <h2>${fill(c.faqH2, sub)}</h2>
    <div class="faq">
${faqs}
    </div>
  </div>
</section>

${nearbySection}
<section class="section" style="text-align:center">
  <h2>${fill(c.ctaH2, sub)}</h2>
  <p style="margin-bottom:24px">${c.ctaP}</p>
  <a href="/" class="btn" style="font-size:17px;padding:18px 40px" data-lead-cta>${fill(c.ctaBtn, sub)}</a>
</section>

<footer>
  <p style="margin-bottom:12px">${c.footer1}</p>
  <p style="margin-bottom:12px">${fill(c.footer2, sub)}</p>
  <p><a href="/">${c.footerLinks[0]}</a><a href="/landing.html">${c.footerLinks[1]}</a><a href="/terms.html">${c.footerLinks[2]}</a><a href="/privacy.html">${c.footerLinks[3]}</a></p>
</footer>
<!-- Versioned: these pages are outside the service worker, so a returning
     visitor would otherwise keep an old live-prices.js from the HTTP cache.
     Bump ASSET_VERSION in the generator whenever js/live-prices.js changes. -->
<script src="/js/live-prices.js?v=${ASSET_VERSION}" defer></script>
<script>
  // No inline onclick handlers anywhere in this project - the CTA fires its
  // analytics event from a listener bound to the data attribute instead.
  document.querySelectorAll('[data-lead-cta]').forEach(function (el) {
    el.addEventListener('click', function () {
      if (window.gtag) gtag('event', 'generate_lead', { page: '${sub.slug}', lang: '${lang}' });
    });
  });
</script>
</body>
</html>
`;
}

// ── Sitemap ─────────────────────────────────────────────────────────────────
// Every URL declares its own alternates, which is what tells Google the three
// language versions are the same page rather than duplicates.
const STATIC_PAGES = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/landing.html', priority: '0.9', changefreq: 'weekly' },
  { path: '/bike-check', priority: '0.9', changefreq: 'monthly' },
  { path: '/business', priority: '0.9', changefreq: 'monthly' },
  { path: '/terms', priority: '0.3', changefreq: 'yearly' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
  { path: '/blog/best-bikes-for-sydney-commuting-2026', priority: '0.7', changefreq: 'monthly' },
  { path: '/blog/cycling-safety-tips-sydney-roads', priority: '0.7', changefreq: 'monthly' },
  { path: '/blog/electric-bike-laws-nsw-2026', priority: '0.7', changefreq: 'monthly' },
  { path: '/blog/how-to-choose-a-bike-mechanic-sydney', priority: '0.7', changefreq: 'monthly' },
  { path: '/blog/how-to-clean-your-bike-chain-sydney', priority: '0.7', changefreq: 'monthly' },
];

function sitemap() {
  const entries = [];

  for (const p of STATIC_PAGES) {
    entries.push(`  <url>
    <loc>${SITE}${p.path}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`);
  }

  for (const sub of SUBURBS) {
    for (const [code, l] of Object.entries(LANGS)) {
      const alts = Object.entries(LANGS)
        .map(
          ([, a]) =>
            `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${SITE}${a.prefix}/${sub.slug}"/>`
        )
        .concat([
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/${sub.slug}"/>`,
        ])
        .join('\n');
      entries.push(`  <url>
    <loc>${SITE}${l.prefix}/${sub.slug}</loc>
${alts}
    <lastmod>${TODAY}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${code === 'en' ? '0.8' : '0.6'}</priority>
  </url>`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`;
}

// ── Write ───────────────────────────────────────────────────────────────────
// Resolved once, so all 60 pages and every Service schema quote the same number.
const PRICES = await livePrices();
let written = 0;
for (const [code, meta] of Object.entries(LANGS)) {
  const dir = code === 'en' ? ROOT : path.join(ROOT, code);
  fs.mkdirSync(dir, { recursive: true });
  for (const sub of SUBURBS) {
    fs.writeFileSync(path.join(dir, `${sub.slug}.html`), page(sub, code));
    written++;
  }
  console.log(`${code}: ${SUBURBS.length} pages -> ${path.relative(ROOT, dir) || '.'}/`);
}

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap());
console.log(
  `sitemap.xml: ${STATIC_PAGES.length + SUBURBS.length * 3} urls (${SUBURBS.length} suburbs x 3 languages)`
);
console.log(`done: ${written} pages written`);
