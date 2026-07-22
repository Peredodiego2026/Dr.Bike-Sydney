-- Migration: card-on-file support (Diego, 2026-07-22)
-- Run in Supabase SQL Editor

-- Which saved Stripe PaymentMethod to auto-charge at job completion. NULL =
-- no card saved, mechanic uses EFTPOS as today. profiles.stripe_customer_id
-- already exists (used by membership subscriptions) - reused here rather
-- than a separate concept.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_default_payment_method_id TEXT DEFAULT NULL;

-- Which Stripe PaymentIntent (if any) auto-charged this specific booking's
-- final amount at completion - kept for refund/dispute lookups. Separate
-- from bookings.stripe_payment_intent_id, which is the callout-fee charge
-- made at booking time, not the completion charge.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS completion_payment_intent_id TEXT DEFAULT NULL;
