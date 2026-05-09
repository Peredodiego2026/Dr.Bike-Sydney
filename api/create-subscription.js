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
      success_url: `https://dr-bike-sydney.vercel.app/?subscription=success&plan=${plan}&billing=${billing}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://dr-bike-sydney.vercel.app/?subscription=cancelled`,
      subscription_data: {
        metadata: { plan, billing, email }
      },
      metadata: { plan, billing, email },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
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
