// Admin > Photos (api/_photo-gallery.js): every job photo in one place, and
// the ones Diego picks for the website.
//
// What has to hold:
//   - only the admin can list, add to or remove from the website
//   - a photo shows under its own booking, with that booking's client,
//     service and date - a reference into another booking's folder does not
//   - "show on website" COPIES into the public showcase folder; the private
//     original is never made public
//   - "remove from website" deletes only showcase copies, nothing else
//
// The handlers are RUN against a fake Supabase.
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

const URL_BASE = 'https://example.supabase.co';
const B1 = '11111111-1111-1111-1111-111111111111';
const B2 = '22222222-2222-2222-2222-222222222222';
const B3 = '33333333-3333-3333-3333-333333333333';
const PRIV_BEFORE = `job-photos-private/jobs/${B1}/before_1759200000000.jpg`;
const OLD_AFTER = `${URL_BASE}/storage/v1/object/public/job-photos/jobs/${B1}/after_1759100000000.jpg`;
const CHAT = `job-photos-private/chat/${B3}/1759300000000.png`;

// The client's review photo, uploaded WITHOUT ticking "can show on website".
const REVIEW_NO = `job-photos-private/reviews/${B1}/client_1759250000000.jpg`;
const REVIEW_YES = `job-photos-private/reviews/${B1}/client_1759250000000_web.jpg`;
let copyWorks = true;
let calls = [];
// The showcase folder and its order file, as Storage would hold them.
const ON_WEB = `jobs_${B1}_before_1759200000000.jpg`;
let showcase = new Set();
let savedOrder = null;

vi.mock('stripe', () => ({ default: class {} }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async (token) =>
        token === 'admin-token'
          ? { data: { user: { email: 'peredo.dm@gmail.com' } }, error: null }
          : token === 'client-token'
            ? { data: { user: { email: 'someone@example.com' } }, error: null }
            : { data: { user: null }, error: { message: 'bad' } },
    },
  }),
}));

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = init.method || 'GET';
  calls.push({ url: u, method, body: init.body });
  const ok = (body) => ({
    ok: true,
    status: 200,
    json: async () => body,
    headers: new Map([['content-type', 'image/jpeg']]),
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  });
  const no = (status) => ({ ok: false, status, json: async () => ({}) });
  if (u.includes('/auth/v1/user')) return ok({ factors: [] });
  if (u.includes('/rest/v1/bookings') && u.includes('photo_before_url')) {
    return ok([
      {
        id: B1,
        client_name: 'Alice',
        service_name: 'Tune-Up',
        scheduled_date: '2026-11-04',
        photo_before_url: PRIV_BEFORE,
        photo_after_url: OLD_AFTER,
        client_photo_url: REVIEW_NO,
      },
      // B2 claims a photo that lives in B1's folder: it must not show under B2.
      // A file B1 itself does not list, so it is the folder check that keeps
      // it out and not the de-duplication of B1's own photo.
      {
        id: B2,
        client_name: 'Bob',
        service_name: 'Brakes',
        scheduled_date: '2026-11-05',
        photo_before_url: `job-photos-private/jobs/${B1}/before_1759000000000.jpg`,
        photo_after_url: null,
      },
    ]);
  }
  if (u.includes('/rest/v1/job_messages')) {
    return ok([
      { booking_id: B3, message: `[PHOTO:${CHAT}]`, created_at: '2026-11-06T01:00:00Z' },
      { booking_id: B3, message: 'on my way', created_at: '2026-11-06T00:00:00Z' },
    ]);
  }
  if (u.includes('/rest/v1/bookings') && u.includes(`id=in.(${B3})`)) {
    return ok([
      { id: B3, client_name: 'Carol', service_name: 'Flat tyre', scheduled_date: '2026-11-06' },
    ]);
  }
  if (u.endsWith('/storage/v1/object/sign/job-photos-private')) {
    const { paths } = JSON.parse(init.body);
    // Only the before photo has a small copy - like a photo taken after
    // 03-oct-2026 next to older ones. Storage answers a missing object with
    // an error row and no signedURL.
    const hasThumb = (p) => !p.endsWith('_thumb.jpg') || p.startsWith(`jobs/${B1}/before_`);
    return ok(
      paths.map((p) =>
        hasThumb(p)
          ? { path: p, signedURL: `/object/sign/job-photos-private/${p}?token=t` }
          : { path: p, signedURL: null, error: 'Either the object does not exist' }
      )
    );
  }
  if (u.endsWith('/storage/v1/object/list/job-photos')) {
    return ok([
      ...[...showcase].map((name) => ({ name })),
      { name: '_order.json' },
      { name: '.emptyFolderPlaceholder' },
    ]);
  }
  if (u.endsWith('/storage/v1/object/copy')) {
    if (!copyWorks) return no(400);
    showcase.add(JSON.parse(init.body).destinationKey.replace('showcase/', ''));
    return ok({ Key: 'x' });
  }
  if (u.endsWith('/object/authenticated/job-photos/showcase/_order.json')) {
    return savedOrder ? ok({ order: savedOrder }) : no(404);
  }
  if (u.includes('/storage/v1/object/authenticated/')) return ok({});
  if (u.endsWith('/object/job-photos/showcase/_order.json') && method === 'POST') {
    savedOrder = JSON.parse(init.body).order;
    return ok({});
  }
  if (u.includes('/storage/v1/object/job-photos/showcase/') && method === 'POST') {
    showcase.add(u.split('/showcase/')[1]);
    return ok({});
  }
  if (u.endsWith('/storage/v1/object/job-photos') && method === 'DELETE') {
    for (const p of JSON.parse(init.body).prefixes) showcase.delete(p.replace('showcase/', ''));
    return ok([]);
  }
  return no(503);
};

