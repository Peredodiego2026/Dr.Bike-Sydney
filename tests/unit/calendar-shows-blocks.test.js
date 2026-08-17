// tests/unit/calendar-shows-blocks.test.js — dos fallas encontradas probando
// el item 21 en produccion el 17-ago-2026, despues de que 21.1-21.8 dejaran
// el guardado y el rechazo del lado del servidor funcionando de verdad
// (docs/PENDIENTES.md 21.8):
//
//   1. Ninguna vista del calendario (Month/Week/Day) consultaba `availability`
//      en absoluto. Bloquear un horario podia guardar perfecto y las tres
//      seguian mostrando el dia "Free", sin forma de distinguirlo de un dia
//      que nadie toco.
//   2. Prev/Next en Day view no navegaban nunca: loadCalendar() snapeaba
//      calWeekStart a la Monday de esa semana en TODAS las vistas, no solo
//      Week, deshaciendo el +-1 dia que calPrev()/calNext() acababan de
//      aplicar.
//
// js/admin.js es un script clasico, no un modulo - se verifica leyendo el
// codigo fuente, mismo patron que availability-blocks.test.js.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const admin = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'js', 'admin.js'),
  'utf8'
);

function grab(re, what) {
  const m = admin.match(re);
  if (!m) throw new Error(`${what} not found in js/admin.js`);
  return m[0];
}

describe('el calendario del admin ahora lee availability', () => {
  it('las 3 vistas la consultan (2 antes de esto: saveBlocks + unblockDate)', () => {
    expect((admin.match(/\.from\('availability'\)/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it('Month view filtra bloqueos por dia', () => {
    const fn = grab(/async function loadCalendar\(\) \{[\s\S]*/, 'loadCalendar');
    expect(fn).toMatch(/blockRows\.filter\(\(b\) => b\.date === dateStr\)/);
  });

  it('Month view pinta un badge cuando el dia tiene bloqueos', () => {
    expect(admin).toMatch(/dayBlocks\.length\s*\n\s*\? `<div class="cal-block-badge"/);
  });

  it('el badge lleva el tooltip con cada horario, van y motivo - sin onclick', () => {
    expect(admin).toMatch(/class="cal-block-tooltip"/);
    expect(admin).toMatch(/class="cal-block-tooltip-time"/);
    expect(admin).not.toMatch(/cal-block-badge[^`]*onclick/);
    expect(admin).not.toMatch(/cal-block-badge[^`]*onmouseover/);
  });

  it('Week/Day view lista los horarios bloqueados con su van y motivo', () => {
    expect(admin).toMatch(/dayBlocks\s*\n\s*\.map\(/);
    expect(admin).toMatch(/b\.van_number \? 'Van ' \+ b\.van_number : 'All vans'/);
  });

  it('"Free" solo aparece cuando el dia no tiene NI jobs NI bloqueos', () => {
    expect(admin).toMatch(/dayJobs\.length === 0 && dayBlocks\.length === 0/);
  });
});

describe('calDateStr - fechas locales, sin pasar por UTC', () => {
  // .toISOString() convierte a UTC primero. Sydney es UTC+10/11: la
  // medianoche local cae en el dia UTC ANTERIOR, asi que una celda
  // construida con `new Date(y, m, day)` (siempre medianoche local exacta)
  // hacia matchear reservas y bloqueos un dia antes de lo que mostraba en
  // pantalla - "20" mostraba lo que era del 19 (docs/PENDIENTES.md 21.11).
  // Comprobado ejecutando la funcion de verdad, no solo el texto: se extrae
  // del archivo tal cual esta, no se reescribe a mano.
  const fn = grab(/function calDateStr\(d\) \{[\s\S]*?\n\}/, 'calDateStr');
  // eslint-disable-next-line no-new-func
  const calDateStr = new Function('d', fn.replace(/^function calDateStr\(d\) \{/, '').slice(0, -1));

  it('lee los campos locales, no los convierte a UTC', () => {
    // Medianoche local: en cualquier timezone con offset positivo (como
    // Sydney), .toISOString() la habria mandado al dia anterior.
    expect(calDateStr(new Date(2026, 7, 20, 0, 0, 0))).toBe('2026-08-20');
  });

  it('pad de mes y dia de un digito', () => {
    expect(calDateStr(new Date(2026, 0, 5, 0, 0, 0))).toBe('2026-01-05');
  });

  it('loadCalendar ya no usa toISOString para fechas de calendario', () => {
    // Acotado al cuerpo real de la funcion, no "hasta el final del archivo" -
    // el resto de admin.js SI usa toISOString para timestamps (created_at,
    // cash_settled_at), eso no es el bug y no hay que tocarlo.
    const fnLoad = grab(
      /async function loadCalendar\(\) \{[\s\S]*?\n\/\/ ── ADMIN CHAT/,
      'loadCalendar'
    );
    expect(fnLoad).not.toMatch(/toISOString/);
    expect((fnLoad.match(/calDateStr\(/g) || []).length).toBeGreaterThanOrEqual(6);
  });
});

describe('Prev/Next en Day view - el snap a lunes solo aplica a Week', () => {
  it('loadCalendar ya no fuerza startOfWeek fuera de la vista semanal', () => {
    expect(admin).toMatch(
      /if \(calView === 'week'\) calWeekStart = startOfWeek\(new Date\(calWeekStart\)\)/
    );
    // La version vieja lo hacia incondicional - si volviera a aparecer sin
    // el guard, Day queda pegado otra vez.
    expect(admin).not.toMatch(
      /\/\/ Set week start to Monday\n\s*calWeekStart = startOfWeek\(new Date\(calWeekStart\)\);/
    );
  });

  it('calPrev/calNext siguen llamando a loadCalendar (si no, el guard de arriba no alcanza)', () => {
    const prevFn = grab(/function calPrev\(\) \{[\s\S]*?\n\}/, 'calPrev');
    const nextFn = grab(/function calNext\(\) \{[\s\S]*?\n\}/, 'calNext');
    expect(prevFn).toMatch(/loadCalendar\(\);/);
    expect(nextFn).toMatch(/loadCalendar\(\);/);
  });
});
