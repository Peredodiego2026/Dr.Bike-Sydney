// tests/unit/analytics-bookings-fallback.test.js — fetchAnalyticsBookings()
// tries a SELECT with parts_cost_actual first, and falls back to the column
// list without it if that fails (scripts/add-parts-cost-actual.sql not run
// yet - 18.3). A review of that PR found the fallback re-tried the doomed
// richer query on EVERY loadAnalytics() call - every time an admin opens or
// refreshes the Analytics tab - instead of remembering the column is missing
// for the rest of the session. This test pins the fix: the second call must
// go straight to the fallback shape, with no attempt at the richer one.
//
// js/admin.js is a classic script and can't be imported: the function and
// its module-level cache flag are lifted from source and run against a fake
// `sb` - same approach as tests/unit/analytics-margins.test.js.
// Run: npm test

import { describe, it, expect, beforeEach } from 'vitest';
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

// Fake Supabase query builder: records every `select(...)` call it sees and
// returns a canned result keyed by call order.
function fakeSb(results) {
  const calls = [];
  let i = 0;
  return {
    calls,
    from: () => ({
      select: (cols) => {
        calls.push(cols);
        const result = results[Math.min(i, results.length - 1)];
        i++;
        return {
          order: () => ({
            limit: () => Promise.resolve(result),
          }),
        };
      },
    }),
  };
}

describe('fetchAnalyticsBookings - remembers a missing parts_cost_actual column', () => {
  let ctx;

  beforeEach(() => {
    // Fresh module-level state each test: _partsCostColumnMissing must not
    // leak between tests, so the function and its flag are rebuilt every time
    // instead of reusing one `new Function` across the describe block.
    ctx = new Function(
      'sb',
      'BOOKINGS_FETCH_CAP',
      `
      ${grab(/let _partsCostColumnMissing = false;/, '_partsCostColumnMissing')}
      ${grab(/async function fetchAnalyticsBookings\(\) \{[\s\S]*?\n\}/, 'fetchAnalyticsBookings')}
      return { fetchAnalyticsBookings, get missing() { return _partsCostColumnMissing; } };
    `
    );
  });

  it('tries the richer column first when nothing is known yet', async () => {
    const sb = fakeSb([{ data: [{ id: 1 }], error: null, count: 1 }]);
    const { fetchAnalyticsBookings } = ctx(sb, 5000);
    await fetchAnalyticsBookings();
    expect(sb.calls).toHaveLength(1);
    expect(sb.calls[0]).toMatch(/parts_cost_actual/);
  });

  it('falls back and remembers the column is missing after the richer query errors', async () => {
    const sb = fakeSb([
      { data: null, error: { message: 'column bookings.parts_cost_actual does not exist' } },
      { data: [{ id: 1 }], error: null, count: 1 },
    ]);
    // Not destructured: `missing` is a getter, and destructuring would read
    // it once immediately (while still false) instead of keeping a live
    // reference - checked on the object itself, after the await, instead.
    const obj = ctx(sb, 5000);
    const res = await obj.fetchAnalyticsBookings();
    expect(sb.calls).toHaveLength(2);
    expect(sb.calls[0]).toMatch(/parts_cost_actual/);
    expect(sb.calls[1]).not.toMatch(/parts_cost_actual/);
    expect(res.error).toBeNull();
    expect(obj.missing).toBe(true);
  });

  it('a second call in the same session goes straight to the fallback - no repeat of the doomed query', async () => {
    const sb = fakeSb([
      { data: null, error: { message: 'column bookings.parts_cost_actual does not exist' } },
      { data: [{ id: 1 }], error: null, count: 1 },
      { data: [{ id: 2 }], error: null, count: 1 },
    ]);
    const { fetchAnalyticsBookings } = ctx(sb, 5000);
    await fetchAnalyticsBookings(); // first call: richer fails, falls back, remembers
    sb.calls.length = 0; // reset the call log to isolate the second call
    await fetchAnalyticsBookings(); // second call: should not retry the richer column
    expect(sb.calls).toHaveLength(1);
    expect(sb.calls[0]).not.toMatch(/parts_cost_actual/);
  });
});
