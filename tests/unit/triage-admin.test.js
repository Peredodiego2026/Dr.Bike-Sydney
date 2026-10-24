// The booking triage, as the owner meets it: the booking detail in Admin
// (js/admin.js, renderBookingDetail -> renderTriageBlock).
//
// Method: the same one tests/unit/bas-and-booking-actions.test.js uses.
// js/admin.js is a classic script that cannot be imported, so the functions are
// cut out of it and RUN in a vm. What is tested is the code that ships, not a
// copy of it. Stubbed: the page (document), the helpers the detail calls that
// have nothing to do with the triage, and nothing else - esc() and the
// catalogue's labelFor() are the real ones.
//
// Why each group exists:
//   - an answer shown by its id ("brand") tells the owner nothing; it has to be
//     the question he can read ("What brand are the brakes?")
//   - MOST bookings have no triage: every one made before this shipped, every
//     one made before the SQL was run, and every customer who skipped it all
//     (it is all optional). That has to read as deliberate, not as a broken
//     panel, and null / undefined / {} all have to be the same thing on screen
//   - the server stores the answers WITHOUT escaping, on purpose; the notes and
//     symptom fields are text the customer typed. Rendering is where it is
//     escaped, so this is where it is tested
//   - the detail opens before the labels have loaded and shows ids instead
//   - the colours come from tokens: css/admin.css redefines tokens inside
//     [data-theme='dark'], and a hex there cannot be overridden by dark mode
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { labelFor } from '../../js/triage-questions.js';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8').split('\r\n').join('\n');
const admin = read('js/admin.js');
const adminCss = read('css/admin.css');

// A top-level function: from its head to the closing brace at column 0.
function sliceFn(head) {
  const start = admin.indexOf(head);
  expect(start, `${head} is gone from js/admin.js`).toBeGreaterThan(-1);
  const end = admin.indexOf('\n}\n', start);
  expect(end, `${head} has no closing brace at column 0`).toBeGreaterThan(start);
  return admin.slice(start, end + 2);
}

// The triage renderer, with the real esc() and the real catalogue label lookup.
// `triageLabelFor` is the name js/admin.js gives labelFor once its module loads.
function loadRenderer(extra = {}) {
  const ctx = vm.createContext({ triageLabelFor: labelFor, ...extra });
  vm.runInContext(sliceFn('function esc(') + '\n' + sliceFn('function renderTriageBlock('), ctx);
  return ctx;
}
const renderTriageBlock = (triage) => loadRenderer().renderTriageBlock(triage);

