// tests/unit/revenue-is-what-client-paid.test.js - Finance, Analytics, the
// dashboard and the BAS all add bookings up with anBookingRevenue(). Until
// 2026-10-25 it was service_price + callout_fee: parts sold on the job were in
// no revenue figure and no BAS, and a discount code or referral credit was
// counted as money the client paid. Diego asked for parts in revenue; it is now
// what the client was actually charged.
//
// js/admin.js is a classic script and cannot be imported: the function is
// lifted from source and run, as in finance-range.test.js.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { calcCompletionTotals } from '../../api/_completion-notify.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(join(root, 'js/admin.js'), 'utf8');
const m = src.match(/function anBookingRevenue\(b\) \{[\s\S]*?\n\}/);
if (!m) throw new Error('anBookingRevenue not found in js/admin.js');
const anBookingRevenue = new Function(`${m[0]}; return anBookingRevenue;`)();

const tube = (qty, price = 15) => ({
  id: 't',
  name: 'Tube',
  qty,
  unit_price: price,
  total: qty * price,
});

describe('a finished job: the visit fee + what the phone charged', () => {
  it('counts the parts the client paid for', () => {
    // $119 service + 2 tubes, charged on completion; $35 visit at booking
    const b = {
      service_price: 119,
      callout_fee: 35,
      final_charge_amount: 149,
      parts_charged: { items: [tube(2)] },
    };
    expect(anBookingRevenue(b)).toBe(184);
  });

  it('does not count a discount code the client never paid', () => {
    // $119 service, $20 code: the phone charged $99
    const b = {
      service_price: 119,
      callout_fee: 35,
      discount_applied: 20,
      final_charge_amount: 99,
    };
    expect(anBookingRevenue(b)).toBe(134);
  });

  it("never counts the tip - it is the mechanic's, not a taxable sale", () => {
    const b = { service_price: 119, callout_fee: 35, final_charge_amount: 119, tip_amount: 20 };
    expect(anBookingRevenue(b)).toBe(154);
  });

  it('a covered membership visit that charged nothing is just the visit fee', () => {
    expect(anBookingRevenue({ service_price: 0, callout_fee: 35, final_charge_amount: 0 })).toBe(
      35
    );
  });

  it('reads amounts that come back from postgres as strings', () => {
    expect(anBookingRevenue({ callout_fee: '35', final_charge_amount: '149.00' })).toBe(184);
  });
});

describe('a job with no completion charge recorded: worked out like the phone does', () => {
  it('service - discount + parts - completion discount, plus the visit fee', () => {
    const b = {
      service_price: 119,
      callout_fee: 35,
      discount_applied: 20,
      parts_charged: { items: [tube(2)], discount_amount: 10 },
      final_charge_amount: null,
    };
    expect(anBookingRevenue(b)).toBe(35 + (119 - 20 + 30 - 10));
  });

  it('matches calcCompletionTotals, the function behind the invoice', () => {
    const booking = { service_price: 159, callout_fee: 55, discount_applied: 15 };
    const partsCharged = {
      items: [tube(1), { qty: 2, unit_price: 25, total: 50 }],
      discount_amount: 5,
    };
    const t = calcCompletionTotals({ booking, partsCharged, tipAmount: 10 });
    expect(anBookingRevenue({ ...booking, parts_charged: partsCharged })).toBe(
      t.calloutFee + t.chargeNow
    );
  });

  it('an upcoming job is its service (less any code) plus the visit fee', () => {
    expect(anBookingRevenue({ service_price: 119, callout_fee: 35, discount_applied: 20 })).toBe(
      134
    );
  });

  it('a discount bigger than the service never goes below zero', () => {
    expect(anBookingRevenue({ service_price: 27, callout_fee: 35, discount_applied: 50 })).toBe(35);
  });

  it('a missing visit fee counts as zero, never an assumed $20', () => {
    expect(anBookingRevenue({ service_price: 119 })).toBe(119);
  });
});

describe('every query that feeds it asks for the columns it needs', () => {
  it('Analytics', () => {
    const cols = src.match(/const baseCols =\s*'([^']+)'/)[1];
    for (const c of ['final_charge_amount', 'discount_applied', 'parts_charged'])
      expect(cols).toContain(c);
  });
  it('the 7-day mechanic stats', () => {
    const q = src.match(/async function loadMechStats[\s\S]*?\.select\(\s*'([^']+)'/)[1];
    for (const c of ['final_charge_amount', 'discount_applied', 'parts_charged'])
      expect(q).toContain(c);
  });
});
