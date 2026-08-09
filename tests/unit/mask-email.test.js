// maskEmail() decides how much of an address an SMS may carry.
//
// The whole point of "I forgot my email" is to remind the person which address
// they used, not to hand a full one to whoever is holding the phone. Too much
// and it is a leak; too little and it jogs nobody's memory.

import { describe, it, expect } from 'vitest';

process.env.SUPABASE_SERVICE_KEY ||= 'service_dummy_for_unit_tests';
process.env.STRIPE_SECRET_KEY ||= 'sk_test_dummy_for_unit_tests';
const { maskEmail } = await import('../../api/auth.js');

describe('maskEmail', () => {
  it('keeps the first and last letter and the whole domain', () => {
    // The domain is the part that actually reminds you which address it was.
    expect(maskEmail('thaixguimaraes@gmail.com')).toBe('t***s@gmail.com');
    expect(maskEmail('peredo.dm@gmail.com')).toBe('p***m@gmail.com');
  });

  it('never returns the full local part', () => {
    const full = 'diego@example.com';
    expect(maskEmail(full)).not.toBe(full);
    expect(maskEmail(full).startsWith('d***')).toBe(true);
  });

  it('does not pad out a very short name into something misleading', () => {
    expect(maskEmail('jo@example.com')).toBe('j@example.com');
    expect(maskEmail('a@example.com')).toBe('a@example.com');
  });

  it('returns empty for anything that is not an address', () => {
    // An empty string is safe to send nowhere; a half-masked something is not.
    expect(maskEmail('')).toBe('');
    expect(maskEmail(null)).toBe('');
    expect(maskEmail(undefined)).toBe('');
    expect(maskEmail('not-an-email')).toBe('');
  });

  it('handles a subdomain and a plus tag without losing the domain', () => {
    expect(maskEmail('a.b+tag@mail.example.co.uk')).toBe('a***g@mail.example.co.uk');
  });
});
