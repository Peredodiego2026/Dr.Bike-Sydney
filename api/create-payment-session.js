import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { guard } from './_security.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const BASE_URL = 'https://drbikesydney.com.au';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co';
const SERVICE_KEY = () => process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

// Verify Supabase JWT and return user's subscription from profiles
async function getUserSubscription(access_token) {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY());
  const {
    data: { user },
    error,
  } = await sb.auth.getUser(access_token);
  if (error || !user) return null;
  const { data: profile } = await sb
    .from('profiles')
    .select('stripe_subscription_id, membership_status, membership_plan')
    .eq('id', user.id)
    .single();
  if (!profile?.stripe_subscription_id) return null;
  return { userId: user.id, ...profile };
}

// ── Pause subscription ──────────────────────────────────────────────────────
// pause_collection keeps the Stripe status as 'active', so the
// customer.subscription.paused webhook does NOT fire. We update profiles here.
async function handlePauseSubscription(req, res) {
  const { access_token } = req.body;
  if (!access_token) return res.status(401).json({ error: 'Authentication required' });
  const sub = await getUserSubscription(access_token);
  if (!sub) return res.status(404).json({ error: 'No active subscription found' });
  if (sub.membership_status === 'paused') return res.status(409).json({ error: 'Already paused' });
  try {
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      pause_collection: { behavior: 'void' },
    });
    const sb = createClient(SUPABASE_URL, SERVICE_KEY());
    await sb.from('profiles').update({ membership_status: 'paused' }).eq('id', sub.userId);
    return res.status(200).json({ success: true, status: 'paused' });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to pause subscription' });
  }
}

// ── Resume subscription ─────────────────────────────────────────────────────
async function handleResumeSubscription(req, res) {
  const { access_token } = req.body;
  if (!access_token) return res.status(401).json({ error: 'Authentication required' });
  const sub = await getUserSubscription(access_token);
  if (!sub) return res.status(404).json({ error: 'No active subscription found' });
  if (sub.membership_status === 'active') return res.status(409).json({ error: 'Already active' });
  try {
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      pause_collection: '',
    });
    const sb = createClient(SUPABASE_URL, SERVICE_KEY());
    await sb.from('profiles').update({ membership_status: 'active' }).eq('id', sub.userId);
    return res.status(200).json({ success: true, status: 'active' });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to resume subscription' });
  }
}

// ── Cancel subscription (?type=cancel-subscription) ─────────────────────────
async function handleCancelSubscription(req, res) {
  const { access_token } = req.body;
  if (!access_token) return res.status(401).json({ error: 'Authentication required' });
  const sub = await getUserSubscription(access_token);
  if (!sub) return res.status(404).json({ error: 'No active subscription found' });
  try {
    const subscription = await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
    return res
      .status(200)
      .json({ success: true, cancelAt: new Date(subscription.cancel_at * 1000).toISOString() });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to cancel subscription' });
  }
}

// ── Buy gift card (?type=gift-card) ─────────────────────────────────────────
async function handleGiftCard(req, res) {
  const { amount, recipientEmail, recipientName, senderName, message, purchaserEmail } = req.body;
  const amt = Number(amount);
  if (!amt || amt < 20 || amt > 1000)
    return res.status(400).json({ error: 'Amount must be between $20 and $1000' });
  if (!recipientEmail || !recipientEmail.includes('@'))
    return res.status(400).json({ error: 'Valid recipient email required' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'aud',
            unit_amount: Math.round(amt * 100),
            product_data: { name: `Dr. Bike Sydney Gift Card - $${amt}` },
          },
          quantity: 1,
        },
      ],
      ...(purchaserEmail ? { customer_email: purchaserEmail } : {}),
      success_url: `${BASE_URL}/?gift=success`,
      cancel_url: `${BASE_URL}/?gift=cancelled`,
      metadata: {
        giftCard: 'true',
        amount: String(amt),
        recipientEmail: String(recipientEmail).slice(0, 120),
        recipientName: String(recipientName || '').slice(0, 80),
        senderName: String(senderName || '').slice(0, 80),
        message: String(message || '').slice(0, 200),
        purchaserEmail: String(purchaserEmail || '').slice(0, 120),
      },
      locale: 'en',
    });
    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('gift-card session error:', err);
    return res.status(500).json({ error: 'Could not start gift card purchase' });
  }
}

import { withSentry } from './_sentry.js';
export default withSentry(handler, 'create-payment-session');
async function handler(req, res) {
  if (await guard(req, res, { rateMax: 5, rateWindow: 60000 })) return;

  if (req.query.type === 'pause-subscription') return handlePauseSubscription(req, res);
  if (req.query.type === 'resume-subscription') return handleResumeSubscription(req, res);
  if (req.query.type === 'cancel-subscription') return handleCancelSubscription(req, res);
  if (req.query.type === 'gift-card') return handleGiftCard(req, res);

  // Verify Checkout Session (client calls this after redirect back from Stripe)
  if (req.query.type === 'verify') {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== 'paid') return res.status(200).json({ paid: false });
      return res.status(200).json({ paid: true, paymentIntentId: session.payment_intent });
    } catch (err) {
      console.error('verify-checkout-session error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  const { bookingId, priceCents, description, email } = req.body;
  if (!bookingId || !priceCents || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (typeof priceCents !== 'number' || priceCents < 50) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  // PaymentIntent mode: /api/create-payment-intent -> here via vercel.json rewrite
  if (req.query.type === 'intent') {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: priceCents,
        currency: 'aud',
        payment_method_types: ['card'],
        receipt_email: email,
        metadata: { bookingId, email },
      });
      return res.status(200).json({ clientSecret: paymentIntent.client_secret });
    } catch (err) {
      console.error('create-payment-intent error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Checkout Session mode (default)
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'aud',
            unit_amount: priceCents,
            product_data: { name: description || 'Dr. Bike Sydney service' },
          },
          quantity: 1,
        },
      ],
      customer_email: email,
      success_url: `${BASE_URL}/?payment=success&booking=${bookingId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/?payment=cancelled&booking=${bookingId}`,
      metadata: { bookingId, email },
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: false },
      locale: 'en',
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('create-payment-session error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
