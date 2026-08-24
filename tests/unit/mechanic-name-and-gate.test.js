// tests/unit/mechanic-name-and-gate.test.js — auditoria 2026-08-23.
//
// Dos bugs del app del mecanico:
//  4. checklistChanged()/submitComplete() buscaban el boton Complete por
//     `button[onclick^="submitComplete"]`, pero el boton es
//     data-action="submit-complete" (migrado off onclick por TASK-023). El
//     selector siempre daba null: el gate de "3 chequeos de seguridad" nunca
//     deshabilitaba nada y el estado "Saving..."/disabled no se aplicaba.
//  5. Seis lugares leian mechanic.first_name/.last_name, pero el server
//     (handleMechanic) solo devuelve un `name` combinado. Siempre undefined,
//     asi que el cliente veia "Your mechanic"/"Mechanic" en cada notificacion
//     y en el tab de Perfil.
//
// mechanic.js es script clasico (no importable). Se prueba por texto + se
// reconstruyen y ejecutan de verdad las funciones puras nuevas, mismo criterio
// que el resto de la suite (calDateStr, vanColor).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const mechjs = readFileSync(join(root, 'js', 'mechanic.js'), 'utf8');

// Reconstruye una funcion del fuente inyectando un `mechanic` controlable
// (las 3 helpers lo leen del scope de modulo).
function build(fnName, mechanicValue) {
  const m = mechjs.match(new RegExp(`function ${fnName}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
  if (!m) throw new Error(`${fnName} not found`);
  // eslint-disable-next-line no-new-func
  return new Function('mechanic', `${m[0]}\nreturn ${fnName}(arguments[1]);`).bind(
    null,
    mechanicValue
  );
}

describe('gate del Complete - los selectores ya no buscan un onclick inexistente', () => {
  it('ambos usos buscan el boton por data-action="submit-complete"', () => {
    const matches = mechjs.match(
      /#complete-modal button\[data-action="submit-complete"\]/g
    );
    expect(matches).toHaveLength(2); // checklistChanged + submitComplete
  });

  it('no queda ningun selector por onclick de submitComplete', () => {
    expect(mechjs).not.toMatch(/onclick[\^*]?="?submitComplete/);
  });
});

describe('nombre del mecanico - lee el `name` real que manda el server', () => {
  it('no queda ningun uso funcional de first_name/last_name', () => {
    // solo el comentario que explica el bug puede mencionarlos
    const noComments = mechjs
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(noComments).not.toMatch(/first_name/);
    expect(noComments).not.toMatch(/last_name/);
  });

  it('mechFullName devuelve el nombre completo, o el fallback si no hay', () => {
    expect(build('mechFullName', { name: 'Jordan Lee' })('X')).toBe('Jordan Lee');
    expect(build('mechFullName', {})('Mechanic')).toBe('Mechanic');
    expect(build('mechFullName', null)('Mechanic')).toBe('Mechanic');
  });

  it('mechFirstName toma solo el primer token', () => {
    expect(build('mechFirstName', { name: 'Jordan Lee' })('Your mechanic')).toBe('Jordan');
    expect(build('mechFirstName', { name: '' })('Your mechanic')).toBe('Your mechanic');
  });

  it('mechInitials arma iniciales, con M de fallback', () => {
    expect(build('mechInitials', { name: 'Jordan Lee' })()).toBe('JL');
    expect(build('mechInitials', { name: 'Solo' })()).toBe('S');
    expect(build('mechInitials', {})()).toBe('M');
  });
});
