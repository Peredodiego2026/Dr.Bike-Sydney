import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sb = createClient(
  'https://tgpipbloisahufaywhqb.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_zL6EV0_qG2SccuRYBm6BZQ_psf806jn'
);

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
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

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription') break;

        const email = session.customer_details?.email || session.metadata?.email;
        const plan = session.metadata?.plan || 'basic';
        const billing = session.metadata?.billing || 'monthly';
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        if (email) {
          await sb.from('profiles').update({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            membership_plan: plan,
            membership_billing: billing,
            membership_status: 'active',
            membership_started_at: new Date().toISOString(),
          }).eq('email', email);
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const subscriptionId = invoice.subscription;

        // Keep membership active on successful renewal
        await sb.from('profiles')
          .update({ 
            membership_status: 'active',
            membership_renewed_at: new Date().toISOString()
          })
          .eq('stripe_customer_id', customerId);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        await sb.from('profiles')
          .update({ membership_status: 'past_due' })
          .eq('stripe_customer_id', customerId);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        await sb.from('profiles')
          .update({ 
            membership_status: 'cancelled',
            membership_plan: null,
            stripe_subscription_id: null
          })
          .eq('stripe_customer_id', customerId);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const status = subscription.status; // active, past_due, cancelled, trialing

        await sb.from('profiles')
          .update({ membership_status: status })
          .eq('stripe_customer_id', customerId);
        break;
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(500).json({ error: error.message });
  }
}
