// tests/unit/hold-before-charge.test.js
//
// The wiring half of api/_slot-hold.js. That file holds the decisions; this one
// pins the ORDER, which is the whole point and the thing a later refactor can
// silently invert.
//
// Diego: "debe ser primero la reserva... el sentido comun de la pagina web es
// bloquear primero la fecha y la hora, y despues ocurre el pago."
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const app = read('js/app.js');
const auth = read('api/auth.js');
const i18n = read('js/i18n.js');

describe('the client takes the slot before it takes the money', () => {
  // Two buttons can start a payment: the Apple/Google Pay sheet and the card
  // form. Both must hold first, or one of them silently keeps the old order.
  it('both payment paths hold first', () => {
    const holds = app.match(/await holdSlot\(\);/g) || [];
    expect(holds).toHaveLength(2);
  });

  it('the hold comes before the charge in each of them', () => {
    // Every place chargeOnce is awaited must have a holdSlot immediately above.
    const charges = [...app.matchAll(/await chargeOnce\(/g)].map((m) => m.index);
    expect(charges.length).toBeGreaterThanOrEqual(2);
    for (const at of charges) {
      const before = app.slice(Math.max(0, at - 400), at);
      expect(before, `chargeOnce at ${at} is not preceded by a hold`).toContain('await holdSlot()');
    }
  });

  it('the booking call carries the held row, so the server updates it', () => {
    expect(app).toContain('hold_booking_id: _heldBookingId');
  });
});

describe('one hold, not many', () => {
  // renderPayment() runs again on every navigation to #payment, so a local
  // would be lost and the client would ask for a second hold on a slot they
  // already hold. Same reason _paidIntent lives at module scope.
  it('the held row is remembered at module scope', () => {
    expect(app).toMatch(/^let _heldBookingId = null;$/m);
  });

  it('holdSlot returns the existing hold instead of asking again', () => {
    const fn = app.slice(app.indexOf('async function holdSlot()'));
    expect(fn.slice(0, 200)).toContain('if (_heldBookingId) return _heldBookingId;');
  });

  // The failure this prevents: a client goes back, changes the time, comes
  // forward and pays - while hold_booking_id still points at the row holding
  // the OLD slot. The server would update that row and move their appointment
  // to a time they did not pick.
  it('changing the booking forgets the old hold', () => {
    const block = app.slice(
      app.indexOf('if (_paidBookingKey !== paymentKey)'),
      app.indexOf('_paidBookingKey = paymentKey;')
    );
    expect(block).toContain('_heldBookingId = null');
  });

  it('a completed booking releases the hold', () => {
    // Once the row IS the booking it must not be reused for the next one.
    const after = app.slice(app.indexOf('hold_booking_id: _heldBookingId'));
    expect(after).toContain('_heldBookingId = null;');
  });
});

describe('the server side of the hold', () => {
  it('hold-slot reuses create-booking rather than duplicating its checks', () => {
    // Coverage, the zone fee, the blocked slot and membership pricing all live
    // in handleCreateBooking. A second handler would drift out of step with it.
    const route = auth.slice(auth.indexOf("if (role === 'hold-slot')"));
    expect(route.slice(0, 300)).toContain('handleCreateBooking(req, res)');
  });

  // If the flag were read from the body, `create-booking` could be talked into
  // skipping payment verification just by passing it.
  it('sets hold_only itself instead of trusting the request', () => {
    const route = auth.slice(auth.indexOf("if (role === 'hold-slot')"));
    expect(route.slice(0, 300)).toMatch(/req\.body = \{ \.\.\.req\.body, hold_only: true/);
  });

  // The one invariant this change must not weaken.
  it('a hold that carries a payment is refused, not silently unverified', () => {
    expect(auth).toMatch(/if \(holdOnly && hasPaymentRef\)/);
    expect(auth).toContain('A hold cannot carry a payment');
  });

  it('a payment that exists is still always verified', () => {
    expect(auth).toMatch(/if \([^)]*!isAdmin && \(calloutFee > 0 \|\| hasPaymentRef\)\)/);
  });
});

describe('the second call updates the hold, it does not insert beside it', () => {
  it('updates when a hold id is given', () => {
    const block = auth.slice(auth.indexOf('if (hold_booking_id) {'));
    expect(block.slice(0, 600)).toContain('.update(row)');
    expect(block.slice(0, 600)).toContain(".eq('id', hold_booking_id)");
  });

  // Scoped so it can only ever touch a row that is STILL an unpaid hold. If it
  // expired and was swept, or somebody else paid for it, this matches nothing
  // rather than overwriting a real booking.
  it('only ever updates a row that is still an unpaid hold', () => {
    const block = auth.slice(auth.indexOf('if (hold_booking_id) {'));
    expect(block.slice(0, 600)).toContain(".is('stripe_payment_intent_id', null)");
    expect(block.slice(0, 600)).toContain(".eq('status', 'pending')");
  });

  // Money was taken for a slot that cannot be honoured - the same duty as the
  // 23505 path.
  it('refunds when the hold is gone by the time payment lands', () => {
    const block = auth.slice(auth.indexOf('if (hold_booking_id) {'));
    expect(block.slice(0, 1600)).toContain('expired-hold refund failed');
    expect(block.slice(0, 1600)).toContain('no longer held for you');
  });
});

describe('abandoned holds do not retire a sellable hour', () => {
  // `bookings_unique_slot` covers every status except cancelled, so an expired
  // hold still blocks the index even after availability stops showing it busy.
  it('expired holds on the slot are cancelled before writing', () => {
    expect(auth).toContain('expiredHoldIds(sameSlot || [])');
    expect(auth).toMatch(/status: 'cancelled', cancellation_reason: 'hold expired'/);
  });

  it('the sweep never touches the row the caller is about to claim', () => {
    expect(auth).toContain('filter((id) => id !== hold_booking_id)');
  });

  it('availability stops counting them as busy', () => {
    expect(auth).toContain('occupiedBookings(bookings || [])');
  });

  // The three columns the decision needs. All already exist - this change ships
  // no migration, which matters because SQL here is run by hand and the code
  // reaches main first.
  it('reads the columns the decision needs', () => {
    expect(auth).toContain(
      "'id,scheduled_time,van_number,service_name,status,created_at,stripe_payment_intent_id'"
    );
  });
});

describe('the client is told, in their own language', () => {
  const msg = 'That time is no longer available. Please pick another time.';

  for (const lang of ['es', 'zh']) {
    it(`${lang} has the slot-taken message`, () => {
      const start = i18n.indexOf(`  ${lang}: {`);
      const others = ['en', 'es', 'zh']
        .filter((l) => l !== lang)
        .map((l) => i18n.indexOf(`  ${l}: {`, start + 1))
        .filter((i) => i > start);
      const block = i18n.slice(start, others.length ? Math.min(...others) : undefined);
      expect(block).toContain(`'${msg}'`);
    });
  }

  it('and the message goes through the translator, not raw', () => {
    const fn = app.slice(app.indexOf('async function holdSlot()'));
    expect(fn.slice(0, 2500)).toContain('translateValue(');
  });
});

// ---------------------------------------------------------------------------
// Three bugs this change introduced, all found by reviewing it rather than by
// running it. None would have failed a test that existed at the time, and two
// of them cost the client money.
// ---------------------------------------------------------------------------
describe('the bugs review caught', () => {
  // 1. A `const` read before its declaration throws at runtime, and
  //    `node --check` does not catch it - it only validates syntax. holdOnly was
  //    declared beside the payment gate and read ~130 lines earlier by the
  //    coverage check, which would have thrown on every booking.
  it('holdOnly is declared before anything reads it', () => {
    const fn = auth.slice(
      auth.indexOf('async function handleCreateBooking'),
      auth.indexOf('async function handleCreateBooking') + 12000
    );
    const decl = fn.indexOf('const holdOnly =');
    expect(decl).toBeGreaterThan(-1);
    const uses = [...fn.matchAll(/holdOnly/g)].map((m) => m.index).filter((i) => i !== decl + 6);
    expect(uses.filter((u) => u < decl)).toEqual([]);
  });

  // 2. A hold carries no payment - that is its definition. Without exempting it,
  //    every address the geocoder could not resolve would be turned away at the
  //    hold, losing bookings Diego can still serve by hand. The real booking
  //    runs the same check again, and by then a payment IS present.
  it('an unresolvable address is not rejected at the hold', () => {
    expect(auth).toContain('if (!hasPaymentRef && !isAdmin && !holdOnly) {');
  });

  // 3. The worst of the three. Both of these sit AFTER the insert, so a hold
  //    reached them: a single-use discount code would be burned, and the
  //    client's referral credits spent, for a booking nobody had paid for. If
  //    they then abandoned the checkout, both were gone with nothing to show.
  it('a hold never burns a discount code', () => {
    expect(auth).toContain('if (discount_code && !holdOnly) {');
  });

  it('a hold never spends referral credits', () => {
    expect(auth).toContain('if (user && !holdOnly) {');
  });

  // Belt and braces: the client does not send it either, so removing the guard
  // above is not enough on its own to reintroduce the bug.
  it('and the client does not even send the code when holding', () => {
    const fn = app.slice(app.indexOf('async function holdSlot()'));
    const body = fn.slice(0, fn.indexOf('});'));
    expect(body).not.toMatch(/discount_code:\s*window\.appState/);
  });
});
