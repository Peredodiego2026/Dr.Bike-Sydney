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

  // 'Services' dejo de ser un enlace a #services: hoy es un boton que abre
  // el modal de precios, y la seccion #services ya no existe (un clic en vez
  // de dos, js/landing-inline.js). El test seguia buscando el enlace viejo y
  // llevaba tiempo en rojo, que es como una suite deja de mirarse.
  //
  // Ahora cubre las dos clases de item que tiene el menu, no una sola.
  test('the Services button opens the price list', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#services-modal')).toBeHidden();
    await page.locator('#nav-services-btn').click();
    await expect(page.locator('#services-modal')).toBeVisible();
  });

  test('the navbar anchors scroll to their section, clear of the sticky navbar', async ({
    page,
  }) => {
    await page.goto('/');
    for (const id of ['mechanics', 'memberships', 'fleet', 'about']) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator(`a[href="#${id}"]`).first().click();
      await expect(page.locator(`#${id}`)).toBeInViewport();
      // Estar en pantalla no alcanza: antes del 30-sep-2026 la seccion
      // llegaba con 64px metidos DEBAJO del navbar sticky y el test pasaba
      // igual. Lo que importa es donde frena el scroll.
      // El scroll de esta pagina es smooth, asi que medir apenas termina el
      // clic lo agarra a mitad de camino - y a mitad de camino la seccion
      // todavia esta por debajo del navbar, o sea que la afirmacion pasa sola.
      // Primera version de este test: verde contra una produccion que NO tenia
      // el arreglo. Hay que esperar a que el scroll frene de verdad.
      await page.waitForFunction(() => {
        const y = Math.round(window.scrollY);
        if (window.__lastY === y) return true;
        window.__lastY = y;
        return false;
      }, null, { polling: 250, timeout: 10000 });
      await page.evaluate(() => delete window.__lastY);

      const tapado = await page.evaluate((id) => {
        const nav = document.querySelector('.navbar').getBoundingClientRect();
        const sec = document.getElementById(id).getBoundingClientRect();
        return Math.round(nav.bottom - sec.top);
      }, id);
      // Era 24 hasta el 30-sep-2026: la animacion de entrada dejaba cada
      // seccion 20px mas abajo al saltar, y despues la subia bajo el navbar.
      // js/landing-inline.js revealNow() la revela antes del salto; lo que
      // queda es redondeo.
      expect(
        tapado,
        `#${id} quedo ${tapado}px debajo del navbar al saltar`
      ).toBeLessThanOrEqual(2);
    }
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
