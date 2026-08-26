// tests/unit/mechanic-app-polish.test.js
//
// Three things Diego hit inside the mechanic app during a real job:
//
//   "aparece ese mensaje en pc del gps cada ciertos segundos"
//   "la seccion complete que se abre tiene un scroll horizontal que no sirve de
//    nada cuando scroleo para abajo solo molesta"
//   "la navegacion para colocar la nueva fecha del siguiente servicio se ve
//    horrible en pc hay que arreglarlo y en celu igual se ve horrible"
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const mech = read('js/mechanic.js');
const css = read('css/mechanic.css');
const notify = read('api/_completion-notify.js');

describe('the GPS warning is told once, not every five seconds', () => {
  // sendLocation() runs on a 5s setInterval and EVERY failure raised a toast.
  // Only "permission denied" stopped the loop, so a TIMEOUT - what a machine
  // with no GPS returns, forever - fired one toast every five seconds for as
  // long as the job was en route.
  it('both failure paths go through the throttle', () => {
    expect(mech).toMatch(/function gpsToastOnce\(err\) \{/);
    // Exactly one direct call is allowed: the one inside the throttle itself.
    const raw = mech.match(/toast\(gpsErrorMessage\(err\)\)/g) || [];
    expect(raw, 'a failure path still toasts directly').toHaveLength(1);
    // Call sites only, not the declaration: watchPosition, sendLocation and
    // the permission request.
    expect((mech.match(/(?<!function )gpsToastOnce\(err\)/g) || []).length).toBe(3);
  });

  // Per kind, so "no signal" and "permission denied" are different news.
  it('once per kind of problem', () => {
    expect(mech).toMatch(/const kind = String\(err\?\.code \?\? 'unknown'\);/);
    expect(mech).toMatch(/if \(_gpsToastShown\.has\(kind\)\) return;/);
  });

  // A mechanic who rides out of a tunnel and back in has to be told again if it
  // breaks a second time - otherwise the throttle becomes a silence.
  it('and it resets when a fix actually lands', () => {
    expect(mech).toMatch(/if \(_gpsToastShown\.size\) _gpsToastShown = new Set\(\);/);
  });

  it('and on a new job', () => {
    const start = mech.slice(mech.indexOf('function startGPS(bookingId)'));
    expect(start.slice(0, 200)).toMatch(/_gpsToastShown = new Set\(\);/);
  });

  // Permission denied is still fatal to the loop: retrying cannot fix it.
  it('permission denied still stops sharing', () => {
    expect((mech.match(/if \(err\.code === 1\) stopGPS\(\);/g) || []).length).toBe(2);
  });
});

describe('the completion form does not scroll sideways', () => {
  it('the panel has no horizontal axis', () => {
    expect(mech).toMatch(/max-height:90vh;overflow-y:auto;overflow-x:hidden/);
  });

  // width="100%" is not a legal value for the canvas attribute - it takes an
  // integer number of pixels - and there was no CSS height at all, so on a 2x
  // screen the box rendered 240px tall because that is what canvas.height was.
  it('and the signature canvas has legal, explicit dimensions', () => {
    expect(mech).toMatch(/<canvas id="sig-canvas" width="600" height="120"/);
    expect(mech).toMatch(/max-width:100%;height:120px/);
    expect(mech).not.toMatch(/<canvas[^>]*width="100%"/);
  });
});

describe('the next-service date is chips, not a native picker', () => {
  it('the input is gone', () => {
    expect(mech).not.toMatch(/id="comp-next" type="date"/);
  });

  // Kept as a hidden field so submitComplete and the invoice read exactly what
  // they always read - the control changed, the data did not.
  it('but the field it wrote to is unchanged', () => {
    expect(mech).toMatch(/<input id="comp-next" type="hidden" value="">/);
    expect(mech).toMatch(/document\.getElementById\('comp-next'\)/);
  });

  it('three intervals and a way out', () => {
    for (const label of ['3 months', '6 months', '12 months', 'Not now']) {
      expect(mech, `missing ${label}`).toMatch(new RegExp(label));
    }
  });

  // en-CA is YYYY-MM-DD, which is the shape the field carried before. Sydney
  // time, because a mechanic finishing at 9pm must not book the next service a
  // day early.
  it('writes a real date in the shape the invoice expects', () => {
    expect(mech).toMatch(/d\.setMonth\(d\.getMonth\(\) \+ months\);/);
    expect(mech).toMatch(/toLocaleDateString\('en-CA', \{ timeZone: 'Australia\/Sydney' \}\)/);
  });

  // "Not now" writes an empty string, and nextServiceMessage() already treats
  // that as "no date" - so the invoice falls back to its generic line instead
  // of printing Invalid Date.
  it('and "Not now" is handled downstream, not just visually', () => {
    expect(mech).toMatch(/field\.value = '';/);
    expect(notify).toMatch(/if \(!nextServiceDate\) return 'We recommend a service check/);
  });

  it('only one chip is on at a time', () => {
    expect(mech).toMatch(/\.forEach\(\(b\) => b\.classList\.toggle\('is-on', b === el\)\);/);
  });

  // The mechanic is outdoors, in gloves, on a phone.
  it('and they are big enough to hit', () => {
    const chip = css.slice(css.indexOf('.next-chip {'), css.indexOf('.next-chip:hover'));
    expect(chip).toMatch(/min-height: 40px/);
  });

  it('with a visible focus state', () => {
    expect(css).toMatch(/\.next-chip:focus-visible \{[^}]*outline: 2px solid var\(--blue\)/s);
  });
});
