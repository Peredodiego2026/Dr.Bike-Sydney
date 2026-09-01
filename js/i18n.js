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

// Los diccionarios viven en js/i18n-es.js y js/i18n-zh.js, cargados bajo
// demanda. Antes estaban aca dentro: 160 KB de los 165 que pesaba este
// archivo, y TODOS los visitantes los descargaban enteros, en los tres
// idiomas. Un visitante en ingles se bajaba 164 KB para no usarlos nunca.
//
// Empieza vacio y se puebla con ensureLang(). Todo lo que consulta `dict`
// abajo ya tolera que un idioma no este: translateValue() devuelve el texto
// original, que es exactamente el comportamiento correcto mientras carga.
const dict = {};

// Un import() por idioma, memorizado. Se llama una vez al arrancar y otra vez
// en cada cambio de idioma; sin memorizar, alternar es/zh/es descargaria el
// mismo archivo tres veces.
const loading = {};

/**
 * Deja el diccionario de `lang` listo para usar. Devuelve una promesa.
 *
 * Hay que ESPERARLA antes de pintar la primera pantalla. Si no, la primera
 * vista sale en ingles y se traduce despues, que es peor que tardar 40ms mas:
 * el cliente ve el idioma equivocado y parpadea.
 *
 * `en` no tiene diccionario y no necesita ninguno - las claves SON el ingles.
 */
export function ensureLang(lang) {
  if (lang === 'en' || dict[lang]) return Promise.resolve();
  if (!loading[lang]) {
    loading[lang] =
      lang === 'es'
        ? import('./i18n-es.js').then((m) => {
            dict.es = m.default;
          })
        : lang === 'zh'
          ? import('./i18n-zh.js').then((m) => {
              dict.zh = m.default;
            })
          : Promise.resolve();
    // Un fallo de red no puede romper la app: sin diccionario se ve en ingles,
    // que es degradado pero utilizable. Y se limpia el memo para que el
    // proximo intento vuelva a probar en vez de quedar fallado para siempre.
    loading[lang] = loading[lang].catch((e) => {
      console.error('[i18n] no se pudo cargar el diccionario', lang, e && e.message);
      delete loading[lang];
    });
  }
  return loading[lang];
}

// Que idiomas existen ya no lo decide `dict`, porque `dict` ahora empieza
// vacio: antes del split, "hay diccionario para zh" y "zh es un idioma que
// soportamos" eran la misma pregunta. Ahora no. LANGUAGES es la lista de
// verdad, y es la misma que pinta el selector de idioma.
const SUPPORTED = new Set(LANGUAGES.map((l) => l.code));

function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    // 'en' is a valid saved choice with no dict entry (it IS the source
    // language) - without this check an explicit English pick gets overridden
    // by the device locale on every reload.
    if (saved === 'en' || (saved && SUPPORTED.has(saved))) return saved;
  } catch {}
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return SUPPORTED.has(nav) ? nav : 'en';
}

let currentLang = detectLang();

export function getLang() {
  return currentLang;
}

// Dates and times were formatted with a hardcoded 'en-AU' everywhere, so a
// client reading the app in Spanish or Chinese still got "Monday, 27 July".
// Use this for any client-facing toLocaleDateString/toLocaleTimeString call
// (the admin and mechanic apps are English-only by design and keep en-AU).
const DATE_LOCALES = { en: 'en-AU', es: 'es-ES', zh: 'zh-CN' };

export function dateLocale() {
  return DATE_LOCALES[currentLang] || 'en-AU';
}

/**
 * Cambia el idioma. Devuelve una promesa, y el cambio ocurre RECIEN cuando el
 * diccionario esta en la mano.
 *
 * Ese orden es el punto. Si `currentLang` se moviera primero, entre ese momento
 * y la llegada del archivo cada translateValue() devolveria ingles - y el
 * evento `langchange`, que es lo que hace repintar la pantalla, llegaria justo
 * en esa ventana. El cliente veria el idioma nuevo a medias, o directamente en
 * ingles, que es exactamente lo que este cambio no puede permitirse.
 *
 * La eleccion se guarda ANTES de esperar: es la intencion del cliente y tiene
 * que sobrevivir a que recargue en el medio.
 *
 * No hace falta await para que funcione - el evento se dispara solo, despues de
 * la carga - pero se puede esperar si el llamador necesita saber cuando termino.
 */
export function setLang(lang) {
  if (!SUPPORTED.has(lang)) return Promise.resolve();
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
  return ensureLang(lang).then(() => {
    currentLang = lang;
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
  });
}

// Reverse lookup (translated text -> original English). Needed by code that
// reads rendered text back out of the DOM and matches it against English data:
// js/live-prices.js compares service-card headings with the Supabase `services`
// table, and after a translation pass those headings are no longer English, so
// every card silently fell back to its static price in Spanish and Chinese.
const reverseIndex = {};

export function sourceOf(text) {
  const trimmed = (text || '').trim();
  if (currentLang === 'en') return trimmed;
  if (!reverseIndex[currentLang]) {
    const index = {};
    for (const [source, translated] of Object.entries(dict[currentLang] || {})) {
      // first definition wins, so an English word that is its own translation
      // never gets shadowed by a later entry
      if (!(translated in index)) index[translated] = source;
    }
    reverseIndex[currentLang] = index;
  }
  return reverseIndex[currentLang][trimmed] || trimmed;
}

// Original (English) text is cached per node/element so switching languages
// back and forth always translates FROM the source, not from whatever is
// currently displayed - otherwise going back to English couldn't restore it.
const originalText = new WeakMap(); // TextNode -> original nodeValue
const originalAttrs = new WeakMap(); // Element -> { placeholder?, ariaLabel? }

export function translateValue(original) {
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
