// Pure invoice-total math, kept dependency-free (no Resend/Stripe/Supabase imports)
// so it can be unit-tested without any external service credentials.

// The $20 call-out fee is charged at booking time and NEVER charged again here -
// chargeNow (EFTPOS/card/cash amount) is always service + parts - discount only.
export function computeInvoiceTotals({ calloutFeeVal, finalPrice, partsTotal, mechDiscount }) {
  const chargeNow = Math.max(0, finalPrice + partsTotal - mechDiscount);
  const grandTotal = calloutFeeVal + chargeNow;
  const gst = grandTotal / 11;
  return { chargeNow, grandTotal, gst };
}
