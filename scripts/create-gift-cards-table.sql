-- Gift cards ledger. Redemption itself reuses the existing discount_codes table
-- (a matching row is inserted with discount_type='fixed', max_uses=1).
-- This table keeps the business record: who bought it, who received it, status.

create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  amount numeric(10,2) not null,
  purchaser_email text,
  recipient_email text not null,
  recipient_name text,
  sender_name text,
  message text,
  status text not null default 'active',  -- active | redeemed | cancelled
  stripe_session_id text,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz
);

-- Only the service role (server) touches this table.
alter table public.gift_cards enable row level security;

create index if not exists gift_cards_code_idx on public.gift_cards (code);
create index if not exists gift_cards_recipient_idx on public.gift_cards (recipient_email);
