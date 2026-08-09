import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import {
  guard,
  sanitize,
  isInternalCall,
  isAllowedBrowserOrigin,
  isBusinessRecipient,
  recipientForBooking,
} from './_security.js';
import PDFDocument from 'pdfkit';
import { computeInvoiceTotals } from './_invoice-math.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const sb = createClient(
  process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);

const CHECKLIST_LABELS = {
  brakes_front: 'Front brakes',
  brakes_rear: 'Rear brakes',
  chain: 'Chain',
  cassette: 'Cassette',
  chainring: 'Chainrings',
  cables: 'Cables',
  wheels: 'Wheels',
  tyres: 'Tyres',
  handlebar: 'Handlebar & stem',
  seatpost: 'Seat & seatpost',
  headset: 'Headset',
  bb: 'Bottom bracket',
  lights: 'Lights',
  general: 'Frame condition',
};

function statusBadge(s) {
  if (s === 'ok')
    return '<span style="background:#ECFDF5;color:#059669;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">✅ OK</span>';
  if (s === 'warn')
    return '<span style="background:#FFFBEB;color:#B45309;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">⚠️ Warn</span>';
  if (s === 'critical')
    return '<span style="background:#FEF2F2;color:#CF2020;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">🔴 Critical</span>';
  return '<span style="color:#9CA3AF;font-size:11px">—</span>';
}

