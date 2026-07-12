// api/google-calendar-callback.js — OAuth redirect target for the Google Calendar
// connect flow (configured in Google Cloud Console as the authorized redirect
// URI). Exchanges the one-time code for a refresh token and stores it, then
// bounces back to Admin with a success/error flag.
import { isGoogleCalendarConfigured, saveGoogleRefreshToken } from './_google-calendar.js';

export default async function handler(req, res) {
  const code = req.query?.code;
  const err = req.query?.error;
  if (err || !code || !isGoogleCalendarConfigured()) {
    res.writeHead(302, { Location: '/admin.html?page=settings&calendar=error' });
    return res.end();
  }

  try {
    const redirectUri = `https://${req.headers.host}/api/google-calendar-callback`;
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
        client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.refresh_token) {
      // Google omits refresh_token on a repeat consent without prompt=consent -
      // google-calendar-connect.js always sends prompt=consent to avoid this,
      // but fail loudly here rather than silently keeping a stale/missing token.
      console.error('[google-calendar-callback] token exchange failed:', data);
      res.writeHead(302, { Location: '/admin.html?page=settings&calendar=error' });
      return res.end();
    }
    await saveGoogleRefreshToken(data.refresh_token);
    res.writeHead(302, { Location: '/admin.html?page=settings&calendar=connected' });
    res.end();
  } catch (e) {
    console.error('[google-calendar-callback] error:', e.message);
    res.writeHead(302, { Location: '/admin.html?page=settings&calendar=error' });
    res.end();
  }
}
