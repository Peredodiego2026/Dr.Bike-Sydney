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
