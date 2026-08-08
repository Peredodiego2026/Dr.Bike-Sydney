// Which Stripe payments become bookings.
//
// Both mistakes cost real money. Refusing a genuine call-out recreates the
// 2026-08-05 failure - paid, no booking, nobody told. Accepting a subscription
// renewal or a gift card would invent a booking nobody made and send a mechanic
// to an address that came from nowhere.

import { describe, it, expect } from 'vitest';

process.env.STRIPE_SECRET_KEY ||= 'sk_test_dummy_for_unit_tests';
process.env.SUPABASE_SERVICE_KEY ||= 'service_dummy_for_unit_tests';
const { shouldCreateBookingFor } = await import('../../api/stripe-webhook.js');

const callout = (over = {}) => ({
  id: 'pi_test',
  amount_received: 2000,
  metadata: {
    bk_service_name: 'Tyre and Tube Installed',
    bk_date: '2026-08-10',
    bk_time: '14:30',
    bk_address: '12 Test Street, Bondi NSW 2026',
  },
  ...over,
});

describe('shouldCreateBookingFor', () => {
  it('accepts a settled call-out that knows what it is for', () => {
    expect(shouldCreateBookingFor(callout()).ok).toBe(true);
  });

  it('accepts one identified only by service id', () => {
    const pi = callout();
    delete pi.metadata.bk_service_name;
    pi.metadata.bk_service_id = 'svc_1';
    expect(shouldCreateBookingFor(pi).ok).toBe(true);
  });

  it('refuses a subscription invoice', () => {
    expect(shouldCreateBookingFor(callout({ invoice: 'in_123' }))).toEqual({
      ok: false,
      reason: 'subscription invoice',
    });
  });

  it('refuses a gift card', () => {
    const pi = callout();
    pi.metadata.giftCard = 'true';
    expect(shouldCreateBookingFor(pi).reason).toBe('gift card');
  });

  it('refuses a payment that carries no booking - e.g. charged by hand in Stripe', () => {
    expect(shouldCreateBookingFor(callout({ metadata: {} })).reason).toBe('no booking metadata');
  });

  it('refuses metadata with no slot, because a booking needs a day and a time', () => {
    const noDate = callout();
    delete noDate.metadata.bk_date;
    expect(shouldCreateBookingFor(noDate).reason).toBe('incomplete metadata');

    const noTime = callout();
    delete noTime.metadata.bk_time;
    expect(shouldCreateBookingFor(noTime).reason).toBe('incomplete metadata');
  });

  it('refuses a payment where nothing was actually captured', () => {
    expect(shouldCreateBookingFor(callout({ amount_received: 0 })).reason).toBe(
      'nothing was captured'
    );
  });

  it('does not throw on rubbish', () => {
    expect(shouldCreateBookingFor(null).ok).toBe(false);
    expect(shouldCreateBookingFor(undefined).ok).toBe(false);
    expect(shouldCreateBookingFor('pi_123').ok).toBe(false);
  });
});
