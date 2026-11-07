// scripts/build-blog.mjs - the blog: 5 posts and an index, in en/es/zh.
//
// Run: npm run blog:build      (writes the 18 pages)
//      npm run blog:check      (writes nothing, exits 1 on any difference -
//                               part of `npm run check`)
//      npm run blog:og         (redraws images/blog/*.png, the share images;
//                               needs Playwright's Chromium, not part of check)
//
// WHAT IS THE SOURCE
//
// Until 2026-11-05 the five blog/*.html pages were hand-written, each with its
// own copy of the template, and scripts/translate-blog-posts.mjs made es/ and
// zh/ from them by find/replace. A design change meant five hand edits, and a
// stale price in a CTA ("Book a Tune-Up - $119") lived in all fifteen.
//
// Now:
//   - scripts/blog-posts/<slug>.htm   the English article body, nothing else
//                                      (.htm, not .html: every page check in
//                                      scripts/ walks *.html, and a fragment
//                                      has no <head> to pass them)
//   - POSTS below                      title, description, category, CTA
//   - DICT below                       es/zh, per post: exact strings for the
//                                      metadata, whole fragments for the body
//   - UI below                         the template's own words, 3 languages
//
// Every page under blog/, es/blog/ and zh/blog/ is OUTPUT. A hand edit there
// is undone by the next run and fails `npm run check`.
//
// PRICES ARE NOT WRITTEN HERE. They live in Supabase's `services` table and
// change (the +$10 of 24-oct-2026 touched 56 files). The blog links to the
// booking page, which shows the live price, and says the visit & diagnosis fee
// is charged on top - never "all prices include".

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const SITE = 'https://drbikesydney.com.au';
const CHECK = process.argv.includes('--check');
const OG = process.argv.includes('--og');

const PUBLISHED = '2026-06-15';
// Bump when an article's content changes: it is the dateModified Google sees,
// the "Updated" line readers see, and the sitemap's lastmod for the post
// (scripts/generate-suburb-pages.mjs reads it back from the page).
const MODIFIED = '2026-11-05';
const WPM = 220;

const LANGS = {
  en: { hreflang: 'en-AU', htmlLang: 'en', prefix: '' },
  es: { hreflang: 'es', htmlLang: 'es', prefix: '/es' },
  zh: { hreflang: 'zh-Hans', htmlLang: 'zh-Hans', prefix: '/zh' },
};

// The five published suburb pages (the other 15 were retired on 25-aug and
// 301 to "/"). Linking a retired one sends the reader through a redirect.
const AREAS = [
  ['northern-beaches', 'Northern Beaches'],
  ['north-shore', 'North Shore'],
  ['cbd', 'Sydney CBD'],
  ['inner-west', 'Inner West'],
  ['bondi', 'Bondi'],
];

// Category colours are tokens only (scripts/color-check.mjs). The kicker text
// stays --navy and only the dot takes the colour, so no category depends on
// its own colour passing contrast as text.
const CATS = {
  buyers: { c: 'var(--blue)', tint: 'var(--blue-tint)', icon: 'bike' },
  guide: { c: 'var(--green)', tint: 'var(--green-tint)', icon: 'userCheck' },
  safety: { c: 'var(--amber)', tint: 'var(--amber-lt)', icon: 'shield' },
  legal: { c: 'var(--purple)', tint: 'var(--purple-lt)', icon: 'zap' },
  maint: { c: 'var(--cyan)', tint: 'color-mix(in srgb, var(--cyan) 9%, var(--white))', icon: 'link' },
};

