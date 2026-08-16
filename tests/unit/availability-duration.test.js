// tests/unit/availability-duration.test.js — regression tests for duration-aware
// slot blocking. Before this, availability only counted bookings per exact hour
// slot vs van count, with no awareness that a long service occupies a van for
// several hours - a 3-4h Ultimate Overhaul at 8am didn't block 9am-11am.
// Run: npm test

import { describe, it, expect } from 'vitest';
import {
  slotToMinutes,
  buildBusyIntervals,
  computeAvailableSlots,
  SLOT_BUFFER_MIN,
  DEFAULT_SERVICE_DURATION_MIN,
} from '../../api/auth.js';

const ALL_SLOTS = [
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
];

describe('slotToMinutes', () => {
  it('converts 12h slot labels to minutes since midnight', () => {
    expect(slotToMinutes('8:00 AM')).toBe(480);
    expect(slotToMinutes('12:00 PM')).toBe(720);
    expect(slotToMinutes('1:00 PM')).toBe(780);
    expect(slotToMinutes('5:00 PM')).toBe(1020);
  });
});

describe('buildBusyIntervals', () => {
  it("adds the buffer to each booking's service duration", () => {
    const bookings = [
      { scheduled_time: '8:00 AM', van_number: 1, service_name: 'Ultimate Overhaul' },
    ];
    const durationByService = { 'Ultimate Overhaul': 240 };
    const intervals = buildBusyIntervals(bookings, durationByService);
    expect(intervals).toEqual([{ van: 1, start: 480, end: 480 + 240 + SLOT_BUFFER_MIN }]);
  });

  it('falls back to a default duration when the service is unknown', () => {
    const bookings = [
      { scheduled_time: '9:00 AM', van_number: 2, service_name: 'Mystery Service' },
    ];
    const intervals = buildBusyIntervals(bookings, {});
    expect(intervals[0].end - intervals[0].start).toBe(
      DEFAULT_SERVICE_DURATION_MIN + SLOT_BUFFER_MIN
    );
  });

  it('ignores bookings with no scheduled_time or van_number', () => {
    const bookings = [
      { scheduled_time: null, van_number: 1, service_name: 'Tune-Up' },
      { scheduled_time: '9:00 AM', van_number: null, service_name: 'Tune-Up' },
    ];
    expect(buildBusyIntervals(bookings, {})).toEqual([]);
  });
});

describe('computeAvailableSlots', () => {
  it('blocks the hours a long service occupies a single van, plus buffer', () => {
    // One van, a 4h Ultimate Overhaul booked at 8am -> busy 8:00-12:30 (240+30 buffer).
    const busyIntervals = [{ van: 1, start: 480, end: 480 + 240 + 30 }];
    const slots = computeAvailableSlots({
      allSlots: ALL_SLOTS,
      vans: [1],
      busyIntervals,
      neededMin: 60 + SLOT_BUFFER_MIN, // booking a 1h service
      manualUnavailable: new Set(),
      isToday: false,
      nowMin: 0,
    });
    const byTime = Object.fromEntries(slots.map((s) => [s.time, s.available]));
    expect(byTime['8:00 AM']).toBe(false);
    expect(byTime['9:00 AM']).toBe(false);
    expect(byTime['10:00 AM']).toBe(false);
    expect(byTime['11:00 AM']).toBe(false);
    // 12:00 PM starts at 720, van free from 750 - still overlaps the 90min ask (720-810 vs busy ending 750)? busy ends at 750, candidate is 720-810 -> overlaps.
    expect(byTime['12:00 PM']).toBe(false);
    expect(byTime['1:00 PM']).toBe(true);
  });

  it('still offers a slot if a second van is free even when the first is busy', () => {
    const busyIntervals = [{ van: 1, start: 480, end: 480 + 240 + 30 }];
    const slots = computeAvailableSlots({
      allSlots: ALL_SLOTS,
      vans: [1, 2],
      busyIntervals,
      neededMin: 60 + SLOT_BUFFER_MIN,
      manualUnavailable: new Set(),
      isToday: false,
      nowMin: 0,
    });
    const byTime = Object.fromEntries(slots.map((s) => [s.time, s.available]));
    expect(byTime['9:00 AM']).toBe(true);
  });

  it('a short service does not get blocked by a van finishing just in time', () => {
    // Van busy 8:00-9:00 exactly (30min service + 30min buffer).
    const busyIntervals = [{ van: 1, start: 480, end: 540 }];
    const slots = computeAvailableSlots({
      allSlots: ALL_SLOTS,
      vans: [1],
      busyIntervals,
      neededMin: 20 + SLOT_BUFFER_MIN,
      manualUnavailable: new Set(),
      isToday: false,
      nowMin: 0,
    });
    const byTime = Object.fromEntries(slots.map((s) => [s.time, s.available]));
    expect(byTime['9:00 AM']).toBe(true);
  });

  it('still applies manual overrides and the past-time-today cutoff', () => {
    const slots = computeAvailableSlots({
      allSlots: ALL_SLOTS,
      vans: [1],
      busyIntervals: [],
      neededMin: 60,
      manualUnavailable: new Set(['9:00 AM']),
      isToday: true,
      nowMin: slotToMinutes('10:00 AM'),
    });
    const byTime = Object.fromEntries(slots.map((s) => [s.time, s.available]));
    expect(byTime['9:00 AM']).toBe(false); // manual override
    expect(byTime['8:00 AM']).toBe(false); // in the past relative to nowMin
    expect(byTime['10:00 AM']).toBe(true); // not before "now" (equal is not "before")
    expect(byTime['11:00 AM']).toBe(true);
  });
});

