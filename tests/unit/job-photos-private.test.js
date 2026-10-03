// The before/after and chat photos of a job, in a private bucket
// (api/_job-photos.js).
//
// What has to hold:
//   - a reference is only ever signed for the booking whose folder it is in,
//     and only for someone who may see that booking
//   - every photo stored before this existed is a public URL, and keeps working
//   - until Diego creates the bucket, the upload URL says so (503 + fallback)
//     and the mechanic app keeps using the public bucket
//
// The handlers are RUN against a fake Supabase, not grepped.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

const BOOKING = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-8888-7777-6666-555555555555';
const REF = `job-photos-private/jobs/${BOOKING}/before_1759200000000.jpg`;
const FOREIGN_REF = `job-photos-private/jobs/${OTHER}/before_1759200000000.jpg`;
const OLD_URL = `https://example.supabase.co/storage/v1/object/public/job-photos/jobs/${BOOKING}/before_1.jpg`;

let bucketExists = true;
let signCalls = [];

vi.mock('stripe', () => ({ default: class {} }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: { message: 'no' } }) },
  }),
}));

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });
  const no = (status) => ({ ok: false, status, json: async () => ({}) });
  if (u.includes('/auth/v1/user')) {
    const auth = init.headers?.Authorization || '';
    return auth === 'Bearer client-1-token' ? ok({ id: 'client-1' }) : no(401);
  }
  if (u.includes('/rest/v1/bookings?select=client_id,mechanic_id')) {
    return ok(u.includes(BOOKING) ? [{ client_id: 'client-1', mechanic_id: 'mech-1' }] : []);
  }
  if (u.includes('/rest/v1/escalation_contacts')) {
    return ok([{ id: 'mech-1' }, { id: 'mech-2' }]);
  }
  if (u.includes('/storage/v1/object/upload/sign/')) {
    if (!bucketExists) return no(400);
    const path = u.split('/storage/v1')[1];
    return ok({ url: `${path}?token=upload-token` });
  }
  if (u.includes('/storage/v1/object/sign/')) {
    signCalls.push(u);
    const path = u.split('/storage/v1')[1];
    return ok({ signedURL: `${path}?token=read-token` });
  }
  return no(503);
};

const photos = await import('../../api/_job-photos.js');
const { handlePhotoSign, handleMechanicPhotoUploadUrl } = await import('../../api/auth.js');

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function mechanicToken(mid) {
  const payload = b64url(JSON.stringify({ mid, exp: Date.now() + 60_000, sv: 0 }));
  const sig = b64url(crypto.createHmac('sha256', 'test-service-key').update(payload).digest());
  return `${payload}.${sig}`;
}
const makeRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
};
const call = async (handler, body) => {
  const res = makeRes();
  await handler({ body, headers: {} }, res);
  return res;
};
const opts = { supabaseUrl: 'https://example.supabase.co', serviceKey: 'k' };

beforeEach(() => {
  bucketExists = true;
  signCalls = [];
});

describe('where a new photo goes', () => {
  it('builds the path from a fixed vocabulary', () => {
    expect(photos.newJobPhotoPath(BOOKING, 'before', 'jpg', 5)).toBe(
      `jobs/${BOOKING}/before_5.jpg`
    );
    expect(photos.newJobPhotoPath(BOOKING, 'chat', 'PNG', 5)).toBe(`chat/${BOOKING}/5.png`);
  });

  it('refuses anything outside it', () => {
    expect(photos.newJobPhotoPath(BOOKING, 'invoice', 'jpg')).toBeNull();
    expect(photos.newJobPhotoPath(BOOKING, 'before', 'html')).toBeNull();
    expect(photos.newJobPhotoPath(BOOKING, 'before', 'svg')).toBeNull();
    expect(photos.newJobPhotoPath('../../etc', 'before', 'jpg')).toBeNull();
    expect(photos.newJobPhotoPath('', 'before', 'jpg')).toBeNull();
  });
});

