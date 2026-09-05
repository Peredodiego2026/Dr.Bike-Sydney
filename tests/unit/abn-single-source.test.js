// Audit point 6 of the 20-point pre-launch list. Its wording had only ever
// lived in a chat - docs/AUDITORIA-PRELANZAMIENTO.md listed it as NO
// RECUPERADO for months. Recovered from the session transcripts on 2026-09-05
// and confirmed against point 15, whose recovered text matches the table's
// entry word for word:
//
//   "ABN y GST visibles, y en las facturas - Atencion. Contable / ATO.
//    Una factura fiscal valida en Australia necesita ABN, la palabra
//    Tax Invoice y el GST desglosado."
//
// The invoice half is closed - api/send-invoice.js has all three. The half
// that was not is that the ABN is typed by hand in 46 files with nothing
// tying them together, which is precisely the bug that shipped in the BAS
// export eight days ago (PR #410) at the scale of one file.
//
// The check runs as a process here, so the test asserts what CI asserts: the
// exit code.

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { isValidAbn } from '../../scripts/abn-check.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function runCheck() {
  try {
    execFileSync('node', ['scripts/abn-check.mjs'], { cwd: root, stdio: 'pipe' });
    return { code: 0, out: '' };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stderr || e.stdout || '') };
  }
}

describe('the repo as it stands', () => {
  it('carries exactly one ABN, and it passes', () => {
    expect(runCheck().code).toBe(0);
  });
});

describe('the ATO checksum', () => {
  // The reason this is worth having at all: eleven digits are not enough.
  // The last digit is a check digit, so a typo produces a number that looks
  // completely plausible on an invoice and is not a real ABN.
  it('accepts the real one', () => {
    expect(isValidAbn('87654025287')).toBe(true);
  });

  it('rejects two transposed digits - the typo a person cannot see', () => {
    expect(isValidAbn('87654025278')).toBe(false);
    expect(isValidAbn('78654025287')).toBe(false);
  });

  it('rejects a single wrong digit', () => {
    expect(isValidAbn('87654025286')).toBe(false);
  });

  it('rejects anything that is not eleven digits', () => {
    for (const bad of ['', '8765402528', '876540252877', '87 654 025 287', 'abcdefghijk']) {
      expect(isValidAbn(bad), `${bad} was accepted`).toBe(false);
    }
  });

  it('is not simply always false, which would make the test above meaningless', () => {
    // Two other real, valid ABNs - taken from the trademark-status skill's
    // IP Australia lookups, i.e. numbers that exist and are not ours.
    expect(isValidAbn('98758705115')).toBe(true);
    expect(isValidAbn('56622469201')).toBe(true);
  });
});

describe('a second, different ABN appearing anywhere', () => {
  const planted = join(root, 'zz-planted-by-a-test.html');

  it('fails the check and prints both numbers', () => {
    // A plausible-looking but different ABN, the way a half-finished find and
    // replace would leave one behind.
    writeFileSync(planted, '<p>Dr. Bike Sydney &middot; ABN 51 824 753 556</p>\n');
    try {
      const r = runCheck();
      expect(r.code).toBe(1);
      expect(r.out).toContain('51824753556');
      expect(r.out).toContain('87654025287');
    } finally {
      // Always, even if an expectation threw: a leftover file here breaks
      // `npm run check` for everybody.
      unlinkSync(planted);
    }
    expect(runCheck().code).toBe(0);
  });
});

describe('what it looks at', () => {
  const src = readFileSync(join(root, 'scripts', 'abn-check.mjs'), 'utf8');

  it('normalises spacing, so "87654025287" and "87 654 025 287" are one number', () => {
    // Otherwise a file that drops the spaces would read as a second ABN and
    // the check would cry wolf until somebody switched it off.
    expect(src).toMatch(/m\[1\]\.replace\(\/\\s\/g, ''\)/);
  });

  it('skips .claude, and says why', () => {
    // trademark-status quotes OTHER companies' ABNs from IP Australia on
    // purpose. The check found them on its first run.
    expect(src).toContain("'.claude'");
    expect(src).toMatch(/trademark-status/);
  });

  it('fails when it finds NO ABN at all, instead of passing on nothing', () => {
    // The failure mode that makes a guard useless: the pattern stops matching,
    // nothing is found, and a green tick means "I checked zero things".
    expect(src).toMatch(/if \(found\.size === 0\) \{[\s\S]*?process\.exit\(1\)/);
  });
});

describe('the tax invoice itself', () => {
  const invoice = readFileSync(join(root, 'api', 'send-invoice.js'), 'utf8');

  // The other half of audit point 6. These three are what makes a document a
  // valid tax invoice in Australia; without them it is just a receipt.
  it('says the words "Tax Invoice"', () => {
    expect(invoice).toMatch(/Tax Invoice/i);
  });

  it('shows the ABN', () => {
    expect(invoice).toMatch(/ABN/);
  });

  it('breaks out the GST as its own line rather than folding it into a total', () => {
    expect(invoice).toMatch(/GST included/);
  });
});

describe('npm run check', () => {
  it('runs it, or none of this protects anything', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts.check).toContain('scripts/abn-check.mjs');
  });
});
