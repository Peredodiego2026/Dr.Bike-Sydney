// La foto del triage, del lado del servidor: donde se guarda, y -- lo que
// importa de verdad -- que NUNCA pueda voltear una reserva ni un cobro.
//
// La regla que manda sobre todo lo demas (decision del duenio, 22-oct): si
// cualquier cosa del camino de la foto falla -- el navegador, la compresion, el
// tamano, el bucket, el PUT, la UPDATE -- la reserva se crea igual y se cobra
// igual, y lo unico que se pierde es la foto.
//
// Metodo: el de tests/unit/triage-server.test.js. El handler se CORRE contra un
// Supabase falso que se porta como PostgREST (incluido el caso de la columna
// que todavia no existe, porque scripts/add-triage-columns.sql lo corre Diego a
// mano) y un fetch falso que hace de Storage. Un test que leyera el fuente
// pasaria igual sobre un codigo que tira la reserva por otro camino.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

const SERVICE = { id: 'svc-1', name: 'Hydro Brake Install', price: 65, duration_max: 40 };

// El "mundo" que simula el Supabase falso, reiniciado en cada test.
//   columnExists - false = la migracion no se corrio todavia
//   rows         - la tabla bookings
//   writes       - cada INSERT/UPDATE que llego, en orden, con su payload
let db;
let seq;
let world;
// Cada subida que llego a Storage, y con que contesta Storage.
let uploads;
let uploadStatus;

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
  let failure = null;
  const rows = () => {
    if (failure) return [];
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
        message: "Could not find the 'triage_photo_ref' column of 'bookings' in the schema cache",
      };
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
      // Un UUID de verdad: SAFE_ID (api/_job-photos.js) solo acepta hex y
      // guiones, asi que un id de fantasia como `bk-1` haria que la foto no
      // tenga ruta y el test pasaria por el motivo equivocado.
      const row = {
        id: `0000000${++seq}-1111-4000-8000-000000000000`,
        tracking_token: `tok-${seq}`,
        ...payload,
      };
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
    then: (resolve, rejectFn) =>
      Promise.resolve({ data: rows(), error: failure }).then(resolve, rejectFn),
  };
  return q;
}

