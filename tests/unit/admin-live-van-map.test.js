// tests/unit/admin-live-van-map.test.js — docs/PENDIENTES.md 25.6, ultimo
// item de la lista pedida por Diego. El admin no tenia ninguna vista de
// "donde estan mis vans ahora" - el cliente si, por reserva individual
// (track.html), pero nadie junta las 2 vans en un solo mapa para el admin.
//
// mechanic_locations solo tenia policy de RLS para el cliente con una
// reserva activa (harden-security-2026-07-17.sql) - nunca para el admin.
// Mismo patron de bug que 21.7 (availability sin policies), mismo arreglo:
// una policy mas via SQL que corre Diego, no una IA.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const adminjs = readFileSync(join(root, 'js', 'admin.js'), 'utf8');
const sql = readFileSync(
  join(root, 'scripts', 'add-mechanic-locations-admin-select.sql'),
  'utf8'
);

function grab(src, re, what) {
  const m = src.match(re);
  if (!m) throw new Error(`${what} not found`);
  return m[0];
}

describe('renderVanLocations - una posicion por van, la mas reciente', () => {
  const fn = grab(
    adminjs,
    /async function renderVanLocations\(\) \{[\s\S]*?\r?\n\}/,
    'renderVanLocations'
  );

  it('pide la tabla ordenada por updated_at desc - el reduce de abajo depende de este orden', () => {
    expect(fn).toMatch(/order\('updated_at', \{ ascending: false \}\)/);
  });

  it('se queda con la PRIMERA fila que ve por van_number (la mas nueva, no un promedio ni la ultima)', () => {
    expect(fn).toMatch(/if \(!\(row\.van_number in latestByVan\)\) latestByVan\[row\.van_number\] = row;/);
  });

  it('un error de lectura se loguea, no se traga en silencio', () => {
    expect(fn).toMatch(/console\.error\('\[admin\] mechanic_locations read failed:', error\.message\)/);
  });

  it('marca a una van sin ping reciente como no-en-vivo, no la esconde', () => {
    expect(fn).toMatch(/staleAfterMin = 15/);
    expect(fn).toMatch(/opacity:\$\{stale \? 0\.45 : 1\}/);
  });

  it('usa el mismo VAN_COLORS que los pines de trabajo del mismo mapa', () => {
    expect(fn).toMatch(/VAN_COLORS\[v\.van_number\]/);
  });
});

describe('subscribeVanLocations - un solo canal para toda la vida de la pagina', () => {
  it('no vuelve a suscribirse si ya hay un canal abierto', () => {
    const fn = grab(
      adminjs,
      /function subscribeVanLocations\(\) \{[\s\S]*?\r?\n\}/,
      'subscribeVanLocations'
    );
    expect(fn).toMatch(/if \(_vanLocChannel\) return;/);
    expect(fn).toMatch(/table: 'mechanic_locations'/);
  });

  it('renderRouteMap() la llama junto con el render de posiciones - no queda huerfana', () => {
    expect(adminjs).toMatch(/renderVanLocations\(\);\s*\r?\n\s*subscribeVanLocations\(\);/);
  });
});

describe('SQL: policy de admin en mechanic_locations', () => {
  it('crea exactamente la policy que el runbook y los tests de arriba esperan', () => {
    expect(sql).toMatch(/create policy mechanic_locations_admin_select on public\.mechanic_locations/);
    expect(sql).toMatch(/p\.role = 'admin'/);
  });

  it('es idempotente (drop if exists antes del create)', () => {
    expect(sql).toMatch(/drop policy if exists mechanic_locations_admin_select/);
  });

  it('esta en el runbook, no solo en scripts/', () => {
    const runbook = readFileSync(join(root, 'docs', 'RUNBOOK-SQL.md'), 'utf8');
    expect(runbook).toMatch(/add-mechanic-locations-admin-select\.sql/);
  });
});
