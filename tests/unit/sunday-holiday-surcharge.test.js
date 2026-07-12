// tests/unit/sunday-holiday-surcharge.test.js — Diego confirmed: +20% on Sundays
// and NSW public holidays (Australian "penalty rate" convention), Saturday stays
// normal price. Run: npm test

import { describe, it, expect } from 'vitest';
import { isSurchargeDay, applySurcharge } from '../../api/auth.js';

describe('isSurchargeDay', () => {
  it('is true for a Sunday', () => {
    expect(isSurchargeDay('2026-08-09')).toBe(true); // a Sunday
  });

  it('is false for a Saturday', () => {
    expect(isSurchargeDay('2026-08-08')).toBe(false); // a Saturday
  });

  it('is false for a normal weekday', () => {
    expect(isSurchargeDay('2026-08-10')).toBe(false); // a Monday
  });

  it('is true for a known 2026 NSW public holiday that falls on a weekday', () => {
    expect(isSurchargeDay('2026-01-26')).toBe(true); // Australia Day, a Monday
    expect(isSurchargeDay('2026-12-25')).toBe(true); // Christmas Day, a Friday
    expect(isSurchargeDay('2026-04-06')).toBe(true); // Easter Monday
  });

  it('is still true for a public holiday that also happens to be a Saturday', () => {
    expect(isSurchargeDay('2026-04-25')).toBe(true); // Anzac Day 2026 is a Saturday
  });
});

describe('applySurcharge', () => {
  it('adds 20% and rounds to the nearest cent on a surcharge day', () => {
    expect(applySurcharge(20, '2026-08-09')).toBe(24); // Sunday
    expect(applySurcharge(109, '2026-12-25')).toBe(130.8); // Christmas Day
  });

  it('leaves the amount unchanged on a normal day', () => {
    expect(applySurcharge(20, '2026-08-10')).toBe(20); // Monday
    expect(applySurcharge(20, '2026-08-08')).toBe(20); // Saturday
  });
});
