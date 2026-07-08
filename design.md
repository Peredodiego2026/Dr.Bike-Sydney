# Dr. Bike Sydney — Design (v0-retrofit)

> Architecture as built, reverse-engineered 2026-06-29. `[TO VERIFY]` = confirm in Supabase/Stripe.

## System overview
Vanilla multi-page PWA on Vercel. Supabase (Postgres + Auth + Storage + Realtime) is the
backend; serverless functions in `/api` hold all privileged logic using the Supabase
**service role key** (bypasses RLS). The browser uses the Supabase **anon key** (RLS-gated).

```
Browser (anon key, RLS)            Vercel Functions (service key)        External
  index.html  (mobile SPA)  ──┐      /api/auth.js  (admin+mechanic+      Supabase (DB/Auth/
  landing.html (desktop)      ├──▶     client + availability + track)     Storage/Realtime)
  mechanic.html / admin.html  │       /api/create-payment-session.js ──▶ Stripe (LIVE)
  track.html                  │       /api/stripe-webhook.js          ──▶ Resend (email)
  28 SEO/blog pages           ┘       /api/send-message / send-email   ──▶ Twilio (SMS/WA)
                                       /api/send-cron (crons)
middleware.js routes /: mobile→index.html, desktop→landing.html
```

## Components
- `index.html` + `js/app.js` (~1740 lines) — mobile SPA, hash router. Booking flow, my bikes, tracking, reviews.
- `landing.html` (~2600 lines) — desktop marketing + booking modal + account.
- `mechanic.html` + `js/mechanic.js` — PIN login, jobs, GPS, complete-with-signature.
- `admin.html` + `js/admin.js` — dashboard, email+password+TOTP login.
- `track.html` — public tracking via token.
- `js/supabase.js` — anon client + helpers. **`createBooking()` inserts to `bookings` directly from the browser.**
- `api/auth.js` — multiplexed endpoint (role switch): admin/mechanic/client/public/availability.
- `api/_security.js` — guard (CORS + method + rate limit via Upstash Redis or in-memory), sanitize, phone/email validators.
- `api/create-payment-session.js` — Stripe Checkout + PaymentIntent + subscriptions + gift cards.
- `api/stripe-webhook.js` — subscription/invoice/gift-card sync to `profiles`.

## Data model (from code; types `[TO VERIFY]` in Supabase)
- **bookings**: id, user_id/client_id, client_name/email/phone, service_name, service_price, callout_fee, scheduled_date (date), scheduled_time (text "HH:MM" or "H:MM AM"), address, suburb, status (pending/confirmed/enroute/in_progress/arrived/completed/cancelled), van_number, mechanic_id, stripe_payment_intent_id, bike_id, discount_applied, discount_code, tracking_token, client_rating/review/photo_url, mechanic_notes, parts_used, photo_before/after_url, client_signature_url, started_at/arrived_at/completed_at, next_service_date, pre_service_checklist. (REQ-001..005, 011..014, 060)
- **profiles**: id, email, full_name, stripe_customer_id, stripe_subscription_id, membership_plan/status/billing, membership_started/renewed_at, referral_code/count/credits, referred_by. (REQ-010, 016, 040)
- **escalation_contacts**: id, name, phone, pin (plaintext), role. Also van_number=0 row holds the admin WhatsApp number (hack). (REQ-020, 050)
- **mechanic_locations**: van_number (upsert key), mechanic_id, lat, lng, is_online, updated_at. (REQ-023, 060)
- **discount_codes**: code, discount_amount, discount_type, max_uses, uses_count, active. (REQ-042)
- **gift_cards**: code, amount, purchaser/recipient_email, status, stripe_session_id `[TO VERIFY]` table exists. (REQ-041)
- **availability**: date, time_slot, available. **waitlist**: client, preferred_date, preferred_times[], status. **bikes**: client_id, name, brand, model, color, year, type. Others: services, callout_zones, job_messages, notifications, parts_inventory.

## Key endpoints (role on `/api/auth`)
- `get-availability` (GET) → slots (REQ-002). admin (email/pw → TOTP) (REQ-030). mechanic (PIN) (REQ-020). mechanic-jobs/-accept/-reject/-arrived/-checklist/-complete/-update-status/-location (REQ-021..023). client-bookings/-cancel/-reschedule/-history/-review (REQ-011..014). public-track/-booking-list, mechanic-profile, consume-code, join-waitlist, apply-referral.
- `create-payment-session` types: intent (REQ-003), default checkout, gift-card (REQ-041), pause/resume/cancel-subscription (REQ-040), verify.
- `stripe-webhook` (REQ-040, 043).

## Known design weaknesses (drive the gaps in requirements.md)
1. **Client-trusted writes**: `createBooking()` inserts bookings (incl. price) from the browser. Mitigation needed: server-authoritative booking creation + price (REQ-044) and verified RLS INSERT policy (NFR-002).
2. **No atomic slot locking**: availability is read-time only → race to double-book (REQ-004). Needs a unique index on (scheduled_date, scheduled_time) for active statuses, or a transactional insert.
3. **Payment not reconciled server-side** for one-time fees: webhook ignores one-time payments; booking trusts client (REQ-005).
4. **Webhook responds 200 before DB write** → lost updates on failure; no idempotency table (REQ-043).
5. **Mechanic PIN** plaintext, string-compared, reused in every request (REQ-024).
6. **Unbounded lists / no pagination** in admin/mechanic/client views → slow at scale (NFR-001).
7. **Fire-and-forget notifications**, no retry/queue, no dead-letter (REQ-052).
8. **No alerting / structured logging** (NFR-003); **manual deploy, no CI/tests** (NFR-004).

## Open questions (confirm with Diego / Supabase dashboard)
- RLS policies on every table (esp. bookings INSERT/UPDATE, profiles, bikes) — exact rules?
- Are Supabase automated backups enabled + tested? Plan tier (connection/compute limits)?
- Is `bike_id` column actually present on `bookings`? (code now writes it; CLAUDE.md says missing)
- Desktop landing booking has no Stripe charge (manual) — keep, or unify with mobile paid flow?
- Target ops model at 500 clients: how many vans/mechanics, bookings/day, suburbs covered?
