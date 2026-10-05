// The invoice PDF is rendered with the REAL pdfkit, not a mock. A pdfkit
// upgrade that breaks font loading (0.20 rewrote it) makes buildPDF throw,
// api/send-invoice.js catches that and emails the invoice with no PDF - so
// nothing else would notice. Added with the 0.19 -> 0.20 bump (05-oct-2026).
import { describe, it, expect, vi } from 'vitest';
import zlib from 'node:zlib';

process.env.RESEND_API_KEY = 're_test_key';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

const { buildPDF } = await import('../../api/send-invoice.js');

const invoice = (extra = {}) => ({
  invoiceNumber: 'INV-2026-0042',
  invoiceDate: '5 Oct 2026',
  clientName: 'Alice Nguyen',
  address: '12 Bondi Rd, Bondi NSW 2026',
  service: 'Full Service',
  date: '2026-10-05',
  time: '14:30',
  mechName: 'Will',
  bikeName: 'Trek Domane',
  durationSecs: 5400,
  discountAmt: 10,
  finalPrice: 149,
  gst: 15.8,
  mechNotes: 'Replaced the rear brake pads. Chain at 0.5% wear.',
  nextService: 'April 2027',
  checklist: { brakes_front: 'ok', brakes_rear: 'critical', chain: 'warn', tyres: 'ok' },
  checklistNotes: 'Rear pads were metal on metal.',
  calloutFeeVal: 25,
  partsRows: [{ label: '1× Brake pads (rear)', value: 24 }],
  mechDiscount: 0,
  mechDiscountCode: '',
  grandTotal: 188,
  tip: 5,
  totalCollected: 168,
  ...extra,
});

// The text pdfkit draws, from the page content streams (Flate-compressed).
// Standard fonts encode each glyph as hex in TJ arrays: <416c696365> 0 ...
function drawnText(pdf) {
  const raw = pdf.toString('latin1');
  let out = '';
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let s;
    try {
      s = zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      continue; // not a Flate stream (font program, image)
    }
    for (const h of s.matchAll(/<([0-9a-f]+)>/gi))
      out += Buffer.from(h[1], 'hex').toString('latin1');
  }
  return out;
}

describe('the invoice PDF', () => {
  it('renders a real PDF with the two standard fonts it uses', async () => {
    const pdf = await buildPDF(invoice());
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-6).toString()).toMatch(/%%EOF/);
    const raw = pdf.toString('latin1');
    expect(raw).toMatch(/\/BaseFont \/Helvetica\b/);
    expect(raw).toMatch(/\/BaseFont \/Helvetica-Bold\b/);
  });

  it('with the client, the totals and the inspection on it', async () => {
    const text = drawnText(await buildPDF(invoice()));
    for (const s of [
      'INV-2026-0042',
      'Alice Nguyen',
      'Full Service',
      '$188.00',
      'CRITICAL',
      'Next service: April 2027',
    ]) {
      expect(text, s).toContain(s);
    }
  });

  it('a long job still renders (notes long enough to spill onto a second page)', async () => {
    const pdf = await buildPDF(invoice({ mechNotes: 'Trued both wheels. '.repeat(400) }));
    const pages = pdf.toString('latin1').match(/\/Type \/Page\b/g) || [];
    expect(pages.length).toBeGreaterThan(1);
  });
});