const gallery = await import('../../api/_photo-gallery.js');
const {
  handleAdminPhotosList,
  handleAdminPhotosFeature,
  handleAdminPhotosUnfeature,
  handleAdminPhotosOrder,
} = await import('../../api/auth.js');

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
const storageCalls = () => calls.filter((c) => c.url.includes('/storage/v1/'));

beforeEach(() => {
  copyWorks = true;
  calls = [];
  showcase = new Set([ON_WEB]);
  savedOrder = null;
});

describe('what counts as a job photo', () => {
  it('a private reference and an old public URL both do', () => {
    expect(gallery.photoSource(PRIV_BEFORE, URL_BASE)).toMatchObject({
      bucket: 'job-photos-private',
      bookingId: B1,
    });
    expect(gallery.photoSource(OLD_AFTER, URL_BASE)).toMatchObject({
      bucket: 'job-photos',
      bookingId: B1,
    });
  });

  it('a review photo does, and may go on the website only with the client\'s "_web"', () => {
    expect(
      gallery.photoSource(`job-photos-private/reviews/${B1}/client_1759200000000_web.jpg`, URL_BASE)
    ).toMatchObject({ folder: 'reviews', webOk: true });
    expect(
      gallery.photoSource(`job-photos-private/reviews/${B1}/client_1759200000000.jpg`, URL_BASE)
    ).toMatchObject({ folder: 'reviews', webOk: false });
    // Every review photo uploaded before the box existed: no `_web`, so no.
    expect(
      gallery.photoSource(
        `${URL_BASE}/storage/v1/object/public/job-photos/reviews/${B1}/client_1.jpg`,
        URL_BASE
      )
    ).toMatchObject({ webOk: false });
    // The mechanic's photos are the business's own.
    expect(gallery.photoSource(PRIV_BEFORE, URL_BASE).webOk).toBe(true);
  });

  it('profiles, claims and anything climbing out of its folder do not', () => {
    for (const v of [
      `${URL_BASE}/storage/v1/object/public/job-photos/profiles/abc_1.jpg`,
      `${URL_BASE}/storage/v1/object/public/job-photos/claims/${B1}/photo_0.jpg`,
      `job-photos-private/jobs/${B1}/../x.jpg`,
      'https://evil.example/photo.jpg',
    ]) {
      expect(gallery.photoSource(v, URL_BASE), v).toBeNull();
    }
  });
});

