// tests/unit/job-end-time.test.js - when each job should be done (Diego,
// 26-oct-2026): start + the service's longest duration, shown to the client in
// the booking summary, to the mechanic on every job, and in Admin's calendar
// and booking detail. The rule that a job must END by 5pm is in
// long-services-end-by-five.test.js.
// Run: npm test
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

const MID = 'mech-1';
let servicesDown;
const JOBS = [
  {
    id: 'b1',
    client_id: null,
    service_name: 'Ultimate Overhaul',
    scheduled_date: '2026-11-12',
    scheduled_time: '13:00:00',
    status: 'confirmed',
  },
  {
    id: 'b2',
    client_id: null,
    service_name: 'Tune-Up',
    scheduled_date: '2026-11-12',
    scheduled_time: '09:00:00',
    status: 'confirmed',
  },
  {
    id: 'b3',
    client_id: null,
    service_name: 'A service renamed since',
    scheduled_date: '2026-11-12',
    scheduled_time: '11:00:00',
    status: 'confirmed',
  },
];
globalThis.fetch = async (url) => {
  const u = String(url);
  const json = (b) => ({
    ok: true,
    status: 200,
    json: async () => b,
    headers: { get: () => null },
  });
  if (u.includes('/escalation_contacts'))
    return json([{ id: MID, van_number: null, session_version: 0, active: true }]);
  if (u.includes('/rest/v1/bookings')) return json(JOBS.map((j) => ({ ...j })));
  if (u.includes('/rest/v1/services')) {
    if (servicesDown) return { ok: false, status: 503, json: async () => ({}) };
    return json([
      { name: 'Ultimate Overhaul', duration_max: 240 },
      { name: 'Tune-Up', duration_max: 60 },
    ]);
  }
  return json([]);
};

const { handleMechanicJobs } = await import('../../api/auth.js');
const authSrc = readFileSync(new URL('../../api/auth.js', import.meta.url), 'utf8');
const makeToken = new Function(
  'crypto',
  `${authSrc.match(/const TOKEN_TTL_MS = [^;]+;/)[0]}
   ${authSrc.match(/function b64url\(buf\) \{[\s\S]*?\n\}/)[0]}
   ${authSrc.match(/function makeToken\(mid, sv = 0\) \{[\s\S]*?\n\}/)[0]}
   return makeToken;`
)(crypto);

const jobs = async () => {
  const res = { statusCode: null, body: null, headers: {} };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  await handleMechanicJobs({ headers: {}, body: { token: makeToken(MID, 0) } }, res);
  return res;
};

beforeEach(() => {
  servicesDown = false;
});

describe("the mechanic's job list carries each job's duration", () => {
  it('from the services table, by name', async () => {
    const r = await jobs();
    expect(r.statusCode, JSON.stringify(r.body)).toBe(200);
    const by = Object.fromEntries(r.body.map((j) => [j.id, j.duration_max]));
    expect(by).toEqual({ b1: 240, b2: 60, b3: null });
  });
  it('a services failure costs the end times, never the jobs', async () => {
    servicesDown = true;
    const r = await jobs();
    expect(r.statusCode).toBe(200);
    expect(r.body.map((j) => j.id)).toEqual(['b1', 'b2', 'b3']);
  });
});

const lift = (file, name) => {
  const src = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').replace(
    /\r\n/g,
    '\n'
  );
  const fn = src.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))[0];
  return { fn: new Function(`${fn}\nreturn ${name};`)(), src };
};

describe('what each screen shows', () => {
  it('the mechanic: "13:00-17:00" on the card and in the schedule', () => {
    const { fn: jobEnd, src } = lift('js/mechanic.js', 'jobEnd');
    expect(jobEnd('13:00:00', 240)).toBe('17:00');
    expect(jobEnd('09:00', 90)).toBe('10:30');
    expect(jobEnd('09:00', null)).toBe('');
    expect(jobEnd('', 60)).toBe('');
    expect(src).toMatch(/const end = jobEnd\(j\.time, j\.duration_max\);/);
    expect(src).toMatch(/duration_max: b\.duration_max \?\? null,/);
  });

  it('Admin: the calendar and the booking detail show the range', () => {
    const { fn: jobTimeRange, src } = lift('js/admin.js', 'jobTimeRange');
    expect(jobTimeRange('13:00:00', 240)).toBe('13:00-17:00');
    expect(jobTimeRange('9:00', 45)).toBe('09:00-09:45');
    expect(jobTimeRange('10:00:00', null)).toBe('10:00');
    expect(src).toMatch(
      /const time = jobTimeRange\(j\.scheduled_time, durations\.get\(j\.service_name\)\);/
    );
    expect(src).toMatch(/row\('Time', esc\(jobTimeRange\(b\.scheduled_time, durationMax\)/);
  });

  it('the client: an "Estimated finish" row in the booking summary', () => {
    const app = readFileSync(new URL('../../js/app.js', import.meta.url), 'utf8');
    expect(app).toMatch(/createSummaryRow\(translateValue\('Estimated finish'\), finishAt\)/);
    expect(app).toMatch(/startMin \+ Number\(service\.duration_max\)/);
  });
});
