// The invoice, the review email and the review SMS that go out when a mechanic
// completes a job.
//
// These three used to be fired by js/mechanic.js - three fetch() calls from the
// mechanic's phone, after the job had already been marked completed on the
// server. A mechanic who lost signal in that window (a garage, a basement, a
// lift) left the job completed and the client with no invoice, and nobody found
// out: the calls were inside Promise.allSettled with a console.log catch.
//
// It is the same shape of failure as the 2026-08-05 incident (docs/PENDIENTES.md
// section 14): a chain of steps hanging off a browser staying alive.
//
// So the chain moved to api/auth.js, next to the write that completes the job.
//
// The arithmetic and the payload shapes are pure functions with no network in
// them, so the numbers on a client's invoice can be asserted in a unit test.
// The dispatch and the bookkeeping live here too, at the bottom, because two
// callers need the exact same behaviour: api/auth.js on completion, and
// api/send-cron.js?type=completion-retry when that first attempt failed.
//
// The figures deliberately reproduce calcChargeBreakdown() in js/mechanic.js
// line for line - this was a move, not a re-pricing. The one thing that does
// change is that the values are now read off the booking row instead of off the
// browser's mapped copy of it, which is how `date` and `time` start arriving at
// all: mechanic.js was reading `j.scheduled_date` / `j.scheduled_time` from an
// object whose fields are named `date` / `time`, so every invoice PDF so far was
// built with both undefined.

// Money coming back out of postgres-rest is a string as often as a number.
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function calcCompletionTotals({ booking, partsCharged, tipAmount }) {
  const calloutFee =
    booking?.callout_fee === null || booking?.callout_fee === undefined
      ? 20
      : num(booking.callout_fee);
  const bookingDiscount = num(booking?.discount_applied);
  const servicePrice = Math.max(0, num(booking?.service_price) - bookingDiscount);
  const items = Array.isArray(partsCharged?.items) ? partsCharged.items : [];
  const partsTotal = items
    .filter((p) => num(p?.qty) > 0)
    .reduce((s, p) => s + (num(p?.total) || num(p?.qty) * num(p?.unit_price)), 0);
  const mechDiscountAmount = num(partsCharged?.discount_amount);
  const tip = Math.max(0, num(tipAmount));
  // The tip is 100% the mechanic's and never enters a GST-taxable total.
  const chargeNow = Math.max(0, servicePrice + partsTotal - mechDiscountAmount);
  return {
    calloutFee,
    bookingDiscount,
    servicePrice,
    items,
    partsTotal,
    mechDiscountAmount,
    tip,
    chargeNow,
  };
}

export function nextServiceMessage(nextServiceDate) {
  if (!nextServiceDate) return 'We recommend a service check every 3–6 months.';
  const d = new Date(nextServiceDate);
  if (Number.isNaN(d.getTime())) return 'We recommend a service check every 3–6 months.';
  const when = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  return `Your next recommended service is on ${when}`;
}