describe('the list (role admin-photos-list)', () => {
  it('is for the admin only', async () => {
    expect((await call(handleAdminPhotosList, {})).statusCode).toBe(401);
    expect((await call(handleAdminPhotosList, { access_token: 'client-token' })).statusCode).toBe(
      403
    );
  });

  it('shows each photo under its own booking, signed, with client, service and date', async () => {
    const r = await call(handleAdminPhotosList, { access_token: 'admin-token' });
    expect(r.statusCode).toBe(200);
    const byKey = Object.fromEntries(r.body.photos.map((p) => [p.key, p]));

    const before = byKey[`job-photos-private/jobs/${B1}/before_1759200000000.jpg`];
    expect(before).toMatchObject({
      kind: 'before',
      client_name: 'Alice',
      service_name: 'Tune-Up',
      booking_id: B1,
    });
    expect(before.url).toMatch(
      /^https:\/\/example\.supabase\.co\/storage\/v1\/object\/sign\/job-photos-private\//
    );
    expect(before.on_website).toBe(true);

    const after = byKey[`job-photos/jobs/${B1}/after_1759100000000.jpg`];
    expect(after.url).toBe(OLD_AFTER);
    expect(after.on_website).toBe(false);

    const chat = byKey[`job-photos-private/chat/${B3}/1759300000000.png`];
    expect(chat).toMatchObject({ kind: 'chat', client_name: 'Carol', service_name: 'Flat tyre' });

    // The small copy for the tile when there is one; none for older photos,
    // and none for the old public ones (the tile then loads the full photo).
    expect(before.thumb_url).toMatch(/before_1759200000000_thumb\.jpg\?token=t$/);
    expect(chat.thumb_url).toBeNull();
    expect(after.thumb_url).toBeNull();

    const review = byKey[REVIEW_NO];
    expect(review).toMatchObject({ kind: 'review', client_name: 'Alice', web_ok: false });
    expect(before.web_ok).toBe(true);

    expect(r.body.photos.filter((p) => p.booking_id === B2)).toEqual([]);
    expect(r.body.photos).toHaveLength(4);
  });

  it('newest first', async () => {
    const r = await call(handleAdminPhotosList, { access_token: 'admin-token' });
    const times = r.body.photos.map((p) => p.taken_at);
    expect([...times].sort().reverse()).toEqual(times);
  });
});

