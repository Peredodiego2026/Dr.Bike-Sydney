-- Fix: discount_codes full-table enumeration via anon key — 2026-07-19
--
-- PR #36 (harden-security-2026-07-17.sql) added a public SELECT policy on
-- discount_codes intending to let the browser validate ONE code the user
-- typed, while stopping "someone fetching the table with no filter at all".
-- That reasoning doesn't hold: RLS filters WHICH ROWS a policy allows, not
-- HOW the caller's query is shaped. A request with no .eq('code', ...)
-- filter still passes through the same policy and returns every row that
-- matches it - i.e. every active, non-GIFT code. Confirmed live: the public
-- anon key (embedded in landing.html/js/app.js/js/mechanic.js, so not a
-- secret) can list every code including one at 100% off, unlimited uses,
-- already redeemed twice.
--
-- Fix: stop allowing direct anon SELECT on discount_codes at all. Add a
-- SECURITY DEFINER function that checks exactly one code and returns only
-- that code's own discount info (or nothing) - never the table. All 3
-- client call sites (landing.html, js/app.js, js/mechanic.js) need to
-- switch from .from('discount_codes').select(...).eq('code', code) to
-- calling this RPC instead.
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run.

drop policy if exists discount_codes_select_public_active on public.discount_codes;

create or replace function public.validate_discount_code(p_code text)
returns table (
  discount_value integer, discount_type text, max_uses int, uses_count int,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select dc.discount_value, dc.discount_type, dc.max_uses, dc.uses_count, dc.expires_at
  from public.discount_codes dc
  where dc.code = p_code
    and dc.active = true
    and dc.code not like 'GIFT-%';
end;
$$;

revoke execute on function public.validate_discount_code(text) from public;
grant execute on function public.validate_discount_code(text) to anon, authenticated;

-- Verify: as the anon key, this must return 0 rows (no filter = no match,
-- table itself is no longer directly readable) ...
select * from public.discount_codes;
-- ... while this still returns exactly the one matching code, same as before:
-- select * from validate_discount_code('WELCOME10');
