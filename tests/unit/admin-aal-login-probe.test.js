// Instrumentation for the two questions api/_admin-aal.js says it cannot
// answer by reading code (docs/PENDIENTES.md 96):
//
//   (a) does this project's JWT carry an `aal` claim, and with what values?
//   (b) does /factors/{id}/verify hand back a DIFFERENT token from the one
//       signInWithPassword gave, or the same AAL1 one?
//
// If (b) were "the same", then switching ADMIN_REQUIRE_AAL2 on would reject
// the CORRECT login - the good case - which is the outage arrived at from the
// other direction.
//
// verifyAdminSession's own [admin-aal] line cannot answer either: it runs only
// on the fourteen admin-* routes, and simply opening the panel calls none of
// them. Confirmed against production on 2026-09-04 - Diego signed in, the
// panel worked, and the deployment's logs held zero [admin-aal] lines.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const authjs = readFileSync(join(root, 'api', 'auth.js'), 'utf8');
// Comments stripped, [^\n]* rather than .*$ because the file is CRLF.
const code = authjs.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

describe('every token the admin login hands out is measured', () => {
  for (const stage of ['after-password', 'after-totp', 'after-enrolment']) {
    it(`logs the ${stage} token`, () => {
      expect(code).toContain(`logAdminTokenLevel('${stage}'`);
    });
  }

  it('measures the token that is actually returned, not some other variable', () => {
    // after-totp must read d.access_token - the one the response carries.
    expect(code).toMatch(
      /logAdminTokenLevel\('after-totp', d\.access_token\);\s*return res\.status\(200\)\.json\(\{ access_token: d\.access_token/
    );
  });

  it('runs BEFORE the response, or it never runs at all', () => {
    const logAt = code.indexOf("logAdminTokenLevel('after-password'");
    const returnAt = code.indexOf('mfa_required: true');
    expect(logAt).toBeGreaterThan(-1);
    expect(logAt).toBeLessThan(returnAt);
  });
});

describe('the probe cannot change behaviour', () => {
  const fn = code.slice(
    code.indexOf('function logAdminTokenLevel('),
    code.indexOf('\n}', code.indexOf('function logAdminTokenLevel(')) + 2
  );

  it('only logs - it returns nothing and throws nothing', () => {
    expect(fn).toContain('console.log');
    expect(fn).not.toMatch(/\breturn\s+[^;\s}]/);
    expect(fn).not.toMatch(/\bthrow\b/);
  });

  it('never puts a token in the log', () => {
    // The whole point is the CLAIMS. A token in a log line is a credential in
    // a log line.
    expect(fn).not.toMatch(/access_token|\btoken\b\s*[,}]/);
  });

  it('says out loud whether the claim exists at all, not just its value', () => {
    // `aal: null` is ambiguous - absent claim, or present and empty. The
    // answer to question (a) has to be unambiguous.
    expect(fn).toContain("has_aal_claim: 'aal' in c");
  });
});
