// Audit finding 3 (2026-09-04): the device decided the amount.
//
// handleMechanicComplete accepted `final_charge_amount` from the request body
// with one check - `> 0` - and charged that to the client's saved card. No
// ceiling, no comparison against the service or the parts.
//
// These tests run the real decision function. The wiring test at the bottom
// covers the part a pure function cannot: that the guard actually sits BEFORE
// the Stripe call in api/auth.js, and that the parts are priced from the
// database rather than from the numbers the phone posted.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  chargeCapVerdict,
  DEFAULT_MAX_CHARGE_AUD,
  DEFAULT_MAX_TIP_AUD,
} from '../../api/_charge-cap.js';

// A real job: $109 tune-up, no booking discount, $40 of parts.
const job = (over = {}) => ({
  finalChargeAmount: 149,
  tipAmount: 0,
  servicePrice: 109,
  discountApplied: 0,
  partsSell: 40,
  ...over,
});

describe('the amount a mechanic may charge', () => {
  it('accepts an ordinary completion', () => {
    expect(chargeCapVerdict(job()).ok).toBe(true);
  });

  it('accepts one that came in UNDER the expected total (a discount was applied)', () => {
    const v = chargeCapVerdict(job({ finalChargeAmount: 119 }));
    expect(v.ok).toBe(true);
    expect(v.discrepancy).toBe(-30);
  });

  it('refuses the attack this exists for: an invented amount on a real job', () => {
    const v = chargeCapVerdict(job({ finalChargeAmount: 4999 }));
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('above absolute cap');
  });

  it('refuses an amount that is plausible on its own but not for THIS booking', () => {
    // Under the absolute cap, so only the per-booking ceiling can catch it.
    const v = chargeCapVerdict(job({ finalChargeAmount: 900 }));
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('above expected total');
    expect(v.expected).toBe(149);
  });

  it('leaves headroom for a parts price that moved while the completion sat in the outbox', () => {
    // 20% + $50 over $149 is $228.80.
    expect(chargeCapVerdict(job({ finalChargeAmount: 228 })).ok).toBe(true);
    expect(chargeCapVerdict(job({ finalChargeAmount: 229 })).ok).toBe(false);
  });

  it('refuses a negative amount', () => {
    const v = chargeCapVerdict(job({ finalChargeAmount: -50 }));
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('invalid amount');
  });

  it('refuses an amount that is not a number', () => {
    expect(chargeCapVerdict(job({ finalChargeAmount: 'lots' })).reason).toBe('invalid amount');
  });

  it('accepts no amount at all - the phone posts null when there is nothing to charge', () => {
    const v = chargeCapVerdict(job({ finalChargeAmount: null }));
    expect(v.ok).toBe(true);
  });

  it('caps the tip too, because it is written to the booking and summed in finance', () => {
    expect(chargeCapVerdict(job({ tipAmount: 20 })).ok).toBe(true);
    expect(chargeCapVerdict(job({ tipAmount: DEFAULT_MAX_TIP_AUD + 1 })).reason).toBe(
      'tip above cap'
    );
    expect(chargeCapVerdict(job({ tipAmount: -5 })).reason).toBe('invalid tip');
  });
});

describe('when the parts could not be priced', () => {
  // partsSell null = the lookup did not come back, or a line had no id.
  const blind = (amount) => chargeCapVerdict(job({ partsSell: null, finalChargeAmount: amount }));

  it('does NOT block the completion - a failed lookup must not strand a mechanic', () => {
    // $600 of parts on a $109 service: far over the per-booking ceiling, but
    // nothing here knows that, so it goes through.
    expect(blind(709).ok).toBe(true);
    expect(blind(709).expected).toBeNull();
  });

  it('still refuses anything over the absolute cap', () => {
    expect(blind(DEFAULT_MAX_CHARGE_AUD + 1).reason).toBe('above absolute cap');
  });
});

describe('a booking whose service is free (membership)', () => {
  it('accepts a $0 completion', () => {
    expect(chargeCapVerdict(job({ servicePrice: 0, partsSell: 0, finalChargeAmount: 0 })).ok).toBe(
      true
    );
  });

  it('subtracts the booking discount when working out what to expect', () => {
    const v = chargeCapVerdict(job({ discountApplied: 109, finalChargeAmount: 40 }));
    expect(v.expected).toBe(40);
    expect(v.ok).toBe(true);
  });
});

describe('handleMechanicComplete wiring', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const authjs = readFileSync(join(root, 'api', 'auth.js'), 'utf8');
  const fn = authjs.slice(
    authjs.indexOf('async function handleMechanicComplete('),
    authjs.indexOf('async function ', authjs.indexOf('async function handleMechanicComplete(') + 20)
  );
  // Comments are stripped before matching. A guard that matches its own
  // comment is a mistake this repo has made three times; `[^\n]*` rather than
  // `.*$` because the file is CRLF and `.` does not match a line terminator.
  const code = fn.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  it('decides the amount before creating the PaymentIntent, not after', () => {
    const capAt = code.indexOf('chargeCapVerdict(');
    const chargeAt = code.indexOf('paymentIntents.create');
    expect(capAt).toBeGreaterThan(-1);
    expect(chargeAt).toBeGreaterThan(-1);
    expect(capAt).toBeLessThan(chargeAt);
  });

  it('returns before charging when the verdict refuses', () => {
    expect(code).toMatch(/if \(!cap\.ok\) \{[\s\S]*?return res\.status\(400\)/);
  });

  it('prices the parts from parts_inventory, never from what the phone posted', () => {
    expect(code).toMatch(/parts_inventory\?select=id,sell_price/);
    // unit_price and total are in parts_charged.items and must stay unread.
    expect(code).not.toMatch(/\.unit_price/);
    expect(code).not.toMatch(/parts_charged[\s\S]{0,60}\.total/);
  });

  it('reads the booking price from the row it already fetched, not from the body', () => {
    expect(code).toMatch(/servicePrice: guardRow\?\.service_price/);
    expect(code).toMatch(/discountApplied: guardRow\?\.discount_applied/);
    expect(code).toMatch(/select=status,final_charge_status,service_price,discount_applied/);
  });

  it('logs every completion, not only the refused ones', () => {
    const logAt = code.indexOf("'[mechanic-complete] amount'");
    const rejectAt = code.indexOf('if (!cap.ok)');
    expect(logAt).toBeGreaterThan(-1);
    expect(logAt).toBeLessThan(rejectAt);
  });

  it('lets Diego move both caps from Vercel without a deploy of new code', () => {
    expect(code).toMatch(/process\.env\.MECHANIC_MAX_CHARGE_AUD/);
    expect(code).toMatch(/process\.env\.MECHANIC_MAX_TIP_AUD/);
  });
});
