-- Rebuild the booking that was never created: Thais Rocha Guimaraes, 2026-08-05
-- (Diego, 2026-08-10). Run in Supabase SQL Editor, section by section.
--
-- WHY. She paid $20 with Apple Pay at 13:29 on 2026-08-05 and the system
-- produced nothing: no booking row, no email, no WhatsApp, nothing in the
-- admin panel. The write-up is docs/PENDIENTES.md section 14. Diego refunded
-- her the same day, so this row exists for the tax/records trail only.
--
-- THE MONEY. Refunded in full. Net revenue is $0 (Stripe kept $0.64 of fees,
-- which is a cost, not a sale). The row therefore goes in as `cancelled`.
-- That is not cosmetic: every revenue number in the admin panel filters on
-- `status = 'completed'`, so a cancelled row is recorded without inflating
-- the year's takings. `bookings_unique_slot` also excludes cancelled rows, so
-- this cannot block a real booking of that slot either.
--
-- PREREQUISITE: scripts/add-guest-bookings.sql must already be applied
-- (bookings.user_id nullable). Section 1 below checks it before anything else.

-- ── 1. CHECK FIRST. Do not skip. ───────────────────────────────────────────
-- Expect exactly one row, is_nullable = YES. If it says NO, stop here and run
-- scripts/add-guest-bookings.sql first: she has no account, and inventing one
-- (or attaching the booking to Diego's own user) would falsify the record.

select column_name, is_nullable
from   information_schema.columns
where  table_schema = 'public'
  and  table_name   = 'bookings'
  and  column_name  = 'user_id';

-- And confirm the row is not already there. Expect 0 rows.

select id, status, client_email
from   public.bookings
where  stripe_payment_intent_id = 'pi_3U0vVzPPGSm5cT7J0SRAoVUW';

-- ── 2. PREVIEW. Shows the exact row without writing anything. ──────────────
-- The service price is read from the `services` table, never typed in by
-- hand - that table is what Admin > Services & Prices edits, so this row stays
-- connected to the catalog like every other booking.
--
-- The name is `Tyre / Tube Install`, which is how it is spelled in the catalog
-- (Admin > Services & Prices, $27, Wheels & tyres). docs/PENDIENTES.md 14.6
-- wrote it from memory as "Tyre and Tube Installed", which matches nothing and
-- would have made this subselect return NULL.
--
-- If `service_price` still comes back NULL, the catalog was renamed: fix the
-- name in section 3 rather than typing a number.

select
  null::uuid                                as user_id,        -- no account: guest
  null::uuid                                as client_id,      -- same reason
  'Thais Rocha Guimaraes'                   as client_name,
  'thaixguimaraes@gmail.com'                as client_email,
  null                                      as client_phone,   -- never captured
  'Tyre / Tube Install'                     as service_name,
  (select price from public.services
    where name = 'Tyre / Tube Install'
    limit 1)                                as service_price,
  20.00                                     as callout_fee,
  '2026-08-05'::date                        as scheduled_date,
  '13:30'                                   as scheduled_time,
  'The Palladium, 102 Miller Street, Pyrmont, Sydney' as address,
  'Pyrmont'                                 as suburb,
  'cancelled'                               as status,
  1                                         as van_number,
  'pi_3U0vVzPPGSm5cT7J0SRAoVUW'             as stripe_payment_intent_id,
  'Refunded in full on 2026-08-05 (Stripe pi_3U0vVzPPGSm5cT7J0SRAoVUW, $20.00 AUD, Apple Pay/Visa 4481). '
  || 'The booking was never created by the app: user_id was NOT NULL and she had no account. '
  || 'Row reconstructed by hand on 2026-08-10 for the tax record. See docs/PENDIENTES.md 14.6.'
                                            as cancellation_reason,
  'en'                                      as client_lang,
  '2026-08-05 13:29:00+10'::timestamptz     as created_at;

-- ── 3. THE INSERT. Only after the preview looks right. ─────────────────────
-- Two values are RECONSTRUCTED, not recorded anywhere, because the booking
-- never reached the database. Change them here if Diego remembers otherwise:
--
--   scheduled_time '13:30'  -> she paid at 13:29; the slot she picked is lost.
--   van_number     1        -> no van was ever assigned. Irrelevant for a
--                             cancelled row, but the column is used elsewhere.
--
-- client_phone stays NULL on purpose: Diego has her WhatsApp, but it was never
-- entered into the system and this file is a record of what happened, not a
-- contact list.

insert into public.bookings (
  user_id, client_id, client_name, client_email, client_phone,
  service_name, service_price, callout_fee,
  scheduled_date, scheduled_time, address, suburb,
  status, van_number, stripe_payment_intent_id,
  cancellation_reason, client_lang, created_at
)
select
  null, null, 'Thais Rocha Guimaraes', 'thaixguimaraes@gmail.com', null,
  'Tyre / Tube Install',
  (select price from public.services where name = 'Tyre / Tube Install' limit 1),
  20.00,
  '2026-08-05', '13:30',
  'The Palladium, 102 Miller Street, Pyrmont, Sydney', 'Pyrmont',
  'cancelled', 1, 'pi_3U0vVzPPGSm5cT7J0SRAoVUW',
  'Refunded in full on 2026-08-05 (Stripe pi_3U0vVzPPGSm5cT7J0SRAoVUW, $20.00 AUD, Apple Pay/Visa 4481). '
  || 'The booking was never created by the app: user_id was NOT NULL and she had no account. '
  || 'Row reconstructed by hand on 2026-08-10 for the tax record. See docs/PENDIENTES.md 14.6.',
  'en',
  '2026-08-05 13:29:00+10'
where not exists (
  select 1 from public.bookings
  where stripe_payment_intent_id = 'pi_3U0vVzPPGSm5cT7J0SRAoVUW'
)
returning id, status, client_name, client_email, service_name,
          service_price, callout_fee, scheduled_date, stripe_payment_intent_id;

-- ── 4. VERIFICATION ────────────────────────────────────────────────────────
-- Expect one row, status = cancelled, user_id and client_id NULL.

select id, user_id, client_id, status, client_name, client_email,
       service_name, service_price, callout_fee,
       scheduled_date, scheduled_time, address, created_at
from   public.bookings
where  stripe_payment_intent_id = 'pi_3U0vVzPPGSm5cT7J0SRAoVUW';

-- And confirm it did NOT touch the year's revenue. This is the same filter the
-- admin panel uses, so the count must be unchanged by the insert above.

select count(*) as completed_bookings_2026, coalesce(sum(service_price + coalesce(callout_fee, 0)), 0) as revenue_2026
from   public.bookings
where  status = 'completed'
  and  scheduled_date >= '2026-01-01';
