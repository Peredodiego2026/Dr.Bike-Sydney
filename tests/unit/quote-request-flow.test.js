// tests/unit/quote-request-flow.test.js
//
// Someone outside the same-day area used to be stopped at the address step
// with a toast that vanished in 3 seconds. They had already chosen a service
// and a date; all of it was thrown away, and Diego never heard about them.
//
// Now the booking runs to the end and the last step asks for a price instead
// of a card. Nothing is charged, the enquiry is saved, and the customer is
// handed a WhatsApp message that is already written.
//
// Diego asked for it to arrive "as if the client had sent it from their
// phone". That cannot be faked - a message cannot be made to come FROM
// someone else's number, and the WhatsApp API only sends from the business's
// own. So the customer sends it, which reaches the same result honestly.
//
// Source is read as text (handleRequestQuote does real DB and network work),
// the same approach as payment-amount-trust.test.js. Boundary patterns use
// \r?\n because this repo checks out CRLF on Windows and LF in CI.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { formatMinutes } from '../../api/_coverage.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const authjs = readFileSync(join(root, 'api', 'auth.js'), 'utf8');
const appjs = readFileSync(join(root, 'js', 'app.js'), 'utf8');
const routerjs = readFileSync(join(root, 'js', 'router.js'), 'utf8');
const indexhtml = readFileSync(join(root, 'index.html'), 'utf8');

function grab(src, re, what) {
  const m = src.match(re);
  if (!m) throw new Error(`${what} not found`);
  return m[0];
}

describe('formatMinutes - how the trip reads on a phone', () => {
  it('under an hour stays in minutes', () => {
    expect(formatMinutes(45)).toBe('45min');
    expect(formatMinutes(59)).toBe('59min');
  });

  it('over an hour reads in hours, which is how a drive is judged', () => {
    expect(formatMinutes(65)).toBe('1h 5min');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(95)).toBe('1h 35min');
  });

  it('never renders rubbish into a message', () => {
    expect(formatMinutes(null)).toBe('');
    expect(formatMinutes('soon')).toBe('');
    expect(formatMinutes(-5)).toBe('');
  });
});

describe('handleRequestQuote - saves the enquiry, charges nothing', () => {
  const fn = grab(
    authjs,
    /async function handleRequestQuote\(req, res\) \{[\s\S]*?\r?\n\}\r?\n/,
    'handleRequestQuote'
  );

  it('charges nothing - there is no trip priced yet', () => {
    expect(fn).toMatch(/callout_fee: 0,/);
    expect(fn).not.toMatch(/payment_intent/);
  });

  it('stores it apart from real bookings so revenue cannot be inflated', () => {
    expect(fn).toMatch(/status: 'quote_requested'/);
  });

  it('demands a phone number, because that is how Diego answers', () => {
    expect(fn).toMatch(/A mobile number is required so we can reply/);
  });

  it('saves the row BEFORE anything else, so a lead survives a closed tab', () => {
    const insertAt = fn.indexOf(".from('bookings')");
    const waAt = fn.indexOf('wa.me');
    expect(insertAt).toBeGreaterThan(-1);
    expect(waAt).toBeGreaterThan(-1);
    expect(insertAt).toBeLessThan(waAt);
  });

  it('pre-writes the message the CUSTOMER sends, with the real trip in it', () => {
    expect(fn).toMatch(/Quiero consultar el precio para:/);
    expect(fn.includes('Su sistema me marco: ${trip}')).toBe(true);
    expect(fn).toMatch(/wa\.me\/61433963250\?text=/);
  });

  it('also tells Diego directly, best-effort, in case they never tap send', () => {
    expect(fn).toMatch(/template: 'quote_requested'/);
    expect(fn).toMatch(/replyUrl:/);
  });

  it('is registered in the dispatcher', () => {
    expect(authjs).toMatch(/role === 'request-quote'/);
  });
});

describe('the client: the booking runs to the end, then asks instead of paying', () => {
  it('the summary asks the SERVER whether this is a quote, not its own price table', () => {
    expect(appjs).toMatch(/role: 'check-coverage', address: location/);
    expect(appjs).toMatch(/window\.appState\.needsQuote = Boolean\(coverage\.needsQuote\)/);
  });

  it('shows "Ask for my price" instead of the pay button, and says it is free', () => {
    expect(appjs).toMatch(/translateValue\('Ask for my price'\)/);
    expect(appjs).toMatch(/No charge - we check your address and reply personally\./);
  });

  it('a quote is submitted and returns before the payment screen is ever reached', () => {
    const quoteAt = appjs.indexOf('await submitQuoteRequest(');
    const payAt = appjs.indexOf("router.navigate('payment');");
    expect(quoteAt).toBeGreaterThan(-1);
    expect(payAt).toBeGreaterThan(-1);
    expect(quoteAt).toBeLessThan(payAt);
  });

  it('the confirmation screen exists and is routable', () => {
    expect(routerjs).toMatch(/'quote-sent'/);
    expect(indexhtml).toMatch(/data-screen="quote-sent"/);
    expect(appjs).toMatch(/if \(detail\.route === 'quote-sent'\) renderQuoteSent\(\);/);
  });

  it('the confirmation is a next step, not an apology', () => {
    const fn = grab(
      appjs,
      /function renderQuoteSent\(\) \{[\s\S]*?\r?\n\}\r?\n/,
      'renderQuoteSent'
    );
    expect(fn).toMatch(/We sent your enquiry to the mechanic/);
    expect(fn).toMatch(/Send on WhatsApp/);
    expect(fn).not.toMatch(/[Ss]orry/);
  });
});
