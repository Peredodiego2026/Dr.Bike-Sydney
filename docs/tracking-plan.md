# Dr. Bike Sydney - Tracking Plan

Format follows the `analytics` marketing skill's Tracking Plan template
(`.claude/skills/analytics/SKILL.md`). Update this file whenever an event
is added, renamed, or removed - it should always match the code.

## Overview
- Tools: PostHog (`eu.i.posthog.com`), Google Analytics 4 (`G-GXYD68JXZW`)
- Booking/revenue source of truth: Supabase `bookings` table (not an event
  stream - query it directly for anything money-related, events are for
  behavior/funnel analysis)
- Last updated: 2026-07-08

## Events

| Event | Tool | Properties | Fires when |
|---|---|---|---|
| `booking_step_viewed` | PostHog | `step` (select_service / select_date / address / quote_summary / payment) | Each screen of the booking flow renders |
| `cta_clicked` | PostHog | `button_text`, `location` | Click on Call, WhatsApp, "Book a Service" nav links, or any membership button |
| `experiment_viewed` | PostHog | `experiment_id`, `variation_id` | GrowthBook assigns a visitor to an experiment variation (fires via SDK `trackingCallback`) |
| `booking_completed` | PostHog | `value`, `currency`, `service` | Booking successfully created (call-out fee charged or test booking) |
| `add_to_cart` | GA4 | `currency`, `items` | Client selects a service in Step 1 |
| `begin_checkout` | GA4 | - | Enters the payment/checkout step |
| `checkout_progress` | GA4 | `step` (2 or 3) | Partial coverage - only address->summary and summary steps. Superseded by `booking_step_viewed` above, which covers all 5 steps; kept for GA4 continuity, don't add to it further |
| `booking_abandoned` | GA4 | - | Leaves the payment screen after a booking record exists but before reaching tracking confirmation |
| `purchase` | GA4 | `transaction_id`, `value`, `currency`, `items` | Same moment as `booking_completed` - GA4's own reserved ecommerce event name |
| `view_item_list` | GA4 | `item_list_name` | Opens the "All Services" modal on landing.html |
| `select_item` | GA4 | `items` | Clicks a specific service card in that modal |
| `sign_up` / `login` | GA4 | - | Account creation / sign-in |
| `review_click` | GA4 | - | Clicks into a mechanic's review section |

## UTM capture

`js/utm-capture.js` (landing.html) and an inline equivalent (index.html,
must run before the mobile/desktop redirect) read `utm_source`,
`utm_medium`, `utm_campaign` from the URL on first load and hold them in
`sessionStorage` for the visit. All 3 booking-creation call sites
(`js/app.js` x2, landing.html's own `_bkState` widget) attach them when a
booking is created, and `api/auth.js`'s `handleCreateBooking` stores them
on the `bookings` row (`utm_source`, `utm_medium`, `utm_campaign` columns).

**Use this to answer**: which channel (Google, Instagram, a specific
referral link) actually produces paying customers, not just clicks.

## Known gaps (not yet tracked)

- Membership plan funnel isn't broken into its own named events - relies
  on generic `cta_clicked` on `[data-plan]` buttons (button_text
  distinguishes "Learn more" from "Get Started - $X/month"). Fine for now,
  revisit if membership conversion becomes a focus area.
- No event fires on booking cancellation from the client side (only
  admin-side cancel is a direct DB status change, not tracked as an event).
- PostHog Personal API Key not yet connected server-side, so none of this
  is queryable from Admin - view it directly in PostHog for now
  (Insights > Trends, breakdown by event property).
