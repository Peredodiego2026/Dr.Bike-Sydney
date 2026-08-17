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
    expect(admin).toMatch(/dayBlocks\.length \? `<div[\s\S]*?blocked/);
  });

  it('Week/Day view lista los horarios bloqueados con su van y motivo', () => {
    expect(admin).toMatch(/dayBlocks\s*\n\s*\.map\(/);
    expect(admin).toMatch(/b\.van_number \? 'Van ' \+ b\.van_number : 'All vans'/);
  });

  it('"Free" solo aparece cuando el dia no tiene NI jobs NI bloqueos', () => {
    expect(admin).toMatch(/dayJobs\.length === 0 && dayBlocks\.length === 0/);
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
