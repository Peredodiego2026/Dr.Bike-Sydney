// tests/unit/slot-hold.test.js
//
// Diego, on being told the app charges before it writes the booking: "debe ser
// primero la reserva... el sentido comun de la pagina web es bloquear primero
// la fecha y la hora, y despues ocurre el pago. No entiendo por que estaba al
// reves."
//
// Nobody decided it was backwards. Picking a date in step 2 only ever set
// window.appState.date - in the browser's memory. There was ONE write to the
// database and it came last, after the charge.
//
// A CORRECTION, KEPT ON PURPOSE
//
// The first version of this header claimed the double-booking race leaves the
// second customer charged with no booking, and used that to argue the change
// was urgent. That was wrong, and it was wrong in the direction that makes a
// risky refactor of the payment flow sound necessary.
//
// The race is real. The loss is not: api/auth.js:1319 catches the 23505 from
// `bookings_unique_slot` and refunds before returning 409. What holding the
// slot first actually buys is that the card is never charged for a slot the
// client cannot have - no charge-and-refund taking days to clear - and that
// nothing depends on the refund itself succeeding, which is the one thing that
// fails when Stripe is what is down.
//
// Worth doing. Not urgent. The tests below are the foundation, not the feature.
import { describe, it, expect } from 'vitest';
import {
  HOLD_MINUTES,
  isExpiredHold,
  occupiedBookings,
  isOwnHold,
  slotVerdict,
  expiredHoldIds,
} from '../../api/_slot-hold.js';

const NOW = Date.parse('2026-08-31T10:00:00Z');
const minsAgo = (m) => new Date(NOW - m * 60000).toISOString();

const hold = (over = {}) => ({
  id: 'bk_hold',
  status: 'pending',
  stripe_payment_intent_id: null,
  created_at: minsAgo(1),
  scheduled_date: '2026-09-03',
  scheduled_time: '10:00:00',
  client_id: 'client-a',
  client_email: 'a@example.com',
  ...over,
});

describe('what counts as an expired hold', () => {
  it('a fresh hold is not expired', () => {
    expect(isExpiredHold(hold(), NOW)).toBe(false);
  });

  it('a hold past the window is', () => {
    expect(isExpiredHold(hold({ created_at: minsAgo(HOLD_MINUTES + 1) }), NOW)).toBe(true);
  });

  it('is exactly at the boundary', () => {
    expect(isExpiredHold(hold({ created_at: minsAgo(HOLD_MINUTES - 0.1) }), NOW)).toBe(false);
    expect(isExpiredHold(hold({ created_at: minsAgo(HOLD_MINUTES) }), NOW)).toBe(true);
  });

  // Every one of these is a slot somebody has a real claim on. Freeing one is
  // the mistake that costs a customer their appointment, so each is its own
  // refusal rather than a clause in a bigger condition.
  it('never frees a booking that was paid for', () => {
    const paid = hold({ created_at: minsAgo(600), stripe_payment_intent_id: 'pi_123' });
    expect(isExpiredHold(paid, NOW)).toBe(false);
  });

  it('never frees a confirmed or in-progress job', () => {
    for (const status of ['confirmed', 'enroute', 'in_progress', 'arrived', 'completed']) {
      expect(isExpiredHold(hold({ status, created_at: minsAgo(600) }), NOW), status).toBe(false);
    }
  });

  it('never frees one whose age cannot be established', () => {
    expect(isExpiredHold(hold({ created_at: null, ...{} }), NOW)).toBe(false);
    expect(isExpiredHold(hold({ created_at: 'not a date' }), NOW)).toBe(false);
    expect(isExpiredHold(hold({ created_at: undefined }), NOW)).toBe(false);
  });

  // An empty string is as much "no payment" as null is, and a row written by a
  // path that sets '' instead of NULL must still be treated as a hold.
  it('treats an empty payment intent as no payment', () => {
    expect(
      isExpiredHold(hold({ stripe_payment_intent_id: '', created_at: minsAgo(60) }), NOW)
    ).toBe(true);
  });

  it('does not throw on rubbish', () => {
    expect(isExpiredHold(null, NOW)).toBe(false);
    expect(isExpiredHold(undefined, NOW)).toBe(false);
    expect(isExpiredHold('nope', NOW)).toBe(false);
    expect(isExpiredHold({}, NOW)).toBe(false);
  });
});

describe('what still occupies the calendar', () => {
  // Without this, one abandoned checkout retires a sellable slot for good.
  it('an abandoned hold stops blocking its slot', () => {
    const rows = [hold({ id: 'stale', created_at: minsAgo(90) }), hold({ id: 'fresh' })];
    expect(occupiedBookings(rows, NOW).map((b) => b.id)).toEqual(['fresh']);
  });

  it('paid bookings always stay busy', () => {
    const rows = [hold({ id: 'paid', created_at: minsAgo(900), stripe_payment_intent_id: 'pi_1' })];
    expect(occupiedBookings(rows, NOW)).toHaveLength(1);
  });

  it('survives an empty or missing list', () => {
    expect(occupiedBookings([], NOW)).toEqual([]);
    expect(occupiedBookings(null, NOW)).toEqual([]);
  });
});

