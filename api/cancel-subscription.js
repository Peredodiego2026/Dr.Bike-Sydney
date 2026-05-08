import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { subscriptionId } = req.body;
  if (!subscriptionId) return res.status(400).json({ error: 'Missing subscriptionId' });

  try {
    // Cancel at period end (not immediately)
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });

    return res.status(200).json({ 
      success: true,
      cancelAt: new Date(subscription.cancel_at * 1000).toISOString()
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
