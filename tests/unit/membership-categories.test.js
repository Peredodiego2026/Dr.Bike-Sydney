// tests/unit/membership-categories.test.js — Diego's revised membership tiers
// (2026-07-22): 3 free-quota categories per plan (minor repair <$60, Bike
// Wash, Tune-Up), matched by price/name against the real services table.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { membershipCategoryFor, MEMBERSHIP_PLANS } from '../../api/auth.js';

describe('membershipCategoryFor', () => {
  it('categorizes Bike Wash by name regardless of price', () => {
    expect(membershipCategoryFor('Bike Wash', 35)).toBe('wash');
  });

  it('categorizes Tune-Up by name even though it is over $60', () => {
    expect(membershipCategoryFor('Tune-Up', 109)).toBe('tuneup');
  });

  it('categorizes any other service under $60 as minor', () => {
    expect(membershipCategoryFor('Gear Adjustment', 59)).toBe('minor');
    expect(membershipCategoryFor('Wheel Truing — Minor', 17)).toBe('minor');
  });

  it('is exactly $60 or more falls outside the minor bucket', () => {
    expect(membershipCategoryFor('E-bike Diagnostic', 60)).toBeNull();
  });

  it('returns null for full-price services that are not wash/tune-up and cost $60+', () => {
    expect(membershipCategoryFor('Standard Service', 149)).toBeNull();
    expect(membershipCategoryFor('Standard+ Service', 199)).toBeNull();
    expect(membershipCategoryFor('Ultimate Overhaul', 369)).toBeNull();
  });
});

describe('MEMBERSHIP_PLANS quotas', () => {
  it('basic: 1 minor + 1 wash, no free tune-up', () => {
    expect(MEMBERSHIP_PLANS.basic.quotas).toEqual({ minor: 1, wash: 1, tuneup: 0 });
    expect(MEMBERSHIP_PLANS.basic.waiveCallout).toBe(false);
    expect(MEMBERSHIP_PLANS.basic.discountPct).toBe(5);
  });

  it('standard: 2 minor + 1 wash + 1 tune-up, callout waived', () => {
    expect(MEMBERSHIP_PLANS.standard.quotas).toEqual({ minor: 2, wash: 1, tuneup: 1 });
    expect(MEMBERSHIP_PLANS.standard.waiveCallout).toBe(true);
    expect(MEMBERSHIP_PLANS.standard.discountPct).toBe(10);
  });

  it('vip: 3 minor + 2 wash + 1 tune-up, 15% + 5% bonus discount', () => {
    expect(MEMBERSHIP_PLANS.vip.quotas).toEqual({ minor: 3, wash: 2, tuneup: 1 });
    expect(MEMBERSHIP_PLANS.vip.waiveCallout).toBe(true);
    expect(MEMBERSHIP_PLANS.vip.discountPct).toBe(15);
    expect(MEMBERSHIP_PLANS.vip.bonusDiscountPct).toBe(5);
  });
});
