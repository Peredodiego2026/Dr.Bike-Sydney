// tests/unit/coverage-resolution.test.js
//
// The rule that must never break: a lookup that FAILED is not a "no".
//
// The old design had two answers, covered and not-covered, so "I could not
// work out where this is" fell on the not-covered side and turned into a
// rejection. Measured on 2026-08-24 against production: 59 of the 92 suburbs
// that had a price in `callout_zones` were rejected at the address step
// because they were missing from `van_zones` - Parramatta, Castle Hill,
// Hornsby, Newport. Every one of those people had already been shown a price.
//
// resolveCoverage() is pure so these rules can be checked without a network,
// a database, or a routing service.

import { describe, it, expect } from 'vitest';
import {
  resolveCoverage,
  needsQuote,
  feeForMinutes,
  PERIMETER_MAX_MINUTES,
  VALID_FEES,
  BASE,
} from '../../api/_coverage.js';

describe('feeForMinutes - the ladder that reproduces the existing prices', () => {
  it('Northern Beaches, minutes from the base, stays $25', () => {
    expect(feeForMinutes(5)).toBe(25); // Dee Why
    expect(feeForMinutes(12)).toBe(25); // Manly
    expect(feeForMinutes(20)).toBe(25); // edge of the band
  });

  it('North Shore and Hornsby stay $35', () => {
    expect(feeForMinutes(21)).toBe(35);
    expect(feeForMinutes(30)).toBe(35); // Hornsby
    expect(feeForMinutes(32)).toBe(35);
  });

  it('the city stays $45', () => {
    expect(feeForMinutes(33)).toBe(45);
    expect(feeForMinutes(40)).toBe(45); // CBD across the Spit
    expect(feeForMinutes(45)).toBe(45);
  });

  it('past the perimeter there is no fee to quote', () => {
    expect(feeForMinutes(46)).toBe(null);
    expect(feeForMinutes(80)).toBe(null); // Katoomba
  });
});

describe('driving time decides, because distance would misprice it', () => {
  // Hornsby and the CBD sit about the same distance from Curl Curl in a
  // straight line, but one is motorway and the other is the Spit Bridge.
  // Pricing on kilometres would charge them the same.
  it('same km, different time, different fee', () => {
    const hornsby = resolveCoverage({ minutes: 30, km: 15 });
    const cbd = resolveCoverage({ minutes: 40, km: 14 });
    expect(hornsby.calloutFee).toBe(35);
    expect(cbd.calloutFee).toBe(45);
  });

  it('inside the perimeter is covered', () => {
    const r = resolveCoverage({ minutes: 44, km: 30 });
    expect(r.covered).toBe('in');
    expect(needsQuote(r)).toBe(false);
  });

  it('one minute past the perimeter becomes a quote, with no fee invented', () => {
    const r = resolveCoverage({ minutes: PERIMETER_MAX_MINUTES + 1, km: 50 });
    expect(r.covered).toBe('out');
    expect(r.calloutFee).toBe(null);
    expect(needsQuote(r)).toBe(true);
  });

  it('keeps km and minutes so the message to Diego can quote them', () => {
    const r = resolveCoverage({ minutes: 65, km: 78 });
    expect(r.minutes).toBe(65);
    expect(r.km).toBe(78);
  });
});

describe('routing unavailable: fall back to the priced zone', () => {
  it('a priced inner-city suburb is still covered at its own fee', () => {
    const r = resolveCoverage({
      minutes: null,
      zone: { calloutFee: 45, zoneName: 'City & Inner Sydney' },
    });
    expect(r.covered).toBe('in');
    expect(r.calloutFee).toBe(45);
    expect(r.basis).toBe('zone-fee');
  });

  it('a zone priced above the top band was always beyond the 45-minute line', () => {
    const r = resolveCoverage({
      minutes: null,
      zone: { calloutFee: 65, zoneName: 'Western Sydney (lejos) / St George' },
    });
    expect(r.covered).toBe('out');
    expect(needsQuote(r)).toBe(true);
  });
});

describe('nothing resolved - the layer this whole module exists for', () => {
  it('is never a rejection: the person keeps their booking', () => {
    const r = resolveCoverage({ minutes: null, zone: null });
    expect(r.covered).toBe('unknown');
    expect(r.covered).not.toBe('out');
  });

  // Diego's rule (2026-08-24): if we cannot work out what the trip costs, we
  // do not take the customer's money on a guess. An earlier draft charged the
  // cheapest band, which risked billing $25 for a trip to Katoomba and then
  // having to refund it.
  it('quotes NO fee - nothing is charged when we do not know the trip', () => {
    expect(resolveCoverage({}).calloutFee).toBe(null);
  });

  it('goes to the same free quote request as an out-of-perimeter address', () => {
    expect(needsQuote(resolveCoverage({}))).toBe(true);
  });

  it('says so, so a human can confirm the fee afterwards', () => {
    expect(resolveCoverage({}).basis).toBe('unresolved');
  });

  it('survives rubbish input instead of throwing on the booking path', () => {
    expect(resolveCoverage().covered).toBe('unknown');
    expect(resolveCoverage({ minutes: NaN }).covered).toBe('unknown');
    expect(resolveCoverage({ minutes: 'soon' }).covered).toBe('unknown');
    expect(resolveCoverage({ zone: { calloutFee: 'free' } }).covered).toBe('unknown');
    expect(needsQuote(null)).toBe(false);
    expect(VALID_FEES).toEqual([25, 35, 45]);
    expect(needsQuote(undefined)).toBe(false);
  });
});

