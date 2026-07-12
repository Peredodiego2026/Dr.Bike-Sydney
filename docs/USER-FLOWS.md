# Dr. Bike Sydney - User Flows (reference)

Source of truth for how each role moves through the product, so future work
(human or AI) extends the real flows instead of reinventing them. Verified
against the code on 13 Jul 2026. If code and this doc disagree, the code wins -
then fix this doc.

## Client - mobile SPA (index.html, the PRODUCTION booking flow)

1. **Open app** -> Home screen (hash router). Sees: greeting ("Hi, name" if
   signed in), Book a Service CTA, services carousel, rider-tier medal.
   Language persists via localStorage (EN/ES/ZH).
2. **Book a Service** -> Step 1: category chips + service cards (live prices
   from Supabase `services`). Optional AI diagnosis (photo/text -> suggested
   service). Booking-start timestamp recorded here (feeds "avg time to book"
   KPI).
3. **Step 2: date + time.** Calendar -> hourly slots 8am-5pm from
   `/api/auth?role=get-availability`. Slots are duration-aware: a booked job
   blocks its van for the service's `duration_max` + 30min buffer; a slot shows
   only if at least one van is free for the WHOLE new job. Fully-booked day ->
   waitlist form (emails when a slot frees up).
4. **Step 3: address.** Nominatim autocomplete. On Continue, a
   `check-coverage` pre-check rejects addresses outside `van_zones` before any
   payment. Server re-checks authoritatively at booking time.
5. **Quote.** Itemized: service fee + $20 callout fee (both +20% on Sundays &
   NSW public holidays, shown as an explicit line), inclusions list,
   promo/referral code field.
6. **Payment.** Stripe: Apple/Google Pay (Payment Request Button) or card.
   Only the callout fee is charged online; the service fee is paid to the
   mechanic on site (EFTPOS or cash). Server (`create-booking`) verifies the
   PaymentIntent amount/status against ITS own computed fee before inserting -
   client-side numbers are display-only.
7. **Confirmation.** Notifications fire: WhatsApp + SMS to Diego, email to
   client. Booking appears in My Bookings (Upcoming).
8. **Service day.** Tracking screen: live map (mechanic position every 15s),
   OSRM ETA, mechanic profile (photo/rating/jobs), arrival PIN, in-app chat.
   Mechanic chat messages trigger a push notification if the client enabled
   them in Profile.
9. **After.** My Bookings (History): detail sheet with before/after photos,
   review (stars + text + photo), Book Again. Client self-service cancel
   (>=24h notice -> automatic callout-fee refund; Diego gets a WhatsApp with
   the refund outcome either way) and reschedule (calendar sync updates).
10. **Warranty issue** -> /claims.html (3-day window): form with photos +
    invoice screenshot -> lands in Admin > Claims + email heads-up to Diego.

## Client - desktop (landing.html)

Marketing page + booking modal with the same steps (service -> date/time ->
address/quote -> confirm). NO Stripe charge: the booking is created and Diego
arranges payment manually. Same availability engine, coverage check, surcharge
display and server-side pricing.

## Mechanic (mechanic.html, PIN login)

1. **Login** with PIN -> day panel: assigned jobs list (status-colored cards).
2. **New job appears** (assigned by zone/van). Accept or reject.
   - Accept: atomic (first mechanic wins), generates the client's arrival PIN,
     stamps `mechanic_accepted_at` (feeds "response time" KPI), creates a
     Google Calendar event on Diego's calendar with the mechanic invited
     (native phone alarms/notifications). Business rule: accept no later than
     3 days before the service date.
3. **En route** -> status updates (client sees them live), GPS pushed to
   `mechanic_locations`. In-app chat with the client (with photos).
4. **On site** -> checklist, parts used (inventory deducts + low-stock alert),
   extra charges quoted and approved before work.
5. **Complete** -> before/after photos, client signature (mandatory), payment
   method: Card (EFTPOS) or Cash, next-service recommendation. Client gets a
   completion notification + review request.
6. **Cash jobs** accumulate until Diego marks them handed over (weekly) in
   Admin > Finance > Cash handover.

## Diego / Admin (admin.html, email+password + TOTP)

- **Dashboard**: today's revenue/jobs, pending bookings, schedule, live ops.
- **Bookings**: full list, filters, cancel (syncs calendar + records reason),
  reassign van.
- **Calendar**: month/week/day view of all bookings + manual slot blocking.
- **Analytics**: Target metrics scorecard (time-to-book <60s, mechanic
  response <5min, 6-month retention >40%), conversion funnel, heatmap,
  service popularity, margins, LTV/churn. CSV export.
- **Finance**: P&L per month/quarter/year, GST, transactions, Cash handover
  reconciliation per mechanic.
- **Claims**: warranty claims with evidence; status new/reviewing/resolved/
  rejected + resolution notes.
- **Vans & Mechanics / Zone Manager**: fleet, suburbs per van (drives both
  dispatch and the out-of-coverage rejection).
- **Escalation Contacts**: mechanics/managers with phone + email (email is
  what gets them invited to calendar events).
- **Services & Prices**: single catalog that drives the whole site.
- **Settings**: notification numbers, business details, Google Calendar
  connect, WhatsApp config.

## Automated (no human in the loop)

- Cron 9am: service reminders, birthdays, re-engagement, abandoned carts,
  upsells (send-cron.js).
- Cron 2h-before: booking reminder emails (send-reminders.js).
- Client cancel: waitlist notification + auto-refund (>=24h) + Diego WhatsApp.
- Stripe webhooks: subscription lifecycle -> profiles.membership_status.
