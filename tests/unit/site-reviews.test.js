// tests/unit/site-reviews.test.js
//
// drbikesydney.com.au/reviews (2026-11-20): anyone can leave stars, words and
// up to six photos, with no account. These pin what keeps an anonymous form
// from becoming a spam target, and what a real reviewer must never hit.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateReview,
  handleSiteReview,
  handleAdminSiteReviews,
  shortName,
  thumbUrl,
  hashIp,
  ownerEmailHtml,
  MAX_PHOTOS,
  PHOTO_MAX_BYTES,
  DAILY_CAP,
} from '../../api/_site-reviews.js';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// The smallest thing that starts like a JPEG, as the page's canvas sends it.
const jpeg = (size = 64) => {
  const b = Buffer.alloc(size, 7);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  return 'data:image/jpeg;base64,' + b.toString('base64');
};
const png = () =>
  'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString('base64');

const good = (over = {}) => ({
  rating: 5,
  name: 'Ana Lopez',
  comment: 'Fixed my brakes at home in 20 minutes.',
  ...over,
});

describe('validateReview - what a reviewer can send', () => {
  it('a plain review passes, with no email and no photos', () => {
    const v = validateReview(good());
    expect(v.error).toBeUndefined();
    expect(v.value).toMatchObject({
      rating: 5,
      name: 'Ana Lopez',
      email: null,
      photos: [],
      lang: 'en',
    });
  });

  it('stars outside 1-5, or not whole, are refused', () => {
    for (const rating of [0, 6, 4.5, '', null, undefined, 'five']) {
      expect(validateReview(good({ rating })).error, String(rating)).toMatch(/1 to 5 stars/);
    }
  });

  it('a name and a few words are required', () => {
    expect(validateReview(good({ name: '   ' })).error).toMatch(/your name/);
    expect(validateReview(good({ comment: 'ok' })).error).toMatch(/a few words/);
    expect(validateReview(good({ name: 'x'.repeat(61) })).error).toMatch(/too long/);
    expect(validateReview(good({ comment: 'x'.repeat(1001) })).error).toMatch(/under 1000/);
  });

  it('links are refused in the comment and in the name', () => {
    for (const comment of [
      'Great, see https://spam.example',
      'visit www.cheap-bikes.ru now',
      'better deals on bikeshop.com.au',
    ]) {
      expect(validateReview(good({ comment })).error, comment).toMatch(/links out/);
    }
    expect(validateReview(good({ name: 'bestdeals.net' })).error).toMatch(/links out/);
  });

  // A typo with no space after a full stop is not a link.
  it('a sentence that only looks like a domain is not refused', () => {
    expect(
      validateReview(good({ comment: 'Came quickly.Top service, thanks' })).error
    ).toBeUndefined();
  });

  it('line breaks survive, control characters do not', () => {
    const v = validateReview(
      good({ comment: 'Line one\r\nLine two\u0007', name: 'Ana\u0000 Lopez' })
    );
    expect(v.value.comment).toBe('Line one\nLine two');
    expect(v.value.name).toBe('Ana Lopez');
  });

  it('an email is optional, and checked only when given', () => {
    expect(validateReview(good({ email: 'Ana@Example.com' })).value.email).toBe('ana@example.com');
    expect(validateReview(good({ email: 'not-an-email' })).error).toMatch(/email/);
  });

  it(`takes up to ${MAX_PHOTOS} photos (Diego: some customers send many)`, () => {
    expect(MAX_PHOTOS).toBe(6);
    const six = Array.from({ length: 6 }, () => ({ data: jpeg(), thumb: jpeg(32) }));
    expect(validateReview(good({ photos: six })).value.photos).toHaveLength(6);
    const seven = [...six, { data: jpeg() }];
    expect(validateReview(good({ photos: seven })).error).toMatch(/Up to 6 photos/);
  });

  it('only JPEG bytes under the cap are taken as a photo', () => {
    expect(validateReview(good({ photos: [{ data: png() }] })).error).toMatch(/could not be read/);
    expect(validateReview(good({ photos: [{ data: jpeg(PHOTO_MAX_BYTES + 1) }] })).error).toMatch(
      /could not be read/
    );
  });

  it('a broken thumbnail falls back to the photo instead of failing the review', () => {
    const v = validateReview(good({ photos: [{ data: jpeg(), thumb: png() }] }));
    expect(v.error).toBeUndefined();
    expect(v.value.photos[0].thumb).toBe(v.value.photos[0].full);
  });

  it('an unknown language becomes English', () => {
    expect(validateReview(good({ lang: 'fr' })).value.lang).toBe('en');
    expect(validateReview(good({ lang: 'zh' })).value.lang).toBe('zh');
  });

  // Six photos at the caps have to fit in one request: Vercel refuses a body
  // over 4.5MB, and base64 makes every byte a third bigger.
  it('six photos at the caps still fit under Vercel’s 4.5MB body limit', () => {
    const src = read('js/reviews-page.js');
    const num = (name) =>
      Number(src.match(new RegExp(`const ${name} = ([\\d_]+)`))?.[1].replace(/_/g, ''));
    const full = num('PHOTO_MAX_BYTES');
    const thumb = num('THUMB_MAX_BYTES');
    expect(num('MAX_PHOTOS'), 'the page and the server take a different number of photos').toBe(
      MAX_PHOTOS
    );
    expect(full, 'the page no longer declares PHOTO_MAX_BYTES').toBeGreaterThan(0);
    expect(full, 'the page makes photos the server refuses').toBeLessThanOrEqual(PHOTO_MAX_BYTES);
    expect((MAX_PHOTOS * (full + thumb) * 4) / 3 + 20_000).toBeLessThan(4_500_000);
  });
});

