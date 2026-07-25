# Dr. Bike Sydney - Product Marketing Context

Used automatically by the marketing/CRO/analytics skills in `.claude/skills/`
so they don't need to be re-briefed on the business every time.

## What we sell
Mobile, on-demand bicycle repair. A mechanic comes to the client's home,
office, or park in Sydney with a fully equipped van - no dropping the bike
off, no bike shop queue.

## Business model
- Pay-per-service: client books a service (Tune-Up, Standard Service,
  Standard+ Service, Ultimate Overhaul, or dozens of smaller repairs), pays
  a $20 mobile call-out fee online, pays the mechanic directly (card/EFTPOS)
  on completion.
- Subscriptions: Basic $67/mo, Standard $97/mo, VIP $197/mo - discounted
  services, waived call-out fee, priority booking. (Prices current as of
  2026-07-26; Basic/VIP changed from $57/$147 on 2026-07-22.)
- Solo/small operation, Sydney metro only, run by Diego (founder + ops).

## Primary conversion goals (in order)
1. Booking created (mobile SPA or desktop landing page)
2. Membership signup
3. Referral share / repeat booking

## Audience
- Cyclists who value convenience over price shopping around bike shops.
- Sydney-based, mobile-first (most bookings happen on phone).
- Landing page (desktop) mainly serves people arriving from Google search
  by suburb ("bike mechanic bondi" etc - hence the 20 suburb pages) or
  social/referral traffic.

## Current stack (for the tools/integrations skill references)
- Analytics: PostHog (eu.i.posthog.com), Google Analytics 4
- Experimentation: GrowthBook (client-side flags/experiments)
- Backend: Supabase (bookings, services, clients - source of truth for
  revenue/conversion data, not just event tracking)
- No CRM, no paid ads platform connected yet.

## What's already tracked
- `experiment_viewed` (PostHog) - which GrowthBook variation a visitor saw
- `booking_completed` (PostHog) - booking finalized, with value/service
- `purchase` (GA4) - same moment, GA4's own ecommerce event
- Admin > Analytics (Supabase-driven): conversion funnel, geographic
  heatmap by suburb, service popularity ranking, margins per service,
  client LTV/churn - exportable to CSV.

## Known gap
No general CTA click tracking (WhatsApp button, Call button, nav "Book Now",
membership signup buttons) - only the one experiment's exposure is tracked.
Can't currently answer "what do visitors click/see most" beyond that one
button.
