// api/_photo-gallery.js - every job photo in one place for Admin > Photos, and
// the ones Diego picks for the website.
//
// Diego, 01-oct-2026: "una seccion en admin donde me pueda meter a ver estas
// fotos, y esten ordenadas... por fecha, por cliente, por servicio y a la vez
// tambien en una carpeta general". And, for later: a carousel of repair photos
// on the landing page, fed by the ones he marks, which he can take off again
// when better ones come along.
//
// Where the photos already are - nothing new is stored to build the gallery:
//   - bookings.photo_before_url / photo_after_url
//   - job_messages rows that read `[PHOTO:<url or reference>]`
//   - bookings.client_photo_url, the photo a client adds to their review
// Each is either a reference into the private bucket (api/_job-photos.js) or a
// public URL, for everything uploaded before 30-sep-2026.
//
// A review photo belongs to the client. It may go on the website only if they
// ticked "Dr. Bike Sydney can show this photo on its website" when they
// uploaded it, which api/auth.js handleClientReview records in the file name
// (`client_<ts>_web.jpg`). Every review photo uploaded before that box existed
// has no `_web`, so none of them can be published - the safe default.
//
// "Show on website" COPIES the photo into the public bucket, under
// `showcase/`. The private original never becomes public, and "remove from
// website" deletes only the copy. The copy's name is derived from the
// original's path, so whether a photo is on the website is answered by
// listing that one folder - no table, no migration for Diego to run.

import { JOB_PHOTO_BUCKET } from './_job-photos.js';

export const SHOWCASE_BUCKET = 'job-photos';
export const SHOWCASE_FOLDER = 'showcase';
const LEGACY_BUCKET = 'job-photos';

// `jobs/`, `chat/` or `reviews/<booking>/<file>` - the folders a photo of a job
// lives in, in either bucket. Mechanic profiles and claims are not, and never
// reach the gallery or the website through here.
const JOB_PATH = /^(jobs|chat|reviews)\/([0-9a-f-]{8,64})\/([a-z0-9_]+\.[a-z0-9]+)$/i;

// Where a stored value points: { bucket, path, folder, bookingId, file, webOk },
// or null for anything that is not a job photo. `webOk` is whether it may be
// shown on the website: always for the mechanic's photos, only with the
// client's `_web` for a review photo.
export function photoSource(value, supabaseUrl) {
  if (typeof value !== 'string' || !value) return null;
  let bucket;
  let path;
  const privatePrefix = `${JOB_PHOTO_BUCKET}/`;
  const publicPrefix = `${supabaseUrl}/storage/v1/object/public/${LEGACY_BUCKET}/`;
  if (value.startsWith(privatePrefix)) {
    bucket = JOB_PHOTO_BUCKET;
    path = value.slice(privatePrefix.length);
  } else if (value.startsWith(publicPrefix)) {
    bucket = LEGACY_BUCKET;
    path = value.slice(publicPrefix.length).split('?')[0];
  } else {
    return null;
  }
  const m = path.match(JOB_PATH);
  if (!m) return null;
  const webOk = m[1] !== 'reviews' || /_web\.[a-z0-9]+$/i.test(m[3]);
  return { bucket, path, folder: m[1], bookingId: m[2], file: m[3], webOk };
}

