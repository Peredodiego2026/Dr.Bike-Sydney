// tests/unit/public-parts-prices.test.js - the parts price list anyone can see
// (25-oct-2026). Decided: shown before booking, so the price a client approves
// at the door is one they already saw. And never the cost: "el cliente nunca
// debe saber cuanto me costo" - only name, category and the client price may
// leave the server.
// Run: npm test
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

// What production would return if a select ever asked for more than it should:
// every row carries the cost and the stock, so a leak shows up in the output.
const ROWS = [
  { name: 'Inner tube 700c', category: 'Tubes', sell_price: 15, cost_price: 3.2, stock: 40 },
  { name: 'Brake pads B01S', category: 'brakes', sell_price: 25.5, cost_price: 8.5, stock: 12 },
  { name: 'Shop rag', category: 'General', sell_price: 0, cost_price: 0.1, stock: 99 },
  { name: 'Mystery part', category: 'General', sell_price: null, cost_price: 4, stock: 1 },
];
let asked;
let activeMissing;
let down;
globalThis.fetch = async (url) => {
  const u = String(url);
  asked.push(u);
  if (down) return { ok: false, status: 500, json: async () => ({}) };
  if (activeMissing && u.includes('active=is.true'))
    return {
      ok: false,
      status: 400,
      json: async () => ({ message: 'column active does not exist' }),
    };
  return { ok: true, status: 200, json: async () => ROWS };
};

const { handlePartsPrices } = await import('../../api/auth.js');
const { formatPartPrice, groupParts, partsListHtml } = await import('../../js/parts-prices.js');

const run = async () => {
  const res = { statusCode: null, body: null, headers: {} };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  await handlePartsPrices({ body: { role: 'parts-prices' }, headers: {} }, res);
  return res;
};

beforeEach(() => {
  asked = [];
  activeMissing = false;
  down = false;
});

describe('the server never hands out the cost', () => {
  it('asks the database for name, category and client price only', async () => {
    await run();
    expect(asked[0]).toContain('select=name,category,sell_price&');
    for (const u of asked) {
      expect(u).not.toMatch(/cost_price|stock|select=\*/);
    }
  });

  it('answers with name, category and price - nothing else, even if the row has more', async () => {
    const r = await run();
    expect(r.statusCode).toBe(200);
    for (const p of r.body) expect(Object.keys(p).sort()).toEqual(['category', 'name', 'price']);
    expect(JSON.stringify(r.body)).not.toMatch(/cost|stock|3\.2|8\.5/);
  });

  it('only active parts with a real price', async () => {
    const r = await run();
    expect(asked[0]).toContain('active=is.true');
    expect(asked[0]).toContain('sell_price=gt.0');
    expect(r.body.map((p) => p.name)).toEqual(['Inner tube 700c', 'Brake pads B01S']);
    expect(r.body[1]).toEqual({ name: 'Brake pads B01S', category: 'brakes', price: 25.5 });
  });

  it('before the active column exists, still answers', async () => {
    activeMissing = true;
    const r = await run();
    expect(r.statusCode).toBe(200);
    expect(asked).toHaveLength(2);
    expect(asked[1]).not.toContain('active=');
  });

  it('a database failure is an error, not an empty list that reads as "no parts"', async () => {
    down = true;
    const r = await run();
    expect(r.statusCode).toBe(502);
  });

  it('is a public role with its own rate limit, routed in the dispatcher', () => {
    const auth = fs.readFileSync(new URL('../../api/auth.js', import.meta.url), 'utf8');
    expect(auth).toMatch(/role === 'parts-prices' \|\|/);
    expect(auth).toMatch(/if \(role === 'parts-prices'\) return handlePartsPrices\(req, res\);/);
  });
});

describe('the list the client sees', () => {
  const parts = [
    { name: 'Inner tube 700c', category: 'Tubes', price: 15 },
    { name: 'Brake pads B01S', category: 'brakes', price: 25.5 },
    { name: 'Disc pads', category: 'Brakes ', price: 30 },
    { name: '<img src=x onerror=alert(1)>', category: 'Tubes', price: 9 },
  ];

  it('prices read like the service prices next to the link', () => {
    expect(formatPartPrice(15)).toBe('$15');
    expect(formatPartPrice(25.5)).toBe('$25.50');
    expect(formatPartPrice('12.99')).toBe('$12.99');
  });

  it('one heading per category however Admin typed it, alphabetical', () => {
    const g = groupParts(parts);
    expect(g.map((x) => x.label)).toEqual(['Brakes', 'Tubes']);
    expect(g[0].parts.map((p) => p.name)).toEqual(['Brake pads B01S', 'Disc pads']);
  });

  it('a part name is text, never markup', () => {
    const html = partsListHtml(parts);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('search narrows by name; nothing matching renders nothing', () => {
    expect(partsListHtml(parts, 'tube')).toContain('Inner tube 700c');
    expect(partsListHtml(parts, 'tube')).not.toContain('Disc pads');
    expect(partsListHtml(parts, 'zzz')).toBe('');
  });
});

describe('every surface opens the same list', () => {
  const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

  it('the price notes on index.html and landing.html link to it', () => {
    for (const page of ['index.html', 'landing.html']) {
      expect(read(page)).toMatch(
        /<button type="button" data-action="parts-prices"[^>]*>See parts prices<\/button>/
      );
    }
  });

  it('app.js opens it from one delegated listener and from ?view=parts-prices', () => {
    const app = read('js/app.js');
    expect(app).toMatch(/import \{ openPartsPrices \} from '\.\/parts-prices\.js';/);
    expect(app).toMatch(/closest\('\[data-action="parts-prices"\]'\)/);
    expect(app).toMatch(/get\('view'\) === 'parts-prices'/);
    // ...and the booking summary, where the door amount is, says parts are extra.
    expect(app).toMatch(/Parts are extra if your bike needs any/);
  });

  it('the terms link to it in all three languages', () => {
    expect(read('terms.html').match(/href="\/\?view=parts-prices"/g)).toHaveLength(3);
  });

  it('its strings are checked for translations', () => {
    expect(read('scripts/i18n-check.mjs')).toMatch(/'js\/parts-prices\.js'/);
  });
});
