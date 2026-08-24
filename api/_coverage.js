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

export function feeForMinutes(minutes) {
  const band = FEE_BANDS.find((b) => minutes <= b.maxMinutes);
  return band ? band.fee : null;
}

// Decides coverage from whatever the lookups managed to return. Pure, so the
// rules can be tested without a network or a database.
//
//   minutes - real driving minutes from BASE, or null if routing failed
//   zone    - a `callout_zones` match ({ calloutFee, zoneName }), or null
//   km      - road distance, for the message to Diego. Never affects the price.
//
// Returns { covered, calloutFee, minutes, km, zoneName, basis }.
// `covered` is deliberately three-valued: 'in' | 'out' | 'unknown'.
// 'unknown' does NOT mean rejected: the person keeps their booking and ends
// on a free quote request, exactly like an out-of-perimeter address.
export function resolveCoverage({ minutes = null, zone = null, km = null } = {}) {
  const mins = Number.isFinite(minutes) ? Math.round(minutes) : null;
  const distanceKm = Number.isFinite(km) ? Math.round(km) : null;

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
