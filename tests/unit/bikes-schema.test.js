// tests/unit/bikes-schema.test.js
//
// The bikes table has `name` and `type`. scripts/create-bikes-table.sql said
// `nickname` and `bike_type`, and js/admin.js read those names - so every bike
// on a client's card in the admin rendered as the literal word "undefined",
// with no type beside it.
//
// Verified against the live database on 2026-09-02 with the anon key:
//
//   select=id,name,brand,model,color,year,type  ->  200 []
//   select=id,nickname,bike_type                ->  42703 "bikes.nickname does not exist"
//
// The SQL file was the dangerous half: recreating the table from it would have
// renamed the columns out from under js/app.js, which selects AND inserts
// `name` and `type`. My Bikes would have stopped working entirely - reads and
// writes both - and the file that broke it is the one someone would trust.
//
// This pins the two halves to each other, so neither can drift alone.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const sql = read('scripts/create-bikes-table.sql');

// Column names the CREATE TABLE declares, ignoring comment lines.
const declared = [
  ...sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .matchAll(/^\s{2}([a-z_]+)\s+(?:UUID|TEXT|INTEGER|TIMESTAMPTZ|BOOLEAN|NUMERIC)/gim),
].map((m) => m[1]);

describe('the SQL file describes the table the code actually uses', () => {
  it('parsed the CREATE TABLE', () => {
    expect(declared.length).toBeGreaterThan(5);
  });

  it('declares name and type, which is what production has', () => {
    expect(declared).toContain('name');
    expect(declared).toContain('type');
  });

  // The two that were wrong. Named explicitly because "the file is correct now"
  // is not the point - the point is that these exact names must not come back.
  it('does not declare nickname or bike_type', () => {
    expect(declared).not.toContain('nickname');
    expect(declared).not.toContain('bike_type');
  });

  // Every column js/app.js asks Supabase for has to exist in the schema, or
  // PostgREST rejects the WHOLE query and the screen shows an error.
  it('every column the app selects is declared', () => {
    const app = read('js/app.js');
    const sel = app.match(/from\('bikes'\)\s*\n?\s*\.select\('([^']+)'\)/);
    expect(sel, 'could not find the bikes select in js/app.js').not.toBeNull();
    const asked = sel[1].split(',').map((c) => c.trim());
    for (const col of asked) {
      expect(declared, `js/app.js selects "${col}", which the schema does not declare`).toContain(
        col
      );
    }
  });
});

describe('nothing renders a bike column that does not exist', () => {
  // js/admin.js used select('*') and then read b.nickname / b.bike_type, so the
  // query succeeded and the card printed "undefined" - the failure mode a
  // missing column does NOT produce, which is why it survived.
  const GONE = ['nickname', 'bike_type'];

  for (const file of ['js/admin.js', 'js/app.js']) {
    it(`${file} does not read a renamed column`, () => {
      const code = read(file)
        .split('\n')
        .filter((l) => {
          const t = l.trim();
          return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('<!--');
        })
        .join('\n');
      for (const col of GONE) {
        // As a property read (b.nickname), not as an element id ("bike-nickname",
        // which is markup and perfectly fine).
        expect(code, `${file} reads .${col}`).not.toMatch(new RegExp('\\.' + col + '\\b'));
      }
    });
  }
});