describe('show on website (role admin-photos-feature)', () => {
  it('copies into the public showcase folder and leaves the original where it is', async () => {
    const r = await call(handleAdminPhotosFeature, {
      access_token: 'admin-token',
      refs: [PRIV_BEFORE],
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.done).toEqual([PRIV_BEFORE]);
    const copy = storageCalls().find((c) => c.url.endsWith('/object/copy'));
    expect(JSON.parse(copy.body)).toEqual({
      bucketId: 'job-photos-private',
      sourceKey: `jobs/${B1}/before_1759200000000.jpg`,
      destinationBucket: 'job-photos',
      destinationKey: `showcase/jobs_${B1}_before_1759200000000.jpg`,
    });
    expect(storageCalls().some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('when Storage cannot copy across buckets, reads the bytes and writes the copy', async () => {
    copyWorks = false;
    const r = await call(handleAdminPhotosFeature, {
      access_token: 'admin-token',
      refs: [PRIV_BEFORE],
    });
    expect(r.body.done).toEqual([PRIV_BEFORE]);
    expect(
      storageCalls().some((c) => c.url.includes('/object/authenticated/job-photos-private/jobs/'))
    ).toBe(true);
    expect(
      storageCalls().some(
        (c) =>
          c.method === 'POST' &&
          c.url.endsWith(`/object/job-photos/showcase/jobs_${B1}_before_1759200000000.jpg`)
      )
    ).toBe(true);
  });

  it('refuses a review photo the client did not allow, without touching Storage', async () => {
    const r = await call(handleAdminPhotosFeature, {
      access_token: 'admin-token',
      refs: [REVIEW_NO],
    });
    expect(r.statusCode).toBe(403);
    expect(r.body.not_allowed).toEqual([REVIEW_NO]);
    expect(storageCalls()).toEqual([]);
  });

  it('publishes a review photo the client allowed', async () => {
    const r = await call(handleAdminPhotosFeature, {
      access_token: 'admin-token',
      refs: [REVIEW_YES],
    });
    expect(r.body.done).toEqual([REVIEW_YES]);
    expect(showcase.has(`reviews_${B1}_client_1759250000000_web.jpg`)).toBe(true);
  });

  it('refuses anything that is not a job photo, without touching Storage', async () => {
    const profile = `${URL_BASE}/storage/v1/object/public/job-photos/profiles/abc_1.jpg`;
    const r = await call(handleAdminPhotosFeature, {
      access_token: 'admin-token',
      refs: [profile],
    });
    expect(r.body.failed).toEqual([profile]);
    expect(storageCalls()).toEqual([]);
  });

  it('is for the admin only', async () => {
    const r = await call(handleAdminPhotosFeature, {
      access_token: 'client-token',
      refs: [PRIV_BEFORE],
    });
    expect(r.statusCode).toBe(403);
    expect(storageCalls()).toEqual([]);
  });
});

describe('remove from website (role admin-photos-unfeature)', () => {
  it('deletes the showcase copy and nothing else', async () => {
    const name = `jobs_${B1}_before_1759200000000.jpg`;
    const r = await call(handleAdminPhotosUnfeature, {
      access_token: 'admin-token',
      names: [name],
    });
    expect(r.statusCode).toBe(200);
    const del = storageCalls().find((c) => c.method === 'DELETE');
    expect(del.url).toBe(`${URL_BASE}/storage/v1/object/job-photos`);
    expect(JSON.parse(del.body)).toEqual({ prefixes: [`showcase/${name}`] });
  });

  it('a name that could reach outside the showcase folder never reaches Storage', async () => {
    const r = await call(handleAdminPhotosUnfeature, {
      access_token: 'admin-token',
      names: ['../jobs/x.jpg', `jobs/${B1}/before_1.jpg`, 'profiles_abc.jpg'],
    });
    expect(r.body.removed).toEqual([]);
    expect(storageCalls()).toEqual([]);
  });

  it('is for the admin only', async () => {
    const r = await call(handleAdminPhotosUnfeature, { names: ['x'] });
    expect(r.statusCode).toBe(401);
  });
});

// The order the photos run in on the landing carousel: showcase/_order.json,
// next to the copies, so the carousel reads one public file.
describe('the carousel order', () => {
  const CHAT_ON_WEB = `chat_${B3}_1759300000000.png`;

  it('the list gives the website photos in the saved order, with public URLs', async () => {
    showcase.add(CHAT_ON_WEB);
    savedOrder = [CHAT_ON_WEB, 'jobs_99999999-0000-0000-0000-000000000000_gone_1.jpg', ON_WEB];
    const r = await call(handleAdminPhotosList, { access_token: 'admin-token' });
    expect(r.body.website).toEqual([
      {
        name: CHAT_ON_WEB,
        url: `${URL_BASE}/storage/v1/object/public/job-photos/showcase/${CHAT_ON_WEB}`,
      },
      { name: ON_WEB, url: `${URL_BASE}/storage/v1/object/public/job-photos/showcase/${ON_WEB}` },
    ]);
  });

  it('a photo put on the website goes to the end of the carousel', async () => {
    savedOrder = [ON_WEB];
    await call(handleAdminPhotosFeature, { access_token: 'admin-token', refs: [CHAT] });
    expect(savedOrder).toEqual([ON_WEB, CHAT_ON_WEB]);
  });

  it('a photo taken off the website leaves the carousel too', async () => {
    showcase.add(CHAT_ON_WEB);
    savedOrder = [CHAT_ON_WEB, ON_WEB];
    await call(handleAdminPhotosUnfeature, { access_token: 'admin-token', names: [CHAT_ON_WEB] });
    expect(savedOrder).toEqual([ON_WEB]);
  });

  it('reordering saves the new order, keeps only what is on the website, and loses nobody', async () => {
    showcase.add(CHAT_ON_WEB);
    const r = await call(handleAdminPhotosOrder, {
      access_token: 'admin-token',
      names: [CHAT_ON_WEB, 'jobs_99999999-0000-0000-0000-000000000000_gone_1.jpg', '../x.jpg'],
    });
    expect(r.statusCode).toBe(200);
    expect(savedOrder).toEqual([CHAT_ON_WEB, ON_WEB]);
  });

  it('is for the admin only', async () => {
    const r = await call(handleAdminPhotosOrder, { access_token: 'client-token', names: [ON_WEB] });
    expect(r.statusCode).toBe(403);
    expect(savedOrder).toBeNull();
  });

  it('the order file is never listed as a photo and can never be removed', () => {
    expect(gallery.isShowcaseName('_order.json')).toBe(false);
  });
});
