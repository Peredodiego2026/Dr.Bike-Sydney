// tests/unit/finance-range.test.js — Finanzas fechaba la plata por
// scheduled_date mientras Analytics la fechaba por completed_at, asi que el
// mismo mes daba dos facturaciones distintas y el BAS tomaba la que nadie
// habia acordado (docs/PENDIENTES.md 20.4). Diego eligio completed_at para las
// dos pantallas el 16-ago-2026.
//
// Las tres piezas puras del cambio se levantan del fuente y se corren: el
// rango, la fecha con la que se reconoce cada trabajo, y la etiqueta del
// periodo. js/admin.js es un script clasico y no se puede importar - mismo
// enfoque que tests/unit/suburb-coord.test.js.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const src = readFileSync(join(root, 'js/admin.js'), 'utf8');

const grab = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error(`${what} not found in js/admin.js`);
  return m[0];
};

const { finRange, periodLabel, finRevenueDate } = new Function(`
  ${grab(/function finRange\(view, month, year\) \{[\s\S]*?\n\}/, 'finRange')}
  ${grab(/function periodLabel\(view, month, year\) \{[\s\S]*?\n\}/, 'periodLabel')}
  ${grab(/function finRevenueDate\(j\) \{[\s\S]*?\n\}/, 'finRevenueDate')}
  return { finRange, periodLabel, finRevenueDate };
`)();

describe('finRange - month', () => {
  it('covers the whole month and stops at the 1st of the next', () => {
    const r = finRange('month', 8, 2026);
    expect(r.dateFrom).toBe('2026-08-01');
    expect(r.dateTo).toBe('2026-08-31');
    expect(r.rangeStart.getDate()).toBe(1);
    expect(r.rangeStart.getMonth()).toBe(7);
    expect(r.rangeEndExclusive.getDate()).toBe(1);
    expect(r.rangeEndExclusive.getMonth()).toBe(8);
  });

  it('gets February right, leap year included', () => {
    expect(finRange('month', 2, 2026).dateTo).toBe('2026-02-28');
    expect(finRange('month', 2, 2028).dateTo).toBe('2028-02-29');
  });

  it('rolls the year over in December', () => {
    const r = finRange('month', 12, 2026);
    expect(r.dateTo).toBe('2026-12-31');
    expect(r.rangeEndExclusive.getFullYear()).toBe(2027);
    expect(r.rangeEndExclusive.getMonth()).toBe(0);
  });

  it('builds the boundaries at LOCAL midnight, not UTC', () => {
    // The whole point: a job finished at 08:00 in Sydney is still the previous
    // day in UTC. Sending 'YYYY-MM-DD' to a timestamptz comparison would drop
    // it out of its own month.
    const r = finRange('month', 8, 2026);
    expect(r.rangeStart.getHours()).toBe(0);
    expect(r.rangeStart.getMinutes()).toBe(0);
  });
});

describe('finRange - quarter and year', () => {
  it('maps any month to its quarter', () => {
    expect(finRange('quarter', 1, 2026).dateFrom).toBe('2026-01-01');
    expect(finRange('quarter', 2, 2026).dateTo).toBe('2026-03-31');
    expect(finRange('quarter', 8, 2026).dateFrom).toBe('2026-07-01');
    expect(finRange('quarter', 8, 2026).dateTo).toBe('2026-09-30');
    expect(finRange('quarter', 12, 2026).dateFrom).toBe('2026-10-01');
  });

  it('covers the calendar year', () => {
    const r = finRange('year', 6, 2026);
    expect(r.dateFrom).toBe('2026-01-01');
    expect(r.dateTo).toBe('2026-12-31');
    expect(r.rangeEndExclusive.getFullYear()).toBe(2027);
  });
});

describe('finRevenueDate - the day the money belongs to', () => {
  it('uses completed_at, not the day it was booked in for', () => {
    // The case that produced two different figures for the same month: booked
    // for 31-Jul, finished 2-Aug. That is August revenue on both screens now.
    const j = {
      scheduled_date: '2026-07-31',
      completed_at: new Date(2026, 7, 2, 14, 30).toISOString(),
    };
    expect(finRevenueDate(j)).toBe('2026-08-02');
  });

  it('falls back to created_at for rows written before completed_at existed', () => {
    const j = { scheduled_date: '2026-07-31', completed_at: null, created_at: new Date(2026, 6, 30, 9, 0).toISOString() };
    expect(finRevenueDate(j)).toBe('2026-07-30');
  });

  it('falls back to scheduled_date rather than rendering an invalid date', () => {
    expect(finRevenueDate({ scheduled_date: '2026-07-31', completed_at: 'not a date' })).toBe(
      '2026-07-31'
    );
  });
});

describe('periodLabel', () => {
  it('names the period the way the screen already did', () => {
    expect(periodLabel('month', 8, 2026)).toBe('August 2026');
    expect(periodLabel('quarter', 8, 2026)).toBe('Q3 2026');
    expect(periodLabel('year', 8, 2026)).toBe('FY 2026');
  });
});

describe('a failed query is not a month without work', () => {
  const fn = grab(/async function loadFinance\(\) \{[\s\S]*?\n\}/, 'loadFinance');

  it('reads the query error and stops', () => {
    expect(fn).toMatch(/error: bookingsError/);
    expect(fn).toMatch(/if \(bookingsError\)/);
    expect(fn).toMatch(/showFinanceError\(bookingsError\.message/);
  });

  it('no longer filters the money by scheduled_date', () => {
    expect(fn).not.toMatch(/gte\('scheduled_date'/);
    expect(fn).toMatch(/completed_at\.gte\./);
  });

  it('the error state blanks the BAS instead of leaving zeros on it', () => {
    const err = grab(/function showFinanceError\(message, periodStr\) \{[\s\S]*?\n\}/, 'showFinanceError');
    expect(err).toMatch(/bas-g1/);
    expect(err).toMatch(/bas-net/);
    expect(err).toMatch(/window\._finData = null/);
  });
});
