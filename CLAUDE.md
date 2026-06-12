# Dr. Bike Sydney - Project Context for Claude

## What this project is
Mobile on-demand bicycle repair business in Sydney, Australia.
- Owner: Diego (founder + Operations Manager)
- Languages: Spanish with Claude, English in the code/client UI
- Production URL: https://drbikesydney.com.au (Vercel)
- Repo: github.com/Peredodiego2026/Dr.Bike-Sydney

## Stack
- Frontend: vanilla HTML/CSS/JS (no framework), multi-page PWA
- Backend: Supabase (postgres + auth + storage + realtime)
- Payments: Stripe LIVE keys in production
- Email: Resend (noreply@drbikesydney.com.au, DNS verified)
- SMS/WhatsApp: configured via API endpoints
- Hosting: Vercel with cron jobs
- Analytics: Google Analytics (G-GXYD68JXZW)
- Auth: Supabase Auth + Google OAuth

## App surfaces (12 HTML files in repo root)
- `index.html` - Client web (DRBIKESYDNEY.COM.AU - PRODUCTION). Most complete. ~257k chars.
- `mobile_latest.html` - Client mobile PWA, dark theme. ~123k chars.
- `admin.html` - Manager/admin dashboard. ~209k chars.
- `mechanic.html` - Mechanic app, PIN login 3250. ~64k chars.
- `landing.html` - Public marketing landing. ~104k chars.
- `track.html` - Public booking tracking (uses ?id=). ~8k chars.
- `notifications.html`, `payments.html` - Standalone screens.
- DEAD FILES (to delete in cleanup): `mobile.html`, `mobile_v2.html`, `mobile_v3.html`, `index-redesign.html`, `admin.html.bak`, `applepay-test.html`, `applepay.html`.

## Database tables (Supabase)
profiles, bookings, services, bikes, van_zones, escalation_contacts,
job_messages, mechanic_locations, notifications, discount_codes,
availability, parts_inventory.

Key column gotchas:
- `bikes` table uses `client_id` (NOT `user_id`)
- `bookings` table does NOT yet have `bike_id` column (needed for service history per bike)
- `bookings.scheduled_time` stored as 24h format string (e.g. "14:30"), no am/pm

## API endpoints (13 files in /api)
_security.js (middleware), send-email.js (all email templates),
send-sms.js, send-whatsapp.js, send-push.js, send-invoice.js (PDF),
send-reminders.js (6+ months re-service), send-2h-reminders.js (cron),
diagnose-bike.js (Claude Vision), chat.js, create-subscription.js,
cancel-subscription.js, stripe-webhook.js.

## Brand
- Name: Dr. Bike
- Slogan: "Healthy Bikes, Happy Riders"
- Logo: figurative bike SVG (two-wheel design, in track.html as reference)

## Pricing
- 20 services, all include $20 mobile call-out fee
- Examples: Tune-Up $109, Standard $149, Major $199, Ultimate Overhaul $369
- Subscriptions: Basic $57/mo, Standard $97/mo, VIP $147/mo (3-month minimum)
- Phone: 0433 963 250 / +61433963250
- WhatsApp: wa.me/61433963250
- Mechanic PIN: 3250

## Trademark status (May 2026)
- IP Australia search done. Class 37 (bike repair) has no active "Dr/Doctor Bike" registered.
- "DR BIKE" figurative N.2022263 (Hangzhou Joykie) is Class 12 only (products).
- Competitor "The Bike Doctor" N.2588953 (Brady Douglas, Melbourne) Class 37 has ADVERSE REPORT, acceptance due 31 Jan 2027 = blocked.
- Diego monitors The Bike Doctor until July 2026 (Accepted = bad, Lapsed = good).
- No expansion to Melbourne planned for 7-10 years.
- Strategy: register figurative LOGO + composite mark "Dr. Bike + slogan". Lawyer review pending.