function formatDuration(secs) {
  if (!secs) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

function buildPDF({
  invoiceNumber,
  invoiceDate,
  clientName,
  address,
  service,
  date,
  time,
  mechName,
  bikeName,
  durationSecs,
  discountAmt,
  finalPrice,
  gst,
  mechNotes,
  nextService,
  checklist,
  checklistNotes,
  calloutFeeVal,
  partsRows,
  mechDiscount,
  mechDiscountCode,
  grandTotal,
  tip,
  totalCollected,
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const NAVY = '#0D1F3C';
    const BLUE = '#2563EB';
    const GRAY = '#6B7280';
    const GREEN = '#059669';
    const AMBER = '#B45309';
    const RED = '#CF2020';
    const W = 495; // usable width

    // Header bar
    doc.rect(50, 50, W, 72).fill(NAVY);
    doc.fontSize(9).fillColor('rgba(255,255,255,0.6)').text('TAX INVOICE & SERVICE REPORT', 70, 62);
    doc.fontSize(20).fillColor('#fff').text(invoiceNumber, 70, 76);
    doc
      .fontSize(9)
      .fillColor('rgba(255,255,255,0.6)')
      .text('Dr. Bike Sydney  ·  ABN 87 654 025 287', 70, 104);

    // Billed to + invoice meta
    doc.moveDown(4);
    const yMeta = 145;
    doc.fontSize(8).fillColor(GRAY).text('BILLED TO', 50, yMeta);
    doc
      .fontSize(12)
      .fillColor(NAVY)
      .text(clientName, 50, yMeta + 12);
    doc
      .fontSize(10)
      .fillColor(GRAY)
      .text(address || '—', 50, yMeta + 26);

    doc.fontSize(8).fillColor(GRAY).text('DATE', 370, yMeta, { width: 60, align: 'right' });
    doc
      .fontSize(10)
      .fillColor(NAVY)
      .text(invoiceDate, 370, yMeta + 12, { width: 125, align: 'right' });
    doc
      .fontSize(8)
      .fillColor(GRAY)
      .text('REF', 370, yMeta + 30, { width: 125, align: 'right' });
    doc
      .fontSize(10)
      .fillColor(NAVY)
      .text(invoiceNumber, 370, yMeta + 42, { width: 125, align: 'right' });
    doc
      .fontSize(9)
      .fillColor(GREEN)
      .text('✓ PAID', 370, yMeta + 58, { width: 125, align: 'right' });

    // Divider
    const yDiv = yMeta + 80;
    doc.moveTo(50, yDiv).lineTo(545, yDiv).stroke('#E5E7EB');

    // Service details
    let y = yDiv + 16;
    doc.fontSize(8).fillColor(GRAY).text('SERVICE DETAILS', 50, y);
    y += 14;
    const rows = [
      ['Service', service || '—'],
      ['Date', `${date || invoiceDate}${time ? '  at  ' + time : ''}`],
      ['Location', address || '—'],
      ['Mechanic', mechName],
      ...(bikeName ? [['Bike', bikeName]] : []),
      ...(durationSecs
        ? [
            [
              'Duration',
              (() => {
                const h = Math.floor(durationSecs / 3600);
                const m = Math.floor((durationSecs % 3600) / 60);
                return h > 0 ? `${h}h ${m}min` : `${m} min`;
              })(),
            ],
          ]
        : []),
    ];
    rows.forEach(([label, val]) => {
      doc.fontSize(10).fillColor(GRAY).text(label, 50, y, { width: 130 });
      doc.fontSize(10).fillColor(NAVY).text(val, 190, y, { width: 355 });
      y += 16;
    });

    // Totals box — itemized: call-out fee (info only) + service + parts + discounts + GST + grand total
    const totalRows = [
      { label: 'Call-out fee (paid at booking)', value: calloutFeeVal, muted: true },
      { label: 'Service', value: finalPrice },
      ...(partsRows || []).map((p) => ({ ...p, sub: true })),
      ...(discountAmt > 0
        ? [{ label: 'Discount (at booking)', value: -discountAmt, green: true }]
        : []),
      ...(mechDiscount > 0
        ? [
            {
              label: `Discount${mechDiscountCode ? ' (' + mechDiscountCode + ')' : ''}`,
              value: -mechDiscount,
              green: true,
            },
          ]
        : []),
      { label: 'GST included', value: gst, muted: true },
    ];

    y += 8;
    const boxH = 20 + totalRows.length * 16 + 26;
    doc.rect(50, y, W, boxH).fill('#F7F8FA');
    let rowY = y + 12;
    totalRows.forEach((r) => {
      const color = r.green ? GREEN : r.muted ? GRAY : NAVY;
      const sign = r.value < 0 ? '−$' : '$';
      doc
        .fontSize(r.muted ? 9 : 10)
        .fillColor(color)
        .text(r.label, r.sub ? 78 : 66, rowY, { width: 300 });
      doc
        .fontSize(r.muted ? 9 : 10)
        .fillColor(color)
        .text(`${sign}${Math.abs(r.value).toFixed(2)}`, 66, rowY, {
          width: W - 32,
          align: 'right',
        });
      rowY += 16;
    });
    const totalY = rowY + 2;
    doc
      .moveTo(66, totalY - 2)
      .lineTo(529, totalY - 2)
      .stroke('#D1D5DB');
    doc
      .fontSize(13)
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .text('Total general (AUD)', 66, totalY + 2);
    doc
      .fontSize(13)
      .fillColor(NAVY)
      .text(`$${grandTotal.toFixed(2)}`, 66, totalY + 2, { width: W - 32, align: 'right' });
    doc.font('Helvetica');
    y = totalY + 28;

    if (tip > 0) {
      doc
        .fontSize(10)
        .fillColor('#059669')
        .font('Helvetica')
        .text('Tip for your mechanic', 66, y)
        .text(`$${tip.toFixed(2)}`, 66, y, { width: W - 32, align: 'right' });
      y += 16;
      doc
        .fontSize(12)
        .fillColor(NAVY)
        .font('Helvetica-Bold')
        .text('Total charged (AUD)', 66, y)
        .text(`$${totalCollected.toFixed(2)}`, 66, y, { width: W - 32, align: 'right' });
      doc.font('Helvetica');
      y += 24;
    }

    // Next service
    if (nextService) {
      y += 8;
      doc.rect(50, y, W, 32).fill('#EEF3FC');
      doc
        .fontSize(10)
        .fillColor(BLUE)
        .text(`Next service: ${nextService}`, 66, y + 10, { width: W - 32 });
      y += 40;
    }

    // Work completed
    if (mechNotes) {
      y += 8;
      doc.fontSize(8).fillColor(GRAY).text('WORK COMPLETED', 50, y);
      y += 14;
      doc.rect(50, y, W, 0).fill('#F7F8FA');
      const notesH = doc.heightOfString(mechNotes, { width: W - 32, fontSize: 10 }) + 20;
      doc.rect(50, y, W, notesH).fill('#F7F8FA');
      doc
        .fontSize(10)
        .fillColor('#374151')
        .text(mechNotes, 66, y + 10, { width: W - 32 });
      y += notesH + 8;
    }

    // Checklist
    if (checklist && Object.keys(checklist).length > 0) {
      const LABELS = {
        brakes_front: 'Front brakes',
        brakes_rear: 'Rear brakes',
        chain: 'Chain',
        cassette: 'Cassette',
        chainring: 'Chainrings',
        cables: 'Cables',
        wheels: 'Wheels',
        tyres: 'Tyres',
        handlebar: 'Handlebar & stem',
        seatpost: 'Seat & seatpost',
        headset: 'Headset',
        bb: 'Bottom bracket',
        lights: 'Lights',
        general: 'Frame condition',
      };
      const STATUS_COLOR = { ok: GREEN, warn: AMBER, critical: RED };
      const STATUS_LABEL = { ok: 'OK', warn: 'WARN', critical: 'CRITICAL' };

      y += 8;
      doc.fontSize(8).fillColor(GRAY).text('PRE-SERVICE INSPECTION', 50, y);
      y += 14;

      Object.entries(LABELS).forEach(([id, label]) => {
        const status = checklist[id];
        if (!status) return;
        const color = STATUS_COLOR[status] || GRAY;
        const badge = STATUS_LABEL[status] || status.toUpperCase();
        doc.fontSize(10).fillColor('#374151').text(label, 50, y, { width: 300 });
        doc
          .fontSize(8)
          .fillColor(color)
          .text(badge, 350, y + 1, { width: 195, align: 'right' });
        y += 16;
        doc
          .moveTo(50, y - 4)
          .lineTo(545, y - 4)
          .lineWidth(0.3)
          .stroke('#F3F4F6')
          .lineWidth(1);
      });

      if (checklistNotes) {
        y += 4;
        doc.fontSize(8).fillColor(GRAY).text('INSPECTION NOTES', 50, y);
        y += 14;
        const nh = doc.heightOfString(checklistNotes, { width: W - 32, fontSize: 10 }) + 20;
        doc.rect(50, y, W, nh).fill('#F7F8FA');
        doc
          .fontSize(10)
          .fillColor('#374151')
          .text(checklistNotes, 66, y + 10, { width: W - 32 });
        y += nh + 8;
      }
    }

    // Footer
    doc
      .fontSize(9)
      .fillColor(GRAY)
      .text('Dr. Bike Sydney  ·  contact@drbikesydney.com.au  ·  drbikesydney.com.au', 50, 780, {
        align: 'center',
        width: W,
      });

    doc.end();
  });
}

