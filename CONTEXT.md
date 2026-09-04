# CONTEXT — Dr. Bike Sydney (session journal)

## Current state (2026-09-04) - read this first

**Sesion de cierre de los hallazgos de seguridad de la auditoria del profesor
sobre `f496270`.** Nueve PR. Siete mergeados y en produccion, dos esperando.

### Lo que se cerro

| PR | Hallazgo | Estado |
|---|---|---|
| #411 | XSS almacenado en la app del mecanico | en produccion |
| #412 | El importe lo decidia el telefono | en produccion |
| #413 | Rotar el PIN no revocaba sesiones | en produccion + SQL corrido |
| #414 | MFA del admin (modo observar) | en produccion, **sin bloquear** |
| #415 | El presupuesto elegia el servicio | en produccion, **verificado ahi** |
| #416 | Medir el nivel del token en el login | en produccion |
| #417 | Migraciones sin fila en el runbook | en produccion |
| #418 | Fotos de reclamos en URL adivinable | abierto, falta bucket |
| #419 | El SQL de RLS + AAL2 | abierto, no se corre solo |

### EL DATO QUE DESBLOQUEA TODO LO DEMAS

El punto 96 dejo dos preguntas abiertas **a proposito**, porque asumirlas
llevaba al apagon por los dos lados. Produccion las contesto el 04-sep:

```
[admin-aal] {"verdict":"aal2","aal":"aal2","amr":["totp","password"]}
```

- **El JWT de este proyecto SI trae el claim `aal`**, y vale `aal2`.
- **El token posterior al TOTP SI es distinto** del que da la contrasena. Si
  hubiera sido el mismo, encender `ADMIN_REQUIRE_AAL2` habria rechazado **el
  login correcto**.