## Active pending items (priority order)

### Block 1 - Differentiators
- [DONE] 1.1 Automated 2h appointment reminders (email via Resend, cron every 15min)
- [TODO] 1.2 Service history per bike (needs bookings.bike_id column + UI on 4 files)
- [TODO] 1.3 Verified public reviews + post-service review request
- [TODO] 1.4 Visible referral program in client UI
- [TODO] 1.5 Subscriber retention (alert on unused plan benefits)

### Block 2 - Technical
- [PENDING] 2.1 Apple Pay verification - code in index.html, .well-known/ file present, vercel.json correct headers, but button does not appear in Safari iPhone. Diego uses Apple Pay daily on other sites. Stripe dashboard shows domain Enabled. canMakePayment() returns null. Next step: Stripe Support to verify real Apple status, or Fiverr specialist.
- [TODO] 2.2 Real-time mechanic map (currently static "3.2 km away")
- [TODO] 2.3 Convert mobile_latest.html dark theme to LIGHT theme. Trigger phrase: "Hey, pasemos la app movil a tema claro".
- [TODO] 2.4 Remove Eruda console + console.log statements from production
- [TODO] 2.5 Verify Supabase schema parity across all 4 client-facing apps

### Block 3 - Growth
- [TODO] 3.1 Google Business Profile + local SEO
- [TODO] 3.2 Separate landing page with Dr. Bike + slogan lockup
- [TODO] 3.3 Accessibility + performance pass

### Block 4 - Legal (DEFERRED until after August 2026 per Diego)
- Privacy Policy + Terms (already drafted in past session, need lawyer review)
- Link privacy/terms in app footers
- Cookie/analytics notice
- Trademark registration (logo + composite mark with slogan)

## What is DONE and should NOT be re-touched
- All Supabase tables, RLS policies, Stripe webhooks, Resend email templates
- Vercel config (rewrites correct, security headers, cron schedule)
- Auth flow + onAuthStateChange handling
- Booking flow + payment flow in index.html
- Zone/vans system + escalation contacts
- AI bike diagnosis endpoint (Claude Vision)
- Real-time chat (job_messages table)
- API security middleware (_security.js with rate limiting)
- Cancel booking + cancellation policy modal (index.html + mobile_latest.html)
- track.html unified to shared design tokens
- 2h appointment reminders (cron + email template)

## Critical operational rules

### GitHub deploy pattern (Python)
```python
# Read SHA, then PUT base64 content with sha. Cache-bust URL with ?v={timestamp}.
import requests, base64, time
TOKEN = "<github token>"  # personal access
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
Skip <script type="application/ld+json"> blocks (those are JSON-LD SEO data, not JS).

### Working style preference (Diego)
- Diego prefers Claude (chat) to directly advise + make code changes.
- Claude Code (terminal) used only when Diego explicitly directs it.
- One task per session. When context fills (~100k tokens), close chat and start fresh.

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
- If a user corrects a factual claim: accept it as ground truth for the entire session. Never re-assert the original claim.

## Code Output
- Return the simplest working solution. No over-engineering.
- No abstractions or helpers for single-use operations.
- No speculative features or future-proofing.
- No docstrings or comments on code that was not changed.
- Inline comments only where logic is non-obvious.
- Read the file before modifying it. Never edit blind.

## Warnings and Disclaimers
- No safety disclaimers unless there is a genuine life-safety or legal risk.
- No "Note that...", "Keep in mind that...", "It's worth mentioning..." soft warnings.
- No "As an AI, I..." framing.

## Session Memory
- Learn user corrections and preferences within the session.
- Apply them silently. Do not re-announce learned behavior.
- If the user corrects a mistake: fix it, remember it, move on.

## Scope Control
- Do not add features beyond what was asked.
- Do not refactor surrounding code when fixing a bug.
- Do not create new files unless strictly necessary.

## Override Rule
User instructions always override this file.
