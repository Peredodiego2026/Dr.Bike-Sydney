// tests/unit/analytics-margins.test.js — la tabla de margenes de Analytics leia
// `_partsPerJob`, una variable que SOLO escribe loadFinance(). Entrando derecho
// a Analytics valia 0, o sea coste $0 y 100% de margen en verde para todos los
// servicios (docs/PENDIENTES.md 20.1). Y si antes se habia abierto Finanzas,
// una tabla que es de toda la vida terminaba usando el ratio de un mes suelto.
//
// js/admin.js es un script clasico y no se puede importar: se levantan del
// fuente `expTotalsInRange` y `analyticsPartsPerJob` y se corren contra un
// `_expenses` inyectado - mismo enfoque que tests/unit/suburb-coord.test.js.
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

const build = new Function(
  '_expenses',
  `
  ${grab(/const EXPENSE_LABELS = \{[\s\S]*?\n\};/, 'EXPENSE_LABELS')}
  ${grab(/function expMonthsInRange\(dateFrom, dateTo\) \{[\s\S]*?\n\}/, 'expMonthsInRange')}
  ${grab(/function expTotalsInRange\(rows, dateFrom, dateTo\) \{[\s\S]*?\n\}/, 'expTotalsInRange')}
  ${grab(/function analyticsPartsPerJob\(completed\) \{[\s\S]*?\n\}/, 'analyticsPartsPerJob')}
  return analyticsPartsPerJob;
`
);

// analyticsMarginsByService (18.3) has no external state to inject - only
// anBookingRevenue as a dependency, so it is spliced in alongside it.
const marginsByService = new Function(
  `
  ${grab(/function anBookingRevenue\(b\) \{[\s\S]*?\n\}/, 'anBookingRevenue')}
  ${grab(/function analyticsMarginsByService\(completed, partsEstimate\) \{[\s\S]*?\n\}/, 'analyticsMarginsByService')}
  return analyticsMarginsByService;
`
)();

const jobs = (n) => Array.from({ length: n }, () => ({ status: 'completed' }));
const partsExpense = (amount, spent_on) => ({ amount, spent_on, category: 'parts' });
const job = (service_price, parts_cost_actual) => ({
  status: 'completed',
  service_name: 'Tune-Up',
  service_price,
  callout_fee: 0,
  parts_cost_actual: parts_cost_actual === undefined ? null : parts_cost_actual,
});
const notAvailable = { available: false };
const estimate = (perJob) => ({ available: true, perJob });

describe('analyticsPartsPerJob - sin datos no hay margen', () => {
  it('no inventa un coste cuando los gastos no se pudieron leer', () => {
    const fn = build({ available: false, reason: 'session expired' });
    expect(fn(jobs(10)).available).toBe(false);
  });

  it('no inventa un coste cuando no hay ningun gasto cargado', () => {
    expect(build({ available: true, expenses: [] })(jobs(10)).available).toBe(false);
  });

  it('no inventa un coste cuando hay gastos pero ninguno es de repuestos', () => {
    const fn = build({
      available: true,
      expenses: [{ amount: 400, spent_on: '2026-01-10', category: 'insurance' }],
    });
    expect(fn(jobs(10)).available).toBe(false);
  });

  it('no divide por cero cuando no hay trabajos completados', () => {
    const fn = build({ available: true, expenses: [partsExpense(500, '2026-01-10')] });
    const r = fn([]);
    expect(r.available).toBe(false);
    expect(r.perJob).toBeUndefined();
  });

  it('un `_expenses` que nunca se cargo no rompe', () => {
    expect(build(null)(jobs(3)).available).toBe(false);
    expect(build(undefined)(jobs(3)).available).toBe(false);
  });
});

describe('analyticsPartsPerJob - con datos', () => {
  it('reparte el gasto de repuestos entre los trabajos completados', () => {
    const fn = build({
      available: true,
      expenses: [partsExpense(300, '2026-01-10'), partsExpense(200, '2026-02-10')],
    });
    const r = fn(jobs(10));
    expect(r.available).toBe(true);
    expect(r.parts).toBe(500);
    expect(r.jobs).toBe(10);
    expect(r.perJob).toBe(50);
  });

  it('ignora las categorias que no son repuestos', () => {
    const fn = build({
      available: true,
      expenses: [
        partsExpense(300, '2026-01-10'),
        { amount: 9000, spent_on: '2026-01-10', category: 'payroll' },
      ],
    });
    expect(fn(jobs(6)).parts).toBe(300);
  });

  it('cuenta un gasto recurrente una vez por mes desde que empezo', () => {
    // Un abono mensual de repuestos que arranco en enero, mirado en un rango
    // que llega hasta hoy, no vale 100: vale 100 por cada mes corrido.
    const fn = build({
      available: true,
      expenses: [{ amount: 100, spent_on: '2026-01-15', category: 'parts', recurring_monthly: true }],
    });
    const r = fn(jobs(1));
    expect(r.available).toBe(true);
    // Al menos los meses de 2026 ya transcurridos - el numero exacto depende
    // del dia en que corran los tests, y lo que importa es que multiplique.
    expect(r.parts).toBeGreaterThanOrEqual(700);
  });
});