vi.mock('stripe', () => ({
  default: class {
    constructor() {
      // $25 es la banda de Terrey Hills, que es a lo que resuelve la direccion
      // de abajo sin ninguna red (api/_coverage.js).
      this.paymentIntents = { retrieve: async (id) => ({ id, status: 'succeeded', amount: 2500 }) };
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

// Sin red: ni OSRM ni Nominatim. Lo unico que contesta algo es Storage.
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('/storage/v1/object/')) {
    uploads.push({
      url: u,
      method: opts.method,
      headers: opts.headers || {},
      body: opts.body,
    });
    return {
      ok: uploadStatus >= 200 && uploadStatus < 300,
      status: uploadStatus,
      json: async () => ({}),
      text: async () => 'storage said no',
    };
  }
  return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
};

const { handleCreateBooking } = await import('../../api/auth.js');
const { triagePhotoRef, jobPhotoPath, JOB_PHOTO_BUCKET } = await import('../../api/_job-photos.js');

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

// Un JPEG de verdad, chico: los dos bytes de inicio (SOI) y algo detras.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('dr bike')]);
const DATA_URL = `data:image/jpeg;base64,${JPEG.toString('base64')}`;

const photoWrites = () =>
  world.writes.filter((w) =>
    Object.prototype.hasOwnProperty.call(w.payload, 'triage_photo_ref')
  );

let warnSpy;
let errorSpy;
beforeEach(() => {
  db = freshDb();
  seq = 0;
  world = { columnExists: true, writes: [] };
  uploads = [];
  uploadStatus = 200;
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

const logged = () =>
  [...warnSpy.mock.calls, ...errorSpy.mock.calls].map((c) => c.join(' ')).join('\n');

// --- triagePhotoRef ---------------------------------------------------------

describe('triagePhotoRef: donde va la foto que manda el cliente', () => {
  const ID = 'abc12345-1111-4000-8000-000000000000';

  it('la foto va a la carpeta de SU reserva, con el nombre que se espera', () => {
    expect(triagePhotoRef(ID, 1700000000)).toBe(
      `job-photos-private/jobs/${ID}/triage_1700000000.jpg`
    );
  });

  it('devuelve una referencia, no una URL', () => {
    // Una URL publica que se filtra sigue funcionando para siempre: por eso lo
    // que se guarda en la fila es el camino dentro del bucket privado.
    expect(triagePhotoRef(ID, 1700000000).startsWith('http')).toBe(false);
    expect(triagePhotoRef(ID, 1700000000).startsWith(`${JOB_PHOTO_BUCKET}/`)).toBe(true);
  });

  it('un id que no es seguro no produce ninguna ruta', () => {
    for (const bad of ['../otro', '', undefined, null, 'jobs/../../etc', 'abc/def', 'x']) {
      expect(triagePhotoRef(bad, 1700000000), JSON.stringify(bad)).toBeNull();
    }
  });

  it('ida y vuelta: lo que devuelve, jobPhotoPath lo acepta para ESA reserva', () => {
    // Esta es la propiedad que hace que la foto se pueda mostrar: el Admin pide
    // firmar la referencia y jobPhotoPath es el unico que decide si se firma.
    // Una carpeta de paso (`triage/<token>/`) no pasa por aca, y la foto
    // quedaria guardada e invisible, sin que nada lo diga.
    const ref = triagePhotoRef(ID, 1700000000);
    expect(jobPhotoPath(ref, ID)).toBe(`jobs/${ID}/triage_1700000000.jpg`);
    expect(jobPhotoPath(ref, ID)).not.toBeNull();
  });

  it('...y la rechaza para cualquier otra reserva', () => {
    const other = 'dddddddd-2222-4000-8000-000000000000';
    expect(jobPhotoPath(triagePhotoRef(ID, 1700000000), other)).toBeNull();
  });

  it('sin fecha explicita usa la de ahora, y sigue dando la vuelta', () => {
    const ref = triagePhotoRef(ID);
    expect(ref).toMatch(new RegExp(`^job-photos-private/jobs/${ID}/triage_\\d{10,}\\.jpg$`));
    expect(jobPhotoPath(ref, ID)).not.toBeNull();
  });
});

// --- handleCreateBooking ----------------------------------------------------

describe('la foto del triage nunca rompe una reserva', () => {
  it('cuando el PUT anda, la fila queda con la REFERENCIA y la reserva es 200', async () => {
    const res = await call({ ...PAID, triage_photo: DATA_URL });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(db.bookings).toHaveLength(1);
    const booking = db.bookings[0];
    const ref = booking.triage_photo_ref;
    expect(ref, 'la referencia quedo guardada').toBeTruthy();
    expect(ref.startsWith('http'), 'es una referencia, no una URL').toBe(false);
    expect(ref).toMatch(
      new RegExp(`^job-photos-private/jobs/${booking.id}/triage_\\d+\\.jpg$`)
    );
    // Y se puede firmar: si no, la foto esta guardada y nadie la puede ver.
    expect(jobPhotoPath(ref, booking.id)).not.toBeNull();
  });

  it('sube al bucket privado, como jpeg, con el cuerpo que mando el cliente', async () => {
    await call({ ...PAID, triage_photo: DATA_URL });
    expect(uploads).toHaveLength(1);
    const up = uploads[0];
    expect(up.url).toContain(`/storage/v1/object/${JOB_PHOTO_BUCKET}/jobs/`);
    // La extension y el tipo son fijos, nunca los que diga el archivo
    // (JOB_PHOTO_TYPES / safeImageUpload, PENDIENTES 104).
    expect(up.headers['Content-Type']).toBe('image/jpeg');
    expect(up.url.endsWith('.jpg')).toBe(true);
    expect(Buffer.isBuffer(up.body)).toBe(true);
    expect(Buffer.compare(up.body, JPEG)).toBe(0);
  });

  it('acepta base64 pelado, sin el prefijo data:', async () => {
    const res = await call({ ...PAID, triage_photo: JPEG.toString('base64') });
    expect(res.statusCode).toBe(200);
    expect(uploads).toHaveLength(1);
    expect(Buffer.compare(uploads[0].body, JPEG)).toBe(0);
    expect(db.bookings[0].triage_photo_ref).toBeTruthy();
  });

  it('si el PUT falla, la reserva se hace igual y nada queda en la fila', async () => {
    uploadStatus = 400;
    const res = await call({ ...PAID, triage_photo: DATA_URL });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(db.bookings).toHaveLength(1);
    expect(db.bookings[0].client_email).toBe(GUEST.client_email);
    expect(db.bookings[0].triage_photo_ref).toBeUndefined();
    expect(photoWrites(), 'no se escribe una referencia a una foto que no esta').toHaveLength(0);
    // Y no en silencio.
    expect(logged()).toMatch(/triage/i);
  });

  it('si el PUT falla, la foto NO cae al bucket publico', async () => {
    // El flujo del mecanico cae al publico porque ese comportamiento ya
    // existia. Aca no hay nada que preservar: una foto del triage puede
    // mostrar la casa o la calle del cliente.
    uploadStatus = 404;
    const res = await call({ ...PAID, triage_photo: DATA_URL });
    expect(res.statusCode).toBe(200);
    expect(uploads).toHaveLength(1);
    expect(uploads.some((u) => u.url.includes('/object/job-photos/'))).toBe(false);
    expect(uploads.some((u) => u.url.includes('/object/public/'))).toBe(false);
  });

  it('si Storage no contesta, la reserva se hace igual', async () => {
    const tore = new Error('fetch failed');
    const real = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      if (String(url).includes('/storage/v1/object/')) throw tore;
      return real(url, opts);
    };
    try {
      const res = await call({ ...PAID, triage_photo: DATA_URL });
      expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
      expect(db.bookings).toHaveLength(1);
      expect(logged()).toMatch(/fetch failed/);
    } finally {
      globalThis.fetch = real;
    }
  });

  it('una reserva sin foto no sube nada ni escribe de mas', async () => {
    const res = await call({ ...PAID });
    expect(res.statusCode).toBe(200);
    expect(uploads).toHaveLength(0);
    expect(photoWrites()).toHaveLength(0);
  });

  it('una foto arriba del tope se descarta y la reserva sigue siendo 200', async () => {
    // El cliente ya la corta antes de mandarla, pero el cliente puede mentir:
    // Vercel rechaza un cuerpo grande ANTES de que corra el handler, asi que
    // esto es el segundo cinturon, no el primero.
    const huge = Buffer.alloc(3_200_000, 0x41);
    const res = await call({ ...PAID, triage_photo: `data:image/jpeg;base64,${huge.toString('base64')}` });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(db.bookings).toHaveLength(1);
    expect(uploads, 'una foto enorme no viaja a Storage').toHaveLength(0);
    expect(photoWrites()).toHaveLength(0);
    expect(logged()).toMatch(/triage/i);
  });

  it('un payload que no es una imagen se descarta y la reserva sigue siendo 200', async () => {
    const junk = [
      { evil: 1 },
      ['a'],
      42,
      true,
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'https://evil.example/x.jpg',
      'javascript:alert(1)',
      '../../../etc/passwd',
      'not base64 at all!',
    ];
    for (const triage_photo of junk) {
      const res = await call({ ...PAID, triage_photo });
      expect(res.statusCode, JSON.stringify(triage_photo)).toBe(200);
      db.bookings.length = 0; // la franja se libera para la siguiente vuelta
    }
    expect(uploads, 'nada de eso llego a Storage').toHaveLength(0);
    expect(photoWrites()).toHaveLength(0);
  });

  it('una foto ausente (null, vacia) no es un error: no sube nada y no se queja', async () => {
    for (const triage_photo of [null, undefined, '']) {
      const res = await call({ ...PAID, triage_photo });
      expect(res.statusCode, JSON.stringify(triage_photo)).toBe(200);
      db.bookings.length = 0;
    }
    expect(uploads).toHaveLength(0);
    expect(logged()).not.toMatch(/photo/i);
  });

  it('la foto NO viaja en el INSERT: va en un UPDATE aparte, despues', async () => {
    await call({ ...PAID, triage_photo: DATA_URL });
    const inserts = world.writes.filter((w) => w.op === 'insert' && w.table === 'bookings');
    expect(inserts).toHaveLength(1);
    expect(Object.keys(inserts[0].payload)).not.toContain('triage_photo_ref');
    const writes = photoWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].op).toBe('update');
    expect(Object.keys(writes[0].payload)).toEqual(['triage_photo_ref']);
    expect(world.writes.indexOf(writes[0])).toBeGreaterThan(world.writes.indexOf(inserts[0]));
  });

  it('antes de correr la migracion, la reserva se hace igual (y queda en el log)', async () => {
    world.columnExists = false;
    const res = await call({ ...PAID, triage: { brand: 'Shimano' }, triage_photo: DATA_URL });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(db.bookings).toHaveLength(1);
    expect(db.bookings[0].service_name).toBe(SERVICE.name);
    expect(db.bookings[0].triage_photo_ref).toBeUndefined();
    expect(logged()).toMatch(/PGRST204|Could not find/);
  });

  it('nada escribe triage_video_ref: el video no se entrego', async () => {
    // La columna existe (scripts/add-triage-columns.sql) y queda en NULL a
    // proposito: un video no entra en el cuerpo de un POST.
    await call({ ...PAID, triage_photo: DATA_URL, triage_video: DATA_URL });
    const video = world.writes.filter((w) =>
      Object.prototype.hasOwnProperty.call(w.payload, 'triage_video_ref')
    );
    expect(video).toHaveLength(0);
    expect(db.bookings[0].triage_video_ref).toBeUndefined();
  });

  it('la foto y las respuestas son independientes: una foto sola tambien se guarda', async () => {
    const res = await call({ ...PAID, triage_photo: DATA_URL });
    expect(res.statusCode).toBe(200);
    expect(db.bookings[0].triage).toBeUndefined();
    expect(db.bookings[0].triage_photo_ref).toBeTruthy();
  });

  it('el hold tambien puede llevar la foto, y la segunda llamada no la borra', async () => {
    const hold = await call({ hold_only: true, hold_booking_id: null, triage_photo: DATA_URL });
    expect(hold.statusCode, JSON.stringify(hold.body)).toBe(200);
    const first = db.bookings[0].triage_photo_ref;
    expect(first).toBeTruthy();
    const booking = await call({
      hold_only: false,
      hold_booking_id: hold.body.id,
      payment_intent_id: 'pi_test_123',
    });
    expect(booking.statusCode, JSON.stringify(booking.body)).toBe(200);
    expect(db.bookings).toHaveLength(1);
    expect(db.bookings[0].triage_photo_ref).toBe(first);
  });
});
