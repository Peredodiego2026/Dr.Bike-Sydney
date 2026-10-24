// La migracion del triage (scripts/add-triage-columns.sql).
//
// Los primeros cuatro tests son los del plan, tal cual. Los dos de abajo cierran
// lo que esos cuatro no alcanzan a probar:
//   - el regex del primer test busca `ADD COLUMN IF NOT EXISTS\s+triage`, y
//     `triage_photo_ref` lo cumple tambien: pasa aunque la columna `triage`
//     NO exista, y no mira el tipo de ninguna.
//   - nada impide colar las columnas de la cola de revision (entregable 2).
// Las migraciones aca se corren a mano; un .sql que no dice lo que el codigo
// espera es una columna que falta el dia que el servidor la nombra.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('scripts/add-triage-columns.sql', () => {
  it('la migración agrega las tres columnas del triage', () => {
    const sql = read('scripts/add-triage-columns.sql');
    for (const col of ['triage', 'triage_photo_ref', 'triage_video_ref']) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}`, 'i'));
    }
  });

  it('es idempotente: se puede correr dos veces', () => {
    expect(read('scripts/add-triage-columns.sql')).not.toMatch(
      /ADD COLUMN(?!\s+IF NOT EXISTS)/i
    );
  });

  // Referencia, no URL - mismo patron que api/_job-photos.js.
  it('guarda referencias, no URLs', () => {
    const sql = read('scripts/add-triage-columns.sql');
    expect(sql).not.toMatch(/photo_url|video_url/);
  });

  it('el runbook la nombra, para que alguien la corra', () => {
    expect(read('docs/RUNBOOK-SQL.md')).toContain('add-triage-columns.sql');
  });

  it('cada columna tiene el tipo que el resto del plan espera', () => {
    const sql = read('scripts/add-triage-columns.sql');
    // `\b` al final: sin el, `triage\s+jsonb` tambien casaria dentro de otro nombre.
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS\s+triage\s+jsonb\b/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS\s+triage_photo_ref\s+text\b/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS\s+triage_video_ref\s+text\b/i);
  });

  it('no trae las columnas de la cola de revision, que son del entregable 2', () => {
    const sql = read('scripts/add-triage-columns.sql');
    for (const col of ['review_state', 'reviewed_at', 'review_note']) {
      expect(sql).not.toMatch(new RegExp(`ADD COLUMN[^;]*${col}`, 'i'));
    }
  });
});

describe('docs/RUNBOOK-SQL.md', () => {
  it('la consulta de la seccion 3 pregunta por las tres columnas', () => {
    // scripts/migrations-check.mjs solo exige que el NOMBRE DEL ARCHIVO este en
    // la consulta; una fila que nombra el script y verifica otra cosa lo
    // dejaria pasar. Este test mira lo que la fila afirma.
    const runbook = read('docs/RUNBOOK-SQL.md');
    const start = runbook.indexOf('chk(n, script, que_agrega, ok)');
    const query = runbook.slice(start, runbook.indexOf('```', start));
    const at = query.indexOf("'add-triage-columns.sql'");
    expect(at, 'la consulta no tiene fila para add-triage-columns.sql').toBeGreaterThan(-1);
    // Desde el nombre del script hasta el siguiente `union all` o el cierre.
    const next = query.indexOf('union all', at);
    const row = query.slice(at, next < 0 ? query.length : next);
    for (const col of ['triage', 'triage_photo_ref', 'triage_video_ref']) {
      expect(row, `la fila no verifica ${col}`).toContain(`'${col}'`);
    }
  });
});
