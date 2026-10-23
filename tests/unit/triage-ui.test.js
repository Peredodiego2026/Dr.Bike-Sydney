// The booking triage, as the customer meets it: step 1 of the wizard, under the
// service card they tapped (js/app.js).
//
// Method: the same one tests/unit/screen-error-state.test.js uses. The
// functions are cut out of js/app.js and RUN in a vm - the file is a browser
// module that cannot be imported - so what is tested is the code that ships,
// not a copy of it. Nothing here is stubbed except the browser (window,
// localStorage); the catalogue (questionsFor) and the draft code are the real
// ones.
//
// What a rewrite of the render function could break, and each guard below:
//   - a service with no questions leaves a blank hole instead of nothing
//   - a typed answer reaches innerHTML unescaped (the notes field is free text)
//   - switching service keeps answers that belong to another kind of job
//   - the answers live in appState and never reach the request body, so the
//     feature stores nothing and every test above still passes
//   - something in the triage disables Continue (the owner made all of it
//     optional; nothing may gate the booking)
//   - a tap on a chip does not record, does not un-choose on the second tap,
//     or records the translated label instead of the English value
//   - the panel a card unfolds is never bound (chips that answer nothing),
//     bound twice (a tap that undoes itself), or left open next to another
//   - the code that taps a card for the customer scrolls after the tap and
//     buries the questions under the Continue bar
// The last two groups need a DOM; there is none here, so they run against the
// small fake defined under "The part the customer touches".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { questionsFor, CATEGORY_SETS, SERVICE_OVERRIDES } from '../../js/triage-questions.js';
import es from '../../js/i18n-es.js';
import zh from '../../js/i18n-zh.js';

const read = (p) =>
  fs
    .readFileSync(new URL('../../' + p, import.meta.url), 'utf8')
    .split('\r\n')
    .join('\n');
const src = read('js/app.js');

// A top-level function: from its head to the closing brace at column 0.
function sliceFn(head) {
  const start = src.indexOf(head);
  expect(start, `${head} is gone from js/app.js`).toBeGreaterThan(-1);
  const end = src.indexOf('\n}\n', start);
  expect(end, `${head} has no closing brace at column 0`).toBeGreaterThan(start);
  return src.slice(start, end + 2);
}

// The browser, reduced to what app.js's top level touches while loading.
function boot(stored = {}, globals = {}) {
  const store = new Map(Object.entries(stored));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const ctx = vm.createContext({
    window: {},
    localStorage,
    questionsFor,
    console,
    Date,
    ...globals,
  });

  // Function declarations are hoisted in the real module, and the restore that
  // runs at load already calls askedAnswers - so they go in first here.
  for (const head of [
    'function escapeHtml(',
    'function askedAnswers(',
    'function applyServiceChange(',
    'function setTriageAnswer(',
    'function renderTriage(',
    'function bindTriage(',
    'function showTriage(',
  ]) {
    vm.runInContext(sliceFn(head), ctx);
  }

  // appState, the draft functions and the restore that runs at load: the real
  // block, from `window.appState = {` to the end of restoreBookingDraft.
  const from = src.indexOf('window.appState = {');
  const restore = src.indexOf('(function restoreBookingDraft()');
  expect(from, 'window.appState is gone').toBeGreaterThan(-1);
  expect(restore, 'restoreBookingDraft is gone').toBeGreaterThan(from);
  const end = '\n})();\n';
  const to = src.indexOf(end, restore) + end.length;
  vm.runInContext(src.slice(from, to), ctx);

  const get = (name) => vm.runInContext(name, ctx);
  return {
    ctx,
    store,
    state: ctx.window.appState,
    renderTriage: get('renderTriage'),
    bindTriage: get('bindTriage'),
    showTriage: get('showTriage'),
    applyServiceChange: get('applyServiceChange'),
    setTriageAnswer: get('setTriageAnswer'),
    askedAnswers: get('askedAnswers'),
    saveBookingDraft: get('saveBookingDraft'),
  };
}

const pads = { id: 'pads', name: 'Brake Pad Install', category: 'Brakes' };
const bleed = { id: 'bleed', name: 'Brake Bleed', category: 'Brakes' };
const chain = { id: 'chain', name: 'Chain Install', category: 'Drivetrain' };

