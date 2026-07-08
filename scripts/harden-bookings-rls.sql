-- Harden bookings RLS (TASK-014 / bomba #2): the browser can no longer INSERT
-- bookings directly, so it can never set its own price. All booking creation now
-- goes through the server endpoint (role=create-booking), which uses the service
-- key, looks up the price from `services`, and verifies payment.
--
-- ⚠️ APPLY ONLY AFTER you've confirmed the new server booking path works
--    (create one admin test booking on mobile + desktop and see it appear).
--    If you apply this first and the server path has a problem, no booking can
--    be created until it's fixed.
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run.

-- Remove client INSERT capability (these policies granted it):
drop policy if exists "Clients manage own bookings" on public.bookings;  -- was FOR ALL (included INSERT)
drop policy if exists bookings_insert_own on public.bookings;

-- Keep clients able to READ and UPDATE (cancel/reschedule) their own bookings.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bookings' and policyname='bookings_select_own') then
    create policy bookings_select_own on public.bookings for select using (auth.uid() = client_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bookings' and policyname='bookings_update_own') then
    create policy bookings_update_own on public.bookings for update using (auth.uid() = client_id);
  end if;
end $$;

-- Verify: there should be NO INSERT policy for clients left on bookings.
select policyname, cmd from pg_policies
where schemaname='public' and tablename='bookings' order by cmd, policyname;
