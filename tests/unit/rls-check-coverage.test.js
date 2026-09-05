// The 2026-08-23 audit found four tables - callout_zones, waitlist, claims and
// notification_log - used from the code with no migration script and no entry
// in the runbook. Nobody had ever checked whether they had RLS.
//
// Diego ran the query by hand that day and all four came back correct
// (docs/RUNBOOK-SQL.md 3.1). But a one-off answer stops being true the moment
// somebody adds a policy, and `scripts/rls-check.mjs` - the guard that probes
// production with the anon key - only covered callout_zones. The three holding
// client data were outside it for thirteen days.
//
// The assertion that matters here is not "those three are in the list". It is
// the one that would have caught the original problem: EVERY table the browser
// touches has to be classified as either closed or public-by-design. A table
// added tomorrow and never classified is exactly how these four happened.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(join(root, 'scripts', 'rls-check.mjs'), 'utf8');

// Read as source, the same way payment-amount-trust.test.js does: the script
// is an executable that opens the network at module scope, so importing it
// would run the whole probe against production from inside a unit test.
function listOf(name) {
  const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  if (!m) throw new Error(`${name} not found in scripts/rls-check.mjs`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

const MUST_BE_EMPTY = listOf('MUST_BE_EMPTY');
const PUBLIC_BY_DESIGN = listOf('PUBLIC_BY_DESIGN');
const classified = new Set([...MUST_BE_EMPTY, ...PUBLIC_BY_DESIGN]);

describe('the lists themselves', () => {
  it('are not empty - a regex that stopped matching would classify nothing', () => {
    expect(MUST_BE_EMPTY.length).toBeGreaterThan(10);
    expect(PUBLIC_BY_DESIGN.length).toBeGreaterThan(0);
  });

  it('do not overlap - a table cannot be both closed and public', () => {
    const both = MUST_BE_EMPTY.filter((t) => PUBLIC_BY_DESIGN.includes(t));
    expect(both, `classified twice: ${both.join(', ')}`).toEqual([]);
  });
});

describe('every table the browser touches is classified', () => {
  // This is the assertion that would have caught the 2026-08-23 finding before
  // an auditor did. A table nobody classified is a table nobody checked.
  const browserFiles = readdirSync(join(root, 'js'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => join(root, 'js', f));

  const used = new Map(); // table -> files
  for (const f of browserFiles) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/\.from\(\s*'([a-z_][a-z0-9_]*)'\s*\)/g)) {
      const t = m[1];
      if (!used.has(t)) used.set(t, []);
      const list = used.get(t);
      const short = f.slice(root.length + 1);
      if (!list.includes(short)) list.push(short);
    }
  }

  it('finds tables at all, or this test proves nothing', () => {
    expect(used.size).toBeGreaterThan(5);
  });

  it('leaves none unclassified', () => {
    // Storage buckets go through sb.storage.from(), which matches the same
    // pattern and is not a table.
    const buckets = new Set(['job-photos', 'claim-evidence']);
    const missing = [...used.keys()].filter((t) => !classified.has(t) && !buckets.has(t));
    expect(
      missing,
      missing.map((t) => `${t} (used in ${used.get(t).join(', ')})`).join('; ')
    ).toEqual([]);
  });
});

describe('the three the audit found', () => {
  for (const t of ['waitlist', 'claims', 'notification_log']) {
    it(`${t} is probed as closed`, () => {
      expect(MUST_BE_EMPTY).toContain(t);
    });
  }

  it('warns the next reader NOT to give claims and notification_log policies', () => {
    // RLS ON with zero policies denies everyone, and the service_role key
    // bypasses RLS. Both tables are server-only. "Fixing" the zero by adding a
    // policy would OPEN access that is currently, correctly, denied - and it
    // looks like a fix.
    expect(src).toMatch(/DO NOT 'fix' them by adding policies/);
  });
});

describe('what the guard does not do, stated so nobody assumes otherwise', () => {
  it('does not run in CI - it hits production, so it is a manual command', () => {
    const ci = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ci).not.toMatch(/rls:check/);
    // If this ever fails, someone wired it into CI. That is a real decision
    // with a real cost - Supabase being down would then block unrelated PRs -
    // so it should be deliberate. Update this test and say so in the runbook.
  });

  it('is still reachable as its own command', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts['rls:check']).toBe('node scripts/rls-check.mjs');
  });
});
