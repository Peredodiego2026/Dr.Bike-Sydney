# CRO Audit - landing.html

Format follows the `cro` marketing skill (`.claude/skills/cro/SKILL.md`).
Analysis only - no code changed here. Design/copy fixes should go through
the visual redesign chat (Fase 4 covers landing.html); this document is
the input for that phase, not a replacement for it.

Findings are marked **Verified** (confirmed by directly reading the code
this session) or **Hypothesis** (reasonable per CRO principles, not
independently confirmed with data - test before assuming).

---

## 1. Value Proposition Clarity

**Hypothesis**: The hero tagline ("Healthy bikes, happy riders") is warm
but generic - it doesn't lead with the actual differentiator (a mechanic
comes to your home/office, no bike shop trip). A first-time visitor
scanning for 5 seconds may not immediately register "this comes to me"
vs. assuming it's a regular bike shop's website. Worth confirming the
main H1/hero copy leads with "mobile" or "we come to you" explicitly.

## 2. Headline Effectiveness

**Hypothesis**: Related to above - outcome-focused, specific headlines
("Bike Serviced at Your Door, Today" vs. a brand tagline) tend to
outperform brand-voice taglines for cold traffic. Worth testing once the
current hero-cta-copy experiment concludes (see backlog #1, #5).

## 3. CTA Placement, Copy, and Hierarchy

Already being actively tested - the running `hero-cta-copy` GrowthBook
experiment covers exactly this dimension. No further action until it
concludes.

## 4. Visual Hierarchy and Scannability

**Verified**: The "All Services" modal shows all 21 services across 5
categories at once, no filtering or progressive disclosure. This is the
same choice-overload pattern flagged in the CRO skill's friction-points
section. Backlog hypothesis #3 addresses this directly.

## 5. Trust Signals and Social Proof

**Verified**: Real trust signals exist - JSON-LD aggregate rating (5.0,
500 reviews), a reviews section, and a mechanic profile carousel showing
jobs-completed counts and ratings per mechanic. This is a real strength,
not a gap.

**Hypothesis**: Worth checking whether these are visible near the primary
CTA (per the skill: trust signals work best "near CTAs and after benefit
claims") or only lower on the page where a visitor may not scroll to
before bouncing.

## 6. Objection Handling

**Verified**: An FAQ section exists covering reschedule policy, whether
parts are included, and payment methods - reasonable baseline coverage of
common objections.

## 7. Friction Points

**Verified, highest priority**: The "Book A Service" dark section (a
static form-looking block with a service dropdown, date picker, and a
"Continue Booking" button) has **no functional wiring at all** - clicking
"Continue Booking" does nothing. It looks like a real booking form but
isn't connected to anything; the actual functional booking widget is a
separate modal elsewhere on the page. This isn't just a missed
conversion opportunity, it's a real trust risk: a visitor who fills out
what looks like a form and gets no response may assume the site is
broken or abandon the whole booking attempt. This should be either wired
to the real booking modal or removed - not left as-is through the
redesign.

---

## Quick Wins (Implement Now)

1. **Fix or remove the non-functional "Book A Service" section.** This is
   the single highest-priority item in this audit - a visibly broken
   interactive element on a marketing page actively damages trust,
   independent of any visual redesign work.

## High-Impact Changes (Prioritize - route through the redesign, Fase 4)

2. Add category filtering/progressive disclosure to the "All Services"
   modal instead of showing all 21 at once.
3. Confirm trust signals (rating, review count) are visible near the
   hero CTA, not only further down the page.

## Test Ideas (already captured in the Experiment Playbook backlog)

- Hypothesis #1: trust signal directly under hero CTA
- Hypothesis #3: category-first flow for "All Services"
- Hypothesis #5: suburb-specific headlines for organic message-match

## Copy Alternatives

For the hero CTA specifically: already running as a live experiment
(Control: "Book a Service" / Variation: "Get Your Free Quote"). Don't
introduce a third variant until this one concludes - splitting traffic
further would slow down reaching significance on either.
