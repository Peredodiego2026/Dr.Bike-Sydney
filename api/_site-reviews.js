// api/_site-reviews.js - the reviews written on drbikesydney.com.au/reviews.
//
// Diego, 20-nov-2026, after Google took the business profile down: "tiene que
// haber una seccion de comentarios igual a google maps ... no debe exigir
// cuenta. pero la gente puede escribir poner estrellas y dejar sus fotos".
//
// No account, so the protections are the ones an anonymous form can have:
//   - Cloudflare Turnstile, the same widget and site key as the fleet form;
//   - at most DAILY_CAP reviews a day from one visitor, counted by a hash of
//     the IP (the IP itself is never stored);
//   - no links in the name or the comment - the shape almost all review spam
//     takes;
//   - photos are JPEG bytes the page made with a canvas, checked by their
//     first bytes, capped in size and count.
// A review is published at once. Diego hides spam, abuse or someone's
// personal details from Admin > Reviews - the ACCC allows that much and never
// hiding a genuine bad review, which is why there is no "approve first" queue
// for him to forget.
//
// The table is scripts/add-site-reviews.sql. The public never reads it: the
// public_reviews view (scripts/create-public-reviews-view.sql) shows the
// published ones with "First L." of the name.

import crypto from 'node:crypto';
import { verifyTurnstile, getClientIP, isValidEmail } from './_security.js';
import { emailFrame, emailButton, INK, MUTED } from './_email-frame.js';

// Six, because some customers send many (Diego, 20-nov-2026).
export const MAX_PHOTOS = 6;
// Vercel refuses a request body over 4.5MB, and base64 adds a third. Six
// photos at these caps, thumbnails included, are about 3.8MB on the wire. The
// page makes a 1280px JPEG (normally 150-300KB) and shrinks it further until
// it fits under the cap, so a reviewer never sees this number.
export const PHOTO_MAX_BYTES = 420_000;
export const THUMB_MAX_BYTES = 50_000;
export const DAILY_CAP = 3;
export const NAME_MAX = 60;
export const COMMENT_MIN = 3;
export const COMMENT_MAX = 1000;
// The public bucket the website's showcase photos already live in
// (api/_photo-gallery.js SHOWCASE_BUCKET). A reviewer's photo is published
// by the reviewer, on purpose, next to their review.
export const PHOTO_BUCKET = 'job-photos';
export const PHOTO_FOLDER = 'site-reviews';
const OWNER_EMAIL = 'contact@drbikesydney.com.au';
const LANGS = ['en', 'es', 'zh'];

// http://, www., or a bare domain with a common ending. Over-blocking a
// genuine "bikeshop.com was closed" costs one rewrite; letting links through
// turns the page into an SEO spam target. Endings that are also English words
// (.shop, .top, .site...) are left out: "quickly.Top service" is a typo, not
// a link.
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|info|biz|io|ru|xyz)(\.au)?\b)/i;

// Strips control characters (keeps line breaks in the comment) and trims.
function clean(v, keepNewlines) {
  const s = String(v ?? '');
  const out = keepNewlines
    ? s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    : s.replace(/[\u0000-\u001F\u007F]/g, ' ');
  return out
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function jpegBytes(b64, max) {
  if (typeof b64 !== 'string' || !b64) return null;
  const buf = Buffer.from(b64.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, ''), 'base64');
  if (buf.length < 4 || buf.length > max) return null;
  // The page always sends canvas.toDataURL('image/jpeg'): anything that does
  // not start like a JPEG is not from the page.
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
  return buf;
}

