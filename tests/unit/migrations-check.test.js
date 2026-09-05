// Audit finding 5 (2026-09-04): migrations here are run BY HAND, and nothing
// connected the scripts in the repo to the query that asks the database which
// ones are missing.
//
// They cannot be automated - the scripts need database-owner rights that
// neither the app nor Claude has, and should not have (docs/RUNBOOK-SQL.md
// section 1). So the failure mode is not "the pipeline broke": it is a
// migration landing in scripts/ that the runbook's query never asks about,
// which makes that query answer "all OK" while a column is genuinely missing.
//
// That is not hypothetical. It had already happened when this was written,
// with a file added earlier the same day.
//
// The check itself is run here as a process, so the test asserts what CI
// asserts - the exit code - rather than a re-implementation of its logic.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function runCheck() {
  try {
    execFileSync('node', ['scripts/migrations-check.mjs'], { cwd: root, stdio: 'pipe' });
    return { code: 0, out: '' };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stderr || e.stdout || '') };
  }
}

describe('the repo as it stands', () => {
  it('passes', () => {
    expect(runCheck().code).toBe(0);
  });
});

describe('a migration the runbook never asks about', () => {
  const planted = join(root, 'scripts', 'zz-planted-by-a-test.sql');

  // Same reason as abn-single-source.test.js: this spawns the checker three
  // times, and process spawns get slow when the whole suite is running.
  it('fails the check, and names the file', () => {
    writeFileSync(planted, '-- planted by migrations-check.test.js\nselect 1;\n');
    try {
      const r = runCheck();
      expect(r.code).toBe(1);
      expect(r.out).toContain('zz-planted-by-a-test.sql');
    } finally {
      // Always, even if the expectation above threw: a leftover file here
      // would fail `npm run check` for everyone.
      unlinkSync(planted);
    }
    expect(runCheck().code).toBe(0);
  }, 20000);
});

describe('the exclusion list', () => {
  const src = readFileSync(join(root, 'scripts', 'migrations-check.mjs'), 'utf8');

  it('gives a reason for every excluded file', () => {
    const block = src.slice(src.indexOf('const NOT_A_MIGRATION'), src.indexOf('const RUNBOOK'));
    const names = [...block.matchAll(/'([^']+\.sql)':/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      // What follows the key has to be a real sentence. An exclusion without
      // one is how a genuine migration goes missing behind a shrug.
      const after = block.slice(block.indexOf(`'${n}':`) + n.length + 3);
      const quoted = after.match(/^\s*'([^']*)'/);
      expect(quoted, `${n} has no quoted reason`).toBeTruthy();
      expect(quoted[1].length, `${n}'s reason is too short to be one`).toBeGreaterThan(20);
    }
  });

  it('only excludes files that actually exist', () => {
    const block = src.slice(src.indexOf('const NOT_A_MIGRATION'), src.indexOf('const RUNBOOK'));
    const names = [...block.matchAll(/'([^']+\.sql)':/g)].map((m) => m[1]);
    const onDisk = readdirSync(join(root, 'scripts'));
    for (const n of names) expect(onDisk, `${n} is excluded but is not there`).toContain(n);
  });
});

describe('what it reads', () => {
  const src = readFileSync(join(root, 'scripts', 'migrations-check.mjs'), 'utf8');

  it('looks inside the section-3 QUERY, not the whole runbook', () => {
    // Being named in the prose is not the same as being asked about. The
    // 2026-09-03 session found two migrations sitting in the document while
    // the query ignored them for a month.
    expect(src).toContain("const QUERY_START = 'chk(n, script, que_agrega, ok)'");
    expect(src).toMatch(/runbook\.slice\(startAt/);
  });

  it('fails loudly if that anchor ever disappears, instead of passing on nothing', () => {
    expect(src).toMatch(/if \(startAt < 0\) \{[\s\S]*?process\.exit\(1\)/);
  });
});

describe('the migration this check was born from', () => {
  const runbook = readFileSync(join(root, 'docs', 'RUNBOOK-SQL.md'), 'utf8');

  it('is now in the query', () => {
    expect(runbook).toContain('add-mechanic-session-version.sql');
    expect(runbook).toMatch(/c='session_version'/);
  });
});

describe('npm run check', () => {
  it('runs it, or none of the above protects anything', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts.check).toContain('scripts/migrations-check.mjs');
  });
});
