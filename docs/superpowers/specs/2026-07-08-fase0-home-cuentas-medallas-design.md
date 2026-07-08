# Fase 0 - Mobile SPA: Home + Cuentas + Medallas realistas

## Goal

First phase of the full-app visual redesign (roadmap: Fase 0-7, mobile SPA first). Establish
the 3D-depth/motion design language for the whole project on the 5 screens users see most,
replace the gamification emoji medals with photorealistic renders, and close every language
gap these screens touch. Every later phase (booking flow, tracking, landing.html, mechanic.html,
track.html, admin.html) reuses the tokens and patterns defined here without inventing new ones.

Screens in scope (`index.html` data-screen + their `js/app.js` render functions):
`home` (static markup), `profile` (`renderProfile`), `login` (`renderLogin`),
`my-bookings` (`renderMyBookings`), `my-bikes` (`renderMyBikes`).

Out of scope: `book-service`/`service-summary`/`payment` (Fase 1), `tracking`/`review` (Fase 2,
do not touch PIN/tip logic), `landing.html`/`mechanic.html`/`track.html`/`admin.html`/suburb
pages (Fases 3-7).

## Architecture

### Elevation system (3 levels, new tokens in `css/variables.css`)

Added alongside the existing `--shadow-sm/md/lg` (not replacing them - those are still used
by `home.css` `.stat-mini`, migrated to the new tokens as part of this phase; other pages
using the old tokens are untouched since they're future phases):

```css
--elevation-0: 0 1px 2px rgba(13, 31, 60, 0.06);   /* resting cards */
--elevation-1: 0 8px 24px rgba(13, 31, 60, 0.12);  /* hover/active/selected, + translateY(-2px) */
--elevation-2: 0 24px 64px rgba(13, 31, 60, 0.18); /* modals, bottom sheets, overlays only */
--motion-fast: 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
--motion-base: 250ms cubic-bezier(0.4, 0, 0.2, 1);
```

Rules (no exceptions without asking first, per brief):
- No 4th level. No colored shadows - always the navy `rgba(13,31,60,X)`.
- Nivel 0 -> 1 transition (hover-lift) only inside `@media (hover: hover)` - never forced on touch.
- Buttons: `scale(0.97)` on `:active`, no transition (instant, not animated).
- List entrances (services grid, bookings list, bikes list): fade+slide-up, 40-60ms stagger,
  capped at the first 8 items - the rest render without animation.
- Screen-to-screen (`router.js`): outgoing screen fades back, incoming slides in, 250-300ms,
  `--motion-base` easing. Respects `prefers-reduced-motion` (falls back to instant cross-fade).

### Medal asset pipeline

`js/rider-tier.js` currently returns `{ label, emoji, color, nextAt, nextLabel, progressPct }`.
`emoji` is replaced with two fields so the renderer knows how to draw it:

```js
{ label, color, nextAt, nextLabel, progressPct, image, iconType }
// iconType: 'mask'  -> New Rider only, reuses images/bike-icon.png via the same
//                       currentColor mask trick already used in bottom-nav and My Bikes
// iconType: 'photo' -> Bronze/Silver/Gold/Diamond, plain <img>, no tint (renders own lighting)
```

New Rider stays a bike badge, not a medal (no achievement yet to reward - confirmed with Diego).
Bronze/Silver/Gold/Diamond get one AI-generated photorealistic render each (nano-banana /
Gemini image gen), same studio lighting and camera angle across all four so they read as one
consistent set, transparent background PNG, saved to `images/medals/{bronze,silver,gold,diamond}.png`.

Shared render helper added to `js/components.js`:
```js
export function createTierBadge(riderTier, size = 'sm') // 'sm' = 28px (Home), 'lg' = 40px (Profile)
```
Fixed-size container (`width/height` set, `object-fit: contain`) so the image can never distort
the layout or overflow while it loads - `width`/`height` attributes on the `<img>` itself too,
to reserve space and avoid layout shift.

### i18n discipline (applies to every string touched this phase)

Per the project rule: every translatable string in its own text node, dynamic values (counts,
names, prices) in a separate `<span>` from the static label around them. Concrete fixes found
by reading the current code (not hypothetical - these are live gaps):

| Location | Current (broken or missing) | Fix |
|---|---|---|
| `renderProfile` referral card, `📱 Share` link | Emoji + text in one node; dict only has `Share` | Split into icon span + `Share` text span |
| `renderProfile` tier card, `"${completedJobs} service(s) completed"` | Count glued to label, never matches a dict key | Count in its own span; label becomes literal `service completed` / `services completed` (two dict keys, chosen in JS like today) |
| `renderProfile` tier card, `"${nextAt-completedJobs} more service(s) to reach ${nextLabel}"` | Two dynamic values + label in one node | Count span + static `more service(s) to reach` span(s) + `nextLabel` span (tier labels are already translated strings, see below) |
| `renderProfile` membership card, `"${planLabel} Plan"` | Plan name glued to `Plan` | Plan name span + `Plan` text span |
| `updateHomeNav`, `'Hi, ' + name` | Greeting glued to name | `Hi,` span + name span |
| Tier labels (`New Rider`/`Bronze Rider`/`Silver Rider`/`Gold Rider`/`Diamond Rider`) | Not in `dict.es`/`dict.zh` at all - currently show in English regardless of language | Add to both dicts |
| Membership labels (`Membership`, `Active`, `Paused`, `Resume membership`, `Pause membership`, `Cancel`, `Plan`) | Not in `dict.es` | Add |

All new/changed strings go into `dict.es` in `js/i18n.js` (organized by screen, matches existing
comments). `dict.zh` is partial project-wide - fill what's reasonable, does not block the phase.

## Changes by file

### `css/variables.css`
Add the elevation/motion tokens above. No removals.

### `js/router.js`
`render()`: wrap the screen swap in the slide+fade transition. Check `matchMedia('(prefers-reduced-motion: reduce)')` once and skip the animated path if true.

### `css/home.css` + `index.html` (home screen)
- `.service-card` (6 cards): add Nivel 0 -> 1 on hover under `hover:hover`. Do not rename `.service-name`/`.service-price` - `js/live-prices.js` depends on those exact selectors for live price sync.
- `.stat-mini` (About section mini-stats): migrate `box-shadow: var(--shadow-sm)` to `var(--elevation-0)`.
- `.review-card` x3, membership cards, FAQ accordion: apply the same hierarchy rules already in `drbike-design` (bold navy title / gray subtitle, never equal weight) - structural HTML unchanged, style pass only.
- New: tier badge preview near `#home-nav-auth-btn`/`#home-mobile-auth-btn` (only rendered when a user is logged in), using `createTierBadge(riderTier, 'sm')`.

### `js/app.js`
- `renderProfile`: tier card redesigned (elevation system + `createTierBadge(riderTier, 'lg')` in place of the emoji span), referral card, stats grid, membership card, language switcher restyled per elevation rules; i18n fixes from the table above.
- `renderLogin`: Google button hover moves from inline `mouseover`/`mouseout` JS to a CSS `:hover` rule under `hover:hover`.
- `renderMyBookings`: `booking-card` gets Nivel 0 -> 1; the detail bottom sheet becomes Nivel 2 (floating); action buttons get the press-scale.
- `renderMyBikes`: bike list cards move off ad-hoc inline styles onto the same card pattern as the rest of the phase; `#predicted-service-card` (already i18n-safe, icon/label already separated) - style pass only, no structural change.
- `updateHomeNav`: split `'Hi, ' + name` into two nodes; call the new tier-badge render for Home.

### `js/rider-tier.js`
`emoji` field replaced with `image` + `iconType` per tier (see Architecture). Pure function, no DOM - stays unit-testable.

### `js/components.js`
New `createTierBadge(riderTier, size)` export, used by both Home and Profile.

### `js/i18n.js`
`dict.es` additions per the table above (tier labels, membership labels, split-node fragments). `dict.zh`: add tier labels + membership labels where practical.

### New assets
`images/medals/bronze.png`, `silver.png`, `gold.png`, `diamond.png` - AI-generated, transparent background, consistent lighting/angle.

## Edge Cases

- **0 completed jobs (New Rider):** bike-badge icon, not a blank/gray medal - already the plan.
- **Exactly at a tier threshold** (e.g. completedJobs === 3): `getRiderTier` already handles this (`>=`), unaffected by the field rename.
- **Medal image slow to load:** fixed `width`/`height` on the `<img>` prevents layout shift; a 1px `--elevation-0` bordered container shows while loading.
- **`prefers-reduced-motion`:** screen transitions and list stagger both fall back to instant/no animation. Hover-lift still applies (it's not a motion-sickness trigger, it's gated by `hover:hover` instead).
- **Logged-out Home:** no tier badge preview rendered (matches the existing `updateHomeNav` pattern of Sign In vs Hi-name).
- **Language mid-session:** switching language on Profile already re-renders via `renderProfile()`; Home's new badge needs the same re-render wired to the `langchange` event so it doesn't stay stuck in the previous language until next navigation.

## Testing

1. `npm run check`, `npm run lint`, `npm test` (covers `tests/unit/rider-tier.test.js` - update
   any assertion that touched the old `emoji` field, none currently do).
2. Preview each of the 5 screens in `es` (default), switch to `en`, switch to `zh`, back to `es`
   - confirm every string touched this phase translates both directions, `preview_snapshot` over
   `preview_screenshot`.
3. Confirm `.service-card`/`.service-name`/`.service-price` still update from `js/live-prices.js`
   (no selector renamed).
4. Resize to 375px width and check the longest real content (longest service name/price, longest
   membership plan label, 2-digit vs 1-digit rider counts) - nothing clipped or overflowing its card.
5. `prefers-reduced-motion` on (via `preview_resize` color-scheme/media emulation or OS setting) -
   confirm transitions degrade gracefully, nothing breaks.

## Files Modified

| File | Change |
|---|---|
| `css/variables.css` | New elevation/motion tokens |
| `js/router.js` | Screen transition |
| `css/home.css` | Elevation on service-card/stat-mini, hierarchy pass on review/membership/FAQ |
| `index.html` | New tier badge container near home nav |
| `js/app.js` | `renderProfile`, `renderLogin`, `renderMyBookings`, `renderMyBikes`, `updateHomeNav` |
| `js/rider-tier.js` | `emoji` -> `image` + `iconType` |
| `js/components.js` | New `createTierBadge()` |
| `js/i18n.js` | `dict.es`/`dict.zh` additions |
| `images/medals/*.png` | New (generated) |
| `tests/unit/rider-tier.test.js` | Verify still green after field rename |
