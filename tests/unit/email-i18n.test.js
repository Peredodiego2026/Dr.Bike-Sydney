// tests/unit/email-i18n.test.js — the outgoing mail is translated as a final
// pass over the rendered HTML, so the two things that can go wrong are: a key
// that no longer matches the template (silent English email) and a replacement
// that eats markup or an amount. Run: npm test

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  translateEmailHtml,
  translateEmailSubject,
  normalizeLang,
  dictionaries,
} from '../../api/_email-i18n.js';

describe('normalizeLang', () => {
  it('accepts the three shipped languages', () => {
    expect(normalizeLang('en')).toBe('en');
    expect(normalizeLang('es')).toBe('es');
    expect(normalizeLang('zh')).toBe('zh');
  });

  it('falls back to English for anything else', () => {
    expect(normalizeLang('fr')).toBe('en');
    expect(normalizeLang(null)).toBe('en');
    expect(normalizeLang('')).toBe('en');
    expect(normalizeLang('es-AR')).toBe('es'); // locale tag narrows to the language
  });
});

describe('translateEmailHtml', () => {
  const html =
    '<p>Hi <strong>Ana</strong>, your booking is confirmed ✅ Your mechanic will contact you 30 min before arrival.</p>' +
    '<div>📍 What happens next</div><a href="https://drbikesydney.com.au/x?a=1">View your booking →</a>' +
    '<td>Total (AUD)</td><td>$129</td>';

  it('leaves English untouched', () => {
    expect(translateEmailHtml(html, 'en')).toBe(html);
  });

  it('translates the prose into Spanish', () => {
    const out = translateEmailHtml(html, 'es');
    expect(out).toContain('tu reserva está confirmada');
    expect(out).toContain('📍 Qué sigue ahora');
    expect(out).toContain('Ver mi reserva →');
  });

  it('translates the prose into Chinese', () => {
    const out = translateEmailHtml(html, 'zh');
    expect(out).toContain('您的预订已确认');
    expect(out).toContain('查看我的预订 →');
  });

  it('never touches markup, URLs, names or amounts', () => {
    for (const lang of ['es', 'zh']) {
      const out = translateEmailHtml(html, lang);
      expect(out).toContain('<strong>Ana</strong>');
      expect(out).toContain('href="https://drbikesydney.com.au/x?a=1"');
      expect(out).toContain('$129');
      // same number of tags in, same number out
      expect((out.match(/</g) || []).length).toBe((html.match(/</g) || []).length);
    }
  });

  it('leaves an unknown phrase in English instead of dropping it', () => {
    const unknown = '<p>Something nobody has translated yet.</p>';
    expect(translateEmailHtml(unknown, 'es')).toBe(unknown);
  });

  it('replaces the longest key first, so a short key cannot eat a longer phrase', () => {
    // "Service" is a key on its own and also a word inside longer keys
    const out = translateEmailHtml('<td>Subtotal (excl. GST)</td><td>Service</td>', 'es');
    expect(out).toContain('Subtotal (sin GST)');
    expect(out).toContain('Servicio');
  });
});

describe('dictionary matches the real templates', () => {
  const src = fs.readFileSync(new URL('../../api/send-email.js', import.meta.url), 'utf8');

  it('every body key still appears in send-email.js', () => {
    // A key that no longer matches the template is dead weight and, worse, means
    // that sentence silently goes out in English.
    const dead = Object.keys(dictionaries.body.es).filter((k) => !src.includes(k));
    expect(dead).toEqual([]);
  });

  it('es and zh cover exactly the same keys', () => {
    const es = Object.keys(dictionaries.body.es).sort();
    const zh = Object.keys(dictionaries.body.zh).sort();
    expect(zh).toEqual(es);
    const esSub = Object.keys(dictionaries.subject.es).sort();
    const zhSub = Object.keys(dictionaries.subject.zh).sort();
    expect(zhSub).toEqual(esSub);
  });

  it('no key is left untranslated (same string in and out)', () => {
    for (const lang of ['es', 'zh']) {
      const table = dictionaries.body[lang];
      const untranslated = Object.entries(table)
        .filter(([k, v]) => k === v)
        // Identical on purpose: an ABN line, and the Australian tax/currency
        // names, which stay as-is in Spanish.
        .filter(
          ([k]) =>
            !['ABN: 87 654 025 287 · contact@drbikesydney.com.au', 'GST (10%)', 'Total (AUD)'].includes(
              k
            )
        )
        .map(([k]) => k);
      expect(untranslated).toEqual([]);
    }
  });
});

describe('translateEmailSubject', () => {
  it('translates the literal part and keeps the interpolated values', () => {
    const subject = '✅ Booking confirmed — Tune-Up · 2026-08-09';
    expect(translateEmailSubject(subject, 'en')).toBe(subject);
    expect(translateEmailSubject(subject, 'es')).toBe('✅ Reserva confirmada — Tune-Up · 2026-08-09');
    expect(translateEmailSubject(subject, 'zh')).toBe('✅ 预订已确认 — Tune-Up · 2026-08-09');
  });

  it('handles a subject with an amount in it', () => {
    const out = translateEmailSubject('💛 Tip received — $15 from Ana', 'es');
    expect(out).toContain('💛 Propina recibida — $15');
  });
});
