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

grant select on public.public_reviews to anon, authenticated;

-- Verify: should return 0 rows today (no real review submitted yet) and
-- start returning rows automatically as clients leave reviews after a
-- completed job - no further deploy needed for that.
select * from public.public_reviews;
