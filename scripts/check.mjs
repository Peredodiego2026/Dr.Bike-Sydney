// Deploy gate: syntax-check every JS file in api/ and js/ plus middleware.js.
// Exits non-zero if any file fails `node --check`, which aborts `npm run deploy`.
import { execSync } from 'node:child_process';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['api', 'js'];
const extra = ['middleware.js'];
const files = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.m?js$/.test(name)) files.push(p);
  }
}

for (const r of roots) { if (existsSync(r)) walk(r); }
for (const f of extra) { if (existsSync(f)) files.push(f); }

let failed = 0;
for (const f of files) {
  try {
    execSync(`node --check "${f}"`, { stdio: 'pipe' });
  } catch (e) {
    failed++;
    console.error(`✗ ${f}\n${(e.stderr || e.stdout || e.message || '').toString().trim()}`);
  }
}

if (failed) {
  console.error(`\n${failed} file(s) failed node --check — deploy blocked.`);
  process.exit(1);
}
console.log(`✓ ${files.length} JS files passed node --check`);
