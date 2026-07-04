# Dr. Bike Sydney — Tasks (gap-closing roadmap)

> Ordered to close the gap between today and the 2-year / 500+ client vision.
> Priority: P0 = will break or lose money at scale, fix first. P1 = high. P2 = medium. P3 = nice-to-have.
> Each task is atomic with a verification step.

## Phase 0 — Spec verification (do first)
- [ ] **TASK-001** [NFR-002] Confirm RLS policies on bookings, profiles, bikes, escalation_contacts in Supabase. _Verify:_ run `select tablename,policyname,cmd from pg_policies;` and paste results. Confirm a logged-out and a different-user client cannot read/insert others' rows.
- [ ] **TASK-002** [REQ-001] Confirm whether `bookings.bike_id` column exists. _Verify:_ `select column_name from information_schema.columns where table_name='bookings';`
- [ ] **TASK-003** [NFR-006] Confirm Supabase automated backups are on and do one test restore. _Verify:_ restore latest backup to a scratch project, confirm row counts.

## Phase 1 — Money & data integrity (P0, target 30 days)
- [x] **TASK-010** [REQ-004] Unique partial index `bookings_unique_slot` on (van_number, scheduled_date, scheduled_time) WHERE status<>'cancelled' applied 2026-06-29. App (mobile `createBooking` + desktop `bkProceed`) now shows "slot just booked" on 23505. _Note:_ desktop bookings have NULL van_number → not yet covered; fix in TASK-011.
- [x] **TASK-011** [REQ-001, REQ-044] DONE 2026-06-29 (deployed). `role=create-booking` in `/api/auth` looks up price from `services`, sets callout from `callout_zones`, inserts with service key, van_number=1 (covers desktop in the slot index). Mobile (`finalizeBooking` + post-checkout handler) and desktop (`bkProceed`) now call it. Admin (peredo.dm@gmail.com) bypasses payment.
- [x] **TASK-012** [REQ-005] DONE 2026-06-29 (deployed). `create-booking` verifies the Stripe payment synchronously (status succeeded + amount == call-out + single-use) BEFORE inserting; refunds automatically if the slot was taken after payment. Active once online checkout is enabled (today non-admin sees "payments coming soon").
- [x] **TASK-013** [REQ-043] DONE in code 2026-06-29 (deployed). Webhook now processes BEFORE responding (500 on failure → Stripe retries) and skips duplicate event ids. **Needs `scripts/add-stripe-events.sql` run in Supabase to activate idempotency.**
- [~] **TASK-014** [NFR-002] SQL ready (`scripts/harden-bookings-rls.sql`). **Apply AFTER confirming admin bookings work** (it removes client INSERT so only the server can create bookings). Run in Supabase SQL Editor.