Sin ese renglon, el runbook de RLS (#419) no se podia escribir. Quien lo lea
para justificar apurar el encendido: los datos son de UNA sesion, no de dias.

### Y UN HALLAZGO QUE CAMBIA EL ALCANCE DEL PUNTO 96

**Abrir el panel entero no genera ni un renglon `[admin-aal]`.** Verificado en
los logs de produccion despues de que Diego entrara y usara el tablero:
`verifyAdminSession` corre solo en las 14 rutas `admin-*`, y **el panel lee
Supabase directo desde el navegador**.

O sea: cerrar el servidor cubre menos de lo que parece. **Las politicas RLS son
la mitad que falta**, y eso ya no es un razonamiento - hay dos evidencias
(punto 98). Ahi vive #419.

### Verificado EN PRODUCCION, no en local

```
GET  /mechanic.html          -> js/mechanic.js?v=c1d856b1ef   (el hash de #411)
POST /api/auth               -> 400 {"error":"Unknown service"}
     {"role":"request-quote","service_name":"ZZZ-TEST-NO-EXISTE",...}
```

El 400 es la prueba de #415: antes ese mismo pedido escribia una fila con el
nombre y el precio que mandaba el navegador.

### PENDIENTE DIEGO, en orden de importancia

1. **Mergear #418 y #419.** #419 va despues de #418 (lo contiene).
2. **Crear el bucket `claim-evidence`** (Storage > New bucket > **Public: NO**).
   Sin el, las fotos de reclamos siguen en el bucket publico - aunque la ruta
   ya no se puede adivinar, que era la via practica.
3. **Usar el panel unos dias** y avisar. Con esos logs se decide si se enciende
   `ADMIN_REQUIRE_AAL2=1` en Vercel. **Ahora mismo no bloquea nada.**
4. **Leer `docs/RUNBOOK-RLS-AAL2.md` entero** y correrlo paso a paso, sin apuro.
   Un cambio de RLS **no tiene Instant Rollback**.

### CUATRO TRAMPAS PROPIAS DE ESTA SESION, que valen mas que los hallazgos

Las cuatro salieron de **poner el bug de vuelta y exigir el rojo**. Ninguna se
habria visto leyendo el codigo.

1. **`indexOf` devuelve -1, y -1 es menor que todo.** Un test afirmaba
   `indexOf(A) < indexOf(B)` para probar un orden. Al mutar, A desaparecia,
   `indexOf` daba -1, y el test **quedaba verde sobre exactamente el bug que
   vigilaba**. Es la familia de "un patron que no se encuentra no hace fallar
   al test que lo busca", que este repo ya tenia anotada tres veces.
2. **`not.toContain('onerror=')` es testear el proxy.** Un payload BIEN
   escapado se lee `&lt;img src=x onerror=alert(1)&gt;` y contiene `onerror=`
   como texto inerte. La asercion fallaba sobre el codigo ya arreglado. Lo que
   funciona es contar las aperturas de etiqueta contra un render inocuo: un
   valor bien escapado aporta CERO, sea cual sea su contenido.
3. **Un `fetch` sin abortar delante de cada pedido de admin.** Lo agrego el
   propio PR que existe para evitar apagones. Aparecio como un timeout de 5s en
   un test ajeno, no leyendo el diff. Lleva `AbortSignal.timeout(4000)`.
4. **`await import('api/auth.js')` en un test que no lo necesitaba.** Con la
   suite entera corriendo pasa de 5s y muere - el mismo timeout del punto 88.
   La funcion ni siquiera se exporta: las aserciones eran sobre el fuente.

### DOS PATRONES QUE ESTA SESION USO TRES VECES Y CONVIENE COPIAR

- **Observar antes de bloquear.** El AAL2 (#414), el techo del importe (#412) y
  el runbook de RLS (#419) salieron los tres calculando el veredicto,
  registrandolo, y **dejando pasar**. Los logs deciden cuando bloquear, no la
  lectura del codigo. En #412 y #414 el interruptor es una variable de entorno,
  que se apaga **sin consumir el unico paso de rollback de Vercel**.
- **Tolerar que la columna no exista.** `scripts/*.sql` se corren a mano, asi
  que el codigo llega antes que la base. Al LEER: `Number(x) || 0`, que sin
  columna da 0 igual que el default - inerte, nunca equivocado. Al ESCRIBIR:
  **leer la columna primero**, porque PostgREST devuelve 500 ante una columna
  desconocida, que es exactamente como el `pin: null` rompia el boton de Reset
  PIN. Y decirle a Diego si la revocacion se aplico o no, en vez de mostrarle
  "PIN reseteado" mientras el telefono viejo sigue entrando.

### Lo que se anoto y NO se empezo

- **`job-photos` sigue publico** para fotos de trabajos, perfiles de mecanicos
  y resenas. Hacerlo privado rompe cada `<img>` de la app. Las rutas de esas
  tres llevan un UUID de reserva o de contacto, asi que **no son enumerables**
  como si lo era la de reclamos - por eso se cerro primero esa.
- **La extension del archivo sale de `file.name.split('.').pop()`** en las tres
  subidas del navegador, sin validar el tipo. Requiere ser mecanico o admin
  autenticado, y el bucket es publico: subir un `.html` daria hosting arbitrario
  en el dominio de Supabase. Riesgo bajo, real, sin arreglar.
- **`parts_charged.discount_amount`** sigue viniendo del telefono. Solo BAJA el
  cobro, asi que no es parte de la cadena de ataque.

### Test count: 1549. `check`, `lint` y `test` en exit 0.

---

## Current state (2026-09-03) — read this first

- **La auditoria de 20 puntos ya no vive en un chat.** Estaba referenciada en
  17 lugares de `docs/PENDIENTES.md` y en dos lineas de este archivo que se
  contradecian ("10 de 20 cerrados" contra "none of it is fixed yet"), pero la
  lista en si no existia en ningun archivo. Reconstruida desde evidencia del
  repo en **`docs/AUDITORIA-PRELANZAMIENTO.md`**: **17 de 20 cerrados**, y los
  puntos **6, 16 y 18 declarados como huecos** - no aparecen en ninguna parte y
  no se inventaron. Ese archivo reemplaza a las dos lineas viejas.

- **La base esta al dia, y es un dato, no una suposicion.** Diego corrio la
  consulta del runbook el 03-sep: `Success. No rows returned`, o sea **las 41
  migraciones aplicadas**. Eso cerro las 12 que desde el 10-ago no tenian
  constancia de nada. La consulta ademas no miraba dos migraciones
  (`enable-realtime-bookings.sql` y `lock-public-views.sql`) porque no son
  columnas ni tablas: una es una publicacion y la otra son permisos, y ninguna
  deja rastro en `information_schema.columns`. Ya estan en la consulta.

- **EL HALLAZGO DE LA SESION: ningun cliente invitado podia dejar una resena.**
  El pedido de Diego era "dejar armado el sistema de captacion de resenas". Ya
  estaba armado entero y con guards - lo que no estaba era que funcionara para
  el unico cliente que un negocio sin lanzar tiene. Dos muros en archivos
  distintos, ninguno roto por separado:

  ```
  js/supabase.js  sin sesion -> "Please sign in to leave a review."
  api/auth.js     booking.client_id !== client_id -> 403
  ```

  Y `api/auth.js:1341` crea las reservas de invitado con `client_id: null`. Esa
  condicion no podia dar verdadera nunca para un invitado, ni creandose una
  cuenta despues. **Todos recibian el email de resena y ninguno podia dejarla.**
  Arreglado con el `tracking_token` como segunda credencial (PENDIENTES 89).

- **Y tuvo dos secuelas, las dos del mismo tipo: dos listas que tienen que
  coincidir y nada las ataba.**
  - **90:** el reintento (`send-cron?type=completion-retry`) rearma el email
    desde SU PROPIA consulta, que no pedia `tracking_token`. Le mandaba el link
    viejo justo al cliente cuyo primer intento habia fallado - el unico al que
    el reintento existe para rescatar.
  - **91:** hay DOS caminos por los que una resena sale a internet y solo uno
    recortaba el nombre. `GET /api/chat?type=reviews` es publico, sin auth, lee
    `bookings` con la service key y devolvia **nombre y apellido enteros**. No
    lo llama nada del repo y responde igual desde internet. Hoy contesta vacio
    porque no hay resenas; se volvia fuga sola el dia del primer trabajo.

- **VERIFICADO EN PRODUCCION, no en local.** Despues de mergear:

  ```
  POST /api/auth {"role":"client-review","tracking_token":"<uuid al azar>","rating":5}
    -> 404 "Booking not found"     (antes: 400 "access_token and client_id required")
  ```

  El 404 es la prueba: el servidor **acepto el token como credencial** y fue a
  buscar la reserva. El camino del invitado esta vivo. Ademas `sw.js` sirve
  `drbike-static-v121` y `index.html` el `?v=` nuevo de `js/app.js`.

- **Tres trampas propias en esta sesion, que valen mas que los hallazgos.**
  1. `export { x } from './y.js'` re-exporta pero **no trae el nombre al
     alcance local**, y `auth.js` lo llamaba doce lineas mas abajo:
     `ReferenceError` en produccion que `node --check` da por bueno.
  2. Un guard que escaneaba `booking.<campo>` matcheaba **dentro de un
     comentario**.
  3. Y el codigo que sacaba los comentarios **no sacaba nada**: `//.*$` sobre
     CRLF no sustituye, porque `.` no matchea un terminador de linea. Es el
     mismo error de CRLF que este repo ya tenia anotado.

  Las tres aparecieron por correr los tests **esperando verlos fallar**. Todos
  los guards de esta sesion se verificaron reintroduciendo el bug a proposito.

- **Lo que sigue sin probarse, y no es codigo faltante:** la cadena de resena de
  punta a punta con un trabajo real completado (necesita un mecanico de verdad),
  el punto 15 con un lector de pantalla real, y los 3 puntos de la auditoria que
  no se recuperaron.

- **PENDIENTE DIEGO:** reemitir su PIN desde Admin (sigue con el de 4 digitos),
  el abogado de marcas (fecha real: 31-ene-2027), el link corto de "escribir
  resena" desde Google Business Profile - hoy el boton cae en la ficha de Maps y
  cada tap de mas pierde resenas -, y decidir si se borra
  `/api/chat?type=reviews`, que no lo llama nada del repo.

- Test count: **1424**, en 102 archivos. `npm run check` son **12** scripts.

## Current state (2026-08-31)

- **Ritmo: sin apuro.** Diego, al cierre: *"no te apures con nada, si lo
  podemos hacer con paciencia tenemos 2 meses mas de trabajo antes del
  lanzamiento"*. Nada se despacha a las corridas.

- **UNA CORRECCION QUE IMPORTA MAS QUE EL CODIGO.** Le dije a Diego que dos
  clientes eligiendo el mismo horario dejan al segundo **cobrado y sin
  reserva**, y use eso para empujar un refactor urgente del flujo de pago.
  **Es falso.** `api/auth.js:1319` atrapa el `23505` de `bookings_unique_slot`
  y **reembolsa** antes de devolver 409, avisandole al cliente. Lo verifique
  leyendo el codigo DESPUES de haberlo afirmado, y se lo corregi a Diego.
  La carrera existe; la perdida de plata no. Quien lea esto para justificar
  cirugia urgente sobre los pagos, que lea ese handler primero.

- **`feat/booking-before-payment` esta PARKED, empujada, SIN PR.** Contiene la
  logica pura de retenciones (`api/_slot-hold.js`, 26 tests) y el descuento de
  retenciones vencidas en `handleGetAvailability`. **No esta conectada**:
  hacerlo toca create-booking, el webhook y el flujo de invitados.
  Sin migracion a proposito - una retencion es una reserva `pending` SIN
  payment intent que vence por `created_at`, y las tres columnas ya existen.
  La expiracion es perezosa porque Vercel Hobby no permite crons sub-diarios.

- **#374 mergeado:** nada se reembolsa antes de avisarle a Diego. El barrido
  corre UNA VEZ POR DIA, asi que un pago hecho poco despues de una corrida ya
  pasaba las 24h la primera vez que se lo veia e iba derecho a reembolso -
  Diego recibia solo el aviso del reembolso, nunca el del huerfano. Backstop
  a 72h por si el WhatsApp esta caido.

- **El WhatsApp del admin SI esta configurado** (`+61433963250`, verificado por
  Diego con SQL). De ese dato depende que llegue cualquier aviso.

- **PENDIENTE DIEGO:** registrarse en GST eligiendo como fecha de efecto la de
  su primera compra de herramientas/van - no facturo a ningun cliente todavia,
  asi que retroactivar no le cuesta nada y le habilita reclamar lo comprado.
  Con esa fecha se activa el flag `GST_REGISTERED`. Y guardar el primer mail
  de backup (llega ~19:00 hora de Sydney) para probar una restauracion.

- **El banner de cookies le gusto.** Test count: **997**.

## Current state (2026-08-30)

- **Accesibilidad (puntos 13 y 15), cerrados al final de la sesion.** El campo
  del PIN del mecanico apagaba el anillo de foco: se tabulaba a el y nada en
  pantalla decia donde estabas. Eran 6 reglas con `outline:none`, 4 de ellas
  en la regla BASE. Y no habia "saltar al contenido" en ninguna parte.
  El anillo global vive en `css/variables.css` porque **es la unica hoja que
  cargan las cinco superficies** - track.html no carga ninguna otra.
- **Un lector de pantalla no se enteraba de nada.** Dos regiones `aria-live`
  en toda la app, las dos spinners de carga. Ahora `announce()` cubre errores
  (interrumpiendo), el cambio de paso del asistente, y el mapa (que es un
  lienzo de tiles: `aria-hidden` + `#map-alt` en texto).
  **NO se probo con un lector real** - eso necesita navegador.
- **`css/main.css` no estaba vigilado por `versioned-assets-check`.** Lo edite,
  `npm run check` quedo VERDE, y el arreglo habria sido invisible para todo
  navegador que ya entro. Mismo hueco que mordio a mechanic.html cuatro dias
  antes. Ya esta en la lista.
- **El guard de traducciones pasaba sobre traducciones faltantes.** Cortaba el
  diccionario hasta el FINAL del archivo, asi que para `es` incluia el bloque
  `zh` entero y una cadena traducida solo al chino satisfacia el chequeo del
  espanol. Encontrado **borrando una a proposito**. Corregido en
  `scripts/a11y-check.mjs` y en `tests/unit/keyboard-access.test.js`.
- **Punto 14 (contraste) medido, NO arreglado.** 9 tokens del modo oscuro caen
  bajo 4.5:1, y **6 fallan en los DOS papeles a la vez** (como texto Y con
  texto blanco encima). No se arregla subiendo el numero: un color legible
  sobre tarjeta oscura tiene que ser claro, y uno que aguanta texto blanco
  tiene que ser oscuro. La salida es separar los papeles en tokens distintos y
  migrar ~207 usos. Es de la escala del punto 10. La medicion completa esta en
  el chip de tarea que quedo abierto.
- **Test count: 994.** check, lint, a11y:check, consent:check y rls:check en
  exit 0. **10 de 20 puntos de la auditoria cerrados.**
- **PENDIENTE DIEGO, lo unico que bloquea:** la fecha de registro de GST (con
  eso se activa el flag y factura/panel/BAS/chatbot pasan a modo registrado),
  mirar el banner de cookies en celular y compu, recorrer una reserva solo con
  Tab, y guardar el primer mail de backup para probar una restauracion.
- **Leccion que se repitio CUATRO veces:** un test que nunca se vio fallar no
  prueba nada. Dos veces un guard matcheo su propio comentario, una vez CRLF
  hizo que un regex no borrara nada, y una vez el corte del diccionario dejo
  pasar una traduccion faltante. Todos los guards de esta sesion se
  verificaron re-introduciendo el bug a proposito.

## Current state (2026-08-27) — read this first

- **`main` is at the merge of #355.** The block below covers #346 through #355,
  shipped across 26-27 August. Everything is merged; **no PR is open.**

- **The one that mattered most: dark mode had no token layer at all.**
  `css/variables.css` declared 98 colours and not one had a dark value. Each
  surface patched its own classes by hand - 149 `[data-theme='dark']` selectors
  in `css/admin.css` alone - and whatever nobody remembered to patch kept its
  LIGHT value in silence. It took **two** passes to fix, and the second one is
  the lesson: the first pass gave every token a dark value, measured ink against
  the grounds (14:1, comfortable) and shipped. Diego looked at it and said "todo
  es azul". The page was `#0f1a2e` and the card `#152035` - **1.07:1**. The check
  had never measured the grounds against EACH OTHER, so nothing noticed the cards
  had no edge. `scripts/dark-theme-check.mjs` now measures ground separation,
  contrast in both roles, and rejects colour literals in `js/admin.js` and
  `js/mechanic.js` - which had to be widened three times, because a colour gets
  chosen three ways (inline, inside a ternary, and in a map assigned to a
  variable). `js/mechanic.js` is now at **zero** hand-written colours.

- **`applyDarkModeInline()` is gone.** It was a THIRD dark-mode mechanism: a DOM
  walker on a timer that forced a neutral palette while the tokens paint navy, so
  one screen carried two darks. It only ever covered elements that existed the
  moment it ran, which is why it needed eight call sites and still missed things.

- **Three "it doesn't update" reports were three unrelated bugs.** Admin listened
  and never repainted; the client SPA had no `bookings` subscription at all; the
  mechanic's code was correct all along and its events were not arriving, because
  `bookings` was not in the `supabase_realtime` publication. All three screens now
  also refresh on tab focus and on a slow timer, so none of them depends on that
  database setting being right.

- **Referral credits could never be spent.** `handleApplyReferral()` credited both
  sides and nothing anywhere subtracted the number again. The app promised $15 and
  the server paid $10. Both fixed; the credit is spent as a booking-level discount
  and comes back if the booking is cancelled.

- **The team section was empty by design, and nobody had noticed.**
  `handlePublicMechanics` started from completed bookings, so a brand-new business
  showed "coming soon" to every visitor until the first job finished - the one
  moment that section exists for. Inverted to start from active mechanics.

- **Two SQL migrations were run by Diego on 27-Aug and are LIVE:**
  `referral-credits-spendable.sql` (verified: `column_ok = 1`, `functions_ok = 2`)
  and `enable-realtime-bookings.sql` (verified: bookings, job_messages and
  mechanic_locations all broadcasting).

- **Numbers to check, not to trust:** 848 tests, 58 entries in
  `docs/PENDIENTES.md`, 7 checks in `npm run check`. Run them; this line ages.

### What is NOT done

- ~~**A 20-point pre-launch audit exists and none of it is fixed yet.**~~
  **SUPERSEDED 2026-09-03: the list now lives in
  `docs/AUDITORIA-PRELANZAMIENTO.md`, with per-point evidence.** 17 of the 20
  points were identified and are closed; points 6, 16 and 18 could not be
  recovered from anywhere in the repo and are declared as holes, not as done.
  Every gap this paragraph named is closed: the 4-digit PIN (PR #398, 6 digits
  now), analytics before consent (it was 44 pages; `consent-gate.mjs` guards it),
  and `js/app.js` at 295 KB - which was measured wrong, it travels in 78 KB; the
  real weight was `js/i18n.js` shipping all three languages to every visitor.
  **RLS was tested with the anon key**: RLS itself was fine, the public views
  bypassed it, and `npm run rls:check` re-probes production on every run.

- **Diego reports still seeing two scrollbars on the desktop landing.** The cause
  found and fixed on 26-Aug was `overflow-x: hidden` on BOTH `html` and `body`,
  which makes both elements scroll containers. Production serves the fixed CSS
  (verified with `curl`). Either his browser is still on the cached stylesheet, or
  there is a second cause nobody has found. **Unresolved.**

- **Google reviews: decided, do not re-investigate.** Google's API can read and
  reply to reviews but cannot create one. The app keeps its own rating and offers
  a link to Google.

- **Suburb pages stay blocked until November 2026**, when Diego is in Sydney and
  can supply real local facts. Do not invent them.

### Rules this session learned the hard way

- **`npm run check` must be judged by its exit code.** Filtering its output with
  `grep "^x"` hid the budget lines and passed a check that was failing. CI caught
  it; the local run had said green.
- **`mechanic.html`'s `?v=` are content hashes now**, inside
  `scripts/versioned-assets-check.mjs`. They used to be hand-typed dates, and a
  merge between two branches that had both bumped that line resolved to the OLDER
  value and silently undid a cache bust, with nothing red anywhere.

---

## Current state (2026-08-16) — superseded, kept for the history below it

- **`main` is at the merge of #253.** Shipped today, in order: #244 (suburb
  matching), #245 + #249 (the Analytics/Finance audit written down), #246
  (client reschedule), #247 (bookings blocking their own slot), #248 (client
  counters), #250 (Finance errors + revenue date), #251 (margins), #252 (LTV
  identity, suburb list, CSV), #253 (availability blocks). Every one was
  verified on `drbikesydney.com.au` after merging, not just merged.

