// js/i18n.js — lightweight, dependency-free i18n for the vanilla mobile app.
// No build step, so translation is a post-render pass: after a screen's
// innerHTML is set, translateScreen() walks its text nodes and swaps any
// exact match found in the dictionary. Dynamic content (names, prices,
// dates) is untouched since it never matches a dictionary key verbatim.

const STORAGE_KEY = 'drbike-lang';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'zh', label: '中文' },
];

const dict = {
  es: {
    // Bottom nav
    Home: 'Inicio',
    Bookings: 'Reservas',
    Track: 'Rastrear',
    'My Bikes': 'Mis Bicis',
    Profile: 'Perfil',
    // Home screen
    'Book a Service': 'Reservar Servicio',
    'View Services': 'Ver Servicios',
    'View All': 'Ver Todo',
    Services: 'Servicios',
    // Login / Signup
    'Welcome Back!': '¡Bienvenido de nuevo!',
    'Login to your account': 'Inicia sesión en tu cuenta',
    'Continue with Google': 'Continuar con Google',
    or: 'o',
    Email: 'Correo',
    Password: 'Contraseña',
    'Forgot Password?': '¿Olvidaste tu contraseña?',
    Login: 'Iniciar sesión',
    "Don't have an account?": '¿No tienes una cuenta?',
    'Sign up': 'Regístrate',
    'Create Account': 'Crear Cuenta',
    'Full Name': 'Nombre completo',
    'Already have an account?': '¿Ya tienes una cuenta?',
    'Sign in': 'Inicia sesión',
    // My Bookings
    'My Bookings': 'Mis Reservas',
    Upcoming: 'Próximas',
    History: 'Historial',
    'No upcoming bookings': 'No tienes próximas reservas',
    'Book your first service today!': '¡Reserva tu primer servicio hoy!',
    'No booking history': 'Sin historial de reservas',
    'Completed services will appear here.': 'Los servicios completados aparecerán aquí.',
    Date: 'Fecha',
    Time: 'Hora',
    Address: 'Dirección',
    'Call-out fee': 'Tarifa de visita',
    '↻ Book Again': '↻ Reservar de nuevo',
    'Track Live': 'Rastrear en vivo',
    'Share tracking link': 'Compartir enlace de rastreo',
    Reschedule: 'Reprogramar',
    'Cancel booking': 'Cancelar reserva',
    Close: 'Cerrar',
    'Your mechanic': 'Tu mecánico',
    'Rate this mechanic': 'Calificar a este mecánico',
    'Your review': 'Tu reseña',
    'Client reviews': 'Reseñas de clientes',
    'Jobs done': 'Trabajos hechos',
    Rating: 'Calificación',
    // My Bikes
    'My Bikes': 'Mis Bicis',
    'No bikes added yet': 'Aún no has agregado bicis',
    'Add your first bike below': 'Agrega tu primera bici abajo',
    '+ Add a Bike': '+ Agregar una Bici',
    'New Bike': 'Bici Nueva',
    'Predicted next service': 'Próximo servicio estimado',
    "You're likely due for a service": 'Probablemente necesites un servicio',
    // Live Tracking
    'Live Tracking': 'Rastreo en Vivo',
    'Change booking': 'Cambiar reserva',
    'Loading booking...': 'Cargando reserva...',
    'On the way to you': 'En camino hacia ti',
    Confirmed: 'Confirmado',
    'En Route': 'En Camino',
    Arrived: 'Llegó',
    Done: 'Listo',
    Message: 'Mensaje',
    'Share link': 'Compartir enlace',
    'Mechanic profile': 'Perfil del mecánico',
    'Dr. Bike Mobile Mechanic': 'Mecánico Móvil Dr. Bike',
    Call: 'Llamar',
    WhatsApp: 'WhatsApp',
    'Services completed': 'servicios completados',
    // Review
    'Review Service': 'Calificar Servicio',
    'How was your experience?': '¿Cómo fue tu experiencia?',
    "We'd love to hear your feedback.": 'Nos encantaría escuchar tu opinión.',
    'Tell us about your experience...': 'Cuéntanos sobre tu experiencia...',
    'Submit Review': 'Enviar Reseña',
    'Maybe Later': 'Tal Vez Después',
    // Profile
    'Your referral code': 'Tu código de referido',
    'You and your friend each get $15 off': 'Tú y tu amigo reciben $15 de descuento',
    'Copy code': 'Copiar código',
    Share: 'Compartir',
    'Friends referred': 'Amigos referidos',
    'Credits earned': 'Créditos ganados',
    'How it works': 'Cómo funciona',
    // Profile - rider tier card
    'New Rider': 'Ciclista Nuevo',
    'Bronze Rider': 'Ciclista Bronce',
    'Silver Rider': 'Ciclista Plata',
    'Gold Rider': 'Ciclista Oro',
    'Diamond Rider': 'Ciclista Diamante',
    'service completed': 'servicio completado',
    'services completed': 'servicios completados',
    'more service to reach': 'servicio más para llegar a',
    'more services to reach': 'servicios más para llegar a',
    "You've reached our highest tier - thank you for riding with us!":
      'Llegaste a nuestro nivel más alto - ¡gracias por andar con nosotros!',
    // Profile - membership card
    Membership: 'Membresía',
    Plan: 'Plan',
    Active: 'Activa',
    Paused: 'Pausada',
    'Resume membership': 'Reanudar membresía',
    'Pause membership': 'Pausar membresía',
    Cancel: 'Cancelar',
    // Home nav greeting (split from the dynamic name for translation) -
    // translateScreen() looks up the TRIMMED text node, so the key has no
    // trailing space even though the rendered node does (verified: a key
    // with a trailing space here never matches).
    'Hi,': 'Hola,',
    // Booking flow - Step 1 (select service)
    'Not sure what your bike needs?': '¿No estás seguro qué necesita tu bici?',
    'Take a photo or describe the problem — our AI will recommend the right service.':
      'Sacá una foto o describí el problema - nuestra IA te va a recomendar el servicio correcto.',
    Photo: 'Foto',
    'Describe the problem...': 'Describí el problema...',
    'Ask AI': 'Preguntar a la IA',
    'Select Service': 'Elegí un Servicio',
    'Which bike?': '¿Qué bici?',
    Skip: 'Omitir',
    Continue: 'Continuar',
    // Service categories (full + short chip labels)
    'Scheduled services': 'Servicios programados',
    Scheduled: 'Programado',
    Brakes: 'Frenos',
    'Cockpit & levers': 'Cabina y palancas',
    Cockpit: 'Cabina',
    Drivetrain: 'Transmisión',
    'Gears & cables': 'Cambios y cables',
    Gears: 'Cambios',
    'Wheels & tyres': 'Ruedas y neumáticos',
    Wheels: 'Ruedas',
    'Electronic & e-bike': 'Electrónica y e-bike',
    'E-Bike': 'E-Bike',
    Suspension: 'Suspensión',
    'General & assembly': 'General y armado',
    General: 'General',
    // Booking flow - Step 2 (calendar)
    'Choose Date & Time': 'Elegí Fecha y Hora',
    'Select Date': 'Elegí la fecha',
    'Select Time': 'Elegí la hora',
    January: 'Enero',
    February: 'Febrero',
    March: 'Marzo',
    April: 'Abril',
    May: 'Mayo',
    June: 'Junio',
    July: 'Julio',
    August: 'Agosto',
    September: 'Septiembre',
    October: 'Octubre',
    November: 'Noviembre',
    December: 'Diciembre',
    Su: 'Do',
    Mo: 'Lu',
    Tu: 'Ma',
    We: 'Mi',
    Th: 'Ju',
    Fr: 'Vi',
    Sa: 'Sá',
    // Booking flow - Step 3 (address)
    'Your Address': 'Tu Dirección',
    'Where should we come?': '¿A dónde vamos?',
    'Your mechanic will come to this address': 'Tu mecánico va a llegar a esta dirección',
    "The $20 call-out fee covers the mechanic's trip. Most areas in Sydney are covered.":
      'La tarifa de visita de $20 cubre el viaje del mecánico. Cubrimos la mayoría de las áreas de Sydney.',
    'Continue to Summary': 'Continuar al Resumen',
    // Service Summary / Quote
    'Your Quote': 'Tu Cotización',
    Location: 'Ubicación',
    "What's included": 'Qué incluye',
    'Service fee': 'Costo del servicio',
    'Mobile call-out fee': 'Tarifa de visita móvil',
    'Paid online now via Stripe': 'Se paga ahora en línea con Stripe',
    'Promo discount': 'Descuento promocional',
    Total: 'Total',
    'Promo or referral code': 'Código promocional o de referido',
    'Enter code (optional)': 'Ingresá el código (opcional)',
    Apply: 'Aplicar',
    'Checking...': 'Verificando...',
    'How payment works:': 'Cómo funciona el pago:',
    'Please try again.': 'Por favor, intentá de nuevo.',
    // Service inclusions (shown on the Quote screen)
    'Gear adjustment & cable tension': 'Ajuste de cambios y tensión de cables',
    'Brake check & pad inspection': 'Revisión de frenos e inspección de pastillas',
    'Wheel true & tyre pressure': 'Centrado de ruedas y presión de neumáticos',
    'Chain lube & basic clean': 'Lubricación de cadena y limpieza básica',
    'Safety inspection': 'Inspección de seguridad',
    'Everything in Tune-Up': 'Todo lo del Tune-Up',
    'Full drivetrain clean & degrease': 'Limpieza completa y desengrase de la transmisión',
    'Cable check & replace if worn': 'Revisión de cables y reemplazo si están gastados',
    'Bearing check (BB, headset, hubs)': 'Revisión de rodamientos (BB, dirección, bujes)',
    'Everything in Standard Service': 'Todo lo del Standard Service',
    'Bottom bracket service': 'Servicio de caja pedalera',
    'Headset adjustment & grease': 'Ajuste y engrase de dirección',
    'Comprehensive component report': 'Informe completo de componentes',
    'Full bike rebuild': 'Reconstrucción completa de la bici',
    'All bearings serviced or replaced': 'Todos los rodamientos revisados o reemplazados',
    'Before & after photos': 'Fotos de antes y después',
    'Detailed parts condition report': 'Informe detallado del estado de las piezas',
    'Brake pad check': 'Revisión de pastillas de freno',
    'Tyre & wheel inspection': 'Inspección de neumáticos y ruedas',
    'Drivetrain check': 'Revisión de la transmisión',
    'Headset & stem safety check': 'Revisión de seguridad de dirección y potencia',
    'Tube replacement': 'Reemplazo de cámara',
    'Tyre inspection': 'Inspección de neumático',
    'Pressure set to spec': 'Presión ajustada a la especificación',
    'Derailleur alignment': 'Alineación del desviador',
    'Cable tension adjustment': 'Ajuste de tensión de cables',
    'Limit screw set': 'Ajuste de tornillos limitadores',
    'Test ride': 'Prueba de manejo',
    'Pad replacement': 'Reemplazo de pastillas',
    'Cable tension & rotor/rim check': 'Tensión de cable y revisión de rotor/llanta',
    'Bedding in if disc': 'Asentamiento si es a disco',
    'Remove, clean & replace chain': 'Quitar, limpiar y reemplazar cadena',
    'Check cassette wear': 'Revisión de desgaste del cassette',
    'True wheel (spoke tension)': 'Centrado de rueda (tensión de rayos)',
    'Rim or rotor inspection': 'Inspección de llanta o rotor',
    // Payment
    'Confirm Booking': 'Confirmar Reserva',
    'Your selection': 'Tu selección',
    'Online payments coming soon': 'Pagos en línea próximamente',
    "We're finalising our business setup. Contact us directly to lock in your slot at the same price.":
      'Estamos terminando de configurar el negocio. Contactanos directamente para reservar tu turno al mismo precio.',
    'Book via WhatsApp': 'Reservar por WhatsApp',
    'Call 0433 963 250': 'Llamar al 0433 963 250',
    'Test booking - no charge (admin only)': 'Reserva de prueba - sin cargo (solo admin)',
    'Confirming...': 'Confirmando...',
    // Tracking status messages
    'Booking received - assigning mechanic...': 'Reserva recibida - asignando mecánico...',
    'Mechanic assigned - preparing to depart': 'Mecánico asignado - preparando salida',
    'Mechanic is on the way!': '¡El mecánico está en camino!',
    'Mechanic has arrived!': '¡El mecánico llegó!',
    'Service completed': 'Servicio completado',
  },
  zh: {
    Home: '主页',
    Bookings: '预订',
    Track: '追踪',
    'My Bikes': '我的自行车',
    Profile: '个人资料',
    'Book a Service': '预约服务',
    'View Services': '查看服务',
    'Welcome Back!': '欢迎回来！',
    'Login to your account': '登录您的账户',
    'Continue with Google': '使用谷歌继续',
    Email: '电子邮件',
    Password: '密码',
    or: '或',
    Login: '登录',
    'My Bookings': '我的预订',
    Upcoming: '即将到来',
    History: '历史记录',
    Close: '关闭',
    'Your mechanic': '您的技工',
    'Live Tracking': '实时追踪',
    Call: '呼叫',
    'My Bikes': '我的自行车',
    '+ Add a Bike': '+ 添加自行车',
    'New Rider': '新骑手',
    'Bronze Rider': '青铜骑手',
    'Silver Rider': '白银骑手',
    'Gold Rider': '黄金骑手',
    'Diamond Rider': '钻石骑手',
    'service completed': '项服务已完成',
    'services completed': '项服务已完成',
    'more service to reach': '项服务即可达到',
    'more services to reach': '项服务即可达到',
    Share: '分享',
    Membership: '会员',
    Plan: '计划',
    Active: '生效中',
    Paused: '已暂停',
    Cancel: '取消',
    'Hi,': '你好，',
  },
};

