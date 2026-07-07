// tests/unit/invoice-math.test.js — the $20 call-out fee must NEVER be charged
// twice. This is the INAMOVIBLE rule from the invoice restructure: chargeNow
// (what EFTPOS/card/cash actually collects) excludes it; grandTotal (what the
// invoice displays) is informational and includes it once.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { computeInvoiceTotals } from '../../api/_invoice-math.js';

describe('computeInvoiceTotals', () => {
  it('never includes the call-out fee in chargeNow', () => {
    const { chargeNow } = computeInvoiceTotals({
      calloutFeeVal: 20,
      finalPrice: 109,
      partsTotal: 0,
      mechDiscount: 0,
    });
    expect(chargeNow).toBe(109);
  });

  it('adds parts on top of the service price', () => {
    const { chargeNow } = computeInvoiceTotals({
      calloutFeeVal: 20,
      finalPrice: 109,
      partsTotal: 25,
      mechDiscount: 0,
    });
    expect(chargeNow).toBe(134);
  });

  it('subtracts a mechanic-applied discount from chargeNow', () => {
    const { chargeNow } = computeInvoiceTotals({
      calloutFeeVal: 20,
      finalPrice: 109,
      partsTotal: 25,
      mechDiscount: 15,
    });
    expect(chargeNow).toBe(119);
  });

  it('never goes negative even if the discount exceeds service + parts', () => {
    const { chargeNow } = computeInvoiceTotals({
      calloutFeeVal: 20,
      finalPrice: 50,
      partsTotal: 0,
      mechDiscount: 999,
    });
    expect(chargeNow).toBe(0);
  });

  it('grandTotal = call-out fee + chargeNow, exactly once', () => {
    const { grandTotal } = computeInvoiceTotals({
      calloutFeeVal: 20,
      finalPrice: 109,
      partsTotal: 25,
      mechDiscount: 0,
    });
    expect(grandTotal).toBe(154);
  });

  it('GST is 1/11th of the grand total (AU GST-inclusive pricing)', () => {
    const { grandTotal, gst } = computeInvoiceTotals({
      calloutFeeVal: 20,
      finalPrice: 90,
      partsTotal: 0,
      mechDiscount: 0,
    });
    expect(grandTotal).toBe(110);
    expect(gst).toBeCloseTo(10, 5);
  });
});