// Lucide icons (ISC licence), 24x24, stroked.
const ICONS = {
  bike: '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
  userCheck: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
};
const svg = (name, cls = '') =>
  `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

// Index order: the first one is the featured card. Best Bikes is the blog's
// strongest Google page, so it leads.
//
// SEO: these titles, descriptions and H1s are what Google has indexed. Do not
// change a slug, and do not change what a title or H1 means.
const POSTS = {
  'best-bikes-for-sydney-commuting-2026': {
    title: 'Best Bikes for Sydney Commuting 2026 | Dr. Bike Sydney',
    description:
      'The best bikes for commuting in Sydney in 2026 — hybrid, e-bike, gravel and folding options reviewed for inner-city riders.',
    h1: 'Best Bikes for Sydney Commuting 2026',
    cat: 'buyers',
    ga: 'blog_commuting',
    cta: {
      title: 'Got a new commuter bike?',
      text: 'A Tune-Up before you start commuting gets the basics right: safety check, gear and brake adjustment, tyre pressure and drivetrain lube. We come to you.',
      label: 'ctaTuneUp',
    },
    related: ['electric-bike-laws-nsw-2026', 'cycling-safety-tips-sydney-roads', 'how-to-clean-your-bike-chain-sydney'],
  },
  'cycling-safety-tips-sydney-roads': {
    title: 'Cycling Safety Tips for Sydney Roads 2026 | Dr. Bike Sydney',
    description:
      'Essential cycling safety tips for Sydney riders — NSW road rules, intersection risks, the door zone, wet weather riding and night cycling guide.',
    h1: 'Cycling Safety Tips for Sydney Roads 2026',
    cat: 'safety',
    ga: 'blog_safety',
    cta: {
      title: 'Riding safely starts with a safe bike',
      text: 'Badly adjusted brakes, the wrong tyre pressure and a dry chain are all safety hazards. Our Tune-Up checks and adjusts all three, at your home, office or park.',
      label: 'ctaTuneUp',
    },
    related: ['best-bikes-for-sydney-commuting-2026', 'electric-bike-laws-nsw-2026', 'how-to-choose-a-bike-mechanic-sydney'],
  },
  'electric-bike-laws-nsw-2026': {
    title: 'Electric Bike Laws NSW 2026 — Complete Guide | Dr. Bike Sydney',
    description:
      'Complete guide to e-bike laws in NSW 2026. Legal PAPC definition, throttle rules, where you can ride, helmet requirements and fines explained.',
    h1: 'Electric Bike Laws NSW 2026 — Complete Guide',
    cat: 'legal',
    ga: 'blog_ebike',
    cta: {
      title: 'E-bike service in Sydney',
      text: 'Our E-bike Service is a Standard Service for e-bikes, plus a check of the electrical connections and every bolt. We come to you.',
      label: 'ctaEbike',
    },
    related: ['best-bikes-for-sydney-commuting-2026', 'cycling-safety-tips-sydney-roads', 'how-to-choose-a-bike-mechanic-sydney'],
  },
  'how-to-choose-a-bike-mechanic-sydney': {
    title: 'How to Choose a Bike Mechanic in Sydney | Dr. Bike Sydney',
    description:
      'What to look for when choosing a bike mechanic in Sydney — experience, mobile vs workshop, pricing transparency, reviews and what questions to ask.',
    h1: 'How to Choose a Bike Mechanic in Sydney',
    cat: 'guide',
    ga: 'blog_mechanic',
    cta: {
      title: 'Book a Dr. Bike Sydney service',
      text: 'Ten years of experience and published prices. We come to you at home, work or the park.',
      label: 'ctaNow',
    },
    related: ['how-to-clean-your-bike-chain-sydney', 'best-bikes-for-sydney-commuting-2026', 'cycling-safety-tips-sydney-roads'],
  },
  'how-to-clean-your-bike-chain-sydney': {
    title: 'How to Clean Your Bike Chain in Sydney | Dr. Bike Sydney',
    description:
      'Step-by-step guide to cleaning and lubricating your bike chain in Sydney. Wet vs dry lube, how often to clean, and when to replace your chain.',
    h1: 'How to Clean Your Bike Chain in Sydney',
    cat: 'maint',
    ga: 'blog_chain',
    cta: {
      title: "Don't have time to clean your chain?",
      text: 'Our Standard Service adds a full drivetrain clean to everything in the Tune-Up: gear and brake adjustment, tyre pressure and chain lube. We come to you.',
      label: 'ctaStandard',
    },
    related: ['how-to-choose-a-bike-mechanic-sydney', 'best-bikes-for-sydney-commuting-2026', 'cycling-safety-tips-sydney-roads'],
  },
};

// The template's own words. Service names match the app's (js/i18n-es.js,
// js/i18n-zh.js): Tune-Up is Ajuste / 基础调校, not anything else.
const UI = {
  en: {
    skip: 'Skip to content',
    home: 'Home',
    blog: 'Blog',
    book: 'Book Now',
    bookService: 'Book a Service',
    map: 'Cycling Map',
    business: 'For Business',
    langNav: 'Language',
    crumbs: 'Breadcrumb',
    footNav: 'Footer',
    role: 'Mobile bike mechanics',
    published: 'Published',
    updated: 'Updated',
    minRead: '{n} min read',
    keepReading: 'Keep reading',
    allArticles: 'All articles',
    featured: 'Featured',
    feeNote:
      'The visit & diagnosis fee depends on the driving time to you. It is charged separately from the service, and you see it before you pay.',
    areasTitle: 'We come to you across Sydney',
    areasText: 'Mobile bike repair, at your home, office or park. Pick your area:',
    areasNote: 'Same-day within about 45 minutes of our Northern Beaches base. Further out, we still come by arrangement.',
    ctaTuneUp: 'Book a Tune-Up',
    ctaEbike: 'Book an E-Bike Service',
    ctaNow: 'Book Now',
    ctaStandard: 'Book a Standard Service',
    'cat.buyers': "Buyer's Guide",
    'cat.guide': 'Guide',
    'cat.safety': 'Safety',
    'cat.legal': 'Legal',
    'cat.maint': 'Maintenance',
    indexTitle: 'Bike Care & Riding Guides for Sydney | Dr. Bike Sydney Blog',
    indexDesc:
      "Practical guides from Dr. Bike Sydney's mobile mechanics: choosing a commuter bike, NSW e-bike laws, road safety and looking after your bike.",
    indexEyebrow: 'Dr. Bike Sydney Blog',
    indexH1: 'Bike care and riding guides for Sydney',
    indexIntro:
      'Written by a mechanic with 10 years of experience. Straight answers on buying, riding and looking after your bike in Sydney.',
    indexCtaTitle: 'Bike needs a service?',
    indexCtaText: 'We come to you at home, work or the park. Every service price is on the booking page before you book.',
  },
  es: {
    skip: 'Saltar al contenido',
    home: 'Inicio',
    blog: 'Blog',
    book: 'Reservar Ahora',
    bookService: 'Reservar Servicio',
    map: 'Mapa de Ciclismo',
    business: 'Para Empresas',
    langNav: 'Idioma',
    crumbs: 'Ruta de navegación',
    footNav: 'Pie de página',
    role: 'Mecánicos de bicis a domicilio',
    published: 'Publicado',
    updated: 'Actualizado',
    minRead: '{n} min de lectura',
    keepReading: 'Seguí leyendo',
    allArticles: 'Todos los artículos',
    featured: 'Destacado',
    feeNote:
      'La visita y diagnóstico depende del tiempo de manejo hasta vos. Se cobra aparte del servicio y la ves antes de pagar.',
    areasTitle: 'Vamos a toda Sídney',
    areasText: 'Reparación de bicicletas a domicilio, en tu casa, oficina o el parque. Elegí tu zona:',
    areasNote:
      'En el día, dentro de unos 45 minutos de nuestra base en Northern Beaches. Más lejos también vamos, coordinando antes.',
    ctaTuneUp: 'Reservar un Ajuste',
    ctaEbike: 'Reservar un Servicio de E-Bike',
    ctaNow: 'Reservar Ahora',
    ctaStandard: 'Reservar un Servicio Estándar',
    'cat.buyers': 'Guía de compra',
    'cat.guide': 'Guía',
    'cat.safety': 'Seguridad',
    'cat.legal': 'Legal',
    'cat.maint': 'Mantenimiento',
    indexTitle: 'Guías de Mantenimiento y Ciclismo en Sídney | Blog de Dr. Bike Sydney',
    indexDesc:
      'Guías prácticas de los mecánicos a domicilio de Dr. Bike Sydney: cómo elegir una bici para moverte, leyes de e-bikes en NSW, seguridad en la calle y cómo cuidar tu bici.',
    indexEyebrow: 'Blog de Dr. Bike Sydney',
    indexH1: 'Guías de mantenimiento y ciclismo para Sídney',
    indexIntro:
      'Escrito por un mecánico con 10 años de experiencia. Respuestas claras sobre cómo comprar, andar y cuidar tu bici en Sídney.',
    indexCtaTitle: '¿Tu bici necesita un servicio?',
    indexCtaText:
      'Vamos a tu casa, tu trabajo o el parque. El precio de cada servicio está en la página de reservas antes de que reserves.',
  },
  zh: {
    skip: '跳至主要内容',
    home: '首页',
    blog: '博客',
    book: '立即预订',
    bookService: '预约服务',
    map: '骑行地图',
    business: '企业服务',
    langNav: '语言',
    crumbs: '导航路径',
    footNav: '页脚',
    role: '上门自行车维修',
    published: '发布于',
    updated: '更新于',
    minRead: '阅读约 {n} 分钟',
    keepReading: '继续阅读',
    allArticles: '全部文章',
    featured: '精选',
    feeNote: '上门检查费根据前往您所在地的车程而定，与服务费分开收取，付款前即可看到。',
    areasTitle: '我们服务悉尼各区',
    areasText: '上门自行车维修，可在您的家中、办公室或公园进行。请选择您所在的区域：',
    areasNote: '距离我们北部海滩基地约45分钟车程以内可当天上门。更远的地区我们也会上门，但需提前安排。',
    ctaTuneUp: '预订基础调校',
    ctaEbike: '预订电动车服务',
    ctaNow: '立即预订',
    ctaStandard: '预订标准服务',
    'cat.buyers': '购车指南',
    'cat.guide': '指南',
    'cat.safety': '安全',
    'cat.legal': '法律',
    'cat.maint': '保养',
    indexTitle: '悉尼自行车保养与骑行指南 | Dr. Bike Sydney 博客',
    indexDesc: '来自 Dr. Bike Sydney 上门技师的实用指南：如何选择通勤自行车、新州电动自行车法规、道路安全以及日常保养。',
    indexEyebrow: 'Dr. Bike Sydney 博客',
    indexH1: '悉尼自行车保养与骑行指南',
    indexIntro: '由一位拥有10年经验的技师撰写。关于在悉尼购车、骑行和保养自行车的直接解答。',
    indexCtaTitle: '您的自行车需要保养吗？',
    indexCtaText: '我们上门服务，家中、办公室或公园均可。每项服务的价格在预订前都会显示在预订页面上。',
  },
};

const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
};
// Written out by hand, not Intl: the output has to be byte-identical on every
// machine for --check, and ICU data differs between Node builds.
function fmtDate(iso, lang) {
  const [y, m, d] = iso.split('-').map(Number);
  if (lang === 'zh') return `${y}年${m}月${d}日`;
  if (lang === 'es') return `${d} de ${MONTHS.es[m - 1]} de ${y}`;
  return `${d} ${MONTHS.en[m - 1]} ${y}`;
}

// es/zh per post. Keys are the English: exact strings for the metadata (title,
// description, H1, CTA), whole HTML fragments for the article body - longest
// first, so a short key never splits a long one. A key that matches nothing is
// an error (a typo, or an English edit that left the translation behind), and
// so is a long English sentence that survives into es/ or zh/.
const DICT = {
  'how-to-choose-a-bike-mechanic-sydney': {
    es: {
      'How to Choose a Bike Mechanic in Sydney | Dr. Bike Sydney':
        'Cómo Elegir un Mecánico de Bicicletas en Sídney | Dr. Bike Sydney',
      'What to look for when choosing a bike mechanic in Sydney — experience, mobile vs workshop, pricing transparency, reviews and what questions to ask.':
        'Qué tener en cuenta al elegir un mecánico de bicicletas en Sídney: experiencia, a domicilio vs taller, transparencia de precios, reseñas y qué preguntas hacer.',
      'How to Choose a Bike Mechanic in Sydney': 'Cómo Elegir un Mecánico de Bicicletas en Sídney',
      'Finding a trustworthy bike mechanic in Sydney can be harder than it sounds. The market ranges from highly qualified mechanics with years of specialist experience to weekend hobbyists offering cut-price repairs that can leave your bike worse than before. Here\'s how to make the right choice.':
        'Encontrar un mecánico de bicicletas confiable en Sídney puede ser más difícil de lo que parece. El mercado va desde mecánicos altamente calificados con años de experiencia especializada, hasta aficionados de fin de semana que ofrecen reparaciones baratas que pueden dejar tu bici peor de lo que estaba. Así es como elegís bien.',
      '1. Check Their Experience and Specialisation': '1. Revisá su Experiencia y Especialización',
      'Bicycle mechanics don\'t require a formal licence in Australia, so the barrier to entry is low. Look for:':
        'En Australia, los mecánicos de bicicletas no necesitan una licencia formal, así que la barrera de entrada es baja. Fijate en:',
      '<strong>Years of experience</strong> — ask directly; a good mechanic will tell you proudly':
        '<strong>Años de experiencia</strong>: preguntá directamente; un buen mecánico te lo va a contar con orgullo',
      '<strong>Brand specialisation</strong> — e-bikes (especially Bosch Smart System), race bikes, and cargo bikes all require specific knowledge':
        '<strong>Especialización por marca</strong>: las e-bikes (sobre todo con Bosch Smart System), las bicis de carrera y las de carga requieren conocimientos específicos',
      '<strong>Trail background</strong> — mechanics who ride regularly understand problems cyclists actually face':
        '<strong>Experiencia sobre el terreno</strong>: los mecánicos que andan en bici seguido entienden mejor los problemas reales de los ciclistas',
      '💡 At Dr. Bike Sydney, our lead mechanic has 10 years of experience, including a year and a half as lead mechanic at Trails HQ on Hamilton Island: setting up and maintaining its rental fleet of Cannondale e-mountain bikes with Bosch motors. Every service is performed by an experienced mechanic — not a junior trainee.':
        '💡 En Dr. Bike Sydney, nuestro mecánico principal tiene 10 años de experiencia, incluido un año y medio como mecánico principal de Trails HQ en Hamilton Island: armó y mantuvo su flota de alquiler de e-MTB Cannondale con motor Bosch. Cada servicio lo hace un mecánico experimentado, no un aprendiz.',
      '2. Mobile vs. Workshop — Which is Better?': '2. A Domicilio vs. Taller: ¿Cuál Conviene Más?',
      'Sydney\'s traditional workshop model requires you to transport your bike, wait days for an appointment slot, and collect it again. A quality mobile mechanic brings a fully equipped mobile workshop directly to you, often available same-day.':
        'El modelo tradicional de taller en Sídney te obliga a trasladar la bici, esperar días por un turno y después ir a buscarla de nuevo. Un buen mecánico a domicilio lleva un taller móvil totalmente equipado directo hasta vos, muchas veces disponible el mismo día.',
      'Mobile mechanic advantages': 'Ventajas del mecánico a domicilio',
      'No transport needed · Same-day availability · You watch the work being done · Your bike doesn\'t sit in a queue for days':
        'No hace falta trasladar la bici · Disponibilidad el mismo día · Podés ver cómo trabajan · Tu bici no queda en cola durante días',
      'Workshop advantages': 'Ventajas del taller',
      'Better for frame repairs and specialist builds · More suitable for rare vintage components · May have more specialist equipment for unusual jobs':
        'Mejor para reparaciones de cuadro y armados especializados · Más adecuado para repuestos vintage poco comunes · Puede tener equipamiento más especializado para trabajos inusuales',
      'For the vast majority of Sydney riders — commuters, casual riders, enthusiasts — a mobile mechanic is faster, more convenient and equally capable.':
        'Para la gran mayoría de los ciclistas de Sídney (los que van al trabajo, los ocasionales, los entusiastas) un mecánico a domicilio es más rápido, más cómodo e igual de capaz.',
      '3. What to Ask Before Booking': '3. Qué Preguntar Antes de Reservar',
      'What brands do you service? Can you work on my [brand]?':
        '¿Qué marcas atendés? ¿Podés trabajar con mi [marca]?',
      'What does your [tune-up / standard service] include?': '¿Qué incluye tu [ajuste / servicio estándar]?',
      'Do you carry common parts with you, or do I need to wait for parts orders?':
        '¿Llevás repuestos comunes con vos, o tengo que esperar a que los pidas?',
      'Do you provide a written service report?': '¿Entregás un informe escrito del servicio?',
      '4. Transparent Pricing — Red and Green Flags': '4. Precios Transparentes: Señales Buenas y Malas',
      'Reputable mechanics price clearly upfront. Be cautious of mechanics who:':
        'Los mecánicos serios ponen el precio claro desde el principio. Desconfiá de los que:',
      'Refuse to give a price estimate before seeing the bike':
        'Se niegan a dar un presupuesto antes de ver la bici',
      'Add significant charges not mentioned in the booking':
        'Agregan cargos importantes que no se mencionaron en la reserva',
      'Quote unusually low prices that don\'t reflect the work involved':
        'Cotizan precios inusualmente bajos que no reflejan el trabajo real',
      'Can\'t tell you which parts they\'ve replaced after a service':
        'No pueden decirte qué repuestos cambiaron después del servicio',
      'At Dr. Bike Sydney, every service price is published on our booking page before you book. No hidden fees: the visit and diagnosis fee depends on the driving time to you, is charged separately from the service, and you see it before you pay.':
        'En Dr. Bike Sydney, el precio de cada servicio está publicado en nuestra página de reservas antes de que reserves. Sin cargos ocultos: la visita y diagnóstico depende del tiempo de manejo hasta vos, se cobra aparte del servicio y la ves antes de pagar.',
      '5. Read Reviews Critically': '5. Leé las Reseñas con Ojo Crítico',
      'Google Reviews are the most reliable source in Sydney. Look for:':
        'Las reseñas de Google son la fuente más confiable en Sídney. Fijate en:',
      'Reviews that mention specific repairs (not just "great service!")':
        'Reseñas que mencionan reparaciones específicas (no solo "¡buen servicio!")',
      'How the mechanic responds to negative reviews': 'Cómo responde el mecánico a las reseñas negativas',
      'Reviews mentioning punctuality and communication':
        'Reseñas que mencionan la puntualidad y la comunicación',
      'Verified reviews rather than a sudden burst of 5-star reviews':
        'Reseñas verificadas, en vez de una lluvia repentina de reseñas de 5 estrellas',
      'Book a Dr. Bike Sydney service': 'Reservá un servicio con Dr. Bike Sydney',
      'Ten years of experience and published prices. We come to you at home, work or the park.':
        'Diez años de experiencia y precios publicados. Vamos hasta tu casa, tu trabajo o el parque.',
    },
    zh: {
      'How to Choose a Bike Mechanic in Sydney | Dr. Bike Sydney': '如何在悉尼选择自行车技师 | Dr. Bike Sydney',
      'What to look for when choosing a bike mechanic in Sydney — experience, mobile vs workshop, pricing transparency, reviews and what questions to ask.':
        '在悉尼选择自行车技师时该注意什么——经验、上门服务与实体店对比、价格透明度、评价，以及该问哪些问题。',
      'How to Choose a Bike Mechanic in Sydney': '如何在悉尼选择自行车技师',
      'Finding a trustworthy bike mechanic in Sydney can be harder than it sounds. The market ranges from highly qualified mechanics with years of specialist experience to weekend hobbyists offering cut-price repairs that can leave your bike worse than before. Here\'s how to make the right choice.':
        '在悉尼找到一位值得信赖的自行车技师，可能比听起来更难。市场上既有经验丰富、技术精湛的专业技师，也有周末业余爱好者提供的廉价维修，后者可能让您的自行车状况更糟。以下是如何做出正确选择。',
      '1. Check Their Experience and Specialisation': '1. 检查经验与专长',
      'Bicycle mechanics don\'t require a formal licence in Australia, so the barrier to entry is low. Look for:':
        '在澳大利亚，自行车技师不需要正式执照，因此入行门槛很低。请留意以下几点：',
      '<strong>Years of experience</strong> — ask directly; a good mechanic will tell you proudly':
        '<strong>从业年限</strong>——直接询问即可，优秀的技师会很自豪地告诉您',
      '<strong>Brand specialisation</strong> — e-bikes (especially Bosch Smart System), race bikes, and cargo bikes all require specific knowledge':
        '<strong>品牌专长</strong>——电动自行车（尤其是搭载 Bosch Smart System 的车型）、公路赛车和货运自行车都需要专门的知识',
      '<strong>Trail background</strong> — mechanics who ride regularly understand problems cyclists actually face':
        '<strong>骑行背景</strong>——经常骑车的技师更了解骑行者真正会遇到的问题',
      '💡 At Dr. Bike Sydney, our lead mechanic has 10 years of experience, including a year and a half as lead mechanic at Trails HQ on Hamilton Island: setting up and maintaining its rental fleet of Cannondale e-mountain bikes with Bosch motors. Every service is performed by an experienced mechanic — not a junior trainee.':
        '💡 在 Dr. Bike Sydney，我们的主理技师拥有 10 年经验，其中一年半在汉密尔顿岛的 Trails HQ 担任首席技师：组建并维护其 Cannondale 电动山地车租赁车队（Bosch 电机）。每一次服务都由经验丰富的技师亲自完成，绝非新手学徒。',
      '2. Mobile vs. Workshop — Which is Better?': '2. 上门服务 vs. 实体店——哪个更好？',
      'Sydney\'s traditional workshop model requires you to transport your bike, wait days for an appointment slot, and collect it again. A quality mobile mechanic brings a fully equipped mobile workshop directly to you, often available same-day.':
        '悉尼传统的实体店模式需要您自己运送自行车、等待数天预约，再取车。而优质的上门技师会直接带着设备齐全的移动维修车间来找您，通常当天即可安排。',
      'Mobile mechanic advantages': '上门技师的优势',
      'No transport needed · Same-day availability · You watch the work being done · Your bike doesn\'t sit in a queue for days':
        '无需运送自行车 · 当天可预约 · 您可以全程查看维修过程 · 自行车不用排队等候数日',
      'Workshop advantages': '实体店的优势',
      'Better for frame repairs and specialist builds · More suitable for rare vintage components · May have more specialist equipment for unusual jobs':
        '更适合车架维修和特殊定制组装 · 更适合处理稀有的复古零件 · 可能拥有更专业的设备来处理特殊工作',
      'For the vast majority of Sydney riders — commuters, casual riders, enthusiasts — a mobile mechanic is faster, more convenient and equally capable.':
        '对于绝大多数悉尼骑行者——通勤者、休闲骑行爱好者、发烧友来说，上门技师更快、更方便，能力也丝毫不逊色。',
      '3. What to Ask Before Booking': '3. 预订前该问哪些问题',
      'What brands do you service? Can you work on my [brand]?': '您服务哪些品牌？能维修我的[品牌]吗？',
      'What does your [tune-up / standard service] include?': '您的[基础调校/标准服务]包含哪些内容？',
      'Do you carry common parts with you, or do I need to wait for parts orders?': '您是否随身携带常用零件，还是我需要等待订购？',
      'Do you provide a written service report?': '您是否提供书面服务报告？',
      '4. Transparent Pricing — Red and Green Flags': '4. 价格透明——好信号与坏信号',
      'Reputable mechanics price clearly upfront. Be cautious of mechanics who:':
        '口碑良好的技师会提前明确报价。请对以下情况保持警惕：',
      'Refuse to give a price estimate before seeing the bike': '在查看自行车之前拒绝提供报价',
      'Add significant charges not mentioned in the booking': '在预订时未提及，事后却增加大额费用',
      'Quote unusually low prices that don\'t reflect the work involved': '报价异常低廉，与实际工作量不符',
      'Can\'t tell you which parts they\'ve replaced after a service': '服务结束后说不清楚更换了哪些零件',
      'At Dr. Bike Sydney, every service price is published on our booking page before you book. No hidden fees: the visit and diagnosis fee depends on the driving time to you, is charged separately from the service, and you see it before you pay.':
        '在 Dr. Bike Sydney，每项服务的价格都在预订页面上公开，预订前即可查看。无隐藏费用：上门检查费根据前往您所在地的车程而定，与服务费分开收取，付款前即可看到。',
      '5. Read Reviews Critically': '5. 批判性地看待评价',
      'Google Reviews are the most reliable source in Sydney. Look for:': '在悉尼，Google 评价是最可靠的信息来源。请留意：',
      'Reviews that mention specific repairs (not just "great service!")': '提到具体维修内容的评价（而不只是"服务很好！"）',
      'How the mechanic responds to negative reviews': '技师如何回应负面评价',
      'Reviews mentioning punctuality and communication': '提到准时性和沟通情况的评价',
      'Verified reviews rather than a sudden burst of 5-star reviews': '已验证的评价，而不是突然涌现的大量五星好评',
      'Book a Dr. Bike Sydney service': '预订 Dr. Bike Sydney 服务',
      'Ten years of experience and published prices. We come to you at home, work or the park.':
        '十年经验，价格公开。我们上门服务，家中、办公室或公园均可。',
    },
  },
  'best-bikes-for-sydney-commuting-2026': {
    es: {
      'Best Bikes for Sydney Commuting 2026': 'Las Mejores Bicis para Moverte por Sídney en 2026',
      'Best Bikes for Sydney Commuting 2026 | Dr. Bike Sydney':
        'Las Mejores Bicis para Moverte por Sídney en 2026 | Dr. Bike Sydney',
      'The best bikes for commuting in Sydney in 2026 — hybrid, e-bike, gravel and folding options reviewed for inner-city riders.':
        'Las mejores bicis para moverte por Sídney en 2026: opciones híbridas, eléctricas, gravel y plegables, evaluadas para ciclistas urbanos.',
      'Sydney\'s cycling infrastructure has expanded significantly in recent years, with protected lanes on Crown Street, College Street and Anzac Parade making inner-city commuting more viable than ever. But choosing the right commuter bike for Sydney\'s unique mix of flat stretches, hilly suburbs and occasionally wet roads matters more than many riders think.':
        'La infraestructura ciclista de Sídney creció mucho en los últimos años, con carriles protegidos en Crown Street, College Street y Anzac Parade que hacen que moverse por el centro en bici sea más viable que nunca. Pero elegir la bici correcta para la mezcla particular de Sídney (tramos planos, suburbios con subidas y calles a veces mojadas) importa más de lo que muchos ciclistas piensan.',
      'Here\'s our 2026 guide, written by a mechanic with 10 years of experience who services Sydney commuters\' bikes.':
        'Esta es nuestra guía 2026, escrita por un mecánico con 10 años de experiencia que atiende las bicis de quienes se mueven por Sídney.',
      '1. Hybrid Bikes — Best All-Rounder': '1. Bicis Híbridas: la Más Versátil',
      'Hybrid bikes are the go-to for most Sydney commuters. They combine the efficiency of a road bike with the upright position and tyre clearance of a mountain bike. For commutes under 15km in areas like Surry Hills, Newtown and Glebe, a quality hybrid is hard to beat.':
        'Las bicis híbridas son la primera opción para la mayoría de los ciclistas urbanos de Sídney. Combinan la eficiencia de una bici de ruta con la posición erguida y el espacio para cubiertas de una mountain bike. Para trayectos de menos de 15 km en zonas como Surry Hills, Newtown o Glebe, una híbrida de calidad es difícil de superar.',
      '<strong>Trek FX 3 Disc</strong> — ~$1,199 · hydraulic disc brakes, carbon fork, excellent in wet weather':
        '<strong>Trek FX 3 Disc</strong> — ~$1.199 · frenos de disco hidráulicos, horquilla de carbono, excelente en tiempo lluvioso',
      '<strong>Giant Escape 1</strong> — ~$899 · lightweight aluminium, integrated rack mounts':
        '<strong>Giant Escape 1</strong> — ~$899 · aluminio liviano, soportes de portaequipaje integrados',
      '<strong>Cannondale Quick 4</strong> — ~$949 · fast-rolling tyres, good component spec for the price':
        '<strong>Cannondale Quick 4</strong> — ~$949 · cubiertas de rodadura rápida, buenos componentes para el precio',
      '💡 <strong>Dr. Bike Tip:</strong> Hybrid tyres at 60–70 PSI will roll faster and puncture less on Sydney\'s sealed roads. We\'ll set this up correctly at your first service.':
        '💡 <strong>Tip de Dr. Bike:</strong> en las calles asfaltadas de Sídney, las cubiertas híbridas a 60-70 PSI ruedan más rápido y se pinchan menos. Te lo dejamos bien configurado en tu primer service.',
      '2. E-Bikes — Best for Hills and Long Commutes':
        '2. E-Bikes: las Mejores para Subidas y Trayectos Largos',
      'If your commute involves Crows Nest, Balmain or any of Sydney\'s notorious hills — or if you arrive at work in a suit — an e-bike is worth the investment. The e-bike market has matured significantly in 2025–2026 with more affordable, lightweight options available.':
        'Si tu trayecto pasa por Crows Nest, Balmain o cualquiera de las subidas más conocidas de Sídney, o si llegás al trabajo de traje, una e-bike vale la inversión. El mercado de e-bikes maduró mucho entre 2025 y 2026, con más opciones livianas y accesibles disponibles.',
      '<strong>Specialized Turbo Vado SL 4.0</strong> — ~$3,999 · light for an e-bike, natural-feeling assist, long range':
        '<strong>Specialized Turbo Vado SL 4.0</strong> — ~$3.999 · liviana para ser e-bike, asistencia de sensación natural, gran autonomía',
      '<strong>Giant Explore E+ 2</strong> — ~$2,999 · Yamaha motor, integrated battery, rack included':
        '<strong>Giant Explore E+ 2</strong> — ~$2.999 · motor Yamaha, batería integrada, incluye portaequipaje',
      '<strong>Aventon Pace 500.3</strong> — ~$1,899 · budget-friendly, practical for flat routes; in NSW the throttle must cut out at 6 km/h':
        '<strong>Aventon Pace 500.3</strong> — ~$1.899 · económica, práctica para recorridos planos; en NSW el acelerador tiene que cortarse a los 6 km/h',
      'Note: in NSW today a legal e-bike can have up to 500W, and the motor must stop assisting at 25 km/h. From 1 March 2029 only EN 15194-certified e-bikes (250W) will be road legal, so check before you buy. See our <a href="/blog/electric-bike-laws-nsw-2026">NSW e-bike laws guide</a> for full details.':
        'Nota: hoy en NSW una e-bike legal puede tener hasta 500W, y el motor tiene que dejar de asistir a los 25 km/h. Desde el 1 de marzo de 2029 solo las e-bikes certificadas EN 15194 (250W) van a poder circular, así que revisalo antes de comprar. Mirá nuestra <a href="/blog/electric-bike-laws-nsw-2026">guía de leyes de e-bikes en NSW</a> para todos los detalles.',
      '3. Gravel Bikes — Best for Variety': '3. Bicis Gravel: las Más Versátiles',
      'If your commute mixes sealed bike paths, gravel trails and the occasional rough section (common around the Cooks River or Northern Beaches), a gravel bike offers flexibility. They\'re fast on road and capable off it.':
        'Si tu trayecto combina sendas asfaltadas, caminos de gravel y algún tramo irregular (algo común cerca del Cooks River o en Northern Beaches), una bici gravel te da flexibilidad. Son rápidas en el asfalto y capaces fuera de él.',
      '<strong>Trek Checkpoint ALR 5</strong> — ~$2,299 · versatile, great tyre clearance, commuter-ready':
        '<strong>Trek Checkpoint ALR 5</strong> — ~$2.299 · versátil, gran espacio para cubiertas, lista para el día a día',
      '<strong>Giant Revolt 2</strong> — ~$1,499 · affordable entry into gravel, great value':
        '<strong>Giant Revolt 2</strong> — ~$1.499 · entrada accesible al mundo gravel, muy buena relación precio-calidad',
      '4. Folding Bikes — Best for Multi-Modal Commutes':
        '4. Bicis Plegables: las Mejores para Combinar con Otros Medios',
      'If you\'re combining cycling with the train to Central or Town Hall, a folding bike is a practical option. Bikes travel free on Sydney Trains when there\'s room, and a folded bike takes the least space in a busy carriage.':
        'Si combinás la bici con el tren hasta Central o Town Hall, una bici plegable es una opción práctica. Las bicis viajan gratis en Sydney Trains cuando hay lugar, y una plegada es la que menos espacio ocupa en un vagón lleno.',
      '<strong>Brompton C Line Explore</strong> — ~$2,499 · the gold standard, folds in 20 seconds, carries on any train':
        '<strong>Brompton C Line Explore</strong> — ~$2.499 · el estándar de oro, se pliega en 20 segundos, entra en cualquier tren',
      '<strong>Dahon Mariner D8</strong> — ~$699 · budget option, heavier but functional':
        '<strong>Dahon Mariner D8</strong> — ~$699 · opción económica, más pesada pero funcional',
      '💡 <strong>Pro tip:</strong> Folding bikes need regular cable tension checks as the folding joints flex the cables over time. Book a tune-up every 6 months.':
        '💡 <strong>Tip profesional:</strong> las bicis plegables necesitan revisión periódica de la tensión de los cables, porque las bisagras de plegado los van aflojando con el tiempo. Reservá un ajuste cada 6 meses.',
      'What to Look For in a Sydney Commuter Bike': 'Qué Buscar en una Bici para Moverte por Sídney',
      '<strong>Mudguards or clearance for them</strong> — Sydney gets sudden storms, especially May–September':
        '<strong>Guardabarros, o espacio para instalarlos</strong>: en Sídney caen tormentas repentinas, sobre todo entre mayo y septiembre',
      '<strong>Rack mounts</strong> — carrying a backpack in heat adds to sweat; a rear rack and pannier is better':
        '<strong>Soportes de portaequipaje</strong>: llevar mochila con calor suma transpiración; un portaequipaje trasero con alforja es mejor',
      '<strong>Disc brakes</strong> — consistently better in wet conditions on Sydney\'s rain-slicked roads':
        '<strong>Frenos de disco</strong>: funcionan mejor y de forma más constante en las calles mojadas de Sídney',
      '<strong>Quality lights</strong> — legally required and practical in Sydney\'s winter when it\'s dark by 5:30pm':
        '<strong>Luces de calidad</strong>: son obligatorias por ley y prácticas en el invierno de Sídney, cuando oscurece a las 17:30',
      '<strong>Lock compatibility</strong> — budget $100+ for a quality D-lock; bike theft is common in the CBD':
        '<strong>Compatibilidad con candado</strong>: presupuestá $100 o más para un buen candado en U; el robo de bicis es común en el CBD',
      'Got a new commuter bike?': '¿Tenés una bici nueva para moverte?',
      'A Tune-Up before you start commuting gets the basics right: safety check, gear and brake adjustment, tyre pressure and drivetrain lube. We come to you.':
        'Un Ajuste antes de empezar a usarla deja lo básico en orden: chequeo de seguridad, ajuste de cambios y frenos, presión de cubiertas y lubricación de la transmisión. Vamos hasta vos.',
      'Bike prices are approximate Australian RRP at the time of writing and change often. Dr. Bike Sydney does not sell these bikes.':
        'Los precios de las bicis son precios de lista aproximados en Australia al momento de escribir esto y cambian seguido. Dr. Bike Sydney no vende estas bicis.',
    },
    zh: {
      'Best Bikes for Sydney Commuting 2026': '2026年悉尼通勤自行车推荐',
      'Best Bikes for Sydney Commuting 2026 | Dr. Bike Sydney': '2026年悉尼通勤自行车推荐 | Dr. Bike Sydney',
      'The best bikes for commuting in Sydney in 2026 — hybrid, e-bike, gravel and folding options reviewed for inner-city riders.':
        '2026年悉尼通勤自行车推荐——为市区骑行者评测的混合车、电动车、砾石车和折叠车。',
      'Sydney\'s cycling infrastructure has expanded significantly in recent years, with protected lanes on Crown Street, College Street and Anzac Parade making inner-city commuting more viable than ever. But choosing the right commuter bike for Sydney\'s unique mix of flat stretches, hilly suburbs and occasionally wet roads matters more than many riders think.':
        '近年来悉尼的骑行基础设施大幅扩展，Crown Street、College Street 和 Anzac Parade 上的受保护车道让市区通勤骑行比以往任何时候都更可行。但为悉尼这种平路、丘陵郊区和偶尔湿滑路面并存的独特路况选对通勤自行车，比许多骑行者想象的更重要。',
      'Here\'s our 2026 guide, written by a mechanic with 10 years of experience who services Sydney commuters\' bikes.':
        '以下是我们的2026年指南，由一位拥有10年经验、为悉尼通勤者维修自行车的技师撰写。',
      '1. Hybrid Bikes — Best All-Rounder': '1. 混合动力车——最全能之选',
      'Hybrid bikes are the go-to for most Sydney commuters. They combine the efficiency of a road bike with the upright position and tyre clearance of a mountain bike. For commutes under 15km in areas like Surry Hills, Newtown and Glebe, a quality hybrid is hard to beat.':
        '混合动力车是大多数悉尼通勤者的首选。它兼具公路车的高效与山地车的直立骑姿和轮胎间隙。对于 Surry Hills、Newtown、Glebe 等地 15 公里以内的通勤路程，一辆优质的混合动力车很难被超越。',
      '<strong>Trek FX 3 Disc</strong> — ~$1,199 · hydraulic disc brakes, carbon fork, excellent in wet weather':
        '<strong>Trek FX 3 Disc</strong> — 约 $1,199 · 液压碟刹，碳纤维前叉，雨天表现出色',
      '<strong>Giant Escape 1</strong> — ~$899 · lightweight aluminium, integrated rack mounts':
        '<strong>Giant Escape 1</strong> — 约 $899 · 轻量铝合金车架，内置货架安装孔',
      '<strong>Cannondale Quick 4</strong> — ~$949 · fast-rolling tyres, good component spec for the price':
        '<strong>Cannondale Quick 4</strong> — 约 $949 · 快速滚动轮胎，同价位配置出色',
      '💡 <strong>Dr. Bike Tip:</strong> Hybrid tyres at 60–70 PSI will roll faster and puncture less on Sydney\'s sealed roads. We\'ll set this up correctly at your first service.':
        '💡 <strong>Dr. Bike 小贴士：</strong>在悉尼的铺装路面上，混合动力车轮胎打气至 60–70 PSI 滚动更快、更不易爆胎。我们会在您第一次保养时为您正确设置好胎压。',
      '2. E-Bikes — Best for Hills and Long Commutes': '2. 电动自行车——最适合坡道和长途通勤',
      'If your commute involves Crows Nest, Balmain or any of Sydney\'s notorious hills — or if you arrive at work in a suit — an e-bike is worth the investment. The e-bike market has matured significantly in 2025–2026 with more affordable, lightweight options available.':
        '如果您的通勤路线经过 Crows Nest、Balmain 或悉尼其他知名坡道，或者您需要穿西装上班，那么电动自行车绝对物有所值。2025 至 2026 年间电动自行车市场日趋成熟，出现了更多价格亲民、更轻便的选择。',
      '<strong>Specialized Turbo Vado SL 4.0</strong> — ~$3,999 · light for an e-bike, natural-feeling assist, long range':
        '<strong>Specialized Turbo Vado SL 4.0</strong> — 约 $3,999 · 作为电动车相当轻巧，助力感觉自然，续航长',
      '<strong>Giant Explore E+ 2</strong> — ~$2,999 · Yamaha motor, integrated battery, rack included':
        '<strong>Giant Explore E+ 2</strong> — 约 $2,999 · 雅马哈电机，内置电池，含货架',
      '<strong>Aventon Pace 500.3</strong> — ~$1,899 · budget-friendly, practical for flat routes; in NSW the throttle must cut out at 6 km/h':
        '<strong>Aventon Pace 500.3</strong> — 约 $1,899 · 价格亲民，适合平坦路线；在新州，油门必须在时速6公里时切断',
      'Note: in NSW today a legal e-bike can have up to 500W, and the motor must stop assisting at 25 km/h. From 1 March 2029 only EN 15194-certified e-bikes (250W) will be road legal, so check before you buy. See our <a href="/blog/electric-bike-laws-nsw-2026">NSW e-bike laws guide</a> for full details.':
        '注意：目前在新州，合法电动自行车的功率最高可达 500W，电机必须在时速25公里时停止助力。自2029年3月1日起，只有通过 EN 15194 认证的电动自行车（250W）才能合法上路，购买前请务必确认。完整细节请参见我们的<a href="/blog/electric-bike-laws-nsw-2026">新州电动自行车法规指南</a>。',
      '3. Gravel Bikes — Best for Variety': '3. 砾石车——最具多功能性',
      'If your commute mixes sealed bike paths, gravel trails and the occasional rough section (common around the Cooks River or Northern Beaches), a gravel bike offers flexibility. They\'re fast on road and capable off it.':
        '如果您的通勤路线混合了铺装自行车道、砾石小径以及偶尔的崎岖路段（在 Cooks River 附近或 Northern Beaches 一带很常见），砾石车能提供更大的灵活性。它们在公路上速度快，在非铺装路面上也应付自如。',
      '<strong>Trek Checkpoint ALR 5</strong> — ~$2,299 · versatile, great tyre clearance, commuter-ready':
        '<strong>Trek Checkpoint ALR 5</strong> — 约 $2,299 · 多功能，轮胎间隙充足，适合日常通勤',
      '<strong>Giant Revolt 2</strong> — ~$1,499 · affordable entry into gravel, great value':
        '<strong>Giant Revolt 2</strong> — 约 $1,499 · 入门砾石车的实惠之选，性价比高',
      '4. Folding Bikes — Best for Multi-Modal Commutes': '4. 折叠车——最适合多种交通方式组合通勤',
      'If you\'re combining cycling with the train to Central or Town Hall, a folding bike is a practical option. Bikes travel free on Sydney Trains when there\'s room, and a folded bike takes the least space in a busy carriage.':
        '如果您需要骑行搭配火车前往 Central 或 Town Hall，折叠车是个实用的选择。在有空间的情况下，自行车可免费搭乘 Sydney Trains，而折叠后的自行车在拥挤的车厢里占用空间最少。',
      '<strong>Brompton C Line Explore</strong> — ~$2,499 · the gold standard, folds in 20 seconds, carries on any train':
        '<strong>Brompton C Line Explore</strong> — 约 $2,499 · 黄金标准之选，20秒即可折叠，可携带上任何火车',
      '<strong>Dahon Mariner D8</strong> — ~$699 · budget option, heavier but functional':
        '<strong>Dahon Mariner D8</strong> — 约 $699 · 经济之选，较重但实用',
      '💡 <strong>Pro tip:</strong> Folding bikes need regular cable tension checks as the folding joints flex the cables over time. Book a tune-up every 6 months.':
        '💡 <strong>专业提示：</strong>折叠车需要定期检查线缆张力，因为折叠关节会随着时间推移使线缆松弛。建议每6个月预约一次基础调校。',
      'What to Look For in a Sydney Commuter Bike': '选购悉尼通勤自行车时该关注什么',
      '<strong>Mudguards or clearance for them</strong> — Sydney gets sudden storms, especially May–September':
        '<strong>挡泥板或安装挡泥板的空间</strong>——悉尼常有突发暴雨，尤其是5月至9月',
      '<strong>Rack mounts</strong> — carrying a backpack in heat adds to sweat; a rear rack and pannier is better':
        '<strong>货架安装孔</strong>——炎热天气背双肩包会增加出汗；后货架配驮包是更好的选择',
      '<strong>Disc brakes</strong> — consistently better in wet conditions on Sydney\'s rain-slicked roads':
        '<strong>碟刹</strong>——在悉尼雨后湿滑的路面上表现更加稳定可靠',
      '<strong>Quality lights</strong> — legally required and practical in Sydney\'s winter when it\'s dark by 5:30pm':
        '<strong>优质车灯</strong>——法律要求配备，在悉尼冬季下午5点半就天黑的情况下也很实用',
      '<strong>Lock compatibility</strong> — budget $100+ for a quality D-lock; bike theft is common in the CBD':
        '<strong>配锁需求</strong>——请预留 $100 以上购买优质 U 型锁；CBD 地区自行车失窃现象较为常见',
      'Got a new commuter bike?': '刚买了新的通勤自行车？',
      'A Tune-Up before you start commuting gets the basics right: safety check, gear and brake adjustment, tyre pressure and drivetrain lube. We come to you.':
        '开始通勤前做一次基础调校，把基本项目调整到位：安全检查、变速和刹车调整、胎压以及传动系统润滑。我们上门服务。',
      'Bike prices are approximate Australian RRP at the time of writing and change often. Dr. Bike Sydney does not sell these bikes.':
        '自行车价格为撰写本文时澳大利亚的大致建议零售价，经常变动。Dr. Bike Sydney 不销售这些自行车。',
    },
  },
  'cycling-safety-tips-sydney-roads': {
    es: {
      'Cycling Safety Tips for Sydney Roads 2026 | Dr. Bike Sydney':
        'Consejos de Seguridad para Andar en Bici en las Calles de Sídney 2026 | Dr. Bike Sydney',
      'Essential cycling safety tips for Sydney riders — NSW road rules, intersection risks, the door zone, wet weather riding and night cycling guide.':
        'Consejos esenciales de seguridad para ciclistas de Sídney: reglas de tránsito de NSW, riesgos en intersecciones, la zona de las puertas, andar con lluvia y guía para andar de noche.',
      'Cycling Safety Tips for Sydney Roads 2026':
        'Consejos de Seguridad para Andar en Bici en las Calles de Sídney 2026',
      'Sydney has made enormous strides in cycling infrastructure over the past five years, with protected lanes on College Street, Pitt Street Mall surrounds, Bourke Street in Surry Hills, and new routes on the lower North Shore. But riding in a major city still requires situational awareness and knowledge of the local rules.':
        'Sídney avanzó muchísimo en infraestructura ciclista en los últimos cinco años, con carriles protegidos en College Street, los alrededores de Pitt Street Mall, Bourke Street en Surry Hills y nuevas rutas en el North Shore bajo. Pero andar en bici en una ciudad grande igual requiere estar atento al entorno y conocer las reglas locales.',
      'Here are the most important cycling safety tips for Sydney roads — written by a mechanic who rides and services bikes across Sydney.':
        'Estos son los consejos de seguridad más importantes para andar en bici por las calles de Sídney, escritos por un mecánico que anda en bici y arregla bicis en toda Sídney.',
      '1. Understand NSW Road Rules for Cyclists': '1. Conocé las Reglas de Tránsito de NSW para Ciclistas',
      'Many cyclists unknowingly break the law — not out of recklessness, but because the rules are poorly communicated. Key NSW rules:':
        'Muchos ciclistas infringen la ley sin saberlo, no por imprudencia, sino porque las reglas están mal comunicadas. Las reglas clave de NSW son:',
      'You must ride as far left as practicable (not as far left as possible — you can take the lane when safe)':
        'Tenés que andar lo más a la izquierda que sea practicable (no lo más a la izquierda posible: podés ocupar el carril cuando sea seguro)',
      'You can ride two abreast (side-by-side), but not more than 1.5m apart':
        'Podés andar de a dos en paralelo, pero sin superar 1,5 m de distancia entre ustedes',
      'You must use a bike lane if one is available (with some exceptions)':
        'Tenés que usar el carril bici si hay uno disponible (con algunas excepciones)',
      'Helmets are compulsory for all riders of all ages — fines start at $423':
        'El casco es obligatorio para todos los ciclistas, de cualquier edad: la multa arranca en $423',
      'Lights are compulsory at night — white front, red rear':
        'Las luces son obligatorias de noche: blanca adelante, roja atrás',
      'You can only use a phone in a holder fixed to the bike, and only for calls, audio or navigation':
        'Solo podés usar el celular en un soporte fijo a la bici, y solo para llamadas, audio o navegación',
      '2. The 1-Metre Rule (Passing Distance)': '2. La Regla del Metro (Distancia de Sobrepaso)',
      'Since 2016, NSW drivers must give cyclists at least 1 metre when overtaking in a 60km/h or below zone, and 1.5 metres in zones above 60km/h. Knowing this helps you understand when a pass was legal and gives you grounds to report dangerous driving (dashcam footage is useful).':
        'Desde 2016, los conductores de NSW tienen que dejar al menos 1 metro al sobrepasar a un ciclista en zonas de 60 km/h o menos, y 1,5 metros en zonas de más de 60 km/h. Saber esto te ayuda a entender cuándo un sobrepaso fue legal y te da argumentos para denunciar una maniobra peligrosa (una cámara de a bordo sirve de mucho).',
      '💡 A bike camera such as Cycliq\'s Fly6 (rear) or Fly12 (front) is one of the best investments a Sydney cyclist can make. Footage can back up a report to police.':
        '💡 Una cámara para bici, como la Cycliq Fly6 (trasera) o la Fly12 (delantera), es una de las mejores inversiones que puede hacer un ciclista en Sídney. Las grabaciones pueden respaldar una denuncia policial.',
      '3. High-Risk Intersections to Know': '3. Intersecciones de Alto Riesgo que Conviene Conocer',
      'These Sydney spots combine tram tracks, heavy traffic or parked cars, and need extra care:':
        'Estos puntos de Sídney combinan vías de tranvía, mucho tráfico o autos estacionados, y requieren atención extra:',
      '<strong>George Street / Market Street CBD</strong> — tram tracks, heavy traffic, confusing signals':
        '<strong>George Street / Market Street, CBD</strong>: vías de tranvía, mucho tráfico, señales confusas',
      '<strong>Pyrmont Bridge Road at Darling Harbour</strong> — mixed pedestrian/vehicle conflict':
        '<strong>Pyrmont Bridge Road en Darling Harbour</strong>: conflicto entre peatones y vehículos',
      '<strong>Military Road, Neutral Bay</strong> — narrow lanes, aggressive traffic, bus zones':
        '<strong>Military Road, Neutral Bay</strong>: carriles angostos, tráfico agresivo, zonas de colectivo',
      '<strong>Parramatta Road, Camperdown</strong> — high-speed vehicles, no bike lane in sections':
        '<strong>Parramatta Road, Camperdown</strong>: vehículos a alta velocidad, sin carril bici en algunos tramos',
      '<strong>Elizabeth Street, CBD</strong> — door zone risk, high taxi and rideshare activity':
        '<strong>Elizabeth Street, CBD</strong>: riesgo de zona de puertas, mucha actividad de taxis y apps de transporte',
      '4. The Door Zone — Sydney\'s Biggest Hazard': '4. La Zona de las Puertas: el Mayor Peligro de Sídney',
      'Getting "doored" — when a car door is opened into a cyclist\'s path — is a common cause of serious injury for city cyclists. The danger zone is approximately 1 metre from parked car doors.':
        'Que te "abran la puerta" (cuando alguien abre la puerta de un auto justo en el camino de un ciclista) es una causa frecuente de lesiones graves para quienes andan en bici en la ciudad. La zona de peligro es de aproximadamente 1 metro desde las puertas de los autos estacionados.',
      'The safest technique is to ride outside this zone and watch for cars with occupants, movement inside cars, brake lights, and hazard lights. Slow down near stationary rideshare vehicles especially.':
        'La técnica más segura es andar por fuera de esa zona y estar atento a los autos con gente adentro, movimiento dentro del auto, luces de freno y balizas. Bajá la velocidad especialmente cerca de vehículos de apps de transporte detenidos.',
      '5. Wet Weather Riding in Sydney': '5. Andar con Lluvia en Sídney',
      'Braking distances get much longer on wet roads — start braking earlier':
        'Las distancias de frenado se alargan mucho con la calle mojada: empezá a frenar antes',
      'Steel drain covers, tram tracks and painted road markings become extremely slippery':
        'Las tapas de desagüe de metal, las vías de tranvía y las marcas pintadas en la calle se ponen extremadamente resbaladizas',
      'Reduce tyre pressure by 5–8 PSI for better grip in wet conditions':
        'Bajá la presión de las cubiertas entre 5 y 8 PSI para mejor agarre en condiciones húmedas',
      'Use a wet lube before the ride — water flushes dry lube in minutes':
        'Usá lubricante para mojado antes de salir: el agua se lleva el lubricante seco en minutos',
      'Wear high-visibility gear — grey days reduce motorist visibility':
        'Usá ropa de alta visibilidad: los días grises reducen la visibilidad para los conductores',
      '6. Night Riding': '6. Andar de Noche',
      'At night or in poor visibility, NSW law requires a white front light and a red rear light, both visible from 200 m, plus a red rear reflector. Beyond the legal minimum, for urban Sydney riding we recommend a minimum 500 lumens front light visible at 200m+ and a rear light with a flash mode visible at 150m. Many quality options are available under $100.':
        'De noche o con poca visibilidad, la ley de NSW exige una luz blanca adelante y una roja atrás, visibles a 200 m, más un reflector rojo trasero. Más allá del mínimo legal, para andar en la Sídney urbana recomendamos una luz delantera de al menos 500 lúmenes visible a más de 200 m y una luz trasera con modo intermitente visible a 150 m. Hay muchas opciones de calidad por menos de $100.',
      'Riding safely starts with a safe bike': 'Andar seguro empieza con una bici segura',
      'Badly adjusted brakes, the wrong tyre pressure and a dry chain are all safety hazards. Our Tune-Up checks and adjusts all three, at your home, office or park.':
        'Frenos mal ajustados, la presión incorrecta de las cubiertas y una cadena seca son riesgos de seguridad. Nuestro Ajuste revisa y corrige los tres, en tu casa, oficina o el parque.',
      'Rules and fines as published by the NSW Government (<a href="https://www.nsw.gov.au/driving-boating-and-transport/bikes-e-bikes-e-scooters">nsw.gov.au</a>), checked November 2026. Amounts change, so check there before relying on them.':
        'Reglas y multas según lo publicado por el Gobierno de NSW (<a href="https://www.nsw.gov.au/driving-boating-and-transport/bikes-e-bikes-e-scooters">nsw.gov.au</a>), revisado en noviembre de 2026. Los montos cambian, así que confirmalos ahí antes de basarte en ellos.',
    },
    zh: {
      'Cycling Safety Tips for Sydney Roads 2026 | Dr. Bike Sydney': '2026年悉尼道路骑行安全提示 | Dr. Bike Sydney',
      'Essential cycling safety tips for Sydney riders — NSW road rules, intersection risks, the door zone, wet weather riding and night cycling guide.':
        '悉尼骑行者必知的安全提示——新州道路规则、路口风险、车门盲区、雨天骑行与夜间骑行指南。',
      'Cycling Safety Tips for Sydney Roads 2026': '2026年悉尼道路骑行安全提示',
      'Sydney has made enormous strides in cycling infrastructure over the past five years, with protected lanes on College Street, Pitt Street Mall surrounds, Bourke Street in Surry Hills, and new routes on the lower North Shore. But riding in a major city still requires situational awareness and knowledge of the local rules.':
        '过去五年间，悉尼在骑行基础设施方面取得了长足进步，College Street、Pitt Street Mall 周边、Surry Hills 的 Bourke Street 都设有受保护车道，下北岸地区也开辟了新路线。但在大城市骑行仍然需要具备情境意识，并了解当地规则。',
      'Here are the most important cycling safety tips for Sydney roads — written by a mechanic who rides and services bikes across Sydney.':
        '以下是在悉尼道路骑行时最重要的安全提示——由一位在悉尼各地骑行并维修自行车的技师撰写。',
      '1. Understand NSW Road Rules for Cyclists': '1. 了解新州骑行者道路规则',
      'Many cyclists unknowingly break the law — not out of recklessness, but because the rules are poorly communicated. Key NSW rules:':
        '许多骑行者在不知情的情况下违反了法规——并非出于鲁莽，而是因为规则的宣传不到位。以下是新州的关键规则：',
      'You must ride as far left as practicable (not as far left as possible — you can take the lane when safe)':
        '必须尽可能靠左侧骑行（并非绝对靠左——在安全的情况下可以占用整条车道）',
      'You can ride two abreast (side-by-side), but not more than 1.5m apart': '可以两人并排骑行，但间距不得超过1.5米',
      'You must use a bike lane if one is available (with some exceptions)': '如有自行车道必须使用（存在部分例外情况）',
      'Helmets are compulsory for all riders of all ages — fines start at $423':
        '所有年龄段骑行者均须强制佩戴头盔——罚款 $423 起',
      'Lights are compulsory at night — white front, red rear': '夜间必须使用车灯——前白后红',
      'You can only use a phone in a holder fixed to the bike, and only for calls, audio or navigation':
        '骑行时只能使用固定在车上的手机支架，且仅限通话、音频或导航',
      '2. The 1-Metre Rule (Passing Distance)': '2. 一米超车距离规则',
      'Since 2016, NSW drivers must give cyclists at least 1 metre when overtaking in a 60km/h or below zone, and 1.5 metres in zones above 60km/h. Knowing this helps you understand when a pass was legal and gives you grounds to report dangerous driving (dashcam footage is useful).':
        '自2016年起，新州驾驶员在限速60公里/小时及以下路段超车骑行者时，必须保持至少1米的距离；限速60公里/小时以上路段则需保持1.5米。了解这一点能帮您判断超车是否合法，也为您举报危险驾驶提供依据（行车记录仪画面会很有用）。',
      '💡 A bike camera such as Cycliq\'s Fly6 (rear) or Fly12 (front) is one of the best investments a Sydney cyclist can make. Footage can back up a report to police.':
        '💡 像 Cycliq Fly6（后置）或 Fly12（前置）这样的自行车摄像头，是悉尼骑行者最值得投资的装备之一。拍摄的画面可以作为向警方报案的证据。',
      '3. High-Risk Intersections to Know': '3. 需要留意的高风险路口',
      'These Sydney spots combine tram tracks, heavy traffic or parked cars, and need extra care:':
        '以下悉尼路段有轨电车轨道多、车流密集或路边停车多，需要格外小心：',
      '<strong>George Street / Market Street CBD</strong> — tram tracks, heavy traffic, confusing signals':
        '<strong>George Street / Market Street（CBD）</strong>——有轨电车轨道，交通繁忙，信号灯令人困惑',
      '<strong>Pyrmont Bridge Road at Darling Harbour</strong> — mixed pedestrian/vehicle conflict':
        '<strong>达令港的 Pyrmont Bridge Road</strong>——行人与车辆混行冲突多发',
      '<strong>Military Road, Neutral Bay</strong> — narrow lanes, aggressive traffic, bus zones':
        '<strong>Neutral Bay 的 Military Road</strong>——车道狭窄，车流强势，设有公交专用区',
      '<strong>Parramatta Road, Camperdown</strong> — high-speed vehicles, no bike lane in sections':
        '<strong>Camperdown 的 Parramatta Road</strong>——车速快，部分路段无自行车道',
      '<strong>Elizabeth Street, CBD</strong> — door zone risk, high taxi and rideshare activity':
        '<strong>CBD 的 Elizabeth Street</strong>——车门盲区风险高，出租车与网约车活动频繁',
      '4. The Door Zone — Sydney\'s Biggest Hazard': '4. 车门盲区——悉尼最大的安全隐患',
      'Getting "doored" — when a car door is opened into a cyclist\'s path — is a common cause of serious injury for city cyclists. The danger zone is approximately 1 metre from parked car doors.':
        '被"开门撞"（即停车的车门恰好在骑行者行进路线上打开）是城市骑行者受重伤的常见原因之一。危险区域大约为距停放车辆车门1米范围内。',
      'The safest technique is to ride outside this zone and watch for cars with occupants, movement inside cars, brake lights, and hazard lights. Slow down near stationary rideshare vehicles especially.':
        '最安全的做法是骑行时避开这一区域，并留意车内是否有人、车内是否有动作、刹车灯和危险警示灯。尤其是经过停靠的网约车时，请减速慢行。',
      '5. Wet Weather Riding in Sydney': '5. 悉尼雨天骑行',
      'Braking distances get much longer on wet roads — start braking earlier': '湿滑路面上的制动距离会明显变长——请提前开始刹车',
      'Steel drain covers, tram tracks and painted road markings become extremely slippery':
        '金属排水盖、有轨电车轨道和路面油漆标线会变得极其湿滑',
      'Reduce tyre pressure by 5–8 PSI for better grip in wet conditions': '将胎压降低5–8 PSI，可在湿滑路况下获得更好的抓地力',
      'Use a wet lube before the ride — water flushes dry lube in minutes': '骑行前使用湿性润滑油——干性润滑油在雨中几分钟就会被冲掉',
      'Wear high-visibility gear — grey days reduce motorist visibility': '穿着高能见度装备——阴天会降低驾驶员的能见度',
      '6. Night Riding': '6. 夜间骑行',
      'At night or in poor visibility, NSW law requires a white front light and a red rear light, both visible from 200 m, plus a red rear reflector. Beyond the legal minimum, for urban Sydney riding we recommend a minimum 500 lumens front light visible at 200m+ and a rear light with a flash mode visible at 150m. Many quality options are available under $100.':
        '在夜间或能见度低时，新州法律要求使用前白灯和后红灯，两者均须在200米外可见，并配备红色后反光片。除法定最低要求外，我们建议在悉尼市区骑行时使用至少500流明、200米以上可见的前灯，以及具备闪烁模式、150米可见的后灯。市面上有许多优质选择，价格在 $100 以内。',
      'Riding safely starts with a safe bike': '安全骑行始于一辆安全的自行车',
      'Badly adjusted brakes, the wrong tyre pressure and a dry chain are all safety hazards. Our Tune-Up checks and adjusts all three, at your home, office or park.':
        '刹车调整不当、胎压不对、链条干涩都是安全隐患。我们的基础调校会检查并调整这三项——在您的家中、办公室或公园均可进行。',
      'Rules and fines as published by the NSW Government (<a href="https://www.nsw.gov.au/driving-boating-and-transport/bikes-e-bikes-e-scooters">nsw.gov.au</a>), checked November 2026. Amounts change, so check there before relying on them.':
        '规则和罚款以新州政府公布的信息为准（<a href="https://www.nsw.gov.au/driving-boating-and-transport/bikes-e-bikes-e-scooters">nsw.gov.au</a>），核对于2026年11月。金额会有变动，请以该网站为准。',
    },
  },
  'electric-bike-laws-nsw-2026': {
    es: {
      'Electric Bike Laws NSW 2026 — Complete Guide | Dr. Bike Sydney':
        'Leyes de E-Bikes en NSW 2026 — Guía Completa | Dr. Bike Sydney',
      'Complete guide to e-bike laws in NSW 2026. Legal PAPC definition, throttle rules, where you can ride, helmet requirements and fines explained.':
        'Guía completa de las leyes de e-bikes en NSW 2026. Definición legal de PAPC, reglas sobre acelerador, dónde podés andar, requisitos de casco y multas explicadas.',
      'Electric Bike Laws NSW 2026 — Complete Guide': 'Leyes de E-Bikes en NSW 2026 — Guía Completa',
      'E-bikes have exploded in popularity across Sydney since 2024, with models from Specialized, Giant, Aventon and dozens of Chinese brands flooding the market. But NSW e-bike laws are stricter than many riders realise — and enforcement is increasing, especially in inner-city areas.':
        'Las e-bikes explotaron en popularidad en Sídney desde 2024, con modelos de Specialized, Giant, Aventon y decenas de marcas chinas inundando el mercado. Pero las leyes de e-bikes en NSW son más estrictas de lo que muchos ciclistas creen, y los controles están aumentando, sobre todo en el centro de la ciudad.',
      'Here\'s what you need to know to ride legally in NSW in 2026.':
        'Esto es lo que necesitás saber para andar de forma legal en NSW en 2026.',
      'Legal E-Bike Definition in NSW': 'Definición Legal de E-Bike en NSW',
      'Under NSW law and Australian Road Rules, a <strong>legally compliant power-assisted pedal cycle (PAPC)</strong> must:':
        'Según la ley de NSW y las Reglas de Tránsito Australianas, una <strong>bicicleta con pedaleo asistido (PAPC) legalmente compatible</strong> debe:',
      '✅ Legal — Power-Assisted Pedal Cycle (PAPC)': '✅ Legal: Bicicleta con Pedaleo Asistido (PAPC)',
      'Motor: up to <strong>500W continuous</strong> today, and <strong>250W</strong> from 1 March 2029, when only EN 15194-certified e-bikes will be road legal. Pedal assist must cut out at <strong>25 km/h</strong>, and any throttle or walk assist at <strong>6 km/h</strong>. Must be a bicycle in form. No licence or registration required. Can be ridden on roads, bike lanes and shared paths. Buying for a child? Check nsw.gov.au for the current minimum-age rules first.':
        'Motor: hasta <strong>500W continuos</strong> hoy, y <strong>250W</strong> desde el 1 de marzo de 2029, cuando solo las e-bikes certificadas EN 15194 van a poder circular. La asistencia al pedaleo tiene que cortarse a los <strong>25 km/h</strong>, y cualquier acelerador o asistencia para caminar a los <strong>6 km/h</strong>. Tiene que tener forma de bicicleta. No requiere licencia ni patente. Se puede andar por la calle, carriles bici y sendas compartidas. ¿Es para un menor? Revisá primero en nsw.gov.au las reglas vigentes sobre edad mínima.',
      '🚫 Illegal on NSW Roads and Paths': '🚫 Ilegal en Calles y Sendas de NSW',
      'Motor above 500W, or not EN 15194-certified from 1 March 2029. A throttle that keeps driving above 6 km/h. Assist that does not cut out at 25 km/h. These bikes are illegal on NSW roads and paths even if the extra power is limited in software, and police can seize and crush them.':
        'Motor de más de 500W, o sin certificación EN 15194 desde el 1 de marzo de 2029. Un acelerador que sigue empujando por encima de los 6 km/h. Asistencia que no se corta a los 25 km/h. Estas bicis son ilegales en las calles y sendas de NSW aunque la potencia extra esté limitada por software, y la policía puede secuestrarlas y compactarlas.',
      'Throttle E-Bikes — Check Before You Buy': 'E-Bikes con Acelerador: Revisá Antes de Comprar',
      'Many popular e-bikes sold in 2024–2026 (including some Aventon, RadPower and Mate models) have throttle modes that allow riding without pedalling. In NSW, throttle mode above 6 km/h makes a bike a "motorised bicycle" — not a PAPC.':
        'Muchas e-bikes populares vendidas entre 2024 y 2026 (incluyendo algunos modelos de Aventon, RadPower y Mate) tienen modo acelerador que permite andar sin pedalear. En NSW, el modo acelerador por encima de los 6 km/h convierte a la bici en una "bicicleta motorizada", no en una PAPC.',
      'This means: if your e-bike\'s throttle can drive it above 6 km/h, the bike itself does not meet the NSW rules, whichever mode you ride in, and limiting it in software does not make it legal. Check with the seller before you buy.':
        'Esto significa que si el acelerador de tu e-bike puede llevarla por encima de los 6 km/h, la bici en sí no cumple con las reglas de NSW, la uses en el modo que la uses, y limitarla por software no la vuelve legal. Consultalo con el vendedor antes de comprar.',
      '⚠️ NSW Police can now seize and crush illegal e-bikes, on top of the penalties for riding an unregistered, unlicensed vehicle.':
        '⚠️ La policía de NSW ahora puede secuestrar y compactar e-bikes ilegales, además de las sanciones por andar en un vehículo sin patente ni licencia.',
      'Helmet Requirements': 'Requisitos de Casco',
      'All cyclists — including e-bike riders — must wear an approved bicycle helmet in NSW, securely fastened. Look for the AS/NZS 2063 standard on the label. Riding without one is a fine of $423 or more.':
        'Todos los ciclistas, incluidos los de e-bike, tienen que usar en NSW un casco de bicicleta aprobado y bien abrochado. Buscá el estándar AS/NZS 2063 en la etiqueta. Andar sin casco tiene una multa de $423 o más.',
      'Where Can You Ride an E-Bike in Sydney?': '¿Dónde Podés Andar en E-Bike en Sídney?',
      '✅ All public roads (where cyclists are permitted)':
        '✅ Todas las calles públicas (donde se permite andar en bici)',
      '✅ Dedicated bike lanes and shared paths': '✅ Carriles bici exclusivos y sendas compartidas',
      '✅ Centennial Park circuit (legal PAPC only)': '✅ El circuito de Centennial Park (solo PAPC legales)',
      '⚠️ National Parks — check individual park rules; some restrict e-bikes on certain trails':
        '⚠️ Parques Nacionales: revisá las reglas de cada parque; algunos restringen las e-bikes en ciertos senderos',
      '🚫 Footpaths, if you are 16 or older (unless you are supervising a rider under 16) — fine $140':
        '🚫 Veredas, si tenés 16 años o más (salvo que estés acompañando a un menor de 16): multa de $140',
      'Speed Limits': 'Límites de Velocidad',
      'E-bike riders must comply with all road speed limits. NSW sets no special speed limit for shared paths, but you must give way to pedestrians there, so ride at a speed that lets you stop. Motor assist must cut off at 25 km/h regardless.':
        'Los ciclistas de e-bike tienen que respetar todos los límites de velocidad de la calle. NSW no fija un límite especial para las sendas compartidas, pero ahí tenés que darles paso a los peatones, así que andá a una velocidad que te permita frenar. La asistencia del motor tiene que cortarse a los 25 km/h de todas formas.',
      'Servicing NSW-Compliant E-Bikes': 'Mantenimiento de E-Bikes que Cumplen con la Ley de NSW',
      'E-bikes require different service intervals than conventional bikes, particularly around the motor, battery connections and rear hub. Our lead mechanic spent a year and a half maintaining a rental fleet of Bosch-powered Cannondale e-mountain bikes at Trails HQ on Hamilton Island.':
        'Las e-bikes necesitan intervalos de servicio distintos a las bicis convencionales, sobre todo en el motor, las conexiones de la batería y el buje trasero. Nuestro mecánico principal pasó un año y medio manteniendo una flota de alquiler de e-MTB Cannondale con motor Bosch en Trails HQ, en Hamilton Island.',
      'E-bike service in Sydney': 'Servicio de E-Bikes en Sídney',
      'Our E-bike Service is a Standard Service for e-bikes, plus a check of the electrical connections and every bolt. We come to you.':
        'Nuestro Servicio de E-Bike es un Servicio Estándar para e-bikes, más una revisión de las conexiones eléctricas y de toda la tornillería. Vamos hasta vos.',
      'Rules and fines as published by the NSW Government (<a href="https://www.nsw.gov.au/driving-boating-and-transport/bikes-e-bikes-e-scooters/bicycles-electric-bikes/e-bike-faqs">nsw.gov.au e-bike FAQs</a>), checked November 2026. Amounts change, so check there before relying on them.':
        'Reglas y multas según lo publicado por el Gobierno de NSW (<a href="https://www.nsw.gov.au/driving-boating-and-transport/bikes-e-bikes-e-scooters/bicycles-electric-bikes/e-bike-faqs">preguntas frecuentes sobre e-bikes en nsw.gov.au</a>), revisado en noviembre de 2026. Los montos cambian, así que confirmalos ahí antes de basarte en ellos.',
    },
    zh: {
      'Electric Bike Laws NSW 2026 — Complete Guide | Dr. Bike Sydney':
        '2026年新州电动自行车法规——完整指南 | Dr. Bike Sydney',
      'Complete guide to e-bike laws in NSW 2026. Legal PAPC definition, throttle rules, where you can ride, helmet requirements and fines explained.':
        '2026年新州电动自行车法规完整指南。合法 PAPC 定义、油门使用规则、可骑行区域、头盔要求及罚款说明。',
      'Electric Bike Laws NSW 2026 — Complete Guide': '2026年新州电动自行车法规——完整指南',
      'E-bikes have exploded in popularity across Sydney since 2024, with models from Specialized, Giant, Aventon and dozens of Chinese brands flooding the market. But NSW e-bike laws are stricter than many riders realise — and enforcement is increasing, especially in inner-city areas.':
        '自2024年以来，电动自行车在悉尼的人气暴涨，Specialized、Giant、Aventon 以及数十个中国品牌的车型涌入市场。但新州的电动自行车法规比许多骑行者想象的更严格——执法力度也在不断加强，尤其是在市区一带。',
      'Here\'s what you need to know to ride legally in NSW in 2026.': '以下是您在2026年于新州合法骑行所需了解的内容。',
      'Legal E-Bike Definition in NSW': '新州电动自行车的法律定义',
      'Under NSW law and Australian Road Rules, a <strong>legally compliant power-assisted pedal cycle (PAPC)</strong> must:':
        '根据新州法律和澳大利亚道路规则，一辆<strong>合法的电助力脚踏车（PAPC）</strong>必须满足：',
      '✅ Legal — Power-Assisted Pedal Cycle (PAPC)': '✅ 合法——电助力脚踏车（PAPC）',
      'Motor: up to <strong>500W continuous</strong> today, and <strong>250W</strong> from 1 March 2029, when only EN 15194-certified e-bikes will be road legal. Pedal assist must cut out at <strong>25 km/h</strong>, and any throttle or walk assist at <strong>6 km/h</strong>. Must be a bicycle in form. No licence or registration required. Can be ridden on roads, bike lanes and shared paths. Buying for a child? Check nsw.gov.au for the current minimum-age rules first.':
        '电机：目前连续输出最高<strong>500W</strong>；自2029年3月1日起降至<strong>250W</strong>，届时只有通过 EN 15194 认证的电动自行车才能合法上路。踏行助力必须在时速<strong>25公里</strong>时切断，任何油门或推行助力必须在时速<strong>6公里</strong>时切断。外形必须为自行车。无需驾照或注册。可在道路、自行车道和共享道路上骑行。为孩子购买？请先在 nsw.gov.au 查看现行的最低年龄规定。',
      '🚫 Illegal on NSW Roads and Paths': '🚫 在新州道路和小径上均属违法',
      'Motor above 500W, or not EN 15194-certified from 1 March 2029. A throttle that keeps driving above 6 km/h. Assist that does not cut out at 25 km/h. These bikes are illegal on NSW roads and paths even if the extra power is limited in software, and police can seize and crush them.':
        '电机超过500W，或自2029年3月1日起未获 EN 15194 认证。时速超过6公里时油门仍可驱动。助力在时速25公里时不切断。即使额外的功率通过软件限制，这类车辆在新州道路和小径上仍属违法，警方可以没收并销毁。',
      'Throttle E-Bikes — Check Before You Buy': '带油门的电动自行车——购买前请确认',
      'Many popular e-bikes sold in 2024–2026 (including some Aventon, RadPower and Mate models) have throttle modes that allow riding without pedalling. In NSW, throttle mode above 6 km/h makes a bike a "motorised bicycle" — not a PAPC.':
        '2024至2026年间销售的许多热门电动自行车（包括部分 Aventon、RadPower 和 Mate 车型）配备了无需踏行即可骑行的油门模式。在新州，时速超过6公里时使用油门模式会使该车被归类为"机动自行车"，而非 PAPC。',
      'This means: if your e-bike\'s throttle can drive it above 6 km/h, the bike itself does not meet the NSW rules, whichever mode you ride in, and limiting it in software does not make it legal. Check with the seller before you buy.':
        '这意味着：如果您的电动自行车的油门可以驱动车辆超过时速6公里，无论您使用哪种模式骑行，这辆车本身都不符合新州规定，通过软件限速也不能使其合法。购买前请向卖家确认。',
      '⚠️ NSW Police can now seize and crush illegal e-bikes, on top of the penalties for riding an unregistered, unlicensed vehicle.':
        '⚠️ 新州警方现在可以没收并销毁违法电动自行车，此外还会对驾驶无牌无照车辆的行为进行处罚。',
      'Helmet Requirements': '头盔要求',
      'All cyclists — including e-bike riders — must wear an approved bicycle helmet in NSW, securely fastened. Look for the AS/NZS 2063 standard on the label. Riding without one is a fine of $423 or more.':
        '在新州，所有骑行者——包括电动自行车骑行者——都必须佩戴经认证并正确扣好的自行车头盔。请认准标签上的 AS/NZS 2063 标准。不戴头盔骑行将被处以 $423 起的罚款。',
      'Where Can You Ride an E-Bike in Sydney?': '在悉尼哪里可以骑电动自行车？',
      '✅ All public roads (where cyclists are permitted)': '✅ 所有允许骑行者通行的公共道路',
      '✅ Dedicated bike lanes and shared paths': '✅ 专用自行车道和共享道路',
      '✅ Centennial Park circuit (legal PAPC only)': '✅ Centennial Park 环道（仅限合法 PAPC）',
      '⚠️ National Parks — check individual park rules; some restrict e-bikes on certain trails':
        '⚠️ 国家公园——请查看各公园的具体规定；部分公园限制电动自行车通行某些步道',
      '🚫 Footpaths, if you are 16 or older (unless you are supervising a rider under 16) — fine $140':
        '🚫 人行道：16岁及以上骑行者禁止使用（陪同16岁以下骑行者时除外），罚款 $140',
      'Speed Limits': '速度限制',
      'E-bike riders must comply with all road speed limits. NSW sets no special speed limit for shared paths, but you must give way to pedestrians there, so ride at a speed that lets you stop. Motor assist must cut off at 25 km/h regardless.':
        '电动自行车骑行者必须遵守所有道路限速规定。新州没有为共享道路设定专门的限速，但您在共享道路上必须礼让行人，因此请保持能够随时停下的速度。无论如何，电机助力都必须在时速25公里时切断。',
      'Servicing NSW-Compliant E-Bikes': '符合新州法规的电动自行车保养',
      'E-bikes require different service intervals than conventional bikes, particularly around the motor, battery connections and rear hub. Our lead mechanic spent a year and a half maintaining a rental fleet of Bosch-powered Cannondale e-mountain bikes at Trails HQ on Hamilton Island.':
        '电动自行车的保养周期与传统自行车不同，尤其是电机、电池连接和后轮毂部分。我们的主理技师曾在汉密尔顿岛的 Trails HQ 用一年半时间维护一支搭载 Bosch 电机的 Cannondale 电动山地车租赁车队。',
      'E-bike service in Sydney': '悉尼电动自行车服务',
      'Our E-bike Service is a Standard Service for e-bikes, plus a check of the electrical connections and every bolt. We come to you.':
        '我们的电动车服务是电动车版的标准服务，另检查电气连接和所有螺丝。我们上门服务。',
      'Rules and fines as published by the NSW Government (<a href="https://www.nsw.gov.au/driving-boating-and-transport/bikes-e-bikes-e-scooters/bicycles-electric-bikes/e-bike-faqs">nsw.gov.au e-bike FAQs</a>), checked November 2026. Amounts change, so check there before relying on them.':
        '规则和罚款以新州政府公布的信息为准（<a href="https://www.nsw.gov.au/driving-boating-and-transport/bikes-e-bikes-e-scooters/bicycles-electric-bikes/e-bike-faqs">nsw.gov.au 电动自行车常见问题</a>），核对于2026年11月。金额会有变动，请以该网站为准。',
    },
  },
  'how-to-clean-your-bike-chain-sydney': {
    es: {
      'How to Clean Your Bike Chain in Sydney | Dr. Bike Sydney':
        'Cómo Limpiar la Cadena de tu Bici en Sídney | Dr. Bike Sydney',
      'Step-by-step guide to cleaning and lubricating your bike chain in Sydney. Wet vs dry lube, how often to clean, and when to replace your chain.':
        'Guía paso a paso para limpiar y lubricar la cadena de tu bici en Sídney. Lubricante húmedo vs. seco, cada cuánto limpiarla y cuándo reemplazar la cadena.',
      'How to Clean Your Bike Chain in Sydney': 'Cómo Limpiar la Cadena de tu Bici en Sídney',
      'Your bike chain is one of the highest-wear components on your bike, and also one of the cheapest to maintain. A clean, lubricated chain can last 3,000+ km — a dirty, neglected one might fail at 1,500 km and take your cassette with it (a much more expensive fix).':
        'La cadena de tu bici es uno de los componentes que más se desgasta, pero también uno de los más baratos de mantener. Una cadena limpia y lubricada puede durar más de 3.000 km; una sucia y descuidada puede fallar a los 1.500 km y llevarse el cassette con ella (una reparación mucho más cara).',
      'Here\'s the Dr. Bike Sydney step-by-step guide to cleaning your chain at home, written for Sydney\'s specific conditions — coastal air, occasional salt spray, and those unexpected summer downpours.':
        'Esta es la guía paso a paso de Dr. Bike Sydney para limpiar tu cadena en casa, pensada para las condiciones específicas de Sídney: aire costero, algo de brisa salada y esos aguaceros inesperados de verano.',
      'Why Chain Cleaning Matters in Sydney': 'Por Qué Limpiar la Cadena Importa en Sídney',
      'Sydney\'s coastal humidity and salt air accelerate chain corrosion, especially if you ride near Bondi, Manly or the foreshore. A chain that looks fine on the surface might already have micro-rust in the links. Combined with road grit picked up on wet days, this creates an abrasive paste that eats through your drivetrain fast.':
        'La humedad costera y el aire salado de Sídney aceleran la corrosión de la cadena, sobre todo si andás cerca de Bondi, Manly o la costa. Una cadena que se ve bien por fuera puede tener ya microóxido en los eslabones. Combinado con la tierra de la calle que se junta en días de lluvia, esto forma una pasta abrasiva que desgasta la transmisión rápido.',
      'What You\'ll Need': 'Qué Vas a Necesitar',
      'Chain degreaser (biodegradable options like Muc-Off or Finish Line available at most bike shops)':
        'Desengrasante de cadena (hay opciones biodegradables como Muc-Off o Finish Line en la mayoría de las bicicleterías)',
      'Old toothbrush or chain brush': 'Cepillo de dientes viejo o cepillo para cadena',
      'Clean rags (old t-shirts work well)': 'Trapos limpios (remeras viejas funcionan bien)',
      'Chain lube — wet lube for Sydney winters, dry lube for summer':
        'Lubricante de cadena: lubricante húmedo para los inviernos de Sídney, seco para el verano',
      'Optional: chain cleaning device (Park Tool CM-5.3 makes this much faster)':
        'Opcional: dispositivo limpiacadenas (el Park Tool CM-5.3 hace todo mucho más rápido)',
      '💡 <strong>Sydney tip:</strong> Use <strong>wet lube</strong> from May to September when rain is more frequent. Switch to <strong>dry lube</strong> in summer — it attracts less dust on dry days.':
        '💡 <strong>Tip de Sídney:</strong> usá <strong>lubricante húmedo</strong> entre mayo y septiembre, cuando llueve más seguido. Cambiá a <strong>lubricante seco</strong> en verano: junta menos polvo en los días secos.',
      'Step-by-Step Chain Cleaning': 'Limpieza de la Cadena Paso a Paso',
      'Degrease': 'Desengrasar',
      'Apply degreaser to the chain while slowly backpedalling. Let it soak for 2–3 minutes. If using a chain cleaning tool, fill with degreaser and run the chain through for 30 seconds.':
        'Aplicá el desengrasante en la cadena mientras pedaleás despacio hacia atrás. Dejalo actuar 2 a 3 minutos. Si usás un dispositivo limpiacadenas, llenalo con desengrasante y pasá la cadena por 30 segundos.',
      'Scrub': 'Cepillar',
      'Use a chain brush or old toothbrush to scrub the chain links, cassette cogs and chainrings. Focus on the inside of the chain where grit accumulates between plates.':
        'Usá un cepillo para cadena o un cepillo de dientes viejo para cepillar los eslabones, los piñones del cassette y los platos. Prestá especial atención a la parte interna de la cadena, donde se acumula la tierra entre las placas.',
      'Rinse': 'Enjuagar',
      'Wipe the chain thoroughly with a clean rag while backpedalling. Remove all degreaser residue — lube doesn\'t bond well to a degreased chain that still has chemical residue.':
        'Limpiá bien la cadena con un trapo limpio mientras pedaleás hacia atrás. Sacá todo resto de desengrasante: el lubricante no se adhiere bien a una cadena que todavía tiene residuo químico.',
      'Dry': 'Secar',
      'Wipe dry with a second clean rag. If possible, leave the bike in a warm spot for 15 minutes to ensure all moisture is gone before lubing.':
        'Secá con otro trapo limpio. Si podés, dejá la bici en un lugar cálido durante 15 minutos para asegurarte de que no quede humedad antes de lubricar.',
      'Lube': 'Lubricar',
      'Apply lube to each individual link while slowly backpedalling. One drop per link is enough — do not over-lube. Wipe excess off with a rag after 5 minutes. Excess lube attracts more dirt.':
        'Aplicá lubricante en cada eslabón mientras pedaleás despacio hacia atrás. Con una gota por eslabón alcanza, no te pases. Limpiá el exceso con un trapo después de 5 minutos. El exceso de lubricante junta más tierra.',
      'Shift through gears': 'Pasar por todos los cambios',
      'Backpedal while shifting through all gears to distribute lube evenly across the cassette and chainrings.':
        'Pedaleá hacia atrás mientras pasás por todos los cambios, para distribuir el lubricante de forma pareja en el cassette y los platos.',
      'How Often Should You Clean Your Chain in Sydney?': '¿Cada Cuánto Hay que Limpiar la Cadena en Sídney?',
      '<strong>After every wet ride</strong> — rain flushes lube and brings up road grit':
        '<strong>Después de cada salida con lluvia</strong>: el agua se lleva el lubricante y trae tierra de la calle',
      '<strong>Every 150–200 km</strong> under normal conditions':
        '<strong>Cada 150-200 km</strong> en condiciones normales',
      '<strong>When you hear squeaking</strong> — already too late, but better late than never':
        '<strong>Cuando escuchás que chilla</strong>: ya es tarde, pero más vale tarde que nunca',
      '<strong>Before a long ride or event</strong> — always start fresh':
        '<strong>Antes de una salida larga o un evento</strong>: siempre arrancá con todo limpio',
      'When to Replace Your Chain': 'Cuándo Reemplazar tu Cadena',
      'Use a chain wear indicator tool (available for under $20). At 0.5% wear, replace the chain immediately if you want to save your cassette. At 0.75%+ wear, you\'ll likely need to replace the cassette too — a much more costly repair.':
        'Usá un medidor de desgaste de cadena (se consigue por menos de $20). Con 0,5% de desgaste, cambiá la cadena de inmediato si querés salvar el cassette. Con 0,75% o más de desgaste, probablemente también tengas que cambiar el cassette, una reparación mucho más cara.',
      '⚠️ <strong>A worn chain left too long costs 5–10x more to fix.</strong> Cassette replacement adds $60–$200 in parts depending on spec. A new chain is $25–$60 in parts.':
        '⚠️ <strong>Una cadena gastada que se deja pasar demasiado cuesta de 5 a 10 veces más arreglar.</strong> Cambiar el cassette suma entre $60 y $200 en repuestos según el modelo. Una cadena nueva cuesta entre $25 y $60 en repuestos.',
      'Don\'t have time to clean your chain?': '¿No tenés tiempo para limpiar tu cadena?',
      'Our Standard Service adds a full drivetrain clean to everything in the Tune-Up: gear and brake adjustment, tyre pressure and chain lube. We come to you.':
        'Nuestro Servicio Estándar suma una limpieza completa de la transmisión a todo lo del Ajuste: ajuste de cambios y frenos, presión de cubiertas y lubricación de la cadena. Vamos hasta vos.',
    },
    zh: {
      'How to Clean Your Bike Chain in Sydney | Dr. Bike Sydney': '如何在悉尼清洁自行车链条 | Dr. Bike Sydney',
      'Step-by-step guide to cleaning and lubricating your bike chain in Sydney. Wet vs dry lube, how often to clean, and when to replace your chain.':
        '在悉尼清洁并润滑自行车链条的分步指南。湿性润滑油与干性润滑油对比、多久清洁一次，以及何时该更换链条。',
      'How to Clean Your Bike Chain in Sydney': '如何在悉尼清洁自行车链条',
      'Your bike chain is one of the highest-wear components on your bike, and also one of the cheapest to maintain. A clean, lubricated chain can last 3,000+ km — a dirty, neglected one might fail at 1,500 km and take your cassette with it (a much more expensive fix).':
        '自行车链条是磨损最严重的部件之一，但也是维护成本最低的部件之一。干净、润滑良好的链条可以使用3,000多公里；而肮脏、疏于保养的链条可能在1,500公里时就出现故障，还会连累飞轮一起损坏（维修费用要贵得多）。',
      'Here\'s the Dr. Bike Sydney step-by-step guide to cleaning your chain at home, written for Sydney\'s specific conditions — coastal air, occasional salt spray, and those unexpected summer downpours.':
        '以下是 Dr. Bike Sydney 为您提供的居家清洁链条分步指南，专为悉尼的特殊环境而写——海边空气、偶尔的盐雾，以及夏季那些猝不及防的暴雨。',
      'Why Chain Cleaning Matters in Sydney': '为什么清洁链条在悉尼尤为重要',
      'Sydney\'s coastal humidity and salt air accelerate chain corrosion, especially if you ride near Bondi, Manly or the foreshore. A chain that looks fine on the surface might already have micro-rust in the links. Combined with road grit picked up on wet days, this creates an abrasive paste that eats through your drivetrain fast.':
        '悉尼沿海的湿气和盐雾会加速链条腐蚀，尤其是在 Bondi、Manly 或海滨一带骑行时。一条看起来完好的链条，链节内部可能已经出现微量锈蚀。再加上雨天沾染的路面沙砾，会形成一种研磨膏状物质，迅速侵蚀您的传动系统。',
      'What You\'ll Need': '您需要准备的工具',
      'Chain degreaser (biodegradable options like Muc-Off or Finish Line available at most bike shops)':
        '链条脱脂剂（大多数自行车店有 Muc-Off 或 Finish Line 等可生物降解的选择）',
      'Old toothbrush or chain brush': '旧牙刷或专用链条刷',
      'Clean rags (old t-shirts work well)': '干净的抹布（旧T恤效果不错）',
      'Chain lube — wet lube for Sydney winters, dry lube for summer': '链条润滑油——悉尼冬季用湿性润滑油，夏季用干性润滑油',
      'Optional: chain cleaning device (Park Tool CM-5.3 makes this much faster)':
        '可选：链条清洁器（Park Tool CM-5.3 能让整个过程快很多）',
      '💡 <strong>Sydney tip:</strong> Use <strong>wet lube</strong> from May to September when rain is more frequent. Switch to <strong>dry lube</strong> in summer — it attracts less dust on dry days.':
        '💡 <strong>悉尼小贴士：</strong>5月至9月降雨较多时使用<strong>湿性润滑油</strong>。夏季则改用<strong>干性润滑油</strong>——在干燥天气里更不容易沾染灰尘。',
      'Step-by-Step Chain Cleaning': '链条清洁分步指南',
      'Degrease': '脱脂',
      'Apply degreaser to the chain while slowly backpedalling. Let it soak for 2–3 minutes. If using a chain cleaning tool, fill with degreaser and run the chain through for 30 seconds.':
        '缓慢反向蹬踏的同时，将脱脂剂涂抹在链条上，静置浸泡2-3分钟。如果使用链条清洁器，请注入脱脂剂并让链条通过30秒。',
      'Scrub': '刷洗',
      'Use a chain brush or old toothbrush to scrub the chain links, cassette cogs and chainrings. Focus on the inside of the chain where grit accumulates between plates.':
        '用专用链条刷或旧牙刷刷洗链节、飞轮齿片和牙盘。重点清洁链条内侧，那里的板片之间容易积存污垢。',
      'Rinse': '冲洗',
      'Wipe the chain thoroughly with a clean rag while backpedalling. Remove all degreaser residue — lube doesn\'t bond well to a degreased chain that still has chemical residue.':
        '反向蹬踏的同时，用干净的抹布彻底擦拭链条，去除所有脱脂剂残留——如果链条上还残留化学物质，润滑油就无法很好地附着。',
      'Dry': '晾干',
      'Wipe dry with a second clean rag. If possible, leave the bike in a warm spot for 15 minutes to ensure all moisture is gone before lubing.':
        '用另一块干净抹布擦干。如果条件允许，将自行车放置在温暖处15分钟，确保上油前完全干燥。',
      'Lube': '上油',
      'Apply lube to each individual link while slowly backpedalling. One drop per link is enough — do not over-lube. Wipe excess off with a rag after 5 minutes. Excess lube attracts more dirt.':
        '缓慢反向蹬踏的同时，为每个链节单独上油。每个链节一滴即可，切勿过量。5分钟后用抹布擦去多余的油——过多的润滑油会吸附更多灰尘。',
      'Shift through gears': '切换所有档位',
      'Backpedal while shifting through all gears to distribute lube evenly across the cassette and chainrings.':
        '反向蹬踏的同时切换所有档位，让润滑油均匀分布在飞轮和牙盘上。',
      'How Often Should You Clean Your Chain in Sydney?': '在悉尼多久该清洁一次链条？',
      '<strong>After every wet ride</strong> — rain flushes lube and brings up road grit':
        '<strong>每次雨天骑行后</strong>——雨水会冲走润滑油并带来路面沙砾',
      '<strong>Every 150–200 km</strong> under normal conditions': '<strong>正常情况下每150–200公里</strong>一次',
      '<strong>When you hear squeaking</strong> — already too late, but better late than never':
        '<strong>当您听到异响时</strong>——虽然已经晚了，但亡羊补牢总比不做好',
      '<strong>Before a long ride or event</strong> — always start fresh':
        '<strong>长途骑行或活动前</strong>——务必以最佳状态出发',
      'When to Replace Your Chain': '何时该更换链条',
      'Use a chain wear indicator tool (available for under $20). At 0.5% wear, replace the chain immediately if you want to save your cassette. At 0.75%+ wear, you\'ll likely need to replace the cassette too — a much more costly repair.':
        '使用链条磨损检测工具（售价不到 $20）。当磨损达到0.5%时，如果想保住飞轮，应立即更换链条。磨损达到0.75%以上时，很可能连飞轮也需要更换——维修费用会高出许多。',
      '⚠️ <strong>A worn chain left too long costs 5–10x more to fix.</strong> Cassette replacement adds $60–$200 in parts depending on spec. A new chain is $25–$60 in parts.':
        '⚠️ <strong>拖延太久才处理的磨损链条，维修费用会高出5到10倍。</strong>更换飞轮需额外花费 $60–$200 的零件费（视规格而定）。而一条新链条的零件费只需 $25–$60。',
      'Don\'t have time to clean your chain?': '没时间清洁链条？',
      'Our Standard Service adds a full drivetrain clean to everything in the Tune-Up: gear and brake adjustment, tyre pressure and chain lube. We come to you.':
        '我们的标准服务在基础调校的全部项目之外，还包括传动系统全面清洁：变速和刹车调整、胎压以及链条润滑。我们上门服务。',
    },
  },
};

// ── the template ─────────────────────────────────────────────────────────────

const CSS = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:var(--sans);color:var(--navy);background:var(--white);-webkit-font-smoothing:antialiased}
img,svg{display:block}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px}
.site-head{position:sticky;top:0;z-index:50;background:var(--white);border-bottom:1px solid var(--border)}
.site-head .wrap{height:64px;display:flex;align-items:center;gap:12px}
.brand{display:flex;align-items:center;gap:10px;min-height:44px;color:var(--navy);text-decoration:none;font-weight:800;font-size:17px;letter-spacing:-.01em;white-space:nowrap}
.brand img{height:28px;width:auto}
.brand .b{color:var(--blue)}
.brand-name{display:none}
@media(min-width:560px){.brand-name{display:inline}}
.head-end{margin-left:auto;display:flex;align-items:center;gap:8px}
.langs{display:flex;padding:2px;border:1px solid var(--border);border-radius:999px}
.langs a{display:flex;align-items:center;justify-content:center;min-width:40px;min-height:40px;padding:0 10px;border-radius:999px;color:var(--gray);font-size:13px;font-weight:600;text-decoration:none}
.langs a:hover{color:var(--navy)}
.langs a[aria-current]{background:var(--navy);color:var(--white)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 20px;border-radius:10px;background:var(--blue);color:var(--white);font-weight:700;font-size:15px;text-decoration:none;white-space:nowrap}
.btn:hover{background:var(--blue-dark)}
.btn svg{width:18px;height:18px}
.site-head .btn{padding:0 14px;font-size:14px}
.kicker{display:inline-flex;align-items:center;gap:8px;margin:0;color:var(--navy);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.kicker::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--c)}
.cover{display:grid;place-items:center;aspect-ratio:16/9;background-color:var(--tint);background-image:radial-gradient(color-mix(in srgb,var(--c) 24%,transparent) 1.3px,transparent 1.6px);background-size:16px 16px}
.disc{display:grid;place-items:center;width:72px;height:72px;border-radius:50%;background:var(--white);color:var(--c);box-shadow:0 0 0 8px color-mix(in srgb,var(--c) 10%,transparent)}
.disc svg{width:32px;height:32px}
.post-head{background:var(--tint);border-bottom:1px solid var(--border)}
.post-head .wrap{display:grid;gap:32px;padding-top:24px;padding-bottom:36px}
.crumbs ol{display:flex;flex-wrap:wrap;gap:4px;margin:-6px 0 8px;padding:0;list-style:none;font-size:13px;color:var(--gray)}
.crumbs li{display:flex;align-items:center}
.crumbs li+li::before{content:"/";margin-right:4px;color:var(--slate)}
.crumbs a{display:inline-flex;align-items:center;min-height:44px;color:var(--gray);text-decoration:none}
.crumbs a:hover{color:var(--navy);text-decoration:underline}
h1{max-width:780px;margin:12px 0 14px;font-size:clamp(30px,5.2vw,46px);line-height:1.12;letter-spacing:-.025em;font-weight:800}
.deck{max-width:680px;margin:0 0 24px;color:var(--gray);font-size:clamp(17px,2.2vw,20px);line-height:1.5}
.byline{display:flex;align-items:center;gap:12px}
.byline img{width:40px;height:40px;border-radius:50%}
.byline .who{font-size:14px;font-weight:700}
.byline .role{font-weight:400;color:var(--gray)}
.byline .when{color:var(--gray);font-size:13px;line-height:1.5}
.head-art{display:none}
@media(min-width:1080px){
  .post-head .wrap{grid-template-columns:minmax(0,1fr) 280px;align-items:center;padding-top:32px;padding-bottom:52px}
  .head-art{display:grid;aspect-ratio:1;border:1px solid var(--border);border-radius:24px;background-color:var(--white)}
  .head-art .disc{width:120px;height:120px;box-shadow:0 0 0 14px color-mix(in srgb,var(--c) 10%,transparent)}
  .head-art .disc svg{width:52px;height:52px}
}
.prose{max-width:700px;margin:0 auto;padding:40px 20px 0;font-family:Charter,'Bitstream Charter','Sitka Text',Cambria,Georgia,serif;font-size:17px;line-height:1.7;color:var(--navy)}
@media(min-width:640px){.prose{font-size:18px;padding-top:52px}}
html[lang=zh-Hans] .prose{font-family:var(--sans);line-height:1.85}
.prose p{margin:0 0 1.15em}
.prose h2{margin:2em 0 .6em;font-family:var(--sans);font-size:24px;line-height:1.3;letter-spacing:-.015em;font-weight:700}
.prose h3{margin:1.6em 0 .4em;font-family:var(--sans);font-size:19px;line-height:1.35;font-weight:700}
.prose ul,.prose ol{margin:0 0 1.25em;padding-left:1.3em}
.prose li{margin:0 0 .5em;padding-left:.2em}
.prose li::marker{color:var(--blue)}
.prose ol li::marker{font-family:var(--sans);font-weight:700;font-size:.9em}
.prose a{color:var(--blue-text);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}
.prose a:hover{text-decoration-thickness:2px}
.prose strong{font-weight:700}
.prose .tip-box,.prose .warning-box{margin:1.6em 0;padding:16px 20px;border-left:3px solid var(--blue);border-radius:0 12px 12px 0;background:var(--blue-tint);font-size:.94em}
.prose .warning-box{border-left-color:var(--amber);background:var(--amber-lt)}
.prose .tip-box p,.prose .warning-box p{margin:0}
.prose .law-card{margin:1.4em 0;padding:18px 20px;border:1px solid var(--border);border-left:4px solid var(--green);border-radius:12px;background:var(--green-tint)}
.prose .law-card.illegal{border-left-color:var(--red);background:var(--red-lt)}
.prose .law-card h3{margin-top:0}
.prose .law-card p{margin:0}
.prose .check-item{display:flex;gap:16px;margin:1.2em 0;padding:18px 20px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}
.prose .ci-icon{font-size:24px;line-height:1.3}
.prose .ci-content h3{margin-top:0}
.prose .ci-content p{margin:0}
.prose .step{display:grid;grid-template-columns:36px 1fr;gap:16px;margin:0 0 1.2em}
.prose .step-num{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--navy);color:var(--white);font-family:var(--sans);font-size:15px;font-weight:700}
.prose .step-content h3{margin:.25em 0 .2em}
.prose .step-content p{margin:0}
.prose .note{margin-top:2.4em;padding-top:16px;border-top:1px solid var(--border);color:var(--gray);font-family:var(--sans);font-size:14px;line-height:1.6}
.cta{max-width:740px;margin:48px auto 64px;padding:0 20px}
.cta-in{display:grid;gap:12px;padding:32px 28px;border-radius:18px;background:var(--navy-surface);color:var(--white)}
.cta h2{margin:0;font-size:24px;line-height:1.25;letter-spacing:-.015em}
.cta p{margin:0;color:color-mix(in srgb,var(--white) 84%,transparent);font-size:16px;line-height:1.6}
.cta .btn{justify-self:start;margin-top:8px}
.cta .fine{color:color-mix(in srgb,var(--white) 70%,transparent);font-size:13px}
.more{padding:48px 0 56px;border-top:1px solid var(--border);background:var(--surface)}
.more-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}
.more-head h2{margin:0;font-size:22px;letter-spacing:-.01em}
.more-head a{display:inline-flex;align-items:center;gap:6px;min-height:44px;color:var(--blue-text);font-size:14px;font-weight:600;text-decoration:none}
.more-head a svg{width:16px;height:16px}
.cards{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
.card{display:grid;grid-template-rows:auto 1fr;overflow:hidden;border:1px solid var(--border);border-radius:14px;background:var(--white);color:var(--navy);text-decoration:none;cursor:pointer;transition:border-color .15s}
.card:hover{border-color:var(--c)}
.card:hover .card-title{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}
.card-body{display:flex;flex-direction:column;gap:6px;padding:16px 18px 18px}
.card-title{margin:4px 0 0;font-size:17px;line-height:1.35;font-weight:700;letter-spacing:-.01em}
.card-desc{margin:0;color:var(--gray);font-size:14px;line-height:1.55}
.card-meta{display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:8px;color:var(--gray);font-size:13px}
.card-meta svg{width:18px;height:18px;color:var(--blue)}
@media(max-width:639px){
  .card{grid-template-columns:96px 1fr;grid-template-rows:none}
  .card .cover{aspect-ratio:auto;height:100%;min-height:112px}
  .card .disc{width:44px;height:44px;box-shadow:0 0 0 5px color-mix(in srgb,var(--c) 10%,transparent)}
  .card .disc svg{width:20px;height:20px}
  .card-body{padding:14px 16px}
  .card-title{font-size:16px}
}
.idx-head{padding:40px 0 28px;border-bottom:1px solid var(--border);background:var(--surface)}
.eyebrow{margin:0;color:var(--blue-text);font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.idx-head .deck{margin-bottom:0}
.idx-list{padding-top:32px;padding-bottom:16px;display:grid;gap:16px}
.feature .card-title{font-size:clamp(22px,3vw,30px);line-height:1.2;letter-spacing:-.02em}
.feature .card-desc{font-size:16px}
.feature .disc{width:96px;height:96px;box-shadow:0 0 0 12px color-mix(in srgb,var(--c) 10%,transparent)}
.feature .disc svg{width:42px;height:42px}
@media(max-width:639px){.feature{grid-template-columns:none;grid-template-rows:auto 1fr}.feature .cover{aspect-ratio:16/9;min-height:0}}
@media(min-width:760px){
  .feature{grid-template-columns:1.15fr 1fr;grid-template-rows:none}
  .feature .cover{aspect-ratio:auto;min-height:300px}
  .feature .card-body{justify-content:center;padding:32px}
  .idx-grid{grid-template-columns:repeat(2,1fr)}
  .idx-grid .cover{aspect-ratio:12/5}
}
.badge{align-self:flex-start;padding:3px 10px;border-radius:20px;background:var(--blue-lt);color:var(--blue-text);font-size:11px;font-weight:600}
.areas{padding:40px 0 48px}
.areas h2{margin:0 0 6px;font-size:20px}
.areas p{margin:0;color:var(--gray);font-size:15px;line-height:1.6}
.area-list{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0;padding:0;list-style:none}
.area-list a{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border:1px solid var(--border);border-radius:999px;color:var(--navy);font-size:14px;font-weight:600;text-decoration:none}
.area-list a:hover{border-color:var(--blue);color:var(--blue-text)}
.areas .fine{font-size:13px}
.site-foot{padding:28px 0 32px;background:var(--navy-surface);color:color-mix(in srgb,var(--white) 70%,transparent);font-size:13px}
.site-foot nav{display:flex;flex-wrap:wrap;gap:0 20px;margin-bottom:8px}
.site-foot a{display:inline-flex;align-items:center;min-height:44px;color:color-mix(in srgb,var(--white) 90%,transparent);text-decoration:none}
.site-foot a:hover{text-decoration:underline}
.site-foot p{margin:0;line-height:1.7}
.site-foot p a{min-height:0}
`
  .trim()
  .split('\n')
  .map((l) => '    ' + l)
  .join('\n');