## Phase 2 — Security & access (P0/P1, 30-60 days)
- [x] **TASK-020** [REQ-024] DONE 2026-06-29 (deployed+verified). `pin_hash` (HMAC-SHA256 keyed on SERVICE_KEY) on escalation_contacts, lazy-migrated on first login. Lockout 5 fails / 15 min per IP via `login_attempts` table (DB-backed, cross-instance). Verified: burst from one IP → 429.
- [x] **TASK-021** [REQ-024] DONE 2026-06-29 (deployed+verified). Login issues a 60-day HMAC session token; shared `authMechanic()` accepts token-or-PIN (dual-accept) across all 10 mechanic/client-history endpoints. Client sends token+PIN during transition. _4d pending (Diego OK):_ drop plaintext PIN from transit, storage, and the `pin` column.
- [x] **TASK-022** [REQ-032] DONE 2026-06-29. Admin uses anon key + admin JWT; authz is RLS (`profiles.role='admin'`). Phase 1 leaks closed: `bookings` (any logged-in user read/update all), `discount_codes` (public write → admin-only, public read kept), `bike_service_history` (public → admin-only). Phase 2 (server-routed mechanic, no JWT): `escalation_contacts` admin-only (dead client reader removed); `parts_inventory` via new `mechanic-parts`/`mechanic-parts-update` endpoints, admin-only RLS; `job_messages` via new `mechanic-messages`/`mechanic-message-send` endpoints + 4s polling (replaced realtime), RLS = owner read + client send own booking + admin all; mechanic via service key. Admin chat is READ-ONLY by design (Diego's choice; `sender_role` check constraint only allows client/mechanic anyway). **Accepted/not closed:** `mechanic_locations` public read (live GPS) — needed for client realtime map, low severity, left open intentionally.
- [~] **TASK-023** [NFR-005] PARTIAL 2026-06-29. CSP already strong (default-src 'self', object-src 'none', base-uri 'self', form-action 'self', no unsafe-eval, scoped connect/img/frame); added `frame-ancestors 'none'`. **Removing `'unsafe-inline'` from script-src DEFERRED:** entire app relies on inline onclick handlers + inline `<script>` blocks (all 4 pages, incl. new parts/chat code); nonces/hashes don't cover inline event handlers → requires converting every handler to addEventListener + externalizing scripts (large, risky refactor on a live money app). Do incrementally per page later.

## Phase 3 — Scale & performance (P1, 60-120 days)
- [ ] **TASK-030** [NFR-001] Add pagination + date filters to admin bookings, mechanic jobs, client bookings (limit + range). _Verify:_ with 5,000 seeded bookings, each list loads < 500ms p95.
- [ ] **TASK-031** [NFR-001] Add DB indexes for hot queries: bookings(scheduled_date), bookings(client_id), bookings(status), bookings(mechanic_id), mechanic_locations(van_number). _Verify:_ `explain analyze` shows index scans, not seq scans.
- [ ] **TASK-032** [REQ-021] Make job accept atomic to avoid two mechanics taking one job: conditional update `set mechanic_id where mechanic_id is null`. _Verify:_ two concurrent accepts → only one succeeds.

## Phase 4 — Reliability & observability (P1/P2, 90-180 days)
- [x] **TASK-040** [NFR-003] DONE 2026-06-29. Client Sentry already on all 4 pages. Server: `api/_sentry.js` DSN defaults to public project DSN (no env needed); `withSentry()` wraps auth/chat/stripe-webhook/create-payment-session → uncaught errors reported (endpoint tag + PII redaction).
- [x] **TASK-041** [REQ-052] DONE 2026-06-29 (SMS+WhatsApp). `send-message.js`: `sendWithRetry` (3 attempts, linear backoff) + `logNotification` → `notification_log` table (channel/recipient/type/status/attempts/error/booking_id). Email (send-email.js) uses same pattern — TODO if wanted.
- [x] **TASK-042** [NFR-004] DONE 2026-06-29. `scripts/check.mjs` node --checks all api/js JS + middleware; `npm run predeploy` = check + vitest; `npm run deploy` runs the gate then `npx vercel --prod --yes`. Verified: broken file → exit 1, blocks deploy.
- [ ] **TASK-043** [NFR-001] Load test the booking + availability + GPS paths at ~500 concurrent. _Verify:_ no 5xx, p95 within targets.

## Phase 5 — Product depth for the 2-year vision (P2/P3)
- [x] **TASK-050** [REQ-001] DONE 2026-06-29 (client). SPA My Bikes → tap a bike → "Service history" lists that bike's bookings (by `bike_id`, owner RLS). Mechanic already sees per-client history via `client-history` endpoint.
- [x] **TASK-051** DONE 2026-06-29. `create-booking` now assigns `van_number` by matching the address suburb against `van_zones` (default van 1) instead of hardcoded 1. Per-van slot unique index still prevents same-van double-booking.
- [x] **TASK-052** DONE 2026-06-29 (fleet capacity). `get-availability` marks a slot full only when bookings ≥ number of vans in `van_zones` (was ≥1 = single-van assumption). Buffer/travel-time between jobs deferred (needs geo routing).
- [~] **TASK-053** Dedupe redundant `bookings` columns. DONE 2026-07-04: dropped `review_text`, `photo_before`, `before_photo_url`, `client_signature` (confirmed 0 rows via SELECT count, then DROP COLUMN IF EXISTS). `original_price` has 15 non-null rows (historical data) — kept, not dropped. Keep: photo_before_url/photo_after_url, client_signature_url, client_review/review_comment, service_price, original_price. `rating` vs `client_rating` both used → still needs Diego to pick authoritative before any further consolidation.
