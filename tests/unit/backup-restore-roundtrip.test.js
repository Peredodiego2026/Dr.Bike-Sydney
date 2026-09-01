// tests/unit/backup-restore-roundtrip.test.js
//
// Audit point 19. The complaint was never "there are no backups" - it was that
// nobody had ever restored one, which makes a backup a promise rather than a
// fact. api/_backup.js closed the first half. This closes the second.
//
// The round trip is driven end to end with the REAL production code on both
// sides: buildBackup() writes the file, validateBackup() reads it, and the
// rows are compared field by field. If the shape drifts on either side, this
// fails - which is the only thing that keeps the file Diego receives every
// night restorable.
import { describe, it, expect } from 'vitest';
import { buildBackup } from '../../api/_backup.js';
import { validateBackup } from '../../scripts/restore-backup.mjs';

// A database that looks like the real one: a couple of tables, PII, nulls,
// nested JSON, unicode, and a table with more rows than one PostgREST page.
const DB = {
  bookings: Array.from({ length: 1200 }, (_, i) => ({
    id: `bk_${i}`,
    client_name: i % 3 === 0 ? 'José Ñuñez' : 'Sam Smith',
    client_email: `c${i}@example.com`,
    address: `${i} Example St, Curl Curl NSW 2096`,
    scheduled_date: '2026-09-03',
    scheduled_time: '10:00:00',
    callout_fee: 25,
    status: 'completed',
    stripe_payment_intent_id: i % 2 ? `pi_${i}` : null,
    parts_used: i % 5 === 0 ? [{ name: 'Tube', qty: 2 }] : null,
  })),
  profiles: [
    { id: 'p1', full_name: '张伟', email: 'a@b.com', push_subscription: { endpoint: 'x' } },
    { id: 'p2', full_name: null, email: 'c@d.com', push_subscription: null },
  ],
  services: [{ id: 's1', name: 'Tune-Up', price: 109, description: 'Safety check & brakes' }],
  waitlist: [],
};

const fetchPage = async (table, offset, limit) => ({
  rows: (DB[table] || []).slice(offset, offset + limit),
});

describe('a backup can be read back', () => {
  it('the file it writes is one the restore accepts', async () => {
    const out = await buildBackup({ fetchPage, tables: Object.keys(DB) });
    const parsed = JSON.parse(out.json);
    const v = validateBackup(parsed);
    expect(Array.isArray(v)).toBe(false);
    expect(v.problems).toEqual([]);
    expect(v.failed).toEqual([]);
  });

  // The whole point. Not "a file was produced" - every row, intact.
  it('every row survives the round trip, field for field', async () => {
    const out = await buildBackup({ fetchPage, tables: Object.keys(DB) });
    const back = JSON.parse(out.json).data;
    for (const [table, rows] of Object.entries(DB)) {
      expect(back[table], `${table} missing`).toEqual(rows);
    }
  });

  it('including the table that spans more than one page', async () => {
    const out = await buildBackup({ fetchPage, tables: ['bookings'] });
    const back = JSON.parse(out.json).data.bookings;
    expect(back).toHaveLength(1200);
    expect(back[0]).toEqual(DB.bookings[0]);
    expect(back[1199]).toEqual(DB.bookings[1199]);
  });

  // Unicode, nulls and nested JSON are where a naive dump quietly mangles
  // things - and a mangled restore is worse than a failed one, because it
  // looks like it worked.
  it('unicode, nulls and nested objects come back unchanged', async () => {
    const out = await buildBackup({ fetchPage, tables: ['profiles'] });
    const back = JSON.parse(out.json).data.profiles;
    expect(back[0].full_name).toBe('张伟');
    expect(back[1].full_name).toBeNull();
    expect(back[0].push_subscription).toEqual({ endpoint: 'x' });
  });

  it('an empty table restores as empty, not as missing', async () => {
    const out = await buildBackup({ fetchPage, tables: ['waitlist'] });
    expect(JSON.parse(out.json).data.waitlist).toEqual([]);
  });

  it('the row counts in the file match the rows in it', async () => {
    const out = await buildBackup({ fetchPage, tables: Object.keys(DB) });
    const v = validateBackup(JSON.parse(out.json));
    expect(v.counts.bookings).toBe(1200);
    expect(v.total).toBe(1200 + 2 + 1);
  });
});

describe('the restore refuses what it should refuse', () => {
  it('a file that is not a backup', () => {
    expect(validateBackup(null)).toEqual(['no es un objeto JSON']);
    const v = validateBackup({});
    expect(v.problems.length).toBeGreaterThan(0);
  });

  // A count that disagrees with the rows present means the file was truncated
  // or edited after it was written. Restoring it would silently lose rows.
  it('a file whose counts disagree with its contents', async () => {
    const out = await buildBackup({ fetchPage, tables: ['profiles'] });
    const tampered = JSON.parse(out.json);
    tampered.table_counts.profiles = 99;
    const v = validateBackup(tampered);
    expect(v.problems.join(' ')).toMatch(/profiles: dice 99 filas y trae 2/);
  });

  // api/_backup.js records a failed table AS an object so a restore can tell
  // "failed that night" from "was empty". This is that distinction paying off.
  it('and it can tell a failed table from an empty one', async () => {
    const failing = async (t, o, l) =>
      t === 'profiles' ? { rows: null, error: 'connection lost' } : fetchPage(t, o, l);
    const out = await buildBackup({ fetchPage: failing, tables: ['profiles', 'services'] });
    const v = validateBackup(JSON.parse(out.json));
    expect(v.failed).toEqual([{ table: 'profiles', error: 'connection lost' }]);
    expect(v.counts.services).toBe(1);
    expect(v.counts.profiles).toBeUndefined();
  });
});

describe('the restore cannot be pointed at production by accident', () => {
  const src = (() => {
    const fs = require('node:fs');
    return fs.readFileSync(new URL('../../scripts/restore-backup.mjs', import.meta.url), 'utf8');
  })();

  // Restoring over a healthy production database is how a backup becomes the
  // disaster it was meant to prevent.
  it('writing to the live project needs an explicit flag', () => {
    expect(src).toContain('--i-know-this-is-live');
    expect(src).toContain('ESE ES EL PROYECTO DE PRODUCCION');
  });

  it('dry-run is the default, not an option', () => {
    expect(src).toMatch(/const dryRun = has\('--dry-run'\) \|\| !url \|\| !key;/);
  });

  it('an incomplete backup is refused unless forced', () => {
    expect(src).toContain('--allow-incomplete');
  });

  // Nothing here deletes. A restore that clears a table first would turn a
  // partial failure into total loss.
  it('never deletes anything', () => {
    expect(src).not.toMatch(/method:\s*'DELETE'/);
    expect(src).toContain('resolution=merge-duplicates');
  });
});
