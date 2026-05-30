// api/send-invoice.js — Generate PDF invoice and email to client
// Uses HTML→PDF via @vercel/og or inline base64 approach
// ENV: RESEND_API_KEY, SUPABASE_URL, SUPABASE_KEY

import { Resend } from 'resend';
import { guard, sanitize, sanitizeObj, rateLimit } from './_security.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

export default async function handler(req, res) {
  if(guard(req, res, { rateMax: 20, rateWindow: 60000 })) return; // 20/min messaging
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { bookingId, to, clientName, service, date, time, address, price, discount, mechNotes, mechName, nextService, bookingRef } = req.body;
  if (!to || !bookingId) return res.status(400).json({ error: 'Missing required fields' });

  const invoiceNumber = `DRBK-${bookingRef || bookingId.slice(0,8).toUpperCase()}`;
  const invoiceDate = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const finalPrice = price || 0;
  const discountAmt = discount || 0;
  const subtotal = finalPrice + discountAmt;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f5f5f7; color: #1d1d1f; }
  .wrap { max-width: 600px; margin: 0 auto; background: #fff; }
  .header { background: #0D1F3C; padding: 32px 40px; }
  .logo { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
  .logo-icon { width: 40px; height: 40px; background: #1848C8; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .logo-name { color: #fff; font-size: 20px; font-weight: 700; }
  .invoice-title { color: rgba(255,255,255,0.6); font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; }
  .invoice-num { color: #fff; font-size: 28px; font-weight: 700; margin-top: 4px; }
  .body { padding: 32px 40px; }
  .section { margin-bottom: 28px; }
  .section-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #6e6e73; margin-bottom: 12px; }
  .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
  .info-row:last-child { border-bottom: none; }
  .info-label { color: #6e6e73; }
  .info-val { font-weight: 500; color: #1d1d1f; }
  .total-box { background: #f5f5f7; border-radius: 12px; padding: 20px 24px; margin: 24px 0; }
  .total-row { display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0; }
  .total-final { display: flex; justify-content: space-between; font-size: 18px; font-weight: 700; color: #0D1F3C; margin-top: 12px; padding-top: 12px; border-top: 2px solid #d1d1d6; }
  .badge { display: inline-block; background: #ECFDF5; color: #059669; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
  .notes { background: #f5f5f7; border-radius: 10px; padding: 16px; font-size: 13px; color: #3a3a3c; line-height: 1.6; }
  .footer { background: #f5f5f7; padding: 24px 40px; text-align: center; font-size: 12px; color: #6e6e73; }
  .footer a { color: #1848C8; text-decoration: none; }
  .paid { color: #059669; font-weight: 700; }
  .strike { text-decoration: line-through; color: #6e6e73; }
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
    <div class="invoice-title">Tax Invoice</div>
    <div class="invoice-num">${invoiceNumber}</div>
  </div>

  <div class="body">
    <div style="display:flex;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:16px">
      <div>
        <div class="section-label">Billed to</div>
        <div style="font-size:15px;font-weight:600">${clientName}</div>
        <div style="font-size:13px;color:#6e6e73;margin-top:4px">${address || ''}</div>
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
      <div class="info-row"><span class="info-label">Service</span><span class="info-val">${service || '—'}</span></div>
      <div class="info-row"><span class="info-label">Date</span><span class="info-val">${date || '—'} ${time ? 'at ' + time : ''}</span></div>
      <div class="info-row"><span class="info-label">Location</span><span class="info-val">${address || '—'}</span></div>
      <div class="info-row"><span class="info-label">Mechanic</span><span class="info-val">${mechName || 'Dr. Bike Sydney'}</span></div>
      <div class="info-row"><span class="info-label">ABN</span><span class="info-val">87 654 025 287</span></div>
    </div>

    <div class="total-box">
      <div class="total-row"><span>Service fee</span><span>$${subtotal.toFixed(2)}</span></div>
      ${discountAmt > 0 ? `<div class="total-row"><span style="color:#059669">Discount applied</span><span style="color:#059669">−$${discountAmt.toFixed(2)}</span></div>` : ''}
      <div class="total-row"><span>GST (included)</span><span>$${(finalPrice / 11).toFixed(2)}</span></div>
      <div class="total-final"><span>Total paid (AUD)</span><span>$${finalPrice.toFixed(2)}</span></div>
    </div>

    ${mechNotes ? `<div class="section"><div class="section-label">Mechanic notes</div><div class="notes">${mechNotes}</div></div>` : ''}

    ${nextService ? `<div style="background:#EEF3FC;border-radius:10px;padding:16px;font-size:13px;color:#1848C8;margin-bottom:24px">🔧 <strong>Next service reminder:</strong> ${nextService}</div>` : ''}

    <div style="text-align:center;padding:24px 0;border-top:1px solid #f0f0f0">
      <div style="font-size:14px;font-weight:600;color:#0D1F3C;margin-bottom:8px">Thank you for choosing Dr. Bike Sydney!</div>
      <div style="font-size:13px;color:#6e6e73">We come to you — home, office or park across Sydney.</div>
      <div style="margin-top:16px">
        <a href="https://drbikesydney.com.au" style="background:#1848C8;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">Book next service →</a>
      </div>
    </div>
  </div>

  <div class="footer">
    Dr. Bike Sydney · ABN 87 654 025 287 · <a href="mailto:hello@drbikesydney.com.au">hello@drbikesydney.com.au</a><br>
    <a href="https://drbikesydney.com.au">drbikesydney.com.au</a>
  </div>
</div>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: 'Dr. Bike Sydney <receipts@drbikesydney.com.au>',
      to,
      subject: `Your Dr. Bike Sydney receipt — ${invoiceNumber}`,
      html,
    });
    return res.status(200).json({ success: true, invoiceNumber });
  } catch (error) {
    console.error('Invoice email error:', error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
