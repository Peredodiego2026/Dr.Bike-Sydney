// scripts/analytics-block.mjs - keeps our own robots out of Google Analytics
// and PostHog. Used by the e2e suite (tests/e2e/fixtures.js) and by
// `npm run look`, the two places a scripted browser opens the live site.
//
// Why: .github/workflows/e2e-smoke.yml opens production 5 times a day, in
// three browsers, and one test presses Accept on the cookie banner. GA counted
// every one of those as a visitor - Diego read "92 active users" in GA on
// 2026-11-05 with an unknown share of it being the suite. And since PR #585
// PostHog counts visitors who never answer the banner too (cookieless), so
// from then on every page the suite opened would have been a "visitor" there
// as well. PostHog drops a HeadlessChrome user agent on its own, but the
// suite's phone projects send a real iPhone/Pixel user agent, which it keeps.
//
// The requests are answered here, empty, instead of aborted: an aborted
// script is a console error, and tests/e2e/all-pages-smoke.test.js fails on
// console errors. An empty gtag.js / array.js leaves the page's own stubs in
// place - gtag() keeps pushing to dataLayer and posthog.capture() keeps
// queueing - so nothing on the page notices, and nothing leaves the browser.
export const ANALYTICS_HOSTS =
  /^https:\/\/([a-z0-9-]+\.)*(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net|posthog\.com)\//;

export function answerAnalyticsEmpty(route) {
  const origin = route.request().headers()['origin'];
  return route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    // A fetch from the page needs CORS to read even an empty answer, or the
    // browser logs a CORS error - the same console error, by another road.
    headers: origin
      ? { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' }
      : {},
    body: '',
  });
}
