-- Migration: add birthday to profiles
-- Run this in Supabase SQL Editor
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birthday DATE;
COMMENT ON COLUMN profiles.birthday IS 'Client birthday (YYYY-MM-DD). Used for annual birthday promo email.';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birthday_promo_sent_year INT;
