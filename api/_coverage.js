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

// What a booking costs when we could not work out where it is at all. The
// cheapest band on purpose: undercharging a rare unresolvable address by $20
// is cheaper than turning away a customer who was 10 minutes down the road.
export const UNRESOLVED_FEE = 25;

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
// 'unknown' means BOOK THEM ANYWAY - see UNRESOLVED_FEE above.
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
  // an address written in a way nobody anticipated. This is the layer that
  // exists so none of those becomes a lost customer: let the booking through
  // at the base fee and let a human confirm it.
  return {
    covered: 'unknown',
    calloutFee: UNRESOLVED_FEE,
    minutes: null,
    km: null,
    zoneName: null,
    basis: 'unresolved',
  };
}

// True when the booking should ask for a quote instead of taking a card.
export function needsQuote(resolution) {
  return resolution?.covered === 'out';
}
