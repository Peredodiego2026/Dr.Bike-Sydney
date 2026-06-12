import Stripe from 'stripe';
import { guard } from './_security.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const BASE_URL = 'https://drbikesydney.com.au';

export default async function handler(req, res) {
  if (await guard(req, res, { rateMax: 5, rateWindow: 60000 })) return;

  const { bookingId, priceCents, description, email, name } = req.body;
  if (!bookingId || !priceCents || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (typeof priceCents !== 'number' || priceCents < 50) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

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
