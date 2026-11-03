// tests/unit/next-available.test.js
//
// The "Next available" line on both home pages (conversion study, phase 3)
// says when a client can book. If it ever offers a time the booking calendar
// greys out, it is the same kind of unprovable claim phase 3 removes - so it is
// tested against the calendar's own rules: bookings with their duration and
// buffer, Diego's blocks, the two-hour lead today and the closed window.
import { describe, it, expect } from 'vitest';
import { firstOpenSlot, NEXT_AVAILABLE_DAYS } from '../../api/auth.js';

const base = {
  dates: ['2026-11-04', '2026-11-05', '2026-11-06'],
  bookings: [],
  overrides: [],
  vans: [1],
  durationByService: { 'Tune-Up': 60 },
  todayStr: '2026-11-04',
  nowMin: 0,
  shutUntil: null,
};
const booked = (date, time) => ({
  id: date + time,
  scheduled_date: date,
  scheduled_time: time,
  van_number: 1,
  service_name: 'Tune-Up',
  status: 'confirmed',
  created_at: '2026-11-01T00:00:00Z',
  stripe_payment_intent_id: 'pi_test',
});

describe('firstOpenSlot', () => {
  it('an empty calendar opens at the first slot of today', () => {
    expect(firstOpenSlot(base)).toEqual({ date: '2026-11-04', time: '8:00 AM' });
  });

  // A 60-minute job at 08:00 plus the buffer holds the van until 9:30, and a
  // new job needs 90 minutes: 9:00 would overlap, 10:00 does not.
  it('skips the time a booking and its buffer hold', () => {
    expect(firstOpenSlot({ ...base, bookings: [booked('2026-11-04', '08:00')] })).toEqual({
      date: '2026-11-04',
      time: '10:00 AM',
    });
  });

  it('a booking on another day changes nothing', () => {
    expect(firstOpenSlot({ ...base, bookings: [booked('2026-11-05', '08:00')] }).time).toBe(
      '8:00 AM'
    );
  });

  it("today's late hours roll over to tomorrow", () => {
    // 4:30 pm + the two-hour lead: nothing left today.
    expect(firstOpenSlot({ ...base, nowMin: 16 * 60 + 30 + 120 })).toEqual({
      date: '2026-11-05',
      time: '8:00 AM',
    });
  });

  it('a day Diego blocked for every van is skipped', () => {
    const allDay = [
      '8:00',
      '9:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
    ].flatMap((h) =>
      [h, h.replace(':00', ':30')].map((t) => ({
        date: '2026-11-04',
        time_slot: t,
        available: false,
        van_number: 0,
      }))
    );
    expect(firstOpenSlot({ ...base, overrides: allDay }).date).toBe('2026-11-05');
  });

  it('nothing inside the closed window', () => {
    expect(firstOpenSlot({ ...base, shutUntil: '2026-11-06' })).toEqual({
      date: '2026-11-06',
      time: '8:00 AM',
    });
  });

  it('no slot in the range is no line at all, not a guess', () => {
    expect(firstOpenSlot({ ...base, shutUntil: '2026-12-01' })).toEqual({ date: null, time: null });
  });

  it('looks two weeks ahead', () => {
    expect(NEXT_AVAILABLE_DAYS).toBe(14);
  });
});
