// tests/unit/message-i18n.test.js — an SMS or WhatsApp message that quietly goes
// out in English is the failure mode here, so these tests pin down that every
// client-facing type exists in all three languages and that no builder leaks
// English into a translated message. Run: npm test

import { describe, it, expect } from 'vitest';
import {
  smsBody,
  waBody,
  normalizeLang,
  tables,
  CLIENT_SMS_TYPES,
  CLIENT_WA_TEMPLATES,
} from '../../api/_message-i18n.js';

const VARS = {
  name: 'Ana',
  service: 'Tune-Up',
  address: 'Newtown',
  price: 129,
  mechName: 'Diego',
  etaMin: 8,
  trackUrl: 'https://drbikesydney.com.au/track.html?id=abc',
  reviewLink: 'https://g.page/r/review',
  time: '14:30',
};

const WA_DATA = {
  name: 'Ana',
  service: 'Tune-Up',
  date: '2026-08-09',
  time: '14:30',
  suburb: 'Newtown',
  price: 129,
  mechanic: 'Diego',
  eta: 8,
  trackUrl: 'https://drbikesydney.com.au/track.html?id=abc',
  reviewUrl: 'https://g.page/r/review',
};

describe('normalizeLang', () => {
  it('accepts the shipped languages and falls back to English', () => {
    expect(normalizeLang('es')).toBe('es');
    expect(normalizeLang('zh')).toBe('zh');
    expect(normalizeLang('en')).toBe('en');
    expect(normalizeLang('fr')).toBe('en');
    expect(normalizeLang(null)).toBe('en');
  });
});

describe('coverage', () => {
  it('every client-facing SMS type exists in all three languages', () => {
    for (const lang of ['en', 'es', 'zh']) {
      expect(Object.keys(tables.sms[lang]).sort()).toEqual([...CLIENT_SMS_TYPES].sort());
    }
  });

  it('every client-facing WhatsApp template exists in all three languages', () => {
    for (const lang of ['en', 'es', 'zh']) {
      expect(Object.keys(tables.wa[lang]).sort()).toEqual([...CLIENT_WA_TEMPLATES].sort());
    }
  });

  it('returns null for an internal type, so the caller keeps its own copy', () => {
    expect(smsBody('cancellation_alert', 'es', VARS)).toBe(null);
    expect(smsBody('new_booking', 'es', VARS)).toBe(null);
    expect(waBody('noshow_alert', 'es', WA_DATA)).toBe(null);
    expect(waBody('client_cancelled', 'es', WA_DATA)).toBe(null);
  });
});

describe('no English leaks into a translated message', () => {
  // Words that would only appear if a builder was copied from the English table
  // and not actually translated.
  const ENGLISH_GIVEAWAYS = [
    /\bHi \w/,
    /\bYour mechanic\b/,
    /\bon the way\b/,
    /\bhas accepted\b/,
    /\bhas arrived\b/,
    /\bis complete\b/,
    /\bBook again\b/,
    /\bReminder:/,
    /\bTrack live\b/,
    /\bNeed to reschedule\b/,
    /\bEst\. arrival\b/,
    /\bJob complete\b/,
    /\bService reminder\b/,
    /\bRate your experience\b/,
    /\bThank you for choosing\b/,
  ];

  for (const lang of ['es', 'zh']) {
    it(`SMS bodies in ${lang}`, () => {
      for (const type of CLIENT_SMS_TYPES) {
        const body = smsBody(type, lang, VARS);
        expect(body, `${lang}/${type} missing`).toBeTruthy();
        for (const re of ENGLISH_GIVEAWAYS) {
          expect(body, `${lang}/${type} leaked English: ${re}`).not.toMatch(re);
        }
      }
    });

    it(`WhatsApp bodies in ${lang}`, () => {
      for (const template of CLIENT_WA_TEMPLATES) {
        const body = waBody(template, lang, WA_DATA);
        expect(body, `${lang}/${template} missing`).toBeTruthy();
        for (const re of ENGLISH_GIVEAWAYS) {
          expect(body, `${lang}/${template} leaked English: ${re}`).not.toMatch(re);
        }
      }
    });
  }
});

describe('values survive translation', () => {
  for (const lang of ['en', 'es', 'zh']) {
    it(`${lang}: names, prices and links are preserved`, () => {
      expect(smsBody('completed', lang, VARS)).toContain('129');
      expect(smsBody('completed', lang, VARS)).toContain('Ana');
      expect(smsBody('enroute', lang, VARS)).toContain(VARS.trackUrl);
      expect(smsBody('enroute', lang, VARS)).toContain('8');
      expect(smsBody('review_request', lang, VARS)).toContain(VARS.reviewLink);
      expect(waBody('confirmation', lang, WA_DATA)).toContain(WA_DATA.trackUrl);
      expect(waBody('completed', lang, WA_DATA)).toContain(WA_DATA.reviewUrl);
    });
  }

  it('drops the ETA line entirely when there is no real driving time', () => {
    for (const lang of ['en', 'es', 'zh']) {
      const noEta = smsBody('enroute', lang, { ...VARS, etaMin: null });
      expect(noEta).not.toMatch(/~/);
      expect(waBody('enroute', lang, { ...WA_DATA, eta: null })).not.toMatch(/⏱️/);
    }
  });

  it('omits the time clause when the caller has no time', () => {
    for (const lang of ['en', 'es', 'zh']) {
      const body = smsBody('accepted', lang, { ...VARS, time: '' });
      expect(body).toBeTruthy();
      expect(body).not.toMatch(/14:30/);
    }
  });
});
