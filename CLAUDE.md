# Dr. Bike Sydney - Project Context for Claude

## What this project is
Mobile on-demand bicycle repair business in Sydney, Australia.
- Owner: Diego (founder + Operations Manager)
- Languages: Spanish with Claude, English in the code/client UI
- Production URL: https://drbikesydney.com.au (Vercel)
- Repo: github.com/Peredodiego2026/Dr.Bike-Sydney

## SOURCE OF TRUTH for current work plan
Three PDFs in docs/ from external consultant (Jun 2026 audit):
- docs/reporte-inicial-drbike.pdf - Full audit, 14 issues identified
- docs/plan-saneamiento-drbike.pdf - Track A: 6 sessions, ~3h 45min
- docs/plan-rediseno-ui-drbike.pdf - Track B: 6 sessions, ~4h 40min

Read these FIRST before any work. Each session has an exact prompt
inside the PDF that should be executed verbatim.

## Agreed execution order
1. Track A (Saneamiento) completo PRIMERO
2. Track B (Rediseno UI) despues
3. Una sesion = una tarea. Cuando contexto llega a ~100k tokens, cerrar chat.

| Session | Topic | Time |
|---|---|---|
| A1 | Seguridad critica (Eruda, XSS emails, admin extension, Google Maps key) | ~30 min |
| A2 | Auth server-side + RLS Supabase | ~45 min |
| A3 | Limpieza dead code (mobile v1/v2/v3, .bak, mockups, duplicados) | ~20 min |
| A4 | Bug fixes (stripe-webhook, send-email referral, normalizeAUPhone, WhatsApp config, anthropic-ai/sdk) | ~30 min |
| A5 | Modularizacion frontend (extraer CSS/JS de monolitos) | ~60 min |
| A6 | Produccion readiness (SW cache, rate limit Upstash, Apple Pay/Google Pay, health check, DEPLOY.md) | ~40 min |
| B1 | Design system + SPA shell | ~45 min |
| B2 | Home + Service Type | ~45 min |
| B3 | Date/Time + Summary | ~40 min |
| B4 | Payment + Tracking | ~50 min |
| B5 | Review + Auth + My Bookings | ~40 min |
| B6 | PWA + Unificacion + Polish | ~40 min |

## Stack
- Frontend: vanilla HTML/CSS/JS (no framework), multi-page PWA
- Backend: Supabase (postgres + auth + storage + realtime)
- Payments: Stripe LIVE keys in production
- Email: Resend (noreply@drbikesydney.com.au, DNS verified)
- SMS/WhatsApp: Twilio
- Hosting: Vercel with cron jobs
- Analytics: Google Analytics (G-GXYD68JXZW)
- Auth: Supabase Auth + Google OAuth
- AI: Anthropic Claude (fetch directo, no SDK)

## App surfaces (current state)
- `index.html` - Client web (PRODUCTION). Monolith 4,898 lines. Most complete.
- `mobile_latest.html` - Client mobile PWA, dark theme. HAS ERUDA DEBUG IN PROD.
- `admin.html` - Manager dashboard. Monolith 3,497 lines. Client-side auth only.
- `mechanic.html` - Mechanic app, PIN login 3250. Weak PIN check.
- `landing.html` - Public marketing landing. Different CSS system from index.
- `track.html` - Public booking tracking.
- DEAD FILES (delete in A3): mobile.html, mobile_v2.html, mobile_v3.html,
  index-redesign.html, admin.html.bak, applepay-test.html, payments.html,
  notifications.html (mockups with broken local paths).

## Database tables (Supabase)
profiles, bookings, services, bikes, van_zones, escalation_contacts,
job_messages, mechanic_locations, notifications, discount_codes,
availability, parts_inventory.

**CRITICAL: RLS NOT ENABLED on bookings.** Script in
scripts/add-bookings-rls.sql is commented out. Fixed in session A2.

Key column gotchas:
- `bikes` table uses `client_id` (NOT `user_id`)
- `bookings.scheduled_time` stored as 24h string (e.g. "14:30")
- `bookings` lacks `bike_id` column (needed for service history per bike)

## API endpoints (13 in /api)
_security.js (middleware with sanitize + rate limit),
send-email.js, send-sms.js, send-whatsapp.js, send-push.js,
send-invoice.js, send-reminders.js, send-2h-reminders.js,
diagnose-bike.js, chat.js, create-subscription.js,
cancel-subscription.js, stripe-webhook.js.

## Known critical issues (per audit PDFs)

### Security CRITICAL
- S01: Google Maps API key hardcoded in index.html:55 - needs HTTP referrer restriction
- S02: Admin auth client-side only, password in JS, no RLS
- S03: XSS in email templates - user data interpolated without escape
- S04: Eruda debug console exposed in mobile_latest.html:2845

### Functional bugs
- B01: stripe-webhook.js:233 uses `membership` instead of `membership_status`
- B02: send-email.js referral_success template has variables out of scope
- B03: WhatsApp number stored via van_zones with hack van_number=0
- B04: @anthropic-ai/sdk in package.json but never imported

### Code quality
- 4 versions of mobile app (mobile.html, v2, v3, latest)
- 95% duplicate: index.html vs index-redesign.html
- 100% duplicate: applepay.html vs applepay-test.html
- normalizeAUPhone() duplicated in send-sms.js and send-whatsapp.js
- All CSS inline (0 separate CSS files)
- Service worker deletes ALL cache on activate

## Brand
- Name: Dr. Bike
- Slogan: "Healthy Bikes, Happy Riders"
- New design system (per Track B):
  - Primary: #0A58CA (electric blue)
  - Background: #0F0F0F (dark)
  - Surface: #1A1A1A
  - Text: #FFFFFF / secondary #A0A0A0
  - Border: #2A2A2A

## Pricing
- 20 services, all include $20 mobile call-out fee
- Tune-Up $109, Standard $149, Major $199, Ultimate Overhaul $369
- Subscriptions: Basic $57/mo, Standard $97/mo, VIP $147/mo (3-month min)
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

## Critical operational rules

### GitHub deploy pattern
```python
import requests, base64
TOKEN = "<github personal access token>"
REPO = "Peredodiego2026/Dr.Bike-Sydney"
h = {"Authorization": f"token {TOKEN}"}
url = f"https://api.github.com/repos/{REPO}/contents/{FILE}"
sha = requests.get(url, headers=h).json()['sha']
content = base64.b64encode(open(LOCAL_FILE,'rb').read()).decode()
r = requests.put(url, headers=h, json={
  "message": "commit message",
  "content": content,
  "sha": sha
})
```

### UTF-8 encoding rule
GitHub API file edits MUST use TextDecoder('utf-8') or full bytes.
NEVER use bare atob() - corrupts non-ASCII / emoji / Spanish characters.

### JS validation before deploy
Always extract inline scripts and run node --check before pushing.
Skip <script type="application/ld+json"> blocks (JSON-LD SEO data, not JS).

### Branching
- Track A: work in branch `saneamiento-prod`
- Track B: work in branch `redesign-ui`
- Separate commit per fix to allow safe revert.

### Apple Pay state (deferred to A6)
Code present in index.html, .well-known/ file present, vercel.json correct,
domain Enabled in Stripe dashboard. But canMakePayment() returns null in
Safari iPhone. The audit recommends switching to Stripe Checkout
(removing payment_method_types: ['card'] restriction) instead of fighting
Payment Request Button - this happens in session A6.

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

## Override Rule
User instructions always override this file.

<!-- deploy trigger: 2026-06-15T05:33:22.982054 -->

<!-- redeploy: 2026-06-15T05:35:59.796070 -->