- **One root cause produced four separate live failures: the app carried two
  time vocabularies and nothing converted between them.**
  `/api/auth?role=get-availability` answers in 12-hour labels (`"8:00 AM"`),
  `bookings.scheduled_time` is a `time` column PostgREST returns as
  `"10:00:00"`, and the admin's block modal wrote a third shape (`'8:30'`).
  What it broke: **every client reschedule 400'd** (it posted the label to an
  endpoint validating `HH:MM`); **no booking blocked its own slot**, so the
  same hour stayed on offer to the next client; and **the Block availability
  button never stored a single row**. `js/time-format.js` (client) and
  `slotToMinutes` (server) now read all three shapes.

- **`availability` was migrated by hand on 2026-08-16.**
  `scripts/fix-availability-blocks.sql` ran in the SQL Editor: `service_id`
  is nullable, `van_number` is NOT NULL default 0 (0 = all vans), and the
  unique key is `(date, time_slot, van_number)`. Verified by Diego's own
  query output. The table held **0 rows** before this - the button had never
  once saved anything.

- **PENDING DIEGO, the only thing not verified:** block a slot in Admin >
  Calendar and confirm it disappears from the client booking flow. The logic
  has 15 tests and the right code is live, but nobody has pressed the button
  against the real database yet.

- **Still open, needs an accountant not a developer:** `docs/PENDIENTES.md`
  20.3 - the BAS screen reports **$0 of GST credits (1B)** while expenses are
  loaded, so it overstates the GST owed. Deciding which expenses carry a
  credit is not a code decision.

- **Still open, known and documented:** 18.3 (the margin is a flat lifetime
  average of parts spend, honest about itself now but only `parts_inventory`
  makes it true) and everything under `docs/PENDIENTES.md` 20.8 that this
  audit never covered: `/api/analytics` (the Traffic and Checkout cards) and
  `loadDashboard()`.

- **Test count: 352.** `npm run check` and `npm run lint` are clean on `main`.

## Current state (2026-08-10) — read this first

- **`main` is at the merge of #217.** Shipped today, in order: #214 (the SQL
  runbook), #215 (Admin > Orphan Payments), #216 (the mechanic's offline
  completion queue + the server guard against the replay), #217 (the parked job
  is named on its card and stops saying "Done"). The last two were confirmed
  live on `drbikesydney.com.au`, not just merged.

- **Completing a job now survives having no signal.** `js/mechanic.js` parks the
  completion in the outbox and resends it. That was excluded on purpose before,
  so the thing that makes it safe lives on the server: `api/_completion-guard.js`
  refuses any completion of a booking that is already `completed` (200, does
  nothing) or `cancelled` (409), **before** Stripe, the stock decrement and the
  invoice. Do not queue anything else that spends money without the same kind of
  guard on the other end.

- **The guard keys on `bookings.status`, so there is NO SQL to run.** That was
  the deciding factor over a dedicated idempotency column: a migration nobody
  runs is a lock that does not exist (see section 16 of `docs/PENDIENTES.md` and
  `docs/RUNBOOK-SQL.md`).

- **Known limit, written down so nobody "discovers" it as a bug:** read-then-act
  is not atomic. Two completions in the same second can both read "not
  completed". That window is covered by the Stripe idempotency key
  (`complete-charge-<booking_id>`), not by the guard. The guard is for the
  replay minutes or hours later, once that key has expired.

- **A completion whose card is declined on replay is NOT dropped.** It stays in
  the outbox flagged `needs_payment`, is skipped by every later flush, names
  itself on its job card, and only leaves when the mechanic completes that job
  again. Two bugs in that path were found by review, not by tests: it could
  never leave the queue at all, and the job showed as "Done" with only an Undo
  button while the banner told the mechanic to go open it.

