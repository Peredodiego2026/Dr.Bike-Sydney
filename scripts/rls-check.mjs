#!/usr/bin/env node
// scripts/rls-check.mjs — probe production the way an attacker would.
//
// Run:  npm run rls:check
//
// This is NOT part of `npm run check`. It talks to the live database over the
// network, so a slow Supabase would turn into a red CI run on a branch that
// changed nothing. The offline half of this guard - that the SQL scripts in
// the repo still carry their REVOKEs - lives in
// tests/unit/public-views-locked.test.js and does run in CI.
//
// WHY IT EXISTS
//
// On 2026-08-30 an audit found that `public_booking_tracking` was listable by
// anyone with the anon key, that each row carried its own `tracking_token`,
// and that /api/auth?role=public-track trades that token for the client's
// street address and 4-digit arrival PIN. Separately, `public_reviews`
// accepted an anonymous PATCH (204), which writes through to `bookings` with
// RLS never consulted. Both came from the same root cause: a Postgres view
// runs with its OWNER's privileges, and Supabase grants anon every privilege
// on new objects in `public`.
//
// Neither of those is visible from the code. `api/auth.js` was correct; the
// database was contradicting it. Only a live probe catches that class of bug,
// so here is the live probe.
//
// SAFETY
//
// This script never DELETEs and never creates a row.
//   - Reads are plain SELECTs.
//   - The view write test is a PATCH filtered on the nil UUID, which matches
//     no row that has ever existed. It exists to read the privilege error,
//     not to change data.
//   - The table write test POSTs an empty body. Every table below has NOT NULL
//     columns without defaults, so an empty body cannot produce a valid row
//     even if RLS were to allow it.

import fs from 'node:fs';

const src = fs.readFileSync(new URL('../js/supabase.js', import.meta.url), 'utf8');
const URL_RE = /const SUPABASE_URL\s*=\s*'([^']+)'/;
const KEY_RE = /const SUPABASE_KEY\s*=\s*\n?\s*'([^']+)'/;
const url = src.match(URL_RE)?.[1];
const key = src.match(KEY_RE)?.[1];
if (!url || !key) {
  console.error('rls-check: could not read SUPABASE_URL/SUPABASE_KEY from js/supabase.js');
  process.exit(1);
}

const NIL = '00000000-0000-0000-0000-000000000000';
const h = { apikey: key, Authorization: `Bearer ${key}` };
const failures = [];
const notes = [];

// Tables that must return zero rows to a visitor with no session. Anything
// here going non-empty means client data is on the open internet.
const MUST_BE_EMPTY = [
  'bookings',
  'profiles',
  'bikes',
  'job_messages',
  'mechanic_locations',
  'notifications',
  'discount_codes',
  'availability',
  'parts_inventory',
  'van_inventory',
  'newsletter_subscribers',
  'gift_cards',
  'expenses',
  'stripe_events',
  'escalation_contacts',
  'bike_service_history',
  // The three the 2026-08-23 audit found had no migration script and had never
  // been checked (docs/RUNBOOK-SQL.md 3.1). Diego ran the RLS query by hand that
  // day and all three came back correct - but a one-off answer stops being true
  // the moment somebody adds a policy, and nothing was watching them. They hold
  // client names, emails, phones, complaint text and the URLs of claim photos
  // and invoices.
  //
  // claims and notification_log have RLS ON and ZERO policies, which is not an
  // oversight: in Postgres, RLS with no policy denies everyone, and the
  // service_role key bypasses RLS by design. Both tables are only ever touched
  // by the server. DO NOT 'fix' them by adding policies - that would open
  // access which is currently, correctly, denied.
  'waitlist',
  'claims',
  'notification_log',
  // Found by tests/unit/rls-check-coverage.test.js on its first run: a fifth
  // table nobody had classified. It has a migration script, unlike the three
  // above, which is why the 2026-08-23 audit did not list it - and it was
  // outside this guard all the same. js/app.js writes it from the browser, but
  // only for signed-in clients (Diego, 2026-07-28), so an anonymous write being
  // refused is the correct behaviour and not a broken flow.
  'checkout_attempts',
  // The view whose whole row set was the leak. After
  // scripts/lock-public-views.sql this 401s, which also counts as closed.
  'public_booking_tracking',
];

