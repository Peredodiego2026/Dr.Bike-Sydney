// tests/unit/rider-tier.test.js — gamification tier thresholds
// Run: npm test

import { describe, it, expect } from 'vitest';
import { getRiderTier } from '../../js/rider-tier.js';

describe('getRiderTier', () => {
  it('starts everyone at New Rider', () => {
    expect(getRiderTier(0).label).toBe('New Rider');
    expect(getRiderTier(2).label).toBe('New Rider');
  });

  it('promotes at each threshold', () => {
    expect(getRiderTier(3).label).toBe('Bronze Rider');
    expect(getRiderTier(6).label).toBe('Silver Rider');
    expect(getRiderTier(10).label).toBe('Gold Rider');
    expect(getRiderTier(20).label).toBe('Diamond Rider');
  });

  it('reports the next tier and how far away it is', () => {
    const tier = getRiderTier(1);
    expect(tier.nextAt).toBe(3);
    expect(tier.nextLabel).toBe('Bronze Rider');
  });

  it('has no next tier once at the top', () => {
    const tier = getRiderTier(25);
    expect(tier.nextAt).toBeNull();
    expect(tier.progressPct).toBe(100);
  });

  it('computes progress toward the next tier proportionally', () => {
    // Bronze is [3,6) - halfway through should read ~50%
    const tier = getRiderTier(4);
    expect(tier.label).toBe('Bronze Rider');
    expect(tier.progressPct).toBeCloseTo(33, 0);
  });

  it('gives New Rider a mask icon pointing at the shared bike glyph', () => {
    const tier = getRiderTier(0);
    expect(tier.iconType).toBe('mask');
    expect(tier.image).toBe('images/bike-icon.png');
  });

  // Medal files are .svg placeholders pending Gemini API billing - see the
  // comment at the top of js/rider-tier.js. Swap the extension here too when
  // the real renders land.
  it('gives every medal tier a photo icon pointing at its own render', () => {
    expect(getRiderTier(3)).toMatchObject({ iconType: 'photo', image: 'images/medals/bronze.svg' });
    expect(getRiderTier(6)).toMatchObject({ iconType: 'photo', image: 'images/medals/silver.svg' });
    expect(getRiderTier(10)).toMatchObject({ iconType: 'photo', image: 'images/medals/gold.svg' });
    expect(getRiderTier(20)).toMatchObject({ iconType: 'photo', image: 'images/medals/diamond.svg' });
  });
});
