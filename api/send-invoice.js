import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { guard, sanitize } from './_security.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const sb = createClient(
  process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);

const CHECKLIST_LABELS = {
  brakes_front: 'Front brakes', brakes_rear: 'Rear brakes',
  chain: 'Chain', cassette: 'Cassette', chainring: 'Chainrings',
  cables: 'Cables', wheels: 'Wheels', tyres: 'Tyres',
  handlebar: 'Handlebar & stem', seatpost: 'Seat & seatpost',
  headset: 'Headset', bb: 'Bottom bracket',
  lights: 'Lights', general: 'Frame condition'
};

function statusBadge(s) {
  if (s === 'ok')       return '<span style="background:#ECFDF5;color:#059669;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">✅ OK</span>';
  if (s === 'warn')     return '<span style="background:#FFFBEB;color:#D97706;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">⚠️ Warn</span>';
  if (s === 'critical') return '<span style="background:#FEF2F2;color:#DC2626;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">🔴 Critical</span>';
  return '<span style="color:#9CA3AF;font-size:11px">—</span>';
}

function formatDuration(secs) {
  if (!secs) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

export default async function handler(req, res) {
  if (await guard(req, res, { rateMax: 20, rateWindow: 60000 })) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let { bookingId, to, clientName, service, date, time, address,
        price, discount, mechNotes, mechName, nextService, bookingRef } = req.body;

  if (!to || !bookingId) return res.status(400).json({ error: 'Missing required fields' });

  clientName  = sanitize(clientName  || 'Client');
  service     = sanitize(service     || '—');
  address     = sanitize(address     || '—');
  mechNotes   = sanitize(mechNotes   || '');
  mechName    = sanitize(mechName    || 'Dr. Bike Sydney');
  nextService = sanitize(nextService || '');

  const invoiceNumber = `DRBK-${bookingRef || bookingId.slice(0,8).toUpperCase()}`;
  const invoiceDate   = new Date().toLocaleDateString('en-AU', { day:'numeric', month:'long', year:'numeric' });
  const finalPrice    = Number(price)    || 0;
  const discountAmt   = Number(discount) || 0;
  const subtotal      = finalPrice + discountAmt;
  const gst           = finalPrice / 11;

  // Fetch extra booking data for service report
  let checklist = null, checklistNotes = '', durationSecs = null, bikeName = '';
  let photoBeforeUrl = '', photoAfterUrl = '';
  try {
    const { data: bkg } = await sb.from('bookings')
      .select('pre_service_checklist, pre_service_notes, service_duration_seconds, photo_before, photo_after, bikes(nickname, brand, model, color, year)')
      .eq('id', bookingId).single();
    if (bkg) {
      try { checklist = JSON.parse(bkg.pre_service_checklist || 'null'); } catch {}
      checklistNotes = sanitize(bkg.pre_service_notes || '');
      durationSecs   = bkg.service_duration_seconds;
      photoBeforeUrl = bkg.photo_before || '';
      photoAfterUrl  = bkg.photo_after  || '';
      if (bkg.bikes) {
        bikeName = [bkg.bikes.year, bkg.bikes.brand, bkg.bikes.model, bkg.bikes.color]
          .filter(Boolean).join(' ');
      }
    }
  } catch {}

  // ── Build checklist HTML ──────────────────────────────────────────────────
  let checklistHtml = '';
  if (checklist && Object.keys(checklist).length > 0) {
    const rows = Object.entries(CHECKLIST_LABELS).map(([id, label]) => {
      const status = checklist[id];
      if (!status) return '';
      return `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #F3F4F6;font-size:13px;color:#374151">${label}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #F3F4F6;text-align:right">${statusBadge(status)}</td>
      </tr>`;
    }).filter(Boolean).join('');

    checklistHtml = `
    <!-- PAGE BREAK -->
    <div style="margin-top:48px;padding-top:32px;border-top:3px solid #0D1F3C">

      <!-- Service Report Header -->
      <div style="background:#0D1F3C;padding:24px 40px;margin:0 -0px">
        <div style="display:flex;align-items:center;gap:12px">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><circle cx="5.5" cy="17.5" r="3"/><circle cx="18.5" cy="17.5" r="3"/><path d="M5.5 17.5l3.5-9h5l3.5 6h-5l-2-3.5"/></svg>
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
          ${durationSecs ? `<div style="flex:1;min-width:160px;background:#F7F8FA;border-radius:10px;padding:14px 16px">
            <div style="font-size:11px;color:#6B7280;font-weight:600;text-transform:uppercase;margin-bottom:4px">Duration</div>
            <div style="font-size:14px;font-weight:600;color:#0D1F3C">${formatDuration(durationSecs)}</div>
          </div>` : ''}
          ${bikeName ? `<div style="flex:1;min-width:160px;background:#EEF3FC;border-radius:10px;padding:14px 16px;border:1px solid #C7D9F8">
            <div style="font-size:11px;color:#1848C8;font-weight:600;text-transform:uppercase;margin-bottom:4px">Bike</div>
            <div style="font-size:14px;font-weight:600;color:#0D1F3C">${bikeName}</div>
          </div>` : ''}
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

        ${checklistNotes ? `<div style="margin-bottom:24px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6B7280;margin-bottom:8px">Inspection Notes</div>
          <div style="background:#F7F8FA;border-radius:10px;padding:14px 16px;font-size:13px;color:#374151;line-height:1.7">${checklistNotes}</div>
        </div>` : ''}

        ${mechNotes ? `<div style="margin-bottom:24px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6B7280;margin-bottom:8px">Work Completed</div>
          <div style="background:#F7F8FA;border-radius:10px;padding:14px 16px;font-size:13px;color:#374151;line-height:1.7">${mechNotes}</div>
        </div>` : ''}

        ${photoBeforeUrl || photoAfterUrl ? `<div style="margin-bottom:24px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6B7280;margin-bottom:10px">Photos</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            ${photoBeforeUrl ? `<div style="flex:1;min-width:200px">
              <div style="font-size:11px;color:#6B7280;margin-bottom:6px">Before</div>
              <img src="${photoBeforeUrl}" alt="Before" style="width:100%;border-radius:8px;border:1px solid #E5E7EB"/>
            </div>` : ''}
            ${photoAfterUrl ? `<div style="flex:1;min-width:200px">
              <div style="font-size:11px;color:#6B7280;margin-bottom:6px">After</div>
              <img src="${photoAfterUrl}" alt="After" style="width:100%;border-radius:8px;border:1px solid #E5E7EB"/>
            </div>` : ''}
          </div>
        </div>` : ''}

        ${nextService ? `<div style="background:#EEF3FC;border-radius:10px;padding:16px;font-size:13px;color:#1848C8;margin-bottom:8px">
          🔧 <strong>Next service recommendation:</strong> ${nextService}
        </div>` : ''}

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
  .logo-icon{width:40px;height:40px;background:#1848C8;border-radius:10px;display:flex;align-items:center;justify-content:center}
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
  .footer a{color:#1848C8;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo">
      <div class="logo-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round">
          <circle cx="5.5" cy="17.5" r="3"/><circle cx="18.5" cy="17.5" r="3"/>
          <path d="M5.5 17.5l3.5-9h5l3.5 6h-5l-2-3.5"/>
        </svg>
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
      <div class="total-row"><span>Service fee</span><span>$${subtotal.toFixed(2)}</span></div>
      ${discountAmt > 0 ? `<div class="total-row"><span style="color:#059669">Discount</span><span style="color:#059669">−$${discountAmt.toFixed(2)}</span></div>` : ''}
      <div class="total-row"><span style="color:#6e6e73">GST included</span><span style="color:#6e6e73">$${gst.toFixed(2)}</span></div>
      <div class="total-final"><span>Total paid (AUD)</span><span>$${finalPrice.toFixed(2)}</span></div>
    </div>

    ${nextService ? `<div style="background:#EEF3FC;border-radius:10px;padding:16px;font-size:13px;color:#1848C8;margin-bottom:24px">🔧 <strong>Next service reminder:</strong> ${nextService}</div>` : ''}

    <div style="text-align:center;padding:24px 0;border-top:1px solid #f0f0f0">
      <div style="font-size:14px;font-weight:600;color:#0D1F3C;margin-bottom:8px">Thank you for choosing Dr. Bike Sydney!</div>
      <div style="font-size:13px;color:#6e6e73">We come to you — home, office or park across Sydney.</div>
      <div style="margin-top:16px">
        <a href="https://drbikesydney.com.au" style="background:#1848C8;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">Book next service →</a>
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

  try {
    await resend.emails.send({
      from: 'Dr. Bike Sydney <receipts@drbikesydney.com.au>',
      to,
      subject: `Your Dr. Bike Sydney receipt & service report — ${invoiceNumber}`,
      html,
    });
    return res.status(200).json({ success: true, invoiceNumber });
  } catch(error) {
    console.error('[send-invoice] Error:', error);
    return res.status(500).json({ error: 'Email failed' });
  }
}
