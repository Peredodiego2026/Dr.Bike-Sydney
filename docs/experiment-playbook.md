# Dr. Bike Sydney - Experiment Playbook

Format follows the `ab-testing` marketing skill (`.claude/skills/ab-testing/SKILL.md`).
Every concluded test gets logged here, win or lose - the point is building
a library of what actually works for this business, not just running tests.

Note on targets: the skill's own benchmarks (4-8 experiments/month, 20+
backlog) are calibrated for teams with much more traffic than a solo
Sydney mobile-mechanic business gets. Realistic cadence here is closer to
1 experiment running at a time, concluded when it reaches significance
(could be weeks, not days) - don't force a faster pace than the traffic
supports, that just produces noise.

---

## Running Experiments

### Hero CTA Copy Test
**Date started**: 2026-07-08
**Hypothesis**: Because "Book a Service" is generic and doesn't communicate
urgency or low commitment, we believe a more specific, lower-friction CTA
("Get Your Free Quote") will increase clicks through to the booking flow
for new visitors on the landing page.
**Primary metric**: `booking_step_viewed` (step=select_service) as a
proportion of visitors who saw each variation (`experiment_viewed`)
**Guardrail**: `booking_completed` rate shouldn't drop even if click-through
rises - a variant that gets more clicks but fewer finished bookings isn't
actually a win.
**Sample size**: not yet calculated - needs actual traffic volume from
GA4/PostHog to estimate weeks-to-significance. Revisit once a few weeks of
data exist.
**Variants**: Control = "Book a Service" / Variation 1 = "Get Your Free Quote", 50/50 split
**Status**: Running. Do not call a winner early - see results only in
PostHog (Insights > Trends, breakdown by `variation_id`).

---

## Concluded Experiments

*(none yet)*

---

## Hypothesis Backlog

ICE-scored (Impact / Confidence / Ease, 1-10 each, average = ICE score).
Re-score monthly. Pull the next one after the CTA test concludes.

| # | Hypothesis | Impact | Confidence | Ease | ICE | Source |
|---|---|---|---|---|---|---|
| 1 | Adding a specific trust signal ("500+ Sydney bikes serviced") directly under the hero CTA increases booking starts | 7 | 5 | 9 | 7.0 | cro skill - trust signals near CTA |
| 2 | Showing the $20 call-out fee upfront in the hero (vs. only revealing it in the booking flow) reduces step-3 abandonment, since price surprise is a common friction point | 6 | 6 | 8 | 6.7 | Known friction pattern (cro skill) |
| 3 | A single-CTA "All Services" modal (currently 21 cards across 5 categories) is choice overload - testing a simplified "pick a category first" flow vs. the current all-at-once grid | 7 | 4 | 4 | 5.0 | cro skill - friction points, "too many choices" |
| 4 | Membership pricing page: adding "Recommended" badge on the Standard plan (currently no visual default) increases plan selection rate, same pattern GrowthBook membership pages commonly use | 6 | 6 | 7 | 6.3 | cro skill - pricing page CRO |
| 5 | Suburb pages (bondi.html etc) with a locally-specific headline ("Mobile Bike Mechanic in Bondi") vs. the current generic template test better for organic search traffic message-match | 5 | 5 | 5 | 5.0 | cro skill - landing page message match |

Recommended next test after the current one concludes: **#1** (highest ICE,
cheapest to build, and directly measurable with tracking already in place).

---

## Process

**Weekly**: check the running experiment isn't broken (variants rendering
correctly, events still firing) and that `booking_completed` hasn't
cratered for either variant.

**When it reaches significance** (don't peek and stop early): log the
result here using the template below, implement the winner (or keep
control), and pull the next hypothesis from the backlog.

```
## [Experiment Name]
**Date**: [date]
**Hypothesis**: [the hypothesis]
**Sample size**: [n per variant]
**Result**: [winner/loser/inconclusive] - [metric] changed by [X%]
**Guardrails**: [outcome]
**Why it worked/failed**: [analysis]
**Pattern**: [reusable insight]
**Apply to**: [other pages/flows]
**Status**: [implemented / parked / needs follow-up]
```
