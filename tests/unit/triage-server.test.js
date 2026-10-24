// El servidor y el triage: lo que valida (sanitizeTriage) y, mas importante,
// que NUNCA pueda romper una reserva.
//
// Las columnas del triage viven en scripts/add-triage-columns.sql, que Diego
// corre a mano en el dashboard de Supabase. Si este codigo sale antes que la
// migracion y el triage viajara dentro del INSERT, PostgREST rechazaria el
// INSERT entero ("Could not find the 'triage' column") y NADIE podria reservar.
// Por eso el triage se escribe en un UPDATE aparte, igual que address_lat /
// address_lng: si falla, se pierde el triage y nada mas.
//
// Los tests de handleCreateBooking CORREN el handler contra un Supabase falso
// que se comporta como PostgREST con la columna ausente. Un test que solo
// buscara el texto `triage:` dentro de `const row = {` pasaria igual sobre un
// codigo que hace caer la reserva por otro camino.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FEE_BANDS } from '../../api/_coverage.js';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

const SERVICE = { id: 'svc-1', name: 'Hydro Brake Install', price: 65, duration_max: 40 };

// Estado del "mundo" que el Supabase falso simula, reiniciado en cada test.
//   columnExists   - false = la migracion no se corrio todavia
//   updateThrows   - true  = el UPDATE del triage revienta (red caida, no un error de PostgREST)
//   rows           - la tabla bookings
//   writes         - cada INSERT/UPDATE que llego, en orden, con su payload
let db;
let seq;
let world;
const freshDb = () =>
  new Proxy(
    { bookings: [], services: [SERVICE] },
    { get: (t, k) => (typeof k === 'string' && !(k in t) ? (t[k] = []) : t[k]) }
  );

const matches = (row, filters) =>
  filters.every((f) => {
    if (f.op === 'eq') return row[f.col] === f.val;
    if (f.op === 'neq') return row[f.col] !== f.val;
    if (f.op === 'is') return (row[f.col] ?? null) === f.val;
    if (f.op === 'in') return f.val.includes(row[f.col]);
    return true;
  });

const TRIAGE_COLS = ['triage', 'triage_photo_ref', 'triage_video_ref'];
const namesMissingColumn = (payload) =>
  !world.columnExists && TRIAGE_COLS.some((c) => Object.prototype.hasOwnProperty.call(payload, c));

function table(name) {
  const filters = [];
  let inserted = null;
  let patch = null;
  let failure = null; // lo que PostgREST contestaria en vez de escribir
  let thrown = null; // lo que haria un fetch que no llega
  const rows = () => {
    if (failure || thrown) return [];
    if (patch) {
      const hit = db[name].filter((r) => matches(r, filters));
      for (const r of hit) Object.assign(r, patch);
      return hit;
    }
    if (inserted) return inserted;
    return db[name].filter((r) => matches(r, filters));
  };
  const reject = (payload) => {
    // PostgREST rechaza la sentencia ENTERA si nombra una columna que no existe.
    if (namesMissingColumn(payload)) {
      failure = {
        code: 'PGRST204',
        message: "Could not find the 'triage' column of 'bookings' in the schema cache",
      };
      return true;
    }
    if (world.updateThrows && name === 'bookings' && 'triage' in payload && patch) {
      thrown = new Error('fetch failed');
      return true;
    }
    return false;
  };
  const q = {
    select: () => q,
    order: () => q,
    limit: () => q,
    eq: (c, v) => (filters.push({ op: 'eq', col: c, val: v }), q),
    neq: (c, v) => (filters.push({ op: 'neq', col: c, val: v }), q),
    is: (c, v) => (filters.push({ op: 'is', col: c, val: v }), q),
    in: (c, v) => (filters.push({ op: 'in', col: c, val: v }), q),
    insert: (r) => {
      const payload = Array.isArray(r) ? r[0] : r;
      world.writes.push({ op: 'insert', table: name, payload });
      if (reject(payload)) return q;
      const row = { id: 'bk-' + ++seq, tracking_token: 'tok-' + seq, ...payload };
      db[name].push(row);
      inserted = [row];
      return q;
    },
    update: (p) => {
      patch = p;
      world.writes.push({ op: 'update', table: name, payload: p });
      reject(p);
      return q;
    },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: failure }),
    single: async () => {
      const r = rows()[0] ?? null;
      return { data: r, error: failure || (r ? null : { message: 'no rows' }) };
    },
    then: (resolve, rejectFn) => {
      if (thrown) return Promise.reject(thrown).then(resolve, rejectFn);
      return Promise.resolve({ data: rows(), error: failure }).then(resolve, rejectFn);
    },
  };
  return q;
}

