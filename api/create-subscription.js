// PRODUCTION ENV VARS (Vercel):
//   STRIPE_SECRET_KEY       → sk_live_...
//   (webhook secret set in stripe-webhook.js)
import Stripe from 'stripe';
import { guard, sanitize, sanitizeObj, rateLimit } from './_security.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if(guard(req, res, { rateMax: 10, rateWindow: 60000 })) return;

  const { priceId, customerId, email, name, plan, billing } = req.body;
  if (!priceId || !email) return res.status(400).json({ error: 'Missing required fields' });
  console.log('create-subscription:', { priceId, plan, billing, email: email?.slice(0,5)+'...' });

  const BASE_URL = 'https://drbikesydney.com.au';

  try {
    // Get or create Stripe customer
    let customer;
    if (customerId) {
      try { 
        const c = await stripe.customers.retrieve(customerId);
        if (!c.deleted) customer = c;
      } catch(e) {}
    }
    if (!customer) {
      // Check if customer already exists by email
      const existing = await stripe.customers.list({ email, limit: 1 });
      if (existing.data.length > 0) {
        customer = existing.data[0];
      } else {
        customer = await stripe.customers.create({
          email,
          name,
          metadata: { supabase_user: email }
        });
      }
    }

    // Create checkout session — per Stripe v18, subscription is created after payment
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${BASE_URL}/?subscription=success&plan=${plan}&billing=${billing}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/?subscription=cancelled`,
      subscription_data: {
        metadata: { plan, billing, email }
      },
      metadata: { plan, billing, email },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: true },
      locale: 'en',
    });

    return res.status(200).json({ 
      sessionId: session.id, 
      url: session.url,
      customerId: customer.id 
    });

  } catch (error) {
    console.error('Stripe error:', error);
    return res.status(500).json({ error: error.message });
  }
}
