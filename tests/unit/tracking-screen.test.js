// tests/unit/tracking-screen.test.js
//
// Four things Diego found on the tracking screen the first time a real, paid
// booking reached it - the flow that 671 tests had never actually walked.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { dictSource, composedSource } from '../helpers/i18n-source.js';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const appjs = read('js/app.js');
const authjs = read('api/auth.js');
const mainCss = read('css/main.css');
// Un archivo por idioma desde el split del 01-sep-2026. Se componen con los
// marcadores viejos para que el recorte de abajo siga funcionando igual - y
// ahora el aislamiento es estructural: el contenido de `es` termina donde
// empieza el archivo de `zh`, asi que una traduccion china ya no puede
// satisfacer una afirmacion sobre el espanol (PENDIENTES 66).
const i18njs = ['  es: {', dictSource('es'), '  zh: {', dictSource('zh')].join('\n');

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
    expect(tracking).toMatch(/overflow-y:auto/);
  });

  // A flex item defaults to min-height:auto, which means "never shrink below
  // your content". A panel like that does not scroll - it pushes the buttons
  // off the screen instead, which is the exact thing overflow-y:auto is here
  // to prevent. The two only work together.
  it('and it is allowed to shrink, or overflow-y:auto does nothing', () => {
    expect(tracking).toMatch(/flex:1;min-height:0;overflow-y:auto/);
  });

  // Without a floor the map collapses to nothing when the panel is tall.
  it('the map keeps a minimum height', () => {
    expect(tracking).toMatch(/id="tracking-map" style="flex:1;min-height:30dvh/);
    expect(tracking).not.toMatch(/id="tracking-map" style="flex:1;min-height:0/);
  });
});

