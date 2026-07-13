// tests/e2e/mobile-spa.test.js — Critical path E2E tests for the real mobile
// SPA (index.html), served to mobile UAs by middleware.js. homepage.test.js
// only ever exercises landing.html (desktop), even under its "Mobile
// experience" block (that's landing.html at a narrow viewport, not the SPA) -
// this file closes that gap.
//
// Uses waitUntil: 'domcontentloaded' instead of Playwright's 'load' default -
// 'load' waits for every resource including third-party analytics (GA,
// PostHog, Sentry), which are slow/CSP-blocked in production and add nothing
// worth waiting for when the assertion only cares about rendered app DOM.
//
// Run: npm run test:e2e -- mobile-spa

import { test, expect } from '@playwright/test';

const goto = (page, path) => page.goto(path, { waitUntil: 'domcontentloaded' });
const reload = (page) => page.reload({ waitUntil: 'domcontentloaded' });

test.describe('Mobile SPA - home screen', () => {
  test.skip(({ isMobile }) => !isMobile, 'Mobile UA required - middleware serves index.html');

  test('loads the SPA (not landing.html) and shows the bottom nav', async ({ page }) => {
    await goto(page, '/');
    await expect(page.locator('[data-screen="home"].active')).toBeVisible();
    await expect(page.locator('.bottom-nav')).toBeVisible();
    await expect(page.locator('#home-desktop-nav')).toBeHidden();
  });

  test('service cards render with live prices from Supabase', async ({ page }) => {
    await goto(page, '/');
    const cards = page.locator('.service-card');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);
    await expect(cards.first().locator('.service-price')).toContainText('$');
  });

  test('greeting is text-only when logged out - no icon/badge next to Sign In', async ({
    page,
  }) => {
    await goto(page, '/');
    await expect(page.locator('#home-mobile-auth-label')).toContainText('Sign In');
    await expect(page.locator('#home-mobile-auth-icon')).toBeEmpty();
  });

  test('bottom nav links to the 5 core screens', async ({ page }) => {
    await goto(page, '/');
    const nav = page.locator('.bottom-nav');
    for (const hash of ['#home', '#my-bookings', '#tracking', '#my-bikes', '#profile']) {
      await expect(nav.locator(`a[href="${hash}"]`)).toBeVisible();
    }
  });
});

test.describe('Mobile SPA - language switching', () => {
  test.skip(({ isMobile }) => !isMobile, 'Mobile UA required - middleware serves index.html');

  test('Spanish translates both app UI and the marketing sections', async ({ page }) => {
    await goto(page, '/');
    await page.evaluate(() => localStorage.setItem('drbike-lang', 'es'));
    await reload(page);
    await expect(page.locator('#services .section-h2')).toContainText(
      'Cuidado completo de tu bici'
    );
    await expect(page.locator('#how-it-works .section-h2')).toContainText(
      'Proceso Simple de 4 Pasos'
    );
  });

  test('switching back to English restores the original copy', async ({ page }) => {
    await goto(page, '/');
    await page.evaluate(() => localStorage.setItem('drbike-lang', 'es'));
    await reload(page);
    await page.evaluate(() => localStorage.setItem('drbike-lang', 'en'));
    await reload(page);
    await expect(page.locator('#services .section-h2')).toContainText(
      'Complete Bike Care at Your Location'
    );
  });
});

test.describe('Mobile SPA - login screen', () => {
  test.skip(({ isMobile }) => !isMobile, 'Mobile UA required - middleware serves index.html');

  test('navigating to #login renders the login screen', async ({ page }) => {
    await goto(page, '/#login');
    await expect(page.locator('[data-screen="login"].active')).toBeVisible();
  });
});