describe('a reference belongs to one booking', () => {
  it('is read back only for its own booking', () => {
    expect(photos.jobPhotoPath(REF, BOOKING)).toBe(`jobs/${BOOKING}/before_1759200000000.jpg`);
    expect(photos.jobPhotoPath(FOREIGN_REF, BOOKING)).toBeNull();
  });

  it('cannot climb out of its folder', () => {
    expect(photos.jobPhotoPath(`job-photos-private/jobs/${BOOKING}/../x.jpg`, BOOKING)).toBeNull();
    expect(photos.jobPhotoPath(`job-photos-private/jobs/${BOOKING}/a/b.jpg`, BOOKING)).toBeNull();
    expect(photos.jobPhotoPath(`job-photos-private/claims/${BOOKING}/a.jpg`, BOOKING)).toBeNull();
  });
});

describe('signing', () => {
  it('leaves every photo taken before the private bucket exactly as it was', async () => {
    expect(await photos.signJobPhoto(OLD_URL, BOOKING, opts)).toBe(OLD_URL);
    expect(await photos.signJobPhoto(null, BOOKING, opts)).toBeNull();
    expect(signCalls).toHaveLength(0);
  });

  it('turns a reference into a signed URL', async () => {
    const url = await photos.signJobPhoto(REF, BOOKING, opts);
    expect(url).toMatch(
      /^https:\/\/example\.supabase\.co\/storage\/v1\/object\/sign\/job-photos-private\/jobs\//
    );
    expect(url).toContain('token=read-token');
  });

  it("never signs another booking's photo, and does not even ask Storage", async () => {
    expect(await photos.signJobPhoto(FOREIGN_REF, BOOKING, opts)).toBeNull();
    expect(signCalls).toHaveLength(0);
  });

  it('turns a chat photo into something every chat screen can show', async () => {
    const [text, photo, old] = await photos.signPhotoMessages(
      [{ message: 'on my way' }, { message: `[PHOTO:${REF}]` }, { message: `[PHOTO:${OLD_URL}]` }],
      BOOKING,
      opts
    );
    expect(text.message).toBe('on my way');
    expect(photo.message).toMatch(/^\[PHOTO:https:\/\/.+token=read-token\]$/);
    expect(old.message).toBe(`[PHOTO:${OLD_URL}]`);
  });

  it('a chat photo that cannot be signed becomes text, not a broken image', async () => {
    const [m] = await photos.signPhotoMessages(
      [{ message: `[PHOTO:${FOREIGN_REF}]` }],
      BOOKING,
      opts
    );
    expect(m.message).toBe('Photo unavailable');
  });
});

