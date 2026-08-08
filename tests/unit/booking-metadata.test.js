// bookingMetadata() is what a lost booking gets rebuilt from.
//
// It rides inside the Stripe PaymentIntent, and the payment_intent.succeeded
// webhook reads it back to create the booking when the customer's browser
// never returned - the failure that lost a real booking on 2026-08-05. If a
// field silently goes missing here, that booking is unrecoverable: Stripe
// would know money arrived and nothing would know what it was for.

import { describe, it, expect } from 'vitest';

process.env.STRIPE_SECRET_KEY ||= 'sk_test_dummy_for_unit_tests';
const { bookingMetadata } = await import('../../api/create-payment-session.js');

const full = {
  serviceId: 'svc_1',
  serviceName: 'Tyre and Tube Installed',
  date: '2026-08-10',
  time: '14:30',
  address: '12 Test Street, Bondi NSW 2026',
  clientName: 'Thais Rocha Guimaraes',
  clientPhone: '0433963250',
  bikeId: 'bike_1',
  lang: 'es',
  isGuest: true,
};

describe('bookingMetadata', () => {
  it('carries everything the server needs to rebuild the booking', () => {
    expect(bookingMetadata(full)).toEqual({
      bk_service_id: 'svc_1',
      bk_service_name: 'Tyre and Tube Installed',
      bk_date: '2026-08-10',
      bk_time: '14:30',
      bk_address: '12 Test Street, Bondi NSW 2026',
      bk_name: 'Thais Rocha Guimaraes',
      bk_phone: '0433963250',
      bk_bike_id: 'bike_1',
      bk_lang: 'es',
      bk_guest: '1',
    });
  });

  it('never carries the price', () => {
    // The server looks the price up itself. Anything that arrives from a
    // browser can be edited by whoever is holding the browser.
    const out = bookingMetadata({ ...full, price: 999, servicePrice: 999, amount: 999 });
    expect(Object.keys(out).some((k) => /price|amount|total/i.test(k))).toBe(false);
  });

  it('drops empty fields rather than sending blank values', () => {
    const out = bookingMetadata({ serviceName: 'Tune-Up', date: '2026-08-10' });
    expect(out).toEqual({
      bk_service_name: 'Tune-Up',
      bk_date: '2026-08-10',
      bk_lang: 'en',
      bk_guest: '0',
    });
    expect(Object.values(out).every((v) => v !== '')).toBe(true);
  });

  it('stays inside Stripe metadata limits', () => {
    // 50 keys, 500 characters per value. A long address must be truncated
    // here, not rejected by Stripe at the moment of charging.
    const out = bookingMetadata({ ...full, address: 'x'.repeat(2000), serviceName: 'y'.repeat(900) });
    expect(Object.keys(out).length).toBeLessThanOrEqual(50);
    for (const v of Object.values(out)) expect(v.length).toBeLessThanOrEqual(500);
  });

  it('only accepts a language the database will take', () => {
    // bookings.client_lang has a CHECK constraint - an unknown value here
    // would fail the insert on the webhook side, long after the card was hit.
    expect(bookingMetadata({ ...full, lang: 'fr' }).bk_lang).toBe('en');
    expect(bookingMetadata({ ...full, lang: undefined }).bk_lang).toBe('en');
    expect(bookingMetadata({ ...full, lang: 'zh' }).bk_lang).toBe('zh');
  });

  it('does not throw on nothing at all', () => {
    expect(bookingMetadata(null)).toEqual({});
    expect(bookingMetadata(undefined)).toEqual({});
    expect(bookingMetadata('not an object')).toEqual({});
  });
});
