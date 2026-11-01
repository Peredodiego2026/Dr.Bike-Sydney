// The frame of the emails that go straight to Resend instead of through
// api/send-email.js: waitlist slot open, the mechanic's upsell and service
// reminder, the fleet enquiry echo and the newsletter welcome.
//
// Until 01-nov-2026 each of those had its own frame, and three of them left
// the body background unset under navy text. A mail app in dark mode paints
// whatever is unset dark, so the text vanished; and the logo either was not
// there or sat as a white box on a navy band. So: every background is set,
// on a table (Outlook ignores it on a div), and the header is the logo as
// it is - blue letters on white.
//
// Gmail and Outlook drop CSS custom properties, so the colours are hex here
// by necessity - the same values as css/variables.css.

export const INK = '#0D1F3C';
export const MUTED = '#475569';
export const FAINT = '#94A3B8';
export const RULE = '#E2E8F0';
export const PAPER = '#F8FAFC';
export const BLUE = '#2563EB';
export const WHITE = '#FFFFFF';

const LOGO = 'https://drbikesydney.com.au/images/logo-db.png';

// "Hi <strong>Ana</strong>", which api/_email-i18n.js turns into "Hola Ana".
// With no name it is "Hi there", and the dictionary drops that to a bare
// "Hola": "Hola there" is worse than no name at all.
export function greeting(name) {
  return name ? `Hi <strong>${name}</strong>` : 'Hi <strong>there</strong>';
}

export function emailButton(href, label) {
  return `<a href="${href}" style="display:inline-block;background:${BLUE};color:${WHITE};padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">${label}</a>`;
}

// title and body are HTML the caller has already escaped.
export function emailFrame({ title, body, footerExtra = '' }) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PAPER}" style="background:${PAPER}">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${WHITE}" style="max-width:560px;background:${WHITE};border:1px solid ${RULE};border-radius:16px;font-family:Inter,Arial,sans-serif">
      <tr><td align="center" style="padding:28px 28px 4px">
        <img src="${LOGO}" alt="Dr. Bike Sydney" height="44" style="display:block;height:44px;width:auto;border:0">
      </td></tr>
      <tr><td style="padding:12px 28px 0;text-align:center;font-size:22px;font-weight:800;line-height:1.3;color:${INK}">${title}</td></tr>
      <tr><td style="padding:20px 28px 30px;font-size:14px;line-height:1.7;color:${MUTED}">${body}</td></tr>
      <tr><td bgcolor="${PAPER}" style="padding:18px 28px;background:${PAPER};border-top:1px solid ${RULE};border-radius:0 0 16px 16px;text-align:center;font-size:12px;line-height:1.6;color:${FAINT}">
        Dr. Bike Sydney · drbikesydney.com.au · 0433 963 250${footerExtra}
      </td></tr>
    </table>
  </td></tr>
</table>`;
}
