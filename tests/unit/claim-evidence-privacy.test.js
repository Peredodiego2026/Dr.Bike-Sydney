// Audit finding 8 (2026-09-04): warranty-claim evidence sat in a public bucket
// at a guessable path.
//
//   claims/${Date.now()}/invoice_0.jpg
//
// Four filenames per claim (photo_0..2, invoice_0) and a folder that is just a
// millisecond. Anyone who knew roughly WHEN somebody complained - or who was
// willing to walk a day - could pull a stranger's damage photos and their
// invoice straight out of a public bucket. No login, no token.
//
// Two things had to change, and only one of them can be done in code alone:
// the path stopped being guessable (this repo), and the bucket stopped being
// public (Diego, in the Supabase dashboard). The code has to work either way,
// because a claim arriving before the bucket exists must not be lost.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const authjs = readFileSync(join(root, 'api', 'auth.js'), 'utf8');
// Comments stripped; [^\n]* not .*$ because the file is CRLF.
const code = authjs.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

const fn = code.slice(
  code.indexOf('async function handleSubmitClaim('),
  code.indexOf('async function handleAdminClaimsList(')
);

describe('the folder a claim is stored under', () => {
  it('is random, not the clock', () => {
    expect(fn).toMatch(/const folder = crypto\.randomUUID\(\)/);
    expect(fn).not.toMatch(/const ts = Date\.now\(\)/);
    expect(fn).toMatch(/claims\/\$\{folder\}\//);
  });

  it('is generated once per claim, so one claim keeps its files together', () => {
    // A randomUUID() inside uploadB64 would scatter the four files across four
    // folders - harmless for privacy, but it would make the evidence for one
    // claim impossible to look at as a set in the dashboard.
    expect((fn.match(/crypto\.randomUUID\(\)/g) || []).length).toBe(1);
    expect(fn.indexOf('const folder')).toBeLessThan(fn.indexOf('async function uploadB64'));
  });

  it('really is unguessable, measured rather than assumed', () => {
    // Date.now() over a single day is ~8.6e7 possibilities. A v4 UUID is ~5e36.
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('which bucket it goes to', () => {
  it('tries the private one first', () => {
    expect(code).toMatch(/const CLAIM_BUCKET = 'claim-evidence'/);
    const first = fn.indexOf('put(CLAIM_BUCKET)');
    const second = fn.indexOf('put(CLAIM_FALLBACK_BUCKET)');
    // Both must EXIST before their order means anything. The first version of
    // this test only compared the two indexOf results, and indexOf returns -1
    // when a string is absent - so swapping the private bucket for the public
    // one made the private call vanish, -1 came back, and `-1 < n` kept the
    // test green over the exact bug it was written for. Caught by putting the
    // bug back, which is the only reason it is not still green today.
    expect(first, 'the private bucket is never tried').toBeGreaterThan(-1);
    expect(second, 'there is no fallback').toBeGreaterThan(-1);
    expect(first).toBeLessThan(second);
  });

  it('falls back to the public one rather than losing the evidence', () => {
    // Buckets are made by hand, like the SQL. Until Diego makes it, a claim
    // still has to be stored - the random folder is what protects it there.
    expect(fn).toMatch(/put\(CLAIM_FALLBACK_BUCKET\)/);
    expect(code).toMatch(/const CLAIM_FALLBACK_BUCKET = 'job-photos'/);
  });

  it('stores a bucket-relative path for the private one - it has no public URL', () => {
    expect(fn).toMatch(/return `\$\{CLAIM_BUCKET\}\/\$\{path\}`/);
  });

  it('says so in the logs when it had to fall back', () => {
    expect(fn).toMatch(/falling back to the public bucket/);
  });
});

describe('signClaimEvidence', () => {
  // Read as source, not imported. An earlier version of this block did
  // `await import('../../api/auth.js')` to reach the function itself, and with
  // the whole suite running that import went past 5s and died on the timeout -
  // the exact trap docs/PENDIENTES.md 88 already records. The import bought
  // nothing either: the function is not exported, so the assertions were on
  // the source anyway.
  const rule = code.slice(
    code.indexOf('async function signClaimEvidence('),
    code.indexOf('async function handleAdminClaimsUpdate(')
  );

  it('leaves a full public URL from an older claim exactly as it was', () => {
    // The compatibility question: a claim filed before the private bucket
    // existed holds a complete public URL and must survive untouched.
    expect(rule).toMatch(/if \(!ref\.startsWith\(prefix\)\) return ref;/);
    expect(rule).toMatch(/const prefix = `\$\{CLAIM_BUCKET\}\/`/);
  });

  it('returns null - never the raw path - when signing fails', () => {
    expect(rule).toMatch(/if \(!r\.ok\) \{[\s\S]*?return null;/);
    expect(rule).toMatch(/catch \(e\) \{[\s\S]*?return null;/);
  });

  it('signs for an hour, not forever', () => {
    expect(code).toMatch(/expiresIn: 3600/);
  });
});

describe('the admin panel', () => {
  const adminjs = readFileSync(join(root, 'js', 'admin.js'), 'utf8');

  it('drops an evidence file that could not be signed instead of rendering src="null"', () => {
    expect(adminjs).toMatch(/\(c\.photo_urls \|\| \[\]\)\s*\r?\n?\s*\.filter\(Boolean\)/);
  });
});

describe('the list route signs before answering', () => {
  const list = code.slice(
    code.indexOf('async function handleAdminClaimsList('),
    code.indexOf('async function signClaimEvidence(')
  );

  it('signs both the photos and the invoice', () => {
    expect(list).toMatch(/photo_urls: await Promise\.all\(\(c\.photo_urls \|\| \[\]\)\.map\(signClaimEvidence\)\)/);
    expect(list).toMatch(/invoice_url: await signClaimEvidence\(c\.invoice_url\)/);
  });

  it('returns the signed rows, not the raw ones', () => {
    expect(list).toMatch(/return res\.status\(200\)\.json\(signed\)/);
    expect(list).not.toMatch(/json\(data \|\| \[\]\)/);
  });
});
