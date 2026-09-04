// Audit finding 5 (2026-09-04): migrations in this project are run BY HAND.
//
// There is no pipeline, and there cannot be one: the scripts run with database
// owner rights, and neither the app nor Claude has those credentials
// (docs/RUNBOOK-SQL.md section 1). So the real risk is not "the pipeline
// failed" - it is that a migration gets added to the repo and nothing tells
// Diego it exists.
//
// docs/RUNBOOK-SQL.md section 3 holds one query that asks the database which
// migrations are missing. It is only as good as its own list: a script added
// to scripts/ without a matching row in that query makes the query answer "all
// OK" while a migration is in fact missing. That is not hypothetical - it had
// already happened when this check was written, with the file added earlier
// the same day (add-mechanic-session-version.sql).
//
// This check cannot run the migrations. What it can do is make it impossible
// to add one that the runbook does not ask about.
import { readFileSync, readdirSync } from 'node:fs';

// Files under scripts/ that are NOT schema migrations. Every entry needs a
// reason, because an exclusion is how a real migration goes missing.
const NOT_A_MIGRATION = {
  'backfill-referral-codes-2026-07-20.sql':
    'one-off data backfill, not a schema change - the runbook verifies it with its own count query instead',
  'check-mechanic-pin-columns.sql': 'a diagnostic SELECT, it changes nothing',
  'restore-thais-booking-2026-08-05.sql':
    'a one-off repair of a single booking from 2026-08-05, not something a fresh database needs',
};

const RUNBOOK = 'docs/RUNBOOK-SQL.md';
const runbook = readFileSync(RUNBOOK, 'utf8');

// The section-3 query, not the whole document: being mentioned in the prose
// is not the same as being asked about. Anchored on the CTE's own header so a
// reworded heading does not silently widen the search to the entire file.
const QUERY_START = 'chk(n, script, que_agrega, ok)';
const startAt = runbook.indexOf(QUERY_START);
if (startAt < 0) {
  console.error(
    `x migrations-check: could not find the section-3 query in ${RUNBOOK}.\n` +
      `  Looked for: ${QUERY_START}\n` +
      `  If the runbook was restructured, update this anchor - do not delete the check.`
  );
  process.exit(1);
}
const endAt = runbook.indexOf('```', startAt);
const query = runbook.slice(startAt, endAt < 0 ? runbook.length : endAt);

const scripts = readdirSync('scripts')
  .filter((f) => f.endsWith('.sql'))
  .sort();

const missing = scripts.filter((f) => !(f in NOT_A_MIGRATION) && !query.includes(f));
// An exclusion for a file that no longer exists is dead weight that hides the
// next real one.
const staleExclusions = Object.keys(NOT_A_MIGRATION).filter((f) => !scripts.includes(f));

if (missing.length) {
  console.error(
    `\nx migrations-check: ${missing.length} migration(s) exist but the runbook's query never asks about them.\n`
  );
  for (const f of missing) console.error(`  scripts/${f}`);
  console.error(
    `\n  Diego runs these by hand. A migration the query does not check is one\n` +
      `  he is never told to run - the code ships expecting a column that is not\n` +
      `  there. Add a row to the section-3 query in ${RUNBOOK} asserting the\n` +
      `  column/table/index the script creates, or, if it is not a schema\n` +
      `  migration, add it to NOT_A_MIGRATION in this file with the reason.\n`
  );
  process.exit(1);
}

if (staleExclusions.length) {
  console.error(`\nx migrations-check: NOT_A_MIGRATION names files that no longer exist:\n`);
  for (const f of staleExclusions) console.error(`  scripts/${f}`);
  console.error(`\n  Remove them so the list keeps meaning something.\n`);
  process.exit(1);
}

console.log(
  `migrations-check: OK - ${scripts.length - Object.keys(NOT_A_MIGRATION).length} migrations, ` +
    `all asked about by the runbook's query (${Object.keys(NOT_A_MIGRATION).length} files excluded on purpose).`
);
