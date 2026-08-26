// tests/unit/dark-mode-really.test.js
//
// The first attempt at dark mode gave every token a dark value and passed its
// own check comfortably. Diego looked at it and said: "modo oscuro sigue igual
// de pedorro no se entiende nada todo es azul".
//
// He was reading a real number off the screen. The page was #0f1a2e and the
// card #152035 - a contrast ratio of 1.07. The same colour twice. Every card,
// row and panel dissolved into one flat navy field.
//
// The check measured INK against grounds (14:1 on the card, comfortably) and
// never measured the grounds against EACH OTHER, so nothing noticed that a card
// had no edge. Readable text on an invisible card is still an invisible card.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const vars = read('css/variables.css');
const guard = read('scripts/dark-theme-check.mjs');
const admin = read('js/admin.js');
const adminCss = read('css/admin.css');
const mech = read('js/mechanic.js');
const mechCss = read('css/mechanic.css');
const auth = read('api/auth.js');
const inline = read('js/landing-inline.js');
const landingCss = read('css/landing.css');
const mainCss = read('css/main.css');

const dark = vars.match(/\[data-theme='dark'\]\s*\{([\s\S]*?)^\}/m)?.[1] ?? '';
const tok = (name) => dark.match(new RegExp('(?:^|;|\\{)\\s*' + name + '\\s*:\\s*([^;]+);', 'm'))?.[1]?.trim();

const rgb = (h) => {
  const v = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
};
const lum = (c) =>
  c
    .map((x) => {
      const s = x / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    })
    .reduce((a, v, i) => a + [0.2126, 0.7152, 0.0722][i] * v, 0);
