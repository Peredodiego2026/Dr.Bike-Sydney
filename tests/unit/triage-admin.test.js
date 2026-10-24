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
//   - the order on screen: jsonb hands the keys back by length and then
//     alphabetically, so the answer that decides the part can land under the
//     free text. The required ones go first (sortAnswerIds, in the catalogue)
//   - the colours come from tokens: css/admin.css redefines tokens inside
//     [data-theme='dark'], and a hex there cannot be overridden by dark mode
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { labelFor, sortAnswerIds } from '../../js/triage-questions.js';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8').split('\r\n').join('\n');
const admin = read('js/admin.js');
const adminCss = read('css/admin.css');

// The photo the customer took while booking. The row stores a REFERENCE, never
// a URL, and the detail signs it for an hour every time it opens
// (api/_job-photos.js, api/auth.js handlePhotoSign).
const PHOTO_REF = 'job-photos-private/jobs/b1/triage_1700000000.jpg';
const PHOTO_URL =
  'https://db.supabase.co/storage/v1/object/sign/job-photos-private/jobs/b1/triage_1700000000.jpg?token=jwt';

// A top-level function: from its head to the closing brace at column 0.
function sliceFn(head) {
  const start = admin.indexOf(head);
  expect(start, `${head} is gone from js/admin.js`).toBeGreaterThan(-1);
  const end = admin.indexOf('\n}\n', start);
  expect(end, `${head} has no closing brace at column 0`).toBeGreaterThan(start);
  return admin.slice(start, end + 2);
}

// The triage renderer, with the real esc() and the real catalogue lookups.
// `triageLabelFor` and `triageSortIds` are the names js/admin.js gives
// labelFor and sortAnswerIds once their module loads.
function loadRenderer(extra = {}) {
  const ctx = vm.createContext({
    triageLabelFor: labelFor,
    triageSortIds: sortAnswerIds,
    ...extra,
  });
  vm.runInContext(sliceFn('function esc(') + '\n' + sliceFn('function renderTriageBlock('), ctx);
  return ctx;
}
// `photo` is what openBookingDetail hands in: null when the booking has no
// photo at all, { url } when it has one - with a null url when signing failed.
const renderTriageBlock = (triage, photo) => loadRenderer().renderTriageBlock(triage, photo);

// The module-load block as it ships: the two identity fallbacks and the
// import() that replaces them, from `let triageLabelFor` to the blank line
// that ends the statement.
function moduleLoadBlock() {
  const start = admin.indexOf('let triageLabelFor');
  expect(start, 'js/admin.js no longer declares the triage fallbacks').toBeGreaterThan(-1);
  const end = admin.indexOf('\n\n', start);
  expect(end, 'the triage load block runs into the rest of the file').toBeGreaterThan(start);
  const block = admin.slice(start, end);
  expect(block, 'the triage load block no longer loads its module').toContain(
    './triage-questions.js'
  );
  return block;
}

// Runs `block` (the module load) and then the five real functions the detail
// needs, all in one context, and opens the detail of a booking whose answers
// are `triage`. Returns the page it wrote into and what was logged.
//
// `extra.booking` adds fields to the booking (triage_photo_ref); anything else
// in `extra` overrides a sandbox global - `fetch` and `sb`, which is how the
// signing round trip is driven without a network.
async function openDetailWith(block, triage, extra = {}) {
  const { booking = {}, ...sandboxExtra } = extra;
  const els = {};
  const errors = [];
  const warnings = [];
  const sandbox = {
    console: {
      error: (...a) => errors.push(a.join(' ')),
      warn: (...a) => warnings.push(a.join(' ')),
    },
    document: {
      getElementById: (id) => (els[id] ||= { innerHTML: '', textContent: '', style: {} }),
    },
    allBookings: [
      {
        id: 'b1',
        status: 'confirmed',
        client_name: 'Sam',
        service_name: 'Brake Pad Install',
        scheduled_date: '2026-11-03',
        scheduled_time: '09:30',
        van_number: 1,
        triage,
        ...booking,
      },
    ],
    BKD_ST_CLASS: {},
    anBookingRevenue: () => 0,
    vanColor: () => 'red',
    showToast: () => {},
    sb: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
    fetch: async () => ({ ok: true, json: async () => ({ urls: [PHOTO_URL] }) }),
    // The browser globals the signing uses to bound itself. Wrapped rather
    // than captured, so a test that turns on fake timers AFTER the sandbox was
    // built still gets the fake ones.
    setTimeout: (...a) => setTimeout(...a),
    clearTimeout: (...a) => clearTimeout(...a),
    AbortSignal,
    ...sandboxExtra,
  };
  vm.createContext(sandbox);
  // `let`/`const` at the top of a vm script land in the context's lexical
  // scope, not on the sandbox, so the slices below see them but the test
  // cannot read them back by name - it reads the page instead.
  vm.runInContext(block, sandbox);
  vm.runInContext(
    [
      sliceFn('function esc('),
      sliceFn('function renderTriageBlock('),
      sliceFn('function renderBookingDetail('),
      sliceFn('async function signTriagePhoto('),
      sliceFn('async function openBookingDetail('),
    ].join('\n'),
    sandbox
  );
  await vm.runInContext("openBookingDetail('b1')", sandbox);
  return { els, errors, warnings };
}

