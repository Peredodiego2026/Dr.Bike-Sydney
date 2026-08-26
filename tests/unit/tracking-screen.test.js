// tests/unit/tracking-screen.test.js
//
// Four things Diego found on the tracking screen the first time a real, paid
// booking reached it - the flow that 671 tests had never actually walked.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const appjs = read('js/app.js');
const authjs = read('api/auth.js');
const mainCss = read('css/main.css');
const i18njs = read('js/i18n.js');

const tracking = appjs.slice(
  appjs.indexOf('async function renderTracking'),
  appjs.indexOf('function renderMiniStars')
);

// The mechanic drives to the address the job was BOOKED for. Where the client's
// phone happens to be is a different question and nobody asked it. Diego booked
// Curl Curl from Hamilton Island and the map flew to Hamilton Island.
describe('the map shows the booked address, not the phone', () => {
  it('does not ask for the device location at all', () => {
    expect(tracking).not.toMatch(/navigator\.geolocation\.getCurrentPosition\(/);
    expect(tracking).not.toMatch(/enableHighAccuracy/);
  });

  it('places the pin from the booking row', () => {
    expect(tracking).toMatch(/const lat = Number\(booking\.address_lat\);/);
    expect(tracking).toMatch(/const lng = Number\(booking\.address_lng\);/);
    expect(tracking).toMatch(/clientCoords = \[lat, lng\];/);
  });

  // A half-written row would otherwise centre the map on NaN.
  it('ignores coordinates that are not numbers', () => {
    expect(tracking).toMatch(/if \(Number\.isFinite\(lat\) && Number\.isFinite\(lng\)\)/);
  });

  it('and the server actually sends them', () => {
    expect(authjs).toMatch(/baseCols \+ ',address_lat,address_lng'/);
  });
});

// The screen is height:100dvh; overflow:hidden because Leaflet needs a
// container of a known size. That is fine for the map and fatal for anything
// underneath it: the panel was simply cut off, buttons included.
describe('the bottom panel can be scrolled', () => {
  it('the screen itself still cannot scroll - Leaflet depends on that', () => {
    expect(mainCss).toMatch(/\[data-screen='tracking'\]\.active\s*\{[^}]*overflow: hidden/s);
    expect(mainCss).toMatch(/\[data-screen='tracking'\]\.active\s*\{[^}]*height: 100dvh/s);
  });

  it('so the panel scrolls instead', () => {
    expect(tracking).toMatch(/max-height:52dvh;overflow-y:auto/);
  });

  // Without a floor the map collapses to nothing when the panel is tall.
  it('the map keeps a minimum height', () => {
    expect(tracking).toMatch(/id="tracking-map" style="flex:1;min-height:34dvh/);
    expect(tracking).not.toMatch(/id="tracking-map" style="flex:1;min-height:0/);
  });
});

describe('it does not claim a mechanic is coming before one is', () => {
  it('starts as waiting, not as on the way', () => {
    expect(tracking).toMatch(/id="eta-text"[^>]*>Waiting for a mechanic</);
    expect(tracking).not.toMatch(/id="eta-text"[^>]*>On the way to you</);
  });

  it('says assigned once one accepts, until a position arrives', () => {
    expect(tracking).toMatch(/translateValue\('Assigned to your booking'\)/);
    // updateETA owns the text from the first real position onward.
    expect(tracking).toMatch(/if \(etaEl && !_mechanicMarker\)/);
  });

  it('both strings are translated', () => {
    for (const k of ['Waiting for a mechanic', 'Assigned to your booking']) {
      const first = i18njs.indexOf(`'${k}':`);
      expect(first).toBeGreaterThan(-1);
      expect(i18njs.indexOf(`'${k}':`, first + 1)).toBeGreaterThan(-1);
    }
  });
});
