// api/_completion-guard.js — deciding whether a mechanic-complete request is a
// REPLAY of a completion that already happened.
//
// Why this exists: the mechanic app now keeps a completion in an offline outbox
// and resends it when the signal comes back (js/mechanic.js). Without a guard,
// the second delivery of the same completion re-runs everything in
// handleMechanicComplete: it charges the card again (Stripe's idempotency key
// only dedupes for 24h, and an outbox flushed the next morning is outside that
// window), decrements the parts stock a second time, and sends a SECOND invoice
// PDF plus a second review email/SMS to the client.
//
// The state we key on is the booking's own `status`, on purpose: it already
// exists in every environment. A dedicated idempotency column would be more
// precise but needs a SQL migration run by hand, and until that ran the guard
// would not exist at all - see docs/RUNBOOK-SQL.md for why that is a real risk
// here and not a hypothetical one.
//
// No network in this file: only the decision, so it can be asserted in a test.

/**
 * What to do with an incoming mechanic-complete request, given the booking row
 * as it is RIGHT NOW (read before anything is charged or written).
 *
 * Returns one of:
 *   { action: 'proceed' }                        - normal first completion
 *   { action: 'replay', status, body }           - already completed, do nothing
 *   { action: 'reject', status, body }           - job was cancelled meanwhile
 *
 * A missing row (null) proceeds: the read may simply have failed, and refusing
 * to complete a real job because we could not read it is worse than the
 * duplicate we are protecting against - the PATCH below it would fail anyway.
 */
export function completionVerdict(row) {
  if (!row) return { action: 'proceed' };

  if (row.status === 'completed') {
    return {
      action: 'replay',
      status: 200,
      body: {
        ok: true,
        already_completed: true,
        // Nothing ran this time, so nothing new to report. auto_charged
        // describes what is on the booking, not what this request did: the
        // phone uses it only to say "charged to card on file", and that is
        // still true of this job.
        auto_charged: row.final_charge_status === 'charged_card_on_file',
        low_stock: [],
        notified: { sent: [], failed: [], skipped: ['replay:already-completed'] },
      },
    };
  }

  if (row.status === 'cancelled') {
    // An outbox item can outlive the job: completed in a basement, cancelled by
    // Diego before the phone found signal. Charging a cancelled job hours later
    // is exactly the kind of quiet money movement this guard is for.
    return {
      action: 'reject',
      status: 409,
      body: {
        error: 'This job was cancelled - it cannot be completed. Tell Diego.',
        code: 'JOB_CANCELLED',
      },
    };
  }

  return { action: 'proceed' };
}
