// The invoice a client receives when a job is completed is built here now, on
// the server, instead of on the mechanic's phone. These tests pin the two
// things that move real money and real trust:
//
//   1. the figures still match calcChargeBreakdown() in js/mechanic.js, which
//      is what produced every invoice sent until now - this was a move, not a
//      re-pricing;
//   2. a booking with no contact point produces no call at all, rather than a
//      call the recipient checks in api/send-invoice.js will reject anyway.

import { describe, it, expect } from 'vitest';
import {
  buildCompletionCalls,
  calcCompletionTotals,
  dispatchCompletionCalls,
  nextServiceMessage,
  pendingCalls,
} from '../../api/_completion-notify.js';

const booking = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  client_name: 'Thais R',
  client_email: 'client@example.com',
  client_phone: '0433963251',
  service_name: 'Standard Service',
  service_price: 145,
  callout_fee: 20,
  scheduled_date: '2026-08-11',
  scheduled_time: '10:00',
  address: '12 Test St, Bondi',
  suburb: 'Bondi',
  discount_applied: 0,
};

const parts = {
  items: [{ id: 'p1', name: 'Brake pads', qty: 2, unit_price: 15, total: 30 }],
  discount_code: 'MECH10',
  discount_amount: 10,
};

describe('calcCompletionTotals', () => {
  it('reproduces calcChargeBreakdown: service + parts - completion discount', () => {
    const t = calcCompletionTotals({ booking, partsCharged: parts, tipAmount: 5 });
    expect(t.servicePrice).toBe(145);
    expect(t.partsTotal).toBe(30);
    expect(t.mechDiscountAmount).toBe(10);
    expect(t.chargeNow).toBe(165);
    expect(t.tip).toBe(5);
  });

  it('takes the booking-time discount off the service price', () => {
    const t = calcCompletionTotals({
      booking: { ...booking, discount_applied: 20 },
      partsCharged: null,
      tipAmount: 0,
    });
    expect(t.servicePrice).toBe(125);
    expect(t.chargeNow).toBe(125);
  });

  it('keeps the tip out of the taxable charge', () => {
    const t = calcCompletionTotals({ booking, partsCharged: null, tipAmount: 50 });
    expect(t.chargeNow).toBe(145);
    expect(t.tip).toBe(50);
  });

  it('never returns a negative charge', () => {
    const t = calcCompletionTotals({
      booking: { ...booking, service_price: 10 },
      partsCharged: { items: [], discount_amount: 99 },
      tipAmount: 0,
    });
    expect(t.chargeNow).toBe(0);
  });

  it('defaults the call-out fee to 20 only when the column is empty', () => {
    expect(calcCompletionTotals({ booking: { ...booking, callout_fee: null } }).calloutFee).toBe(
      20
    );
    expect(calcCompletionTotals({ booking: { ...booking, callout_fee: 0 } }).calloutFee).toBe(0);
    expect(calcCompletionTotals({ booking: { ...booking, callout_fee: '25' } }).calloutFee).toBe(
      25
    );
  });

  it('handles postgrest returning money as strings', () => {
    const t = calcCompletionTotals({
      booking: { ...booking, service_price: '145.00', discount_applied: '5' },
      partsCharged: { items: [{ qty: '2', unit_price: '15' }] },
      tipAmount: '0',
    });
    expect(t.servicePrice).toBe(140);
    expect(t.partsTotal).toBe(30);
  });
});

