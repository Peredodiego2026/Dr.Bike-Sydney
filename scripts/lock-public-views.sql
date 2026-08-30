-- Lock down the two public views — Dr. Bike Sydney — 2026-08-30
--
-- WHY THIS EXISTS
--
-- A view in Postgres runs with the privileges of its OWNER, not of the role
-- querying it. Both of this project's public views were created that way on
-- purpose: it is the only way to show anon a filtered slice of `bookings`,
-- which is otherwise locked behind RLS.
--
-- What nobody accounted for is the OTHER half of that trade. Supabase's
-- default grants hand `anon` and `authenticated` every privilege on every
-- object in `public`, including objects created later. So each view arrived
-- with SELECT *and* INSERT/UPDATE/DELETE for the whole internet, and because
-- the view is owner-privileged, those writes land on `bookings` with RLS
-- never consulted.
--
-- Verified against production on 2026-08-30, unauthenticated, anon key only:
--
--   GET /rest/v1/public_booking_tracking?select=*
--     -> 200, all 3 bookings, each with its `tracking_token`.
--   POST /api/auth?role=public-track  {tracking_token: <one of those>}
--     -> 200, full street address + 4-digit arrival_pin + live mechanic GPS.
--
--   PATCH /rest/v1/public_reviews?id=eq.<uuid>
--     -> 204. anon holds UPDATE on the view, which writes through to bookings.
--
-- api/auth.js's handlePublicTrack is not the bug. Its comment is right that
-- the token is an unguessable UUID and that accepting a raw booking_id used
-- to defeat the point. The token stopped being a secret one layer below it:
-- the database was publishing the list.
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. public_booking_tracking — no public access at all.
-- ---------------------------------------------------------------------------
-- Nothing reads this view. Not the SPA, not the landing, not track.html, not
-- api/. `handlePublicTrack` queries `bookings` directly with SUPABASE_SERVICE_KEY,
-- which bypasses RLS and never touches the view. Grepped the whole repo for
-- `public_booking_tracking` on 2026-08-30: the only hits are SQL scripts and
-- documentation. Revoking it breaks nothing.
--
-- The view is left in place rather than dropped — dropping is not reversible
-- from here, and a view with no grants is inert.
REVOKE ALL ON public.public_booking_tracking FROM anon, authenticated;

-- Belt and braces: with security_invoker on, even a future accidental GRANT
-- would still be filtered by bookings' own RLS instead of the owner's rights.
-- Requires Postgres 15+. If this line errors on an older server, the REVOKE
-- above is what actually closes the hole — keep it and drop this one.
ALTER VIEW public.public_booking_tracking SET (security_invoker = on);

-- ---------------------------------------------------------------------------
-- 2. public_reviews — read stays, write goes.
-- ---------------------------------------------------------------------------
-- This one IS used: index.html:2232 and js/landing-inline.js:614 both query it
-- with the anon key to render real testimonials. Public SELECT is the feature.
--
-- It deliberately does NOT get security_invoker. Turning it on would make
-- bookings' RLS apply, an anonymous visitor would match zero rows, and the
-- testimonials section would go permanently empty. Owner-privileged reads are
-- the whole reason the view exists. The revoke below is therefore the only
-- thing standing between the internet and write access to `bookings`.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.public_reviews FROM anon, authenticated;
GRANT SELECT ON public.public_reviews TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Stop the next view from being born with the same hole.
-- ---------------------------------------------------------------------------
-- The default privileges are what made this a class of bug rather than one
-- mistake. Any view created from now on inherits SELECT only; a view that
-- needs more has to say so out loud.
--
-- `ON TABLES` is mandatory and this statement shipped without it, which cost
-- Diego two failed runs on 2026-08-30. ALTER DEFAULT PRIVILEGES needs to be
-- told which KIND of object it is talking about (TABLES / SEQUENCES /
-- FUNCTIONS / TYPES / SCHEMAS); without it Postgres fails to parse at `FROM`.
-- And a parse error aborts the WHOLE batch - so the three statements above,
-- which were correct, never executed either, and the leak stayed open while
-- the script looked like it had been run. Views count as TABLES here.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLES FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Verify. Run this after the statements above and read the output.
-- ---------------------------------------------------------------------------
-- Expected:
--   public_booking_tracking -> (no public access)
--   public_reviews          -> SELECT
-- Anything else on either row, or any other view showing a write privilege,
-- is still open.
SELECT c.relname AS view_name,
       COALESCE(
         (SELECT string_agg(DISTINCT g.privilege_type, ', ' ORDER BY g.privilege_type)
          FROM information_schema.role_table_grants g
          WHERE g.table_schema = 'public'
            AND g.table_name = c.relname
            AND g.grantee IN ('anon', 'authenticated')),
         '(no public access)') AS public_privileges,
       CASE WHEN c.reloptions::text LIKE '%security_invoker=on%'
            THEN 'respects RLS'
            ELSE 'runs as owner' END AS mode
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
ORDER BY c.relname;
