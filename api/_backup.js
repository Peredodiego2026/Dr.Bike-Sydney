// api/_backup.js — nightly off-site backup of the whole database.
//
// WHY THIS EXISTS
//
// Diego's Supabase project is on the Free plan, and the Free plan has NO
// backups at all. Not "backups nobody has restored" - none. Confirmed from the
// dashboard on 2026-08-30: "Free Plan does not include project backups."
//
// Today that is 3 bookings and survivable. The day it is 200 clients with
// their bikes, service history and payments, one mistyped DELETE in the SQL
// editor is the end of the business's records with nothing to go back to.
//
// So: every night, dump every table to JSON and email it to Diego. It is off
// site by construction - it leaves Supabase and lands in his mailbox, so it
// survives the project itself being lost. It is not a replacement for Pro's
// point-in-time recovery; it is the difference between losing a day and losing
// everything.
//
// THE TWO WAYS A BACKUP LIES, BOTH GUARDED HERE
//
//  1. Silent truncation. PostgREST returns at most 1000 rows per request. A
//     naive dump of a growing table would quietly stop at 1000 and still look
//     like a complete file. Every table is paged to exhaustion, and the page
//     count is reported.
//  2. Silent omission. If one table errors, dropping it and sending the rest
//     produces a file that looks whole and is not. A failed table is recorded
//     IN the backup as an error entry, and the email subject says the backup
//     is incomplete.
//
// A backup that is wrong in a way you cannot see is worse than no backup,
// because you stop worrying about it.

// Everything that would have to be reconstructed by hand. `services` and
// `callout_zones` are small but they are the price list and the coverage map -
// losing them means the business cannot quote.
//
// Checked against the live schema on 2026-08-30, and the check found the
// failure mode this list has: a table that exists in the database and is not
// named here is backed up by nobody, and nothing says so. `waitlist_signups`
// (real people who asked to be contacted) and `stripe_events` were both
// missing on the first pass.
export const BACKUP_TABLES = [
  'bookings',
  'profiles',
  'bikes',
  'bike_service_history',
  'services',
  'callout_zones',
  'van_zones',
  'escalation_contacts',
  'discount_codes',
  'availability',
  'parts_inventory',
  'van_inventory',
  'expenses',
  'gift_cards',
  'job_messages',
  'checkout_attempts',
  'claims',
  'waitlist',
  'waitlist_signups',
  'notifications',
  'notification_log',
  'newsletter_subscribers',
  // Stripe's own event ids, used for idempotency. Losing them means a replayed
  // webhook could be processed twice - money, not just data.
  'stripe_events',
  'mechanic_locations',
];

// Deliberately NOT backed up, so the omissions are a decision on the record
// rather than an oversight the next reader has to re-derive:
//
//   geo_cache                 - a cache of geocoded addresses, rebuilt on demand.
//   login_attempts            - rate-limit state, meaningless an hour later.
//   bookings_backup_20260726  - already a one-off snapshot of `bookings`;
//                               including it would double the file to store a
//                               copy of a copy.
export const DELIBERATELY_SKIPPED = ['geo_cache', 'login_attempts', 'bookings_backup_20260726'];

const PAGE = 1000; // PostgREST's own ceiling

// Resend rejects a message over ~40MB. Base64 inflates by 4/3, so the JSON
// itself has to stay under roughly 28MB. Stopping short of the limit and
// saying so beats sending a message the API refuses, which would fail
// silently at 3am.
export const MAX_JSON_BYTES = 20 * 1024 * 1024;

export function backupFilename(date = new Date()) {
  return `drbike-backup-${date.toISOString().slice(0, 10)}.json`;
}

/**
 * Pull every row of every table.
 *
 * `fetchPage(table, offset, limit)` must resolve to { rows, error }. Injected
 * so this is testable without a database - the pagination and the failure
 * handling are the parts that matter, and both are pure logic.
 */
export async function buildBackup({ fetchPage, tables = BACKUP_TABLES, now = new Date() }) {
  const data = {};
  const counts = {};
  const errors = [];

  for (const table of tables) {
    const rows = [];
    let offset = 0;
    let failed = null;

    for (;;) {
      const { rows: page, error } = await fetchPage(table, offset, PAGE);
      if (error) {
        failed = error;
        break;
      }
      const got = page || [];
      rows.push(...got);
      // A short page means the end. A full page means there may be more, so
      // ask again - this is the loop that stops a 1001-row table from being
      // backed up as 1000 rows with no hint that anything is missing.
      if (got.length < PAGE) break;
      offset += PAGE;
    }

    if (failed) {
      errors.push({ table, error: String(failed) });
      // Recorded IN the file, so restoring from it cannot mistake a failed
      // table for an empty one.
      data[table] = { __backup_error__: String(failed) };
      counts[table] = null;
    } else {
      data[table] = rows;
      counts[table] = rows.length;
    }
  }

  const payload = {
    generated_at: now.toISOString(),
    source: 'drbikesydney.com.au / Supabase',
    complete: errors.length === 0,
    table_counts: counts,
    errors,
    data,
  };

  const json = JSON.stringify(payload, null, 0);
  return {
    json,
    bytes: Buffer.byteLength(json, 'utf8'),
    counts,
    errors,
    complete: errors.length === 0,
    totalRows: Object.values(counts).reduce((a, b) => a + (b || 0), 0),
  };
}

// The subject line has to be readable at a glance from a phone, because that
// is where it will be seen. A backup that failed must not look like one that
// worked.
export function backupSubject({ complete, totalRows, errors, date = new Date() }) {
  const day = date.toISOString().slice(0, 10);
  if (!complete)
    return `[!] Dr. Bike backup INCOMPLETO ${day} - ${errors.length} tabla(s) fallaron`;
  return `Dr. Bike backup ${day} - ${totalRows} filas`;
}

export function backupBody({ counts, errors, bytes, complete }) {
  const kb = Math.round(bytes / 1024);
  const rows = Object.entries(counts)
    .map(([t, n]) => `  ${t}: ${n === null ? 'FALLO' : n}`)
    .join('\n');
  const head = complete
    ? 'Copia completa de la base, adjunta en JSON.'
    : `ATENCION: ${errors.length} tabla(s) no se pudieron leer. Esta copia NO esta completa.\n` +
      errors.map((e) => `  - ${e.table}: ${e.error}`).join('\n');
  return (
    `${head}\n\n` +
    `Tamano: ${kb} KB\n\n` +
    `Filas por tabla:\n${rows}\n\n` +
    `Guardala. Es la unica copia que existe fuera de Supabase: el plan Free no\n` +
    `incluye backups. Para restaurar, el JSON se lee tabla por tabla.\n`
  );
}
