// api/_triage-ids.js is a copy of ALL_QUESTION_IDS (js/triage-questions.js), kept
// in api/ so that api/auth.js imports nothing from js/ - see the header of that
// file for why. A copy is only safe with a control tying it to the original, and
// this is the control: it imports BOTH, which is fine here because it runs in
// Node, not in the Vercel bundle.
//
// What each side of a mismatch costs:
//   - an id in the catalogue but not in api/: the client asks the question, the
//     server silently drops the answer, the mechanic never sees it.
//   - an id in api/ but not in the catalogue: harmless today, but it is a dead
//     key the server would accept for a question nobody asks.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TRIAGE_QUESTION_IDS } from '../../api/_triage-ids.js';
import { ALL_QUESTION_IDS } from '../../js/triage-questions.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('api/_triage-ids.js sigue al catalogo', () => {
  it('tiene los mismos ids que js/triage-questions.js', () => {
    const server = new Set(TRIAGE_QUESTION_IDS);
    const catalogue = new Set(ALL_QUESTION_IDS);
    const missing = [...catalogue].filter((id) => !server.has(id));
    const extra = [...server].filter((id) => !catalogue.has(id));
    expect(
      { missing, extra },
      'agregar a api/_triage-ids.js los de "missing" y sacar los de "extra"'
    ).toEqual({ missing: [], extra: [] });
  });

  it('no repite ningun id', () => {
    expect(new Set(TRIAGE_QUESTION_IDS).size).toBe(TRIAGE_QUESTION_IDS.length);
  });
});

describe('api/ no depende de js/', () => {
  // Si un import de js/ no resolviera en Vercel, api/auth.js dejaria de cargar
  // entero: el login del admin, el del mecanico y todas las reservas. La copia
  // de arriba existe para que esto no pase; esto es para que nadie la "limpie".
  it('ningun archivo de api/ importa nada de js/', () => {
    const offenders = readdirSync(join(root, 'api'))
      .filter((f) => f.endsWith('.js'))
      .filter((f) =>
        /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"][^'"]*\/js\//.test(
          readFileSync(join(root, 'api', f), 'utf8')
        )
      );
    expect(offenders).toEqual([]);
  });
});
