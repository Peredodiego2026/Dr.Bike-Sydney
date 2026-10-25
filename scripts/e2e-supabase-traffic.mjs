// scripts/e2e-supabase-traffic.mjs - adds up what one e2e run spent from the
// live Supabase project (tests/e2e/fixtures.js writes one line per test).
// Prints a table, and appends it to the GitHub job summary when there is one.
// Run after the suite: node scripts/e2e-supabase-traffic.mjs
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function summarize(lines) {
  const rows = lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const add = (map, key, r) => {
    const t = map.get(key) || { tests: 0, requests: 0, bytes: 0 };
    t.tests += 1;
    t.requests += r.requests;
    t.bytes += r.bytes;
    map.set(key, t);
  };
  const byProject = new Map();
  const byFile = new Map();
  for (const r of rows) {
    add(byProject, r.project, r);
    add(byFile, r.file, r);
  }
  const heaviest = new Map();
  for (const r of rows) {
    if (!r.heaviest) continue;
    const url = r.heaviest.url.split('?')[0];
    const h = heaviest.get(url) || { url, bytes: r.heaviest.bytes, times: 0 };
    h.times += 1;
    heaviest.set(url, h);
  }
  return {
    tests: rows.length,
    requests: rows.reduce((s, r) => s + r.requests, 0),
    bytes: rows.reduce((s, r) => s + r.bytes, 0),
    byProject,
    byFile,
    heaviest: [...heaviest.values()]
      .sort((a, b) => b.bytes * b.times - a.bytes * a.times)
      .slice(0, 5),
  };
}

const kb = (b) => `${(b / 1024).toFixed(1)} KB`;

export function toMarkdown(s) {
  const table = (title, map) => [
    `| ${title} | Tests | Requests | Downloaded |`,
    '|---|---:|---:|---:|',
    ...[...map].map(([k, t]) => `| ${k} | ${t.tests} | ${t.requests} | ${kb(t.bytes)} |`),
  ];
  return [
    '## Supabase traffic of this run',
    '',
    `**${s.requests} requests, ${kb(s.bytes)}** across ${s.tests} tests.`,
    '',
    ...table('Project', s.byProject),
    '',
    ...table('Spec', s.byFile),
    '',
    'Heaviest responses (size x times it was the biggest in a test):',
    '',
    ...s.heaviest.map((h) => `- ${kb(h.bytes)} x ${h.times} - ${h.url}`),
    '',
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = 'test-results/supabase-traffic.jsonl';
  if (!fs.existsSync(file)) {
    console.log(`No ${file} - the e2e suite did not run, or wrote nothing.`);
    process.exit(0);
  }
  const md = toMarkdown(summarize(fs.readFileSync(file, 'utf8').split('\n')));
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
}
