// tests/unit/internal-auth.test.js — /api/send-email and /api/send-message send
// mail as our DNS-verified domain and spend money on Twilio. Their only gate
// used to be the Origin/Referer header, which any client can set, so these
// tests pin down the two things that now actually decide: the shared secret for
// server-to-server calls, and a recipient the server itself can vouch for.
// Run: npm test

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isInternalCall,
  isAllowedBrowserOrigin,
  isBusinessRecipient,
  recipientForBooking,
} from '../../api/_security.js';

const req = (headers) => ({ headers });

describe('isInternalCall', () => {
  const original = process.env.INTERNAL_API_SECRET;
  beforeEach(() => {
    process.env.INTERNAL_API_SECRET = 'test-secret-value';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.INTERNAL_API_SECRET;
    else process.env.INTERNAL_API_SECRET = original;
  });

  it('accepts the exact shared secret', () => {
    expect(isInternalCall(req({ 'x-internal-token': 'test-secret-value' }))).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(isInternalCall(req({ 'x-internal-token': 'nope' }))).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(isInternalCall(req({}))).toBe(false);
  });

  it('rejects everything when the secret is not configured (fails closed)', () => {
    delete process.env.INTERNAL_API_SECRET;
    expect(isInternalCall(req({ 'x-internal-token': 'anything' }))).toBe(false);
  });
});

describe('isAllowedBrowserOrigin', () => {
  it('accepts our own origins', () => {
    expect(isAllowedBrowserOrigin(req({ origin: 'https://drbikesydney.com.au' }))).toBe(true);
    expect(isAllowedBrowserOrigin(req({ referer: 'https://drbikesydney.com.au/index.html' }))).toBe(
      true
    );
  });

  it('rejects a lookalike domain that merely contains ours', () => {
    expect(isAllowedBrowserOrigin(req({ origin: 'https://drbikesydney.com.au.evil.com' }))).toBe(
      false
    );
    expect(isAllowedBrowserOrigin(req({ referer: 'https://evil.com/drbikesydney.com.au/' }))).toBe(
      false
    );
  });

  it('rejects a request with no Origin and no Referer', () => {
    expect(isAllowedBrowserOrigin(req({}))).toBe(false);
  });
});

describe('isBusinessRecipient', () => {
  it('recognises our own number in every format', () => {
    expect(isBusinessRecipient('0433963250')).toBe(true);
    expect(isBusinessRecipient('+61433963250')).toBe(true);
    expect(isBusinessRecipient('0433 963 250')).toBe(true);
  });

  it('recognises our own addresses', () => {
    expect(isBusinessRecipient('contact@drbikesydney.com.au')).toBe(true);
    expect(isBusinessRecipient('CONTACT@drbikesydney.com.au')).toBe(true);
  });

  it('rejects anyone else', () => {
    expect(isBusinessRecipient('0400000000')).toBe(false);
    expect(isBusinessRecipient('victim@example.com')).toBe(false);
    expect(isBusinessRecipient('')).toBe(false);
    expect(isBusinessRecipient(undefined)).toBe(false);
  });
});

describe('recipientForBooking', () => {
  const originalKey = process.env.SUPABASE_SERVICE_KEY;
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = originalKey;
  });

  it('returns null with no service key configured (fails closed)', async () => {
    delete process.env.SUPABASE_SERVICE_KEY;
    const previous = process.env.SUPABASE_KEY;
    delete process.env.SUPABASE_KEY;
    expect(
      await recipientForBooking('123e4567-e89b-12d3-a456-426614174000', 'client_email')
    ).toBe(null);
    if (previous !== undefined) process.env.SUPABASE_KEY = previous;
  });

  it('refuses a booking id that is not a uuid, without touching the network', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    for (const bad of ['TEST-001', '', undefined, 'or-1=1', '../../etc/passwd']) {
      expect(await recipientForBooking(bad, 'client_email')).toBe(null);
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('returns the stored contact point for a real booking id', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => [{ client_email: 'real@client.com' }] });
    const got = await recipientForBooking('123e4567-e89b-12d3-a456-426614174000', 'client_email');
    expect(got).toBe('real@client.com');
    spy.mockRestore();
  });

  it('returns null when the booking does not exist', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => [] });
    const got = await recipientForBooking('123e4567-e89b-12d3-a456-426614174000', 'client_phone');
    expect(got).toBe(null);
    spy.mockRestore();
  });
});
