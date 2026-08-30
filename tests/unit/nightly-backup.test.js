// tests/unit/nightly-backup.test.js
//
// Audit point 19. The answer turned out to be worse than the question. The
// audit asked "backups exist but has anyone restored one?" - the Supabase
// dashboard says the Free plan has NO backups at all. There is nothing to
// restore. Diego asked for the free stopgap: dump everything nightly and email
// it to him, so a copy lives outside Supabase.
//
// A backup you cannot trust is worse than none, because you stop worrying. The
// two ways this one could lie are what these tests are about.
import { describe, it, expect } from 'vitest';
import {
  buildBackup,
  backupSubject,
  backupBody,
  backupFilename,
  BACKUP_TABLES,
  MAX_JSON_BYTES,
} from '../../api/_backup.js';

// A fake database. `rows` maps table -> array; `failing` maps table -> message.
const fakeFetch =
  (rows, failing = {}) =>
  async (table, offset, limit) => {
    if (failing[table]) return { rows: null, error: failing[table] };
    return { rows: (rows[table] || []).slice(offset, offset + limit) };
  };

const T = ['bookings', 'profiles'];

describe('it actually pages, so a growing table is not silently cut off', () => {
  // PostgREST returns at most 1000 rows. A single-request dump of a table with
  // 1001 rows produces a file holding 1000 and looking complete. That is the
  // failure mode that makes a backup a lie.
  it('reads past the 1000-row ceiling', async () => {
    const many = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
    const out = await buildBackup({
      fetchPage: fakeFetch({ bookings: many, profiles: [] }),
      tables: T,
    });
    expect(out.counts.bookings).toBe(2500);
    expect(JSON.parse(out.json).data.bookings).toHaveLength(2500);
  });

  it('stops at a short page instead of looping forever', async () => {
    let calls = 0;
    const fetchPage = async (table, offset, limit) => {
      calls++;
      return { rows: Array.from({ length: offset === 0 ? 10 : 0 }, (_, i) => ({ id: i })) };
    };
    const out = await buildBackup({ fetchPage, tables: ['bookings'] });
    expect(out.counts.bookings).toBe(10);
    expect(calls).toBe(1); // 10 < 1000, so no second request
  });

  it('a table that is exactly one full page is asked again', async () => {
    const exactly = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const out = await buildBackup({
      fetchPage: fakeFetch({ bookings: exactly }),
      tables: ['bookings'],
    });
    expect(out.counts.bookings).toBe(1000);
  });
});

describe('a table that fails is recorded, never quietly dropped', () => {
  // Dropping a failed table and sending the rest produces a file that looks
  // whole and is not. Restoring from it would silently lose a table.
  it('marks the backup incomplete and keeps the error in the file', async () => {
    const out = await buildBackup({
      fetchPage: fakeFetch({ profiles: [{ id: 1 }] }, { bookings: 'connection lost' }),
      tables: T,
    });
    expect(out.complete).toBe(false);
    expect(out.errors).toEqual([{ table: 'bookings', error: 'connection lost' }]);
    expect(out.counts.bookings).toBeNull();
    // In the file itself, so a restore cannot mistake it for an empty table.
    expect(JSON.parse(out.json).data.bookings).toEqual({ __backup_error__: 'connection lost' });
    expect(JSON.parse(out.json).complete).toBe(false);
  });

  it('a failed table does not stop the others being saved', async () => {
    const out = await buildBackup({
      fetchPage: fakeFetch({ profiles: [{ id: 1 }, { id: 2 }] }, { bookings: 'boom' }),
      tables: T,
    });
    expect(out.counts.profiles).toBe(2);
  });

  it('an empty table is zero, which is not the same as a failure', async () => {
    const out = await buildBackup({ fetchPage: fakeFetch({}), tables: T });
    expect(out.complete).toBe(true);
    expect(out.counts.bookings).toBe(0);
    expect(JSON.parse(out.json).data.bookings).toEqual([]);
  });
});

