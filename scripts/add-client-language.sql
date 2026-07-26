-- Stores which language a client reads the app in, so the emails and SMS we send
-- them are not always English. The app is available in en / es / zh but nothing
-- persisted the choice, and the crons (reminders, birthday, re-engagement) run
-- server-side with no browser to ask.
--
-- Two columns on purpose:
--   profiles.preferred_lang - the account-level choice, kept in sync whenever a
--                             signed-in client switches language.
--   bookings.client_lang    - denormalised per booking, because guest bookings
--                             have no profile row and the notification code only
--                             ever has a booking id in hand.
-- Both default to 'en', so every existing row keeps today's behaviour.
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run. Safe to re-run.

alter table public.profiles add column if not exists preferred_lang text default 'en';
alter table public.bookings add column if not exists client_lang text default 'en';

-- Only the three languages the app actually ships, so a bad value can never make
-- the email templates fall back to something that does not exist.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_preferred_lang_check') then
    alter table public.profiles
      add constraint profiles_preferred_lang_check
      check (preferred_lang is null or preferred_lang in ('en', 'es', 'zh'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'bookings_client_lang_check') then
    alter table public.bookings
      add constraint bookings_client_lang_check
      check (client_lang is null or client_lang in ('en', 'es', 'zh'));
  end if;
end $$;
