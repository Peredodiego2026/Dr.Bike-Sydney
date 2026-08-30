// tests/unit/privacy-requests.test.js
//
// Audit point 9. privacy.html already promises, under the Privacy Act 1988,
// that a client can ask for a copy of their data or ask for it to be deleted,
// and that we answer within 30 days. Answering by email is a compliant
// process; a self-service button is not required.
//
// The gap was never the button. It was that when somebody actually asked,
// there was NO WAY TO DO IT - it meant hand-writing SQL across a dozen tables
// and remembering from memory which ones hold personal data. A promise you
// cannot execute is worse than no promise, because it is published on the site.
//
// THE PART THAT IS EASY TO GET WRONG
//
// privacy.html ALSO promises to keep booking and service records for SEVEN
// YEARS for Australian tax compliance. Read quickly, the two promises
// contradict. They do not: "delete my data" is answered by ANONYMISING - the
// financial record keeps its dates and amounts, and every trace of who the
// person was is stripped out of it. Which means the one thing this code must
// never do is delete a booking.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  PII_MAP,
  NOT_PERSONAL,
  REDACTED,
  anonymisationPlan,
  exportPlan,
  allPiiColumns,
} from '../../api/_privacy.js';

const EMAIL = 'cliente@ejemplo.com';
const ID = '73c5409b-6298-43b4-9aa6-6ac2a0716c40';

describe('a booking is never deleted, only stripped', () => {
  // The seven-year retention obligation. If a future edit flips this, the
  // business loses its tax records to satisfy a privacy request - the wrong
  // trade in both directions.
  it('bookings is not deletable', () => {
    expect(PII_MAP.find((t) => t.table === 'bookings').deletable).toBe(false);
  });

  it('profiles is not deletable either, or the kept bookings would be orphaned', () => {
    expect(PII_MAP.find((t) => t.table === 'profiles').deletable).toBe(false);
  });

  it('the generated SQL contains no DELETE at all', () => {
    for (const who of [{ email: EMAIL }, { clientId: ID }]) {
      for (const { sql } of anonymisationPlan(who)) {
        expect(sql).not.toMatch(/\bDELETE\b/i);
        expect(sql).not.toMatch(/\bDROP\b|\bTRUNCATE\b/i);
        expect(sql).toMatch(/^UPDATE /);
      }
    }
  });

  it('keeps the financial columns a tax record needs', () => {
    const b = PII_MAP.find((t) => t.table === 'bookings');
    const touched = [...b.anonymise, ...b.nullify];
    for (const keep of [
      'scheduled_date',
      'service_name',
      'service_price',
      'callout_fee',
      'status',
      'stripe_payment_intent_id',
    ]) {
      expect(touched).not.toContain(keep);
    }
  });
});

describe('the identity really is removed', () => {
  it('every obviously identifying column on bookings is covered', () => {
    const b = PII_MAP.find((t) => t.table === 'bookings');
    const touched = [...b.anonymise, ...b.nullify];
    for (const c of [
      'client_name',
      'client_email',
      'client_phone',
      'address',
      'address_lat',
      'address_lng',
      'arrival_pin',
      'client_signature_url',
    ]) {
      expect(touched).toContain(c);
    }
  });

  it('the marker is visible, not a NULL that reads as "never had one"', () => {
    const { sql } = anonymisationPlan({ email: EMAIL }).find((p) => p.table === 'bookings');
    expect(sql).toContain(REDACTED);
    expect(REDACTED).toMatch(/removed/i);
  });

  // Coordinates and image URLs get NULL, not a marker: a string in a numeric
  // column fails, and a marker in an <img src> renders as a broken image.
  it('coordinates and images are nulled, not marked', () => {
    const b = PII_MAP.find((t) => t.table === 'bookings');
    for (const c of ['address_lat', 'address_lng', 'photo_before_url']) {
      expect(b.nullify).toContain(c);
      expect(b.anonymise).not.toContain(c);
    }
  });
});