// Returns [{ path, body }] - one entry per notification that has somewhere to
// go. A booking with no email on file yields no email calls rather than a call
// that will be rejected downstream; the caller logs that case.
export function buildCompletionCalls({
  booking,
  mechanicName,
  partsCharged,
  tipAmount,
  mechanicNotes,
  nextServiceDate,
}) {
  const id = String(booking?.id || '');
  if (!id) return [];
  const email = String(booking?.client_email || '').trim();
  const phone = String(booking?.client_phone || '').trim();
  const clientName = booking?.client_name || 'Client';
  const service = booking?.service_name || 'Service';
  const t = calcCompletionTotals({ booking, partsCharged, tipAmount });
  // The review link carries the booking's tracking_token as `t`.
  //
  // Without it, a guest client cannot leave a review at all - and a guest is
  // what a client of a business with no accounts yet IS. api/auth.js:1341 sets
  // both user_id and client_id to null for a guest booking, and
  // handleClientReview matched booking.client_id against the id on the
  // session: no session meant "Please sign in to leave a review", and signing
  // up afterwards meant 403, because null never equals a new account's uuid.
  // Every guest got the email, and every guest hit a wall.
  //
  // The token is the credential this project already trusts for exactly this
  // person: it is what /api/auth?role=public-track trades for their address
  // and arrival PIN. Posting a review with it is strictly less than that.
  // A booking with no token (an environment where
  // scripts/add-tracking-token.sql has not run) falls back to the old link,
  // which still works for a client who has an account.
  const reviewToken = String(booking?.tracking_token || '');
  const reviewLink = reviewToken
    ? `https://drbikesydney.com.au/?review=${id}&t=${reviewToken}`
    : `https://drbikesydney.com.au/?review=${id}`;
  const calls = [];

  if (email) {
    calls.push({
      path: '/api/send-invoice',
      body: {
        bookingId: id,
        to: email,
        clientName,
        service,
        date: booking?.scheduled_date || '',
        time: booking?.scheduled_time || '',
        address: booking?.address || booking?.suburb || '',
        price: t.servicePrice,
        discount: t.bookingDiscount,
        calloutFee: t.calloutFee,
        partsCharged: t.items,
        mechDiscountCode: partsCharged?.discount_code || null,
        mechDiscountAmount: t.mechDiscountAmount,
        finalChargeAmount: t.chargeNow,
        tipAmount: t.tip,
        mechNotes: mechanicNotes || null,
        mechName: mechanicName || '',
        nextService: nextServiceMessage(nextServiceDate),
        bookingRef: id.slice(0, 8).toUpperCase(),
      },
    });
    calls.push({
      path: '/api/send-email',
      body: {
        type: 'review_request',
        to: email,
        name: clientName,
        service,
        bookingId: id,
        reviewToken,
      },
    });
  }

  if (phone) {
    calls.push({
      path: '/api/send-sms',
      body: {
        to: phone,
        name: clientName,
        service,
        price: t.chargeNow,
        type: 'review_request',
        bookingId: id,
        reviewLink,
      },
    });
  }

  return calls;
}

// ── What still has to go out ─────────────────────────────────────────────────

export function callName(path) {
  return path.replace('/api/', '');
}

// Given what the booking already recorded, which of the calls still need
// sending. Anything already 'sent' is never resent - that is the whole point of
// storing the outcome per channel instead of a single "notified: yes/no" flag.
// A booking with no record at all (completed before the column existed) yields
// nothing: we cannot tell "nothing was sent" from "sent before we tracked it",
// and guessing would mail an old client a second invoice.
export function pendingCalls(calls, recorded) {
  if (!recorded || typeof recorded !== 'object') return [];
  return calls.filter((c) => recorded[callName(c.path)] && recorded[callName(c.path)] !== 'sent');
}

// Fires the calls and returns { sent, failed, outcome }. Never throws: a
// notification failing must not take down whatever asked for it.
export async function dispatchCompletionCalls(calls, { baseUrl, internalToken, bookingId } = {}) {
  const summary = { sent: [], failed: [], outcome: {} };
  const results = await Promise.allSettled(
    calls.map((c) =>
      fetch(`${baseUrl}${c.path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': internalToken || '',
        },
        body: JSON.stringify(c.body),
      })
    )
  );
  results.forEach((r, i) => {
    const name = callName(calls[i].path);
    if (r.status === 'fulfilled' && r.value.ok) {
      summary.sent.push(name);
      summary.outcome[name] = 'sent';
    } else {
      summary.failed.push(name);
      summary.outcome[name] = 'failed';
      const why =
        r.status === 'rejected' ? r.reason?.message || String(r.reason) : `HTTP ${r.value.status}`;
      // Loud on purpose. This going quiet is the whole reason the chain moved
      // off the mechanic's phone.
      console.error('[completion-notify] failed:', name, 'booking', bookingId, why);
    }
  });
  return summary;
}

// Best-effort: the column is behind scripts/add-completion-notifications.sql.
// If that migration has not been run, this quietly does nothing and the send
// above still happened - the retry net is what is missing, not the invoice.
export async function recordCompletionOutcome({ bookingId, outcome, supabaseUrl, sbHdr }) {
  if (!bookingId || !outcome || !Object.keys(outcome).length) return false;
  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/bookings?id=eq.${encodeURIComponent(bookingId)}`,
      {
        method: 'PATCH',
        headers: { ...sbHdr, Prefer: 'return=minimal' },
        body: JSON.stringify({ completion_notifications: outcome }),
      }
    );
    if (!r.ok) {
      console.warn(
        '[completion-notify] could not record outcome for',
        bookingId,
        '- has scripts/add-completion-notifications.sql been run?',
        r.status
      );
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[completion-notify] could not record outcome:', e.message);
    return false;
  }
}
