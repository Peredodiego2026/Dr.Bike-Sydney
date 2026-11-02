// /bike-check (el test "Is My Bike Safe to Ride?") se retiro el 02-nov-2026:
// Diego prefiere que ese link lleve directo a reservar. Google nunca la
// indexo, asi que el unico trafico venia de los links propios (blog y pies de
// pagina), que ahora apuntan al booking.
//
// Esto cuida que los 3 idiomas sigan redirigiendo al wizard y que ninguna
// pagina vuelva a enlazar a /bike-check.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../../', import.meta.url);
const rootDir = new URL(root).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const vercel = JSON.parse(fs.readFileSync(new URL('vercel.json', root), 'utf8'));

function htmlFiles(dir = '.', acc = []) {
  for (const e of fs.readdirSync(path.join(rootDir, dir), { withFileTypes: true })) {
    if (['node_modules', '.git', 'tests', '.claude', 'docs'].includes(e.name)) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(rel, acc);
    else if (e.name.endsWith('.html')) acc.push(rel.replace(/\\/g, '/'));
  }
  return acc;
}

// Same matching Vercel does for these sources: ":name(a|b)" is a capture
// group, anything else is literal.
function matches(source, url) {
  const re = source.replace(/\./g, '\\.').replace(/:\w+\(([^)]+)\)/g, '($1)');
  return new RegExp(`^${re}$`).test(url);
}

describe('/bike-check is retired', () => {
  it.each(['/bike-check', '/bike-check.html', '/es/bike-check', '/es/bike-check.html', '/zh/bike-check', '/zh/bike-check.html'])(
    '%s 301s to the booking wizard',
    (url) => {
      const rule = vercel.redirects.find((r) => matches(r.source, url));
      expect(rule).toBeDefined();
      expect(rule.destination).toBe('/#book-service');
      expect(rule.permanent).toBe(true);
    }
  );

  it('no rewrite still serves it', () => {
    for (const r of vercel.rewrites) expect(r.source).not.toMatch(/bike-check/);
  });

  it('the page files are gone', () => {
    for (const f of ['bike-check.html', 'es/bike-check.html', 'zh/bike-check.html']) {
      expect(fs.existsSync(new URL(f, root))).toBe(false);
    }
  });

  it('no page links to it', () => {
    const linking = htmlFiles().filter((p) => {
      try {
        return /href="(\/(es|zh))?\/bike-check/.test(fs.readFileSync(path.join(rootDir, p), 'utf8'));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        return false;
      }
    });
    expect(linking).toEqual([]);
  });

  it('the sitemap no longer lists it', () => {
    expect(fs.readFileSync(new URL('sitemap.xml', root), 'utf8')).not.toContain('bike-check');
  });
});
