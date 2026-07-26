// api/send-push.js — Web Push Notifications para clientes
// Sends a push notification to a client's browser via their stored subscription
//
// ENV VARS needed in Vercel:
//   VAPID_PUBLIC_KEY   → generate with: npx web-push generate-vapid-keys
//   VAPID_PRIVATE_KEY  → same command
//   VAPID_EMAIL        → mailto:hello@drbike.com.au

import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import {
  guard,
  sanitize,
  sanitizeObj,
  rateLimit,
  isInternalCall,
  isAllowedBrowserOrigin,
  verifyMechanicToken,
  isAdminAccessToken,
} from './_security.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
if (!SUPABASE_KEY) console.error('SUPABASE_KEY missing in send-push.js');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:hello@drbikesydney.com.au',
  process.env.VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

export default async function handler(req, res) {
  if (await guard(req, res, { rateMax: 5, rateWindow: 60000 })) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { clientId, title, body, url, tag, icon } = req.body;
  if (!clientId) return res.status(400).json({ error: 'Missing clientId' });

  // Who is calling. The Origin/Referer check is a filter, not proof - it is
  // forgeable with one curl header - so pushing to a client now needs a real
  // credential: the server-to-server secret, a mechanic session token, or an
  // admin session. Before this, anyone who knew a client's UUID could put our
  // branding and their own text on that client's lock screen.
  const internal = isInternalCall(req);
  if (!internal) {
    if (!isAllowedBrowserOrigin(req)) return res.status(403).json({ error: 'Forbidden' });
    const isMechanic = !!verifyMechanicToken(req.body?.token);
    const isAdmin = isMechanic ? false : await isAdminAccessToken(req.body?.access_token);
    if (!isMechanic && !isAdmin) {
      return res.status(401).json({ error: 'Sign in as a mechanic or admin to send a push' });
    }
  }

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(503).json({
      error: 'VAPID keys not configured',
      hint: 'Run: npx web-push generate-vapid-keys — then add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to Vercel env vars',
    });
  }

  // Get client's push subscription from Supabase
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: profile } = await sb
    .from('profiles')
    .select('push_subscription, full_name')
    .eq('id', clientId)
    .single();

  if (!profile?.push_subscription) {
    return res.status(404).json({ error: 'No push subscription for this client' });
  }

  let subscription;
  try {
    subscription =
      typeof profile.push_subscription === 'string'
        ? JSON.parse(profile.push_subscription)
        : profile.push_subscription;
  } catch {
    return res.status(400).json({ error: 'Invalid push subscription format' });
  }

  // The caller decides the text and the link, and the Origin check above is
  // forgeable, so a push could otherwise carry an off-site link and read as if
  // we sent it. Force the destination to be a path on our own site, and cap the
  // text - no legitimate caller needs either freedom.
  const safePath = (value) => {
    const raw = String(value || '/');
    return /^\/(?!\/)[^\s]*$/.test(raw) ? raw.slice(0, 300) : '/';
  };
  const clamp = (value, max, fallback) =>
    String(value || fallback)
      .replace(/\s+/g, ' ')
      .slice(0, max);

  const payload = JSON.stringify({
    title: clamp(title, 80, 'Dr. Bike Sydney'),
    body: clamp(body, 300, 'Update on your booking'),
    icon: safePath(icon || '/icon-192.png'),
    badge: '/icon-192.png',
    tag: clamp(tag, 60, 'drbike-update'),
    url: safePath(url),
  });

  try {
    await webpush.sendNotification(subscription, payload);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Web push error:', err);
    // If subscription expired, clear it from DB
    if (err.statusCode === 410 || err.statusCode === 404) {
      await sb.from('profiles').update({ push_subscription: null }).eq('id', clientId);
      return res.status(410).json({ error: 'Subscription expired — cleared from DB' });
    }
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