describe('renderTriageBlock - what the customer answered', () => {
  it('shows each answer under its question, not under its id', () => {
    const html = renderTriageBlock({ symptom: 'Squealing', brand: 'Shimano' });
    expect(html).toContain('Shimano');
    expect(html).toContain('Squealing');
    expect(html).toContain(labelFor('symptom'));
    expect(html).toContain(labelFor('brand'));
    // "symptom" is not a word of its question, so the id would be a leak.
    expect(html).not.toContain('symptom');
    // "brand" IS a word of its question ("What brand are the brakes?"), so take
    // the question out first: whatever "brand" is left is the id showing.
    expect(html.split(labelFor('brand')).join('')).not.toContain('brand');
  });

  it('shows every answer it was given, in the order they came', () => {
    const html = renderTriageBlock({ speeds: '11 speeds', tyre_size: '29 x 2.1', notes: 'Rides daily' });
    const at = ['11 speeds', '29 x 2.1', 'Rides daily'].map((v) => html.indexOf(v));
    expect(at.every((i) => i > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('keeps an answer of 0 and leaves out the ones that say nothing', () => {
    const html = renderTriageBlock({ speeds: 0, brand: '', symptom: null, notes: '   ' });
    expect(html).toContain(labelFor('speeds'));
    expect(html).not.toContain(labelFor('brand'));
    expect(html).not.toContain(labelFor('symptom'));
    expect(html).not.toContain(labelFor('notes'));
  });

  it('shows an id the catalogue no longer knows as it is, instead of throwing', () => {
    // An old booking, or a question that was later removed: labelFor returns
    // the id itself. Better the raw id than a booking whose detail will not open.
    const html = renderTriageBlock({ retired_question: 'Yes' });
    expect(html).toContain('retired_question');
    expect(html).toContain('Yes');
  });

  it('does not print [object Object] for a value that is not text', () => {
    const html = renderTriageBlock({ notes: { nested: 'x' }, symptom: ['a'], speeds: 12 });
    expect(html).not.toContain('[object');
    expect(html).toContain('12');
  });
});

describe('renderTriageBlock - a booking with no triage', () => {
  // Review Focus 4. Every one of these is the same thing on screen.
  const empties = {
    null: null,
    undefined: undefined,
    '{}': {},
    'an array': [],
    'a string': 'Shimano',
    'a number': 42,
    'only blank answers': { brand: '', notes: '  ', symptom: null },
  };

  for (const [name, value] of Object.entries(empties)) {
    it(`says "Sin triage" for ${name}`, () => {
      const html = renderTriageBlock(value);
      expect(html).toContain('Sin triage');
      expect(html).not.toMatch(/undefined|null|NaN|\[object/);
    });
  }

  it('renders the same empty state for all of them, and it is a block of its own', () => {
    const [first, ...rest] = Object.values(empties).map(renderTriageBlock);
    for (const html of rest) expect(html).toBe(first);
    // Not an empty string: a heading and a line of its own is what makes the
    // gap read as "nothing to report" rather than "something failed to load".
    expect(first).toContain('triage-block');
    expect(first).toContain('triage-empty');
    expect(first.length).toBeGreaterThan(60);
  });

  it('is not the empty state when there is even one answer', () => {
    expect(renderTriageBlock({ notes: 'Rides daily' })).not.toContain('Sin triage');
  });
});

describe('renderTriageBlock - escaping', () => {
  it('escapes what the customer typed', () => {
    const html = renderTriageBlock({ notes: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('escapes quotes and ampersands in an answer', () => {
    const html = renderTriageBlock({ symptom: `"><script>alert('x')</script> & more` });
    expect(html).not.toContain('<script');
    expect(html).toContain('&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; more');
  });

  it('escapes a key too: for an unknown id the label IS the id', () => {
    const html = renderTriageBlock({ '<b onmouseover=alert(1)>': 'x' });
    expect(html).not.toContain('<b ');
    expect(html).toContain('&lt;b onmouseover');
  });

  it('does not let an answer reach an attribute', () => {
    // Nothing the customer typed may land inside a tag's own attributes.
    const html = renderTriageBlock({ notes: 'x" onclick="alert(1)' });
    expect(html).not.toMatch(/<[^>]*onclick=/);
  });
});

describe('the booking detail shows the triage', () => {
  // The real renderBookingDetail, against a page that only records what is
  // written into it.
  function detail(booking) {
    const els = {};
    const el = (id) => (els[id] ||= { innerHTML: '', textContent: '', style: {} });
    const ctx = loadRenderer({
      document: { getElementById: el },
      BKD_ST_CLASS: {},
      anBookingRevenue: () => 0,
      vanColor: () => 'red',
    });
    vm.runInContext(sliceFn('function renderBookingDetail('), ctx);
    ctx.renderBookingDetail(booking);
    return els['bkd-body'].innerHTML;
  }

  const base = {
    id: 'b1',
    status: 'confirmed',
    client_name: 'Sam',
    service_name: 'Brake Pad Install',
    scheduled_date: '2026-11-03',
    scheduled_time: '09:30',
    van_number: 1,
  };

  it('puts what the customer answered next to the rest of the booking', () => {
    const html = detail({ ...base, triage: { brand: 'Shimano', symptom: 'Squealing' } });
    expect(html).toContain(labelFor('brand'));
    expect(html).toContain('Shimano');
    expect(html).toContain('Squealing');
    // ...and the rest of the detail is still there.
    expect(html).toContain('Brake Pad Install');
    expect(html).not.toContain('Sin triage');
  });

  it('says there is no triage when the booking has none', () => {
    for (const triage of [null, undefined, {}]) {
      const html = detail({ ...base, triage });
      expect(html).toContain('Sin triage');
      expect(html).toContain('Brake Pad Install');
    }
  });

  it('says so too when the triage column does not exist yet (the SQL has not been run)', () => {
    const html = detail({ ...base }); // no `triage` key at all
    expect(html).toContain('Sin triage');
  });

  it('does not let a typed answer break out of the detail', () => {
    const html = detail({ ...base, triage: { notes: '<img src=x onerror=alert(1)>' } });
    expect(html).not.toContain('<img');
  });
});

describe('the labels are loaded before the detail opens', () => {
  it('imports the catalogue from the module that owns it', async () => {
    const m = admin.match(/import\(\s*'(\.\/triage-questions\.js)'\s*\)/);
    expect(m, "js/admin.js does not import('./triage-questions.js')").not.toBeNull();
    // Resolved the way the browser does: relative to js/admin.js.
    const url = new URL(m[1], new URL('js/admin.js', root));
    expect(fs.existsSync(url)).toBe(true);
    const mod = await import(url.href);
    expect(typeof mod.labelFor).toBe('function');
    expect(admin).toMatch(/triageLabelFor\s*=\s*\w+\.labelFor/);
  });

  it('a failed load is logged and the detail still opens', () => {
    const from = admin.indexOf("import('./triage-questions.js')");
    expect(from, "js/admin.js does not import('./triage-questions.js')").toBeGreaterThan(-1);
    expect(admin.slice(from, from + 400)).toMatch(/\.catch\(\(?\w+\)?\s*=>\s*console\.error\(/);
  });

  it('openBookingDetail waits for them before it draws', async () => {
    let release;
    const ready = new Promise((r) => (release = r));
    const drawn = [];
    const modal = { style: {} };
    const ctx = vm.createContext({
      allBookings: [{ id: 'b1' }],
      triageLabelsReady: ready,
      renderBookingDetail: (b) => drawn.push(b.id),
      document: { getElementById: () => modal },
    });
    vm.runInContext(sliceFn('async function openBookingDetail('), ctx);

    const opening = ctx.openBookingDetail('b1');
    await Promise.resolve();
    await Promise.resolve();
    expect(drawn, 'drew the detail before the labels had loaded').toEqual([]);

    release();
    await opening;
    expect(drawn).toEqual(['b1']);
    expect(modal.style.display).toBe('flex');
  });
});

describe('the triage block takes its colours from tokens', () => {
  const at = adminCss.indexOf('.triage-');

  it('has styles of its own in css/admin.css', () => {
    expect(at, 'no .triage- rule in css/admin.css').toBeGreaterThan(-1);
  });

  it('writes no hex from the first .triage- rule to the end of the file', () => {
    expect(adminCss.slice(at)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('colours text, background and border with var(--token) only', () => {
    // Every .triage- rule, wherever it sits in the file.
    const rules = [...adminCss.matchAll(/([^{}]*\.triage-[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, selector, body] of rules) {
      expect(body, selector.trim()).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(body, selector.trim()).not.toMatch(/\brgba?\(/);
      for (const m of body.matchAll(/(?:^|[;\s])(color|background(?:-color)?)\s*:\s*([^;]+)/g)) {
        if (/^(transparent|inherit|currentColor|none)$/i.test(m[2].trim())) continue;
        expect(m[2], `${selector.trim()} { ${m[1]} }`).toMatch(/var\(--/);
      }
    }
  });
});
