-- scripts/add-checkout-attempts.sql
-- Run once in Supabase -> SQL Editor. Safe to run twice.
--
-- Why this table exists: the abandoned-cart reminder in api/send-cron.js looks
-- for rows in `bookings` with status 'pending'. A client who reaches the
-- payment screen and does not pay never creates one - the booking row is only
-- written after the charge succeeds - so there is nothing for the cron to find.
-- Diego hit exactly that on 2026-07-28.
--
-- Design decision (Diego chose option A, 2026-07-28): only signed-in clients
-- are recorded. We already have their email and they already accepted the
-- terms, so the reminder is one we are entitled to send. Anonymous visitors
-- get no row and no email.
--
-- ONE ROW PER CLIENT, upserted. The worry with a table like this is that it
-- grows a row per abandoned checkout forever; keying it on the client caps it
-- at one row each, always holding their most recent unfinished attempt.

create table if not exists public.checkout_attempts (
  client_id          uuid primary key references public.profiles (id) on delete cascade,
  service_name       text,
  service_price      numeric(10, 2),
  scheduled_date     date,
  scheduled_time     text,
  address            text,
  reached_payment_at timestamptz not null default now(),
  reminder_sent_at   timestamptz,
  updated_at         timestamptz not null default now()
);

comment on table public.checkout_attempts is
  'One open, unpaid checkout per client. Written when the payment screen opens, deleted when the booking is created. Read by api/send-cron.js?type=abandoned-checkout.';

-- The cron asks one question: who reached payment more than 3 hours ago,
-- has not been reminded, and is still unfinished. This index answers it
-- without scanning the table.
create index if not exists checkout_attempts_pending_idx
  on public.checkout_attempts (reached_payment_at)
  where reminder_sent_at is null;

-- ── Row level security ──────────────────────────────────────────────────────
-- The row holds a client's address and what they were about to book. Nobody
-- but that client should be able to read it. The cron runs with the service
-- role, which bypasses RLS, so it needs no policy of its own.
alter table public.checkout_attempts enable row level security;

drop policy if exists "own checkout attempt: read"   on public.checkout_attempts;
drop policy if exists "own checkout attempt: write"  on public.checkout_attempts;
drop policy if exists "own checkout attempt: update" on public.checkout_attempts;
drop policy if exists "own checkout attempt: delete" on public.checkout_attempts;

create policy "own checkout attempt: read"
  on public.checkout_attempts for select
  using (auth.uid() = client_id);

create policy "own checkout attempt: write"
  on public.checkout_attempts for insert
  with check (auth.uid() = client_id);

create policy "own checkout attempt: update"
  on public.checkout_attempts for update
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

create policy "own checkout attempt: delete"
  on public.checkout_attempts for delete
  using (auth.uid() = client_id);

-- ── Verification (run this after; two rows = applied) ───────────────────────
-- select table_name, column_name
-- from information_schema.columns
-- where table_name = 'checkout_attempts'
--   and column_name in ('client_id', 'reached_payment_at');
