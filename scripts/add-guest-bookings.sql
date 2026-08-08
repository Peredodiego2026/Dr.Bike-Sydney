-- Migration: bookings without an account, and one booking per payment
-- (Diego, 2026-08-05). Run in Supabase SQL Editor.
--
-- WHY. On 2026-08-05 a customer paid $20 with Apple Pay and got nothing: no
-- booking, no email, no WhatsApp to Diego, nothing in the admin panel or the
-- mechanic app. She was not signed in, and every one of those steps needed an
-- account. Diego's answer is that he does not want to force accounts - being
-- asked to register is the barrier, not being asked for an email - so the
-- system has to work for someone who never signs up.
--
-- Full write-up in docs/PENDIENTES.md section 14.

-- ── 1. A booking no longer requires an auth user ────────────────────────────
-- Everything else was already in place: client_name, client_email and
-- client_phone all exist and are nullable, and client_id is nullable too. This
-- column was the only thing standing in the way.
--
-- RLS needs NO change. The policies on bookings are SELECT/UPDATE over
-- `auth.uid() = client_id` plus the admin branch, so a guest booking with a
-- NULL client_id is simply invisible to every signed-in user - which is right.
-- The guest reads their own booking through the tracking link, which goes via
-- the server with the service key. Inserts are server-side too, so they never
-- consulted these policies in the first place.
ALTER TABLE bookings
  ALTER COLUMN user_id DROP NOT NULL;

COMMENT ON COLUMN bookings.user_id IS
  'auth.users id, NULL for guest bookings (no account). Contact details live in client_name/client_email/client_phone. See docs/PENDIENTES.md 14.';

-- ── 2. One booking per payment, enforced by the database ────────────────────
-- The chain is about to be driven by Stripe's payment_intent.succeeded webhook
-- instead of by the customer's browser, so that closing the app can no longer
-- lose a booking. For a while both paths will run: the browser creates the
-- booking for instant feedback, and the webhook creates it if the browser
-- never did.
--
-- Two writers need one referee, and it has to be the database - checking
-- "does it exist yet?" in code loses the race by definition. Whoever gets
-- there second hits this index and backs off.
--
-- Partial, because stripe_payment_intent_id is NULL for the admin test account
-- and for membership visits where the call-out was waived to $0. Those must
-- still be allowed, and there can be many of them.
--
-- RUN THIS FIRST. If it returns any rows, the index below will fail: there is
-- already a payment attached to two bookings, which is finding 12.2 having
-- happened before it was fixed. Sort those out before continuing.
--
--   select stripe_payment_intent_id, count(*)
--   from bookings
--   where stripe_payment_intent_id is not null
--   group by stripe_payment_intent_id
--   having count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_unique_payment_intent
  ON bookings (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- ── Verification ───────────────────────────────────────────────────────────
-- Expect is_nullable = YES:
--
--   select column_name, is_nullable
--   from information_schema.columns
--   where table_name = 'bookings' and column_name = 'user_id';
--
-- Expect one row:
--
--   select indexname from pg_indexes
--   where tablename = 'bookings'
--     and indexname = 'bookings_unique_payment_intent';
