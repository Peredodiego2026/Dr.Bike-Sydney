// tests/unit/refund-notice.test.js
//
// Punto 8 de la auditoria: *"cobrar por ir e inspeccionar es legitimo.
// Verifica que se avise ANTES del boton de pago, no solo en los terminos, y que
// no choque con las garantias obligatorias de la ACL (que no se pueden excluir
// por contrato ni firmando)."*
//
// La primera mitad ya estaba: el aviso vive en la pantalla de resumen, arriba
// del boton. La segunda no.
//
// El texto decia, sin calificar: *"The visit & diagnosis covers that inspection
// and is not refunded."* Bajo la Australian Consumer Law las garantias del
// consumidor **no se pueden excluir por contrato**. Si la inspeccion no se hizo
// con el cuidado y la pericia debidos, el cliente tiene derecho a un remedio
// diga lo que diga la pantalla - y afirmar "no se reembolsa" a secas justo
// antes de un cobro es una afirmacion enganosa sobre sus derechos. Es un area
// que la ACCC persigue activamente.
//
// terms.html ya usaba la formula correcta ("except as required by Australian
// Consumer Law"). Lo que faltaba era ponerla donde el cliente la lee: en la
// pantalla, no en los terminos que nadie abre.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { dictSource, TRANSLATED } from '../helpers/i18n-source.js';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const app = read('js/app.js');
const terms = read('terms.html');

const ACL = 'This does not affect your rights under the Australian Consumer Law';

describe('el aviso llega antes de que se cobre', () => {
  // Una politica de no-reembolso solo es defendible si se dijo de antemano.
  it('el bloque de "que cubre la visita" esta antes del boton de pago', () => {
    const notice = app.indexOf('What the visit & diagnosis covers');
    const payBtn = app.indexOf('Pay $CALLOUT Visit & Diagnosis');
    expect(notice).toBeGreaterThan(-1);
    expect(payBtn).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(payBtn);
  });

  it('y dice explicitamente que la visita no se reembolsa', () => {
    expect(app).toContain('The visit & diagnosis covers that inspection and is not refunded.');
  });
});

describe('pero no se presenta como si excluyera la ley', () => {
  it('el calificador de la ACL esta en la misma pantalla', () => {
    expect(app).toContain(ACL);
  });

  // Ahi es donde tiene valor. En los terminos ya estaba y nadie los abre antes
  // de pagar.
  it('inmediatamente despues del "no se reembolsa", no en otra parte', () => {
    const noRefund = app.indexOf('and is not refunded.');
    const acl = app.indexOf(ACL);
    expect(acl).toBeGreaterThan(noRefund);
    expect(acl - noRefund).toBeLessThan(400);
  });

  it('dice que esos derechos no se pueden excluir', () => {
    expect(app).toContain('which cannot be excluded');
  });
});

describe('la misma formula que ya usaba el proyecto', () => {
  // No se invento un texto legal nuevo: terms.html ya calificaba asi sus
  // clausulas de no-reembolso, y usar dos formulas distintas para lo mismo es
  // como una queda desactualizada.
  it('terms.html ya reconoce que las garantias no se pueden excluir', () => {
    expect(terms).toMatch(/guarantees that cannot be excluded under the Australian Consumer Law/);
  });

  it('y ya califica su propia clausula de no-reembolso', () => {
    expect(terms).toMatch(/non-refundable[^<]*except as required by Australian Consumer Law/);
  });
});

describe('el aviso se lee en los tres idiomas', () => {
  // Un aviso legal que solo aparece en ingles no avisa a un cliente que esta
  // leyendo la app en espanol - y es justo el que mas lo necesita.
  for (const lang of TRANSLATED) {
    it(`${lang} tiene el calificador`, () => {
      expect(dictSource(lang)).toContain(ACL);
    });

    it(`${lang} tiene tambien el aviso principal`, () => {
      expect(dictSource(lang)).toContain('The visit & diagnosis covers that inspection');
    });
  }
});