describe('buildCompletionCalls', () => {
  it('sends invoice, review email and review SMS when both contact points exist', () => {
    const calls = buildCompletionCalls({ booking, partsCharged: parts, tipAmount: 0 });
    expect(calls.map((c) => c.path)).toEqual([
      '/api/send-invoice',
      '/api/send-email',
      '/api/send-sms',
    ]);
  });

  it('carries the date and time the browser never managed to send', () => {
    // js/mechanic.js read j.scheduled_date off an object whose field is named
    // `date`, so every invoice PDF so far was built with date and time
    // undefined. Reading the row directly is what fixes it.
    const invoice = buildCompletionCalls({ booking, partsCharged: parts, tipAmount: 0 })[0];
    expect(invoice.body.date).toBe('2026-08-11');
    expect(invoice.body.time).toBe('10:00');
  });

  it('skips the emails when the booking has no address on file', () => {
    const calls = buildCompletionCalls({
      booking: { ...booking, client_email: '' },
      partsCharged: parts,
      tipAmount: 0,
    });
    expect(calls.map((c) => c.path)).toEqual(['/api/send-sms']);
  });

  it('skips the SMS when the booking has no number on file', () => {
    const calls = buildCompletionCalls({
      booking: { ...booking, client_phone: null },
      partsCharged: parts,
      tipAmount: 0,
    });
    expect(calls.map((c) => c.path)).toEqual(['/api/send-invoice', '/api/send-email']);
  });

  it('sends nothing without a booking id', () => {
    expect(buildCompletionCalls({ booking: { ...booking, id: '' } })).toEqual([]);
  });

  it('addresses every call to the booking, so the recipient checks can bind it', () => {
    const calls = buildCompletionCalls({ booking, partsCharged: parts, tipAmount: 0 });
    calls.forEach((c) => expect(c.body.bookingId).toBe(booking.id));
  });

  it('passes the completion discount through to the invoice', () => {
    const invoice = buildCompletionCalls({ booking, partsCharged: parts, tipAmount: 0 })[0];
    expect(invoice.body.mechDiscountCode).toBe('MECH10');
    expect(invoice.body.mechDiscountAmount).toBe(10);
    expect(invoice.body.finalChargeAmount).toBe(165);
  });
});

describe('pendingCalls', () => {
  const calls = () => buildCompletionCalls({ booking, partsCharged: parts, tipAmount: 0 });

  it('retries only what failed - a failed SMS never resends the invoice', () => {
    const pending = pendingCalls(calls(), {
      'send-invoice': 'sent',
      'send-email': 'sent',
      'send-sms': 'failed',
    });
    expect(pending.map((c) => c.path)).toEqual(['/api/send-sms']);
  });

  it('retries nothing when everything landed', () => {
    expect(
      pendingCalls(calls(), {
        'send-invoice': 'sent',
        'send-email': 'sent',
        'send-sms': 'sent',
      })
    ).toEqual([]);
  });

  it('leaves bookings completed before the column existed alone', () => {
    // NULL cannot be told apart from "sent before we tracked it". Guessing
    // would mail an old client a second invoice.
    expect(pendingCalls(calls(), null)).toEqual([]);
    expect(pendingCalls(calls(), {})).toEqual([]);
  });

  it('does not invent a channel the booking has no contact point for', () => {
    const noPhone = buildCompletionCalls({
      booking: { ...booking, client_phone: '' },
      partsCharged: parts,
      tipAmount: 0,
    });
    const pending = pendingCalls(noPhone, {
      'send-invoice': 'failed',
      'send-sms': 'failed',
    });
    expect(pending.map((c) => c.path)).toEqual(['/api/send-invoice']);
  });
});

describe('dispatchCompletionCalls', () => {
  const okRes = { ok: true, status: 200 };

  it('records sent and failed per channel', async () => {
    const seen = [];
    const fakeFetch = (url) => {
      seen.push(url);
      return url.includes('send-sms')
        ? Promise.resolve({ ok: false, status: 500 })
        : Promise.resolve(okRes);
    };
    const original = globalThis.fetch;
    globalThis.fetch = fakeFetch;
    try {
      const summary = await dispatchCompletionCalls(
        buildCompletionCalls({ booking, partsCharged: parts, tipAmount: 0 }),
        { baseUrl: 'https://example.test', internalToken: 't', bookingId: booking.id }
      );
      expect(summary.sent).toEqual(['send-invoice', 'send-email']);
      expect(summary.failed).toEqual(['send-sms']);
      expect(summary.outcome).toEqual({
        'send-invoice': 'sent',
        'send-email': 'sent',
        'send-sms': 'failed',
      });
      expect(seen).toHaveLength(3);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('survives a rejected request instead of throwing at the caller', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error('network down'));
    try {
      const summary = await dispatchCompletionCalls(
        buildCompletionCalls({ booking, partsCharged: parts, tipAmount: 0 }),
        { baseUrl: 'https://example.test' }
      );
      expect(summary.sent).toEqual([]);
      expect(summary.failed).toHaveLength(3);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('nextServiceMessage', () => {
  it('names the date when there is one', () => {
    expect(nextServiceMessage('2026-11-11')).toContain('November');
  });

  it('falls back to the generic line on an empty or unparseable date', () => {
    expect(nextServiceMessage(null)).toContain('every 3–6 months');
    expect(nextServiceMessage('not a date')).toContain('every 3–6 months');
  });
});