// The CTA's GA event (it used to be an inline onclick, which CLAUDE.md
// forbids), and the reader's language carried into the booking app - but only
// when they have never picked one there, so a saved choice is never overridden.
const SCRIPT = `document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('[data-book]');if(!a)return;try{if(!localStorage.getItem('drbike-lang'))localStorage.setItem('drbike-lang',document.documentElement.getAttribute('data-app-lang'))}catch(err){console.warn('[blog] could not save the language:',err.message)}var p=a.getAttribute('data-lead');if(p&&window.gtag)gtag('event','generate_lead',{page:p})});`;

const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replaceAll('<', '\\u003c')}</script>`;
const ogImage = (name) => `${SITE}/images/blog/${name}.png`;

// ── translation ──────────────────────────────────────────────────────────────

const errors = [];
const used = {};
for (const slug of Object.keys(POSTS)) used[slug] = { es: new Set(), zh: new Set() };

function tr(slug, lang, s) {
  if (lang === 'en') return s;
  const v = DICT[slug]?.[lang]?.[s];
  if (v === undefined) {
    errors.push(`${slug} (${lang}): no translation for ${JSON.stringify(s)}`);
    return s;
  }
  used[slug][lang].add(s);
  return v;
}

function translateBody(slug, lang, en) {
  if (lang === 'en') return en;
  const table = DICT[slug][lang];
  let out = en;
  for (const key of Object.keys(table).sort((a, b) => b.length - a.length)) {
    if (!out.includes(key)) continue;
    used[slug][lang].add(key);
    out = out.split(key).join(table[key]);
  }
  // A link to another page that has an es/zh version follows the reader's
  // language. "/" and /cycling-map have none and stay as they are.
  const pfx = LANGS[lang].prefix;
  out = out.replaceAll('href="/blog/', `href="${pfx}/blog/`);
  for (const s of ['business', ...AREAS.map((a) => a[0])]) out = out.replaceAll(`href="/${s}"`, `href="${pfx}/${s}"`);
  // English sentences that came through untranslated. Six words or more, so a
  // bike model or a brand name, which stays in English on purpose, does not
  // count.
  for (const chunk of en.split(/<[^>]+>/)) {
    const t = chunk.trim();
    if (t.split(/\s+/).length >= 6 && out.includes(t)) {
      errors.push(`${slug} (${lang}): untranslated: ${JSON.stringify(t.slice(0, 90))}`);
    }
  }
  return out;
}

