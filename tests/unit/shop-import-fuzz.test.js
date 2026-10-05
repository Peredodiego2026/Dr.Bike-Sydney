// El lector de la planilla corre en el navegador de Admin sobre un archivo que
// elige Diego. Un .xlsx corrupto, un .csv raro o bytes al azar no pueden
// colgar la pagina: tienen que tirar un Error con mensaje (que Admin muestra),
// nunca un estado invalido ni un cuelgue.
import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import { readWorkbook, readCsv, diffCatalog, priceFor, costAud, DEFAULT_PRICING } from '../../js/shop-import.js';

const buf = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

describe('readWorkbook con archivos rotos', () => {
  const cases = {
    vacio: new Uint8Array(0),
    basura: new TextEncoder().encode('no soy un excel'),
    'basura larga': new Uint8Array(100000).fill(65),
    'firma EOCD falsa': (() => { const a = new Uint8Array(100); a[96] = 0x50; a[97] = 0x4b; a[98] = 0x05; a[99] = 0x06; return a; })(),
    'zip vacio': (() => { const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); return new Uint8Array(e); })(),
    'deflate corrupto': zlib.gzipSync(Buffer.from('x')),
  };
  for (const [name, data] of Object.entries(cases)) {
    it(`"${name}" tira un Error, no cuelga`, async () => {
      await expect(readWorkbook(buf(data instanceof Uint8Array ? data : new Uint8Array(data)))).rejects.toThrow();
    });
  }
});

describe('readCsv con texto raro', () => {
  const cases = ['', '\n\n\n', ',,,,', '"', '"""""', 'a;b;c', 'x'.repeat(100000), '\u0000\u0000', 'SKU,Price\n' + 'A,1\n'.repeat(50000)];
  for (const t of cases) {
    it(`no revienta con ${JSON.stringify(t.slice(0, 20))}`, () => {
      let out;
      expect(() => { try { out = readCsv(t); } catch (e) { if (!/code|price|found/i.test(e.message)) throw e; } }).not.toThrow();
      if (out) expect(Array.isArray(out)).toBe(true);
    });
  }
});

describe('diffCatalog con catalogos y filas raras', () => {
  const junk = [null, undefined, [], [null], [{ sku: null }], [{ sku: 'A', costUsd: 'x' }], [{ variants: null }]];
  for (const products of junk) {
    for (const rows of [[], [{ sku: 'A', costUsd: 1, name: 'x' }], null]) {
      it(`products=${JSON.stringify(products)} rows=${JSON.stringify(rows)}`, () => {
        expect(() => diffCatalog(products, rows || [], DEFAULT_PRICING)).not.toThrow();
      });
    }
  }
});

describe('priceFor / costAud con numeros extremos', () => {
  for (const n of [0, -1, NaN, Infinity, -Infinity, 1e99, 0.001, '5', null, undefined]) {
    it(`priceFor(${n}) devuelve null o un numero finito`, () => {
      const p = priceFor(n);
      expect(p === null || (Number.isFinite(p) && p >= 0)).toBe(true);
    });
  }
  it('reglas rotas no cuelgan', () => {
    for (const rules of [{}, { fx: 'x' }, { bands: null }, { bands: [], minPrice: 'x' }, { fx: 0, minPrice: 0, bands: [{ upTo: null, mult: 'x' }] }]) {
      expect(() => priceFor(costAud(10, rules), rules)).not.toThrow();
    }
  });
});