describe('the email says what happened without being opened', () => {
  it('a failed backup does not look like a successful one', () => {
    const s = backupSubject({
      complete: false,
      totalRows: 5,
      errors: [{ table: 'bookings', error: 'x' }],
      date: new Date('2026-08-30T00:00:00Z'),
    });
    expect(s).toMatch(/INCOMPLETO/);
    expect(s).toContain('2026-08-30');
  });

  it('a good one states the row count', () => {
    const s = backupSubject({
      complete: true,
      totalRows: 1234,
      errors: [],
      date: new Date('2026-08-30T00:00:00Z'),
    });
    expect(s).not.toMatch(/INCOMPLETO/);
    expect(s).toContain('1234');
  });

  it('the body lists every table so a missing one is visible', () => {
    const body = backupBody({
      counts: { bookings: 3, profiles: null },
      errors: [{ table: 'profiles', error: 'nope' }],
      bytes: 2048,
      complete: false,
    });
    expect(body).toMatch(/bookings: 3/);
    expect(body).toMatch(/profiles: FALLO/);
    expect(body).toMatch(/NO esta completa/);
  });

  it('the filename carries the date, so files do not overwrite each other', () => {
    expect(backupFilename(new Date('2026-08-30T12:00:00Z'))).toBe('drbike-backup-2026-08-30.json');
  });
});

describe('what gets backed up', () => {
  // The tables that would have to be rebuilt by hand. Asserted by name because
  // a table added to the app and forgotten here is invisible until a restore.
  it('covers the ones that hold the business', () => {
    for (const t of ['bookings', 'profiles', 'bikes', 'services', 'callout_zones', 'expenses']) {
      expect(BACKUP_TABLES).toContain(t);
    }
  });

  it('has a size ceiling below what Resend accepts', () => {
    // Resend caps a message near 40MB and base64 inflates by 4/3.
    expect(MAX_JSON_BYTES).toBeLessThan((40 * 1024 * 1024 * 3) / 4);
  });

  it('reports its own size so the ceiling can be checked before sending', async () => {
    const out = await buildBackup({ fetchPage: fakeFetch({ bookings: [{ id: 1 }] }), tables: T });
    expect(out.bytes).toBe(Buffer.byteLength(out.json, 'utf8'));
    expect(out.bytes).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The failure mode this list has: a table that exists in the database and is
// not named in BACKUP_TABLES is backed up by nobody, and nothing says so. The
// first version of the list missed `waitlist_signups` - real people who asked
// to be contacted - and `stripe_events`, whose loss lets a replayed webhook be
// processed twice, which is money rather than data.
//
// The live schema as read on 2026-08-30 is pinned here. When a migration adds
// a table, this test fails and forces the choice: back it up, or add it to
// DELIBERATELY_SKIPPED with a reason. Either is fine; silence is not.
// ---------------------------------------------------------------------------
import { DELIBERATELY_SKIPPED } from '../../api/_backup.js';

const LIVE_TABLES_2026_08_30 = [
  'availability',
  'bike_service_history',
  'bikes',
  'bookings',
  'bookings_backup_20260726',
  'callout_zones',
  'checkout_attempts',
  'claims',
  'discount_codes',
  'escalation_contacts',
  'expenses',
  'geo_cache',
  'gift_cards',
  'job_messages',
  'login_attempts',
  'mechanic_locations',
  'newsletter_subscribers',
  'notification_log',
  'notifications',
  'parts_inventory',
  'profiles',
  'services',
  'stripe_events',
  'van_inventory',
  'van_zones',
  'waitlist',
  'waitlist_signups',
];

describe('no table is forgotten', () => {
  it('every live table is either backed up or skipped on purpose', () => {
    const accounted = new Set([...BACKUP_TABLES, ...DELIBERATELY_SKIPPED]);
    const orphans = LIVE_TABLES_2026_08_30.filter((t) => !accounted.has(t));
    expect(orphans).toEqual([]);
  });

  it('the two that were actually missed are in', () => {
    expect(BACKUP_TABLES).toContain('waitlist_signups');
    expect(BACKUP_TABLES).toContain('stripe_events');
  });

  it('nothing is both backed up and skipped', () => {
    const both = BACKUP_TABLES.filter((t) => DELIBERATELY_SKIPPED.includes(t));
    expect(both).toEqual([]);
  });

  it('does not back up the backup table, which would double the file', () => {
    expect(BACKUP_TABLES).not.toContain('bookings_backup_20260726');
  });
});
