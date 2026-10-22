// El catalogo de preguntas del triage (js/triage-questions.js).
//
// Los primeros nueve tests son los del plan, tal cual. Los de abajo cierran lo
// que esos nueve no alcanzan a probar:
//   - `?.optional` sobre un `find` vacio es undefined, o sea falsy: el test de
//     Brake Bleed pasa tambien si la pregunta `brand` NO EXISTE.
//   - scripts/i18n-check.mjs no mira js/triage-questions.js (solo las
//     superficies que lista), asi que nada mas en el repo impide que una
//     pregunta salga sin traducir. Ese guardia es este archivo.
import { describe, it, expect } from 'vitest';
import {
  questionsFor,
  CATEGORY_SETS,
  SERVICE_OVERRIDES,
  ALL_QUESTION_IDS,
  labelFor,
} from '../../js/triage-questions.js';
import es from '../../js/i18n-es.js';
import zh from '../../js/i18n-zh.js';

// The 33 active rows of the Supabase `services` table, read on 2026-10-22
// (name, category). The em dash in the two Wheel Truing names is the real one.
const CATALOG = [
  ['Brake Adjustment', 'Brakes'],
  ['Brake Bleed', 'Brakes'],
  ['Brake Pad Install', 'Brakes'],
  ['Hydro Brake Install', 'Brakes'],
  ['Bar Tape Install', 'Cockpit & levers'],
  ['Handlebar Install', 'Cockpit & levers'],
  ['Headset Service', 'Cockpit & levers'],
  ['Saddle Fitting', 'Cockpit & levers'],
  ['Bottom Bracket Install', 'Drivetrain'],
  ['Cassette Install', 'Drivetrain'],
  ['Chain Install', 'Drivetrain'],
  ['True Hanger Derailleur', 'Drivetrain'],
  ['E-bike Diagnostic', 'Electronic & e-bike'],
  ['E-bike service', 'Electronic & e-bike'],
  ['Firmware Update', 'Electronic & e-bike'],
  ['Derailleur Install', 'Gears & cables'],
  ['External Cable Install', 'Gears & cables'],
  ['Gear Adjustment', 'Gears & cables'],
  ['Accessory / Part Install', 'General & assembly'],
  ['Bike Assembly', 'General & assembly'],
  ['Emergency Service', 'Scheduled services'],
  ['Standard Service', 'Scheduled services'],
  ['Standard+ Service', 'Scheduled services'],
  ['Tune-Up', 'Scheduled services'],
  ['Ultimate Overhaul', 'Scheduled services'],
  ['Air Can Service', 'Suspension'],
  ['Lower Leg Service', 'Suspension'],
  ['Spoke Replacement', 'Wheels & tyres'],
  ['Tubeless Tyre Install', 'Wheels & tyres'],
  ['Tyre / Tube Install', 'Wheels & tyres'],
  ['Tyre Replacement', 'Wheels & tyres'],
  ['Wheel Truing \u2014 Major', 'Wheels & tyres'],
  ['Wheel Truing \u2014 Minor', 'Wheels & tyres'],
];

