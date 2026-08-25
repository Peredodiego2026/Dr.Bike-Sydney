// Whether we go to an address, and what the trip costs.
//
// This replaces a suburb-name whitelist that decided both. That design failed
// in both directions at once (measured 2026-08-24): of the 92 suburbs priced
// in `callout_zones`, 59 had no matching row in `van_zones` and were REJECTED
// after being quoted a price - Parramatta, Castle Hill, Hornsby, Newport. And
// 13 suburbs in `van_zones` were missing from `callout_zones`, so Balmain,
// Potts Point, North Sydney and Maroubra were served at the $20 fallback
// instead of their real $45. Two hand-typed lists that had to agree, and did
// not.
//
// The rule now: DRIVING TIME from the base decides. Diego's own prices were
// already a time ladder (Northern Beaches $25 is 10 min away, the CBD $45 is
// 40 min across the Spit) - they just were not being computed that way. A
// straight-line distance would have broken them: Hornsby and the CBD are both
// ~15 km out, but one is 30 minutes of motorway and the other 40 of bridge.
//
// Three layers, and the last one is the point: NOTHING is rejected because a
// lookup failed. A person in Dee Why who types "154 pacific pde" must not be
// turned away because a geocoder did not recognise the street.

// Curl Curl - where the van starts its day. Every time below is measured from
// here. When a second van gets its own base, this becomes a list and the
// nearest base wins; the arithmetic does not change.
export const BASE = { suburb: 'Curl Curl', lat: -33.7688, lng: 151.2926 };

// ── The clock ─────────────────────────────────────────────────────────────
//
// OSRM's public server routes on free-flow speeds: it assumes empty roads. It
// is not wrong, it is answering a different question than the one Diego asks
// himself when he decides whether a job is worth driving to.
//
// Calibrated against Google on the one route we have both numbers for
// (25-aug-2026, Curl Curl to Palm Beach): Google 46 min, OSRM 36 min. So the
// router runs about 28% fast. Every threshold below is written in REAL
// minutes - the ones Diego means when he says "45 minutes maximum" - and the
// router's answer is converted once, here, on the way in.
//
// This is ONE measured point. If a second Google/OSRM pair ever gets
// recorded, average them and update this number - do not add a second factor
// somewhere else.
export const TRAFFIC_FACTOR = 1.28;

export function toRealMinutes(routerMinutes) {
  if (!Number.isFinite(routerMinutes)) return null;
  return routerMinutes * TRAFFIC_FACTOR;
}

// Diego's hard limit, in real minutes with traffic. Past this an on-demand
// visit costs more than it earns: a 130 km round trip is $96 out of pocket
// (diesel at $2.47/L over 11 km/L, plus tyres, servicing, depreciation,
// insurance) or $114 on the ATO's per-km rate, plus motorway tolls - against
// a $45 call-out. And that ignores the unpaid driving hours, which is the
// larger loss: the same hours do three jobs on the Northern Beaches.
//
// He set it knowing it stretches: "con trafico las zonas a 45 min seran de 1
// hora". 45 is the planning number, not the worst case.
export const PERIMETER_MAX_MINUTES = 45;

// Two bands, in real minutes. This replaces a three-band ladder whose middle
// step ($35 up to 32 ROUTER minutes) silently repriced the whole middle ring:
// the CBD measures 25 router minutes, so it was being charged $35 when
// `callout_zones` - and this file's own comment - said $45. Same for North
// Sydney, Chatswood, Bondi Junction and Lane Cove.
export const FEE_BANDS = [
  { maxMinutes: 25, fee: 25 },
  { maxMinutes: PERIMETER_MAX_MINUTES, fee: 45 },
];

// The fees a booking is ever allowed to be charged. Used to sanity-check a
// payment that arrives while the address cannot be re-resolved (see
// handleCreateBooking): anything not on this list is refused.

// ── The far peninsula ─────────────────────────────────────────────────────
//
// North of Mona Vale the time bands get it wrong, and the reason is the map:
// Barrenjoey Road is the only road up, it runs the length of the peninsula,
// and Palm Beach is 46 minutes from Curl Curl - one minute past the perimeter.
// Measured, not guessed (Google, 25-aug-2026: Curl Curl to Palm Beach, 46 min
// / 30.7 km). So the tip of Diego's own peninsula was being told we do not
// come, and Whale Beach was priced at $45, like a trip across the Spit to the
// CBD.
//
// It is not the same kind of trip. No bridge, no tolls, no city traffic, one
// straight road through the suburbs the van already works in. It is the home
// corridor, and it is capped at $35 however far up it goes.
//
// Coded here and not in a table on purpose. Diego asked for this to be "by
// zone" so it can never error: a routing service that is down, a geocoder
// that has never heard of Careel Bay, a database that times out - none of
// them can turn a Palm Beach address into a rejection, because none of them
// are consulted. The postcode or the suburb name is enough.
export const PENINSULA_FAR_FEE = 35;

