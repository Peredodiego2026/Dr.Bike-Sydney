// tests/unit/tracking-finish-time.test.js - once the mechanic is at the door,
// the client's tracking screen says when the job should be done (Diego,
// 26-oct-2026). And the status he is in has three spellings in this codebase -
// the arrival writes 'inprogress' - which the tracking page and the
// availability each only half knew.
// Run: npm test
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

let booking;
let startedAtMissing;
let asked;
globalThis.fetch = async (url) => {
  const u = String(url);
  asked.push(u);
  const json = (b) => ({ ok: true, status: 200, json: async () => b });
  if (u.includes('/rest/v1/bookings') && u.includes('select=arrived_at')) {
    if (startedAtMissing && u.includes('started_at'))
      return {
        ok: false,
        status: 400,
        json: async () => ({ message: 'column started_at does not exist' }),
      };
    return json([
      { arrived_at: booking.arrived_at ?? null, started_at: booking.started_at ?? null },
    ]);
  }
  if (u.includes('/rest/v1/bookings')) return json([{ ...booking }]);
  if (u.includes('/rest/v1/services')) return json([{ duration_max: 240 }]);
  return json([]);
};

const { handlePublicTrack, estimatedFinishAt, IN_PROGRESS_STATUSES } =
  await import('../../api/auth.js');

const track = async () => {
  const res = { statusCode: null, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = () => {};
  await handlePublicTrack({ body: { tracking_token: 'tok' }, headers: {} }, res);
  return res;
};

beforeEach(() => {
  asked = [];
  startedAtMissing = false;
  booking = {
    id: 'b1',
    status: 'inprogress', // what the arrival endpoint writes
    scheduled_date: '2026-11-12',
    scheduled_time: '13:00:00',
    service_name: 'Ultimate Overhaul',
    tracking_token: 'tok',
    arrived_at: '2026-11-12T02:10:00.000Z', // 1:10pm in Sydney
  };
});

describe('the finish the client is told', () => {
  it('arrived at 1:10pm, a 4-hour job: done around 5:10pm', async () => {
    const r = await track();
    expect(r.statusCode).toBe(200);
    expect(r.body.estimated_finish_at).toBe('2026-11-12T06:10:00.000Z');
  });

  it('from when he pressed Start, when he did', async () => {
    booking.started_at = '2026-11-12T02:30:00.000Z';
    expect((await track()).body.estimated_finish_at).toBe('2026-11-12T06:30:00.000Z');
  });

  it('before the started_at migration, still from the arrival', async () => {
    startedAtMissing = true;
    expect((await track()).body.estimated_finish_at).toBe('2026-11-12T06:10:00.000Z');
  });

  it('not before he is there: on the way, there is nothing to finish yet', async () => {
    booking.status = 'enroute';
    const r = await track();
    expect(r.body.estimated_finish_at).toBeNull();
    expect(asked.some((u) => u.includes('/rest/v1/services'))).toBe(false);
  });

  it('with no timestamps, from the booked time (1pm + 4h)', () => {
    expect(
      estimatedFinishAt(
        { status: 'arrived', scheduled_date: '2026-11-12', scheduled_time: '13:00:00' },
        240
      )
    ).toBe('2026-11-12T06:00:00.000Z');
    expect(estimatedFinishAt({ status: 'arrived' }, 240)).toBeNull();
    expect(
      estimatedFinishAt({ status: 'inprogress', arrived_at: '2026-11-12T02:10:00Z' }, null)
    ).toBeNull();
  });
});

describe('one meaning for the three spellings', () => {
  const auth = readFileSync(new URL('../../api/auth.js', import.meta.url), 'utf8');
  it('the set covers what the arrival writes', () => {
    expect(IN_PROGRESS_STATUSES).toEqual(['arrived', 'inprogress', 'in_progress']);
    expect(auth).toMatch(/status: 'inprogress', arrived_at:/);
  });
  it('a job being worked on holds its van, and its tracking stays live', () => {
    expect(auth).toMatch(
      /\.in\('status', \['pending', 'confirmed', 'enroute', \.\.\.IN_PROGRESS_STATUSES\]\)/
    );
    expect(auth).toMatch(
      /\['confirmed', 'enroute', 'en_route', \.\.\.IN_PROGRESS_STATUSES\]\.includes/
    );
  });
  it('track.html reads all three as "in progress", including when polling', () => {
    const page = readFileSync(new URL('../../track.html', import.meta.url), 'utf8');
    const normStatus = new Function(
      `${page.match(/const normStatus = \(s\) => [^;]+;/)[0]}\nreturn normStatus;`
    )();
    expect(['inprogress', 'arrived', 'in_progress', 'enroute'].map(normStatus)).toEqual([
      'in_progress',
      'in_progress',
      'in_progress',
      'enroute',
    ]);
    expect(page).toMatch(/bkg\.status = normStatus\(bkg\.status\);/);
    expect(page).toMatch(/if\(normStatus\(updated\.status\) !== bkg\.status\)/);
    expect(page).toContain('<span>Should be done around</span>');
  });
  it('the app shows it in the tracking status bar', () => {
    const app = readFileSync(new URL('../../js/app.js', import.meta.url), 'utf8');
    expect(app).toMatch(/translateValue\('Done around FINISH'\)/);
    expect(app).toMatch(/applyFinish\(booking\);/);
    expect(app).toMatch(/applyFinish\(updated\);/);
  });
});
