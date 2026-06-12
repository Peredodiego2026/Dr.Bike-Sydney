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
- [ ] A1 - Seguridad critica (~30 min)
  - Eliminate Eruda from mobile_latest.html
  - Sanitize XSS in send-email.js, send-invoice.js
  - Clean moz-extension artifacts from admin.html
  - Document Google Maps key HTTP referrer restriction
- [ ] A2 - Auth + RLS Supabase (~45 min)
  - Enable RLS on bookings with proper policies
  - Create api/admin-auth.js (Supabase Auth)
  - Create api/mechanic-auth.js with PIN check
  - Update SQL script and HTMLs accordingly
- [ ] A3 - Limpieza dead code (~20 min)
  - Consolidate mobile.html (keep mobile_latest, rename, delete v2/v3)
  - Delete applepay-test.html (duplicate)
  - Delete admin.html.bak
  - Consolidate index.html vs index-redesign.html (ASK USER which to keep)
  - Move broken mockups to docs/mockups/
  - Update robots.txt, sitemap.xml, .gitignore
- [ ] A4 - Bug fixes (~30 min)
  - stripe-webhook.js: membership_status fix
  - send-email.js: referral_success scope fix
  - Move normalizeAUPhone to _security.js
  - TWILIO_WHATSAPP_FROM env var
  - Remove @anthropic-ai/sdk from package.json
- [ ] A5 - Modularizacion frontend (~60 min)
  - Create css/ and js/ directories
  - Extract CSS to css/main.css from index.html
  - Extract JS to js/app.js and js/stripe.js
  - Repeat for admin.html and mechanic.html if monoliths
  - Optional: css/variables.css shared with landing
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