// 2104 Bayview, 2105 Church Point and the offshore communities, 2106 Newport,
// 2107 Avalon Beach and neighbours, 2108 Palm Beach and Whale Beach.
export const PENINSULA_FAR_POSTCODES = new Set(['2104', '2105', '2106', '2107', '2108']);

export const PENINSULA_FAR_SUBURBS = new Set([
  'bayview',
  'church point',
  'scotland island',
  'elvina bay',
  'lovett bay',
  'morning bay',
  'newport',
  'newport beach',
  'bilgola',
  'bilgola beach',
  'bilgola plateau',
  'avalon',
  'avalon beach',
  'north avalon',
  'clareville',
  'careel bay',
  'whale beach',
  'palm beach',
  'coasters retreat',
  'great mackerel beach',
  'mackerel beach',
]);

// A street can be named after a suburb - "12 Newport Rd, Dee Why" is Dee Why,
// not Newport - so a bare substring search would overcharge the wrong people.
// The suburb is matched only as a WHOLE comma-separated part of the address,
// which is how Nominatim returns it and how people write it. The postcode is
// checked first: it is the one part of an Australian address that cannot be
// ambiguous.
function matchZoneList(address, postcodes, suburbs) {
  if (!address || typeof address !== 'string') return null;
  const lower = address.toLowerCase();

  for (const pc of lower.match(/\b\d{4}\b/g) || []) {
    if (postcodes.has(pc)) return 'postcode';
  }

  const parts = lower
    .split(',')
    .map((part) =>
      part
        .replace(/\b(nsw|new south wales|australia)\b/g, '')
        .replace(/\b\d{4}\b/g, '')
        .trim()
    )
    .filter(Boolean);
  for (const part of parts) {
    if (suburbs.has(part)) return 'suburb';
  }
  return null;
}

export function matchFarPeninsula(address) {
  const how = matchZoneList(address, PENINSULA_FAR_POSTCODES, PENINSULA_FAR_SUBURBS);
  return how ? { fee: PENINSULA_FAR_FEE, basis: `peninsula-${how}` } : null;
}

// PENINSULA_FAR_FEE has to be in here explicitly. It used to arrive by
// accident, because $35 happened to be the middle band's price; collapsing to
// two bands would have dropped it, and a Palm Beach customer who paid $35 and
// then hit a geocoder outage would have had a perfectly good payment refused.
export const VALID_FEES = [...new Set([...FEE_BANDS.map((b) => b.fee), PENINSULA_FAR_FEE])].sort(
  (a, b) => a - b
);

// ── The near half of the north corridor ───────────────────────────────────
//
// Terrey Hills measures 26 real minutes - one minute past the $25 band - and
// without this it would cost the same as the Sydney CBD. It is the same road
// the van already drives to Frenchs Forest, in the same council area, with no
// bridge and no toll. The clock alone gets it wrong for exactly the reason the
// peninsula gets it wrong: what a trip costs is not only how long it takes.
//
// Postcode 2084 is Terrey Hills, Duffys Forest and Cottage Point. Cottage
// Point is further out than the others and $25 is generous there - it is four
// streets at the end of a dead end and it will almost never come up. Being
// generous in his own council is the right side to err on.
export const NORTH_NEAR_FEE = 25;
export const NORTH_NEAR_POSTCODES = new Set(['2084']);
export const NORTH_NEAR_SUBURBS = new Set([
  'terrey hills',
  'duffys forest',
  'cottage point',
  'ingleside',
]);

export function matchNearNorth(address) {
  return matchZoneList(address, NORTH_NEAR_POSTCODES, NORTH_NEAR_SUBURBS)
    ? { fee: NORTH_NEAR_FEE, basis: 'north-corridor' }
    : null;
}

export function feeForMinutes(minutes) {
  const band = FEE_BANDS.find((b) => minutes <= b.maxMinutes);
  return band ? band.fee : null;
}

