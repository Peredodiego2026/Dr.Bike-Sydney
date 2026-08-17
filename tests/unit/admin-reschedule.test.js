// tests/unit/admin-reschedule.test.js — docs/PENDIENTES.md 25.4. Antes de
// esto solo el cliente podia mover su propia reserva; no habia forma de
// reprogramar desde el admin en absoluto. De paso: ni el reschedule del
// cliente ni el nuevo del admin consultaban availability antes de mover una
// reserva - el mismo agujero que 21.8 cerro para reservas NUEVAS
// (handleCreateBooking) seguia abierto para mover una YA EXISTENTE.
//
// rescheduleBookingCore() hace fetch() real, asi que se prueba por texto
// (que llama a isSlotBlocked, que usa verifyAdminSession, etc.) en vez de
// mockear la red entera - mismo criterio que el resto del archivo: solo se
// extraen a funciones puras y se ejecutan de verdad las piezas sin red
// (isSlotBlocked ya tiene sus tests propios en availability-blocks.test.js).

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

describe('rescheduleBookingCore - compartido por cliente y admin', () => {
  const core = grab(
    authjs,
    /async function rescheduleBookingCore\([\s\S]*?\n\}/,
    'rescheduleBookingCore'
  );

  it('chequea isSlotBlocked antes de mover la reserva - el agujero que 21.8 no cerro aca', () => {
    expect(core).toMatch(/isSlotBlocked\(blockRows, Number\(bk\.van_number\)/);
  });

  it('sigue protegiendo contra el choque de bookings_unique_slot (23505)', () => {
    expect(core).toMatch(/errBody\.code === '23505'/);
  });

  it('handleClientReschedule y handleAdminReschedule usan la misma funcion', () => {
    expect((authjs.match(/rescheduleBookingCore\(/g) || []).length).toBeGreaterThanOrEqual(3); // definicion + 2 llamados
  });
});

describe('handleAdminReschedule - autenticado como admin, no como el dueño', () => {
  const fn = grab(
    authjs,
    /async function handleAdminReschedule\(req, res\) \{[\s\S]*?\n\}/,
    'handleAdminReschedule'
  );

  it('usa verifyAdminSession, el mismo patron que el resto de admin-*', () => {
    expect(fn).toMatch(/verifyAdminSession\(access_token, SERVICE_KEY\)/);
  });

  it('no filtra por client_id - un admin puede mover cualquier reserva', () => {
    expect(fn).not.toMatch(/client_id/);
  });

  it('esta registrada en el dispatcher', () => {
    expect(authjs).toMatch(/role === 'admin-reschedule'/);
  });
});

describe('UI del admin: boton Reschedule + modal', () => {
  it('la fila de la tabla de bookings tiene el boton', () => {
    expect(adminjs).toMatch(/data-bk-action="reschedule"/);
  });

  it('submitAdminReschedule llama al rol correcto', () => {
    const fn = grab(
      adminjs,
      /async function submitAdminReschedule\(\) \{[\s\S]*?\n\}/,
      'submitAdminReschedule'
    );
    expect(fn).toMatch(/role: 'admin-reschedule'/);
    expect(fn).toMatch(/adminAccessToken\(\)/);
  });
});
