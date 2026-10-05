// js/shop-import.js: leer la lista de LEBYCLE, poner precios con las reglas y
// compararla con la tienda. El .xlsx de prueba se arma aca mismo (un zip con
// hojas comprimidas, una "foto" guardada sin comprimir, celdas que se cierran
// solas y texto en linea) para no depender de un archivo de 43 MB.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { DEFAULT_PRICING, priceFor, costAud, readWorkbook, readCsv, diffCatalog } from '../../js/shop-import.js';

function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name);
    const data = Buffer.from(f.data);
    const comp = f.store ? data : zlib.deflateRawSync(data);
    const method = f.store ? 0 : 8;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...locals, cd, eocd]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
}

const shared = ['NO.', 'Product Model', 'Product Image', 'Product Name', 'Wholesale Price', 'TS-RS-09', '维修架-09 Repair Stand', 'BP-LE**-RP', '刹车片 Disc Brake Pads'];
const sst = '<sst>' + shared.map((s) => `<si><t>${s.replace(/&/g, '&amp;')}</t></si>`).join('') + '</sst>';
const c = (ref, i) => `<c r="${ref}" t="s"><v>${i}</v></c>`;
const sheet1 =
  '<worksheet><sheetData>' +
  `<row r="1">${c('A1', 0)}${c('B1', 1)}${c('C1', 2)}${c('D1', 3)}${c('E1', 4)}</row>` +
  // C2 se cierra sola: si el lector la tomara como celda, correria las demas.
  `<row r="2"><c r="A2"><v>1</v></c>${c('B2', 5)}<c r="C2" s="46"/>${c('D2', 6)}<c r="E2"><v>21</v></c></row>` +
  `<row r="3"><c r="A3"><v>2</v></c>${c('B3', 7)}<c r="C3" s="46"/>${c('D3', 8)}<c r="E3"><v>0.62</v></c></row>` +
  // Una fila sin precio no cuenta.
  `<row r="4"><c r="A4"><v>3</v></c><c r="B4" t="inlineStr"><is><t>NO-PRICE</t></is></c></row>` +
  '</sheetData></worksheet>';
// Encabezados en chino, como la hoja "Cycling Gear" de LEBYCLE: 产品型号 y 品名.
const ist = (ref, t) => `<c r="${ref}" t="inlineStr"><is><t>${t}</t></is></c>`;
const sheet2 =
  '<worksheet><sheetData>' +
  `<row r="1">${c('A1', 0)}${ist('B1', '产品型号')}${ist('D1', '品名')}${c('E1', 4)}</row>` +
  `<row r="2"><c r="A2"><v>1</v></c><c r="B2" t="inlineStr"><is><t>MS-GR03-50</t></is></c><c r="D2" t="inlineStr"><is><t>界面脂-50g Assembling Paste</t></is></c><c r="E2"><v>3.3</v></c></row>` +
  '</sheetData></worksheet>';
const workbook =
  '<workbook xmlns:r="r"><sheets><sheet name="Tools" sheetId="1" r:id="rId1"/><sheet name="Maintenance" sheetId="2" r:id="rId2"/></sheets></workbook>';
const rels =
  '<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="ws" Target="worksheets/sheet2.xml"/></Relationships>';
const XLSX = () =>
  zip([
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: rels },
    { name: 'xl/sharedStrings.xml', data: sst },
    { name: 'xl/worksheets/sheet1.xml', data: sheet1 },
    { name: 'xl/worksheets/sheet2.xml', data: sheet2 },
    { name: 'xl/media/image1.png', data: Buffer.alloc(200000, 7), store: true },
  ]);

describe('las reglas de precio', () => {
  it('son las mismas con que se armo el catalogo', () => {
    // 0.62 USD -> 0.89 AUD -> x3.5 -> 3.12 -> 3.95 -> el minimo 4.95
    expect(priceFor(costAud(0.62))).toBe(4.95);
    // 21 USD -> 30.14 AUD -> banda de hasta 80, x2.7 -> 81.38 -> 81.95
    expect(costAud(21)).toBe(30.14);
    expect(priceFor(30.14)).toBe(81.95);
    // 100 AUD -> x1.6 -> 160 -> 159.95
    expect(priceFor(100)).toBe(159.95);
  });

  it('las cambia Diego: otra tasa, otra banda, otro minimo', () => {
    const rules = { fx: 1.5, minPrice: 9.95, bands: [{ upTo: null, mult: 2 }] };
    expect(costAud(10, rules)).toBe(15);
    expect(priceFor(15, rules)).toBe(29.95);
    expect(priceFor(2, rules)).toBe(9.95);
  });

  it('un costo vacio o cero no tiene precio sugerido', () => {
    expect(priceFor(0)).toBeNull();
    expect(priceFor(NaN)).toBeNull();
  });
});