describe('the base', () => {
  it('is Curl Curl, with coordinates every time is measured from', () => {
    expect(BASE.suburb).toBe('Curl Curl');
    expect(BASE.lat).toBeLessThan(-33);
    expect(BASE.lng).toBeGreaterThan(151);
  });
});

// ── Regression: the free-booking hole ────────────────────────────────────────
// Found reviewing this branch before merge (2026-08-24), self-inflicted.
//
// Once 'unknown' stopped quoting a fee, handleCreateBooking computed
// `calloutFee = coverage.calloutFee ?? 0` -> 0, and the payment block was
// gated on `calloutFee > 0`. So an address that could not be resolved skipped
// payment verification ENTIRELY and produced a booking with callout_fee 0 and
// no Stripe check. Free bookings, on the money path.
//
// Read as text because handleCreateBooking does real network and DB work -
// same approach as payment-amount-trust.test.js.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const authSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'api', 'auth.js'),
  'utf8'
);

describe('create-booking: an unresolved address can never be a free booking', () => {
  it('verifies any request that carries a payment, whatever the computed fee', () => {
    expect(authSrc).toMatch(/if \(!isAdmin && \(calloutFee > 0 \|\| hasPaymentRef\)\)/);
    // the old gate is what let a $0 fee skip verification
    expect(authSrc).not.toMatch(/if \(!isAdmin && calloutFee > 0\) \{/);
  });

  it('refuses an unresolved address that has no payment behind it', () => {
    expect(authSrc).toMatch(/if \(!hasPaymentRef && !isAdmin\)/);
  });

  it('only accepts a paid amount that is one of the real bands', () => {
    expect(authSrc).toMatch(/acceptablePaidCents/);
    expect(authSrc).toMatch(/VALID_FEES\.map/);
  });

  it('both public endpoints send unknown to the quote flow, not to a card', () => {
    const hits = authSrc.match(/covered: !needsQuote\(r\)/g) || [];
    expect(hits).toHaveLength(2); // check-coverage + zone-price
  });
});

// ── Regression: the external services must not be hammered ───────────────────
// Nominatim allows one request per second and asks that results be cached;
// OSRM's demo server promises nothing. The failure is silent - a rate-limited
// lookup returns null, coverage falls back to the zone table, and a customer
// who should have been quoted lands in the manual queue with nobody the wiser.
const etaSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'api', '_eta.js'),
  'utf8'
);
const appSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'js', 'app.js'),
  'utf8'
);

describe('address lookups are cached and made from one place', () => {
  it('the browser never calls Nominatim itself any more', () => {
    const realCalls = appSrc
      .split('\n')
      .filter((l) => /nominatim/i.test(l) && !l.trim().startsWith('//'));
    expect(realCalls).toEqual([]);
  });

  it('autocomplete goes through our own endpoint, which is registered', () => {
    expect(appSrc).toMatch(/role: 'address-suggest'/);
    expect(authSrc).toMatch(/role === 'address-suggest'/);
  });

  it('geocode, route and suggest all read the cache before the network', () => {
    for (const kind of ['geocode', 'route', 'suggest']) {
      expect(etaSrc.includes(`cacheGet('${kind}'`)).toBe(true);
    }
  });

  it('a remembered miss expires sooner than a hit, so a fixed address recovers', () => {
    expect(etaSrc).toMatch(/MISS_TTL_DAYS = 7/);
    expect(etaSrc).toMatch(/CACHE_TTL_DAYS = 90/);
  });

  it('a service outage is not cached as if it were an answer', () => {
    expect(etaSrc).toMatch(/if \(!r\.ok\) return null; \/\/ transient - do NOT cache/);
  });

  it('the route key includes the origin, so a second van cannot inherit times', () => {
    expect(etaSrc).toMatch(/const routeKey = `\$\{lat\.toFixed\(4\)\},\$\{lng\.toFixed\(4\)\}/);
  });

  it('a cache failure never breaks a booking', () => {
    expect(etaSrc).toMatch(/a cache that cannot be written is still a working app/);
  });
});
