// tests/unit/match-callout-zone.test.js — matchCalloutZone(sb, address), the
// shared helper 5 call sites now use (handleGetPrice, handleCreateBooking,
// rescheduleBookingCore, handleAdminCreateBooking, and the new public
// handleZonePrice) so none of them can quote a different call-out fee than
// what actually gets charged. Extracted from 4 near-identical inline copies
// found while reviewing the "What's My Fee?" feature.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { matchCalloutZone } from '../../api/auth.js';

function fakeSb(rows) {
  return {
    from(table) {
      if (table !== 'callout_zones') throw new Error(`unexpected table: ${table}`);
      return { select: async () => ({ data: rows }) };
    },
  };
}

const ZONES = [
  { name: 'Northern Beaches', callout_fee: 25, suburbs: ['manly', 'curl curl', 'dee why'] },
  { name: 'Western Sydney (lejos) / St George', callout_fee: 65, suburbs: ['penrith', 'cronulla'] },
];

describe('matchCalloutZone', () => {
  it('matches a suburb by substring, case-insensitive', async () => {
    const match = await matchCalloutZone(fakeSb(ZONES), '12 Beach Rd, Curl Curl NSW 2096');
    expect(match).toEqual({ calloutFee: 25, zoneName: 'Northern Beaches' });
  });

  it('matches regardless of which zone row it is', async () => {
    const match = await matchCalloutZone(fakeSb(ZONES), '5 High St, Cronulla NSW');
    expect(match).toEqual({ calloutFee: 65, zoneName: 'Western Sydney (lejos) / St George' });
  });

  it('returns null for an address outside every configured zone', async () => {
    const match = await matchCalloutZone(fakeSb(ZONES), '1 Somewhere St, Nowhereville');
    expect(match).toBeNull();
  });

  it('returns null when callout_zones is empty (never throws, never invents a fee)', async () => {
    const match = await matchCalloutZone(fakeSb([]), '12 Beach Rd, Curl Curl');
    expect(match).toBeNull();
  });
});
