// tests/unit/ltv-identity.test.js — tres defectos de la misma familia, todos
// "el dato se agrupa por el campo que casualmente este lleno":
//
//   18.2  LTV contaba dos veces a quien reservo como invitado y con cuenta, y
//         juntaba todo lo no identificable en un cliente falso llamado "Client"
//   18.1  la lista de suburbios agrupaba por el texto crudo del campo, sin
//         normalizar y sin mirar nunca la direccion, mientras el heatmap justo
//         debajo si la miraba
//   20.7  los CSV se podian abrir como formula en Excel, y el de Finanzas ni
//         siquiera entrecomillaba
//
// js/admin.js es un script clasico y no se puede importar: se levantan las
// funciones del fuente - mismo enfoque que tests/unit/suburb-coord.test.js.
// Run: npm test

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const src = readFileSync(join(root, 'js/admin.js'), 'utf8');

const grab = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error(`${what} not found in js/admin.js`);
  return m[0];
};

const { ltvClientKey, suburbLabel, csvCell, csvRow } = new Function(`
  ${grab(/const SUBURB_COORDS = \{[\s\S]*?\n\};/, 'SUBURB_COORDS')}
  ${grab(/const CITY_WIDE = new Set\(\[[^\]]*\]\);/, 'CITY_WIDE')}
  ${grab(/const SUBURB_MATCHERS = Object\.keys\(SUBURB_COORDS\)[\s\S]*?\n\s*\}\)\);/, 'SUBURB_MATCHERS')}
  ${grab(/function suburbNameFromText\(text\) \{[\s\S]*?\n\}/, 'suburbNameFromText')}
  ${grab(/function suburbLabel\(b\) \{[\s\S]*?\n\}/, 'suburbLabel')}
  ${grab(/function ltvClientKey\(b\) \{[\s\S]*?\n\}/, 'ltvClientKey')}
  ${grab(/function csvCell\(value\) \{[\s\S]*?\n\}/, 'csvCell')}
  ${grab(/const csvRow = \(cells\) => cells\.map\(csvCell\)\.join\(','\);/, 'csvRow')}
  return { ltvClientKey, suburbLabel, csvCell, csvRow };
`)();

describe('ltvClientKey - un cliente es un email', () => {
  it('une la reserva de invitado con la de la cuenta', () => {
    // El caso exacto de 18.2: la misma persona, dos reservas, dos caminos.
    const asGuest = { client_email: 'Thais@example.com' };
    const signedIn = { client_id: 'uuid-1', profiles: { email: 'thais@example.com' } };
    expect(ltvClientKey(asGuest)).toBe(ltvClientKey(signedIn));
  });

  it('normaliza mayusculas y espacios', () => {
    expect(ltvClientKey({ client_email: '  ANA@Example.COM ' })).toBe('email:ana@example.com');
  });

  it('usa client_id solo cuando no hay email', () => {
    expect(ltvClientKey({ client_id: 'uuid-9' })).toBe('id:uuid-9');
  });

  it('el email gana al client_id, para que las dos reservas caigan juntas', () => {
    expect(ltvClientKey({ client_id: 'uuid-9', client_email: 'a@b.com' })).toBe('email:a@b.com');
  });

  it('sin email y sin cuenta no es un cliente, es null', () => {
    // Antes esto caia en la clave literal 'unknown': un cliente inventado que
    // acumulaba la facturacion de todos ellos.
    expect(ltvClientKey({ client_name: 'Walk-in' })).toBeNull();
    expect(ltvClientKey({})).toBeNull();
    expect(ltvClientKey({ client_email: '   ' })).toBeNull();
  });

  it('dos personas distintas siguen siendo dos', () => {
    expect(ltvClientKey({ client_email: 'a@b.com' })).not.toBe(
      ltvClientKey({ client_email: 'c@d.com' })
    );
  });
});

describe('suburbLabel - la lista agrupa como el mapa', () => {
  it('junta las tres grafias del mismo suburbio', () => {
    const labels = ['Pyrmont', 'pyrmont', 'PYRMONT'].map((suburb) => suburbLabel({ suburb }));
    expect(new Set(labels).size).toBe(1);
    expect(labels[0]).toBe('Pyrmont');
  });

  it('lee la direccion cuando el campo esta vacio', () => {
    // La reserva de Thais: el heatmap la ubicaba y la lista la contaba como
    // "no registrado".
    expect(
      suburbLabel({ suburb: '', address: 'The Palladium 102 Miller Street, Pyrmont, Sydney' })
    ).toBe('Pyrmont');
  });

  it('pone en mayusculas cada palabra del nombre', () => {
    expect(suburbLabel({ suburb: 'bondi beach' })).toBe('Bondi Beach');
    expect(suburbLabel({ suburb: 'north sydney' })).toBe('North Sydney');
  });

  it('devuelve null solo cuando de verdad no se sabe donde fue', () => {
    expect(suburbLabel({ suburb: '', address: '' })).toBeNull();
    expect(suburbLabel({ suburb: '', address: '742 Evergreen Terrace, Springfield' })).toBeNull();
  });

  it('hereda la regla del suburbio mas cercano al final', () => {
    expect(suburbLabel({ suburb: '', address: '123 Parramatta Rd, Ashfield NSW 2131' })).toBe(
      'Ashfield'
    );
  });
});

describe('csvCell - el CSV no ejecuta nada al abrirse', () => {
  it('desarma las cuatro cabeceras de formula', () => {
    expect(csvCell('=1+1')).toBe('"\'=1+1"');
    expect(csvCell('+SUM(A1)')).toBe('"\'+SUM(A1)"');
    expect(csvCell('-2+3')).toBe('"\'-2+3"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
  });

  it('deja en paz un texto normal', () => {
    expect(csvCell('Tune-Up')).toBe('"Tune-Up"');
    expect(csvCell(199)).toBe('"199"');
  });

  it('entrecomilla las comas, que es lo que el CSV de Finanzas no hacia', () => {
    // Un cliente "Smith, John" corria una columna todo lo que venia despues.
    expect(csvRow(['Smith, John', 199])).toBe('"Smith, John","199"');
  });

  it('duplica las comillas internas', () => {
    expect(csvCell('El "Rapido"')).toBe('"El ""Rapido"""');
  });

  it('null y undefined salen vacios, no como la palabra null', () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });
});

describe('las tres reglas son una sola en toda la pantalla', () => {
  it('el CSV de LTV usa ltvClientKey', () => {
    const fn = grab(/function exportAnalyticsCSV\(\) \{[\s\S]*?\n\}/, 'exportAnalyticsCSV');
    expect(fn).toMatch(/ltvClientKey\(b\)/);
    expect(fn).not.toMatch(/\|\| 'unknown'/);
  });

  it('el CSV de suburbios usa suburbLabel', () => {
    const fn = grab(/function exportAnalyticsCSV\(\) \{[\s\S]*?\n\}/, 'exportAnalyticsCSV');
    expect(fn).toMatch(/suburbLabel\(b\)/);
  });

  it('la retencion de 6 meses cuenta clientes con la misma identidad', () => {
    const fn = grab(/function renderTargetMetrics\(all\) \{[\s\S]*?\n\}/, 'renderTargetMetrics');
    expect(fn).toMatch(/ltvClientKey\(b\)/);
    expect(fn).not.toMatch(/const clientKey = /);
  });

  it('los tres exportadores pasan por csvRow', () => {
    expect(src.match(/rows\.map\(csvRow\)/g) || []).toHaveLength(2);
    expect(src).toMatch(/csvRow\(Array\.from\(r\.querySelectorAll\('td'\)\)/);
  });
});
