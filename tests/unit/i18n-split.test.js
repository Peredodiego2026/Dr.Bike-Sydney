// tests/unit/i18n-split.test.js
//
// Punto 10 de la auditoria. Decia que js/app.js pesa 295 KB y que el cliente se
// baja "el asistente entero, el mapa, Stripe y el chat antes de ver un precio".
// Medido contra produccion el 2026-09-01, tres de esas cuatro cosas eran
// falsas: Vercel comprime (app.js viaja en 78 KB, no 295), Stripe se carga
// recien en el pago (js/stripe.js) y el mapa recien al abrir el seguimiento.
//
// Lo que la auditoria no vio: js/i18n.js viajaba en 64 KB - casi tanto como
// toda la app - y llevaba LOS TRES idiomas a TODOS los visitantes. Alguien
// leyendo la app en ingles se bajaba 164 KB de espanol y chino que no iba a
// usar nunca, y translateValue() ni siquiera consulta el diccionario cuando el
// idioma es ingles: devuelve el texto tal cual.
//
// EL REQUISITO QUE MANDA
//
// Diego, al pedir esto: "debemos asegurarnos de que la gente, cuando entre a la
// aplicacion, lo vea en su lenguaje - que espanol, todo en espanol; que ingles,
// todo en ingles; que chino, todo en chino". El ahorro es secundario. Estos
// tests existen sobre todo para eso: que nadie vea el idioma equivocado, ni
// siquiera por un instante.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { dictSource, dict, TRANSLATED } from '../helpers/i18n-source.js';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const i18n = read('js/i18n.js');
const app = read('js/app.js');
const landing = read('js/landing-modules.js');
const track = read('track.html');

describe('no se perdio ni una traduccion en el corte', () => {
  // Lo primero que hay que probar, y lo unico que Diego pidio explicitamente.
  // Un conteo igual no alcanza: dos diccionarios pueden tener el mismo numero
  // de claves y no ser el mismo diccionario.
  it('los dos idiomas tienen exactamente las mismas claves', async () => {
    const es = await dict('es');
    const zh = await dict('zh');
    const kEs = Object.keys(es).sort();
    const kZh = Object.keys(zh).sort();
    expect(kEs).toEqual(kZh);
    expect(kEs.length).toBeGreaterThan(1100);
  });

  it('y ninguna traduccion quedo vacia', async () => {
    for (const lang of TRANSLATED) {
      const d = await dict(lang);
      const empty = Object.entries(d).filter(([, v]) => !v || !String(v).trim());
      expect(empty, `${lang} tiene traducciones vacias`).toEqual([]);
    }
  });

  // El espanol traducido al espanol es un error de copiado, no una traduccion.
  it('ninguna clave se quedo igual al ingles por error', async () => {
    const es = await dict('es');
    const same = Object.entries(es).filter(([k, v]) => k === v);
    // Algunas SI son legitimamente iguales - nombres propios, unidades.
    expect(same.length).toBeLessThan(40);
  });
});

describe('el diccionario llega ANTES de la primera pantalla', () => {
  // Sin esto un cliente en espanol ve la primera vista en ingles y la ve
  // cambiar un instante despues. Es peor que tardar 40ms mas: el parpadeo se
  // nota y la demora no.
  it('la SPA lo espera antes de router.init()', () => {
    // Por linea, no por posicion en el texto: el comentario que explica POR QUE
    // se espera menciona `router.init()`, y la primera version de este test
    // tomo esa mencion como si fuera la llamada. Cuarta vez en el proyecto que
    // un guard matchea su propia explicacion - se afirma sobre codigo, no sobre
    // prosa.
    const lines = app.split(/\r?\n/);
    const awaitAt = lines.findIndex((l) => l.trim().startsWith('await ensureLang('));
    const initAt = lines.findIndex((l) => l.trim() === 'router.init();');
    expect(awaitAt).toBeGreaterThan(-1);
    expect(initAt).toBeGreaterThan(-1);
    expect(awaitAt).toBeLessThan(initAt);
  });

  it('la landing lo espera antes de traducir la pagina', () => {
    expect(landing).toContain('await ensureLang(getLang())');
  });

  it('la pagina de seguimiento tambien', () => {
    expect(track).toContain('await ensureLang(getLang())');
  });

  // Las tres superficies que ve un CLIENTE. admin y mechanic son en ingles por
  // diseno y no cargan i18n.
  it('las tres superficies del cliente estan cubiertas', () => {
    const cubiertas = [app, landing, track].filter((s) => s.includes('await ensureLang('));
    expect(cubiertas).toHaveLength(3);
  });
});

