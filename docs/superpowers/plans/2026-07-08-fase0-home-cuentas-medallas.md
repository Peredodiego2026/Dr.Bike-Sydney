# Fase 0 (Home + Cuentas + Medallas realistas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 3D-depth/elevation design language on Home, Profile, Login, My Bookings and My Bikes, replace the gamification emoji medals with photorealistic renders, and close every i18n gap these screens touch - establishing the pattern every later phase (Fase 1-7) reuses without inventing new tokens.

**Architecture:** Additive design tokens in `css/variables.css` (3-level elevation + motion timing), a slide+fade transition in `router.js`, a new shared `createTierBadge()` component consumed by both the Home nav (icon-only) and Profile (icon+label+progress), and a field-shape change in `js/rider-tier.js` (`emoji` -> `image`+`iconType`) covered by its existing unit test. No new dependencies, no build step - vanilla JS/CSS same as the rest of the project.

**Tech Stack:** Vanilla HTML/CSS/JS, ES modules, Vitest (unit), Playwright (e2e, not extended here - it doesn't cover `index.html` today), no framework.

**Full design spec:** [docs/superpowers/specs/2026-07-08-fase0-home-cuentas-medallas-design.md](../specs/2026-07-08-fase0-home-cuentas-medallas-design.md)

## Global Constraints

- Elevation: exactly 3 levels, no 4th. `--elevation-0: 0 1px 2px rgba(13,31,60,0.06)`, `--elevation-1: 0 8px 24px rgba(13,31,60,0.12)` + `translateY(-2px)`, `--elevation-2: 0 24px 64px rgba(13,31,60,0.18)`. Navy shadow color only, never colored.
- Hover-lift (Nivel 0 -> 1) only inside `@media (hover: hover)` - never forced on touch devices.
- Buttons: `scale(0.97)` on `:active`, no transition (instant).
- List entrances: fade+slide-up, 40-60ms stagger, capped at first 8 items.
- Screen transitions: slide+fade, 250-300ms, `cubic-bezier(0.4,0,0.2,1)`, must respect `prefers-reduced-motion`.
- Every translatable string in its own text node; dynamic values (counts, names, prices) in their own `<span>`, never concatenated into the same node as static label text.
- Every new/changed string added to `dict.es` in `js/i18n.js` in this same task's commit (language is an acceptance criterion per task, not a separate pass at the end).
- Never rename `.service-card`, `.service-name`, `.service-price` - `js/live-prices.js` depends on those exact selectors.
- Never touch PIN-of-arrival or tip logic (not in this phase's files, but noted so nobody "helpfully" touches `tracking`).
- No inline `onclick` - `addEventListener` + data attributes only (existing project rule).
- No silent `catch {}` - surface `e.message` or log it (existing project rule).
- Deploy order: preview -> `npm run check`/`lint`/`test` -> commit -> push to `main` (Vercel auto-deploys on push; do not run `npx vercel --prod` on an uncommitted tree).

---

### Task 1: Elevation + motion tokens

**Files:**
- Modify: `css/variables.css`
- Modify: `css/home.css:314-316` (`.stat-mini` box-shadow)

**Interfaces:**
- Produces: CSS custom properties `--elevation-0`, `--elevation-1`, `--elevation-2`, `--motion-fast`, `--motion-base`, `--ease-out`, consumed by every later task in this plan.

- [ ] **Step 1: Add the tokens**

In `css/variables.css`, inside the existing `:root { ... }` block, after the `/* ── Shadows ─── */` section (after `--shadow-lg`, around line 90), add:

```css
  /* ── Elevation (3D depth system, Fase 0+) ────────────────────────────────── */
  --elevation-0: 0 1px 2px rgba(13, 31, 60, 0.06);
  --elevation-1: 0 8px 24px rgba(13, 31, 60, 0.12);
  --elevation-2: 0 24px 64px rgba(13, 31, 60, 0.18);
  --motion-fast: 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
  --motion-base: 250ms cubic-bezier(0.4, 0, 0.2, 1);
  --ease-out: cubic-bezier(0.4, 0, 0.2, 1);
```

- [ ] **Step 2: Migrate the one existing consumer**

In `css/home.css`, find `.stat-mini`:

```css
[data-screen='home'] .stat-mini {
  text-align: center;
  padding: 12px 8px;
  background: #fff;
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}
```

Change `box-shadow: var(--shadow-sm);` to `box-shadow: var(--elevation-0);`.

- [ ] **Step 3: Verify no other file references the old shadow tokens outside this file**

Run: `grep -rn "var(--shadow" css/` (bash) - confirm `home.css` is the only match (already confirmed during design - this just guards against drift before committing).
Expected: only the `home.css` lines you just edited (plus any other unrelated `--shadow-*` usages you did NOT touch, if present, must be left alone since they belong to future phases).

- [ ] **Step 4: Visual check**

Start the preview server, open `index.html`, confirm the 4 "About" mini-stats (1,000+ Happy Customers, etc.) still render with a visible soft shadow (unchanged at rest - `--elevation-0` and the old `--shadow-sm` are close enough that this is a no-op visually, this step only confirms nothing broke).

- [ ] **Step 5: Commit**

```bash
git add css/variables.css css/home.css
git commit -m "feat: add 3-level elevation + motion tokens (Fase 0 foundation)"
```

---

### Task 2: Screen-to-screen transition

**Files:**
- Modify: `js/router.js`
- Modify: `css/main.css` (new transition classes)

**Interfaces:**
- Consumes: nothing new.
- Produces: `.screen--entering`/`.screen--leaving` CSS classes and the reduced-motion check, used only internally by `router.js` - no other task depends on this one.

**Important - read before editing:** `.screen` today is `display:none` by default and `.screen.active { display:flex; ...; animation: slideInRight var(--transition-base); }` (`css/main.css:56-67`), where `slideInRight` is a translateX+fade-in keyframe already doing the "incoming slides in" half of the job. `#app` is already `position:relative` (`css/main.css:52-54`). `[data-screen='tracking'].active` has a hard override, `animation:none; height:100dvh; overflow:hidden` (`css/main.css:81-87`), commented "so Leaflet calculates tile positions correctly" - Leaflet's tile grid is sized from the DOM at init time, so this screen must never be simultaneously visible+absolutely-positioned with another screen, and must never get a competing animation. Do not touch that rule. Because only one `.screen` is ever `display:flex` at a time and none are absolutely positioned, making the *outgoing* screen fade-and-slide-back requires giving only the transient leaving screen `position:absolute` (so it overlaps the incoming screen instead of stacking below it in flow) - the steady-state `.active` screen must stay in normal flow or Home's long scrolling content collapses to one viewport height.

- [ ] **Step 1: Add the transition CSS**

In `css/main.css`, change the existing animation duration token (keep everything else in this rule the same):

```css
.screen.active {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  animation: slideInRight var(--motion-base);
  padding-bottom: 10rem;
}
```
(only `var(--transition-base)` -> `var(--motion-base)` changed, adopting the new `cubic-bezier(0.4,0,0.2,1)` easing instead of the old `ease`)

Then add, directly after the `slideInRight` `@keyframes` block and before the `[data-screen='tracking'].active` override:

```css
.screen.screen--leaving {
  position: absolute;
  inset: 0;
  pointer-events: none;
  transition:
    transform var(--motion-base),
    opacity var(--motion-base);
}
.screen.screen--leaving.screen--leaving-go {
  transform: translateX(-24px) scale(0.96);
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .screen.active {
    animation: none;
  }
  .screen.screen--leaving {
    transition: none;
  }
}
```

(Two-class pattern - base class enables the transition, a second class added one frame later via `requestAnimationFrame` triggers the actual transform/opacity change - this mirrors the existing `toast`/`toast--visible` pattern already used in `js/components.js`'s `showToast()`, same reasoning: a transition needs the property change to happen in a separate paint from when `transition:` itself is first applied, or the browser jumps straight to the end state with no visible animation.)

- [ ] **Step 2: Wire it into `router.js`**

Current `render()`:

```js
  render() {
    const hash = window.location.hash.replace('#', '').split('?')[0] || 'home';
    const route = ROUTES.includes(hash) ? hash : 'home';
    this._prev = this.current;
    this.current = route;

    document.querySelectorAll('[data-screen]').forEach(el => {
      el.classList.remove('active');
    });

    const screen = document.querySelector(`[data-screen="${route}"]`);
    if (screen) screen.classList.add('active');

    // Fire screen-change event so app.js can react
    document.dispatchEvent(new CustomEvent('screenchange', { detail: { route, prev: this._prev } }));
  },
```

Replace with:

```js
  render() {
    const hash = window.location.hash.replace('#', '').split('?')[0] || 'home';
    const route = ROUTES.includes(hash) ? hash : 'home';
    const prevRoute = this.current;
    this._prev = prevRoute;
    this.current = route;

    const prevScreen = document.querySelector(`[data-screen="${prevRoute}"]`);
    const nextScreen = document.querySelector(`[data-screen="${route}"]`);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Tracking never participates in the exit animation - it needs an exact,
    // un-animated layout the instant it's added/removed for Leaflet's tile grid.
    const canAnimateExit =
      prevScreen &&
      prevScreen !== nextScreen &&
      !reduceMotion &&
      prevRoute !== 'tracking' &&
      route !== 'tracking';

    if (canAnimateExit) {
      prevScreen.classList.add('screen--leaving');
      requestAnimationFrame(() => prevScreen.classList.add('screen--leaving-go'));
      prevScreen.addEventListener('transitionend', () => {
        prevScreen.classList.remove('active', 'screen--leaving', 'screen--leaving-go');
      }, { once: true });
    }

    document.querySelectorAll('[data-screen]').forEach(el => {
      if (el !== prevScreen || !canAnimateExit) el.classList.remove('active');
    });

    if (nextScreen) nextScreen.classList.add('active');

    // Fire screen-change event so app.js can react
    document.dispatchEvent(new CustomEvent('screenchange', { detail: { route, prev: this._prev } }));
  },
```

- [ ] **Step 3: Manual verification**

Start the preview server. Navigate Home -> My Bookings -> Home via the bottom nav (`preview_click` on `.bottom-nav__tab`). Via `preview_snapshot`, confirm exactly one `[data-screen]` has class `active` about 400ms after each navigation (safely past the 250-300ms transition), and no element is left with `screen--leaving`/`screen--leaving-go` classes. `preview_console_logs` must show no errors. Then navigate into `tracking` and back out to `home` - confirm the map still renders at the right size (no squashed/blank Leaflet tiles), since this is the one screen explicitly excluded from the new animation. Finally, verify the reduced-motion path without relying on OS settings: `preview_eval` the following, which temporarily forces `matchMedia` to report reduced motion, re-navigates, and confirms no transition classes get added:

```js
(() => {
  const original = window.matchMedia;
  window.matchMedia = (q) => ({ matches: q.includes('reduced-motion'), media: q, addListener(){}, removeListener(){} });
  window.location.hash = 'my-bookings';
  const stillAnimating = document.querySelector('.screen--leaving, .screen--leaving-go');
  window.location.hash = 'home';
  window.matchMedia = original;
  return { stillAnimating: !!stillAnimating };
})();
```
Expected: `{ stillAnimating: false }` - confirms the reduced-motion branch actually suppresses the exit animation instead of only being reachable in theory.

- [ ] **Step 4: Commit**

```bash
git add js/router.js css/main.css
git commit -m "feat: slide+fade transition between SPA screens"
```

---

### Task 3: `rider-tier.js` - replace emoji with image/iconType (TDD)

**Files:**
- Modify: `js/rider-tier.js`
- Modify: `tests/unit/rider-tier.test.js`

**Interfaces:**
- Produces: `getRiderTier(completed)` now returns `{ label, color, nextAt, nextLabel, progressPct, image, iconType }` where `iconType` is `'mask'` (New Rider only) or `'photo'` (Bronze/Silver/Gold/Diamond), and `image` is the asset path string. Consumed by Task 5 (`createTierBadge`).

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/rider-tier.test.js`, inside the existing `describe('getRiderTier', ...)` block:

```js
  it('gives New Rider a mask icon pointing at the shared bike glyph', () => {
    const tier = getRiderTier(0);
    expect(tier.iconType).toBe('mask');
    expect(tier.image).toBe('images/bike-icon.png');
  });

  it('gives every medal tier a photo icon pointing at its own render', () => {
    expect(getRiderTier(3)).toMatchObject({ iconType: 'photo', image: 'images/medals/bronze.png' });
    expect(getRiderTier(6)).toMatchObject({ iconType: 'photo', image: 'images/medals/silver.png' });
    expect(getRiderTier(10)).toMatchObject({ iconType: 'photo', image: 'images/medals/gold.png' });
    expect(getRiderTier(20)).toMatchObject({ iconType: 'photo', image: 'images/medals/diamond.png' });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/rider-tier.test.js`
Expected: FAIL - `tier.iconType` is `undefined` (current code has no `iconType`/`image` fields, only `emoji`).

- [ ] **Step 3: Implement**

Replace the full contents of `js/rider-tier.js` with:

```js
// Gamification: a free loyalty tier based on completed jobs, distinct from the
// paid Basic/Standard/VIP memberships shown elsewhere. Kept dependency-free
// (no DOM access) so it can be unit tested directly.
export function getRiderTier(completed) {
  const tiers = [
    { min: 0, label: 'New Rider', image: 'images/bike-icon.png', iconType: 'mask', color: '#94A3B8' },
    { min: 3, label: 'Bronze Rider', image: 'images/medals/bronze.png', iconType: 'photo', color: '#B45309' },
    { min: 6, label: 'Silver Rider', image: 'images/medals/silver.png', iconType: 'photo', color: '#64748B' },
    { min: 10, label: 'Gold Rider', image: 'images/medals/gold.png', iconType: 'photo', color: '#D97706' },
    { min: 20, label: 'Diamond Rider', image: 'images/medals/diamond.png', iconType: 'photo', color: '#2563EB' },
  ];
  let current = tiers[0];
  let next = null;
  for (let i = 0; i < tiers.length; i++) {
    if (completed >= tiers[i].min) {
      current = tiers[i];
      next = tiers[i + 1] || null;
    }
  }
  const progressPct = next
    ? Math.min(100, Math.round(((completed - current.min) / (next.min - current.min)) * 100))
    : 100;
  return {
    label: current.label,
    image: current.image,
    iconType: current.iconType,
    color: current.color,
    nextAt: next ? next.min : null,
    nextLabel: next ? next.label : null,
    progressPct,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/rider-tier.test.js`
Expected: PASS, all 7 tests (5 existing + 2 new) green.

- [ ] **Step 5: Commit**

```bash
git add js/rider-tier.js tests/unit/rider-tier.test.js
git commit -m "feat: rider-tier returns image/iconType instead of emoji"
```

---

### Task 4: Generate the 4 medal images

**Files:**
- Create: `images/medals/bronze.png`
- Create: `images/medals/silver.png`
- Create: `images/medals/gold.png`
- Create: `images/medals/diamond.png`

**Interfaces:**
- Consumes: nothing (independent of code, only needs the file paths from Task 3 to already be decided, which they are).
- Produces: 4 image files at the exact paths Task 3 and Task 5 reference.

- [ ] **Step 1: Confirm the image tool is configured**

Call `mcp__nano-banana__get_configuration_status` - expected: Gemini API token configured (already confirmed once this session).

- [ ] **Step 2: Generate Bronze**

Call `mcp__nano-banana__generate_image` with:

```
A single bronze medal for a bicycle mechanic loyalty program, studio product
photography on a transparent background, medal hangs straight on a short
grosgrain ribbon in electric blue (#2563EB), medal face has an embossed
bicycle wheel with spokes in the center surrounded by a laurel wreath border,
brushed bronze metal texture, dramatic three-point studio lighting from the
upper left with a soft rim light, subtle specular highlights on the metal,
photographed at a slight three-quarter angle, photorealistic, high detail,
square framing, no text, no watermark
```

Save the result to `images/medals/bronze.png`.

- [ ] **Step 3: Generate Silver**

Call `mcp__nano-banana__generate_image` with the same prompt as Step 2, replacing "bronze medal"/"brushed bronze metal texture" with "silver medal"/"brushed silver metal texture", ribbon color unchanged (#2563EB). Save to `images/medals/silver.png`.

- [ ] **Step 4: Generate Gold**

Same prompt template, "gold medal"/"polished gold metal texture". Save to `images/medals/gold.png`.

- [ ] **Step 5: Generate Diamond**

Call `mcp__nano-banana__generate_image` with:

```
A single medal for a bicycle mechanic loyalty program's top tier, studio
product photography on a transparent background, medal hangs straight on a
short grosgrain ribbon in electric blue (#2563EB), medal face is cut from
faceted clear diamond/crystal material with an embossed bicycle wheel visible
through the facets, dramatic three-point studio lighting from the upper left
producing prism-like light refractions inside the crystal, subtle specular
highlights, photographed at a slight three-quarter angle matching a bronze/
silver/gold medal set, photorealistic, high detail, square framing, no text,
no watermark
```

Save to `images/medals/diamond.png`.

- [ ] **Step 6: Verify**

Run: `ls -la images/medals/` (bash) - expected: 4 files, all non-zero size, `bronze.png`/`silver.png`/`gold.png`/`diamond.png`. Open each in the preview (e.g. navigate the browser tab to `http://localhost:<port>/images/medals/bronze.png` via `preview_eval` `window.open` or just trust the file listing plus a visual spot-check on one) - confirm transparent background (not a white/checkerboard square) and that all 4 share the same angle/lighting/framing so they read as one consistent set.

- [ ] **Step 7: Commit**

```bash
git add images/medals/
git commit -m "feat: add photorealistic medal renders for rider tiers"
```

---

### Task 5: `createTierBadge()` shared component

**Files:**
- Modify: `js/components.js`

**Interfaces:**
- Consumes: the `riderTier` object shape from Task 3 (`{ label, image, iconType, color, nextAt, nextLabel, progressPct }`).
- Produces: `createTierBadge(riderTier, size)` where `size` is `'sm'` (18px icon, no label - for the Home nav) or `'lg'` (40px icon + label text, no progress bar - Profile builds its own progress bar around this). Consumed by Task 7 (Home) and Task 8 (Profile).

- [ ] **Step 1: Implement**

Add to `js/components.js`, after `createStarRating` (end of file):

```js

// ── Rider Tier Badge ──────────────────────────────────────────────────────────
// size: 'sm' = icon only (nav, 18px) | 'lg' = icon + label (Profile card, 40px)
export function createTierBadge(riderTier, size = 'sm') {
  const { label, image, iconType, color } = riderTier;
  const px = size === 'lg' ? 40 : 18;
  const iconHTML =
    iconType === 'mask'
      ? `<span style="display:inline-block;width:${px}px;height:${Math.round(px * 0.7)}px;background-color:${color};-webkit-mask:url('${image}') center/contain no-repeat;mask:url('${image}') center/contain no-repeat;flex-shrink:0"></span>`
      : `<img src="${image}" alt="" width="${px}" height="${px}" style="width:${px}px;height:${px}px;object-fit:contain;flex-shrink:0">`;

  if (size === 'sm') {
    return `<span class="tier-badge tier-badge--sm">${iconHTML}</span>`;
  }

  return `
<span class="tier-badge tier-badge--lg" style="display:inline-flex;align-items:center;gap:10px">
  ${iconHTML}
  <span class="tier-badge__label" style="font-size:14px;font-weight:700;color:#0D1F3C">${label}</span>
</span>`;
}
```

Note: `alt=""` on the photo medals is intentional - the label text next to it (or the surrounding context in Home's nav) already conveys the meaning, so the decorative medal image doesn't need redundant alt text (per `ui-ux-pro-max` accessibility guidance, decorative images get empty alt, not missing alt).

- [ ] **Step 2: Manual verification**

This function returns an HTML string with no DOM/browser API access, same category as the rest of `components.js` (none of which have unit tests in this project - `createServiceCard`, `createBookingCard`, etc. are all verified visually, not via Vitest). Verify by calling it once from the browser console after starting the preview: `preview_eval` with:

```js
import('/js/components.js').then(m => import('/js/rider-tier.js').then(rt => {
  document.body.insertAdjacentHTML('beforeend', m.createTierBadge(rt.getRiderTier(5), 'lg'));
}));
```

Confirm via `preview_snapshot` that a Bronze medal image + "Bronze Rider" text appears appended to the page, then reload to discard it (this was a scratch check, not a real usage site yet - those come in Tasks 7-8).

- [ ] **Step 3: Commit**

```bash
git add js/components.js
git commit -m "feat: add createTierBadge shared component"
```

---

### Task 6: Home - elevation + hierarchy pass on existing cards

**Files:**
- Modify: `css/home.css`
- Modify: `index.html:376-419` (membership cards - inline styles to classes)

**Interfaces:**
- Consumes: `--elevation-0/1`, `--motion-fast` from Task 1.
- Produces: `.plan-card`/`.plan-card--featured` classes, used only in `index.html`'s memberships section.

- [ ] **Step 1: `.service-card` hover-lift**

In `css/home.css`, replace the existing `.service-card` and `.service-card:hover` rules:

```css
[data-screen='home'] .service-card {
  padding: 20px;
  border-radius: 12px;
  border: 1px solid var(--border);
  transition:
    border-color 150ms ease,
    background 150ms ease;
  background: #fff;
  cursor: pointer;
}
[data-screen='home'] .service-card:hover {
  border-color: var(--blue);
  background: var(--blue-light);
}
```

with:

```css
[data-screen='home'] .service-card {
  padding: 20px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: #fff;
  cursor: pointer;
  box-shadow: var(--elevation-0);
  transition:
    border-color 150ms ease,
    background 150ms ease,
    box-shadow var(--motion-fast),
    transform var(--motion-fast);
}
@media (hover: hover) {
  [data-screen='home'] .service-card:hover {
    border-color: var(--blue);
    background: var(--blue-light);
    box-shadow: var(--elevation-1);
    transform: translateY(-2px);
  }
}
[data-screen='home'] .service-card:active {
  transform: scale(0.97);
}
```

- [ ] **Step 2: `.review-card` resting elevation**

Replace `box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);` inside `.review-card` with `box-shadow: var(--elevation-0);` (same rule, just adopting the shared token - no other property changes).

- [ ] **Step 3: FAQ open/close motion**

In `css/home.css`, the `.faq-item` rule currently has no transition on open. Add, right after the existing `.faq-q::after` rules (the `+`/`-` marker swap):

```css
[data-screen='home'] .faq-a {
  padding: 0 18px 16px;
  font-size: 13px;
  color: var(--gray);
  line-height: 1.6;
  animation: faqOpen var(--motion-fast);
}
@keyframes faqOpen {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

(Check first whether `.faq-a` already has a padding/font-size rule elsewhere in the file - if so, only add the `animation` line to the existing rule instead of duplicating the block. Search `grep -n "faq-a" css/home.css` before editing.)

- [ ] **Step 4: Extract membership cards into a class**

In `css/home.css`, add a new section (near the memberships-related rules, or at the end of the file):

```css
/* ── Membership plan cards ─────────────────────────────────────────────────── */
[data-screen='home'] .plan-card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 28px;
  box-shadow: var(--elevation-0);
  transition:
    box-shadow var(--motion-fast),
    transform var(--motion-fast);
}
[data-screen='home'] .plan-card--featured {
  border: 2px solid var(--blue);
  position: relative;
}
@media (hover: hover) {
  [data-screen='home'] .plan-card:hover {
    box-shadow: var(--elevation-1);
    transform: translateY(-2px);
  }
}
```

In `index.html`, update the 3 membership card `<div>`s (lines 378, 391, 406) to use the class instead of inline `background`/`border`/`border-radius`/`padding`:

Line 378, from:
```html
<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:28px">
```
to:
```html
<div class="plan-card">
```

Line 391, from:
```html
<div style="background:#fff;border:2px solid var(--blue);border-radius:12px;padding:28px;position:relative">
```
to:
```html
<div class="plan-card plan-card--featured">
```

Line 406, from:
```html
<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:28px">
```
to:
```html
<div class="plan-card">
```

- [ ] **Step 5: Manual verification**

Start the preview, open Home, `preview_resize` to 375px width. `preview_snapshot` the services grid, testimonials, and memberships sections. Confirm: every service name/price fits on one line or wraps cleanly (no clipped text), the "Most Popular" badge on the Standard plan still sits centered above its card, hovering a service card (desktop viewport, `preview_resize` to `desktop` preset) lifts it without any text overflowing the card edge. Check `preview_console_logs` for errors.

- [ ] **Step 6: Commit**

```bash
git add css/home.css index.html
git commit -m "feat: elevation + hierarchy pass on Home cards"
```

---

### Task 7: Home - tier badge in nav + i18n split for the greeting

**Files:**
- Modify: `index.html:103` (`#home-mobile-auth-btn`)
- Modify: `index.html:120-123` (`#home-nav-auth-btn`)
- Modify: `js/app.js:3487-3511` (`updateHomeNav`)
- Modify: `js/i18n.js` (`dict.es`/`dict.zh`)

**Interfaces:**
- Consumes: `getRiderTier` (Task 3), `createTierBadge` (Task 5).
- Produces: nothing new consumed by later tasks - this is the last piece of the Home screen for this phase.

- [ ] **Step 1: Import `createTierBadge` into `app.js`**

`js/app.js:57-68` already imports several named exports from `./components.js`. Add `createTierBadge` to that list:

```js
import {
  createHeader,
  createBottomNav,
  createServiceCard,
  formatServiceDuration,
  createTimeSlot,
  createDateItem,
  createSummaryRow,
  createBookingCard,
  createEmptyState,
  showToast,
  createTierBadge,
} from './components.js';
```

- [ ] **Step 2: Split "Hi, {name}" into two nodes**

In `index.html` line 103, current:
```html
<a href="#login" id="home-mobile-auth-btn" style="background:#2563EB;color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;min-height:36px;display:inline-flex;align-items:center"><span>Sign In</span></a>
```
Change the inner content to also carry a spot for the icon and a two-node label, so `updateHomeNav` can fill both independently:
```html
<a href="#login" id="home-mobile-auth-btn" style="background:#2563EB;color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;min-height:36px;display:inline-flex;align-items:center;gap:6px"><span id="home-mobile-auth-icon"></span><span id="home-mobile-auth-label">Sign In</span></a>
```

In `index.html` lines 120-123, current:
```html
        <a href="#login" id="home-nav-auth-btn" class="home-nav-book">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span>Sign In</span>
        </a>
```
Change to give the icon and label stable ids too:
```html
        <a href="#login" id="home-nav-auth-btn" class="home-nav-book">
          <span id="home-nav-auth-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
          <span id="home-nav-auth-label">Sign In</span>
        </a>
```

- [ ] **Step 3: Rewrite `updateHomeNav` to split the greeting and render the tier icon**

Current (`js/app.js:3487-3511`):
```js
async function updateHomeNav() {
  const btns = [
    document.getElementById('home-nav-auth-btn'),
    document.getElementById('home-mobile-auth-btn'),
  ].filter(Boolean);
  if (!btns.length) return;
  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    for (const btn of btns) {
      const label = btn.querySelector('span');
      if (user) {
        const name = (user.user_metadata?.full_name || user.email || '')
          .split('@')[0]
          .split(' ')[0];
        if (label) label.textContent = 'Hi, ' + name;
        btn.href = '#profile';
      } else {
        if (label) label.textContent = 'Sign In';
        btn.href = '#login';
      }
    }
  } catch {}
}
```

Replace with:
```js
async function updateHomeNav() {
  const targets = [
    { icon: 'home-nav-auth-icon', label: 'home-nav-auth-label', btn: 'home-nav-auth-btn' },
    { icon: 'home-mobile-auth-icon', label: 'home-mobile-auth-label', btn: 'home-mobile-auth-btn' },
  ]
    .map((t) => ({
      iconEl: document.getElementById(t.icon),
      labelEl: document.getElementById(t.label),
      btnEl: document.getElementById(t.btn),
    }))
    .filter((t) => t.btnEl);
  if (!targets.length) return;

  try {
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      targets.forEach(({ labelEl, btnEl }) => {
        if (labelEl) labelEl.textContent = 'Sign In';
        btnEl.href = '#login';
      });
      return;
    }

    const name = (user.user_metadata?.full_name || user.email || '')
      .split('@')[0]
      .split(' ')[0];

    targets.forEach(({ labelEl, btnEl }) => {
      if (labelEl) {
        labelEl.innerHTML = '';
        labelEl.append(document.createTextNode('Hi, '), document.createTextNode(name));
      }
      btnEl.href = '#profile';
    });

    let completedJobs = 0;
    try {
      const myBookings = await getMyBookings();
      completedJobs = (myBookings || []).filter((b) => b.status === 'completed').length;
    } catch {}
    const riderTier = getRiderTier(completedJobs);

    // Both nav slots show the same small tier icon - desktop's nav swaps out
    // its generic person SVG for it, mobile's bar gets one for the first time.
    targets.forEach(({ iconEl }) => {
      if (iconEl) iconEl.innerHTML = createTierBadge(riderTier, 'sm');
    });
  } catch {}
}
```

Note: `'Hi, '` is appended as its own `TextNode` and `name` as a second one, so the "Hi," text node's value is the exact literal `Hi, ` (with trailing space) - update the dict key accordingly in Step 5 to match exactly.

- [ ] **Step 4: Re-run on language change**

Find where `renderProfile` (or another handler) currently listens for language changes - search `grep -n "langchange" js/app.js`. Add `updateHomeNav()` to that same listener (or add a new `document.addEventListener('langchange', updateHomeNav)` near where `updateHomeNav()` is first called) so the Home greeting/tier badge re-renders in the new language immediately instead of waiting for the next navigation.

- [ ] **Step 5: i18n**

In `js/i18n.js`, add to `dict.es` (Home screen section):
```js
    'Hi, ': 'Hola, ',
    'New Rider': 'Ciclista Nuevo',
    'Bronze Rider': 'Ciclista Bronce',
    'Silver Rider': 'Ciclista Plata',
    'Gold Rider': 'Ciclista Oro',
    'Diamond Rider': 'Ciclista Diamante',
```
Add to `dict.zh` (same keys, best-effort, does not block the phase):
```js
    'New Rider': '新骑手',
    'Bronze Rider': '青铜骑手',
    'Silver Rider': '白银骑手',
    'Gold Rider': '黄金骑手',
    'Diamond Rider': '钻石骑手',
```

- [ ] **Step 6: Manual verification**

Preview, log in as a test user with at least 1 completed booking (or temporarily call `getRiderTier(5)` in the console if no such user is handy), reload Home. Via `preview_snapshot`: confirm the icon in both the mobile top bar and the desktop nav (resize to `desktop` preset) shows the tier icon instead of the generic person icon, and the label reads "Hi, {first name}". Switch language to Spanish from Profile, navigate back to Home, confirm "Hola, {name}" and the tier label (if visible anywhere nearby) is in Spanish. Switch to `zh`, confirm no crash and English fallback only where `dict.zh` has no entry (expected, documented behavior). Check `preview_console_logs` for errors the whole time.

- [ ] **Step 7: Commit**

```bash
git add index.html js/app.js js/i18n.js
git commit -m "feat: rider tier icon in Home nav, split greeting for i18n"
```

---

### Task 8: Profile redesign

**Files:**
- Modify: `js/app.js:2804-3048` (`renderProfile`)
- Modify: `js/i18n.js` (`dict.es`/`dict.zh`)

**Interfaces:**
- Consumes: `getRiderTier` (Task 3), `createTierBadge` (Task 5).

- [ ] **Step 1: Tier card - use `createTierBadge` + elevation**

In `renderProfile` (`js/app.js`), current tier card block:
```js
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:16px;margin-top:16px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <span style="font-size:26px">${riderTier.emoji}</span>
          <div>
            <div style="font-size:14px;font-weight:700;color:#0D1F3C">${riderTier.label}</div>
            <div style="font-size:12px;color:#6B7280">${completedJobs} service${completedJobs === 1 ? '' : 's'} completed</div>
          </div>
        </div>
        ${
          riderTier.nextAt
            ? `<div style="height:6px;background:#F3F4F6;border-radius:4px;overflow:hidden;margin-bottom:6px">
                 <div style="height:100%;width:${riderTier.progressPct}%;background:${riderTier.color};border-radius:4px"></div>
               </div>
               <div style="font-size:12px;color:#6B7280">${riderTier.nextAt - completedJobs} more service${riderTier.nextAt - completedJobs === 1 ? '' : 's'} to reach ${riderTier.nextLabel}</div>`
            : `<div style="font-size:12px;color:#6B7280">You've reached our highest tier — thank you for riding with us!</div>`
        }
      </div>
```

Replace with:
```js
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:16px;margin-top:16px;box-shadow:var(--elevation-0)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          ${createTierBadge(riderTier, 'lg')}
          <div style="font-size:12px;color:#6B7280"><span>${completedJobs}</span> <span>${completedJobs === 1 ? 'service completed' : 'services completed'}</span></div>
        </div>
        ${
          riderTier.nextAt
            ? `<div style="height:6px;background:#F3F4F6;border-radius:4px;overflow:hidden;margin-bottom:6px">
                 <div style="height:100%;width:${riderTier.progressPct}%;background:${riderTier.color};border-radius:4px;transition:width var(--motion-base)"></div>
               </div>
               <div style="font-size:12px;color:#6B7280"><span>${riderTier.nextAt - completedJobs}</span> <span>${riderTier.nextAt - completedJobs === 1 ? 'more service to reach' : 'more services to reach'}</span> <span>${riderTier.nextLabel}</span></div>`
            : `<div style="font-size:12px;color:#6B7280">You've reached our highest tier - thank you for riding with us!</div>`
        }
      </div>
```

(Note: `createTierBadge(riderTier, 'lg')` already renders the label next to the icon, so the old standalone `riderTier.label` div is gone - it's now inside the badge. The "N services completed" line moved to its own row below, count and label already split into two spans.)

- [ ] **Step 2: Referral share button icon/text split**

Current:
```js
          <a href="https://wa.me/?text=${shareMsg}" target="_blank" style="background:#25D366;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;text-decoration:none;display:flex;align-items:center;gap:6px">📱 Share</a>
```
Replace with:
```js
          <a href="https://wa.me/?text=${shareMsg}" target="_blank" style="background:#25D366;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;text-decoration:none;display:flex;align-items:center;gap:6px"><span aria-hidden="true">📱</span><span>Share</span></a>
```

- [ ] **Step 3: Membership card - split plan name from "Plan", add elevation**

Current (inside the membership ternary):
```js
          <div style="background:linear-gradient(135deg,${planColor},#1848C8);border-radius:16px;padding:18px;color:#fff;margin-bottom:10px">
            <div style="font-size:11px;font-weight:700;opacity:0.7;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Membership</div>
            <div style="font-size:20px;font-weight:800">${planLabel} Plan</div>
            <div style="margin-top:8px">${statusBadge}</div>
          </div>
```
Replace with:
```js
          <div style="background:linear-gradient(135deg,${planColor},#1848C8);border-radius:16px;padding:18px;color:#fff;margin-bottom:10px;box-shadow:var(--elevation-1)">
            <div style="font-size:11px;font-weight:700;opacity:0.7;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Membership</div>
            <div style="font-size:20px;font-weight:800"><span>${planLabel}</span> <span>Plan</span></div>
            <div style="margin-top:8px">${statusBadge}</div>
          </div>
```
And the two buttons right below:
```js
            <button id="membership-toggle-btn" style="flex:1;padding:10px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;border:1.5px solid ${isPaused ? '#059669' : '#D97706'};color:${isPaused ? '#059669' : '#D97706'};background:#fff">
              ${isPaused ? 'Resume membership' : 'Pause membership'}
            </button>
            <button id="membership-cancel-btn" style="flex:1;padding:10px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;border:1.5px solid #E5E7EB;color:#6B7280;background:#fff">Cancel</button>
```
add `transition:transform var(--motion-fast)` and an `:active{transform:scale(0.97)}` cannot be expressed inline - instead add a shared class. Add `class="btn-press"` to both buttons (`id="membership-toggle-btn" class="btn-press" style="..."` and `id="membership-cancel-btn" class="btn-press" style="..."`), and add once to `css/main.css`:
```css
.btn-press:active {
  transform: scale(0.97);
}
```
(Search `grep -n "btn-press" css/main.css js/app.js` first - if a similar press-state class already exists from a previous session, reuse it instead of adding a duplicate.)

- [ ] **Step 4: i18n**

Add to `dict.es`:
```js
    'service completed': 'servicio completado',
    'services completed': 'servicios completados',
    'more service to reach': 'servicio mas para llegar a',
    'more services to reach': 'servicios mas para llegar a',
    "You've reached our highest tier - thank you for riding with us!":
      'Llegaste a nuestro nivel mas alto - gracias por andar con nosotros!',
    Membership: 'Membresia',
    Plan: 'Plan',
    Active: 'Activa',
    Paused: 'Pausada',
    'Resume membership': 'Reanudar membresia',
    'Pause membership': 'Pausar membresia',
    Cancel: 'Cancelar',
```
(`Share` already exists in `dict.es` from before this phase - confirm with `grep -n "Share:" js/i18n.js` rather than re-adding a duplicate key.)

- [ ] **Step 5: Manual verification**

Preview, navigate to Profile as a logged-in test user. `preview_snapshot`: tier card shows the medal image + label + "N services completed" on its own line + progress text, referral card's Share button still opens WhatsApp with the right prefilled text, membership card (if the test user has one) shows plan name + "Plan" + status badge with no visual gap from the split spans. Switch language to `es`: confirm every string above translates; switch back to `en`, confirm it restores exactly (this is the two-way check called out in the design spec). `preview_resize` to 375px: confirm nothing in the tier or membership cards clips.

- [ ] **Step 6: Commit**

```bash
git add js/app.js js/i18n.js css/main.css
git commit -m "feat: redesign Profile tier/referral/membership cards, fix i18n gaps"
```

---

### Task 9: Login - Google button hover to CSS

**Files:**
- Modify: `js/app.js:2352,2392-2398` (`renderLogin`)
- Modify: `css/main.css`

- [ ] **Step 1: Remove the inline JS hover, add a class**

Current:
```js
      <button type="button" id="google-btn" style="width:100%;padding:14px;min-height:48px;background:#fff;border:1.5px solid #E2E8F0;border-radius:10px;color:#0F172A;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:16px;transition:border-color 150ms ease,background 150ms ease">
```
Change to:
```js
      <button type="button" id="google-btn" class="google-btn" style="width:100%;padding:14px;min-height:48px;background:#fff;border:1.5px solid #E2E8F0;border-radius:10px;color:#0F172A;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:16px">
```
(dropped the inline `transition` - moves to the CSS class below, and the class handles hover directly instead of relying on JS to toggle inline `border-color`)

Remove entirely:
```js
  const googleBtn = screen.querySelector('#google-btn');
  googleBtn.addEventListener('mouseover', () => {
    googleBtn.style.borderColor = '#4285f4';
  });
  googleBtn.addEventListener('mouseout', () => {
    googleBtn.style.borderColor = '';
  });
```
(The `googleBtn` variable is still needed below for the click handler at the end of `renderLogin` - keep `const googleBtn = screen.querySelector('#google-btn');` as a single line where the removed block was, since `screen.querySelector('#google-btn').addEventListener('click', ...)` later in the function can keep re-querying, but simplest is to keep the one `const googleBtn = ...` line and reuse it for the click listener too instead of re-querying - check the existing click handler at the bottom of `renderLogin` and point it at the same `googleBtn` variable rather than a fresh `screen.querySelector('#google-btn')` call.)

- [ ] **Step 2: Add the CSS**

In `css/main.css`:
```css
.google-btn {
  transition:
    border-color var(--motion-fast),
    box-shadow var(--motion-fast);
}
@media (hover: hover) {
  .google-btn:hover {
    border-color: #4285f4;
  }
}
.google-btn:active {
  transform: scale(0.97);
}
```

- [ ] **Step 3: Manual verification**

Preview, open Login, `preview_resize` to `desktop`, hover the Google button (`preview_eval` dispatching a `mouseover` or using `preview_click` won't show hover state in a snapshot - instead use `preview_inspect` on `#google-btn` with `styles: ['border-color']` after simulating `:hover` isn't directly possible via these tools, so instead visually confirm via `preview_screenshot` while the mouse coordinates are over the button, or trust the CSS and confirm via `preview_inspect` that the class `.google-btn` is present and the old inline `mouseover` handler is gone from the rendered DOM (`preview_eval`: `document.querySelector('#google-btn').outeHTML` should show no inline `onmouseover`). Confirm clicking still triggers the Google OAuth flow (or at least doesn't throw - full OAuth can't be tested in preview without real credentials, so just confirm no console error on click via `preview_console_logs`).

- [ ] **Step 4: Commit**

```bash
git add js/app.js css/main.css
git commit -m "refactor: Login Google button hover moves from inline JS to CSS"
```

---

### Task 10: My Bookings - card elevation, bottom sheet, button press, i18n split

**Files:**
- Modify: `js/components.js` (`createBookingCard`)
- Modify: `css/main.css` (`.booking-card` hover, `.btn-press` reuse)
- Modify: `js/app.js:2473-2804` (`renderMyBookings`)
- Modify: `js/i18n.js`

- [ ] **Step 1: `.booking-card` elevation**

Search `grep -n "\.booking-card" css/main.css` to find the existing rule and add elevation without duplicating it:
```css
.booking-card {
  box-shadow: var(--elevation-0);
  transition:
    box-shadow var(--motion-fast),
    transform var(--motion-fast);
}
@media (hover: hover) {
  .booking-card:hover {
    box-shadow: var(--elevation-1);
    transform: translateY(-2px);
  }
}
.booking-card:active {
  transform: scale(0.98);
}
```
(If `.booking-card` already has a `box-shadow` or `transition` declared, merge into the existing rule instead of adding a second `.booking-card { }` block - CSS allows it but it's messier to read.)

- [ ] **Step 2: Bottom sheet becomes Nivel 2**

In `renderMyBookings`, the detail overlay panel:
```js
          <div id="detail-panel" style="background:#fff;border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;box-shadow:0 -8px 32px rgba(0,0,0,0.12)">
```
Change `box-shadow:0 -8px 32px rgba(0,0,0,0.12)` to `box-shadow:var(--elevation-2)`.

- [ ] **Step 3: "Book Again" icon split + press state**

Current:
```js
              ${booking.status === 'completed' ? '<button id="book-again-btn" class="btn btn--primary btn--full">↻ Book Again</button>' : ''}
```
Replace with:
```js
              ${booking.status === 'completed' ? '<button id="book-again-btn" class="btn btn--primary btn--full btn-press"><span aria-hidden="true">↻</span> <span>Book Again</span></button>' : ''}
```
Add `btn-press` to the other action buttons in the same block too (`track-live-btn`, `share-track-btn`, `reschedule-btn`, `cancel-booking-btn`, `book-again-btn` already covered above), e.g.:
```js
              ${booking.status === 'enroute' || booking.status === 'en_route' || booking.status === 'in_progress' ? '<button id="track-live-btn" class="btn btn--primary btn--full btn-press">Track Live</button>' : ''}
              ${booking.tracking_token ? '<button id="share-track-btn" class="btn btn--secondary btn--full btn-press">Share tracking link</button>' : ''}
              ${canCancel ? '<button id="reschedule-btn" class="btn btn--secondary btn--full btn-press">Reschedule</button>' : ''}
              ${canCancel ? '<button id="cancel-booking-btn" class="btn btn--danger btn--full btn-press">Cancel booking</button>' : ''}
```
(`.btn-press` class and its `:active { transform: scale(0.97) }` rule were added in Task 8, Step 3 - reuse it, do not redeclare.)

- [ ] **Step 4: i18n**

Replace the `'↻ Book Again': '↻ Reservar de nuevo',` line in `dict.es` with:
```js
    'Book Again': 'Reservar de nuevo',
```
(removes the now-dead combined-string key, adds the split one - grep for `'↻ Book Again'` first to confirm there's exactly one place producing that old combined string, which Step 3 just removed, so the old dict key would otherwise become dead weight).

- [ ] **Step 5: Manual verification**

Preview, open My Bookings with a test account that has at least one completed and one upcoming booking. `preview_snapshot` the list, hover a card (desktop viewport) and confirm lift. Click a completed booking, confirm the bottom sheet opens with a visibly stronger shadow than the list cards, click "Book Again" and confirm it still navigates to `book-service` with the right service preselected (check `preview_network` isn't needed here, just `preview_snapshot` after the click). Switch to `es`, reopen the sheet, confirm "Reservar de nuevo" renders (not "↻ Reservar de nuevo" - the icon and text are now separate nodes, dict only translates the text one).

- [ ] **Step 6: Commit**

```bash
git add js/components.js css/main.css js/app.js js/i18n.js
git commit -m "feat: My Bookings card elevation, Nivel 2 bottom sheet, i18n fix"
```

---

### Task 11: My Bikes - bike cards to shared elevation pattern

**Files:**
- Modify: `js/app.js:3051-3386` (`renderMyBikes`, `loadBikes`)

- [ ] **Step 1: Restyle the bike list card**

Current (inside `loadBikes`):
```js
        <div data-bike-id="${bike.id}" style="cursor:pointer;background:var(--color-surface);border-radius:14px;padding:16px;margin-bottom:12px;border:1px solid var(--color-border);display:flex;align-items:center;gap:14px">
```
Replace with:
```js
        <div data-bike-id="${bike.id}" style="cursor:pointer;background:#fff;border-radius:14px;padding:16px;margin-bottom:12px;border:1px solid var(--color-border);display:flex;align-items:center;gap:14px;box-shadow:var(--elevation-0);transition:box-shadow var(--motion-fast),transform var(--motion-fast)" class="bike-card">
```
(background changes from `var(--color-surface)` (off-white/gray) to `#fff` (white) so the new shadow reads clearly against the page background - the surrounding page background is already `--surface`, so a same-color card with only a border looked flat; this matches how `.booking-card`/`.service-card` are white-on-surface elsewhere in the app - not a new pattern, just applying the existing one here too.)

Add to `css/main.css`:
```css
@media (hover: hover) {
  .bike-card:hover {
    box-shadow: var(--elevation-1);
    transform: translateY(-2px);
  }
}
.bike-card:active {
  transform: scale(0.98);
}
```

- [ ] **Step 2: Add-bike form container gets resting elevation**

Current:
```js
      <div id="add-bike-form" style="display:none;margin-top:20px;background:var(--color-surface);border-radius:16px;padding:20px;border:1px solid var(--color-border)">
```
Add `box-shadow:var(--elevation-0)` to the style string (keep everything else unchanged):
```js
      <div id="add-bike-form" style="display:none;margin-top:20px;background:var(--color-surface);border-radius:16px;padding:20px;border:1px solid var(--color-border);box-shadow:var(--elevation-0)">
```

- [ ] **Step 3: "Save Bike"/"Cancel" buttons get press state**

Current:
```js
            <button id="cancel-bike-btn" class="btn btn--secondary" style="flex:1">Cancel</button>
            <button id="save-bike-btn" class="btn btn--primary" style="flex:1">Save Bike</button>
```
Add `btn-press`:
```js
            <button id="cancel-bike-btn" class="btn btn--secondary btn-press" style="flex:1">Cancel</button>
            <button id="save-bike-btn" class="btn btn--primary btn-press" style="flex:1">Save Bike</button>
```

- [ ] **Step 4: Manual verification**

Preview, open My Bikes with a test account with at least 2 bikes. `preview_snapshot`, hover a bike card (desktop viewport), confirm lift and that brand/model/color/year text on the second line doesn't wrap awkwardly or clip at 375px (`preview_resize`). Open "+ Add a Bike", confirm the form card now has a visible resting shadow. Add a bike, confirm it still saves (check `preview_network` for the Supabase insert succeeding, or `preview_snapshot` showing the new card appended).

- [ ] **Step 5: Commit**

```bash
git add js/app.js css/main.css
git commit -m "feat: My Bikes cards adopt shared elevation pattern"
```

---

### Task 12: Final integration - cache-busting, full checklist, deploy

**Files:**
- Modify: `sw.js:1-2`
- Modify: `index.html:36-38,648-651`

**Interfaces:**
- Consumes: everything from Tasks 1-11.

- [ ] **Step 1: Bump the service worker cache version**

`js/rider-tier.js` and `js/i18n.js` are imported by `js/app.js` via bare specifiers (`import { getRiderTier } from './rider-tier.js';`, no `?v=` query) and are **not** in `sw.js`'s `STATIC_ASSETS` precache list - the service worker's cache-first fetch handler matches any `.js` file by extension regardless of that list, and once a URL is cached it is never revalidated. Bumping the `?v=` query on `<script src="js/app.js?...">` does **not** bust the cache for these indirectly-imported files, since ES module relative imports resolve to a plain URL with no query string. The only mechanism that reliably busts everything (direct scripts, indirectly-imported modules, and images) is renaming the cache itself, which forces the `activate` handler to delete the old cache and let every asset re-fetch on next request.

In `sw.js`, current:
```js
const CACHE_STATIC = 'drbike-static-v23';
const CACHE_PAGES  = 'drbike-pages-v23';
```
Change to:
```js
const CACHE_STATIC = 'drbike-static-v24';
const CACHE_PAGES  = 'drbike-pages-v24';
```

- [ ] **Step 2: Bump `?v=` on the directly-referenced tags too (defense in depth, matches existing project convention)**

In `index.html`, current:
```html
  <link rel="stylesheet" href="css/variables.css?v=20260628">
  <link rel="stylesheet" href="css/main.css?v=20260628">
  <link rel="stylesheet" href="css/home.css?v=20260628">
```
```html
<script src="js/router.js?v=20260627"     type="module"></script>
<script src="js/supabase.js?v=20260629a"   type="module"></script>
<script src="js/components.js?v=20260704c" type="module"></script>
<script src="js/app.js?v=20260708a"        type="module"></script>
```
Change to (today's date, next letter suffix where a file already has today's date):
```html
  <link rel="stylesheet" href="css/variables.css?v=20260708">
  <link rel="stylesheet" href="css/main.css?v=20260708">
  <link rel="stylesheet" href="css/home.css?v=20260708">
```
```html
<script src="js/router.js?v=20260708"      type="module"></script>
<script src="js/supabase.js?v=20260629a"   type="module"></script>
<script src="js/components.js?v=20260708"  type="module"></script>
<script src="js/app.js?v=20260708b"        type="module"></script>
```
(`supabase.js` is untouched this phase, left as-is; `app.js` already reads `20260708a` from earlier today, per this plan's changes bump it to `20260708b`.)

- [ ] **Step 3: Full checklist**

Run in order, fixing anything red before moving to the next:

1. `npm run check`
2. `npm run lint`
3. `npx vitest run`
4. Preview server: `es` (default) walkthrough of Home, Profile, Login, My Bookings, My Bikes via `preview_snapshot`.
5. Switch to `en`, repeat the same 5-screen walkthrough.
6. Switch to `zh`, repeat - confirm no crash, English fallback only where `dict.zh` has no entry.
7. Switch back to `es` - confirm every string restores correctly (round-trip check).
8. `preview_resize` to 375px width on all 5 screens - confirm no clipped text/numbers, per Diego's explicit ask.
9. Confirm `.service-card`/`.service-name`/`.service-price` on Home still update from `js/live-prices.js` (watch `preview_network` for the Supabase `services` query, confirm price text matches).
10. `preview_console_logs` clean (no new errors) across all of the above.

- [ ] **Step 4: Commit the cache-busting changes**

```bash
git add sw.js index.html
git commit -m "chore: bump cache versions for Fase 0 rollout"
```

- [ ] **Step 5: Push and confirm in production**

```bash
git push origin main
```
Wait for the Vercel deploy to finish (check `mcp__4e3e7e36-851b-4b21-9669-04ab90a9fb09__list_deployments` or the Vercel dashboard), then repeat the Step 3 walkthrough against `https://drbikesydney.com.au` itself (not localhost) to confirm production matches what was verified in preview.
