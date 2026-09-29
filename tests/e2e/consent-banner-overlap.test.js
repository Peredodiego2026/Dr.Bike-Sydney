// The cookie card is fixed to the bottom of the screen. So is the booking
// wizard's button bar. From 30-aug to 29-sep-2026 neither knew about the other
// and the card won on z-index, so on a phone every button in the wizard was
// untappable until the visitor dealt with the card - including "Confirm & Pay".
//
// Measured on an iPhone 14 before the fix: the card occupied 518-648px and the
// button 538-584px. The button was not merely overlapped, it was invisible,
// and elementFromPoint at its centre returned the card's paragraph.
//
// The reason no test caught it is the whole point of this file. Every existing
// assertion about these buttons asks `toBeVisible()`, and a button under an
// overlay IS visible - it has size, it is painted, it is not display:none. The
// only question that finds this bug is the one a finger asks: if I tap the
// middle of this button, what receives the tap?
import { test, expect } from '@playwright/test';

const goto = (page, path) => page.goto(path, { waitUntil: 'domcontentloaded' });

// Every screen in the SPA carries its own copy of the bottom nav and of the
// wizard's button bar, so every selector below is scoped to the screen that
// is actually showing. Unscoped, the first run picked a copy inside a hidden
// screen and the test was flaky.
//
// What the browser says is under a point, rather than what the DOM says exists.
async function tapTarget(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return {
      found: true,
      reachesTheElement: hit === el || el.contains(hit),
      whatIsThere: hit ? hit.tagName + (hit.id ? '#' + hit.id : '') : null,
    };
  }, selector);
}

test.describe('the cookie card does not take taps meant for the app', () => {
  test.skip(({ isMobile }) => !isMobile, 'Mobile UA required - middleware serves index.html');

  // Deliberately never answers the card: that is the state the bug lived in,
  // and the state a first-time visitor is in for their whole first session if
  // they ignore it.
  test('the wizard button under it is still the thing a finger hits', async ({ page }) => {
    await goto(page, '/#book-service');
    await page.waitForSelector('.service-card', { timeout: 20000 });

    await expect(page.locator('#drbike-consent'), 'no cookie card, so this test proves nothing').toHaveCount(1);

    // Picking a service advances to the date step, whose Continue button is the
    // first of the three that were covered.
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.service-card')].filter((c) => c.offsetParent !== null);
      cards.find((c) => !/emergen/i.test(c.textContent))?.click();
    });
    await page.waitForSelector('.screen.active .sticky-bottom .btn', { timeout: 20000 });

    const btn = await tapTarget(page, '.screen.active .sticky-bottom .btn');
    expect(btn.found).toBe(true);
    expect(
      btn.reachesTheElement,
      `the cookie card is over the wizard button again - a tap lands on ${btn.whatIsThere}`
    ).toBe(true);
  });

  test('and neither does the bottom nav disappear under it', async ({ page }) => {
    await goto(page, '/');
    await page.waitForSelector('.screen.active .bottom-nav a', { timeout: 20000 });
    await expect(page.locator('#drbike-consent')).toHaveCount(1);

    const tab = await tapTarget(page, '.screen.active .bottom-nav a');
    expect(
      tab.reachesTheElement,
      `the cookie card is over the bottom nav - a tap lands on ${tab.whatIsThere}`
    ).toBe(true);
  });

  test('answering it puts the bar back where it was', async ({ page }) => {
    await goto(page, '/#book-service');
    await page.waitForSelector('.service-card', { timeout: 20000 });
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.service-card')].filter((c) => c.offsetParent !== null);
      cards.find((c) => !/emergen/i.test(c.textContent))?.click();
    });
    await page.waitForSelector('.screen.active .sticky-bottom .btn', { timeout: 20000 });

    const lifted = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--consent-h').trim()
    );
    expect(lifted, 'the card is on screen but nothing was reserved for it').not.toBe('');

    // The second button of the card is Accept; the first is Decline. Either
    // one ends the banner, and the space it reserved has to go with it.
    await page.locator('#drbike-consent button').last().click();
    await page.waitForTimeout(500);

    await expect(page.locator('#drbike-consent')).toHaveCount(0);
    const after = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--consent-h').trim()
    );
    expect(after, 'the gap the card left behind is still reserved').toBe('');

    const btn = await tapTarget(page, '.screen.active .sticky-bottom .btn');
    expect(btn.reachesTheElement).toBe(true);
  });
});
