-- Backfill referral_code for existing profiles that never got one.
-- Root cause: renderProfile() in js/app.js called .catch() on a Supabase
-- query builder that has no such method, so the write always threw and was
-- silently swallowed by the surrounding try/catch. profiles.referral_code
-- has been NULL for every real user since the referral feature shipped -
-- friends trying to redeem any client's code always got "Invalid referral
-- code". Fixed going forward in the same commit as this script.
--
-- Uses the exact same generation formula as the client
-- ('DBK' + first 5 hex chars of the user's UUID, uppercased) so a client's
-- displayed code (computed client-side, independent of the DB) matches
-- what gets saved here - nobody's code changes from what they may have
-- already shared.
--
-- Collision note: 5 hex chars = 16^5 (~1M) possible codes. Negligible risk
-- at current user counts; revisit if the referral_code column ever needs a
-- UNIQUE constraint at meaningfully larger scale.

UPDATE public.profiles
SET referral_code = 'DBK' || UPPER(SUBSTRING(id::text, 1, 5))
WHERE referral_code IS NULL;

-- Verify: should return 0 rows.
SELECT id, email, referral_code FROM public.profiles WHERE referral_code IS NULL;
