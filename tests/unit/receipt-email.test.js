// Whatever passes this check becomes Stripe's receipt_email, which decides
// who is told they were charged - and, later, who is told they were refunded.
//
// On 2026-08-05 a customer paid $20 and every one of those messages went to
// guest@drbikesydney.com.au, a catch-all on Diego's own domain. She heard
// nothing at all. These tests exist so an internal address can never be the
// receipt address again.

import { describe, it, expect } from 'vitest';

// create-payment-session.js builds its Stripe client at import time, so the
// module cannot be loaded at all without a key. A dummy one is enough - none
// of these tests reach the network - and it keeps the fix out of production
// code that is otherwise working.
process.env.STRIPE_SECRET_KEY ||= 'sk_test_dummy_for_unit_tests';
const { isValidReceiptEmail } = await import('../../api/create-payment-session.js');

describe('isValidReceiptEmail', () => {
  it('accepts an ordinary customer address', () => {
    expect(isValidReceiptEmail('thaix@example.com')).toBe(true);
    expect(isValidReceiptEmail('a.b+tag@sub.example.co.uk')).toBe(true);
  });

  it('refuses the address that caused the incident', () => {
    expect(isValidReceiptEmail('guest@drbikesydney.com.au')).toBe(false);
  });

  it('refuses every address on our own domain, not just that one', () => {
    // The next invented address must not be able to repeat it.
    expect(isValidReceiptEmail('noreply@drbikesydney.com.au')).toBe(false);
    expect(isValidReceiptEmail('hello@drbikesydney.com.au')).toBe(false);
    expect(isValidReceiptEmail('GUEST@DrBikeSydney.com.au')).toBe(false);
    expect(isValidReceiptEmail('  guest@drbikesydney.com.au  ')).toBe(false);
  });

  it('refuses anything that is not an address', () => {
    expect(isValidReceiptEmail('')).toBe(false);
    expect(isValidReceiptEmail(null)).toBe(false);
    expect(isValidReceiptEmail(undefined)).toBe(false);
    expect(isValidReceiptEmail('not-an-email')).toBe(false);
    expect(isValidReceiptEmail('missing@domain')).toBe(false);
    expect(isValidReceiptEmail('two@@at.com')).toBe(false);
    expect(isValidReceiptEmail('has space@example.com')).toBe(false);
  });

  it('does not refuse a lookalike domain that is genuinely a customer', () => {
    // Only our exact domain is ours. Somebody else's is not our problem.
    expect(isValidReceiptEmail('someone@drbikesydney.com')).toBe(true);
    expect(isValidReceiptEmail('someone@notdrbikesydney.com.au')).toBe(true);
  });
});
