# Triage de reserva — captura y guardado

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la reserva llegue con la marca, el modelo y el síntoma de la bici, guardados en la fila y visibles en Admin.

**Architecture:** Las preguntas son datos en un módulo nuevo (`js/triage-questions.js`), indexadas por la `category` del servicio con excepciones por nombre. La UI las dibuja dentro de la tarjeta de servicio ya seleccionada en el paso 1, sin pantalla nueva. Las respuestas viajan en el body de `handleCreateBooking` y se guardan en una columna `jsonb`.

**Tech Stack:** Vanilla JS (sin framework), Supabase/PostgREST, vitest, i18n propio con `js/i18n-es.js` y `js/i18n-zh.js`.

**Spec:** `docs/superpowers/specs/2026-10-22-triage-reserva-design.md`

**Alcance:** Es el **entregable 1 de 3** del spec. La cola de revisión y el webhook de WhatsApp llevan su propio plan. Al terminar éste, el triage se captura, se guarda y se ve en Admin; nadie revisa nada todavía, y eso está bien: el mecánico ya tiene lo que hoy no tiene.

## Global Constraints

- **Tres idiomas en el mismo commit.** Todo texto visible va en `js/i18n-es.js` y `js/i18n-zh.js` junto al inglés. `npm run check` corre `scripts/i18n-check.mjs` y bloquea el merge si falta uno.
- **Strings literales, no construidos.** `i18n-check` camina nodos de texto: una pregunta armada con concatenación o interpolación no la ve y se publica sin traducir.
- **Tokens, nunca hex.** `scripts/color-check.mjs` tiene presupuesto por archivo y falla si sube.
- **Bump de `sw.js` + `?v=`.** Al tocar `js/app.js` o `css/main.css`, `scripts/versioned-assets-check.mjs` dicta el hash exacto; además subir `CACHE_STATIC` en `sw.js`.
- **Nunca leer un `const` arriba de su declaración.** `scripts/tdz-check.mjs` lo bloquea.
- **Los tres gates por código de salida**, no por grep: `npm run check`, `npm run lint`, `npm test`.
- **El SQL no se corre desde acá.** Se entrega escrito para que Diego lo pegue en Supabase, y se documenta en `docs/RUNBOOK-SQL.md`.
- **Rama propia y PR.** Nunca push a `main`.

## Review Focus

Cinco entradas que el spec implica y que ninguna tarea ejercita por sí sola. Cada línea tiene su test asignado a la tarea dueña del código.

1. **Un servicio con una `category` que el catálogo no conoce** — Diego crea una categoría nueva en Admin. El paso 1 no puede romperse: cae en un juego por defecto. _(Tarea 1)_
2. **Un `triage` enorme o con claves inventadas** llega al servidor. Se recorta y se filtra; nunca se guardan megabytes de `jsonb` ni claves que nadie definió. _(Tarea 3)_
3. **El cliente contesta el triage y después cambia de servicio a otra categoría.** Las respuestas viejas no pueden viajar: se descartan. _(Tarea 4)_
4. **Una reserva creada sin triage** (desde la landing, desde Admin, o anterior a este cambio). Admin muestra "sin triage", no una pantalla rota. _(Tarea 5)_
5. **Emergency Service nunca llega al triage.** Ya se desvía en `js/app.js:1004` a su modal de WhatsApp; el catálogo no debe definirle preguntas que nadie va a ver. _(Tarea 1)_

---

## Estructura de archivos

| Archivo                                          | Responsabilidad                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `js/triage-questions.js` **(nuevo)**             | Los 9 juegos y las 20 excepciones, como datos. Sin DOM, sin red.                  |
| `js/app.js` **(modificar)**                      | Dibuja el triage en la tarjeta seleccionada; lo mete en `appState` y el borrador. |
| `api/auth.js` **(modificar)**                    | Valida y guarda `triage` en la fila.                                              |
| `js/admin.js` **(modificar)**                    | Muestra el triage en el detalle de la reserva.                                    |
| `scripts/add-triage-columns.sql` **(nuevo)**     | La migración, para que Diego la corra.                                            |
| `js/i18n-es.js`, `js/i18n-zh.js` **(modificar)** | Las traducciones de cada pregunta y opción.                                       |

---

### Task 1: El catálogo de preguntas

**Files:**

- Create: `js/triage-questions.js`
- Test: `tests/unit/triage-questions.test.js`

**Interfaces:**

- Produces: `questionsFor(service: {name: string, category: string}) -> Question[]`
  donde `Question = { id: string, ask: string, hint?: string, options?: string[], free?: boolean, optional?: boolean }`.
  `CATEGORY_SETS: Record<string, Question[]>`, `SERVICE_OVERRIDES: Record<string, (base: Question[]) => Question[]>` y `ALL_QUESTION_IDS: string[]` se exportan para los tests y para la Tarea 3.
  `labelFor(id: string) -> string` devuelve el `ask` de esa pregunta, o el `id` si no existe. **La Tarea 5 depende de esto** para mostrar etiquetas en vez de ids.

