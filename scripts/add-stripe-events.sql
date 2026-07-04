-- Idempotency ledger for Stripe webhooks (TASK-013 / bomba #4).
-- Lets the webhook skip events it already processed, so duplicate deliveries
-- don't double-apply membership changes.
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run.

create table if not exists public.stripe_events (
  id text primary key,            -- Stripe event id (evt_...)
  type text,
  created_at timestamptz default now()
);

-- Service role (used by the webhook) bypasses RLS; no policies needed.
alter table public.stripe_events enable row level security;