// ── The format the database actually returns ────────────────────────────────
// Everything above feeds slotToMinutes the 12-hour labels from ALL_SLOTS. The
// database never sends those: `bookings.scheduled_time` is a `time without
// time zone` column, so PostgREST serialises it as "10:00:00". slotToMinutes
// answered -1 for that, buildBusyIntervals put the busy window at
// [-1, duration], and no booking blocked its own hour - the same slot stayed
// on offer to the next client. Found 16-Aug-2026 while fixing the client
// reschedule, which is the other half of the same 12h/24h mismatch.
describe('slotToMinutes - the shapes that reach it from the database', () => {
  it('reads a `time` column as PostgREST serialises it', () => {
    expect(slotToMinutes('10:00:00')).toBe(600);
    expect(slotToMinutes('08:00:00')).toBe(480);
    expect(slotToMinutes('16:30:00')).toBe(990);
  });

  it('reads the HH:MM the reschedule endpoint writes', () => {
    expect(slotToMinutes('14:30')).toBe(870);
    expect(slotToMinutes('08:00')).toBe(480);
  });

  it('still reads the 12-hour labels from ALL_SLOTS', () => {
    expect(slotToMinutes('12:00 PM')).toBe(720);
    expect(slotToMinutes('12:00 AM')).toBe(0);
  });

  it('rejects what is not a time at all', () => {
    expect(slotToMinutes('')).toBe(-1);
    expect(slotToMinutes(null)).toBe(-1);
    expect(slotToMinutes('25:00')).toBe(-1);
    expect(slotToMinutes('10:99')).toBe(-1);
    expect(slotToMinutes('13:00 PM')).toBe(-1);
  });
});

describe('a booking read back from the database blocks its own slot', () => {
  const dbRow = (time, van = 1) => ({
    scheduled_time: time,
    van_number: van,
    service_name: 'Tune-Up',
  });

  it('the 10am slot stops being offered once someone has it (one van)', () => {
    const busyIntervals = buildBusyIntervals([dbRow('10:00:00')], { 'Tune-Up': 120 });
    expect(busyIntervals).toEqual([{ van: 1, start: 600, end: 600 + 120 + SLOT_BUFFER_MIN }]);

    const slots = computeAvailableSlots({
      allSlots: ALL_SLOTS,
      vans: [1],
      busyIntervals,
      neededMin: 60 + SLOT_BUFFER_MIN,
      manualUnavailable: new Set(),
      isToday: false,
      nowMin: 0,
    });
    const byTime = Object.fromEntries(slots.map((s) => [s.time, s.available]));
    expect(byTime['10:00 AM']).toBe(false);
    expect(byTime['11:00 AM']).toBe(false); // still inside 10:00-12:30
    expect(byTime['1:00 PM']).toBe(true);
  });

  it('the second van still covers the hour, which is the point of having two', () => {
    const busyIntervals = buildBusyIntervals([dbRow('10:00:00', 1)], { 'Tune-Up': 120 });
    const slots = computeAvailableSlots({
      allSlots: ALL_SLOTS,
      vans: [1, 2],
      busyIntervals,
      neededMin: 60 + SLOT_BUFFER_MIN,
      manualUnavailable: new Set(),
      isToday: false,
      nowMin: 0,
    });
    expect(Object.fromEntries(slots.map((s) => [s.time, s.available]))['10:00 AM']).toBe(true);
  });

  it('both vans taken at 10am closes the slot', () => {
    const busyIntervals = buildBusyIntervals([dbRow('10:00:00', 1), dbRow('10:00:00', 2)], {
      'Tune-Up': 120,
    });
    const slots = computeAvailableSlots({
      allSlots: ALL_SLOTS,
      vans: [1, 2],
      busyIntervals,
      neededMin: 60 + SLOT_BUFFER_MIN,
      manualUnavailable: new Set(),
      isToday: false,
      nowMin: 0,
    });
    expect(Object.fromEntries(slots.map((s) => [s.time, s.available]))['10:00 AM']).toBe(false);
  });

  it('drops a corrupt time instead of carrying a -1 interval', () => {
    expect(buildBusyIntervals([dbRow('not a time')], {})).toEqual([]);
  });
});
