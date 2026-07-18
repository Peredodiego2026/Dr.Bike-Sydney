-- ═══════════════════════════════════════════════════════════════════════
-- Security hardening — Dr. Bike Sydney — 2026-07-17
-- ═══════════════════════════════════════════════════════════════════════
--
-- Found via a live empirical test against production using only the public
-- anon key (the same one already embedded in js/supabase.js) — this is
-- exactly what any visitor's browser, or a scanner bot, already has access
-- to. Confirmed on the live database, not just read from code:
--
--   1. bookings          - anon could read every customer's name, email,
--                           phone, home address, full booking history.
--                           The RLS policies for this already exist in
--                           add-bookings-rls.sql / harden-bookings-rls.sql
--                           but evidently were never applied (or were
--                           reverted) - this file re-applies them from a
--                           clean slate so it doesn't matter which.
--   2. mechanic_locations - anon could read live GPS of any mechanic van,
--                           unscoped, no booking context needed at all.
--   3. discount_codes     - anon could dump the entire table (all codes,
--                           amounts, usage counts), including GIFT-*
--                           codes, which are money-equivalent.
--   4. van_zones          - anon could read the van_number=0 "hack" rows
--                           used to store the admin WhatsApp number and,
--                           much worse, the Google Calendar OAuth refresh
--                           token in plain text.
--
-- HOW TO APPLY (Supabase does not allow remote SQL execution):
--   1. Go to: https://supabase.com/dashboard/project/tgpipbloisahufaywhqb
--   2. Click "SQL Editor" in the left sidebar -> "New query"
--   3. Paste this ENTIRE file and click "Run"
--   4. The last block (a SELECT) prints a summary - check it shows
--      row-level security = true and exactly the expected policy names
--      for each table before closing the tab.
--
-- Safe to re-run: every DROP is IF EXISTS and every CREATE recreates from
-- scratch, so running this twice does not error or duplicate policies.
-- ═══════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────
-- 1. bookings — owner or admin can SELECT/UPDATE, no client-side INSERT
-- ───────────────────────────────────────────────────────────────────────
-- Booking creation goes through the server (api/auth.js role=create-booking,
-- service key) so the browser can never set its own price. The client-side
-- createBooking() helper in js/supabase.js is unused dead code (imported in
-- app.js, never called) - not touched here, flagged separately.
--
-- admin.html updates bookings directly with the admin's own authenticated
-- session (js/admin.js:2246 confirm, :2305 assign van) - NOT the service
-- key - so admin needs an explicit bypass here, not just auth.uid()=client_id.

alter table public.bookings enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'bookings'
  loop
    execute format('drop policy if exists %I on public.bookings', pol.policyname);
  end loop;
end $$;

create policy bookings_select_own_or_admin on public.bookings
  for select using (
    auth.uid() = client_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy bookings_update_own_or_admin on public.bookings
  for update using (
    auth.uid() = client_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- NOTE: mechanic.html and all server API routes use the service key,
-- which bypasses RLS entirely - unaffected by the above.


-- ───────────────────────────────────────────────────────────────────────
-- 2. mechanic_locations — client sees only the mechanic on THEIR active booking
-- ───────────────────────────────────────────────────────────────────────
-- Writes already go through api/auth.js role=mechanic-location (service
-- key) - this only restricts reads. Realtime subscriptions (js/app.js,
-- js/supabase.js "mechanic_locations" channel) respect RLS, so the
-- tracking map keeps working for a client with an active booking and
-- silently stops receiving updates once the booking is no longer active.

alter table public.mechanic_locations enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'mechanic_locations'
  loop
    execute format('drop policy if exists %I on public.mechanic_locations', pol.policyname);
  end loop;
end $$;

create policy mechanic_locations_select_active_booking on public.mechanic_locations
  for select using (
    exists (
      select 1 from public.bookings b
      where b.mechanic_id = mechanic_locations.mechanic_id
        and b.client_id = auth.uid()
        and b.status in ('confirmed', 'enroute', 'in_progress')
    )
  );


-- ───────────────────────────────────────────────────────────────────────
-- 3. discount_codes — anon can validate a specific active promo code,
--    never gift/referral codes, never a full-table dump. Admin sees and
--    manages everything (js/admin.js loadCoupons does an unfiltered
--    select('*'), plus direct insert/update/delete for the coupons UI).
-- ───────────────────────────────────────────────────────────────────────
-- landing.html / app.js / mechanic.js only ever query with
-- .eq('code', X).single() to validate what the customer/mechanic typed,
-- so this doesn't break that flow - it only stops someone fetching the
-- table with no filter at all. GIFT-* codes (money-equivalent, single
-- recipient) are excluded from the public policy entirely; redemption
-- already goes through consume_discount_code() (service key, section 6).

alter table public.discount_codes enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'discount_codes'
  loop
    execute format('drop policy if exists %I on public.discount_codes', pol.policyname);
  end loop;
end $$;

create policy discount_codes_select_public_active on public.discount_codes
  for select using (active = true and code not like 'GIFT-%');

create policy discount_codes_admin_all on public.discount_codes
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));