// ---------------------------------------------------------------------------
// What gets drawn
// ---------------------------------------------------------------------------
describe('renderTriage: what the customer sees under the card', () => {
  const { renderTriage } = boot();

  it('draws the questions of the service category', () => {
    const html = renderTriage({ name: 'Brake Pad Install', category: 'Brakes' });
    expect(html).toContain('Shimano');
    expect(html).toContain('I am not sure');
  });

  it('draws nothing for Emergency Service', () => {
    expect(renderTriage({ name: 'Emergency Service', category: 'Scheduled services' })).toBe('');
  });

  it('draws every question and every option of every set, so none is lost on the way', () => {
    const services = [
      ...Object.keys(CATEGORY_SETS).map((category) => ({ name: 'Any', category })),
      ...Object.keys(SERVICE_OVERRIDES).map((name) => ({ name, category: 'Brakes' })),
      { name: 'Brand new in Admin', category: 'A Category Nobody Has Heard Of' },
    ];
    for (const svc of services) {
      const qs = questionsFor(svc);
      const html = renderTriage(svc);
      if (!qs.length) {
        expect(html, `${svc.name} asks nothing, so nothing is drawn`).toBe('');
        continue;
      }
      for (const q of qs) {
        expect(html, `${svc.name}: "${q.ask}"`).toContain(q.ask);
        for (const opt of q.options || []) {
          expect(html, `${svc.name}: option "${opt}" of ${q.id}`).toContain(
            `data-q="${q.id}" data-value="${opt}"`
          );
        }
        if (q.free) expect(html, `${svc.name}: input for ${q.id}`).toContain(`id="tq-${q.id}"`);
      }
    }
  });

  it('every choice is a real button that holds the English value', () => {
    // The saved answer is the English literal: Admin reads it back, and the
    // server stores it. The label is translated; the value never is.
    const html = renderTriage(pads);
    expect(html).toMatch(/<button type="button" class="triage__chip"[^>]*data-value="Shimano"/);
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toMatch(/\son[a-z]+=/i); // no inline handlers (CLAUDE.md)
  });

  it('shows what was already answered', () => {
    const html = renderTriage(pads, { brand: 'SRAM', brake_model: 'Code RSC' });
    const brandChips = html.match(/<button[^>]*data-q="brand"[^>]*>/g);
    const on = brandChips.filter((c) => c.includes('aria-pressed="true"'));
    expect(on, 'exactly one brand chip is on').toHaveLength(1);
    expect(on[0]).toContain('data-value="SRAM"');
    expect(on[0]).toContain('is-on');
    expect(html).toContain('value="Code RSC"');
  });

  it('escapes what the customer typed', () => {
    // `notes` and `symptom` are free text that goes back into innerHTML when
    // the customer returns to step 1 or resumes a draft.
    const hostile = '"><img src=x onerror=alert(1)>';
    const html = renderTriage(
      { name: 'Standard Service', category: 'Scheduled services' },
      { notes: hostile }
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('&quot;&gt;&lt;img');
  });

  it('never touches Continue - the whole triage is optional', () => {
    const fn = src.slice(src.indexOf('function renderTriage('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).not.toContain('s1-continue');
    for (const svc of [pads, chain, { name: 'Standard Service', category: 'Scheduled services' }]) {
      expect(renderTriage(svc)).not.toMatch(/\bdisabled\b|\brequired\b|aria-required/);
    }
  });

  it('tells the customer the bar tape is black instead of asking its colour', () => {
    // Diego stocks one colour (LEBYCLE Wisp 01A Black). Asking "which colour"
    // would promise a choice he cannot deliver.
    const tape = renderTriage({ name: 'Bar Tape Install', category: 'Cockpit & levers' });
    expect(tape).toContain('The bar tape we fit comes in black.');
    expect(tape).not.toMatch(/colou?r/i);
    const bars = renderTriage({ name: 'Handlebar Install', category: 'Cockpit & levers' });
    expect(bars).not.toContain('comes in black');
  });
});

// ---------------------------------------------------------------------------
// Which answers survive a change of service
// ---------------------------------------------------------------------------
describe('applyServiceChange', () => {
  const { applyServiceChange } = boot();

  // Review Focus 3.
  it('switching to a service of another category drops the old answers', () => {
    const state = { service: pads, triage: { brand: 'Shimano' } };
    applyServiceChange(state, chain);
    expect(state.triage).toEqual({});
  });

  it('...even an answer the new service asks too: the same id is another job', () => {
    // own_part ("are you supplying the part?") is asked by Accessory / Part
    // Install and by Derailleur Install, two categories apart. Pruning by what
    // the new service asks would carry it across; the rule is by category.
    const accessory = { name: 'Accessory / Part Install', category: 'General & assembly' };
    const derailleur = { name: 'Derailleur Install', category: 'Gears & cables' };
    expect(questionsFor(derailleur).map((q) => q.id)).toContain('own_part');
    const state = { service: accessory, triage: { own_part: 'Yes, I have it' } };
    applyServiceChange(state, derailleur);
    expect(state.triage).toEqual({});
  });

  it('switching within the same category keeps what was answered', () => {
    const state = { service: pads, triage: { brand: 'Shimano' } };
    applyServiceChange(state, bleed);
    expect(state.triage).toEqual({ brand: 'Shimano' });
  });

  it('...but not an answer the new service never asks', () => {
    // Brake Pad Install asks resin or metallic. Brake Bleed does not, so a
    // stale "Metallic" would be stored against a bleed the customer never
    // answered it for.
    const state = { service: pads, triage: { brand: 'Shimano', pad_material: 'Metallic' } };
    applyServiceChange(state, bleed);
    expect(state.triage).toEqual({ brand: 'Shimano' });
  });

  it('records the service itself, so the caller cannot forget to', () => {
    const state = { service: pads, triage: {} };
    applyServiceChange(state, chain);
    expect(state.service).toBe(chain);
  });

  it('the first pick starts from nothing', () => {
    const state = { service: null, triage: { brand: 'Shimano' } };
    applyServiceChange(state, pads);
    expect(state.triage).toEqual({});
    expect(state.service).toBe(pads);
  });

  it('tapping the same service again loses nothing', () => {
    const state = { service: pads, triage: { brand: 'Shimano', pad_material: 'Resin' } };
    applyServiceChange(state, pads);
    expect(state.triage).toEqual({ brand: 'Shimano', pad_material: 'Resin' });
  });
});

describe('setTriageAnswer', () => {
  const { setTriageAnswer } = boot();

  it('records an answer, replaces it, and removes it when emptied', () => {
    const state = { triage: {} };
    setTriageAnswer(state, 'brand', 'Shimano');
    expect(state.triage).toEqual({ brand: 'Shimano' });
    setTriageAnswer(state, 'brand', 'SRAM');
    expect(state.triage).toEqual({ brand: 'SRAM' });
    setTriageAnswer(state, 'brand', '');
    expect(state.triage).toEqual({});
  });

  it('a field of spaces is no answer', () => {
    const state = { triage: { notes: 'hello' } };
    setTriageAnswer(state, 'notes', '   ');
    expect(state.triage).toEqual({});
  });

  it('works before any answer exists', () => {
    const state = {};
    setTriageAnswer(state, 'speeds', '11 speeds');
    expect(state.triage).toEqual({ speeds: '11 speeds' });
  });
});

describe('askedAnswers: what is allowed to leave the browser', () => {
  const { askedAnswers } = boot();

  it('keeps only the questions this service asks, as non-empty text', () => {
    const out = askedAnswers(bleed, {
      brand: 'Shimano',
      pad_material: 'Metallic', // not asked by Brake Bleed
      brake_model: '   ', // blank
      speeds: 11, // not text, and not asked
    });
    expect(out).toEqual({ brand: 'Shimano' });
  });

  it('is empty without a service or without answers', () => {
    expect(askedAnswers(null, { brand: 'Shimano' })).toEqual({});
    expect(askedAnswers(pads, null)).toEqual({});
    expect(askedAnswers(pads, [])).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// The draft in localStorage
// ---------------------------------------------------------------------------
describe('the booking draft carries the triage', () => {
  it('starts empty', () => {
    expect(boot().state.triage).toEqual({});
  });

  it('is saved with the service', () => {
    const b = boot();
    b.state.service = pads;
    b.state.triage = { brand: 'Shimano' };
    b.saveBookingDraft('service');
    const saved = JSON.parse(b.store.get('drbike-booking-draft'));
    expect(saved.triage).toEqual({ brand: 'Shimano' });
    expect(saved.service.name).toBe('Brake Pad Install');
  });

  it('comes back after a reload', () => {
    const first = boot();
    first.state.service = pads;
    first.state.triage = { brand: 'Shimano', brake_model: 'SLX' };
    first.saveBookingDraft('service');

    const second = boot(Object.fromEntries(first.store));
    expect(second.state.service.name).toBe('Brake Pad Install');
    expect(second.state.triage).toEqual({ brand: 'Shimano', brake_model: 'SLX' });
  });

  it('a draft written before the triage existed restores as an empty triage', () => {
    const old = JSON.stringify({
      service: pads,
      location: 'Home',
      step: 'service',
      savedAt: Date.now(),
    });
    expect(boot({ 'drbike-booking-draft': old }).state.triage).toEqual({});
  });

  it('a damaged draft cannot put junk in the request', () => {
    const damaged = JSON.stringify({
      service: pads,
      triage: { brand: 'Shimano', pad_material: 'x', hacker: 'y', speeds: 11, brake_model: ['a'] },
      savedAt: Date.now(),
    });
    // Only text answers to questions Brake Pad Install asks survive.
    expect(boot({ 'drbike-booking-draft': damaged }).state.triage).toEqual({
      brand: 'Shimano',
      pad_material: 'x',
    });
    const notAnObject = JSON.stringify({ service: pads, triage: 'Shimano', savedAt: Date.now() });
    expect(boot({ 'drbike-booking-draft': notAnObject }).state.triage).toEqual({});
  });

  it('answers without a service restore as nothing', () => {
    const orphan = JSON.stringify({
      triage: { notes: 'hi' },
      date: '2999-01-01',
      savedAt: Date.now(),
    });
    expect(boot({ 'drbike-booking-draft': orphan }).state.triage).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// The part the customer touches: tapping a chip, typing a note, unfolding a card
// ---------------------------------------------------------------------------
// bindTriage and showTriage need a DOM and this suite runs in plain node, so
// FakeEl below is one small enough to read: a tree, attributes, classList,
// dataset, closest / querySelectorAll for the simple selectors the app uses, and
// events that bubble. It PARSES the markup renderTriage really returns, so a
// tap here lands on the same <button data-q data-value> the customer taps.
// Anything it does not implement (an attribute selector, an insert position)
// throws, so an edit that outgrows it fails loudly instead of passing on a stub
// that quietly returns null.
const VOID_TAGS = new Set(['input', 'br', 'img', 'hr']);
const unescapeHtml = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

class FakeEl {
  constructor(tag, attrs = {}) {
    this.tag = tag;
    this.attrs = new Map(Object.entries(attrs));
    this.children = [];
    this.parent = null;
    this.listeners = {};
    this.textContent = '';
    this.value = attrs.value ?? '';
    // Every write made to this element, so a test can prove it was left alone.
    this.writes = [];
    this.classList = {
      contains: (c) => this.classes().includes(c),
      add: (c) =>
        this.setAttribute('class', [...this.classes().filter((x) => x !== c), c].join(' ')),
      remove: (c) =>
        this.setAttribute(
          'class',
          this.classes()
            .filter((x) => x !== c)
            .join(' ')
        ),
      toggle: (c, force) => {
        const want = force === undefined ? !this.classes().includes(c) : Boolean(force);
        this.classList[want ? 'add' : 'remove'](c);
        return want;
      },
    };
  }
  classes() {
    return (this.attrs.get('class') || '').split(/\s+/).filter(Boolean);
  }
  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  hasAttribute(name) {
    return this.attrs.has(name);
  }
  setAttribute(name, value) {
    this.writes.push(['set', name, String(value)]);
    this.attrs.set(name, String(value));
  }
  removeAttribute(name) {
    this.writes.push(['remove', name]);
    this.attrs.delete(name);
  }
  get dataset() {
    const out = {};
    for (const [k, v] of this.attrs) {
      if (k.startsWith('data-'))
        out[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    }
    return out;
  }
  get disabled() {
    return this.attrs.has('disabled');
  }
  set disabled(on) {
    this.writes.push(['disabled', Boolean(on)]);
    if (on) this.attrs.set('disabled', '');
    else this.attrs.delete('disabled');
  }
  matches(selector) {
    if (/[^\w#.-]/.test(selector)) {
      throw new Error(`FakeEl: selector "${selector}" is not implemented`);
    }
    return [...selector.matchAll(/([#.]?)([\w-]+)/g)].every(([, kind, name]) =>
      kind === '#'
        ? this.attrs.get('id') === name
        : kind === '.'
          ? this.classes().includes(name)
          : this.tag === name
    );
  }
  closest(selector) {
    for (let e = this; e; e = e.parent) if (e.matches(selector)) return e;
    return null;
  }
  descendants() {
    return this.children.flatMap((c) => [c, ...c.descendants()]);
  }
  querySelectorAll(selector) {
    return this.descendants().filter((e) => e.matches(selector));
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  get nextElementSibling() {
    return this.parent.children[this.parent.children.indexOf(this) + 1] ?? null;
  }
  append(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  insertAdjacentHTML(position, html) {
    if (position !== 'afterend') throw new Error(`FakeEl: "${position}" is not implemented`);
    const nodes = parseHtml(html);
    nodes.forEach((n) => (n.parent = this.parent));
    this.parent.children.splice(this.parent.children.indexOf(this) + 1, 0, ...nodes);
  }
  remove() {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  // A real event: it starts at this element and bubbles through every ancestor,
  // which is how one listener on the panel hears a tap on any chip inside it.
  fire(type) {
    const event = { type, target: this };
    for (let n = this; n; n = n.parent) for (const fn of n.listeners[type] || []) fn(event);
  }
}

function parseHtml(html) {
  const root = new FakeEl('#root');
  let cur = root;
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g)) {
    const [, closing, tag, rest, text] = m;
    if (text !== undefined) {
      cur.textContent += unescapeHtml(text).trim();
    } else if (closing) {
      if (cur.tag !== tag) throw new Error(`malformed markup: </${tag}> closes <${cur.tag}>`);
      cur = cur.parent;
    } else {
      const attrs = {};
      for (const a of rest.matchAll(/([^\s=/]+)(?:="([^"]*)")?/g)) {
        attrs[a[1]] = unescapeHtml(a[2] ?? '');
      }
      const el = cur.append(new FakeEl(tag, attrs));
      if (!VOID_TAGS.has(tag) && !rest.trim().endsWith('/')) cur = el;
    }
  }
  if (cur !== root) throw new Error(`malformed markup: <${cur.tag}> is never closed`);
  return root.children.map((c) => ((c.parent = null), c));
}

// Step 1 as the wizard draws it: the list of cards, and the Continue button
// OUTSIDE the list, in the sticky bar. Continue starts enabled - the tap that
// chose the service enabled it before any of the triage code runs.
function step1(services) {
  const [screen] = parseHtml(`
    <div data-screen="book-service">
      <div id="step1-services">${services
        .map((s) => `<div class="service-card" role="button" data-service-id="${s.id}"></div>`)
        .join('')}</div>
      <div class="sticky-bottom"><button class="btn" id="s1-continue">Continue</button></div>
    </div>`);
  const list = screen.querySelector('#step1-services');
  return {
    screen,
    list,
    cont: screen.querySelector('#s1-continue'),
    card: (svc) => list.children.find((c) => c.dataset.serviceId === svc.id),
    panels: () => list.querySelectorAll('#triage-panel'),
  };
}

// The booted app (the real draft, state and triage code) wired to that screen.
// `document` is given to the code on purpose: if anything in the triage reached
// for Continue by id, it would find the real element, and the test would see
// the write instead of a ReferenceError.
function world(services) {
  const dom = step1(services);
  const app = boot(
    {},
    {
      document: {
        getElementById: (id) => dom.screen.querySelector(`#${id}`),
        querySelector: (sel) => dom.screen.querySelector(sel),
      },
    }
  );
  return { ...app, ...dom };
}

// bindTriage on its own: the real markup, parsed, inserted under its card,
// bound - no showTriage involved.
function bound(svc = pads, answers = {}) {
  const w = world([svc]);
  w.state.service = svc;
  w.state.triage = answers;
  const card = w.card(svc);
  card.insertAdjacentHTML('afterend', w.renderTriage(svc, answers));
  const panel = card.nextElementSibling;
  w.bindTriage(panel);
  return { ...w, panel };
}

const chipsOf = (panel) => panel.querySelectorAll('.triage__chip');
const chipFor = (panel, q, value) => {
  const chip = chipsOf(panel).find((c) => c.dataset.q === q && c.dataset.value === value);
  expect(chip, `no chip ${q} = "${value}" in the panel`).toBeTruthy();
  return chip;
};
const fieldFor = (panel, q) => {
  const field = panel.querySelectorAll('.triage__input').find((f) => f.dataset.q === q);
  expect(field, `no text field for ${q} in the panel`).toBeTruthy();
  return field;
};
const tap = (el) => el.fire('click');
const typeInto = (field, text) => {
  field.value = text;
  field.fire('input');
};
function expectOn(chip) {
  expect(chip.classList.contains('is-on'), `${chip.dataset.value}: is-on`).toBe(true);
  expect(chip.getAttribute('aria-pressed'), `${chip.dataset.value}: aria-pressed`).toBe('true');
}
function expectOff(chip) {
  expect(chip.classList.contains('is-on'), `${chip.dataset.value}: is-on`).toBe(false);
  expect(chip.getAttribute('aria-pressed'), `${chip.dataset.value}: aria-pressed`).toBe('false');
}
const savedDraft = (w) => JSON.parse(w.store.get('drbike-booking-draft'));

describe('bindTriage: choosing, un-choosing and typing', () => {
  it('a tap records the English value and lights that chip only', () => {
    const w = bound();
    tap(chipFor(w.panel, 'brand', 'Shimano'));
    expect(w.state.triage).toEqual({ brand: 'Shimano' });
    for (const chip of chipsOf(w.panel).filter((c) => c.dataset.q === 'brand')) {
      if (chip.dataset.value === 'Shimano') expectOn(chip);
      else expectOff(chip);
    }
  });

  it('a tap on another chip of the same question moves the choice', () => {
    const w = bound();
    tap(chipFor(w.panel, 'brand', 'Shimano'));
    tap(chipFor(w.panel, 'brand', 'SRAM'));
    expect(w.state.triage).toEqual({ brand: 'SRAM' });
    expectOff(chipFor(w.panel, 'brand', 'Shimano'));
    expectOn(chipFor(w.panel, 'brand', 'SRAM'));
  });

  it('tapping the chosen chip again un-chooses it, and the answer is gone from the state', () => {
    const w = bound();
    const shimano = chipFor(w.panel, 'brand', 'Shimano');
    tap(shimano);
    tap(shimano);
    expect(w.state.triage).toEqual({});
    expect('brand' in w.state.triage, 'not left behind as an empty answer').toBe(false);
    for (const chip of chipsOf(w.panel)) expectOff(chip);
  });

  it('...and a third tap chooses it again', () => {
    const w = bound();
    const shimano = chipFor(w.panel, 'brand', 'Shimano');
    tap(shimano);
    tap(shimano);
    tap(shimano);
    expect(w.state.triage).toEqual({ brand: 'Shimano' });
    expectOn(shimano);
  });

  it('a chip is un-chosen from the draft too: nothing of it is left in localStorage', () => {
    const w = bound();
    const shimano = chipFor(w.panel, 'brand', 'Shimano');
    tap(shimano);
    expect(savedDraft(w).triage).toEqual({ brand: 'Shimano' });
    tap(shimano);
    expect(savedDraft(w).triage).toEqual({});
  });

  it('a tap in one question leaves the answers of the others alone', () => {
    // Three questions of Brake Pad Install offer "I am not sure": the same
    // value, three different answers.
    const w = bound();
    tap(chipFor(w.panel, 'brand', 'I am not sure'));
    tap(chipFor(w.panel, 'pad_material', 'Metallic'));
    tap(chipFor(w.panel, 'brake_type', 'I am not sure'));
    expect(w.state.triage).toEqual({
      brand: 'I am not sure',
      pad_material: 'Metallic',
      brake_type: 'I am not sure',
    });
    tap(chipFor(w.panel, 'brand', 'I am not sure')); // take back one of the three
    expect(w.state.triage).toEqual({ pad_material: 'Metallic', brake_type: 'I am not sure' });
    expectOff(chipFor(w.panel, 'brand', 'I am not sure'));
    expectOn(chipFor(w.panel, 'pad_material', 'Metallic'));
    expectOn(chipFor(w.panel, 'brake_type', 'I am not sure'));
  });

  it('a chip that was already answered when the panel opened can be taken back', () => {
    // Coming back from step 2: the panel is drawn from the saved answers, and
    // the first tap on the lit chip must un-choose it, not "choose" it again.
    const w = bound(pads, { brand: 'SRAM' });
    const sram = chipFor(w.panel, 'brand', 'SRAM');
    expectOn(sram);
    tap(sram);
    expect(w.state.triage).toEqual({});
    expectOff(sram);
  });

  it('updates the chips in place: the notes field keeps what was typed (and its focus)', () => {
    const w = bound();
    const field = fieldFor(w.panel, 'brake_model');
    typeInto(field, 'SLX M7100');
    tap(chipFor(w.panel, 'brand', 'Shimano'));
    expect(fieldFor(w.panel, 'brake_model'), 'the field was not redrawn').toBe(field);
    expect(field.value).toBe('SLX M7100');
    expect(w.state.triage).toEqual({ brake_model: 'SLX M7100', brand: 'Shimano' });
  });

  it('stores the English value, not the label the customer reads', () => {
    // Translation runs after insertion and only swaps the text of the chip
    // (js/i18n.js: text nodes, placeholder, aria-label). data-value is
    // untouched, and it is what bindTriage must read.
    const w = bound();
    for (const chip of chipsOf(w.panel))
      chip.textContent = es[chip.textContent] ?? chip.textContent;
    const notSure = chipFor(w.panel, 'brand', 'I am not sure');
    expect(notSure.textContent, 'the fixture really is in Spanish now').toBe('No sé');
    tap(notSure);
    expect(w.state.triage).toEqual({ brand: 'I am not sure' });
    expect(savedDraft(w).triage).toEqual({ brand: 'I am not sure' });
  });

  it('every chip of every question stores exactly the option the catalogue defines', () => {
    // What leaves the browser must be the literal in js/triage-questions.js -
    // Admin reads it back by that text. This runs the real tap on every chip.
    const services = [
      ...Object.keys(CATEGORY_SETS).map((category) => ({ id: category, name: 'Any', category })),
      ...Object.keys(SERVICE_OVERRIDES).map((name) => ({ id: name, name, category: 'Brakes' })),
    ];
    let tapped = 0;
    for (const svc of services) {
      const asked = questionsFor(svc);
      if (!asked.length) continue;
      const w = bound(svc);
      for (const q of asked.filter((x) => !x.free)) {
        for (const opt of q.options) {
          const chip = chipFor(w.panel, q.id, opt);
          tap(chip);
          expect(w.state.triage[q.id], `${svc.name}: ${q.id} = "${opt}"`).toBe(opt);
          tap(chip);
          expect(q.id in w.state.triage, `${svc.name}: ${q.id} taken back`).toBe(false);
          tapped++;
        }
      }
    }
    expect(tapped, 'the loop actually tapped chips').toBeGreaterThan(40);
  });

  it('typing saves the text, trimmed', () => {
    const w = bound();
    typeInto(fieldFor(w.panel, 'brake_model'), '  Code RSC ');
    expect(w.state.triage).toEqual({ brake_model: 'Code RSC' });
  });

  it('every keystroke is kept: the last text wins', () => {
    const w = bound();
    const field = fieldFor(w.panel, 'brake_model');
    for (const text of ['S', 'SL', 'SLX']) typeInto(field, text);
    expect(w.state.triage).toEqual({ brake_model: 'SLX' });
    expect(savedDraft(w).triage).toEqual({ brake_model: 'SLX' });
  });

  it('emptying the field takes the answer back; spaces alone are no answer', () => {
    const w = bound();
    const field = fieldFor(w.panel, 'brake_model');
    typeInto(field, 'SLX');
    typeInto(field, '   ');
    expect(w.state.triage).toEqual({});
    typeInto(field, 'SLX');
    typeInto(field, '');
    expect(w.state.triage).toEqual({});
    expect('brake_model' in w.state.triage).toBe(false);
  });

  it('a note typed on a service that only asks for notes is saved the same way', () => {
    const w = bound({ id: 'std', name: 'Standard Service', category: 'Scheduled services' });
    typeInto(fieldFor(w.panel, 'notes'), 'Squeaks when it rains');
    expect(w.state.triage).toEqual({ notes: 'Squeaks when it rains' });
  });

  it('a tap on the panel that is not a chip changes nothing and saves nothing', () => {
    const w = bound();
    tap(w.panel.querySelector('#triage-title'));
    tap(w.panel);
    w.panel.querySelector('#triage-title').fire('input');
    expect(w.state.triage).toEqual({});
    expect(w.store.has('drbike-booking-draft'), 'no draft written for a stray tap').toBe(false);
  });

  it('what is chosen and typed survives a reload, through the real draft', () => {
    const w = bound();
    tap(chipFor(w.panel, 'brand', 'Shimano'));
    typeInto(fieldFor(w.panel, 'brake_model'), 'SLX');
    const reloaded = boot(Object.fromEntries(w.store));
    expect(reloaded.state.triage).toEqual({ brand: 'Shimano', brake_model: 'SLX' });
  });

  it('the draft says the customer is on step 1, whatever step the draft had reached', () => {
    // 'service' is what the card tap records. The triage is not a step of its
    // own, and a customer who went back to step 1 from payment to answer one
    // more question is on step 1.
    const w = bound();
    w.saveBookingDraft('payment');
    expect(savedDraft(w).step).toBe('payment');
    tap(chipFor(w.panel, 'brand', 'Shimano'));
    expect(savedDraft(w).step).toBe('service');
    w.saveBookingDraft('payment');
    typeInto(fieldFor(w.panel, 'brake_model'), 'SLX');
    expect(savedDraft(w).step).toBe('service');
  });

  it('never disables Continue: not before an answer, not after one, not after taking it back', () => {
    // Everything in the triage is optional (the owner decided that
    // explicitly). A plausible regression is "Continue waits for an answer";
    // the tripwire is the element itself, which logs every write it receives.
    const w = bound();
    expect(w.cont.disabled, 'enabled before any answer').toBe(false);
    const shimano = chipFor(w.panel, 'brand', 'Shimano');
    const field = fieldFor(w.panel, 'brake_model');
    tap(shimano);
    expect(w.cont.disabled, 'enabled with an answer').toBe(false);
    typeInto(field, 'SLX');
    typeInto(field, '');
    tap(shimano);
    expect(w.state.triage, 'every answer is gone again').toEqual({});
    expect(w.cont.disabled, 'enabled with no answers left').toBe(false);
    expect(w.cont.writes, 'Continue was never written to').toEqual([]);
  });
});

describe('showTriage: unfolding the questions under a card', () => {
  const emergency = { id: 'emerg', name: 'Emergency Service', category: 'Scheduled services' };
  const all = [pads, bleed, chain, emergency];

  it('puts the panel right under the tapped card and returns true', () => {
    const w = world(all);
    expect(w.showTriage(w.card(pads), pads)).toBe(true);
    expect(w.panels()).toHaveLength(1);
    expect(w.card(pads).nextElementSibling).toBe(w.panels()[0]);
    expect(w.list.children.map((c) => c.dataset.serviceId ?? 'panel')).toEqual([
      'pads',
      'panel',
      'bleed',
      'chain',
      'emerg',
    ]);
  });

  it('marks the card as the one that is open, for the screen reader and the stylesheet', () => {
    const w = world(all);
    w.showTriage(w.card(pads), pads);
    const card = w.card(pads);
    expect(card.classList.contains('has-triage')).toBe(true);
    expect(card.getAttribute('aria-expanded')).toBe('true');
    expect(card.getAttribute('aria-controls')).toBe('triage-panel');
    expect(card.classList.contains('service-card'), 'its own class is kept').toBe(true);
  });

  it('only one panel is open at a time: choosing another service folds the last one', () => {
    const w = world(all);
    w.showTriage(w.card(pads), pads);
    w.showTriage(w.card(chain), chain);
    expect(w.panels(), 'exactly one panel in the list').toHaveLength(1);
    expect(w.card(chain).nextElementSibling).toBe(w.panels()[0]);

    const old = w.card(pads);
    expect(old.classList.contains('has-triage')).toBe(false);
    expect(old.hasAttribute('aria-expanded')).toBe(false);
    expect(old.hasAttribute('aria-controls')).toBe(false);
    expect(old.classList.contains('service-card'), 'its own class is kept').toBe(true);
    expect(w.card(chain).classList.contains('has-triage')).toBe(true);
    expect(w.list.querySelectorAll('.service-card.has-triage')).toHaveLength(1);
  });

  it('the panel is for the service that was tapped, not the one before it', () => {
    const w = world(all);
    w.showTriage(w.card(pads), pads);
    w.showTriage(w.card(chain), chain);
    const panel = w.panels()[0];
    expect(panel.querySelectorAll('.triage__q')).toHaveLength(questionsFor(chain).length);
    expect(chipsOf(panel).some((c) => c.dataset.q === 'pad_material')).toBe(false);
  });

  it('tapping the same card again redraws one panel, with the answers so far', () => {
    const w = world(all);
    w.state.service = pads;
    w.showTriage(w.card(pads), pads);
    tap(chipFor(w.panels()[0], 'brand', 'Shimano'));
    expect(w.showTriage(w.card(pads), pads)).toBe(true);
    expect(w.panels()).toHaveLength(1);
    expectOn(chipFor(w.panels()[0], 'brand', 'Shimano'));
  });

  it('draws from the answers already in the state (coming back from step 2)', () => {
    const w = world(all);
    w.state.service = pads;
    w.state.triage = { brand: 'SRAM', brake_model: 'Code RSC' };
    w.showTriage(w.card(pads), pads);
    const panel = w.panels()[0];
    expectOn(chipFor(panel, 'brand', 'SRAM'));
    expectOff(chipFor(panel, 'brand', 'Shimano'));
    expect(fieldFor(panel, 'brake_model').value).toBe('Code RSC');
  });

  it('returns false for a service that asks nothing, and leaves nothing open', () => {
    // false is the caller's cue to go straight to the calendar, as the wizard
    // did before the triage existed. It must not leave the last panel behind.
    const w = world(all);
    w.showTriage(w.card(pads), pads);
    expect(w.showTriage(w.card(emergency), emergency)).toBe(false);
    expect(w.panels()).toHaveLength(0);
    expect(w.list.querySelectorAll('.service-card.has-triage')).toHaveLength(0);
    expect(w.card(emergency).hasAttribute('aria-expanded')).toBe(false);
    expect(w.card(pads).hasAttribute('aria-expanded')).toBe(false);
    expect(w.list.children).toHaveLength(all.length);
  });

  it('the return value is "there is a panel to look at", for every service there is', () => {
    // true keeps the customer on step 1; false sends them to the calendar. The
    // two must never disagree with what is on the screen.
    const services = [
      ...Object.keys(CATEGORY_SETS).map((category) => ({ id: category, name: 'Any', category })),
      ...Object.keys(SERVICE_OVERRIDES).map((name) => ({ id: name, name, category: 'Brakes' })),
      { id: 'new', name: 'Brand new in Admin', category: 'A Category Nobody Has Heard Of' },
    ];
    const falses = [];
    for (const svc of services) {
      const w = world([svc]);
      const result = w.showTriage(w.card(svc), svc);
      expect(result, `${svc.name} (${svc.category})`).toBe(questionsFor(svc).length > 0);
      expect(w.panels().length, `${svc.name}: panels on screen`).toBe(result ? 1 : 0);
      if (!result) falses.push(svc.name);
    }
    expect(falses, 'only Emergency Service asks nothing').toEqual(['Emergency Service']);
  });

  it('the panel it opens is live: a tap on its chip is recorded', () => {
    // bindTriage is called from here; if showTriage stopped calling it, every
    // chip would render and none would answer.
    const w = world(all);
    w.state.service = pads;
    w.showTriage(w.card(pads), pads);
    tap(chipFor(w.panels()[0], 'brand', 'Hope'));
    expect(w.state.triage).toEqual({ brand: 'Hope' });
    expectOn(chipFor(w.panels()[0], 'brand', 'Hope'));
  });

  it('opening panels over and over does not stack listeners: one tap is one choice', () => {
    // A listener bound twice would choose the chip and un-choose it in the same
    // tap, and the customer would see nothing happen.
    const w = world(all);
    w.state.service = pads;
    w.showTriage(w.card(pads), pads);
    w.showTriage(w.card(bleed), bleed);
    w.showTriage(w.card(pads), pads);
    tap(chipFor(w.panels()[0], 'brand', 'Hope'));
    expect(w.state.triage).toEqual({ brand: 'Hope' });
    expectOn(chipFor(w.panels()[0], 'brand', 'Hope'));
  });

  it('never touches Continue: not opening, folding, switching or answering', () => {
    const w = world(all);
    w.state.service = pads;
    w.showTriage(w.card(pads), pads);
    tap(chipFor(w.panels()[0], 'brand', 'Hope'));
    w.showTriage(w.card(bleed), bleed);
    w.showTriage(w.card(emergency), emergency);
    w.showTriage(w.card(chain), chain);
    expect(w.cont.disabled).toBe(false);
    expect(w.cont.writes, 'Continue was never written to').toEqual([]);
  });
});

// The two callers that tap a card on the customer's behalf. Before the triage a
// tap navigated away, so scrolling the card "into view" afterwards was
// harmless. Now the tap unfolds a panel and the card handler scrolls it to the
// top of the screen; a second scroll from the caller, `block: 'nearest'`, would
// win and leave the questions below the fold, behind the Continue bar.
describe('programmatic card taps leave the scrolling to the card handler', () => {
  // A card whose click behaves like the wizard's handler: it scrolls itself to
  // the top, as the real one does when a panel unfolds.
  function handlerCard() {
    const scrolls = [];
    const card = {
      click: () => card.scrollIntoView({ block: 'start', behavior: 'smooth' }),
      scrollIntoView: (opts) => scrolls.push(opts.block),
    };
    return { card, scrolls };
  }
  const runtime = () => vm.createContext({ console, String });

  it('autoSelectService clicks the card and the last scroll is the handler own', () => {
    const ctx = runtime();
    vm.runInContext(sliceFn('function autoSelectService('), ctx);
    const { card, scrolls } = handlerCard();
    const screen = { querySelector: (sel) => (sel.includes('data-service-id="42"') ? card : null) };
    vm.runInContext('autoSelectService', ctx)(screen, 42);
    expect(scrolls).toEqual(['start']);
  });

  it('autoSelectService does nothing for a service that is not on the screen', () => {
    const ctx = runtime();
    vm.runInContext(sliceFn('function autoSelectService('), ctx);
    const screen = { querySelector: () => null };
    expect(() => vm.runInContext('autoSelectService', ctx)(screen, 99)).not.toThrow();
  });

  it('the AI recommendation button clicks the card and the last scroll is the handler own', () => {
    const ctx = runtime();
    vm.runInContext(sliceFn('function showDiagResult('), ctx);
    const { card, scrolls } = handlerCard();
    let bookClick;
    const bookBtn = { addEventListener: (type, fn) => type === 'click' && (bookClick = fn) };
    const resultEl = {
      style: {},
      innerHTML: '',
      querySelector: (sel) => (sel === '#diag-book-btn' ? bookBtn : null),
    };
    const screen = {
      querySelector: (sel) =>
        sel === '#diag-result' ? resultEl : sel.includes('data-service-id="7"') ? card : null,
    };
    vm.runInContext('showDiagResult', ctx)(screen, {
      diagnosis: 'Worn brake pads',
      recommended_service_id: 7,
      recommended_service_name: 'Brake Pad Install',
    });
    expect(bookClick, 'the Book button was wired').toBeTypeOf('function');
    bookClick();
    expect(scrolls).toEqual(['start']);
  });
});

// ---------------------------------------------------------------------------
// The wiring that cannot be run here (it is nested inside renderBookService /
// renderPayment and needs the network). These read the source, so they prove
// the lines exist, not that they work - that is what the browser check in the
// report is for. They exist so a later edit cannot quietly drop one.
// ---------------------------------------------------------------------------
describe('wired into the wizard', () => {
  it('the request that creates the booking carries the triage', () => {
    // NOT the first "role: 'create-booking'" in the file: that one belongs to
    // the Stripe Checkout return handler, which nothing starts any more
    // (nothing writes its sessionStorage draft). The live call is the one in
    // finalizeBooking.
    const at = src.indexOf('async function finalizeBooking(');
    expect(at, 'finalizeBooking is gone').toBeGreaterThan(-1);
    const call = src.indexOf("role: 'create-booking'", at);
    expect(call, 'finalizeBooking no longer creates the booking').toBeGreaterThan(at);
    expect(src.slice(call, call + 1200)).toMatch(
      /triage:\s*askedAnswers\(service,\s*window\.appState\.triage\)/
    );
  });

  it('a finished booking does not leave its answers for the next one', () => {
    const at = src.indexOf('async function finalizeBooking(');
    const afterCall = src.indexOf('clearBookingDraft();', at);
    expect(afterCall, 'finalizeBooking no longer clears the draft').toBeGreaterThan(at);
    expect(src.slice(afterCall, afterCall + 300)).toMatch(/window\.appState\.triage\s*=\s*\{\}/);
  });

  it('every way of choosing a service goes through applyServiceChange', () => {
    // The tap, and Book Again. Assigning appState.service by hand skips the
    // clearing and leaks one job's answers into another.
    expect(src).toMatch(/applyServiceChange\(window\.appState,\s*svc\)/);
    expect(src).toMatch(/applyServiceChange\(window\.appState,\s*match\)/);
    expect(src).not.toMatch(/window\.appState\.service\s*=\s*(svc|match);/);
  });

  it('a card with nothing to unfold still goes straight on, as it always did', () => {
    const at = src.indexOf("svc?.name === 'Emergency Service'");
    expect(at, 'the card click handler moved').toBeGreaterThan(-1);
    const handler = src.slice(at, at + 3000);
    // if the questions unfold: scroll to them; else: straight to step 2.
    expect(handler).toMatch(
      /if \(showTriage\(card, svc\)\) \{[\s\S]*?\} else \{\s*renderStep2\(\);/
    );
  });

  it('when the questions unfold, the card scrolls itself to the top: the one scroll that counts', () => {
    // Pairs with "programmatic card taps leave the scrolling to the card
    // handler" above, which proves nobody scrolls after this.
    const at = src.indexOf('if (showTriage(card, svc)) {');
    expect(at, 'the card click handler moved').toBeGreaterThan(-1);
    const branch = src.slice(at, src.indexOf('} else {', at));
    expect(branch).toMatch(/card\.scrollIntoView\(\{\s*block:\s*'start'/);
  });

  it('no caller scrolls a card right after clicking it', () => {
    // A third caller written like the two before it would bury the panel again.
    expect(src).not.toMatch(/\.click\(\);\s*\n?\s*\w+\.scrollIntoView/);
  });

  it('the code that records answers never touches Continue', () => {
    const fn = sliceFn('function bindTriage(');
    expect(fn).not.toContain('s1-continue');
    expect(fn).not.toContain('disabled');
  });

  it('the new copy exists in Spanish and Chinese', () => {
    for (const text of [
      'Help us bring the right part',
      'Optional. Skip anything you are not sure about.',
      'The bar tape we fit comes in black.',
    ]) {
      expect(src, `"${text}" is not in js/app.js`).toContain(text);
      expect(es[text], `es: ${text}`).toBeTruthy();
      expect(zh[text], `zh: ${text}`).toBeTruthy();
    }
  });
});

describe('the stylesheet', () => {
  const css = read('css/main.css');

  it('styles the panel and its chips with tokens, not colours', () => {
    const at = css.indexOf('.triage {');
    expect(at, '.triage is not styled').toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf('/* ── Desktop overrides', at));
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).not.toMatch(/rgba?\(/);
    expect(block).toContain('.triage__chip.is-on');
  });

  // The body of ONE rule. A regex that runs on from the selector to the next
  // "min-height" is satisfied by whichever rule comes after it - that is how
  // deleting the chip's own 44px used to pass on .triage__input's.
  const ruleOf = (selector) => {
    const escaped = selector.replace(/\./g, '\\.');
    const m = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    expect(m, `${selector} has no rule of its own in css/main.css`).not.toBeNull();
    return m[1];
  };

  it('a chip is a 44px touch target by its own rule', () => {
    expect(ruleOf('.triage__chip')).toMatch(/min-height:\s*44px/);
  });

  it('the notes field is 44px tall and 16px, so iOS does not zoom the page on focus', () => {
    const body = ruleOf('.triage__input');
    expect(body).toMatch(/min-height:\s*44px/);
    expect(body).toMatch(/font-size:\s*16px/);
  });

  it('ruleOf returns the rule asked for, not its neighbour', () => {
    // If it ever returned the wrong rule, the two tests above would pass on it.
    expect(ruleOf('.triage__chip')).toContain('border-radius: 22px');
    expect(ruleOf('.triage__chip')).not.toContain('font-size: 16px');
    expect(ruleOf('.triage__input')).toContain('border-radius: 8px');
  });
});
