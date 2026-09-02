// tests/unit/mechanic-pin-length.test.js
//
// The mechanic login sends ONLY a PIN - there is no username, so a failed
// attempt cannot be attributed to an account and a per-account lockout is not
// expressible. The size of the PIN namespace IS the defence, and four digits
// (10k) is not enough: against the per-IP lockout in
// tests/unit/mechanic-pin-lockout.test.js, an attacker spread over ~100
// addresses walks the whole space in hours. Diego chose six digits (1M) on
// 2026-09-01.
//
// These drive handleAdminSetMechanicPin directly - the same approach as the
// lockout tests - so they fail when the BEHAVIOUR regresses, not when someone
// reformats the source.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The one address on ADMIN_ALLOWED_EMAILS in api/auth.js. verifyAdminSession
// rejects anything else, and admin auth is not what these tests are about.
const ADMIN = 'peredo.dm@gmail.com';

// verifyAdminSession goes through the Supabase client; here it is a stub that
// says "yes, a real admin" so the tests can reach the PIN rules underneath.
const updateSpy = vi.fn(async () => ({ error: null }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: ADMIN } }, error: null }) },
    from: () => ({ update: (payload) => ({ eq: async (_c, id) => updateSpy(payload, id) }) }),
  }),
}));

const { handleAdminSetMechanicPin } = await import('../../api/auth.js');

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b) => {
    res.body = b;
    return res;
  };
  return res;
}
const call = async (pin) => {
  const res = makeRes();
  await handleAdminSetMechanicPin(
    { body: { access_token: 'tok', contact_id: 'mech-1', ...(pin ? { pin } : {}) } },
    res
  );
  return res;
};

beforeEach(() => {
  updateSpy.mockClear();
  process.env.SUPABASE_SERVICE_KEY ||= 'test-service-key';
});

describe('mechanic PIN length', () => {
  it('refuses a 4-digit PIN - the length the app used to issue', async () => {
    const res = await call('1234');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/6 digits/);
    // Nothing was written: a rejected PIN must not touch the stored hash.
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('refuses 5 and 7 digits, and anything non-numeric', async () => {
    for (const bad of ['12345', '1234567', 'abcdef', '12 34 56']) {
      const res = await call(bad);
      expect(res.statusCode, `expected ${JSON.stringify(bad)} to be refused`).toBe(400);
    }
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('treats an empty PIN as "generate one for me", not as an error', async () => {
    // Long-standing behaviour of this handler (`pin ? ... : generate`), kept
    // deliberately: the Admin button sends no PIN at all and means exactly
    // this. Pinned here because it is the one input that looks like it should
    // be a 400 and is not - a blank field must not silently do nothing.
    const res = await call('');
    expect(res.statusCode).toBe(200);
    expect(res.body.pin).toMatch(/^\d{6}$/);
  });

  it('accepts a 6-digit PIN and stores only its hash', async () => {
    const res = await call('123456');
    expect(res.statusCode).toBe(200);
    expect(res.body.pin).toBe('123456');
    const [payload] = updateSpy.mock.calls[0];
    // The PIN itself must never be what lands in the row - the point this test
    // has always made. It used to check `payload.pin` was null, back when the
    // update also wrote that column to clear it; the column does not exist in
    // this database, and naming it made PostgREST reject the whole write. So
    // the assertion is now the stronger one: no field of the payload carries
    // the PIN, under any name.
    expect(Object.values(payload)).not.toContain('123456');
    expect(payload).not.toHaveProperty('pin');
    expect(payload.pin_hash).toEqual(expect.any(String));
    expect(payload.pin_hash).not.toContain('123456');
  });

  it('generates 6 digits when the admin asks for one, never 4', async () => {
    // Many draws, because a generator that is off by an order of magnitude
    // still produces the occasional in-range value by luck.
    for (let i = 0; i < 200; i++) {
      const res = await call(null);
      expect(res.statusCode).toBe(200);
      expect(res.body.pin).toMatch(/^\d{6}$/);
      const n = Number(res.body.pin);
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThanOrEqual(999999);
    }
  });

  it('does not always generate the same PIN', async () => {
    const seen = new Set();
    for (let i = 0; i < 50; i++) seen.add((await call(null)).body.pin);
    expect(seen.size).toBeGreaterThan(40);
  });
});
