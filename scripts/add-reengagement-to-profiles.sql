-- Migration: add reengagement tracking to profiles
-- Run in Supabase SQL Editor
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reengagement_sent_at TIMESTAMPTZ;
COMMENT ON COLUMN profiles.reengagement_sent_at IS 'Last time a re-engagement email was sent. Used to avoid sending more than once per year.';