// The copy's file name in `showcase/`. Deterministic, so the same photo marked
// twice is one copy, and a listing of the folder says which photos are on.
export function showcaseName(src) {
  return src ? src.path.replace(/\//g, '_') : null;
}

// Only names this module could have produced may be deleted from `showcase/`.
export function isShowcaseName(name) {
  return (
    typeof name === 'string' &&
    /^(jobs|chat|reviews)_[0-9a-f-]{8,64}_[a-z0-9_]+\.[a-z0-9]+$/i.test(name)
  );
}

// When the photo was taken, from the file name (`before_1759200000000.jpg`,
// `1759200000000.jpg`, `client_1759200000000_web.jpg`). Null when it cannot tell.
export function takenAt(file) {
  const m = String(file || '').match(/(\d{13})(?:_web)?\.[a-z0-9]+$/i);
  return m ? new Date(Number(m[1])).toISOString() : null;
}

function kindOf(src) {
  if (src.folder === 'chat') return 'chat';
  if (src.folder === 'reviews') return 'review';
  return /^after_/i.test(src.file) ? 'after' : 'before';
}

const PHOTO_MESSAGE = /^\[PHOTO:(.*)\]$/;

// The flat list the gallery shows, newest first. `bookings` are the rows with
// before/after photos plus the ones the chat photos belong to; `messages` are
// the chat rows that carry a photo.
export function collectPhotos({ bookings, messages, supabaseUrl }) {
  const byId = new Map((bookings || []).map((b) => [b.id, b]));
  const out = [];
  const seen = new Set();
  const add = (value, fallbackTime, bookingId) => {
    const src = photoSource(value, supabaseUrl);
    // A reference that points into another booking's folder is not shown
    // under this one - same rule as signing (api/_job-photos.js).
    if (!src || src.bookingId !== bookingId) return;
    const key = `${src.bucket}/${src.path}`;
    if (seen.has(key)) return;
    seen.add(key);
    const b = byId.get(bookingId) || {};
    out.push({
      key,
      ref: value,
      bucket: src.bucket,
      path: src.path,
      kind: kindOf(src),
      booking_id: bookingId,
      client_name: b.client_name || null,
      service_name: b.service_name || null,
      booking_date: b.scheduled_date || null,
      taken_at: takenAt(src.file) || fallbackTime || null,
      showcase_name: showcaseName(src),
      web_ok: src.webOk,
    });
  };
  for (const b of bookings || []) {
    add(b.photo_before_url, null, b.id);
    add(b.photo_after_url, null, b.id);
    add(b.client_photo_url, null, b.id);
  }
  for (const m of messages || []) {
    const hit = typeof m?.message === 'string' ? m.message.match(PHOTO_MESSAGE) : null;
    if (hit) add(hit[1], m.created_at, m.booking_id);
  }
  const t = (p) => p.taken_at || p.booking_date || '';
  return out.sort((a, b) => (t(a) < t(b) ? 1 : t(a) > t(b) ? -1 : 0));
}

// ── Storage calls (service key) ──────────────────────────────────────────────

function hdrs(serviceKey, extra = {}) {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, ...extra };
}

// Signs many private paths in one request per hundred. Returns Map<path, url>.
export async function signMany(
  paths,
  { supabaseUrl, serviceKey, expiresIn = 3600, fetchImpl = fetch }
) {
  const urls = new Map();
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    try {
      const r = await fetchImpl(`${supabaseUrl}/storage/v1/object/sign/${JOB_PHOTO_BUCKET}`, {
        method: 'POST',
        headers: hdrs(serviceKey, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ expiresIn, paths: chunk }),
      });
      if (!r.ok) {
        console.warn(`[photo-gallery] batch sign failed: HTTP ${r.status}`);
        continue;
      }
      for (const d of (await r.json()) || []) {
        if (d?.path && d?.signedURL) urls.set(d.path, `${supabaseUrl}/storage/v1${d.signedURL}`);
      }
    } catch (e) {
      console.warn('[photo-gallery] batch sign threw:', e.message);
    }
  }
  return urls;
}

// The names currently in `showcase/`, i.e. what is on the website.
export async function listShowcase({ supabaseUrl, serviceKey, fetchImpl = fetch }) {
  const names = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const r = await fetchImpl(`${supabaseUrl}/storage/v1/object/list/${SHOWCASE_BUCKET}`, {
      method: 'POST',
      headers: hdrs(serviceKey, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        prefix: SHOWCASE_FOLDER,
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      }),
    });
    if (!r.ok) throw new Error(`showcase list failed: HTTP ${r.status}`);
    const page = (await r.json()) || [];
    for (const f of page) if (isShowcaseName(f?.name)) names.push(f.name);
    if (page.length < 1000) break;
  }
  return names;
}