describe('the small pieces', () => {
  it('shortName shows "First L.", like the public view', () => {
    expect(shortName('Ana Maria Lopez')).toBe('Ana M.');
    expect(shortName('  Ana  ')).toBe('Ana');
    expect(shortName('')).toBe('Dr. Bike client');
  });

  it('thumbUrl puts _t before .jpg', () => {
    expect(thumbUrl('https://x/site-reviews/id/1.jpg')).toBe('https://x/site-reviews/id/1_t.jpg');
  });

  it('the IP is hashed with a salt and never stored as is', () => {
    const h = hashIp('1.2.3.4', 'salt');
    expect(h).toHaveLength(32);
    expect(h).not.toContain('1.2.3.4');
    expect(hashIp('1.2.3.4', 'other')).not.toBe(h);
  });

  it('the owner email escapes what the reviewer typed', () => {
    const html = ownerEmailHtml({
      rating: 4,
      name: '<script>x</script>',
      comment: '"><img onerror=1>',
      email: null,
      photos: [],
    });
    expect(html).not.toContain('<script>x</script>');
    expect(html).not.toContain('<img onerror');
    expect(html).toContain('&#9733;&#9733;&#9733;&#9733;&#9734;');
  });
});

// A fake Supabase + Resend that records every call.
function fakeFetch({ recent = [], insertOk = true, uploadOk = true, readOk = true } = {}) {
  const calls = [];
  const fn = vi.fn(async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    const reply = (ok, body, status = ok ? 200 : 500) => ({
      ok,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
    if (url.includes('/storage/v1/object/')) return reply(uploadOk, {});
    if (url.includes('/rest/v1/site_reviews?select=id'))
      return reply(readOk, recent, readOk ? 200 : 404);
    if (url.endsWith('/rest/v1/site_reviews'))
      return reply(
        insertOk,
        insertOk ? [{ id: JSON.parse(opts.body).id, created_at: '2026-11-20T01:00:00Z' }] : {}
      );
    if (url.includes('api.resend.com')) return reply(true, { id: 'mail' });
    return reply(false, {}, 404);
  });
  fn.calls = calls;
  return fn;
}

function resMock() {
  const res = { statusCode: 0, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
}

const req = (body) => ({ body, headers: { 'x-forwarded-for': '9.9.9.9' } });
const deps = (fetchImpl, verify = async () => true) => ({
  supabaseUrl: 'https://sb.test',
  serviceKey: 'service-key',
  fetchImpl,
  verify,
});

describe('handleSiteReview', () => {
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it('publishes at once, stores the hash and not the IP, and answers with the masked name', async () => {
    const f = fakeFetch();
    const res = resMock();
    await handleSiteReview(req(good({ turnstileToken: 't' })), res, deps(f));
    expect(res.statusCode).toBe(200);
    expect(res.body.review).toMatchObject({ display_name: 'Ana L.', rating: 5, verified: false });
    const insert = f.calls.find((c) => c.url.endsWith('/rest/v1/site_reviews'));
    const row = JSON.parse(insert.opts.body);
    expect(row.status).toBe('published');
    expect(row.ip_hash).toBe(hashIp('9.9.9.9', 'service-key'));
    expect(JSON.stringify(row)).not.toContain('9.9.9.9');
  });

  it('a bad review is refused before anything is called', async () => {
    const f = fakeFetch();
    const res = resMock();
    await handleSiteReview(req(good({ rating: 9 })), res, deps(f));
    expect(res.statusCode).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it('a failed security check is 403 and writes nothing', async () => {
    const f = fakeFetch();
    const res = resMock();
    await handleSiteReview(
      req(good()),
      res,
      deps(f, async () => false)
    );
    expect(res.statusCode).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });

  it(`the ${DAILY_CAP + 1}th review in a day from one visitor is 429`, async () => {
    const f = fakeFetch({ recent: Array.from({ length: DAILY_CAP }, (_, i) => ({ id: i })) });
    const res = resMock();
    await handleSiteReview(req(good()), res, deps(f));
    expect(res.statusCode).toBe(429);
    expect(f.calls.some((c) => c.url.endsWith('/rest/v1/site_reviews'))).toBe(false);
  });

  // Before scripts/add-site-reviews.sql runs, the table does not exist.
  it('with no table yet it says reviews are not open, not a crash', async () => {
    const f = fakeFetch({ readOk: false });
    const res = resMock();
    await handleSiteReview(req(good()), res, deps(f));
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/not open yet/);
  });

  it('uploads each photo and its thumbnail, and stores one URL per photo', async () => {
    const f = fakeFetch();
    const res = resMock();
    const photos = Array.from({ length: 6 }, () => ({ data: jpeg(), thumb: jpeg(32) }));
    await handleSiteReview(req(good({ photos })), res, deps(f));
    expect(res.statusCode).toBe(200);
    const uploads = f.calls.filter((c) =>
      c.url.includes('/storage/v1/object/job-photos/site-reviews/')
    );
    expect(uploads).toHaveLength(12);
    expect(uploads.filter((c) => c.url.endsWith('_t.jpg'))).toHaveLength(6);
    expect(res.body.review.photos).toHaveLength(6);
    expect(res.body.review.photos[0]).toMatch(
      /^https:\/\/sb\.test\/storage\/v1\/object\/public\/job-photos\/site-reviews\/[0-9a-f-]{36}\/1\.jpg$/
    );
    expect(res.body.photosDropped).toBe(0);
  });

  it('a photo that fails to upload is dropped, the review still goes up', async () => {
    const f = fakeFetch({ uploadOk: false });
    const res = resMock();
    await handleSiteReview(req(good({ photos: [{ data: jpeg() }] })), res, deps(f));
    expect(res.statusCode).toBe(200);
    expect(res.body.review.photos).toEqual([]);
    expect(res.body.photosDropped).toBe(1);
  });

  it('a failed insert is 500 with a message the reviewer can read', async () => {
    const f = fakeFetch({ insertOk: false });
    const res = resMock();
    await handleSiteReview(req(good()), res, deps(f));
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/could not be saved/);
  });

  it('tells Diego by email, replying to the reviewer when they left one', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const f = fakeFetch();
    await handleSiteReview(req(good({ email: 'ana@example.com' })), resMock(), deps(f));
    const mail = f.calls.find((c) => c.url.includes('api.resend.com'));
    const body = JSON.parse(mail.opts.body);
    expect(body.to).toEqual(['contact@drbikesydney.com.au']);
    expect(body.reply_to).toBe('ana@example.com');
    expect(body.subject).toBe('New 5-star review from Ana L.');
  });
});

// A fake supabase-js query builder, enough for list and set.
function fakeSb({ data = [], error = null } = {}) {
  const log = [];
  const q = {
    select: (c) => (log.push(['select', c]), q),
    order: () => q,
    limit: () => Promise.resolve({ data, error }),
    update: (v) => (log.push(['update', v]), q),
    eq: (k, v) => (log.push(['eq', k, v]), q),
  };
  // update(...).eq(...).select(...) resolves at select.
  const sb = {
    from: () => ({
      select: (c) => (log.push(['select', c]), q),
      update: (v) => (
        log.push(['update', v]),
        {
          eq: (k, v2) => (
            log.push(['eq', k, v2]),
            { select: () => Promise.resolve({ data, error }) }
          ),
        }
      ),
    }),
  };
  sb.log = log;
  return sb;
}

describe('handleAdminSiteReviews', () => {
  const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

  it('lists the reviews, email included, for Admin', async () => {
    const res = resMock();
    const sb = fakeSb({ data: [{ id: ID }] });
    await handleAdminSiteReviews({ body: { action: 'list' } }, res, sb);
    expect(res.statusCode).toBe(200);
    expect(res.body.reviews).toEqual([{ id: ID }]);
    expect(sb.log[0][1]).toContain('email');
  });

  it('hides with a reason, and showing again clears the reason', async () => {
    let sb = fakeSb({ data: [{ id: ID, status: 'hidden' }] });
    let res = resMock();
    await handleAdminSiteReviews(
      { body: { action: 'set', id: ID, status: 'hidden', reason: 'Spam' } },
      res,
      sb
    );
    expect(res.statusCode).toBe(200);
    expect(sb.log).toContainEqual(['update', { status: 'hidden', hidden_reason: 'Spam' }]);

    sb = fakeSb({ data: [{ id: ID, status: 'published' }] });
    res = resMock();
    await handleAdminSiteReviews(
      { body: { action: 'set', id: ID, status: 'published', reason: 'Spam' } },
      res,
      sb
    );
    expect(sb.log).toContainEqual(['update', { status: 'published', hidden_reason: null }]);
  });

  it('refuses a bad id, a bad status, and a row that does not exist', async () => {
    let res = resMock();
    await handleAdminSiteReviews(
      { body: { action: 'set', id: 'x', status: 'hidden' } },
      res,
      fakeSb()
    );
    expect(res.statusCode).toBe(400);
    res = resMock();
    await handleAdminSiteReviews(
      { body: { action: 'set', id: ID, status: 'deleted' } },
      res,
      fakeSb()
    );
    expect(res.statusCode).toBe(400);
    res = resMock();
    await handleAdminSiteReviews(
      { body: { action: 'set', id: ID, status: 'hidden' } },
      res,
      fakeSb({ data: [] })
    );
    expect(res.statusCode).toBe(404);
  });

  // There is no delete on purpose: CLAUDE.md, never DELETE without Diego.
  it('has no way to delete a review', async () => {
    const res = resMock();
    await handleAdminSiteReviews({ body: { action: 'delete', id: ID } }, res, fakeSb());
    expect(res.statusCode).toBe(400);
    expect(read('api/_site-reviews.js')).not.toMatch(/\.delete\(/);
  });
});

describe('wiring', () => {
  it('api/auth.js routes both roles, and checks the admin session first', () => {
    const src = read('api/auth.js');
    expect(src).toMatch(
      /import \{ handleSiteReview, handleAdminSiteReviews \} from '\.\/_site-reviews\.js'/
    );
    const at = src.indexOf("'admin-site-reviews'", src.indexOf('handleSiteReview(req'));
    const branch = src.slice(at, at + 400);
    expect(branch).toMatch(/verifyAdminSession/);
    expect(branch.indexOf('verifyAdminSession')).toBeLessThan(
      branch.indexOf('handleAdminSiteReviews')
    );
  });

  it('/reviews is a real route', () => {
    const v = JSON.parse(read('vercel.json'));
    const all = [...(v.rewrites || []), ...(v.redirects || [])];
    expect(all.some((r) => r.source === '/reviews' && r.destination === '/reviews.html')).toBe(
      true
    );
  });

  it('the table is locked: RLS on, nothing granted to the browser keys', () => {
    const sql = read('scripts/add-site-reviews.sql');
    expect(sql).toMatch(/alter table public\.site_reviews enable row level security/);
    expect(sql).toMatch(/revoke all on public\.site_reviews from anon, authenticated/);
    expect(sql).not.toMatch(/create policy/i);
  });

  it('the public view shows only published site reviews, never the email', () => {
    const sql = read('scripts/create-public-reviews-view.sql');
    const site = sql.slice(sql.indexOf('from public.site_reviews'));
    expect(site).toMatch(/r\.status = 'published'/);
    const view = sql.slice(sql.indexOf('create view'), sql.indexOf('order by completed_at desc'));
    expect(view).not.toMatch(/\bemail\b|ip_hash/);
  });
});
