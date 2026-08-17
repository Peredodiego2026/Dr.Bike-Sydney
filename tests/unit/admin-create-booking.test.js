// tests/unit/admin-create-booking.test.js — docs/PENDIENTES.md 25.5, item 5
// de la lista pedida por Diego. Antes de esto la unica forma de que existiera
// una reserva era que el cliente pagara online con la wizard - un cliente
// que llama por telefono no tenia como entrar al sistema.
//
// handleAdminCreateBooking hace fetch()/DB real - se prueba por texto, mismo
// criterio que el resto de este archivo (rescheduleBookingCore, etc): la
// logica sin red que YA tiene sus propios tests (isSlotBlocked, matchVanZone)
// no se vuelve a probar aca, solo que esta funcion las use.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const authjs = readFileSync(join(root, 'api', 'auth.js'), 'utf8');
const adminjs = readFileSync(join(root, 'js', 'admin.js'), 'utf8');
const adminhtml = readFileSync(join(root, 'admin.html'), 'utf8');

function grab(src, re, what) {
  const m = src.match(re);
  if (!m) throw new Error(`${what} not found`);
  return m[0];
}

describe('handleAdminCreateBooking - server', () => {
  const fn = grab(
    authjs,
    /async function handleAdminCreateBooking\(req, res\) \{[\s\S]*?\r?\n\}\r?\n\r?\n\/\/ ── Admin: Expenses/,
    'handleAdminCreateBooking'
  );

  it('autenticado como admin, mismo patron que el resto de admin-*', () => {
    expect(fn).toMatch(/verifyAdminSession\(access_token, SERVICE_KEY\)/);
  });

  it('el precio sale del catalogo, nunca se acepta un precio del body', () => {
    expect(fn).not.toMatch(/service_price\s*[,:]\s*(req\.body|price)\b/);
    expect(fn).toMatch(/applySurcharge\(Number\(svc\.price\)/);
  });

  it('resuelve la van con matchVanZone, o respeta un override explicito', () => {
    expect(fn).toMatch(/matchVanZone\(auth\.sb, address\)/);
    expect(fn).toMatch(/van_number \? Number\(van_number\)/);
  });

  it('chequea isSlotBlocked antes de insertar - no se salta la regla de 21.8/25.4', () => {
    expect(fn).toMatch(/isSlotBlocked\(blockRows, vanNumber, scheduled_time, neededMin\)/);
  });

  it('status confirmed, sin stripe_payment_intent_id - el mecanico cobra al terminar', () => {
    expect(fn).toMatch(/status: 'confirmed'/);
    expect(fn).not.toMatch(/stripe_payment_intent_id/);
  });

  it('manda confirmacion por email solo si hay email, y no bloquea la respuesta si falla', () => {
    expect(fn).toMatch(/if \(booking\.client_email\)/);
    expect(fn).toMatch(/\.catch\(\(e\) => console\.error/);
  });

  it('esta registrada en el dispatcher', () => {
    expect(authjs).toMatch(/role === 'admin-create-booking'/);
  });
});

describe('UI: boton + modal + envio', () => {
  it('el boton "New booking" esta en la pagina de Bookings', () => {
    expect(adminhtml).toMatch(/data-action="open-admin-create-booking"/);
  });

  it('el modal carga los servicios reales, no una lista escrita a mano', () => {
    const fn = grab(
      adminjs,
      /async function openAdminCreateBooking\(\) \{[\s\S]*?\n\}/,
      'openAdminCreateBooking'
    );
    expect(fn).toMatch(/\.from\('services'\)/);
  });

  it('submitAdminCreateBooking llama al rol correcto con el access_token de admin', () => {
    const fn = grab(
      adminjs,
      /async function submitAdminCreateBooking\(\) \{[\s\S]*?\n\}/,
      'submitAdminCreateBooking'
    );
    expect(fn).toMatch(/role: 'admin-create-booking'/);
    expect(fn).toMatch(/adminAccessToken\(\)/);
  });
});
