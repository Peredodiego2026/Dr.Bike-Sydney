// tests/unit/discount-codes-schema.test.js — regression guard for a real production
// bug found this session: js/app.js and landing.html used discount_amount/'percentage',
// but the actual discount_codes table columns are discount_value/'percent'. That
// silently broke discount redemption for every real customer. This just asserts the
// wrong names never creep back in.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

// api/stripe-webhook.js and api/_gift-cards.js since 25-oct-2026: the webhook
// inserted gift cards as discount_amount, so every one sold was never issued.
const filesThatReadDiscountCodes = [
  'js/app.js',
  'landing.html',
  'js/admin.js',
  'api/stripe-webhook.js',
  'api/_gift-cards.js',
];

describe('discount_codes column names', () => {
  for (const file of filesThatReadDiscountCodes) {
    it(`${file} does not reference the non-existent discount_amount column`, () => {
      // parts_charged.discount_amount is a different thing and real: the
      // completion discount the mechanic's phone sends inside the parts_charged
      // JSON (js/mechanic.js submitComplete, read by api/_completion-notify.js).
      // Revenue reads it since 2026-10-25. Only the discount_codes column is wrong.
      const content = readFileSync(join(root, file), 'utf8').replace(
        /parts_charged\?\.discount_amount/g,
        ''
      );
      expect(content).not.toMatch(/discount_amount/);
    });

    it(`${file} does not use the non-existent 'percentage' discount_type value`, () => {
      const content = readFileSync(join(root, file), 'utf8');
      expect(content).not.toMatch(/['"]percentage['"]/);
    });
  }
});
