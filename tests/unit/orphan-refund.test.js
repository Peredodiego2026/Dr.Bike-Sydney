// tests/unit/orphan-refund.test.js
//
// Diego's rule, stated as a requirement and not a question: "Nunca puede
// existir un cobro sin reserva. Si la reserva no se puede crear, no se cobra;
// y si el cobro ya salio, se reembolsa solo, SIN QUE NADIE TENGA QUE MIRAR."
//
// Three nets already existed and none of them finished the job:
//
//   1. api/stripe-webhook.js rebuilds the booking from the PaymentIntent's
//      metadata, so a browser dying after the charge is survivable. But it
//      returns {skipped} - keeping the money - when the metadata is missing or
//      incomplete, and Stripe eventually stops retrying a webhook that keeps
//      failing.
//   2. The webhook refunds on an amount mismatch. Only on that.
//   3. The daily cron found orphans and sent Diego a WhatsApp reading
//      "Either create the booking manually or refund it in Stripe."
//
// Net 3 is the one that looks like the rule and isn't: it asks a human to
// look. Worse, it asked once. `isOrphanCandidate` skips anything carrying
// `orphan_alerted`, so a payment Diego was told about and never acted on
// dropped out of the cron permanently - the client's money kept, silently,
// forever. And when no admin WhatsApp is configured, or Twilio is down, the
// handler `continue`s: no alert, no mark, no refund, a console.error nobody
// reads.
//
// orphanAction is the decision that closes it: alert first, then give the
// money back on its own if the booking still does not exist.
import { describe, it, expect } from 'vitest';
import {
  orphanAction,
  ORPHAN_REFUND_AFTER_HOURS,
  ORPHAN_HARD_REFUND_AFTER_HOURS,
} from '../../api/_orphan-audit.js';

const NOW = 1_800_000_000;
const hoursAgo = (h) => NOW - h * 3600;

const pi = (over = {}) => ({
  id: 'pi_test',
  status: 'succeeded',
  amount_received: 3000,
  created: hoursAgo(1),
  metadata: {},
  ...over,
});

const act = (over) => orphanAction(pi(over), { nowSeconds: NOW });

describe('orphanAction', () => {
  it('alerts on a fresh orphan nobody has been told about', () => {
    expect(act()).toBe('alert');
  });

  // The old behaviour ended here. This is the case that kept a real client's
  // money: told once, never revisited.
  it('waits, not forgets, once Diego has been alerted', () => {
    expect(act({ metadata: { orphan_alerted: '123' } })).toBe('wait');
  });

  // Diego, after the first version shipped: "cuando pase esto me tiene que
  // llegar un mensaje que se genero un pago sin reserva". Nothing is refunded
  // before he has been told - he has to get the chance to turn a real job into
  // a real booking.
  it('never refunds something Diego was not told about first', () => {
    const old = hoursAgo(ORPHAN_REFUND_AFTER_HOURS + 1);
    expect(orphanAction(pi({ created: old }), { nowSeconds: NOW })).toBe('alert');
  });

  // The case the first version got wrong, and it is the ORDINARY one: the
  // sweep runs once a day, so a payment made shortly after a run is already
  // past the 24h deadline the first time it is seen. The old code went
  // straight to 'refund' and Diego never got the alert at all.
  it('a payment already past the deadline on first sighting still alerts', () => {
    expect(orphanAction(pi({ created: hoursAgo(30) }), { nowSeconds: NOW })).toBe('alert');
    expect(orphanAction(pi({ created: hoursAgo(47) }), { nowSeconds: NOW })).toBe('alert');
  });

  it('refunds once alerted and past the deadline', () => {
    const old = hoursAgo(ORPHAN_REFUND_AFTER_HOURS + 1);
    expect(
      orphanAction(pi({ created: old, metadata: { orphan_alerted: '123' } }), { nowSeconds: NOW })
    ).toBe('refund');
  });

  // The backstop. If no admin WhatsApp is configured, or Twilio is down for
  // days, `orphan_alerted` never gets set - and "never refund before telling
  // him" would then keep a client's money forever, which is the failure this
  // whole thing exists to end.
  it('gives the money back after 3 days even if the alert never went out', () => {
    expect(
      orphanAction(pi({ created: hoursAgo(ORPHAN_HARD_REFUND_AFTER_HOURS + 1) }), {
        nowSeconds: NOW,
      })
    ).toBe('refund');
  });

  it('the hard deadline is longer than the normal one, or it would never apply', () => {
    expect(ORPHAN_HARD_REFUND_AFTER_HOURS).toBeGreaterThan(ORPHAN_REFUND_AFTER_HOURS);
    expect(ORPHAN_HARD_REFUND_AFTER_HOURS).toBe(72);
  });

  it('is exactly at the boundary, not near it', () => {
    const h = ORPHAN_REFUND_AFTER_HOURS;
    const alerted = { orphan_alerted: '123' };
    expect(
      orphanAction(pi({ created: hoursAgo(h - 0.01), metadata: alerted }), { nowSeconds: NOW })
    ).toBe('wait');
    expect(orphanAction(pi({ created: hoursAgo(h), metadata: alerted }), { nowSeconds: NOW })).toBe(
      'refund'
    );
  });

  // Idempotency. The cron runs daily and Stripe's list is a rolling 48h window,
  // so a refunded payment is seen again tomorrow. Refunding twice is an error
  // Stripe would reject, but relying on that is relying on a stranger.
  it('never refunds the same payment twice', () => {
    expect(act({ created: hoursAgo(72), metadata: { orphan_refunded: '123' } })).toBe('done');
  });

  it('treats a refunded-and-alerted payment as done, not as a new alert', () => {
    expect(
      act({ metadata: { orphan_alerted: '1', orphan_refunded: '2' }, created: hoursAgo(72) })
    ).toBe('done');
  });

  it('does not throw on a malformed payment', () => {
    expect(() => orphanAction(null, { nowSeconds: NOW })).not.toThrow();
    expect(() => orphanAction({}, { nowSeconds: NOW })).not.toThrow();
  });

  // A payment with no `created` has no age, so it cannot be shown to be past
  // the deadline. Alerting is the safe answer; refunding on a guess would give
  // away money that may well have a booking behind it.
  it('never refunds a payment whose age it cannot establish', () => {
    expect(orphanAction({ metadata: {} }, { nowSeconds: NOW })).toBe('alert');
  });

  // 24h is a deliberate default, not an accident: long enough that Diego can
  // still create the booking by hand after the alert, short enough that nobody
  // waits a weekend for their money. Changing it is a business decision, so it
  // gets asserted rather than left to drift.
  it('gives Diego a full day to fix it by hand first', () => {
    expect(ORPHAN_REFUND_AFTER_HOURS).toBe(24);
  });

  // The lookback window has to outlast the deadline or the payment ages out of
  // Stripe's list before it is ever eligible to be refunded.
  it('the deadline fits inside the cron lookback window', async () => {
    const fs = await import('node:fs');
    const cron = fs.readFileSync(new URL('../../api/send-cron.js', import.meta.url), 'utf8');
    const lookback = Number(cron.match(/ORPHAN_LOOKBACK_HOURS = (\d+)/)?.[1]);
    expect(lookback).toBeGreaterThan(ORPHAN_REFUND_AFTER_HOURS);
  });
});