// The map used to be the ONLY thing that grew: flex:1 on the map, a fixed
// height on the panel. That reads as "the map gets whatever the panel does not
// need", and the panel's content is a fixed ~224px - so the taller the phone,
// the bigger the map. Measured at 63% of the screen on an iPhone 14 and 65% on
// a 14 Plus before this changed (2026-09-25).
//
// Both carrying flex:1 is what splits the space in half, and it is the whole
// fix. Take it off the panel and the map balloons back.
// The CSS above is only half the story, and for a while it was the half that
// did not matter. After Leaflet loads, renderTracking sets an explicit pixel
// height on the map and `flex:none` - Leaflet needs a definite size - so THAT
// is what really decides how big the map is.
//
// It used to size the map as "the screen minus whatever the bottom panel
// needs", reading the panel through `mapEl.nextElementSibling`. That stopped
// being the panel when the sr-only <p id="map-alt"> was added between them for
// audit point 15. The measured height was ~0, so the map took the whole screen
// minus the bars: 698px of map on an 844px iPhone (83%), with the Message and
// Share buttons rendered BELOW the fold on every size measured.
//
// Measured against production, 2026-09-25, before and after:
//   iPhone 14      698px (83%) -> 350px (41%)
//   iPhone SE      521px (78%) -> 261px (39%)
//   iPhone 14 Plus 750px (84%) -> 376px (42%)
//
// The first fix for Diego's report changed only the flex values in the
// template and did nothing, because this code overrode them a moment later.
describe('the runtime height of the map', () => {
  // Comments stripped first. The prose above and the comment in js/app.js both
  // NAME nextElementSibling to explain why it is gone, and a guard that scans
  // the raw source matches its own explanation and passes. Fifth time in this
  // repo (PENDIENTES 106, 107, 108).
  const stripComments = (s) => s.replace(/\/\/[^\r\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const sizing = stripComments(
    tracking.slice(tracking.indexOf('Set explicit pixel height'), tracking.indexOf('Init map'))
  );
  const trackingCode = stripComments(tracking);

  it('is a share of the viewport, not a measurement of another element', () => {
    expect(sizing).toMatch(/window\.innerHeight/);
    expect(sizing).toMatch(/available\s*\*\s*0\.\d+/);
  });

  // The specific trap: the element next to the map is the sr-only <p>, and
  // anything that walks to a sibling to measure it will silently measure that.
  it('never sizes itself from a sibling', () => {
    expect(sizing).not.toMatch(/nextElementSibling/);
    expect(trackingCode).not.toMatch(/nextElementSibling[\s\S]{0,400}getBoundingClientRect/);
  });

  // Under half, not half: the panel below carries the arrival time, the four
  // steps and the code box, and on an 844px phone a straight 50/50 left the
  // Message button 5px under the fixed nav. Measured against production.
  it('gives the panel a little more than the map', () => {
    const share = Number(sizing.match(/available\s*\*\s*(0\.\d+)/)[1]);
    expect(share).toBeLessThanOrEqual(0.5);
    expect(share, 'a map under a third of the screen stops being a map').toBeGreaterThan(0.3);
  });
});

describe('the map does not take over the screen', () => {
  const panelStart = tracking.indexOf('Bottom panel');

  it('the map grows', () => {
    expect(tracking).toMatch(/id="tracking-map" style="flex:1/);
  });

  it('and so does the panel, so they split the space instead of the map taking it', () => {
    const panel = tracking.slice(panelStart, panelStart + 900);
    expect(panel).toMatch(/style="flex:1;min-height:0/);
    // flex-shrink:0 is what it used to say. That is what let the map grow
    // unopposed, so it must not come back.
    expect(panel).not.toMatch(/style="flex-shrink:0/);
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
    expect(tracking).toMatch(/if \(!_mechanicMarker\) setEtaMessage\(/);
  });

  it('both strings are translated', () => {
    for (const k of ['Waiting for a mechanic', 'Assigned to your booking']) {
      const first = i18njs.indexOf(`'${k}':`);
      expect(first).toBeGreaterThan(-1);
      expect(i18njs.indexOf(`'${k}':`, first + 1)).toBeGreaterThan(-1);
    }
  });
});

// Diego, looking at a real booking in progress (2026-09-26): the card read
// "Diego" with "Dr. Bike Sydney" stacked under it, which is the fallback the
// meta line used when a mechanic has no completed jobs and no rating yet. The
// company name under the person's name tells the client nothing they did not
// already know - they booked it.
//
// And the three arrival numbers shared one cramped line on the right of that
// same card: "ETA 05:55 pm · 1876 min · 1889.2 km by road".
describe('who is coming, and when', () => {
  // HTML comments too, not just JS ones: this markup lives inside a template
  // literal, and the comment explaining why the company name went away names
  // it. Sixth time a guard in this repo has matched its own explanation.
  const stripComments = (s) =>
    s
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\/[^\r\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  const code = stripComments(tracking);

  it('labels the person instead of naming the company under them', () => {
    expect(tracking).toMatch(/>Your mechanic</);
    expect(code, 'the company name is back under the mechanic').not.toMatch(/Dr\. Bike Sydney/);
  });

  it('has no meta line left to fall back to it', () => {
    expect(code).not.toMatch(/mechanic-meta/);
  });

  it('gives the arrival time a line of its own', () => {
    expect(tracking).toMatch(/id="eta-time"/);
    expect(tracking).toMatch(/id="eta-label"/);
  });

  // The states with no clock to show - waiting, assigned, right outside - go
  // through one helper that hides the time rather than writing a sentence into
  // the slot where a time belongs.
  it('and hides it when there is no time to show', () => {
    expect(code).toMatch(/function setEtaMessage/);
    expect(code).toMatch(/timeEl\.style\.display = 'none'/);
  });

  // 1876 min is a true number that nobody reads as "31 hours".
  it('says hours once minutes stop being readable', () => {
    expect(code).toMatch(/function formatRideTime/);
    expect(code).toMatch(/Math\.floor\(m \/ 60\)/);
  });
});

// The one thing on this screen the client has to DO something with. It was a
// blue notice among blue notices; Diego asked for it to read as important.
describe('the arrival code', () => {
  it('stands apart from the blue, on the red tokens', () => {
    const badge = tracking.slice(tracking.indexOf('id="arrival-pin-badge"'), tracking.indexOf('id="arrival-pin-badge"') + 400);
    expect(badge).toMatch(/var\(--red-lt\)/);
    expect(badge).toMatch(/var\(--red-edge\)/);
  });

  // It is a centred block now, not a flex row, and showing it with 'flex'
  // would lay its three lines out side by side.
  it('is shown as a block, which is what its markup is', () => {
    expect(tracking).toMatch(/pinBadge\.style\.display = 'block'/);
  });
});
