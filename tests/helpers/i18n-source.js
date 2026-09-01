// tests/helpers/i18n-source.js — leer un diccionario por idioma.
//
// Los diccionarios salieron de js/i18n.js a un archivo por idioma el
// 2026-09-01: los tres viajaban a todos los visitantes, asi que alguien
// leyendo la app en ingles se bajaba 164 KB de espanol y chino para no usarlos
// nunca.
//
// Antes cada test recortaba js/i18n.js entre `  es: {` y `  zh: {`. Ese recorte
// no era solo feo: recortar hasta el final del archivo hacia que el bloque `es`
// contuviera el `zh`, y una cadena traducida SOLO al chino satisfacia tambien
// la afirmacion del espanol. Paso de verdad (docs/PENDIENTES.md 66) y se
// encontro borrando una traduccion a proposito.
//
// Con un archivo por idioma no hay nada que recortar, asi que no hay forma de
// equivocarse. Este helper existe para que ningun test vuelva a inventar el
// recorte.
import fs from 'node:fs';

/** El texto fuente del diccionario de un idioma. */
export function dictSource(lang) {
  return fs.readFileSync(new URL(`../../js/i18n-${lang}.js`, import.meta.url), 'utf8');
}

/** El diccionario ya parseado, para comparar claves y valores de verdad. */
export async function dict(lang) {
  const mod = await import(new URL(`../../js/i18n-${lang}.js`, import.meta.url));
  return mod.default;
}

/** Los idiomas que tienen diccionario. El ingles no: las claves SON el ingles. */
export const TRANSLATED = ['es', 'zh'];

/**
 * Los dos diccionarios en un solo texto, con los marcadores `  es: {` y
 * `  zh: {` que los parsers del proyecto esperan (scripts/lib/dict-keys.mjs
 * entre otros).
 *
 * Existe para que la composicion viva en UN lugar. Repetida en cada test se
 * desincroniza: la primera version no llevaba el salto de linea inicial que
 * dictBlock() busca (`\n  es: {`), y diez archivos habrian arrastrado el mismo
 * error.
 *
 * El aislamiento entre idiomas ahora es estructural: el contenido de `es`
 * termina donde empieza el archivo de `zh`, asi que un recorte no puede
 * cruzarse de idioma como pasaba antes (PENDIENTES 66).
 */
export function composedSource() {
  return ['', '  es: {', dictSource('es'), '  zh: {', dictSource('zh'), '};'].join('\n');
}