export default async function handler(req, res) {
  if (await guard(req, res, { rateMax: 20, rateWindow: 60000 })) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    bookingId,
    to,
    date,
    time,
    price,
    discount,
    bookingRef,
    calloutFee,
    partsCharged,
    mechDiscountAmount,
    tipAmount,
  } = req.body;
  let { clientName, service, address, mechNotes, mechName, nextService, mechDiscountCode } =
    req.body;

  if (!to || !bookingId) return res.status(400).json({ error: 'Missing required fields' });

  // This endpoint had no caller check at all: anyone could have a PDF invoice
  // with arbitrary amounts and text sent from receipts@drbikesydney.com.au to
  // any address - a ready-made fake-invoice phish. Server-to-server calls carry
  // the shared secret; a browser call has to come from our own pages AND can
  // only reach the address stored on the booking it is invoicing.
  let recipient = to;
  if (!isInternalCall(req)) {
    if (!isAllowedBrowserOrigin(req)) return res.status(403).json({ error: 'Forbidden' });
    if (!isBusinessRecipient(recipient)) {
      const bound = await recipientForBooking(bookingId, 'client_email');
      if (!bound) {
        return res
          .status(403)
          .json({ error: 'A booking id is required to invoice this recipient' });
      }
      recipient = bound;
    }
  }

  // bookingId is embedded in a review link URL below — whitelist only alphanumeric and dashes
  const safeBookingId = String(bookingId).replace(/[^a-zA-Z0-9-]/g, '');

  clientName = sanitize(clientName || 'Client');
  service = sanitize(service || '—');
  address = sanitize(address || '—');
  mechNotes = sanitize(mechNotes || '');
  mechName = sanitize(mechName || 'Dr. Bike Sydney');
  nextService = sanitize(nextService || '');
  mechDiscountCode = sanitize(mechDiscountCode || '');

  const invoiceNumber = `DRBK-${bookingRef || bookingId.slice(0, 8).toUpperCase()}`;
  const invoiceDate = new Date().toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const finalPrice = Number(price) || 0;
  const discountAmt = Number(discount) || 0;

  // Itemized parts + call-out fee + completion-time discount (EFTPOS flow)
  const calloutFeeVal = Number(calloutFee) || 20;
  const partsRows = (Array.isArray(partsCharged) ? partsCharged : [])
    .filter((p) => Number(p?.qty) > 0)
    .map((p) => ({
      label: `${p.qty}× ${sanitize(String(p.name || ''))}`,
      value: Number(p.total) || Number(p.qty) * Number(p.unit_price || 0),
    }));
  const partsTotal = partsRows.reduce((s, p) => s + p.value, 0);
  const mechDiscount = Number(mechDiscountAmount) || 0;
  const { chargeNow, grandTotal, gst } = computeInvoiceTotals({
    calloutFeeVal,
    finalPrice,
    partsTotal,
    mechDiscount,
  });
  // Tip is 100% the mechanic's - kept out of GST-taxable totals entirely, added on
  // top only in the final "amount collected" figure shown to the client.
  const tip = Number(tipAmount) || 0;
  const totalCollected = grandTotal + tip;

  // Fetch extra booking data for service report
  let checklist = null,
    checklistNotes = '',
    durationSecs = null,
    bikeName = '';
  let photoBeforeUrl = '',
    photoAfterUrl = '';
  try {
    const { data: bkg } = await sb
      .from('bookings')
      .select(
        'pre_service_checklist, pre_service_notes, service_duration_seconds, photo_before_url, photo_after_url, bikes(nickname, brand, model, color, year)'
      )
      .eq('id', bookingId)
      .single();
    if (bkg) {
      try {
        checklist = JSON.parse(bkg.pre_service_checklist || 'null');
      } catch {}
      checklistNotes = sanitize(bkg.pre_service_notes || '');
      durationSecs = bkg.service_duration_seconds;
      photoBeforeUrl = bkg.photo_before_url || '';
      photoAfterUrl = bkg.photo_after_url || '';
      if (bkg.bikes) {
        bikeName = [bkg.bikes.year, bkg.bikes.brand, bkg.bikes.model, bkg.bikes.color]
          .filter(Boolean)
          .join(' ');
      }
    }
  } catch {}

  // ── Build checklist HTML ──────────────────────────────────────────────────
  let checklistHtml = '';
  if (checklist && Object.keys(checklist).length > 0) {
    const rows = Object.entries(CHECKLIST_LABELS)
      .map(([id, label]) => {
        const status = checklist[id];
        if (!status) return '';
        return `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #F3F4F6;font-size:13px;color:#374151">${label}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #F3F4F6;text-align:right">${statusBadge(status)}</td>
      </tr>`;
      })
      .filter(Boolean)
      .join('');

    checklistHtml = `
    <!-- PAGE BREAK -->
    <div style="margin-top:48px;padding-top:32px;border-top:3px solid #0D1F3C">

      <!-- Service Report Header -->
      <div style="background:#0D1F3C;padding:24px 40px;margin:0 -0px">
        <div style="display:flex;align-items:center;gap:12px">
          <img src="https://drbikesydney.com.au/images/logo-db.png" alt="Dr. Bike Sydney" height="28" style="width:auto;display:block">
          <div>
            <div style="color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:0.1em">Dr. Bike Sydney</div>
            <div style="color:#fff;font-size:20px;font-weight:700">Service Report — ${invoiceNumber}</div>
          </div>
        </div>
      </div>

      <div style="padding:28px 40px">

        <!-- Summary row -->
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px">
          <div style="flex:1;min-width:160px;background:#F7F8FA;border-radius:10px;padding:14px 16px">
            <div style="font-size:11px;color:#6B7280;font-weight:600;text-transform:uppercase;margin-bottom:4px">Client</div>
            <div style="font-size:14px;font-weight:600;color:#0D1F3C">${clientName}</div>
          </div>
          <div style="flex:1;min-width:160px;background:#F7F8FA;border-radius:10px;padding:14px 16px">
            <div style="font-size:11px;color:#6B7280;font-weight:600;text-transform:uppercase;margin-bottom:4px">Service</div>
            <div style="font-size:14px;font-weight:600;color:#0D1F3C">${service}</div>
          </div>
          <div style="flex:1;min-width:160px;background:#F7F8FA;border-radius:10px;padding:14px 16px">
            <div style="font-size:11px;color:#6B7280;font-weight:600;text-transform:uppercase;margin-bottom:4px">Date</div>
            <div style="font-size:14px;font-weight:600;color:#0D1F3C">${date || invoiceDate}</div>
          </div>
          ${
            durationSecs
              ? `<div style="flex:1;min-width:160px;background:#F7F8FA;border-radius:10px;padding:14px 16px">
            <div style="font-size:11px;color:#6B7280;font-weight:600;text-transform:uppercase;margin-bottom:4px">Duration</div>
            <div style="font-size:14px;font-weight:600;color:#0D1F3C">${formatDuration(durationSecs)}</div>
          </div>`
              : ''
          }
          ${
            bikeName
              ? `<div style="flex:1;min-width:160px;background:#EEF3FC;border-radius:10px;padding:14px 16px;border:1px solid #C7D9F8">
            <div style="font-size:11px;color:#2563EB;font-weight:600;text-transform:uppercase;margin-bottom:4px">Bike</div>
            <div style="font-size:14px;font-weight:600;color:#0D1F3C">${bikeName}</div>
          </div>`
              : ''
          }
        </div>

        <!-- Mechanic -->
        <div style="font-size:12px;color:#6B7280;margin-bottom:20px">Mechanic: <strong style="color:#0D1F3C">${mechName}</strong></div>

        <!-- Checklist -->
        <div style="margin-bottom:24px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6B7280;margin-bottom:10px">Pre-Service Inspection</div>
          <table style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden">
            ${rows}
          </table>
        </div>

        ${
          checklistNotes
            ? `<div style="margin-bottom:24px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6B7280;margin-bottom:8px">Inspection Notes</div>
          <div style="background:#F7F8FA;border-radius:10px;padding:14px 16px;font-size:13px;color:#374151;line-height:1.7">${checklistNotes}</div>
        </div>`
            : ''
        }

        ${
          mechNotes
            ? `<div style="margin-bottom:24px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6B7280;margin-bottom:8px">Work Completed</div>
          <div style="background:#F7F8FA;border-radius:10px;padding:14px 16px;font-size:13px;color:#374151;line-height:1.7">${mechNotes}</div>
        </div>`
            : ''
        }

        ${
          photoBeforeUrl || photoAfterUrl
            ? `<div style="margin-bottom:24px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6B7280;margin-bottom:10px">Photos</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            ${
              photoBeforeUrl
                ? `<div style="flex:1;min-width:200px">
              <div style="font-size:11px;color:#6B7280;margin-bottom:6px">Before</div>
              <img src="${photoBeforeUrl}" alt="Before" style="width:100%;border-radius:8px;border:1px solid #E5E7EB"/>
            </div>`
                : ''
            }
            ${
              photoAfterUrl
                ? `<div style="flex:1;min-width:200px">
              <div style="font-size:11px;color:#6B7280;margin-bottom:6px">After</div>
              <img src="${photoAfterUrl}" alt="After" style="width:100%;border-radius:8px;border:1px solid #E5E7EB"/>
            </div>`
                : ''
            }
          </div>
        </div>`
            : ''
        }

        ${
          nextService
            ? `<div style="background:#EEF3FC;border-radius:10px;padding:16px;font-size:13px;color:#2563EB;margin-bottom:8px">
          🔧 <strong>Next service recommendation:</strong> ${nextService}
        </div>`
            : ''
        }

      </div>
    </div>`;
  }

  // ── Full HTML email ───────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0;background:#f5f5f7;color:#1d1d1f}
  .wrap{max-width:600px;margin:0 auto;background:#fff}
  .header{background:#0D1F3C;padding:32px 40px}
  .logo{display:flex;align-items:center;gap:12px;margin-bottom:20px}
  .logo-icon{width:40px;height:40px;background:#2563EB;border-radius:10px;display:flex;align-items:center;justify-content:center}
  .logo-name{color:#fff;font-size:20px;font-weight:700}
  .invoice-title{color:rgba(255,255,255,0.6);font-size:12px;text-transform:uppercase;letter-spacing:0.1em}
  .invoice-num{color:#fff;font-size:28px;font-weight:700;margin-top:4px}
  .body{padding:32px 40px}
  .section{margin-bottom:28px}
  .section-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#6e6e73;margin-bottom:12px}
  .info-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px}
  .info-row:last-child{border-bottom:none}
  .info-label{color:#6e6e73}
  .info-val{font-weight:500;color:#1d1d1f}
  .total-box{background:#f5f5f7;border-radius:12px;padding:20px 24px;margin:24px 0}
  .total-row{display:flex;justify-content:space-between;font-size:14px;padding:4px 0}
  .total-final{display:flex;justify-content:space-between;font-size:18px;font-weight:700;color:#0D1F3C;margin-top:12px;padding-top:12px;border-top:2px solid #d1d1d6}
  .badge{display:inline-block;background:#ECFDF5;color:#059669;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600}
  .footer{background:#f5f5f7;padding:24px 40px;text-align:center;font-size:12px;color:#6e6e73}
  .footer a{color:#2563EB;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo">
      <div class="logo-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round">
          <img src="https://drbikesydney.com.au/images/logo-db.png" alt="Dr. Bike Sydney" height="24" style="width:auto;display:block">
      </div>
      <div class="logo-name">Dr. Bike Sydney</div>
    </div>
    <div class="invoice-title">Tax Invoice &amp; Service Report</div>
    <div class="invoice-num">${invoiceNumber}</div>
  </div>

  <div class="body">
    <div style="display:flex;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:16px">
      <div>
        <div class="section-label">Billed to</div>
        <div style="font-size:15px;font-weight:600">${clientName}</div>
        <div style="font-size:13px;color:#6e6e73;margin-top:4px">${address}</div>
      </div>
      <div style="text-align:right">
        <div class="section-label">Invoice details</div>
        <div style="font-size:13px"><span style="color:#6e6e73">Date:</span> ${invoiceDate}</div>
        <div style="font-size:13px;margin-top:4px"><span style="color:#6e6e73">Ref:</span> ${invoiceNumber}</div>
        <div style="margin-top:8px"><span class="badge">✓ Paid</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-label">Service details</div>
      <div class="info-row"><span class="info-label">Service</span><span class="info-val">${service}</span></div>
      <div class="info-row"><span class="info-label">Date</span><span class="info-val">${date || invoiceDate}${time ? ' at ' + time : ''}</span></div>
      <div class="info-row"><span class="info-label">Location</span><span class="info-val">${address}</span></div>
      <div class="info-row"><span class="info-label">Mechanic</span><span class="info-val">${mechName}</span></div>
      ${durationSecs ? `<div class="info-row"><span class="info-label">Duration</span><span class="info-val">${formatDuration(durationSecs)}</span></div>` : ''}
      ${bikeName ? `<div class="info-row"><span class="info-label">Bike</span><span class="info-val">${bikeName}</span></div>` : ''}
      <div class="info-row"><span class="info-label">ABN</span><span class="info-val">87 654 025 287</span></div>
    </div>

    <div class="total-box">
      <div class="total-row"><span style="color:#9CA3AF;text-decoration:line-through">Call-out fee (paid at booking)</span><span style="color:#9CA3AF;text-decoration:line-through">$${calloutFeeVal.toFixed(2)}</span></div>
      <div class="total-row"><span>Service</span><span>$${finalPrice.toFixed(2)}</span></div>
      ${partsRows.map((p) => `<div class="total-row"><span style="padding-left:12px">${p.label}</span><span>$${p.value.toFixed(2)}</span></div>`).join('')}
      ${discountAmt > 0 ? `<div class="total-row"><span style="color:#059669">Discount (at booking)</span><span style="color:#059669">−$${discountAmt.toFixed(2)}</span></div>` : ''}
      ${mechDiscount > 0 ? `<div class="total-row"><span style="color:#059669">Discount${mechDiscountCode ? ' (' + mechDiscountCode + ')' : ''}</span><span style="color:#059669">−$${mechDiscount.toFixed(2)}</span></div>` : ''}
      <div class="total-row"><span style="color:#6e6e73">GST included</span><span style="color:#6e6e73">$${gst.toFixed(2)}</span></div>
      <div class="total-final"><span>Total general (AUD)</span><span>$${grandTotal.toFixed(2)}</span></div>
      ${tip > 0 ? `<div class="total-row" style="margin-top:8px"><span>💚 Tip for your mechanic</span><span>$${tip.toFixed(2)}</span></div><div class="total-final"><span>Total charged (AUD)</span><span>$${totalCollected.toFixed(2)}</span></div>` : ''}
    </div>

    ${nextService ? `<div style="background:#EEF3FC;border-radius:10px;padding:16px;font-size:13px;color:#2563EB;margin-bottom:24px">🔧 <strong>Next service reminder:</strong> ${nextService}</div>` : ''}

    <div style="background:#FFFBEB;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center">
      <p style="font-size:13px;color:#B45309;font-weight:600;margin:0 0 10px">How was your service?</p>
      <div style="font-size:24px;letter-spacing:4px;margin-bottom:12px">⭐⭐⭐⭐⭐</div>
      <a href="https://drbikesydney.com.au/?review=${safeBookingId}" style="display:block;background:#F59E0B;color:#fff;text-decoration:none;text-align:center;padding:12px;border-radius:8px;font-weight:700;font-size:13px">Rate your mechanic →</a>
    </div>

    <div style="text-align:center;padding:24px 0;border-top:1px solid #f0f0f0">
      <div style="font-size:14px;font-weight:600;color:#0D1F3C;margin-bottom:8px">Thank you for choosing Dr. Bike Sydney!</div>
      <div style="font-size:13px;color:#6e6e73">We come to you — home, office or park across Sydney.</div>
      <div style="margin-top:16px">
        <a href="https://drbikesydney.com.au" style="background:#2563EB;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">Book next service →</a>
      </div>
    </div>

    ${checklistHtml}

  </div>

  <div class="footer">
    Dr. Bike Sydney · ABN 87 654 025 287 · <a href="mailto:contact@drbikesydney.com.au">contact@drbikesydney.com.au</a><br>
    <a href="https://drbikesydney.com.au">drbikesydney.com.au</a>
  </div>
</div>
</body>
</html>`;

  // Generate PDF attachment
  let pdfBuffer = null;
  try {
    pdfBuffer = await buildPDF({
      invoiceNumber,
      invoiceDate,
      clientName,
      address: address || '—',
      service,
      date,
      time,
      mechName,
      bikeName,
      durationSecs,
      discountAmt,
      finalPrice,
      gst,
      mechNotes,
      nextService,
      checklist,
      checklistNotes,
      calloutFeeVal,
      partsRows,
      mechDiscount,
      mechDiscountCode,
      grandTotal,
      tip,
      totalCollected,
    });
  } catch (e) {
    console.warn('[send-invoice] PDF generation failed:', e.message);
  }

  try {
    const emailPayload = {
      from: 'Dr. Bike Sydney <receipts@drbikesydney.com.au>',
      to: recipient,
      subject: `Your Dr. Bike Sydney receipt & service report — ${invoiceNumber}`,
      html,
    };
    if (pdfBuffer) {
      emailPayload.attachments = [
        {
          filename: `DrBike-${invoiceNumber}.pdf`,
          content: pdfBuffer.toString('base64'),
          contentType: 'application/pdf',
        },
      ];
    }
    await resend.emails.send(emailPayload);
    return res.status(200).json({ success: true, invoiceNumber, pdf_attached: !!pdfBuffer });
  } catch (error) {
    console.error('[send-invoice] Error:', error);
    return res.status(500).json({ error: 'Email failed' });
  }
}