describe('analyticsMarginsByService - costo real por trabajo (18.3)', () => {
  it('measured: todos los trabajos tienen costo real, no toca el estimado', () => {
    const [row] = marginsByService([job(50, 10), job(60, 15)], notAvailable);
    expect(row.cost).toBe(25);
    expect(row.basis).toBe('measured');
    expect(row.realJobs).toBe(2);
  });

  it('estimated: ningun trabajo tiene costo real, usa el promedio plano', () => {
    const [row] = marginsByService([job(50), job(60)], estimate(20));
    expect(row.cost).toBe(40);
    expect(row.basis).toBe('estimated');
  });

  it('sin costo real y sin estimado disponible: cost null, no un cero inventado', () => {
    const [row] = marginsByService([job(50)], notAvailable);
    expect(row.cost).toBeNull();
  });

  it('mixed: combina costo real con el estimado para el resto', () => {
    const [row] = marginsByService([job(50, 10), job(60)], estimate(20));
    expect(row.cost).toBe(30); // 10 real + 1 trabajo x 20 estimado
    expect(row.basis).toBe('mixed');
    expect(row.realJobs).toBe(1);
  });

  it('partial: costo real parcial SIN estimado para el resto no debe inflar el margen', () => {
    // Antes de este caso, "mixed" se calculaba igual con o sin estimado
    // disponible - un trabajo con costo real y otro sin ningun dato caia en
    // "mixed" con un total que en silencio excluia el segundo trabajo, lo
    // que hacia parecer el margen mas sano de lo que en verdad se sabe.
    const [row] = marginsByService([job(50, 10), job(60)], notAvailable);
    expect(row.cost).toBe(10); // solo el conocido - un piso, no el total
    expect(row.basis).toBe('partial');
    expect(row.realJobs).toBe(1);
    expect(row.estJobs).toBe(1);
  });

  it('agrupa por servicio por separado', () => {
    const rows = marginsByService(
      [
        { ...job(50, 10), service_name: 'Tune-Up' },
        { ...job(80, 20), service_name: 'Brake Service' },
      ],
      notAvailable
    );
    expect(rows).toHaveLength(2);
    const tuneUp = rows.find((r) => r.name === 'Tune-Up');
    expect(tuneUp.jobs).toBe(1);
    expect(tuneUp.rev).toBe(50);
  });
});

describe('la tabla y el CSV usan la misma base', () => {
  it('renderMargins ya no lee _partsPerJob', () => {
    const fn = grab(/function renderMargins\(all\) \{[\s\S]*?\n\}/, 'renderMargins');
    expect(fn).not.toMatch(/_partsPerJob/);
    expect(fn).toMatch(/analyticsPartsPerJob\(completed\)/);
    expect(fn).toMatch(/analyticsMarginsByService\(completed, parts\)/);
  });

  it('sin datos, la columna Margen dice que faltan gastos en vez de un 100%', () => {
    // La disponibilidad ahora la decide analyticsMarginsByService (18.3) -
    // renderMargins solo lee su resultado (d.cost === null) y lo pinta.
    // Verificado arriba a nivel de comportamiento; aca solo se confirma que
    // el render sigue leyendo esa señal y sigue sin pintar un 100% falso.
    const fn = grab(/function renderMargins\(all\) \{[\s\S]*?\n\}/, 'renderMargins');
    expect(fn).toMatch(/if \(d\.cost === null\)/);
    expect(fn).toMatch(/Add expenses/);
  });

  it('el CSV calcula igual que la pantalla', () => {
    const fn = grab(/function exportAnalyticsCSV\(\) \{[\s\S]*?\n\}/, 'exportAnalyticsCSV');
    expect(fn).not.toMatch(/d\.jobs \* _partsPerJob/);
    expect(fn).toMatch(/analyticsPartsPerJob\(completed\)/);
  });

  it('loadAnalytics se trae los gastos por su cuenta', () => {
    const fn = grab(/async function loadAnalytics\(\) \{[\s\S]*?\n\}/, 'loadAnalytics');
    expect(fn).toMatch(/_expenses = await fetchExpenses\(\)/);
  });
});
