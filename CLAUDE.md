# Dr. Bike Sydney - Project Context for Claude

## What this project is
Mobile on-demand bicycle repair business in Sydney, Australia.
- Owner: Diego (founder + Operations Manager)
- Languages: Spanish with Claude, English in the code/client UI
- Production URL: https://drbikesydney.com.au (Vercel)
- Repo: github.com/Peredodiego2026/Dr.Bike-Sydney

## Architecture (current state - Jun 2026)

Two-page bifurcation via `middleware.js` (Vercel Edge Function):
- Desktop users -> `landing.html` (marketing + booking modal, light theme)
- Mobile users -> `index.html` (SPA with hash router, light theme)

Both pages use the same light/white design system:
- Primary: #2563eb (electric blue)
- Background: #ffffff
- Text: #111827
- Border: #e5e7eb
- Font: Inter (Google Fonts)

### App surfaces
- `index.html` - Mobile SPA (PRODUCTION). Hash router. ~450 lines HTML + js/app.js.
- `landing.html` - Desktop marketing + booking modal (PRODUCTION). ~2600 lines.
- `admin.html` - Manager dashboard. Server-side auth via /api/auth.
- `mechanic.html` - Mechanic app, PIN login 3250.
- `track.html` - Public booking tracking (shareable link).
- `middleware.js` - Vercel Edge Function. Matcher: '/'. Routes mobile->index.html, desktop->landing.html.