// ── page parts ───────────────────────────────────────────────────────────────

function readMinutes(body) {
  const words = body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter((w) => /\w/.test(w)).length;
  return Math.max(1, Math.round(words / WPM));
}

function head({ lang, title, description, url, alternates, image, type, jsonld }) {
  const l = LANGS[lang];
  return `<!DOCTYPE html>
<html lang="${l.htmlLang}" data-app-lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="icon" href="/icon-512.svg?v=2" type="image/svg+xml">
  <link rel="icon" href="/favicon-32.png?v=2" sizes="32x32" type="image/png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${url}">
${Object.values(LANGS)
  .map((a) => `  <link rel="alternate" hreflang="${a.hreflang}" href="${alternates(a.prefix)}">`)
  .join('\n')}
  <link rel="alternate" hreflang="x-default" href="${alternates('')}">
  <meta property="og:type" content="${type}">
  <meta property="og:site_name" content="Dr. Bike Sydney">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
${jsonld.map((o) => '  ' + ld(o)).join('\n')}
  <script src="/js/consent.js"></script>
  <script type="text/plain" data-consent="analytics" async src="https://www.googletagmanager.com/gtag/js?id=G-GXYD68JXZW"></script>
  <script type="text/plain" data-consent="analytics">window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-GXYD68JXZW');</script>
  <link rel="stylesheet" href="/css/fonts.css">
  <link rel="stylesheet" href="/css/variables.css">
  <style>
${CSS}
  </style>
</head>
<body>
<a class="skip-link" href="#main">${UI[lang].skip}</a>`;
}

