-- Migration: newsletter subscribers table (task 7.1)
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  source TEXT DEFAULT 'website',     -- 'website', 'booking', 'popup', 'b2b'
  name TEXT,
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ DEFAULT NULL,
  tags TEXT[] DEFAULT '{}',          -- e.g. {'commuter', 'mtb', 'business'}
  active BOOLEAN DEFAULT TRUE
);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Service role only (no public writes without API endpoint)
CREATE POLICY "service_role_all" ON newsletter_subscribers
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_active ON newsletter_subscribers(active) WHERE active = TRUE;

COMMENT ON TABLE newsletter_subscribers IS 'Newsletter email list — do not expose directly; use API endpoint';
