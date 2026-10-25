// tests/e2e/fixtures.js - what every e2e test spends from the real Supabase.
//
// This suite runs against production every 6 hours, so each request it makes
// to Supabase comes out of the live project's quota (Free plan: 5 GB of cached
// egress a month). In October 2026 that quota ran out and put the project in a
// grace period: the landing loaded a 1.9 MB profile photo, and the suite opened
// the landing ~22 times per run. Nobody could see it, because nothing counted.
//
// This counts it. Every test appends one line - requests and bytes to
// *.supabase.co - to test-results/supabase-traffic.jsonl, and
// scripts/e2e-supabase-traffic.mjs adds them up after the run.
import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const TRAFFIC_FILE = path.join('test-results', 'supabase-traffic.jsonl');
const SUPABASE = /^https:\/\/[a-z0-9]+\.supabase\.co\//;

export const test = base.extend({
  supabaseMeter: [
    async ({ page }, use, testInfo) => {
      const sizes = [];
      page.on('requestfinished', (req) => {
        if (!SUPABASE.test(req.url())) return;
        sizes.push(
          req
            .sizes()
            .then((s) => ({ url: req.url(), bytes: s.responseBodySize + s.responseHeadersSize }))
            .catch(() => ({ url: req.url(), bytes: 0 }))
        );
      });
      await use();
      const hits = await Promise.all(sizes);
      fs.mkdirSync(path.dirname(TRAFFIC_FILE), { recursive: true });
      fs.appendFileSync(
        TRAFFIC_FILE,
        JSON.stringify({
          project: testInfo.project.name,
          file: path.basename(testInfo.file),
          title: testInfo.title,
          requests: hits.length,
          bytes: hits.reduce((s, h) => s + h.bytes, 0),
          heaviest: hits.sort((a, b) => b.bytes - a.bytes)[0] || null,
        }) + '\n'
      );
    },
    { auto: true },
  ],
});

export { expect };
