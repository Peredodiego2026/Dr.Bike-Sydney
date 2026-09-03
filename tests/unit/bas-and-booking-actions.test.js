// tests/unit/bas-and-booking-actions.test.js
//
// Two Admin fixes Diego asked for on 2026-09-03.
//
// 1. The BAS export printed "1B — GST Credits on Purchases: $0", which reads
//    as a figure that was worked out. It was not: this app stores what the
//    business spent but not whether each purchase carried GST, nor whether it
//    was capital or non-capital. Lodging with 1B at $0 claims no GST credits
//    at all - for a business with recorded expenses, that is overpaying the
//    ATO. Now those boxes say NOT CALCULATED and the export carries the real
//    recorded expenses as supporting information for his tax agent.
//
//    Note the expenses were always there. The P&L on the same screen has been
//    subtracting them for months; the BAS just never asked.
//
// 2. The Bookings actions column rendered one to five buttons per row, each
//    with its own margin-right, in a nowrap cell - so the column width jumped
//    row to row and a cancelled booking collapsed to an empty cell.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8').split('\r\n').join('\n');
const admin = read('js/admin.js');
const adminCss = read('css/admin.css');

// Run the real function out of js/admin.js.
function runExpensesBlock(finData) {
  const start = admin.indexOf('function basExpensesBlock(');
  expect(start, 'basExpensesBlock is gone from js/admin.js').toBeGreaterThan(-1);
  const end = admin.indexOf('\n}\n', start);

  const ctx = vm.createContext({
    EXPENSE_LABELS: {
      payroll: 'Payroll',
      fleet: 'Fleet & van',
      parts: 'Parts & supplies',
      other: 'Other',
    },
    anMoney: (n) => '$' + Number(n).toFixed(2),
    Object,
    Number,
  });
  return vm.runInContext('(' + admin.slice(start, end + 2) + ')', ctx)(finData);
}

describe('the BAS never claims a figure it did not work out', () => {
  const basStart = admin.indexOf('function exportBAS(');
  const basSource = admin.slice(basStart, admin.indexOf('\n}\n', basStart));

  // The 1B LINE itself, not the prose below it that quotes "$0" while
  // explaining why lodging that number is wrong.
  it('does not print $0 for GST credits', () => {
    expect(basSource, 'lodging 1B at $0 claims no GST credits and overpays the ATO').not.toMatch(
      /1B — GST Credits on Purchases: \$0/
    );
  });

  it('marks 1B, G10 and G11 as not calculated', () => {
    for (const box of ['G10', 'G11', '1B']) {
      expect(basSource).toMatch(new RegExp(box + '[^\\n]*NOT CALCULATED'));
    }
  });

  it('explains why, rather than leaving a blank the reader has to interpret', () => {
    expect(basSource).toContain('WHY G10, G11 AND 1B ARE BLANK');
    expect(basSource).toContain('paying the ATO more than it is owed');
  });

  // The net figure used to be called "NET GST PAYABLE TO ATO" while silently
  // assuming zero credits. That name was the actual falsehood.
  it('does not present GST on sales as the net owed', () => {
    expect(basSource).not.toContain('NET GST PAYABLE TO ATO');
    expect(basSource).toContain('BEFORE ANY CREDITS AT 1B');
  });

  it('still reports sales, which it can compute', () => {
    expect(basSource).toMatch(/G1 —[^\n]*d\.revenue/);
    expect(basSource).toMatch(/1A —[^\n]*d\.gst/);
  });
});

describe('the expenses the accountant needs are in the file', () => {
  it('lists each category with a total, biggest first', () => {
    const out = runExpensesBlock({
      expensesAvailable: true,
      expenses: { total: 1450, byCat: { fleet: 900, parts: 400, payroll: 150 } },
    });
    expect(out).toContain('Fleet & van: $900.00');
    expect(out).toContain('Parts & supplies: $400.00');
    expect(out).toContain('Total recorded: $1450.00');
    expect(out.indexOf('Fleet & van')).toBeLessThan(out.indexOf('Parts & supplies'));
  });

  // Wages go in W1/W2, not G11. Putting them in a purchases total would be a
  // different wrong number in place of the old one.
  it('flags payroll as not being a G11 purchase', () => {
    const out = runExpensesBlock({
      expensesAvailable: true,
      expenses: { total: 150, byCat: { payroll: 150 } },
    });
    expect(out).toContain('wages are not a G11 purchase');
  });

  it('says so plainly when nothing was recorded', () => {
    const out = runExpensesBlock({ expensesAvailable: true, expenses: { total: 0, byCat: {} } });
    expect(out).toContain('none');
    expect(out).toContain('Admin > Expenses');
  });

  it('does not invent zeroes when the expenses could not be read', () => {
    const out = runExpensesBlock({ expensesAvailable: false });
    expect(out).toContain('could not be read');
    expect(out).not.toContain('Total recorded');
  });

  it('the finance data carries the expenses the BAS reads', () => {
    expect(admin).toMatch(/expenses:\s*exp,/);
    expect(admin).toMatch(/expensesAvailable:/);
  });
});

describe('the Bookings actions column lines up', () => {
  const cell = admin.slice(
    admin.indexOf('<td data-label="Actions"'),
    admin.indexOf('<td data-label="Actions"') + 1200
  );

  it('spaces the buttons with a container gap, not per-button margins', () => {
    expect(cell).toContain('class="bk-actions"');
    expect(cell, 'a hidden last button leaves a trailing margin behind').not.toContain(
      'margin-right'
    );
  });

  it('gives every button the same footprint so the column stops jumping', () => {
    expect(adminCss).toMatch(/\.bk-act\s*\{[^}]*min-width/);
    expect(adminCss).toMatch(/\.bk-actions\s*\{[^}]*gap/);
  });

  // A cancelled booking has no actions, and an empty cell made the row look
  // broken rather than finished.
  it('a cancelled row says so instead of collapsing', () => {
    expect(cell).toContain('bk-actions__none');
    expect(adminCss).toContain('.bk-actions__none');
  });

  it('keeps every action wired to the same delegated handler', () => {
    for (const action of ['confirm', 'chat', 'track', 'reschedule', 'cancel']) {
      expect(cell, `the ${action} button lost its data-bk-action`).toContain(
        `data-bk-action="${action}"`
      );
    }
  });

  // The styles moved out of inline attributes, so they have to resolve through
  // tokens - which is also what keeps them correct in the dark theme.
  it('colours the buttons from tokens, not hex', () => {
    const block = adminCss.slice(adminCss.indexOf('.bk-actions {'));
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });
});
