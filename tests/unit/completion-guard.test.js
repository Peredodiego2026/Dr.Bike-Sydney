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
