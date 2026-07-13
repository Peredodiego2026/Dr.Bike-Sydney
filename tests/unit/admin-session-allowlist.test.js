// tests/unit/admin-session-allowlist.test.js — verifyAdminSession used to
// accept ANY valid Supabase session (any signed-up client), not just Diego's
// admin account - the allowlist check only ran at login, never on the admin-*
// API roles themselves (claims, services CRUD, calendar delete, and the new
// mechanic-PIN role all shared verifyAdminSession). Found while adding
// admin-set-mechanic-pin. isAdminEmail() is the extracted, testable guard.
import { describe, it, expect } from 'vitest';
import { isAdminEmail } from '../../api/auth.js';

describe('isAdminEmail', () => {
  it('accepts the admin email', () => {
    expect(isAdminEmail('peredo.dm@gmail.com')).toBe(true);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(isAdminEmail('  Peredo.DM@Gmail.com  ')).toBe(true);
  });

  it('rejects a regular client account, even with a valid session', () => {
    expect(isAdminEmail('peredo.dm+fase0test@gmail.com')).toBe(false);
    expect(isAdminEmail('someclient@example.com')).toBe(false);
  });

  it('rejects empty/missing email', () => {
    expect(isAdminEmail('')).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
});
