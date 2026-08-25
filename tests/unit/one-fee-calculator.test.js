// tests/unit/one-fee-calculator.test.js
//
// Every path that quotes or charges a call-out fee has to produce the same
// number, because handleCreateBooking REFUNDS a payment whose amount does not
// match what it recomputes. js/app.js says so at the payment screen: the
// quote "must match exactly what handleCreateBooking will verify, or a paid
// charge gets rejected as amount mismatch".
//
// It did not match. handleCreateBooking resolved from driving time
// (api/_coverage.js) while handleGetPrice, rescheduleBookingCore and the admin
// booking form each did their own `callout_zones` lookup defaulting to $20 -
// and the browser had a fourth one, getCalloutFee() in js/supabase.js.
//
// North Sydney is the case that bites: $45 by driving time, and no row at all
// in `callout_zones`. A logged-in customer there saw $20 on the payment
// screen, paid $20, and the server recomputed $45, refused it and refunded
// them. From their side the booking just failed, with no explanation.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const authjs = fs.readFileSync(new URL('../../api/auth.js', import.meta.url), 'utf8');
const appjs = fs.readFileSync(new URL('../../js/app.js', import.meta.url), 'utf8');
const supabasejs = fs.readFileSync(new URL('../../js/supabase.js', import.meta.url), 'utf8');

function fnBody(src, name) {
  const start = src.indexOf(`async function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  const next = src.indexOf('\nasync function ', start + 10);
  return src.slice(start, next < 0 ? src.length : next);
}

describe('one calculator for the call-out fee', () => {
  it('handleGetPrice - the number on the payment screen - uses it', () => {
    const fn = fnBody(authjs, 'handleGetPrice');
    expect(fn).toMatch(/calloutFeeForAddress\(\s*address,\s*scheduled_date\s*\)/);
    expect(fn).not.toMatch(/matchCalloutZone/);
    expect(fn).not.toMatch(/let baseCalloutFee = 20;/);
  });

  it('rescheduleBookingCore uses it', () => {
    const fn = fnBody(authjs, 'rescheduleBookingCore');
    expect(fn).toMatch(/calloutFeeForAddress\(bk\.address, scheduled_date\)/);
    expect(fn).not.toMatch(/matchCalloutZone/);
    expect(fn).not.toMatch(/let newCalloutFee = 20;/);
  });

  it('handleCreateBooking - the charge itself - uses the same resolution', () => {
    const fn = fnBody(authjs, 'handleCreateBooking');
    expect(fn).toMatch(/resolveAddressCoverage\(address\)/);
    expect(fn).not.toMatch(/matchCalloutZone/);
  });

  // `callout_zones` is still read, but only from inside resolveAddressCoverage,
  // as the fallback layer for when routing is unavailable. One caller, not four.
  it('callout_zones is read from exactly one place', () => {
    const callSites = authjs.match(/matchCalloutZone\(/g) || [];
    // one definition + one call inside resolveAddressCoverage
    expect(callSites.length).toBe(2);
    expect(fnBody(authjs, 'resolveAddressCoverage')).toMatch(/matchCalloutZone\(sb, address\)/);
  });

  it('$20 is not a fee any more - nothing falls back to it', () => {
    expect(authjs).not.toMatch(/falling back to \$20/);
    expect(supabasejs).not.toMatch(/DEFAULT_CALLOUT_FEE/);
  });
});

describe('the browser never prices an address by itself', () => {
  it('getCalloutFee is gone from js/supabase.js', () => {
    expect(supabasejs).not.toMatch(/export async function getCalloutFee/);
  });

  it('js/app.js does not import it any more', () => {
    expect(appjs).not.toMatch(/^\s*getCalloutFee,\s*$/m);
  });

  it('the payment screen falls back to check-coverage, not to a local guess', () => {
    expect(appjs).toMatch(/async function resolvedCalloutFee\(address, date\)/);
    expect(appjs).toMatch(/role: 'check-coverage', address/);
  });

  // The old default was covered:true / calloutFee:null, which fell through to
  // the browser lookup. A dropped request produced a number nobody would
  // honour instead of an honest "we don't know".
  it('a failed coverage lookup defaults to needsQuote, not to a price', () => {
    expect(appjs).toMatch(
      /let coverage = \{ covered: false, needsQuote: true, calloutFee: null/
    );
  });

  it('an unpriceable address gets the quote route, not a card form', () => {
    expect(appjs).toMatch(/if \(priceUnavailable\) \{\s*\r?\n\s*renderPaymentUnavailable\(screen\);/);
    expect(appjs).toMatch(/function renderPaymentUnavailable\(screen\)/);
  });
});
