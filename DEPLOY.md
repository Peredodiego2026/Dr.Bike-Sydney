# Deployment Guide — Dr. Bike Sydney

Production URL: https://drbikesydney.com.au
Hosting: Vercel (auto-deploy on push to main)
Repo: github.com/Peredodiego2026/Dr.Bike-Sydney

---

## Environment Variables (Vercel Dashboard)

Set these in Vercel -> Project -> Settings -> Environment Variables:

| Variable | Where to get it |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard -> Developers -> API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard -> Developers -> Webhooks -> endpoint secret |
| `SUPABASE_URL` | Supabase Dashboard -> Project Settings -> API |
| `SUPABASE_KEY` | Supabase Dashboard -> Project Settings -> API -> anon public key |
| `SUPABASE_SERVICE_KEY` | Supabase Dashboard -> Project Settings -> API -> service_role secret |
| `RESEND_API_KEY` | resend.com -> API Keys |
| `TWILIO_ACCOUNT_SID` | Twilio Console -> Account info |
| `TWILIO_AUTH_TOKEN` | Twilio Console -> Account info |
| `TWILIO_PHONE_NUMBER` | Twilio Console -> Phone Numbers (+61...) |
| `TWILIO_WHATSAPP_FROM` | Twilio Console -> Messaging -> WhatsApp Senders |
| `UPSTASH_REDIS_REST_URL` | upstash.com -> Database -> REST API URL |
| `UPSTASH_REDIS_REST_TOKEN` | upstash.com -> Database -> REST API Token |

---

## Deploy to Production

```bash
# Standard deploy (auto via GitHub push)
git push origin main

# Manual deploy via Vercel CLI
vercel --prod
```

**Never push directly to main without testing on a branch first.**

---

## Post-deploy Checklist

- [ ] https://drbikesydney.com.au loads without console errors
- [ ] https://drbikesydney.com.au/api/health returns `{"status":"ok"}`
- [ ] Booking flow completes (test with Stripe test mode on local)
- [ ] Stripe webhook received in Dashboard after a test event

---

## Supabase Manual Steps (one-time)

These cannot be done via code — run once in Supabase Dashboard:

### 1. Enable RLS on bookings
Go to Supabase Dashboard -> SQL Editor -> run `scripts/add-bookings-rls.sql`

### 2. Create admin user
Go to Supabase Dashboard -> Authentication -> Users -> Add User:
- Email: admin@drbikesydney.com.au (or any email Diego uses)
- Password: strong password (store in a password manager)

### 3. Add mechanic phone numbers
Go to Supabase Dashboard -> Table Editor -> `escalation_contacts`
- Add a row per mechanic with their full AU phone (e.g. +61433963250)
- The mechanic PIN = last 4 digits of their phone

---

## Stripe Configuration

### Webhook endpoint
URL: `https://drbikesydney.com.au/api/stripe-webhook`
Events to enable:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `invoice.payment_action_required`

### Apple Pay domain verification
File: `.well-known/apple-developer-merchantid-domain-association`
Already present in repo. Stripe domain must be enabled in:
Stripe Dashboard -> Settings -> Payment methods -> Apple Pay -> Add domain

---

## Google Maps API Key

The Maps API key is hardcoded in `index.html`. It MUST have HTTP referrer restriction:
1. Go to Google Cloud Console -> APIs & Services -> Credentials
2. Edit the key
3. Under "Application restrictions" select "HTTP referrers"
4. Add: `https://drbikesydney.com.au/*` and `https://www.drbikesydney.com.au/*`

---

## Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Production (auto-deploys to Vercel) |
| `saneamiento-prod` | Track A cleanup sessions (merge to main when complete) |
| `redesign-ui` | Track B UI redesign (do NOT merge until Track A is merged) |

---

## Vercel Cron Jobs

Configured in `vercel.json`. Cron jobs call:
- `/api/send-reminders` — daily reminders
- `/api/send-2h-reminders` — 2h-before reminders

Vercel CRON_SECRET env var must be set to protect these endpoints.
