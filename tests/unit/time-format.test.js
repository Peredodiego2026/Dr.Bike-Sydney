// tests/unit/time-format.test.js — the client reschedule sheet posted the slot
// label it got from /api/auth?role=get-availability ("12:00 PM") to an endpoint
// that validates /^\d{2}:\d{2}$/, so EVERY reschedule answered "Invalid time
// format (HH:MM)". Reported by Diego with a screenshot on 16-Aug-2026, together
// with the two cosmetic halves of the same mismatch: the dropdown read
// "12 PMpm" and the booking card read "10:00:00".
//
// These pin the conversion in both directions, including the 12/24 boundaries
// that a naive parseInt gets wrong.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { toDbTime, toDisplayTime, sameTime, timeToMinutes } from '../../js/time-format.js';

describe('toDbTime - what the server is willing to accept', () => {
  it('converts every slot the availability endpoint can return', () => {
    // These are ALL_SLOTS in api/auth.js, verbatim.
    expect(
      [
        '8:00 AM',
        '9:00 AM',
        '10:00 AM',
        '11:00 AM',
        '12:00 PM',
        '1:00 PM',
        '2:00 PM',
        '3:00 PM',
        '4:00 PM',
        '5:00 PM',
      ].map(toDbTime)
    ).toEqual([
      '08:00',
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
    ]);
  });

  it('every converted slot passes the endpoint regex', () => {
    // The exact test handleClientReschedule runs. This is the assertion the
    // bug was hiding behind.
    const serverCheck = /^\d{2}:\d{2}$/;
    expect(serverCheck.test(toDbTime('12:00 PM'))).toBe(true);
    expect(serverCheck.test(toDbTime('8:00 AM'))).toBe(true);
    expect(serverCheck.test('12:00 PM')).toBe(false); // what used to be sent
  });

  it('handles the two hours that break a naive converter', () => {
    expect(toDbTime('12:00 AM')).toBe('00:00'); // midnight, not 12:00
    expect(toDbTime('12:30 PM')).toBe('12:30'); // noon stays 12, not 24
  });

  it('passes a value that is already 24h through unchanged', () => {
    expect(toDbTime('14:30')).toBe('14:30');
    expect(toDbTime('8:00')).toBe('08:00');
  });

  it('accepts the shape PostgREST returns for a `time` column', () => {
    expect(toDbTime('10:00:00')).toBe('10:00');
  });

  it('returns null instead of a guess', () => {
    // A guess here posts a wrong appointment time to a real customer.
    expect(toDbTime('')).toBeNull();
    expect(toDbTime(null)).toBeNull();
    expect(toDbTime(undefined)).toBeNull();
    expect(toDbTime('Loading available times...')).toBeNull();
    expect(toDbTime('25:00')).toBeNull();
    expect(toDbTime('13:00 PM')).toBeNull();
    expect(toDbTime('10:99')).toBeNull();
  });
});

describe('toDisplayTime - what the client reads', () => {
  it('turns the raw column value into a time a person recognises', () => {
    // The booking card printed "10:00:00" straight from the database.
    expect(toDisplayTime('10:00:00')).toBe('10:00 AM');
    expect(toDisplayTime('13:30:00')).toBe('1:30 PM');
  });

  it('does not append a second suffix to a label that has one', () => {
    // The old fmtTime() produced "12 PMpm" for exactly this input.
    expect(toDisplayTime('12:00 PM')).toBe('12:00 PM');
    expect(toDisplayTime('8:00 AM')).toBe('8:00 AM');
  });

  it('gets midnight and noon right', () => {
    expect(toDisplayTime('00:00')).toBe('12:00 AM');
    expect(toDisplayTime('12:00')).toBe('12:00 PM');
    expect(toDisplayTime('00:30')).toBe('12:30 AM');
  });

  it('renders nothing rather than the word null', () => {
    expect(toDisplayTime(null)).toBe('');
    expect(toDisplayTime('')).toBe('');
    expect(toDisplayTime('not a time')).toBe('');
  });
});

describe('sameTime - pre-selecting the booking current slot', () => {
  it('matches a slot label against the stored column value', () => {
    // `s.time === booking.scheduled_time` compared "10:00 AM" to "10:00:00",
    // so the client's own time was never the selected option.
    expect(sameTime('10:00 AM', '10:00:00')).toBe(true);
    expect(sameTime('1:00 PM', '13:00')).toBe(true);
  });

  it('is false for different times and for junk', () => {
    expect(sameTime('10:00 AM', '11:00:00')).toBe(false);
    expect(sameTime('10:00 AM', null)).toBe(false);
    expect(sameTime(null, null)).toBe(false);
  });
});

describe('the reschedule sheet is actually wired to the converter', () => {
  // The helper being right is not the fix; js/app.js calling it is. Verified
  // against production the same day: POSTing scheduled_time "12:00 PM" to
  // /api/auth (role client-reschedule) answers 400 "Invalid time format
  // (HH:MM)", and "12:00" gets past the format gate to the session check.
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../js/app.js'),
    'utf8'
  );

  it('builds the option value with toDbTime, not the raw slot label', () => {
    expect(src).toMatch(/const value = toDbTime\(s\.time\)/);
    expect(src).not.toMatch(/<option value="\$\{s\.time\}"/);
  });

  it('no longer carries the formatter that produced "12 PMpm"', () => {
    expect(src).not.toMatch(/fmtTime/);
  });

  it('converts once more before posting', () => {
    expect(src).toMatch(/toDbTime\(panel\.querySelector\('#resched-time'\)\.value\)/);
  });
});

describe('timeToMinutes', () => {
  it('agrees with the server slotToMinutes for slot labels', () => {
    expect(timeToMinutes('8:00 AM')).toBe(480);
    expect(timeToMinutes('12:00 PM')).toBe(720);
    expect(timeToMinutes('5:00 PM')).toBe(1020);
  });
});
