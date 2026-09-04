// PRODUCTION ENV VARS (Vercel):
//   STRIPE_SECRET_KEY        → sk_live_...
//   STRIPE_WEBHOOK_SECRET    → whsec_...  (from Stripe Dashboard → Webhooks)
//   SUPABASE_SERVICE_KEY     → service_role key (not anon key)
//   SUPABASE_URL             → https://tgpipbloisahufaywhqb.supabase.co
//
// Webhook URL to register: https://drbikesydney.com.au/api/stripe-webhook
// Events to enable: payment_intent.succeeded, checkout.session.completed,
//   customer.subscription.created, customer.subscription.updated,
//   customer.subscription.deleted, customer.subscription.trial_will_end,
//   customer.subscription.paused, customer.subscription.resumed, invoice.paid,
//   invoice.payment_failed, invoice.payment_action_required
//
// payment_intent.succeeded is the one that makes a booking survive its own
// browser. Diego registered it on 2026-08-03; it did nothing until now.
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { guard, sanitize, sanitizeObj, rateLimit } from './_security.js';
import { matchCalloutZone, applySurcharge, applyMembershipPricing } from './auth.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sb = createClient(
  process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

export const config = { api: { bodyParser: false } };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPlanFromMetadata(obj) {
  const plan =
    obj.metadata?.plan || obj.items?.data?.[0]?.price?.nickname?.toLowerCase() || 'basic';
  return ['basic', 'standard', 'vip'].includes(plan) ? plan : 'basic';
}

function mapStripeStatus(stripeStatus) {
  const map = {
    active: 'active',
    past_due: 'past_due',
    canceled: 'cancelled',
    cancelled: 'cancelled',
    unpaid: 'past_due',
    trialing: 'active',
    incomplete: 'pending',
    incomplete_expired: 'cancelled',
  };
  return map[stripeStatus] || stripeStatus;
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function genGiftCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `GIFT-${s}`;
}