const ratio = (a, b) => {
  const l1 = lum(rgb(a));
  const l2 = lum(rgb(b));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

describe('the surfaces are actually different colours', () => {
  it('the page is its own token, not a literal buried in admin.css', () => {
    expect(tok('--app')).toBeTruthy();
    expect(vars).toMatch(/--app: #f8fafc;/);
    expect(adminCss).not.toMatch(/background: #0f1a2e/);
    expect(adminCss).toMatch(/\[data-theme='dark'\] body \{\s*\r?\n?\s*background: var\(--app\)/s);
  });

  // The number Diego was looking at. 1.07 is not a difference.
  it('the card separates from the page', () => {
    expect(ratio(tok('--app'), tok('--white'))).toBeGreaterThanOrEqual(1.15);
  });

  it('and the sunken panel separates from the card', () => {
    expect(ratio(tok('--white'), tok('--off'))).toBeGreaterThanOrEqual(1.12);
  });

  // The other half of "no se notan los cuadros": even where two grounds differ,
  // the edge has to carry on its own.
  it('the borders are visible, not hairlines', () => {
    const border = tok('--border');
    const alpha = Number(border.match(/([\d.]+)\)$/)?.[1]);
    expect(alpha).toBeGreaterThanOrEqual(0.2);
  });

  // The mechanic page painted itself with --off, which is the panel INSIDE a
  // card - so the background was lighter than the cards on top of it.
  it('the mechanic page uses the page token, not the panel', () => {
    expect(mechCss).toMatch(/body \{[^}]*background: var\(--app\)/s);
  });

  // Inverting it made every toast white text on a near-white pill.
  it('the toast pill stays dark in both themes', () => {
    expect(tok('--navy2')).toMatch(/#24354f/);
    expect(guard).toMatch(/'--navy2',/);
  });
});

describe('the guard now measures what it missed', () => {
  it('it checks ground against ground', () => {
    expect(guard).toMatch(/const GROUND_STEPS = \[/);
    expect(guard).toMatch(/they read as the same colour and a card stops looking like a card/);
  });

  // A token only themes a colour written AS a token. This is the rule that
  // turns the whole class of bug from whack-a-mole into a build failure.
  it('and it fails on literals in the two dark-capable files', () => {
    expect(guard).toMatch(/const DARK_SURFACES = \['js\/mechanic\.js', 'js\/admin\.js'\];/);
    expect(guard).toMatch(/which no theme can reach/);
  });

  // The printed report is a window.open('') document that never loads
  // css/variables.css, so its literals are correct and must opt out by name.
  it('with an explicit, named opt-out for what genuinely cannot use tokens', () => {
    expect(guard).toMatch(/dark-theme-check: off/);
    expect(admin).toMatch(/dark-theme-check: off/);
    expect(admin).toMatch(/dark-theme-check: on/);
  });
});

describe('the third dark-mode mechanism is gone', () => {
  // applyDarkModeInline() walked the DOM on a timer and forced a NEUTRAL
  // palette (#242426, #8E8E93) while the tokens paint navy - two different
  // darks on one screen. It also only ever covered elements that existed at the
  // moment it ran, which is why it needed eight call sites and still missed
  // things.
  it('applyDarkModeInline no longer exists or runs', () => {
    expect(admin).not.toMatch(/^function applyDarkModeInline\(\)/m);
    expect(admin).not.toMatch(/setTimeout\(applyDarkModeInline/);
    expect(admin).not.toMatch(/^\s*applyDarkModeInline\(\);/m);
  });

  it('and the note explains why, where it used to be', () => {
    expect(admin).toMatch(/It was the THIRD dark-mode mechanism in this app/);
  });

  // These matched a colour by the TEXT of a style attribute. They only ever
  // worked while the JS wrote that exact string, and they are unnecessary once
  // the token itself is right.
  it('no [style*=] colour rules are left in admin.css', () => {
    expect(adminCss).not.toMatch(/\[style\*=/);
  });
});

describe('the literals that produced "todo es azul"', () => {
  // Near-black ink on a navy page: every day except today was unreadable in the
  // Agenda, which is the screen Diego had open.
  it('the Agenda day headings use a token', () => {
    expect(mech).toMatch(/color:\$\{isToday \? 'var\(--blue\)' : 'var\(--navy\)'\}/);
  });

  // A 3% BLACK wash is a faint grey box on white and nothing at all on navy.
  it('and its empty rows have a real surface and a real edge', () => {
    expect(mech).toMatch(
      /background:var\(--off\);border:1px solid var\(--border-lt\);border-radius:8px;text-align:center[^"]*">No jobs scheduled/
    );
    expect(mech).not.toMatch(/background:rgba\(0,0,0,0\.03\)/);
  });

  // Both files, and both shapes. #0D1F3C is deliberately absent from this list:
  // one use survives, the signature ink, and it lives behind an opt-out marker
  // because the canvas is white paper in either theme.
  it('nothing paints with a themeable colour written by hand', () => {
    for (const [name, src] of [
      ['mechanic.js', mech],
      ['admin.js', admin],
    ]) {
      for (const lit of ['#FEF2F2', '#EFF6FF', '#A7F3D0', '#DCFCE7', '#FEE2E2', '#86EFAC']) {
        expect(src, `${name} still writes ${lit}`).not.toMatch(new RegExp(lit, 'i'));
      }
    }
  });

  it('the chat bubble follows the theme too', () => {
    expect(mech).toMatch(/background:\$\{isMech \? 'var\(--blue\)' : 'var\(--white\)'\}/);
    expect(mech).toMatch(/border:\$\{isMech \? 'none' : '1px solid var\(--border\)'\}/);
  });

  // A colour chosen inside a template expression was invisible to the first
  // version of the check - which is exactly where the chat bubble hid.
  it('and the guard can see colours inside ternaries', () => {
    expect(guard).toMatch(/chosen inside a template/);
    expect(guard).toMatch(/\['"\]\(#\[0-9a-fA-F\]\{6\}\)\['"\]/);
  });

  // The one exception, named and explained where it lives.
  it('the signature ink is the documented exception', () => {
    expect(mech).toMatch(/the signature canvas is white paper in BOTH/);
    expect(mech).toMatch(/ctx\.strokeStyle = '#0D1F3C';/);
  });

  // The green counterpart of --red-edge / --blue-edge / --amber-edge. Naming it
  // is what let the dark theme reach it.
  it('--green-edge is a token now', () => {
    expect(vars).toMatch(/--green-edge: #a7f3d0;/);
    expect(tok('--green-edge')).toMatch(/rgba\(52, 211, 153/);
  });
});

describe('the team section is not empty on day one', () => {
  // It started from `bookings where completed` and returned [] when there were
  // none - so a brand-new business showed "coming soon" to every visitor, right
  // up to the moment the page stopped needing to convince anybody. Diego hit it
  // the instant he cancelled his test booking.
  it('it starts from the mechanics, not from completed jobs', () => {
    const fn = auth.slice(auth.indexOf('async function handlePublicMechanics'));
    const contactsAt = fn.indexOf('escalation_contacts');
    const bookingsAt = fn.indexOf('status=eq.completed');
    expect(contactsAt).toBeGreaterThan(-1);
    expect(contactsAt).toBeLessThan(bookingsAt);
  });

  it('and no longer bails out when nobody has finished a job', () => {
    const fn = auth.slice(auth.indexOf('async function handlePublicMechanics'));
    expect(fn.slice(0, 2000)).not.toMatch(/if \(!mechIds\.length\) return res\.status\(200\)\.json\(\[\]\);/);
  });

  // "0 services completed" is worse than saying nothing.
  it('the card does not boast a zero', () => {
    expect(inline).toMatch(/m\.jobs_completed > 0 \?/);
    expect(inline).toMatch(/Qualified &amp; background-checked/);
  });
});

describe('the plans fit, and the gift card mark is not clipped', () => {
  // Plain `center` splits the overflow evenly, and the half above scrolls out
  // of reach under the sticky navbar - which is how centring the plans clipped
  // their own heading. `safe` falls back to the start instead.
  it('centring cannot push the heading out of reach', () => {
    expect(landingCss).toMatch(/justify-content: safe center;/);
    // The plain value stays as the fallback for anything that does not know
    // `safe`, and it has to come FIRST in the same rule to be overridden.
    const rule = landingCss.slice(
      landingCss.indexOf('.fits-one-screen {'),
      landingCss.indexOf('justify-content: safe center;') + 40
    );
    expect(rule).toMatch(/justify-content: center;/);
    expect(rule.indexOf('justify-content: center;')).toBeLessThan(
      rule.indexOf('justify-content: safe center;')
    );
  });

  it('and the cards tighten on a short screen instead of overflowing', () => {
    expect(landingCss).toMatch(/#memberships \.plan-card \{\s*\r?\n?\s*padding: clamp\(14px, 2vh, 22px\)/s);
    expect(landingCss).toMatch(/#memberships \.plan-card ul \{[^}]*font-size: clamp\(12px, 1\.5vh, 13px\)/s);
  });

  // At top:-18px the mark sat above the card edge and the D came out sliced by
  // the rounded corner.
  it('the gift card mark sits inside the top edge', () => {
    const rule = mainCss.slice(mainCss.indexOf('.gift-card3d__mark {'));
    expect(rule.slice(0, 600)).toMatch(/top: 12px;/);
    expect(rule.slice(0, 600)).not.toMatch(/top: -18px;/);
  });
});