// The module load with the catalogue already in hand, so a test about the
// photo is not also a test about a failed import: the real import() rejects
// inside a vm without --experimental-vm-modules, which is its own test above.
const labelsLoaded = () =>
  moduleLoadBlock().replace(
    "import('./triage-questions.js')",
    'Promise.resolve({ labelFor, sortAnswerIds })'
  );

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

  it('shows the required answers before the optional ones, not in jsonb order', () => {
    // Brakes: `brand` and `brake_type` decide the pads, the fluid and the
    // bleed kit; `brake_model` and `notes` are the ones the customer may skip.
    // jsonb would hand these back by key length, which buries `brand`.
    const html = renderTriageBlock({
      notes: 'Rides daily',
      brake_model: 'SLX',
      brake_type: 'Hydraulic',
      brand: 'Shimano',
    });
    const at = ['brand', 'brake_type', 'notes', 'brake_model'].map((id) =>
      html.indexOf(labelFor(id))
    );
    expect(
      at.every((i) => i > -1),
      'an answer went missing'
    ).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('shows an id the catalogue does not know last, and still shows it', () => {
    // An old booking, or a question that was removed: it cannot be ranked
    // against the catalogue, so it goes to the end rather than disappearing.
    const html = renderTriageBlock({
      retired_question: 'Yes',
      notes: 'Rides daily',
      brand: 'Shimano',
    });
    const at = [labelFor('brand'), labelFor('notes'), 'retired_question'].map((v) =>
      html.indexOf(v)
    );
    expect(
      at.every((i) => i > -1),
      'an answer went missing'
    ).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).toContain('Yes');
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
    it(`says "No triage" for ${name}`, () => {
      const html = renderTriageBlock(value);
      expect(html).toContain('No triage');
      expect(html).not.toMatch(/undefined|null|NaN|\[object/);
    });
  }

  it('renders the same empty state for all of them, and it is a block of its own', () => {
    // Called one by one, not `.map(renderTriageBlock)`: map would hand the
    // index in as the photo and every one after the first would differ.
    const [first, ...rest] = Object.values(empties).map((v) => renderTriageBlock(v));
    for (const html of rest) expect(html).toBe(first);
    // Not an empty string: a heading and a line of its own is what makes the
    // gap read as "nothing to report" rather than "something failed to load".
    expect(first).toContain('triage-block');
    expect(first).toContain('triage-empty');
    expect(first.length).toBeGreaterThan(60);
  });

  it('is not the empty state when there is even one answer', () => {
    expect(renderTriageBlock({ notes: 'Rides daily' })).not.toContain('No triage');
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
    expect(html).not.toContain('No triage');
  });

  it('sits right under the service, above the date and the money', () => {
    // The modal scrolls. If the point is to decide in five seconds, the triage
    // cannot be the last item, under the callout fee, the discount and the
    // total - it is the detail of the service it sits under.
    const html = detail({ ...base, triage: { brand: 'Shimano' }, callout_fee: 25 });
    const at = (s) => {
      const i = html.indexOf(s);
      expect(i, `${s} is gone from the detail`).toBeGreaterThan(-1);
      return i;
    };
    expect(at('Brake Pad Install')).toBeLessThan(at('triage-block'));
    expect(at('triage-block')).toBeLessThan(at('>Date<'));
    expect(at('triage-block')).toBeLessThan(at('>Callout fee<'));
    expect(at('triage-block')).toBeLessThan(at('>Total<'));
  });

  it('says there is no triage when the booking has none', () => {
    for (const triage of [null, undefined, {}]) {
      const html = detail({ ...base, triage });
      expect(html).toContain('No triage');
      expect(html).toContain('Brake Pad Install');
    }
  });

  it('says so too when the triage column does not exist yet (the SQL has not been run)', () => {
    const html = detail({ ...base }); // no `triage` key at all
    expect(html).toContain('No triage');
  });

  it('does not let a typed answer break out of the detail', () => {
    const html = detail({ ...base, triage: { notes: '<img src=x onerror=alert(1)>' } });
    expect(html).not.toContain('<img');
  });
});

describe('renderTriageBlock - the photo the customer sent', () => {
  // The whole reason Diego asked for the photo: "me tienen que llegar a algun
  // lugar en orden con la orden del cliente". Saved and invisible is nothing.
  it('shows the photo next to the answers, as a link that opens it', () => {
    const html = renderTriageBlock({ brand: 'Shimano' }, { url: PHOTO_URL });
    expect(html).toContain(labelFor('brand'));
    expect(html).toContain('Shimano');
    expect(html).toContain('<img');
    expect(html).toContain(PHOTO_URL);
    expect(html).toMatch(/target="_blank"/);
    expect(html).toMatch(/rel="noopener"/);
    // No inline handlers anywhere in this project.
    expect(html).not.toMatch(/on[a-z]+\s*=\s*"/);
  });

  it('shows the photo and says the questions were skipped, instead of "No triage"', () => {
    // The case the code got wrong: the triage is all optional, so a customer
    // can answer nothing and send the photo - which is exactly when the photo
    // is worth most. That booking used to read "No triage" and the photo was
    // invisible.
    for (const triage of [null, undefined, {}, { notes: '  ' }]) {
      const html = renderTriageBlock(triage, { url: PHOTO_URL });
      expect(html, JSON.stringify(triage)).toContain('<img');
      expect(html, JSON.stringify(triage)).toContain(PHOTO_URL);
      expect(html, JSON.stringify(triage)).not.toContain('No triage');
      expect(html, JSON.stringify(triage)).not.toContain('triage-empty');
      expect(html.toLowerCase(), JSON.stringify(triage)).toContain('skipped');
    }
  });

  it('announces nothing at all when there is no photo', () => {
    // No empty frame, no "no photo", no gap. What does not exist is not
    // announced - so not even the word, which is what a stray class or a
    // placeholder would leak.
    for (const photo of [null, undefined]) {
      const answered = renderTriageBlock({ brand: 'Shimano' }, photo);
      expect(answered).toContain('Shimano');
      expect(answered).not.toContain('<img');
      expect(answered.toLowerCase()).not.toContain('photo');

      const empty = renderTriageBlock({}, photo);
      expect(empty).toContain('No triage');
      expect(empty).not.toContain('<img');
      expect(empty.toLowerCase()).not.toContain('photo');
    }
  });

  it('is words and never a broken image when the signing came back null', () => {
    // Bucket deleted, network down, a reference that belongs to another
    // booking: the server answers null. signAdminChatPhotos already decided
    // this ("Photo unavailable") and this follows it.
    const html = renderTriageBlock({ brand: 'Shimano' }, { url: null });
    expect(html).toContain('Photo unavailable');
    expect(html).toContain('Shimano');
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/\bsrc\s*=/);
    expect(html).not.toMatch(/\bhref\s*=/);
  });

  it('is words too when there are no answers either', () => {
    const html = renderTriageBlock({}, { url: null });
    expect(html).toContain('Photo unavailable');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('No triage');
    expect(html).not.toMatch(/undefined|null|NaN|\[object/);
  });

  it('escapes the signed URL: it is data from the server, not markup', () => {
    const html = renderTriageBlock(
      { brand: 'Shimano' },
      { url: `https://x.co/p.jpg?a=1&b=2"><script>alert('x')</script>` }
    );
    expect(html).not.toContain('<script');
    // The quote that would have closed href="..." and opened an attribute of
    // its own. ('"><' on its own is in the markup: `rel="noopener"><img`.)
    expect(html).not.toContain('b=2"');
    expect(html).toContain('&amp;b=2');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
  });
});

describe('the booking detail signs the photo when it opens', () => {
  it('asks /api/auth for the one reference, with the admin session', async () => {
    const calls = [];
    const { els, errors, warnings } = await openDetailWith(
      labelsLoaded(),
      { brand: 'Shimano' },
      {
        labelFor,
        sortAnswerIds,
        booking: { triage_photo_ref: PHOTO_REF },
        fetch: async (url, init) => {
          calls.push({ url, body: JSON.parse(init.body) });
          return { ok: true, json: async () => ({ urls: [PHOTO_URL] }) };
        },
      }
    );

    // One reference, so one call and no batching: not a copy of the chat's
    // loop of twenty.
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe('/api/auth');
    expect(calls[0].body).toEqual({
      role: 'photo-sign',
      booking_id: 'b1',
      refs: [PHOTO_REF],
      access_token: 'tok',
    });

    const html = els['bkd-body'].innerHTML;
    expect(html).toContain(PHOTO_URL);
    expect(html).toContain(labelFor('brand'));
    expect(html).toContain('Shimano');
    expect(els['booking-detail-modal'].style.display).toBe('flex');
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('shows the photo of a booking whose customer answered nothing', async () => {
    const { els } = await openDetailWith(
      labelsLoaded(),
      {},
      { labelFor, sortAnswerIds, booking: { triage_photo_ref: PHOTO_REF } }
    );
    const html = els['bkd-body'].innerHTML;
    expect(html).toContain(PHOTO_URL);
    expect(html).not.toContain('No triage');
    // ...and the rest of the booking is still there.
    expect(html).toContain('Brake Pad Install');
  });

  it('asks for nothing when the booking has no photo', async () => {
    let called = 0;
    const { els } = await openDetailWith(
      labelsLoaded(),
      { brand: 'Shimano' },
      {
        labelFor,
        sortAnswerIds,
        fetch: async () => {
          called++;
          return { ok: true, json: async () => ({ urls: [PHOTO_URL] }) };
        },
      }
    );
    expect(called, 'signed a photo that does not exist').toBe(0);
    expect(els['bkd-body'].innerHTML.toLowerCase()).not.toContain('photo');
  });

  it('opens the detail anyway when signing throws, and logs it', async () => {
    // The detail is how Diego confirms, cancels and reassigns. A photo never
    // takes that away from him.
    const { els, errors } = await openDetailWith(
      labelsLoaded(),
      { brand: 'Shimano', notes: 'Rides daily' },
      {
        labelFor,
        sortAnswerIds,
        booking: { triage_photo_ref: PHOTO_REF },
        fetch: async () => {
          throw new Error('network down');
        },
      }
    );

    expect(els['booking-detail-modal'].style.display, 'the modal stayed closed').toBe('flex');
    const html = els['bkd-body'].innerHTML;
    expect(html).toContain('Shimano');
    expect(html).toContain('Rides daily');
    expect(html).toContain('Brake Pad Install');
    expect(html).not.toContain('<img');
    expect(errors.join('\n')).toContain('network down');
  });

  it('degrades to words when the server refuses to sign, and logs it', async () => {
    const { els, warnings } = await openDetailWith(
      labelsLoaded(),
      { brand: 'Shimano' },
      {
        labelFor,
        sortAnswerIds,
        booking: { triage_photo_ref: PHOTO_REF },
        fetch: async () => ({ ok: false, status: 403, json: async () => ({}) }),
      }
    );
    const html = els['bkd-body'].innerHTML;
    expect(html).toContain('Photo unavailable');
    expect(html).not.toContain('<img');
    expect(html).toContain('Shimano');
    expect(els['booking-detail-modal'].style.display).toBe('flex');
    expect(warnings.join('\n')).toContain('403');
  });

  it('degrades to words when the server signs nothing', async () => {
    const { els } = await openDetailWith(
      labelsLoaded(),
      { brand: 'Shimano' },
      {
        labelFor,
        sortAnswerIds,
        booking: { triage_photo_ref: PHOTO_REF },
        fetch: async () => ({ ok: true, json: async () => ({ urls: [null] }) }),
      }
    );
    const html = els['bkd-body'].innerHTML;
    expect(html).toContain('Photo unavailable');
    expect(html).not.toContain('<img');
  });

  // The tenth failure path, and the only one that is not a failure: a HANG.
  // try/catch covers "it threw", never "it never answered" - without a bound,
  // Diego taps a booking and the modal does not open, for ever, with no
  // message (review final, Important 1). Fake timers, so nothing waits.
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the detail anyway when the signing never answers, and logs it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const open = openDetailWith(
      labelsLoaded(),
      { brand: 'Shimano', notes: 'Rides daily' },
      {
        labelFor,
        sortAnswerIds,
        booking: { triage_photo_ref: PHOTO_REF },
        // Never settles: not a rejection, no resolution, ever.
        fetch: () => new Promise(() => {}),
      }
    );
    await vi.advanceTimersByTimeAsync(10000);
    const { els, errors } = await open;

    expect(els['booking-detail-modal'].style.display, 'the modal never opened').toBe('flex');
    const html = els['bkd-body'].innerHTML;
    expect(html).toContain('Shimano');
    expect(html).toContain('Rides daily');
    expect(html).toContain('Brake Pad Install');
    // Degrades exactly like a failure already does: words, never a broken img.
    expect(html).toContain('Photo unavailable');
    expect(html).not.toContain('<img');
    expect(errors.join('\n'), 'the timeout was silent').toMatch(/timed out/i);
  });

  it('opens the detail anyway when the admin session never answers', async () => {
    // `sb.auth.getSession()` takes no AbortSignal, so it needs a bound of its
    // own - and the signing must not go out without a session either.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let fetched = 0;
    const open = openDetailWith(
      labelsLoaded(),
      { brand: 'Shimano' },
      {
        labelFor,
        sortAnswerIds,
        booking: { triage_photo_ref: PHOTO_REF },
        sb: { auth: { getSession: () => new Promise(() => {}) } },
        fetch: async () => {
          fetched++;
          return { ok: true, json: async () => ({ urls: [PHOTO_URL] }) };
        },
      }
    );
    await vi.advanceTimersByTimeAsync(10000);
    const { els, errors } = await open;

    expect(fetched, 'asked the server to sign without a session').toBe(0);
    expect(els['booking-detail-modal'].style.display, 'the modal never opened').toBe('flex');
    const html = els['bkd-body'].innerHTML;
    expect(html).toContain('Shimano');
    expect(html).toContain('Photo unavailable');
    expect(html).not.toContain('<img');
    expect(errors.join('\n'), 'the timeout was silent').toMatch(/timed out/i);
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
    expect(typeof mod.sortAnswerIds).toBe('function');
    expect(admin).toMatch(/triageLabelFor\s*=\s*\w+\.labelFor/);
  });

  it('a failed load is logged, the detail opens, and the ids stand in', async () => {
    // Runs the block that ships, instead of grepping it for a `.catch(`: a
    // proxy for the claim passes green over a live bug (the lesson is in
    // docs/PENDIENTES.md). A dynamic import inside a vm context rejects
    // unless node runs with --experimental-vm-modules, which this suite does
    // not - so the import really fails here, in the .catch() that ships.
    const { els, errors } = await openDetailWith(moduleLoadBlock(), {
      brand: 'Shimano',
      notes: 'Rides daily',
    });

    expect(els['booking-detail-modal'].style.display, 'the modal stayed closed').toBe('flex');
    const html = els['bkd-body'].innerHTML;
    // The documented degradation: the raw ids, not the questions.
    expect(html).toContain('brand');
    expect(html).toContain('notes');
    expect(html).toContain('Shimano');
    expect(html).toContain('Rides daily');
    expect(html).not.toContain(labelFor('brand'));
    expect(errors.join('\n')).toContain('could not load the triage questions');
  });

  it('a cached older copy of the module without sortAnswerIds degrades, it does not throw', async () => {
    // js/triage-questions.js is imported with no ?v=, so sw.js can serve a
    // copy from before sortAnswerIds existed (CACHE_STATIC is what renews it).
    // Assigning that missing export over the fallback would throw on the
    // first call and break the whole detail modal.
    const stale = moduleLoadBlock().replace(
      "import('./triage-questions.js')",
      'Promise.resolve({ labelFor: (id) => id })'
    );
    const { els, errors } = await openDetailWith(stale, {
      brand: 'Shimano',
      notes: 'Rides daily',
    });

    expect(els['booking-detail-modal'].style.display, 'the modal stayed closed').toBe('flex');
    const html = els['bkd-body'].innerHTML;
    // jsonb order, because the identity fallback is still in place.
    expect(html.indexOf('brand')).toBeLessThan(html.indexOf('notes'));
    expect(html).toContain('Shimano');
    expect(html).toContain('Rides daily');
    expect(errors, 'a module that loaded is not an error').toEqual([]);
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