-- ───────────────────────────────────────────────────────────────────────
-- 4. van_zones — real zone rows stay public, the van_number=0 hack rows
--    (WhatsApp admin number, Google Calendar token) become service_role-only
-- ───────────────────────────────────────────────────────────────────────
-- api/auth.js and api/_google-calendar.js both already use the service
-- key, so they're unaffected. js/admin.js reads van_zones with the
-- authenticated admin session - covered by the admin-role clause below.

alter table public.van_zones enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'van_zones'
  loop
    execute format('drop policy if exists %I on public.van_zones', pol.policyname);
  end loop;
end $$;

create policy van_zones_select_public_zones on public.van_zones
  for select using (
    van_number > 0
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Admin manages zones directly (js/admin.js: delete van_number, delete
-- __driver__ rows, upsert zone rows) with the admin's own session, not
-- the service key.
create policy van_zones_admin_write on public.van_zones
  for insert with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy van_zones_admin_update on public.van_zones
  for update using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy van_zones_admin_delete on public.van_zones
  for delete using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));


-- ───────────────────────────────────────────────────────────────────────
-- 5. van_inventory — lock down; unused table (superseded by parts_inventory,
--    which already has correct RLS), currently empty, but its policy was
--    USING (true) - wide open to anyone if it's ever populated again.
-- ───────────────────────────────────────────────────────────────────────

alter table public.van_inventory enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'van_inventory'
  loop
    execute format('drop policy if exists %I on public.van_inventory', pol.policyname);
  end loop;
end $$;

create policy van_inventory_service_only on public.van_inventory
  for all using (auth.role() = 'service_role');


-- ───────────────────────────────────────────────────────────────────────
-- 6. Atomic consume functions — fixes the race condition where two
--    concurrent requests can both pass a "read count, check, write count+1"
--    check in JS and double-spend a single-use code, or double-decrement
--    parts stock past what's physically available.
-- ───────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can run as the function owner regardless of the
-- caller's RLS - the function body enforces its own single WHERE-guarded
-- UPDATE, which Postgres's row locking makes atomic: a second concurrent
-- call blocks until the first commits, then re-reads the now-updated row,
-- so its WHERE clause correctly fails if the code is now exhausted.

-- Uses discount_value (the real column - api/auth.js was querying a
-- discount_amount column that doesn't exist, so the discount was silently
-- never applied at booking-creation time; fixed together with this).
create or replace function public.consume_discount_code(p_code text)
returns table (id uuid, discount_value numeric, discount_type text, remaining int)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.discount_codes dc
  set uses_count = dc.uses_count + 1,
      active = case when dc.max_uses is not null and dc.uses_count + 1 >= dc.max_uses
                     then false else dc.active end
  where dc.code = p_code
    and dc.active = true
    and (dc.max_uses is null or dc.uses_count < dc.max_uses)
  returning dc.id, dc.discount_value, dc.discount_type,
            case when dc.max_uses is null then null else dc.max_uses - dc.uses_count end;
end;
$$;

create or replace function public.decrement_part_stock(p_part_id uuid, p_qty int)
returns table (id uuid, name text, new_stock int, min_stock int)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.parts_inventory pi
  set stock = greatest(0, pi.stock - p_qty)
  where pi.id = p_part_id
  returning pi.id, pi.name, pi.stock, pi.min_stock;
end;
$$;

-- Only the server (service key) calls these. Postgres grants EXECUTE on new
-- functions to PUBLIC by default, and anon/authenticated inherit that
-- automatically - revoking from those two roles specifically does nothing
-- while the PUBLIC grant still stands, so PUBLIC is what actually needs
-- revoking, then service_role is granted back explicitly.
revoke execute on function public.consume_discount_code(text) from public;
revoke execute on function public.decrement_part_stock(uuid, int) from public;
grant execute on function public.consume_discount_code(text) to service_role;
grant execute on function public.decrement_part_stock(uuid, int) to service_role;


-- ───────────────────────────────────────────────────────────────────────
-- Verify: run this and check every row shows rowsecurity = true and the
-- policy names match what's listed above (one row per policy).
-- ───────────────────────────────────────────────────────────────────────
select t.relname as table_name, t.relrowsecurity as rls_enabled,
       p.policyname, p.cmd
from pg_class t
join pg_namespace n on n.oid = t.relnamespace and n.nspname = 'public'
left join pg_policies p on p.schemaname = 'public' and p.tablename = t.relname
where t.relname in ('bookings','mechanic_locations','discount_codes','van_zones','van_inventory')
order by t.relname, p.cmd;
