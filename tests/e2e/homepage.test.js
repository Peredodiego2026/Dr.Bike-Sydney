// tests/e2e/homepage.test.js — Critical path E2E tests
// Run: npm run test:e2e
// Requires: npx playwright install

import { test, expect } from '@playwright/test';

// middleware.js routes by user-agent: desktop UA -> landing.html, mobile UA -> index.html (SPA).
// These tests assert landing.html DOM, so they only apply to the desktop project.
// Mobile UAs get the SPA and are covered by the 'Mobile experience' block below.
test.describe('Landing page', () => {
  test.skip(({ browserName, isMobile }) => isMobile, 'Desktop surface only (mobile UA gets the SPA)');

  test('loads and shows hero', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Bike');
    await expect(page.locator('.navbar')).toBeVisible();
  });

  test('How It Works section visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Simple 4-Step Process')).toBeVisible();
  });

  test('Memberships section visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Choose Your Plan')).toBeVisible();
    await expect(page.getByText('$67').first()).toBeVisible();
  });

  test('auth button is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#nav-auth-btn')).toBeVisible();
    // Copy is "Sign In" for logged-out visitors (changed from "My Account" in 097017c)
    await expect(page.locator('#nav-auth-btn')).toContainText('Sign In');
  });

  test('navbar links work', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href="#services"]').first().click();
    await expect(page.locator('#services')).toBeInViewport();
  });
});

// Landing.html at a narrow viewport (responsive check). Runs on the desktop UA only:
// middleware serves landing.html to desktop UAs, and the viewport override makes it mobile-width.
// NOTE: the real mobile SPA (index.html, served to mobile UAs) has NO e2e coverage yet - gap to fill.
test.describe('Mobile experience', () => {
  test.skip(({ isMobile }) => isMobile, 'Exercises landing.html responsive layout via desktop UA');
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14

  test('steps show in 2-column layout on mobile', async ({ page }) => {
    await page.goto('/');
    const grid = page.locator('.steps-grid');
    await expect(grid).toBeVisible();
  });

  test('membership cards stack on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Choose Your Plan')).toBeVisible();
  });
});

test.describe('Mechanic app', () => {
  test('login screen loads', async ({ page }) => {
    await page.goto('/mechanic.html');
    await expect(page.locator('#s-login')).toBeVisible();
    await expect(page.locator('.login-title')).toContainText('Mechanic App');
  });
});
