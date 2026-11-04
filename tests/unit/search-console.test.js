// tests/unit/search-console.test.js - the Google Search card on Admin >
// Analytics (api/_search-console.js + anSearchHtml in js/admin.js).
//
// What it pins:
//  - each way Google can say no becomes its own code, so the card tells Diego
//    what to do instead of looking like "nobody searched";
//  - searches are re-sorted by times shown, because a search that showed the
//    site and got no click is the point of the card;
//  - the connect flow asks for Search Console AND keeps the calendar scope;
//  - a search typed by a stranger is escaped before it reaches the admin page.
// Run: npm test
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  readSearchConsole,
  classifyGoogleError,
  searchConsoleWindow,
  scrubGoogleTokens,
  SEARCH_CONSOLE_SITE,
} from '../../api/_search-console.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

// 2026-11-05 19:00 UTC is already 6 November in Sydney (UTC+11).
const NOW = new Date('2026-11-05T19:00:00Z');

const okFetch = (byDimension) => {
  const calls = [];
  const impl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, auth: init.headers.Authorization });
    const key = body.dimensions ? body.dimensions[0] : 'totals';
    return { ok: true, status: 200, json: async () => ({ rows: byDimension[key] }) };
  };
  return { impl, calls };
};

const failFetch = (status, message) => async () => ({
  ok: false,
  status,
  json: async () => ({ error: { code: status, message } }),
});

describe('searchConsoleWindow', () => {
  it('ends on the Sydney date, not the UTC one', () => {
    expect(searchConsoleWindow(30, NOW)).toEqual({ days: 30, start: '2026-10-08', end: '2026-11-06' });
  });

  it('caps "All time" at the 16 months Search Console keeps', () => {
    expect(searchConsoleWindow(730, NOW).days).toBe(480);
  });
});

describe('classifyGoogleError', () => {
  it('a token from before the scope was added asks for a reconnect', () => {
    expect(classifyGoogleError(403, { error: { message: 'Request had insufficient authentication scopes.' } }).code).toBe('reconnect');
  });

  it('a revoked or expired connection asks for a reconnect', () => {
    expect(classifyGoogleError(401, { error: { message: 'Invalid Credentials' } }).code).toBe('reconnect');
  });

  it('the API switched off in Google Cloud is its own case, with Google\'s link kept', () => {
    const msg =
      'Google Search Console API has not been used in project 123 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/searchconsole.googleapis.com/overview?project=123 then retry.';
    const g = classifyGoogleError(403, { error: { message: msg } });
    expect(g.code).toBe('api_disabled');
    expect(g.error).toContain('project=123');
  });

  it('an account that does not own the site is told so', () => {
    const g = classifyGoogleError(403, {
      error: { message: "User does not have sufficient permission for site 'sc-domain:drbikesydney.com.au'." },
    });
    expect(g.code).toBe('permission');
  });

  it('anything else is a plain error with the status', () => {
    expect(classifyGoogleError(500, { error: { message: 'Backend Error' } })).toEqual({
      code: 'error',
      error: 'Search Console HTTP 500: Backend Error',
    });
  });
});

describe('scrubGoogleTokens', () => {
  it('never lets an access or refresh token through to the browser', () => {
    const out = scrubGoogleTokens('bad ya29.a0AfH6SMBx-y_z.9 and 1//0gAbC-dEf_9');
    expect(out).not.toMatch(/a0AfH6|0gAbC/);
    expect(out).toContain('ya29.[redacted]');
  });
});

describe('readSearchConsole', () => {
  it('says when Google is not set up on the server', async () => {
    expect(await readSearchConsole(30, { configured: false })).toEqual({
      configured: false,
      code: 'not_configured',
    });
  });

  it('says when nobody has connected Google yet', async () => {
    const r = await readSearchConsole(30, { configured: true, getToken: async () => null });
    expect(r).toMatchObject({ configured: true, connected: false, code: 'not_connected' });
  });

  it('reads totals, searches and pages for the domain property', async () => {
    const { impl, calls } = okFetch({
      totals: [{ clicks: 12, impressions: 840, ctr: 0.0143, position: 9.4 }],
      query: [
        { keys: ['bike repair sydney'], clicks: 10, impressions: 100, ctr: 0.1, position: 4.2 },
        { keys: ['mobile bike mechanic'], clicks: 0, impressions: 300, ctr: 0, position: 11.8 },
      ],
      page: [
        { keys: ['https://drbikesydney.com.au/'], clicks: 9, impressions: 500, ctr: 0.018, position: 8 },
        { keys: ['https://www.drbikesydney.com.au/cbd'], clicks: 3, impressions: 40, ctr: 0.075, position: 6 },
      ],
    });
    const r = await readSearchConsole(30, {
      configured: true,
      getToken: async () => 'ya29.test',
      fetchImpl: impl,
      now: NOW,
    });

    expect(calls).toHaveLength(3);
    expect(calls[0].url).toContain(encodeURIComponent(SEARCH_CONSOLE_SITE));
    expect(calls.every((c) => c.auth === 'Bearer ya29.test')).toBe(true);
    expect(calls[0].body).toMatchObject({ startDate: '2026-10-08', endDate: '2026-11-06' });

    expect(r.code).toBe('ok');
    expect(r.totals).toEqual({ clicks: 12, impressions: 840, ctr: 0.0143, position: 9.4 });
    // Times shown first: the search nobody clicked leads.
    expect(r.queries.map((q) => q.query)).toEqual(['mobile bike mechanic', 'bike repair sydney']);
    expect(r.pages.map((p) => p.path)).toEqual(['/', 'www.drbikesydney.com.au/cbd']);
    expect(r.failed).toBeNull();
  });

  it('an empty site is zeros, not a failure', async () => {
    const { impl } = okFetch({ totals: undefined, query: undefined, page: undefined });
    const r = await readSearchConsole(30, { configured: true, getToken: async () => 't', fetchImpl: impl, now: NOW });
    expect(r.totals).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: null });
    expect(r.queries).toEqual([]);
    expect(r.pages).toEqual([]);
  });

  it('every query refused: the reason comes back as a code, not as empty data', async () => {
    const r = await readSearchConsole(30, {
      configured: true,
      getToken: async () => 't',
      fetchImpl: failFetch(403, 'Request had insufficient authentication scopes.'),
      now: NOW,
    });
    expect(r).toMatchObject({ connected: true, code: 'reconnect' });
    expect(r.totals).toBeUndefined();
  });
});