describe('a client meeting their own hold', () => {
  const who = {
    clientId: 'client-a',
    email: 'a@example.com',
    date: '2026-09-03',
    time: '10:00:00',
  };

  // Reloading the payment screen must not tell someone their own slot is taken,
  // and must not leave two rows behind either.
  it('recognises it by client id', () => {
    expect(isOwnHold(hold(), who)).toBe(true);
  });

  // Guests have no client_id at all, so the email is the only thread back.
  it('recognises a guest by email, case-insensitively', () => {
    const guest = hold({ client_id: null, client_email: 'A@Example.com' });
    expect(isOwnHold(guest, { ...who, clientId: null })).toBe(true);
  });

  it('is not somebody else', () => {
    expect(isOwnHold(hold({ client_id: 'client-b', client_email: 'b@x.com' }), who)).toBe(false);
  });

  // A hold for a different time is a different hold. Claiming it would move
  // somebody's appointment.
  it('is not the same person at a different time', () => {
    expect(isOwnHold(hold({ scheduled_time: '14:00:00' }), who)).toBe(false);
    expect(isOwnHold(hold({ scheduled_date: '2026-09-04' }), who)).toBe(false);
  });

  it('is never a paid booking', () => {
    expect(isOwnHold(hold({ stripe_payment_intent_id: 'pi_1' }), who)).toBe(false);
  });
});

describe('the verdict the payment step acts on', () => {
  const who = {
    clientId: 'client-a',
    email: 'a@example.com',
    date: '2026-09-03',
    time: '10:00:00',
  };

  it('free when nothing is there', () => {
    expect(slotVerdict([], who, NOW).verdict).toBe('free');
  });

  it('free when the only thing there is an abandoned hold', () => {
    expect(slotVerdict([hold({ created_at: minsAgo(90) })], who, NOW).verdict).toBe('free');
  });

  it('mine when the caller already holds it, and hands back the row', () => {
    const out = slotVerdict([hold({ id: 'bk_mine' })], who, NOW);
    expect(out.verdict).toBe('mine');
    expect(out.bookingId).toBe('bk_mine');
  });

  it('taken when somebody else holds it', () => {
    const other = hold({ id: 'bk_other', client_id: 'client-b', client_email: 'b@x.com' });
    expect(slotVerdict([other], who, NOW).verdict).toBe('taken');
  });

  // The exact race this whole change exists to close: two people at the same
  // slot, the second one about to pay for something they cannot have.
  it('taken when somebody else has already PAID for it', () => {
    const paid = hold({
      id: 'bk_paid',
      client_id: 'client-b',
      client_email: 'b@x.com',
      stripe_payment_intent_id: 'pi_1',
    });
    expect(slotVerdict([paid], who, NOW).verdict).toBe('taken');
  });

  it('a booking at another time does not make this slot taken', () => {
    const elsewhere = hold({ id: 'x', client_id: 'client-b', scheduled_time: '14:00:00' });
    expect(slotVerdict([elsewhere], who, NOW).verdict).toBe('free');
  });
});

describe('the rows that must be cancelled before inserting', () => {
  // `bookings_unique_slot` covers every status except 'cancelled', so an
  // expired hold still blocks the index even though availability shows the
  // slot free. Without cancelling it first, the next insert is rejected - and
  // that rejection is exactly the orphan payment this change removes.
  it('lists the expired ones only', () => {
    const rows = [
      hold({ id: 'stale-1', created_at: minsAgo(20) }),
      hold({ id: 'fresh' }),
      hold({ id: 'paid', created_at: minsAgo(900), stripe_payment_intent_id: 'pi_1' }),
      hold({ id: 'stale-2', created_at: minsAgo(45) }),
    ];
    expect(expiredHoldIds(rows, NOW).sort()).toEqual(['stale-1', 'stale-2']);
  });

  it('is empty when there is nothing to clean', () => {
    expect(expiredHoldIds([hold()], NOW)).toEqual([]);
    expect(expiredHoldIds(null, NOW)).toEqual([]);
  });
});

describe('the window itself', () => {
  // A business decision, so it is asserted rather than left to drift. Long
  // enough to type a card number, short enough that an abandoned checkout does
  // not cost a real booking.
  it('is 15 minutes', () => {
    expect(HOLD_MINUTES).toBe(15);
  });

  // Vercel Hobby refuses crons more frequent than daily (api/send-cron.js
  // carries the deploy error). A hold this short can only ever be expired
  // lazily, at read time and at write time - never by a background job.
  it('is far shorter than the daily cron could ever sweep', () => {
    expect(HOLD_MINUTES).toBeLessThan(24 * 60);
  });
});