- **Photos do not survive an offline completion.** They upload straight to
  Supabase Storage, and the outbox cannot hold them: `_IDB.set` only counts a
  write as stored if **localStorage** accepted it, and a phone photo blows past
  5 MB. The mechanic is told so. Fixing it means a real IndexedDB blob queue.

- **Never verified, and it needs Diego:** no real Stripe charge, no replay
  against production, and the mechanic app was never driven with a real login on
  a real phone. Everything above was proven with 232 unit tests and a local
  browser, which is not the same thing.

- Older entries below.

## Current state (2026-08-09)

- **12.14 and 13.11 are done.** `main` is at the merge of #201. Shipped today:
  #195 (the colour ratchet), #197 (the retired blue, 183 occurrences in 73
  files), #198 (the chips pass WCAG AA), #199 (16 new tokens, zero pixel
  change), #200 (870 leftovers of the dead palettes, mapped), #201 (the design
  skill stops teaching hex).

- **The palette changed on screen and it was deliberate.** `--green` `#16a34a`
  -> `#15803d`, `--amber` `#d97706` -> `#b45309`, `--red` `#dc2626` ->
  `#cf2020`. The status chips were failing WCAG AA at 3.15:1 and 3.07:1; the
  red was failing too at 4.41:1 and nobody had measured it. Do not "fix" these
  back.

- **There are 16 more tokens** (`--purple`, `--blue-soft`, `--amber-bright`,
  `--green-ink`, `--slate`...). They are NOT duplicates of `--amber`/`--green`/
  `--red` - read the comment block in `css/variables.css` before collapsing any
  of them.

- **`npm run check` is now 5 checks.** The new one is
  `scripts/color-check.mjs`: a per-file BUDGET of hand-written hex that fails
  if it goes up **and also if it goes down** without lowering the number. That
  second half is on purpose. `#1848C8` fails everywhere, repo-wide.

- **A stacked PR merged seconds after its parent goes into the PARENT branch,
  not `main`.** That is how #196 shipped nothing while showing MERGED and
  green. It had already happened with #189-#193. Always check with
  `git merge-base --is-ancestor <sha> origin/main`.

- **Nothing in this batch was seen rendered.** All five dev-server slots for
  the folder belonged to other chats and the Vercel previews need a login. The
  evidence is contrast arithmetic and a script that re-reads the diff. Worth a
  look at `bondi.html` and a status chip when someone can.

- Older entries below.

## Current state (2026-08-08)

- **`main` is `d3f9745`. One PR open: #177** (`feat/recover-email`, rebased and mergeable).
  Shipped since 04-aug: #171-#172 (the guest-charged-without-booking incident), #173-#175
  (guest checkout in four steps), #176 (password recovery on desktop).

- **A REAL CUSTOMER WAS CHARGED AND GOT NOTHING, 2026-08-05.** Thais Rocha Guimaraes paid $20
  by Apple Pay, no booking was created, no email or WhatsApp went anywhere, and she had to
  message Diego to find out. Diego refunded it. The whole story, cause and fixes are
  **`docs/PENDIENTES.md` section 14** - read it before touching payment or booking code. One
  cause, five symptoms: every channel assumed an account while the front door let people in
  without one.

- **Booking without an account now works end to end.** The contact sheet asks for name, email
  and mobile - not a sign-up - and the server treats the verified Stripe payment as the
  credential. `bookings.user_id` is nullable and there is a unique index on
  `stripe_payment_intent_id`; both migrations are **applied** (Diego ran them 04 and 06-aug).

- **The payment now drives the chain, not the browser.** `payment_intent.succeeded` builds the
  booking server-side and fires the WhatsApp, the SMS and the client's email, so closing the app
  can no longer lose a booking. The browser still goes first; the unique index picks the winner
  and only the writer notifies.

- **NEVER VERIFIED END TO END: a real card booking without an account.** Every link was checked
  on its own; the chain as a whole was not. It is the single most valuable thing left and only
  Diego can do it - `docs/PENDIENTES.md` 14 and 12.2.

- **The i18n gate has had three blind spots, all now closed:** `confirmDialog` props (12.18),
  `tVal(` in track.html (14.3) and `translateValue(` in the SPA (14.x). Each one let
  customer-facing English ship with the check green. If you add a new translate wrapper, teach
  `scripts/i18n-check.mjs` about it in the same commit.

- **The blue is settled: the app keeps `#2563eb`, the logo and icons keep `#0055de`.** Two blues
  on purpose. Do not unify them. What is left of 12.14 is mechanical and is the next job.

- Older entries below.

## Current state (2026-08-04)

- **No open PRs.** `main` is `1234254`. Everything below shipped on 2026-08-03/04:
  #163 docs, #164 (12.18 dialogs), #165 (12.16 touch targets), #166 (track.html audit = section
  13, closes 3.1), #167 (13.2-13.4, 13.6-13.8), #168 (13.1 + 13.10), #169 (12.3).
  Section 12 is **17 of 21**, section 13 is **8 of 10**.

- **THE BLUE IS DECIDED (2026-08-03). The app keeps `--blue` `#2563eb`.** The logo and the app
  icons keep their own `#0055de`. That split is deliberate now, not drift: do not "unify" them,
  do not recolour the logo to the token or the token to the logo. This unblocks 12.14 / 13.5 /
  13.9 - the winning palette is `css/variables.css` exactly as written, and what is left is
  mechanical.

- **Backups exist and did not before.** Private repo `Peredodiego2026/Dr.Bike-Sydney-backups`
  runs a nightly Action (02:00 Sydney) that commits `schema.sql` / `data.sql` / `roles.sql`.
  Supabase is on the free plan, which takes none. **The restore has never been tested** -
  `docs/PENDIENTES.md` 1.2.

- **`bookings.address_lat/address_lng` exist** (Diego ran `scripts/add-address-coordinates.sql`
  on 2026-08-04, verified: two rows, `double precision`). Bookings created from now on geocode
  server-side once, so `track.html` no longer sends the customer's address to Nominatim.
  Bookings made before that have no coordinates and correctly show no ETA.

- **`gh` IS installed and authenticated** as `Peredodiego2026`, scopes `repo` + `workflow`. It is
  at `C:\Program Files\GitHub CLI\gh.exe` but **not on PATH** for tool shells - prepend it. An
  earlier version of this block said it was not installed; that was wrong.

- **ffmpeg and Pillow were installed on Diego's machine on 2026-08-04** to build Instagram story
  assets (`C:\Users\Usuario\Desktop\DrBike-IG`). Neither is a project dependency.

- **What is left needs Diego, not code:** 12.11 (the admin door - changes the auth flow, he wants
  to watch), 12.16's last piece (11 admin tables with no scroll container - unmeasurable locally
  because `admin.html` authenticates against `/api/auth`), 1.2's restore test, and a real
  end-to-end booking with a card.

- Older entries below.

## Current state (2026-08-03)
- **No open PRs.** #159 (`fix/unify-app-icon`), #160 (`fix/audit-batch-5`) and #161
  (`fix/phantom-prices`) are all merged and live. `main` is `edda6b9`. The only unmerged remote
  branches are 5 dependabot bumps. An earlier version of this block called #159 an OPEN PR: it
  was written before the merge and stayed wrong for a day.
- **Three parallel sessions ran in three worktrees** (`drbike-wt-logo`, `Dr.Bike-Sydney-wt-ui`,
  `drbike-wt-prices`). All three are clean and their branches merged - reuse or delete them, but
  do not assume another chat still holds work in them.
- **`gh` is not installed on this machine** (searched all of `C:` on 2026-08-03). Branch
  protection rejects direct pushes to main, so PRs have to be opened from the web until it is
  reinstalled.
- **#159 - one logo everywhere** (commits `fc9388c`, `cb4dc3c`). The DB monogram, traced from
  `images/logo-db.png` into vector paths. Replaces the bicycle-on-`#1848C8`
  icon set, adds a favicon to the 74 of 77 pages that had none, splits the maskable icons into
  their own files, and rebuilds `og-image` as a PNG (SVG never rendered as an `og:image`).
  `sw.js` **v55**. New guardrail `scripts/icons-check.mjs` in `npm run check`.
- **#160 - audit batch 5:** `docs/PENDIENTES.md` **12.17 closed** (the last 26 inline handlers in
  `admin.html`, `js/admin.js`, `js/mechanic.js`, `mechanic.html`) and **12.16 partial** - ten of
  the eighteen touch targets under 44px. The other eight and all five horizontal overflows at
  390px are still open.
