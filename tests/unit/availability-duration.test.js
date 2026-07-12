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
  it('adds the buffer to each booking\'s service duration', () => {
    const bookings = [{ scheduled_time: '8:00 AM', van_number: 1, service_name: 'Ultimate Overhaul' }];
    const durationByService = { 'Ultimate Overhaul': 240 };
    const intervals = buildBusyIntervals(bookings, durationByService);
    expect(intervals).toEqual([{ van: 1, start: 480, end: 480 + 240 + SLOT_BUFFER_MIN }]);
  });

  it('falls back to a default duration when the service is unknown', () => {
    const bookings = [{ scheduled_time: '9:00 AM', van_number: 2, service_name: 'Mystery Service' }];
    const intervals = buildBusyIntervals(bookings, {});
    expect(intervals[0].end - intervals[0].start).toBe(DEFAULT_SERVICE_DURATION_MIN + SLOT_BUFFER_MIN);
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
