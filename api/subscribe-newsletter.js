import { createClient } from '@supabase/supabase-js';
import { guard, sanitize, isValidEmail, verifyTurnstile } from './_security.js';
import { withSentry } from './_sentry.js';
import { emailFrame, emailButton, INK, FAINT } from './_email-frame.js';
import { translateEmailHtml, translateEmailSubject } from './_email-i18n.js';

async function handler(req, res) {
  if (await guard(req, res, { rateMax: 20, rateWindow: 60000 })) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let { email, name, tags = [] } = req.body || {};
  const source = req.body?.source || 'website';
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  // Bot check - each subscribe writes a DB row and sends a Resend email, so
  // an unprotected endpoint is a spam/quota-burn vector.
  if (!(await verifyTurnstile(req, req.body?.turnstileToken))) {
    return res.status(403).json({ error: 'Verification failed - please try again' });
  }

  email = email.toLowerCase().trim();
  name = sanitize(name || '');
  if (!Array.isArray(tags)) tags = [];
  tags = tags
    .map((t) => sanitize(String(t)))
    .filter(Boolean)
    .slice(0, 10);

  const supabase = createClient(
    process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  const { error } = await supabase
    .from('newsletter_subscribers')
    .upsert({ email, name: name || null, source, tags, active: true }, { onConflict: 'email' });

  if (error) {
    console.error('[newsletter] Supabase error:', error.message);
    return res.status(500).json({ error: 'Could not subscribe' });
  }

  // Send welcome email via Resend, in the language of the page it came from.
  const lang = req.body?.lang;
  try {
    const welcomeHtml = emailFrame({
      title: `Thanks for subscribing${name ? ', ' + name : ''}!`,
      body: `<p style="margin:0 0 24px">You'll receive cycling tips, maintenance reminders and exclusive offers for Dr. Bike Sydney members.</p>
        <p style="margin:0 0 24px">${emailButton('https://drbikesydney.com.au', 'Book a service →')}</p>
        <p style="margin:0;font-size:13px">Use code <strong style="color:${INK}">WELCOME10</strong> for 10% off your first booking.</p>`,
      footerExtra: `<br><a href="https://drbikesydney.com.au/unsubscribe?email=${encodeURIComponent(email)}" style="color:${FAINT}">Unsubscribe</a>`,
    });

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
        to: email,
        subject: translateEmailSubject("You're subscribed — Dr. Bike Sydney 🚲", lang),
        html: translateEmailHtml(welcomeHtml, lang),
      }),
    });
  } catch (e) {
    // Non-fatal: subscriber saved, email failed
    console.warn('[newsletter] Welcome email failed:', e.message);
  }

  return res.status(200).json({ success: true, message: 'Subscribed!' });
}

// Un error aca no puede quedar solo en los logs de Vercel, que nadie mira.
// Punto 20 de la auditoria: hasta el 2026-09-01 este archivo podia fallar en
// produccion sin dejar rastro en ningun lado accionable.
export default withSentry(handler, 'subscribe-newsletter');
