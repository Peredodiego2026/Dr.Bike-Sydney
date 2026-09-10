// api/_review-stats.js — los dos contadores de resenas, sin red.
//
// Puros a proposito: la aritmetica y, sobre todo, LO QUE SE DESCARTA se pueden
// probar sin base de datos. La parte que importa aca no es el promedio, es que
// nunca salga un numero inventado a la pagina: el bloque de Google lo escribe
// Diego a mano, y un `4,9` con coma, un `6` o un `-2` tienen que desaparecer,
// no llegar a la landing.
//
// La regla en las dos funciones es la misma: **sin dato, no hay numero**.
// Devuelven `null` y la pagina no dibuja nada. Un cero o un promedio viejo
// haciendose pasar por actual es peor que no decir nada.

/** Un promedio a un decimal: 4.85 -> "4.9". Devuelto como texto para que la pagina no tenga que formatear. */
function average(nums) {
  const sum = nums.reduce((a, b) => a + b, 0);
  // toFixed y no Math.round(x*10)/10: 5 tiene que salir "5.0", no "5".
  return (sum / nums.length).toFixed(1);
}

/**
 * Las resenas de la app, calculadas sobre las notas que devolvio la base.
 *
 * Filtra lo que no sea una nota de 1 a 5 antes de promediar. PostgREST devuelve
 * numeros como texto tan seguido como numeros, y una fila con `client_rating`
 * corrupto arrastraria el promedio de todos.
 */
export function reviewStats(ratings) {
  const clean = (Array.isArray(ratings) ? ratings : [])
    .map((r) => Number(r))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
  if (!clean.length) return { rating: null, count: 0 };
  return { rating: average(clean), count: clean.length };
}

/**
 * Los numeros de la ficha de Google, tal como los escribio Diego en Admin.
 *
 * Los dos son independientes: si carga la cantidad y todavia no el promedio,
 * sale la cantidad sola. Lo que no pase la validacion sale `null`, nunca un
 * valor a medias.
 */
export function googleStats(rawRating, rawCount) {
  // Un campo vacio se normaliza a `null` ANTES de tocar Number(), porque
  // `Number('')` y `Number(null)` son 0 - no NaN. Sin esto, un campo que Diego
  // nunca lleno salia por la API como `count: 0`, que es un dato distinto:
  // "todavia no lo cargue" no es "tengo cero resenas". La pagina igual no lo
  // dibujaba (0 es falsy), asi que era invisible desde afuera y solo aparecio
  // al probar el caso del campo vacio.
  const blank = (v) => v === null || v === undefined || String(v).trim() === '';

  const r = blank(rawRating) ? NaN : Number(String(rawRating).replace(',', '.'));
  const c = blank(rawCount) ? NaN : Number(rawCount);
  return {
    // 0 no es un promedio valido: significa "sin cargar", no "cero estrellas".
    rating: Number.isFinite(r) && r > 0 && r <= 5 ? r.toFixed(1) : null,
    // 0 SI es una cantidad valida - un negocio puede tener cero resenas - pero
    // la pagina no la dibuja, porque "0 resenas" no es prueba social.
    count: Number.isInteger(c) && c >= 0 ? c : null,
  };
}
