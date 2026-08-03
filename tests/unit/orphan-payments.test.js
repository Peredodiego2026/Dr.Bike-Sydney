// Which Stripe payments deserve waking Diego up at 9am.
//
// Both directions cost real money if wrong. A false negative is finding 12.3
// itself: the $20 is charged before the booking row is written, so a failed
// create-booking leaves money with no service behind it and nobody knows. A
// false positive is worse in practice - a daily WhatsApp about a payment that
// is perfectly fine is how an alert stops being read at all.

import { describe, it, expect } from 'vitest';
import { isOrphanCandidate } from '../../api/send-cron.js';

const NOW = 1_800_000_000;
const OLD = NOW - 60 * 60; // an hour ago, well past the grace window

const pi = (over = {}) => ({
  id: 'pi_test',
  status: 'succeeded',
  amount_received: 2000,
  created: OLD,
  metadata: {},
  ...over,
});

const check = (over) => isOrphanCandidate(pi(over), { nowSeconds: NOW });

describe('isOrphanCandidate', () => {
  it('flags a settled call-out charge for checking', () => {
    expect(check()).toBe(true);
  });

  it('ignores a payment still inside the grace window', () => {
    // create-booking may simply not have finished writing the row yet.
    expect(check({ created: NOW - 60 })).toBe(false);
    expect(check({ created: NOW - 14 * 60 })).toBe(false);
    expect(check({ created: NOW - 16 * 60 })).toBe(true);
  });

  it('ignores anything that did not actually take money', () => {
    expect(check({ status: 'requires_payment_method' })).toBe(false);
    expect(check({ status: 'canceled' })).toBe(false);
    expect(check({ amount_received: 0 })).toBe(false);
  });

  it('ignores a payment that was already refunded', () => {
    // handleCreateBooking refunds out-of-zone addresses itself. Money taken
    // and given back is not money kept without a booking.
    expect(check({ latest_charge: { refunded: true } })).toBe(false);
    expect(check({ latest_charge: { amount_refunded: 2000 } })).toBe(false);
    // Older API shape, in case the account is pinned to one that still sends it
    expect(check({ charges: { data: [{ refunded: true }] } })).toBe(false);
  });

  it('survives latest_charge coming back as a bare id string', () => {
    // Without expand, Stripe sends the id rather than the object. That is not
    // evidence of a refund, so it must not be read as one either way.
    expect(check({ latest_charge: 'ch_123' })).toBe(true);
  });

  it('ignores subscription invoices and gift cards', () => {
    expect(check({ invoice: 'in_123' })).toBe(false);
    expect(check({ metadata: { giftCard: 'true' } })).toBe(false);
  });

  it('ignores a payment Diego was already told about', () => {
    // The dedup mark lives in Stripe's own metadata - there is no table.
    expect(check({ metadata: { orphan_alerted: '1800000000' } })).toBe(false);
  });

  it('does not throw on a missing or malformed payment', () => {
    expect(isOrphanCandidate(null, { nowSeconds: NOW })).toBe(false);
    expect(isOrphanCandidate({}, { nowSeconds: NOW })).toBe(false);
  });
});