- [ ] **Step 1: Escribir los tests que fallan**

```js
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
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run tests/unit/triage-questions.test.js`
Expected: FAIL, `questionsFor is not defined`

- [ ] **Step 3: Escribir `js/triage-questions.js`**

Las preguntas salen de la tabla "Las preguntas, por categoría" y de "Las 20 excepciones" del spec. Reglas:

- Todo `ask`, `hint` y cada opción son **strings literales en inglés**, nunca interpolados: `i18n-check` camina nodos de texto y no ve un string construido.
- Las opciones cerradas terminan en `'I am not sure'`.
- `questionsFor` resuelve en este orden: excepción por nombre de servicio si existe, si no el juego de la categoría, si no `DEFAULT_SET` (tipo de bici + descripción libre).

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npx vitest run tests/unit/triage-questions.test.js`
Expected: PASS

- [ ] **Step 5: Traducir todo al español y al chino**

Agregar cada `ask`, `hint` y opción a `js/i18n-es.js` y `js/i18n-zh.js`.
Run: `npm run i18n:check` → Expected: `✓ i18n`

- [ ] **Step 6: Commit**

```bash
git add js/triage-questions.js tests/unit/triage-questions.test.js js/i18n-es.js js/i18n-zh.js
git commit -m "feat(triage): el catalogo de preguntas, por categoria"
```

---

### Task 2: La migración

**Files:**

- Create: `scripts/add-triage-columns.sql`
- Modify: `docs/RUNBOOK-SQL.md`
- Test: `tests/unit/triage-schema.test.js`

**Interfaces:**

- Produces: columnas `triage jsonb`, `triage_photo_ref text`, `triage_video_ref text` en `bookings`. Las de la cola (`review_state`, `reviewed_at`, `review_note`) **no entran acá**: son del entregable 2.

- [ ] **Step 1: Escribir los tests que fallan**

```js
it('la migración agrega las tres columnas del triage', () => {
  const sql = read('scripts/add-triage-columns.sql');
  for (const col of ['triage', 'triage_photo_ref', 'triage_video_ref']) {
    expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}`, 'i'));
  }
});

it('es idempotente: se puede correr dos veces', () => {
  expect(read('scripts/add-triage-columns.sql')).not.toMatch(/ADD COLUMN(?!\s+IF NOT EXISTS)/i);
});

// Referencia, no URL - mismo patron que api/_job-photos.js.
it('guarda referencias, no URLs', () => {
  const sql = read('scripts/add-triage-columns.sql');
  expect(sql).not.toMatch(/photo_url|video_url/);
});

it('el runbook la nombra, para que alguien la corra', () => {
  expect(read('docs/RUNBOOK-SQL.md')).toContain('add-triage-columns.sql');
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/unit/triage-schema.test.js`
Expected: FAIL, el archivo no existe

- [ ] **Step 3: Escribir el SQL y la entrada del runbook**

`ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS ...` para las tres. Encabezado con qué guarda cada una y por qué `triage` es `jsonb` (las preguntas cambian por categoría; una columna por pregunta es una migración por pregunta).

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run tests/unit/triage-schema.test.js` → Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/add-triage-columns.sql docs/RUNBOOK-SQL.md tests/unit/triage-schema.test.js
git commit -m "chore(db): columnas del triage en bookings"
```

---

### Task 3: El servidor guarda el triage

**Files:**

- Modify: `api/auth.js` — `handleCreateBooking` (destructuring en :1089, fila en :1493)
- Test: `tests/unit/triage-server.test.js`

**Interfaces:**

- Consumes: `ALL_QUESTION_IDS` de la Tarea 1.
- Produces: `sanitizeTriage(raw: unknown) -> object | null`, exportada desde `api/auth.js`. `handleCreateBooking` acepta `triage` en el body y escribe `row.triage`.

- [ ] **Step 1: Escribir los tests que fallan**

```js
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
  expect(sanitizeTriage({})).toBeNull();
});

it('no acepta un array ni un string', () => {
  expect(sanitizeTriage(['a'])).toBeNull();
  expect(sanitizeTriage('brand=Shimano')).toBeNull();
});

it('la fila que se inserta lleva triage', () => {
  const src = read('api/auth.js');
  const row = src.slice(src.indexOf('const row = {'), src.indexOf('const row = {') + 2000);
  expect(row).toMatch(/triage:\s*sanitizeTriage\(/);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run tests/unit/triage-server.test.js`
Expected: FAIL, `sanitizeTriage is not exported`

- [ ] **Step 3: Implementar `sanitizeTriage` y engancharla**

Acepta solo objetos planos; filtra contra `ALL_QUESTION_IDS`; recorta cada valor a 200 caracteres y el objeto entero a 4 KB; devuelve `null` si queda vacío. Agregar `triage` al destructuring del body y `triage: sanitizeTriage(triage)` a `row`.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npx vitest run tests/unit/triage-server.test.js` → Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/auth.js tests/unit/triage-server.test.js
git commit -m "feat(triage): el servidor valida y guarda las respuestas"
```

---

### Task 4: El triage en el paso 1

**Files:**

- Modify: `js/app.js` — handler del click en :997, `saveBookingDraft` en :149
- Modify: `css/main.css`
- Test: `tests/unit/triage-ui.test.js`

**Interfaces:**

- Consumes: `questionsFor()` de la Tarea 1.
- Produces: `window.appState.triage` como objeto `{ [id]: valor }`, incluido en el borrador de `localStorage` **y en el body de la petición `create-booking`** — sin eso el triage no llega nunca al servidor de la Tarea 3. `renderTriage(service) -> string` y `applyServiceChange(state, svc) -> void` quedan accesibles para el test por extracción, igual que en `tests/unit/screen-error-state.test.js`.

- [ ] **Step 1: Escribir los tests que fallan**

Mismo método que `tests/unit/screen-error-state.test.js`: sacar la función de `js/app.js` y **ejecutarla** en un `vm`, no leer el fuente.

```js
it('dibuja las preguntas de la categoria del servicio elegido', () => {
  const html = renderTriage({ name: 'Brake Pad Install', category: 'Brakes' });
  expect(html).toContain('Shimano');
  expect(html).toContain('I am not sure');
});

it('no dibuja nada para Emergency Service', () => {
  expect(renderTriage({ name: 'Emergency Service', category: 'Scheduled services' })).toBe('');
});

// Review Focus 3.
it('cambiar a un servicio de otra categoria borra las respuestas viejas', () => {
  const state = {
    service: { name: 'Brake Pad Install', category: 'Brakes' },
    triage: { brand: 'Shimano' },
  };
  applyServiceChange(state, { name: 'Chain Install', category: 'Drivetrain' });
  expect(state.triage).toEqual({});
});

it('cambiar a un servicio de la MISMA categoria conserva lo contestado', () => {
  const state = {
    service: { name: 'Brake Pad Install', category: 'Brakes' },
    triage: { brand: 'Shimano' },
  };
  applyServiceChange(state, { name: 'Brake Bleed', category: 'Brakes' });
  expect(state.triage).toEqual({ brand: 'Shimano' });
});

it('el borrador guarda el triage', () => {
  expect(read('js/app.js')).toMatch(/BOOKING_DRAFT_KEY[\s\S]{0,400}triage/);
});

// Todo el triage es opcional (spec, decision 5): nada de lo que dibuja puede
// tocar el boton Continuar.
it('el triage no bloquea Continuar', () => {
  const src = read('js/app.js');
  const fn = src.slice(src.indexOf('function renderTriage('));
  expect(fn.slice(0, fn.indexOf('\n}\n'))).not.toContain('s1-continue');
});

// El triage tiene que LLEGAR al servidor, no solo quedar en appState.
it('la peticion de crear la reserva manda el triage', () => {
  const src = read('js/app.js');
  const body = src.slice(src.indexOf("role: 'create-booking'"));
  expect(body.slice(0, 900)).toMatch(/triage:/);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run tests/unit/triage-ui.test.js` → Expected: FAIL

- [ ] **Step 3: Implementar el dibujado y el estado**

`renderTriage(service)` devuelve el bloque "todo a la vista" (chips planos, sin acordeón) para insertar dentro de la tarjeta con `.selected`. Clases nuevas en `css/main.css` usando tokens. `applyServiceChange(state, svc)` vacía `state.triage` cuando cambia la categoría. Sumar `triage` a `saveBookingDraft` y a `loadBookingDraft`.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npx vitest run tests/unit/triage-ui.test.js` → Expected: PASS

- [ ] **Step 5: Subir los hashes y el service worker**

Run: `npm run check` → copiar los `?v=` que dicte para `js/app.js` y `css/main.css` en `index.html` y `landing.html`; subir `CACHE_STATIC` en `sw.js`.
Expected: `npm run check` sale 0.

- [ ] **Step 6: Commit**

```bash
git add js/app.js css/main.css index.html landing.html sw.js tests/unit/triage-ui.test.js
git commit -m "feat(triage): las preguntas dentro de la tarjeta del servicio"
```

---

### Task 5: El triage en Admin

**Files:**

- Modify: `js/admin.js` — detalle de la reserva (handler en :4725)
- Modify: `css/admin.css`
- Test: `tests/unit/triage-admin.test.js`

**Interfaces:**

- Consumes: la columna `triage` de la Tarea 2; las etiquetas de `js/triage-questions.js`.
- Produces: `renderTriageBlock(triage: object | null) -> string`.

- [ ] **Step 1: Escribir los tests que fallan**

```js
it('muestra cada respuesta con su etiqueta, no con su id', () => {
  const html = renderTriageBlock({ brand: 'Shimano', symptom: 'Squealing' });
  expect(html).toContain('Shimano');
  expect(html).not.toContain('brand');
});

// Review Focus 4.
it('una reserva sin triage dice que no lo tiene, no revienta', () => {
  for (const v of [null, undefined, {}]) {
    expect(renderTriageBlock(v)).toContain('Sin triage');
  }
});

it('escapa lo que escribio el cliente', () => {
  expect(renderTriageBlock({ note: '<img src=x onerror=alert(1)>' })).not.toContain('<img');
});

it('colorea desde tokens, no desde hex', () => {
  const css = read('css/admin.css');
  const block = css.slice(css.indexOf('.triage-'));
  expect(block).not.toMatch(/#[0-9a-fA-F]{3,6}/);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run tests/unit/triage-admin.test.js` → Expected: FAIL

- [ ] **Step 3: Implementar `renderTriageBlock(triage)`**

Devuelve el bloque para el detalle de la reserva: cada respuesta con su etiqueta en inglés sacada de `js/triage-questions.js`, escapada con el `esc()` que ya usa `js/admin.js`. Sin triage devuelve el estado vacío.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npx vitest run tests/unit/triage-admin.test.js` → Expected: PASS

- [ ] **Step 5: Subir el `?v=` de `js/admin.js` y `css/admin.css`**

Run: `npm run check` → aplicar los hashes que dicte en `admin.html`. Expected: sale 0.

- [ ] **Step 6: Commit**

```bash
git add js/admin.js css/admin.css admin.html tests/unit/triage-admin.test.js
git commit -m "feat(triage): el detalle de la reserva muestra lo que contesto el cliente"
```

---

### Task 6: La foto

**Files:**

- Modify: `api/_job-photos.js`, `api/auth.js`, `js/app.js`
- Modify: `docs/RUNBOOK-SQL.md` (crear el bucket a mano)
- Test: `tests/unit/triage-photo.test.js`

**Interfaces:**

- Consumes: `JOB_PHOTO_BUCKET` y el firmado de `api/_job-photos.js`.
- Produces: `triagePhotoRef(bookingId: string, ts: number) -> string`.

**Esta tarea va en su propio PR.** La foto es opcional por diseño, así que las cinco anteriores ya entregan un triage que funciona.

- [ ] **Step 1: Escribir los tests que fallan**

```js
it('la referencia vive en la carpeta de la reserva', () => {
  expect(triagePhotoRef('abc-123', 1700000000)).toBe(
    'job-photos-private/jobs/abc-123/triage_1700000000.jpg'
  );
});

it('guarda referencia, nunca una URL firmada', () => {
  expect(triagePhotoRef('abc-123', 1)).not.toMatch(/^https?:/);
});

// La regla que importa: una foto no puede voltear un cobro.
it('si el movimiento falla, la reserva se crea igual', async () => {
  const res = await createBookingWithPhotoMoveFailing();
  expect(res.status).toBe(200);
  expect(res.body.triage_photo_ref).toMatch(/^job-photos-private\/triage\//);
});

it('sin bucket creado, la reserva se crea sin foto', async () => {
  const res = await createBookingWithNoBucket();
  expect(res.status).toBe(200);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run tests/unit/triage-photo.test.js` → Expected: FAIL

- [ ] **Step 3: Implementar la subida, el movimiento y el respaldo**

Subida a `triage/<token-del-borrador>/` con URL firmada de una vez, igual que el mecánico. En `handleCreateBooking`, mover a `jobs/<booking>/triage_<ts>.jpg` **best-effort**, dentro de su propio `try`: si falla, la referencia queda apuntando a la carpeta de paso y la reserva sigue. Documentar en el runbook que el bucket lo crea Diego a mano.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npx vitest run tests/unit/triage-photo.test.js` → Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/_job-photos.js api/auth.js js/app.js docs/RUNBOOK-SQL.md tests/unit/triage-photo.test.js
git commit -m "feat(triage): la foto va a la carpeta de su reserva"
```

---

## Cierre

- [ ] **Los tres gates por código de salida**

```bash
npm run check; echo "check=$?"
npm run lint;  echo "lint=$?"
npm test;      echo "test=$?"
```

- [ ] **Entrada en `docs/PENDIENTES.md`** con qué se construyó, qué quedó afuera y el SQL que Diego tiene que correr.
- [ ] **PR**, con el SQL de `scripts/add-triage-columns.sql` pegado en el cuerpo para que lo tenga a mano.
