// geocodeAddress() is what keeps the customer's street address out of the
// tracking page. These tests pin the two properties that matter:
//
//   1. it never throws - a booking must not fail because a map service is down
//   2. it only ever returns real coordinates, never a guess
//
// If it started throwing, handleCreateBooking would 500 AFTER the card was
// charged. If it started returning junk, the map would put a client's home
// somewhere they do not live.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { geocodeAddress } from '../../api/_eta.js';

const ok = (body) => ({ ok: true, json: async () => body });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('geocodeAddress', () => {
  it('returns coordinates as numbers when Nominatim finds the address', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok([{ lat: '-33.8915', lon: '151.2767' }])));
    expect(await geocodeAddress('12 Test Street, Bondi NSW 2026')).toEqual({
      lat: -33.8915,
      lng: 151.2767,
    });
  });

  it('constrains the search to Australia and identifies itself', async () => {
    // Nominatim's usage policy requires a real User-Agent, and without the
    // country filter "Bondi" can resolve to another continent.
    const fetchMock = vi.fn(async () => ok([{ lat: '-33.9', lon: '151.2' }]));
    vi.stubGlobal('fetch', fetchMock);
    await geocodeAddress('Bondi Beach');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('countrycodes=au');
    expect(opts.headers['User-Agent']).toContain('DrBikeSydney');
  });

  it('returns null instead of throwing when the service is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    await expect(geocodeAddress('12 Test Street, Bondi')).resolves.toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => [] })));
    expect(await geocodeAddress('12 Test Street, Bondi')).toBeNull();
  });

  it('returns null when the address matches nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok([])));
    expect(await geocodeAddress('asdfghjkl')).toBeNull();
  });

  it('returns null rather than NaN when the service answers with junk', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok([{ lat: 'north', lon: 'east' }])));
    expect(await geocodeAddress('12 Test Street, Bondi')).toBeNull();
  });

  it('does not call out at all for an empty or too-short address', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await geocodeAddress('')).toBeNull();
    expect(await geocodeAddress(null)).toBeNull();
    expect(await geocodeAddress('a')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
