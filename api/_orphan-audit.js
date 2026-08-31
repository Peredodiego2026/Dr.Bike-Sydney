// Payments Stripe took that no booking ever claimed.
//
// The $20 call-out is charged BEFORE the booking row is written. If the write
// then fails and the client closes the app instead of pressing Pay again,
// Stripe has the money and there is no booking, no confirmation email and no
// WhatsApp. Diego never finds out; the client does.
//
// The daily cron (api/send-cron.js?type=orphan-payments) catches this going
// forward, but it only looks 48 hours back. Between 2026-07-04 and 2026-08-05
// the front end let people without an account reach the card form while the
// server refused to write their booking - one month in which EVERY guest
// payment was an orphan (PENDIENTES section 14). Nobody knows how many. This
// module is what answers that, over any date range, without sending anything.
//
// auditOrphanPayments reads. It never refunds and never writes to Stripe: the
// admin panel's audit is a report, and a report that moves money is a trap.
//
// 2026-08-30: that used to read "It reads. It never refunds and never writes
// to Stripe: giving money back is Diego's call, made in Stripe's own
// dashboard, one payment at a time." - full stop, for the whole module. It is
// no longer the whole story, and the missing half was keeping real clients'
// money. Diego's rule is that a charge with no booking behind it must not
// survive on its own: "si el cobro ya salio, se reembolsa solo, sin que nadie
// tenga que mirar." Asking a human to look is exactly what the daily WhatsApp
// did - and it asked once. isOrphanCandidate skips anything already carrying
// `orphan_alerted`, so a payment Diego never got around to acting on dropped
// out of the cron permanently and was never seen again.
//
// The split is now explicit: the AUDIT below is still read-only, and the daily
// CRON (api/send-cron.js?type=orphan-payments) is what refunds. orphanAction
// is the decision it uses, kept here beside isOrphanCandidate because the two
// have to agree on what an orphan is, and pure so it can be tested without a
// Stripe account.

const DEFAULT_GRACE_MINUTES = 15; // a booking mid-flight is not an orphan

// How long a charge with no booking behind it may exist before the money goes
// back on its own. Long enough that Diego, alerted within the hour, can still
// turn it into a real booking by hand; short enough that nobody waits out a
// weekend for their own money. A business decision, so it is asserted in
// tests/unit/orphan-refund.test.js rather than left to drift.
//
// This is a floor, not a promise. The sweep is part of ?type=all, which
// vercel.json runs once a day at 09:00 UTC (Hobby accounts cannot schedule
// anything more frequent - see the note at the top of api/send-cron.js). A
// payment that crosses the deadline one minute after a run waits for the next
// one, so the real worst case is close to 48h. Shortening the constant does
// not change that; only running the sweep more often would.
export const ORPHAN_REFUND_AFTER_HOURS = 24;

// The backstop for when the alert itself is what is broken. If no admin
// WhatsApp is configured, or Twilio is down for days, `orphan_alerted` never
// gets set - and a rule of "never refund before telling him" would then keep a
// client's money forever, which is the exact failure this whole thing exists to
// end. After three days the money goes back whether the message landed or not.
export const ORPHAN_HARD_REFUND_AFTER_HOURS = 72;

// What to do with a payment already established to have no booking behind it.
// Call this only on confirmed orphans - it does not re-check that.
//
//   'done'   a previous run already refunded it; leave it alone
//   'refund' past the deadline; give the money back
//   'alert'  new; tell Diego, who can still turn it into a booking
//   'wait'   alerted and still inside the deadline; the next run decides
export function orphanAction(
  pi,
  {
    nowSeconds,
    refundAfterHours = ORPHAN_REFUND_AFTER_HOURS,
    hardRefundAfterHours = ORPHAN_HARD_REFUND_AFTER_HOURS,
  } = {}
) {
  const md = pi?.metadata || {};
  if (md.orphan_refunded) return 'done';

  // No `created` means no provable age, and this runs unattended. Refunding on
  // a guess would give away money that may well have a booking behind it, so
  // an unaged payment can only ever be alerted about.
  const created = Number(pi?.created);
  const ageHours = Number.isFinite(created) ? (nowSeconds - created) / 3600 : null;

  // NOTHING is refunded before Diego has been told. He asked for exactly this:
  // "cuando pase esto me tiene que llegar un mensaje que se genero un pago sin
  // reserva."
  //
  // The first version failed him on the ordinary case. The sweep runs ONCE A
  // DAY, so a payment made shortly after a run is already older than the 24h
  // deadline the first time the sweep sees it - and the old code went straight
  // to 'refund'. He would have received the refund notice and never the alert,
  // losing the chance to turn a real job into a real booking before the money
  // went back.
  if (!md.orphan_alerted) {
    if (ageHours !== null && ageHours >= hardRefundAfterHours) return 'refund';
    return 'alert';
  }

  if (ageHours !== null && ageHours >= refundAfterHours) return 'refund';
  return 'wait';
}

