import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { priceId, customerId, email, name, plan, billing } = req.body;

  if (!priceId || !email) return res.status(400).json({ error: 'Missing required fields' });

  try {
    // Get or create Stripe customer
    let customer;
    if (customerId) {
      try { customer = await stripe.customers.retrieve(customerId); } catch {}
    }
    if (!customer || customer.deleted) {
      customer = await stripe.customers.create({
        email,
        name,
        metadata: { supabase_user: email }
      });
    }

    // Create checkout session for subscription
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `https://dr-bike-sydney.vercel.app/?subscription=success&plan=${plan}&billing=${billing}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://dr-bike-sydney.vercel.app/?subscription=cancelled`,
      subscription_data: {
        metadata: { plan, billing, email }
      },
      allow_promotion_codes: true,
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
