// tests/unit/client-counts.test.js — the Clients screen counted the rows that
// happened to come back and called that a total, and its "New this month" cut
// sat at the current time of day instead of midnight. Both from the Analytics
// audit (docs/PENDIENTES.md 20.5 and 20.6, 16-Aug-2026).
//
// js/admin.js is a classic script (admin.html loads it with a plain <script
// src>), so it cannot be imported. startOfMonth is lifted out of the source and
// run - the same read-the-source approach as tests/unit/suburb-coord.test.js.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const src = readFileSync(join(root, 'js/admin.js'), 'utf8');

const grab = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error(`${what} not found in js/admin.js`);
  return m[0];
};

const { startOfMonth } = new Function(`
  ${grab(/function startOfMonth\(d\) \{[\s\S]*?\n\}/, 'startOfMonth')}
  return { startOfMonth };
`)();

describe('startOfMonth', () => {
  it('zeroes the time, not just the day', () => {
    // The bug verbatim: on the 1st at 18:00 the old cut was "1 Aug 18:00", so
    // an account created at 09:00 that morning did not count as new.
    const onTheFirstAtSix = new Date(2026, 7, 1, 18, 30, 15, 250);
    const cut = startOfMonth(onTheFirstAtSix);
    expect(cut.getDate()).toBe(1);
    expect([cut.getHours(), cut.getMinutes(), cut.getSeconds(), cut.getMilliseconds()]).toEqual([
      0, 0, 0, 0,
    ]);
    const signedUpThatMorning = new Date(2026, 7, 1, 9, 0);
    expect(signedUpThatMorning >= cut).toBe(true);
  });

  it('walks back to the 1st from any day of the month', () => {
    const cut = startOfMonth(new Date(2026, 7, 16, 12, 47));
    expect(cut.getMonth()).toBe(7);
    expect(cut.getDate()).toBe(1);
  });

  it('does not mutate the date it was given', () => {
    const now = new Date(2026, 7, 16, 12, 0);
    startOfMonth(now);
    expect(now.getDate()).toBe(16);
  });

  it('keeps the previous month out', () => {
    const cut = startOfMonth(new Date(2026, 7, 3));
    expect(new Date(2026, 6, 31, 23, 59) >= cut).toBe(false);
  });
});

describe('the counters are asked of the database, not of the rows on screen', () => {
  // Supabase caps a single response at the project's max-rows. Nobody on this
  // project knows what that cap is set to, so the fix is to stop depending on
  // it: head+count returns the real total without shipping a single row.
  it('loadClients asks for exact counts with head:true', () => {
    const fn = grab(/async function loadClients\(\) \{[\s\S]*?\n\}/, 'loadClients');
    expect(fn).toMatch(/count: 'exact', head: true/);
    expect(fn).toMatch(/\.eq\('membership_plan', 'vip'\)/);
    expect(fn).toMatch(/\.gte\('created_at', monthStart\.toISOString\(\)\)/);
  });

  it('loadClients no longer counts the returned page as the total', () => {
    const fn = grab(/async function loadClients\(\) \{[\s\S]*?\n\}/, 'loadClients');
    expect(fn).not.toMatch(/kpis\[0\]\.textContent = data\.length/);
    // The old cut, which moved the day but not the clock.
    expect(fn).not.toMatch(/thisMonth\.setDate\(1\);/);
  });

  it('the Analytics truncation warning compares against the database count', () => {
    // `length >= 20000` could never be true if max-rows is lower than 20000,
    // so the warning it guards could never appear.
    const fn = grab(/async function loadAnalytics\(\) \{[\s\S]*?\n\}/, 'loadAnalytics');
    expect(fn).toMatch(/count: 'exact'/);
    expect(fn).toMatch(/const shortBy = \(res, asked\)/);
    // The old shape: comparing the rows that arrived against the limit asked
    // for. Anchored on `.data || []).length >=` so the explanatory comment
    // above it does not count as the code still being there.
    expect(fn).not.toMatch(/\.data \|\| \[\]\)\.length >= /);
  });
});
