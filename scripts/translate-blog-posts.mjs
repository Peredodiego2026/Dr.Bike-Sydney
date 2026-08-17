// scripts/translate-blog-posts.mjs — es/zh versions of the 5 blog posts
//
// Run: node scripts/translate-blog-posts.mjs
//
// Same mechanism as scripts/translate-static-pages.mjs (docs/PENDIENTES.md
// 4.1): English stays the source, a dictionary does whole-fragment
// find/replace over the rendered HTML, hreflang + <html lang> get injected
// into all 3 versions including the English source. See that file for the
// full rationale - this one adds blog/ as a subdirectory and a wider set of
// cross-link targets (blog-to-blog, plus business/bike-check/suburbs, all of
// which already have es/zh by the time this runs).

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

const POSTS = [
  'how-to-choose-a-bike-mechanic-sydney',
  'best-bikes-for-sydney-commuting-2026',
  'cycling-safety-tips-sydney-roads',
  'electric-bike-laws-nsw-2026',
  'how-to-clean-your-bike-chain-sydney',
];

// Every slug that already has (or, once this script runs, will have) real
// es/zh siblings - used to decide which hrefs get language-prefixed and
// which stay bare (docs/PENDIENTES.md 4.1's cross-link rule: a link only
// gets prefixed if its target actually has a translation, otherwise it
// jumps a Spanish/Chinese reader into an English page).
const SUBURB_SLUGS = [
  'bondi', 'cbd', 'chatswood', 'eastern-suburbs', 'hills-district', 'hornsby',
  'inner-west', 'manly', 'marrickville', 'mosman', 'newtown', 'north-shore',
  'northern-beaches', 'parramatta', 'penrith', 'ryde', 'st-george',
  'strathfield', 'surry-hills', 'sutherland-shire',
];
const ROOT_SLUGS = ['business', 'bike-check'];

// Shared boilerplate: header/footer/nav/category labels/related-card titles
// repeated across all 5 posts (and, for Book Now/footer links, shared with
// business.html/bike-check.html too - kept separate per file on purpose,
// duplication here is cheaper than a cross-script shared-dictionary import
// for five short strings).
const SHARED = {
  es: {
    'Book Now': 'Reservar',
    'More from Dr. Bike Sydney': 'Más de Dr. Bike Sydney',
    'We come to you across Sydney': 'Vamos a toda Sídney',
    'Mobile bike repair, at your home, office or park. Pick your area:':
      'Reparación de bicicletas a domicilio, en tu casa, oficina o el parque. Elegí tu zona:',
    Home: 'Inicio',
    'Bike Check': 'Chequeo de Bici',
    'Cycling Map': 'Mapa de Ciclismo',
    'For Business': 'Para Empresas',
    Guide: 'Guía',
    Maintenance: 'Mantenimiento',
    Safety: 'Seguridad',
    Legal: 'Legal',
    Tool: 'Herramienta',
    Explore: 'Explorar',
    'Best Bikes for Sydney Commuting 2026': 'Las Mejores Bicis para Moverte por Sídney en 2026',
    'Best Cycling Routes in Sydney': 'Las Mejores Rutas de Ciclismo en Sídney',
    'Best Sydney Cycling Routes': 'Las Mejores Rutas de Ciclismo de Sídney',
    'Cycling Safety Tips for Sydney Roads': 'Consejos de Seguridad para Andar en Bici en Sídney',
    'E-Bike Laws NSW 2026': 'Leyes de E-Bikes en NSW 2026',
    'How to Clean Your Bike Chain in Sydney': 'Cómo Limpiar la Cadena de tu Bici en Sídney',
    'How to Clean Your Bike Chain': 'Cómo Limpiar la Cadena de tu Bici',
    'Is My Bike Safe to Ride? Free Check': '¿Mi Bici es Segura? Chequeo Gratis',
    'Free Bike Safety Check': 'Chequeo de Seguridad Gratis',
    'How to Choose a Bike Mechanic in Sydney': 'Cómo Elegir un Mecánico de Bicicletas en Sídney',
    'Book a Tune-Up — $109 →': 'Reservar un Ajuste — $109 →',
  },
  zh: {
    'Book Now': '立即预订',
    'More from Dr. Bike Sydney': '更多 Dr. Bike Sydney 内容',
    'We come to you across Sydney': '我们服务悉尼各区',
    'Mobile bike repair, at your home, office or park. Pick your area:':
      '上门自行车维修，可在您的家中、办公室或公园进行。请选择您所在的区域：',
    Home: '首页',
    'Bike Check': '自行车检测',
    'Cycling Map': '骑行地图',
    'For Business': '企业服务',
    Guide: '指南',
    Maintenance: '保养',
    Safety: '安全',
    Legal: '法律',
    Tool: '工具',
    Explore: '探索',
    'Best Bikes for Sydney Commuting 2026': '2026年悉尼通勤自行车推荐',
    'Best Cycling Routes in Sydney': '悉尼最佳骑行路线',
    'Best Sydney Cycling Routes': '悉尼最佳骑行路线',
    'Cycling Safety Tips for Sydney Roads': '悉尼道路骑行安全提示',
    'E-Bike Laws NSW 2026': '2026年新州电动自行车法规',
    'How to Clean Your Bike Chain in Sydney': '如何在悉尼清洁自行车链条',
    'How to Clean Your Bike Chain': '如何清洁自行车链条',
    'Is My Bike Safe to Ride? Free Check': '我的自行车安全吗？免费检测',
    'Free Bike Safety Check': '免费自行车安全检测',
    'How to Choose a Bike Mechanic in Sydney': '如何在悉尼选择自行车技师',
    'Book a Tune-Up — $109 →': '预订基础保养 — $109 →',
  },
};