describe('the request finds the person however they are identified', () => {
  it('works from an email alone, which is all an inbox gives you', () => {
    const plan = anonymisationPlan({ email: EMAIL });
    expect(plan.length).toBeGreaterThan(3);
    for (const { sql } of plan) expect(sql).toContain(EMAIL);
  });

  it('works from a profile id', () => {
    const plan = anonymisationPlan({ clientId: ID });
    expect(plan.length).toBeGreaterThan(2);
  });

  it('refuses to run with neither', () => {
    expect(() => anonymisationPlan({})).toThrow(/client_id or an email/);
    expect(() => exportPlan({})).toThrow(/client_id or an email/);
  });

  // Chat hangs off the booking, not off the person, so it needs a subquery or
  // it would silently miss every message.
  it('reaches the chat through the booking', () => {
    const chat = anonymisationPlan({ email: EMAIL }).find((p) => p.table === 'job_messages');
    expect(chat.sql).toMatch(/booking_id IN \(SELECT id FROM bookings WHERE/);
  });

  it('escapes quotes instead of breaking the statement', () => {
    const { sql } = anonymisationPlan({ email: "o'brien@ejemplo.com" }).find(
      (p) => p.table === 'bookings'
    );
    expect(sql).toContain("o''brien@ejemplo.com");
  });
});

describe('the export answers "everything you hold about me"', () => {
  it('covers every table the anonymiser touches', () => {
    const exported = exportPlan({ email: EMAIL }).map((p) => p.table);
    for (const { table } of anonymisationPlan({ email: EMAIL })) {
      expect(exported).toContain(table);
    }
  });

  it('is read-only', () => {
    for (const { sql } of exportPlan({ email: EMAIL })) {
      expect(sql).toMatch(/^SELECT /);
      expect(sql).not.toMatch(/UPDATE|DELETE|INSERT/i);
    }
  });
});

describe('nothing is left unclassified', () => {
  // A table that holds personal data and appears in neither list is a table
  // nobody will think of when a request arrives.
  it('every table is either mapped or explicitly declared non-personal', () => {
    const mapped = new Set(PII_MAP.map((t) => t.table));
    const known = new Set(Object.keys(NOT_PERSONAL));
    const overlap = [...mapped].filter((t) => known.has(t));
    expect(overlap).toEqual([]);
    expect(mapped.size + known.size).toBeGreaterThan(20);
  });

  it('every non-personal table carries a reason', () => {
    for (const [t, why] of Object.entries(NOT_PERSONAL)) {
      expect(why, `${t} has no reason`).toBeTruthy();
      expect(why.length).toBeGreaterThan(10);
    }
  });

  it('every mapped table says why its rows survive or go', () => {
    for (const t of PII_MAP) {
      expect(t.why, `${t.table} has no reason`).toBeTruthy();
      expect(typeof t.deletable).toBe('boolean');
    }
  });

  it('lists its own columns for cross-checking against the live schema', () => {
    const cols = allPiiColumns();
    expect(cols).toContain('bookings.client_email');
    expect(cols).toContain('profiles.phone');
    expect(cols.length).toBeGreaterThan(20);
  });
});

describe('the generator does not guess what it was given', () => {
  const script = fs.readFileSync(
    new URL('../../scripts/privacy-runbook.mjs', import.meta.url),
    'utf8'
  );

  // `indexOf` returns -1 when a flag is absent and -1 + 1 is 0, so the first
  // version read args[0] and used the literal "--forget" as the client id,
  // emitting `WHERE client_id = 'forget'::uuid` against real records. Found by
  // running it, not by reading it.
  it('does not read args[indexOf(flag) + 1] blindly', () => {
    expect(script).not.toMatch(/args\[args\.indexOf\('--(email|id)'\) \+ 1\]/);
    expect(script).toMatch(/function flag\(name\)/);
    expect(script).toMatch(/if \(i === -1\) return null;/);
  });

  it('validates the uuid and the email before building SQL', () => {
    expect(script).toMatch(/no parece un uuid/);
    expect(script).toMatch(/no parece un email/);
  });

  // It prints SQL for a human to review rather than executing anything. An
  // endpoint that anonymises a client on an HTTP call is one auth bug away
  // from stripping a real client's records with no undo.
  it('prints SQL and never connects to the database', () => {
    expect(script).not.toMatch(/fetch\(|createClient|SUPABASE_SERVICE_KEY/);
    expect(script).toMatch(/BEGIN;/);
    expect(script).toMatch(/-- COMMIT;/); // commented out: the human uncomments it
  });

  it('tells the operator to export before forgetting', () => {
    expect(script).toMatch(/hace el export/i);
  });
});
