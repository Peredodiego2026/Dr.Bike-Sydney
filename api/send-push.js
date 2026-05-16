// api/send-push.js — Web Push Notifications para clientes
// Sends a push notification to a client's browser via their stored subscription
//
// ENV VARS needed in Vercel:
//   VAPID_PUBLIC_KEY   → generate with: npx web-push generate-vapid-keys
//   VAPID_PRIVATE_KEY  → same command
//   VAPID_EMAIL        → mailto:hello@drbike.com.au

import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { guard, sanitize, sanitizeObj, rateLimit } from './_security.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tgpipbloisahufaywhqb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:hello@drbike.com.au',
  process.env.VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

export default async function handler(req, res) {
  if(guard(req, res, { rateMax: 20, rateWindow: 60000 })) return; // 20/min messaging
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { clientId, title, body, url, tag, icon } = req.body;
  if (!clientId) return res.status(400).json({ error: 'Missing clientId' });

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(503).json({
      error: 'VAPID keys not configured',
      hint: 'Run: npx web-push generate-vapid-keys — then add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to Vercel env vars'
    });
  }

  // Get client's push subscription from Supabase
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: profile } = await sb.from('profiles')
    .select('push_subscription, full_name')
    .eq('id', clientId)
    .single();

  if (!profile?.push_subscription) {
    return res.status(404).json({ error: 'No push subscription for this client' });
  }

  let subscription;
  try {
    subscription = typeof profile.push_subscription === 'string'
      ? JSON.parse(profile.push_subscription)
      : profile.push_subscription;
  } catch {
    return res.status(400).json({ error: 'Invalid push subscription format' });
  }

  const payload = JSON.stringify({
    title: title || 'Dr. Bike Sydney',
    body:  body  || 'Update on your booking',
    icon:  icon  || '/icon-192.png',
    badge: '/icon-192.png',
    tag:   tag   || 'drbike-update',
    url:   url   || '/',
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
    return res.status(500).json({ error: err.message });
  }
}