describe('cambiar de idioma no muestra nada a medio traducir', () => {
  // El orden es el punto: si currentLang se moviera antes de que llegue el
  // archivo, cada translateValue() en esa ventana devolveria ingles - y el
  // evento `langchange`, que es lo que repinta, caeria justo ahi.
  it('setLang cambia el idioma DESPUES de tener el diccionario', () => {
    const fn = i18n.slice(i18n.indexOf('export function setLang('));
    const ensure = fn.indexOf('ensureLang(lang)');
    const assign = fn.indexOf('currentLang = lang');
    const dispatch = fn.indexOf('dispatchEvent');
    expect(ensure).toBeGreaterThan(-1);
    expect(ensure).toBeLessThan(assign);
    expect(assign).toBeLessThan(dispatch);
  });

  // La eleccion es intencion del cliente y tiene que sobrevivir a que recargue
  // mientras el archivo viaja.
  it('pero guarda la eleccion antes de esperar', () => {
    const fn = i18n.slice(i18n.indexOf('export function setLang('));
    expect(fn.indexOf('localStorage.setItem')).toBeLessThan(fn.indexOf('ensureLang(lang)'));
  });

  it('y devuelve una promesa para quien quiera esperarla', () => {
    const fn = i18n.slice(i18n.indexOf('export function setLang('));
    expect(fn).toMatch(/return ensureLang\(lang\)\.then/);
  });
});

describe('el ingles no paga por los otros dos', () => {
  // El motivo entero del corte. ensureLang('en') no puede bajar nada.
  it("ensureLang('en') resuelve sin pedir ningun archivo", () => {
    const fn = i18n.slice(i18n.indexOf('export function ensureLang('));
    expect(fn).toMatch(/lang === 'en'[^\n]*return Promise\.resolve\(\)/);
  });

  it('js/i18n.js ya no lleva diccionarios adentro', () => {
    expect(i18n.length).toBeLessThan(12 * 1024);
    expect(i18n).not.toContain('  es: {');
    expect(i18n).not.toContain('  zh: {');
  });

  it('y cada diccionario pesa lo suyo, no lo de los tres', () => {
    expect(dictSource('es').length).toBeGreaterThan(50 * 1024);
    expect(dictSource('zh').length).toBeGreaterThan(30 * 1024);
  });
});

describe('los idiomas soportados ya no dependen del diccionario', () => {
  // Antes "hay diccionario para zh" y "zh es un idioma que soportamos" eran la
  // misma pregunta. Con `dict` empezando vacio dejaron de serlo, y detectLang()
  // habria devuelto siempre 'en'.
  it('detectLang y setLang preguntan por LANGUAGES', () => {
    expect(i18n).toContain('const SUPPORTED = new Set(LANGUAGES.map');
    const detect = i18n.slice(
      i18n.indexOf('function detectLang('),
      i18n.indexOf('let currentLang')
    );
    expect(detect).toContain('SUPPORTED.has');
    expect(detect).not.toContain('dict[');
  });
});

describe('un fallo de red degrada, no rompe', () => {
  // Sin diccionario la app se ve en ingles: peor, pero utilizable. Caerse
  // entera porque un archivo de traducciones no llego seria mucho peor.
  it('ensureLang atrapa el error y deja reintentar', () => {
    const fn = i18n.slice(i18n.indexOf('export function ensureLang('));
    expect(fn).toContain('.catch(');
    expect(fn).toContain('delete loading[lang]');
  });

  it('y memoriza, para no bajar el mismo archivo tres veces', () => {
    const fn = i18n.slice(i18n.indexOf('export function ensureLang('));
    expect(fn).toContain('if (!loading[lang])');
  });
});

