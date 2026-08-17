// tests/unit/booking-detail.test.js — antes de esto, clickear una reserva
// en el calendario (Month/Week/Day) o en el feed del Dashboard mandaba a la
// lista completa de Bookings, sin filtrar ni resaltar cual era - habia que
// buscarla de nuevo a mano. Y openReassign() (reasignar la van de una
// reserva) estaba completo en el codigo pero nada lo llamaba nunca: cero
// botones en toda la app abrian ese modal.
//
// js/admin.js es un script clasico - se verifica leyendo el archivo, mismo
// patron que availability-blocks.test.js y calendar-shows-blocks.test.js.

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

describe('vanColor - ejecutada de verdad, no solo buscada en el texto', () => {
  const colorsLine = grab(/const VAN_COLORS = \[[^\]]+\];/, 'VAN_COLORS');
  const fn = grab(/function vanColor\(vanNumber\) \{[\s\S]*?\n\}/, 'vanColor');
  const body = fn.replace(/^function vanColor\(vanNumber\) \{/, '').slice(0, -1);
  // eslint-disable-next-line no-new-func
  const vanColor = new Function('vanNumber', colorsLine + '\n' + body);

  it('van 1 y van 2 tienen colores distintos', () => {
    expect(vanColor(1)).not.toBe(vanColor(2));
  });

  it('no revienta con una van 3 o 4 que todavia no existe', () => {
    expect(typeof vanColor(3)).toBe('string');
    expect(typeof vanColor(4)).toBe('string');
  });

  it('van_number ausente no revienta (fallback a 1)', () => {
    expect(vanColor(undefined)).toBe(vanColor(1));
  });
});

describe('El calendario y el feed del dashboard abren la ficha, no la lista completa', () => {
  it('no queda ningun chip mandando a data-page="bookings"', () => {
    expect(admin).not.toMatch(/data-page="bookings"/);
  });

  it('Month, Week/Day y el feed del dashboard usan view-booking con el id real', () => {
    const hits = (admin.match(/data-action="view-booking" data-id="\$\{[^}]+\}"/g) || []).length;
    expect(hits).toBeGreaterThanOrEqual(3);
  });

  it('openBookingDetail busca primero en el cache, y si no esta lo trae de la base', () => {
    const fn = grab(/async function openBookingDetail\(id\) \{[\s\S]*?\n\}/, 'openBookingDetail');
    expect(fn).toMatch(/allBookings\.find/);
    expect(fn).toMatch(/\.from\('bookings'\)/);
    expect(fn).toMatch(/\.eq\('id', id\)/);
  });
});

describe('Reasignar van ya tiene quien lo llame', () => {
  it('openReassign ya no es codigo muerto', () => {
    expect((admin.match(/openReassign\(/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('el boton de reasignar de la ficha llama a bkd-reassign', () => {
    expect(admin).toMatch(/data-action="bkd-reassign"/);
    expect(admin).toMatch(/case 'bkd-reassign':\s*\n\s*closeBookingDetail\(\);\s*\n\s*openReassign\(d\.id\);/);
  });
});

describe('El click en un boton de accion de la fila no vuelve a abrir la ficha', () => {
  it('la fila de la tabla de bookings tiene su propio data-action', () => {
    expect(admin).toMatch(/<tr data-action="view-booking" data-id="\$\{b\.id\}"/);
  });

  it('el dispatcher generico se corta si el click vino de un boton data-bk-action', () => {
    const fn = grab(
      /document\.addEventListener\('click', function \(e\) \{\s*\n\s*const el = e\.target\.closest\('\[data-action\]'\);[\s\S]*?\n\}\);/,
      'delegated data-action listener'
    );
    expect(fn).toMatch(/if \(e\.target\.closest\('\[data-bk-action\]'\)\) return;/);
  });
});