// Read-only by design: the price list, the coverage map, the testimonials.
// These are meant to be public, so rows here are correct, not a finding.
const PUBLIC_BY_DESIGN = ['services', 'van_zones', 'callout_zones', 'public_reviews'];

// Views bypass RLS. For them the GRANT is the only gate, and a missing GRANT
// raises a privilege error regardless of how many rows the filter matches -
// which makes this test decisive in a way it would not be on a base table.
const VIEWS = ['public_reviews', 'public_booking_tracking'];

const DENIED = /permission denied|violates row-level security/i;

async function get(path) {
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: h });
  const text = await r.text();
  return { status: r.status, text };
}

for (const t of MUST_BE_EMPTY) {
  const { status, text } = await get(`${t}?select=*&limit=1`);
  if (status === 404) {
    notes.push(`${t}: does not exist (skipped)`);
    continue;
  }
  // A hard denial is the strongest possible pass.
  if (status === 401 || status === 403) continue;
  if (status !== 200) {
    failures.push(`${t}: unexpected status ${status} - ${text.slice(0, 120)}`);
    continue;
  }
  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    failures.push(`${t}: unreadable response - ${text.slice(0, 120)}`);
    continue;
  }
  if (Array.isArray(rows) && rows.length > 0) {
    failures.push(
      `${t}: LEAKING - returned ${rows.length} row(s) to an anonymous caller. ` +
        `Columns: ${Object.keys(rows[0]).join(', ')}`
    );
  }
}

// The specific chain that was exploitable: the tracking view publishing the
// credential. Worth naming on its own so the failure message says what it is
// rather than just "a view returned rows".
{
  const { status, text } = await get('public_booking_tracking?select=tracking_token&limit=1');
  if (status === 200 && text.includes('tracking_token')) {
    failures.push(
      'public_booking_tracking: hands out tracking_token anonymously. That token ' +
        'buys address + arrival_pin from /api/auth?role=public-track. Run ' +
        'scripts/lock-public-views.sql.'
    );
  }
}

for (const v of VIEWS) {
  const r = await fetch(`${url}/rest/v1/${v}?id=eq.${NIL}`, {
    method: 'PATCH',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: NIL }),
  });
  const text = await r.text();
  if (r.status === 404) {
    notes.push(`${v}: does not exist (skipped)`);
    continue;
  }
  // A view built on a join is not auto-updatable: Postgres refuses the write
  // regardless of grants, so it is closed by construction. Matched on the
  // message, not the status - PostgREST answers this one with a 500, and an
  // earlier version of this check keyed on 400 and reported it as a finding.
  if (/not automatically updatable/i.test(text)) continue;
  if (DENIED.test(text)) continue;
  failures.push(
    `${v}: accepts anonymous writes (status ${r.status}). A view runs as its ` +
      `owner, so this writes through to the base table with RLS never checked.`
  );
}

for (const t of MUST_BE_EMPTY) {
  if (t.startsWith('public_')) continue; // views are covered above
  const r = await fetch(`${url}/rest/v1/${t}`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const text = await r.text();
  if (r.status === 404) continue;
  if (DENIED.test(text)) continue;
  failures.push(`${t}: anonymous INSERT was not refused (status ${r.status}) - ${text.slice(0, 120)}`);
}

for (const t of PUBLIC_BY_DESIGN) {
  const { status } = await get(`${t}?select=*&limit=1`);
  if (status !== 200) {
    failures.push(
      `${t}: is public by design but answered ${status}. The price list, the ` +
        `coverage map or the testimonials are broken for real visitors.`
    );
  }
}

for (const n of notes) console.log(`  note: ${n}`);

if (failures.length) {
  console.error(`\nrls-check: ${failures.length} problem(s) against ${url}\n`);
  for (const f of failures) console.error(`  x ${f}`);
  console.error('');
  process.exit(1);
}

console.log(`\nrls-check: clean. ${MUST_BE_EMPTY.length} tables/views closed to anonymous`);
console.log(`           reads and writes, ${PUBLIC_BY_DESIGN.length} public ones still serving.`);
