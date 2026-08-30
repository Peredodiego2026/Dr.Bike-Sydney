-- Public reviews view — Dr. Bike Sydney — 2026-07-18
--
-- landing.html's testimonials section previously showed 3 fabricated
-- reviews labeled "Google Review" (fake names, fake quotes) - real ACCC
-- risk, and it hid the site's own genuine review data (bookings.client_rating
-- / client_review, collected via api/auth.js role=client-review after a
-- completed job) instead of using it.
--
-- bookings itself is locked down (harden-security-2026-07-17.sql: only the
-- owning client or an admin can SELECT it - PII like email/phone/address
-- lives on the same row). This view exposes ONLY the safe, review-relevant
-- columns, with the client's name truncated to "First L." the same way the
-- old fake reviews displayed names, and only for bookings that actually
-- have a rating and comment. Nothing else from bookings is reachable
-- through it.
--
-- Views in Postgres run with the privileges of the view's OWNER by default
-- (not the querying role), same pattern already used by
-- add-tracking-token.sql's public_booking_tracking view - so this works
-- despite bookings' restrictive RLS, and the GRANT below is what actually
-- lets anon query the view itself.
--
-- 2026-08-30: that paragraph describes half of the trade and the missing half
-- was a live hole. Owner privileges do not only make the SELECT work - they
-- make writes work too, and Supabase's default grants hand anon every
-- privilege on new objects in `public`. A PATCH to this view from the open
-- internet returned 204: anon held UPDATE, and an update through the view
-- lands on `bookings` with RLS never consulted. Once real reviews exist their
-- ids are readable here, so the rows are addressable; a DELETE through the
-- view would take the whole booking with it.
--
-- The REVOKE below is the fix, and it has to stay attached to the GRANT.
-- security_invoker is deliberately NOT set on this view: turning it on would
-- apply bookings' RLS, an anonymous visitor would match zero rows, and the
-- testimonials section would go permanently empty. Reading as the owner is
-- the entire point here - so removing write access is the only protection
-- this view can have.
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run.

create or replace view public.public_reviews as
select
  b.id,
  trim(
    split_part(b.client_name, ' ', 1) || ' ' ||
    case when split_part(b.client_name, ' ', 2) <> ''
      then left(split_part(b.client_name, ' ', 2), 1) || '.'
      else ''
    end
  ) as display_name,
  b.suburb,
  b.client_rating as rating,
  b.client_review as comment,
  b.completed_at
from public.bookings b
where b.client_rating is not null
  and b.client_review is not null
  and b.status = 'completed'
order by b.completed_at desc;

revoke insert, update, delete, truncate, references, trigger
  on public.public_reviews from anon, authenticated;
grant select on public.public_reviews to anon, authenticated;

-- Verify: should return 0 rows today (no real review submitted yet) and
-- start returning rows automatically as clients leave reviews after a
-- completed job - no further deploy needed for that.
select * from public.public_reviews;
