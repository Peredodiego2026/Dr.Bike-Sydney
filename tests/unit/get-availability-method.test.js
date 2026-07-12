// tests/unit/get-availability-method.test.js — regression guard for a real
// production bug found 2026-07-11 (Diego: "aprieto un dia y ya no aparecen las
// horas... 'Could not load available times'"). Booking's time-slot step was
// completely broken: js/supabase.js's getAvailableSlots() sends a plain fetch()
// (GET, no method override), but api/auth.js's handleGetAvailability calls
// guard(req, res, {...}) without a method override, which defaults to POST
// (api/_security.js: `const method = opts.method || 'POST'`). Every real call
// 405'd, 100% of the time, for every date. This was previously masked by a
// fallback in getAvailableSlots() that silently returned fake "all slots
// available" data on any fetch failure (a worse bug - false positives on a
// real booking's availability) - that fallback was correctly removed in
// 97860af (2026-07-08), which is when the breakage became visible instead of
// dangerous. Neither change ever fixed the actual method mismatch.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

describe('get-availability GET/POST method match', () => {
  it('handleGetAvailability explicitly allows GET (server side)', () => {
    const content = readFileSync(join(root, 'api/auth.js'), 'utf8');
    const fnMatch = content.match(/async function handleGetAvailability\([^)]*\)\s*{[\s\S]*?\n}/);
    expect(fnMatch, 'handleGetAvailability function not found in api/auth.js').not.toBeNull();
    expect(fnMatch[0]).toMatch(/method:\s*['"]GET['"]/);
  });

  it('getAvailableSlots stays a plain GET (client side, no method override)', () => {
    const content = readFileSync(join(root, 'js/supabase.js'), 'utf8');
    const fnMatch = content.match(
      /export async function getAvailableSlots\([^)]*\)\s*{[\s\S]*?\n}/
    );
    expect(fnMatch, 'getAvailableSlots function not found in js/supabase.js').not.toBeNull();
    expect(fnMatch[0]).not.toMatch(/method:\s*['"]POST['"]/);
  });
});
