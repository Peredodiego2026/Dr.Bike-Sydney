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
// It reads. It never refunds and never writes to Stripe: giving money back is
// Diego's call, made in Stripe's own dashboard, one payment at a time.

const DEFAULT_GRACE_MINUTES = 15; // a booking mid-flight is not an orphan

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
  if (pi.invoice) return false; // subscription invoices, not call-out fees
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
