# Dr. Bike Sydney — AUDIT.md
*Last updated: 15 June 2026 — Sprint 2 complete*

## STATUS SUMMARY

All tasks complete. Only Apple Pay (needs Stripe Support), DB migrations (manual SQL), Meta Pixel ID (manual), and PDF report (Claude Code) remain.

---

## ✅ COMPLETED — Full Feature List (both sprints)

### Infrastructure & Security
- [x] XSS escaping, origin checks, rate limiting, RLS, image validation
- [x] Eruda removed, dead code cleaned
- [x] Service Worker + PWA manifest
- [x] 12 security fixes
- [x] hello@ → contact@drbikesydney.com.au everywhere

### UI & App Screens
- [x] SPA index.html: home, book, summary, payment, tracking, review, login, my-bookings, profile
- [x] data-screen="my-bikes" wired + renderMyBikes() (add/delete bikes, bikes table)
- [x] Trust badges on all 20 suburb pages (T03)
- [x] Surge pricing + early bird shown in service-summary UI (T04)
- [x] Service duration estimate in service-summary (Tune-Up 60min, etc.)

### Payments & Pricing
- [x] Stripe memberships Basic/Standard/VIP, annual toggle
- [x] Surge pricing +$15 weekends/holidays, early bird -$10 (3.1+3.2)
- [x] Coupon validation, referral credits

### Email / Notifications
- [x] Welcome, birthday, re-engagement, abandoned booking, 2h reminder
- [x] Monthly service reminders cron (Tune-Up 6mo, Major/Ultimate 12mo) (4.4)
- [x] B2B enquiry + auto-reply (5.1)
- [x] Newsletter subscribe + welcome email with WELCOME10 code (7.1)
- [x] Upsell email on critical pre-service checklist items (1.5)

### Mechanic App
- [x] Pre-service checklist 14 items, saved as JSON (4.1)
- [x] Van inventory tab: load from van_inventory, +/− quantity, low-stock alerts (4.2)
- [x] Service timer: started_at / completed_at / service_duration_seconds (4.3)
- [x] Upsell auto-email on critical items, wired to api/send-upsell.js (1.5)

### Admin
- [x] Avg service time KPI card, loadAvgServiceTime() wired to DOMContentLoaded (T02+4.3)

### Client App Screens
- [x] My Bikes screen (1.3): add bike, delete, list, type selector, linked to bikes table
- [x] Mechanic profile in tracking (1.1): avatar, bio, years_experience from profiles table
- [x] Share tracking link (2.4): ?token=UUID in track.html, share button with Web Share API
- [x] Social share after 5-star review (2.3): Google Review + Facebook share screen
- [x] Shareable tracking token in renderTracking (2.4): shareTrackingLink()

### New Pages
- [x] /bike-check.html — 5-step safety tool + newsletter widget
- [x] /business.html — B2B fleet services, enquiry form, auto-reply
- [x] /cycling-map.html — Leaflet, 10 Sydney routes, sidebar cards
- [x] Trust badge bar in landing.html (6.1+6.2)
- [x] Static Google Reviews widget in landing.html (2.5)
- [x] Newsletter signup section in landing.html (7.1)

### Blog (11 articles total)
- [x] 5 new articles: commuting guide, chain cleaning, safety tips, e-bike laws, choosing a mechanic

### SEO
- [x] sitemap.xml: all pages, blog articles, /business, /cycling-map
- [x] Schema.org on all pages

---

## 🔴 PENDING — Requires Manual Action

### ⚡ Apple Pay (CRITICAL)
`canMakePayment()` → null on Safari iPhone
**Action:** Contact Stripe Support or Fiverr specialist

### 🗃️ Database Migrations — Run in Supabase SQL Editor (in order)
1. `scripts/add-service-reminder-column.sql`
2. `scripts/add-service-timing-columns.sql`
3. `scripts/create-van-inventory-table.sql`
4. `scripts/add-mechanic-profile-columns.sql`
5. `scripts/create-bikes-table.sql`
6. `scripts/add-tracking-token.sql`
7. `scripts/create-newsletter-table.sql`

### 📊 Meta Pixel ID
In landing.html: replace `YOUR_PIXEL_ID` with real ID from ads.facebook.com

### 📄 PDF Service Report (1.2)
- Requires puppeteer or @react-pdf
- **Use Claude Code** for this task

### ⚖️ Legal
- privacy.html and terms.html — deferred after August 2026

---

## API Endpoints (all in /api/)
| File | Purpose |
|------|---------|
| send-email.js | Booking confirmation emails |
| send-invoice.js | Invoice PDFs |
| send-2h-reminders.js | 2-hour reminder cron |
| send-service-reminders.js | Monthly 6/12mo service reminders |
| send-b2b-inquiry.js | B2B fleet enquiry + auto-reply |
| send-upsell.js | Upsell email from mechanic checklist (1.5) |
| subscribe-newsletter.js | Newsletter signup with WELCOME10 (7.1) |
| stripe-webhook.js | Stripe events handler |
| health.js | Health check |

---

## Business Metrics
| Metric | Value |
|--------|-------|
| Target revenue (Phase 2) | $433,658/yr |
| Net margin | 38.9% |
| Net profit | $168,763/yr |
| Avg ticket | $109 |
| Jobs/year | 5,070 |
| Break-even | 178 jobs/month |
| Mechanic PIN | 3250 |
