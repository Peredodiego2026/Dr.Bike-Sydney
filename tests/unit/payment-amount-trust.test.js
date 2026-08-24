// Audit finding (2026-08-23): a client controls `priceCents` when asking
// create-payment-session.js for a PaymentIntent. handleCreateBooking already
// re-verifies the charged amount against the authoritative price before
// writing a booking - but the "browser never came back" webhook fallback
// (docs/PENDIENTES.md 14) trusted `pi.amount_received` as the price outright.
// Combined, a client could pay a tampered $0.50, abandon the browser, and the
// webhook would still create a real booking - mechanic dispatched - at $0.50.
//
// This tests the source, not the live DB/Stripe calls (this file's own test
// convention - see webhook-booking.test.js, availability-blocks.test.js):
// handlePaymentIntentSucceeded and its neighbours do real network I/O, so the
// same "read the function body, assert on its shape" approach applies here.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const webhookjs = readFileSync(join(root, 'api', 'stripe-webhook.js'), 'utf8');
const authjs = readFileSync(join(root, 'api', 'auth.js'), 'utf8');
const invoicejs = readFileSync(join(root, 'api', 'send-invoice.js'), 'utf8');

function grab(src, re, what) {
  const m = src.match(re);
  if (!m) throw new Error(`${what} not found`);
  return m[0];
}

describe('handlePaymentIntentSucceeded - no longer trusts pi.amount_received as the price', () => {
  const fn = grab(
    webhookjs,
    /async function handlePaymentIntentSucceeded\(pi\) \{[\s\S]*?\n\}/,
    'handlePaymentIntentSucceeded'
  );

  it('imports the same authoritative-price functions the real booking flow uses', () => {
    expect(webhookjs).toMatch(
      /import \{ matchCalloutZone, applySurcharge, applyMembershipPricing \} from '\.\/auth\.js';/
    );
  });

  it('recomputes calloutFee from callout_zones instead of reading it off the payment', () => {
    expect(fn).toMatch(/matchCalloutZone\(sb, md\.bk_address\)/);
    expect(fn).toMatch(/applySurcharge\(calloutFee, md\.bk_date\)/);
    expect(fn).not.toMatch(/callout_fee:\s*pi\.amount_received\s*\/\s*100/);
  });

  it('applies the same membership discount a logged-in client would get, matched by email', () => {
    expect(fn).toMatch(/applyMembershipPricing\(/);
    expect(fn).toMatch(/accountId && md\.bk_guest !== '1'/);
  });

  it('refunds and refuses to write a booking on any amount mismatch', () => {
    expect(fn).toMatch(
      /Math\.round\(amountReceived \* 100\) !== Math\.round\(calloutFee \* 100\)/
    );
    expect(fn).toMatch(/stripe\.refunds\.create\(\{ payment_intent: pi\.id \}\)/);
    expect(fn).toMatch(/return \{ rejected: 'amount mismatch'/);
  });

  it('the booking row that does get written uses the verified fee, not the raw payment amount', () => {
    expect(fn).toMatch(/callout_fee: calloutFee,/);
  });
});

describe('handleCreateBooking - slot-conflict refund failure no longer vanishes silently', () => {
  const fn = grab(
    authjs,
    /if \(insErr\) \{\s*if \(insErr\.code === '23505'\) \{[\s\S]*?\n    \}/,
    'slot-conflict branch'
  );

  it('logs if the refund itself throws, instead of an empty catch{}', () => {
    expect(fn).toMatch(/catch \(e\) \{/);
    expect(fn).toMatch(/console\.error\('\[create-booking\] slot-conflict refund failed:'/);
  });

  it('only tells the client they were refunded if the refund actually succeeded', () => {
    expect(fn).toMatch(/refunded = true;/);
    expect(fn).toMatch(/refunded\s*\n\s*\? ' Your payment has been refunded\.'/);
  });
});

describe('applyMembershipPricing is exported for the webhook to reuse', () => {
  it('carries the export keyword', () => {
    expect(authjs).toMatch(/export async function applyMembershipPricing\(/);
  });
});

describe('mechanic-complete discount-code consume - logs instead of swallowing', () => {
  it('no longer has a bare catch{}', () => {
    expect(authjs).not.toMatch(/\n\s*\} catch \{\}\n\s*\}\n\n {2}\/\/ Read the booking BEFORE the PATCH/);
    expect(authjs).toMatch(
      /console\.error\('\[mechanic-complete\] discount-code consume failed:'/
    );
  });
});

describe('send-invoice.js checklist/photos lookup - logs instead of swallowing', () => {
  it('both catches now log', () => {
    expect(invoicejs).toMatch(
      /console\.warn\('\[send-invoice\] pre_service_checklist not valid JSON:'/
    );
    expect(invoicejs).toMatch(
      /console\.error\('\[send-invoice\] checklist\/photos lookup failed:'/
    );
  });
});