// Per-post dictionaries are added below, one at a time, to keep each edit
// reviewable on its own.
const DICT = {
  'how-to-choose-a-bike-mechanic-sydney': {
    es: {
      'How to Choose a Bike Mechanic in Sydney | Dr. Bike Sydney':
        'Cómo Elegir un Mecánico de Bicicletas en Sídney | Dr. Bike Sydney',
      'What to look for when choosing a bike mechanic in Sydney — experience, mobile vs workshop, pricing transparency, insurance and what questions to ask.':
        'Qué tener en cuenta al elegir un mecánico de bicicletas en Sídney: experiencia, a domicilio vs taller, transparencia de precios, seguro y qué preguntas hacer.',
      'How to Choose a Bike Mechanic in Sydney': 'Cómo Elegir un Mecánico de Bicicletas en Sídney',
      '🔍 Guide': '🔍 Guía',
      'By Dr. Bike Sydney · June 2026 · 5 min read': 'Por Dr. Bike Sydney · junio 2026 · 5 min de lectura',
      "Finding a trustworthy bike mechanic in Sydney can be harder than it sounds. The market ranges from highly qualified mechanics with years of specialist experience to weekend hobbyists offering cut-price repairs that can leave your bike worse than before. Here's how to make the right choice.":
        'Encontrar un mecánico de bicicletas confiable en Sídney puede ser más difícil de lo que parece. El mercado va desde mecánicos altamente calificados con años de experiencia especializada, hasta aficionados de fin de semana que ofrecen reparaciones baratas que pueden dejar tu bici peor de lo que estaba. Así es como elegís bien.',
      '1. Check Their Experience and Specialisation': '1. Revisá su Experiencia y Especialización',
      "Bicycle mechanics don't require a formal licence in Australia, so the barrier to entry is low. Look for:":
        'En Australia, los mecánicos de bicicletas no necesitan una licencia formal, así que la barrera de entrada es baja. Fijate en:',
      '<strong>Years of experience</strong> — ask directly; a good mechanic will tell you proudly':
        '<strong>Años de experiencia</strong>: preguntá directamente; un buen mecánico te lo va a contar con orgullo',
      '<strong>Brand specialisation</strong> — e-bikes (especially Bosch Smart System), race bikes, and cargo bikes all require specific knowledge':
        '<strong>Especialización por marca</strong>: las e-bikes (sobre todo con Bosch Smart System), las bicis de carrera y las de carga requieren conocimientos específicos',
      '<strong>Trail background</strong> — mechanics who ride regularly understand problems cyclists actually face':
        '<strong>Experiencia sobre el terreno</strong>: los mecánicos que andan en bici seguido entienden mejor los problemas reales de los ciclistas',
      '💡 At Dr. Bike Sydney, our lead mechanic has 5+ years of experience including managing a fleet of Bosch-equipped e-bikes. Every service is performed by an experienced mechanic — not a junior trainee.':
        '💡 En Dr. Bike Sydney, nuestro mecánico principal tiene más de 5 años de experiencia, incluyendo la gestión de una flota de e-bikes con sistema Bosch. Cada servicio lo hace un mecánico experimentado, no un aprendiz.',
      '2. Mobile vs. Workshop — Which is Better?': '2. A Domicilio vs. Taller: ¿Cuál Conviene Más?',
      'Sydney\'s traditional workshop model requires you to transport your bike, wait days for an appointment slot, and collect it again. A quality mobile mechanic brings a fully-equipped van directly to you, often available same-day.':
        'El modelo tradicional de taller en Sídney te obliga a trasladar la bici, esperar días por un turno y después ir a buscarla de nuevo. Un buen mecánico a domicilio lleva una camioneta totalmente equipada directo hasta vos, muchas veces disponible el mismo día.',
      'Mobile mechanic advantages': 'Ventajas del mecánico a domicilio',
      'No transport needed · Same-day availability · You watch the work being done · Your bike doesn\'t sit in a queue for days':
        'No hace falta trasladar la bici · Disponibilidad el mismo día · Podés ver cómo trabajan · Tu bici no queda en cola durante días',
      'Workshop advantages': 'Ventajas del taller',
      'Better for frame repairs and specialist builds · More suitable for rare vintage components · May have more specialist equipment for unusual jobs':
        'Mejor para reparaciones de cuadro y armados especializados · Más adecuado para repuestos vintage poco comunes · Puede tener equipamiento más especializado para trabajos inusuales',
      'For the vast majority of Sydney riders — commuters, casual riders, enthusiasts — a mobile mechanic is faster, more convenient and equally capable.':
        'Para la gran mayoría de los ciclistas de Sídney (los que van al trabajo, los ocasionales, los entusiastas) un mecánico a domicilio es más rápido, más cómodo e igual de capaz.',
      '3. What to Ask Before Booking': '3. Qué Preguntar Antes de Reservar',
      'Are you fully insured for mobile/on-site repairs?': '¿Tenés seguro completo para reparaciones a domicilio?',
      'What brands do you service? Can you work on my [brand]?':
        '¿Qué marcas atendés? ¿Podés trabajar con mi [marca]?',
      'What does your [tune-up / standard service] include?': '¿Qué incluye tu [ajuste / servicio estándar]?',
      'Do you carry parts on the van, or do I need to wait for parts orders?':
        '¿Llevás repuestos en la camioneta, o tengo que esperar a que los pidas?',
      'Do you provide a written service report?': '¿Entregás un informe escrito del servicio?',
      '4. Transparent Pricing — Red and Green Flags': '4. Precios Transparentes: Señales Buenas y Malas',
      'Reputable mechanics price clearly upfront. Be cautious of mechanics who:':
        'Los mecánicos serios ponen el precio claro desde el principio. Desconfiá de los que:',
      'Refuse to give a price estimate before seeing the bike': 'Se niegan a dar un presupuesto antes de ver la bici',
      'Add significant charges not mentioned in the booking':
        'Agregan cargos importantes que no se mencionaron en la reserva',
      'Quote unusually low prices that don\'t reflect the work involved':
        'Cotizan precios inusualmente bajos que no reflejan el trabajo real',
      'Can\'t tell you which parts they\'ve replaced after a service':
        'No pueden decirte qué repuestos cambiaron después del servicio',
      'At Dr. Bike Sydney, all prices are published: Tune-Up $109, Standard $149, Major $199, Ultimate $369. No hidden fees, mobile call-out included.':
        'En Dr. Bike Sydney todos los precios están publicados: Ajuste $109, Estándar $149, Mayor $199, Definitivo $369. Sin cargos ocultos, la visita a domicilio ya está incluida.',
      '5. Read Reviews Critically': '5. Leé las Reseñas con Ojo Crítico',
      'Google Reviews are the most reliable source in Sydney. Look for:':
        'Las reseñas de Google son la fuente más confiable en Sídney. Fijate en:',
      'Reviews that mention specific repairs (not just "great service!")':
        'Reseñas que mencionan reparaciones específicas (no solo "¡buen servicio!")',
      'How the mechanic responds to negative reviews': 'Cómo responde el mecánico a las reseñas negativas',
      'Reviews mentioning punctuality and communication': 'Reseñas que mencionan la puntualidad y la comunicación',
      'Verified reviews rather than a sudden burst of 5-star reviews':
        'Reseñas verificadas, en vez de una lluvia repentina de reseñas de 5 estrellas',
      '6. Insurance and Professionalism': '6. Seguro y Profesionalismo',
      'Any mechanic working on your bike has access to your property and is performing work that, if done incorrectly, could cause an accident. A professional mobile mechanic should carry public liability insurance and be able to confirm this on request.':
        'Cualquier mecánico que trabaje en tu bici tiene acceso a tu propiedad y hace un trabajo que, si sale mal, puede causar un accidente. Un mecánico a domicilio profesional debería tener seguro de responsabilidad civil y poder confirmarlo si se lo pedís.',
      'Book a Dr. Bike Sydney service': 'Reservá un servicio con Dr. Bike Sydney',
      'Experienced, insured, transparent pricing. We come to you anywhere across Sydney — home, work or park.':
        'Experiencia, seguro y precios transparentes. Vamos hasta vos a cualquier parte de Sídney: casa, trabajo o parque.',
      'Book Now — From $109 →': 'Reservar Ahora — Desde $109 →',
    },
    zh: {
      'How to Choose a Bike Mechanic in Sydney | Dr. Bike Sydney': '如何在悉尼选择自行车技师 | Dr. Bike Sydney',
      'What to look for when choosing a bike mechanic in Sydney — experience, mobile vs workshop, pricing transparency, insurance and what questions to ask.':
        '在悉尼选择自行车技师时该注意什么——经验、上门服务与实体店对比、价格透明度、保险，以及该问哪些问题。',
      'How to Choose a Bike Mechanic in Sydney': '如何在悉尼选择自行车技师',
      '🔍 Guide': '🔍 指南',
      'By Dr. Bike Sydney · June 2026 · 5 min read': '作者：Dr. Bike Sydney · 2026年6月 · 阅读需5分钟',
      "Finding a trustworthy bike mechanic in Sydney can be harder than it sounds. The market ranges from highly qualified mechanics with years of specialist experience to weekend hobbyists offering cut-price repairs that can leave your bike worse than before. Here's how to make the right choice.":
        '在悉尼找到一位值得信赖的自行车技师，可能比听起来更难。市场上既有经验丰富、技术精湛的专业技师，也有周末业余爱好者提供的廉价维修，后者可能让您的自行车状况更糟。以下是如何做出正确选择。',
      '1. Check Their Experience and Specialisation': '1. 检查经验与专长',
      "Bicycle mechanics don't require a formal licence in Australia, so the barrier to entry is low. Look for:":
        '在澳大利亚，自行车技师不需要正式执照，因此入行门槛很低。请留意以下几点：',
      '<strong>Years of experience</strong> — ask directly; a good mechanic will tell you proudly':
        '<strong>从业年限</strong>——直接询问即可，优秀的技师会很自豪地告诉您',
      '<strong>Brand specialisation</strong> — e-bikes (especially Bosch Smart System), race bikes, and cargo bikes all require specific knowledge':
        '<strong>品牌专长</strong>——电动自行车（尤其是搭载 Bosch Smart System 的车型）、公路赛车和货运自行车都需要专门的知识',
      '<strong>Trail background</strong> — mechanics who ride regularly understand problems cyclists actually face':
        '<strong>骑行背景</strong>——经常骑车的技师更了解骑行者真正会遇到的问题',
      '💡 At Dr. Bike Sydney, our lead mechanic has 5+ years of experience including managing a fleet of Bosch-equipped e-bikes. Every service is performed by an experienced mechanic — not a junior trainee.':
        '💡 在 Dr. Bike Sydney，我们的主理技师拥有 5 年以上经验，曾负责管理一支配备 Bosch 系统的电动自行车车队。每一次服务都由经验丰富的技师亲自完成，绝非新手学徒。',
      '2. Mobile vs. Workshop — Which is Better?': '2. 上门服务 vs. 实体店——哪个更好？',
      'Sydney\'s traditional workshop model requires you to transport your bike, wait days for an appointment slot, and collect it again. A quality mobile mechanic brings a fully-equipped van directly to you, often available same-day.':
        '悉尼传统的实体店模式需要您自己运送自行车、等待数天预约，再取车。而优质的上门技师会直接开着装备齐全的服务车来找您，通常当天即可安排。',
      'Mobile mechanic advantages': '上门技师的优势',
      'No transport needed · Same-day availability · You watch the work being done · Your bike doesn\'t sit in a queue for days':
        '无需运送自行车 · 当天可预约 · 您可以全程查看维修过程 · 自行车不用排队等候数日',
      'Workshop advantages': '实体店的优势',
      'Better for frame repairs and specialist builds · More suitable for rare vintage components · May have more specialist equipment for unusual jobs':
        '更适合车架维修和特殊定制组装 · 更适合处理稀有的复古零件 · 可能拥有更专业的设备来处理特殊工作',
      'For the vast majority of Sydney riders — commuters, casual riders, enthusiasts — a mobile mechanic is faster, more convenient and equally capable.':
        '对于绝大多数悉尼骑行者——通勤者、休闲骑行爱好者、发烧友来说，上门技师更快、更方便，能力也丝毫不逊色。',
      '3. What to Ask Before Booking': '3. 预订前该问哪些问题',
      'Are you fully insured for mobile/on-site repairs?': '您是否为上门维修投保了完整保险？',
      'What brands do you service? Can you work on my [brand]?': '您服务哪些品牌？能维修我的[品牌]吗？',
      'What does your [tune-up / standard service] include?': '您的[基础保养/标准服务]包含哪些内容？',
      'Do you carry parts on the van, or do I need to wait for parts orders?':
        '您的服务车上是否备有零件，还是我需要等待订购？',
      'Do you provide a written service report?': '您是否提供书面服务报告？',
      '4. Transparent Pricing — Red and Green Flags': '4. 价格透明——好信号与坏信号',
      'Reputable mechanics price clearly upfront. Be cautious of mechanics who:':
        '口碑良好的技师会提前明确报价。请对以下情况保持警惕：',
      'Refuse to give a price estimate before seeing the bike': '在查看自行车之前拒绝提供报价',
      'Add significant charges not mentioned in the booking': '在预订时未提及，事后却增加大额费用',
      'Quote unusually low prices that don\'t reflect the work involved': '报价异常低廉，与实际工作量不符',
      'Can\'t tell you which parts they\'ve replaced after a service': '服务结束后说不清楚更换了哪些零件',
      'At Dr. Bike Sydney, all prices are published: Tune-Up $109, Standard $149, Major $199, Ultimate $369. No hidden fees, mobile call-out included.':
        '在 Dr. Bike Sydney，所有价格全部公开：基础保养 $109，标准服务 $149，中级服务 $199，全面服务 $369。无隐藏费用，已包含上门服务费。',
      '5. Read Reviews Critically': '5. 批判性地看待评价',
      'Google Reviews are the most reliable source in Sydney. Look for:':
        '在悉尼，Google 评价是最可靠的信息来源。请留意：',
      'Reviews that mention specific repairs (not just "great service!")':
        '提到具体维修内容的评价（而不只是"服务很好！"）',
      'How the mechanic responds to negative reviews': '技师如何回应负面评价',
      'Reviews mentioning punctuality and communication': '提到准时性和沟通情况的评价',
      'Verified reviews rather than a sudden burst of 5-star reviews': '已验证的评价，而不是突然涌现的大量五星好评',
      '6. Insurance and Professionalism': '6. 保险与专业性',
      'Any mechanic working on your bike has access to your property and is performing work that, if done incorrectly, could cause an accident. A professional mobile mechanic should carry public liability insurance and be able to confirm this on request.':
        '任何为您维修自行车的技师都能接触到您的财物，所进行的工作若操作不当，也可能引发事故。专业的上门技师应当持有公共责任险，并能在您要求时予以确认。',
      'Book a Dr. Bike Sydney service': '预订 Dr. Bike Sydney 服务',
      'Experienced, insured, transparent pricing. We come to you anywhere across Sydney — home, work or park.':
        '经验丰富、有保险保障、价格透明。我们上门服务悉尼全境——家中、办公室或公园均可。',
      'Book Now — From $109 →': '立即预订 — 低至 $109 →',
    },
  },
  'best-bikes-for-sydney-commuting-2026': {
    es: {
      'Best Bikes for Sydney Commuting 2026 | Dr. Bike Sydney':
        'Las Mejores Bicis para Moverte por Sídney en 2026 | Dr. Bike Sydney',
      'The best bikes for commuting in Sydney in 2026 — hybrid, e-bike, gravel and folding options reviewed for inner-city riders.':
        'Las mejores bicis para moverte por Sídney en 2026: opciones híbridas, eléctricas, gravel y plegables, evaluadas para ciclistas urbanos.',
      '🚲 Buyer\'s Guide': '🚲 Guía de Compra',
      'By Dr. Bike Sydney · June 2026 · 6 min read': 'Por Dr. Bike Sydney · junio 2026 · 6 min de lectura',
      "Sydney's cycling infrastructure has expanded significantly in recent years, with protected lanes on Crown Street, College Street and Anzac Parade making inner-city commuting more viable than ever. But choosing the right commuter bike for Sydney's unique mix of flat stretches, hilly suburbs and occasionally wet roads matters more than many riders think.":
        'La infraestructura ciclista de Sídney creció mucho en los últimos años, con carriles protegidos en Crown Street, College Street y Anzac Parade que hacen que moverse por el centro en bici sea más viable que nunca. Pero elegir la bici correcta para la mezcla particular de Sídney (tramos planos, suburbios con subidas y calles a veces mojadas) importa más de lo que muchos ciclistas piensan.',
      'Here\'s our 2026 guide — written by mechanics with 5+ years servicing Sydney commuters daily.':
        'Esta es nuestra guía 2026, escrita por mecánicos con más de 5 años atendiendo a ciclistas urbanos de Sídney todos los días.',
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
      '2. E-Bikes — Best for Hills and Long Commutes': '2. E-Bikes: las Mejores para Subidas y Trayectos Largos',
      'If your commute involves Crows Nest, Balmain or any of Sydney\'s notorious hills — or if you arrive at work in a suit — an e-bike is worth the investment. The e-bike market has matured significantly in 2025–2026 with more affordable, lightweight options available.':
        'Si tu trayecto pasa por Crows Nest, Balmain o cualquiera de las subidas más conocidas de Sídney, o si llegás al trabajo de traje, una e-bike vale la inversión. El mercado de e-bikes maduró mucho entre 2025 y 2026, con más opciones livianas y accesibles disponibles.',
      '<strong>Specialized Turbo Vado SL 4.0</strong> — ~$3,999 · 10kg, barely feels like an e-bike, 130km range':
        '<strong>Specialized Turbo Vado SL 4.0</strong> — ~$3.999 · 10 kg, casi no se siente como una e-bike, 130 km de autonomía',
      '<strong>Giant Explore E+ 2</strong> — ~$2,999 · Yamaha motor, integrated battery, rack included':
        '<strong>Giant Explore E+ 2</strong> — ~$2.999 · motor Yamaha, batería integrada, incluye portaequipaje',
      '<strong>Aventon Pace 500.3</strong> — ~$1,899 · budget-friendly, throttle available, practical for flat routes':
        '<strong>Aventon Pace 500.3</strong> — ~$1.899 · económica, con acelerador disponible, práctica para recorridos planos',
      'Note: Under NSW law, e-bikes must have a maximum output of 250W and motor assist must cut off at 25km/h to be legal on shared paths. See our <a href="/blog/electric-bike-laws-nsw-2026">NSW e-bike laws guide</a> for full details.':
        'Nota: según la ley de NSW, las e-bikes deben tener una potencia máxima de 250W y la asistencia del motor tiene que cortarse a los 25 km/h para ser legales en las sendas compartidas. Mirá nuestra <a href="/es/blog/electric-bike-laws-nsw-2026">guía de leyes de e-bikes en NSW</a> para todos los detalles.',
      '3. Gravel Bikes — Best for Variety': '3. Bicis Gravel: las Más Versátiles',
      'If your commute mixes sealed bike paths, gravel trails and the occasional rough section (common around the Cooks River or Northern Beaches), a gravel bike offers flexibility. They\'re fast on road and capable off it.':
        'Si tu trayecto combina sendas asfaltadas, caminos de gravel y algún tramo irregular (algo común cerca del Cooks River o en Northern Beaches), una bici gravel te da flexibilidad. Son rápidas en el asfalto y capaces fuera de él.',
      '<strong>Trek Checkpoint ALR 5</strong> — ~$2,299 · versatile, great tyre clearance, commuter-ready':
        '<strong>Trek Checkpoint ALR 5</strong> — ~$2.299 · versátil, gran espacio para cubiertas, lista para el día a día',
      '<strong>Giant Revolt 2</strong> — ~$1,499 · affordable entry into gravel, great value':
        '<strong>Giant Revolt 2</strong> — ~$1.499 · entrada accesible al mundo gravel, muy buena relación precio-calidad',
      '4. Folding Bikes — Best for Multi-Modal Commutes':
        '4. Bicis Plegables: las Mejores para Combinar con Otros Medios',
      'If you\'re combining cycling with the train to Central or Town Hall, a folding bike is a practical option — especially from 2025 when Sydney Trains relaxed their bike restrictions on most lines.':
        'Si combinás la bici con el tren hasta Central o Town Hall, una bici plegable es una opción práctica, sobre todo desde 2025, cuando Sydney Trains flexibilizó las restricciones para bicis en la mayoría de las líneas.',
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
      'A pre-commute tune-up ensures your bike is dialled in — brakes bedded in, gears indexed, tyres at the right pressure. We come to you in Sydney.':
        'Un ajuste antes de empezar a usarla asegura que quede bien puesta a punto: frenos asentados, cambios indexados, cubiertas con la presión correcta. Vamos hasta vos en Sídney.',
    },
    zh: {
      'Best Bikes for Sydney Commuting 2026 | Dr. Bike Sydney': '2026年悉尼通勤自行车推荐 | Dr. Bike Sydney',
      'The best bikes for commuting in Sydney in 2026 — hybrid, e-bike, gravel and folding options reviewed for inner-city riders.':
        '2026年悉尼通勤自行车推荐——为市区骑行者评测的混合车、电动车、砾石车和折叠车。',
      '🚲 Buyer\'s Guide': '🚲 购车指南',
      'By Dr. Bike Sydney · June 2026 · 6 min read': '作者：Dr. Bike Sydney · 2026年6月 · 阅读需6分钟',
      "Sydney's cycling infrastructure has expanded significantly in recent years, with protected lanes on Crown Street, College Street and Anzac Parade making inner-city commuting more viable than ever. But choosing the right commuter bike for Sydney's unique mix of flat stretches, hilly suburbs and occasionally wet roads matters more than many riders think.":
        '近年来悉尼的骑行基础设施大幅扩展，Crown Street、College Street 和 Anzac Parade 上的受保护车道让市区通勤骑行比以往任何时候都更可行。但为悉尼这种平路、丘陵郊区和偶尔湿滑路面并存的独特路况选对通勤自行车，比许多骑行者想象的更重要。',
      'Here\'s our 2026 guide — written by mechanics with 5+ years servicing Sydney commuters daily.':
        '以下是我们的2026年指南——由每天为悉尼通勤者提供服务、拥有5年以上经验的技师撰写。',
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
      '<strong>Specialized Turbo Vado SL 4.0</strong> — ~$3,999 · 10kg, barely feels like an e-bike, 130km range':
        '<strong>Specialized Turbo Vado SL 4.0</strong> — 约 $3,999 · 车重 10 公斤，几乎感觉不到是电动车，续航 130 公里',
      '<strong>Giant Explore E+ 2</strong> — ~$2,999 · Yamaha motor, integrated battery, rack included':
        '<strong>Giant Explore E+ 2</strong> — 约 $2,999 · 雅马哈电机，内置电池，含货架',
      '<strong>Aventon Pace 500.3</strong> — ~$1,899 · budget-friendly, throttle available, practical for flat routes':
        '<strong>Aventon Pace 500.3</strong> — 约 $1,899 · 价格亲民，配备油门，适合平坦路线',
      'Note: Under NSW law, e-bikes must have a maximum output of 250W and motor assist must cut off at 25km/h to be legal on shared paths. See our <a href="/blog/electric-bike-laws-nsw-2026">NSW e-bike laws guide</a> for full details.':
        '注意：根据新州法律，电动自行车最大功率不得超过 250W，电机助力必须在时速 25 公里时自动切断，才能合法在共享道路上使用。完整细节请参见我们的<a href="/zh/blog/electric-bike-laws-nsw-2026">新州电动自行车法规指南</a>。',
      '3. Gravel Bikes — Best for Variety': '3. 砾石车——最具多功能性',
      'If your commute mixes sealed bike paths, gravel trails and the occasional rough section (common around the Cooks River or Northern Beaches), a gravel bike offers flexibility. They\'re fast on road and capable off it.':
        '如果您的通勤路线混合了铺装自行车道、砾石小径以及偶尔的崎岖路段（在 Cooks River 附近或 Northern Beaches 一带很常见），砾石车能提供更大的灵活性。它们在公路上速度快，在非铺装路面上也应付自如。',
      '<strong>Trek Checkpoint ALR 5</strong> — ~$2,299 · versatile, great tyre clearance, commuter-ready':
        '<strong>Trek Checkpoint ALR 5</strong> — 约 $2,299 · 多功能，轮胎间隙充足，适合日常通勤',
      '<strong>Giant Revolt 2</strong> — ~$1,499 · affordable entry into gravel, great value':
        '<strong>Giant Revolt 2</strong> — 约 $1,499 · 入门砾石车的实惠之选，性价比高',
      '4. Folding Bikes — Best for Multi-Modal Commutes': '4. 折叠车——最适合多种交通方式组合通勤',
      'If you\'re combining cycling with the train to Central or Town Hall, a folding bike is a practical option — especially from 2025 when Sydney Trains relaxed their bike restrictions on most lines.':
        '如果您需要骑行搭配火车前往 Central 或 Town Hall，折叠车是个实用的选择——尤其是自2025年起，Sydney Trains 放宽了大多数线路对自行车的限制之后。',
      '<strong>Brompton C Line Explore</strong> — ~$2,499 · the gold standard, folds in 20 seconds, carries on any train':
        '<strong>Brompton C Line Explore</strong> — 约 $2,499 · 黄金标准之选，20秒即可折叠，可携带上任何火车',
      '<strong>Dahon Mariner D8</strong> — ~$699 · budget option, heavier but functional':
        '<strong>Dahon Mariner D8</strong> — 约 $699 · 经济之选，较重但实用',
      '💡 <strong>Pro tip:</strong> Folding bikes need regular cable tension checks as the folding joints flex the cables over time. Book a tune-up every 6 months.':
        '💡 <strong>专业提示：</strong>折叠车需要定期检查线缆张力，因为折叠关节会随着时间推移使线缆松弛。建议每6个月预约一次基础保养。',
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
      'A pre-commute tune-up ensures your bike is dialled in — brakes bedded in, gears indexed, tyres at the right pressure. We come to you in Sydney.':
        '通勤前的基础保养能确保您的自行车调校到位——刹车磨合、变速精准、胎压合适。我们上门服务悉尼全境。',
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
      '⛑️ Safety': '⛑️ Seguridad',
      'By Dr. Bike Sydney · June 2026 · 6 min read': 'Por Dr. Bike Sydney · junio 2026 · 6 min de lectura',
      'Sydney has made enormous strides in cycling infrastructure over the past five years, with protected lanes on College Street, Pitt Street Mall surrounds, Bourke Street in Surry Hills, and new routes on the lower North Shore. But riding in a major city still requires situational awareness and knowledge of the local rules.':
        'Sídney avanzó muchísimo en infraestructura ciclista en los últimos cinco años, con carriles protegidos en College Street, los alrededores de Pitt Street Mall, Bourke Street en Surry Hills y nuevas rutas en el North Shore bajo. Pero andar en bici en una ciudad grande igual requiere estar atento al entorno y conocer las reglas locales.',
      'Here are the most important cycling safety tips for Sydney roads — written by a mechanic who rides and services bikes across the city daily.':
        'Estos son los consejos de seguridad más importantes para andar en bici por las calles de Sídney, escritos por un mecánico que anda y arregla bicis en toda la ciudad todos los días.',
      '1. Understand NSW Road Rules for Cyclists': '1. Conocé las Reglas de Tránsito de NSW para Ciclistas',
      'Many cyclists unknowingly break the law — not out of recklessness, but because the rules are poorly communicated. Key NSW rules:':
        'Muchos ciclistas infringen la ley sin saberlo, no por imprudencia, sino porque las reglas están mal comunicadas. Las reglas clave de NSW son:',
      'You must ride as far left as practicable (not as far left as possible — you can take the lane when safe)':
        'Tenés que andar lo más a la izquierda que sea practicable (no lo más a la izquierda posible: podés ocupar el carril cuando sea seguro)',
      'You can ride two abreast (side-by-side), but not more than 1.5m apart':
        'Podés andar de a dos en paralelo, pero sin superar 1,5 m de distancia entre ustedes',
      'You must use a bike lane if one is available (with some exceptions)':
        'Tenés que usar el carril bici si hay uno disponible (con algunas excepciones)',
      'Helmets are compulsory for all riders of all ages — fine up to $344':
        'El casco es obligatorio para todos los ciclistas, de cualquier edad: la multa llega a $344',
      'Lights are compulsory at night — white front, red rear': 'Las luces son obligatorias de noche: blanca adelante, roja atrás',
      'Using a mobile phone while riding is illegal — fine up to $457':
        'Usar el celular mientras andás en bici es ilegal: la multa llega a $457',
      '2. The 1-Metre Rule (Passing Distance)': '2. La Regla del Metro (Distancia de Sobrepaso)',
      'Since 2016, NSW drivers must give cyclists at least 1 metre when overtaking in a 60km/h or below zone, and 1.5 metres in zones above 60km/h. Knowing this helps you understand when a pass was legal and gives you grounds to report dangerous driving (dashcam footage is useful).':
        'Desde 2016, los conductores de NSW tienen que dejar al menos 1 metro al sobrepasar a un ciclista en zonas de 60 km/h o menos, y 1,5 metros en zonas de más de 60 km/h. Saber esto te ayuda a entender cuándo un sobrepaso fue legal y te da argumentos para denunciar una maniobra peligrosa (una cámara de a bordo sirve de mucho).',
      '💡 A rear-facing dashcam like the Cycliq Fly12 CE is one of the best investments a Sydney cyclist can make. Footage has been used successfully in police reports.':
        '💡 Una cámara trasera como la Cycliq Fly12 CE es una de las mejores inversiones que puede hacer un ciclista en Sídney. Las grabaciones se usaron con éxito en denuncias policiales.',
      '3. High-Risk Intersections to Know': '3. Intersecciones de Alto Riesgo que Conviene Conocer',
      'These Sydney intersections have the highest reported near-misses and cyclist incidents:':
        'Estas intersecciones de Sídney tienen la mayor cantidad de casi-accidentes e incidentes de ciclistas reportados:',
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
      'Getting "doored" — when a car door is opened into a cyclist\'s path — is one of the most common causes of serious injury in Sydney. The danger zone is approximately 1 metre from parked car doors.':
        'Que te "abran la puerta" (cuando alguien abre la puerta de un auto justo en el camino de un ciclista) es una de las causas más comunes de lesiones graves en Sídney. La zona de peligro es de aproximadamente 1 metro desde las puertas de los autos estacionados.',
      'The safest technique is to ride outside this zone and watch for cars with occupants, movement inside cars, brake lights, and hazard lights. Slow down near stationary rideshare vehicles especially.':
        'La técnica más segura es andar por fuera de esa zona y estar atento a los autos con gente adentro, movimiento dentro del auto, luces de freno y balizas. Bajá la velocidad especialmente cerca de vehículos de apps de transporte detenidos.',
      '5. Wet Weather Riding in Sydney': '5. Andar con Lluvia en Sídney',
      'Braking distances increase 40–60% on wet tarmac — start braking earlier':
        'Las distancias de frenado aumentan entre un 40% y un 60% sobre asfalto mojado: empezá a frenar antes',
      'Steel drain covers, tram tracks and painted road markings become extremely slippery':
        'Las tapas de desagüe de metal, las vías de tranvía y las marcas pintadas en la calle se ponen extremadamente resbaladizas',
      'Reduce tyre pressure by 5–8 PSI for better grip in wet conditions':
        'Bajá la presión de las cubiertas entre 5 y 8 PSI para mejor agarre en condiciones húmedas',
      'Use a wet lube before the ride — water flushes dry lube in minutes':
        'Usá lubricante para mojado antes de salir: el agua se lleva el lubricante seco en minutos',
      'Wear high-visibility gear — grey days reduce motorist visibility':
        'Usá ropa de alta visibilidad: los días grises reducen la visibilidad para los conductores',
      '6. Night Riding': '6. Andar de Noche',
      'NSW law requires a white front light and red rear light between sunset and sunrise. Beyond the legal minimum, for urban Sydney riding we recommend a minimum 500 lumens front light visible at 200m+ and a rear light with a flash mode visible at 150m. Many quality options are available under $100.':
        'La ley de NSW exige luz blanca adelante y luz roja atrás entre la puesta y la salida del sol. Más allá del mínimo legal, para andar en la Sídney urbana recomendamos una luz delantera de al menos 500 lúmenes visible a más de 200 m y una luz trasera con modo intermitente visible a 150 m. Hay muchas opciones de calidad por menos de $100.',
      'Riding safely starts with a safe bike': 'Andar seguro empieza con una bici segura',
      'Worn brakes, incorrect tyre pressure and a dry chain are all safety hazards. Our Tune-Up covers all of it — at your home, office or park.':
        'Frenos gastados, presión de cubiertas incorrecta y una cadena seca son todos riesgos de seguridad. Nuestro Ajuste cubre todo eso, en tu casa, oficina o el parque.',
    },
    zh: {
      'Cycling Safety Tips for Sydney Roads 2026 | Dr. Bike Sydney': '2026年悉尼道路骑行安全提示 | Dr. Bike Sydney',
      'Essential cycling safety tips for Sydney riders — NSW road rules, intersection risks, the door zone, wet weather riding and night cycling guide.':
        '悉尼骑行者必知的安全提示——新州道路规则、路口风险、车门盲区、雨天骑行与夜间骑行指南。',
      'Cycling Safety Tips for Sydney Roads 2026': '2026年悉尼道路骑行安全提示',
      '⛑️ Safety': '⛑️ 安全',
      'By Dr. Bike Sydney · June 2026 · 6 min read': '作者：Dr. Bike Sydney · 2026年6月 · 阅读需6分钟',
      'Sydney has made enormous strides in cycling infrastructure over the past five years, with protected lanes on College Street, Pitt Street Mall surrounds, Bourke Street in Surry Hills, and new routes on the lower North Shore. But riding in a major city still requires situational awareness and knowledge of the local rules.':
        '过去五年间，悉尼在骑行基础设施方面取得了长足进步，College Street、Pitt Street Mall 周边、Surry Hills 的 Bourke Street 都设有受保护车道，下北岸地区也开辟了新路线。但在大城市骑行仍然需要具备情境意识，并了解当地规则。',
      'Here are the most important cycling safety tips for Sydney roads — written by a mechanic who rides and services bikes across the city daily.':
        '以下是在悉尼道路骑行时最重要的安全提示——由一位每天在全市骑行并维修自行车的技师撰写。',
      '1. Understand NSW Road Rules for Cyclists': '1. 了解新州骑行者道路规则',
      'Many cyclists unknowingly break the law — not out of recklessness, but because the rules are poorly communicated. Key NSW rules:':
        '许多骑行者在不知情的情况下违反了法规——并非出于鲁莽，而是因为规则的宣传不到位。以下是新州的关键规则：',
      'You must ride as far left as practicable (not as far left as possible — you can take the lane when safe)':
        '必须尽可能靠左侧骑行（并非绝对靠左——在安全的情况下可以占用整条车道）',
      'You can ride two abreast (side-by-side), but not more than 1.5m apart':
        '可以两人并排骑行，但间距不得超过1.5米',
      'You must use a bike lane if one is available (with some exceptions)': '如有自行车道必须使用（存在部分例外情况）',
      'Helmets are compulsory for all riders of all ages — fine up to $344':
        '所有年龄段骑行者均须强制佩戴头盔——罚款最高可达 $344',
      'Lights are compulsory at night — white front, red rear': '夜间必须使用车灯——前白后红',
      'Using a mobile phone while riding is illegal — fine up to $457': '骑行时使用手机属违法行为——罚款最高可达 $457',
      '2. The 1-Metre Rule (Passing Distance)': '2. 一米超车距离规则',
      'Since 2016, NSW drivers must give cyclists at least 1 metre when overtaking in a 60km/h or below zone, and 1.5 metres in zones above 60km/h. Knowing this helps you understand when a pass was legal and gives you grounds to report dangerous driving (dashcam footage is useful).':
        '自2016年起，新州驾驶员在限速60公里/小时及以下路段超车骑行者时，必须保持至少1米的距离；限速60公里/小时以上路段则需保持1.5米。了解这一点能帮您判断超车是否合法，也为您举报危险驾驶提供依据（行车记录仪画面会很有用）。',
      '💡 A rear-facing dashcam like the Cycliq Fly12 CE is one of the best investments a Sydney cyclist can make. Footage has been used successfully in police reports.':
        '💡 像 Cycliq Fly12 CE 这样的后置行车记录仪，是悉尼骑行者最值得投资的装备之一。这类拍摄画面已被成功用于警方报案。',
      '3. High-Risk Intersections to Know': '3. 需要留意的高风险路口',
      'These Sydney intersections have the highest reported near-misses and cyclist incidents:':
        '以下悉尼路口报告的骑行险情和事故发生率最高：',
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
      'Getting "doored" — when a car door is opened into a cyclist\'s path — is one of the most common causes of serious injury in Sydney. The danger zone is approximately 1 metre from parked car doors.':
        '被"开门撞"（即停车的车门恰好在骑行者行进路线上打开）是悉尼造成严重伤害最常见的原因之一。危险区域大约为距停放车辆车门1米范围内。',
      'The safest technique is to ride outside this zone and watch for cars with occupants, movement inside cars, brake lights, and hazard lights. Slow down near stationary rideshare vehicles especially.':
        '最安全的做法是骑行时避开这一区域，并留意车内是否有人、车内是否有动作、刹车灯和危险警示灯。尤其是经过停靠的网约车时，请减速慢行。',
      '5. Wet Weather Riding in Sydney': '5. 悉尼雨天骑行',
      'Braking distances increase 40–60% on wet tarmac — start braking earlier':
        '湿滑路面上的制动距离会增加40%–60%——请提前开始刹车',
      'Steel drain covers, tram tracks and painted road markings become extremely slippery':
        '金属排水盖、有轨电车轨道和路面油漆标线会变得极其湿滑',
      'Reduce tyre pressure by 5–8 PSI for better grip in wet conditions':
        '将胎压降低5–8 PSI，可在湿滑路况下获得更好的抓地力',
      'Use a wet lube before the ride — water flushes dry lube in minutes':
        '骑行前使用湿性润滑油——干性润滑油在雨中几分钟就会被冲掉',
      'Wear high-visibility gear — grey days reduce motorist visibility': '穿着高能见度装备——阴天会降低驾驶员的能见度',
      '6. Night Riding': '6. 夜间骑行',
      'NSW law requires a white front light and red rear light between sunset and sunrise. Beyond the legal minimum, for urban Sydney riding we recommend a minimum 500 lumens front light visible at 200m+ and a rear light with a flash mode visible at 150m. Many quality options are available under $100.':
        '新州法律规定，日落至日出期间必须使用前白灯和后红灯。除法定最低要求外，我们建议在悉尼市区骑行时使用至少500流明、200米以上可见的前灯，以及具备闪烁模式、150米可见的后灯。市面上有许多优质选择，价格在 $100 以内。',
      'Riding safely starts with a safe bike': '安全骑行始于一辆安全的自行车',
      'Worn brakes, incorrect tyre pressure and a dry chain are all safety hazards. Our Tune-Up covers all of it — at your home, office or park.':
        '刹车磨损、胎压不当、链条干涩都是安全隐患。我们的基础保养能全部覆盖——在您的家中、办公室或公园均可进行。',
    },
  },
  'electric-bike-laws-nsw-2026': {
    es: {
      'Electric Bike Laws NSW 2026 — Complete Guide | Dr. Bike Sydney':
        'Leyes de E-Bikes en NSW 2026 — Guía Completa | Dr. Bike Sydney',
      'Complete guide to e-bike laws in NSW 2026. Legal PAPC definition, throttle rules, where you can ride, helmet requirements and fines explained.':
        'Guía completa de las leyes de e-bikes en NSW 2026. Definición legal de PAPC, reglas sobre acelerador, dónde podés andar, requisitos de casco y multas explicadas.',
      'Electric Bike Laws NSW 2026 — Complete Guide': 'Leyes de E-Bikes en NSW 2026 — Guía Completa',
      '⚡ Legal': '⚡ Legal',
      'By Dr. Bike Sydney · June 2026 · 5 min read': 'Por Dr. Bike Sydney · junio 2026 · 5 min de lectura',
      'E-bikes have exploded in popularity across Sydney since 2024, with models from Specialized, Giant, Aventon and dozens of Chinese brands flooding the market. But NSW e-bike laws are stricter than many riders realise — and enforcement is increasing, especially in inner-city areas.':
        'Las e-bikes explotaron en popularidad en Sídney desde 2024, con modelos de Specialized, Giant, Aventon y decenas de marcas chinas inundando el mercado. Pero las leyes de e-bikes en NSW son más estrictas de lo que muchos ciclistas creen, y los controles están aumentando, sobre todo en el centro de la ciudad.',
      'Here\'s what you need to know to ride legally in NSW in 2026.':
        'Esto es lo que necesitás saber para andar de forma legal en NSW en 2026.',
      'Legal E-Bike Definition in NSW': 'Definición Legal de E-Bike en NSW',
      'Under NSW law and Australian Road Rules, a <strong>legally compliant power-assisted pedal cycle (PAPC)</strong> must:':
        'Según la ley de NSW y las Reglas de Tránsito Australianas, una <strong>bicicleta con pedaleo asistido (PAPC) legalmente compatible</strong> debe:',
      '✅ Legal — Power-Assisted Pedal Cycle (PAPC)': '✅ Legal: Bicicleta con Pedaleo Asistido (PAPC)',
      'Motor output: maximum <strong>250W continuous</strong>. Motor must assist pedalling only (pedelec) and must cut off at <strong>25 km/h</strong>. Must be a bicycle in form. No minimum age restriction. No licence required. Can be ridden on bike paths and lanes.':
        'Potencia del motor: máximo <strong>250W continuos</strong>. El motor solo puede asistir el pedaleo (pedelec) y debe cortarse a los <strong>25 km/h</strong>. Tiene que tener forma de bicicleta. Sin restricción de edad mínima. No requiere licencia. Se puede andar por sendas y carriles bici.',
      '🚫 Illegal on Paths and Lanes — Motorised Bicycle': '🚫 Ilegal en Sendas y Carriles: Bicicleta Motorizada',
      'Motor output above 250W. Throttle-only operation above 6 km/h. Motor does not cut off at 25 km/h. These are classified as motorised vehicles — require registration, licence and insurance. Cannot be ridden on shared paths or bike lanes.':
        'Potencia del motor superior a 250W. Funcionamiento solo con acelerador por encima de los 6 km/h. El motor no se corta a los 25 km/h. Se clasifican como vehículos motorizados: requieren patente, licencia y seguro. No se pueden usar en sendas compartidas ni carriles bici.',
      'Throttle-Only E-Bikes — The Grey Area': 'E-Bikes Solo con Acelerador: la Zona Gris',
      'Many popular e-bikes sold in 2024–2026 (including some Aventon, RadPower and Mate models) have throttle modes that allow riding without pedalling. In NSW, throttle mode above 6 km/h makes a bike a "motorised bicycle" — not a PAPC.':
        'Muchas e-bikes populares vendidas entre 2024 y 2026 (incluyendo algunos modelos de Aventon, RadPower y Mate) tienen modo acelerador que permite andar sin pedalear. En NSW, el modo acelerador por encima de los 6 km/h convierte a la bici en una "bicicleta motorizada", no en una PAPC.',
      'This means: if your e-bike has throttle-only mode, you are legally required to use only the pedal-assist mode on public roads, bike paths and shared paths in NSW. Using the throttle on a path technically makes you unlicensed and unregistered.':
        'Esto significa que si tu e-bike tiene modo solo-acelerador, estás legalmente obligado a usar solamente el modo de asistencia al pedaleo en calles públicas, sendas y caminos compartidos de NSW. Usar el acelerador en una senda técnicamente te deja sin licencia ni patente.',
      '⚠️ Fines for riding an unregistered/unlicensed motor vehicle can exceed $2,000. RMS and police are increasing enforcement at known e-bike hotspots.':
        '⚠️ Las multas por andar en un vehículo motorizado sin patente ni licencia pueden superar los $2.000. RMS y la policía están aumentando los controles en las zonas conocidas de mucho uso de e-bikes.',
      'Helmet Requirements': 'Requisitos de Casco',
      'All cyclists — including e-bike riders — must wear an approved bicycle helmet in NSW. An "approved" helmet must meet Australian Standard AS/NZS 2063:2008 or equivalent. You cannot use a motorcycle helmet as a substitute for a bicycle helmet (though a motorcycle helmet is also legal for cyclists).':
        'Todos los ciclistas, incluidos los de e-bike, tienen que usar un casco de bicicleta aprobado en NSW. Un casco "aprobado" tiene que cumplir con el estándar australiano AS/NZS 2063:2008 o equivalente. No podés usar un casco de moto como sustituto de uno de bici (aunque un casco de moto también es legal para ciclistas).',
      'Where Can You Ride an E-Bike in Sydney?': '¿Dónde Podés Andar en E-Bike en Sídney?',
      '✅ All public roads (where cyclists are permitted)': '✅ Todas las calles públicas (donde se permite andar en bici)',
      '✅ Dedicated bike lanes and shared paths': '✅ Carriles bici exclusivos y sendas compartidas',
      '✅ Centennial Park circuit (legal PAPC only)': '✅ El circuito de Centennial Park (solo PAPC legales)',
      '⚠️ National Parks — check individual park rules; some restrict e-bikes on certain trails':
        '⚠️ Parques Nacionales: revisá las reglas de cada parque; algunos restringen las e-bikes en ciertos senderos',
      '🚫 Footpaths (for riders over 12 years, except when supervising a child)':
        '🚫 Veredas (para mayores de 12 años, salvo cuando estén supervisando a un niño)',
      'Speed Limits': 'Límites de Velocidad',
      'E-bike riders must comply with all road speed limits. On shared paths in NSW, the default speed limit for cyclists is <strong>10 km/h</strong> when pedestrians are present. On bike paths with no limit posted, a safe speed relative to conditions applies. Motor assist must cut off at 25 km/h regardless.':
        'Los ciclistas de e-bike tienen que respetar todos los límites de velocidad de la calle. En las sendas compartidas de NSW, el límite por defecto para ciclistas es de <strong>10 km/h</strong> cuando hay peatones presentes. En sendas sin límite señalizado, aplica una velocidad segura según las condiciones. La asistencia del motor tiene que cortarse a los 25 km/h de todas formas.',
      'Servicing NSW-Compliant E-Bikes': 'Mantenimiento de E-Bikes que Cumplen con la Ley de NSW',
      'E-bikes require different service intervals than conventional bikes, particularly around the motor, battery connections and rear hub. We service all major brands including Bosch, Shimano Steps, Yamaha and Brose-equipped bikes.':
        'Las e-bikes necesitan intervalos de servicio distintos a las bicis convencionales, sobre todo en el motor, las conexiones de la batería y el buje trasero. Atendemos todas las marcas principales, incluidas las bicis con Bosch, Shimano Steps, Yamaha y Brose.',
      'E-bike service in Sydney': 'Service de E-Bikes en Sídney',
      'We service all major e-bike brands — motor connections, battery health checks, brake adjustments and full tune-ups. We come to you.':
        'Atendemos todas las marcas principales de e-bikes: conexiones del motor, chequeo de estado de la batería, ajuste de frenos y ajustes completos. Vamos hasta vos.',
      'Book an E-Bike Service →': 'Reservar un Service de E-Bike →',
    },
    zh: {
      'Electric Bike Laws NSW 2026 — Complete Guide | Dr. Bike Sydney':
        '2026年新州电动自行车法规——完整指南 | Dr. Bike Sydney',
      'Complete guide to e-bike laws in NSW 2026. Legal PAPC definition, throttle rules, where you can ride, helmet requirements and fines explained.':
        '2026年新州电动自行车法规完整指南。合法 PAPC 定义、油门使用规则、可骑行区域、头盔要求及罚款说明。',
      'Electric Bike Laws NSW 2026 — Complete Guide': '2026年新州电动自行车法规——完整指南',
      '⚡ Legal': '⚡ 法律',
      'By Dr. Bike Sydney · June 2026 · 5 min read': '作者：Dr. Bike Sydney · 2026年6月 · 阅读需5分钟',
      'E-bikes have exploded in popularity across Sydney since 2024, with models from Specialized, Giant, Aventon and dozens of Chinese brands flooding the market. But NSW e-bike laws are stricter than many riders realise — and enforcement is increasing, especially in inner-city areas.':
        '自2024年以来，电动自行车在悉尼的人气暴涨，Specialized、Giant、Aventon 以及数十个中国品牌的车型涌入市场。但新州的电动自行车法规比许多骑行者想象的更严格——执法力度也在不断加强，尤其是在市区一带。',
      'Here\'s what you need to know to ride legally in NSW in 2026.': '以下是您在2026年于新州合法骑行所需了解的内容。',
      'Legal E-Bike Definition in NSW': '新州电动自行车的法律定义',
      'Under NSW law and Australian Road Rules, a <strong>legally compliant power-assisted pedal cycle (PAPC)</strong> must:':
        '根据新州法律和澳大利亚道路规则，一辆<strong>合法的电助力脚踏车（PAPC）</strong>必须满足：',
      '✅ Legal — Power-Assisted Pedal Cycle (PAPC)': '✅ 合法——电助力脚踏车（PAPC）',
      'Motor output: maximum <strong>250W continuous</strong>. Motor must assist pedalling only (pedelec) and must cut off at <strong>25 km/h</strong>. Must be a bicycle in form. No minimum age restriction. No licence required. Can be ridden on bike paths and lanes.':
        '电机功率：连续输出最大<strong>250W</strong>。电机只能辅助踏行（pedelec 模式），且必须在时速<strong>25公里</strong>时切断。外形必须为自行车。无最低年龄限制。无需驾照。可在自行车道和车道上骑行。',
      '🚫 Illegal on Paths and Lanes — Motorised Bicycle': '🚫 不得在道路和车道上使用——机动自行车',
      'Motor output above 250W. Throttle-only operation above 6 km/h. Motor does not cut off at 25 km/h. These are classified as motorised vehicles — require registration, licence and insurance. Cannot be ridden on shared paths or bike lanes.':
        '电机功率超过250W。时速超过6公里时仅靠油门驱动。电机在时速25公里时不会切断。这类车辆被归类为机动车辆——需要注册登记、驾照和保险。不得在共享道路或自行车道上使用。',
      'Throttle-Only E-Bikes — The Grey Area': '纯油门电动自行车——灰色地带',
      'Many popular e-bikes sold in 2024–2026 (including some Aventon, RadPower and Mate models) have throttle modes that allow riding without pedalling. In NSW, throttle mode above 6 km/h makes a bike a "motorised bicycle" — not a PAPC.':
        '2024至2026年间销售的许多热门电动自行车（包括部分 Aventon、RadPower 和 Mate 车型）配备了无需踏行即可骑行的油门模式。在新州，时速超过6公里时使用油门模式会使该车被归类为"机动自行车"，而非 PAPC。',
      'This means: if your e-bike has throttle-only mode, you are legally required to use only the pedal-assist mode on public roads, bike paths and shared paths in NSW. Using the throttle on a path technically makes you unlicensed and unregistered.':
        '这意味着：如果您的电动自行车配有纯油门模式，在新州的公共道路、自行车道和共享道路上，您依法只能使用踏行辅助模式。在道路上使用油门，从技术上讲即视为无照无牌驾驶。',
      '⚠️ Fines for riding an unregistered/unlicensed motor vehicle can exceed $2,000. RMS and police are increasing enforcement at known e-bike hotspots.':
        '⚠️ 驾驶无牌无照机动车辆的罚款可能超过 $2,000。RMS 和警方正在电动自行车热点区域加强执法力度。',
      'Helmet Requirements': '头盔要求',
      'All cyclists — including e-bike riders — must wear an approved bicycle helmet in NSW. An "approved" helmet must meet Australian Standard AS/NZS 2063:2008 or equivalent. You cannot use a motorcycle helmet as a substitute for a bicycle helmet (though a motorcycle helmet is also legal for cyclists).':
        '在新州，所有骑行者——包括电动自行车骑行者——都必须佩戴经认证的自行车头盔。"经认证"头盔须符合澳大利亚标准 AS/NZS 2063:2008 或同等标准。不能用摩托车头盔代替自行车头盔（不过骑行者佩戴摩托车头盔也是合法的）。',
      'Where Can You Ride an E-Bike in Sydney?': '在悉尼哪里可以骑电动自行车？',
      '✅ All public roads (where cyclists are permitted)': '✅ 所有允许骑行者通行的公共道路',
      '✅ Dedicated bike lanes and shared paths': '✅ 专用自行车道和共享道路',
      '✅ Centennial Park circuit (legal PAPC only)': '✅ Centennial Park 环道（仅限合法 PAPC）',
      '⚠️ National Parks — check individual park rules; some restrict e-bikes on certain trails':
        '⚠️ 国家公园——请查看各公园的具体规定；部分公园限制电动自行车通行某些步道',
      '🚫 Footpaths (for riders over 12 years, except when supervising a child)':
        '🚫 人行道（12岁以上骑行者禁止使用，监护儿童骑行时除外）',
      'Speed Limits': '速度限制',
      'E-bike riders must comply with all road speed limits. On shared paths in NSW, the default speed limit for cyclists is <strong>10 km/h</strong> when pedestrians are present. On bike paths with no limit posted, a safe speed relative to conditions applies. Motor assist must cut off at 25 km/h regardless.':
        '电动自行车骑行者必须遵守所有道路限速规定。在新州的共享道路上，有行人时骑行者的默认限速为<strong>10公里/小时</strong>。在未标注限速的自行车道上，应根据路况保持安全速度。无论如何，电机助力都必须在时速25公里时切断。',
      'Servicing NSW-Compliant E-Bikes': '符合新州法规的电动自行车保养',
      'E-bikes require different service intervals than conventional bikes, particularly around the motor, battery connections and rear hub. We service all major brands including Bosch, Shimano Steps, Yamaha and Brose-equipped bikes.':
        '电动自行车的保养周期与传统自行车不同，尤其是电机、电池连接和后轮毂部分。我们为所有主流品牌提供服务，包括搭载 Bosch、Shimano Steps、Yamaha 和 Brose 系统的车型。',
      'E-bike service in Sydney': '悉尼电动自行车服务',
      'We service all major e-bike brands — motor connections, battery health checks, brake adjustments and full tune-ups. We come to you.':
        '我们为所有主流电动自行车品牌提供服务——电机连接检查、电池健康检测、刹车调整及全面保养。我们提供上门服务。',
      'Book an E-Bike Service →': '预订电动自行车服务 →',
    },
  },
  'how-to-clean-your-bike-chain-sydney': {
    es: {
      'How to Clean Your Bike Chain in Sydney | Dr. Bike Sydney':
        'Cómo Limpiar la Cadena de tu Bici en Sídney | Dr. Bike Sydney',
      'Step-by-step guide to cleaning and lubricating your bike chain in Sydney. Wet vs dry lube, how often to clean, and when to replace your chain.':
        'Guía paso a paso para limpiar y lubricar la cadena de tu bici en Sídney. Lubricante húmedo vs. seco, cada cuánto limpiarla y cuándo reemplazar la cadena.',
      'How to Clean Your Bike Chain in Sydney': 'Cómo Limpiar la Cadena de tu Bici en Sídney',
      '🔧 Maintenance': '🔧 Mantenimiento',
      'By Dr. Bike Sydney · June 2026 · 5 min read': 'Por Dr. Bike Sydney · junio 2026 · 5 min de lectura',
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
      Degrease: 'Desengrasar',
      'Apply degreaser to the chain while slowly backpedalling. Let it soak for 2–3 minutes. If using a chain cleaning tool, fill with degreaser and run the chain through for 30 seconds.':
        'Aplicá el desengrasante en la cadena mientras pedaleás despacio hacia atrás. Dejalo actuar 2 a 3 minutos. Si usás un dispositivo limpiacadenas, llenalo con desengrasante y pasá la cadena por 30 segundos.',
      Scrub: 'Cepillar',
      'Use a chain brush or old toothbrush to scrub the chain links, cassette cogs and chainrings. Focus on the inside of the chain where grit accumulates between plates.':
        'Usá un cepillo para cadena o un cepillo de dientes viejo para cepillar los eslabones, los piñones del cassette y los platos. Prestá especial atención a la parte interna de la cadena, donde se acumula la tierra entre las placas.',
      Rinse: 'Enjuagar',
      'Wipe the chain thoroughly with a clean rag while backpedalling. Remove all degreaser residue — lube doesn\'t bond well to a degreased chain that still has chemical residue.':
        'Limpiá bien la cadena con un trapo limpio mientras pedaleás hacia atrás. Sacá todo resto de desengrasante: el lubricante no se adhiere bien a una cadena que todavía tiene residuo químico.',
      Dry: 'Secar',
      'Wipe dry with a second clean rag. If possible, leave the bike in a warm spot for 15 minutes to ensure all moisture is gone before lubing.':
        'Secá con otro trapo limpio. Si podés, dejá la bici en un lugar cálido durante 15 minutos para asegurarte de que no quede humedad antes de lubricar.',
      Lube: 'Lubricar',
      'Apply lube to each individual link while slowly backpedalling. One drop per link is enough — do not over-lube. Wipe excess off with a rag after 5 minutes. Excess lube attracts more dirt.':
        'Aplicá lubricante en cada eslabón mientras pedaleás despacio hacia atrás. Con una gota por eslabón alcanza, no te pases. Limpiá el exceso con un trapo después de 5 minutos. El exceso de lubricante junta más tierra.',
      'Shift through gears': 'Pasar por todos los cambios',
      'Backpedal while shifting through all gears to distribute lube evenly across the cassette and chainrings.':
        'Pedaleá hacia atrás mientras pasás por todos los cambios, para distribuir el lubricante de forma pareja en el cassette y los platos.',
      'How Often Should You Clean Your Chain in Sydney?': '¿Cada Cuánto Hay que Limpiar la Cadena en Sídney?',
      '<strong>After every wet ride</strong> — rain flushes lube and brings up road grit':
        '<strong>Después de cada salida con lluvia</strong>: el agua se lleva el lubricante y trae tierra de la calle',
      '<strong>Every 150–200 km</strong> under normal conditions': '<strong>Cada 150-200 km</strong> en condiciones normales',
      '<strong>When you hear squeaking</strong> — already too late, but better late than never':
        '<strong>Cuando escuchás que chilla</strong>: ya es tarde, pero más vale tarde que nunca',
      '<strong>Before a long ride or event</strong> — always start fresh':
        '<strong>Antes de una salida larga o un evento</strong>: siempre arrancá con todo limpio',
      'When to Replace Your Chain': 'Cuándo Reemplazar tu Cadena',
      'Use a chain wear indicator tool (available for under $20). At 0.5% wear, replace the chain immediately if you want to save your cassette. At 0.75%+ wear, you\'ll likely need to replace the cassette too — a much more costly repair.':
        'Usá un medidor de desgaste de cadena (se consigue por menos de $20). Con 0,5% de desgaste, cambiá la cadena de inmediato si querés salvar el cassette. Con 0,75% o más de desgaste, probablemente también tengas que cambiar el cassette, una reparación mucho más cara.',
      '⚠️ <strong>A worn chain left too long costs 5–10x more to fix.</strong> Cassette replacement adds $60–$200 depending on spec. A new chain is $25–$60.':
        '⚠️ <strong>Una cadena gastada que se deja pasar demasiado cuesta de 5 a 10 veces más arreglar.</strong> Cambiar el cassette suma entre $60 y $200 según el modelo. Una cadena nueva cuesta entre $25 y $60.',
      'Don\'t have time to clean your chain?': '¿No tenés tiempo para limpiar tu cadena?',
      'Our Tune-Up includes a full drivetrain clean, chain lube and gear adjustment. We come to you anywhere in Sydney.':
        'Nuestro Ajuste incluye limpieza completa de la transmisión, lubricación de cadena y ajuste de cambios. Vamos hasta vos a cualquier parte de Sídney.',
    },
    zh: {
      'How to Clean Your Bike Chain in Sydney | Dr. Bike Sydney': '如何在悉尼清洁自行车链条 | Dr. Bike Sydney',
      'Step-by-step guide to cleaning and lubricating your bike chain in Sydney. Wet vs dry lube, how often to clean, and when to replace your chain.':
        '在悉尼清洁并润滑自行车链条的分步指南。湿性润滑油与干性润滑油对比、多久清洁一次，以及何时该更换链条。',
      'How to Clean Your Bike Chain in Sydney': '如何在悉尼清洁自行车链条',
      '🔧 Maintenance': '🔧 保养',
      'By Dr. Bike Sydney · June 2026 · 5 min read': '作者：Dr. Bike Sydney · 2026年6月 · 阅读需5分钟',
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
      'Chain lube — wet lube for Sydney winters, dry lube for summer':
        '链条润滑油——悉尼冬季用湿性润滑油，夏季用干性润滑油',
      'Optional: chain cleaning device (Park Tool CM-5.3 makes this much faster)':
        '可选：链条清洁器（Park Tool CM-5.3 能让整个过程快很多）',
      '💡 <strong>Sydney tip:</strong> Use <strong>wet lube</strong> from May to September when rain is more frequent. Switch to <strong>dry lube</strong> in summer — it attracts less dust on dry days.':
        '💡 <strong>悉尼小贴士：</strong>5月至9月降雨较多时使用<strong>湿性润滑油</strong>。夏季则改用<strong>干性润滑油</strong>——在干燥天气里更不容易沾染灰尘。',
      'Step-by-Step Chain Cleaning': '链条清洁分步指南',
      Degrease: '脱脂',
      'Apply degreaser to the chain while slowly backpedalling. Let it soak for 2–3 minutes. If using a chain cleaning tool, fill with degreaser and run the chain through for 30 seconds.':
        '缓慢反向蹬踏的同时，将脱脂剂涂抹在链条上，静置浸泡2-3分钟。如果使用链条清洁器，请注入脱脂剂并让链条通过30秒。',
      Scrub: '刷洗',
      'Use a chain brush or old toothbrush to scrub the chain links, cassette cogs and chainrings. Focus on the inside of the chain where grit accumulates between plates.':
        '用专用链条刷或旧牙刷刷洗链节、飞轮齿片和牙盘。重点清洁链条内侧，那里的板片之间容易积存污垢。',
      Rinse: '冲洗',
      'Wipe the chain thoroughly with a clean rag while backpedalling. Remove all degreaser residue — lube doesn\'t bond well to a degreased chain that still has chemical residue.':
        '反向蹬踏的同时，用干净的抹布彻底擦拭链条，去除所有脱脂剂残留——如果链条上还残留化学物质，润滑油就无法很好地附着。',
      Dry: '晾干',
      'Wipe dry with a second clean rag. If possible, leave the bike in a warm spot for 15 minutes to ensure all moisture is gone before lubing.':
        '用另一块干净抹布擦干。如果条件允许，将自行车放置在温暖处15分钟，确保上油前完全干燥。',
      Lube: '上油',
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
      '<strong>Before a long ride or event</strong> — always start fresh': '<strong>长途骑行或活动前</strong>——务必以最佳状态出发',
      'When to Replace Your Chain': '何时该更换链条',
      'Use a chain wear indicator tool (available for under $20). At 0.5% wear, replace the chain immediately if you want to save your cassette. At 0.75%+ wear, you\'ll likely need to replace the cassette too — a much more costly repair.':
        '使用链条磨损检测工具（售价不到 $20）。当磨损达到0.5%时，如果想保住飞轮，应立即更换链条。磨损达到0.75%以上时，很可能连飞轮也需要更换——维修费用会高出许多。',
      '⚠️ <strong>A worn chain left too long costs 5–10x more to fix.</strong> Cassette replacement adds $60–$200 depending on spec. A new chain is $25–$60.':
        '⚠️ <strong>拖延太久才处理的磨损链条，维修费用会高出5到10倍。</strong>更换飞轮需额外花费 $60–$200（视规格而定）。而一条新链条只需 $25–$60。',
      'Don\'t have time to clean your chain?': '没时间清洁链条？',
      'Our Tune-Up includes a full drivetrain clean, chain lube and gear adjustment. We come to you anywhere in Sydney.':
        '我们的基础保养包括传动系统全面清洁、链条润滑和变速调整。我们上门服务悉尼各个角落。',
    },
  },
};