// Pure: the request body in, either { error } or { value } out.
export function validateReview(body) {
  const b = body || {};
  const rating = Number(b.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return { error: 'Please choose from 1 to 5 stars.' };

  const name = clean(b.name, false);
  if (!name) return { error: 'Please add your name.' };
  if (name.length > NAME_MAX) return { error: 'That name is too long.' };

  const comment = clean(b.comment, true);
  if (comment.length < COMMENT_MIN) return { error: 'Please write a few words about the service.' };
  if (comment.length > COMMENT_MAX) return { error: 'Please keep it under 1000 characters.' };

  if (LINK.test(name) || LINK.test(comment))
    return { error: 'Please leave links out of your review.' };

  const email = clean(b.email, false).toLowerCase();
  if (email && (email.length > 254 || !isValidEmail(email)))
    return { error: 'That email does not look right.' };

  const sent = Array.isArray(b.photos) ? b.photos : [];
  if (sent.length > MAX_PHOTOS) return { error: `Up to ${MAX_PHOTOS} photos, please.` };
  const photos = [];
  for (const p of sent) {
    const full = jpegBytes(p?.data, PHOTO_MAX_BYTES);
    if (!full) return { error: 'One of the photos could not be read. Please try another.' };
    // A thumbnail that is missing or wrong is not the reviewer's fault: the
    // full photo stands in for it.
    photos.push({ full, thumb: jpegBytes(p?.thumb, THUMB_MAX_BYTES) || full });
  }

  const lang = LANGS.includes(b.lang) ? b.lang : 'en';
  return { value: { rating, name, comment, email: email || null, photos, lang } };
}

export function hashIp(ip, salt) {
  return crypto
    .createHash('sha256')
    .update(`${ip}|${salt || ''}`)
    .digest('hex')
    .slice(0, 32);
}

// "First L." - the same mask the view applies, for the copy the page shows
// straight after posting and for the owner's email subject.
export function shortName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'Dr. Bike client';
  return parts[1] ? `${parts[0]} ${parts[1][0]}.` : parts[0];
}

// The thumbnail sits next to the photo: `1.jpg` -> `1_t.jpg`. The page derives
// it the same way, so the row stores one URL per photo.
export function thumbUrl(url) {
  return String(url).replace(/\.jpg$/, '_t.jpg');
}

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

export function ownerEmailHtml(r) {
  const stars = '&#9733;'.repeat(r.rating) + '&#9734;'.repeat(5 - r.rating);
  const photos = r.photos.length
    ? `<p style="margin:14px 0 0">${r.photos
        .map(
          (u) =>
            `<a href="${esc(u)}"><img src="${esc(thumbUrl(u))}" width="96" height="96" alt="Review photo" style="width:96px;height:96px;object-fit:cover;border-radius:8px;margin-right:6px;border:0"></a>`
        )
        .join('')}</p>`
    : '';
  const body = `
    <p style="margin:0;font-size:22px;color:${INK};letter-spacing:2px">${stars}</p>
    <p style="margin:6px 0 0;font-weight:700;color:${INK}">${esc(r.name)}${r.email ? ` &middot; <span style="font-weight:400;color:${MUTED}">${esc(r.email)}</span>` : ''}</p>
    <p style="margin:14px 0 0;white-space:pre-line;color:${INK}">${esc(r.comment)}</p>
    ${photos}
    <p style="margin:22px 0 0">It is already on drbikesydney.com.au/reviews. If it is spam, abuse or someone's personal details, hide it from Admin &gt; Reviews. A genuine review stays up, good or bad.</p>
    <p style="margin:22px 0 0;text-align:center">${emailButton('https://drbikesydney.com.au/admin.html', 'Open Admin')}</p>`;
  return emailFrame({ title: 'New review on the website', body });
}

function storageHeaders(serviceKey, extra) {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, ...extra };
}

