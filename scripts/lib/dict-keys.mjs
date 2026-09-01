// Reads js/i18n.js as TEXT and answers one question: does this exact English
// string have an entry in the Spanish and Chinese dictionaries?
//
// Why text and not an import: the callers are a network script and a test, and
// importing js/i18n.js pulls in detectLang() (localStorage, navigator) and
// setLang() (document.dispatchEvent). Parsing the file is the cheaper contract.
//
// Why it exists at all: scripts/i18n-check.mjs only sees strings written into
// the SURFACES - HTML and the innerHTML templates in js/. The booking wizard
// also renders `name` and `description` straight out of the Supabase `services`
// table (js/app.js renderStep1 -> createServiceCard), and those are data. On
// 2026-08-31 that blind spot was hiding 32 untranslated descriptions and 11
// untranslated names while `npm run i18n:check` printed a clean run.
//
// THE SLICING BUG THIS GUARDS (docs/PENDIENTES.md 66): the dictionaries are
// declared in order, es then zh, so `src.slice(src.indexOf('  es: {'))` carries
// the zh block along with it and a string translated ONLY into Chinese reads as
// present in Spanish. Every slice here stops at the next language.

const LANGS = ['es', 'zh'];

// The literal a JS file would contain for this key, for one quote style.
// Prettier picks single quotes unless the string contains one, so both styles
// occur in js/i18n.js and checking only one silently misses entries.
function jsLiteral(s, quote) {
  const escaped = s
    .split('\\')
    .join('\\\\')
    .split(quote)
    .join('\\' + quote);
  return quote + escaped + quote;
}

// A key with no quotes at all. Prettier's quoteProps: "as-needed" strips them
// from identifier-like keys, and lint-staged runs prettier --write on every
// js/**/*.js at commit time - so `'ETA': 'Llegada'` becomes `ETA: 'Llegada'` on
// the next commit that touches this file, whoever makes it. A checker that only
// knows the quoted form calls a translated string missing.
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function hasKey(block, key) {
  if (block.includes(jsLiteral(key, "'") + ':')) return true;
  if (block.includes(jsLiteral(key, '"') + ':')) return true;
  // Only identifier-like keys can appear bare, and those contain no regex
  // metacharacter - so this interpolation has nothing to escape.
  if (!IDENTIFIER.test(key)) return false;
  return new RegExp('(^|[\\s{,])' + key + '\\s*:').test(block);
}

// Returns null rather than an empty string when the marker is gone: an empty
// block would report every key as missing, which reads like a content problem
// instead of the parser problem it is.
// Since the split of 2026-09-01 the dictionaries live one per file
// (js/i18n-es.js, js/i18n-zh.js). Handed one of those, `src` IS the block and
// there is nothing to slice - which is how the bug described above stopped
// being possible rather than merely being handled. The marker path stays for
// callers that pass a composed source.
export function dictBlock(src, lang) {
  const start = src.indexOf(`\n  ${lang}: {`);
  if (start < 0) {
    // No marker: either a single language's file, or something that is not a
    // dictionary at all. A real one has quoted keys, and telling them apart by
    // content beats returning null and reporting every key as missing.
    return /^\s*['"]/m.test(src) ? src : null;
  }
  const others = LANGS.filter((l) => l !== lang)
    .map((l) => src.indexOf(`\n  ${l}: {`, start + 1))
    .filter((i) => i > 0);
  if (others.length) return src.slice(start, Math.min(...others));
  // Last language in the object - stop at the object's own closing brace.
  const end = src.indexOf('\n};', start);
  return end > 0 ? src.slice(start, end) : null;
}

// services: rows from the Supabase `services` table ({ name, description }).
// Returns one row per untranslated string, naming which languages are missing.
export function missingCatalogTranslations(services, i18nSrc) {
  const blocks = {};
  for (const lang of LANGS) {
    const block = dictBlock(i18nSrc, lang);
    if (!block) {
      throw new Error(
        `Could not find the "${lang}" dictionary in js/i18n.js - fix this parser ` +
          'before trusting the result.'
      );
    }
    blocks[lang] = block;
  }

  const rows = [];
  for (const s of services) {
    for (const kind of ['name', 'description']) {
      const text = s[kind] == null ? '' : String(s[kind]).trim();
      if (!text) continue; // a service with no description has nothing to translate
      const missing = LANGS.filter((lang) => !hasKey(blocks[lang], text));
      if (missing.length) rows.push({ service: s.name, kind, text, missing });
    }
  }
  return rows;
}
