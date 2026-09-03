// tests/unit/privacy-request-wired.test.js
//
// api/_privacy.js has known how to answer a privacy request since August, and
// tests/unit/privacy-requests.test.js proves the plans it builds are correct.
// What nobody checked is whether anything CALLED it. Nothing did.
//
// So privacy.html promised, under the Privacy Act 1988, a copy of the data and
// erasure of it within 30 days - and honouring that meant finding a file in the
// repo. Worse, the runbook Diego would have opened named ONE of the nine tables
// that hold personal data, leaving the person's name in `profiles`, their
// bikes, their messages, their abandoned checkouts and three mailing lists.
//
// The module header claimed docs/RUNBOOK-PRIVACY.md was "GENERATED ... by
// scripts/privacy-check.mjs, so the runbook Diego pastes into Supabase cannot
// drift". That script did not exist, which is exactly how it drifted.
//
// This pins the wiring: the generator exists and runs in npm run check, the
// server exposes the plans behind admin auth, and the Admin screen has the
// button.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PII_MAP } from '../../api/_privacy.js';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8').split('\r\n').join('\n');
const auth = read('api/auth.js');
const admin = read('js/admin.js');
const runbook = read('docs/RUNBOOK-PRIVACY.md');
const pkg = JSON.parse(read('package.json'));

describe('the runbook cannot drift from the code again', () => {
  it('the generator the module header promises actually exists', () => {
    expect(fs.existsSync(new URL('scripts/privacy-check.mjs', root))).toBe(true);
  });

  it('runs as part of npm run check', () => {
    expect(pkg.scripts.check).toContain('scripts/privacy-check.mjs');
  });

  // The drift that was live: PII_MAP had nine tables, the runbook named one.
  it('the runbook names every table that holds personal data', () => {
    for (const t of PII_MAP) {
      expect(runbook, `the runbook never mentions \`${t.table}\``).toContain(`\`${t.table}\``);
    }
  });

  it('carries the SQL for both halves of a request', () => {
    expect(runbook).toContain('SELECT * FROM bookings');
    expect(runbook).toContain('UPDATE bookings');
    // Wrapped in a transaction, so a wrong result can still be rolled back.
    expect(runbook).toContain('BEGIN;');
    expect(runbook).toContain('ROLLBACK');
  });

  it('states the retention reason per table, not just the table name', () => {
    for (const t of PII_MAP.filter((x) => !x.deletable)) {
      expect(runbook, `no reason given for keeping \`${t.table}\``).toContain(t.why);
    }
  });
});

describe('the server exposes the plans, behind admin auth', () => {
  const start = auth.indexOf('async function handleAdminPrivacyPlan(');
  const handler = auth.slice(start, auth.indexOf('\n}\n', start));

  it('the handler exists and is routed', () => {
    expect(start, 'handleAdminPrivacyPlan is gone').toBeGreaterThan(-1);
    expect(auth).toContain(
      "if (role === 'admin-privacy-plan') return handleAdminPrivacyPlan(req, res);"
    );
  });

  it('verifies an admin session before answering', () => {
    expect(handler).toContain('verifyAdminSession');
    expect(handler).toMatch(/if \(auth\.error\) return res\.status\(auth\.status\)/);
  });

  it('returns both plans', () => {
    expect(handler).toContain('exportPlan(target)');
    expect(handler).toContain('anonymisationPlan(target)');
  });

  // A malformed id would match no rows and produce SQL that reads as complete
  // while erasing nobody - the worst possible outcome for this feature.
  it('refuses an id that is not a UUID rather than building SQL that matches nothing', () => {
    expect(handler).toMatch(/0-9a-f-\]\{36\}/);
    expect(handler).toContain('not a valid UUID');
  });

  it('accepts an email alone, because a guest has no profile row', () => {
    expect(handler).toMatch(/if \(!clientId && !clientEmail\)/);
  });

  // The line that matters most: this endpoint hands over SQL, it never runs it.
  it('does not execute anything', () => {
    expect(handler).not.toMatch(/\.rpc\(|\.update\(|\.delete\(|execute/i);
  });
});

describe('Diego has a button', () => {
  it('every client card offers the request', () => {
    expect(admin).toContain('data-cl-action="privacy"');
    expect(admin).toContain('Privacy request');
  });

  it('the click is wired to the handler', () => {
    expect(admin).toMatch(/clAction === 'privacy'\)\s*\n?\s*openPrivacyRequest\(/);
  });

  it('passes the email too, so a guest booking can be answered', () => {
    const btn = admin.slice(admin.indexOf('data-cl-action="privacy"'));
    expect(btn.slice(0, 300)).toContain('data-email=');
  });

  const start = admin.indexOf('async function openPrivacyRequest(');
  const fn = admin.slice(start, admin.indexOf('\n}\n', start));

  it('warns that erasure cannot be undone', () => {
    expect(fn).toContain('cannot be undone');
  });

  it('says the booking record survives, which is why this is not a delete', () => {
    expect(fn).toContain('7 years');
    expect(fn).toMatch(/nothing here deletes a booking/i);
  });

  it('puts the read-only copy first and the erasure second', () => {
    expect(fn.indexOf('Send them a copy')).toBeLessThan(fn.indexOf('Erase them'));
  });

  // Same reason as the server: the button copies SQL for Supabase.
  it('copies the SQL rather than running it', () => {
    expect(fn).toContain('clipboard');
    expect(fn).not.toMatch(/sb\s*\.\s*from\(/);
  });
});
