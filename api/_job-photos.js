// api/_job-photos.js - the before/after and chat photos of a job, in a private bucket.
//
// Until 2026-09-30 every one of them went to the PUBLIC `job-photos` bucket:
// anyone holding the link could open the photo, forever, from any forwarded
// email, browser history or log line it ended up in. The path carries the
// booking's UUID, so it could not be guessed - which is why the claim evidence
// was closed first (its path used to be a timestamp) - but a link that leaks
// keeps working for good.
//
// Now:
//   - a new photo is uploaded into JOB_PHOTO_BUCKET, which is private, through
//     a one-time upload URL the server signs only for the mechanic on that job
//   - the row stores a REFERENCE, `job-photos-private/jobs/<booking>/before_<ts>.jpg`,
//     never a URL
//   - whoever shows it asks the server, which checks they can see that booking
//     and signs the reference for an hour
//
// The same shape as the claim evidence (CLAIM_BUCKET in api/auth.js), on
// purpose, including the fallback: buckets are created by hand in the Supabase
// dashboard, like the SQL migrations, so until Diego creates this one the
// upload URL request fails and the mechanic app falls back to the public
// bucket exactly as before. Nothing breaks on the day this merges.
//
// Mechanic profile photos and review photos stay in the public bucket: the
// first are shown on the public landing page, the second are the client's own
// review. Only what shows a job is private.

export const JOB_PHOTO_BUCKET = 'job-photos-private';

// The extension and content type are picked from this list, never taken from
// the file - same rule as safeImageUpload() in js/mechanic.js (docs/PENDIENTES.md 104).
export const JOB_PHOTO_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

const KINDS = new Set(['before', 'after', 'chat']);

// Booking ids are UUIDs. Anything else is refused before it can reach a
// storage path, where `../` would mean something.
const SAFE_ID = /^[0-9a-f-]{8,64}$/i;
const SAFE_FILE = /^[a-z0-9_]+\.[a-z0-9]+$/i;

// Where a new photo goes. Null for anything outside the fixed vocabulary.
export function newJobPhotoPath(bookingId, kind, ext, now = Date.now()) {
  if (!SAFE_ID.test(String(bookingId || ''))) return null;
  if (!KINDS.has(kind)) return null;
  const e = String(ext || '').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(JOB_PHOTO_TYPES, e)) return null;
  return kind === 'chat'
    ? `chat/${bookingId}/${now}.${e}`
    : `jobs/${bookingId}/${kind}_${now}.${e}`;
}

// The path inside the private bucket IF `ref` is a reference to a photo of
// THIS booking, null otherwise. Checking the booking is the whole point: the
// server decides who may see booking X, so a reference that points into
// booking Y's folder must never be signed on X's say-so.
export function jobPhotoPath(ref, bookingId) {
  if (typeof ref !== 'string' || !SAFE_ID.test(String(bookingId || ''))) return null;
  const prefix = `${JOB_PHOTO_BUCKET}/`;
  if (!ref.startsWith(prefix)) return null;
  const parts = ref.slice(prefix.length).split('/');
  if (parts.length !== 3) return null;
  const [folder, id, file] = parts;
  if (folder !== 'jobs' && folder !== 'chat') return null;
  if (id !== String(bookingId)) return null;
  if (!SAFE_FILE.test(file)) return null;
  return `${folder}/${id}/${file}`;
}

export function isJobPhotoRef(ref) {
  return typeof ref === 'string' && ref.startsWith(`${JOB_PHOTO_BUCKET}/`);
}

// A stored value is either a full URL (every photo taken before the private
// bucket existed, and the fallback) or a reference. URLs come back untouched,
// so this can never break an old booking. A reference is signed; a reference
// to another booking, or one that fails to sign, comes back null - handing the
// screen something that looks like a URL and is not would be worse.
export async function signJobPhoto(ref, bookingId, opts) {
  if (!ref || typeof ref !== 'string') return ref ?? null;
  if (!isJobPhotoRef(ref)) return ref;
  const path = jobPhotoPath(ref, bookingId);
  if (!path) return null;
  const { supabaseUrl, serviceKey, expiresIn = 3600, fetchImpl = fetch } = opts;
  try {
    const r = await fetchImpl(`${supabaseUrl}/storage/v1/object/sign/${JOB_PHOTO_BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn }),
    });
    if (!r.ok) {
      console.warn(`[job-photos] could not sign ${path}: HTTP ${r.status}`);
      return null;
    }
    const d = await r.json();
    return d?.signedURL ? `${supabaseUrl}/storage/v1${d.signedURL}` : null;
  } catch (e) {
    console.warn(`[job-photos] signing threw for ${path}:`, e.message);
    return null;
  }
}

const PHOTO_MESSAGE = /^\[PHOTO:(.*)\]$/;

// Chat photos travel as a message `[PHOTO:<url or reference>]`. Every screen
// shows one only when what is inside starts with http(s) - so signing the
// reference here is all it takes for the chat to show it, and a photo that
// cannot be signed turns into plain text instead of a broken image.
export async function signPhotoMessages(messages, bookingId, opts) {
  return Promise.all(
    (messages || []).map(async (m) => {
      const hit = typeof m?.message === 'string' ? m.message.match(PHOTO_MESSAGE) : null;
      if (!hit || !isJobPhotoRef(hit[1])) return m;
      const url = await signJobPhoto(hit[1], bookingId, opts);
      return { ...m, message: url ? `[PHOTO:${url}]` : 'Photo unavailable' };
    })
  );
}

// Asks Storage for a one-time upload URL. Returns { token } or { status } when
// Storage said no - which, until the bucket exists, is every time.
export async function createJobPhotoUpload(path, opts) {
  const { supabaseUrl, serviceKey, fetchImpl = fetch } = opts;
  try {
    const r = await fetchImpl(
      `${supabaseUrl}/storage/v1/object/upload/sign/${JOB_PHOTO_BUCKET}/${path}`,
      {
        method: 'POST',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      }
    );
    if (!r.ok) return { status: r.status };
    const d = await r.json();
    const token = d?.url
      ? new URL(`${supabaseUrl}/storage/v1${d.url}`).searchParams.get('token')
      : null;
    return token ? { token } : { status: 502 };
  } catch (e) {
    console.warn(`[job-photos] upload URL threw for ${path}:`, e.message);
    return { status: 502 };
  }
}
