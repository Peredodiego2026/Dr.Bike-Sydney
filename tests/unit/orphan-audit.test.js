// The audit that answers "how many people paid us and got nothing between
// 2026-07-04 and 2026-08-05" (PENDIENTES section 14).
//
// Two things must not go wrong here, because both under-report money owed to
// real people:
//
//   1. a payment that DOES have a booking must never be listed as an orphan,
//      and a payment that does not must never be dropped;
//   2. running out of Stripe pages must be reported, not silently truncated
//      into a shorter list that looks complete.

import { describe, it, expect } from 'vitest';
import { auditOrphanPayments, isOrphanCandidate, orphanRow } from '../../api/_orphan-audit.js';

const NOW = 1786000000;
const pi = (over = {}) => ({
  id: 'pi_1',
  status: 'succeeded',
  amount_received: 2000,
  currency: 'aud',
  created: NOW - 86400,
  metadata: {},
  ...over,
});

// A Stripe stub that hands back fixed pages, so nothing here touches network.
const fakeStripe = (pages) => {
  let call = 0;
  return {
    paymentIntents: {
      list: async () => {
        const data = pages[call] || [];
        const has_more = call < pages.length - 1;
        call++;
        return { data, has_more };
      },
    },
  };
};

// A Supabase stub whose bookings table knows about `bookedIds`.
const fakeSb = (bookedIds) => ({
  from: () => ({
    select: () => ({
      in: async (_col, ids) => ({
        data: ids
          .filter((id) => bookedIds.includes(id))
          .map((id) => ({
            stripe_payment_intent_id: id,
          })),
        error: null,
      }),
    }),
  }),
});

describe('isOrphanCandidate, audit mode', () => {
  it('still reports a payment the daily cron already alerted about', () => {
    // The cron hides these so it does not wake Diego twice. An unresolved
    // July alert is exactly what an audit is looking for.
    const alerted = pi({ metadata: { orphan_alerted: '123' } });
    expect(isOrphanCandidate(alerted, { nowSeconds: NOW })).toBe(false);
    expect(isOrphanCandidate(alerted, { nowSeconds: NOW, ignoreAlerted: true })).toBe(true);
  });

  it('never reports money that was given back', () => {
    const refunded = pi({ latest_charge: { refunded: true } });
    expect(isOrphanCandidate(refunded, { nowSeconds: NOW, ignoreAlerted: true })).toBe(false);
  });

  it('never reports a subscription invoice or a gift card', () => {
    const opts = { nowSeconds: NOW, ignoreAlerted: true };
    expect(isOrphanCandidate(pi({ invoice: 'in_1' }), opts)).toBe(false);
    expect(isOrphanCandidate(pi({ metadata: { giftCard: 'true' } }), opts)).toBe(false);
  });
});

describe('auditOrphanPayments', () => {
  it('lists only the payments with no booking, and totals them', async () => {
    const stripe = fakeStripe([
      [pi({ id: 'pi_booked' }), pi({ id: 'pi_orphan_a' }), pi({ id: 'pi_orphan_b' })],
    ]);
    const r = await auditOrphanPayments({
      stripe,
      sb: fakeSb(['pi_booked']),
      fromSeconds: NOW - 100000,
      toSeconds: NOW,
      nowSeconds: NOW,
    });
    expect(r.checked).toBe(3);
    expect(r.orphans.map((o) => o.id)).toEqual(['pi_orphan_a', 'pi_orphan_b']);
    expect(r.total).toBe(40);
    expect(r.truncated).toBe(false);
  });

  it('reports nothing when every payment has a booking', async () => {
    const stripe = fakeStripe([[pi({ id: 'pi_a' }), pi({ id: 'pi_b' })]]);
    const r = await auditOrphanPayments({
      stripe,
      sb: fakeSb(['pi_a', 'pi_b']),
      fromSeconds: NOW - 100000,
      toSeconds: NOW,
      nowSeconds: NOW,
    });
    expect(r.orphans).toEqual([]);
    expect(r.total).toBe(0);
  });

  it('walks past the first page instead of stopping at 100 payments', async () => {
    const stripe = fakeStripe([[pi({ id: 'pi_1' })], [pi({ id: 'pi_2' })]]);
    const r = await auditOrphanPayments({
      stripe,
      sb: fakeSb([]),
      fromSeconds: NOW - 100000,
      toSeconds: NOW,
      nowSeconds: NOW,
    });
    expect(r.orphans.map((o) => o.id)).toEqual(['pi_1', 'pi_2']);
  });

  it('says so when it runs out of pages, rather than looking complete', async () => {
    const stripe = fakeStripe([[pi({ id: 'pi_1' })], [pi({ id: 'pi_2' })], [pi({ id: 'pi_3' })]]);
    const r = await auditOrphanPayments({
      stripe,
      sb: fakeSb([]),
      fromSeconds: NOW - 100000,
      toSeconds: NOW,
      nowSeconds: NOW,
      maxPages: 2,
    });
    expect(r.truncated).toBe(true);
    expect(r.orphans).toHaveLength(2);
  });

  it('throws instead of calling everything an orphan when the booking lookup fails', async () => {
    // Swallowing this error would report every payment in the range as
    // unbooked - the worst possible wrong answer here.
    const brokenSb = {
      from: () => ({
        select: () => ({ in: async () => ({ data: null, error: { message: 'boom' } }) }),
      }),
    };
    await expect(
      auditOrphanPayments({
        stripe: fakeStripe([[pi({ id: 'pi_1' })]]),
        sb: brokenSb,
        fromSeconds: NOW - 100000,
        toSeconds: NOW,
        nowSeconds: NOW,
      })
    ).rejects.toThrow(/booking lookup failed/);
  });
});

describe('orphanRow', () => {
  it('carries what Diego needs to act, including a link into Stripe', () => {
    const row = orphanRow(
      pi({ id: 'pi_x', amount_received: 2000, receipt_email: 'a@b.com', created: NOW })
    );
    expect(row).toMatchObject({
      id: 'pi_x',
      amount: 20,
      currency: 'AUD',
      email: 'a@b.com',
      stripeUrl: 'https://dashboard.stripe.com/payments/pi_x',
    });
  });

  it('prefers the metadata email the checkout captured over the receipt one', () => {
    const row = orphanRow(pi({ metadata: { email: 'meta@b.com' }, receipt_email: 'r@b.com' }));
    expect(row.email).toBe('meta@b.com');
  });
});