function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && dict[saved]) return saved;
  } catch {}
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return dict[nav] ? nav : 'en';
}

let currentLang = detectLang();

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  if (lang !== 'en' && !dict[lang]) return;
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

// Original (English) text is cached per node/element so switching languages
// back and forth always translates FROM the source, not from whatever is
// currently displayed - otherwise going back to English couldn't restore it.
const originalText = new WeakMap(); // TextNode -> original nodeValue
const originalAttrs = new WeakMap(); // Element -> { placeholder?, ariaLabel? }

function translateValue(original) {
  const trimmed = original.trim();
  if (!trimmed) return original;
  if (currentLang === 'en') return original;
  const translated = dict[currentLang]?.[trimmed];
  return translated ? original.replace(trimmed, translated) : original;
}

// Walk a rendered screen's text nodes and swap any exact match found in the
// current language's dictionary. Re-running with lang='en' restores the
// original text; unmatched strings always fall back to English.
export function translateScreen(root) {
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  nodes.forEach((n) => {
    if (!originalText.has(n)) originalText.set(n, n.nodeValue);
    n.nodeValue = translateValue(originalText.get(n));
  });

  root.querySelectorAll('[placeholder], [aria-label]').forEach((el) => {
    if (!originalAttrs.has(el)) {
      originalAttrs.set(el, {
        placeholder: el.getAttribute('placeholder'),
        ariaLabel: el.getAttribute('aria-label'),
      });
    }
    const orig = originalAttrs.get(el);
    if (orig.placeholder !== null) el.setAttribute('placeholder', translateValue(orig.placeholder));
    if (orig.ariaLabel !== null) el.setAttribute('aria-label', translateValue(orig.ariaLabel));
  });
}
