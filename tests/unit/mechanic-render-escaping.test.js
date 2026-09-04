// Audit finding (2026-09-04): stored XSS in the mechanic's app.
//
// js/mechanic.js:884 interpolated `j.service_name` into innerHTML unescaped
// while escaping `esc(j.suburb)` on the very same line, and the calendar did
// the same with `j.suburb || j.address`. Both fields come back from the
// bookings table, and api/stripe-webhook.js used to copy a browser-supplied
// string into service_name (see webhook-unknown-service.test.js).
//
// These tests EXECUTE the real template literals lifted out of the file, and
// assert on the HTML string that would be handed to innerHTML. Asserting that
// the source "contains esc(" would pass on a line that escapes the wrong
// field - which is exactly the bug that shipped.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(join(root, 'js', 'mechanic.js'), 'utf8');

// The real esc(), taken from the file rather than reimplemented here: a test
// with its own copy would keep passing if the app's copy stopped escaping.
const escSrc = src.match(/function esc\(str\) \{[\s\S]*?\n\}/);
if (!escSrc) throw new Error('esc() not found in js/mechanic.js');
const esc = new Function(`${escSrc[0]}; return esc;`)();

const XSS = '<img src=x onerror=alert(1)>';

// Runs one `<target> = `...`;` assignment from the file and returns the string
// it produced. Executing it (rather than pattern-matching it) means a match
// that accidentally landed inside a comment cannot pass silently.
function renderAssignment(pattern, vars) {
  const m = src.match(pattern);
  if (!m) throw new Error(`template not found: ${pattern}`);
  const names = Object.keys(vars);
  const body = `const d = {}; let html = ''; ${m[0]} return d.innerHTML ?? html;`;
  return new Function('esc', ...names, body)(esc, ...names.map((n) => vars[n]));
}

// The honest test of "did this escape?" is whether the injected value added any
// markup at all. Asserting `not.toContain('onerror=')` looked right and was
// useless: an escaped payload still reads `&lt;img src=x onerror=alert(1)&gt;`
// as inert text. Counting '<' against a harmless render is exact - a value that
// escapes correctly contributes zero new tag openings, whatever it contains.
const tagOpenings = (html) => (html.match(/</g) || []).length;

function assertInert(render, field, safe) {
  const dirty = render(XSS);
  const clean = render(safe);
  expect(
    tagOpenings(dirty),
    `${field} added markup to innerHTML - it is not being escaped`
  ).toBe(tagOpenings(clean));
  // and it is still shown to the mechanic rather than dropped
  expect(dirty).toContain('&lt;');
  expect(dirty).toContain('&gt;');
}

describe('new-booking toast (alert2)', () => {
  const render = (j) => renderAssignment(/d\.innerHTML = `<b>[\s\S]*?`;/, { j });

  it('escapes service_name', () => {
    assertInert((v) => render({ service_name: v, suburb: 'Bondi', service_price: 45 }), 'service_name', 'Tune-up');
  });

  it('escapes suburb', () => {
    assertInert((v) => render({ service_name: 'Tune-up', suburb: v, service_price: 45 }), 'suburb', 'Bondi');
  });

  it('escapes service_price', () => {
    assertInert((v) => render({ service_name: 'Tune-up', suburb: 'Bondi', service_price: v }), 'price', 45);
  });
});

describe('week calendar row', () => {
  const render = (j) =>
    renderAssignment(/html \+= `<div style="display:flex;gap:10px;margin-bottom:8px[\s\S]*?`;/, {
      j,
      color: 'var(--gray)',
    });

  it('escapes the address it falls back to when there is no suburb', () => {
    assertInert((v) => render({ client: 'A', address: v, status: 'pending', price: 45 }), 'address', 'Bondi');
  });

  it('escapes the suburb', () => {
    assertInert((v) => render({ client: 'A', suburb: v, status: 'pending', price: 45 }), 'suburb', 'Bondi');
  });

  it('escapes the status', () => {
    assertInert((v) => render({ client: 'A', suburb: 'Bondi', status: v, price: 45 }), 'status', 'pending');
  });

  it('survives a booking with no status at all', () => {
    expect(() => render({ client: 'A', suburb: 'Bondi', price: 45 })).not.toThrow();
  });
});