// Exported so the filtering can be tested without a Stripe account. Every
// false here is a payment we must NOT report; every true is a payment that
// still has to be checked against the bookings table.
export function isOrphanCandidate(
  pi,
  { nowSeconds, graceMinutes = DEFAULT_GRACE_MINUTES, ignoreAlerted = false } = {}
) {
  if (!pi || pi.status !== 'succeeded') return false;
  if (!(pi.amount_received > 0)) return false;
  // Inside the grace window the booking may simply still be being written.
  if (pi.created > nowSeconds - graceMinutes * 60) return false;
  // Refunded already, e.g. handleCreateBooking's out-of-zone path: money taken
  // and given back is not money kept without a booking. `charges` was dropped
  // from the PaymentIntent object in newer Stripe API versions, so read
  // latest_charge and fall back rather than trusting either one to exist.
  const charge = pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  if (charge && (charge.refunded || charge.amount_refunded > 0)) return false;
  if (pi.charges?.data?.some((c) => c.refunded || c.amount_refunded > 0)) return false;
  if (pi.invoice) return false; // subscription invoices, not visit & diagnosis fees
  if (pi.metadata?.giftCard === 'true') return false;
  // The daily cron skips anything Diego was already told about, so it does not
  // wake him twice. An audit must do the opposite: a payment alerted about in
  // July and never resolved is exactly what we are looking for. It comes back
  // flagged, not hidden.
  if (!ignoreAlerted && pi.metadata?.orphan_alerted) return false;
  return true;
}

export function orphanRow(pi) {
  return {
    id: pi.id,
    amount: (pi.amount_received || 0) / 100,
    currency: (pi.currency || 'aud').toUpperCase(),
    email: pi.metadata?.email || pi.receipt_email || null,
    name: pi.metadata?.clientName || pi.metadata?.name || null,
    created: new Date(pi.created * 1000).toISOString(),
    alertedBefore: !!pi.metadata?.orphan_alerted,
    stripeUrl: `https://dashboard.stripe.com/payments/${pi.id}`,
  };
}

// Walks every succeeded PaymentIntent in [fromSeconds, toSeconds] and returns
// the ones with no booking behind them. Read-only from end to end.
//
// maxPages is a real limit, not a formality: a month of payments is more than
// one page, and a silent truncation here would under-report money owed to
// people. When it bites, the result says so instead of looking complete.
export async function auditOrphanPayments({
  stripe,
  sb,
  fromSeconds,
  toSeconds,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxPages = 20,
  pageSize = 100,
}) {
  const candidates = [];
  let checked = 0;
  let startingAfter;
  let pages = 0;
  let truncated = false;

  for (;;) {
    const page = await stripe.paymentIntents.list({
      created: { gte: fromSeconds, lte: toSeconds },
      limit: pageSize,
      expand: ['data.latest_charge'], // so a refund is visible without a second call
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const rows = page.data || [];
    checked += rows.length;
    for (const pi of rows) {
      if (isOrphanCandidate(pi, { nowSeconds, ignoreAlerted: true })) candidates.push(pi);
    }
    pages++;
    if (!page.has_more || !rows.length) break;
    if (pages >= maxPages) {
      truncated = true;
      break;
    }
    startingAfter = rows[rows.length - 1].id;
  }

  if (!candidates.length) return { checked, truncated, orphans: [], total: 0 };

  // One query for all of them rather than one per payment. Chunked because a
  // month's worth of ids in a single `in.()` is a URL long enough to be
  // rejected, and a rejected lookup would report every payment as an orphan.
  const booked = new Set();
  const ids = candidates.map((pi) => pi.id);
  for (let i = 0; i < ids.length; i += 50) {
    const { data, error } = await sb
      .from('bookings')
      .select('stripe_payment_intent_id')
      .in('stripe_payment_intent_id', ids.slice(i, i + 50));
    if (error) throw new Error(`booking lookup failed: ${error.message}`);
    (data || []).forEach((b) => booked.add(b.stripe_payment_intent_id));
  }

  const orphans = candidates.filter((pi) => !booked.has(pi.id)).map(orphanRow);
  const total = orphans.reduce((s, o) => s + o.amount, 0);
  return { checked, truncated, orphans, total: Math.round(total * 100) / 100 };
}
