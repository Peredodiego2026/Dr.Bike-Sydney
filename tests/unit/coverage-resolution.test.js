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
  TRAFFIC_FACTOR,
  toRealMinutes,
  FEE_BANDS,
  matchNearNorth,
  matchFarPeninsula,
  PENINSULA_FAR_FEE,
  VALID_FEES,
  BASE,
} from '../../api/_coverage.js';

describe('feeForMinutes - the ladder that reproduces the existing prices', () => {
  it('Northern Beaches, minutes from the base, stays $25', () => {
    expect(feeForMinutes(5)).toBe(25); // Dee Why
    expect(feeForMinutes(12)).toBe(25); // Manly
    expect(feeForMinutes(20)).toBe(25); // edge of the band
  });

  // feeForMinutes takes REAL minutes now. The middle band is gone: it was
  // $35 up to 32 ROUTER minutes, and the CBD measures 25 router minutes, so
  // the whole middle ring - CBD, North Sydney, Chatswood, Bondi Junction -
  // was quietly being charged $35 where callout_zones said $45.
  it('everything past 25 real minutes is $45, including the city', () => {
    expect(feeForMinutes(26)).toBe(45);
    expect(feeForMinutes(32)).toBe(45); // Sydney CBD
    expect(feeForMinutes(45)).toBe(45); // Coogee, right on the line
  });

  it('$35 is not a time band any more - only the peninsula charges it', () => {
    expect(FEE_BANDS.map((b) => b.fee)).toEqual([25, 45]);
    expect(feeForMinutes(30)).not.toBe(35);
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
    // 14 router minutes is ~18 real: inside the $25 band. 30 router minutes
    // is ~38 real: the city band. Nearly identical distances, different trips.
    const near = resolveCoverage({ minutes: 14, km: 15 });
    const cbd = resolveCoverage({ minutes: 30, km: 14 });
    expect(near.calloutFee).toBe(25);
    expect(cbd.calloutFee).toBe(45);
  });

  it('inside the perimeter is covered', () => {
    // 34 router minutes is 44 real - just inside Diego's 45-minute limit.
    const r = resolveCoverage({ minutes: 34, km: 30 });
    expect(r.covered).toBe('in');
    expect(needsQuote(r)).toBe(false);
  });

  it('one minute past the perimeter becomes a quote, with no fee invented', () => {
    const r = resolveCoverage({ minutes: (PERIMETER_MAX_MINUTES + 1) / TRAFFIC_FACTOR, km: 50 });
    expect(r.covered).toBe('out');
    expect(r.calloutFee).toBe(null);
    expect(needsQuote(r)).toBe(true);
  });

  // The minutes Diego reads are the REAL ones, not the router's. He is
  // deciding whether the drive is worth it; free-flow minutes would undersell
  // it by nearly a third.
  it('reports real minutes and km so the message to Diego can quote them', () => {
    const r = resolveCoverage({ minutes: 65, km: 78 });
    expect(r.minutes).toBe(Math.round(65 * TRAFFIC_FACTOR));
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
    // Matched on the operands rather than the whole line. The gate gained a
    // `!holdOnly` term when slot holds landed (api/_slot-hold.js), and pinning
    // the exact text made a correct change look like a regression. What must
    // never move is that BOTH a real fee and a payment reference still force
    // verification.
    expect(authSrc).toMatch(/if \([^)]*!isAdmin && \(calloutFee > 0 \|\| hasPaymentRef\)\)/);
    // the old gate is what let a $0 fee skip verification
    expect(authSrc).not.toMatch(/if \(!isAdmin && calloutFee > 0\) \{/);
  });

  // The only way `!holdOnly` could weaken the gate above is a request that
  // claims to be a hold AND carries a payment. That is refused outright, so the
  // invariant keeps having no exceptions rather than one carefully-reasoned one.
  it('refuses a hold that carries a payment, instead of skipping verification', () => {
    expect(authSrc).toMatch(/if \(holdOnly && hasPaymentRef\)/);
    expect(authSrc).toContain('A hold cannot carry a payment');
  });

  it('refuses an unresolved address that has no payment behind it', () => {
    // `&& !holdOnly` joined this condition when slot holds landed. A hold never
    // carries a payment by definition, so without the exemption every address
    // the geocoder could not resolve would be turned away before the client
    // could pay for it - losing bookings that are servable by hand.
    //
    // What must not move: with a REAL booking and no payment, this still
    // refuses. The check runs again on the paying call, where hasPaymentRef is
    // true, which is the condition that was always required.
    expect(authSrc).toMatch(/if \(!hasPaymentRef && !isAdmin( && !holdOnly)?\)/);
    // And the exemption must be exactly that - never a blanket removal.
    expect(authSrc).not.toMatch(/if \(!isAdmin\) \{[\s\S]{0,80}couldn't work out the trip/);
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

// ── The far peninsula ──────────────────────────────────────────────────────
//
// Diego lives on the Northern Beaches and the van starts its day in Curl Curl,
// yet the tip of his own peninsula was the one place the app refused. Palm
// Beach is 46 minutes up Barrenjoey Road - one minute past the 45-minute
// perimeter - so it resolved to 'out' and got a quote request instead of a
// price. Whale Beach, 33 minutes, was charged $45: the band meant for a trip
// across the Spit Bridge into the CBD.
//
// The rule Diego asked for on 25-aug-2026: the north splits in two. Up to 20
// minutes is $25, and everything beyond that to the far tip is $35 - one road,
// no bridge, no tolls, the suburbs the van already works in.
describe('the far peninsula is $35 to the tip, not a rejection', () => {
  const far = [
    ['Palm Beach', '1 Barrenjoey Rd, Palm Beach NSW 2108', 46],
    ['Whale Beach', 'Whale Beach NSW 2108', 33],
    ['Avalon Beach', '20 Old Barrenjoey Rd, Avalon Beach NSW 2107', 27],
    ['Newport', 'Newport NSW 2106', 22],
    ['Bayview', '3 Cabbage Tree Rd, Bayview NSW 2104', 21],
    ['Church Point', 'Church Point NSW 2105', 25],
  ];

  it.each(far)('%s is covered at $35', (_name, address, minutes) => {
    const r = resolveCoverage({ address, minutes, km: 25 });
    expect(r.covered).toBe('in');
    expect(r.calloutFee).toBe(35);
    expect(needsQuote(r)).toBe(false);
  });

  // The whole reason this lives in code and not in a table. Diego's words:
  // it must never error. Every lookup can fail at once and Palm Beach still
  // has a price.
  it.each(far)('%s still resolves with no routing and no zone row', (_name, address) => {
    const r = resolveCoverage({ address, minutes: null, km: null, zone: null });
    expect(r.covered).toBe('in');
    expect(r.calloutFee).toBe(35);
  });

  it('Palm Beach past the perimeter is covered anyway - it was the bug', () => {
    const r = resolveCoverage({ address: 'Palm Beach NSW 2108', minutes: 46, km: 31 });
    expect(46).toBeGreaterThan(PERIMETER_MAX_MINUTES);
    expect(r.covered).toBe('in');
  });

  it('the near half of the north is still $25 - Mona Vale is inside 20 min', () => {
    const r = resolveCoverage({ address: '5 Bungan St, Mona Vale NSW 2103', minutes: 17, km: 11 });
    expect(r.calloutFee).toBe(25);
  });

  // A street named after a suburb must not reprice the address. "12 Newport
  // Rd, Dee Why" is a $25 trip to Dee Why; matching 'newport' anywhere in the
  // string would have billed it $35.
  it('a street named after a peninsula suburb does not move the fee', () => {
    const r = resolveCoverage({ address: '12 Newport Rd, Dee Why NSW 2099', minutes: 8, km: 4 });
    expect(r.calloutFee).toBe(25);
    expect(r.basis).toBe('driving-time');
  });

  it('Church Point does not match "291 Church St, Parramatta"', () => {
    expect(matchFarPeninsula('291 Church St, Parramatta NSW 2150')).toBeNull();
    const r = resolveCoverage({
      address: '291 Church St, Parramatta NSW 2150',
      minutes: 52,
      km: 41,
    });
    expect(r.covered).toBe('out');
  });

  it('leaves everywhere else alone', () => {
    expect(matchFarPeninsula('Sydney NSW 2000')).toBeNull();
    expect(matchFarPeninsula('Dee Why NSW 2099')).toBeNull();
    expect(matchFarPeninsula('')).toBeNull();
    expect(matchFarPeninsula(null)).toBeNull();
    expect(matchNearNorth('Sydney NSW 2000')).toBeNull();
    expect(resolveCoverage({ address: 'Sydney NSW 2000', minutes: 25, km: 18 }).calloutFee).toBe(
      45
    );
  });

  it('$35 is a fee a booking is allowed to be charged', () => {
    expect(VALID_FEES).toContain(PENINSULA_FAR_FEE);
  });
});

// ── The clock, and the leak it was hiding ─────────────────────────────────
//
// OSRM routes on empty roads. Measured against Google on 25-aug-2026 for the
// one route we have both numbers for - Curl Curl to Palm Beach - the router
// says 36 minutes and Google says 46. Everything the app decided was being
// decided on a clock running 28% fast.
//
// The damage was not at the far edge, it was in the middle ring. The old
// bands charged $35 up to 32 ROUTER minutes; the Sydney CBD measures 25. So
// the CBD, North Sydney, Chatswood, Lane Cove and Bondi Junction were all
// being charged $35 where `callout_zones` - and this file's own comment -
// said $45. Nobody noticed because nothing errored.
describe('real minutes, not free-flow minutes', () => {
  const router = (real) => real / TRAFFIC_FACTOR;

  it('the CBD is $45 again - it was quietly dropped to $35', () => {
    // 25 router minutes, which is what OSRM actually returns for the CBD
    const r = resolveCoverage({ address: 'Sydney NSW 2000', minutes: 25, km: 18 });
    expect(r.calloutFee).toBe(45);
    expect(r.minutes).toBe(32);
  });

  it.each([
    ['North Sydney', 21],
    ['Chatswood', 22],
    ['Lane Cove', 25],
    ['St Ives', 25],
    ['Bondi Junction', 32],
  ])('%s goes back to $45', (_name, routerMins) => {
    expect(resolveCoverage({ minutes: routerMins, km: 20 }).calloutFee).toBe(45);
  });

  it.each([
    ['Dee Why', 6],
    ['Manly', 8],
    ['Frenchs Forest', 11],
    ['Mosman', 16],
    ['Mona Vale', 18],
    ['Neutral Bay', 19],
  ])('%s stays $25', (_name, routerMins) => {
    expect(resolveCoverage({ minutes: routerMins, km: 10 }).calloutFee).toBe(25);
  });

  it('the perimeter is 45 REAL minutes, so it bites earlier than it used to', () => {
    // Randwick: 36 router minutes. Under the old clock that was inside the
    // 45-minute perimeter and cost $45. It is 46 real minutes.
    const randwick = resolveCoverage({ address: 'Randwick NSW 2031', minutes: 36, km: 29 });
    expect(randwick.covered).toBe('out');
    expect(needsQuote(randwick)).toBe(true);
    // Coogee is one router minute further out but lands exactly on the line.
    expect(resolveCoverage({ minutes: 35, km: 26 }).calloutFee).toBe(45);
  });

  it('rejects a non-number instead of turning it into zero', () => {
    expect(toRealMinutes(null)).toBeNull();
    expect(toRealMinutes(undefined)).toBeNull();
    expect(toRealMinutes(NaN)).toBeNull();
    expect(toRealMinutes(0)).toBe(0);
  });

  it('a trip Diego reads about is quoted in real minutes', () => {
    expect(Math.round(router(45) * TRAFFIC_FACTOR)).toBe(45);
  });
});

// The other hand-drawn zone. Terrey Hills is 26 real minutes - one minute
// past the $25 band - and without this it would cost the same as the CBD,
// despite being the same council, the same road, no bridge and no toll.
describe('the near half of the north corridor is $25', () => {
  it.each([
    ['12 Myoora Rd, Terrey Hills NSW 2084', 20],
    ['Terrey Hills', null],
    ['Duffys Forest NSW 2084', 24],
    ['Ingleside, NSW', null],
  ])('%s is $25', (address, minutes) => {
    const r = resolveCoverage({ address, minutes, km: 17 });
    expect(r.covered).toBe('in');
    expect(r.calloutFee).toBe(25);
  });

  it('does not reach past the corridor', () => {
    expect(matchNearNorth('Sydney NSW 2000')).toBeNull();
    expect(matchNearNorth('Hornsby NSW 2077')).toBeNull();
    expect(matchNearNorth('Palm Beach NSW 2108')).toBeNull();
    expect(matchNearNorth(null)).toBeNull();
  });

  // "5 Terrey St, Bondi" must not become a $25 trip to Terrey Hills.
  it('a street name does not move the fee', () => {
    expect(matchNearNorth('5 Terrey Hills Rd, Bondi NSW 2026')).toBeNull();
  });
});

// The set of amounts a payment is allowed to be when the address cannot be
// re-resolved. $35 used to be in here by accident - it was the middle band's
// price. Collapsing to two bands would have dropped it, and a Palm Beach
// customer who paid $35 and then hit a geocoder outage would have had a
// perfectly good payment refused.
describe('every fee the app can quote is a fee it can accept', () => {
  it('holds all three, including the peninsula', () => {
    expect(VALID_FEES).toEqual([25, 35, 45]);
  });

  it.each([
    ['Palm Beach NSW 2108', 36],
    ['Terrey Hills NSW 2084', 20],
    ['Sydney NSW 2000', 25],
    ['Dee Why NSW 2099', 6],
  ])('%s quotes a fee that is on the list', (address, minutes) => {
    const fee = resolveCoverage({ address, minutes, km: 20 }).calloutFee;
    expect(VALID_FEES).toContain(fee);
  });
});
