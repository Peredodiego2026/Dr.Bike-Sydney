# SECURITY - Dr. Bike Sydney (blindaje)

Last full review: **2026-07-11**. Next scheduled: **2027-01-11** (recurring every 6 months, Google Calendar reminder).

## Current protections (verified live 2026-07-11)

- **Branch protection on `main`**: PR required + `quality-gate` CI check green + `enforce_admins`. Direct pushes rejected for everyone, including admin and any local bot using stored credentials.
- **Security headers on all prod pages** (verified with curl): CSP (default-src 'self', frame-ancestors 'none'), HSTS max-age=1y + includeSubDomains + preload, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy (camera/mic denied).
- **Payments**: Stripe webhook verifies signatures (`constructEvent` + `STRIPE_WEBHOOK_SECRET`). Prices come from Supabase `services` table, never trusted from the client.
- **Rate limiting + login lockout**: api/_security.js (5 fails / 15 min -> 429).
- **Mechanic auth**: PIN hashed (HMAC-SHA256 keyed on service key), stateless session tokens (60-day TTL), lockout table.
- **Admin**: server-side auth via /api/auth + email allowlist.
- **Supabase RLS**: enabled and hardened Jun 2026 (bookings, discount_codes, bike_service_history; mechanic flows routed through server endpoints with service key).
- **Secrets**: none in tracked files (verified by grep). `.env*` gitignored. Real values only in Vercel env vars.
- **Dependencies**: npm audit (prod) = 0 vulnerabilities as of 2026-07-11.
- **Monitoring**: e2e smoke tests against prod every 6h (restored to green 2026-07-11), Sentry on server endpoints.

## Accepted risks (deliberate - re-evaluate at each review)

- `mechanic_locations` RLS public read: live GPS while van is online, needed for client realtime map. Low severity.
- CSP still allows `'unsafe-inline'`: removal is a big refactor, deferred.
- 4d pending: raw PIN still sent in requests + stored in localStorage (needs Diego OK to remove plaintext fallback).
- admin.html legacy weak PIN path (S02 note in CLAUDE.md).

## Incident log

- **2026-07-11 (a)**: local AI agent (opencode CLI) pushed ~28 commits direct to main -> bad prod deploys + poisoned SW cache. Restored to 38620c6, SW bumped to v24. Countermeasure same day: branch protection with enforce_admins.
- **2026-07-11 (b)**: GitHub PAT found embedded in plaintext in the git remote URL (.git/config), and printed in a chat transcript. Removed from remote (auth now via Windows Credential Manager). **Token revocation pending (Diego, manual).**

## Semi-annual security review - the "blindaje" checklist

Run every 6 months (Google Calendar fires the reminder; tell Claude "hoy toca el blindaje semestral" and work through this together):

1. **Access inventory**: GitHub collaborators/tokens/OAuth apps, Vercel members/tokens, Supabase org members. Revoke anything unused or unrecognized. Confirm branch protection still active (`enforce_admins` on).
2. **Secrets**: grep repo + history for leaked keys; confirm `.env*` untracked; **rotate** Stripe/Supabase/Twilio/Resend/GitHub keys older than 12 months.
3. **Headers**: `curl -sI` on /, /admin.html, /mechanic.html - confirm CSP/HSTS/XFO/nosniff/Referrer/Permissions all present.
4. **Supabase**: confirm RLS ON for ALL tables - especially tables created since the last review. Re-evaluate each accepted risk above.
5. **Dependencies**: `npm audit` + `npm outdated`; apply security patches.
6. **Payments**: webhook signature check still on; live charge test end-to-end if not done in the last 6 months.
7. **Accounts**: 2FA still active on GitHub, Vercel, Supabase, email (recovery email first!), bank. Password manager in use, no reused passwords.
8. **Recovery drill**: identify last good commit + Vercel rollback path + SW version bump procedure in under 10 minutes (see restore-recover skill).
9. **Update this file**: date, findings, fixes applied; confirm next calendar reminder exists.
