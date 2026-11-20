-- Our own public reviews - Dr. Bike Sydney - 2026-11-20
--
-- Google took the business profile down on 9-nov-2026 and rejected the appeal.
-- Diego: "si google nos baja haremos nuestra propia". So drbikesydney.com.au/reviews
-- is a review page of our own: anyone can write one - no account - with stars,
-- a comment and up to six photos, and it shows on the page and in the
-- "What Our Customers Say" section at once.
--
-- Until now the only reviews were the ones tied to a completed booking
-- (bookings.client_rating / client_review). This table holds the ones written
-- on the page. Nobody reads it directly:
--   - writes go through /api/auth?role=site-review (Turnstile, a daily cap per
--     visitor, photos checked), with the service key;
--   - the public reads public_reviews (scripts/create-public-reviews-view.sql),
--     which shows only published rows and only "First L." of the name - never
--     the email or the hashed IP;
--   - Admin > Reviews hides and unhides them, through the server.
-- So RLS is on with NO policy at all, and anon/authenticated hold nothing.
--
-- Published at once, hidden afterwards: the ACCC lets a business remove spam,
-- abuse or someone's personal details, never a genuine bad review. `hidden`
-- is for those, and hidden_reason says which.
--
-- Photos are NOT a new bucket: they go to the public `job-photos` bucket under
-- `site-reviews/<review id>/`, the same bucket the website's showcase photos
-- already use (api/_photo-gallery.js).
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste this file, then
-- scripts/create-public-reviews-view.sql, -> Run. Safe to run twice.

create table if not exists public.site_reviews (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  name          text not null check (char_length(name) between 1 and 60),
  rating        smallint not null check (rating between 1 and 5),
  comment       text not null check (char_length(comment) between 1 and 1000),
  photos        text[] not null default '{}',
  -- Private: only so Diego can answer. Never in the view.
  email         text,
  lang          text,
  -- sha256 of the visitor's IP, for the daily cap. Never the IP itself.
  ip_hash       text,
  status        text not null default 'published' check (status in ('published', 'hidden')),
  hidden_reason text
);

create index if not exists site_reviews_status_created
  on public.site_reviews (status, created_at desc);
create index if not exists site_reviews_ip_created
  on public.site_reviews (ip_hash, created_at desc);

alter table public.site_reviews enable row level security;
revoke all on public.site_reviews from anon, authenticated;

-- Verify: the table exists, is empty, and anon holds no privilege on it.
select
  (select count(*) from public.site_reviews) as reviews,
  (select relrowsecurity from pg_class where oid = 'public.site_reviews'::regclass) as rls_on,
  has_table_privilege('anon', 'public.site_reviews', 'select') as anon_can_read;