function siteHeader(lang, pathFor) {
  const u = UI[lang];
  const names = { en: ['EN', 'English'], es: ['ES', 'Español'], zh: ['中文', '中文'] };
  const langs = Object.entries(LANGS)
    .map(
      ([code, l]) =>
        `<a href="${pathFor(l.prefix)}" hreflang="${l.hreflang}" lang="${l.htmlLang}" title="${names[code][1]}"${code === lang ? ' aria-current="page"' : ''}>${names[code][0]}</a>`
    )
    .join('');
  return `<header class="site-head">
  <div class="wrap">
    <a class="brand" href="/"><img src="/images/logo-db.png" alt="Dr. Bike Sydney" width="40" height="28"><span class="brand-name">Dr. <span class="b">Bike</span> Sydney</span></a>
    <div class="head-end">
      <nav class="langs" aria-label="${u.langNav}">${langs}</nav>
      <a class="btn" href="/#book-service" data-book>${u.book}</a>
    </div>
  </div>
</header>`;
}

function cover(cat, cls = 'cover') {
  return `<div class="${cls}" aria-hidden="true"><span class="disc">${svg(CATS[cat].icon)}</span></div>`;
}
const catStyle = (cat) => `--c:${CATS[cat].c};--tint:${CATS[cat].tint}`;

