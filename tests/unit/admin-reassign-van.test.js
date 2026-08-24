// tests/unit/admin-reassign-van.test.js — auditoria 2026-08-23.
//
// El boton "Reassign van" (docs/PENDIENTES.md 25.2) escribia directo a
// `bookings` desde el navegador con `sb.from('bookings').update(...)` sin
// chequear el resultado: en una denegacion de RLS o un choque de
// bookings_unique_slot la fila no se movia pero la UI igual decia
// "Reassigned ✓". Tampoco chequeaba isSlotBlocked para la van destino, a
// diferencia de reschedule/create-booking. Ahora pasa por
// handleAdminReassignVan, mismo patron server-side que el resto de admin-*.
//
// Hace fetch()/DB real, se prueba por texto (mismo criterio que
// admin-reschedule.test.js): las piezas sin red (isSlotBlocked) ya tienen
// sus tests de ejecucion propios en availability-blocks.test.js.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const authjs = readFileSync(join(root, 'api', 'auth.js'), 'utf8');
const adminjs = readFileSync(join(root, 'js', 'admin.js'), 'utf8');

function grab(src, re, what) {
  const m = src.match(re);
  if (!m) throw new Error(`${what} not found`);
  return m[0];
}

describe('handleAdminReassignVan - server', () => {
  const fn = grab(
    authjs,
    /async function handleAdminReassignVan\(req, res\) \{[\s\S]*?\n\}/,
    'handleAdminReassignVan'
  );

  it('autenticado como admin, mismo patron que el resto de admin-*', () => {
    expect(fn).toMatch(/verifyAdminSession\(access_token, SERVICE_KEY\)/);
  });

  it('chequea isSlotBlocked para la van DESTINO antes de mover - lo que la version vieja del browser nunca hizo', () => {
    expect(fn).toMatch(/isSlotBlocked\(blockRows, vanNum, bk\.scheduled_time, neededMin\)/);
  });

  it('maneja el choque de bookings_unique_slot (23505) en vez de un falso "ok"', () => {
    expect(fn).toMatch(/updErr\.code === '23505'/);
  });

  it('reporta el error real de la escritura, no un exito ciego', () => {
    expect(fn).toMatch(/if \(updErr\)/);
    expect(fn).toMatch(/Failed to reassign van/);
  });

  it('esta registrada en el dispatcher', () => {
    expect(authjs).toMatch(/role === 'admin-reassign-van'/);
  });
});

describe('doReassign (browser) - ya no escribe directo ni miente sobre el resultado', () => {
  const fn = grab(adminjs, /async function doReassign\(vanNum\) \{[\s\S]*?\n\}/, 'doReassign');

  it('llama al rol server-side en vez de sb.from(bookings).update directo', () => {
    expect(fn).toMatch(/role: 'admin-reassign-van'/);
    expect(fn).not.toMatch(/sb\.from\('bookings'\)\.update/);
  });

  it('solo dice "Reassigned ✓" si la respuesta fue ok', () => {
    expect(fn).toMatch(/if \(!resp\.ok\) throw new Error/);
    expect(fn).toMatch(/showToast\('Error: '/);
  });
});
