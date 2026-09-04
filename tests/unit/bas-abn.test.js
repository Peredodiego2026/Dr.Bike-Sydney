// tests/unit/bas-abn.test.js
//
// The BAS export carried the literal placeholder "ABN: [Your ABN here]" while
// the printed Finance report - thirty lines further down THE SAME FILE - wrote
// the real ABN by hand, twice.
//
// Nobody would have caught it on screen. The BAS is a downloaded .txt that
// only gets opened in front of an accountant, which is the worst possible
// moment to discover the ABN box says "[Your ABN here]".
//
// All three now read one constant. This runs exportBAS() for real, because the
// fix replaced hand-written text with `${DRBIKE_ABN}` inside a template
// literal - and a `${...}` that lands in an ordinary quoted string prints
// itself verbatim while `node --check` stays perfectly happy. Reading the
// source would not tell the two apart. Executing it does.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs
  .readFileSync(new URL('../../js/admin.js', import.meta.url), 'utf8')
  .split('\r\n')
  .join('\n');

// Brace-matched, because these functions contain template literals whose HTML
// has `}` at the start of a line - the naive "\n}\n" cut lands mid-function.
function fnSource(head) {
  const start = src.indexOf(head);
  expect(start, `${head} is gone from js/admin.js`).toBeGreaterThan(-1);
  let depth = 0;
  let i = src.indexOf('{', start);
  const open = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces from ${open}`);
}

function runExportBAS() {
  let written = '';
  const stub = () => '';
  const defined = {
    window: {
      _finData: {
        periodStr: 'August 2026',
        revenue: 1000,
        gst: 91,
        jobCount: 3,
        avgJob: 333,
        calloutGaps: 0,
        expensesAvailable: true,
        expenses: { total: 0, byCat: {} },
      },
    },
    EXPENSE_LABELS: {},
    anMoney: (n) => '$' + Number(n).toFixed(2),
    Blob: function (parts) {
      written = parts[0];
    },
    URL: { createObjectURL: () => 'blob:fake' },
    document: { createElement: () => ({ click() {} }) },
    Object,
    Number,
    Date,
  };
  const ctx = vm.createContext(
    new Proxy(defined, { has: () => true, get: (t, k) => (k in t ? t[k] : stub) })
  );

  vm.runInContext(
    src.slice(src.indexOf('const DRBIKE_ABN'), src.indexOf('\n', src.indexOf('const DRBIKE_ABN'))),
    ctx
  );
  vm.runInContext(fnSource('function basExpensesBlock('), ctx);
  vm.runInContext(fnSource('function exportBAS('), ctx);
  ctx.exportBAS();
  return written;
}

describe('the BAS carries the real ABN', () => {
  const bas = runExportBAS();

  it('produced a BAS at all', () => {
    expect(bas).toContain('BAS SUMMARY');
  });

  it('the ABN line is the real number', () => {
    const line = bas.split('\n').find((l) => l.startsWith('ABN'));
    expect(line, 'no ABN line in the BAS').toBeTruthy();
    expect(line).toContain('87 654 025 287');
  });

  // The specific failure the fix could have introduced: a `${...}` written
  // into a plain string prints itself, and every parser accepts it.
  it('interpolated instead of printing the expression', () => {
    expect(bas, 'the template placeholder reached the file').not.toContain('${');
  });

  it('the placeholder is gone for good', () => {
    expect(bas).not.toContain('[Your ABN here]');
    // In the code, not in the comment above the fix that names what it was.
    const code = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toContain('[Your ABN here]');
  });
});

describe('one ABN, one place', () => {
  it('js/admin.js states the number once', () => {
    const literals = src.match(/87 654 025 287/g) || [];
    expect(literals, 'the ABN is written by hand more than once again').toHaveLength(1);
  });

  it('the printed report reads the same constant', () => {
    const report = src.slice(src.indexOf('win.document.write(`'));
    expect(report.slice(0, 6000)).toContain('ABN ${DRBIKE_ABN}');
  });

  // The BAS and the client's invoice have to state the same ABN, or an
  // accountant is reconciling two businesses.
  it('matches the ABN on the invoice the client receives', () => {
    const invoice = fs.readFileSync(new URL('../../api/send-invoice.js', import.meta.url), 'utf8');
    const abn = src.match(/const DRBIKE_ABN = '([^']+)'/)[1];
    expect(invoice, 'the invoice states a different ABN from the BAS').toContain(abn);
  });
});
