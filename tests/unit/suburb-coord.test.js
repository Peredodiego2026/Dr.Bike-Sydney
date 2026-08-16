// tests/unit/suburb-coord.test.js — suburbCoord() used to walk SUBURB_COORDS in
// key order and take the first name found anywhere in the address. `sydney` is
// the first key, so every address ending in the city name resolved to the CBD.
// Confirmed against production data on 11-Aug-2026: Thais's booking in Pyrmont
// was drawn on George St, which is what made Diego doubt the whole Analytics
// page. renderHeatmap() and optimiseRoute() both read this function.
//
// js/admin.js is a classic script (admin.html loads it with a plain <script
// src>), so it cannot be imported. These tests lift the table and the matcher
// out of the source and run them - the same read-the-source approach as
// tests/unit/mechanic-outbox-completion.test.js.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const src = readFileSync(join(root, 'js/admin.js'), 'utf8');

const grab = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error(`${what} not found in js/admin.js`);
  return m[0];
};

const build = new Function(`
  ${grab(/const SUBURB_COORDS = \{[\s\S]*?\n\};/, 'SUBURB_COORDS')}
  ${grab(/const CITY_WIDE = new Set\(\[[^\]]*\]\);/, 'CITY_WIDE')}
  ${grab(/const SUBURB_MATCHERS = Object\.keys\(SUBURB_COORDS\)[\s\S]*?\n\s*\}\)\);/, 'SUBURB_MATCHERS')}
  ${grab(/function suburbFromText\(text\) \{[\s\S]*?\n\}/, 'suburbFromText')}
  ${grab(/function suburbCoord\(b\) \{[\s\S]*?\n\}/, 'suburbCoord')}
  return { suburbCoord, SUBURB_COORDS };
`);

const { suburbCoord, SUBURB_COORDS } = build();
const at = (name) => SUBURB_COORDS[name];

describe('suburbCoord - the suburb field wins when it is a known name', () => {
  it('uses the field and never looks at the address', () => {
    expect(suburbCoord({ suburb: 'Pyrmont', address: '1 George St, Sydney' })).toEqual(at('pyrmont'));
  });

  it('is case and whitespace tolerant', () => {
    expect(suburbCoord({ suburb: '  BONDI BEACH ' })).toEqual(at('bondi beach'));
  });
});

describe('suburbCoord - guessing from the address (the CBD bug)', () => {
  // The three cases Diego reported, verbatim.
  it('"...Pyrmont, Sydney" is Pyrmont, not the CBD', () => {
    const b = { suburb: '', address: 'The Palladium 102 Miller Street, Pyrmont, Sydney' };
    expect(suburbCoord(b)).toEqual(at('pyrmont'));
    expect(suburbCoord(b)).not.toEqual(at('sydney'));
  });

  it('"...Bondi Beach, Sydney" is Bondi Beach, not the CBD', () => {
    expect(suburbCoord({ suburb: '', address: '5 Hall St, Bondi Beach, Sydney' })).toEqual(
      at('bondi beach')
    );
  });

  it('"...Pyrmont" with no city on the end still works', () => {
    expect(suburbCoord({ suburb: '', address: '102 Miller Street, Pyrmont' })).toEqual(
      at('pyrmont')
    );
  });
});

describe('suburbCoord - the most specific name wins', () => {
  it('North Sydney is not Sydney', () => {
    expect(suburbCoord({ address: '100 Miller St, North Sydney NSW 2060' })).toEqual(
      at('north sydney')
    );
  });

  it('Bondi Junction is not Bondi', () => {
    expect(suburbCoord({ address: '500 Oxford St, Bondi Junction' })).toEqual(
      at('bondi junction')
    );
  });

  it('a plain city address still lands in the CBD', () => {
    expect(suburbCoord({ address: '1 Martin Place, Sydney NSW 2000' })).toEqual(at('sydney'));
  });
});

describe('suburbCoord - a street named after a suburb is not the suburb', () => {
  // An address reads street -> suburb -> city, so the name nearest the end is
  // the destination. Ranking by name length instead put these jobs on the
  // wrong side of Sydney: Parramatta Rd runs for 23 km through the inner west
  // and none of it is in Parramatta.
  it('"Parramatta Rd, Ashfield" is Ashfield', () => {
    expect(suburbCoord({ address: '123 Parramatta Rd, Ashfield NSW 2131' })).toEqual(
      at('ashfield')
    );
  });

  it('"Parramatta Road, Leichhardt" is Leichhardt', () => {
    expect(suburbCoord({ address: '45 Parramatta Road, Leichhardt' })).toEqual(at('leichhardt'));
  });

  it('"St Peters Lane, Newtown" is Newtown', () => {
    expect(suburbCoord({ address: '5 St Peters Lane, Newtown' })).toEqual(at('newtown'));
  });

  it('"Sutherland St, Paddington" is Paddington, not the Shire', () => {
    expect(suburbCoord({ address: '10 Sutherland St, Paddington' })).toEqual(at('paddington'));
  });

  it('"Glebe Point Rd, Glebe" still resolves when street and suburb agree', () => {
    expect(suburbCoord({ address: '200 Glebe Point Rd, Glebe' })).toEqual(at('glebe'));
  });
});

describe('suburbCoord - a suburb name inside another word is not a match', () => {
  it('does not read "cbd" out of the middle of a word', () => {
    expect(suburbCoord({ address: '12 Cbdoil Lane, Nowhere' })).toBeNull();
  });

  it('does not read "manly" out of "Manlywood"', () => {
    expect(suburbCoord({ address: '3 Manlywood Cres, Nowhere' })).toBeNull();
  });
});

describe('suburbCoord - a suburb field that is not a table key', () => {
  it('"Sydney CBD" resolves instead of falling through as empty', () => {
    expect(suburbCoord({ suburb: 'Sydney CBD', address: '' })).toEqual(at('cbd'));
  });

  it('"Bondi Beach NSW 2026" resolves', () => {
    expect(suburbCoord({ suburb: 'Bondi Beach NSW 2026', address: '' })).toEqual(
      at('bondi beach')
    );
  });
});

describe('suburbCoord - nothing to go on', () => {
  it('returns null rather than guessing the CBD', () => {
    // renderHeatmap() counts these separately as "could not place"; guessing
    // here is what produced a fake cluster in the city.
    expect(suburbCoord({ suburb: '', address: '' })).toBeNull();
    expect(suburbCoord({})).toBeNull();
    expect(suburbCoord({ address: '742 Evergreen Terrace, Springfield' })).toBeNull();
  });
});
