// Audit finding 1 (2026-09-04), the critical one: MFA was a screen, not a gate.
//
// verifyAdminSession() validated the token and the email and nothing else.
// api/auth.js hands the browser a real Supabase access token BEFORE the TOTP
// step (`temp_token`), so anyone with the password could read it out of the
// network tab, dismiss the prompt, and use all thirteen admin-* routes.
//
// THE TEST THAT MATTERS MOST IS THE OUTAGE ONE. There is exactly one admin
// email in the whole system. An admin with no TOTP enrolled who gets refused
// cannot reach the enrolment screen either - and the fix would be behind the
// door that just closed. Anything that makes "no factor yet" reject has to
// turn this file red.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { adminAalVerdict, readTokenClaims } from '../../api/_admin-aal.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const authjs = readFileSync(join(root, 'api', 'auth.js'), 'utf8');

describe('an admin who has NOT enrolled a second factor', () => {
  // This is the outage. It must pass whether the check is observing or
  // enforcing - enforcing is exactly when it would bite.
  for (const enforce of [false, true]) {
    it(`gets in, so they can enrol (enforce: ${enforce})`, () => {
      const v = adminAalVerdict({ aal: 'aal1', hasVerifiedFactor: false, enforce });
      expect(v.allow).toBe(true);
      expect(v.wouldReject).toBe(false);
      expect(v.verdict).toBe('aal1-no-factor');
    });
  }
});

describe('an admin who HAS a verified factor but is on an AAL1 token', () => {
  it('is the actual bypass, and is flagged', () => {
    const v = adminAalVerdict({ aal: 'aal1', hasVerifiedFactor: true });
    expect(v.wouldReject).toBe(true);
  });

  it('is still let through while the check is only observing', () => {
    expect(adminAalVerdict({ aal: 'aal1', hasVerifiedFactor: true, enforce: false }).allow).toBe(
      true
    );
  });

  it('is refused once enforcing is switched on', () => {
    expect(adminAalVerdict({ aal: 'aal1', hasVerifiedFactor: true, enforce: true }).allow).toBe(
      false
    );
  });
});

describe('a session that completed TOTP', () => {
  it('is allowed, enforcing or not', () => {
    for (const enforce of [false, true]) {
      const v = adminAalVerdict({ aal: 'aal2', hasVerifiedFactor: true, enforce });
      expect(v.allow).toBe(true);
      expect(v.wouldReject).toBe(false);
    }
  });
});

describe('the two things this cannot assume', () => {
  it('a token with NO aal claim never rejects, even enforcing', () => {
    // Nobody has decoded this project's real admin token yet. If the claim is
    // not emitted here, enforcing on its absence would reject every admin
    // request forever - the outage, arrived at by assumption.
    const v = adminAalVerdict({ aal: undefined, hasVerifiedFactor: true, enforce: true });
    expect(v.allow).toBe(true);
    expect(v.verdict).toBe('no-aal-claim');
  });

  it('a factor lookup that did not come back never rejects, even enforcing', () => {
    const v = adminAalVerdict({ aal: 'aal1', hasVerifiedFactor: null, enforce: true });
    expect(v.allow).toBe(true);
    expect(v.verdict).toBe('aal1-factors-unknown');
  });
});

describe('reading the claims', () => {
  const encode = (obj) =>
    `header.${Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')}.sig`;

  it('pulls aal and amr out of a real-shaped token', () => {
    const c = readTokenClaims(
      encode({ sub: 'u1', aal: 'aal2', amr: [{ method: 'password' }, { method: 'totp' }] })
    );
    expect(c.aal).toBe('aal2');
    expect(c.amr.map((m) => m.method)).toEqual(['password', 'totp']);
  });

  it('returns {} for junk instead of throwing', () => {
    for (const junk of [null, undefined, '', 'not.a.token', 'a.b']) {
      expect(readTokenClaims(junk)).toEqual({});
    }
  });
});

describe('how it is wired into verifyAdminSession', () => {
  const fn = authjs.slice(
    authjs.indexOf('async function verifyAdminSession('),
    authjs.indexOf('async function handleAdminDeleteCalendarEvent(')
  );
  // Comments stripped first: a guard that matches its own comment has fooled
  // this repo three times. [^\n]* not .*$ because the file is CRLF.
  const code = fn.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  it('ships switched OFF - blocking needs an env var nobody has set', () => {
    expect(code).toMatch(/enforce: process\.env\.ADMIN_REQUIRE_AAL2 === '1'/);
    // and nothing else in the file turns it on by default
    expect(authjs).not.toMatch(/ADMIN_REQUIRE_AAL2\s*(\|\||\?\?)\s*['"]1['"]/);
  });

  it('logs the verdict on every admin request, before deciding anything', () => {
    const logAt = code.indexOf("'[admin-aal]'");
    const decideAt = code.indexOf('if (!aal.allow)');
    expect(logAt).toBeGreaterThan(-1);
    expect(logAt).toBeLessThan(decideAt);
  });

  it('runs AFTER the email allowlist, so a stranger is still a 403 not a 401', () => {
    expect(code.indexOf('isAdminEmail')).toBeLessThan(code.indexOf('adminAalVerdict('));
  });

  it('only pays for the factor lookup when the token is not already AAL2', () => {
    expect(code).toMatch(/if \(claims\.aal !== 'aal2'\) \{[\s\S]*?auth\/v1\/user/);
  });

  it('leaves hasVerifiedFactor null when the lookup fails, which never rejects', () => {
    expect(code).toMatch(/let hasVerifiedFactor = null;/);
    expect(code).not.toMatch(/hasVerifiedFactor = false;/);
  });
});

describe('the factor lookup cannot become an outage of its own', () => {
  const fn = authjs.slice(
    authjs.indexOf('async function verifyAdminSession('),
    authjs.indexOf('async function handleAdminDeleteCalendarEvent(')
  );
  const code = fn.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  // Found by running the suite, not by reading the code: adding this fetch
  // made tests/unit/mechanic-pin-length.test.js hang for 5s and fail. In
  // production the same hang would be an admin request that never answers.
  it('is aborted rather than left to hang', () => {
    expect(code).toMatch(/auth\/v1\/user[\s\S]{0,200}signal: AbortSignal\.timeout\(/);
  });

  it('and a timeout leaves the verdict unable to reject', () => {
    expect(adminAalVerdict({ aal: 'aal1', hasVerifiedFactor: null, enforce: true }).allow).toBe(
      true
    );
  });
});
