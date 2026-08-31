// tests/unit/live-route.test.js
//
// Diego, watching his own booking go out: "cuando estaba en ruta tampoco vio ni
// una ruta ni un tiempo ni nada... no se vio eso en ni un momento... hay que
// arreglarlo. se debe ver el camino hacia el mechanico y la ubicacion del
// mechanico".
//
// He was right on both counts, and they are separate holes:
//   - NO route line had ever been drawn. Grep `polyline` in js/app.js before
//     this commit and every hit is an SVG icon.
//   - The ETA beside it was haversine distance over a fixed speed - "3.2 km
//     away" for an eight-kilometre drive.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { hasKey, dictBlock } from '../../scripts/lib/dict-keys.mjs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const eta = read('api/_eta.js');
const auth = read('api/auth.js');
const app = read('js/app.js');
const css = read('css/main.css');
const i18n = read('js/i18n.js');

describe('the router returns a real line', () => {
  it('asks for the geometry, not just a duration', () => {
    expect(eta).toMatch(/export async function drivingRouteGeometry\(/);
    expect(eta).toMatch(/\?overview=full&geometries=geojson/);
  });

  // GeoJSON is [lng, lat] and Leaflet wants [lat, lng]. Getting this backwards
  // draws a line through the Indian Ocean.
  it('and flips the coordinates for Leaflet, once', () => {
    expect(eta).toMatch(/\.map\(\(\[lng, lat\]\) => \[lat, lng\]\)/);
  });

  // The same calibration the coverage map prices on, imported rather than
  // repeated, so the map can never quote a rosier number than the quote did.
  it('applies the same traffic factor the pricing uses', () => {
    expect(eta).toMatch(/import \{ TRAFFIC_FACTOR \} from '\.\/_coverage\.js';/);
    expect(eta).toMatch(/Math\.round\(\(seconds \/ 60\) \* TRAFFIC_FACTOR\)/);
  });

  // A van that crept forward twenty metres is on the same road. Keying on its
  // exact fix would mean a cache entry per GPS tick and a call to a free
  // service every five seconds.
  it('caches on a coarse origin so a moving van does not hammer it', () => {
    expect(eta).toMatch(/\$\{a\[0\]\.toFixed\(3\)\},\$\{a\[1\]\.toFixed\(3\)\}/);
  });

  it('and never caches an outage as an answer', () => {
    const fn = eta.slice(eta.indexOf('export async function drivingRouteGeometry'));
    expect(fn).toMatch(/if \(!r\.ok\) return null; \/\/ transient - do NOT cache/);
  });
});

describe('the endpoint', () => {
  it('is its own role, authenticated by the tracking token', () => {
    expect(auth).toMatch(/if \(role === 'track-route'\) return handleTrackRoute\(req, res\);/);
    expect(auth).toMatch(/async function handleTrackRoute\(req, res\) \{/);
  });

  it('and is rate-limited with the other public endpoints', () => {
    expect(auth).toMatch(/role === 'track-route' \|\|/);
  });

  // A route drawn for a finished job, or one not yet dispatched, is a line to
  // nowhere.
  it('only answers while somebody is actually driving to you', () => {
    const fn = auth.slice(auth.indexOf('async function handleTrackRoute'));
    expect(fn.slice(0, 3000)).toMatch(/if \(!\['enroute', 'en_route'\]\.includes\(booking\.status\)\)/);
  });

  // Each of these is a normal state of the world, not a failure, and the client
  // is told which one so the map can keep its markers instead of showing an
  // error.
  it('every "no route" case is a 200 with a reason', () => {
    const fn = auth.slice(auth.indexOf('async function handleTrackRoute'));
    for (const reason of [
      'no-coordinates-column',
      'not-en-route',
      'address-not-geocoded',
      'no-mechanic-fix',
      'routing-failed',
    ]) {
      expect(fn, `missing reason ${reason}`).toMatch(new RegExp(reason));
    }
    expect(fn.slice(0, 4000)).not.toMatch(/status\(500\)/);
  });
});

describe('the client draws it', () => {
  it('a polyline, which did not exist before', () => {
    expect(app).toMatch(/window\.L\.polyline\(route\.coordinates, \{/);
  });

  // Leaflet renders polylines as SVG, so the colour comes from a token instead
  // of pinning another hex into js/app.js.
  it('coloured from a token, not a hex', () => {
    expect(app).toMatch(/className: 'track-route-line',/);
    expect(css).toMatch(/\.track-route-line \{[^}]*stroke: var\(--blue\)/s);
  });

  // Refitting on every refresh would fight the client each time they panned.
  it('frames the trip once, then leaves the map alone', () => {
    expect(app).toMatch(/if \(!_routeFitted\) \{/);
    expect(app).toMatch(/_routeFitted = true;/);
  });

  // The line barely changes between ticks and the router is a free service.
  it('and asks about once a minute, not on the 5s status poll', () => {
    expect(app).toMatch(/setInterval\(refreshRoute, 45000\)/);
    expect(app).toMatch(/clearInterval\(routeInterval\);/);
  });

  it('a route that cannot be drawn leaves the map working', () => {
    expect(app).toMatch(/if \(!route\?\.coordinates\?\.length\) return;/);
    expect(app).toMatch(/\[tracking\] could not draw the route:/);
  });
});

describe('the time beside it says what kind of time it is', () => {
  it('a real driving time is labelled by road', () => {
    expect(app).toMatch(/byRoad: true/);
    expect(app).toMatch(/translateValue\('by road'\)/);
  });

  // One of these numbers is measured and the other is a guess. The client is
  // entitled to know which one they are looking at.
  it('and the fallback says it is a straight line', () => {
    expect(app).toMatch(/translateValue\('straight line'\)/);
    expect(app).toMatch(/byRoad: false,/);
  });

  // A slow haversine repaint must not overwrite a true number that landed first.
  it('the guess never overwrites the measurement', () => {
    const fn = app.slice(app.indexOf('function updateETA(mechCoords)'));
    expect(fn.slice(0, 200)).toMatch(/if \(_routeShown\) return;/);
  });

  // This used to count occurrences of "'KEY':" in the file and call two of them
  // "all three languages". That proved neither WHICH dictionaries the key landed
  // in (docs/PENDIENTES.md 66) nor survived prettier unquoting an identifier-like
  // key - lint-staged rewrites 'ETA' to ETA on any commit that touches i18n.js,
  // and the count silently dropped to zero (docs/PENDIENTES.md 69). Ask each
  // dictionary by name instead.
  it('in all three languages', () => {
    for (const key of ['by road', 'straight line', 'Mechanic is right outside!', 'ETA']) {
      for (const lang of ['es', 'zh']) {
        expect(hasKey(dictBlock(i18n, lang), key), `${key} missing from ${lang}`).toBe(true);
      }
    }
  });
});
