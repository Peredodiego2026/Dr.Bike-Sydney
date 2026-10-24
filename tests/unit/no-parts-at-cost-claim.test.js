// tests/unit/no-parts-at-cost-claim.test.js - the site, the plan cards and the
// chatbot all told clients spare parts were sold "at cost price with no
// markup". They are not: parts carry a margin (a Duro tube costs $2 and sells
// for $15, scripts/add-stock-movements-and-tube-seed.sql), and terms.html s3
// itself says "at cost plus a reasonable handling fee". A price claim a client
// can check against their own invoice is the kind the ACL calls misleading.
// Fixed 25-oct-2026; this keeps it from coming back in any of the 3 languages.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// What a client reads or hears. terms.html is the legal text and states the
// handling fee, so it is not in this list.
const SURFACES = [
  'index.html',
  'landing.html',
  'js/landing-inline.js',
  'js/app.js',
  'js/i18n-es.js',
  'js/i18n-zh.js',
  'api/chat.js',
];

// Comments may talk about the old claim; only shipped text counts.
const withoutComments = (src) =>
  src
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|<!--)/.test(l))
    .join('\n');

describe('nothing tells a client parts are sold at cost', () => {
  it.each(SURFACES)('%s', (file) => {
    const src = withoutComments(read(file));
    expect(src).not.toMatch(/at cost price|charged separately at cost|charged at cost/i);
    expect(src).not.toMatch(/precio de costo|按成本/);
    // "no markup" is only allowed inside the chatbot's instruction NOT to say it.
    const markup = src.match(/[^\n]{0,80}no markup[^\n]{0,20}/gi) || [];
    for (const m of markup) expect(m).toMatch(/Never say/);
  });

  it('the chatbot is told how parts are actually charged', () => {
    expect(read('api/chat.js')).toContain('the mechanic quotes them and the customer approves');
  });
});
