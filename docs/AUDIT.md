# Dr. Bike Sydney — AUDIT.md
*Last updated: 15 June 2026*

## STATUS SUMMARY

All Track A (Saneamiento) and Track B (Rediseño UI) sessions COMPLETE.
New feature sprint COMPLETE as of 15 June 2026.

---

## ✅ COMPLETED — Full Feature List

### Security & Infrastructure (A1–A6)
- [x] Eruda removed from production
- [x] XSS escaping in all email templates (esc() function)
- [x] Admin auth server-side
- [x] RLS enabled on bookings table
- [x] Dead code cleaned (mobile.html, mobile_v2/v3, .bak files)
- [x] Bug fixes: stripe-webhook, send-email referral, normalizeAUPhone
- [x] Frontend modularised: js/app.js, js/stripe.js, js/supabase.js, js/router.js, js/components.js, js/mechanic.js, css/variables.css, css/main.css
- [x] Service Worker + PWA manifest
- [x] Rate limiting via _security.js middleware
- [x] Apple Pay / Google Pay via Stripe Checkout (canMakePayment → null on Safari still pending Stripe Support)
- [x] Health check endpoint
- [x] 12 security fixes (origin checks, image validation, XSS)

### UI/UX Redesign (B1–B6)
- [x] Design system: css/variables.css with full token set
- [x] SPA shell: index.html with hash-based routing
- [x] Mobile-first SPA: home, service type, date/time, summary, payment, tracking, review, auth, my-bookings screens
- [x] PWA install prompt, offline screen
- [x] Unified branding, cross-links, consistent footer

### Email Marketing (D1–D4)
- [x] Welcome sequence email
- [x] Birthday promo (BDAY20 coupon)
- [x] Re-engagement campaign (BACK15 coupon)
- [x] Abandoned booking recovery
- [x] 2-hour reminder cron (api/send-2h-reminders.js)
- [x] Supabase columns: birthday, reengagement_sent_at, reminder_2h_sent

### Stripe & Payments
- [x] Memberships: Basic $57/mo, Standard $97/mo, VIP $147/mo
- [x] Annual toggle (20% off, 6 price IDs)
- [x] Billing Portal activated
- [x] Coupon validation at checkout (E1)
- [x] Surge pricing weekends/holidays +$15 (3.1)
- [x] Early bird discount 48h+ -$10 (3.2)

### SEO
- [x] 20 suburb pages cross-linked
- [x] Blog: 11 articles total (6 original + 5 new in June 2026)
- [x] sitemap.xml: all pages indexed
- [x] Schema.org LocalBusiness on suburb pages
- [x] Schema.org HowTo on /bike-check
- [x] Schema.org Article on all blog posts
- [x] GA4 complete audit + Meta Pixel (Pixel ID pending)

### Real-Time Features (C1–C4)
- [x] ETA dynamic — Haversine + Nominatim geocoding
- [x] Mechanic location tracking (realtime)
- [x] track.html: public booking tracking with shared link token
- [x] Client history modal in mechanic.html (2-tap access)

### Referral & Loyalty
- [x] Referral code in profile (unique per user)
- [x] Referral code input at service-summary
- [x] Referral credits tracked in profiles table

### Ops & Operations
- [x] Cancel booking flow + cancellation policy modal
- [x] Pricing by zone: Inner West/CBD base, outer +$20 (E2)
- [x] Auto-assign mechanic logic (6.3)
- [x] Waitlist + Coming Soon modal with email capture

### New Pages (June 2026 Sprint)
- [x] /bike-check.html — 5-step interactive safety tool, Schema HowTo, Green/Yellow/Red diagnosis
- [x] /business.html — B2B fleet services landing, enquiry form, auto-reply
- [x] /cycling-map.html — Leaflet interactive map, 10 Sydney routes
- [x] api/send-b2b-inquiry.js — B2B enquiry handler

### Mechanic App (June 2026 Sprint)
- [x] Pre-service checklist 14 items (task 4.1): brakes, chain, cassette, cables, wheels, etc. Saved as JSON to booking
- [x] Van inventory tracker (task 4.2): tab "📦 Stock" in mechanic.html, van_inventory table, quantity +/− controls, low-stock alerts
- [x] Service timer (task 4.3): start/complete buttons, tracks started_at/completed_at/service_duration_seconds
- [x] Admin KPI: avg service time by type (task 4.3)

