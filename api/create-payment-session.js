import Stripe from 'stripe';
import { guard } from './_security.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const BASE_URL = 'https://drbikesydney.com.au';


// ── Cancel subscription (?type=cancel-subscription) ─────────────────────────
async function handleCancelSubscription(req, res) {
  if(await guard(req, res, { rateMax: 3, rateWindow: 60000 })) return;
  if(verifyInternalAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { subscriptionId } = req.body;
  if (!subscriptionId) return res.status(400).json({ error: 'Missing subscriptionId' });
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    return res.status(200).json({ success: true, cancelAt: new Date(subscription.cancel_at * 1000).toISOString() });
  } catch(e) { return res.status(500).json({ error: 'Failed to cancel subscription' }); }
}

export default async function handler(req, res) {
  if (await guard(req, res, { rateMax: 5, rateWindow: 60000 })) return;

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

  const { bookingId, priceCents, description, email, name } = req.body;
  if (!bookingId || !priceCents || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (typeof priceCents !== 'number' || priceCents < 50) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  // PaymentIntent mode: /api/create-payment-intent → here via vercel.json rewrite
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
      line_items: [{
        price_data: {
          currency: 'aud',
          unit_amount: priceCents,
          product_data: { name: description || 'Dr. Bike Sydney service' },
        },
        quantity: 1,
      }],
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
