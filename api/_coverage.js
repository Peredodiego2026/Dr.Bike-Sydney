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

// Past this, an on-demand visit costs more than it earns. Worked out from the
// van's real running cost: a 130 km round trip is $96 out of pocket (diesel at
// $2.47/L over 11 km/L, plus tyres, servicing, depreciation, insurance) or
// $114 on the ATO's per-km rate, plus ~$20 of motorway tolls - against a $65
// call-out. And that ignores the 2.5 unpaid hours of driving, which is the
// larger loss: the same hours do three jobs in the Northern Beaches.
export const PERIMETER_MAX_MINUTES = 45;

// Time bands inside the perimeter. These reproduce the prices already in
// `callout_zones` - the conversion is meant to leave what customers pay
// unchanged, not to reprice anything.
export const FEE_BANDS = [
  { maxMinutes: 20, fee: 25 },
  { maxMinutes: 32, fee: 35 },
  { maxMinutes: PERIMETER_MAX_MINUTES, fee: 45 },
];

// The fees a booking is ever allowed to be charged. Used to sanity-check a
// payment that arrives while the address cannot be re-resolved (see
// handleCreateBooking): anything not on this list is refused.
export const VALID_FEES = FEE_BANDS.map((b) => b.fee);

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
export function matchFarPeninsula(address) {
  if (!address || typeof address !== 'string') return null;
  const lower = address.toLowerCase();

  for (const pc of lower.match(/\b\d{4}\b/g) || []) {
    if (PENINSULA_FAR_POSTCODES.has(pc)) {
      return { fee: PENINSULA_FAR_FEE, basis: 'peninsula-postcode' };
    }
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
    if (PENINSULA_FAR_SUBURBS.has(part)) {
      return { fee: PENINSULA_FAR_FEE, basis: 'peninsula-suburb' };
    }
  }
  return null;
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
  const mins = Number.isFinite(minutes) ? Math.round(minutes) : null;
  const distanceKm = Number.isFinite(km) ? Math.round(km) : null;

  // Layer 0: the far peninsula, decided by postcode or suburb name alone.
  // It runs FIRST and it is the only layer that can overrule the perimeter,
  // because Palm Beach is 46 minutes out and would otherwise be refused for
  // being one minute too far up a road the van drives anyway. Nothing here
  // depends on a network call, which is the whole point - see matchFarPeninsula.
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
