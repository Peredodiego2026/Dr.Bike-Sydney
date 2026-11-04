// tests/e2e/robots-stay-out-of-analytics.test.js - this suite is a robot that
// opens production 5 times a day; Google Analytics and PostHog must not count
// it as a visitor. The block itself lives in scripts/analytics-block.mjs and
// is switched on for every test by tests/e2e/fixtures.js.
//
// Judged by the effect, not by the route being registered: after Accept, the
// cookies GA and PostHog write when they really load must not exist, and
// PostHog must never have finished loading. And the page must have ASKED for
// both scripts - otherwise this passes just as green on a page that quietly
// stopped loading analytics, which proves nothing about the block.
import { test, expect } from './fixtures.js';

test('the suite never reaches Google Analytics or PostHog', async ({
  page,
  context,
  analyticsBlocked,
}) => {
  await page.goto('/', { waitUntil: 'load', timeout: 20000 });

  // Second button is Accept (Decline comes first, see js/consent.js): the
  // case that loads the most analytics.
  await page.locator('#drbike-consent button').last().click();
  await page.waitForTimeout(2000);

  expect(analyticsBlocked.filter((u) => /googletagmanager\.com\/gtag\/js/.test(u))).not.toEqual([]);
  expect(analyticsBlocked.filter((u) => /posthog\.com\/static\/array\.js/.test(u))).not.toEqual([]);

  const trackingCookies = (await context.cookies())
    .map((c) => c.name)
    .filter((n) => /^_ga|^_gid$|^ph_/.test(n));
  expect(trackingCookies, 'analytics loaded and wrote its cookies').toEqual([]);
  expect(await page.evaluate(() => Boolean(window.posthog && window.posthog.__loaded))).toBe(false);
});