// Every question any of the 33 services (or an unknown category) can reach.
function reachableQuestions() {
  const byId = new Map();
  const services = CATALOG.map(([name, category]) => ({ name, category }));
  services.push({ name: 'Algo nuevo', category: 'Categoria Que No Existe' });
  for (const s of services) for (const q of questionsFor(s)) byId.set(q.id, q);
  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// Los del plan.
// ---------------------------------------------------------------------------

// Las 9 categorías del catálogo tienen juego propio.
it('cubre las nueve categorías', () => {
  for (const cat of [
    'Brakes',
    'Wheels & tyres',
    'Drivetrain',
    'Gears & cables',
    'Electronic & e-bike',
    'Suspension',
    'Cockpit & levers',
    'Scheduled services',
    'General & assembly',
  ]) {
    expect(questionsFor({ name: 'x', category: cat }).length).toBeGreaterThan(0);
  }
});

// Review Focus 1: categoría desconocida no rompe.
it('una categoría nueva cae en el juego por defecto', () => {
  const qs = questionsFor({ name: 'Algo nuevo', category: 'Categoria Que No Existe' });
  expect(qs.length).toBeGreaterThan(0);
  expect(qs.some((q) => q.id === 'bike_type')).toBe(true);
});

// Review Focus 5.
it('Emergency Service no tiene preguntas: se desvía antes', () => {
  expect(questionsFor({ name: 'Emergency Service', category: 'Scheduled services' })).toEqual([]);
});

// Las excepciones del spec, una por una.
it('Brake Bleed exige la marca y no pregunta el tipo de freno', () => {
  const qs = questionsFor({ name: 'Brake Bleed', category: 'Brakes' });
  expect(qs.find((q) => q.id === 'brand')?.optional).toBeFalsy();
  expect(qs.some((q) => q.id === 'brake_type')).toBe(false);
});

it('resina o metálica es opcional', () => {
  const qs = questionsFor({ name: 'Brake Pad Install', category: 'Brakes' });
  expect(qs.find((q) => q.id === 'pad_material')?.optional).toBe(true);
});

it('True Hanger pregunta por el cuadro, no por la transmisión', () => {
  const qs = questionsFor({ name: 'True Hanger Derailleur', category: 'Drivetrain' });
  expect(qs.some((q) => q.id === 'frame_brand')).toBe(true);
  expect(qs.some((q) => q.id === 'speeds')).toBe(false);
});

it('la cinta de manillar no ofrece colores que no hay', () => {
  const qs = questionsFor({ name: 'Bar Tape Install', category: 'Cockpit & levers' });
  expect(qs.some((q) => q.id === 'tape_colour')).toBe(false);
});

// Garantía estructural: toda opción cerrada deja decir "no sé".
it('toda pregunta de opciones ofrece "No sé"', () => {
  for (const set of Object.values(CATEGORY_SETS)) {
    for (const q of set.filter((q) => q.options)) {
      expect(q.options, q.id).toContain('I am not sure');
    }
  }
});

// La Tarea 3 filtra contra esta lista.
it('ALL_QUESTION_IDS cubre todo id que alguna pregunta usa', () => {
  const seen = new Set();
  for (const cat of Object.keys(CATEGORY_SETS)) {
    for (const q of questionsFor({ name: 'x', category: cat })) seen.add(q.id);
  }
  for (const id of seen) expect(ALL_QUESTION_IDS).toContain(id);
});

// La Tarea 5 muestra etiquetas, no ids.
it('labelFor devuelve la pregunta, y el id si no la conoce', () => {
  expect(labelFor('brand')).toMatch(/brake|brand/i);
  expect(labelFor('no_existe')).toBe('no_existe');
});

// ---------------------------------------------------------------------------
// Lo que los del plan no alcanzan.
// ---------------------------------------------------------------------------

describe('los 33 servicios del catalogo', () => {
  it('todos tienen preguntas, salvo Emergency Service', () => {
    for (const [name, category] of CATALOG) {
      const qs = questionsFor({ name, category });
      if (name === 'Emergency Service') expect(qs, name).toEqual([]);
      else expect(qs.length, name).toBeGreaterThan(0);
    }
  });

  it('cada excepcion lleva el nombre de un servicio que existe', () => {
    // Una excepcion con el nombre mal escrito no falla: cae en el juego de la
    // categoria, en silencio. Este es el unico lugar donde se nota.
    const names = new Set(CATALOG.map(([name]) => name));
    for (const key of Object.keys(SERVICE_OVERRIDES)) expect(names.has(key), key).toBe(true);
  });

  it('son 20 excepciones del spec mas la emergencia', () => {
    expect(Object.keys(SERVICE_OVERRIDES)).toHaveLength(21);
    expect(SERVICE_OVERRIDES).toHaveProperty('Emergency Service');
  });

  it('ninguna lista repite un id (el jsonb tiene una clave por id)', () => {
    for (const [name, category] of CATALOG) {
      const ids = questionsFor({ name, category }).map((q) => q.id);
      expect(new Set(ids).size, name).toBe(ids.length);
    }
  });

  it('todo id alcanzable esta en ALL_QUESTION_IDS, y no sobra ninguno', () => {
    const reachable = reachableQuestions().map((q) => q.id);
    for (const id of reachable) expect(ALL_QUESTION_IDS, id).toContain(id);
    // Una pregunta definida y que ningun servicio alcanza es codigo muerto, o
    // una excepcion que perdio su nombre.
    for (const id of ALL_QUESTION_IDS) expect(reachable, id).toContain(id);
  });

  it('los ids no se repiten en ALL_QUESTION_IDS', () => {
    expect(new Set(ALL_QUESTION_IDS).size).toBe(ALL_QUESTION_IDS.length);
  });
});

describe('las excepciones, una por una', () => {
  // [servicio, categoria, ids que tiene que tener, ids que no]
  const CASES = [
    ['Brake Adjustment', 'Brakes', ['brand', 'brake_type'], ['pad_material', 'current_brakes']],
    ['Brake Bleed', 'Brakes', ['brand'], ['brake_type']],
    ['Brake Pad Install', 'Brakes', ['brand', 'pad_material'], []],
    ['Hydro Brake Install', 'Brakes', ['brand', 'current_brakes'], []],
    ['Spoke Replacement', 'Wheels & tyres', ['broken_spokes', 'hub_brand'], ['tyre_size']],
    ['Wheel Truing \u2014 Minor', 'Wheels & tyres', ['has_broken_spokes'], ['tyre_size']],
    ['Wheel Truing \u2014 Major', 'Wheels & tyres', ['has_broken_spokes'], ['tyre_size']],
    ['Tubeless Tyre Install', 'Wheels & tyres', ['tyre_size'], ['tyre_system']],
    ['Tyre / Tube Install', 'Wheels & tyres', ['tyre_size', 'tyre_system', 'own_tyre'], []],
    ['Tyre Replacement', 'Wheels & tyres', ['tyre_size', 'tyre_system'], ['own_tyre']],
    ['Bottom Bracket Install', 'Drivetrain', ['bb_type'], ['speeds']],
    ['Chain Install', 'Drivetrain', ['speeds'], ['frame_brand']],
    [
      'Derailleur Install',
      'Gears & cables',
      ['shifting_type', 'derailleur_position', 'own_part'],
      [],
    ],
    ['External Cable Install', 'Gears & cables', ['shifting_type', 'cable_kind'], []],
    ['Gear Adjustment', 'Gears & cables', ['shifting_type'], ['cable_kind']],
    ['Firmware Update', 'Electronic & e-bike', ['motor_brand', 'brand_app'], []],
    ['E-bike service', 'Electronic & e-bike', ['motor_brand'], ['symptom']],
    ['E-bike Diagnostic', 'Electronic & e-bike', ['motor_brand', 'symptom'], ['brand_app']],
    ['Air Can Service', 'Suspension', ['suspension_brand', 'suspension_part'], []],
    ['Lower Leg Service', 'Suspension', ['suspension_brand'], ['suspension_part']],
    ['Handlebar Install', 'Cockpit & levers', ['bar_swap'], []],
    ['Headset Service', 'Cockpit & levers', ['headset_feel'], []],
    ['Saddle Fitting', 'Cockpit & levers', ['fit_goal'], []],
    ['Bar Tape Install', 'Cockpit & levers', ['bike_type'], ['bar_swap', 'tape_colour']],
    ['Bike Assembly', 'General & assembly', ['in_box', 'parts_complete'], ['own_part']],
    ['Accessory / Part Install', 'General & assembly', ['part_wanted', 'own_part'], ['in_box']],
    ['Tune-Up', 'Scheduled services', ['notes'], ['brand']],
  ];

  it.each(CASES)('%s', (name, category, has, hasNot) => {
    const ids = questionsFor({ name, category }).map((q) => q.id);
    for (const id of has) expect(ids, `${name} debe tener ${id}`).toContain(id);
    for (const id of hasNot) expect(ids, `${name} no debe tener ${id}`).not.toContain(id);
  });

  it('Brake Bleed: la marca existe, no es opcional, y es la que decide el liquido', () => {
    const brand = questionsFor({ name: 'Brake Bleed', category: 'Brakes' }).find(
      (q) => q.id === 'brand'
    );
    expect(brand).toBeDefined();
    expect(brand.optional).toBeFalsy();
  });

  it('Accessory / Part Install dice QUE pieza se instala, antes de preguntar si la trae', () => {
    // Sin esto el mecanico sabe si el cliente tiene la pieza y no cual es.
    const qs = questionsFor({ name: 'Accessory / Part Install', category: 'General & assembly' });
    expect(qs.map((q) => q.id)).toEqual(['part_wanted', 'own_part']);
    const part = qs[0];
    expect(part.ask).toBe('What would you like us to install?');
    expect(part.options).toEqual([
      'Rack',
      'Mudguards',
      'Lights',
      'Bottle cage',
      'Pedals',
      'Something else',
      'I am not sure',
    ]);
    expect(part.optional).toBeFalsy();
  });

  it('el programado lleva un "saltear" visible: todas sus preguntas son opcionales', () => {
    for (const q of CATEGORY_SETS['Scheduled services']) expect(q.optional, q.id).toBe(true);
  });
});

describe('el catalogo es de solo lectura', () => {
  // Las preguntas se comparten entre todas las llamadas a questionsFor(). Si
  // la UI le escribe un campo a una, el catalogo queda corrompido para el resto
  // de la sesion. Congeladas, escribirles lanza (los modulos son estrictos) en
  // vez de cambiar nada en silencio.
  it('toda pregunta y sus opciones estan congeladas', () => {
    for (const q of reachableQuestions()) {
      expect(Object.isFrozen(q), q.id).toBe(true);
      if (q.options) expect(Object.isFrozen(q.options), q.id + ' options').toBe(true);
    }
  });

  it('escribirle a una pregunta lanza y no cambia el catalogo', () => {
    const [first] = questionsFor({ name: 'x', category: 'Brakes' });
    const ask = first.ask;
    expect(() => {
      first.ask = 'otra cosa';
    }).toThrow(TypeError);
    expect(() => first.options.push('Una marca nueva')).toThrow(TypeError);
    expect(questionsFor({ name: 'x', category: 'Brakes' })[0].ask).toBe(ask);
    expect(labelFor(first.id)).toBe(ask);
  });
});

describe('entradas raras', () => {
  it('un nombre de categoria que es una propiedad de Object no rompe', () => {
    // CATEGORY_SETS['constructor'] es una funcion si la busqueda no es propia.
    for (const category of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const qs = questionsFor({ name: 'x', category });
      expect(Array.isArray(qs), category).toBe(true);
      expect(
        qs.some((q) => q.id === 'bike_type'),
        category
      ).toBe(true);
    }
  });

  it('un nombre de servicio que es una propiedad de Object no rompe', () => {
    const qs = questionsFor({ name: 'constructor', category: 'Brakes' });
    expect(qs.map((q) => q.id)).toContain('brand');
  });

  it('sin categoria, o sin servicio, cae en el juego por defecto', () => {
    for (const service of [{ name: 'x' }, { name: 'x', category: null }, {}, null, undefined]) {
      expect(questionsFor(service).some((q) => q.id === 'bike_type')).toBe(true);
    }
  });

  it('devuelve una lista nueva: quien la ordena o recorta no toca el catalogo', () => {
    const a = questionsFor({ name: 'x', category: 'Brakes' });
    a.length = 0;
    expect(questionsFor({ name: 'x', category: 'Brakes' }).length).toBeGreaterThan(0);
    expect(CATEGORY_SETS.Brakes.length).toBeGreaterThan(0);
  });

  it('labelFor no se confunde con propiedades de Object', () => {
    expect(labelFor('constructor')).toBe('constructor');
    expect(labelFor('__proto__')).toBe('__proto__');
  });
});

describe('la forma de cada pregunta', () => {
  it('toda pregunta tiene id y ask, y cada id tiene un ask solo', () => {
    for (const q of reachableQuestions()) {
      expect(typeof q.id, q.id).toBe('string');
      expect(q.ask.length, q.id).toBeGreaterThan(0);
      expect(labelFor(q.id), q.id).toBe(q.ask);
    }
  });

  it('o es de opciones o es de texto libre, nunca las dos ni ninguna', () => {
    for (const q of reachableQuestions()) {
      const closed = Array.isArray(q.options) && q.options.length > 0;
      expect(closed !== Boolean(q.free), q.id).toBe(true);
    }
  });

  it('toda pregunta de opciones TERMINA en "I am not sure", sin repetirla', () => {
    // Incluye las que suman las excepciones, que el test del plan no ve.
    for (const q of reachableQuestions().filter((q) => q.options)) {
      expect(q.options.at(-1), q.id).toBe('I am not sure');
      expect(
        q.options.filter((o) => o === 'I am not sure'),
        q.id
      ).toHaveLength(1);
      expect(q.options.length, q.id).toBeGreaterThanOrEqual(3);
      expect(new Set(q.options).size, q.id).toBe(q.options.length);
    }
  });
});

describe('las tres lenguas', () => {
  // Cada ask, hint y opcion de lo que algun servicio puede mostrar.
  const all = [
    ...new Set(
      reachableQuestions().flatMap((q) => [
        q.ask,
        ...(q.hint ? [q.hint] : []),
        ...(q.options || []),
      ])
    ),
  ];

  // Marcas: se leen igual en los tres idiomas, asi que no llevan entrada en
  // los diccionarios (un texto sin entrada se muestra como esta). Es la misma
  // convencion de ALLOWED en scripts/i18n-check.mjs, y la misma razon: una
  // entrada "Shimano": "Shimano" solo infla el diccionario, y
  // tests/unit/i18n-split.test.js falla cuando las claves iguales al ingles
  // pasan de 40. Cada excepcion queda a la vista aca.
  const BRANDS = new Set([
    'Shimano',
    'SRAM',
    'Magura',
    'Hope',
    'Tektro',
    'DT Swiss',
    'Novatec',
    'Bosch',
    'Yamaha',
    'Bafang',
    'RockShox',
    'Fox',
    'Marzocchi',
    'SR Suntour',
  ]);
  const strings = all.filter((s) => !BRANDS.has(s));

  it('hay textos que revisar', () => {
    expect(strings.length).toBeGreaterThan(50);
  });

  it('cada marca exceptuada se usa de verdad (la lista no acumula restos)', () => {
    for (const b of BRANDS) expect(all, b).toContain(b);
  });

  it.each([
    ['es', es],
    ['zh', zh],
  ])('%s tiene todo el texto del triage, no vacio', (lang, dict) => {
    const missing = strings.filter(
      (s) => typeof dict[s] !== 'string' || dict[s].trim().length === 0
    );
    expect(missing, `${lang}: sin traducir`).toEqual([]);
  });

  it('el chino es chino y el espanol no repite el ingles donde hay una frase', () => {
    // Una frase de mas de dos palabras que sale identica en es o zh es una
    // traduccion que alguien copio sin traducir. Las marcas (una palabra) no.
    for (const s of strings.filter((s) => s.split(' ').length > 2)) {
      expect(es[s], `es: ${s}`).not.toBe(s);
      expect(zh[s], `zh: ${s}`).not.toBe(s);
      expect(zh[s], `zh sin caracteres chinos: ${s}`).toMatch(/[一-鿿]/);
    }
  });

  it('el texto del triage no lleva comillas tipograficas, rayas largas ni puntos suspensivos', () => {
    // CLAUDE.md: ASCII en el codigo. Un apostrofe curvo en una clave tambien
    // dejaria de coincidir con lo que el codigo escribe.
    for (const s of strings) expect(s, s).not.toMatch(/[‘’“”–—…]/);
  });
});
