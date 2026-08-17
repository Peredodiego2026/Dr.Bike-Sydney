// tests/unit/completion-guard.test.js — the mechanic's phone now parks a
// completion in an offline outbox and resends it when the signal comes back
// (js/mechanic.js). That makes a SECOND delivery of the same completion a
// normal, expected event, and everything handleMechanicComplete does is
// expensive to repeat: it charges the card again (Stripe's idempotency key
// stops deduping after 24h, and an outbox flushed the next morning is past it),
// decrements the parts stock again, and sends the client a second invoice PDF
// plus a second review email and SMS.
//
// These tests pin the decision that stops all of that.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { completionVerdict } from '../../api/_completion-guard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

describe('completionVerdict', () => {
  it('lets a first completion through', () => {
    expect(completionVerdict({ status: 'in_progress' }).action).toBe('proceed');
    expect(completionVerdict({ status: 'arrived' }).action).toBe('proceed');
    expect(completionVerdict({ status: 'confirmed' }).action).toBe('proceed');
    expect(completionVerdict({ status: 'enroute' }).action).toBe('proceed');
    expect(completionVerdict({ status: 'pending' }).action).toBe('proceed');
  });

  it('proceeds when the booking row could not be read', () => {
    // Refusing to complete a real job because a SELECT failed is worse than
    // the duplicate this guard protects against.
    expect(completionVerdict(null).action).toBe('proceed');
    expect(completionVerdict(undefined).action).toBe('proceed');
  });

  it('short-circuits a job that is already completed', () => {
    const v = completionVerdict({ status: 'completed', final_charge_status: 'cash' });
    expect(v.action).toBe('replay');
    expect(v.status).toBe(200);
    expect(v.body.ok).toBe(true);
    expect(v.body.already_completed).toBe(true);
  });

  it('answers 200, not an error, on a replay', () => {
    // The phone must treat the replay as a success and drop the outbox item.
    // A 4xx/5xx would either retry forever or lose the item.
    expect(completionVerdict({ status: 'completed' }).status).toBe(200);
  });

  it('reports nothing was sent on a replay, so nothing gets re-reported', () => {
    const v = completionVerdict({ status: 'completed' });
    expect(v.body.notified.sent).toEqual([]);
    expect(v.body.notified.failed).toEqual([]);
    expect(v.body.notified.skipped).toContain('replay:already-completed');
    expect(v.body.low_stock).toEqual([]);
  });

  it('reports auto_charged from the booking, not from this request', () => {
    expect(
      completionVerdict({ status: 'completed', final_charge_status: 'charged_card_on_file' }).body
        .auto_charged
    ).toBe(true);
    expect(
      completionVerdict({ status: 'completed', final_charge_status: 'cash' }).body.auto_charged
    ).toBe(false);
    expect(completionVerdict({ status: 'completed' }).body.auto_charged).toBe(false);
  });

  it('refuses to complete a job that was cancelled meanwhile', () => {
    // Completed in a basement, cancelled by Diego before the phone found
    // signal. Charging a cancelled job hours later is the worst version of
    // this bug, not an edge case.
    const v = completionVerdict({ status: 'cancelled' });
    expect(v.action).toBe('reject');
    expect(v.status).toBe(409);
    expect(v.body.code).toBe('JOB_CANCELLED');
  });
});

describe('handleMechanicComplete wiring', () => {
  const auth = readFileSync(join(root, 'api/auth.js'), 'utf8');
  // \r?\n on purpose: this repo's files are checked out with CRLF endings.
  const match = auth.match(/async function handleMechanicComplete\([^)]*\)\s*{[\s\S]*?\r?\n}\r?\n/);
  const fn = (match || [''])[0];

  it('is findable in api/auth.js', () => {
    expect(match, 'handleMechanicComplete not found').not.toBeNull();
  });

  it('imports the guard', () => {
    expect(auth).toMatch(/import\s*{\s*completionVerdict\s*}\s*from\s*'\.\/_completion-guard\.js'/);
  });

  it('runs the guard BEFORE the Stripe charge, the stock decrement and the notifications', () => {
    const guardAt = fn.indexOf('completionVerdict(');
    expect(guardAt, 'completionVerdict not called in handleMechanicComplete').toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(fn.indexOf('paymentIntents.create'));
    expect(guardAt).toBeLessThan(fn.indexOf('decrement_part_stock'));
    expect(guardAt).toBeLessThan(fn.indexOf('sendCompletionNotifications'));
  });

  it('returns immediately on any verdict that is not "proceed"', () => {
    expect(fn).toMatch(
      /verdict\.action !== 'proceed'[\s\S]{0,300}return res\.status\(verdict\.status\)/
    );
  });

  it('still keys the Stripe idempotency key on the booking, for the same-second race', () => {
    // Read-then-act is not atomic. Two taps within the same second can both
    // read "not completed"; that window is Stripe's key, not this guard's.
    expect(fn).toMatch(/idempotencyKey:\s*`complete-charge-\$\{booking_id\}`/);
  });
});

