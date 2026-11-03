// scripts/translate-static-pages.mjs — es/zh versions of business.html
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

// bike-check.html was the second page here until 2026-11-02, when Diego
// retired it: /bike-check now 301s to the booking wizard (vercel.json).
const PAGES = [{ slug: 'business', file: 'business.html' }];

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
      '14 days': '14 días',
      'Workmanship guarantee': 'Garantía en la mano de obra',
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
      'Book a Service': 'Reservar Servicio',
      'Cycling Map': 'Mapa de Ciclismo',
      'Privacy Policy': 'Política de Privacidad',
      Terms: 'Términos',
      'Please fill in all required fields.': 'Completá todos los campos obligatorios.',
      'Please wait a moment for the security check to finish, then try again.':
        'Esperá un momento a que termine la verificación de seguridad e intentá de nuevo.',
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
      '14 days': '14天',
      'Workmanship guarantee': '工艺保修',
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
      'Book a Service': '预约服务',
      'Cycling Map': '骑行地图',
      'Privacy Policy': '隐私政策',
      Terms: '条款',
      'Please fill in all required fields.': '请填写所有必填字段。',
      'Please wait a moment for the security check to finish, then try again.':
        '请稍等安全验证完成后再试一次。',
      'Sending...': '发送中……',
      'Something went wrong. Please email us at contact@drbikesydney.com.au':
        '出了点问题。请发邮件至 contact@drbikesydney.com.au',
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

// Idempotency: this script's own English output (root business.html) IS
// its English input, unlike generate-suburb-pages.mjs
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