async function handleGiftCardPurchase(session) {
  const m = session.metadata || {};
  const amount = Number(m.amount) || 0;
  if (!amount || !m.recipientEmail) {
    console.error('[gift-card] missing amount or recipient', session.id);
    return;
  }

  // Generate a unique code (retry on rare collision)
  let code = genGiftCode();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: existing } = await sb
      .from('discount_codes')
      .select('code')
      .eq('code', code)
      .maybeSingle();
    if (!existing) break;
    code = genGiftCode();
  }

  // 1. Insert redeemable code into discount_codes (reuses existing redemption flow)
  const { error: dcErr } = await sb.from('discount_codes').insert({
    code,
    discount_amount: amount,
    discount_type: 'fixed',
    max_uses: 1,
    uses_count: 0,
    active: true,
  });
  if (dcErr) {
    console.error('[gift-card] discount_codes insert failed:', dcErr.message);
    return; // without a redeemable code, do not email
  }

  // 2. Record in gift_cards ledger (best-effort; table may not exist yet)
  await sb
    .from('gift_cards')
    .insert({
      code,
      amount,
      purchaser_email: m.purchaserEmail || session.customer_details?.email || null,
      recipient_email: m.recipientEmail,
      recipient_name: m.recipientName || null,
      sender_name: m.senderName || null,
      message: m.message || null,
      status: 'active',
      stripe_session_id: session.id,
    })
    .then(({ error }) => {
      if (error) console.warn('[gift-card] ledger insert skipped:', error.message);
    });

  // 3. Email the gift card to the recipient
  try {
    await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL || 'https://drbikesydney.com.au'}/api/send-email`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'gift_card',
          to: m.recipientEmail,
          name: m.recipientName || 'there',
          senderName: m.senderName || 'A friend',
          message: m.message || '',
          amount,
          code,
        }),
      }
    );
    console.log(`[gift-card] issued ${code} ($${amount}) to ${m.recipientEmail}`);
  } catch (err) {
    console.error('[gift-card] email failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// A paid call-out that has no booking behind it
// ---------------------------------------------------------------------------
// Until now the whole chain hung off the customer's browser reaching the end:
// pay, create the booking, fire the notifications, all from their phone. Close
// the app and nothing happened and nobody found out. On 2026-08-05 that cost a
// real customer her booking and Diego his first sale (docs/PENDIENTES.md 14).
//
// Stripe telling us the money arrived is a fact that does not depend on anyone
// holding a phone. So the booking gets built from here instead.
//
// The browser still does it first, because a client staring at a spinner wants
// an answer now. This is what happens when the browser does not come back.
// bookings_unique_payment_intent decides who wins if both try at once.

const ADMIN_PHONE = '0433963250';
const SELF = 'https://drbikesydney.com.au';

// The price is looked up here, never read from the payment. Metadata is set by
// the browser, and anything a browser sends can be edited by whoever holds it.
// Every lookup below THROWS on a database error rather than returning null.
// The outer handler answers 500 to a throw, and Stripe retries a 500 - so a
// database that blinked gets another go. Swallowing it would mark the event
// processed forever and write a booking with a $0 service price.
async function priceForService({ id, name }) {
  let q = sb.from('services').select('name,price').limit(1);
  q = id ? q.eq('id', id) : q.ilike('name', name || '');
  const { data, error } = await q;
  if (error) throw new Error(`services lookup failed: ${error.message}`);
  return data?.[0] || null;
}

// Same rule the booking flow uses: an address outside every configured zone is
// not serviceable. Kept deliberately simple and identical in spirit to
// matchVanZone() in api/auth.js.
async function vanForAddress(address) {
  const { data, error } = await sb
    .from('van_zones')
    .select('van_number,suburb')
    .neq('van_number', 0);
  if (error) throw new Error(`van_zones lookup failed: ${error.message}`);
  const addr = String(address || '').toLowerCase();
  const hit = (data || []).find((z) => z.suburb && addr.includes(String(z.suburb).toLowerCase()));
  return hit && Number(hit.van_number) ? Number(hit.van_number) : null;
}

// A guest booking has no user_id. But if this email already belongs to an
// account, the booking belongs in that account - otherwise a signed-in client
// whose browser died would find their own booking missing from their history.
async function accountForEmail(email) {
  if (!email) return null;
  const { data, error } = await sb.from('profiles').select('id').ilike('email', email).limit(1);
  if (error) throw new Error(`profiles lookup failed: ${error.message}`);
  return data?.[0]?.id || null;
}

// Best effort, and loudly. A booking that exists but whose notifications failed
// is recoverable; silence is what made the 05-aug incident invisible for two
// days.
async function notifyNewBooking(booking, lang) {
  const post = (path, body) =>
    fetch(`${SELF}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(
      (r) => {
        if (!r.ok) console.error(`[webhook-notify] ${path} -> HTTP ${r.status}`);
        return r.ok;
      },
      (e) => {
        console.error(`[webhook-notify] ${path} threw:`, e.message);
        return false;
      }
    );

  const total = Number(booking.service_price || 0) + Number(booking.callout_fee || 0);
  const common = {
    service: booking.service_name,
    date: booking.scheduled_date,
    time: booking.scheduled_time,
    address: booking.address,
    price: total,
  };

  const results = await Promise.allSettled([
    post('/api/send-message?channel=whatsapp', {
      to: ADMIN_PHONE,
      template: 'new_booking',
      data: { ...common, clientName: booking.client_name, trackUrl: `${SELF}/index.html#tracking` },
    }),
    post('/api/send-message', {
      to: ADMIN_PHONE,
      name: booking.client_name,
      ...common,
      type: 'new_booking',
      bookingId: booking.id,
    }),
    booking.client_email
      ? post('/api/send-email', {
          to: booking.client_email,
          name: booking.client_name,
          ...common,
          bookingId: booking.id,
          type: 'confirmation',
          lang: lang || 'en',
        })
      : Promise.resolve(false),
  ]);
  return results.map((r) => (r.status === 'fulfilled' ? r.value : false));
}

// Should this payment become a booking at all? Exported and pure so the
// decision can be tested without a database.
//
// Both mistakes are expensive. Refusing a real call-out recreates the bug this
// exists to fix. Accepting a subscription renewal or a gift card would invent a
// booking nobody asked for and send a mechanic to an address that came from
// nowhere.
export function shouldCreateBookingFor(pi) {
  if (!pi || typeof pi !== 'object') return { ok: false, reason: 'not a payment' };
  if (pi.invoice) return { ok: false, reason: 'subscription invoice' };
  if (pi.metadata?.giftCard === 'true') return { ok: false, reason: 'gift card' };
  const md = pi.metadata || {};
  if (!md.bk_service_name && !md.bk_service_id)
    return { ok: false, reason: 'no booking metadata' };
  // Metadata without a slot cannot become a row: scheduled_date and
  // scheduled_time are what the mechanic's day is built from.
  if (!md.bk_date || !md.bk_time) return { ok: false, reason: 'incomplete metadata' };
  if (!(pi.amount_received > 0)) return { ok: false, reason: 'nothing was captured' };
  return { ok: true };
}

