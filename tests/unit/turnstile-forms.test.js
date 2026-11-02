// Los formularios de flotas (business.html) y de newsletter (bike-check.html),
// y sus copias es/ y zh/, no mandaban el token de Turnstile. El servidor lo
// exige y contesta 403 sin el; las paginas no miraban la respuesta y decian
// "enviado" igual, asi que las consultas de flotas se perdian sin que nadie se
// enterara (02-nov-2026).
//
// El efecto se probo en Edge contra el script real de Cloudflare. Esto cuida
// que una pagina nueva, o una regenerada, no vuelva a mandar sin token.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');

function htmlFiles(dir = '.', acc = []) {
  const abs = path.join(new URL(root).pathname.replace(/^\/([A-Za-z]:)/, '$1'), dir);
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (['node_modules', '.git', 'tests', '.claude'].includes(e.name)) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(rel, acc);
    else if (e.name.endsWith('.html')) acc.push(rel.replace(/\\/g, '/'));
  }
  return acc;
}

// Each endpoint, the body field the page must send, where the server reads it
// from, and how many static pages post to it today. bike-check.html (x3) was
// the newsletter's only static page until it was retired on 2026-11-02; the
// landing's newsletter lives in js/landing-inline.js, not here.
const FORMS = [
  {
    endpoint: '/api/send-b2b-inquiry',
    field: "'cf-turnstile-response': token",
    server: 'api/send-cron.js',
    reads: "verifyTurnstile(req, req.body?.['cf-turnstile-response'])",
    minPages: 3,
  },
  {
    endpoint: '/api/subscribe-newsletter',
    field: 'turnstileToken',
    server: 'api/subscribe-newsletter.js',
    reads: 'verifyTurnstile(req, req.body?.turnstileToken)',
    minPages: 0,
  },
];

// A page deleted between readdir and the read is skipped (another test plants
// and removes a file at the root); any other read error still throws.
const pages = [];
for (const p of htmlFiles()) {
  try {
    pages.push([p, read(p)]);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

describe.each(FORMS)('every page that posts to $endpoint', ({ endpoint, field, server, reads, minPages }) => {
  const posting = pages.filter(([, html]) => html.includes(`fetch('${endpoint}'`));

  it('is found in all three languages', () => {
    expect(posting.length).toBeGreaterThanOrEqual(minPages);
  });

  it('the server still reads the token from that field', () => {
    expect(read(server)).toContain(reads);
  });

  it.each(posting.map(([p]) => p))('%s renders the widget and sends its token', (p) => {
    const html = pages.find(([q]) => q === p)[1];
    expect(html).toContain('https://challenges.cloudflare.com/turnstile/v0/api.js');
    expect(html).toMatch(/class="cf-turnstile" data-sitekey="0x4AAAAAAD46XeEV_Dvk2GA9"/);
    expect(html).toContain(field);
  });

  it.each(posting.map(([p]) => p))('%s does not show success on a 403', (p) => {
    const html = pages.find(([q]) => q === p)[1];
    expect(html).toMatch(/if\s*\(\s*!\s*\w+\.ok\s*\)\s*throw/);
  });
});
