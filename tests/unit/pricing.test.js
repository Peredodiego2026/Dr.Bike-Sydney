// tests/unit/pricing.test.js — Unit tests for pricing calculations
// Run: npm test

import { describe, it, expect } from 'vitest';

// Prices from CLAUDE.md
const SERVICES = {
  'tune-up': 109,
  standard: 149,
  major: 199,
  ultimate: 369,
  'safety-check': 59,
  'flat-tyre': 49,
  'gear-adjustment': 59,
  'brake-pad': 49,
  'brake-bleed': 79,
  'cable-replace': 65,
  'chain-replace': 55,
  'wheel-true': 75,
  'ebike-diagnostic': 99,
  'bike-build': 299,
  'custom-build': 399,
};

const CALLOUT_FEE = 20;

const MEMBERSHIP_PRICES = {
  basic: { monthly: 57, annual: 548 },
  standard: { monthly: 97, annual: 931 },
  vip: { monthly: 147, annual: 1411 },
};

function totalWithCallout(serviceKey) {
  return (SERVICES[serviceKey] || 0) + CALLOUT_FEE;
}

function annualSavings(plan) {
  const monthly = MEMBERSHIP_PRICES[plan].monthly;
  const annual = MEMBERSHIP_PRICES[plan].annual;
  return monthly * 12 - annual;
}

describe('Service pricing', () => {
  it('tune-up includes callout fee', () => {
    expect(totalWithCallout('tune-up')).toBe(129);
  });

  it('all services have positive price', () => {
    Object.values(SERVICES).forEach((price) => {
      expect(price).toBeGreaterThan(0);
    });
  });

  it('callout fee is $20', () => {
    expect(CALLOUT_FEE).toBe(20);
  });
});

describe('Membership pricing', () => {
  it('basic annual saves $136', () => {
    expect(annualSavings('basic')).toBe(136);
  });

  it('standard annual saves $233', () => {
    expect(annualSavings('standard')).toBe(233);
  });

  it('vip annual saves $353', () => {
    expect(annualSavings('vip')).toBe(353);
  });

  it('annual plans are always cheaper than monthly * 12', () => {
    Object.keys(MEMBERSHIP_PRICES).forEach((plan) => {
      expect(annualSavings(plan)).toBeGreaterThan(0);
    });
  });
});