// Copies one photo into `showcase/`. Storage's own copy first; if this
// project's Storage cannot copy across buckets, the bytes are read with the
// service key and written again. An existing copy counts as done.
export async function copyToShowcase(src, { supabaseUrl, serviceKey, fetchImpl = fetch }) {
  const dest = `${SHOWCASE_FOLDER}/${showcaseName(src)}`;
  const copy = await fetchImpl(`${supabaseUrl}/storage/v1/object/copy`, {
    method: 'POST',
    headers: hdrs(serviceKey, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      bucketId: src.bucket,
      sourceKey: src.path,
      destinationBucket: SHOWCASE_BUCKET,
      destinationKey: dest,
    }),
  });
  if (copy.ok) return true;
  if (copy.status === 409) return true;
  const get = await fetchImpl(
    `${supabaseUrl}/storage/v1/object/authenticated/${src.bucket}/${src.path}`,
    { headers: hdrs(serviceKey) }
  );
  if (!get.ok) {
    console.warn(`[photo-gallery] could not read ${src.bucket}/${src.path}: HTTP ${get.status}`);
    return false;
  }
  const body = Buffer.from(await get.arrayBuffer());
  const put = await fetchImpl(`${supabaseUrl}/storage/v1/object/${SHOWCASE_BUCKET}/${dest}`, {
    method: 'POST',
    headers: hdrs(serviceKey, {
      'Content-Type': get.headers.get('content-type') || 'image/jpeg',
      'x-upsert': 'true',
    }),
    body,
  });
  if (!put.ok) console.warn(`[photo-gallery] could not write ${dest}: HTTP ${put.status}`);
  return put.ok;
}

// Deletes copies from `showcase/`. Never anything else: the names are checked
// against the shape showcaseName() produces before they reach Storage.
export async function removeFromShowcase(names, { supabaseUrl, serviceKey, fetchImpl = fetch }) {
  const safe = (names || []).filter(isShowcaseName);
  if (!safe.length) return [];
  const r = await fetchImpl(`${supabaseUrl}/storage/v1/object/${SHOWCASE_BUCKET}`, {
    method: 'DELETE',
    headers: hdrs(serviceKey, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: safe.map((n) => `${SHOWCASE_FOLDER}/${n}`) }),
  });
  if (!r.ok) throw new Error(`showcase remove failed: HTTP ${r.status}`);
  return safe;
}

export function showcasePublicUrl(name, supabaseUrl) {
  return `${supabaseUrl}/storage/v1/object/public/${SHOWCASE_BUCKET}/${SHOWCASE_FOLDER}/${name}`;
}

// ── The carousel's order ─────────────────────────────────────────────────────
// Diego picks the order the photos run in on the landing page. It lives next
// to the copies, as `showcase/_order.json` in the same public bucket, so the
// future carousel reads one public file and needs no endpoint, table or
// migration. isShowcaseName() never matches it, so it is never listed as a
// photo and "remove from website" can never delete it.
export const ORDER_FILE = `${SHOWCASE_FOLDER}/_order.json`;

// The saved order, made to agree with what is actually in the folder: names
// no longer there are dropped, and photos with no place yet go at the end, in
// name order. Always a full list of the folder's photos.
export function settleOrder(saved, listed) {
  const present = new Set(listed);
  const out = [];
  for (const n of saved || []) if (present.has(n) && !out.includes(n)) out.push(n);
  for (const n of [...listed].sort()) if (!out.includes(n)) out.push(n);
  return out;
}

export async function readOrder({ supabaseUrl, serviceKey, fetchImpl = fetch }) {
  try {
    const r = await fetchImpl(
      `${supabaseUrl}/storage/v1/object/authenticated/${SHOWCASE_BUCKET}/${ORDER_FILE}`,
      { headers: hdrs(serviceKey) }
    );
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d?.order) ? d.order.filter(isShowcaseName) : [];
  } catch {
    return [];
  }
}

export async function writeOrder(order, { supabaseUrl, serviceKey, fetchImpl = fetch }) {
  const r = await fetchImpl(`${supabaseUrl}/storage/v1/object/${SHOWCASE_BUCKET}/${ORDER_FILE}`, {
    method: 'POST',
    headers: hdrs(serviceKey, {
      'Content-Type': 'application/json',
      'x-upsert': 'true',
      // The carousel reads this publicly; a short cache so a reorder shows
      // within a minute instead of an hour.
      'cache-control': 'max-age=60',
    }),
    body: JSON.stringify({
      order: order.filter(isShowcaseName),
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) throw new Error(`order write failed: HTTP ${r.status}`);
}