vi.mock('stripe', () => ({
  default: class {
    constructor() {
      // $25 es la banda de Terrey Hills, que es a lo que resuelve la direccion
      // de abajo sin ninguna red (api/_coverage.js).
      this.paymentIntents = {
        // Lo que el cliente pago, en centavos. Sale de FEE_BANDS y no de un
        // numero escrito a mano: el servidor recalcula la zona y devuelve 402
        // ("Payment amount mismatch") si no coincide, asi que un cambio de
        // precios como el +$10 de octubre rompia estos tests sin tocar el
        // triage. La direccion del fixture cae en la primera banda.
        retrieve: async (id) => ({ id, status: 'succeeded', amount: FEE_BANDS[0].fee * 100 }),
      };
      this.checkout = { sessions: { retrieve: async () => ({}) } };
      this.refunds = { create: async () => ({ id: 're_1' }) };
    }
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    from: (t) => table(t),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

// Sin red: ni OSRM ni Nominatim.
globalThis.fetch = async () => ({
  ok: false,
  status: 503,
  json: async () => ({}),
  text: async () => '',
});

const { handleCreateBooking, sanitizeTriage } = await import('../../api/auth.js');
const { TRIAGE_QUESTION_IDS } = await import('../../api/_triage-ids.js');

const makeRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
};

const GUEST = {
  access_token: null,
  client_name: 'Test Client',
  client_email: 'client@example.com',
  client_phone: '0400000000',
  client_lang: 'en',
  service_id: 'svc-1',
  service_name: SERVICE.name,
  scheduled_date: '2026-10-15', // un jueves, sin recargo de domingo
  scheduled_time: '09:00',
  address: '12 Myoora Rd, Terrey Hills NSW 2084',
};

// Una reserva directa (sin hold previo) llega ya pagada.
const PAID = { payment_intent_id: 'pi_test_123' };

const call = (over) => {
  const res = makeRes();
  return handleCreateBooking({ body: { ...GUEST, ...over } }, res).then(() => res);
};

// encodeURIComponent tira URIError ante un surrogate suelto: lo mismo que
// rechaza jsonb, y sin necesitar isWellFormed (Node 20+) en el propio test.
const wellFormed = (str) => {
  try {
    encodeURIComponent(str);
    return true;
  } catch {
    return false;
  }
};

const triageWrites = () =>
  world.writes.filter((w) => Object.prototype.hasOwnProperty.call(w.payload, 'triage'));

let errorSpy;
beforeEach(() => {
  db = freshDb();
  seq = 0;
  world = { columnExists: true, updateThrows: false, writes: [] };
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

// --- sanitizeTriage ---------------------------------------------------------

describe('sanitizeTriage', () => {
  // Review Focus 2.
  it('recorta un payload enorme', () => {
    const huge = { note: 'x'.repeat(50_000) };
    expect(JSON.stringify(sanitizeTriage(huge)).length).toBeLessThan(4_000);
  });

  it('tira las claves que nadie definio', () => {
    expect(sanitizeTriage({ brand: 'Shimano', evil: 1 })).toEqual({ brand: 'Shimano' });
  });

  it('un triage ausente guarda null, no un objeto vacio', () => {
    expect(sanitizeTriage(undefined)).toBeNull();
    expect(sanitizeTriage(null)).toBeNull();
    expect(sanitizeTriage({})).toBeNull();
  });

  it('no acepta un array ni un string', () => {
    expect(sanitizeTriage(['a'])).toBeNull();
    expect(sanitizeTriage('brand=Shimano')).toBeNull();
    expect(sanitizeTriage(42)).toBeNull();
  });

  it('recorta a 200 caracteres el valor de una pregunta REAL', () => {
    // El test de arriba usa `note`, que no es un id: pasa aunque el recorte
    // por valor no exista. Con un id real, el recorte es lo unico que actua.
    const out = sanitizeTriage({ notes: 'x'.repeat(50_000) });
    expect(out.notes).toHaveLength(200);
  });

  it('acepta cada id del catalogo', () => {
    for (const id of TRIAGE_QUESTION_IDS) {
      expect(sanitizeTriage({ [id]: 'ok' }), id).toEqual({ [id]: 'ok' });
    }
  });

  it('solo guarda texto: un objeto, un numero o un booleano no es una respuesta', () => {
    expect(sanitizeTriage({ brand: { a: 1 }, speeds: 11, notes: true })).toBeNull();
    expect(sanitizeTriage({ brand: 'Shimano', speeds: 11 })).toEqual({ brand: 'Shimano' });
  });

  it('una respuesta en blanco no se guarda', () => {
    expect(sanitizeTriage({ brand: '   ', notes: '' })).toBeNull();
  });

  it('el total no pasa de 4 KB aunque todas las preguntas lleguen llenas', () => {
    const full = Object.fromEntries(TRIAGE_QUESTION_IDS.map((id) => [id, 'x'.repeat(500)]));
    const out = sanitizeTriage(full);
    expect(Buffer.byteLength(JSON.stringify(out))).toBeLessThanOrEqual(4096);
    // Recorta quitando respuestas enteras: lo que queda es JSON valido y completo.
    for (const v of Object.values(out)) expect(v).toHaveLength(200);
  });

  it('4 KB son bytes, no caracteres: el chino pesa tres veces', () => {
    const full = Object.fromEntries(TRIAGE_QUESTION_IDS.map((id) => [id, '轮'.repeat(200)]));
    const out = sanitizeTriage(full);
    expect(Buffer.byteLength(JSON.stringify(out))).toBeLessThanOrEqual(4096);
  });

  it('el recorte no parte un emoji por la mitad', () => {
    // Un surrogate suelto lo rechaza el jsonb de Postgres: el UPDATE fallaria
    // y se perderia el triage entero por una carita.
    const out = sanitizeTriage({ notes: 'a'.repeat(199) + '\u{1F6B2}\u{1F6B2}' });
    expect(wellFormed(out.notes)).toBe(true);
    expect(Array.from(out.notes)).toHaveLength(200);
    expect(out.notes.endsWith('\u{1F6B2}')).toBe(true);
  });

  it('un surrogate suelto que manda el cliente no llega a la base', () => {
    // Alto sin bajo (al final y en el medio), y bajo sin alto (al principio y
    // despues de un par completo): las formas de quedar suelto.
    for (const hostile of ['ok\uD83D', 'a\uD83Db', '\uDC00ok', '\u{1F6B2}\uDC00']) {
      const out = sanitizeTriage({ notes: hostile });
      expect(wellFormed(out.notes), JSON.stringify(hostile)).toBe(true);
    }
    // Un par completo no se toca.
    expect(sanitizeTriage({ notes: 'ok \u{1F6B2}' }).notes).toBe('ok \u{1F6B2}');
  });

  it('no depende de String.prototype.toWellFormed (Node < 20)', () => {
    // Ni package.json ni vercel.json fijan la version de Node. En una que no
    // tenga el metodo, llamarlo tiraria dentro del try del paso 5c y TODA
    // reserva perderia su triage, con un log.
    const original = String.prototype.toWellFormed;
    delete String.prototype.toWellFormed;
    try {
      expect('toWellFormed' in String.prototype).toBe(false);
      const out = sanitizeTriage({ brand: 'Shimano', notes: 'ok\uD83D' });
      expect(out.brand).toBe('Shimano');
      expect(wellFormed(out.notes)).toBe(true);
    } finally {
      String.prototype.toWellFormed = original;
    }
  });

  it('un NUL o un salto de linea no llegan a la base', () => {
    // jsonb rechaza \u0000 ("unsupported Unicode escape sequence").
    const out = sanitizeTriage({ notes: 'squeals\u0000when\nwet' });
    expect(out.notes).toBe('squeals when wet');
  });

  it('una clave __proto__ no contamina nada', () => {
    const hostile = JSON.parse('{"__proto__":{"brand":"x"},"brand":"Shimano"}');
    const out = sanitizeTriage(hostile);
    expect(out).toEqual({ brand: 'Shimano' });
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect({}.brand).toBeUndefined();
  });
});

// --- handleCreateBooking ----------------------------------------------------

describe('el triage nunca rompe una reserva', () => {
  it('con las columnas, la reserva guarda el triage ya limpio', async () => {
    const res = await call({ ...PAID, triage: { brand: 'Shimano', evil: 1, notes: 'squeals' } });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(db.bookings).toHaveLength(1);
    expect(db.bookings[0].triage).toEqual({ brand: 'Shimano', notes: 'squeals' });
  });

  it('el triage NO viaja en el INSERT: va en un UPDATE aparte, despues', async () => {
    await call({ ...PAID, triage: { brand: 'Shimano' } });
    const inserts = world.writes.filter((w) => w.op === 'insert' && w.table === 'bookings');
    expect(inserts).toHaveLength(1);
    expect(Object.keys(inserts[0].payload)).not.toContain('triage');
    const writes = triageWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].op).toBe('update');
    expect(world.writes.indexOf(writes[0])).toBeGreaterThan(world.writes.indexOf(inserts[0]));
  });

  it('antes de correr la migracion, la reserva se hace igual (y el error queda en el log)', async () => {
    world.columnExists = false;
    const res = await call({ ...PAID, triage: { brand: 'Shimano' } });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    // La reserva existe, entera.
    expect(db.bookings).toHaveLength(1);
    expect(db.bookings[0].client_email).toBe(GUEST.client_email);
    expect(db.bookings[0].service_name).toBe(SERVICE.name);
    // Lo unico que se perdio es el triage...
    expect(db.bookings[0].triage).toBeUndefined();
    // ...y no en silencio.
    const logged = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toMatch(/triage/i);
    expect(logged).toMatch(/PGRST204|Could not find/);
  });

  it('si el UPDATE revienta por la red, la reserva se hace igual (y queda en el log)', async () => {
    world.updateThrows = true;
    const res = await call({ ...PAID, triage: { brand: 'Shimano' } });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(db.bookings).toHaveLength(1);
    const logged = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toMatch(/triage/i);
    expect(logged).toMatch(/fetch failed/);
  });

  it('un triage basura no rompe la reserva ni toca la base', async () => {
    for (const triage of ['brand=Shimano', ['a'], 42, { evil: 'x' }, {}, null]) {
      const res = await call({ ...PAID, triage });
      expect(res.statusCode, JSON.stringify(triage)).toBe(200);
      db.bookings.length = 0; // la franja se libera para la siguiente vuelta
    }
    expect(triageWrites()).toHaveLength(0);
  });

  it('una reserva sin triage no hace ni un UPDATE de mas', async () => {
    const res = await call({ ...PAID });
    expect(res.statusCode).toBe(200);
    expect(triageWrites()).toHaveLength(0);
  });
});

describe('el triage cruza la reserva en dos pasos (hold y pago)', () => {
  it('queda en la unica fila, y el UPDATE del hold tampoco lo lleva', async () => {
    const hold = await call({
      hold_only: true,
      hold_booking_id: null,
      triage: { brand: 'Shimano' },
    });
    expect(hold.statusCode, JSON.stringify(hold.body)).toBe(200);
    const booking = await call({
      hold_only: false,
      hold_booking_id: hold.body.id,
      payment_intent_id: 'pi_test_123',
      triage: { brand: 'Shimano', speeds: '11' },
    });
    expect(booking.statusCode, JSON.stringify(booking.body)).toBe(200);

    expect(db.bookings).toHaveLength(1);
    expect(db.bookings[0].triage).toEqual({ brand: 'Shimano', speeds: '11' });
    // La fila que se pasa a `.update(row)` al convertir el hold es la misma
    // `row` del INSERT: si llevara triage, la migracion pendiente la rompe.
    const withTriage = world.writes
      .filter((w) => w.payload && 'triage' in w.payload)
      .map((w) => Object.keys(w.payload));
    for (const keys of withTriage) expect(keys).toEqual(['triage']);
  });

  it('antes de la migracion, el pago despues del hold tambien se completa', async () => {
    world.columnExists = false;
    const hold = await call({
      hold_only: true,
      hold_booking_id: null,
      triage: { brand: 'Shimano' },
    });
    expect(hold.statusCode, JSON.stringify(hold.body)).toBe(200);
    const booking = await call({
      hold_only: false,
      hold_booking_id: hold.body.id,
      payment_intent_id: 'pi_test_123',
      triage: { brand: 'Shimano' },
    });
    expect(booking.statusCode, JSON.stringify(booking.body)).toBe(200);
    expect(db.bookings).toHaveLength(1);
    expect(db.bookings[0].stripe_payment_intent_id).toBe('pi_test_123');
  });

  it('la segunda llamada sin triage no borra el de la primera', async () => {
    const hold = await call({
      hold_only: true,
      hold_booking_id: null,
      triage: { brand: 'Shimano' },
    });
    await call({
      hold_only: false,
      hold_booking_id: hold.body.id,
      payment_intent_id: 'pi_test_123',
    });
    expect(db.bookings[0].triage).toEqual({ brand: 'Shimano' });
  });
});
