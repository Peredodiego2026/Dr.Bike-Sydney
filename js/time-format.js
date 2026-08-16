// Two time vocabularies meet in this app, and nothing used to convert between
// them.
//
//   - The availability endpoint (`/api/auth?role=get-availability`) answers in
//     12-hour labels: "8:00 AM", "12:00 PM". That is what the slot grid shows.
//   - `bookings.scheduled_time` is a Postgres `time without time zone`, so
//     PostgREST hands it back as "10:00:00", and `client-reschedule` validates
//     what it is sent against /^\d{2}:\d{2}$/.
//
// The reschedule sheet put a slot label straight into the request, so every
// client reschedule answered "Invalid time format (HH:MM)" - the flow could
// never succeed, for anybody. The same sheet also ran the label through a
// formatter that appended a second suffix to it ("12:00 PM" -> "12 PMpm"), and
// the booking card printed the raw column, so the client read "10:00:00".
//
// Both directions live here, dependency-free, so they can be unit tested.

const HHMM = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const TWELVE_HOUR = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i;

// Minutes since midnight, or null if the value is not a time we recognise.
// Accepts every shape that reaches the client: "8:00 AM", "12:00 PM",
// "10:00:00", "14:30", "8:00".
export function timeToMinutes(value) {
  const t = String(value ?? '').trim();
  if (!t) return null;

  const twelve = t.match(TWELVE_HOUR);
  if (twelve) {
    let h = Number(twelve[1]);
    const m = Number(twelve[2]);
    if (h < 1 || h > 12 || m > 59) return null;
    const pm = twelve[3].toUpperCase() === 'PM';
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    return h * 60 + m;
  }

  const hhmm = t.match(HHMM);
  if (hhmm) {
    const h = Number(hhmm[1]);
    const m = Number(hhmm[2]);
    // Seconds are read only to reject "10:00:99"; the app has no sub-minute
    // slots, so they never survive into the value.
    const s = hhmm[3] === undefined ? 0 : Number(hhmm[3]);
    if (h > 23 || m > 59 || s > 59) return null;
    return h * 60 + m;
  }

  return null;
}

// "HH:MM", 24-hour and zero-padded - the shape the database column holds and
// the shape `client-reschedule` demands. Returns null rather than a guess, so
// a caller cannot post something the server will reject.
export function toDbTime(value) {
  const mins = timeToMinutes(value);
  if (mins === null) return null;
  return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
}

// What a person reads: "8:00 AM", "12:00 PM", "10:30 AM". Returns '' for
// anything unrecognised, so a missing time renders as nothing rather than as
// the word "null".
export function toDisplayTime(value) {
  const mins = timeToMinutes(value);
  if (mins === null) return '';
  const h24 = Math.floor(mins / 60);
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mins % 60).padStart(2, '0')} ${suffix}`;
}

// True when two values name the same clock time whatever shape they arrive in
// - "10:00 AM" and "10:00:00" are the same slot. Used to pre-select the
// booking's current time in the reschedule list, which never matched before
// because it compared a label against a column value.
export function sameTime(a, b) {
  const ma = timeToMinutes(a);
  const mb = timeToMinutes(b);
  return ma !== null && ma === mb;
}
