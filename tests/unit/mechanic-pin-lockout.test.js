// tests/unit/mechanic-pin-lockout.test.js
//
// Audit point 3. The mechanic PIN is four digits shared by everyone. The one
// thing standing between a guesser and a client's name, phone and exact
// address for the day is the login lockout - and until 2026-08-30 that lockout
// only guarded role=mechanic, the login screen.
//
// Every other mechanic-* route (jobs, update-status, parts, messages,
// location) authenticates by handing the same PIN to authMechanic, and none of
// them checked the lock. Confirmed against production the same day:
//
//   POST /api/auth?role=mechanic       bad PIN x6 -> 401 401 401 401 401 429
//   POST /api/auth?role=mechanic-jobs  bad PIN x8 -> 401 401 401 401 401 401 401 401
//
// 10,000 PINs / 30-per-minute rate limit is about five hours from a single IP,
// minutes across a handful. The fix moves the lockout into authMechanic, the
// one path all fourteen routes share, so these tests drive that function
// directly rather than asserting on source text.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The counter is real state in a real table in production; here it is a mock so
// the test controls "locked or not" and can watch what got called.
const locked = { value: false };
const recordLoginFailure = vi.fn(async () => {});
const clearLoginFailures = vi.fn(async () => {});
const isLoginLocked = vi.fn(async () => locked.value);

vi.mock('../../api/_security.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isLoginLocked: (req) => isLoginLocked(req),
    recordLoginFailure: (req) => recordLoginFailure(req),
    clearLoginFailures: (req) => clearLoginFailures(req),
  };
});

const { authMechanic } = await import('../../api/auth.js');

const GOOD_PIN = '3250';
const contact = { id: 'mech-1', pin: GOOD_PIN, active: true, first_name: 'Sam', van_number: 1 };

let fetchMock;
beforeEach(() => {
  locked.value = false;
  recordLoginFailure.mockClear();
  clearLoginFailures.mockClear();
  isLoginLocked.mockClear();
  // authMechanic reads escalation_contacts, and may PATCH to migrate a
  // plaintext PIN to a hash. Both are absorbed here.
  fetchMock = vi.fn(async (url, opts) => {
    if (opts?.method === 'PATCH') return { ok: true, json: async () => ({}) };
    return { ok: true, json: async () => [contact] };
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const req = (body) => ({ body });

describe('authMechanic enforces the lockout on every route, not just login', () => {
  it('a wrong PIN is counted as a failed attempt', async () => {
    const out = await authMechanic(req({ pin: '0000' }));
    expect(out.status).toBe(401);
    expect(recordLoginFailure).toHaveBeenCalledTimes(1);
  });

  it('refuses once locked, and does not even reach the database', async () => {
    locked.value = true;
    const out = await authMechanic(req({ pin: '0000' }));
    expect(out.status).toBe(429);
    expect(out.error).toMatch(/too many attempts/i);
    // The whole point: no lookup, no guess processed while locked.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recordLoginFailure).not.toHaveBeenCalled();
  });

  it('a correct PIN clears the counter', async () => {
    const out = await authMechanic(req({ pin: GOOD_PIN }));
    expect(out.mechanic?.id).toBe('mech-1');
    expect(clearLoginFailures).toHaveBeenCalledTimes(1);
    expect(recordLoginFailure).not.toHaveBeenCalled();
  });
});

describe('a session token is not brute-forceable and must not touch the lock', () => {
  // A token is a 256-bit HMAC; treating an expired one as a brute-force attempt
  // would let a mechanic whose session lapsed lock themselves out by reopening
  // the app, and would let anyone spend the lock budget without guessing a PIN.
  it('an invalid token alone never checks or feeds the lock', async () => {
    const out = await authMechanic(req({ token: 'not-a-real-token' }));
    expect(out.status).toBe(401);
    expect(isLoginLocked).not.toHaveBeenCalled();
    expect(recordLoginFailure).not.toHaveBeenCalled();
  });

  it('does not lock out a token request even while PIN attempts are locked', async () => {
    locked.value = true;
    // A valid token resolves to the mechanic regardless of the PIN lock.
    // verifyMechanicToken is the real one (not mocked), so forge acceptance by
    // matching on a token the stubbed contacts list would resolve - instead we
    // assert the lock was never consulted for a token-only request.
    await authMechanic(req({ token: 'anything' }));
    expect(isLoginLocked).not.toHaveBeenCalled();
  });
});

describe('the login handler no longer double-counts', () => {
  it('handleMechanic delegates lockout to authMechanic', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../../api/auth.js', import.meta.url), 'utf8');
    const fn = src.slice(
      src.indexOf('async function handleMechanic('),
      src.indexOf('async function handleMechanicJobs(')
    );
    // It must not run its own isLoginLocked / recordLoginFailure /
    // clearLoginFailures - that was the double-count once authMechanic owns them.
    expect(fn).not.toMatch(/isLoginLocked/);
    expect(fn).not.toMatch(/recordLoginFailure/);
    expect(fn).not.toMatch(/clearLoginFailures/);
    // It still sets Retry-After, which is login-screen-specific.
    expect(fn).toMatch(/Retry-After/);
  });
});
