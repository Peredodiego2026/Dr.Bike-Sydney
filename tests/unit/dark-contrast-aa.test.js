// tests/unit/dark-contrast-aa.test.js
//
// Punto 14 de la auditoria: "el check exige 3:1, pero el minimo AA real para
// texto normal es 4.5:1. Los acentos estan calibrados a 3:1 porque cumplen
// doble funcion; la salida correcta es separar los dos papeles en tokens
// distintos".
//
// Al medirlo, el diagnostico se quedaba corto. Los seis acentos duales no
// estaban "calibrados a 3:1": fallaban en LOS DOS papeles a la vez.
//
//   --blue    3.30 como texto   3.68 con blanco encima
//   --green   3.68              3.30
//   --red     3.22              3.76
//   --purple  3.09              3.92
//   --cyan    3.14              3.87
//
// Estaban en el medio, mal para las dos cosas. Un color no puede servir de
// texto sobre una tarjeta oscura Y de relleno con blanco encima: para leerse
// tiene que ser claro, para aguantar blanco tiene que ser oscuro.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const vars = fs.readFileSync(new URL('../../css/variables.css', import.meta.url), 'utf8');

// Se corta por la REGLA, no por la cadena. Escribir el selector en un comentario
// hizo que los valores nuevos terminaran en :root la primera vez - el corte
// empezaba en la mencion, no en la regla.
const DARK_RULE = /\[data-theme='dark'\]\s*\{[\s\S]*/;
const darkBlock = DARK_RULE.exec(vars)?.[0] ?? '';
const lightBlock = vars.slice(0, vars.search(/\[data-theme='dark'\]\s*\{/));

const valueOf = (block, token) =>
  new RegExp('\\n\\s*' + token + ':\\s*([^;]+);').exec(block)?.[1]?.trim() ?? null;

const toRgb = (h) => {
  const v = h.replace('#', '');
  const f = v.length === 3 ? [...v].map((c) => c + c).join('') : v;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
};
const lum = (rgb) =>
  rgb
    .map((x) => {
      const c = x / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    })
    .reduce((a, c, i) => a + [0.2126, 0.7152, 0.0722][i] * c, 0);
const ratio = (a, b) => {
  const [l1, l2] = [lum(toRgb(a)), lum(toRgb(b))];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

const AA = 4.5;
const ACCENTS = ['--blue', '--blue-dark', '--green', '--red', '--purple', '--cyan'];

describe('cada acento tiene sus dos papeles separados', () => {
  it('existe un token de texto por cada relleno', () => {
    for (const a of ACCENTS) {
      expect(valueOf(lightBlock, a + '-text'), `falta ${a}-text en :root`).toBeTruthy();
      expect(valueOf(darkBlock, a + '-text'), `falta ${a}-text en oscuro`).toBeTruthy();
    }
  });

  // En tema claro no hay conflicto: sobre blanco el mismo valor sirve para las
  // dos cosas. Que sean el mismo color ahi es lo que hace que este cambio NO
  // toque el tema claro, que es la mitad del riesgo evitado.
  it('en tema claro el texto es el mismo color que el relleno', () => {
    for (const a of ACCENTS) {
      expect(valueOf(lightBlock, a + '-text')).toBe(`var(${a})`);
    }
  });

  it('y en oscuro son valores distintos, porque ahi si se pelean', () => {
    for (const a of ACCENTS) {
      const fill = valueOf(darkBlock, a);
      const text = valueOf(darkBlock, a + '-text');
      expect(text, `${a} en oscuro`).not.toBe(fill);
    }
  });
});

describe('el texto se lee sobre los tres fondos oscuros', () => {
  const GROUNDS = {
    'la tarjeta': valueOf(darkBlock, '--white'),
    'el panel': valueOf(darkBlock, '--off'),
    'la pagina': '#0f1a2e',
  };

  for (const a of ACCENTS) {
    it(`${a}-text cumple AA en oscuro`, () => {
      const v = valueOf(darkBlock, a + '-text');
      for (const [name, ground] of Object.entries(GROUNDS)) {
        expect(ratio(v, ground), `${a}-text sobre ${name}`).toBeGreaterThanOrEqual(AA);
      }
    });
  }
});

describe('el blanco se lee sobre cada relleno', () => {
  // Los botones llevan el texto blanco escrito a mano en el HTML. Si el relleno
  // es demasiado claro, la etiqueta desaparece y no hay token que lo arregle.
  for (const a of ACCENTS) {
    it(`blanco sobre ${a} cumple AA en oscuro`, () => {
      expect(ratio('#ffffff', valueOf(darkBlock, a))).toBeGreaterThanOrEqual(AA);
    });

    it(`blanco sobre ${a} cumple AA en claro`, () => {
      const v = valueOf(lightBlock, a);
      expect(ratio('#ffffff', v)).toBeGreaterThanOrEqual(AA);
    });
  }
});

describe('los tokens que solo son texto tambien llegan a AA', () => {
  // No hacia falta partirlos - nunca fueron relleno - pero estaban por debajo
  // igual: --gray-lt 3.82, --blue-deep 4.38, --red-bright 4.39.
  for (const t of ['--gray-lt', '--blue-deep', '--red-bright', '--blue-soft', '--green-bright']) {
    it(`${t} cumple AA sobre la tarjeta`, () => {
      const v = valueOf(darkBlock, t);
      if (!v || !v.startsWith('#')) return;
      expect(ratio(v, valueOf(darkBlock, '--white'))).toBeGreaterThanOrEqual(AA);
    });
  }
});

describe('la migracion toco el texto y nada mas', () => {
  const FILES = [
    'css/main.css',
    'css/admin.css',
    'css/mechanic.css',
    'css/landing.css',
    'css/home.css',
    'js/app.js',
    'js/admin.js',
    'js/mechanic.js',
    'index.html',
    'landing.html',
    'admin.html',
    'track.html',
  ];
  const read = (p) => {
    try {
      return fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
    } catch {
      return '';
    }
  };

  // El riesgo real de la migracion: `background-color`, `border-color` y
  // `caret-color` terminan todas en "color". Un reemplazo ingenuo habria
  // repintado los fondos con el color del texto.
  it('ningun fondo, borde o icono apunta a un token de texto', () => {
    const bad = [];
    for (const f of FILES) {
      for (const m of read(f).matchAll(
        /(background|border|outline|caret|fill|stroke)[a-z-]*:\s*var\(--[a-z-]+-text\)/g
      )) {
        bad.push(`${f}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('y el texto si quedo apuntando al token de texto', () => {
    const migrated =
      FILES.map(read)
        .join('')
        .match(/color:\s*var\(--[a-z-]+-text\)/g) || [];
    expect(migrated.length).toBeGreaterThan(200);
  });
});

describe('el umbral del check es el de AA, no el de texto grande', () => {
  const check = fs.readFileSync(
    new URL('../../scripts/dark-theme-check.mjs', import.meta.url),
    'utf8'
  );

  // 3.0 es AA-large: 18.66px en negrita o 24px normal. Los badges de este
  // proyecto son de 11-12px, asi que 3.0 nunca fue el numero correcto.
  it('MIN es 4.5', () => {
    expect(check).toMatch(/const MIN = 4\.5;/);
  });

  it('y la lista de tinta nombra los tokens de texto', () => {
    for (const a of ACCENTS) {
      expect(check).toContain(`'${a}-text'`);
    }
  });
});

describe('el selector no se menciona donde pueda romper un corte', () => {
  // Se escribio el nombre del selector en un comentario dentro de :root, y
  // media docena de scripts que cortan por esa cadena empezaron a cortar ahi:
  // los valores nuevos terminaron en el tema CLARO. Quinta vez en el proyecto
  // que un texto en prosa rompe una herramienta que lee texto.
  it('no aparece antes de la regla real', () => {
    const ruleAt = vars.search(/\[data-theme='dark'\]\s*\{/);
    const firstMention = vars.indexOf("[data-theme='dark']");
    const beforeRule = vars.slice(0, ruleAt);
    const mentionsInRoot = beforeRule.slice(
      0,
      beforeRule.indexOf('*/', beforeRule.indexOf(':root'))
    );
    expect(mentionsInRoot).not.toContain("[data-theme='dark']");
    expect(firstMention).toBeGreaterThan(-1);
  });
});