// "1h 5min" rather than "65 min" - Diego reads these on a phone while deciding
// whether a job is worth the drive, and hours are what he thinks in.
export function formatMinutes(minutes) {
  // Number(null) is 0, not NaN, so a missing value has to be rejected BEFORE
  // the conversion - otherwise "no route" renders as "0min" in a message to
  // Diego, which reads like the job is next door.
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) return '';
  const m = Math.round(minutes);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}min` : `${h}h`;
}

// Decides coverage from whatever the lookups managed to return. Pure, so the
// rules can be tested without a network or a database.
//
//   minutes - real driving minutes from BASE, or null if routing failed
//   zone    - a `callout_zones` match ({ calloutFee, zoneName }), or null
//   km      - road distance, for the message to Diego. Never affects the price.
//   address - the raw address text, for the far-peninsula match (Layer 0).
//
// Returns { covered, calloutFee, minutes, km, zoneName, basis }.
// `covered` is deliberately three-valued: 'in' | 'out' | 'unknown'.
// 'unknown' does NOT mean rejected: the person keeps their booking and ends
// on a free quote request, exactly like an out-of-perimeter address.
export function resolveCoverage({ minutes = null, zone = null, km = null, address = null } = {}) {
  // `minutes` arrives from the router, which assumes empty roads. Everything
  // below - the bands, the perimeter, the number Diego reads in his WhatsApp
  // message - is in REAL minutes. Converted once, here.
  const real = toRealMinutes(minutes);
  const mins = real === null ? null : Math.round(real);
  const distanceKm = Number.isFinite(km) ? Math.round(km) : null;

  // Layer 0: the two hand-drawn zones, decided by postcode or suburb name
  // alone. They run FIRST and they are the only layers that can overrule the
  // clock, because the clock cannot see that a road has no bridge and no toll.
  // Palm Beach is 46 real minutes and would otherwise be refused for being one
  // minute too far up a road the van drives anyway; Terrey Hills is 26 and
  // would cost the same as the CBD. Nothing here depends on a network call,
  // which is the whole point - see matchZoneList.
  const north = matchNearNorth(address);
  if (north) {
    return {
      covered: 'in',
      calloutFee: north.fee,
      minutes: mins,
      km: distanceKm,
      zoneName: zone?.zoneName ?? 'Northern Beaches',
      basis: north.basis,
    };
  }

  const peninsula = matchFarPeninsula(address);
  if (peninsula) {
    return {
      covered: 'in',
      calloutFee: peninsula.fee,
      minutes: mins,
      km: distanceKm,
      zoneName: zone?.zoneName ?? 'Northern Beaches (far)',
      basis: peninsula.basis,
    };
  }

  // Layer 1: real driving time. The only measure that matches what the trip
  // actually costs, so it wins whenever it is available.
  if (mins !== null) {
    if (mins > PERIMETER_MAX_MINUTES) {
      return {
        covered: 'out',
        calloutFee: null,
        minutes: mins,
        km: distanceKm,
        zoneName: zone?.zoneName ?? null,
        basis: 'driving-time',
      };
    }
    return {
      covered: 'in',
      calloutFee: feeForMinutes(mins),
      minutes: mins,
      km: distanceKm,
      zoneName: zone?.zoneName ?? null,
      basis: 'driving-time',
    };
  }

  // Layer 2: routing was unavailable, but the suburb is one we have priced.
  // The fee is trusted as-is. Whether it is inside the perimeter is inferred
  // from that fee: the bands above stop at $45, so a zone priced higher was
  // always a trip beyond the 45-minute line.
  if (zone && Number.isFinite(Number(zone.calloutFee))) {
    const fee = Number(zone.calloutFee);
    const maxInPerimeterFee = FEE_BANDS[FEE_BANDS.length - 1].fee;
    if (fee > maxInPerimeterFee) {
      return {
        covered: 'out',
        calloutFee: null,
        minutes: null,
        km: null,
        zoneName: zone.zoneName ?? null,
        basis: 'zone-fee',
      };
    }
    return {
      covered: 'in',
      calloutFee: fee,
      minutes: null,
      km: null,
      zoneName: zone.zoneName ?? null,
      basis: 'zone-fee',
    };
  }

  // Layer 3: nothing resolved. A typo, a new estate, a geocoder that was down,
  // an address written in a way nobody anticipated.
  //
  // No fee is quoted and NOTHING is charged. Diego's rule, and the right one:
  // if we cannot work out what the trip costs, we do not take the customer's
  // money on a guess - we ask. An earlier draft charged the cheapest band and
  // confirmed by hand, which risked billing $25 for a trip to Katoomba and
  // then having to refund it.
  //
  // This is still NOT a rejection. The person keeps their whole booking and
  // ends on the same quote request as an out-of-perimeter address: their
  // details reach Diego, he answers personally. Nobody is turned away.
  return {
    covered: 'unknown',
    calloutFee: null,
    minutes: null,
    km: null,
    zoneName: null,
    basis: 'unresolved',
  };
}

// True when the booking should ask for a quote instead of taking a card.
// Covers BOTH "we know it is too far" and "we could not work out where it is":
// in either case we do not know what the trip costs, so we do not charge for
// it. The customer's experience is the same - no card, a message to Diego.
export function needsQuote(resolution) {
  return resolution?.covered === 'out' || resolution?.covered === 'unknown';
}
