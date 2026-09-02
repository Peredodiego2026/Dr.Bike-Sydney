// scripts/html-attrs-check.mjs - falla si alguna etiqueta repite un atributo.
//
// Run: npm run attrs:check   (y va dentro de npm run check, asi que el
// quality-gate de CI bloquea el merge)
//
// POR QUE EXISTE
//
// El 2026-09-02 se rompio el logo de las TRES superficies de cliente a la vez -
// index.html, landing.html y track.html - y estuvo asi en produccion hasta que
// Diego lo vio. La etiqueta habia quedado:
//
//   <img width="600" height="423" src="images/logo-db.png" height="36">
//
// El HTML se queda con el PRIMER atributo y descarta el segundo **sin decir
// nada**: no hay error de consola, no hay warning, no falla ningun build. El
// logo paso a medir 423px de alto en vez de 36, y con `style="width:auto"` se
// estiro a 600px de ancho, tapando media pagina.
//
// Lo genero un script que agregaba `width`/`height` a las imagenes que no
// tenian `width`. El logo tenia `height` pero no `width`, asi que paso el
// filtro y termino con dos `height`.
//
// Y el test que acompanaba ese cambio no lo agarro: leia el primer `height=`
// de la etiqueta - 423 - y 600/423 es exactamente la proporcion real del
// archivo, asi que la comprobacion de proporcion pasaba en verde sobre una
// pagina rota. El test verificaba la suposicion de quien lo escribio en vez de
// verificar el efecto.
//
// Un atributo repetido nunca es intencional. Por eso esto es un error y no un
// aviso.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', '.vercel', '.look', 'coverage', 'dist']);

function htmlFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(full, out);
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}

// Solo la etiqueta de apertura, y sin mirar dentro de comillas: un atributo
// como style="background:url(a.png)" no debe confundir al buscador de nombres.
function duplicateAttrs(tag) {
  const seen = new Map();
  // Se recorre la etiqueta saltando el contenido entre comillas.
  const body = tag.slice(1, -1);
  let i = 0;
  while (i < body.length) {
    const m = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("|')/.exec(body.slice(i));
    if (!m) break;
    const at = i + m.index;
    const name = m[1].toLowerCase();
    const quote = m[2];
    const valStart = at + m[0].length;
    const valEnd = body.indexOf(quote, valStart);
    if (valEnd === -1) break;
    seen.set(name, (seen.get(name) || 0) + 1);
    i = valEnd + 1;
  }
  return [...seen].filter(([, n]) => n > 1);
}

let bad = 0;
let checked = 0;

for (const file of htmlFiles(ROOT)) {
  const html = fs.readFileSync(file, 'utf8');
  checked++;
  for (const m of html.matchAll(/<[a-zA-Z][^>]*>/g)) {
    const tag = m[0];
    // Los comentarios y las declaraciones no son etiquetas con atributos.
    if (tag.startsWith('<!')) continue;
    const dupes = duplicateAttrs(tag);
    if (!dupes.length) continue;
    bad++;
    const line = html.slice(0, m.index).split('\n').length;
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    console.error(
      `x ${rel}:${line}  atributo repetido: ${dupes.map(([k, n]) => `${k} x${n}`).join(', ')}`
    );
    console.error(`    ${tag.replace(/\s+/g, ' ').slice(0, 170)}`);
  }
}

if (bad) {
  console.error('');
  console.error(`${bad} etiqueta(s) repiten un atributo en ${checked} paginas.`);
  console.error('El navegador se queda con el PRIMERO y descarta el resto en silencio,');
  console.error('asi que el codigo dice una cosa y la pagina hace otra. Dejar uno solo.');
  process.exit(1);
}

console.log(`✓ html-attrs-check: ninguna etiqueta repite atributos (${checked} paginas)`);
