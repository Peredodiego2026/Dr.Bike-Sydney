// api/_slot-hold.js — hold the slot BEFORE taking the money.
//
// WHY THIS EXISTS
//
// Diego, on being told the app charges before it writes the booking: "debe ser
// primero la reserva". He was right, and his reason was better than the one in
// the audit: the booking wizard asks for a date and time in step 2, so anyone
// looking at the screens assumes the slot is taken at that moment. It was not.
// Picking a date only set window.appState.date - in the browser's memory. The
// database learned nothing until the single write at the very end, AFTER the
// charge.
//
// WHAT THIS IS AND IS NOT WORTH
//
// A correction, recorded because the first version of this file got it wrong
// and the wrong version is the persuasive one.
//
// The race is real: two people open the same 10:00 slot, both see it free
// because nobody has reserved anything, both pay, and the second insert is
// rejected by the `bookings_unique_slot` index (van_number, scheduled_date,
// scheduled_time, WHERE status NOT IN ('cancelled')). No outage, no bug - just
// two customers at once.
//
// But the second customer is NOT left out of pocket. api/auth.js:1319 catches
// the 23505 and refunds the payment before returning 409, telling them the slot
// was just taken and their money is coming back. That path was already there
// and it works. Anyone reading this file to justify urgent surgery on the
// payment flow should read that handler first.
//
// So the value here is smaller and more ordinary than "stops losing money":
//
//   - the client's card is never touched for a slot they cannot have, instead
//     of a charge-and-refund that takes days to clear and generates a "what is
//     this charge?" message
//   - it removes the dependency on the refund itself succeeding; when Stripe
//     is the thing that is down, the refund is what fails, and then it IS an
//     orphan payment (which api/_orphan-audit.js then has to clean up)
//   - it matches what every visitor already assumes, because step 2 of the
//     wizard asks for a date and time
//
// Worth doing. Not worth rushing, which is why this landed as a foundation
// rather than a half-wired feature.
//
// WHAT A HOLD IS, AND WHY THERE IS NO MIGRATION
//
// A hold is not a new table or a new column. It is a booking row that already
// exists and has not been paid for:
//
//   hold          status 'pending' AND stripe_payment_intent_id IS NULL
//   paid          stripe_payment_intent_id set
//   expired hold  a hold whose created_at is older than HOLD_MINUTES
//
// All three columns already exist, verified against the live schema on
// 2026-08-31. That matters more than elegance here: this project runs its SQL
// by hand, so code reaches main before the migration does, and a design that
// needs a new column is a design that is broken in production for however long
// that gap lasts (CLAUDE.md, "los scripts/*.sql se corren a mano").
//
// EXPIRY IS LAZY, BECAUSE THERE IS NO CRON THAT COULD DO IT
//
// A 15-minute hold cannot be swept by a daily job. Vercel's Hobby plan refuses
// anything more frequent than daily - api/send-cron.js carries the deploy
// error that proved it. So expiry happens in the two places that care:
//
//   - reading availability: an expired hold is not busy, so the slot shows free
//   - taking a hold: expired holds on that slot are cancelled first, or the
//     unique index would reject the new one
//
// Nothing depends on a background job running on time.

// Long enough to type a card number without being rushed, short enough that an
// abandoned checkout does not cost a real booking. If a client needs longer,
// the slot going back on sale is the right outcome - they can pick it again.
export const HOLD_MINUTES = 15;

/**
 * Is this row a hold that has run out of time?
 *
 * Deliberately narrow. It must never be true for:
 *   - a paid booking (it has a payment intent)
 *   - a cancelled one (already out of the way)
 *   - a confirmed/enroute/in_progress job (long past payment)
 *   - a hold that is still within its window
 *
 * Getting this wrong in the permissive direction frees a slot somebody paid
 * for, so every branch below is a refusal rather than an allowance.
 */
export function isExpiredHold(booking, nowMs = Date.now()) {
  if (!booking || typeof booking !== 'object') return false;
  if (booking.status !== 'pending') return false;
  // Any trace of money means this is not a hold. Checked loosely on purpose:
  // an empty string is as much "no payment" as null is.
  if (booking.stripe_payment_intent_id) return false;

  // No created_at means no provable age. A booking whose age cannot be
  // established is left alone - freeing a slot on a guess is the one mistake
  // that costs a real customer their appointment.
  const created = Date.parse(booking.created_at || '');
  if (!Number.isFinite(created)) return false;

  return nowMs - created >= HOLD_MINUTES * 60 * 1000;
}

/**
 * The rows that actually occupy the calendar.
 *
 * handleGetAvailability asks for every booking on a date whose status is one
 * of pending/confirmed/enroute/in_progress/arrived, and treats all of them as
 * busy. With holds in the table that is no longer true: an abandoned checkout
 * from an hour ago is a `pending` row, and counting it would quietly retire a
 * sellable slot every time somebody changed their mind.
 */
export function occupiedBookings(bookings, nowMs = Date.now()) {
  return (bookings || []).filter((b) => !isExpiredHold(b, nowMs));
}

/**
 * Should this hold be handed back to the person who is asking for it?
 *
 * A client who reloads the payment screen, or comes back through the wizard to
 * the same slot, must not be told the slot is taken by their own hold - and
 * must not end up with two rows either. Matching is on identity AND slot: a
 * hold for a different time is a different hold, and taking it over would move
 * somebody's appointment.
 */
export function isOwnHold(booking, { clientId = null, email = null, date, time }) {
  if (!booking || booking.status !== 'pending') return false;
  if (booking.stripe_payment_intent_id) return false;
  if (booking.scheduled_date !== date || booking.scheduled_time !== time) return false;
  if (clientId && booking.client_id === clientId) return true;
  // Guests have no client_id at all, so email is the only thread back to them.
  if (email && booking.client_email && booking.client_email.toLowerCase() === email.toLowerCase())
    return true;
  return false;
}

/**
 * What the payment step should do about a slot, given what is already there.
 *
 *   'free'   nothing holds it - take it
 *   'mine'   the caller already holds it - reuse the row, do not insert
 *   'taken'  somebody else holds or owns it - send them back to pick again
 *
 * Returned as a decision rather than performed here so it can be tested
 * without a database, which is the half that carries the reasoning.
 */
export function slotVerdict(existing, who, nowMs = Date.now()) {
  const live = occupiedBookings(existing, nowMs);
  const mine = live.find((b) => isOwnHold(b, who));
  if (mine) return { verdict: 'mine', bookingId: mine.id };
  const clash = live.find((b) => b.scheduled_date === who.date && b.scheduled_time === who.time);
  if (clash) return { verdict: 'taken', bookingId: null };
  return { verdict: 'free', bookingId: null };
}

/** The ids of expired holds that must be cancelled before inserting a new one. */
export function expiredHoldIds(bookings, nowMs = Date.now()) {
  return (bookings || []).filter((b) => isExpiredHold(b, nowMs)).map((b) => b.id);
}
