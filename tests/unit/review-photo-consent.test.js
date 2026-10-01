// A review photo may go on the website only if the client said so.
//
// The review screens ask "Dr. Bike Sydney can show this photo on its website"
// (unticked by default). api/auth.js handleClientReview records the answer in
// the file name - `client_<ts>_web.jpg` - and Admin > Photos refuses to publish
// any review photo without it (api/_photo-gallery.js, tests in
// admin-photos.test.js). These RUN the handler against a fake Supabase.
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

const B1 = '11111111-1111-1111-1111-111111111111';
const today = new Date().toISOString().slice(0, 10);
let privateBucketExists = true;
let uploads = [];
let patched = null;

vi.mock('stripe', () => ({ default: class {} }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });
  if (u.includes('/rest/v1/bookings?select=id,status')) {
    return ok([
      { id: B1, status: 'completed', client_id: null, client_rating: null, scheduled_date: today },
    ]);
  }
  if (u.includes('/storage/v1/object/job-photos-private/')) {
    uploads.push(u);
    return privateBucketExists
      ? ok({})
      : { ok: false, status: 400, text: async () => 'Bucket not found' };
  }
  if (u.includes('/storage/v1/object/job-photos/')) {
    uploads.push(u);
    return ok({});
  }
  if (u.includes('/rest/v1/bookings?id=eq.') && init.method === 'PATCH') {
    patched = JSON.parse(init.body);
    return ok({});
  }
  return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
};

const { handleClientReview } = await import('../../api/auth.js');

const review = async (extra) => {
  const res = { statusCode: null, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  await handleClientReview(
    {
      body: {
        booking_id: B1,
        tracking_token: 'tok',
        rating: 5,
        comment: 'Great',
        photo_base64: 'data:image/jpeg;base64,/9j/4AAQ',
        ...extra,
      },
      headers: {},
    },
    res
  );
  return res;
};

beforeEach(() => {
  privateBucketExists = true;
  uploads = [];
  patched = null;
});

describe('the client says yes', () => {
  it('the photo goes to the private bucket with _web in its name', async () => {
    const r = await review({ photo_web_ok: true });
    expect(r.statusCode).toBe(200);
    expect(uploads[0]).toMatch(
      new RegExp(`/object/job-photos-private/reviews/${B1}/client_\\d{13}_web\\.jpg$`)
    );
    expect(patched.client_photo_url).toMatch(
      new RegExp(`^job-photos-private/reviews/${B1}/client_\\d{13}_web\\.jpg$`)
    );
  });
});

describe('anything else is a no', () => {
  it('unticked', async () => {
    await review({ photo_web_ok: false });
    expect(patched.client_photo_url).not.toMatch(/_web/);
  });

  it('a page that never asks (an older cached copy)', async () => {
    await review({});
    expect(patched.client_photo_url).not.toMatch(/_web/);
  });

  it('a truthy string is not a tick', async () => {
    await review({ photo_web_ok: 'true' });
    expect(patched.client_photo_url).not.toMatch(/_web/);
  });
});

describe('before the private bucket exists', () => {
  it('falls back to the public bucket, and the answer still travels with the photo', async () => {
    privateBucketExists = false;
    await review({ photo_web_ok: true });
    expect(patched.client_photo_url).toMatch(
      new RegExp(
        `^https://example\\.supabase\\.co/storage/v1/object/public/job-photos/reviews/${B1}/client_\\d{13}_web\\.jpg$`
      )
    );
  });
});
