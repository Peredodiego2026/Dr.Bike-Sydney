// tests/unit/finance-parts.test.js - Finanzas > Parts & stock (commit 5 del
// inventario, 24-oct-2026). Lo vendido en el periodo sale de la foto de cada
// trabajo (parts_charged.items contra parts_cost_actual); el stock, de
// invStockValuation(), la misma funcion que usan los KPIs de Inventario.
//
// js/admin.js es un script clasico y no se puede importar: las dos funciones
// puras se levantan del fuente y se corren, como en finance-range.test.js.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', '..', 'js/admin.js'), 'utf8');

const grab = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error(`${what} not found in js/admin.js`);
  return m[0];
};

const { finPartsSold, invStockValuation } = new Function(`
  ${grab(/function finPartsSold\(jobs\) \{[\s\S]*?\n\}/, 'finPartsSold')}
  ${grab(/function invStockValuation\(parts\) \{[\s\S]*?\n\}/, 'invStockValuation')}
  return { finPartsSold, invStockValuation };
`)();

const tube = (qty, price = 15) => ({
  id: 't',
  name: 'Tube',
  qty,
  unit_price: price,
  total: qty * price,
});
const job = (items, cost) => ({ parts_charged: { items }, parts_cost_actual: cost });

describe('finPartsSold', () => {
  it('margin is what clients paid for parts minus what they cost', () => {
    const s = finPartsSold([job([tube(2)], 4), job([tube(1)], 2)]);
    expect(s.charged).toBe(45);
    expect(s.cost).toBe(6);
    expect(s.margin).toBe(39);
    expect(s.units).toBe(3);
    expect(s.jobs).toBe(2);
  });

  it('jobs with no parts are not counted', () => {
    const s = finPartsSold([
      { parts_charged: null, parts_cost_actual: null },
      job([], 0),
      { parts_charged: { items: [] }, parts_cost_actual: null },
    ]);
    expect(s.jobs).toBe(0);
    expect(s.totalCharged).toBe(0);
  });

  it('a job with parts charged but no cost recorded is kept out of the margin, never priced at $0', () => {
    const s = finPartsSold([job([tube(2)], 4), job([tube(3)], null)]);
    expect(s.margin).toBe(26); // only the costed job
    expect(s.uncosted).toBe(1);
    expect(s.uncostedCharged).toBe(45);
    expect(s.totalCharged).toBe(75); // what the parts note reports as missing from revenue
  });

  it('a part fitted at no charge still costs - the margin goes down', () => {
    const s = finPartsSold([job([tube(1, 0)], 8)]);
    expect(s.charged).toBe(0);
    expect(s.cost).toBe(8);
    expect(s.margin).toBe(-8);
    expect(s.jobs).toBe(1);
  });

  it('reads money that comes back from postgres as strings, and falls back to qty x unit_price', () => {
    const s = finPartsSold([
      job([{ qty: '2', unit_price: '15', total: '30' }], '4.00'),
      job([{ qty: 1, unit_price: 25 }], '8'),
    ]);
    expect(s.charged).toBe(55);
    expect(s.cost).toBe(12);
  });

  it('ignores lines with no quantity', () => {
    const s = finPartsSold([job([tube(0), { qty: -1, total: 99 }, tube(1)], 2)]);
    expect(s.units).toBe(1);
    expect(s.charged).toBe(15);
  });
});

describe('invStockValuation', () => {
  const parts = [
    { stock: 61, cost_price: 2, sell_price: 15, active: true },
    { stock: 3, cost_price: 8, sell_price: null, active: true }, // no client price yet
    { stock: 2, cost_price: 10, sell_price: 30, active: false }, // deactivated, still in the van
  ];

  it('values every unit at cost, inactive parts included', () => {
    expect(invStockValuation(parts).cost).toBe(61 * 2 + 3 * 8 + 2 * 10);
    expect(invStockValuation(parts).units).toBe(66);
  });

  it('client price and margin only cover parts that have a client price', () => {
    const v = invStockValuation(parts);
    expect(v.sell).toBe(61 * 15 + 2 * 30);
    expect(v.margin).toBe(61 * 13 + 2 * 20);
    expect(v.priced).toBe(2);
  });

  it('the 61 Duro tubes: $122 on the shelf, $915 at client price', () => {
    const v = invStockValuation([{ stock: 61, cost_price: 2, sell_price: 15 }]);
    expect([v.cost, v.sell, v.margin]).toEqual([122, 915, 793]);
  });

  it('an empty list is all zeros', () => {
    expect(invStockValuation([])).toEqual({ cost: 0, sell: 0, margin: 0, units: 0, priced: 0 });
  });
});

describe('wiring', () => {
  it('Finance renders the card from the jobs it already loaded', () => {
    expect(src).toMatch(
      /const partsSold = finPartsSold\(jobs\);\s*renderFinanceParts\(partsSold, periodStr\);/
    );
  });
  it('Inventory KPIs and Finance read the same valuation', () => {
    expect(src).toMatch(/const v = invStockValuation\(inventoryData\);/);
    expect(src).toMatch(/const v = invStockValuation\(parts \|\| \[\]\);/);
  });
});
