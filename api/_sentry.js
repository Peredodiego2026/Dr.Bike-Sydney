// api/_sentry.js — Sentry error tracking for API routes
// DSN defaults to the public project DSN (same one used client-side); override with
// SENTRY_DSN env var if needed. Dashboard: https://sentry.io → Dr.Bike-Sydney project.

import * as Sentry from '@sentry/node';

const DSN =
  process.env.SENTRY_DSN ||
  'https://dbe16e37f69ca4ae1724ab697c0f4255@o4511637539651584.ingest.de.sentry.io/4511637556625488';

let _initialized = false;

export function initSentry() {
  if (_initialized || !DSN) return;
  Sentry.init({
    dsn: DSN,
    environment: process.env.VERCEL_ENV || 'development',
    tracesSampleRate: 0.2,
    // Don't send PII (email, names, cards) to Sentry
    beforeSend(event) {
      if (event.request?.data) {
        const sensitive = ['email', 'name', 'phone', 'card', 'password', 'token', 'access_token'];
        for (const key of sensitive) {
          if (event.request.data[key]) event.request.data[key] = '[REDACTED]';
        }
      }
      return event;
    },
  });
  _initialized = true;
}

export function captureException(err, context = {}) {
  initSentry();
  if (!DSN) {
    console.error('[Error]', err?.message || err, context);
    return;
  }
  Sentry.withScope((scope) => {
    if (context.endpoint) scope.setTag('endpoint', context.endpoint);
    if (context.user_id) scope.setUser({ id: context.user_id });
    scope.setExtras(context);
    Sentry.captureException(err);
  });
}

export function captureMessage(msg, level = 'info', context = {}) {
  initSentry();
  if (!DSN) {
    console.log(`[${level}]`, msg, context);
    return;
  }
  Sentry.withScope((scope) => {
    scope.setLevel(level);
    scope.setExtras(context);
    Sentry.captureMessage(msg);
  });
}

// Wrap a Vercel serverless handler so any uncaught error is reported to Sentry
// and the client still gets a clean 500 instead of a crash.
export function withSentry(handler, name) {
  return async function wrapped(req, res) {
    try {
      return await handler(req, res);
    } catch (err) {
      captureException(err, { endpoint: name || 'api' });
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
  };
}
