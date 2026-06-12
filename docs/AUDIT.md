# Audit Status - Dr. Bike Sydney
Last updated: Jun 2026

## Authoritative audit sources

The current authoritative audit and work plan come from external
consultant review (Jun 2026). All work follows these three docs:

1. `docs/reporte-inicial-drbike.pdf` - Full audit report
   - 4 critical security issues
   - 4 medium-severity issues
   - 10 low-severity issues
   - Code quality and bugs inventory

2. `docs/plan-saneamiento-drbike.pdf` - Track A: cleanup (6 sessions)
   - Each session has exact prompt to execute in Claude Code
   - Total ~3h 45min

3. `docs/plan-rediseno-ui-drbike.pdf` - Track B: UI redesign (6 sessions)
   - Mobile-first SPA with electric blue on dark
   - Each session has exact prompt
   - Total ~4h 40min

## Execution order

Track A complete FIRST. Track B after.
One session per chat. Close chat at ~100k tokens.

## Sessions checklist

### Track A - Saneamiento
- [x] A1 - Seguridad critica (~30 min) - DONE 2026-06-12
  - Eliminate Eruda from mobile_latest.html (commit 817e47b)
  - Sanitize XSS in send-email.js, send-invoice.js (commit 613a5e8)
  - Clean moz-extension artifacts from admin.html (commit c2ea437)
  - Document Google Maps key HTTP referrer restriction (commit d09223c)
- [x] A2 - Auth + RLS Supabase (~45 min) - DONE 2026-06-12
  - Enable RLS on bookings with proper policies (commit 0ecfb9b)
  - Create api/admin-auth.js (Supabase Auth) (commit 9138551)
  - Create api/mechanic-auth.js with PIN check (commit 1a36b51)
  - Update SQL script and HTMLs accordingly
- [x] A3 - Limpieza dead code (~20 min) - DONE 2026-06-12
  - Consolidate mobile.html (keep mobile_latest, rename, delete v2/v3) (commit f454a0c)
  - Delete applepay-test.html, admin.html.bak, index-redesign.html (commit b7b902f)
  - Move broken mockups to docs/mockups/ (commit 5e73fcf)
  - Update robots.txt (+Disallow /docs/), .gitignore (+*.bak)
- [x] A4 - Bug fixes (~30 min) - DONE 2026-06-12
  - stripe-webhook.js: membership_status fix (commit 3ff132a)
  - send-email.js: referral_success scope fix (commit e8f1933)
  - Move normalizeAUPhone to _security.js (commit 5e747fa)
  - TWILIO_WHATSAPP_FROM env var (commit 5e26c08)
  - Remove @anthropic-ai/sdk from package.json (commit 3d438b3)
- [x] A5 - Modularizacion frontend (~60 min) - DONE 2026-06-12
  - Extract index.html -> css/main.css, js/app.js, js/stripe.js (commits a44b637, 786bf48)
  - Extract admin.html -> css/admin.css, js/admin.js (commits cd16643, 6f41b3b)
  - Extract mechanic.html -> css/mechanic.css, js/mechanic.js (commits adf7de0, 44c45ff)
  - index.html: 4902 -> 797 lines | admin.html: 3511 -> 978 lines | mechanic.html: 1156 -> 75 lines
- [ ] A6 - Produccion readiness (~40 min)
  - sw.js selective cache cleanup
  - _security.js with Upstash Redis fallback
  - Apple Pay/Google Pay via Stripe Checkout (remove card restriction)
  - api/health.js endpoint
  - DEPLOY.md documentation

### Track B - Rediseno UI
- [ ] B1 - Design system + SPA shell (~45 min)
  - css/variables.css with design tokens
  - js/router.js hash-based SPA navigation
  - New index.html as SPA shell (backup current as index-legacy.html)
  - js/components.js with reusable components
  - css/main.css with base styles
- [ ] B2 - Home + Service Type (~45 min)
  - js/supabase.js client with helpers and mock fallback
  - Home screen with hero, pillars, CTAs
  - Book a Service screen with service type cards
- [ ] B3 - Date/Time + Summary (~40 min)
  - Date carousel (7 days from today)
  - Time slots grid
  - Location section
  - Service Summary screen with Confirm Booking
- [ ] B4 - Payment + Tracking (~50 min)
  - js/stripe.js with Payment Request Button
  - Payment screen with Stripe Elements (dark theme)
  - Tracking screen with map (Leaflet) and mechanic info
- [ ] B5 - Review + Auth + My Bookings (~40 min)
  - Review screen with stars and comment
  - Login/Register screen
  - My Bookings with Upcoming/History tabs
- [ ] B6 - PWA + Unificacion + Polish (~40 min)
  - Unify landing.html with design system
  - Update manifest.json, sw.js, icons
  - Adapt mechanic.html and admin.html to new theme
  - Final polish: transitions, contrast, loading states

## Tracking

Track progress by checking off the boxes above as each session completes.
Update this file at the end of each session in the same commit.