async function uploadPhoto({ supabaseUrl, serviceKey, fetchImpl }, path, bytes) {
  const r = await fetchImpl(`${supabaseUrl}/storage/v1/object/${PHOTO_BUCKET}/${path}`, {
    method: 'POST',
    headers: storageHeaders(serviceKey, {
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
      // The name never points at a different photo, so a week in the
      // visitor's cache is safe - and egress is the plan's tightest limit.
      'cache-control': 'max-age=604800',
    }),
    body: bytes,
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`photo upload failed: HTTP ${r.status}`);
}

// POST /api/auth  { type: 'site-review', rating, name, comment, email?, photos?, lang?, turnstileToken }
export async function handleSiteReview(req, res, deps) {
  const { supabaseUrl, serviceKey, fetchImpl = fetch, verify = verifyTurnstile } = deps;

  const v = validateReview(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const r = v.value;

  if (!(await verify(req, req.body?.turnstileToken)))
    return res.status(403).json({ error: 'The security check did not pass. Please try again.' });

  const ipHash = hashIp(getClientIP(req), serviceKey);
  const rest = (path, opts = {}) =>
    fetchImpl(`${supabaseUrl}/rest/v1/${path}`, {
      ...opts,
      headers: storageHeaders(serviceKey, {
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      }),
    });

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const recent = await rest(
    `site_reviews?select=id&ip_hash=eq.${ipHash}&created_at=gte.${encodeURIComponent(since)}&limit=${DAILY_CAP}`
  );
  if (!recent.ok) {
    console.error('[site-review] could not read site_reviews:', recent.status, await recent.text());
    return res.status(503).json({ error: 'Reviews are not open yet. Please try again later.' });
  }
  if ((await recent.json()).length >= DAILY_CAP)
    return res.status(429).json({ error: 'You have already left reviews today. Thank you!' });

  const id = crypto.randomUUID();
  const photoUrls = [];
  for (let i = 0; i < r.photos.length; i++) {
    const base = `${PHOTO_FOLDER}/${id}/${i + 1}`;
    try {
      await uploadPhoto({ supabaseUrl, serviceKey, fetchImpl }, `${base}.jpg`, r.photos[i].full);
      await uploadPhoto({ supabaseUrl, serviceKey, fetchImpl }, `${base}_t.jpg`, r.photos[i].thumb);
      photoUrls.push(`${supabaseUrl}/storage/v1/object/public/${PHOTO_BUCKET}/${base}.jpg`);
    } catch (e) {
      // The review still goes up without that photo, and the page says so.
      console.warn('[site-review]', e.message);
    }
  }

  const row = {
    id,
    name: r.name,
    rating: r.rating,
    comment: r.comment,
    photos: photoUrls,
    email: r.email,
    lang: r.lang,
    ip_hash: ipHash,
    status: 'published',
  };
  const ins = await rest('site_reviews', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!ins.ok) {
    console.error('[site-review] insert failed:', ins.status, await ins.text());
    return res.status(500).json({ error: 'Your review could not be saved. Please try again.' });
  }
  const saved = (await ins.json())?.[0] || row;

  // Awaited, with a bound: a function that has already answered can be frozen
  // before a fire-and-forget fetch leaves, and then Diego never hears of it.
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const mail = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Dr. Bike Sydney <noreply@drbikesydney.com.au>',
          to: [OWNER_EMAIL],
          ...(r.email && { reply_to: r.email }),
          subject: `New ${r.rating}-star review from ${shortName(r.name)}`,
          html: ownerEmailHtml({ ...r, photos: photoUrls }),
        }),
        signal: AbortSignal.timeout(4000),
      });
      if (!mail.ok) console.warn('[site-review] owner email failed:', mail.status);
    } catch (e) {
      console.warn('[site-review] owner email error:', e.message);
    }
  }

  return res.status(200).json({
    ok: true,
    photosDropped: r.photos.length - photoUrls.length,
    review: {
      id: saved.id || id,
      display_name: shortName(r.name),
      suburb: null,
      rating: r.rating,
      comment: r.comment,
      completed_at: saved.created_at || new Date().toISOString(),
      photos: photoUrls,
      verified: false,
    },
  });
}

// POST /api/auth  { type: 'admin-site-reviews', access_token, action: 'list' | 'set', id?, status?, reason? }
// The admin check happened in api/auth.js before this is reached.
export async function handleAdminSiteReviews(req, res, sb) {
  const action = String(req.body?.action || 'list');
  if (action === 'list') {
    const { data, error } = await sb
      .from('site_reviews')
      .select('id,created_at,name,rating,comment,photos,email,status,hidden_reason')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ reviews: data || [] });
  }
  if (action === 'set') {
    const id = String(req.body?.id || '');
    const status = req.body?.status;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Which review?' });
    if (status !== 'hidden' && status !== 'published')
      return res.status(400).json({ error: 'Hide or show?' });
    const reason =
      status === 'hidden' ? clean(req.body?.reason, false).slice(0, 120) || null : null;
    const { data, error } = await sb
      .from('site_reviews')
      .update({ status, hidden_reason: reason })
      .eq('id', id)
      .select('id,status,hidden_reason');
    if (error) return res.status(500).json({ error: error.message });
    if (!data?.length) return res.status(404).json({ error: 'That review does not exist.' });
    return res.status(200).json({ review: data[0] });
  }
  return res.status(400).json({ error: 'Unknown action' });
}