// ── Mechanics (same as translate-static-pages.mjs) ──────────────────────────

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
    .map(([, l]) => `  <link rel="alternate" hreflang="${l.hreflang}" href="${SITE}${l.prefix}/blog/${slug}">`)
    .concat([`  <link rel="alternate" hreflang="x-default" href="${SITE}/blog/${slug}">`])
    .join('\n');
}

const stripAlternates = (html) =>
  html.replace(/^ {2}<link rel="alternate" hreflang="[^"]+" href="[^"]+">\r?\n/gm, '');

// SHARED entries are not all used by every post (each post links to a
// different subset of the other four in its related section, and each has
// its own CTA). Only DICT[slug] is required to fully match its own post -
// that's the curated, page-specific set, so a miss there is a real typo.
// SHARED keys are checked once at the end: a key unused by ALL five posts
// combined is the dead-entry/typo signal, not a key unused by any one post.
const sharedSeen = { es: new Set(), zh: new Set() };

let written = 0;
for (const slug of POSTS) {
  const file = `blog/${slug}.html`;
  const en = stripAlternates(read(file));

  const merged = { es: { ...SHARED.es, ...DICT[slug].es }, zh: { ...SHARED.zh, ...DICT[slug].zh } };
  for (const lang of ['es', 'zh']) {
    const missing = Object.keys(DICT[slug][lang]).filter((k) => !en.includes(k));
    if (missing.length) {
      console.error(`${file} (${lang}): ${missing.length} key(s) not found in source:`);
      for (const k of missing) console.error('  - ' + JSON.stringify(k));
      process.exit(1);
    }
    for (const k of Object.keys(SHARED[lang])) if (en.includes(k)) sharedSeen[lang].add(k);
  }

  const canonicalEn = `<link rel="canonical" href="${SITE}/blog/${slug}">`;
  const ogUrlEn = `<meta property="og:url" content="${SITE}/blog/${slug}">`;
  if (!en.includes(canonicalEn)) {
    console.error(`${file}: canonical link not found - aborting`);
    process.exit(1);
  }
  if (!en.includes(ogUrlEn)) {
    console.error(`${file}: og:url not found - aborting`);
    process.exit(1);
  }

  for (const [code, meta] of Object.entries(LANGS)) {
    const table = code === 'en' ? {} : merged[code];
    let html = replaceAll(en, table);
    html = html.replace('<html lang="en">', `<html lang="${meta.htmlLang}">`);
    html = html.replace(
      canonicalEn,
      `<link rel="canonical" href="${SITE}${meta.prefix}/blog/${slug}">\n${alternatesBlock(slug)}`
    );
    html = html.replace(ogUrlEn, `<meta property="og:url" content="${SITE}${meta.prefix}/blog/${slug}">`);

    if (code !== 'en') {
      for (const other of POSTS) html = html.split(`href="/blog/${other}"`).join(`href="${meta.prefix}/blog/${other}"`);
      for (const s of ROOT_SLUGS) html = html.split(`href="/${s}"`).join(`href="${meta.prefix}/${s}"`);
      for (const s of SUBURB_SLUGS) html = html.split(`href="/${s}"`).join(`href="${meta.prefix}/${s}"`);
    }

    const dir = code === 'en' ? path.join(ROOT, 'blog') : path.join(ROOT, code, 'blog');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${slug}.html`), html);
    written++;
  }
  console.log(`${file}: en/es/zh written`);
}

for (const lang of ['es', 'zh']) {
  const unused = Object.keys(SHARED[lang]).filter((k) => !sharedSeen[lang].has(k));
  if (unused.length) {
    console.error(`SHARED.${lang}: ${unused.length} key(s) matched none of the 5 posts - dead entry or typo:`);
    for (const k of unused) console.error('  - ' + JSON.stringify(k));
    process.exit(1);
  }
}

console.log(`done: ${written} files written`);