describe('who may see a photo (role photo-sign)', () => {
  it('the client whose booking it is', async () => {
    const r = await call(handlePhotoSign, {
      booking_id: BOOKING,
      refs: [REF],
      client_id: 'client-1',
      access_token: 'client-1-token',
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.urls[0]).toContain('token=read-token');
  });

  it('not another client, even with a valid session of their own', async () => {
    const r = await call(handlePhotoSign, {
      booking_id: BOOKING,
      refs: [REF],
      client_id: 'client-2',
      access_token: 'client-1-token',
    });
    expect(r.statusCode).toBe(403);
    expect(signCalls).toHaveLength(0);
  });

  it('the mechanic on the job, and not another mechanic', async () => {
    const mine = await call(handlePhotoSign, {
      booking_id: BOOKING,
      refs: [REF],
      token: mechanicToken('mech-1'),
    });
    expect(mine.statusCode).toBe(200);
    const other = await call(handlePhotoSign, {
      booking_id: BOOKING,
      refs: [REF],
      token: mechanicToken('mech-2'),
    });
    expect(other.statusCode).toBe(403);
  });

  it('nobody without credentials', async () => {
    const r = await call(handlePhotoSign, { booking_id: BOOKING, refs: [REF] });
    expect(r.statusCode).toBe(401);
    expect(signCalls).toHaveLength(0);
  });

  it("access to one booking does not open another booking's photo", async () => {
    const r = await call(handlePhotoSign, {
      booking_id: BOOKING,
      refs: [FOREIGN_REF],
      client_id: 'client-1',
      access_token: 'client-1-token',
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.urls).toEqual([null]);
    expect(signCalls).toHaveLength(0);
  });
});

// The client chat gets new messages over realtime, which hands over the raw
// row - the reference, not a URL. Lifted out of js/app.js and run, not copied.
describe('the client chat signs a photo that arrives over realtime', () => {
  const app = fs.readFileSync(new URL('../../js/app.js', import.meta.url), 'utf8');
  const start = app.indexOf('async function signClientChatPhoto(');
  const close = /\r?\n\}/.exec(app.slice(start));
  const end = start + close.index + close[0].length;
  const load = (fetchImpl) =>
    new Function(
      'sb',
      'fetch',
      'translateValue',
      `${app.slice(start, end)}; return signClientChatPhoto;`
    )(
      {
        auth: {
          getSession: async () => ({
            data: { session: { access_token: 'client-1-token', user: { id: 'client-1' } } },
          }),
        },
      },
      fetchImpl,
      (s) => s
    );

  it('asks for the signature as the client, and shows the signed URL', async () => {
    let sent = null;
    const sign = load(async (url, init) => {
      sent = JSON.parse(init.body);
      return { ok: true, json: async () => ({ urls: ['https://signed.example/photo?token=x'] }) };
    });
    const out = await sign({ message: `[PHOTO:${REF}]` }, BOOKING);
    expect(sent).toMatchObject({
      role: 'photo-sign',
      booking_id: BOOKING,
      refs: [REF],
      client_id: 'client-1',
      access_token: 'client-1-token',
    });
    expect(out.message).toBe('[PHOTO:https://signed.example/photo?token=x]');
  });

  it('leaves text and old public photos alone, without a network call', async () => {
    let calls = 0;
    const sign = load(async () => (calls++, { ok: false }));
    expect((await sign({ message: 'hi' }, BOOKING)).message).toBe('hi');
    expect((await sign({ message: `[PHOTO:${OLD_URL}]` }, BOOKING)).message).toBe(
      `[PHOTO:${OLD_URL}]`
    );
    expect(calls).toBe(0);
  });

  it('says the photo is unavailable when the server will not sign it', async () => {
    const sign = load(async () => ({ ok: false, status: 403, json: async () => ({}) }));
    expect((await sign({ message: `[PHOTO:${REF}]` }, BOOKING)).message).toBe('Photo unavailable');
  });
});

describe('the upload URL (role mechanic-photo-upload-url)', () => {
  it('goes to the mechanic on the job, for a path the server chose', async () => {
    const r = await call(handleMechanicPhotoUploadUrl, {
      token: mechanicToken('mech-1'),
      booking_id: BOOKING,
      kind: 'after',
      ext: 'jpg',
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.token).toBe('upload-token');
    expect(r.body.ref).toMatch(new RegExp(`^job-photos-private/jobs/${BOOKING}/after_\\d+\\.jpg$`));
    expect(r.body.contentType).toBe('image/jpeg');
    expect(photos.jobPhotoPath(r.body.ref, BOOKING)).not.toBeNull();
    // No small copy unless the app asks for one.
    expect(r.body.thumb_token).toBeUndefined();
  });

  it('with thumb: a second upload URL for the small copy, next to the photo', async () => {
    const r = await call(handleMechanicPhotoUploadUrl, {
      token: mechanicToken('mech-1'),
      booking_id: BOOKING,
      kind: 'before',
      ext: 'jpg',
      thumb: true,
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.thumb_token).toBe('upload-token');
    expect(r.body.thumb_path).toBe(r.body.path.replace(/\.jpg$/, '_thumb.jpg'));
    // The small copy lives in the same booking's folder, so the same rules
    // sign it.
    expect(photos.jobPhotoPath(`job-photos-private/${r.body.thumb_path}`, BOOKING)).not.toBeNull();
  });

  it('not to another mechanic', async () => {
    const r = await call(handleMechanicPhotoUploadUrl, {
      token: mechanicToken('mech-2'),
      booking_id: BOOKING,
      kind: 'after',
      ext: 'jpg',
    });
    expect(r.statusCode).toBe(403);
  });

  it('refuses a type that is not a photo', async () => {
    const r = await call(handleMechanicPhotoUploadUrl, {
      token: mechanicToken('mech-1'),
      booking_id: BOOKING,
      kind: 'after',
      ext: 'html',
    });
    expect(r.statusCode).toBe(400);
  });

  it('says "fall back" until the bucket exists, so nothing breaks the day this merges', async () => {
    bucketExists = false;
    const r = await call(handleMechanicPhotoUploadUrl, {
      token: mechanicToken('mech-1'),
      booking_id: BOOKING,
      kind: 'chat',
      ext: 'png',
    });
    expect(r.statusCode).toBe(503);
    expect(r.body.fallback).toBe(true);
  });
});
