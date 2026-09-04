// api/_charge-cap.js - what a mechanic is allowed to charge a card on file.
//
// Audit finding 3 (2026-09-04): handleMechanicComplete's only check on
// `final_charge_amount` was `Number(final_charge_amount) > 0`, and it then did
// `stripe.paymentIntents.create({ amount: Math.round(that * 100) })` against a
// card the client saved. The number is computed in js/mechanic.js
// (calcChargeBreakdown) and posted from a phone, so it is whatever the request
// body says it is - no ceiling, no comparison against the service and parts.
//
// Chained with the other two findings that is the whole attack: a 4-digit PIN
// (10,000 combinations, locked out per IP but not per account) buys a mechanic
// token that lasts 60 days and that rotating the PIN does not kill, and that
// token could charge any amount to a saved card.
//
// WHY A CAP AND NOT A STRICT RECOMPUTATION
// ----------------------------------------
// Recomputing the exact figure server-side is the right end state, but it
// cannot be the first step here. A completion is parked in an offline outbox
// on the mechanic's phone and replayed when the signal comes back, sometimes
// the next morning (js/mechanic.js, api/_completion-guard.js). A strict
// equality check would reject a completion whose parts prices moved in the
// meantime - and the failure mode of that is a mechanic standing in the street
// unable to close a job they have already done. A ceiling cannot do that: it
// only ever refuses an amount no real job reaches, and it already cuts the
// damage of the chain above from unbounded to bounded.
//
// So: refuse the impossible, LOG every discrepancy, and let the logs - not a
// reading of the code - decide when the strict version is safe to turn on.
// Same reasoning as the AAL2 rollout: observe before blocking.

// Deliberately far above any real job. The catalogue tops out near $109 for a
// service (api/chat.js) and parts on a single visit do not approach four
// figures. Overridable without a deploy of new code, so a genuine outlier can
// be let through by changing an env var rather than waiting for a PR.
export const DEFAULT_MAX_CHARGE_AUD = 2000;
// A tip is not charged to the card (handleMechanicComplete only charges
// final_charge_amount) but it IS written to the booking and summed into the
// finance screens, so an absurd one corrupts the reports instead of the card.
export const DEFAULT_MAX_TIP_AUD = 500;

// Headroom over the recomputed figure. Parts prices can legitimately move
// between the moment the phone computed the total and the moment an outboxed
// completion is replayed, and a discount only ever lowers the charge, so real
// drift is small and one-directional. 20% + $50 absorbs it without leaving
// room for an invented amount.
const HEADROOM_RATIO = 1.2;
const HEADROOM_FLAT = 50;

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/**
 * @param {object} input
 * @param {*} input.finalChargeAmount  what the phone asked to charge (req.body)
 * @param {*} input.tipAmount          what the phone recorded as a tip
 * @param {*} input.servicePrice       bookings.service_price
 * @param {*} input.discountApplied    bookings.discount_applied
 * @param {number|null} input.partsSell  sum(qty * sell_price) from the DB, or
 *                                       null when it could not be looked up
 * @param {number} [input.maxCharge]
 * @param {number} [input.maxTip]
 *
 * Returns { ok, reason?, received, expected, allowed, discrepancy }.
 * `expected` and `discrepancy` are null when the parts lookup did not come
 * back - the absolute cap still applies, the per-booking one cannot.
 */
export function chargeCapVerdict({
  finalChargeAmount,
  tipAmount,
  servicePrice,
  discountApplied,
  partsSell,
  maxCharge = DEFAULT_MAX_CHARGE_AUD,
  maxTip = DEFAULT_MAX_TIP_AUD,
}) {
  const received = num(finalChargeAmount);
  const tip = num(tipAmount);

  const expected =
    partsSell === null || partsSell === undefined
      ? null
      : Math.max(0, (Number(servicePrice) || 0) - (Number(discountApplied) || 0)) +
        Number(partsSell);
  const allowed = expected === null ? maxCharge : Math.min(maxCharge, expected * HEADROOM_RATIO + HEADROOM_FLAT);
  const discrepancy = expected === null || received === null ? null : +(received - expected).toFixed(2);
  const base = { received, expected, allowed, discrepancy };

  // A tip that is not a number, or negative, or beyond anything a person
  // hands over. Checked before the charge so a nonsense tip cannot ride along
  // on an otherwise valid completion.
  if (tip !== null && (!Number.isFinite(tip) || tip < 0))
    return { ...base, ok: false, reason: 'invalid tip' };
  if (tip !== null && tip > maxTip) return { ...base, ok: false, reason: 'tip above cap' };

  // No amount at all is a real case: calcChargeBreakdown returns null when the
  // job is not in the list, and the phone posts final_charge_amount: null.
  // Nothing is charged, so there is nothing to cap.
  if (received === null) return { ...base, ok: true };

  if (!Number.isFinite(received) || received < 0)
    return { ...base, ok: false, reason: 'invalid amount' };
  if (received > maxCharge) return { ...base, ok: false, reason: 'above absolute cap' };
  if (expected !== null && received > allowed)
    return { ...base, ok: false, reason: 'above expected total' };

  return { ...base, ok: true };
}
