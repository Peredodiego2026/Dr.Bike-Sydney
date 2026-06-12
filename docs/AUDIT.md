# Audit Report - Dr. Bike Sydney
Date: 30 May 2026
Scope: full repo audit before next development sessions.

## App surfaces (12 HTML files in repo root)

| File | Size | Purpose | Status |
|---|---|---|---|
| index.html | 257k | Client web (PRODUCTION drbikesydney.com.au) | Active, most complete |
| mobile_latest.html | 123k | Client mobile PWA, dark theme | Active, behind index |
| admin.html | 209k | Manager/admin dashboard | Active |
| mechanic.html | 64k | Mechanic app (PIN 3250) | Active |
| landing.html | 104k | Public marketing landing | Active |
| track.html | 8k | Public booking tracking | Active |
| notifications.html | 49k | Notifications standalone | Active |
| payments.html | 39k | Payments standalone | Active |
| mobile.html | 28k | Old mobile version | DELETE |
| mobile_v2.html | 90k | Mobile v2 superseded | DELETE |
| mobile_v3.html | 90k | Mobile v3 same as v2 | DELETE |
| index-redesign.html | 258k | Alternative index | DELETE |
| admin.html.bak | 104k | Backup file | DELETE |
| applepay-test.html | 8k | Leftover diagnostic | DELETE |
| applepay.html | 8k | Leftover diagnostic | DELETE |

## Feature parity matrix

```
FEATURE                        | IND | MOB | ADM | MEC | LAN
Login Google OAuth             |  X  |  X  |  X  |  X  |  X
Cancel booking + politica      |  X  |  X  |  .  |  .  |  .
Bike profiles                  |  X  |  X  |  .  |  .  |  .
Apple/Google Pay button code   |  X  |  .  |  .  |  .  |  .
Stripe checkout                |  X  |  .  |  .  |  .  |  .
Booking calendar               |  X  |  .  |  .  |  .  |  .
AI bike diagnosis              |  X  |  .  |  .  |  .  |  .
Real-time chat                 |  X  |  X  |  X  |  X  |  .
Mecanico GPS live              |  .  |  .  |  .  |  X  |  .
Reviews/stars                  |  X  |  X  |  .  |  X  |  X
```

## Issues found

| # | Severity | File | Issue |
|---|---|---|---|
| 1 | HIGH | mobile_latest.html | Eruda debug console active in production |
| 2 | HIGH | index.html | bookings.bike_id never set on INSERT, blocks service history per bike |
| 3 | MEDIUM | 5 apps | console.log statements left in production |
| 4 | UNKNOWN | index.html | Apple Pay code present, .well-known/ file present, vercel headers correct, but canMakePayment() returns null in Safari. Needs Stripe Support to verify Apple-side state. |
| 5 | LOW | repo root | 7 dead/duplicate files (see DELETE list above) |

## Backend state (DO NOT TOUCH)

- 12 Supabase tables active
- 13 API endpoints (/api/) with security middleware
- Stripe LIVE keys configured
- Resend email verified (noreply@drbikesydney.com.au)
- Google OAuth configured for drbikesydney.com.au
- Vercel cron: /api/send-2h-reminders every 15min
- vercel.json security headers correct including Permissions-Policy payment=*
- /.well-known/apple-developer-merchantid-domain-association exists (9094 bytes)

## Database schema gaps

| Table | Missing | Impact |
|---|---|---|
| bookings | bike_id column | Cannot link bookings to specific bike. Blocks service history per bike feature. |

Fix SQL (run once in Supabase SQL editor):
```sql
alter table bookings add column if not exists bike_id uuid references bikes(id);
notify pgrst, 'reload schema';
```

## Pending features (ordered by recommended sessions)

### Session A: Technical cleanup (1-2h, low risk)
1. Delete 7 dead files from repo
2. Remove Eruda from mobile_latest.html
3. Remove console.log statements from 5 apps
4. Verify JS syntax stays valid after each change
5. Separate commits for safe revert

### Session B: Service history per bike (2-3h, the #1 differentiator)
1. DB migration: add bookings.bike_id (SQL above)
2. UI in index.html: "select bike" step in booking flow
3. UI in mobile_latest.html: same step
4. UI in mechanic.html: show bike + add service notes
5. UI in client profile: "Service history" view per bike

### Session C: Apple Pay verification (30min, decision point)
1. Contact Stripe Support via dashboard chat
2. Ask them to verify real Apple-side domain status
3. If they confirm it works: test in production
4. If not: hire Fiverr Stripe specialist

### Session D: Light theme for mobile app (2h)
- Trigger phrase to start: "Hey, pasemos la app movil a tema claro"
- Convert dark :root tokens to light, screen by screen review
- Remove Eruda + console.logs same time

### Session E: Real-time mechanic map (2h)
- Currently static "3.2 km away"
- Use mechanic_locations table + Supabase Realtime

### Session F (deferred to after August 2026): Legal
- Lawyer review of Privacy + Terms
- Link in app footers
- Cookie notice
- Trademark registration with lawyer

## Working style rules (from CLAUDE.md)

- One task per session, no mixing.
- When context fills (~100k tokens), close chat and open new one.
- Read CLAUDE.md before each new session for project context.
- Diego prefers chat-based Claude over Claude Code unless explicitly directed.
