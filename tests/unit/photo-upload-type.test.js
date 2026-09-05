// Every browser upload in this app lands in the PUBLIC `job-photos` bucket, and
// until 2026-09-05 all three chose the stored filename from the name the user's
// own file had - `file.name.split('.').pop()` - while the chat one also handed
// Supabase `contentType: file.type`. Both of those come from the browser.
//
// `accept="image/*"` on the input looks like a check and is not: it filters the
// file-picker dialog. A dragged file, or one line in devtools, walks past it.
//
// So a mechanic - or whoever guessed the four-digit PIN - could store
// `page.html` served as `text/html` on the business's own Supabase domain.
//
// This is defence in depth and is described that way on purpose: it was NOT
// verified whether that bucket serves HTML inline or forces a download. Storing
// only what you claim is a photo is the right rule either way, and the claim
// does not need to be true for the rule to be worth having.
//
// The helper is duplicated in both files because mechanic.js and admin.js are
// classic scripts with no import - the same reason `esc()` is duplicated. The
// last describe() block is what keeps the two copies from drifting.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const mech = readFileSync(join(root, 'js', 'mechanic.js'), 'utf8');
const admin = readFileSync(join(root, 'js', 'admin.js'), 'utf8');

// Comments stripped before any source match. The first version of the
// "no longer passes file.type" assertion failed on the helper's OWN comment,
// which names the thing it removed - the trap this repo has been caught by
// three times. A newline-excluding class rather than `.*$`, because these files
// are CRLF and `.` does not match a line terminator.
const strip = (src) =>
  src.replace(/\/\/[^\r\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const mechCode = strip(mech);
const adminCode = strip(admin);

// Lifted from the file and executed, not reimplemented: a copy in the test
// would keep passing after the real one changed.
function loadHelper(src, whichFile) {
  const m = src.match(/function safeImageUpload\(file\) \{[\s\S]*?\n\}/);
  if (!m) throw new Error(`safeImageUpload not found in ${whichFile}`);
  return new Function(`${m[0]}; return safeImageUpload;`)();
}
const safeImageUpload = loadHelper(mech, 'js/mechanic.js');

const file = (name, type) => ({ name, type });

describe('what a photo upload accepts', () => {
  it('takes an ordinary phone photo', () => {
    const r = safeImageUpload(file('IMG_4821.JPG', 'image/jpeg'));
    expect(r.ok).toBe(true);
    expect(r.ext).toBe('jpg');
    expect(r.contentType).toBe('image/jpeg');
  });

  it('takes a PNG, a WEBP and an iPhone HEIC', () => {
    expect(safeImageUpload(file('a.png', 'image/png')).ok).toBe(true);
    expect(safeImageUpload(file('a.webp', 'image/webp')).ok).toBe(true);
    expect(safeImageUpload(file('a.heic', 'image/heic')).ok).toBe(true);
  });

  it('falls back to the name when the browser sends no type at all', () => {
    // Some Android pickers hand over an empty string for HEIC. Refusing those
    // would break a real upload from a real phone.
    const r = safeImageUpload(file('photo.heic', ''));
    expect(r.ok).toBe(true);
    expect(r.contentType).toBe('image/heic');
  });
});

describe('what it refuses', () => {
  it('refuses an HTML file, which is the point', () => {
    const r = safeImageUpload(file('page.html', 'text/html'));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/photos/i);
  });

  it('refuses a script, a PDF and an unknown type', () => {
    for (const f of [
      file('x.js', 'text/javascript'),
      file('x.svg', 'image/svg+xml'), // SVG is a script container, not a photo
      file('x.pdf', 'application/pdf'),
      file('x.bin', 'application/octet-stream'),
    ]) {
      expect(safeImageUpload(f).ok, `${f.name} was accepted`).toBe(false);
    }
  });

  it('refuses HTML dressed up with a photo name', () => {
    // The declared type is checked first precisely so this cannot pass.
    expect(safeImageUpload(file('photo.jpg', 'text/html')).ok).toBe(false);
  });

  it('refuses nothing at all', () => {
    expect(safeImageUpload(null).ok).toBe(false);
    expect(safeImageUpload(undefined).ok).toBe(false);
  });
});

describe('the extension that gets stored', () => {
  it('is chosen from the list, never taken from the file name', () => {
    // The stored path used to end in whatever came after the last dot. Here a
    // JPEG is stored as .jpeg no matter how its file was named.
    const r = safeImageUpload(file('holiday.photo.from.phone', 'image/jpeg'));
    expect(r.ok).toBe(true);
    expect(r.ext).toBe('jpg');
  });

  it('cannot carry a slash out of its folder', () => {
    // `"a.b/../../x".split('.').pop()` is "/x" - it used to go straight into
    // the storage path.
    const r = safeImageUpload(file('a.b/../../x', 'image/png'));
    expect(r.ext).toBe('png');
    expect(r.ext).not.toMatch(/[/\\.]/);
  });
});

describe('the three upload sites use it', () => {
  const sites = [
    ['js/mechanic.js', mechCode, 'jobs/${bookingId}'],
    ['js/mechanic.js', mechCode, 'chat/${mechChatBookingId}'],
    ['js/admin.js', adminCode, "profiles/${contactId || 'new'}"],
  ];

  it('none of them still reads the extension off the file name', () => {
    for (const [name, src] of sites) {
      expect(src, `${name} still splits file.name`).not.toMatch(
        /const ext = file\.name\.split\('\.'\)\.pop\(\)/
      );
    }
  });

  it('none of them still passes the browser-declared content type', () => {
    expect(mechCode).not.toMatch(/contentType: file\.type/);
    expect(adminCode).not.toMatch(/contentType: file\.type/);
  });

  it('every storage path is built from kind.ext', () => {
    for (const [name, src, prefix] of sites) {
      const i = src.indexOf(prefix);
      expect(i, `${prefix} is gone from ${name}`).toBeGreaterThan(-1);
      // The path literal ends at the closing backtick.
      const line = src.slice(i, src.indexOf('`', i));
      expect(line, `${prefix} does not use kind.ext`).toContain('${kind.ext}');
    }
  });

  it('every upload pins the content type to kind.contentType', () => {
    expect((mechCode.match(/contentType: kind\.contentType/g) || []).length).toBe(2);
    expect((adminCode.match(/contentType: kind\.contentType/g) || []).length).toBe(1);
  });
});

describe('the two copies of the helper', () => {
  // mechanic.js and admin.js are classic scripts - no import between them, the
  // same reason esc() is duplicated. Two copies that drift are how a fix ends
  // up half-applied, so they are compared byte for byte here.
  const grab = (src) => src.match(/function safeImageUpload\(file\) \{[\s\S]*?\n\}/)[0];

  it('are identical', () => {
    expect(grab(admin).replace(/\r/g, '')).toBe(grab(mech).replace(/\r/g, ''));
  });

  it(`and the copy in admin.js behaves the same, run rather than compared`, () => {
    const adminHelper = loadHelper(admin, 'js/admin.js');
    expect(adminHelper(file('page.html', 'text/html')).ok).toBe(false);
    expect(adminHelper(file('a.png', 'image/png')).contentType).toBe('image/png');
  });
});
