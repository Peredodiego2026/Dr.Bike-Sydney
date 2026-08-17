// tests/unit/availability-blocks.test.js — el boton "Block availability" del
// admin nunca bloqueo nada (docs/PENDIENTES.md 21). Tres fallas encadenadas:
//
//   1. escribia una columna `blocked` que no existe -> 42703, 0 filas guardadas
//   2. aunque escribiera, el lector comparaba `time_slot` ('8:30', 24h, media
//      hora) contra las etiquetas de ALL_SLOTS ('8:00 AM'): ningun string
//      coincidia nunca
//   3. y el lector ignoraba `van_number`, asi que un bloqueo de una van habria
//      tapado las dos
//
// Estos tests cubren el lado servidor: los bloqueos se convierten en intervalos
// ocupados, igual que las reservas, asi que un bloqueo de media hora choca con
// el trabajo que seguiria corriendo encima.
// Run: npm test

import { describe, it, expect } from 'vitest';
import {
  buildBlockIntervals,
  computeAvailableSlots,
  isSlotBlocked,
  BLOCK_SLOT_MIN,
  SLOT_BUFFER_MIN,
} from '../../api/auth.js';

const ALL_SLOTS = ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM'];

const offer = ({
  vans = [1],
  busyIntervals = [],
  blockIntervals = [],
  neededMin = 60 + SLOT_BUFFER_MIN,
} = {}) =>
  Object.fromEntries(
    computeAvailableSlots({
      allSlots: ALL_SLOTS,
      vans,
      busyIntervals,
      neededMin,
      blockIntervals,
      isToday: false,
      nowMin: 0,
    }).map((s) => [s.time, s.available])
  );

describe('buildBlockIntervals', () => {
  it('lee el formato 24h de media hora que escribe el admin', () => {
    const iv = buildBlockIntervals(
      [{ time_slot: '8:30', available: false, van_number: 1 }],
      [1, 2]
    );
    expect(iv).toEqual([{ van: 1, start: 510, end: 510 + BLOCK_SLOT_MIN }]);
  });

  it('van_number 0 saca a TODAS las vans', () => {
    const iv = buildBlockIntervals(
      [{ time_slot: '9:00', available: false, van_number: 0 }],
      [1, 2]
    );
    expect(iv.map((x) => x.van).sort()).toEqual([1, 2]);
  });

  it('una fila sin van tambien saca a todas, en vez de no sacar a ninguna', () => {
    const iv = buildBlockIntervals(
      [{ time_slot: '9:00', available: false, van_number: null }],
      [1, 2]
    );
    expect(iv).toHaveLength(2);
  });

  it('ignora las filas disponibles y las horas ilegibles', () => {
    expect(
      buildBlockIntervals(
        [
          { time_slot: '9:00', available: true, van_number: 1 },
          { time_slot: 'medianoche', available: false, van_number: 1 },
          { time_slot: null, available: false, van_number: 1 },
        ],
        [1]
      )
    ).toEqual([]);
  });

  it('no rompe con overrides vacios o ausentes', () => {
    expect(buildBlockIntervals([], [1])).toEqual([]);
    expect(buildBlockIntervals(null, [1])).toEqual([]);
  });
});

describe('un bloqueo saca el horario de la oferta', () => {
  it('bloquear las 9:00 con una sola van cierra las 9:00', () => {
    const blocks = buildBlockIntervals(
      [{ time_slot: '9:00', available: false, van_number: 1 }],
      [1]
    );
    const slots = offer({ blockIntervals: blocks });
    expect(slots['9:00 AM']).toBe(false);
    expect(slots['10:00 AM']).toBe(true);
  });

  it('un bloqueo de media hora choca con el trabajo que seguiria corriendo', () => {
    // 8:30 bloqueado: el trabajo de las 8:00 dura hasta pasadas las 9:00, asi
    // que pisa el bloqueo y las 8:00 no se pueden ofrecer. El de las 9:00 si:
    // arranca cuando el bloqueo ya termino.
    const blocks = buildBlockIntervals(
      [{ time_slot: '8:30', available: false, van_number: 1 }],
      [1]
    );
    const slots = offer({ blockIntervals: blocks });
    expect(slots['8:00 AM']).toBe(false);
    expect(slots['9:00 AM']).toBe(true);
  });

  it('bloquear una van deja la otra trabajando', () => {
    const blocks = buildBlockIntervals(
      [{ time_slot: '9:00', available: false, van_number: 1 }],
      [1, 2]
    );
    expect(offer({ vans: [1, 2], blockIntervals: blocks })['9:00 AM']).toBe(true);
  });

  it('bloquear todas las vans cierra el horario aunque haya dos', () => {
    const blocks = buildBlockIntervals(
      [{ time_slot: '9:00', available: false, van_number: 0 }],
      [1, 2]
    );
    expect(offer({ vans: [1, 2], blockIntervals: blocks })['9:00 AM']).toBe(false);
  });

  it('bloquear la van 1 y tener la 2 ocupada cierra el horario', () => {
    const blocks = buildBlockIntervals(
      [{ time_slot: '9:00', available: false, van_number: 1 }],
      [1, 2]
    );
    const busy = [{ van: 2, start: 540, end: 540 + 60 + SLOT_BUFFER_MIN }];
    expect(offer({ vans: [1, 2], busyIntervals: busy, blockIntervals: blocks })['9:00 AM']).toBe(
      false
    );
  });

  it('sin bloqueos, el dia sigue abierto', () => {
    const slots = offer({});
    expect(Object.values(slots).every(Boolean)).toBe(true);
  });
});

