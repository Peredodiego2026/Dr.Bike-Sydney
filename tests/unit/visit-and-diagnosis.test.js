// tests/unit/visit-and-diagnosis.test.js
//
// "Call-out fee" named a trip. What the customer buys is the trip PLUS a full
// inspection by a mechanic and a diagnosis of what the bike needs - which is
// why it is not refunded when a repair turns out not to be viable.
//
// That policy is fine and ordinary. What makes it defensible is saying so
// BEFORE the card, which the app never did.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { dictSource, composedSource } from '../helpers/i18n-source.js';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const appjs = read('js/app.js');
// Un archivo por idioma desde el split del 01-sep-2026. Se componen con los
// marcadores viejos para que el recorte de abajo siga funcionando igual - y
// ahora el aislamiento es estructural: el contenido de `es` termina donde
// empieza el archivo de `zh`, asi que una traduccion china ya no puede
// satisfacer una afirmacion sobre el espanol (PENDIENTES 66).
const i18njs = ['  es: {', dictSource('es'), '  zh: {', dictSource('zh')].join('\n');
const mail = read('api/send-email.js');
const terms = read('terms.html');

describe('the old name is gone from every surface', () => {
  // A rename that lands on four surfaces out of five is how this project got
  // five duplicate-surface bugs in a month. The check is a sweep, not a list.
  it('no customer-facing file still says call-out fee', () => {
    const skip = new Set(['node_modules', '.git', 'docs', 'tests', 'scripts']);
    const offenders = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
          if (!skip.has(e.name)) walk(path.join(dir, e.name));
          continue;
        }
        if (!/\.(html|js)$/.test(e.name)) continue;
        const txt = fs.readFileSync(path.join(dir, e.name), 'utf8');
        if (/call-out fee/i.test(txt) || /What's My Fee/i.test(txt)) {
          offenders.push(path.join(dir, e.name));
        }
      }
    };
    walk(new URL(root).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    expect(offenders).toEqual([]);
  });

  it('the new name is what the summary shows', () => {
    expect(appjs).toMatch(/visit & diagnosis fee is charged now via Stripe/);
  });
});

describe('what the fee buys is stated before the card', () => {
  const summary = appjs.slice(
    appjs.indexOf('async function renderServiceSummary'),
    appjs.indexOf('function renderQuoteSent')
  );

  it('the block exists in the summary', () => {
    expect(summary).toMatch(/What the visit & diagnosis covers/);
  });

  // Before the pay button, or it is a term nobody agreed to.
  it('and it comes before the pay control', () => {
    const scope = summary.indexOf('What the visit & diagnosis covers');
    const pay = summary.indexOf('id="proceed-btn"');
    expect(scope).toBeGreaterThan(-1);
    expect(pay).toBeGreaterThan(-1);
    expect(scope).toBeLessThan(pay);
  });

  it('it says the service is not charged when the repair is not possible', () => {
    expect(summary).toMatch(/the service fee is not charged/);
  });

  it('and that the fee itself is not refunded', () => {
    expect(summary).toMatch(/covers that inspection and is not refunded/);
  });

  it('in all three languages', () => {
    for (const k of [
      'What the visit & diagnosis covers',
      'A mechanic comes to you, inspects the whole bike',
    ]) {
      const first = i18njs.indexOf(k);
      expect(first).toBeGreaterThan(-1);
      expect(i18njs.indexOf(k, first + 1)).toBeGreaterThan(-1);
    }
  });

  it('the terms carry it too', () => {
    expect(terms).toMatch(/[Vv]isit & diagnosis/);
  });
});

// "$160.80" with no mention of the $30 already charged reads as a second bill.
describe('the confirmation email does the arithmetic', () => {
  it('the client sends what was already paid', () => {
    expect(appjs).toMatch(/calloutPaid: fee,/);
  });

  it('the email subtracts it', () => {
    expect(mail).toMatch(/const paidNow = Number\(req\.body\.calloutPaid\) \|\| 0;/);
    expect(mail).toMatch(/const stillOwed = Math\.max\(0, \(Number\(price\) \|\| 0\) - paidNow\);/);
  });

  it('and shows what is actually owed', () => {
    expect(mail).toMatch(/To pay the mechanic on completion/);
    expect(mail).toMatch(/already paid/);
  });

  // Only the confirmation passes calloutPaid; the other five templates share
  // bookingTable() and must be untouched.
  it('the other templates are unaffected', () => {
    expect(mail).toMatch(/paidNow > 0\s*$/m);
  });

  it('the caveat travels with it', () => {
    expect(mail).toMatch(/if the repair turns out not to be possible/);
  });
});
