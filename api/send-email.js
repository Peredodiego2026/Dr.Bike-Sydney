import {
  guard,
  sanitize,
  sanitizeObj,
  rateLimit,
  verifyInternalAuth,
  isInternalCall,
  isBusinessRecipient,
  recipientForBooking,
} from './_security.js';
import { translateEmailHtml, translateEmailSubject, normalizeLang } from './_email-i18n.js';
export default async function handler(req, res) {
  if (await guard(req, res, { rateMax: 5, rateWindow: 60000 })) return;
  if (verifyInternalAuth(req, res)) return; // Solo nuestra app puede llamar este endpoint // 20/min messaging
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, type, referralCount } = req.body;
  let {
    name,
    clientName,
    phone,
    service,
    date,
    time,
    address,
    price,
    bookingId,
    mechNotes,
    nextService,
    referralCode,
    friendName,
    senderName,
    message,
    amount,
    code,
  } = req.body;
  if (senderName) senderName = sanitize(senderName);
  if (message) message = sanitize(message);
  if (code)
    code = String(code)
      .replace(/[^A-Z0-9-]/gi, '')
      .toUpperCase();
  amount = Number(amount) || 0;
  name = sanitize(name);
  service = sanitize(service);
  address = sanitize(address);
  mechNotes = sanitize(mechNotes);
  nextService = sanitize(nextService);
  referralCode = sanitize(referralCode);
  if (friendName) friendName = sanitize(friendName);
  if (clientName) clientName = sanitize(clientName);
  if (phone) phone = sanitize(phone);
  if (date) date = sanitize(date);
  if (time) time = sanitize(time);
  price = Number(price) || 0;
  // bookingId used in URLs — whitelist only alphanumeric and dashes
  if (bookingId) bookingId = String(bookingId).replace(/[^a-zA-Z0-9-]/g, '');

  const gst = Math.round((price || 0) / 11);
  const net = (price || 0) - gst;
  const year = new Date().getFullYear();

  const header = (color, emoji, title) => `
    <div style="font-family:Inter,Arial,sans-serif;max-width:580px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
    <div style="background:${color};padding:32px 28px;text-align:center">
      <div style="font-size:38px;margin-bottom:8px">${emoji}</div>
      <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.6);letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px">Dr. Bike Sydney</div>
      <div style="font-size:22px;font-weight:800;color:#fff">${title}</div>
    </div>`;

  const footer = () => `
    <div style="background:#F7F8FA;padding:20px 28px;text-align:center;border-top:1px solid #E5E7EB">
      <p style="font-size:12px;color:#9CA3AF;margin:0 0 4px">Dr. Bike Sydney · drbikesydney.com.au · Sydney NSW</p>
      <p style="font-size:11px;color:#D1D5DB;margin:0">ABN: 87 654 025 287 · contact@drbikesydney.com.au</p>
    </div></div>`;

  const bookingTable = () => `
    <div style="background:#F7F8FA;border-radius:12px;padding:20px;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px 0;color:#6B7280;font-size:13px">Service</td><td style="padding:8px 0;font-weight:600;color:#0D1F3C;font-size:13px;text-align:right">${service}</td></tr>
        ${date ? `<tr><td style="padding:8px 0;color:#6B7280;font-size:13px;border-top:1px solid #E5E7EB">Date & time</td><td style="padding:8px 0;font-weight:600;color:#0D1F3C;font-size:13px;text-align:right;border-top:1px solid #E5E7EB">${date}${time ? ' · ' + time : ''}</td></tr>` : ''}
        ${address ? `<tr><td style="padding:8px 0;color:#6B7280;font-size:13px;border-top:1px solid #E5E7EB">Address</td><td style="padding:8px 0;font-weight:600;color:#0D1F3C;font-size:13px;text-align:right;border-top:1px solid #E5E7EB">${address}</td></tr>` : ''}
        <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;border-top:1px solid #E5E7EB">Net amount</td><td style="padding:8px 0;font-weight:600;color:#0D1F3C;font-size:13px;text-align:right;border-top:1px solid #E5E7EB">$${net} AUD</td></tr>
        <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;border-top:1px solid #E5E7EB">GST (10%)</td><td style="padding:8px 0;font-weight:600;color:#6B7280;font-size:13px;text-align:right;border-top:1px solid #E5E7EB">$${gst} AUD</td></tr>
        <tr><td style="padding:10px 0 0;font-weight:700;color:#0D1F3C;font-size:14px;border-top:2px solid #E5E7EB">Total</td><td style="padding:10px 0 0;font-weight:800;color:#2563EB;font-size:18px;text-align:right;border-top:2px solid #E5E7EB">$${price} AUD</td></tr>
      </table>
    </div>`;

  const templates = {
    confirmation: {
      subject: `✅ Booking confirmed — ${service} · ${date}`,
      html: `${header('#0D1F3C', '🚲', 'Booking confirmed!')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 20px;line-height:1.6">Hi <strong style="color:#0D1F3C">${name}</strong>, your booking is confirmed ✅ Your mechanic will contact you 30 min before arrival.</p>

          <!-- Booking details -->
          ${bookingTable()}

          <!-- What to expect -->
          <div style="background:#EEF3FC;border-radius:12px;padding:16px;margin-bottom:20px">
            <p style="font-size:13px;color:#2563EB;font-weight:600;margin:0 0 8px">📍 What happens next</p>
            <p style="font-size:12px;color:#2563EB;margin:0;line-height:1.8;opacity:0.9">
              1. Your mechanic will be assigned shortly<br>
              2. You'll get a notification when they're on the way<br>
              3. Payment collected on completion
            </p>
          </div>

          <!-- Tax Invoice section -->
          <div style="border:1.5px solid #E5E7EB;border-radius:12px;overflow:hidden;margin-bottom:20px">
            <div style="background:#F7F8FA;padding:12px 16px;border-bottom:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:12px;font-weight:700;color:#0D1F3C;text-transform:uppercase;letter-spacing:0.06em">Tax Invoice</span>
              <span style="font-size:11px;color:#6B7280;font-weight:600">DRBK-${bookingId ? bookingId.slice(0, 8).toUpperCase() : 'PENDING'}</span>
            </div>
            <div style="padding:16px">
              <table style="width:100%;border-collapse:collapse;font-size:13px">
                <tr><td style="color:#6B7280;padding:5px 0">Service</td><td style="text-align:right;font-weight:600;color:#0D1F3C">${service}</td></tr>
                <tr><td style="color:#6B7280;padding:5px 0;border-top:1px solid #F3F4F6">Date & time</td><td style="text-align:right;font-weight:600;color:#0D1F3C;border-top:1px solid #F3F4F6">${date}${time ? ' at ' + time : ''}</td></tr>
                <tr><td style="color:#6B7280;padding:5px 0;border-top:1px solid #F3F4F6">Location</td><td style="text-align:right;font-weight:600;color:#0D1F3C;border-top:1px solid #F3F4F6">${address || '—'}</td></tr>
                <tr><td style="color:#6B7280;padding:5px 0;border-top:1px solid #F3F4F6">Subtotal (excl. GST)</td><td style="text-align:right;color:#6B7280;border-top:1px solid #F3F4F6">$${net}</td></tr>
                <tr><td style="color:#6B7280;padding:5px 0;border-top:1px solid #F3F4F6">GST (10%)</td><td style="text-align:right;color:#6B7280;border-top:1px solid #F3F4F6">$${gst}</td></tr>
                <tr style="border-top:2px solid #E5E7EB">
                  <td style="padding:10px 0 0;font-weight:700;color:#0D1F3C;font-size:14px">Total (AUD)</td>
                  <td style="padding:10px 0 0;text-align:right;font-weight:800;color:#2563EB;font-size:18px">$${price}</td>
                </tr>
              </table>
              <p style="font-size:10px;color:#9CA3AF;margin:12px 0 0">ABN: 87 654 025 287 · Dr. Bike Sydney · drbikesydney.com.au</p>
            </div>
          </div>

          <!-- Referral code -->
          ${
            referralCode
              ? `<div style="background:#FEF3C7;border-radius:12px;padding:16px;margin-bottom:20px;text-align:center">
            <p style="font-size:12px;color:#D97706;font-weight:700;margin:0 0 4px">🎁 Share Dr. Bike — earn $15 off your next service</p>
            <p style="font-size:16px;font-weight:800;color:#D97706;letter-spacing:0.12em;margin:0 0 4px">${referralCode}</p>
            <p style="font-size:11px;color:#D97706;margin:0;opacity:0.8">You and your friend each get $15 off when they use your code</p>
          </div>`
              : ''
          }

          <a href="https://drbikesydney.com.au/?action=dashboard" style="display:block;background:#0D1F3C;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px">View your booking →</a>
        </div>${footer()}`,
    },
    mechanic_new_booking: {
      subject: `🔔 New booking — ${service} · ${date}`,
      html: `${header('#2563EB', '🔔', 'New booking!')}
        <div style="padding:32px 28px">
          <h1 style="font-size:20px;font-weight:700;color:#0D1F3C;margin:0 0 16px">New job assigned to you</h1>
          ${bookingTable()}
          <div style="background:#EEF3FC;border-radius:12px;padding:16px;margin-bottom:16px">
            <p style="font-size:13px;color:#2563EB;font-weight:600;margin:0 0 4px">📱 Open your mechanic app</p>
            <p style="font-size:12px;color:#2563EB;margin:0">Log in to accept and see full client details</p>
          </div>
          <a href="https://drbikesydney.com.au/mechanic.html" style="display:block;background:#2563EB;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px">Open mechanic app →</a>
        </div>${footer()}`,
    },
    reminder2h: {
      subject: `⏰ Reminder — your Dr. Bike service is in ~2 hours`,
      html: `${header('#2563EB', '⏰', 'See you soon!')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 20px;line-height:1.6">Hi <strong style="color:#0D1F3C">${name}</strong>, just a friendly reminder that your booking is coming up in about <strong style="color:#0D1F3C">2 hours</strong>. Your mechanic will contact you ~30 min before arrival.</p>
          ${bookingTable()}
          <div style="background:#EEF3FC;border-radius:12px;padding:16px;margin-bottom:20px">
            <p style="font-size:13px;color:#2563EB;font-weight:600;margin:0 0 8px">✅ Quick checklist</p>
            <p style="font-size:12px;color:#2563EB;margin:0;line-height:1.8;opacity:0.9">
              • Have your bike accessible at the address<br>
              • Clear a small space for the mechanic to work<br>
              • Need to change something? Free to cancel up to 2h before
            </p>
          </div>
          <p style="font-size:12px;color:#9CA3AF;margin:0">Questions? Call us on 0433 963 250.</p>
        </div>
        ${footer()}`,
    },
    upcoming: {
      subject: `📅 Your Dr. Bike service is coming up`,
      html: `${header('#2563EB', '📅', 'See you soon!')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 20px;line-height:1.6">Hi <strong style="color:#0D1F3C">${name}</strong>, a reminder that your booking with Dr. Bike Sydney is coming up. We'll message you again on the day, and your mechanic will let you know when they're on the way.</p>
          ${bookingTable()}
          <div style="background:#EEF3FC;border-radius:12px;padding:16px;margin-bottom:20px">
            <p style="font-size:13px;color:#2563EB;font-weight:600;margin:0 0 8px">✅ Before the day</p>
            <p style="font-size:12px;color:#2563EB;margin:0;line-height:1.8;opacity:0.9">
              • Make sure the bike will be accessible at the address<br>
              • Let us know now if the time no longer works<br>
              • Free to cancel or reschedule up to 2h before
            </p>
          </div>
          <p style="font-size:12px;color:#9CA3AF;margin:0">Need to change something? Call or text 0433 963 250.</p>
        </div>
        ${footer()}`,
    },
    reminder: {
      subject: `🚲 Time for a bike check-up, ${name}!`,
      html: `${header('#059669', '🚲', 'Time for a service!')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 24px;line-height:1.6">Hi <strong style="color:#0D1F3C">${name}</strong>, it's been 6+ months since your last service. Regular maintenance keeps your bike safe and riding smoothly!</p>
          <div style="background:#EEF3FC;border-radius:12px;padding:16px;margin-bottom:24px">
            <p style="font-size:13px;color:#2563EB;font-weight:700;margin:0 0 8px">🔧 Why regular servicing matters</p>
            <p style="font-size:12px;color:#2563EB;margin:0;line-height:1.6;opacity:0.8">Worn brake pads, stretched cables and dirty drivetrains reduce performance and can be dangerous. A quick tune-up extends your bike's life significantly.</p>
          </div>
          <a href="https://drbikesydney.com.au" style="display:block;background:#059669;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px;margin-bottom:12px">Book a service now →</a>
          <p style="font-size:12px;color:#9CA3AF;text-align:center;margin:0">We come to you — home, work or park · Mon–Sat</p>
        </div>${footer()}`,
    },
    review_request: {
      subject: `⭐ How was your ${service} with Dr. Bike?`,
      html: `${header('#F59E0B', '⭐', 'How was your service?')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 20px;line-height:1.6">Hi <strong style="color:#0D1F3C">${name}</strong>, your <strong>${service}</strong> is complete! We'd love to hear how it went.</p>
          <div style="background:#FFFBEB;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center">
            <p style="font-size:13px;color:#D97706;font-weight:600;margin:0 0 12px">Rate your experience</p>
            <div style="font-size:32px;letter-spacing:4px">⭐⭐⭐⭐⭐</div>
          </div>
          <a href="https://drbikesydney.com.au/?review=${bookingId}" style="display:block;background:#F59E0B;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px;margin-bottom:12px">Leave a review →</a>
          <p style="font-size:12px;color:#9CA3AF;text-align:center;margin:0">It takes less than 30 seconds and helps other Sydney cyclists find us 🙏</p>
        </div>${footer()}`,
    },
    gift_card: {
      subject: `🎁 ${senderName} sent you a $${amount} Dr. Bike Sydney gift card`,
      html: `${header('#7C3AED', '🎁', 'You received a gift card!')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 20px;line-height:1.6">Hi <strong style="color:#0D1F3C">${name}</strong>, <strong>${senderName}</strong> sent you a Dr. Bike Sydney gift card 🚲</p>
          ${
            message
              ? `<div style="background:#F5F3FF;border-left:3px solid #7C3AED;border-radius:8px;padding:14px 16px;margin-bottom:20px">
            <p style="font-size:13px;color:#6D28D9;font-style:italic;margin:0;line-height:1.6">"${message}"</p>
          </div>`
              : ''
          }
          <div style="background:linear-gradient(135deg,#7C3AED,#2563EB);border-radius:16px;padding:28px 24px;margin-bottom:20px;text-align:center">
            <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);letter-spacing:0.12em;text-transform:uppercase;margin-bottom:8px">Gift card value</div>
            <div style="font-size:42px;font-weight:900;color:#fff;margin-bottom:16px">$${amount}</div>
            <div style="background:rgba(255,255,255,0.15);border-radius:10px;padding:12px;display:inline-block">
              <div style="font-size:10px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Your code</div>
              <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:0.18em;font-family:monospace">${code}</div>
            </div>
          </div>
          <div style="background:#F7F8FA;border-radius:12px;padding:16px;margin-bottom:20px">
            <p style="font-size:13px;color:#0D1F3C;font-weight:600;margin:0 0 8px">How to redeem</p>
            <p style="font-size:12px;color:#6B7280;margin:0;line-height:1.8">
              1. Book any service at drbikesydney.com.au<br>
              2. Enter code <strong style="color:#7C3AED">${code}</strong> at checkout<br>
              3. The value is deducted from your service total
            </p>
          </div>
          <a href="https://drbikesydney.com.au" style="display:block;background:#7C3AED;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px">Book a service →</a>
        </div>${footer()}`,
    },
    cancellation_client: {
      subject: `❌ Booking cancelled — ${service} · ${date}`,
      html: `${header('#DC2626', '❌', 'Booking cancelled')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 20px;line-height:1.6">Hi <strong style="color:#0D1F3C">${name}</strong>, your booking has been cancelled as requested.</p>
          ${bookingTable()}
          <div style="background:#FEF2F2;border-radius:12px;padding:16px;margin-bottom:20px">
            <p style="font-size:13px;color:#DC2626;font-weight:600;margin:0 0 4px">Refund information</p>
            <p style="font-size:12px;color:#DC2626;margin:0;opacity:0.8">If you paid online, your refund will be processed within 5–7 business days. For questions contact contact@drbikesydney.com.au</p>
          </div>
          <a href="https://drbikesydney.com.au" style="display:block;background:#0D1F3C;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px">Book again →</a>
        </div>${footer()}`,
    },
    cancellation_admin: {
      subject: `❌ Booking cancelled — ${name} · ${service} · ${date}`,
      html: `${header('#DC2626', '❌', 'Booking cancelled by client')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 20px;line-height:1.6"><strong style="color:#0D1F3C">${name}</strong> cancelled their booking.</p>
          ${bookingTable()}
          <div style="background:#FEF2F2;border-radius:12px;padding:16px;margin-top:16px">
            <p style="font-size:13px;color:#DC2626;font-weight:600;margin:0 0 4px">Action required</p>
            <p style="font-size:12px;color:#DC2626;margin:0;opacity:0.8">This slot is now free. Consider reaching out to waitlisted clients or updating the schedule.</p>
          </div>
        </div>${footer()}`,
    },
    referral_success: {
      subject: `🎉 Your referral worked — $15 credit earned!`,
      html: `${header('#059669', '🎉', 'Referral successful!')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 20px;line-height:1.6">Hi <strong style="color:#0D1F3C">${name}</strong>, great news — ${friendName || 'a friend'} just booked using your referral code!</p>
          <div style="background:#ECFDF5;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center">
            <div style="font-size:32px;margin-bottom:8px">🎁</div>
            <div style="font-size:20px;font-weight:800;color:#059669">$15 credit earned</div>
            <div style="font-size:13px;color:#059669;margin-top:4px;opacity:0.8">Applied automatically to your next service</div>
          </div>
          <div style="background:#F7F8FA;border-radius:10px;padding:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:13px;color:#6B7280">Total referrals</span>
            <span style="font-size:18px;font-weight:800;color:#0D1F3C">${referralCount || 1}</span>
          </div>
          <p style="font-size:13px;color:#6B7280;margin:0 0 20px;line-height:1.6">Keep sharing your code — every referral earns you both $15 off. 🚲</p>
          <a href="https://drbikesydney.com.au/?action=dashboard" style="display:block;background:#059669;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px">View my dashboard →</a>
        </div>${footer()}`,
    },
    waitlist_confirmation: {
      subject: `🔔 You're on the waitlist — Dr. Bike Sydney`,
      html: `${header('#2563EB', '🔔', 'On the waitlist!')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 20px;line-height:1.6">Hi <strong style="color:#0D1F3C">${name}</strong>, you're on the waitlist for <strong>${date}</strong>.</p>
          <div style="background:#EEF3FC;border-radius:12px;padding:16px;margin-bottom:20px">
            <p style="font-size:13px;color:#2563EB;font-weight:600;margin:0 0 4px">What happens next?</p>
            <p style="font-size:12px;color:#2563EB;margin:0;line-height:1.6">We'll send you an email the moment a slot opens up on that day. You'll have 30 minutes to complete your booking before it's offered to the next person on the list.</p>
          </div>
          <a href="https://drbikesydney.com.au/?action=book" style="display:block;background:#2563EB;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px">Check other dates →</a>
        </div>${footer()}`,
    },
    tip_received: {
      subject: `💛 Tip received — $${price} from ${name}`,
      html: `${header('#059669', '💛', 'Tip received!')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 20px;line-height:1.6"><strong style="color:#0D1F3C">${name}</strong> left a $${price} tip after their service.</p>
          <div style="background:#ECFDF5;border-radius:12px;padding:20px;text-align:center;margin-bottom:20px">
            <div style="font-size:32px;font-weight:800;color:#059669">$${price}</div>
            <div style="font-size:13px;color:#059669;margin-top:4px">Goes directly to the mechanic</div>
          </div>
        </div>${footer()}`,
    },
    payment_failed: {
      subject: `⚠️ Payment failed — Dr. Bike Sydney membership`,
      html: `${header('#D97706', '⚠️', 'Payment failed')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 20px;line-height:1.6">Hi <strong style="color:#0D1F3C">${name}</strong>, we couldn't process your membership payment of <strong>$${price}</strong>. This is attempt ${typeof attemptCount !== 'undefined' ? attemptCount : 1}.</p>
          <div style="background:#FEF9C3;border-radius:12px;padding:16px;margin-bottom:20px;border:1px solid #FCD34D">
            <p style="font-size:13px;color:#D97706;font-weight:600;margin:0 0 4px">⚡ Action needed</p>
            <p style="font-size:12px;color:#D97706;margin:0;line-height:1.6">Please update your payment method to keep your membership active. Your access will be paused if payment fails again.</p>
          </div>
          <a href="https://drbikesydney.com.au/?action=membership" style="display:block;background:#D97706;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px;margin-bottom:12px">Update payment method →</a>
          <p style="font-size:12px;color:#9CA3AF;text-align:center;margin:0">Questions? Reply to this email or WhatsApp us at +61 433 963 250</p>
        </div>${footer()}`,
    },
    reengagement: {
      subject: `🚲 We miss you, ${name} — here's $15 to come back`,
      html: `${header('#0A58CA', '🚲', 'We miss you!')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 20px;line-height:1.6">Hi <strong style="color:#0D1F3C">${name}</strong>, it's been a while since your last service with us${typeof monthsAgo !== 'undefined' && monthsAgo ? ' (' + monthsAgo + ' months ago)' : ''}. Your bike misses the open road!</p>
          <div style="background:#EEF3FC;border-radius:16px;padding:28px;margin-bottom:24px;text-align:center">
            <div style="font-size:42px;margin-bottom:8px">🎁</div>
            <div style="font-size:13px;color:#2563EB;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">Welcome back offer</div>
            <div style="font-size:32px;font-weight:900;color:#2563EB;margin-bottom:4px">$15 OFF</div>
            <div style="font-size:13px;color:#2563EB;margin-bottom:16px;opacity:0.8">your next service — valid 14 days</div>
            <div style="background:#fff;border-radius:10px;padding:10px 20px;display:inline-block;border:2px solid #2563EB">
              <span style="font-size:20px;font-weight:900;color:#0D1F3C;letter-spacing:0.16em">BACK15</span>
            </div>
          </div>
          <div style="background:#F7F8FA;border-radius:12px;padding:16px;margin-bottom:24px">
            <p style="font-size:13px;color:#0D1F3C;font-weight:600;margin:0 0 8px">🔧 Your bike may need some love after ${typeof monthsAgo !== 'undefined' && monthsAgo ? monthsAgo + ' months' : 'this time'}</p>
            <p style="font-size:12px;color:#6B7280;margin:0;line-height:1.8">
              &bull; Brake pads wear out and can become unsafe<br>
              &bull; Cables stretch and affect shifting precision<br>
              &bull; Chain wear accelerates drivetrain damage<br>
              &bull; A Tune-Up takes ~1h and keeps you safe
            </p>
          </div>
          <a href="https://drbikesydney.com.au/?coupon=BACK15" style="display:block;background:#0A58CA;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:10px;font-weight:700;font-size:15px;margin-bottom:12px">Book now — use BACK15 &rarr;</a>
          <p style="font-size:12px;color:#9CA3AF;text-align:center;margin:0">We come to you &mdash; home, work or park &middot; 0433 963 250</p>
        </div>${footer()}`,
    },
    abandoned_recovery: {
      subject: `🚲 You left something behind, ${name}!`,
      html: `${header('#0D1F3C', '🚲', 'Still thinking about it?')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 20px;line-height:1.6">Hi <strong style="color:#0D1F3C">${name}</strong>, you started booking a <strong>${service}</strong>${date ? ' for ' + date : ''} but didn't complete it. Your bike is waiting!</p>
          <div style="background:#EEF3FC;border-radius:16px;padding:24px;margin-bottom:24px;text-align:center">
            <div style="font-size:13px;color:#2563EB;font-weight:700;margin-bottom:4px">Your booking details</div>
            <div style="font-size:20px;font-weight:800;color:#0D1F3C;margin-bottom:4px">${service}</div>
            ${date ? `<div style="font-size:13px;color:#2563EB;margin-bottom:12px">${date}${time ? ' at ' + time : ''}</div>` : ''}
            <div style="font-size:24px;font-weight:900;color:#2563EB">$${price}</div>
          </div>
          <a href="https://drbikesydney.com.au" style="display:block;background:#0D1F3C;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:10px;font-weight:700;font-size:15px;margin-bottom:12px">Complete my booking &rarr;</a>
          <p style="font-size:12px;color:#9CA3AF;text-align:center;margin:0">We come to you &mdash; home, work or park &middot; 0433 963 250</p>
        </div>${footer()}`,
    },
    birthday_promo: {
      subject: `🎂 Happy Birthday, ${name}! A gift from Dr. Bike Sydney`,
      html: `${header('#F59E0B', '🎂', 'Happy Birthday!')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 20px;line-height:1.6">Hi <strong style="color:#0D1F3C">${name}</strong>, wishing you an amazing birthday from the whole Dr. Bike team! 🚲</p>
          <div style="background:#FFFBEB;border-radius:16px;padding:28px;margin-bottom:24px;text-align:center;border:2px dashed #FCD34D">
            <div style="font-size:42px;margin-bottom:8px">🎁</div>
            <div style="font-size:13px;color:#D97706;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">Your birthday gift</div>
            <div style="font-size:32px;font-weight:900;color:#D97706;margin-bottom:4px">$20 OFF</div>
            <div style="font-size:13px;color:#D97706;margin-bottom:16px;opacity:0.8">any service booked this week</div>
            <div style="background:#fff;border-radius:10px;padding:10px 20px;display:inline-block;border:2px solid #FCD34D">
              <span style="font-size:20px;font-weight:900;color:#0D1F3C;letter-spacing:0.16em">BDAY20</span>
            </div>
          </div>
          <div style="background:#F7F8FA;border-radius:12px;padding:16px;margin-bottom:24px">
            <p style="font-size:12px;color:#6B7280;margin:0;line-height:1.8">
              &bull; Valid for 7 days from your birthday<br>
              &bull; Applies to any service $109+<br>
              &bull; One use per customer<br>
              &bull; Enter code at checkout
            </p>
          </div>
          <a href="https://drbikesydney.com.au/?coupon=BDAY20" style="display:block;background:#F59E0B;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:10px;font-weight:700;font-size:15px;margin-bottom:12px">Redeem my birthday gift &rarr;</a>
          <p style="font-size:12px;color:#9CA3AF;text-align:center;margin:0">We come to you &mdash; home, work or park &middot; Mon&ndash;Sat</p>
        </div>${footer()}`,
    },
    payment_action_required: {
      subject: `🔐 Action required — verify your Dr. Bike payment`,
      html: `${header('#2563EB', '🔐', 'Payment verification needed')}
        <div style="padding:32px 28px">
          <p style="color:#6B7280;font-size:14px;margin:0 0 20px;line-height:1.6">Hi <strong style="color:#0D1F3C">${name}</strong>, your bank requires additional verification for your membership renewal.</p>
          <div style="background:#EEF3FC;border-radius:12px;padding:16px;margin-bottom:20px">
            <p style="font-size:13px;color:#2563EB;font-weight:600;margin:0 0 4px">🔐 One more step</p>
            <p style="font-size:12px;color:#2563EB;margin:0;line-height:1.6">Your bank uses 3D Secure authentication. Click below to complete verification and keep your membership active.</p>
          </div>
          <a href="https://drbikesydney.com.au/?action=membership" style="display:block;background:#2563EB;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px">Complete verification →</a>
        </div>${footer()}`,
    },
    booking_confirmation: {
      to: 'contact@drbikesydney.com.au',
      subject: `New Booking - ${service} - ${clientName || name}`,
      html: `${header('#0D1F3C', '📋', 'New Booking Request')}
        <div style="padding:32px 28px">
          <div style="background:#F7F8FA;border-radius:12px;padding:20px;margin-bottom:24px">
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:8px 0;color:#6B7280;font-size:13px">Client</td><td style="padding:8px 0;font-weight:600;color:#0D1F3C;font-size:13px;text-align:right">${clientName || name}</td></tr>
              <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;border-top:1px solid #E5E7EB">Phone</td><td style="padding:8px 0;font-weight:600;color:#0D1F3C;font-size:13px;text-align:right;border-top:1px solid #E5E7EB">${phone || '—'}</td></tr>
              <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;border-top:1px solid #E5E7EB">Service</td><td style="padding:8px 0;font-weight:600;color:#0D1F3C;font-size:13px;text-align:right;border-top:1px solid #E5E7EB">${service}</td></tr>
              <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;border-top:1px solid #E5E7EB">Date</td><td style="padding:8px 0;font-weight:600;color:#0D1F3C;font-size:13px;text-align:right;border-top:1px solid #E5E7EB">${date}${time ? ' at ' + time : ''}</td></tr>
              <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;border-top:1px solid #E5E7EB">Address</td><td style="padding:8px 0;font-weight:600;color:#0D1F3C;font-size:13px;text-align:right;border-top:1px solid #E5E7EB">${address || '—'}</td></tr>
              <tr><td style="padding:10px 0 0;font-weight:700;color:#0D1F3C;font-size:14px;border-top:2px solid #E5E7EB">Price</td><td style="padding:10px 0 0;font-weight:800;color:#2563EB;font-size:18px;text-align:right;border-top:2px solid #E5E7EB">$${price} AUD</td></tr>
            </table>
          </div>
          <a href="https://drbikesydney.com.au/admin.html" style="display:block;background:#0D1F3C;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px">Open admin panel →</a>
        </div>${footer()}`,
    },
  };

  const template = Object.hasOwn(templates, type) ? templates[type] : templates.confirmation;

  // Recipients. The Origin/Referer check above is forgeable with a single curl
  // header, so a browser-originated call does NOT get to choose who we mail:
  // either the template has a fixed business address, or the address is read
  // off the booking being notified. Without this, /api/send-email was an open
  // relay for HTML mail from our DNS-verified noreply@drbikesydney.com.au.
  let recipient = template.to || to;
  if (!isInternalCall(req)) {
    if (!template.to && !isBusinessRecipient(recipient)) {
      const bound = await recipientForBooking(bookingId, 'client_email');
      if (!bound) {
        return res.status(403).json({ error: 'A booking id is required to email this recipient' });
      }
      recipient = bound;
    }
  }
  const recipients = [recipient];

  // Language: the caller can pass it (the app knows what the client is reading
  // right now), otherwise it comes off the booking - the crons run server-side
  // with no browser to ask. Anything unknown falls back to English.
  // Mail addressed to ourselves stays English: the team works in English.
  let lang = 'en';
  if (!template.to && !isBusinessRecipient(recipient)) {
    lang = normalizeLang(req.body?.lang || (await recipientForBooking(bookingId, 'client_lang')));
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
        to: recipients,
        subject: translateEmailSubject(template.subject, lang),
        html: translateEmailHtml(template.html, lang),
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Email failed');
    return res.status(200).json({ success: true, id: data.id });
  } catch (error) {
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
