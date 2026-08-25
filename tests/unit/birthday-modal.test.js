// tests/unit/birthday-modal.test.js
//
// The greeting was an amber strip under the header that appeared on load. It
// is now a panel that folds down over a dimmed page six seconds in, and the
// email is sent AT THAT MOMENT rather than by the cron's 09:00 UTC run - which
// lands at 19:00 in Sydney, and missed anybody who filled in their birthday
// later that day. Diego, on his own birthday, was one of them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const appjs = read('js/app.js');
const authjs = read('api/auth.js');
const mainCss = read('css/main.css');

const clientFn = appjs.slice(
  appjs.indexOf('async function showBirthdayGreeting'),
  appjs.indexOf('async function updateHomeNav')
);
const serverFn = authjs.slice(
  authjs.indexOf('async function handleBirthdayGreeting'),
  authjs.indexOf('// Lets the client check coverage before paying')
);

describe('it opens six seconds in, once', () => {
  it('waits six seconds', () => {
    expect(appjs).toMatch(/const BIRTHDAY_DELAY_MS = 6000;/);
    expect(clientFn).toMatch(/setTimeout\(\(\) => openBirthdayModal\([^;]*BIRTHDAY_DELAY_MS\);/s);
  });

  // The home route fires again on every return to it; a second timer would
  // open a second panel over the first.
  it('only arms the timer once per page load', () => {
    expect(clientFn).toMatch(/if \(_bdayChecked\) return;/);
    expect(clientFn).toMatch(/_bdayChecked = true;/);
  });

  // Somebody who lands signed out and signs in a minute later comes back
  // through this route WITH a session. Burning the one-shot on the anonymous
  // pass would swallow their birthday.
  it('does not burn the one-shot on a signed-out visit', () => {
    const guard = clientFn.indexOf('if (!session?.user) return;');
    expect(guard).toBeGreaterThan(-1);
    // There are two: one for "already greeted this year", which may sit
    // earlier, and the settled one. The settled one must come after the guard.
    expect(clientFn.lastIndexOf('_bdayChecked = true;')).toBeGreaterThan(guard);
  });

  it('and only once a year per device', () => {
    expect(clientFn).toMatch(/localStorage\.getItem\(BIRTHDAY_SEEN_KEY\) === String\(year\)/);
    expect(clientFn).toMatch(/localStorage\.setItem\(BIRTHDAY_SEEN_KEY, String\(year\)\)/);
  });

  // 364 days a year the answer is no; that should not cost a request.
  it('checks locally before asking the server', () => {
    expect(clientFn).toMatch(/if \(!isBirthdayToday\(profile\?\.birthday\)\) return;/);
    expect(clientFn.indexOf('isBirthdayToday')).toBeLessThan(clientFn.indexOf('setTimeout'));
  });
});

describe('the panel', () => {
  it('dims the page behind it', () => {
    expect(mainCss).toMatch(/\.bday-scrim\s*\{[^}]*position: fixed/s);
    expect(mainCss).toMatch(/background: color-mix\(in srgb, var\(--navy\) 55%, transparent\)/);
  });

  // perspective has to sit on the ancestor - on the card itself it would apply
  // to the card's children instead.
  it('folds down in 3D from its top edge', () => {
    expect(mainCss).toMatch(/\.bday-scrim\s*\{[^}]*perspective: 1200px/s);
    expect(mainCss).toMatch(/transform-origin: top center/);
    expect(mainCss).toMatch(/transform: rotateX\(-82deg\)/);
    expect(mainCss).toMatch(/\.bday-scrim\.is-open \.bday-card\s*\{\s*transform: rotateX\(0deg\)/);
  });

  it('still appears when motion is reduced, just without the swing', () => {
    const i = mainCss.indexOf(
      '@media (prefers-reduced-motion: reduce)',
      mainCss.indexOf('.bday-scrim')
    );
    const block = mainCss.slice(i, i + 300);
    expect(block).toMatch(/transform: none/);
    expect(block).toMatch(/opacity/);
  });

  it('closes on the X, on the backdrop, and on Escape', () => {
    expect(clientFn).toMatch(/#bday-close'\)\.addEventListener\('click', close\)/);
    expect(clientFn).toMatch(/if \(e\.target === scrim\) close\(\);/);
    expect(clientFn).toMatch(/if \(e\.key === 'Escape'\) close\(\);/);
  });

  // A click inside the card must not dismiss it - hence `e.target === scrim`
  // rather than a bare listener.
  it('does not close when the card itself is clicked', () => {
    expect(clientFn).not.toMatch(/scrim\.addEventListener\('click', close\)/);
  });

  it('cleans up its key listener and never leaves the scrim behind', () => {
    expect(clientFn).toMatch(/document\.removeEventListener\('keydown', onKey\)/);
    // transitionend does not fire in a hidden tab, so there is a timeout too.
    expect(clientFn).toMatch(/setTimeout\(drop, 600\)/);
  });

  it('is announced as a dialog and takes focus', () => {
    expect(clientFn).toMatch(/setAttribute\('role', 'dialog'\)/);
    expect(clientFn).toMatch(/setAttribute\('aria-modal', 'true'\)/);
    expect(clientFn).toMatch(/aria-labelledby/);
    expect(clientFn).toMatch(/if \(previouslyFocused\?\.focus\) previouslyFocused\.focus\(\);/);
  });

  // One frame is not enough: the start styles must be applied before the class
  // flips, or the browser jumps to the end state and there is no fold.
  it('waits two frames before animating', () => {
    expect(clientFn).toMatch(/requestAnimationFrame\(\(\) =>\s*\r?\n?\s*requestAnimationFrame/s);
  });

  it('escapes the name - it is user-controlled', () => {
    expect(clientFn).toMatch(/escapeHtml\(\s*\r?\n?\s*translateValue\('Happy birthday, NAME!'\)/s);
  });
});

describe('the email is sent when the panel opens', () => {
  it('the client asks the server as it opens', () => {
    expect(clientFn).toMatch(/role: 'birthday-greeting', access_token: accessToken/);
  });

  it('and only claims an email when the server says one went out', () => {
    expect(clientFn).toMatch(/emailSent = Boolean\(data\.emailSent\)/);
    expect(clientFn).toMatch(/emailSent\s*\r?\n?\s*\? 'Check your email/s);
  });

  it('says nothing at all if it is not their birthday', () => {
    expect(clientFn).toMatch(/if \(!data\.greet\) return;/);
  });

  it('still greets when the request fails', () => {
    const at = clientFn.indexOf("role: 'birthday-greeting'");
    const catchAt = clientFn.indexOf('} catch {', at);
    expect(clientFn.slice(catchAt, catchAt + 220)).toMatch(/emailSent = false/);
  });

  it('the role is registered', () => {
    expect(authjs).toMatch(/role === 'birthday-greeting'/);
  });
});

describe('the server side cannot send twice', () => {
  it('needs a real session', () => {
    expect(serverFn).toMatch(/sb\.auth\.getUser\(access_token\)/);
    expect(serverFn).toMatch(/return res\.status\(401\)/);
  });

  // UTC would put every Sydney morning on the previous day, so a birthday
  // would be greeted a day early for ten hours out of every twenty-four.
  it('decides the date in Sydney, not UTC', () => {
    expect(authjs).toMatch(/timeZone: 'Australia\/Sydney'/);
    expect(serverFn).toMatch(/sydneyMonthDay\(\)/);
  });

  it('re-checks the date instead of trusting the client', () => {
    expect(serverFn).toMatch(/if \(bMm !== mm \|\| bDd !== dd\) return res\.status\(200\)/);
  });

  // Two tabs opening at once would both pass a read-then-write check. The
  // stamp is conditional and runs FIRST, so the loser sends nothing.
  it('stamps the year before sending, conditionally', () => {
    const stampAt = serverFn.indexOf('birthday_promo_sent_year: year');
    const sendAt = serverFn.indexOf('/api/send-email');
    expect(stampAt).toBeGreaterThan(-1);
    expect(stampAt).toBeLessThan(sendAt);
    expect(serverFn).toMatch(/\.neq\('birthday_promo_sent_year', year\)/);
  });

  it('greets without a second email when the cron already sent one', () => {
    expect(serverFn).toMatch(
      /if \(Number\(profile\.birthday_promo_sent_year\) === year\) \{[\s\S]{0,120}emailSent: true/
    );
  });

  it('reports failure instead of pretending', () => {
    expect(serverFn).toMatch(/console\.error\('\[birthday-greeting\] send failed:'/);
    expect(serverFn).toMatch(/greet: true, emailSent: false/);
  });
});