describe('the connect flow', () => {
  const auth = readFileSync(join(root, 'api/auth.js'), 'utf8');
  const connect = auth.match(/async function handleGoogleCalendarConnect[\s\S]*?\n\}/)[0];

  it('asks for read-only Search Console and keeps the calendar', () => {
    expect(connect).toContain('https://www.googleapis.com/auth/calendar ');
    expect(connect).toContain('https://www.googleapis.com/auth/webmasters.readonly');
    expect(connect).not.toMatch(/auth\/webmasters['" ]/);
  });

  it('the analytics endpoint returns the search half', () => {
    const handler = auth.match(/async function handleAdminAnalytics[\s\S]*?\n\}/)[0];
    expect(handler).toContain('readSearchConsole(days)');
    expect(handler).toMatch(/json\(\{ checkout, traffic, recon, search \}\)/);
  });
});

// js/admin.js is a classic script: lift the card's HTML builder and the
// helpers it calls, same approach as tests/unit/analytics-margins.test.js.
const adminSrc = readFileSync(join(root, 'js/admin.js'), 'utf8');
const grab = (re, what) => {
  const m = adminSrc.match(re);
  if (!m) throw new Error(`${what} not found in js/admin.js`);
  return m[0];
};
const anSearchHtml = new Function(
  `
  ${grab(/function esc\(str\) \{[\s\S]*?\n\}/, 'esc')}
  ${grab(/function anCompact\(n\) \{[\s\S]*?\n\}/, 'anCompact')}
  ${grab(/function anState\(html, kind\) \{[\s\S]*?\n\}/, 'anState')}
  ${grab(/function anEmpty\(title, detail\) \{[\s\S]*?\n\}/, 'anEmpty')}
  ${grab(/function anError\(detail\) \{[\s\S]*?\n\}/, 'anError')}
  ${grab(/function anBarList\(rows, opts = \{\}\) \{[\s\S]*?\n\}/, 'anBarList')}
  ${grab(/function anSearchHtml\(g\) \{[\s\S]*?\n\}/, 'anSearchHtml')}
  return anSearchHtml;
`
)();

describe('anSearchHtml', () => {
  it.each([
    ['not_connected', 'Google is not connected'],
    ['reconnect', 'Reconnect Google to allow Search Console'],
    ['api_disabled', 'The Search Console API is switched off in Google Cloud'],
    ['permission', 'This Google account cannot see drbikesydney.com.au in Search Console'],
    ['not_configured', 'Google is not set up on the server'],
  ])('%s tells Diego what to do', (code, title) => {
    const html = anSearchHtml({ code });
    expect(html).toContain(title);
    expect(html).not.toContain('Shown in Google');
  });

  it('shows the four numbers and both lists', () => {
    const html = anSearchHtml({
      code: 'ok',
      totals: { clicks: 12, impressions: 840, ctr: 0.0143, position: 9.44 },
      queries: [{ query: 'mobile bike mechanic', clicks: 0, impressions: 300, ctr: 0, position: 11.8 }],
      pages: [{ path: '/', clicks: 9, impressions: 500, ctr: 0.018, position: 8 }],
      failed: null,
    });
    expect(html).toContain('840');
    expect(html).toContain('1.4%');
    expect(html).toContain('9.4');
    expect(html).toContain('mobile bike mechanic');
    expect(html).toContain('0 clicks · #11.8');
    expect(html).toContain('9 clicks');
  });

  it('a failed totals query reads "Could not load", never zero', () => {
    const html = anSearchHtml({ code: 'ok', totals: null, queries: [], pages: [], failed: { totals: 'HTTP 500' } });
    expect(html).toContain('Could not load');
    expect(html).toContain('totals (HTTP 500)');
  });

  it('escapes a search somebody typed into Google', () => {
    const html = anSearchHtml({
      code: 'ok',
      totals: { clicks: 0, impressions: 1, ctr: 0, position: 3 },
      queries: [{ query: '<img src=x onerror=alert(1)>', clicks: 0, impressions: 1, ctr: 0, position: 3 }],
      pages: [],
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
