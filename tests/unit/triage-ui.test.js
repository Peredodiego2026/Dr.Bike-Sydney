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
function boot(stored = {}) {
  const store = new Map(Object.entries(stored));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const ctx = vm.createContext({ window: {}, localStorage, questionsFor, console, Date });

  // Function declarations are hoisted in the real module, and the restore that
  // runs at load already calls askedAnswers - so they go in first here.
  for (const head of [
    'function escapeHtml(',
    'function askedAnswers(',
    'function applyServiceChange(',
    'function setTriageAnswer(',
    'function renderTriage(',
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
    b.saveBookingDraft('triage');
    const saved = JSON.parse(b.store.get('drbike-booking-draft'));
    expect(saved.triage).toEqual({ brand: 'Shimano' });
    expect(saved.service.name).toBe('Brake Pad Install');
  });

  it('comes back after a reload', () => {
    const first = boot();
    first.state.service = pads;
    first.state.triage = { brand: 'Shimano', brake_model: 'SLX' };
    first.saveBookingDraft('triage');

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
    expect(block).toMatch(/\.triage__chip[\s\S]*min-height:\s*44px/);
    expect(block).toContain('.triage__chip.is-on');
  });
});
