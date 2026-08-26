-- scripts/referral-credits-spendable.sql
--
-- Makes referral credits something a client can actually spend.
--
-- WHY: handleApplyReferral() credits both sides of a referral, and until this
-- migration NOTHING anywhere subtracted that number again. Grep referral_credits
-- across api/ and js/ before the accompanying commit: the only two writes are
-- increments. A client could share their code, watch "Credits earned" climb to
-- $30 in their profile, and find at the checkout that the money did not exist.
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste the whole file -> Run.
-- Safe to run twice; every statement is idempotent.

-- 1. How much of a booking's discount came from referral credit.
--    bookings.discount_applied already carries the booking-level discount and
--    is what the mechanic's completion breakdown and the invoice email read, so
--    the credit rides that existing pipe. This column records the referral half
--    separately, which is what lets a cancellation give the credit back without
--    also refunding a promo code that was never the client's to keep.
alter table public.bookings
  add column if not exists referral_credit_applied numeric not null default 0;

-- 2. Spend, atomically.
--    SELECT ... FOR UPDATE locks the profile row, so two bookings started in the
--    same second cannot both read a $15 balance and each spend it. That is the
--    exact race consume_discount_code() exists to stop for promo codes, and the
--    reason this is a function rather than a read-then-write in api/auth.js.
--
--    Returns how much was ACTUALLY spent - never more than the balance, never
--    more than p_max (the service price still left after any promo code), and
--    0 rather than an error when there is nothing to spend.
create or replace function public.spend_referral_credits(p_user uuid, p_max numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_spent   numeric;
begin
  if p_user is null or coalesce(p_max, 0) <= 0 then
    return 0;
  end if;

  select coalesce(referral_credits, 0)
    into v_balance
    from public.profiles
   where id = p_user
     for update;

  if v_balance is null or v_balance <= 0 then
    return 0;
  end if;

  v_spent := least(v_balance, p_max);

  update public.profiles
     set referral_credits = v_balance - v_spent
   where id = p_user;

  return v_spent;
end;
$$;

-- 3. Give it back.
--    Two callers, both of which are the client's money returning to the client:
--    a booking that gets cancelled, and the recovery path in api/auth.js for the
--    case where the credit left the profile but the booking update failed.
create or replace function public.refund_referral_credits(p_user uuid, p_amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new numeric;
begin
  if p_user is null or coalesce(p_amount, 0) <= 0 then
    return 0;
  end if;

  update public.profiles
     set referral_credits = coalesce(referral_credits, 0) + p_amount
   where id = p_user
  returning referral_credits into v_new;

  return coalesce(v_new, 0);
end;
$$;

-- 4. Only the server may call these. They move money.
revoke all on function public.spend_referral_credits(uuid, numeric) from public, anon, authenticated;
revoke all on function public.refund_referral_credits(uuid, numeric) from public, anon, authenticated;
grant execute on function public.spend_referral_credits(uuid, numeric) to service_role;
grant execute on function public.refund_referral_credits(uuid, numeric) to service_role;

-- Verify: should return one row with both functions and the new column.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings'
      and column_name = 'referral_credit_applied') as column_ok,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('spend_referral_credits', 'refund_referral_credits')) as functions_ok;