### CSS/JS files (SPA)
- `css/variables.css` - Design tokens
- `css/main.css` - Base styles + desktop overrides (bottom-nav hide, booking screens max-width 680px)
- `css/home.css` - Home screen styles. Includes desktop navbar (#home-desktop-nav, display:none on mobile, sticky on 768px+)
- `js/app.js` - Main SPA logic (~1740 lines)
- `js/router.js` - Hash-based router
- `js/supabase.js` - Supabase client + helpers
- `js/stripe.js` - Stripe payment helpers
- `js/components.js` - UI component factories

## Stack
- Frontend: vanilla HTML/CSS/JS (no framework), multi-page PWA
- Backend: Supabase (postgres + auth + storage + realtime)
- Payments: Stripe LIVE keys in production
- Email: Resend (noreply@drbikesydney.com.au, DNS verified)
- SMS/WhatsApp: Twilio
- Hosting: Vercel with cron jobs
- Analytics: Google Analytics (G-GXYD68JXZW)
- Auth: Supabase Auth + Google OAuth
- AI: Anthropic Claude (fetch directo, no SDK - @anthropic-ai/sdk in package.json but unused)

## Payments
- Stripe LIVE keys active in production
- Mobile (index.html): $20 call-out fee charged via Stripe at booking step 3 (PaymentIntent)
- Desktop (landing.html): NO Stripe charge - bkProceed() creates booking in Supabase and Diego contacts client manually
- Subscriptions: Basic $57/mo, Standard $97/mo, VIP $147/mo (3-month min). stripe-webhook.js handles events.

## Notifications (working as of Jun 2026)
When a booking is created via mobile SPA (finalizeBooking()):
- WhatsApp to Diego (admin) via Twilio
- SMS to assigned mechanic via Twilio
- Email confirmation to client via Resend

Desktop booking (landing.html bkProceed()) does NOT trigger notifications - manual process.

## Database tables (Supabase)
profiles, bookings, services, bikes, van_zones, escalation_contacts,
job_messages, mechanic_locations, notifications, discount_codes,
availability, parts_inventory.

RLS is ENABLED on bookings (fixed Jun 2026).

Key column gotchas:
- `bikes` table uses `client_id` (NOT `user_id`)
- `bookings.scheduled_time` stored as 24h string (e.g. "14:30")
- `bookings.bike_id`: CONTEXT.md (schema verified 2026-06-29 via SQL) says it EXISTS; this file previously said it was missing. Re-verify with a SELECT before relying on it.
- WhatsApp admin number stored in van_zones with van_number=0 (hack)

## API endpoints (/api directory)
_security.js (middleware: sanitize + rate limit),
auth.js (server-side admin/mechanic auth),
chat.js (AI chatbot + bike diagnosis + health check + reviews),
send-email.js, send-message.js (unified SMS/WhatsApp), send-push.js,
send-invoice.js, send-cron.js (reminders, birthday, reengagement, abandoned, upsell),
create-payment-session.js (Stripe PaymentIntent + subscription),
stripe-webhook.js.

## Known issues (post-audit state Jun 2026)

### Resolved
- S04: Eruda debug console - removed from mobile_latest.html
- S02: Admin auth - server-side via /api/auth (but admin.html still has weak PIN)
- RLS on bookings - enabled
- Dead files (mobile.html v1/v2/v3, index-redesign.html, admin.html.bak) - deleted
- S03: XSS in email templates - FIXED Jun 2026: date, time, bookingId, price now sanitized in send-email.js

### Still open
(none currently tracked here - see docs/ROADMAP.md for the live punch list)

### Resolved (no longer open)
- Apple Pay/Google Pay: Diego completed a real Apple Pay charge successfully (13 Jul 2026) - confirmed working end-to-end, not just canMakePayment() detection.
- S01: Google Maps API key - app uses Leaflet (no API key), not Google Maps. Non-issue.
- B01: stripe-webhook.js - already uses membership_status correctly. Non-issue.
- B02: send-email.js referral_success - variables are in scope. Non-issue.

### Session 5 (routing unification) - PARTIAL (Jul 2026)
Desktop booking now uses the index.html wizard (commit 0c639c1) - the booking FLOW
is unified. Page-level bifurcation remains: middleware.js still routes
mobile->index.html, desktop->landing.html. Full one-page routing was not retried.

## Pricing
- Prices live in Supabase's `services` table (name, price, category) - do not hardcode
  a price list here, it drifts constantly. To check current prices, query it live or
  see Admin > Services & Prices. js/live-prices.js and api/chat.js read it the same way.
- All prices include $20 mobile call-out fee
- Phone: 0433 963 250 / +61433963250
- WhatsApp: wa.me/61433963250
- Mechanic PIN: 3250

## Trademark status (May 2026)
- IP Australia search done. Class 37 (bike repair): no active competitor registered.
- "DR BIKE" figurative N.2022263 (Hangzhou) in Class 12 only.
- "The Bike Doctor" N.2588953 (Brady Douglas, Melbourne) Class 37 has ADVERSE REPORT,
  acceptance due 31 Jan 2027 - blocked.
- Diego monitors The Bike Doctor until July 2026.
- Strategy: register figurative LOGO + composite mark "Dr. Bike + slogan".
- Lawyer review pending (after August 2026).

## Deploy
- Branch protection (since 11 Jul 2026): main rejects direct pushes for EVERYONE,
  admin included (enforce_admins). All changes reach main via PR with the
  `quality-gate` CI check green. Work on feature branches always.
- Auto-deploy: merging to `main` triggers an automatic Vercel production deploy
  within seconds (confirmed via Vercel API Jul 2026) - no separate command needed.
  Every commit that lands on main goes live immediately.
- Always commit before pushing - never deploy an uncommitted working directory
  via `npx vercel --prod`, it silently diverges from what's in the repo.
- node --check js/app.js (or `npm run check`) before pushing to main, since it
  goes live immediately.
- Skip `<script type="application/ld+json">` blocks in node --check (JSON-LD, not JS)

## Critical coding rules

### No inline event handlers
NEVER onclick inline -> always addEventListener + data attributes.

### No silent errors
NEVER catch{} empty -> always show e.message to user or log it.

### No blind DB writes
NEVER reference columns that don't exist -> verify with SELECT before INSERT/UPDATE.

### No deletes without confirmation
NEVER DELETE without confirming with Diego first.

---

# Style rules (ALWAYS apply)

## Output
- Answer is always line 1. Reasoning comes after, never before.
- No preamble. No "Great question!", "Sure!", "Of course!", "Certainly!", "Absolutely!".
- No hollow closings. No "I hope this helps!", "Let me know if you need anything!".
- No restating the prompt. If the task is clear, execute immediately.
- No explaining what you are about to do. Just do it.
- No unsolicited suggestions. Do exactly what was asked, nothing more.
- Structured output only: bullets, tables, code blocks. Prose only when explicitly requested.

## Token Efficiency
- Compress responses. Every sentence must earn its place.
- No redundant context. Do not repeat information already established in the session.
- No long intros or transitions between sections.
- Short responses are correct unless depth is explicitly requested.

## Typography - ASCII Only
- No em dashes (-) - use hyphens (-)
- No smart/curly quotes - use straight quotes (" ')
- No ellipsis character - use three dots (...)
- No Unicode bullets - use hyphens (-) or asterisks (*)
- No non-breaking spaces

## Sycophancy - Zero Tolerance
- Never validate the user before answering.
- Never say "You're absolutely right!" unless the user made a verifiable correct statement.
- Disagree when wrong. State the correction directly.
- Do not change a correct answer because the user pushes back.

## Hallucination Prevention
- Never speculate about code, files, or APIs you have not read.
- If referencing a file or function: read it first, then answer.
- If unsure: say "I don't know." Never guess confidently.
- Never invent file paths, function names, or API signatures.
- If a user corrects a factual claim: accept it as ground truth for the entire session.

## Code Output
- Return the simplest working solution. No over-engineering.
- No abstractions or helpers for single-use operations.
- No speculative features or future-proofing.
- No docstrings or comments on code that was not changed.
- Inline comments only where logic is non-obvious.
- Read the file before modifying it. Never edit blind.

## Warnings and Disclaimers
- No safety disclaimers unless there is a genuine life-safety or legal risk.
- No "Note that...", "Keep in mind that..." soft warnings.
- No "As an AI, I..." framing.

## Session Memory
- Learn user corrections and preferences within the session.
- Apply them silently. Do not re-announce learned behavior.
- If the user corrects a mistake: fix it, remember it, move on.

## Scope Control
- Do not add features beyond what was asked.
- Do not refactor surrounding code when fixing a bug.
- Do not create new files unless strictly necessary.

## Working with the user (Diego)
- Diego is non-technical. Explain decisions briefly when asked, do not over-explain.
- Diego communicates in Spanish. Code, client UI, and docs stay in English.
- One task per session. When context approaches ~100k tokens, recommend new chat.

## UI Design — Regla obligatoria

SIEMPRE que escribas o modifiques HTML/CSS inline en este proyecto, invocar el skill `drbike-design` ANTES de escribir el codigo. El skill esta en `.claude/skills/drbike-design/SKILL.md`.

Aplica a: js/app.js, landing.html, mechanic.html, js/mechanic.js, track.html, admin.html.

Principios minimos sin leer el skill:
- Cards de lista: borde izquierdo de color segun status, flecha derecha, cursor:pointer
- Jerarquia: titulo 15px bold navy, subtitulo 12px gray — nunca igual peso
- Listas: siempre overflow-y:auto, nunca ocultar scroll
- Touch targets: minimo 44px alto en mobile
- Badges: background [color]15 (8% opacity) + color solido, border-radius:20px

## Override Rule
User instructions always override this file.
