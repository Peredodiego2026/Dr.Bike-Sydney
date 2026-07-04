-- Stores why a booking was cancelled, so the client can see the reason in their
-- booking history. Written by the admin when cancelling; shown in the client SPA.
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run.

alter table public.bookings add column if not exists cancellation_reason text;
