// tests/unit/public-views-locked.test.js
//
// 2026-08-30. A pre-launch audit probed production with nothing but the anon
// key that ships in js/supabase.js, and found the client address book open:
//
//   GET /rest/v1/public_booking_tracking?select=*
//     -> 200, every booking, each row carrying its own `tracking_token`.
//   POST /api/auth?role=public-track {tracking_token: <that>}
//     -> 200, full street address, 4-digit arrival_pin, live mechanic GPS.
//
//   PATCH /rest/v1/public_reviews?id=eq.<uuid>
//     -> 204. anon held UPDATE on the view, and a view runs with its OWNER's
//        privileges, so the write lands on `bookings` with RLS never consulted.
//
// The root cause is one sentence: a Postgres view is owner-privileged, and
// Supabase's default grants hand anon every privilege on new objects in
// `public`. Both views were created to expose a filtered read, and silently
// came with a write door attached.
//
// api/auth.js was never wrong. Its comment correctly says the token is an
// unguessable UUID. It stopped being a secret one layer below the code, which
// is exactly why this class of bug needs a guard that reads the SQL and a
// probe that reads the live database (scripts/rls-check.mjs) rather than a
// guard that reads the JS.
//
// This file is the offline half: it fails if the REVOKEs are ever dropped out
// of the migrations, so re-running a migration can never reopen the hole.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const tracking = read('scripts/add-tracking-token.sql');
const reviews = read('scripts/create-public-reviews-view.sql');
const lock = read('scripts/lock-public-views.sql');
const probe = read('scripts/rls-check.mjs');

// Whitespace and line breaks vary across these files; compare on intent.
const flat = (s) => s.toLowerCase().replace(/\s+/g, ' ');

describe('public_booking_tracking is not reachable by the public', () => {
  it('the migration revokes it', () => {
    expect(flat(tracking)).toContain(
      'revoke all on public.public_booking_tracking from anon, authenticated'
    );
  });

  // Belt and braces: even a future accidental GRANT would then be filtered by
  // bookings' own RLS instead of the view owner's rights.
  it('and sets security_invoker so RLS applies if a grant ever comes back', () => {
    expect(flat(tracking)).toContain(
      'alter view public.public_booking_tracking set (security_invoker = on)'
    );
  });

  it('the standalone remediation script says the same thing', () => {
    expect(flat(lock)).toContain(
      'revoke all on public.public_booking_tracking from anon, authenticated'
    );
  });
});

describe('public_reviews keeps its read and loses its write', () => {
  const wanted = ['insert', 'update', 'delete'];

  it('the migration revokes every write privilege', () => {
    const f = flat(reviews);
    const revoke = f.slice(f.indexOf('revoke'), f.indexOf('grant select'));
    for (const p of wanted) expect(revoke).toContain(p);
  });

  it('and still grants the SELECT the landing depends on', () => {
    expect(flat(reviews)).toContain('grant select on public.public_reviews to anon, authenticated');
  });

  // Turning security_invoker on here would apply bookings' RLS, an anonymous
  // visitor would match zero rows, and the testimonials section would go
  // permanently empty. Reading as the owner is the point of this view, so the
  // revoke above is the only protection it can have - which is why an
  // "improvement" that adds security_invoker has to fail this test loudly.
  it('deliberately does NOT set security_invoker, and says why', () => {
    expect(flat(reviews)).not.toContain('alter view public.public_reviews set (security_invoker');
    expect(flat(reviews)).toContain('testimonials section would go permanently empty');
  });

  it('the standalone remediation script revokes the same three', () => {
    const f = flat(lock);
    const revoke = f.slice(f.indexOf('revoke insert'), f.indexOf('grant select'));
    for (const p of wanted) expect(revoke).toContain(p);
  });
});

describe('the next view cannot be born with the same hole', () => {
  it('default privileges in public drop write for anon', () => {
    expect(flat(lock)).toContain('alter default privileges in schema public');
    expect(flat(lock)).toContain('revoke insert, update, delete');
  });
});

describe('the live probe covers the exact chain that was exploitable', () => {
  it('checks that the tracking view stops publishing the credential', () => {
    expect(probe).toContain('public_booking_tracking?select=tracking_token');
  });

  it('treats an accepted anonymous write to a view as a failure', () => {
    expect(probe).toMatch(/accepts anonymous writes/);
  });

  it('exits non-zero when it finds something', () => {
    expect(probe).toContain('process.exit(1)');
  });

  // The tracking view is a join, so Postgres refuses writes to it whatever the
  // grants say. The first version of the probe keyed that off a 400 and
  // PostgREST answers with a 500, so it reported a fourth, non-existent
  // finding. Matching the message instead is what makes the probe trustworthy.
  it('does not misreport a non-updatable view as writable', () => {
    expect(probe).toContain('not automatically updatable');
    expect(probe).not.toMatch(/status === 400 && \/not automatically updatable/);
  });

  // A probe that hits the network must not be wired into `npm run check`, or a
  // slow Supabase turns into a red CI run on a branch that changed nothing.
  it('is not part of npm run check', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts.check).not.toContain('rls-check');
    expect(pkg.scripts['rls:check']).toBe('node scripts/rls-check.mjs');
  });
});