- **#161 - phantom prices: code is in, but it needs Diego to finish.** `data-price-from` now
  drives the floor prices from the live `services` table. Until Diego edits **Admin > Services &
  Prices** to rename `Bike Build — New Bike` to `Bike Assembly` at 80 and create `E-Bike Service`
  at 129, `npm run services:check` reports both sides of the mismatch. That is the check working,
  not a regression.
- **Backups exist now (2026-08-03), and they did not before.** The project is on Supabase's free
  plan, which takes *no* automatic backups - the dashboard said `LAST BACKUP: No backups`. A
  separate **private** repo, `Peredodiego2026/Dr.Bike-Sydney-backups`, now runs a nightly Action
  that commits `schema.sql` / `data.sql` / `roles.sql`. Private and separate because this repo is
  public and a dump is customer PII, and so the database password never touches a public repo.
  First run verified green, commit `c7ca423`. **The restore has not been tested** - see
  `docs/PENDIENTES.md` 1.2.
- **Stripe:** Diego registered `payment_intent.succeeded` on the live webhook endpoint
  (2026-08-03). `api/stripe-webhook.js` still has no case for it, so today it lands in the
  `default` and logs `Unhandled event type`. That is expected until 12.3's code is written; the
  half only Diego could do is done.
- **Next mechanical work, no decision needed:** the 12.16 remainder, 12.18 (`confirm()`/`alert()`
  in `js/app.js` and `js/mechanic.js`), and auditing `track.html` - the fifth surface, never
  looked at, and the last thing between us and closing point 3.1.
- **Icon colour, on purpose:** the mark keeps the logo file's `#0055de`, which is NOT `--blue`
  (`#2563eb`). The icon has to match the logo in the page header. Reconciling the brand blue with
  the token is still Diego's call and is not done.
- **Cache finding, verified against production:** every `.png/.jpg/.webp/.gif/.svg/.ico/.woff` is
  served `max-age=31536000, immutable`. A browser holding an old image never revalidates it, so
  changing an image without changing its URL reaches nobody. Every icon reference now carries
  `?v=2`. This is why "Diego sees an old page" happened in Firefox with no service worker
  registered - but it only explains stale *images*. HTML is `max-age=0, s-maxage=0,
  must-revalidate` and production serves the current build, so **stale text is still undiagnosed.**
- Older entries below.

## Current state (2026-07-27)
- **The live punch list is `docs/PENDIENTES.md`** (created 2026-07-27). It is the single place
  that answers "what is left", split by who has to do it. This file stays the session journal.
- **2026-07-27, later:** PRs #108-#114 all merged (send-push auth, the i18n gate's inline-script
  blind spot, Service schema on the suburb pages, the Twilio env-name fix + schema prices from
  Supabase, 5 dependabot bumps, 5 unused prod deps dropped, docs). No open PRs. All 64 local
  branches deleted and 5 stale worktrees removed - local is `main` only. Verified green the same
  day: `npm run check` and 121 unit tests.
