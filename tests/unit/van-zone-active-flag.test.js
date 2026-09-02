// tests/unit/van-zone-active-flag.test.js
//
// Diego wanted Van 2's suburbs cleared so every job goes to Van 1. Turning a
// zone off in Admin sets `active = false` - it does not delete the row, which
// is deliberate (his standing rule: never delete rows).
//
// Every reader honoured that flag except the one that mattered. Zone Manager,
// the Van 1/Van 2 cards and the availability count all filter on
// `active = true`; matchVanZone(), which decides WHICH MECHANIC GETS THE JOB,
// read the table unfiltered. So a zone switched off in Admin disappeared from
// the screen and kept dispatching, and the SMS still went to the mechanic
// Diego thought he had taken off that suburb.
//
// Not a hypothetical: it is the difference between his request working and
// looking like it worked.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const auth = fs.readFileSync(new URL('../../api/auth.js', import.meta.url), 'utf8');

// The body of matchVanZone, which is the function under test here.
function matchVanZoneSource() {
  const start = auth.indexOf('async function matchVanZone(');
  expect(start, 'matchVanZone is gone from api/auth.js').toBeGreaterThan(-1);
  const end = auth.indexOf('\n}', start);
  return auth.slice(start, end);
}

describe('dispatch honours the zone on/off switch', () => {
  it('matchVanZone reads only active zones', () => {
    expect(
      matchVanZoneSource(),
      'a zone switched off in Admin would still be dispatched to'
    ).toMatch(/\.eq\(\s*'active'\s*,\s*true\s*\)/);
  });

  it('still excludes van 0, the settings sentinel row', () => {
    expect(matchVanZoneSource()).toMatch(/\.neq\(\s*'van_number'\s*,\s*0\s*\)/);
  });

  // The admin screens this has to agree with. If one of these ever stops
  // filtering, the two views of "which zones are on" diverge again.
  it('the admin screens filter on the same flag', () => {
    const admin = fs.readFileSync(new URL('../../js/admin.js', import.meta.url), 'utf8');
    const reads = [...admin.matchAll(/from\('van_zones'\)\s*\.select\([^)]*\)([^;]*)/g)].map(
      (m) => m[1]
    );
    expect(reads.length, 'no van_zones reads found in js/admin.js').toBeGreaterThan(0);
    const filtered = reads.filter((tail) => /'active'/.test(tail));
    expect(filtered.length, 'no admin van_zones read filters on active').toBeGreaterThan(0);
  });
});
