// tests/unit/admin-phone-in-names.test.js
//
// A booking taken over the phone (Admin > New booking) has no user account:
// its name lives in bookings.client_name, and profiles is null. Two screens
// read only profiles.full_name, so every one of those bookings showed up as
// the literal word "Client":
//
//   - the month calendar, which is the screen Diego reads his day off;
//   - the printed/exported financial report, which can end up with an
//     accountant.
//
// Neither is a rendering quirk: those are the bookings Diego enters by hand for
// the jobs that come in by WhatsApp or phone, which is the flow he was told to
// use for work done outside the app. The same file already resolves the name
// correctly in the bookings table and the dashboard, so this was an
// inconsistency, not a decision.
//
// Found by rendering the admin against a seeded fake backend - reading the file
// would not have shown it, because each line looks reasonable on its own.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const adminJs = fs.readFileSync(new URL('../../js/admin.js', import.meta.url), 'utf8');

// Every place that resolves a person's display name and can fall back to the
// generic word. A booking name must consider client_name; a PROFILE row has no
// client_name and is allowed to use full_name alone.
const fallbacks = [...adminJs.matchAll(/^.*\|\|\s*'Client'.*$/gm)].map((m) => m[0].trim());

describe('nothing shows a phone-in booking as "Client"', () => {
  it('found the places that fall back to the generic name', () => {
    expect(fallbacks.length).toBeGreaterThan(0);
  });

  for (const line of fallbacks) {
    // A line reading from `p.` or `c.` is iterating profiles/clients, where
    // there is no client_name to read - those are exempt by shape, not by
    // being listed here, so a new one cannot sneak past.
    const readsProfileRow = /\b[pc]\.(full_name|email)/.test(line);
    if (readsProfileRow) continue;

    it(`considers client_name: ${line.slice(0, 60)}...`, () => {
      expect(line, 'reads profiles.full_name without client_name').toContain('client_name');
    });
  }
});

describe('every admin page has a real title', () => {
  // `titles[page] || page` prints the raw key when an entry is missing, which
  // is how Analytics shipped with a lowercase "analytics" heading while every
  // other page had a proper name.
  const block = adminJs.slice(adminJs.indexOf('const titles = {'));
  const titles = block.slice(0, block.indexOf('};'));
  const keys = [...titles.matchAll(/^\s*'?([a-z-]+)'?:/gm)].map((m) => m[1]);

  it('parsed the map', () => {
    expect(keys.length).toBeGreaterThan(10);
  });

  // Every page the sidebar can reach must have one.
  // Sin las lineas de comentario: una de ellas cita go('page',...) como
  // ejemplo, y el test lo tomaba por una pagina de verdad.
  const code = adminJs
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
  const navPages = [...code.matchAll(/go\('([a-z-]+)'/g)].map((m) => m[1]);
  const missing = [...new Set(navPages)].filter((p) => !keys.includes(p));

  it('no page falls back to its raw key', () => {
    expect(missing, `these pages have no title: ${missing.join(', ')}`).toEqual([]);
  });

  it('analytics specifically, which was the one missing', () => {
    expect(keys).toContain('analytics');
  });
});