### Email / Reminders
- [x] api/send-service-reminders.js — monthly cron for 6mo (Tune-Up) and 12mo (Major/Ultimate) next-service reminders
- [x] vercel.json: cron added for 1st of each month at 9am UTC

### Trust & Conversion
- [x] Trust badge bar in landing.html: 100% Satisfaction Guarantee · Verified Mechanic · Background Checked · Fully Insured (6.1+6.2)
- [x] Static Google Reviews widget in landing.html (3 reviews, 5 stars) (2.5)
- [x] Service duration estimates in app.js: Tune-Up 60min, Standard 90min, Major 150min, Ultimate 240min (6.4)

### Blog (June 2026 — 5 new articles)
- [x] best-bikes-for-sydney-commuting-2026.html
- [x] how-to-clean-your-bike-chain-sydney.html
- [x] cycling-safety-tips-sydney-roads.html
- [x] electric-bike-laws-nsw-2026.html
- [x] how-to-choose-a-bike-mechanic-sydney.html

### Email fix (8.3)
- [x] hello@drbikesydney.com.au → contact@drbikesydney.com.au in api/send-email.js and api/send-invoice.js

---

## 🔴 PENDING — Manual Steps Required

### Apple Pay (CRITICAL)
- canMakePayment() returns null on Safari iPhone despite Stripe domain showing "Enabled"
- **Next step:** Contact Stripe Support or hire Fiverr specialist
- Known issue: likely requires HTTPS + verified domain in Stripe dashboard merchant settings

### Database Migrations — Run in Supabase SQL Editor
1. `scripts/add-service-reminder-column.sql` — next_service_reminder_sent column
2. `scripts/add-service-timing-columns.sql` — started_at, completed_at, service_duration_seconds, pre_service_checklist, pre_service_notes
3. `scripts/create-van-inventory-table.sql` — van_inventory table + RLS + seed data

### Meta Pixel
- Pixel ID placeholder in landing.html needs real Meta Pixel ID from ads.facebook.com
- Replace: `fbq('init', 'YOUR_PIXEL_ID')` with actual ID

### Legal
- privacy.html and terms.html deferred until after August 2026
- IP Australia trademark registration (Class 37 "Dr. Bike") — pending lawyer review

### Newsletter (7.1)
- /newsletter signup endpoint and table not yet created
- Low priority — deferred to next sprint

### B2B Inquiry Alerts (5.1)
- api/send-b2b-inquiry.js depends on RESEND_API_KEY env var — verify in Vercel dashboard

### 1.2 PDF Service Report
- Requires a PDF generation library (puppeteer or @react-pdf/renderer)
- High token/complexity — recommended to implement via Claude Code separately

### 1.1 Mechanic Profile (avatar, bio, years_experience)
- SQL: ALTER TABLE profiles ADD COLUMN avatar_url TEXT, bio TEXT, years_experience INTEGER
- UI: mechanic profile photo in booking confirmation screen
- Moderate complexity — deferred

### 1.3 Bike History (my-bikes screen)
- SQL: bikes table (client_id, nickname, brand, model, color) + associate bookings.bike_id
- UI: data-screen="my-bikes" in index.html
- Moderate complexity — deferred

### 2.3 Share to Google/Facebook after review
- Deferred

### 2.4 Shareable tracking link
- token column + public URL logic — deferred

---

## Tech Debt & Known Issues

| ID | File | Issue | Priority |
|----|------|--------|----------|
| T01 | mechanic.html | goTab() patched via script injection — should be unified in mechanic.js | Low |
| T02 | admin.html | loadAvgServiceTime() not wired to page init — needs call in DOMContentLoaded | Low |
| T03 | All suburb pages | Trust badges not yet added | Low |
| T04 | index.html | getSurcharge + SERVICE_DURATION added to app.js but not yet wired to service-summary render UI | Medium |

---

## Business Metrics (confirmed)

| Metric | Value |
|--------|-------|
| Target annual revenue (Phase 2) | $433,658 |
| Net margin | 38.9% |
| Net profit | $168,763 |
| Avg ticket | $109 |
| Jobs/year | 5,070 |
| Break-even | 178 jobs/month |
| Launch date | Nov–Dec 2026 |