function card(slug, lang, { level = 'h3', desc = false, featured = false } = {}) {
  const p = POSTS[slug];
  const u = UI[lang];
  const mins = u.minRead.replace('{n}', readMinutes(enBody[slug]));
  return `<a class="card${featured ? ' feature' : ''}" href="${LANGS[lang].prefix}/blog/${slug}" style="${catStyle(p.cat)}">
      ${cover(p.cat)}
      <div class="card-body">
        ${featured ? `<span class="badge">${u.featured}</span>\n        ` : ''}<p class="kicker">${u['cat.' + p.cat]}</p>
        <${level} class="card-title">${esc(tr(slug, lang, p.h1))}</${level}>${desc ? `\n        <p class="card-desc">${esc(tr(slug, lang, p.description))}</p>` : ''}
        <div class="card-meta"><span>${mins}</span>${svg('arrow')}</div>
      </div>
    </a>`;
}

function ctaBlock(lang, title, text, label, lead) {
  return `<section class="cta" aria-labelledby="cta-title">
  <div class="cta-in">
    <h2 id="cta-title">${esc(title)}</h2>
    <p>${esc(text)}</p>
    <a class="btn" href="/#book-service" data-book data-lead="${lead}">${label} ${svg('arrow')}</a>
    <p class="fine">${UI[lang].feeNote}</p>
  </div>
</section>`;
}