// A review of the 6 merged Prioridad Media PRs (2026-08-16) found 3 real bugs
// in the parts-cost-actual addition to this function, all in the shape "an
// external call can fail, and the code did the wrong thing when it did":
describe('handleMechanicComplete - parts cost lookup failure handling (review fix)', () => {
  const auth = readFileSync(join(root, 'api/auth.js'), 'utf8');
  const match = auth.match(/async function handleMechanicComplete\([^)]*\)\s*{[\s\S]*?\r?\n}\r?\n/);
  const fn = (match || [''])[0];

  it('wraps the parts_inventory cost lookup in try/catch, not a bare await', () => {
    // Before the fix, a network exception on this fetch propagated out of the
    // whole function - the opposite of the adjacent comment's promise that a
    // completion is never blocked by this lookup.
    expect(fn).toMatch(
      /try\s*{[\s\S]{0,300}rest\/v1\/parts_inventory\?select=id,cost_price[\s\S]{0,400}catch \(e\) {/
    );
  });

  it('defaults costLookupOk to false and sets it true in exactly one place: the success branch', () => {
    // A first pass at this fix defaulted costLookupOk to true and only ever
    // set it to false - which is a false-positive-shaped test risk in
    // itself: pattern-matching for "the false-setting exists somewhere"
    // cannot tell a real guard from a decoy. Asserting there is EXACTLY ONE
    // `= true` assignment, and that it sits textually inside `if
    // (costResp.ok)`, is what actually pins "this can only become trusted
    // by a real successful response" - not just "the words costLookupOk and
    // false both appear somewhere in the function" (review finding: the
    // previous version of this test only checked the happy-path tokens and
    // would have stayed green even if the false-branch assignments were
    // deleted entirely).
    expect(fn).toMatch(/let costLookupOk = false;/);
    const trueAssignments = fn.match(/costLookupOk = true;/g) || [];
    expect(trueAssignments).toHaveLength(1);
    expect(fn).toMatch(/if \(costResp\.ok\) {[\s\S]{0,200}costLookupOk = true;[\s\S]{0,50}\n\s*}/);
    // And the catch block must NOT flip it true - a network exception is
    // exactly the case that has to stay "cannot say".
    const catchBlock = fn.match(/} catch \(e\) {[\s\S]*?\n\s*}\s*\n\s*}\s*\n/)?.[0] || '';
    expect(catchBlock).not.toMatch(/costLookupOk = true/);
  });

  it('guards the partsCostActual accumulation on whether the lookup actually succeeded', () => {
    // Before the fix, a failed lookup (network throw, or a non-ok response)
    // left partsCostActual at 0 - a job that genuinely used $80 of parts
    // could get recorded as a "measured" $0, understating its real cost with
    // no signal anywhere that the number wasn't real.
    expect(fn).toMatch(/if \(costLookupOk\) partsCostActual = 0/);
    expect(fn).toMatch(/if \(costLookupOk\) partsCostActual \+=/);
  });

  it('treats "no valid id at all" the same as a failed lookup, not a measured $0', () => {
    // Edge case a first pass at this fix missed: if every id in parts_used
    // was missing or malformed, partIds ends up empty, the lookup block
    // never runs, and costLookupOk staying at its default has to be false -
    // otherwise a job with zero valid ids still settles on partsCostActual
    // = 0 (measured, not "cannot say") purely because the loop below never
    // finds anything to add.
    expect(fn).toMatch(/let costLookupOk = false;[\s\S]{0,20}if \(partIds\.length\) {/);
  });

  it('only puts uuid-shaped ids (proper 8-4-4-4-12 groups) into the parts_inventory in.() filter', () => {
    // A single malformed id used to be able to break the filter syntax for
    // the WHOLE batch, pricing every other part in the same job at 0 too.
    // The regex itself is pinned precisely, not just "some uuid check
    // exists": an earlier version only checked "36 characters of hex or
    // hyphen", which a string of 36 hyphens or 36 hex digits with none also
    // matches - neither is a real uuid, and Postgres would reject the whole
    // filter on either just as it would on the original threat (quotes/
    // commas/parens), reintroducing the same whole-batch failure this test
    // exists to guard against (review finding).
    const uuidRe = /\/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$\/i/;
    expect(fn).toMatch(uuidRe);
    // Extract the exact regex literal from the source and run it for real,
    // rather than trusting the text alone matches what it looks like.
    const literal = fn.match(/\/\^\[0-9a-f\][\s\S]{0,80}\$\/i/)[0];
    // eslint-disable-next-line no-eval -- test-only, reads the regex literal straight from source
    const partIdRegex = eval(literal);
    expect(partIdRegex.test('a1b2c3d4-e5f6-4a5b-8c9d-0123456789ab')).toBe(true);
    expect(partIdRegex.test('-'.repeat(36))).toBe(false);
    expect(partIdRegex.test('a'.repeat(36))).toBe(false);
    expect(partIdRegex.test('not-a-uuid-at-all')).toBe(false);
  });

  it('logs before retrying the completion PATCH without parts_cost_actual', () => {
    // Before the fix, a failed first PATCH attempt was retried silently -
    // if the retry succeeded, there was no trace anywhere that the write
    // needed a fallback, so "migration not run yet" (expected) and "this
    // write is broken for an unrelated reason" (needs attention) were
    // indistinguishable in the logs.
    expect(fn).toMatch(
      /console\.warn\(\s*'\[mechanic-complete\] booking PATCH failed[\s\S]{0,200}const \{ parts_cost_actual, \.\.\.withoutPartsCost \} = payload;/
    );
  });
});
