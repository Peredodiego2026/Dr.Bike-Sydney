// tests/unit/e2e-supabase-traffic.test.js - the production smoke suite spends
// the live Supabase project's quota on every run (Oct 2026: a 1.9 MB profile
// photo x ~22 landing loads a run x 4 runs a day was the whole 5 GB). These
// keep the meter wired, the 6-hourly run small, and the photo guard in place.
// Run: npm test
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { summarize, toMarkdown } from '../../scripts/e2e-supabase-traffic.mjs';

const read = (p) =>
  fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const PHOTO = 'https://x.supabase.co/storage/v1/object/public/job-photos/profiles/a.jpeg';

describe('the run total', () => {
  const lines = [
    {
      project: 'Desktop Chrome',
      file: 'homepage.test.js',
      title: 'a',
      requests: 3,
      bytes: 1976000,
      heaviest: { url: PHOTO, bytes: 1974000 },
    },
    {
      project: 'Desktop Chrome',
      file: 'homepage.test.js',
      title: 'b',
      requests: 3,
      bytes: 1976000,
      heaviest: { url: PHOTO, bytes: 1974000 },
    },
    {
      project: 'Mobile Chrome',
      file: 'mobile-spa.test.js',
      title: 'c',
      requests: 2,
      bytes: 1500,
      heaviest: { url: 'https://x.supabase.co/rest/v1/services?select=name', bytes: 1100 },
    },
    {
      project: 'Desktop Chrome',
      file: 'all-pages-smoke.test.js',
      title: '/blog/x',
      requests: 0,
      bytes: 0,
      heaviest: null,
    },
  ].map((l) => JSON.stringify(l));

  it('adds up requests and bytes, per project and per spec', () => {
    const s = summarize([...lines, '']);
    expect(s).toMatchObject({ tests: 4, requests: 8, bytes: 3953500 });
    expect(s.byProject.get('Desktop Chrome')).toEqual({ tests: 3, requests: 6, bytes: 3952000 });
    expect(s.byFile.get('mobile-spa.test.js').requests).toBe(2);
  });

  it('names the file that costs the most, and how often', () => {
    const s = summarize(lines);
    expect(s.heaviest[0]).toEqual({ url: PHOTO, bytes: 1974000, times: 2 });
    expect(toMarkdown(s)).toContain(`1927.7 KB x 2 - ${PHOTO}`);
  });
});

describe('the suite is metered and the 6-hourly run stays small', () => {
  it('every spec imports test from the metering fixture', () => {
    for (const f of ['all-pages-smoke', 'homepage', 'mobile-spa', 'consent-banner-overlap']) {
      const src = read(`tests/e2e/${f}.test.js`);
      expect(src, f).toContain("from './fixtures.js'");
      expect(src, f).not.toContain("from '@playwright/test'");
    }
    expect(read('tests/e2e/fixtures.js')).toMatch(/auto: true/);
  });

  it('the 6-hourly run checks the core pages; the daily one checks everything', () => {
    const wf = read('.github/workflows/e2e-smoke.yml');
    expect(wf).toContain("- cron: '0 */6 * * *'");
    expect(wf).toContain("- cron: '30 3 * * *'");
    expect(wf).toContain(
      "SMOKE_SCOPE: ${{ github.event.schedule == '0 */6 * * *' && 'core' || 'all' }}"
    );
    expect(wf).toMatch(/if: always\(\)\n\s+run: node scripts\/e2e-supabase-traffic\.mjs/);
    expect(read('tests/e2e/all-pages-smoke.test.js')).toMatch(
      /process\.env\.SMOKE_SCOPE === 'core' \? CORE_PAGES : \[\.\.\.CORE_PAGES, \.\.\.MARKETING_PAGES\]/
    );
  });

  it('a Supabase response over 300 KB fails the page', () => {
    const src = read('tests/e2e/all-pages-smoke.test.js');
    expect(src).toContain('const SUPABASE_MAX_BYTES = 300 * 1024;');
    expect(src).toMatch(/expect\(heavy, /);
  });
});
