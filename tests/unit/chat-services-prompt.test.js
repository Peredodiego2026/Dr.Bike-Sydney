// tests/unit/chat-services-prompt.test.js — the chatbot's SERVICES & PRICES
// block must be generated from live `services` rows, never hand-typed, so it
// can't drift from Admin/the mobile app/landing.html again.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { formatServicesPrompt } from '../../api/chat.js';

describe('formatServicesPrompt', () => {
  it('groups services under an uppercased category header', () => {
    const out = formatServicesPrompt([
      { name: 'Tune-Up', price: 109, category: 'Scheduled services', duration_min: 45, duration_max: 60 },
    ]);
    expect(out).toContain('SCHEDULED SERVICES:');
    expect(out).toContain('- Tune-Up: $109 (45-60 min)');
  });

  it('shows a single duration when min and max are equal', () => {
    const out = formatServicesPrompt([
      { name: 'Chain Install', price: 69, category: 'Drivetrain', duration_min: 20, duration_max: 20 },
    ]);
    expect(out).toContain('- Chain Install: $69 (20 min)');
  });

  it('omits the duration parens when duration is missing', () => {
    const out = formatServicesPrompt([
      { name: 'Mystery Service', price: 40, category: 'Other', duration_min: null, duration_max: null },
    ]);
    expect(out).toContain('- Mystery Service: $40');
    expect(out).not.toContain('(');
  });

  it('keeps separate rows in the same category under one header, in given order', () => {
    const out = formatServicesPrompt([
      { name: 'Wheel Truing — Minor', price: 17, category: 'Wheels & tyres', duration_min: 25, duration_max: 25 },
      { name: 'Wheel Truing — Major', price: 37, category: 'Wheels & tyres', duration_min: 40, duration_max: 40 },
    ]);
    const headerCount = out.match(/WHEELS & TYRES:/g) || [];
    expect(headerCount).toHaveLength(1);
    expect(out.indexOf('Wheel Truing — Minor')).toBeLessThan(out.indexOf('Wheel Truing — Major'));
  });

  it('separates category groups with a blank line', () => {
    const out = formatServicesPrompt([
      { name: 'Tune-Up', price: 109, category: 'Scheduled services', duration_min: 45, duration_max: 60 },
      { name: 'Chain Install', price: 69, category: 'Drivetrain', duration_min: 20, duration_max: 20 },
    ]);
    expect(out).toContain('\n\n');
  });

  it('returns an empty string for empty or missing input', () => {
    expect(formatServicesPrompt([])).toBe('');
    expect(formatServicesPrompt(null)).toBe('');
    expect(formatServicesPrompt(undefined)).toBe('');
  });
});
