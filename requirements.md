# Dr. Bike Sydney — Requirements (v0-retrofit)

> Reverse-engineered from the live codebase on 2026-06-29. Statements describe what the
> system does **today** unless marked `[GAP]` (missing / needed for the 2-year, 500+ client
> vision) or `[TO VERIFY]` (could not be confirmed from code alone — confirm in Supabase/Stripe).

## Vision context (assumptions — confirm)
- Horizon: 2 years. Expected scale: 500+ active clients within 8 months.
- Solo non-technical founder (Diego). Solutions must be maintainable without a dev team.
- Live production with real money (Stripe LIVE). Failures cost money or customers.
- Multi-van, multi-mechanic operation across Sydney suburbs.

---

## Actors
- **Client** — books and pays for mobile bike service, tracks mechanic, manages bikes/membership.
- **Mechanic** — PIN login, sees jobs, accepts, navigates (GPS), completes with signature.
- **Admin (Diego)** — dashboard for bookings, availability, mechanics, settings; 2FA login.
- **System** — notifications, payments, crons (reminders, re-engagement).

## Functional requirements (current behaviour)

### Booking
- REQ-001: A client shall book a service by choosing service, date, time, and address. _Accept:_ booking row created in `bookings` with status `pending`.
- REQ-002: The system shall show only available time slots for a date. _Accept:_ `/api/auth?role=get-availability` returns slots; a slot with ≥1 active booking is `available:false`.
- REQ-003: The mobile client shall pay the $20 call-out fee via Stripe before the booking completes. _Accept:_ a Stripe PaymentIntent is created and its id stored on the booking.
- REQ-004 `[GAP]`: The system shall guarantee a time slot cannot be double-booked under concurrent requests. _Accept:_ DB rejects a second booking for the same date+time. **Not enforced today** (availability is checked only at read time; insert is client-side with no constraint).
- REQ-005 `[GAP]`: The server shall confirm payment succeeded before a paid booking is treated as valid. _Accept:_ booking marked paid only after Stripe confirms. **Not enforced** (booking is inserted client-side; one-time payment webhook does nothing).

### Client account
- REQ-010: A client shall sign up / sign in (email+password or Google OAuth via Supabase Auth).
- REQ-011: A client shall view their bookings (`role=client-bookings`, token verified server-side).
- REQ-012: A client shall cancel or reschedule a pending/confirmed booking.
- REQ-013: A client shall add/list their bikes (`bikes` table keyed on `client_id`).
- REQ-014: A client shall review a completed booking (1-5 + optional photo), once per booking.
- REQ-015: A client shall join a waitlist for a full slot and be emailed when one frees up.
- REQ-016: A client shall apply a referral code for account credit.

### Mechanic
- REQ-020: A mechanic shall log in with a numeric PIN (4-6 digits) matched against `escalation_contacts.pin`.
- REQ-021: A mechanic shall see jobs, accept/reject, mark arrived/en-route, and complete.
- REQ-022: A mechanic shall complete a job only with a client signature (enforced 2026-06-29).
- REQ-023: A mechanic's location shall be sent to the server every 5-15s while active (GPS), keyed on `van_number`.
- REQ-024 `[GAP]`: PIN auth shall resist brute force and not store secrets in plain text. _Accept:_ PINs hashed, lockout after N tries. **Today PINs are plaintext, compared by string, rate-limited 30/min only.**

### Admin
- REQ-030: An admin shall sign in with email+password + TOTP 2FA (Supabase MFA).
- REQ-031: An admin shall view/manage bookings, availability, mechanics, settings.
- REQ-032 `[TO VERIFY]`: Admin dashboard reads/writes shall be authorized server-side, not only by client session.

### Payments & money
- REQ-040: The system shall sell memberships (Basic/Standard/VIP) via Stripe subscriptions; webhook syncs status to `profiles`.
- REQ-041: The system shall sell gift cards that become single-use discount codes.
- REQ-042: The system shall apply single-use discount/gift codes and consume them server-side.
- REQ-043 `[GAP]`: Stripe webhook processing shall be idempotent and not lose events on DB failure. _Accept:_ duplicate events are no-ops; failed DB writes retry. **Today the handler returns 200 before processing, so a DB failure silently drops the update.**
- REQ-044 `[GAP]`: Service price charged shall be authoritative server-side, not set by the client. **Today `service_price`/`callout_fee` are sent from the browser.**

### Notifications
- REQ-050: On a mobile booking, the system shall notify admin (WhatsApp), mechanic (SMS), client (email).
- REQ-051: Crons shall send reminders, birthday, re-engagement, abandoned-cart, upsell, service-due messages.
- REQ-052 `[GAP]`: Notification sends shall be retried/queued and failures recorded. **Today they are fire-and-forget.**

### Tracking
- REQ-060: A public tracking page shall show booking status and live mechanic location via a shareable token.

## Non-functional requirements
- NFR-001 `[GAP]`: Booking list/admin queries shall stay < 500ms p95 at 500+ clients (needs pagination + indexes; several lists currently fetch all rows).
- NFR-002 `[GAP]`: All tables shall have RLS policies verified `[TO VERIFY]` (bookings RLS enabled per CLAUDE.md; others unconfirmed).
- NFR-003 `[GAP]`: Production errors shall raise an alert to Diego (today: only console logs in Vercel).
- NFR-004 `[GAP]`: A deploy shall be gated by automated checks (today: manual `vercel --prod`, no CI, no tests run on deploy).
- NFR-005: All API responses shall set no-store cache + security headers (CSP, HSTS, etc.) — **met** (vercel.json).
- NFR-006 `[GAP]`: The database shall have verified automated backups + a restore drill `[TO VERIFY]`.

## Out of scope (current version)
- Native mobile apps (PWA only).
- In-app mechanic-to-mechanic chat / dispatch optimization engine.
- Multi-city beyond Sydney.
- Automated mechanic payroll/commission.
