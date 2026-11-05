// A sentence that prettier split over two lines in the HTML is still
// translated. scripts/i18n-check.mjs collapses whitespace before it looks a
// string up, so it reported these as translated; translateValue() looked up the
// raw text, newline and indentation included, found nothing, and left them in
// English. On 2026-11-05 that was 8 sentences of index.html in es and zh -
// "We bring a fully equipped mobile workshop...", "From $35, depending on your
// suburb.", the payment methods, the membership confirmation.
//
// Judged by running the real translateValue over every wrapped text node of
// the pages the check covers, in both languages.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// setLang() dispatches on `document`; same stub as service-catalog-i18n.test.js.
globalThis.document = globalThis.document || { dispatchEvent: () => {} };
const { setLang, translateValue } = await import('../../js/i18n.js');

const decode = (s) =>
  s
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');

// Text nodes with a line break inside, as the browser hands them over: the
// newline and the indentation are part of the node's value.
const wrappedTextNodes = (file) => {
  const html = readFileSync(new URL('../../' + file, import.meta.url), 'utf8')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '');
  return [...html.matchAll(/>([^<]+)</g)]
    .map((m) => decode(m[1]))
    .filter((t) => /\S\s*\n\s*\S/.test(t));
};

describe('a sentence split over two lines is still translated', () => {
  for (const lang of ['es', 'zh']) {
    it(`index.html, ${lang}`, async () => {
      await setLang(lang);
      const nodes = wrappedTextNodes('index.html');
      // The page really has them - otherwise this passes on nothing.
      expect(nodes.length).toBeGreaterThan(8);
      const stillEnglish = nodes.filter((n) => {
        const out = translateValue(n);
        // Untranslatable on purpose (no dictionary entry at all) is the
        // i18n-check's business, not this test's: only an entry that exists
        // and did not apply is the bug.
        return out === n && translateValue(n.trim().replace(/\s+/g, ' ')) !== n.trim().replace(/\s+/g, ' ');
      });
      expect(stillEnglish.map((n) => n.trim().replace(/\s+/g, ' ').slice(0, 60))).toEqual([]);
    });
  }

  it('the sentence Diego saw in English reads in Spanish, outer whitespace kept', async () => {
    await setLang('es');
    const node =
      '\n                We bring a fully equipped mobile workshop to your door — no bike shop queues,\n                no expensive tow-ins.\n              ';
    const out = translateValue(node);
    expect(out).toContain('Llevamos un taller móvil completamente equipado');
    expect(out.startsWith('\n                ')).toBe(true);
    expect(out.endsWith('\n              ')).toBe(true);
  });

  it('English still passes through untouched', async () => {
    await setLang('en');
    const node = '\n  From $35, depending on your\n  suburb.\n';
    expect(translateValue(node)).toBe(node);
  });
});
