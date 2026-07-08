-- TASK-031: Indexes for hot queries, so the app stays fast at 500+ clients.
-- Safe + idempotent (IF NOT EXISTS). HOW TO APPLY: Supabase SQL Editor -> Run.

-- Availability checks, admin lists, mechanic job ordering all filter/sort by date
create index if not exists idx_bookings_scheduled_date on public.bookings (scheduled_date);

-- Status filters (active vs done, dashboards)
create index if not exists idx_bookings_status on public.bookings (status);

-- Client "My Bookings": where client_id = X order by scheduled_date desc
create index if not exists idx_bookings_client_date on public.bookings (client_id, scheduled_date desc);

-- Lookups by assigned mechanic
create index if not exists idx_bookings_mechanic on public.bookings (mechanic_id) where mechanic_id is not null;

-- Public tracking looks up the mechanic's location by van
create index if not exists idx_mechloc_van on public.mechanic_locations (van_number);

-- Verify what's now on bookings
select indexname from pg_indexes where schemaname='public' and tablename='bookings' order by indexname;
