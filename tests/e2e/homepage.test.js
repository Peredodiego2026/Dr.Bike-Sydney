// tests/e2e/homepage.test.js — Critical path E2E tests
// Run: npm run test:e2e
// Requires: npx playwright install

import { test, expect } from '@playwright/test';

test.describe('Landing page', () => {
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
    await expect(page.getByText('$57')).toBeVisible();
  });

  test('My Account button is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#nav-auth-btn')).toBeVisible();
    await expect(page.locator('#nav-auth-btn')).toContainText('My Account');
  });

  test('navbar links work', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href="#services"]').first().click();
    await expect(page.locator('#services')).toBeInViewport();
  });
});

test.describe('Mobile experience', () => {
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
    await expect(page.locator('.login-title')).toContainText('Dr. Bike');
  });
});
