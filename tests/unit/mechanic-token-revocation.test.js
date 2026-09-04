// Audit finding 4 (2026-09-04): rotating a mechanic's PIN revoked nothing.
//
// A mechanic token was an HMAC of { mid, exp } and nothing else, valid for 60
// days, and verifyMechanicToken only checked the signature and the expiry. So
// "Reset PIN" in Admin changed what the NEXT login needs and left every token
// already on a phone working until it aged out on its own. That is the middle
// link of the chain the audit found:
//
//   4-digit PIN (10k, locked per IP but not per account)
//     -> a token rotating the PIN does not kill
//       -> an arbitrary charge to a saved card (see charge-cap.test.js)
//
// The token is minted and verified by real code here, not by a copy of it.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key-for-token-signing';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const authjs = readFileSync(join(root, 'api', 'auth.js'), 'utf8');
const securityjs = readFileSync(join(root, 'api', '_security.js'), 'utf8');

const { verifyMechanicTokenPayload, verifyMechanicToken } = await import('../../api/_security.js');

// api/auth.js is 5,000 lines and opens clients on import (its own tests time
// out on it), so makeToken - eight lines, not exported - is lifted from the
// source and run. Lifting it rather than reimplementing means a change to the
// real payload shape shows up here.
const makeToken = new Function(
  'crypto',
  `${authjs.match(/const TOKEN_TTL_MS = [^;]+;/)[0]}
   ${authjs.match(/function b64url\(buf\) \{[\s\S]*?\n\}/)[0]}
   ${authjs.match(/function makeToken\(mid, sv = 0\) \{[\s\S]*?\n\}/)[0]}
   return makeToken;`
)(await import('crypto').then((m) => m.default));

describe('the mechanic session token', () => {
  it('carries the session version it was minted with', () => {
    expect(verifyMechanicTokenPayload(makeToken('mech-1', 4))).toEqual({ mid: 'mech-1', sv: 4 });
  });

  it('reads a token minted before this change as version 0', () => {
    // Deploying this must not sign anyone out: an old token has no sv, and
    // session_version defaults to 0, so the two still match.
    const legacy = makeToken('mech-1');
    expect(verifyMechanicTokenPayload(legacy).sv).toBe(0);
  });

  it('still answers just the id for callers that only need that', () => {
    expect(verifyMechanicToken(makeToken('mech-1', 9))).toBe('mech-1');
    expect(verifyMechanicToken('not-a-token')).toBeNull();
  });

  it('expires in 14 days, not 60 - measured on a real token, not read off the constant', () => {
    vi.useFakeTimers();
    const t = makeToken('mech-1', 0);
    vi.setSystemTime(Date.now() + 13 * 24 * 60 * 60 * 1000);
    expect(verifyMechanicTokenPayload(t)).not.toBeNull();
    vi.setSystemTime(Date.now() + 2 * 24 * 60 * 60 * 1000);
    expect(verifyMechanicTokenPayload(t)).toBeNull();
    vi.useRealTimers();
  });
});

describe('authMechanic refuses a token from before the PIN was rotated', () => {
  // Comments stripped first, and with [^\n]* rather than .*$ because the file
  // is CRLF and `.` does not match a line terminator - both traps this repo
  // has already been caught by.
  const fn = authjs.slice(
    authjs.indexOf('export async function authMechanic('),
    authjs.indexOf('function mechanicName(')
  );
  const code = fn.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  it('compares the token version against the mechanic row', () => {
    expect(code).toMatch(/verifyMechanicTokenPayload\(token\)/);
    expect(code).toMatch(/\(Number\(candidate\.session_version\) \|\| 0\) === claims\.sv/);
  });

  it('only accepts the mechanic when the versions match', () => {
    // The assignment must be guarded by the comparison, not sitting beside it.
    expect(code).toMatch(
      /=== claims\.sv\)\s*mechanic = candidate;/
    );
  });

  it('treats a missing column as version 0, so an unmigrated database still logs in', () => {
    // Number(undefined) is NaN; the `|| 0` is what makes that harmless. A
    // regression to Number(x ?? 0) would look equivalent and be equivalent -
    // a regression to plain Number(x) would lock every mechanic out.
    expect(Number(undefined) || 0).toBe(0);
    expect(code).toMatch(/Number\(candidate\.session_version\) \|\| 0/);
  });
});

describe('rotating the PIN', () => {
  const fn = authjs.slice(
    authjs.indexOf('export async function handleAdminSetMechanicPin('),
    authjs.indexOf('async function handleAdminOrphanAudit(')
  );
  const code = fn.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  it('increments session_version', () => {
    expect(code).toMatch(/update\.session_version = \(Number\(cur\.session_version\) \|\| 0\) \+ 1/);
  });

  it('reads the column before writing it, because PostgREST 500s on an unknown column', () => {
    const readAt = code.indexOf(".select('session_version')");
    const writeAt = code.indexOf('.update(update)');
    expect(readAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(readAt);
  });

  it('tells Admin whether sessions were actually revoked', () => {
    expect(code).toMatch(/sessions_revoked: revoked/);
  });

  it('and Admin says so out loud when they were not', () => {
    const adminjs = readFileSync(join(root, 'js', 'admin.js'), 'utf8');
    expect(adminjs).toMatch(/data\.sessions_revoked/);
    expect(adminjs).toMatch(/still valid for up to 14 days/);
  });
});

describe('the migration', () => {
  const sql = readFileSync(join(root, 'scripts', 'add-mechanic-session-version.sql'), 'utf8');

  it('is safe to run twice', () => {
    expect(sql).toMatch(/add column if not exists session_version/i);
  });

  it('defaults to 0, so running it does not sign anyone out', () => {
    expect(sql).toMatch(/not null default 0/i);
  });
});

describe('a token is still refused for the ordinary reasons', () => {
  beforeEach(() => vi.useRealTimers());

  it('when the signature is wrong', () => {
    const t = makeToken('mech-1', 1);
    expect(verifyMechanicTokenPayload(t.slice(0, -4) + 'AAAA')).toBeNull();
  });

  it('when it has expired', () => {
    vi.useFakeTimers();
    const t = makeToken('mech-1', 1);
    vi.setSystemTime(Date.now() + 15 * 24 * 60 * 60 * 1000);
    expect(verifyMechanicTokenPayload(t)).toBeNull();
    vi.useRealTimers();
  });

  it('and _security.js is still the only implementation of the check', () => {
    expect(securityjs).toMatch(/export function verifyMechanicTokenPayload/);
    // auth.js must not have grown a second copy.
    expect(authjs).not.toMatch(/function verifyMechanicTokenPayload/);
  });
});