describe('el .xlsx', () => {
  it('lee codigo, nombre en ingles y precio de todas las hojas', async () => {
    const rows = await readWorkbook(XLSX());
    expect(rows).toEqual([
      { sku: 'TS-RS-09', name: 'Repair Stand', costUsd: 21, sheet: 'Tools' },
      { sku: 'BP-LE**-RP', name: 'Disc Brake Pads', costUsd: 0.62, sheet: 'Tools' },
      { sku: 'MS-GR03-50', name: 'g Assembling Paste', costUsd: 3.3, sheet: 'Maintenance' },
    ]);
  });

  it('un archivo que no es un xlsx se rechaza con un mensaje claro', async () => {
    const bad = new TextEncoder().encode('hola, esto no es un excel').buffer;
    await expect(readWorkbook(bad)).rejects.toThrow(/not an Excel workbook/);
  });

  const REAL = 'C:/Users/Usuario/Downloads/LEBYCLE Wholesale Price List (2).xlsx';
  it.skipIf(!fs.existsSync(REAL))('la planilla real de LEBYCLE: 1020 codigos, 5 hojas', async () => {
    const b = fs.readFileSync(REAL);
    const rows = await readWorkbook(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    expect(rows.length).toBe(1020);
    expect(new Set(rows.map((r) => r.sheet)).size).toBe(5);
    expect(rows.find((r) => r.sku === 'TS-RS-09').costUsd).toBe(21);
  }, 60000);
});

describe('el .csv', () => {
  it('con comas, comillas y separador ;', () => {
    expect(readCsv('Product Model,Wholesale Price\nTS-RS-09,21\n"BP-LE**-RP","0.62"\n')).toEqual([
      { sku: 'TS-RS-09', name: '', costUsd: 21, sheet: 'CSV' },
      { sku: 'BP-LE**-RP', name: '', costUsd: 0.62, sheet: 'CSV' },
    ]);
    expect(readCsv('SKU;Name;Price\nA-1;"Pads; resin";3,5\n')[0]).toMatchObject({ sku: 'A-1', name: 'Pads; resin', costUsd: 35 });
  });

  it('sin columnas de codigo y precio se rechaza', () => {
    expect(() => readCsv('foo,bar\n1,2')).toThrow(/code/);
  });
});

describe('comparar con la tienda', () => {
  const products = [
    { slug: 'stand', name: 'Repair Stand', variants: [{ sku: 'TS-RS-09', label: 'Standard', price: 81.95, cost: 30.14, stock: null }] },
    { slug: 'pads', name: 'Brake Pads', variants: [{ sku: 'BP-1', label: 'Resin', price: 9.95, cost: 1, stock: null }, { sku: 'BP-OLD', label: 'Old', price: 9.95, cost: 1, stock: null }] },
  ];
  const rows = [
    { sku: 'TS-RS-09', name: 'Repair Stand', costUsd: 21, sheet: 'Tools' },
    { sku: 'BP-1', name: 'Pads', costUsd: 2, sheet: 'Parts' },
    { sku: 'NEW-9', name: 'Chain', costUsd: 5, sheet: 'Parts' },
  ];

  it('separa lo que cambio, lo nuevo, lo que ya no esta y lo igual', () => {
    const d = diffCatalog(products, rows);
    expect(d.same).toBe(1);
    expect(d.changed).toEqual([
      { sku: 'BP-1', slug: 'pads', product: 'Brake Pads', option: 'Resin', oldCost: 1, newCost: 2.87, price: 9.95, suggested: 10.95 },
    ]);
    expect(d.added).toEqual([{ sku: 'NEW-9', name: 'Chain', sheet: 'Parts', newCost: 7.18, suggested: 25.95 }]);
    expect(d.missing.map((m) => m.sku)).toEqual(['BP-OLD']);
  });

  it('usa las reglas que se le pasan', () => {
    const d = diffCatalog(products, rows, { ...DEFAULT_PRICING, fx: 2 });
    expect(d.changed.map((x) => x.sku).sort()).toEqual(['BP-1', 'TS-RS-09']);
  });
});