// Exported for tests: this is where a tampered payment turns into a real row,
// so it is asserted by running it, not by reading its source.
export async function handlePaymentIntentSucceeded(pi) {
  const verdict = shouldCreateBookingFor(pi);
  if (!verdict.ok) return { skipped: verdict.reason };
  const md = pi.metadata;

  // Did the browser already do it? Cheap check first; the unique index is the
  // one that actually decides, below.
  const { data: existing, error: findErr } = await sb
    .from('bookings')
    .select('id')
    .eq('stripe_payment_intent_id', pi.id)
    .limit(1);
  if (findErr) throw new Error(`bookings lookup failed: ${findErr.message}`);
  if (existing?.length) return { alreadyBooked: existing[0].id };

  const svc = await priceForService({ id: md.bk_service_id, name: md.bk_service_name });

  // priceForService() returns null when nothing in `services` matches - it does
  // not throw, so until now the row below silently fell back to `svc?.name ||
  // md.bk_service_name`, i.e. a 120-char string straight from whoever's browser
  // held the page, stored forever and rendered in the mechanic's app. That was
  // the stored-XSS entry point, and it also wrote service_price: 0.
  //
  // There is no legitimate booking without a service, so this is refused the
  // same way an amount mismatch is: refund, do not book. A service genuinely
  // deleted from the table between the PaymentIntent and this webhook lands
  // here too - the client gets their money back rather than a $0 job.
  if (!svc) {
    console.error(
      `[webhook] unknown service for ${pi.id}: id=${md.bk_service_id || '-'} name=${JSON.stringify(md.bk_service_name || '')} - refunding instead of creating a booking`
    );
    try {
      await stripe.refunds.create({ payment_intent: pi.id });
    } catch (e) {
      console.error(`[webhook] refund failed for ${pi.id}:`, e.message);
    }
    return { rejected: 'unknown service', service: md.bk_service_name || null };
  }
  const vanNumber = await vanForAddress(md.bk_address);
  const email = md.email || pi.receipt_email || null;
  const accountId = await accountForEmail(email);

  // The amount Stripe actually captured is not trusted as the price - it
  // started life as `priceCents` in a request body from whoever's browser
  // was holding the page (create-payment-session.js), which can be edited.
  // Recompute the same way handleCreateBooking does (zone fee + surcharge +
  // membership discount, matched by email since there is no session token
  // here) and refuse to book - refunding instead - on any mismatch. Without
  // this, this fallback path was the one place in the app that turned a
  // tampered Stripe charge straight into a real booking with a mechanic
  // dispatched, no verification at all.
  let calloutFee = 20;
  try {
    const match = await matchCalloutZone(sb, md.bk_address);
    if (match) calloutFee = match.calloutFee;
  } catch (e) {
    console.error('[webhook] matchCalloutZone failed, falling back to $20:', e.message);
  }
  calloutFee = applySurcharge(calloutFee, md.bk_date);

  if (accountId && md.bk_guest !== '1') {
    const servicePrice = applySurcharge(Number(svc?.price) || 0, md.bk_date);
    const priced = await applyMembershipPricing(
      sb,
      accountId,
      md.bk_date,
      servicePrice,
      calloutFee,
      svc?.name || md.bk_service_name,
      svc?.price
    );
    calloutFee = priced.calloutFee;
  }

  const amountReceived = pi.amount_received / 100;
  if (Math.round(amountReceived * 100) !== Math.round(calloutFee * 100)) {
    console.error(
      `[webhook] amount mismatch for ${pi.id}: charged $${amountReceived}, authoritative price $${calloutFee} - refunding instead of creating a booking`
    );
    try {
      await stripe.refunds.create({ payment_intent: pi.id });
    } catch (e) {
      console.error(`[webhook] refund failed for ${pi.id}:`, e.message);
    }
    return { rejected: 'amount mismatch', charged: amountReceived, expected: calloutFee };
  }

  const row = {
    user_id: accountId,
    client_id: accountId,
    client_name: md.bk_name || '',
    client_email: email,
    client_phone: md.bk_phone || null,
    // Always the table's own name, never md.bk_service_name: the browser's
    // string must not reach the database. The !svc guard above makes this safe.
    service_name: svc.name,
    service_price: Number(svc.price) || 0,
    callout_fee: calloutFee,
    scheduled_date: md.bk_date || null,
    scheduled_time: md.bk_time || null,
    address: md.bk_address || 'Home',
    status: 'pending',
    van_number: vanNumber,
    stripe_payment_intent_id: pi.id,
    bike_id: md.bk_bike_id || null,
    client_lang: ['en', 'es', 'zh'].includes(md.bk_lang) ? md.bk_lang : 'en',
  };

  const { data: created, error } = await sb.from('bookings').insert([row]).select().single();
  if (error) {
    // 23505 on bookings_unique_payment_intent: the browser got there between
    // our check and our insert. That is the index doing its job, not a fault.
    if (error.code === '23505') return { alreadyBooked: 'race' };
    // Anything else is thrown so Stripe retries. A paid call-out with no
    // booking is the exact failure this whole thing exists to end - it must
    // never be given up on quietly.
    throw new Error(`booking insert failed for ${pi.id}: ${error.message}`);
  }

  // Only the writer notifies, so a booking the browser made does not get a
  // second WhatsApp from here.
  const sent = await notifyNewBooking(created, row.client_lang);
  console.log('[webhook] booking', created.id, 'created from payment', pi.id, 'notified:', sent);
  return { created: created.id, notified: sent };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

import { withSentry } from './_sentry.js';
export default withSentry(handler, 'stripe-webhook');
async function handler(req, res) {
  if (await guard(req, res, { rateMax: 10, rateWindow: 60000 })) return; // 10/min payments
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sig = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  console.log(`[Stripe webhook] Received: ${event.type}`);

  // Idempotency: skip events already processed (table created by add-stripe-events.sql).
  // If the table doesn't exist yet, fall through and process best-effort.
  try {
    const { data: seen } = await sb
      .from('stripe_events')
      .select('id')
      .eq('id', event.id)
      .maybeSingle();
    if (seen) return res.status(200).json({ received: true, duplicate: true });
  } catch (e) {
    /* table missing — proceed */
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const out = await handlePaymentIntentSucceeded(event.data.object);
        console.log('[Stripe webhook] payment_intent.succeeded ->', JSON.stringify(out));
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object;

        if (session.mode === 'subscription') {
          const email = session.customer_details?.email || session.metadata?.email;
          const plan = session.metadata?.plan || 'basic';
          const billing = session.metadata?.billing || 'monthly';
          const customerId = session.customer;
          const subscriptionId = session.subscription;

          if (email) {
            try {
              await sb
                .from('profiles')
                .update({
                  stripe_customer_id: customerId,
                  stripe_subscription_id: subscriptionId,
                  membership_plan: plan,
                  membership_billing: billing,
                  membership_status: 'active',
                  membership_started_at: new Date().toISOString(),
                })
                .eq('email', email);
              console.log(`[checkout.session.completed] Activated ${plan} membership for ${email}`);
            } catch (err) {
              console.error('[checkout.session.completed] DB update failed:', err.message);
            }
          }
        } else if (session.metadata?.giftCard === 'true') {
          await handleGiftCardPurchase(session);
        } else {
          // One-time payment — log for now; extend as needed
          console.log(`[checkout.session.completed] One-time payment: ${session.id}`);
        }
        break;
      }

      case 'customer.subscription.created': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const plan = getPlanFromMetadata(subscription);
        const billing = subscription.metadata?.billing || 'monthly';
        const status = mapStripeStatus(subscription.status);

        try {
          await sb
            .from('profiles')
            .update({
              stripe_subscription_id: subscription.id,
              membership_plan: plan,
              membership_billing: billing,
              membership_status: status,
              membership_started_at: new Date().toISOString(),
            })
            .eq('stripe_customer_id', customerId);
          console.log(
            `[customer.subscription.created] Plan=${plan} status=${status} for customer ${customerId}`
          );
        } catch (err) {
          console.error('[customer.subscription.created] DB update failed:', err.message);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const status = mapStripeStatus(subscription.status);
        const plan = getPlanFromMetadata(subscription);
        const billing = subscription.metadata?.billing;

        const updateData = { membership_status: status };
        if (plan) updateData.membership_plan = plan;
        if (billing) updateData.membership_billing = billing;

        try {
          await sb.from('profiles').update(updateData).eq('stripe_customer_id', customerId);
          console.log(
            `[customer.subscription.updated] status=${status} plan=${plan} for customer ${customerId}`
          );
        } catch (err) {
          console.error('[customer.subscription.updated] DB update failed:', err.message);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        try {
          await sb
            .from('profiles')
            .update({
              membership_status: 'cancelled',
              membership_plan: null,
              stripe_subscription_id: null,
            })
            .eq('stripe_customer_id', customerId);
          console.log(
            `[customer.subscription.deleted] Cancelled membership for customer ${customerId}`
          );
        } catch (err) {
          console.error('[customer.subscription.deleted] DB update failed:', err.message);
        }
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object;
        const trialEnd = new Date(subscription.trial_end * 1000).toISOString();
        console.warn(
          `[customer.subscription.trial_will_end] Trial ends at ${trialEnd} for subscription ${subscription.id}`
        );
        break;
      }

      case 'customer.subscription.paused': {
        const subscription = event.data.object;
        try {
          await sb
            .from('profiles')
            .update({ membership_status: 'paused' })
            .eq('stripe_customer_id', subscription.customer);
          console.log(`[customer.subscription.paused] for customer ${subscription.customer}`);
        } catch (err) {
          console.error('[customer.subscription.paused] DB update failed:', err.message);
        }
        break;
      }

      case 'customer.subscription.resumed': {
        const subscription = event.data.object;
        try {
          await sb
            .from('profiles')
            .update({ membership_status: 'active' })
            .eq('stripe_customer_id', subscription.customer);
          console.log(`[customer.subscription.resumed] for customer ${subscription.customer}`);
        } catch (err) {
          console.error('[customer.subscription.resumed] DB update failed:', err.message);
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        try {
          await sb
            .from('profiles')
            .update({
              membership_status: 'active',
              membership_renewed_at: new Date().toISOString(),
            })
            .eq('stripe_customer_id', customerId);
          console.log(`[invoice.paid] Renewed membership for customer ${customerId}`);
        } catch (err) {
          console.error('[invoice.paid] DB update failed:', err.message);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const amountDue = (invoice.amount_due || 0) / 100;
        const attemptCount = invoice.attempt_count || 1;

        try {
          // Update membership status
          const { data: profile } = await sb
            .from('profiles')
            .update({ membership_status: 'past_due' })
            .eq('stripe_customer_id', customerId)
            .select('email,full_name,membership_status')
            .single();

          // Send payment failed email to client
          if (profile?.email) {
            await fetch(
              `${process.env.NEXT_PUBLIC_SITE_URL || 'https://drbikesydney.com.au'}/api/send-email`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'payment_failed',
                  to: profile.email,
                  name: profile.full_name || 'Member',
                  price: amountDue,
                  attemptCount,
                }),
              }
            );
          }

          console.log(
            `[invoice.payment_failed] Marked past_due for customer ${customerId}, attempt ${attemptCount}`
          );
        } catch (err) {
          console.error('[invoice.payment_failed] Handler error:', err.message);
        }
        break;
      }

      // 3DS authentication required on renewal
      case 'invoice.payment_action_required': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        try {
          const { data: profile } = await sb
            .from('profiles')
            .update({ membership_status: 'past_due' })
            .eq('stripe_customer_id', customerId)
            .select('email,full_name')
            .single();

          // Send action required email
          if (profile?.email) {
            await fetch(
              `${process.env.NEXT_PUBLIC_SITE_URL || 'https://drbikesydney.com.au'}/api/send-email`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'payment_action_required',
                  to: profile.email,
                  name: profile.full_name || 'Member',
                }),
              }
            );
          }

          console.log(`[invoice.payment_action_required] 3DS required for customer ${customerId}`);
        } catch (err) {
          console.error('[invoice.payment_action_required] DB update failed:', err.message);
        }
        break;
      }

      default:
        console.log(`[Stripe webhook] Unhandled event type: ${event.type}`);
    }
    // Mark processed (best-effort; ignore race/duplicate inserts and missing table)
    await sb
      .from('stripe_events')
      .insert({ id: event.id, type: event.type })
      .then(
        () => {},
        () => {}
      );
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Stripe webhook] Unexpected handler error:', error);
    // 500 → Stripe will retry, so a transient DB failure won't lose the event
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