// ---------------------------------------------------------------------------
// The scenario Diego asked to see proven, end to end: the network dies in the
// gap between "Stripe took the money" and "the booking row exists".
//
// This drives the real cross-check (auditOrphanPayments) against a fake Stripe
// and a fake database, so the assertion is about the actual matching logic and
// not about a restatement of it.
// ---------------------------------------------------------------------------
import { auditOrphanPayments } from '../../api/_orphan-audit.js';

const stripeWith = (intents) => ({
  paymentIntents: { list: async () => ({ data: intents, has_more: false }) },
});

// `bookedIds` is what survived the outage. Everything else was charged and
// lost.
const sbWith = (bookedIds) => ({
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

describe('the network dies between the charge and the booking', () => {
  const charged = pi({ id: 'pi_lost', created: hoursAgo(2), amount_received: 3000 });
  const survived = pi({ id: 'pi_ok', created: hoursAgo(2), amount_received: 3000 });

  it('the payment with no booking behind it is found', async () => {
    const out = await auditOrphanPayments({
      stripe: stripeWith([charged, survived]),
      sb: sbWith(['pi_ok']),
      fromSeconds: hoursAgo(48),
      toSeconds: NOW,
      nowSeconds: NOW,
    });
    expect(out.orphans.map((o) => o.id)).toEqual(['pi_lost']);
    expect(out.total).toBe(30);
  });

  it('and the one that did become a booking is never touched', async () => {
    const out = await auditOrphanPayments({
      stripe: stripeWith([survived]),
      sb: sbWith(['pi_ok']),
      fromSeconds: hoursAgo(48),
      toSeconds: NOW,
      nowSeconds: NOW,
    });
    expect(out.orphans).toEqual([]);
  });

  // The full timeline of the lost payment: alerted first, refunded on its own
  // a day later. Nobody had to look at anything.
  it('ends with the client refunded, without anyone looking', () => {
    expect(orphanAction(charged, { nowSeconds: NOW })).toBe('alert');

    const alertedNow = { ...charged, metadata: { orphan_alerted: String(NOW) } };
    expect(orphanAction(alertedNow, { nowSeconds: NOW })).toBe('wait');

    const aDayLater = NOW + 25 * 3600;
    expect(orphanAction(alertedNow, { nowSeconds: aDayLater })).toBe('refund');

    const afterRefund = {
      ...alertedNow,
      metadata: { ...alertedNow.metadata, orphan_refunded: '1' },
    };
    expect(orphanAction(afterRefund, { nowSeconds: aDayLater + 86400 })).toBe('done');
  });

  // The catastrophic failure mode of an automatic refund: if the bookings
  // lookup fails and is treated as "no bookings found", every healthy payment
  // in the window looks like an orphan and the day's takings refund
  // themselves. It has to abort, not assume.
  it('refuses to proceed when the booking lookup fails', async () => {
    const brokenSb = {
      from: () => ({
        select: () => ({ in: async () => ({ data: null, error: { message: 'connection lost' } }) }),
      }),
    };
    await expect(
      auditOrphanPayments({
        stripe: stripeWith([charged, survived]),
        sb: brokenSb,
        fromSeconds: hoursAgo(48),
        toSeconds: NOW,
        nowSeconds: NOW,
      })
    ).rejects.toThrow(/booking lookup failed/);
  });
});
