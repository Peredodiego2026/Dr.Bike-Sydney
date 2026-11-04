// api/_search-console.js - reads Google Search Console for the "Google Search"
// card on Admin > Analytics (handleAdminAnalytics in api/auth.js).
//
// Why Search Console and not Google Analytics: the Traffic card already shows
// who visited (PostHog). What nothing else on that screen can show is the
// people who SAW Dr. Bike in Google and did not click - impressions - and what
// they had typed. That is the one thing Search Console knows and nobody else
// does.
//
// No second Google login: it rides on the calendar connection (Admin >
// Settings > Connect Google), whose consent now asks for webmasters.readonly
// next to calendar. Read-only, server-side only - the token never reaches the
// browser. A token minted before that scope was added gets 403 "insufficient
// authentication scopes", which the card turns into "reconnect in Settings".
import { isGoogleCalendarConfigured, getAccessToken } from './_google-calendar.js';

// A Domain property, verified by DNS TXT at VentraIP on 2026-11-05. It covers
// www and http too, so no second property is needed.
export const SEARCH_CONSOLE_SITE = 'sc-domain:drbikesydney.com.au';
const API = 'https://searchconsole.googleapis.com/webmasters/v3/sites/';

// Shares one Vercel function with PostHog, Stripe and checkout_attempts - same
// reason POSTHOG_TIMEOUT_MS exists in auth.js.
const TIMEOUT_MS = 6000;

// Search Console keeps 16 months. "All time" on the screen sends 730 days;
// asking Google for more than it keeps returns nothing extra, and the card
// says how far back it really reaches.
export const SEARCH_CONSOLE_MAX_DAYS = 480;

// Google's query answers are tiny, but its error strings are echoed to the
// admin's browser. ya29. is an access token, 1// a refresh token.
export function scrubGoogleTokens(text) {
  return String(text)
    .replace(/ya29\.[A-Za-z0-9._-]+/g, 'ya29.[redacted]')
    .replace(/1\/\/[A-Za-z0-9._-]+/g, '1//[redacted]');
}

// Dates are the business's days, not UTC ones. Google keys its data by
// Pacific time, which no window of ours can match exactly - the card says the
// last couple of days are always missing anyway.
export function searchConsoleWindow(days, now = new Date()) {
  const span = Math.min(Math.max(parseInt(days, 10) || 30, 1), SEARCH_CONSOLE_MAX_DAYS);
  const end = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const start = new Date(`${end}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (span - 1));
  return { days: span, start: start.toISOString().slice(0, 10), end };
}

// Each 403 Google returns here is a different fix for Diego, so each gets a
// code the card can explain in plain words. Order matters: the "API disabled"
// message also says permission-ish things.
export function classifyGoogleError(status, body) {
  const msg = scrubGoogleTokens(body?.error?.message || '').slice(0, 300);
  if (status === 401) return { code: 'reconnect', error: msg || 'Google rejected the connection' };
  if (/insufficient authentication scopes/i.test(msg)) return { code: 'reconnect', error: msg };
  if (/has not been used in project|is disabled|accessNotConfigured/i.test(msg))
    return { code: 'api_disabled', error: msg };
  if (status === 403 && /permission/i.test(msg)) return { code: 'permission', error: msg };
  return { code: 'error', error: `Search Console HTTP ${status}${msg ? ': ' + msg : ''}` };
}

async function gscQuery(token, body, fetchImpl) {
  const r = await fetchImpl(
    API + encodeURIComponent(SEARCH_CONSOLE_SITE) + '/searchAnalytics/query',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const g = classifyGoogleError(r.status, json);
    const err = new Error(g.error);
    err.code = g.code;
    throw err;
  }
  return json.rows || [];
}

// Pages come back as full URLs. The path is what the Traffic card shows too,
// so the two lists read the same; any other host is kept so it stands out.
function toPath(url) {
  try {
    const u = new URL(url);
    const host = u.hostname === 'drbikesydney.com.au' ? '' : u.hostname;
    return host + u.pathname + u.search;
  } catch {
    return String(url || 'unknown');
  }
}

// Google sorts by clicks. A search that showed Dr. Bike 200 times and never
// got a click is exactly what this card is for, so ask for plenty and re-sort
// by impressions here.
const byImpressions = (a, b) => b.impressions - a.impressions || b.clicks - a.clicks;

export async function readSearchConsole(days, deps = {}) {
  const configured = deps.configured ?? isGoogleCalendarConfigured();
  if (!configured) return { configured: false, code: 'not_configured' };

  const token = await (deps.getToken || getAccessToken)();
  if (!token) return { configured: true, connected: false, code: 'not_connected' };

  const fetchImpl = deps.fetchImpl || fetch;
  const win = searchConsoleWindow(days, deps.now);
  const base = { startDate: win.start, endDate: win.end };
  const q = {
    totals: base,
    queries: { ...base, dimensions: ['query'], rowLimit: 250 },
    pages: { ...base, dimensions: ['page'], rowLimit: 100 },
  };
  const names = Object.keys(q);
  const settled = await Promise.allSettled(names.map((n) => gscQuery(token, q[n], fetchImpl)));

  const res = {};
  const failed = {};
  let firstCode = null;
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') res[names[i]] = s.value;
    else {
      failed[names[i]] = scrubGoogleTokens(s.reason?.message || 'query failed');
      firstCode = firstCode || s.reason?.code || 'error';
    }
  });

  // Nothing came back: a connection problem, not an empty site.
  if (!Object.keys(res).length) {
    return {
      configured: true,
      connected: true,
      ...win,
      code: firstCode,
      error: Object.values(failed)[0],
    };
  }

  const row = (r) => ({
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    ctr: r.ctr || 0,
    position: r.position ?? null,
  });
  const t = res.totals ? res.totals[0] : undefined;

  return {
    configured: true,
    connected: true,
    ...win,
    code: 'ok',
    failed: Object.keys(failed).length ? failed : null,
    // null = that query failed; zeros = it ran and Google had nothing.
    totals: res.totals
      ? t
        ? row(t)
        : { clicks: 0, impressions: 0, ctr: 0, position: null }
      : null,
    queries: res.queries
      ? res.queries
          .map((r) => ({ query: r.keys?.[0] || '', ...row(r) }))
          .sort(byImpressions)
          .slice(0, 15)
      : null,
    pages: res.pages
      ? res.pages
          .map((r) => ({ path: toPath(r.keys?.[0]), ...row(r) }))
          .sort(byImpressions)
          .slice(0, 10)
      : null,
  };
}
