-- Migration: real expenses, so the P&L stops inventing them
-- Run in Supabase SQL editor. Idempotent - safe to re-run.
--
-- WHY: until 2026-08-11 the P&L Summary in the admin panel subtracted six
-- constants written by hand in js/admin.js (fleet 960, insurance 360, marketing
-- 400, software 120, other 360, payroll 0). Nobody ever entered them, they had
-- never changed, and they did not correspond to a single dollar Diego had
-- spent. The screen was not calculating anything - it was subtracting 2200.
--
-- `category` is a plain text column on purpose, not an enum: the P&L groups by
-- it, and adding a seventh bucket must not need a migration. The app writes the
-- seven below; anything else falls into "other" on screen.
--   payroll · fleet · insurance · marketing · software · parts · other
--
-- `recurring_monthly` is the difference between "the Claude subscription, every
-- month from here on" and "the van, once, in the month it was bought". A
-- recurring row counts once per calendar month from `spent_on` onward; a
-- one-off counts only in its own month.

CREATE TABLE IF NOT EXISTS public.expenses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spent_on          DATE NOT NULL,
  description       TEXT NOT NULL,
  amount            NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  category          TEXT NOT NULL DEFAULT 'other',
  recurring_monthly BOOLEAN NOT NULL DEFAULT FALSE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The P&L asks "everything in this date range" and "every recurring row that
-- had started by the end of it". Both are served by spent_on.
CREATE INDEX IF NOT EXISTS idx_expenses_spent_on ON public.expenses(spent_on);
CREATE INDEX IF NOT EXISTS idx_expenses_recurring ON public.expenses(recurring_monthly, spent_on);

-- Staff-only data. No client of this app ever reads it, so RLS is on with NO
-- permissive policy: the anon and authenticated keys get nothing. The admin
-- panel reaches it through /api/auth with the service role, which bypasses RLS
-- the same way the checkout_attempts and claims screens already do.
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE  public.expenses IS 'What the business actually spent. Feeds the P&L Summary on the admin Finance screen.';
COMMENT ON COLUMN public.expenses.spent_on IS 'Date of the expense. For a recurring one, the date it STARTS.';
COMMENT ON COLUMN public.expenses.recurring_monthly IS 'true = counts every month from spent_on onward. false = counts once, in its own month.';
COMMENT ON COLUMN public.expenses.category IS 'payroll | fleet | insurance | marketing | software | parts | other';

-- ── VERIFICATION ───────────────────────────────────────────────────────────
-- Expect one row: the table, with rowsecurity = true.
SELECT tablename, rowsecurity
FROM   pg_tables
WHERE  schemaname = 'public' AND tablename = 'expenses';
