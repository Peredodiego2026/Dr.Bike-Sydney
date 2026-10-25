// Gift cards: issuing one, for the webhook (a purchase as it happens) and for
// Admin (a purchase whose card was never issued).
//
// Found 25-oct-2026: every gift card bought on the site was charged and never
// delivered. Two faults, either enough on its own:
//   1. the code's value went into discount_codes under an "..._amount" column
//      that does not exist (the real one is discount_value - checked against
//      production; tests/unit/discount-codes-schema.test.js now guards it). The insert failed, and the function returned before the
//      email "without a redeemable code, do not email".
//   2. the email went to /api/send-email without x-internal-token, and that
//      endpoint answers 403 to a call with no token and no browser origin.
// And because the failure was swallowed, the webhook told Stripe "received",
// so Stripe never retried.
//
// Now: idempotent per Stripe checkout session, so the webhook's retries and the
// admin's "issue" button can run any number of times and leave exactly one card.
// The gift_cards row is written FIRST and carries the session id: a retry finds
// it, reuses its code, and only completes what is missing.
import crypto from 'node:crypto';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://drbikesydney.com.au';

// A gift card code is money to whoever holds it: crypto.randomInt, not
// Math.random. No 0/O/1/I so it can be read off an email and typed.
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function genGiftCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += CHARS[crypto.randomInt(CHARS.length)];
  return `GIFT-${s}`;
}

async function uniqueCode(sb) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genGiftCode();
    const { data, error } = await sb
      .from('discount_codes')
      .select('code')
      .eq('code', code)
      .maybeSingle();
    if (error) throw new Error('discount_codes read failed: ' + error.message);
    if (!data) return code;
  }
  throw new Error('could not find a free gift card code after 5 tries');
}

// Returns { status: 'issued' | 'already' | 'invalid', code?, emailed? }.
// Throws when the card could not be made redeemable, so the webhook answers
// 500 and Stripe retries.
export async function issueGiftCard(sb, session) {
  const m = session.metadata || {};
  const amount = Number(m.amount) || 0;
  if (!amount || !m.recipientEmail) {
    // Data that will not change on a retry - say so and stop, do not loop.
    console.error('[gift-card] session has no amount or recipient:', session.id);
    return { status: 'invalid' };
  }

  const { data: prior, error: priorErr } = await sb
    .from('gift_cards')
    .select('code')
    .eq('stripe_session_id', session.id)
    .maybeSingle();
  if (priorErr) throw new Error('gift_cards read failed: ' + priorErr.message);

  let code = prior?.code || null;
  if (!code) {
    code = await uniqueCode(sb);
    const { error } = await sb.from('gift_cards').insert({
      code,
      amount,
      purchaser_email: m.purchaserEmail || session.customer_details?.email || null,
      recipient_email: m.recipientEmail,
      recipient_name: m.recipientName || null,
      sender_name: m.senderName || null,
      message: m.message || null,
      status: 'active',
      stripe_session_id: session.id,
    });
    if (error) throw new Error('gift_cards insert failed: ' + error.message);
  }

  const { data: redeemable, error: dcReadErr } = await sb
    .from('discount_codes')
    .select('code')
    .eq('code', code)
    .maybeSingle();
  if (dcReadErr) throw new Error('discount_codes read failed: ' + dcReadErr.message);
  // Both halves already there: this purchase was issued before.
  if (prior && redeemable) return { status: 'already', code };

  if (!redeemable) {
    const { error } = await sb.from('discount_codes').insert({
      code,
      discount_value: amount,
      discount_type: 'fixed',
      max_uses: 1,
      uses_count: 0,
      active: true,
    });
    if (error) throw new Error('discount_codes insert failed: ' + error.message);
  }

  const r = await fetch(`${SITE}/api/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-token': process.env.INTERNAL_API_SECRET || '',
    },
    body: JSON.stringify({
      type: 'gift_card',
      to: m.recipientEmail,
      name: m.recipientName || 'there',
      senderName: m.senderName || 'A friend',
      message: m.message || '',
      amount,
      code,
    }),
  }).catch((e) => ({ ok: false, status: e.message }));
  // The card exists and is redeemable either way; a failed email is reported,
  // not retried - a retry would find both halves and stop at 'already'.
  if (!r.ok) console.error('[gift-card] email failed for', code, r.status);
  else console.log(`[gift-card] issued ${code} ($${amount}) to ${m.recipientEmail}`);
  return { status: 'issued', code, emailed: !!r.ok };
}