describe('isSlotBlocked - lo que usa handleCreateBooking, no solo la lista', () => {
  // computeAvailableSlots contesta "¿hay AL MENOS UNA van libre?" - correcto
  // para la lista que ve el cliente, pero handleCreateBooking ya sabe a QUE
  // van pertenece la direccion (matchVanZone), asi que necesita la respuesta
  // para esa unica van. Antes de esto nada llamaba a esta pregunta: el bloqueo
  // solo tapaba la lista, nunca impedia la reserva en si (PENDIENTES 21.8).
  const rows = [{ time_slot: '9:00', available: false, van_number: 1 }];
  const neededMin = 60 + SLOT_BUFFER_MIN;

  it('la van bloqueada no puede reservarse', () => {
    expect(isSlotBlocked(rows, 1, '9:00 AM', neededMin)).toBe(true);
  });

  it('otra van, sin bloqueo propio, si puede - aunque la 1 este cerrada', () => {
    expect(isSlotBlocked(rows, 2, '9:00 AM', neededMin)).toBe(false);
  });

  it('van_number 0 (todas) bloquea cualquier van que se pregunte', () => {
    const allVans = [{ time_slot: '9:00', available: false, van_number: 0 }];
    expect(isSlotBlocked(allVans, 1, '9:00 AM', neededMin)).toBe(true);
    expect(isSlotBlocked(allVans, 2, '9:00 AM', neededMin)).toBe(true);
  });

  it('un bloqueo de media hora choca con el trabajo que seguiria corriendo', () => {
    const halfHour = [{ time_slot: '8:30', available: false, van_number: 1 }];
    expect(isSlotBlocked(halfHour, 1, '8:00 AM', neededMin)).toBe(true);
    expect(isSlotBlocked(halfHour, 1, '9:00 AM', neededMin)).toBe(false);
  });

  it('sin filas bloqueadas, no bloquea nada', () => {
    expect(isSlotBlocked([], 1, '9:00 AM', neededMin)).toBe(false);
    expect(isSlotBlocked(null, 1, '9:00 AM', neededMin)).toBe(false);
  });

  it('ignora las filas con available:true', () => {
    const open = [{ time_slot: '9:00', available: true, van_number: 1 }];
    expect(isSlotBlocked(open, 1, '9:00 AM', neededMin)).toBe(false);
  });
});

describe('el panel escribe lo que el lector lee', () => {
  // El fuente del admin, porque js/admin.js es un script clasico y no se puede
  // importar. Sin esto, el lado servidor puede estar perfecto y el boton
  // seguir guardando en una columna que no existe.
  const src = readAdmin();

  it('saveBlocks escribe available:false, no la columna inexistente', () => {
    const fn = grabAdmin(/async function saveBlocks\(\) \{[\s\S]*?\n\}/, 'saveBlocks');
    expect(fn).toMatch(/available: false/);
    expect(fn).not.toMatch(/blocked: true/);
  });

  it('saveBlocks usa 0 para "todas las vans", no null', () => {
    const fn = grabAdmin(/async function saveBlocks\(\) \{[\s\S]*?\n\}/, 'saveBlocks');
    expect(fn).toMatch(/van_number: van \|\| 0/);
  });

  it('unblockDate filtra por la misma columna', () => {
    const fn = grabAdmin(/async function unblockDate\(\) \{[\s\S]*?\n\}/, 'unblockDate');
    expect(fn).toMatch(/\.eq\('available', false\)/);
    expect(fn).not.toMatch(/'blocked'/);
  });

  it('el servidor pide van_number, sin el no puede respetar el bloqueo por van', () => {
    expect(src.server).toMatch(/select\('time_slot, available, van_number'\)/);
  });
});

// ── helpers ─────────────────────────────────────────────────────────────────
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

function readAdmin() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  return {
    admin: readFileSync(join(root, 'js/admin.js'), 'utf8'),
    server: readFileSync(join(root, 'api/auth.js'), 'utf8'),
  };
}

function grabAdmin(re, what) {
  const m = readAdmin().admin.match(re);
  if (!m) throw new Error(`${what} not found in js/admin.js`);
  return m[0];
}
