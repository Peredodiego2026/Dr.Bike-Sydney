-- scripts/enable-realtime-bookings.sql
--
-- Turns on live updates for the bookings table.
--
-- WHY: js/mechanic.js has ALWAYS refreshed the job list on every realtime event
-- - `.on('postgres_changes', ..., () => load())` - and a rescheduled job still
-- only appeared after a manual page reload. Code that correct failing that
-- plainly means the events were never arriving.
--
-- Supabase only broadcasts changes for tables that are members of the
-- `supabase_realtime` publication. It is a database setting: no deploy carries
-- it, no test catches it, and nothing in the app reports it. A table that is
-- not a member simply produces silence, which is indistinguishable from "no
-- changes happened".
--
-- The apps no longer DEPEND on this - they also reload when the tab comes back
-- and slowly on a timer - but with it, a status change lands the moment the
-- mechanic taps the button instead of up to a minute later.
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- Safe to run twice: the DO block checks membership first.

-- 1. What is broadcasting today? Run this on its own first if you want to see
--    the before/after.
select tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
 order by tablename;

-- 2. Add the tables the three apps watch, if they are not already there.
--    `alter publication ... add table` errors if the table is already a member,
--    so each one is guarded.
do $$
declare
  t text;
begin
  foreach t in array array['bookings', 'mechanic_locations', 'job_messages']
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'added % to supabase_realtime', t;
    else
      raise notice '% was already broadcasting', t;
    end if;
  end loop;
end;
$$;

-- 3. Realtime respects RLS: a client only receives events for rows they are
--    allowed to SELECT. That is deliberate and must stay that way - it is what
--    stops one client's phone from being told about another client's booking.
--    js/app.js additionally filters its subscription to client_id=eq.<self>.
--
--    REPLICA IDENTITY FULL makes the OLD row available on updates and deletes.
--    Without it Postgres only ships the primary key for the old version, so a
--    subscriber filtering on a column cannot tell whether a row just moved OUT
--    of its filter. Cheap at this table's size.
alter table public.bookings replica identity full;

-- Verify: should list bookings, job_messages and mechanic_locations.
select tablename as broadcasting
  from pg_publication_tables
 where pubname = 'supabase_realtime'
   and tablename in ('bookings', 'mechanic_locations', 'job_messages')
 order by tablename;