function areasBlock(lang) {
  const u = UI[lang];
  const pfx = LANGS[lang].prefix;
  return `<section class="areas" aria-labelledby="areas-title">
  <div class="wrap">
    <h2 id="areas-title">${u.areasTitle}</h2>
    <p>${u.areasText}</p>
    <ul class="area-list">
${AREAS.map(([s, name]) => `      <li><a href="${pfx}/${s}">${name}</a></li>`).join('\n')}
    </ul>
    <p class="fine">${u.areasNote}</p>
  </div>
</section>`;
}

function siteFooter(lang) {
  const u = UI[lang];
  const pfx = LANGS[lang].prefix;
  return `<footer class="site-foot">
  <div class="wrap">
    <nav aria-label="${u.footNav}"><a href="/">${u.home}</a><a href="${pfx}/blog">${u.blog}</a><a href="/#book-service" data-book>${u.bookService}</a><a href="/cycling-map">${u.map}</a><a href="${pfx}/business">${u.business}</a></nav>
    <p>© 2026 Dr. Bike Sydney · ABN 87 654 025 287 · <a href="mailto:contact@drbikesydney.com.au">contact@drbikesydney.com.au</a></p>
  </div>
</footer>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

const publisher = { '@type': 'Organization', name: 'Dr. Bike Sydney', url: SITE, logo: { '@type': 'ImageObject', url: `${SITE}/icon-512.png` } };

function articlePage(slug, lang) {
  const p = POSTS[slug];
  const u = UI[lang];
  const pfx = LANGS[lang].prefix;
  const url = `${SITE}${pfx}/blog/${slug}`;
  const title = tr(slug, lang, p.title);
  const description = tr(slug, lang, p.description);
  const h1 = tr(slug, lang, p.h1);
  const body = translateBody(slug, lang, enBody[slug]);
  const mins = u.minRead.replace('{n}', readMinutes(enBody[slug]));
  const jsonld = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: h1,
      description,
      inLanguage: LANGS[lang].hreflang,
      image: ogImage(slug),
      datePublished: PUBLISHED,
      dateModified: MODIFIED,
      author: { '@type': 'Organization', name: 'Dr. Bike Sydney', url: SITE },
      publisher,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      url,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: u.home, item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: u.blog, item: `${SITE}${pfx}/blog` },
        { '@type': 'ListItem', position: 3, name: h1, item: url },
      ],
    },
  ];
  return `${head({ lang, title, description, url, alternates: (x) => `${SITE}${x}/blog/${slug}`, image: ogImage(slug), type: 'article', jsonld })}
${siteHeader(lang, (x) => `${x}/blog/${slug}`)}
<main id="main">
<article>
<header class="post-head" style="${catStyle(p.cat)}">
  <div class="wrap">
    <div>
      <nav class="crumbs" aria-label="${u.crumbs}"><ol><li><a href="/">${u.home}</a></li><li><a href="${pfx}/blog">${u.blog}</a></li></ol></nav>
      <p class="kicker">${u['cat.' + p.cat]}</p>
      <h1>${esc(h1)}</h1>
      <p class="deck">${esc(description)}</p>
      <div class="byline">
        <img src="/images/brand/db-circle-blue.svg" alt="" width="40" height="40">
        <div>
          <div class="who">Dr. Bike Sydney · <span class="role">${u.role}</span></div>
          <div class="when">${u.published} <time datetime="${PUBLISHED}">${fmtDate(PUBLISHED, lang)}</time> · ${u.updated} <time datetime="${MODIFIED}">${fmtDate(MODIFIED, lang)}</time> · ${mins}</div>
        </div>
      </div>
    </div>
    ${cover(p.cat, 'cover head-art')}
  </div>
</header>
<div class="prose">
${body.trim()}
</div>
</article>
${ctaBlock(lang, tr(slug, lang, p.cta.title), tr(slug, lang, p.cta.text), u[p.cta.label], p.ga)}
<aside class="more" aria-labelledby="more-title">
  <div class="wrap">
    <div class="more-head"><h2 id="more-title">${u.keepReading}</h2><a href="${pfx}/blog">${u.allArticles} ${svg('arrow')}</a></div>
    <div class="cards">
    ${p.related.map((r) => card(r, lang)).join('\n    ')}
    </div>
  </div>
</aside>
${areasBlock(lang)}
</main>
${siteFooter(lang)}`;
}

function indexPage(lang) {
  const u = UI[lang];
  const pfx = LANGS[lang].prefix;
  const url = `${SITE}${pfx}/blog`;
  const [first, ...rest] = Object.keys(POSTS);
  const jsonld = [
    {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: u.indexEyebrow,
      description: u.indexDesc,
      inLanguage: LANGS[lang].hreflang,
      url,
      publisher,
      blogPost: Object.entries(POSTS).map(([slug, p]) => ({
        '@type': 'BlogPosting',
        headline: tr(slug, lang, p.h1),
        url: `${SITE}${pfx}/blog/${slug}`,
        datePublished: PUBLISHED,
        dateModified: MODIFIED,
      })),
    },
  ];
  return `${head({ lang, title: u.indexTitle, description: u.indexDesc, url, alternates: (x) => `${SITE}${x}/blog`, image: ogImage('index'), type: 'website', jsonld })}
${siteHeader(lang, (x) => `${x}/blog`)}
<main id="main">
<header class="idx-head">
  <div class="wrap">
    <p class="eyebrow">${u.indexEyebrow}</p>
    <h1>${u.indexH1}</h1>
    <p class="deck">${u.indexIntro}</p>
  </div>
</header>
<section class="wrap idx-list">
  ${card(first, lang, { level: 'h2', desc: true, featured: true })}
  <div class="cards idx-grid">
    ${rest.map((s) => card(s, lang, { level: 'h2', desc: true })).join('\n    ')}
  </div>
</section>
${ctaBlock(lang, u.indexCtaTitle, u.indexCtaText, u.bookService, 'blog_index')}
${areasBlock(lang)}
</main>
${siteFooter(lang)}`;
}

// ── run ──────────────────────────────────────────────────────────────────────

const enBody = {};
for (const slug of Object.keys(POSTS)) {
  enBody[slug] = fs.readFileSync(path.join(ROOT, 'scripts', 'blog-posts', `${slug}.htm`), 'utf8').replaceAll('\r\n', '\n');
  for (const r of POSTS[slug].related) if (!POSTS[r]) errors.push(`${slug}: related post ${r} does not exist`);
}

for (const lang of ['es', 'zh']) {
  const missing = Object.keys(UI.en).filter((k) => !(k in UI[lang]));
  const extra = Object.keys(UI[lang]).filter((k) => !(k in UI.en));
  if (missing.length || extra.length) errors.push(`UI.${lang}: missing ${missing.join(', ') || '-'}; extra ${extra.join(', ') || '-'}`);
}
for (const slug of Object.keys(POSTS)) {
  if (!DICT[slug]) {
    errors.push(`${slug}: no DICT entry`);
    continue;
  }
  const es = Object.keys(DICT[slug].es);
  const zh = new Set(Object.keys(DICT[slug].zh));
  const diff = es.filter((k) => !zh.has(k)).concat([...zh].filter((k) => !(k in DICT[slug].es)));
  if (diff.length) errors.push(`${slug}: es and zh disagree on ${diff.length} key(s): ${diff.map((k) => JSON.stringify(k.slice(0, 60))).join(', ')}`);
}

const pages = [];
for (const [lang, l] of Object.entries(LANGS)) {
  const dir = path.join(l.prefix ? l.prefix.slice(1) : '', 'blog');
  for (const slug of Object.keys(POSTS)) pages.push([path.join(dir, `${slug}.html`), articlePage(slug, lang)]);
  pages.push([path.join(dir, 'index.html'), indexPage(lang)]);
}

for (const slug of Object.keys(POSTS)) {
  for (const lang of ['es', 'zh']) {
    const dead = Object.keys(DICT[slug][lang]).filter((k) => !used[slug][lang].has(k));
    for (const k of dead) errors.push(`${slug} (${lang}): DICT key matches nothing - typo, or the English changed: ${JSON.stringify(k.slice(0, 90))}`);
  }
}
for (const name of [...Object.keys(POSTS), 'index']) {
  if (!fs.existsSync(path.join(ROOT, 'images', 'blog', `${name}.png`))) {
    errors.push(`images/blog/${name}.png is missing - run: npm run blog:og`);
  }
}

if (OG) {
  await drawShareImages();
  process.exit(0);
}

if (errors.length) {
  console.error(`\nblog: ${errors.length} problem(s)\n`);
  for (const e of errors) console.error('  x ' + e);
  process.exit(1);
}

const onDisk = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n') : null);
const drifted = [];
for (const [rel, html] of pages) {
  const file = path.join(ROOT, rel);
  if (CHECK) {
    if (onDisk(file) !== html) drifted.push(rel.replaceAll('\\', '/'));
    continue;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

if (CHECK) {
  if (drifted.length) {
    console.error(`\nblog-check: ${drifted.length} page(s) differ from what scripts/build-blog.mjs writes\n`);
    for (const f of drifted) console.error(`  x ${f}`);
    console.error(
      '\nEvery page under blog/, es/blog/ and zh/blog/ is generated. Put the change in' +
        '\nscripts/blog-posts/<slug>.htm or scripts/build-blog.mjs, then run: npm run blog:build\n'
    );
    process.exit(1);
  }
  console.log(`blog-check: OK - ${pages.length} blog pages match scripts/build-blog.mjs.`);
} else {
  console.log(`blog: ${pages.length} pages written.`);
}

// ── share images ─────────────────────────────────────────────────────────────
// 1200x630, one per post plus the index, in no language: the same cover art
// the cards use, and the wordmark. Drawn from css/variables.css so the colours
// are the tokens, never a copy of them.
async function drawShareImages() {
  const { chromium } = await import('playwright');
  const font = (w) =>
    `@font-face{font-family:Inter;font-weight:${w};src:url(data:font/woff2;base64,${fs
      .readFileSync(path.join(ROOT, 'fonts', `inter-latin-${w}-normal.woff2`))
      .toString('base64')}) format('woff2')}`;
  const tokens = fs.readFileSync(path.join(ROOT, 'css', 'variables.css'), 'utf8');
  const logo = fs.readFileSync(path.join(ROOT, 'images', 'logo-db.png')).toString('base64');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const jobs = [...Object.entries(POSTS).map(([slug, p]) => [slug, p.cat]), ['index', 'buyers']];
  for (const [name, cat] of jobs) {
    await page.setContent(`<!DOCTYPE html><html><head><style>${font(800)}${tokens}
      html,body{margin:0;width:1200px;height:630px}
      body{${catStyle(cat)};font-family:Inter,sans-serif;background-color:var(--tint);background-image:radial-gradient(color-mix(in srgb,var(--c) 24%,transparent) 2.4px,transparent 2.9px);background-size:30px 30px;display:grid;place-items:center;position:relative}
      .disc{display:grid;place-items:center;width:240px;height:240px;border-radius:50%;background:var(--white);color:var(--c);box-shadow:0 0 0 28px color-mix(in srgb,var(--c) 10%,transparent)}
      .disc svg{width:108px;height:108px;display:block}
      .mark{position:absolute;left:56px;bottom:48px;display:flex;align-items:center;gap:16px;padding:14px 22px;border-radius:16px;background:var(--white);color:var(--navy);font-size:30px;font-weight:800;letter-spacing:-.01em}
      .mark img{height:40px}.b{color:var(--blue)}
    </style></head><body><span class="disc">${svg(CATS[cat].icon)}</span><div class="mark"><img src="data:image/png;base64,${logo}" alt=""><span>Dr. <span class="b">Bike</span> Sydney</span></div></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const out = path.join(ROOT, 'images', 'blog', `${name}.png`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out });
    console.log(`  drew ${path.relative(ROOT, out)}`);
  }
  await browser.close();
}
