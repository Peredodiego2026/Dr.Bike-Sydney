// PRODUCTION ENV VARS (Vercel):
//   STRIPE_SECRET_KEY        → sk_live_...
//   STRIPE_WEBHOOK_SECRET    → whsec_...  (from Stripe Dashboard → Webhooks)
//   SUPABASE_SERVICE_KEY     → service_role key (not anon key)
//   SUPABASE_URL             → https://tgpipbloisahufaywhqb.supabase.co
//
// Webhook URL to register: https://drbikesydney.com.au/api/stripe-webhook
// Events to enable: checkout.session.completed, customer.subscription.created,
//   customer.subscription.updated, customer.subscription.deleted,
//   customer.subscription.trial_will_end, customer.subscription.paused,
//   customer.subscription.resumed, invoice.paid, invoice.payment_failed,
//   invoice.payment_action_required
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { guard, sanitize, sanitizeObj, rateLimit } from './_security.js';

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
    obj.metadata?.plan ||
    obj.items?.data?.[0]?.price?.nickname?.toLowerCase() ||
    'basic';
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
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if(guard(req, res, { rateMax: 10, rateWindow: 60000 })) return; // 10/min payments
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

  // Always return 200 after signature verification — DB errors are logged, not surfaced
  res.status(200).json({ received: true });

  try {
    switch (event.type) {

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
              await sb.from('profiles').update({
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId,
                membership_plan: plan,
                membership_billing: billing,
                membership_status: 'active',
                membership_started_at: new Date().toISOString(),
              }).eq('email', email);
              console.log(`[checkout.session.completed] Activated ${plan} membership for ${email}`);
            } catch (err) {
              console.error('[checkout.session.completed] DB update failed:', err.message);
            }
          }
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
          await sb.from('profiles').update({
            stripe_subscription_id: subscription.id,
            membership_plan: plan,
            membership_billing: billing,
            membership_status: status,
            membership_started_at: new Date().toISOString(),
          }).eq('stripe_customer_id', customerId);
          console.log(`[customer.subscription.created] Plan=${plan} status=${status} for customer ${customerId}`);
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
          console.log(`[customer.subscription.updated] status=${status} plan=${plan} for customer ${customerId}`);
        } catch (err) {
          console.error('[customer.subscription.updated] DB update failed:', err.message);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        try {
          await sb.from('profiles').update({
            membership_status: 'cancelled',
            membership_plan: null,
            stripe_subscription_id: null,
          }).eq('stripe_customer_id', customerId);
          console.log(`[customer.subscription.deleted] Cancelled membership for customer ${customerId}`);
        } catch (err) {
          console.error('[customer.subscription.deleted] DB update failed:', err.message);
        }
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object;
        const trialEnd = new Date(subscription.trial_end * 1000).toISOString();
        console.warn(`[customer.subscription.trial_will_end] Trial ends at ${trialEnd} for subscription ${subscription.id}`);
        break;
      }

      case 'customer.subscription.paused': {
        const subscription = event.data.object;
        try {
          await sb.from('profiles').update({ membership_status: 'paused' })
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
          await sb.from('profiles').update({ membership_status: 'active' })
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
          await sb.from('profiles').update({
            membership_status: 'active',
            membership_renewed_at: new Date().toISOString(),
          }).eq('stripe_customer_id', customerId);
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
          const { data: profile } = await sb.from('profiles')
            .update({ membership: 'past_due' })
            .eq('stripe_customer_id', customerId)
            .select('email,full_name,membership')
            .single();

          // Send payment failed email to client
          if(profile?.email) {
            await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://drbikesydney.com.au'}/api/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'payment_failed',
                to: profile.email,
                name: profile.full_name || 'Member',
                price: amountDue,
                attemptCount
              })
            });
          }

          console.log(`[invoice.payment_failed] Marked past_due for customer ${customerId}, attempt ${attemptCount}`);
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
          const { data: profile } = await sb.from('profiles')
            .update({ membership: 'past_due' })
            .eq('stripe_customer_id', customerId)
            .select('email,full_name')
            .single();

          // Send action required email
          if(profile?.email) {
            await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://drbikesydney.com.au'}/api/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'payment_action_required',
                to: profile.email,
                name: profile.full_name || 'Member'
              })
            });
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
  } catch (error) {
    console.error('[Stripe webhook] Unexpected handler error:', error);
  }
}
