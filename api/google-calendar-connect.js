// api/google-calendar-connect.js — starts the one-time OAuth flow that connects
// Diego's Google account for calendar sync (see api/_google-calendar.js). Linked
// from a button in Admin Settings; redirects the browser to Google's consent
// screen. The actual token exchange happens in google-calendar-callback.js.
import { isGoogleCalendarConfigured } from './_google-calendar.js';

export default async function handler(req, res) {
  if (!isGoogleCalendarConfigured()) {
    return res
      .status(503)
      .send('Google Calendar is not configured yet (missing Client ID/Secret).');
  }
  const redirectUri = `https://${req.headers.host}/api/google-calendar-callback`;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent', // forces a refresh_token even if this account connected before
    scope: 'https://www.googleapis.com/auth/calendar',
  });
  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  res.end();
}
