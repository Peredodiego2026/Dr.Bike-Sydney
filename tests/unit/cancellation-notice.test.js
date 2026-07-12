// tests/unit/cancellation-notice.test.js — regression tests for the hours-notice
// calculation used to decide the admin WhatsApp wording when a client cancels.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { hoursUntilAppointment } from '../../api/auth.js';

describe('hoursUntilAppointment', () => {
  it('returns a large positive number when cancelling days in advance', () => {
    // Booking 2026-08-10 14:00 Sydney, cancelled 2026-08-01 09:00 UTC
    const now = Date.parse('2026-08-01T09:00:00Z');
    const hours = hoursUntilAppointment('2026-08-10', '14:00', now);
    expect(hours).toBeGreaterThan(24);
  });

  it('returns >=24 exactly at the 24h boundary (AEST, UTC+10)', () => {
    // Booking 2026-08-10 14:00 AEST == 2026-08-10T04:00:00Z
    const now = Date.parse('2026-08-09T04:00:00Z');
    const hours = hoursUntilAppointment('2026-08-10', '14:00', now);
    expect(hours).toBe(24);
  });

  it('returns a small number when cancelling a few hours before (no refund case)', () => {
    // Booking 2026-08-10 14:00 AEST == 2026-08-10T04:00:00Z, cancelled 3h before
    const now = Date.parse('2026-08-10T01:00:00Z');
    const hours = hoursUntilAppointment('2026-08-10', '14:00', now);
    expect(hours).toBe(3);
  });

  it('accounts for AEDT (UTC+11) daylight saving in summer', () => {
    // Booking 2026-01-15 14:00 AEDT == 2026-01-15T03:00:00Z, cancelled 5h before
    const now = Date.parse('2026-01-15T22:00:00Z') - 24 * 3600 * 1000; // sanity anchor unused
    const cancelled = Date.parse('2026-01-14T22:00:00Z'); // 5h before 2026-01-15T03:00:00Z
    const hours = hoursUntilAppointment('2026-01-15', '14:00', cancelled);
    expect(hours).toBe(5);
  });

  it('returns 0 (not negative) once the appointment time has passed', () => {
    const now = Date.parse('2026-08-10T05:00:00Z'); // 1h after 04:00Z appointment
    const hours = hoursUntilAppointment('2026-08-10', '14:00', now);
    expect(hours).toBe(0);
  });
});