describe('la regla del ?v= sigue en pie', () => {
  // CLAUDE.md: una query crea una SEGUNDA copia del modulo con su propio
  // estado. Se quito el 28-jul-2026 y no puede volver - ahora aplica tambien a
  // los dos archivos nuevos.
  it('nadie importa los diccionarios con query', () => {
    expect(i18n).not.toMatch(/i18n-(es|zh)\.js\?/);
    for (const f of ['js/app.js', 'js/landing-modules.js', 'track.html']) {
      expect(read(f)).not.toMatch(/i18n(-es|-zh)?\.js\?v=/);
    }
  });
});

// El documento tiene que DECIR en que idioma esta. Las tres paginas traen
// `<html lang="en">` escrito a mano y nadie lo movia: una pagina traducida
// entera al chino seguia declarandose inglesa.
//
// Rompe dos cosas concretas. Un lector de pantalla elige la voz por este
// atributo, asi que leia el chino y el espanol con voz inglesa. Y el navegador
// decide si ofrecer "traducir esta pagina" comparando este atributo con el
// idioma del visitante: declarando siempre `en`, a un hispanohablante que ya
// estaba viendo la version espanola se le podia ofrecer traducirla del ingles.
//
// Verificado ademas en un navegador de verdad con `npm run look`, que reporta
// el `lang=` que quedo: las tres paginas, los tres idiomas, y tambien despues
// de cambiar de idioma con el selector.
describe('el documento declara el idioma que se esta mostrando', () => {
  const i18n = read('js/i18n.js');

  it('se aplica al arrancar, con el idioma detectado', () => {
    // Anclado al principio de linea: la llamada esta en el nivel de arriba
    // del modulo. Sin el ancla, comentar la linea dejaba pasar el test - el
    // patron se encontraba a si mismo dentro del comentario.
    expect(i18n).toMatch(/^applyDocumentLang\(currentLang\);/m);
  });

  it('y tambien al cambiar de idioma', () => {
    const fn = i18n.slice(i18n.indexOf('export function setLang'));
    expect(fn).toMatch(/applyDocumentLang\(lang\)/);
    // Antes del evento: quien escuche `langchange` y repinte tiene que leer un
    // documento que ya declara el idioma nuevo.
    // Se compara contra el dispatchEvent, no contra la palabra 'langchange':
    // esa aparece antes en el comentario que explica justamente este orden, y
    // la primera version de este test la encontraba ahi y fallaba midiendo
    // texto en vez de codigo.
    expect(fn.indexOf('applyDocumentLang(lang)')).toBeLessThan(fn.indexOf('dispatchEvent('));
  });

  // No es el codigo de dos letras. `zh` a secas no le dice a un lector de
  // pantalla si leer mandarin o cantones, y `en-AU` es el ingles del negocio.
  it('usa etiquetas BCP-47, no el codigo suelto', () => {
    expect(i18n).toMatch(/HTML_LANG = \{[^}]*en: 'en-AU'[^}]*zh: 'zh-CN'/s);
  });

  // La copia esta escrita en espanol rioplatense, asi que es-ES seria falso.
  // DATE_LOCALES si usa es-ES, porque para formatear una fecha la region
  // importa - por eso son dos mapas y no uno.
  it("y para el espanol no hereda el es-ES de las fechas", () => {
    expect(i18n).toMatch(/HTML_LANG = \{[^}]*es: 'es'/s);
  });

  // track.html tenia su propia copia que corria una sola vez al arrancar y
  // escribia el codigo de dos letras, pisando el zh-CN correcto con `zh`.
  it('y ninguna pagina se lo escribe por su cuenta', () => {
    for (const page of ['index.html', 'landing.html', 'track.html']) {
      expect(read(page), page).not.toMatch(/documentElement\.lang\s*=/);
    }
  });
});
