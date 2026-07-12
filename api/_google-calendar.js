// api/_google-calendar.js — shared helpers for syncing confirmed bookings to a
// single "Dr. Bike Sydney Operations" Google Calendar (Diego's own account). The
// assigned mechanic is invited as an attendee on each event so they get native
// Google Calendar notifications/alarms/colors on their phone - no custom
// mechanic-facing calendar UI needed.
//
// Inert by design: every exported function is a safe no-op (returns null,
// never throws) until GOOGLE_CALENDAR_CLIENT_ID/SECRET are set in the
// environment AND an account has been connected via /api/google-calendar-connect.
// Callers should treat these as fire-and-forget, same as the WhatsApp/email
// notification calls elsewhere in this codebase.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co';

function sbClient() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  return createClient(SUPABASE_URL, key);
}

// The refresh token is stored as a special van_zones row (van_number=0), the
// same hack already used elsewhere in this codebase to store the WhatsApp
// business sender number (see api/send-message.js) - avoids a brand new table
// for a single value.
const TOKEN_ROW = { van_number: 0, suburb: '__google_calendar__' };

export function isGoogleCalendarConfigured() {
  return !!(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET);
}

export async function saveGoogleRefreshToken(refreshToken) {
  const sb = sbClient();
  const { data: existing } = await sb
    .from('van_zones')
    .select('id')
    .eq('van_number', TOKEN_ROW.van_number)
    .eq('suburb', TOKEN_ROW.suburb)
    .maybeSingle();
  if (existing) {
    await sb.from('van_zones').update({ postcode: refreshToken }).eq('id', existing.id);
  } else {
    await sb.from('van_zones').insert({ ...TOKEN_ROW, postcode: refreshToken });
  }
}

async function getStoredRefreshToken() {
  const sb = sbClient();
  const { data } = await sb
    .from('van_zones')
    .select('postcode')
    .eq('van_number', TOKEN_ROW.van_number)
    .eq('suburb', TOKEN_ROW.suburb)
    .maybeSingle();
  return data?.postcode || null;
}

// Exchanges the stored refresh token for a fresh ~1h access token. Never
// throws - returns null if not configured, not connected yet, or the Google
// call fails, so every sync function below stays safe to fire-and-forget.
async function getAccessToken() {
  if (!isGoogleCalendarConfigured()) return null;
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) return null;
  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
        client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

// Accepts both time formats used across this codebase: "8:00 AM" (ALL_SLOTS,
// most of api/auth.js) and plain 24h "14:30" (handleClientReschedule). Local
// copy of the 12h parsing already in api/auth.js, kept separate to avoid a
// circular import (auth.js imports FROM this file, not the other way around).
function parseTime(time) {
  const s = String(time || '').trim();
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const min = parseInt(ampm[2], 10);
    if (ampm[3].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (ampm[3].toUpperCase() === 'AM' && h === 12) h = 0;
    return { h, min };
  }
  const h24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (h24) return { h: parseInt(h24[1], 10), min: parseInt(h24[2], 10) };
  return null;
}

// Naive local ISO datetime ("2026-08-10T08:00:00") - Google Calendar's API
// takes this plus a separate timeZone field, so no UTC conversion needed here.
function localIso(dateStr, time) {
  const t = parseTime(time);
  if (!t) return null;
  const hh = String(t.h).padStart(2, '0');
  const mm = String(t.min).padStart(2, '0');
  return `${dateStr}T${hh}:${mm}:00`;
}

function addMinutesToIso(iso, minutes) {
  const d = new Date(iso + '+10:00'); // AEST offset is only used to do safe arithmetic; the
  // date/time PARTS (not the instant) are what we send back to Google, so DST
  // transitions across the added duration don't matter here.
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;
}

// Creates a calendar event for a confirmed booking, inviting the mechanic by
// email as an attendee. Returns the new event's id (to store as
// bookings.google_event_id for later updates/deletes), or null if sync is
// unavailable for any reason.
export async function createCalendarEvent({
  scheduledDate,
  scheduledTime,
  durationMin,
  serviceName,
  address,
  clientName,
  mechanicEmail,
}) {
  const token = await getAccessToken();
  if (!token) return null;
  const startIso = localIso(scheduledDate, scheduledTime);
  if (!startIso) return null;
  const endIso = addMinutesToIso(startIso, durationMin);

  try {
    const resp = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: `${serviceName || 'Service'} - ${clientName || 'Client'}`,
          location: address || '',
          description: `Dr. Bike Sydney booking for ${clientName || 'a client'}.`,
          start: { dateTime: startIso, timeZone: 'Australia/Sydney' },
          end: { dateTime: endIso, timeZone: 'Australia/Sydney' },
          attendees: mechanicEmail ? [{ email: mechanicEmail }] : [],
          reminders: { useDefault: true },
        }),
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.id || null;
  } catch {
    return null;
  }
}

export async function updateCalendarEvent(eventId, { scheduledDate, scheduledTime, durationMin }) {
  if (!eventId) return false;
  const token = await getAccessToken();
  if (!token) return false;
  const startIso = localIso(scheduledDate, scheduledTime);
  if (!startIso) return false;
  const endIso = addMinutesToIso(startIso, durationMin);
  try {
    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: { dateTime: startIso, timeZone: 'Australia/Sydney' },
          end: { dateTime: endIso, timeZone: 'Australia/Sydney' },
        }),
      }
    );
    return resp.ok;
  } catch {
    return false;
  }
}

export async function deleteCalendarEvent(eventId) {
  if (!eventId) return false;
  const token = await getAccessToken();
  if (!token) return false;
  try {
    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    );
    return resp.ok || resp.status === 410; // 410 = already gone, fine
  } catch {
    return false;
  }
}