- **MERGED 2026-07-27 (PRs #105, #106, #107):** the three branches below all landed on main, plus
  `feat/multilingual-seo-pages` (#103) and `feat/i18n-guardrail` (#104) the day before. Live in
  production and verified over HTTP: `/es/<slug>` and `/zh/<slug>` return 200 with all 4 hreflang,
  the sitemap serves 71 URLs, `/` sends `Vary: User-Agent`. SW **v39**. Only `security/send-push-auth`
  is still open.
- **Diego tested live GPS tracking in production 2026-07-27: it works.** That was the last open
  item of the July gate.
- **~~3 open branches~~ (all merged, kept for the detail):** `feat/sms-whatsapp-i18n`
  (SMS/WhatsApp in 3 languages via `api/_message-i18n.js`, one builder per language because an
  SMS interleaves values and word order differs - messages to Diego stay Spanish; 13 tests),
  `feat/seo-structure-and-links` (neighbour links between suburb pages scoped per language, blog
  links on the English pages only, keyword-variant H2, BreadcrumbList schema,
  `scripts/add-blog-area-links.mjs` idempotently adds an area-links block to the 5 posts),
  `feat/plan-names-i18n` (Basic/Standard/VIP were dictionary keys mapped to themselves so they
  looked translated and were not; plan selection is `data-plan`-driven so it was safe; also the
  plan-info modal price `$97/month` had no entry at all). They touch different files and merge in
  any order.
- **Footgun, now a rule in CLAUDE.md:** editing `js/i18n.js` requires bumping the `?v=` on its
  import in `landing.html` and `track.html` AND the `sw.js` cache version, or returning visitors
  keep the old dictionary and new strings silently render in English. Cost two false "the
  translation is broken" hunts today. Now at `?v=20260726c` / SW **v39** on the plan-names branch.
- **Known gap in the i18n gate:** `scripts/i18n-check.mjs` strips `<script>` blocks, so strings
  built inside landing.html's inline scripts are not covered. That is how `$97/month` escaped it.
- **Still English-only, NEXT TASK:** `business.html` (79 strings), `bike-check.html` (63) and the
  5 blog posts. Mechanism decided, not yet written: do NOT rewrite them as templates like the
  suburb generator. Keep the English file as the source and add a script that emits
  `/es/<page>.html` and `/zh/<page>.html` by replacing whole prose strings from a per-page
  dictionary (the `api/_email-i18n.js` approach - these pages are prose blocks between tags, so a
  fragment swap is safe), then injects `hreflang`, `<html lang>` and the sitemap entries. Add the
  new URLs to the `vercel.json` rewrite list. ~284 translations for the two pages; the blog is a
  much larger content job and should be its own PR.
- **Needs Diego, not code:** unique 200-300 word content per suburb (real local facts - cycle
  paths, typical problems, response times; must not be invented), Google Business Profile,
  Search Console, real reviews.
- **MERGED 2026-07-26 (PR #101 + #102):** pricing consistency, the full 3-language i18n audit,
  the messaging-endpoint hardening, email i18n (+ `scripts/add-client-language.sql`, **applied**),
  push-link hardening, `npm audit fix`. SW **v38** live.
- **OPEN branch `feat/multilingual-seo-pages` (pushed, not merged):** the 20 suburb pages are now
  **generated** by `scripts/generate-suburb-pages.mjs` (copy lives once per language) and exist in
  3 languages on their own crawlable URLs - `/<slug>`, `/es/<slug>`, `/zh/<slug>` - with hreflang,
  per-page canonical, FAQPage schema, a header language switcher, `data-service` on price cards so
  live-prices still syncs on translated pages, `?v=` on the script (these pages are outside the
  SW), vercel rewrites, and a regenerated sitemap (71 urls, alternates declared). Also
  `middleware.js` now sends `Vary: User-Agent` - it serves two different documents at `/` by UA
  and never told caches or Google. **Still English-only: business.html, bike-check.html and the
  5 blog posts** (mechanism is ready, it is translation work).
- **Vercel env gap found 2026-07-26, RESTATED 2026-07-27 because the original wording was wrong:**
  the claim was "every scheduled email has been returning 401". That overstated it. Verified in
  code: `CRON_SECRET` only guards the *scheduled* types - `send-reminders` (2h) and send-cron's
  birthday/reengagement/abandoned/service/advance/noshow/all. The transactional mail (booking
  confirmation, invoice, password reset, welcome, review request) and send-cron's public `b2b`
  and `upsell` types never touch that guard, which is why Diego still receives mail normally.
  Whether `CRON_SECRET` is actually set is **still unverified**: Vercel runtime logs retain ~1 day
  on this plan and show no `/api/send-cron` requests and zero 401s in that window, so the logs
  cannot answer it. Diego checks it in Settings > Environment Variables. Also unused secrets in
  Vercel (MAPBOX_TOKEN, GOOGLE_PLACES_API_KEY, POSTHOG_KEY - none referenced in code). The
  `TWILIO_WHATSAPP_FROM` vs `TWILIO_WHATSAPP_NUMBER` name mismatch listed here before was **fixed
  2026-07-27 in PRs #111/#112**.
- **IN PROGRESS 2026-07-26 (branch `fix/pricing-consistency`, 3 commits, NOT pushed, NOT deployed):**
  `191cb08` + `8a37257` pricing consistency (annual plan prices + the Sunday/NSW-holiday +20%
  surcharge disclosed on every surface incl. 20 suburb pages, terms in 3 languages, the chatbot's
  own knowledge; 6 stale `$57/month` placeholders; `tests/unit/pricing.test.js` was still on
  57/548 + 147/1411), `06bff7f` full 3-language i18n audit (+100 dict entries, 35 duplicate keys
  removed, es/zh now at exact parity 934/934, track.html was 100% English and now follows the
  chosen language, `dateLocale()` replaces hardcoded `en-AU`, **js/live-prices.js matched card
  headings against English Supabase names AFTER translation so Admin price edits never reached
  es/zh visitors** - fixed via new `sourceOf()`), `084a18e` security: **/api/send-email,
  /api/send-message, /api/send-push gated browser callers on Origin/Referer only and
  /api/send-invoice had no caller check at all - forgeable with one curl header, i.e. an open
  relay for mail from our verified domain, PDF invoices from receipts@, and paid Twilio SMS to
  any number.** Browser calls are now bound to a recipient the server can vouch for (our own
  number/addresses, a staff number, or the contact stored on the booking). Also: 4 auth.js roles
  ran before `guard()` and had no rate limit at all; track.html rendered mechanic_notes /
  parts_used / address straight into innerHTML (stored XSS on the page we SMS to clients).
  SW bumped to **v38**. 89 unit tests green.
- **Verified via git 2026-07-26 (later same day):** `main` tip `191cb08` (dependabot merges on top
  of PR #93). SW cache **v37** on main, **v38** on this branch. PRs #90-93 all merged: punch-list batch, section B (admin error states, live-Stripe label, landing hover, card shadows, 44px tabs), CONTEXT sync, and the real-ETA + client-notification work. Of the 36 audited design findings, ~14 were said to remain "see docs/ROADMAP.md" — **corrected 2026-07-27: that list is not in ROADMAP.md and is nowhere in the repo. The 15 unchecked boxes there are business/marketing gates, not design findings. If those 14 matter, they need to be re-audited and written down; until then the item is not actionable.**
- **2026-07-22 (PRs #82-89):** Business-logic batch (surcharge recompute, discount reuse, membership limits, call-out fee refund on amount-mismatch rejection, membership tiers revised to 3 free-quota categories per Diego); stale $57/$147 prices fixed across admin/terms/chatbot, then Diego separately edited Basic->$67 and VIP->$197+annuals directly in the Stripe Dashboard (**these are Legacy Plan objects — editable in-place without a new price ID; always check "Subscriptions: X active" before touching a price, see `project_stripe_legacy_plan_risk` memory**); card-on-file with auto-charge at job completion (safe-fails to EFTPOS/Cash with HTTP 402 `AUTO_CHARGE_FAILED` if the charge fails — never silently marks a job paid; SQL migration `scripts/add-card-on-file-columns.sql` status unconfirmed, ask Diego); bike service history gated to Standard/VIP members; Emergency Service option added (direct contact, bypasses booking flow); npm audit fix (0 vulnerabilities); design-discipline passes (`--blue`/`--navy` tokens corrected, 128 landing.html colour values normalized across 119 lines, mechanic status colors unified, ~150+ font sizes forced onto the real type scale, 9 category emojis + mechanic avatar replaced with hand-drawn SVG icons); critical/visual-polish batch (duplicate-click listener bug in mechanic app fixed — was opening 3 tabs / double-sending WhatsApp; fabricated admin stats removed; wizard scroll-to-top added to `router.js`, **not yet confirmed working in a real browser**).
- **2026-07-21 (PRs #74-81), security-heavy day:** **CRITICAL, fixed in PR #81:** the public tracking endpoint accepted a guessable `booking_id` as equivalent to the real secret `tracking_token` — chained with the booking-lookup-by-email endpoint, this leaked home address + arrival PIN + live mechanic GPS to anyone who knew a client's email, no login needed. Also fixed same PR: any authenticated mechanic could complete/reject/mark-arrived/change status on ANY booking company-wide (not just their own), and `handleClientReview` had no auth check at all (booking_id alone let anyone post a rating/comment/photo to any completed job). SW bumped to v32. **~~Flagged but NOT fixed~~ — all three were fixed later and this line was stale; re-verified in code 2026-07-26:** van selection is forced server-side to the mechanic's own `van_number` (api/auth.js handleMechanicLocation); `handleClientHistory` now requires the caller to hold a booking with that client; the Calendar OAuth flow uses an admin-minted HMAC ticket carried as the OAuth `state` and verified in the callback. Same day: 3 rounds of XSS attribute-escaping fixes (`escapeHtml()` wasn't escaping quotes, breakout in 7 attribute sites, then avatar-initials fallback, then 5 more found sweeping for the same bug), admin dark-mode toggle bug + dead chart code removed, password-reset UI/email redesigned + full i18n, clients can now optionally pick a preferred mechanic (admin-gated).
- **2026-07-20 (PRs #58-73):** `discount_codes` full-table enumeration via anon key closed (security); password reset flow was completely non-functional — emails were never actually delivering — implemented for real; mechanic app now scopes jobs/job-acceptance to the mechanic's own van (was seeing all vans company-wide); timer-bar Complete button no longer bypasses the signature/parts/photos requirement; `referral_code` discovered never being saved to the DB at all; user-controlled names/bio/messages now escaped before rendering as HTML (XSS); mobile SPA turned out to have its own separate set of fake reviews independent from landing.html's (also removed); Vercel edge CDN was caching HTML pages past deploys (fixed); reschedule now checks real availability instead of trusting the client; ~96 more unlabeled form inputs given accessible names across mobile/mechanic/admin (accessibility sweep continued from 07-19).
- **2026-07-18/19 (Claude session):** Real reviews replace fake testimonials (PR #38, visible cards + JSON-LD aggregateRating/review both were fake, both removed; `scripts/create-public-reviews-view.sql` applied by Diego, `public_reviews` view live, 0 rows until first real review - no further deploy needed for that). Security follow-ups from 07-17 verified live with 0 real-world impact during the vulnerable window (Vercel logs checked). i18n: mobile SPA booking wizard was already ~95% translated (correcting an earlier wrong claim in this same session that it was 0%) - real gap was `showToast()` never calling the translator + 37 missing dict entries (toasts, dynamic button text, form placeholders), fixed PR #41. 3 SW cache bumps this session (v28→v29→v30) - **reminder for future sessions: js/*.js and css/*.css changes ALWAYS need a cache bump, the SW is cache-first with no revalidation, this has now bitten 4 separate PRs (#33/#38/#41 + this note).** Production audit (roadmap Aug items, see docs/ROADMAP.md - now corrected, most of Aug was already done in earlier sessions but never checked off): sitemap.xml had 28 URLs for suburb/blog pages that were never built, all serving duplicate landing.html content - trimmed to the 4 real pages (PR #43). 16 form inputs had no accessible name for screen readers (placeholder-only) - added aria-label/proper label association (PR #44). Predictive maintenance MVP already exists and is more complete than "MVP" - `api/send-cron.js?type=service` runs daily, 2-tier (mechanic-set date > service-type fallback), already in prod. `docs/ROADMAP.md` August section corrected to match verified reality. Diego still owes: manual GPS live-tracking test (July gate's one open item) — **DONE: Diego tested live tracking in production 2026-07-27 and it works.**
- **2026-07-17 (Claude session, parallel to another active session same day):** Landing i18n (PR #31/#32/#33, SW→v28) + Lighthouse image/cache/diet work + GrowthBook lang-switch fix (PR #34) all merged, `main` at 36a75a4. This branch (`chore/doctor-cleanup`, own worktree at `../Dr.Bike-Sydney-doctor-cleanup`) adds a Claude Code setup cleanup: unused skills disabled, 2 unused MCP servers disabled, CLAUDE.md's Trademark status section moved to a `trademark-status` skill. Another session has a stashed CONTEXT.md edit ("mechanic-PIN handoff note") pending on its own branch — not touched here.
- **Incident 11 Jul (historical, resolved):** a local AI agent (opencode CLI, runs with Diego's git credential) pushed a redesign directly to main; bad deploys poisoned cached assets. Restored via 38620c6 + SW bump to v24 (edf249b). The bot's work is preserved in local branches `backup/otra-app-2026-07-11` (same tip as remote `origin/fase-0-rediseno`) and `backup/otra-app-ultimo-1e82016` (local-only, divergent line) — **Fase 0 shipped 2026-07-13, so per this file's own prior note these 3 are ripe for deletion; not yet done, confirm with Diego first (see `project_fase0_handoff` memory).** Root cause: no branch protection — any local tool with the stored credential could push to main.
- **Branch protection ON (2026-07-11):** main rejects direct pushes for everyone incl. admin (enforce_admins). All changes reach main via PR with the `quality-gate` CI check green. Merging to main still auto-deploys to prod.
- **Fase 0 (Home + Cuentas + Medallas) shipped 2026-07-13**, confirmed live in prod (PR #5, SW v25 at the time — now v33). See `project_fase0_handoff` memory for the fixture test account and the still-undecided medal-SVG-placeholder swap.
- **Week of 4–7 Jul (~40 commits, verified in git):** desktop booking now uses the index.html wizard (0c639c1) — NOTE: this unified the **booking flow only**; middleware.js still routes mobile→index.html / desktop→landing.html (two-page architecture remains). GitHub Actions CI (ci.yml `quality-gate`: lint+check+tests; e2e-smoke.yml). Multi-lang foundation EN/ES/ZH. Mechanic profile (photo, rating, bio, arrival PIN, tips, photo crop). Invoice restructure (parts, discounts, callout fee, review link, tip). Admin Services Manager CRUD; prices live from Supabase `services` table. GrowthBook A/B, predictive maintenance groundwork, rider tiers. Security: CSP/HSTS, admin email allowlist.
- **Stashes:** none (the 07-14 stash was superseded by later sessions and dropped 2026-07-26).

- **Roadmap status:** #1–#8, #10, #11, #12 DONE. #9 PARTIAL (CSP hardened + frame-ancestors; unsafe-inline removal deferred — big refactor). #13 (TASK-053) DONE 2026-07-04: dropped 4 confirmed-empty columns (review_text, photo_before, before_photo_url, client_signature); kept `original_price` (15 non-null rows, real data). ~~Only open item: Diego's call on rating vs client_rating~~ — **CLOSED 2026-07-27: there is no duplicate. Verified against production: `bookings.rating` does not exist (42703), only `bookings.client_rating`. The other `rating` the code reads is `escalation_contacts.rating`, the mechanic's aggregate score — a different column on a different table. Nothing to drop, nothing to decide.** Roadmap complete except that pick + the two accepted/deferred tradeoffs (#9 unsafe-inline, mechanic_locations public RLS).
- **#6–#12 done 2026-06-29 (s3):** #6 Sentry server (api/_sentry.js default DSN + withSentry on auth/chat/stripe-webhook/create-payment-session). #7 SMS/WhatsApp retry+log → `notification_log` table (SQL applied). #8 deploy gate: `scripts/check.mjs` + `npm run deploy` (check+vitest then vercel). #9 CSP frame-ancestors added (vercel.json). #10 per-bike history in SPA My Bikes (app.js v=20260629f). #11 zone dispatch by suburb in create-booking (van_zones). #12 availability capacity = van count. SQL applied this session: notification_log table.
- **#5 (TASK-022) DONE 2026-06-29:** RLS hardened. Phase 1: bookings/discount_codes/bike_service_history. Phase 2 (mechanic has no JWT → routed via server, service key): escalation_contacts admin-only; parts_inventory via mechanic-parts/mechanic-parts-update endpoints; job_messages via mechanic-messages/mechanic-message-send + 4s polling (realtime removed for mechanic), RLS = owner_read_job_messages (client) + "Client send own booking messages" INSERT + "Admin manage job messages" ALL. Admin chat READ-ONLY by design (sender_role check constraint allows only client/mechanic; Diego prefers admin reviews only). `mechanic_locations` left public (live GPS, needed for client realtime map, low severity).
- **Mid-session features also shipped 2026-06-29:** mechanic "Parts used" picker in Complete flow (grouped by category cockpit/wheels/cables/drivetrain/brakes, steppers, server-side stock deduction + low-stock toast, mandatory: select parts OR "No parts used" else red banner blocks Complete). SPA chat input bumped to 16px (iOS no-zoom). Versions: app.js v=20260629e, mechanic.js v=20260629l, admin.js v=20260629h.
- **#5 model:** admin panel uses ANON key (admin.js:14, role=anon) + admin's Supabase JWT; authz = Postgres RLS. Admin marked by `profiles.role = 'admin'` (distinct roles: admin, client). Server /api/* use SERVICE key (bypass RLS). Mechanic app uses ANON key with NO JWT (PIN login) → depends on permissive `public true` RLS for some tables.
- **#5 Phase 1 DONE 2026-06-29 (SQL applied):** dropped `bookings` "Mechanics can read bookings" (SELECT authenticated true) + "Mechanics can update bookings" (UPDATE authenticated true) — both let any logged-in user read/update ALL bookings. `discount_codes`: dropped "Full access discount codes" (ALL public true write), added "Admin manage discount codes" (admin-only), kept public_read for client code validation. `bike_service_history`: dropped "Anyone can read bike history", added admin-only SELECT. Verified: admin can still create discount codes + see all bookings.
- **#5 Phase 2 TODO (needs server-routing BEFORE locking RLS — these are load-bearing for the no-JWT mechanic app / client realtime):**
  - `job_messages` "Anyone can read/write" (ALL public true) — anyone reads/writes ALL chats. Used by: mechanic.js (no JWT, sb.from job_messages select/insert ~1328-1399), app.js client (JWT, ~1375-1405), landing.html (JWT, ~3687-3703), admin.js. Fix: add server endpoints for mechanic send/list (service key); client (JWT) can be owner-scoped via booking.client_id; then drop the public policy.
  - `parts_inventory` "Allow all for inventory" (ALL public true) — mechanic.js reads/updates (no JWT, ~927/968) + admin.js. Fix: server endpoints for mechanic inventory, admin policy, drop public.
  - `escalation_contacts` "Anyone can read contacts" (SELECT anon,authenticated true) — leaks phones. Client reads via supabase.js getMechanicInfo (select * by id, ~75). Fix: route getMechanicInfo through a server endpoint (extend mechanic-profile to return name/phone), then admin-only read RLS.
  - `mechanic_locations` "Anyone can read mechanic locations" (SELECT public true) — live GPS public. Client subscribes via realtime (app.js ~1277-1295, supabase.js subscribeToMechanicLocation). Lower severity (only while van online). Hardest to lock (realtime needs read); consider leaving or a tracking-token gate.
- **Chat features DONE 2026-06-29 (deployed, ad-hoc, between #4 and #5):** (1) SPA client chat bug fixed — Leaflet panes (z-index 200-700) bled over chat panel (was z-index 99); now panel z-index 2000 + map hidden on open/restored on close, polished header (avatar+online) and empty state, empty-state now has data-empty so realtime clears it. js/app.js v=20260629d. (2) Landing client↔mechanic chat: `openLandingChat(bookingId)` modal + "Message mechanic" button on confirmed/enroute/in_progress bookings in the account panel (login-gated). (3) Landing floating FAQ chatbot: FAB bottom-right → window calling POST /api/chat (existing AI handler, already FAQ-grounded), with quick-reply chips. Both landing pieces are inline <script> before </body> in landing.html. Verified: /api/chat returns correct reply in prod.
- **Task #4 DONE 2026-06-29 (all deployed+verified):** 4a PIN hash (pin_hash, HMAC-SHA256 keyed on SERVICE_KEY, lazy-migrated on first login). 4b session token: makeToken/verifyToken (HMAC, 60-day TTL, stateless) + shared `authMechanic(req)` (token-or-PIN dual-accept, checks `active`, lazy pin_hash) used by all 10 endpoints (login, jobs, location, accept, reject, arrived, checklist, complete, update-status, client-history); login returns token+name (first_name+last_name); client js/mechanic.js (v=20260629g) sends token+pin. 4c lockout: `login_attempts` table (ip/fail_count/window_start/locked_until, RLS on, service-key only), 5 fails/15min → 429, in api/_security.js (isLoginLocked/recordLoginFailure/clearLoginFailures), enforced in handleMechanic. Verified: burst from one IP → 429.
- **PENDING 4d (needs Diego OK, not started):** stop sending raw PIN in requests + stop storing it in localStorage + drop the plaintext `pin` column from escalation_contacts (confirm first). Until then PIN plaintext remains as fallback.
- **SQL applied 2026-06-29 (this session):** `escalation_contacts.pin_hash` column; `login_attempts` table.
- **Phase:** 2 — Security. (Phase 1 + first scale items done.)
- **escalation_contacts real columns (verified 2026-06-29):** id(uuid), first_name, last_name, phone, role, active(bool), created_at, zone, channel, pin, pin_hash. NO `name` column → handleMechanic returns name:undefined (fix in 4b via first_name+last_name).
- **4a recap:** `hashPin()` = HMAC-SHA256(pin, SERVICE_KEY) in api/auth.js. handleMechanic matches pin_hash first, falls back to plaintext pin, writes pin_hash on first plaintext login. Only Diego has a PIN today.
- **Done 2026-06-29 (session 2):** Roadmap of 13 tasks created. #1 DB perf indexes (SQL run by Diego), #2 atomic job accept (deployed), #3 bounded queries (mechanic-jobs 7-day window+limit300, client-bookings limit100; admin already limit500) deployed. Also fixed: mechanic GPS 401 no longer logs out; admin+mechanic sessions persist on refresh (localStorage); booking cancel persists + reason shown to client; sequential mechanic action buttons (Accept→En route→Arrived→Complete); rate-limit per-role.
- **SQL applied by Diego (all confirmed 2026-06-29):** bookings_unique_slot, harden-bookings-rls, add-stripe-events, add-cancellation-reason, add-performance-indexes. Nothing pending.
- **Remaining tasks (order):** #4 mechanic PIN security, #5 admin server-side authz, #6 Sentry alerts, #7 notification retries, #8 deploy gate, #9 tighten CSP, #10 per-bike history, #11 zone dispatch, #12 capacity model, #13 dedupe booking columns.
- **Pending Diego:** (1) test an admin booking on mobile + desktop appears; (2) run `scripts/add-stripe-events.sql` (safe anytime); (3) run `scripts/harden-bookings-rls.sql` ONLY after the test passes.
- **Done 2026-06-29:** TASK-010 (slot index), TASK-011 (server-side booking+price), TASK-012 (payment verify+refund-on-conflict, ready for when online checkout is enabled), TASK-013 (webhook idempotent in code). Key fact discovered: online payments are NOT live anywhere (mobile + desktop show "coming soon" → WhatsApp); only admin creates in-app bookings today.
- **Status:** Schema verified via SQL Editor (2026-06-29). Confirmed: `bookings.bike_id` EXISTS (uuid); `bikes` uses `name`/`type`/`size` (matches app.js — no bug); RLS policies present on bookings/bikes/profiles. NOT present: unique slot index `bookings_unique_slot` (only `bookings_unique_client` + tracking_token unique exist) → double-booking still possible. Desktop admin test-booking (no charge) for peredo.dm@gmail.com shipped.
- **Blocker:** Still need Diego to confirm backups + ops model (vans/mechanics/bookings-day). Slot index waits on a duplicate pre-check.

## Confirmed schema facts (2026-06-29)
- `bookings.scheduled_time` is `time without time zone` (not text) — verify client sends "HH:MM" not "8:00 AM". **2026-08-16: this line was right and nobody acted on it for months. Three live bugs came out of exactly this** (see Current state). Client-side conversion now lives in `js/time-format.js`; the server accepts all three shapes in `slotToMinutes`.
- `availability` (verified 2026-08-16, after `scripts/fix-availability-blocks.sql`): `available boolean default true`, `service_id text NULL`, `van_number int NOT NULL default 0` (0 = all vans), `time_slot text`, unique on `(date, time_slot, van_number)`. There is **no** `blocked` column and there never was.
- Schema drift: redundant columns exist (rating vs client_rating **— corrected 2026-07-27: this pair was never real, `bookings.rating` does not exist**, review_text vs client_review, photo_before/before_photo_url/photo_before_url, client_signature vs client_signature_url, original_price vs service_price). Cleanup candidate — confirm which are authoritative before dropping.
- Desktop `bkProceed` does NOT set van_number → those bookings are NULL-van and won't be covered by a per-van slot unique index.

## Session log
| Date | Summary | Files |
|---|---|---|
| 2026-06-29 | SDD retrofit: deep audit vs 2yr/500+ client vision. Generated requirements/design/tasks. | requirements.md, design.md, tasks.md, CONTEXT.md |
| 2026-06-29 (s3) | TASK #4 DONE (mechanic PIN: hash+token+lockout, 4a-4d). Chat fixes: SPA chat map-overlap, landing client↔mechanic chat (login-gated), landing floating FAQ chatbot. #5 Phase 1 RLS hardening (bookings/discount_codes/bike_service_history). Reset admin MFA (Diego was locked out). | api/auth.js, api/_security.js, js/mechanic.js, mechanic.html, js/app.js, index.html, landing.html, + SQL |
| 2026-07-11 | Incident recovery follow-up: branch protection on main (PR + quality-gate + enforce_admins), WIP secured to fase0 (4ae7e74), bot backup branches reviewed (keep until Fase 0 ships; remote copy = origin/fase-0-rediseno), 5 fully-merged dead branches deleted (redesign-ui, saneamiento-prod, landing-modals, fix/mobile-buttons, landing-pc), CONTEXT.md + CLAUDE.md refreshed to real state. | CONTEXT.md, CLAUDE.md |
| 2026-07-13 | Fase 0 (Home + Cuentas + Medallas) shipped, PR #5, verified live w/ Playwright (SW v25). | index.html, js/app.js, css/*, PR #5 |
| 2026-07-17 | Landing i18n complete (PR #31/32/33, SW v28), Lighthouse image/cache/CSS diet (PR #34), GrowthBook lang-switch fix, RLS/CORS/race-condition security pass (PR #36: bookings/mechanic_locations/discount_codes/van_zones had no real RLS, Google Calendar refresh token in plaintext - rotated). | landing.html, js/i18n.js, api/*, SQL |
| 2026-07-18/19 | Real reviews replace fake testimonials (PR #38/39/40), i18n toast coverage (PR #41), sitemap trimmed 28->4 real URLs (PR #43), 16 aria-labels (PR #44), Turnstile bot protection, Dependabot config, 3 unauthenticated customer-email endpoints closed, SW v28->v32 across the stretch. | landing.html, index.html, api/*, sw.js |
| 2026-07-20 | discount_codes enumeration closed, password reset actually implemented (was silently broken), mechanic app van-scoping fixed, referral_code save bug fixed, XSS escaping on names/bio/messages, mobile SPA's own fake reviews removed, Vercel edge cache bug fixed, ~96 more aria-labels. | api/auth.js, js/mechanic.js, js/app.js, various |
| 2026-07-21 | **Critical security (PR #81):** public tracking IDOR (address/PIN/GPS leak via booking_id) + mechanic cross-van ownership bypass + unauthenticated client review posting, all closed, SW v32. 3 rounds of escapeHtml() quote-breakout fixes. Preferred-mechanic feature, password-reset redesign. Flagged not fixed: van selection has no server binding, client-history lookup unscoped, Calendar OAuth callback ungated. | api/auth.js, js/app.js, track.html |
| 2026-07-22 | Business-logic batch (PR #82-84), card-on-file + auto-charge (PR #84), Standard/VIP service-history gate, npm audit fix, design-discipline passes (PR #85-88: color tokens, type scale, SVG icons), critical+visual-polish batch (PR #89: duplicate-click bug, fake stats removed, wizard scroll, SW v33). | js/app.js, js/mechanic.js, css/*, landing.html, PR #82-89 |
| 2026-07-26 | Session-start audit: verified handoff doc against git (accurate), found CONTEXT.md stale by 10 days/42 PRs and fixed it, found+removed 3 fully-merged stale worktrees + 1 empty dir + 1 superseded stash, found an unused prepared worktree (fix/remaining-bugs-batch1) left by prior session. | CONTEXT.md |
| 2026-07-26 (later) | PRs #90-93. Punch-list batch (landing hero crop 55%->0.1%, mechanic contrast 2.56->4.83:1, scrollable nav tabs, 44px touch targets, case-insensitive suburb dedupe, Sentry CSP). Section B (loadDashboard had no error handling and rendered a Supabase failure as a confident $0; "Stripe: Active (test)" corrected to live; generic :hover for the 70 unclassed clickables on landing; list-card shadows dropped). **The live tracking ETA was blocked by our own CSP** - `router.project-osrm.org` was missing from connect-src, so the map worked but "Estimated arrival" never appeared. Real driving ETA now replaces the hardcoded "10-20 min" in SMS/WhatsApp/push; **the enroute WhatsApp had never been delivered** (endpoint takes {to,template,data}, was handed the SMS shape, 400 every time). Client now notified on accept and on arrival - the accept push existed but was wired to the Undo button. SW v33->v36. | js/admin.js, js/mechanic.js, api/send-message.js, api/_eta.js, css/*, vercel.json |
| 2026-07-26 (evening) | Branch `fix/pricing-consistency`, 3 commits, **not pushed**. (1) Pricing consistency across all surfaces + 20 suburb pages + 3 languages + chatbot, stale $57 placeholders and stale unit-test prices. (2) 3-language i18n audit by walking every text node/placeholder/aria-label and testing it against the dict: +100 entries, 35 duplicate keys dropped, es/zh parity 934/934, track.html wired to i18n, `dateLocale()`, live-prices reverse-lookup fix. (3) Security: Origin/Referer was the only gate on send-email/send-message/send-push and send-invoice had none - recipients are now server-vouched; 4 unrate-limited auth.js roles; track.html stored XSS. SW v37->v38. | js/i18n.js, js/app.js, js/live-prices.js, js/mechanic.js, track.html, landing.html, index.html, terms.html, api/_security.js, api/send-email.js, api/send-message.js, api/send-invoice.js, api/auth.js, api/chat.js, tests/unit/* |

## Key decisions
- Spec marked `v0-retrofit`: the code is the source of truth; spec is verified against it.
- Vision assumptions (2yr, 500+ clients in 8 months, solo non-technical founder, live money) treated as working context — confirm with Diego.

## Open questions
- Exact RLS policies per table? Backups enabled + tested? Supabase plan/limits?
- Does `bookings.bike_id` exist? Keep desktop manual (unpaid) booking flow or unify with paid mobile flow?
- Ops model at 500 clients: vans, mechanics, bookings/day, suburb coverage?

## Divergences (implementation vs design pending fix)
- Bookings (incl. price) are inserted client-side (anon key) — design target is server-authoritative (TASK-011/014).
- One-time payment not reconciled server-side; webhook ignores it (TASK-012).
- Stripe webhook returns 200 before DB write (TASK-013).
