# PENDIENTES — Dr. Bike Sydney

> Lista maestra de lo que falta. Vive en el repo a proposito: sobrevive a que se
> cierre un chat, se pierda el historial o se reinstale Claude.
>
> Ultima verificacion contra el sistema real: **2026-08-17** (numeros de la
> tabla de abajo). La auditoria completa de las 22 secciones (**22.4**) sigue
> siendo del 2026-08-16 - eso no se repitio, solo se actualizaron los
> numeros que cambian solos con cada PR mergeada. Antes esta linea decia
> 2026-08-01/07-27 y ya no era cierto - quedaba desactualizada desde julio.
> La misma trampa se repitio con 22.4 apenas un dia despues: ver 22.4.1.
> Regla: si una linea de aqui contradice al codigo o a la base de datos, gana el
> sistema. Corregir esta linea en el momento y anotar por que.

## Salud del proyecto (verificado 2026-08-17)

| Chequeo | Resultado |
|---|---|
| `npm run check` | Verde - 38 archivos JS, i18n 1028 claves es/zh, 822 strings en 5 superficies |
| `npx vitest run` | 380 tests, 36 archivos, 0 fallos |
| PRs abiertas | 0 al 2026-08-20. Las 6 de la fila anterior (#277, #280, #281, #285, #287, #288) ya se resolvieron: #277/#281/#285/#287/#288 mergeadas, #280 cerrada sin mergear (quedo obsoleta, ver 4.1). Sumar #298 (cache-busting de la 3.2, en revision) |

El codigo esta sano. Lo que sigue no son bugs: son cosas sin hacer.

---

## 1. Diego — bloqueantes

### 1.1 ~~Confirmar `CRON_SECRET`~~ — CERRADO 2026-07-27, la causa era otra

`CRON_SECRET` estaba puesto y andando todo el tiempo, e `INTERNAL_API_SECRET`
tambien. Lo que impedia que salieran los mails programados era esto:

```js
const BASE = process.env.VERCEL_URL ? `https://${VERCEL_URL}` : <dominio propio>
```

`VERCEL_URL` SIEMPRE esta seteada en Vercel, asi que el fallback nunca corria, y
su valor es el hostname del deploy (`dr-bike-sydney-<hash>-dr-bike.vercel.app`),
no el dominio propio. Ese host responde `302 -> vercel.com/sso-api`: Deployment
Protection rebota la llamada en el borde, antes de que llegue a la funcion. Por
eso `/api/send-cron` registraba 200 y `/api/send-email` no registraba nada.

Cinco call sites tenian la misma construccion, incluidos dos que no son crons:
el WhatsApp que avisa a Diego que un cliente cancelo, y la push al cliente.
Arreglado en el PR #118 (`SELF_BASE_URL` en `_security.js`) y **verificado en
produccion**: Diego se puso el cumpleanos de hoy, apreto Run y recibio el mail.

Daño en datos: **ninguno**. `select count(*) from profiles where
birthday_promo_sent_year = 2026` devolvio 1, y era la prueba del propio Diego.
Nadie quedo marcado como "ya enviado" sin haberlo recibido.

La leccion, ya convertida en codigo (PR de `logSendFailure`): los callers solo
miraban `r.ok` y se tragaban todo lo demas, asi que un envio fallido no dejaba
rastro. Por eso el diagnostico anterior le echo la culpa a `CRON_SECRET`
durante semanas. Un job de fondo que falla en silencio es indistinguible de uno
que no tenia a quien escribirle.

### 1.1-bis Texto historico (ya no aplica, se conserva por trazabilidad)

**Estado: sin verificar.** Los logs de runtime de Vercel solo retienen ~1 dia en
este plan y no muestran ninguna llamada a `/api/send-cron` ni ningun 401 en esa
ventana, asi que desde el codigo no se puede saber.

**Importante - correccion de un error que estuvo escrito en CONTEXT.md:** NO es
cierto que "todos los emails automaticos" esten cayendo. La verificacion en
codigo (`api/send-cron.js` linea 703 en adelante, `api/send-reminders.js` linea
34) dice esto:

| Email | Pasa por `CRON_SECRET`? |
|---|---|
| Confirmacion de reserva | NO - la dispara la app via `/api/send-email` |
| Invoice | NO - la dispara el mecanico via `/api/send-invoice` |
| Reset de password, bienvenida, pedido de resena | NO |
| `b2b` y `upsell` | NO - son publicos, se llaman desde el navegador a proposito |
| Recordatorio 2h (`send-reminders`) | **SI** |
| Cumpleanos, reengagement, carrito abandonado, recordatorio de servicio, aviso anticipado, no-show | **SI** |

Por eso Diego ve mails llegando: los transaccionales nunca tocaron ese candado.
El riesgo esta acotado a los 6 programados.

**Como verificarlo (30 segundos):** Vercel -> proyecto `dr-bike-sydney` ->
Settings -> Environment Variables -> buscar `CRON_SECRET`. Si no esta, crearlo
con cualquier cadena larga y aleatoria en el entorno Production. Vercel la manda
sola como `Authorization: Bearer` en cada ejecucion de cron. Alternativa: la
pestana Crons del proyecto muestra la ultima corrida y su codigo de estado.

### 1.2 Backups de Supabase (TASK-003) — RESUELTO 2026-08-03, falta probar la restauracion

**La respuesta a "estan activos" era no, y no podian estarlo.** El proyecto esta
en plan **Free**, y el plan Free de Supabase no genera ningun backup automatico.
El dashboard lo decia textual: `LAST BACKUP: No backups`. No era que nadie lo
hubiera verificado - no habia nada que verificar.

**Lo que hay ahora.** Un repo **privado** aparte,
[`Peredodiego2026/Dr.Bike-Sydney-backups`](https://github.com/Peredodiego2026/Dr.Bike-Sydney-backups),
con un GitHub Action que corre todas las noches a las 02:00 de Sydney y
commitea `schema.sql`, `data.sql` y `roles.sql`. El historial de git es la
retencion: cada noche es un commit. Costo $0, sin pasar a Pro.

**Por que en otro repo:** este repo es publico. Un dump de la base son los
nombres, emails, telefonos y direcciones de los clientes. Ni como artifact de
Actions ni en ninguna rama de aca. Ademas asi la contraseña de la base nunca
entra a un repo publico.

**Verificado el 2026-08-03, no "deberia andar":** el run
[30809271924](https://github.com/Peredodiego2026/Dr.Bike-Sydney-backups/actions/runs/30809271924)
termino verde y dejo el commit `c7ca423` con 47K de schema (25 tablas, 39
policies de RLS), 386K de datos y los roles. Conteos leidos del propio dump:
`services` 33 filas, `van_zones` 48, `auth.users` 12, `profiles` 11, `bikes` 4.
Las 33 de `services` cuadran con las 32 que midio la auditoria del 01-ago mas el
`E-Bike Service` que Diego creo ese mismo dia - o sea, el dump es de la base
viva y actual, no de una copia vieja.

**Lo que sigue abierto de este punto:** la restauracion de prueba. Tener el dump
no prueba que restaure. Falta levantarlo en un proyecto scratch de Supabase y
contar filas contra produccion. Hasta que eso pase, esto es un backup **no
probado**.

Detalle operativo, incluido el guardrail que hace fallar el job en vez de
commitear un dump vacio, en el README de ese repo.

---

## 2. Diego — decisiones que destraban codigo

| # | Que | Desde |
|---|---|---|
| 2.1 | Sacar el PIN en texto plano: dejar de mandarlo en las requests, de guardarlo en localStorage, y dropear la columna `pin` de `escalation_contacts`. Hoy sigue como fallback | 29-jun |
| ~~2.2~~ | ~~Confirmar `scripts/add-card-on-file-columns.sql`~~ **CERRADO 27-jul: Diego lo corrio contra produccion, las dos columnas existen** | - |

Para 2.2, la consulta de verificacion:

```sql
select table_name, column_name
from information_schema.columns
where (table_name = 'profiles'  and column_name = 'stripe_default_payment_method_id')
   or (table_name = 'bookings'  and column_name = 'completion_payment_intent_id');
```

Dos filas = ya esta aplicado. Cero filas = falta correr el script.

---

## 2.5. Cobrar desde desktop (decidido 2026-07-27, sin empezar)

> **CERRADO, y esta seccion quedo desactualizada mucho tiempo sin que nadie la
> corrigiera.** Verificado en codigo el 2026-08-16: `bkProceed()` **no existe
> en el repo** (`grep` solo encuentra el nombre en dos comentarios de
> `js/i18n.js`). `openBooking(preselect)` en `landing.html:2581` navega a
> `#book-service` - el wizard del SPA, el que cobra -, y `landing.html:3389`
> carga `js/app.js`. Los 5 pasos que este punto dejaba por hacer ya estan
> hechos. Se conserva el texto original abajo por trazabilidad: **no
> describe el codigo actual.**

**El problema, verificado en codigo el 27-jul:** en desktop NO existe codigo de
pago. El aviso "Online payments coming soon" de `landing.html` no tapa un
checkout que funcione: atras no hay nada. `bkProceed()` solo escribe la reserva
en Supabase, sin cobrar y sin notificar a nadie. En movil, en cambio, el pago
esta vivo y probado (tarjeta + Apple Pay/Google Pay, cobra el call-out, y
`finalizeBooking()` dispara WhatsApp a Diego + SMS al mecanico + email al
cliente). El cobro real con Apple Pay del 13-jul fue en movil.

**La causa de fondo:** `landing.html` tiene DOS flujos de reserva. El boton
`Book a Service` del hero abre el modal viejo `bk-` (sin pago); un link mas
abajo abre `#book-service`, que es el wizard del SPA y si cobra. La
unificacion de julio (commit `0c639c1`) conecto un CTA y dejo el otro en el
flujo viejo.

**Decision de Diego (27-jul): unificar.** El wizard del SPA pasa a ser el unico
flujo, tambien en desktop.

Hechos verificados que hacen esto viable:

- `landing.html` YA carga Stripe v3 (linea 69) y `js/stripe.js` (linea 3952)
- Las `data-screen` del wizard (`book-service`, `service-summary`, `payment`,
  `tracking`) YA existen en `landing.html` y renderizan - comprobado en vivo:
  32 tarjetas de servicio y el calendario cargan bien
- Los 5 puntos de entrada del flujo viejo pasan TODOS por una sola funcion,
  `openBooking(preselect)` en `landing.html:2460`. Cambiando esa unica funcion
  se redirigen los 5 CTAs

**El hueco a cerrar:** el wizard del SPA no soporta preseleccion de servicio.
4 de los 5 llamados a `openBooking()` pasan un nombre de servicio que hoy se
perderia. Hay que agregar soporte de preselect en `renderBookService()`
(`js/app.js:437`) antes de redirigir.

Pasos, en orden:

1. Soporte de preselect en `renderBookService()`.
2. Reescribir `openBooking(preselect)` para navegar a `#book-service` en vez de
   abrir `#booking-panel`.
3. Verificar el flujo completo en desktop. **Ojo: local no alcanza** - el
   server estatico no sirve `/api`, asi que no hay slots de horario. La
   verificacion real es en produccion.
4. PR aparte: borrar el flujo `bk-` muerto (~600 lineas, `landing.html`
   2460-3110) y el overlay de coming-soon.
5. Bump de `?v=` de app.js en las dos paginas + version del service worker.

**Riesgo a manejar:** esto pone un cobro real de $20 en el CTA principal del
sitio. Antes de mergear hace falta una reserva de punta a punta en produccion
con tarjeta real (o el bypass de admin, que ya existe hardcodeado para
peredo.dm@gmail.com) y confirmar que llegan las 3 notificaciones.

## 3. Diseno

### 3.1 ~~No existe lista de hallazgos de diseno~~ — CERRADO 2026-08-03

> **Las 5 superficies estan auditadas y escritas.** `landing` en la seccion 8,
> `SPA movil` + `mechanic` + `admin` en la seccion 12, y `track.html` en la
> **seccion 13**, la ultima que faltaba. Ya no se trabaja a ciegas en diseno:
> lo que sigue es ejecutar esas listas, no volver a mirar. El texto original
> queda abajo por trazabilidad.

Durante semanas se repitio "quedan ~14 de 36 hallazgos de diseno pendientes".
El 27-jul se verifico: **esa lista no esta en ningun lado del repo**. Los 15
checkboxes sin marcar de `docs/ROADMAP.md` son puertas de negocio y marketing
(Google Business Profile, plan de contenido, metricas de funnel, campana de
primavera), no hallazgos de diseno.

Para avanzar en diseno hace falta una auditoria nueva de las 5 superficies
(SPA movil, landing, mechanic, admin, track) escrita en un documento. Sin eso se
trabaja a ciegas.

**Estado 2026-08-01: 4 de las 5 superficies ya tienen lista escrita.** `landing`
esta en la seccion 8; `SPA movil`, `mechanic` y `admin` en la seccion 12. **Falta
solo `track.html`**, que no entro en ninguna de las dos rondas. Este punto queda
abierto hasta que se audite esa quinta.

**Estado 2026-08-03: `track.html` auditada, seccion 13. Punto cerrado.**

### 3.2 Dieta de `landing.html` - CERRADO 2026-08-18

Los 17 bloques `<script>` inline (15 clasicos + 2 `type="module"`, ~2155
lineas) se sacaron a `js/landing-inline.js` (clasicos, concatenados en su
orden original - ese orden importa, comparten el scope de nivel superior del
archivo igual que antes compartian el scope global de la pagina) y
`js/landing-modules.js` (los 2 `type="module"`: el bootstrap de GrowthBook y
el puente de idioma/hora `window.__drbikeI18n`/`window.__drbikeTime`).
`landing.html` los carga con `<script src="js/landing-inline.js">` y
`<script type="module" src="js/landing-modules.js">`, en la posicion donde
estaba el ultimo bloque de cada tipo - un script clasico corre en cuanto el
parser lo encuentra, asi que moverlo a una posicion mas tardia es seguro (hay
estrictamente mas DOM ya armado, nunca menos); los `type="module"` ya se
difieren al final sin importar su posicion, asi que consolidarlos no cambia
nada de su timing relativo.

`landing.html`: 3529 lineas / 229 KB -> 1424 lineas / 111 KB (-51% peso,
-60% lineas). Los 2 archivos nuevos suman 122 KB (114 KB + 8 KB) que ahora el
navegador cachea aparte en vez de descargar de nuevo con cada visita a la
pagina.

**Bug real encontrado por la extraccion (no preexistente, lo causo mover el
codigo):** los imports de `js/landing-modules.js` decian
`from './js/i18n.js'` y `from './js/time-format.js'` - rutas correctas
cuando el modulo vivia inline en `landing.html` (raiz del sitio), rotas una
vez que el archivo mismo vive en `/js/`, porque `./js/...` se resuelve
relativo a la ubicacion del propio archivo. Sin el fix, el navegador pedia
`/js/js/i18n.js` (404) y el puente de idioma no cargaba. Se encontro
revisando la consola/red en un navegador real antes de dar el trabajo por
terminado - `npm run check` y los tests no lo detectan porque ninguno de los
dos ejecuta el modulo en un navegador. Corregido a `./i18n.js` /
`./time-format.js`.

**3 strings sin traducir, encontrados por la misma extraccion:** al mover el
codigo de HTML a un `.js` real, `scripts/i18n-check.mjs` (que ya escaneaba
`js/app.js`/`js/components.js` con este patron, ver 10.1) empezo a revisar
tambien `js/landing-inline.js` y encontro 3 strings que el escaneo de HTML
(mas limitado) nunca habia visto:
- `"Type your question"` - el `aria-label` del input del chat bot (el
  `placeholder` con puntos suspensivos ya estaba traducido, este sin puntos
  no). Se traduce solo con el diccionario, via el mismo mecanismo generico
  que ya traduce cualquier `[aria-label]` del DOM - no hizo falta tocar
  codigo.
- `"Get Started -"` - el prefijo de `gsBtn.textContent = 'Get Started - ' +
  c.price`. Se investigo si esto era un bug real (el boton se queda en
  ingles para un visitante es/zh) y **no lo es**: los 3 precios de plan son
  fijos (`$67/month`, `$97/month`, `$197/month`), y el diccionario ya tenia
  una entrada para cada string completo resultante (`'Get Started -
  $97/month': 'Comenzar - $97/mes'`, etc.) desde antes de este PR - el
  mecanismo generico de traduccion (el `MutationObserver` que re-escanea el
  DOM) ya lo cubria. Verificado en navegador: el modal de plan muestra
  "Comenzar - $97/mes" correctamente. Se agrego igual una entrada para el
  prefijo solo (`'Get Started -': 'Comenzar -'`) porque el checker estatico
  no sabe de los 3 precios fijos y la pide - no cambia nada en runtime, deja
  el check verde de forma honesta en vez de silenciarlo.
- `"Please wait a moment for the security check to finish, then try again."`
  - mensaje de un `alert()` nativo cuando el widget de Cloudflare Turnstile
  todavia no cargo el token. Solo diccionario, igual que el precedente ya
  existente `'Please enter a valid email address.'` (linea de arriba en el
  mismo archivo) - ningun `alert()` de este proyecto llama a
  `translateValue()`, asi que ese mensaje se sigue mostrando en ingles en
  runtime sin importar el idioma. Es una limitacion preexistente y mas
  amplia que esta tarea (aplica a todo `alert()`/`confirm()` del sitio, no
  solo a este), no algo que 3.2 tenga que resolver.

**Verificado:** `npm run check` limpio (i18n, color-check con
`js/landing-inline.js`=80 y `js/landing-modules.js`=0 en el `BUDGET`, resto
sin cambios), `npx vitest run` 380/380. En navegador (servidor estatico
local, sin backend real): modal de info de plan (abre con el plan correcto,
boton traducido), tarjeta de regalo, selector de idioma (ida y vuelta en/es
confirmada por `document.documentElement.lang` y el H1), bot de FAQ (abre,
`aria-label` y `placeholder` correctos), boton "Book Now" (dispara
`openBooking()`, cambia el hash a `#book-service` - el wizard en si es
territorio de `js/app.js`/`js/router.js`, no tocado aca). Sin errores nuevos
en consola; los que aparecen (Turnstile invalido en localhost, SW que no
registra en `serve`, `/api/*` 404) son del entorno de prueba sin backend, no
de este cambio.

**Nota para quien toque el CSP despues:** `landing.html` era la unica de las
5 paginas con bloques `<script>` inline con codigo - `index.html`,
`admin.html`, `mechanic.html` y `track.html` ya no tenian ninguno. Ahora que
esta extraccion la dejo en cero tambien, ya no queda ningun `<script>` con
codigo inline en ninguna superficie. Aun asi `'unsafe-inline'` en
`script-src` (`vercel.json`) **no se puede sacar todavia**: `landing.html`
sigue teniendo 2 bloques `<script type="application/ld+json">` (datos
estructurados, no codigo) que el CSP igual exige permitir sin nonce/hash. No
es trabajo de esta tarea - queda anotado para cuando alguien decida meterle
nonce al CSP.

**Bug real encontrado en una revision posterior al merge, 2026-08-18 -
CERRADO.** Esta tarea sacaba codigo inline de `landing.html` (servido
NETWORK FIRST por `sw.js`, nunca queda viejo) y lo movia a
`js/landing-inline.js`/`js/landing-modules.js` (dos archivos `.js` reales,
que `sw.js` sirve CACHE FIRST). Los `<script src=...>` que los cargan se
escribieron sin `?v=` - exactamente el caso que el propio comentario de
`sw.js` ya advertia ("give new scripts a `?v=` in the page - do not rely on
this list"). Efecto real: cualquier browser que haya visitado `landing.html`
despues de este PR y antes de este arreglo tiene esos dos archivos
congelados para siempre, sin importar cuantos commits nuevos los toquen -
el borrado del cluster de AI Diagnosis en `js/landing-inline.js` (ver 17.3
mas abajo, commit `944f613`) hubiera sido invisible para esos visitantes
tambien. No se detecto antes de mergear porque `npm run check` no tenia
ningun chequeo sobre estos dos archivos todavia.

Arreglado: `scripts/admin-assets-version-check.mjs` (que ya hacia este
mismo trabajo para `admin.html`/`js/admin.js`/`css/admin.css`) se
generalizo a `scripts/versioned-assets-check.mjs` y ahora cubre tambien
`landing.html` + los 2 archivos nuevos. `?v=` es un hash del contenido de
cada archivo, no una fecha a mano - `npm run check` falla solo si alguno de
los dos cambia sin que el `?v=` se mueva. `sw.js` bump a v68 (documentado en
su propio comentario de cabecera) para limpiar de una vez los archivos sin
version que ya estan cacheados desde el deploy original de esta tarea -
sin ese bump, el fix del `?v=` de aca en adelante no alcanza a los
navegadores que ya visitaron la pagina antes de hoy.

### 3.3 Handlers inline que quedan - CERRADO 2026-08-16

Los `onclick` ya se eliminaron todos (TASK-023). Faltaban
`onfocus`/`onblur`/`oninput`/`onchange`/`onkeydown`, contados el 27-jul:

| Archivo | Contado 27-jul | Real al 16-ago (antes de este PR) |
|---|---|---|
| `landing.html` | 33 | 21 |
| `admin.html` | 12 | 0 |
| `js/admin.js` | 6 | 0 (comentarios documentando el refactor, no codigo) |
| `js/mechanic.js` | 6 | 0 (idem) |
| `mechanic.html` | 2 | 0 |
| **Total** | **59** | **21** |

`admin.html`/`mechanic.html`/`js/admin.js`/`js/mechanic.js` ya se habian
limpiado (Audit 12.17, event delegation con `data-*`). Quedaban los 21 de
`landing.html`: 10 pares onfocus/onblur (resaltar el borde en foco, en el
formulario de flota y el de membresia) + 1 oninput (`clearGiftPreset()`).
Los 10 pares se movieron a `addEventListener` directo por campo (son
estaticos, no hace falta delegacion) - **ojo, un intento con CSS `:focus`
no funciona**: estos campos traen `border` en su propio `style=` inline, y
un inline style le gana en especificidad a cualquier regla de hoja de
estilos que no sea `!important`. El `oninput` se movio igual que los casos
de Audit 12.17. Verificado en navegador: los 9 campos + el textarea cambian
de borde en foco/blur igual que antes, y escribir en el monto personalizado
sigue limpiando el preset seleccionado.

**Esto NO alcanza para sacar `'unsafe-inline'` de `script-src`.** El CSP de
`vercel.json` no usa nonce ni hash, asi que `'unsafe-inline'` sigue
cubriendo tambien los bloques `<script>` inline que `landing.html` todavia
tiene varios de (ver 10.1 y 3.2) - sacarlo hoy rompe esos scripts, no solo
los atributos que se acaban de limpiar. Eso es trabajo de la 3.2, no de
este punto.

### 3.4 Lighthouse formal nunca se corrio

Todo lo que hay son estimaciones. Necesita Chrome DevTools -> Lighthouse sobre
la URL de produccion, en movil y desktop. Lo tiene que correr Diego o hay que
montarlo en CI.

---

## 4. Traducciones (el mecanismo ya esta decidido)

### 4.1 `business.html` y `bike-check.html` - CERRADO 2026-08-17

Estaban 100% en ingles. `scripts/translate-static-pages.mjs` (nuevo,
`npm run static-pages:translate`) hace exactamente lo que este punto pedia:
NO son templates como el generador de suburbios, el ingles sigue siendo la
fuente, y un diccionario por pagina reemplaza fragmentos de prosa completos
(mismo enfoque que `api/_email-i18n.js`) sobre el HTML ya renderizado -
markup, JS inline, precios y URLs no se tocan. 142 strings reales entre las
dos paginas (no 79+63: ese numero doble-contaba placeholders repetidos como
"1-4 bikes", que en el HTML real es una sola cadena usada dos veces).

**Cada clave se verifica contra el HTML antes de escribir nada** - si una ya
no matchea (typo, o el ingles cambio debajo), el script corta en vez de
publicar esa frase en ingles en silencio. Mismo principio que el 22.1, pero
para copy en vez de formato de hora.

`hreflang` + `<html lang>` se inyectan en **las 3** versiones, incluida la
inglesa (`business.html`/`bike-check.html` no tenian ninguno antes de esto):
sin eso Google nunca hubiera encontrado las traducciones desde la pagina en
ingles. `vercel.json` ya tenia las rutas `/es|zh/<suburbio>` - se sumaron
`business` y `bike-check` a esa misma lista. El sitemap se resolvio en
`scripts/generate-suburb-pages.mjs` (que ya lo regenera) en vez de un
segundo escritor separado: `business`/`bike-check` tenian una entrada unica
en ingles sin alternates, ahora emiten las 3 como una tabla de suburbio mas
(`TRANSLATED_STATIC_PAGES`), sin dos scripts peleando por el mismo archivo.

**Encontrado al escribirlo, no al usarlo:** el script propio de este punto no
es idempotente si se corre dos veces seguidas sin querer - la segunda corrida
lee su propia salida anterior (el archivo ingles es fuente Y destino) y
duplicaba el bloque de `hreflang`. Se probo corriendolo 3 veces seguidas
antes de darlo por bueno; ahora normaliza el bloque antes de reinyectarlo,
tolerando tambien CRLF (`git core.autocrlf=true` en este repo entrega los
archivos con CRLF en Windows aunque esten en LF en el commit).

**Un hallazgo real de la traduccion, no del mecanismo:** la primera pasada
uso "service" sin traducir en 3 frases de `bike-check.html` ("un service
profesional"), inconsistente con el resto del proyecto que siempre usa
"servicio". Se probo el quiz completo (los 4 resultados: rojo, amarillo x2,
amarillo x1, verde) en un navegador real con `answer()` llamado a mano, no
solo leyendo el diccionario - ahi aparecio tambien un CTA
("Call 0433 963 250", armado en JS para el resultado rojo) que se habia
quedado sin traducir en las dos primeras pasadas por revisar el HTML estatico
y no las cadenas que arma `showResult()` en tiempo de ejecucion.

**Segundo hallazgo del mismo tipo, en el rebase del 2026-08-18:** la barra de
progreso del quiz (`answer()`) armaba `'Question '+(q+1)+' of 5'` por
concatenacion - el diccionario SI tenia las 5 variantes completas
("Question 1 of 5".."Question 5 of 5") traducidas en es y zh, pero como
`translate-static-pages.mjs` reemplaza fragmentos que aparecen literales en
el HTML ya renderizado, y ese texto nunca aparece completo en el archivo
fuente (esta partido en 3 pedazos por el `+`), esas 5 entradas nunca
matcheaban - un visitante es/zh veia "Question 2 of 5" en ingles en medio
de una pagina traducida. Mismo defecto que el boton "Get Started -" de la
3.2, causa distinta: alli el mecanismo de runtime (`translateValue` +
`MutationObserver`) SI lo hubiera resuelto porque ya tenia las 3 variantes
de precio reales matriculadas; aca no hay mecanismo de runtime - la pagina
se traduce una sola vez, en build. `'Complete!'` tampoco tenia entrada en el
diccionario, mismo sintoma. Arreglado en el fuente ingles: un array
`progressLabels` con las 5 frases completas (para que existan literales en
el HTML y el diccionario las pueda matchear) en vez de la concatenacion, mas
la entrada de diccionario que faltaba para `'Complete!'`. Verificado
llamando a `answer()` a mano en un navegador real, es y zh: "Pregunta 2 de
5" / "第 2 题，共 5 题" y "¡Completo!" / "完成！".

**Efecto de lado, no planeado:** correr `npm run suburbs:generate` para
regenerar el sitemap tambien reescribio las 60 paginas de suburbio -
revirtiendo `var(--gray)`/`var(--border)`/`var(--green)` a hex literal,
porque la plantilla del generador nunca se actualizo cuando esas 60 paginas
se convirtieron a tokens. Se descartaron esas 60 reescrituras
(`git checkout`) antes de commitear; el generador en si seguia con hex viejo
en su propia plantilla, sin tocar en este PR - quedo anotado aparte.

**Ya arreglado, 2026-08-18.** El PR #285 (sesion aparte) corrigio la
plantilla del generador antes de que este punto llegara a mergearse -
correr `npm run suburbs:generate` ahora reproduce las 60 paginas byte a
byte (0 lineas de diff, solo fin de linea LF/CRLF). Este punto se rehizo
sobre esa base: `TRANSLATED_STATIC_PAGES` y `BLOG_SLUGS` conviven en el
mismo `sitemap()` sin pisarse, `GENERATED_BUDGET` recalculado a 3549 con
la metodologia de placeholder (nunca a mano). La rama original de este
punto (`feat/business-bikecheck-translations`, PR #280) se abrio antes de
la 3.2 (PR #291) y antes del #285 - conflicto real al intentar mergearla
hoy, asi que se rehizo entera sobre `main` actual en vez de resolverla a
mano. **Cerrar #280 sin mergear.**

### 4.2 Los 5 posts del blog - CERRADO 2026-08-17

Estaban 100% en ingles. `scripts/translate-blog-posts.mjs` (nuevo, `npm run
blog:translate`) - mismo mecanismo que 4.1 (diccionario por pagina,
fragmento completo, el ingles sigue siendo la fuente), separado de
`translate-static-pages.mjs` porque estos 5 viven en `blog/` y se cruzan
entre si (cada post linkea a los otros 4 desde su seccion "More from Dr.
Bike Sydney").

**Encontrado de pasada, arreglado aparte:** `best-bikes-for-sydney-commuting-2026.html`
tenia el `<style>` entero con llaves dobles (`*{{box-sizing...}}`, resto de
un template que nunca se compilo) - el CSS nunca se aplicaba, la pagina
estaba en produccion, indexada, sin ningun estilo. Bug real de produccion,
no de traduccion: se separo en su propio PR urgente en vez de esperar a
que esta traduccion estuviera lista.

**Cross-links, mismo criterio que 4.1:** los 5 posts se linkean entre si y
con `/bike-check` en su seccion de relacionados, y con las 20 paginas de
suburbio en su seccion "We come to you across Sydney" - todos esos
destinos ya tienen es/zh, asi que las 3 versiones de cada post enlazan en
su propio idioma. Un link embebido a mitad de parrafo (el post de bicis de
commuting menciona la guia de leyes de e-bikes) se resolvio a mano en el
diccionario en vez de con el reemplazo generico de href, porque el href
esta en el medio de una oracion traducida, no en su propia etiqueta.

**`scripts/generate-suburb-pages.mjs` tambien se toco, dos cosas:**
1. El sitemap ahora declara los 15 URLs de blog (5 posts x 3 idiomas) con
   sus alternates - antes eran 5 entradas en ingles sin alternates.
2. `BLOG_POSTS` (la lista de "Bike care guides" que aparece al final de
   cada pagina de suburbio) dejo de ser ingles-solamente y ahora es
   `{en, es, zh}`. El comentario que justificaba eso ("no tienen
   traduccion todavia, mandar a un lector a un articulo en ingles es peor
   que no linkearlo") ya no es cierto. **El codigo esta escrito pero no
   esta activo todavia**: correr el generador para que las 60 paginas de
   suburbio muestren los links nuevos pisa la conversion a `var(--token)`
   que esas paginas ya tienen (ver el aviso aparte sobre esa plantilla
   desactualizada) - se descartaron esas 60 reescrituras antes de
   commitear, mismo que en 4.1. Corre limpio en cuanto se actualice esa
   plantilla.

**No era idempotente en el primer intento**, igual que 4.1 y por la misma
razon (el ingles es fuente y destino): probado corriendolo 2 veces
seguidas antes de darlo por bueno.

---

## 5. Deuda tecnica

| # | Que | Detalle |
|---|---|---|
| 5.1 | Paginacion y filtros de fecha (TASK-030) | **Admin: CERRADO** - ya tiene `.range()` + filtros server-side y boton "Load more" (`js/admin.js:2636`, TASK-030 en `tasks.md` estaba desactualizado). **Mechanic y client: NO se pagino a proposito.** Estan acotados por naturaleza (un van desde hace 7 dias, un cliente de por vida - no una tabla que crece con todo el negocio) asi que en vez de paginacion completa, el server ahora manda `X-Truncated: true` si el tope (300 mechanic, 100 client) se llega a tocar, y la app avisa en vez de recortar en silencio (2026-08-16, esta misma sesion). Revisar si ese juicio de "no hace falta pagina completa" resulta equivocado. |
| 5.2 | Prueba de carga (TASK-043) | ~500 concurrentes sobre booking + availability + GPS. **Ojo: no se puede correr contra produccion sin plan** - crearia reservas y cobros reales. Necesita entorno de staging o datos de prueba aislados |
| 5.3 | Scroll-to-top del wizard - **CERRADO por codigo (2026-08-17), no por pixeles** | Rastreado en codigo: `router.js` resetea el scroll en cualquier cambio de ruta (`prevRoute !== route`), pero los 3 pasos del wizard (`book-service`) re-renderizan sin tocar el hash - por eso `js/app.js` tiene su propio `scrollStepToTop()`, llamado en `renderStep1` (:619), `renderStep2` (:865) y `renderStep3` (:1003), mismo patron que el router. Las transiciones que si cambian de ruta (`service-summary`, etc.) quedan cubiertas por el reset generico. **Con esto la cobertura es logicamente completa - no hay un paso sin su llamada.** Lo que NO se logro: ver el reset ocurrir en vivo. En el preview local se confirmo que `window.scrollY` es un contexto de scroll real (no un div interno sin efecto) y que seleccionar un servicio corre `scrollStepToTop()` (el scroll bajaba de 1500 a ~10 apenas al elegir la tarjeta), pero el click de "Continuar" para cruzar a paso 2 no llego a completarse limpio en ese entorno - no se debe a un bug encontrado, se debe a que simular la seleccion via JS no disparo el mismo flujo que un click real. Si alguien quiere el ultimo tramo (ver paso 1 a paso 2 con scroll real), es un vistazo de un minuto en Chromium, no una investigacion. |
| 5.4 | Secretos sin usar en Vercel | `MAPBOX_TOKEN`, `GOOGLE_PLACES_API_KEY`, `POSTHOG_KEY` - ninguno referenciado en el codigo. Borrarlos desde el dashboard |
| 5.5 | El generador de paginas de suburbio revertia `var(--token)` a hex - **CERRADO (2026-08-17)** | `scripts/generate-suburb-pages.mjs` seguia emitiendo hex a mano (`#475569`, `#E2E8F0`, borde del badge verde) donde las 60 paginas comprometidas (raiz + `es/` + `zh/`) ya tenian `var(--gray)` / `var(--border)` / `var(--green)` escritos a mano encima. Correr el generador por CUALQUIER motivo no relacionado (precio, copy, sitemap) revertia las 60 en silencio - asi se encontro, corriendo `npm run suburbs:generate` para levantar un cambio de sitemap durante 4.1. Bug aparte, mas serio: el badge ambar ("Background Checked") tenia un valor de color distinto, no solo sin token - el generador emitia `#D97706`, las 60 paginas vivas tienen `#B45309` (`--amber`). Arreglados los 6 puntos en el generador (2 reglas CSS, la descripcion de servicio x4, el div de badges, el borde del badge verde, y el valor del badge ambar). Verificado: regenerar las 60 con el fix da diff vacio contra lo comprometido (byte a byte, salvo fin de linea), `sitemap.xml` solo mueve el `lastmod` a hoy, y `npm run check` + `npm test` (364 tests) quedan limpios. `GENERATED_BUDGET` de `color-check.mjs` no bajo: el conteo ya reflejaba las paginas convertidas, lo que estaba mal era solo lo que el generador iba a escribir la proxima vez que alguien lo corriera. Sin SQL. |

## 6. Tradeoffs aceptados (NO son pendientes)

- `mechanic_locations` con lectura publica: el mapa en vivo del cliente lo
  necesita, severidad baja, decision tomada.
- El boton de imprimir del reporte de Finanzas usa `window.print()` dentro de un
  popup generado con `document.write()`: documento aparte, fuera de la superficie
  de CSP de `admin.html`. No vale la complejidad de convertirlo.

---

## 7. Negocio (roadmap sep-dic, no es codigo)

Ver `docs/ROADMAP.md` para el detalle y las puertas de cada fase.

- Google Business Profile completo + sistema de resenas corriendo
- Plan de contenido activo: 3 piezas por semana (`docs/PLAN-CONTENIDO.md`)
- Medir el funnel real: visitas -> reservas -> completadas -> resenas
- Campana "prepara tu bici para primavera"
- Primeras membresias vendidas (Basic/Standard/VIP) y referidos activos
- Revisar marca registrada (estrategia figurativa, abogado post-agosto)
- Contenido unico por suburbio: **espera a la primera semana de noviembre 2026**,
  cuando Diego este en Sydney y pueda aportar datos locales reales. No inventar
  ciclovias ni tiempos de respuesta.

---

## 7.5. Documentos a re-sincronizar

<!-- Era un segundo "## 8", chocando con la seccion 8 de abajo, que es la que
     todo el resto del documento referencia como 8.1 a 8.8. Renumerada a 7.5
     (misma convencion que la 2.5) porque esta seccion no la referencia nadie,
     mientras que renumerar la otra habria roto cada mencion a 8.x en el
     documento y en el historial de commits. Detectado por otra sesion,
     28-jul. -->

- `tasks.md` dice que faltan correr `scripts/add-stripe-events.sql` y
  `scripts/harden-bookings-rls.sql`. `CONTEXT.md` dice que Diego los corrio el
  29-jun y que no queda nada pendiente. **Uno de los dos miente**: verificar
  contra Supabase y corregir el que este mal.

---

## 8. Bugs visuales del wizard en desktop (reportados 2026-07-27)

Diego probo el flujo completo en produccion despues del PR #121 (reserva de
prueba con el bypass de admin: **funciono, las notificaciones llegaron**). Lo
que sigue es todo visual, ninguno rompe el pago.

**Estado 2026-07-27: 8.1 a 8.7 CERRADOS**, mergeados en la PR #123 y
verificados en produccion. Falta 8.8 (auditar las otras 3 superficies).
El detalle de que se hizo y como se verifico esta al final de esta seccion.
Los cinco hallazgos que salieron de esa sesion estan en la seccion 9.

### 8.1 CAUSA RAIZ de 8.2 a 8.5 — el wizard es full-screen, la landing no

Las pantallas del wizard (`js/app.js`, `data-screen`) se disenaron como app
movil: barra de accion **fija** abajo, cada pantalla ocupa el viewport entero.
En `landing.html` esas mismas pantallas viven **incrustadas dentro de la pagina
de marketing de ~9000px**. Nada las aisla del resto del documento.

**Arreglar esto de raiz resuelve 8.2, 8.3, 8.4 y 8.5 de una sola vez.** La
direccion propuesta (no implementada): que al entrar a `#book-service` en
landing.html el wizard se monte como overlay a pantalla completa
(`position:fixed; inset:0; overflow-y:auto; z-index` por encima del contenido)
en vez de renderizarse en linea. Sin eso, cada bug se parchea por separado y
vuelven.

**Verificacion obligatoria:** navegador real, 1280px y 375px, en los 3 idiomas.
Nada de esto se puede dar por bueno leyendo el codigo.

| # | Sintoma |
|---|---|
| 8.2 | La barra azul de accion (`Continue`, `Confirm & Pay`) flota **encima** de las tarjetas de servicio y del resumen, tapandolos. Solo se lee bien al llegar al final de la pagina |
| 8.3 | Al abrir un servicio, arriba asoma un bloque azul cortado: es la seccion de newsletter de la landing (con el "Success!" de Cloudflare Turnstile) que quedo por encima de la pantalla del wizard |
| 8.4 | Al elegir una hora la pagina no acompana el scroll: se queda donde esta y solo se habilita el boton |
| 8.5 | En `#service-summary`, el cuadro Date / Time / Location tiene el texto mal distribuido y la direccion se desborda hasta el borde |

### 8.6 Selector de idioma: 3 opciones sueltas -> 1 control

Hoy el header de `landing.html` muestra `English · Espanol · 中文` los tres a la
vista. Diego lo quiere como **un solo boton o icono** que al hacer click
despliega las opciones. Es puramente visual: el mecanismo de `setLang()` no se
toca. Ojo con el foco y el teclado al convertirlo en dropdown.

### 8.7 Emergency Service tiene que distinguirse

La tarjeta de Emergency Service se ve igual que las demas. Diego la quiere
**tenida de rojo con opacidad** para que se lea distinto: no es un servicio
reservable, abre el modal de contacto. Usar el token de `danger` (#DC2626) con
fondo al 8%, mismo patron que los badges del skill `drbike-design`.

### 8.8 ~~Falta revisar SPA movil, mechanic.html y admin.html~~ — HECHO 2026-08-01

**Las tres superficies estan auditadas. Los hallazgos estan en la seccion 12.**
No hace falta leer nada mas de este punto; el texto de abajo se conserva solo
para explicar por que existia.

> Diego reviso solo `landing.html`. Las otras tres superficies no se miraron
> todavia. Esto conecta con el punto 3.1: **no existe lista de hallazgos de
> diseno**, y esta seccion 8 es el primer pedazo real de esa auditoria pendiente.

### Como se cerraron 8.1 a 8.7 (2026-07-27)

`<body data-surface="landing">` es el marcador. Todo lo que sigue esta acotado
a el, ademas de vivir en `css/landing.css`, que solo carga esta pagina. Una
media query de ancho no alcanzaba: un desktop puede abrir `index.html` directo
y tiene que seguir viendo la SPA tal cual.

- **8.1** las `[data-screen]` que no son `home` se montan `position:fixed;
  inset:0; z-index:900` con su propio scroll. Con eso caen 8.2 a 8.5 juntas.
  `js/router.js` bloquea el scroll de la pagina de atras
  (`html.drbike-wizard-open`) y resetea el scroll del overlay al cambiar de
  pantalla; `scrollStepToTop()` en `js/app.js` hace lo mismo entre pasos.
- **8.3** confirmado en codigo: el bloque azul era la seccion de newsletter
  (`landing.html`, "Newsletter Signup"), que vive FUERA de
  `[data-screen="home"]`. Ocultar "home" nunca la ocultaba. El overlay opaco si.
- **8.5** `.summary-row` no tenia padding horizontal: las etiquetas quedaban
  sobre el borde izquierdo de la tarjeta y la direccion contra el derecho.
- **8.7** `createServiceCard()` marca la tarjeta con `service-card--emergency`;
  el tenido rojo (danger al 8% + acento izquierdo) esta solo en la landing.
- **8.6** un boton con globo + idioma actual que despliega las 3 opciones
  (`role="listbox"`, Escape, flechas, click afuera, foco de vuelta al boton).
  `setLang()` no se toco.

Verificado en Chromium real (Playwright) a 1280px en en/es/zh: 24 aserciones,
incluida la pantalla de pago (Stripe monta sus iframes dentro del overlay; no
se apreto Pagar, no se creo ninguna reserva). La SPA movil a 375px se comparo
pixel a pixel contra la version anterior en los 9 pasos del wizard: **0
diferencias**. Los slots de horario se stubearon en local porque el server
estatico no sirve `/api`.

---

## 9. Los cinco hallazgos de la sesion del 27-jul (rama `fix/spa-reliability-batch`)

Salieron de dos cosas: la auditoria del wizard, y de perseguir un reporte de
Diego ("la SPA no responde, se pone negra") que al final era su conexion. Todos
estan **verificados en el codigo**, no son sospechas. Orden por valor/riesgo.

Diego eligio el 28-jul hacer los cinco. Van en **una sola rama con un commit por
item**, no cinco ramas: cada merge a main deploya a produccion, y cinco deploys
seguidos son cinco rondas de verificacion para el mismo lote de arreglos
chicos. El unico riesgoso (9.5, ruteo) va al final para poder revertir ese
commit solo.

**Estado 28-jul: los cinco HECHOS** en `fix/spa-reliability-batch`, con lo que
quedo afuera anotado en 9.7.

### 9.1 Pantallas en blanco cuando la conexion esta lenta

`renderProfile()` y `renderMyBikes()` (`js/app.js`) hacen
`await sb.auth.getUser()` - una llamada de RED - **antes de escribir una sola
linea de HTML**. Con internet lento la pantalla queda vacia hasta que el
servidor contesta: sin spinner, sin nada. `renderMyBookings()` ya hace lo
correcto (pinta un esqueleto y despues carga); es copiar ese patron.

Esto es lo que Diego vio el 27-jul y atribuyo a su internet. Tenia razon sobre
la causa, pero la app no deberia verse rota por una conexion lenta.

**Como se arreglo:** un componente compartido `createBrandLoader()` en
`js/components.js` - el logo DB con un halo azul suave que late, y
"Healthy bikes, happy riders" debajo (pedido de Diego, 28-jul). Se pinta antes
del `await`, con el mismo header y bottom nav que la pantalla final, asi que no
hay salto cuando llega el contenido. Respeta `prefers-reduced-motion`.

### 9.2 Dos archivos JS congelados en los celulares

`index.html` carga `js/live-prices.js` y `js/cta-tracking.js` **sin `?v=`**. El
service worker los guarda cache-first, asi que en cualquier telefono que ya
visito el sitio quedan clavados en la version cacheada **para siempre**, hasta
que cambie el nombre del cache en `sw.js`.

Ya paso: el PR #121 modifico `live-prices.js` sin bumpear `sw.js`. Durante
semanas los celulares con la app instalada corrieron el archivo viejo. El merge
del PR #123 lo destrabo de casualidad (bumpeo `sw.js` por otro motivo), no
porque el sistema lo garantice.

Ademas `sw.js` precachea `/js/app.js` y compania **sin query**, y las paginas
siempre los piden con `?v=...`: esas entradas del precache no se usan nunca.

### 9.3 El boton de pago sigue en ingles en español y chino

"Pay $20.00 Call-out Fee" y "Confirm & Pay $20.00 Call-out Fee" no se traducen
nunca, porque el precio se interpola dentro del string y deja de coincidir con
la clave del diccionario. Verificado en las 3 corridas contra produccion del
27-jul. Es el boton que aprieta el cliente para pagar.

El propio `js/app.js` ya tiene el patron para resolverlo: la nota de "How
payment works" usa `$CALLOUT` como marcador y lo reemplaza DESPUES de traducir.

### 9.4 Dos clientes de Supabase peleando por la misma sesion

`index.html` carga `js/supabase.js?v=...` como script, y mas abajo un modulo
inline hace `import { sb } from './js/supabase.js'` **sin el `?v=`**. Para el
navegador son dos URLs distintas: instancia el modulo dos veces y quedan **dos
GoTrueClient sobre la misma clave de sesion**. Produccion lo avisa en cada
carga ("Multiple GoTrueClient instances detected...").

Hoy no rompe nada visible, pero es la receta para que a un usuario logueado se
le invalide el token cuando los dos intentan refrescarlo a la vez. Se arregla
igualando la URL del import. **Probar logueado.**

### 9.5 iPad y celulares en "modo escritorio" reciben la pagina de PC

`middleware.js` rutea con `/Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/`.
**iPad no esta en la lista**, y un iPhone con "Solicitar sitio web para
computadora" manda user-agent de Mac. Los dos reciben `landing.html`.
Comprobado contra produccion el 27-jul.

Desde el overlay (8.1) ya no se rompe nada, pero les servis la pagina de
marketing de PC en una pantalla de 6 pulgadas.

**Ojo, decision de producto:** el iPad se suma a la lista y listo. Un iPhone en
modo escritorio es **indistinguible de una Mac desde el servidor** - eso solo
se puede resolver del lado del navegador (si el viewport es angosto, mandarlo a
la SPA). Es un cambio de comportamiento, no solo un fix; va al final del lote
justamente por eso.

### 9.5-bis Lo que se hizo del ruteo, y lo que quedo por decidir

**Hecho:** la lista de `middleware.js` ahora es identica a la que ya tenia
`index.html` en su propio guard (`Android|webOS|iPhone|iPad|iPod|BlackBerry|
IEMobile|Opera Mini`). Eran dos listas decidiendo lo mismo y no coincidian:
faltaban `iPad` y `webOS`, asi que una tablet Android recibia la app y un iPad
la pagina de PC. Hay un chequeo en el scratchpad que compara las dos y prueba
8 user-agents; si alguien edita una sola, deja de coincidir.

**Sin resolver, y es decision tuya:** un iPhone con "Solicitar sitio web para
computadora" **y cualquier iPad con iPadOS 13 o superior en su modo por
defecto** mandan user-agent de Macintosh. Desde el servidor son
indistinguibles de una Mac de verdad: no hay arreglo posible en
`middleware.js`. Solo el navegador puede saberlo (ancho de viewport + puntero
grueso).

El riesgo de hacerlo del lado del navegador: `index.html` YA redirige a
`/landing.html` cuando el user-agent no es movil. Si `landing.html` redirige a
`/index.html` cuando el viewport es angosto, una ventana de escritorio angosta
entra en **loop infinito** entre las dos paginas. Si se hace, tiene que ser con
`pointer: coarse` ademas del ancho, y con una marca que corte el rebote. No lo
implemente por eso.

Mientras tanto el daño esta acotado: desde el overlay (8.1) esas tablets ven la
pagina de marketing pero el wizard funciona bien.

### 9.6 Lo que NO esta en este lote

- 8.8: auditar `mechanic.html`, `admin.html` y la SPA movil. Sigue abierto.
- El tenido rojo de Emergency y el padding del cuadro Date/Time/Location
  quedaron **solo en desktop** por el alcance que pidio Diego. En movil la
  tarjeta de Emergency sigue igual que las demas y las filas del presupuesto
  siguen tocando el borde de la tarjeta. Decision pendiente de Diego.

### 9.7 Lo que quedo abierto despues del lote (28-jul) — CERRADO el mismo dia

**Los dos puntos de abajo se resolvieron** cambiando la estrategia de `sw.js`:
el JS y el CSS propios pasaron de cache-first a **stale-while-revalidate**
(sirve lo cacheado al toque y actualiza en segundo plano para la proxima
carga). Las imagenes y fuentes siguen cache-first, que es donde eso rinde.
Con eso: un archivo editado llega al navegador **sin depender de que alguien
bumpee el nombre del cache**, y el modo offline pasa a funcionar de verdad -
verificado editando `js/rider-tier.js` sin tocar `sw.js` y despues cortando la
red, con la app arrancando igual. Tambien se saco la ultima duplicacion de
modulos (`router.js`, `components.js`, `stripe.js` e `i18n.js`).

El texto original queda abajo porque explica POR QUE estaba mal.

> **LEER LA NOTA DE ARRIBA ANTES QUE ESTO.** Lo que sigue describe el estado
> ANTERIOR al arreglo y se conserva solo para explicar por que estaba mal. Otra
> sesion leyo este texto sin la nota y reporto el offline como roto cuando ya
> estaba arreglado y verificado cortando la red (28-jul).

**Los imports internos siguen sin `?v=`.** El 9.2 versiono los scripts que las
paginas cargan con `<script src>`, pero los que un modulo importa a otro
(`js/app.js` importa `./supabase.js`, `./router.js`, `./i18n.js`,
`./rider-tier.js`, `./stripe.js`) se piden **sin query**, y `sw.js` los sirve
cache-first igual. O sea: esos archivos solo se renuevan cuando cambia el
nombre del cache en `sw.js`. Hoy la regla del proyecto ya obliga a bumpear
`sw.js` cuando se toca `i18n.js`, asi que funciona - pero depende de que
alguien se acuerde.

El arreglo de fondo no es ponerle `?v=` a cada import (se desincronizan solos):
es que `sw.js` deje de ser cache-first para el JS/CSS propio y pase a
**stale-while-revalidate** (sirve el cacheado al toque y actualiza en segundo
plano). Cambia la estrategia de cache de toda la PWA, asi que va en su propia
rama y con su propia verificacion, incluido el modo offline - que hoy, dicho
sea de paso, **no funciona** para el JS: la pagina pide `app.js?v=...`, el
cache solo tenia `/js/app.js`, y sin red eso devuelve 408.

**Duplicacion de modulos, el resto.** El 9.4 saco la doble instancia de
`supabase.js`, que era la unica con estado peligroso (el cliente de auth).
`router.js` y `components.js` siguen cargandose dos veces por la misma razon
(tag con `?v=` + import sin query). No rompen nada porque no tienen estado
propio, pero es la misma trampa esperando a que alguien le agregue estado.

---

## 10. Panel de cuenta de la landing (28-jul)

Diego reporto que con la sesion ya iniciada, apretar el boton de usuario abria
el panel Y el modal de login encima. **CERRADO** en la PR #125, verificado en
produccion. La causa: dos mecanismos se peleaban por el mismo boton.
`updateNavForSession()` es el dueño (asigna `btn.onclick` segun haya sesion o
no), y TASK-023 habia cableado ADEMAS el comportamiento de "sin sesion" como un
listener permanente. Sin sesion los dos coincidian, por eso nadie lo vio.
Segunda puerta al mismo sintoma, tambien cerrada: los botones de
pausar/reanudar/cancelar membresia llamaban `openAccountPanel()` sin argumento
y eso se leia como "no hay sesion".

En la misma PR el panel paso a usar los tokens del sistema y a traducirse
entero. Faltaban 4 estados en el diccionario (`Pending`, `In Progress`,
`Completed`, `Cancelled`) y "Upcoming (N)" no podia traducirse con el numero
adentro.

### 10.1 El guardrail de i18n tiene un agujero — MITIGADO 2026-08-02, no cerrado del todo

`scripts/i18n-check.mjs` **borra los bloques `<script>`** antes de buscar texto
en las paginas HTML (`stringsFromHtml()`). Eso sigue siendo cierto, pero
**ya no es toda la historia**: el commit `da57e68` (2026-08-02, "close the
hole that let payment errors ship in English") agrego
`stringsFromInlineScripts()`, que vuelve a leer esos mismos bloques con
otra extraccion - textContent/innerText, propiedades tipo `label:`/`price:`/
`msg:`, `showToast(...)`, y el patron generico `>texto<` (la misma forma que
usa `stringsFromJs()` para `js/app.js`, porque el HTML que arma
`landing.html` a fuerza de `html += '<span>...</span>'` es exactamente esa
forma). Es justo lo que atrapo "Upcoming"/"Pending" la primera vez.

**Probado a proposito, no solo leido.** Se inyecto un string falso sin
traducir en el mismo lugar exacto donde vivio el bug original
(`landing.html`, el `html +=` de la fila "Upcoming" del panel de cuenta) y
se corrio `npm run i18n:check`:

- `html += '<span>Zzz Probe</span>'` (mismo defecto que el bug real) →
  **detectado**, el check fallo señalando el string exacto.
- `var lbl = 'Zzz Probe'; html += '<span>' + lbl + '</span>'` (el mismo texto,
  pero armado en dos pasos: variable intermedia, despues concatenada) →
  **no detectado**, el check paso en verde.

O sea: el agujero de 2026-07-28 esta tapado para la forma exacta en que
ocurrio y para la mayoria de los casos directos. Sigue habiendo un agujero
mas angosto: un string armado en una variable separada y concatenado
despues escapa a las tres extracciones, porque ninguna seria de regex sabe
seguir una asignacion. Cerrarlo del todo pide lo mismo que ya decia este
punto antes de la mitigacion - un parser real de JS (AST), no otra regex -
y eso sigue sin valer la pena solo por esto.

**Actualizacion 2026-08-18 (3.2 ya saco esa UI de los scripts inline, como
decia el parrafo anterior):** el codigo que antes vivia en los `<script>`
inline de `landing.html` ahora es `js/landing-inline.js`, un `.js` real que
`stringsFromJs()` escanea (no `stringsFromInlineScripts()`). Esto **no
cierra** el agujero angosto - `stringsFromJs()` es la misma clase de regex
por patron, con la misma limitacion de no seguir una asignacion en dos
pasos - pero **si demostro que la cobertura mejoro**: al mover el codigo,
`stringsFromJs()` encontro 3 strings sin traducir
(`"Type your question"`, `"Get Started -"`, el mensaje de alerta de
Turnstile) que `stringsFromInlineScripts()` nunca habia señalado mientras
el codigo vivio en HTML (ver 3.2 para el detalle de cada uno). Sigue
pendiente lo mismo que antes: un string nuevo con variable intermedia en
`js/landing-inline.js` todavia hay que traducirlo a mano y con cuidado.

### 10.3 Limpieza de datos falsos y codigo muerto (28-jul) — HECHO

Diego pidio: "borra todo lo que sea falso y antiguo que pueda generar errores
en un futuro, pero antes analiza si sirve o no". Resultado del analisis:

| Que | Veredicto | Por que |
|---|---|---|
| `MOCK_BOOKINGS` (`js/supabase.js`) | BORRADO | Se le devolvia a **cualquier visitante sin sesion**: veia un Tune-Up confirmado para hoy y un servicio completado la semana pasada con 5 estrellas. Ninguno existia. Estaba en produccion |
| `MOCK_SERVICES` (`js/supabase.js`) | BORRADO | 4 precios hardcodeados que tapaban cualquier fallo de red. Los precios viven en la tabla `services` justamente porque cambian |
| Flujo `bk-` completo en `landing.html` | BORRADO (918 lineas) | Muerto desde el PR #121. Traia su propia copia de precios falsos, su pantalla de "Online payments coming soon" (mentira desde que desktop cobra), su propia tabla de recargos y su propio formateador de fechas |
| `submitBooking()` | BORRADO | Sin llamadores |
| Meta Pixel con `PIXEL_ID_HERE` | BORRADO | Inicializaba con el string literal: no recolectaba nada, tiraba error en consola en cada carga, y igual cargaba el script de Facebook y les pegaba en cada visita |
| Boton "Watch Video" | BORRADO | Prometia un video y respondia con `alert('Video coming soon!')` |
| `GROWTHBOOK_KEY_HERE` | SE QUEDA | Ya tiene clave real y el guard funciona |
| "Our mechanic profiles are coming soon" | SE QUEDA | Es un empty state legitimo, no un dato falso |
| `docs/mockups/*.html` | SE QUEDA (por ahora) | Son maquetas de diseno en `docs/`. **Ojo: Vercel las sirve publicamente.** Ver 10.4 |

**Como se probo que el flujo `bk-` estaba muerto** (antes de borrar): en
estatico, nada pone visible `#booking-panel` - lo unico que toca su `display`
es `closeBooking()` poniendolo en `none`. En vivo, un MutationObserver sobre el
panel mientras se clickeaban todos los CTA de reserva visibles: **nunca** se
mostro. El corte se hizo con aserciones sobre la primera y ultima linea de cada
rango; una salto y evito que se comiera el comentario de `openBooking()`.

Ademas, las dos consultas que quedaron (`getServices`, `getMyBookings`) ahora
tienen **limite de 12 segundos**. En un celular con mala señal la request no
falla: se queda colgada, y un spinner infinito es la misma mentira que el dato
falso con otra ropa.

### 10.4 Las maquetas de `docs/mockups/` son publicas — CERRADO (ya estaba, desde el 2026-08-01)

`docs/mockups/payments.html` y `notifications.html` siguen existiendo en el
repo, pero **no llegan a Vercel**: el commit `d3c863c` (2026-08-01, "stop
publishing docs, tests and migrations on the live domain") agrego
`.vercelignore`, y su primera entrada es `docs/`, con un comentario que
describe exactamente este problema ("those mockups were reachable on the live
domain by anyone who guessed the URL"). No es la opcion B que este punto
proponia (excluir en `vercel.json`) sino un archivo aparte con el mismo
efecto. Quedo sin marcar cuando se cerro; no hace falta tocar codigo, solo
este texto.

---

## 11. Reserva a medio hacer y recordatorio de checkout (28-jul)

### 11.1 El borrador se perdia con cualquier recarga — CERRADO

Diego armo una reserva, fue a Perfil a copiar su codigo de referido y volvio:
todo borrado. **Reproducido antes de tocar nada, y no era lo que parecia**:
moverse entre pantallas nunca perdio nada. Lo que borraba todo era una
**recarga completa de la pagina**, porque `window.appState` vivia solo en la
memoria de la pagina. Y hay varias formas de provocar una sin querer: el login
con Google se lleva la pagina entera y vuelve a `/`, iOS recarga una pestaña
que descarto mientras estabas en otra app, un refresh accidental.

Arreglado: el borrador se escribe en `localStorage` (`drbike-booking-draft`) en
cada eleccion y se lee antes de que arranque el router. `localStorage` y no
`sessionStorage` justamente porque la vuelta del OAuth y una pestaña
descartada sobreviven a uno y no al otro. Se descarta a las 24h, y si la fecha
ya paso se tira solo la fecha. El paso 1 muestra un boton "Continuar" que
vuelve al resumen en un toque.

### 11.2 Recordatorio del checkout abandonado — HECHO Y EN PRODUCCION

**Estado real (28-jul, PR #131 mergeada):** Diego corrio el SQL, la tabla
`checkout_attempts` existe, y las tres piezas de codigo estan en produccion.
Lo unico que quedo distinto de lo planeado es **el horario**: Vercel rechazo el
deploy con "Hobby accounts are limited to daily cron jobs", asi que el
recordatorio viaja dentro de `?type=all` y sale **una vez por dia** a las 09:00
UTC, no cada hora. En la practica el cliente lo recibe unas 9 horas despues de
abandonar, no 3.

Por eso mismo la ventana de la consulta se abrio de 24 horas a 7 dias: con una
corrida diaria, quien abandona en las 3 horas previas es demasiado nuevo para
esa vuelta y para la siguiente ya tiene 27 horas, y se caia por el otro lado
sin que nadie se enterara.

Para las 3 horas de verdad hacen falta Vercel Pro o un disparador externo
llamando a `/api/send-cron?type=abandoned-checkout` con el `CRON_SECRET`.
**Decision pendiente de Diego.** Y todavia no se verifico una corrida real en
produccion.

El texto original de la decision se conserva abajo porque explica por que se
eligio la opcion A.

**Decision de Diego (28-jul): opcion A — solo clientes logueados.**

El cron de abandono (`api/send-cron.js?type=abandoned`, cada hora) busca filas
de `bookings` con estado `pending`. Un cliente que llega a la pantalla de pago
y no paga **nunca crea una fila** - la reserva se escribe recien despues del
cobro - asi que no hay nada que encontrar.

Se descartaron: pedir el mail antes de pagar (un campo mas en el paso mas
delicado cuesta conversion) y crear la reserva como `pending` antes de cobrar
(ensucia `bookings`, y todo lo que cuenta reservas empieza a contar las que
nunca se pagaron).

**Bloqueante: Diego tiene que correr `scripts/add-checkout-attempts.sql` en
Supabase.** Una tabla, una fila por cliente (upsert, asi no crece sin limite),
con RLS: cada quien ve solo la suya, el cron entra con el service role.

Despues de eso, del lado del codigo faltan tres cosas:
1. `renderPayment()` hace upsert de la fila al abrir la pantalla de pago.
2. `finalizeBooking()` borra la fila cuando la reserva existe.
3. `api/send-cron.js` suma `type=abandoned-checkout`: filas con
   `reached_payment_at` de mas de 3h, menos de 24h, `reminder_sent_at is null`.
   Mail nuevo en `api/_email-i18n.js` (es/en/zh) preguntando si todavia lo
   necesita, con link para retomar.

### 11.3 Seccion de analitica en el admin — PENDIENTE, decidido hacerlo

Diego (28-jul): un amigo en Francia busco "tienda de bicicletas" y Dr. Bike
Sydney salio primero. Quiere ver en el panel: quien hace click, desde donde,
retencion, cuantos entran al booking, que es lo mas clickeado y lo mas visto.
Formato con barras y graficos, "futurista y minimalista a la vez".

**Lo importante antes de elegir herramienta: los datos YA se estan
capturando.** El proyecto tiene **PostHog corriendo en produccion** (clave real
`phc_p3bN...`, host `eu.i.posthog.com`) en las tres superficies, con
`capture_pageview` y `capture_pageleave` activos, mas eventos propios:
`cta_clicked` (con texto del boton y seccion, desde `js/cta-tracking.js`),
`booking_step_viewed` (con el paso), `experiment_viewed`. Tambien hay Google
Analytics (`G-GXYD68JXZW`) y eventos de e-commerce por `gtag`
(`begin_checkout`, `add_to_cart`, `checkout_progress`).

O sea: **no falta herramienta, falta la pantalla que lea lo que ya hay.**

Recomendacion: quedarse con **PostHog**, no agregar nada nuevo. Esta alojado en
la UE (mejor para privacidad que GA, que manda todo a EEUU), ya trae embudos,
retencion por cohorte y grabacion de sesiones, y tiene API de consulta - o sea
que el panel puede pedirle numeros reales en vez de reimplementar el conteo.
Alternativas miradas y descartadas para este caso: Plausible y Umami son mas
simples y privadas pero no hacen embudos ni retencion por persona, que es
justo lo que Diego pidio; Matomo es autoalojado y es mantener un servidor mas.

Lo que falta hacer, en orden:
1. Revisar que los eventos cubran lo que se quiere medir (hoy falta un evento
   propio al **completar** una reserva; el embudo se corta en el paso de pago).
2. Una funcion `/api/analytics` que consulte la API de PostHog con la clave
   **del lado del servidor** - nunca desde el navegador.
3. La pantalla en `admin.html`, con los tokens del sistema de diseño.

**Ojo con una cosa**: el panel de admin mostrando metricas de negocio no puede
quedar detras del PIN debil que menciona el punto 2.1. Antes de poner numeros
de facturacion ahi, ese acceso tiene que estar cerrado.

### 10.2 `confirm()` y `prompt()` del navegador — CERRADO 2026-08-17

Cancelar y reprogramar desde el panel de cuenta de `landing.html` usaban
`confirm()` y `prompt()` (fecha a mano en `YYYY-MM-DD`, despues la hora
elegida de una **lista fija de 8 horarios** que nunca consultaba
disponibilidad real). Eso ultimo no era solo feo: un cliente podia elegir un
horario que otro ya tenia. `js/app.js` ya resolvia esto bien para la pantalla
`my-bookings` de la SPA, pero es una pantalla y un DOM completamente
distintos (`[data-screen="my-bookings"]`, sus propios helpers privados) -
`landing.html` no podia simplemente llamarla.

Se reconstruyo el mismo patron dentro del panel propio de `landing.html`
(no se navego a la pantalla de la SPA, para no perder el contexto de
Bookings/Bikes/Membership que el panel ya tenia abierto): click en Cancelar
o Reprogramar reemplaza esa fila por una confirmacion o un formulario en
linea (fecha + horarios reales de `/api/auth?role=get-availability`,
mismo endpoint que usa el paso 2 del wizard), en vez de abrir un dialogo.
Las 2 llamadas a `alert()` en los caminos de error tambien se sacaron -
quedan como texto en linea, mismo patron que `fleet-msg`/`gift-error` en
esta misma pagina.

La conversion de horario (12h con AM/PM que devuelve el endpoint <-> 24h
`HH:MM` que exige el POST de reprogramar) **no se reimplemento**: se
importan `toDbTime`/`toDisplayTime` de `js/time-format.js` via un
`<script type="module">`, publicadas en `window.__drbikeTime` para que el
script no-modulo del panel las use. Motivo: este es exactamente el tipo de
bug que ya paso 3 veces en este proyecto (22.1) - escribir la conversion de
nuevo a mano era el riesgo real, no el `confirm()`.

**Verificado en navegador, no solo leido.** Se stubearon `_sb.auth.getSession`
y `fetch` (mismo patron que ya usa este proyecto para probar sin backend
local - ver 8.1) para simular una reserva editable y respuestas reales de
`/api/auth`, y se ejecutaron los flujos completos:
- Cancelar: confirmacion en linea -> "Keep it" revierte -> confirmar de
  verdad envia `client-cancel` y recarga el panel; si el servidor
  responde error, texto en linea (`Could not cancel...`), nunca `alert()`.
- Reprogramar: el `<select>` de horario llega con `9:00 AM` deshabilitado
  (estaba marcado no disponible en la respuesta simulada) y el resto
  convertido a `HH:MM` (`08:00`, `10:00`, `14:00`); cambiar la fecha vuelve
  a pedir disponibilidad; guardar envia `scheduled_time:"10:00"` (nunca
  `"10:00 AM"`, la forma que ya rompio el reschedule en el 22.1); el boton
  "Cancel" del formulario revierte sin guardar nada.
- Las 3 cadenas nuevas ("Save", "Yes, cancel", "No times available") se
  agregaron a `js/i18n.js` es/zh. Dos cadenas de los `prompt()` viejos
  (`"New date (YYYY-MM-DD):"`, `"New time:\n"`) quedaron sin uso y se
  borraron del diccionario en vez de dejarlas de adorno.

---

## 12. Auditoria de la SPA movil, mechanic y admin (2026-08-01)

Esto es el punto 8.8 hecho, y la segunda mitad de lo que pedia el 3.1. Nadie
habia mirado estas tres superficies: la seccion 8 fue solo `landing.html`.

**Como se verifico.** Chromium real via Playwright contra un servidor estatico
local, con Stripe bloqueado a nivel de red y toda escritura a Supabase abortada:
nada de lo que sigue creo una reserva, un cobro ni una fila. La SPA se midio a
390px, mechanic a 390px en los dos temas, admin a 1440px. Los precios reales se
leyeron de la tabla `services` en vivo (GET publico con la clave anon, la misma
request que hace la web en cada carga): **32 filas**.

**Cada hallazgo dice si esta verificado en navegador, verificado en codigo, o si
es sospecha.** No hay ninguno escrito de memoria. Donde no pude comprobar algo,
lo digo en el propio hallazgo en vez de suavizarlo.

**Ojo con el alcance:** `admin.html` y `mechanic.html` son **English-only por
diseño** (`scripts/i18n-check.mjs` ni las escanea). Texto en ingles ahi no es un
hallazgo y no esta reportado. En la SPA si lo es.

Orden: primero lo que cuesta plata, despues lo que le muestra algo falso a una
persona, y lo cosmetico al final.

### Estado — actualizado 2026-08-03, despues de los PRs #160 y #161

**Los 12 primeros CERRADOS se verificaron vivos en `drbikesydney.com.au` el
2026-08-02**, no el dia que se mergeo: se pidieron los archivos al dominio y se
busco el marcador de cada fix. Los dos ultimos (12.17 y 12.6) estan en `main` y
deployados, pero **no se re-verificaron contra el dominio**. Si retomas esto mas
adelante, volve a correr esa comprobacion antes de fiarte - en este proyecto ya
paso que un merge posterior tapara un arreglo.

**CERRADOS: 17 de 21** (PRs #137, #140, #142, #145, #147, #149, #160, #161, #164, #165, y `fix/orphan-payments`). Se sumaron 12.17, 12.6, 12.18, 12.16 y 12.3.

| # | Que era | Como se comprobo |
|---|---|---|
| 12.2 | Doble cobro | Stripe stubbeado contando cobros: main cobraba 2, la rama 1 |
| 12.4 | El call-out faltaba en TODOS los totales, BAS G1 incluido | Revenue $3570 -> $4,020 con call-outs de 200/250 y un NULL |
| 12.5 | MRR contaba a los anuales al precio mensual | MRR $558 -> $499 sobre 4 socios, 2 anuales |
| 12.7 | El mecanico veia "No jobs today" cuando fallaba la carga | Antes/despues en Chromium, con y sin cache |
| 12.8 | El outbox prometia "guardado en tu telefono" sin comprobarlo | Con localStorage E IndexedDB fallando: banner rojo |
| 12.9 | El chequeo de i18n no leia `textContent =` ni `confirm()` | Inyectar 2 strings sin traducir ahora hace fallar el check |
| 12.10 | Errores de pago en ingles para clientes es/zh | Las 10 cadenas resuelven en es y zh |
| 12.12 | `saveVanZone()` podia dejar una van sin zonas | Snapshot + rollback + deja de mentir en el toast |
| 12.13 | `live-prices` se rendia sin dejar rastro | Forzando un 503 |
| 12.15 | Contraste 1.03:1, texto invisible | Medido: 1.03:1 -> 13.36:1 |
| 12.19 | GPS falso del mecanico | Borrado; cero invocaciones en el repo |
| 12.14 | *(la mitad)* La doc describia una paleta inexistente | Los 10 hex de la doc coinciden ahora con `variables.css` |
| 12.17 | 26 handlers inline bloqueaban sacar `unsafe-inline` del CSP | PR #160: cero handlers inline en las 4 superficies |
| 12.6 | Precios publicados que no existian en `services` | PR #161: `data-price-from` lee el piso de la tabla viva. **El codigo esta; falta que Diego cargue los servicios** (ver abajo) |

**Ademas se arreglaron 3 bugs que NO estaban en la auditoria**, encontrados al
releer lo ya cerrado:

- 27 + 11 importes de `js/admin.js` sin locale o sin formato. En español
  `25050` se imprime `25.050`, que se lee como veinticinco coma cero cinco.
  Seis de ellos son el export del BAS.
- Los KPI "Revenue today" y "Monthly revenue" del Dashboard sumaban reservas
  **pendientes** como facturacion. Eran la tercera definicion de "revenue" en
  la app y la unica que la inflaba.
- Un bug introducido por el propio arreglo anterior: el Dashboard quedo
  imprimiendo `1340 avg` sin signo de peso. **Se encontro mirando una captura,
  no leyendo codigo.**

**ACCION CONCRETA DE DIEGO, no una decision** (el codigo ya se mergeo):

- **12.6, la mitad que falta** — en **Admin > Services & Prices**: renombrar
  `Bike Build — New Bike` a `Bike Assembly` y ponerle precio **80**, y crear
  `E-Bike Service` a **129**, categoria `Electronic & e-bike` (el formulario de
  contacto de la landing lo viene ofreciendo desde siempre sin fila detras).
  Hasta que eso pase, `npm run services:check` reporta los dos lados del
  desajuste: eso es el check funcionando, no una regresion.

**ESPERAN UNA DECISION DE DIEGO** (ninguno es trabajo de codigo bloqueado):

- ~~**12.3** — el cobro huerfano~~ **CERRADO 2026-08-03 (`fix/orphan-payments`),
  y sin necesitar nada de Stripe.** Resulto no ser trabajo de webhook: es una
  barrida diaria que cruza los pagos de Stripe contra `bookings`. Ver el punto
  12.3 para por que el webhook era el lugar equivocado.
- **12.14 completo — CERRADO 2026-08-11.** Los tres pasos hechos; el detalle de
  cada uno abajo. ~~necesita elegir que paleta gana~~ **DECIDIDO 2026-08-03:
  gana `css/variables.css` tal cual esta, con `--blue` en `#2563eb`.** El logo y
  los iconos se quedan con su `#0055de`: son dos azules a proposito, no deriva.
  Ya no hay decision pendiente, lo que queda es mecanico y lo puede tomar
  cualquier sesion:
  1. ~~`track.html` tiene que cargar `css/variables.css`~~ **HECHO 2026-08-09
     (`fix/track-loads-the-tokens`)**, con las diferencias de pixel medidas en
     el punto **13.5**. De paso salio el punto **13.11**: los chips de estado
     no pasan WCAG AA y la paleta ganadora empeora el verde.
  2. ~~`css/landing.css:2` tiene que dejar de reabrir `:root`~~ **HECHO
     2026-08-09 (`fix/landing-stops-overriding-the-tokens`)**. Eran 4 tokens
     pisados mas los dos `--shadow-*` y `--transition`, y **499 de los 1097
     elementos de la landing cambiaron de pixel**: el detalle medido esta abajo,
     en el bloque de este mismo punto. Ya no hay tres paletas: hay una.
  3. ~~Los hex escritos a mano pasan a `var(--token)`~~ **HECHO 2026-08-11.
     EL PUNTO 12.14 QUEDA CERRADO.** Las superficies de cliente se cerraron el
     2026-08-09 (PR A y los cinco PR B). Las de staff el 2026-08-11: 16 en
     `css/admin.css` (PR #224) y 151 mas en las seis superficies (PR #225),
     despues de que Diego levantara la prohibicion de los 12 tokens con la
     condicion de **medir primero** — la lista era la union de admin y mechanic
     y por eso prohibia de mas (admin redefine 5 tokens, mechanic 10).
     Lo que sigue escrito a mano **ya no es deuda**: es la paleta propia del
     modo oscuro, los tokens que el tema redefine, los selectores
     `[style*='#HEX']` acoplados a `js/admin.js`, las agujas de busqueda de
     `js/admin.js:540`, el canvas de `js/mechanic.js:1689` y el `window.open()`
     del reporte de finanzas. **Cada grupo tiene su comentario en el archivo
     donde vive.** El presupuesto por archivo vive en `scripts/color-check.mjs`.
  Ojo con el orden: 1 y 2 cambian pixeles en pantalla, asi que conviene
  medirlos antes y despues. El 3 no deberia cambiar ninguno - si cambia alguno,
  ese hex no era el que decia el token y es un hallazgo, no un error de tipeo.
  **Ojo con el tamaño del 3:** el "335" era un recuento acotado (7 valores, 3
  superficies). Recontado el 2026-08-09 sobre las 5 superficies completas son
  **2389 hex, de los cuales solo 1121 valen lo mismo que un token**; los otros
  1268 son 128 colores que no existen en `variables.css` y cada uno es una
  decision, no un reemplazo. El detalle, y lo que no se puede tokenizar ni
  verificar, esta en el punto 12.14.
- **12.11** — la puerta del admin. El arreglo de verdad valida el token contra
  el servidor antes de renderizar: cambia el flujo de auth, conviene hacerlo con
  Diego mirando.

**ABIERTOS, mecanicos, sin ninguna decision de por medio** — son los siguientes
que deberia tomar una sesion nueva:

- **12.16, lo que queda** — la SPA esta cerrada (todo a 44px) y los 5 desbordes
  eran un artefacto de medicion, no un bug: ver el bloque del punto 12.16.
  Queda solo lo del admin: **11 tablas y listas sin contenedor de scroll**, que
  no se pudo medir en local porque `admin.html` autentica contra `/api/auth`.
- ~~**12.18** `confirm()`/`alert()` nativos fuera del panel de la landing~~
  **CERRADO 2026-08-03 (PR #164).** Los cuatro son ahora `confirmDialog()` /
  `mechConfirm()`. El chequeo de i18n aprendio a leerlos de paso.
- ~~**`track.html`** — la quinta superficie, nunca auditada~~ **AUDITADA
  2026-08-03: seccion 13.** Cierra el punto 3.1. Diez hallazgos, ninguno
  arreglado todavia; el mas serio es que la direccion del cliente sale hacia dos
  servidores de terceros en un query string (13.1).

**Fuera de codigo, de Diego:** una reserva real de punta a punta con tarjeta,
porque 12.2 se probo con Stripe stubbeado - eso valida la logica, no el cobro.
(Los backups de Supabase, que estaban en esta linea, se resolvieron el
2026-08-03: ver punto **1.2**. Queda pendiente la restauracion de prueba.)

---

### 12.1 CAUSA RAIZ de 12.2 y 12.3 — el estado del cobro vive en la pantalla

Los dos hallazgos que siguen son la misma cosa vista dos veces: **lo unico que
sabe que ya se cobro es una variable dentro de la funcion que dibuja la pantalla
de pago.** No hay rastro en el servidor. Si esa pantalla se vuelve a dibujar, o
si el cliente la cierra, ese conocimiento desaparece.

Arreglar esto de raiz cierra 12.2 y 12.3 juntos. Parcheados por separado, vuelven.

### 12.2 Se puede cobrar dos veces la misma reserva

> **CERRADO 2026-08-02 (PR #137, en produccion).** El memo paso a scope de
> modulo, atado a la reserva (servicio/fecha/hora/direccion/tarifa) y liberado
> en cuanto la reserva existe. Verificado con Stripe stubbeado contando cobros:
> `origin/main` cobraba DOS veces, la rama cobra UNA. Una reserva distinta si
> vuelve a cobrar.

**Sintoma.** El cliente paga, la reserva no se guarda (le aparece "Payment
received but the booking could not be saved"), sale de la pantalla y vuelve a
entrar al paso de pago. El guardia anti-doble-cobro se reseteo: si aprieta Pagar
otra vez, se le cobran **$20 mas**, sin reserva de por medio.

**Donde.** `js/app.js:1808` declara `let paidIntent = null` **adentro** de
`renderPayment()`. `js/app.js:4674` llama `renderPayment()` en **cada**
navegacion a `#payment`.

**Evidencia. VERIFICADO EN NAVEGADOR.** Navegue `#payment` -> `#service-summary`
-> `#payment` y conte los renders: **2 renders, HTML nuevo identico las dos
veces** (4944 caracteres cada uno). Cada render es un cierre nuevo, o sea un
`paidIntent` nuevo en `null`. El comentario de `js/app.js:1804-1807` dice que
`chargeOnce()` protege contra el doble cobro; protege, pero **solo dentro de una
misma visita a la pantalla**.

**Impacto: PLATA.** Cobro duplicado a un cliente real.

### 12.3 Un cobro que salio bien puede quedarse sin reserva, y nadie se entera

> **CERRADO 2026-08-03 (`fix/orphan-payments`), y NO como decia este punto.**
> El diagnostico era correcto; el arreglo propuesto no. Aca decia que hacia
> falta un `case 'payment_intent.succeeded'` en el webhook y que Diego diera de
> alta ese evento en Stripe. Diego lo dio de alta el 03-ago, pero el webhook es
> el peor lugar para esto: llega **segundos** despues del cobro, cuando
> `create-booking` todavia puede estar corriendo, asi que no puede distinguir
> un huerfano de una reserva en vuelo sin inventarse una espera.
>
> Lo que se hizo: **una barrida diaria** (`?type=orphan-payments`, dentro del
> `?type=all` que ya corre a las 9). Stripe es la fuente de verdad de los pagos
> y `bookings` la de las reservas, asi que se recorre una y se cruza contra la
> otra. Un pago cuenta como huerfano si esta cobrado, tiene mas de **15
> minutos**, no fue devuelto, no es una suscripcion ni una gift card, y ninguna
> reserva lo referencia en `stripe_payment_intent_id`. Diego recibe un WhatsApp
> con el monto, el email y el id de Stripe.
>
> **Sin tabla nueva.** La marca de "ya avise" vive en la metadata del propio
> PaymentIntent (`orphan_alerted`), que Stripe deja escribir. Sin eso, el mismo
> pago generaria un WhatsApp por dia hasta el fin de los tiempos.
>
> Se marca **despues** de que el WhatsApp salio bien: si el envio falla, el pago
> queda sin marcar y la barrida del dia siguiente lo reintenta.
>
> **El evento `payment_intent.succeeded` que Diego registro en Stripe ya no hace
> falta.** No molesta - `api/stripe-webhook.js` lo manda al `default` y escribe
> `Unhandled event type` - pero se puede sacar del endpoint sin perder nada.
>
> El texto original queda abajo.

**Sintoma.** Stripe cobra los $20, `create-booking` falla, y el cliente cierra la
app en vez de apretar Pagar de nuevo. Resultado: **plata cobrada, cero reserva,
cero email al cliente, cero WhatsApp a Diego**. Diego no se entera nunca. El
cliente si.

**Donde.** `js/app.js:1842-1851`: el unico camino de recuperacion es que el
cliente vuelva a tocar el boton en esa misma pantalla.
`api/stripe-webhook.js:178-422`: el `switch` cubre `checkout.session.completed`,
suscripciones e invoices - **no hay ningun caso `payment_intent.*`**.

**Evidencia. VERIFICADO EN CODIGO.** Grep de todos los `case` del webhook: no
existe `payment_intent.succeeded`. No hay reconciliacion del lado del servidor.

**Impacto: PLATA.** Ademas de perder la reserva, es el caso que mas rapido
termina en una devolucion pedida por chat.

### 12.4 Toda la pestaña Finanzas suma solo la mitad de cada venta

**Sintoma.** El call-out de $20 **no entra en ningun numero de Finanzas**. Con 50
trabajos completados en el mes faltan **$1.000** de facturacion, y el GST
declarado queda ~$91 corto. El campo `bas-g1` (el que Diego usa para el BAS) sale
de ese mismo numero.

**Donde.** `js/admin.js:780` - `revenue = jobs.reduce((s, j) => s + (j.service_price || 0), 0)`.
De ahi cuelgan: GST (`:782`), neto (`:783`), ganancia bruta (`:786`), neta
(`:787`), margen (`:788`), promedio por trabajo (`:789`), el KPI (`:792`), el BAS
G1 (`:868`), el CSV (`:934`) y el reporte imprimible (`:1051-1079`).
Mismo patron en `js/admin.js:1948-1949`, `:2237`, `:2803` y `:3953`.

**Evidencia. VERIFICADO EN CODIGO, en el punto donde se escribe la fila.**
`api/auth.js:744-745` guarda `service_price` y `callout_fee` en **dos columnas
separadas**; `api/auth.js:599` calcula `servicePrice` como el precio del servicio
mas el recargo de domingo/feriado, y `api/auth.js:602` arranca `calloutFee = 20`
aparte. `service_price` no incluye el call-out.

**Ademas, en la otra direccion:** `discount_applied` no se resta en ningun lado,
asi que donde hubo codigo de descuento la facturacion queda inflada. Dos errores
de signo contrario sobre el mismo total: no se puede auditar el numero.

**Impacto: PLATA.** Es un numero que se presenta a la oficina de impuestos.

### 12.5 El MRR cuenta a los socios anuales como si pagaran el precio mensual

**Sintoma.** Un VIP anual paga $1.891/año = **$157,58/mes**, y el panel lo cuenta
como **$197/mes**. Sobrestima $39,42 por cada VIP anual, $19,42 por cada Standard
anual y $13,42 por cada Basic anual.

**Donde.** `js/admin.js:5411-5414`:
`const prices = { basic: 67, standard: 97, vip: 197 }`, y despues suma
`prices[m.membership_plan]` para todo socio activo, sin mirar el plazo.

**Evidencia. VERIFICADO EN CODIGO.** `api/stripe-webhook.js:196-197` guarda
`membership_plan` y `membership_billing` en **columnas distintas**: el plazo
(mensual/anual) vive en `membership_billing`, y el calculo del MRR nunca lo lee.

**Segundo problema en la misma linea:** esos tres precios estan **hardcodeados en
`js/admin.js`**. Es exactamente el incidente que ya documenta CLAUDE.md ("un
cambio de precio $57/$147 estuvo live mientras la matematica de MRR de admin.js
seguia con los numeros viejos"). La mina volvio a quedar armada.

**Impacto: PLATA.** Es el numero con el que se decide si el negocio de membresias
funciona.

### 12.6 Tres precios publicados en la SPA no existen en la tabla `services`

> **CERRADO EN CODIGO 2026-08-03 (PR #161, mergeado).** `js/live-prices.js`
> soporta `data-price-from`, y las tarjetas Repairs y Bike Assembly toman el
> piso de la tabla viva en vez de un numero estatico. **Falta la carga de datos
> de Diego** en Admin > Services & Prices, descrita en el bloque de Estado de
> arriba. La tabla que sigue es el diagnostico original.

**Sintoma.** La pantalla de inicio de la SPA anuncia precios que **no
corresponden a ningun servicio real**, y editarlos en Admin > Services no los
cambia. El cliente ve un numero y el sistema cobra otro.

| Tarjeta en `index.html` | Precio que muestra | Que hay en la tabla |
|---|---|---|
| E-Bike Service (`:319-321`) | **$129** | No existe. Lo mas parecido es `E-bike Diagnostic` a **$60** |
| Bike Assembly (`:325-327`) | **$80** | No existe. Lo mas parecido es `Bike Build — New Bike` a **$75** |
| Repairs (`:313-314`) | **"From $60"** | El servicio mas barato de la tabla esta a **$17** |

**Donde.** `js/live-prices.js:76-83`: si el nombre de la tarjeta no matchea una
fila, deja el precio estatico del HTML y escribe un `console.warn`. El `NAME_MAP`
de `js/live-prices.js:25-37` no tiene entrada para ninguno de los tres.

**Evidencia. VERIFICADO EN NAVEGADOR Y CONTRA LA BASE.** La consola imprimio,
al cargar la SPA: `[live-prices] no Supabase match for "Repairs"`,
`... "E-Bike Service"`, `... "Bike Assembly"`. Y las 32 filas leidas en vivo de
`services` confirman que esos tres nombres no existen.

**Alcance mas alla de esta auditoria:** "E-Bike Service" tambien aparece en
`landing.html` y en `blog/electric-bike-laws-nsw-2026.html`.

**Impacto: PLATA.** Es la clase de bug que CLAUDE.md ya marca como recurrente:
copia de precio vieja en un lugar donde nadie penso en mirar.

---

### 12.7 Cuando falla la carga, el mecanico ve "No jobs today"

> **CERRADO 2026-08-02 (PR #137, en produccion).** La cadena `"[]"` ya no
> cuenta como cache valido: ahora dice que la carga fallo y ofrece Reintentar.
> Con trabajos en cache sigue mostrandolos igual. `e.message` salio del
> `innerHTML`.

**Sintoma.** Si `load()` falla y el cache guardado esta vacio, el mecanico ve una
pantalla alegre con un sol y **"No jobs today - New bookings appear instantly"**.
Lo lee como "hoy no tengo trabajo" y se va. Las reservas existen; la app no pudo
traerlas.

**Donde.** `js/mechanic.js:501-513`. El `catch` hace
`const cached = localStorage.getItem('drbike-jobs-cache'); if (cached) {...}`.
Cuando el ultimo dia bueno no tuvo trabajos, ahi quedo guardada la cadena `"[]"`,
que **es truthy**, asi que un cache vacio se toma por cache valido y se pinta el
estado vacio en vez del error rojo de la linea 511.

**Evidencia. VERIFICADO EN NAVEGADOR.** Bloquee `/api` para forzar el fallo, con
`drbike-jobs-cache` en `"[]"`. Captura: `scratchpad/mech/empty-cache-after-failure.png`
y `mech-light.png`. Es la misma mentira que ya se borro dos veces
(`MOCK_BOOKINGS`), en otra superficie.

**Impacto: CONFIANZA, y plata indirecta** - un trabajo no atendido.

**Aparte, en el mismo bloque:** `js/mechanic.js:511` mete `e.message` crudo
dentro de `innerHTML`.

### 12.8 "Saved on your phone" puede ser mentira

**Sintoma.** Sin señal, el mecanico cambia el estado de un trabajo y la app le
dice **"📵 Saved on your phone — syncs when the signal is back"** y le muestra
"1 change waiting to sync". Si la escritura a IndexedDB fallo, ese cambio existe
**solo en la memoria de la pagina**: cerrar la app o que iOS descarte la pestaña
lo borra. El cliente se queda con el estado viejo y nadie se entera.

**Donde.** `js/mechanic.js:219-222` - `queueSave()` envuelve el `_IDB.set` en un
`try { ... } catch {}` vacio. Justo despues, `syncBanner()` (`:230-237`) dibuja
el cartel contando `_queue.length`, que es **la lista en memoria**, no lo que
quedo persistido. El toast de `js/mechanic.js:839` promete lo mismo.

**Evidencia. VERIFICADO EN CODIGO.** No pude forzar un fallo real de IndexedDB en
esta corrida, asi que **el disparador concreto (modo privado de Safari, cuota
llena, origen desalojado) queda como sospecha**; lo verificado es que el fallo se
traga entero y que el cartel no mira lo persistido.

**Impacto: CONFIANZA.** El resto de la cola esta bien pensada: `queueFlush()`
(`:243-283`) corta en el primer fallo de red, no reintenta los 4xx para siempre,
y `setStatus()` (`:846`) evita fingir las notificaciones al cliente cuando esta
encolado. El agujero es solo el guardado.

### 12.9 CAUSA RAIZ de 12.10 — el chequeo de i18n no mira como se escribe un error

> **CERRADO 2026-08-02 (rama `fix/i18n-hole`).** `stringsFromJs()` ahora lee
> `textContent`/`innerText` y los dialogos `confirm()`/`alert()`. Probado
> inyectando dos strings sin traducir: el chequeo FALLA en la rama y pasaba en
> `origin/main`. `throw new Error(...)` sigue fuera a proposito.

`scripts/i18n-check.mjs::stringsFromJs()` (`:250-269`) lee de `js/app.js`
**solo tres formas**: texto entre `>` y `<` dentro de template literals, los
atributos `placeholder`/`aria-label`/`title`, y `showToast()`.

No lee `elemento.textContent = '...'` - aunque `stringsFromInlineScripts()`
(`:213-217`) **si** lo lee para los scripts inline de `landing.html`. O sea: el
mismo patron esta cubierto en un archivo y no en el otro.

Los mensajes de error y las confirmaciones se escriben justamente asi
(`textContent =`, ternarios, `throw new Error(...)`, `confirm(...)`). Por eso son
invisibles para `npm run check`. Es el hermano del punto **10.1**, que ya
describe el mismo agujero en los scripts inline de la landing; este esta en un
archivo que el checker **si** escanea, que es lo que lo hace mas engañoso.

### 12.10 41 textos de cara al cliente sin traducir, con el check en verde

> **CERRADO en su mayor parte 2026-08-02** (PR #137 y rama `fix/i18n-hole`).
> Los dos textos del pago, las dos confirmaciones destructivas y 16 sitios que
> mostraban `e.message` crudo pasan por `translateValue()`, con es/zh. Siete de
> esos textos YA tenian traduccion en el diccionario y el codigo no la usaba.
> **Queda abierto** lo que se lanza con `throw new Error(...)` y nunca pasa por
> un sitio de display cubierto.

**Sintoma.** Un cliente en español o chino recibe en ingles **todos** los
mensajes de error del pago y de la membresia, que es donde mas importa entender.

Los peores:

| Linea | Texto |
|---|---|
| `js/app.js:1846` | "Payment received but the booking could not be saved. Tap Pay again to retry, or contact us." |
| `js/app.js:1847` | "Payment failed. Please check your card details and try again." |
| `js/app.js:238` | "Payment could not be confirmed. Please contact us if you were charged." |
| `js/app.js:1863` | "Could not confirm booking. Please try again." |
| `js/app.js:4121` | "Cancel your membership? It will stay active until the end of the current billing period." |
| `js/app.js:4393` | "Delete this bike?" |
| `js/app.js:3539` / `:3643` | "Could not cancel booking." / "Could not reschedule." |
| `js/app.js:4026` / `:4039` | "Could not start card setup" / "Could not save card" |

**Evidencia. VERIFICADO, MEDIDO CON UN SCRIPT.** Extraje los literales en ingles
de `js/app.js` (sin comentarios) y los cruce contra las claves de `js/i18n.js`:
**51 sin clave**, de los cuales 10 son datos `d=` de SVG y nombres de marca, o
sea **41 reales**. Y `npm run i18n:check` pasa **en verde**
(`954 keys in es and zh, 719 strings checked across 5 surfaces`). Ninguno de
estos textos esta en la lista `ALLOWED`, asi que no son excepciones deliberadas.

**Impacto: CONFIANZA.** Contradice la regla del proyecto de que ninguna copia
llega a main sin es+zh. El guardrail existe y esta verde; el agujero es 12.9.

### 12.11 El panel de admin se abre poniendo una clave cualquiera en localStorage

**Sintoma.** Puse `localStorage['drbike-admin-token'] = 'stub-token'` - una cadena
inventada - y el dashboard entero renderizo, sin pantalla de login: Dashboard,
Bookings, Clients, **Finance**, Analytics, Memberships, Services & Prices,
Discount Codes, Claims, Settings.

**Donde.** `js/admin.js:1640` - `if (localStorage.getItem('drbike-admin-token')) return true;`.
La puerta comprueba **que la clave exista**, no que valga.

**Evidencia. VERIFICADO EN NAVEGADOR** (`scratchpad/admin/admin-1440.png`).
**Limite honesto de esta prueba:** en mi corrida los `/api/auth` estaban
stubbeados, asi que **lo probado es que la interfaz se destraba, no que los datos
reales salgan**. Con un token falso de verdad las llamadas al servidor deberian
dar 401. No lo probe contra produccion a proposito. Aun asi, el marco, los
nombres de las pestañas y la estructura quedan expuestos con una linea de consola.

Conecta directo con la advertencia del punto **11.3**: antes de poner numeros de
facturacion en Analytics, este acceso tiene que estar cerrado de verdad.

### 12.12 `saveVanZone()` borra todas las zonas de una van antes de insertar

**Sintoma.** Guardar los suburbios de una van hace `DELETE` de todos y despues
`INSERT`. Si el insert falla, **la van se queda sin ninguna zona** y no hay vuelta
atras. Sin transaccion y sin confirmacion previa.

**Donde.** `js/admin.js:4099-4107`.

**Evidencia. VERIFICADO EN CODIGO.** No lo ejecute: escribir en `van_zones` contra
produccion estaba prohibido en esta auditoria.

**Contexto que lo empeora:** segun CLAUDE.md, el numero de WhatsApp del admin vive
en `van_zones` con `van_number=0`. La tabla no guarda solo zonas.

**El resto de los borrados del admin si preguntan** (`js/admin.js:1596`, `:4424`,
`:4618`, `:4847`, `:5698`). Este y `js/admin.js:1254` (`availability`) son las
excepciones.

### 12.13 `live-prices.js` se rinde en silencio

> **CERRADO 2026-08-02 (PR #137, en produccion).** Los tres caminos de
> abandono avisan por consola. Verificado forzando un 503.

**Sintoma.** Si la consulta de precios falla o devuelve un error HTTP, **toda la
grilla de precios de marketing se queda con los numeros estaticos del HTML, sin
un solo aviso** - ni en pantalla ni en consola.

**Donde.** `js/live-prices.js:53` (`if (!res.ok) return;`) y `:55-57`
(`catch { return; }`).

**Evidencia. VERIFICADO EN CODIGO.** Es el mismo modo de falla de `MOCK_SERVICES`,
que se borro de `js/supabase.js` el 28-jul justamente por esto, sobreviviendo en
otro archivo. Ahi el `catch` al menos deja rastro; aca no.

**Impacto: CONFIANZA.**

---

### 12.14 CAUSA RAIZ de 12.15 y de la deriva visual — hay tres paletas distintas

**No hay una fuente de verdad de color, hay tres, y no coinciden.** Peor: los dos
documentos que se supone que guian el diseño describen paletas **distintas** de la
que realmente cargan las paginas.

| Fuente | `--gray` | `--border` | `--blue-dark` | `--green` |
|---|---|---|---|---|
| `css/variables.css` (la cargan las 4 superficies) | `#475569` | `#e2e8f0` | `#1e40af` | `#16a34a` |
| `css/landing.css:2` (segundo `:root`, carga ultimo en landing) | `#6b7280` | `#e5e7eb` | `#1d4ed8` | - |
| `track.html:15,18` y el skill `drbike-design` | - | `#E5E7EB` | `#1848C8` | `#059669` |

Consecuencias verificadas:

- `var(--border)` **renderiza distinto segun la pagina**: `#e5e7eb` en
  `landing.html`, `#e2e8f0` en `index.html`, `admin.html` y `mechanic.html`.
- El skill `drbike-design` documenta como canonicos `#1848C8` y `#059669`, que
  **no estan definidos en ningun archivo de tokens**: seguir el skill al pie de la
  letra *produce* hex fuera de token.
- El bloque de diseño de `CLAUDE.md` (`Text: #111827`, `Border: #e5e7eb`)
  describe la paleta de `landing.css`, no la de `variables.css`.

**Cuanto se filtro, contado en las tres superficies auditadas:** `#6b7280` 126
veces, `#059669` 70, `#1848c8` 52, `#e5e7eb` 48, `#f3f4f6` 22, `#111827` 11,
`#f9fafb` 6. **335 apariciones** de hex que son casi-pero-no el token.

**Evidencia. VERIFICADO CON GREP Y LEYENDO LOS TRES ARCHIVOS.**

#### RECONTADO 2026-08-09: el 335 estaba acotado, no mal

Ese 335 cuenta **7 valores concretos** casi-token sobre **3 superficies**. Antes
de empezar el paso 3 se recontaron **las 5 superficies completas**
(`index.html`, `landing.html`, `track.html`, `admin.html`, `mechanic.html` mas
`css/main.css`, `home.css`, `landing.css`, `admin.css`, `mechanic.css` y
`js/app.js`, `admin.js`, `mechanic.js`, `components.js`, `stripe.js`),
contando **cualquier** hex, no solo los 7:

| | |
|---|---|
| Hex escritos a mano | **2389** |
| ...que son exactamente el valor de un token | 1121 |
| ...que no son el valor de ningun token | **1268** |
| Valores distintos | 147 |
| ...que no son ningun token | **128** |
| Tokens de color que define `variables.css` | 20 |

**El hallazgo no es el tamaño, es que el paso 3 NO es mecanico.** Solo el 47%
de los hex se puede reemplazar por el token que ya vale lo mismo. Los otros
**1268 son 128 colores que ningun archivo de tokens define**: cada uno es una
decision (mapear al token mas cercano y aceptar el cambio de pixel, o ascenderlo
a token nuevo). Los mas repetidos: `#6b7280` 187, `#e5e7eb` 121, `#059669` 108,
`#1848c8` 58, `#f2f2f7` 58, `#374151` 55, `#9ca3af` 43, `#f3f4f6` 30,
`#111827` 29, `#60a5fa` 26.

> **CERRADO 2026-08-09.** El azul retirado ya no existe en ningun archivo que
> se sirva: **183 apariciones en 73 archivos** pasaron a `#2563EB`, incluidos
> los **40 de los emails** (`api/send-email.js`, `send-invoice.js`,
> `send-cron.js`, `auth.js`), las 60 paginas de suburbio en los 3 idiomas, los
> 5 posts del blog, `business.html`, `bike-check.html`, `cycling-map.html` y
> `scripts/generate-suburb-pages.mjs` - el generador tambien, o volveria a
> entrar en la proxima regeneracion. `scripts/color-check.mjs` ahora barre
> **todo el repo** buscandolo, no solo los archivos con presupuesto. Lo unico
> que queda escrito es la prosa que explica que esta retirado (`track.html:13`,
> este documento, el skill `drbike-design`), y los comentarios se descartan.
> El parrafo original queda abajo por trazabilidad.

**El azul retirado `#1848C8` no vive solo en `track.html`.** 58 apariciones en
las 5 superficies y **~80 archivos** en todo el repo: `js/admin.js` 33,
**`api/send-email.js` 33** (o sea los emails al cliente salen con el azul
viejo), `js/mechanic.js` 7, `api/send-invoice.js` 7, `landing.html` 5,
`admin.html` 5, `js/app.js` 3, `api/auth.js` 3, `api/send-cron.js` 2,
`track.html` 2, `css/admin.css` 2, `business.html` 3, `cycling-map.html` 2,
`bike-check.html` 1, y 2 en **cada una** de las ~60 paginas de suburbio
(en/es/zh) y las 5 del blog.

**Evidencia:** conteo con un script propio (regex de hex de 3/4/6/8 digitos,
shorthand normalizado a 6, anclas `href="#..."` descartadas) corrido contra
`origin/main` en `db5515d`. No vive en el repo: es una medicion, no un check.

#### Alcance del paso 3 — DECIDIDO POR DIEGO 2026-08-09

El paso 3 se limita a **las 5 superficies de app**. Los emails
(`api/send-email.js` 250 hex, `api/send-invoice.js` 107) y las ~60 paginas de
suburbio (54 hex cada una) van en un **PR aparte**, porque juntos dan un diff
que no se puede revisar.

**Lo que NO puede volverse token, por como funciona el navegador** — no es
pereza, hay que dejarlo en hex y decirlo en el PR:

- `<meta name="theme-color">` y `manifest.json` no aceptan `var()`.
- Los HTML de email van por Gmail / Outlook, que no soportan variables CSS.
  Ahi el hex es obligatorio; lo unico que se puede hacer es que coincida con el
  token.

**Lo que NO se va a poder verificar en pantalla** — tiene que quedar escrito en
el PR, no disimulado:

- ~~**`admin.html`** autentica contra `/api/auth` y no carga en local~~
  **FALSO, corregido 2026-08-09: `admin.html` SI carga en local** y se pueden
  leer sus 1260 elementos. Lo que no se puede es *comparar* antes y despues (ver
  el bloque del PR A, mas abajo).
- **`track.html`** sin un `booking_id` real solo muestra el shell y el estado de
  error: el mapa y los chips `en-route` / `completed` no se pueden medir.

#### Paso 3 / PR C-2 HECHO 2026-08-11: se cierra el paso 3 — las 5 superficies de staff

**151 hex mas a token.** Con esto el paso 3 del 12.14 queda cerrado: lo que
sigue escrito a mano en admin y mechanic ya no es deuda, es una lista de
decisiones con su motivo al lado, cada una comentada en su archivo.

| Archivo | Antes | Ahora | Convertidos |
|---|---|---|---|
| `css/admin.css` | 173 | **143** | 30 |
| `js/admin.js` | 147 | **72** | 75 |
| `js/mechanic.js` | 55 | **13** | 42 |
| `admin.html` | 9 | **7** | 2 |
| `css/mechanic.css` | 31 | **29** | 2 |
| `mechanic.html` | 8 | **8** | 0 |

**Diego levanto la prohibicion de la lista de 12 el 2026-08-11**, con una
condicion: *medir primero*. La lista era la **union** de admin y mechanic, y
por eso prohibia de mas. Medido en el navegador, en la pagina real, con
`data-theme` fijado, sobre un elemento sintetico, los 45 tokens de color:

| Superficie | Hojas que carga | Tokens que cambian entre temas |
|---|---|---|
| `admin.html` | `variables.css` + `admin.css` | **5**: `--blue-lt`, `--border`, `--white`, `--off`, `--mgray` |
| `mechanic.html` | `variables.css` + `mechanic.css` | **10**: los 5 de arriba + `--green-lt`, `--amber-lt`, `--red-lt`, `--navy`, `--wa-lt` |

O sea: `--navy`, `--green-lt`, `--amber-lt` y `--red-lt` **son seguros en admin
y prohibidos en mechanic**. Esa asimetria es la que la lista de 12 no podia
expresar y es de donde salen 30 de las 151 conversiones.

**Segundo criterio, y es el que mas trabajo dio: el acoplamiento por
`[style*='...']`.** `css/admin.css` tiene **18 selectores** que matchean el
TEXTO del atributo `style` que escribe `js/admin.js`. Convertir un hex ahi no
cambia un color, cambia **que reglas matchean**. Ejemplos reales:

- `background:#FEF2F2` -> `background:var(--red-lt)` haria pasar de la regla
  `[style*='background:#FEF2F2']` (fondo `rgba(220,38,38,.12)`) a
  `[style*='background:var(--red-lt)']` (`rgba(220,38,38,.15)`). Otro color.
- `background:#F0FDF4` -> `var(--green-lt)`: de `rgba(5,150,105,.12)` a
  `rgba(21,128,61,.2)`. Bastante mas verde.

Por eso **en `js/admin.js` y `admin.html` estan prohibidos ademas** los tokens
que aparecen dentro de un `[style*=]`: `--navy`, `--gray`, `--green-lt`,
`--red-lt`. En el `.css` no, porque ahi no se escribe ningun atributo `style`.
En mechanic no aplica: `css/mechanic.css` no tiene ni un `[style*=]`.

**Verificado por script, no de memoria:** se contaron los 18 patrones en los 4
archivos que escriben `style`, antes y despues. **Ninguno cambia de cantidad.**

**Tres exclusiones mas, cada una por una razon distinta:**

1. **`js/admin.js:540-552`** - `el.getAttribute('style')?.includes('color: #475569')`.
   Esos hex son **agujas de busqueda**, no colores. Tokenizarlos rompe el
   repintado de modo oscuro sin cambiar un pixel en claro. Comentado en el archivo.
2. **`js/admin.js:1096-1221`** - el `<style>` del `window.open()` del reporte de
   finanzas. Documento nuevo, no carga `variables.css`. Ahi `var()` no existe.
3. **`js/mechanic.js:1689`** - `ctx.strokeStyle`. Es **canvas**, no CSS: parsea
   un string de color y no resuelve custom properties. Es el unico `ctx.*Style`
   del repo. Comentado en el archivo.

**Verificacion: cero cambio de pixel salvo el badge, medido en dos servidores**
(`origin/main` en `:3000`, la rama en `:3015`), histograma de los 12 valores de
color computados de **todos** los elementos, con `data-theme` fijado:

| Pagina y tema | Elementos | Antes | Despues |
|---|---|---|---|
| `admin.html` claro | 1271 | navy 3599, border 635, white 500, surface 99 | **identicos** |
| `admin.html` oscuro | 1271 | navy 171, border 22, white 345, surface 12 | **identicos** |
| `mechanic.html` claro | 103 | histograma completo | **identico** |
| `mechanic.html` oscuro | 103 | histograma completo | **identico** |

Lo unico que se mueve es el badge, a proposito: `--red-bright` **2 -> 1** y
`--red` **34 -> 35** en tema claro.

**HALLAZGO DE METODO - la primera corrida de `admin.html` siempre miente.**
La medicion se estabiliza recien en la segunda: la primera da **1074-1279**
elementos y valores distintos (navy 3129 o 3235 en vez de 3599). Con una
corrida de calentamiento descartada, tres corridas seguidas dan exactamente lo
mismo, en los dos servidores. El PR C-1 casi reporta un cambio de color que no
existia por comparar dos renders a medio hacer.

**El badge del sidebar: 3.76:1 -> 5.41:1 en claro.** `.sb-badge` usaba
`--red-bright` en claro y `--red` en oscuro, asi que el mismo badge pasaba AA
en oscuro y no en claro. Es texto de 10px/700, o sea el minimo es 4.5:1. Ahora
los dos temas leen 5.41:1.

**Lo que queda, y ya no es deuda:** 272 hex en las 6 superficies de staff. Son
la paleta propia del modo oscuro (~200), los tokens que el tema redefine, los
selectores `[style*=]`, las agujas de busqueda, el canvas y el
`window.open()`. Cada grupo tiene su comentario en el archivo donde vive.

##### Anexo 2026-08-11: el acoplamiento `[style*=]` pasa a estar ENFORZADO

Los 18 patrones se habian contado **una vez**, a mano, en el PR C-2. Un
recuento independiente contra `origin/main` llego a los mismos 272 y confirmo
que **ningun hex mas se puede convertir hoy**, pero dejo a la vista que lo
unico que protegia el acoplamiento era un comentario. Convertir
`background:#FEF2F2` en `js/admin.js` sigue siendo un cambio que *parece*
exactamente la limpieza que pide 12.14, que baja el presupuesto de color-check,
y que rompe el modo oscuro sin que falle nada.

`scripts/color-check.mjs` ahora lo verifica en cada `npm run check`. La lista
esta fijada **por archivo**, no por hoja de estilo, porque "alguien todavia
escribe ese string" es demasiado debil: `admin.html` y `js/admin.js` escriben
los dos `background:#FEF2F2`, asi que convertir solo el del JS dejaba el
selector matcheando el HTML y el check en verde mientras las tarjetas que
dibuja el JS perdian su estilo oscuro. Probado en las dos direcciones:

| Cambio de prueba | Antes | Ahora |
|---|---|---|
| `background:#FEF2F2` -> `var(--red-lt)` solo en `js/admin.js` | pasaba | **falla**, nombrando archivo y selector |
| se agrega un `[style*=]` nuevo en `css/admin.css` | pasaba | **falla**, pide anotarlo en `COUPLED` |
| se borra un `[style*=]` de `css/admin.css` | pasaba | **falla**, pide sacarlo de `COUPLED` |

Un escritor nuevo del mismo string no falla: lo que se vigila es que un
escritor **deje** de escribirlo.

**Las dos unicas cosas que quedan abiertas de 12.14, y las dos son de Diego:**

1. `--gray` y `--red-lt`/`--green-lt` en `js/admin.js` (31 hex): son
   convertibles en cuanto al tema, y estan bloqueados **solo** por el
   acoplamiento. Se destraban cambiando el selector y el hex en el mismo
   commit, con medicion en el navegador de por medio.
2. Los emails (`api/send-email.js` 223, `api/send-invoice.js` 107,
   `send-cron.js` 49, `auth.js` 39): Gmail y Outlook no soportan `var()`, asi
   que ahi nunca llegan a cero. Lo unico posible es que el hex coincida con el
   token, y hoy coincide salvo 7 casos.

#### Paso 3 / PR C-1 HECHO 2026-08-11: `css/admin.css`, y por que 173 se quedan

**16 de 189.** Ese es el resultado honesto de mirar `css/admin.css` hex por hex.
Pasan a token `#f8fafc` (12, `--surface`), `#475569` (3, `--gray`, los tres en
`@media print`) y `#cf2020` (1, `--red`, el badge de notificaciones en oscuro).
**189 -> 173** en `scripts/color-check.mjs`.

**Los tres tokens elegidos son los unicos que no cambian entre temas.** Medido
en `admin.html` cargado de verdad, sobre un elemento sintetico, con `data-theme`
fijado:

| Token | claro | oscuro | sirve? |
|---|---|---|---|
| `--surface` | `#f8fafc` | `#f8fafc` | **si** |
| `--gray` | `#475569` | `#475569` | **si** |
| `--red` | `#cf2020` | `#cf2020` | **si** |
| `--navy` | `#0d1f3c` | `#0d1f3c` | si, pero prohibido (ver abajo) |
| `--white` | `#ffffff` | **`#1c1c1e`** | no |
| `--border` | `#e2e8f0` | **`#38383a`** | no |
| `--off` | `#f8fafc` | **`#242426`** | no |
| `--blue-lt` | `#eff6ff` | **`rgba(24,72,200,.18)`** | no |

**Los 173 que quedan, agrupados, con el motivo de cada grupo** (esto tambien
quedo escrito como comentario en `css/admin.css:1`, que es donde lo va a leer
el que siga):

| Grupo | Cuantos | Por que se queda |
|---|---|---|
| Paleta propia del modo oscuro | ~140 | `#f2f2f7`, `#98989f`, `#152035`, `#1a2740`, `#0d1b2e`, `#8e8e93`, `#636366`, `#48484a`, `#3a3a3f`, `#2e2e33`, `#6e6e76`, `#38383a` y la rampa brillante `#f87171` / `#4ade80` / `#fbbf24` / `#34d399`. **Son** lo que pinta `[data-theme='dark']`; mapearlos da vuelta el tema (12.15) |
| Tokens que el oscuro redefine | 14 | `#e2e8f0` (5), `#eff6ff` (4), `#f0fdf4` (7), `#fef2f2` (4), `#fffbeb` (1) - convertirlos los haria seguir al tema cuando el autor quiso que no |
| `#0d1f3c` | 21 | `--navy` esta en la lista de 12 prohibidos de 12.14. **En `admin.html` es demostrablemente seguro** (la tabla de arriba lo mide: mismo valor en los dos temas, porque `admin.html` no carga `css/mechanic.css`, que es quien redefine `--navy`). Decision de Diego si se levanta la prohibicion para este archivo |
| Selectores, no colores | 2 | `[style*='background:#FEF2F2']` y `[style*='background:#F0FDF4']` **matchean** el `style` inline que escribe `js/admin.js`. Si ese hex se tokeniza en el JS, estas reglas dejan de matchear y el modo oscuro se rompe en silencio. Estan acoplados a proposito |

**Por que `#e2e8f0` en `@media print` NO paso a `--border`, aunque tentaba.** Si
Diego imprime con el tema oscuro puesto, `[data-theme='dark']` sigue en el
`<html>` durante la impresion y `var(--border)` valdria `#38383a`: bordes casi
negros en un papel blanco. `--gray` y `--border-lt` no se redefinen, por eso
esos si.

**Verificacion: cero cambio de pixel, medido en las dos copias.** Servidor con
`origin/main` en `:3000` y servidor con la rama en `:3014`, mismo probe en los
dos, `data-theme` fijado despues de cargar y con el `href` de cada hoja de
estilo reescrito antes de medir.

| Selector | claro antes / despues | oscuro antes / despues |
|---|---|---|
| `.tbl td` borde | `#475569` / `#475569` | `#8e8e93` / `#8e8e93` |
| `.cl-stat` fondo | `#f8fafc` / `#f8fafc` | `#1a2740` / `#1a2740` |
| `.setting-row` borde | `#f8fafc`+`#0d1f3c` / idem | `#f8fafc`+`#f2f2f7` / idem |
| `.sb-badge` fondo | `#ef4444` / `#ef4444` | `#cf2020` / `#cf2020` |

**HALLAZGO DE METODO - el digest de pagina completa no sirve en `admin.html`.**
Se intento primero comparar las 14 propiedades de color de **todos** los
elementos, como en el PR A. No funciona: la pagina renderiza async y **dos
cargas de la copia SIN TOCAR dan 1271 y 1279 elementos**, con digests distintos.
El PR A pudo hacerlo en `landing.html`/`index.html` porque ahi el DOM es
estable. En `admin.html` hay que medir **por selector y repitiendo**: una
corrida suelta dio una vez `#8e8e93` donde las otras seis dieron `#475569`
(`js/admin.js:12` vuelve a aplicar su tema despues de que el probe fija el
suyo). Con 3 repeticiones por lado los dos servidores coinciden 3/3.

**Contraste, medido en las dos copias - identico, y con dos fallos AA que ya
estaban ahi.** No los introduce este PR (los colores son los mismos byte a
byte); quedan anotados, no tapados:

| Elemento | claro | oscuro |
|---|---|---|
| `.cl-stat-n` 16px/700 | 15.70:1 | 13.36:1 |
| `.setting-label` 13px/500 | 16.43:1 | 14.59:1 |
| `.setting-sub` 12px/400 | **2.56:1 falla** | 5.68:1 |
| `.cl-stat-l` 9px/600 | **2.45:1 falla** | 5.82:1 |
| `.sb-badge` 10px/700 | **3.76:1 falla** | **5.41:1 pasa** |
| `@media print .brand-sub` 12px | 7.58:1 | 7.58:1 (no se redefine) |
| `@media print .kpi-label` 10px/600 | 7.24:1 | 7.24:1 |

Los dos primeros fallos son `--gray-lt` (`#94a3b8`) sobre blanco, el 2.56:1 que
ya aparece en la tabla del grupo A. **El tercero es mas raro y vale mirarlo: el
badge de notificaciones se lee PEOR en claro (3.76) que en oscuro (5.41)**,
porque en claro usa `--red-bright` y en oscuro `--red`.

**BUG encontrado de paso, NO arreglado aca** (`css/admin.css:449`):
`[data-theme='dark'] #page-vans [style*='background:var(--white)']` declara
`background: undefined !important`. `undefined` no es un valor CSS valido, asi
que la declaracion se descarta: en modo oscuro esas tarjetas de la pagina Vans
se quedan con el fondo claro. Parece un template literal que interpolo una
variable JS vacia cuando se escribio la regla.

**Fuera de este PR:** `js/admin.js` (147), `js/mechanic.js` (55),
`admin.html` (9), `mechanic.html` (8), `css/mechanic.css` (31).

#### Paso 3 / PR A HECHO 2026-08-09: los reemplazos que no cambian un pixel

**482 hex** pasaron a `var(--token)` en las **tres superficies de cliente**
(`index.html`, `landing.html`, `track.html` + `css/main.css`, `css/home.css`,
`css/landing.css`, `js/app.js`, `js/components.js`, `js/stripe.js`).

**Verificado: cero cambio de pixel.** Se comparo, antes y despues, el valor
computado de 15 propiedades (`color`, `background-color`, `background-image`,
los 4 colores de borde, `border-radius`, `box-shadow`, `outline-color`, `fill`,
`stroke`, `text-decoration-color`, `caret-color`, `transition-duration`) de
**todos** los elementos:

| Pagina | Elementos | Diferencias |
|---|---|---|
| `landing.html` | 1097 | **0** |
| `index.html` (SPA) | 524 | **0** |
| `track.html` | 30 | **0** |

**Quedan 211 hex que valen lo mismo que un token y NO se tocaron**, a
proposito: el script solo entra en CSS, en `<style>`, en `style="..."` y en
`el.style.x = '#hex'`. No toca atributos `fill=` de SVG, colores en strings de
JS que no son CSS, `theme-color` ni `manifest.json`. Sacarlos de ahi es trabajo
del PR B, uno por uno.

#### Paso 3 / PR B-5 HECHO 2026-08-09: los atributos SVG y el gris viejo de la landing

**263 apariciones.** Dos cosas que ningun PR anterior habia podido tocar:

1. **`#6b7280`, 191 veces.** Era el `--gray` que declaraba `css/landing.css`
   hasta que el PR #182 borro ese bloque. Desde entonces todo lo que usa
   `var(--gray)` renderiza `#475569` y estos, escritos a mano, se quedaron en el
   gris viejo: **el mismo texto en la misma pagina tenia dos grises**. Ahora no.
2. **Los atributos `fill=` y `stroke=` de los SVG.** Se parsean como CSS, asi
   que `var()` resuelve. Eran el grueso de los "211 que valen lo mismo que un
   token" que el PR A dejo afuera a proposito.

| Pagina | Elementos | Cambian |
|---|---|---|
| `landing.html` | 1097 | 109 |
| `index.html` (SPA) | 524 | 24 |
| `admin.html` claro / oscuro | 1268 | 7 / 6 |
| `track.html`, `mechanic.html` | 30 / 95 | 0 |

**HALLAZGO - `#ffffff` y `#0d1f3c` NO se pueden tokenizar en admin ni mechanic.**
Se probo y se midio: en modo oscuro `var(--white)` vale `#1c1c1e` y
`var(--navy)` vale `#f2f2f7`, asi que convertir los blancos escritos a mano
volvia **oscuro** el texto de 277 propiedades en `admin.html` y 62 en
`mechanic.html`. Son blancos que van sobre botones de color y tienen que
quedarse blancos pase lo que pase. **Quedan en hex, y esta bien que queden.**
En las tres superficies de cliente si se convirtieron, porque ahi `--white` es
blanco siempre.

**HALLAZGO DE METODO, vale para cualquier medicion futura en este repo.** La
sonda cargaba cada pagina en un iframe con `?t=` para saltear la cache... pero
eso solo saltea la cache del **HTML**. Las hojas de estilo llevan un `?v=` fijo,
asi que el navegador servia **la copia de la corrida anterior** y el
antes/despues salia mezclado: aparecian cambios en las dos direcciones a la vez
(`#6b7280 -> #475569` y `#475569 -> #6b7280` en la misma pagina), que es
imposible. Hay que **reescribir el `href` de cada `<link rel=stylesheet>` con
una query nueva y esperar su `load`** antes de medir. Los numeros de este bloque
estan tomados con la sonda ya corregida.

**Sin explicar:** en `admin.html` en tema claro quedan **5 propiedades** que van
`#475569 -> #6b7280`, o sea al reves de lo que hace este PR. Son 5 sobre 1268
elementos y no se pudo aislar de donde salen. **Queda anotado, no tapado.**

#### Paso 3 / PR B-4 HECHO 2026-08-09: el grupo "parecido", las 5 superficies

**192 apariciones de 15 colores.** Los tres grandes son el verde viejo
`#059669` (71), el gris de texto `#374151` (51) y el negro de texto `#111827`
(24). **Cambian pixeles, y se nota si los ponés al lado.**

| Pagina | Elementos | Cambian |
|---|---|---|
| `landing.html` | 1097 | 95 |
| `index.html` (SPA) | 524 | 28 |
| `admin.html` claro / oscuro | 1260 | 14 / 14 |
| `mechanic.html` oscuro | 95 | 2 |
| `track.html` | 30 | 0 |

**La mitad del grupo NO se toco, y cada exclusion tiene una razon distinta:**

1. **Colores de marca ajena.** `#34a853`, `#ea4335`, `#1877f2` son el verde y
   el rojo de Google y el azul de Facebook, en los botones de OAuth.
   Recolorear el logo de otro no es limpieza, es romperlo.
2. **La paleta del modo oscuro** de las apps de staff: `#98989f`, `#8e8e93`,
   `#48484a`, `#38383a`, `#2c2c2e`, `#242426`, `#1c1c1e`, `#3a3a3f`, `#636366`,
   `#8b95a5`, `#33425e`, `#0f172a`. Igual que en B-3.
3. **Colores cuyo vecino mas cercano es de OTRO tono.** `#bfdbfe` y `#bae6fd`
   son celestes y su token mas cercano es un gris; `#221155` es violeta y le
   toca un navy; `#1e3a5f` y `#1a3a6b` son azules propios del hero y del mapa.
   Esos son colores de verdad, no deriva: van al grupo "distinto".

#### Paso 3 / PR B-3 HECHO 2026-08-09: "casi igual" en admin y mechanic, con el tema FIJADO

**59 apariciones** de 11 colores claros en `admin.html`, `mechanic.html` y sus
CSS/JS. Las mas repetidas: `#e8ecf0` 14, `#e5e7eb` 11, `#9ca3af` 9, `#eef3fc` 7.

**Se destrabo la medicion.** El problema no era que estas paginas no se pudieran
medir: era que **elegian el tema solas** (`js/admin.js:12` lee `localStorage` y
si no hay nada cae en `prefers-color-scheme`; `js/mechanic.js:304` fuerza dark),
asi que dos cargas no eran comparables. La solucion es de una linea: **fijar
`data-theme` en el iframe DESPUES de cargar y ANTES de medir**, y hacerlo igual
de los dos lados. Con eso las dos superficies quedan medibles para siempre.

| Pagina y tema | Elementos | Cambian |
|---|---|---|
| `admin.html` claro | 1260 | 96 |
| `admin.html` **oscuro** | 1260 | **6** |
| `mechanic.html` claro | 95 | 1 |
| `mechanic.html` oscuro | 95 | 0 |

**Los 6 del modo oscuro son un ARREGLO, no un efecto colateral.** Eran bordes y
fondos escritos a mano que se quedaban claros mientras el resto de la pantalla
se ponia oscura: `#e5e7eb -> #38383a` y `#eef3fc -> rgba(24,72,200,.18)`. Es
exactamente el defecto del punto **12.15**, en chiquito, y cada hex que se
convierte lo arregla en su lugar.

**Lo que NO se toco, y no se debe tocar:** los colores propios del modo oscuro
(`#f2f2f7` 58 veces, `#152035` 19, `#1a2740` 16, `#0d1b2e` 7, `#8e9bb5` 5,
`#98989f`, `#2e2e33`, `#22304a`, `#1e2d47`). Esos **son** lo que pinta
`[data-theme='dark']`. Mapearlos a un token claro daria vuelta el tema.

#### Paso 3 / PR B-2 HECHO 2026-08-09: el grupo "casi igual", superficies de cliente

**170 apariciones de 13 colores** que estaban a menos de 30 de distancia
perceptual de un token pasaron a ese token, en `index.html`, `landing.html`,
`track.html` y el CSS/JS que comparten.

| Color | Veces | Pasa a |
|---|---|---|
| `#e5e7eb` | 95 | `--border` |
| `#9ca3af` | 24 | `--gray-lt` |
| `#f3f4f6` | 14 | `--border-lt` |
| `#f9fafb` | 13 | `--surface` |
| `#eef3fc` | 5 | `--blue-lt` |
| `#ecfdf5` | 4 | `--green-lt` |
| `#1f2937` | 4 | `--navy2` |
| `#f0f9ff` | 3 | `--blue-lt` |
| `#f7f8fa`, `#f8faff` | 3 | `--surface` |
| `#fff7ed`, `#fef9ee` | 3 | `--amber-lt` |
| `#4b5563` | 2 | `--gray` |

**MEDIDO:** cambian **87 de 1097** elementos en `landing.html`, **18 de 524**
en la SPA y **0 de 30** en `track.html`. Los corrimientos mas repetidos son
`#e5e7eb -> #e2e8f0` (140 propiedades) y `#9ca3af -> #94a3b8` (136). Ninguno
pasa de un tono; es exactamente lo que "casi igual" queria decir.

**La distancia perceptual NO alcanza para decidir: la tabla se escribio a
mano.** Tres casos lo prueban:

- `#ecfdf5` tiene como vecino mas cercano a `--wa-lt` (el verde de WhatsApp),
  pero es obviamente el `--green-lt` viejo. **Gana la semantica, no el numero.**
- `#dbeafe` (azul 200) y `#f5f3ff` (violeta) tienen como vecino mas cercano un
  token **gris**. Mapearlos habria cambiado el color de verdad, asi que
  **quedan afuera** y se tratan como "distinto".

Quien siga con "parecido" y "distinto" tiene que revisar cada color igual: una
tabla generada por distancia y aplicada sin leer va a romper algo.

#### Paso 3 / PR B-1 HECHO 2026-08-09: muere el azul retirado

**Las 57 apariciones de `#1848C8` en las 5 superficies ya no existen.** No hacia
falta ninguna decision nueva: el azul de la app es `#2563eb` desde el 2026-08-03
(y el logo se queda con `#0055de`), asi que cada `#1848C8` era deriva, no una
eleccion. **Esto SI cambia pixeles**, a proposito.

No fue un reemplazo unico, porque el contexto manda:

| Donde | Cuantos | A que paso | Por que |
|---|---|---|---|
| CSS, `<style>`, `style="..."` de las 5 superficies | 50 | `var(--blue)` | el token existe y resuelve ahi |
| `js/admin.js` 1090-1135 | 6 | **`#2563eb` literal** | es el `<style>` de un `window.open()`: documento nuevo, sin `variables.css`, ahi `var(--blue)` no existe |
| `landing.html` hover de Fleet | 1 | **`var(--blue-dark)`** | ese `onmouseover` buscaba un azul MAS oscuro que el boton. Mapearlo a `var(--blue)` habria dejado el hover sin efecto |

La unica mencion que queda de `#1848C8` en las superficies es el comentario de
`track.html` que explica de donde venia. Es documentacion, no color.

**El hallazgo del literal en la ventana de impresion vale para el resto del PR
B:** cualquier CSS que se escriba dentro de un `window.open()` o de un email
esta fuera del alcance de `css/variables.css`. Ahi el hex es obligatorio, y lo
unico que se puede hacer es que coincida con el token.

**HALLAZGO 1 - la trampa de la auto-referencia.** La primera version del script
reescribio `--white: #ffffff` (en `css/home.css:12`) como
`--white: var(--white)`. Una custom property que se referencia a si misma es
**invalida en tiempo de computo**, asi que `--white` quedo indefinida en ese
elemento y en todos sus descendientes: **12 titulos blancos de la landing se
volvieron navy.** Lo encontro la medicion, no la lectura del diff. Regla para
el PR B: **un hex que es el VALOR de una custom property nunca se toca** - es
una definicion o un alias, no un uso. El comentario de `css/home.css:6-8` ya
avisaba de esto para `--blue`/`--gray`/`--border`; ahora lo hace el script.

**HALLAZGO 2 - en admin y mechanic, `#fff` y `var(--white)` NO son lo mismo.**
`css/admin.css:2-10` y `css/mechanic.css:2-14` redefinen tokens dentro de
`[data-theme='dark']`: ahi `--white` vale `#1c1c1e` y `#152035`, `--blue-lt`
vale `rgba(24,72,200,.18)`, y en mechanic `--navy` vale `#f2f2f7`. En modo
oscuro, entonces, un `#fff` escrito a mano se queda blanco y un `var(--white)`
se vuelve oscuro. **Por eso las dos apps de staff quedan fuera del PR A**: cada
uno de sus 743 hex es una decision sobre si ese elemento debe seguir al tema
oscuro o quedarse fijo. Es exactamente la causa raiz del punto **12.15** (el
"No jobs today" ilegible), y convertirlos **arreglaria** medio modo oscuro - pero
cambia pixeles, asi que es PR B.

**Limite de la medicion, dicho sin adornos:** `admin.html` y `mechanic.html`
**si** cargan en local, pero su estado de tema no es igual en la primera carga
que en las siguientes, asi que una comparacion antes/despues de esas dos paginas
da diferencias que no vienen del cambio. Se comprobo dejando los dos archivos
**sin tocar** y midiendo igual: seguian dando 30 y 17 diferencias. Cualquier
medicion de esas dos superficies tiene que fijar el tema primero.
#### Paso 2 HECHO 2026-08-09: la landing ya no pisa los tokens

`css/landing.css` no abre mas un `:root`. **MEDIDO EN NAVEGADOR**, comparando
las 9 propiedades de color/forma de **los 1097 elementos** de `landing.html`
antes y despues: **cambian 499**.

| Token | Antes (landing) | Despues (el token) |
|---|---|---|
| `--dark` | `#111827` | `#0d1f3c` |
| `--gray` | `#6b7280` | `#475569` |
| `--border` | `#e5e7eb` | `#e2e8f0` |
| `--blue-dark` | `#1d4ed8` | `#1e40af` |
| `--gray-light` | `#f9fafb` | `#f8fafc` |
| `--radius` | `8px` | `12px` |
| `--shadow-sm` / `--shadow-md` | 1 capa | 2 capas |
| `--transition` | `all 200ms ease` | `150ms ease` |

Que cambia, por cantidad de elementos:

| Cambio | Elementos |
|---|---|
| texto `#111827` -> `#0d1f3c` (hereda del `body`) | 452 |
| gris `#6b7280` -> `#475569` | 27 |
| bordes `#e5e7eb` -> `#e2e8f0` | 19 |
| **esquinas `8px` -> `12px`** | 16 |

**El contraste mejora en todo menos en el texto principal, que sigue de sobra:**
principal 17.74:1 -> 16.43:1, gris sobre blanco **4.83:1 -> 7.58:1**, gris sobre
el fondo gris **4.63:1 -> 7.24:1**.

**HALLAZGO aparte, arreglado en el mismo PR.** `--dark`, `--blue-light` y
`--gray-light` estaban declarados **solo** dentro de ese `:root` de
`css/landing.css`, que es el archivo que carga **una sola pagina**. Pero
`css/home.css` y `index.html` los usan igual: los precios de las membresias de
la SPA son `color: var(--dark)`. En la SPA ese nombre no existia, asi que la
propiedad se descartaba y el elemento **heredaba**. Hoy no se nota porque lo que
hereda es el `--navy` del `body`, que es casi el mismo color - **verificado en
navegador**: un hijo de un padre rojo con `color: var(--dark)` salia **rojo**
sin el alias y navy con el. Era una bomba de tiempo, no un sintoma. Los tres
nombres ahora viven en `css/variables.css` como alias legacy.

Aclaracion para no perseguir un fantasma: `css/mechanic.css:2-14` y
`css/admin.css:2-10` tambien redefinen tokens, pero **solo dentro de
`[data-theme='dark']`**. Eso es tematizado correcto, no deriva. La unica
redefinicion global en conflicto era la de `css/landing.css:2`, y desde el
2026-08-09 ya no existe: **no queda ninguna**.

### 12.25 Siete declaraciones CSS que no hacian nada — CERRADO 2026-08-11

**Aparecieron mientras se cerraba el paso 3 de 12.14**, no en una auditoria de
bugs. Son dos defectos distintos y los dos se ven en pantalla.

#### A. `X: undefined !important`, seis veces

Un template literal interpolo una variable JS vacia cuando se escribieron estas
reglas. `undefined` no es un valor CSS valido, asi que **la declaracion se
descarta entera**:

| Archivo | Regla | Consecuencia |
|---|---|---|
| `css/mechanic.css:16` | `[data-theme='dark'] .job-card` | **la tarjeta de trabajo se quedaba BLANCA en modo oscuro** |
| `css/mechanic.css:93` | `[data-theme='dark'] .kpi-card` | idem, las tarjetas de KPI |
| `css/mechanic.css:54` | `.abtn.primary.done/.accept` | ninguna: `--green` no se redefine en oscuro |
| `css/admin.css:440` | `[style*='background:var(--white)']` | ninguna: el `var(--white)` inline ya sigue al tema |
| `css/admin.css:477` | idem, en `#page-vans` | ninguna, por lo mismo |
| `css/landing.css:748` | `-webkit-text-fill-color` de autofill | el texto autocompletado usaba el color del navegador |

**Las dos primeras son el defecto 12.15 otra vez, y en la app que el mecanico
usa en la calle.** Medido en el navegador sobre `mechanic.html` con
`data-theme='dark'` fijado:

| | antes | ahora |
|---|---|---|
| `.job-card` fondo | `#ffffff` | `#152035` |
| `.job-card` texto | `#f2f2f7` | `#f2f2f7` |
| **contraste** | **1.12:1** | **14.59:1** |
| `.kpi-card` | igual | igual |
| en tema claro | 16.43:1 | **16.43:1, sin cambio** |

**La causa raiz no era la regla rota, era la de al lado.** `.job-card` y
`.kpi-card` declaraban `background: #fff` **en hex**. `--white` es uno de los
diez tokens que `css/mechanic.css` redefine para oscuro (`#152035`), asi que
con `var(--white)` la tarjeta se oscurece sola y la regla de override nunca
hizo falta. El arreglo son dos lineas: el hex pasa a token y la regla muerta se
borra. Es exactamente lo contrario de la regla general de 12.14 - aca **queremos**
que siga al tema.

Las tres inocuas se borraron igual, con un comentario en su lugar diciendo por
que no hace falta ninguna regla ahi. Dejar `undefined` en el archivo invita a
que alguien "lo complete" con un valor y rompa algo que hoy funciona.

#### B. El reporte de finanzas de admin usa `var()` donde no existe

`js/admin.js:1096` abre `window.open('', '_blank')` y escribe el reporte con
`document.write`. **Es un documento nuevo: no carga `css/variables.css`.** Ahi
habia **21 `var(--x)`** y las 21 se descartaban.

Verificado con un `srcdoc` que reproduce el caso, midiendo el valor computado:

| Elemento | sin `variables.css` (hoy) | con el `:root` inyectado |
|---|---|---|
| `.brand-icon` fondo | `rgba(0,0,0,0)` **transparente** | `rgb(37,99,235)` |
| `.brand-sub` color | hereda del `body` | `rgb(71,85,105)` |
| `.kpi` fondo | `rgba(0,0,0,0)` **transparente** | `rgb(248,250,252)` |

O sea el reporte salia impreso sin el azul de marca, sin fondo en los KPI y con
los subtitulos en el color heredado.

**El PR B-1 ya habia avisado de esto** ("en un `window.open()` el hex es
obligatorio") y convirtio 6 apariciones a hex literal. Un PR posterior las
volvio a pasar a `var()` sin notar el contexto. **Por eso el arreglo no es
volver al hex:** se inyecta un `:root` con los 7 tokens que el reporte usa
dentro de su propio `<style>`. Queda autocontenido, no agrega hex al presupuesto
(un `--x: #hex` es una definicion y `color-check.mjs` no la cuenta) y la proxima
conversion masiva no lo puede romper otra vez.

**Verificado que no se movio nada mas.** Histograma de los 12 valores de color
computados de todos los elementos, dos servidores, descartando la corrida de
calentamiento:

| Pagina | main | la rama |
|---|---|---|
| `admin.html` claro | 1271 el., navy 3599 / border 635 / white 500 | **identico** |
| `admin.html` oscuro | digest `84942984` | **`84942984`** |
| `landing.html` | digest `b0728d1a`, 1091 el. | **`b0728d1a`** |

### 12.26 El panel de admin quedaba "logueado" sin sesion, sin salida — CERRADO 2026-08-11

**Lo reporto Diego con una captura de produccion**, no una auditoria: la pagina
Orphan Payments decia *"Admin session expired - sign in again"* mientras la
barra lateral mostraba su nombre y su rol. Palabras suyas: *"esto sigue asi no
puedo ver nada"*.

**No hay forma de volver a entrar.** Ese es el punto. `checkAdminAuth()`
(`js/admin.js:1755`) devuelve `true` con que **exista** la clave
`drbike-admin-token` en `localStorage` - nunca comprueba que siga sirviendo. Asi
que cuando la sesion de Supabase muere, el panel se dibuja entero, con el nombre
puesto, y cada pantalla que necesita identidad contesta "session expired". El
formulario de login **no vuelve a aparecer nunca**, y sin el no se puede
renovar nada.

**Por que muere la sesion:** `restoreAdminSession()` hacia
`await sb.auth.setSession({ access_token, refresh_token })` y **descartaba lo
que devolvia**. Los refresh token de Supabase rotan y caducan; cuando el par
guardado ya no vale, `setSession()` falla, no guarda nada, y nadie se entera.
Es exactamente la regla "No silent errors" de `CLAUDE.md` incumplida en el peor
lugar posible.

**REPRODUCIDO**, sembrando un par de tokens invalidos y recargando:

| | antes | ahora |
|---|---|---|
| Overlay de login | **no aparece** | **aparece** |
| Token muerto en `localStorage` | **se queda** | **se borra** |
| Claves de Supabase en `localStorage` | **ninguna** | - |
| Click en "Check this range" | *"Admin session expired - sign in again."* | pide contraseña |

El caso "sin token" sigue igual que siempre: overlay de login. Comprobados los
dos en el navegador, no de memoria.

**Segundo defecto, encontrado leyendo lo de al lado.** `_completeAdminLogin()`
llamaba a `setSession()` **sin `await`** y sin mirar el error, y acto seguido
hacia `go('dashboard')` y `subscribeToBookings()`. O sea la primera pantalla
despues de firmar y el canal de realtime podian arrancar antes de que existiera
la sesion, y un login que no creaba sesion se veia como un login correcto - la
misma trampa, un paso antes.

**Salida de emergencia, por si vuelve a pasar antes de que esto este
desplegado:** en la consola del navegador, sobre `/admin.html`,
`localStorage.removeItem('drbike-admin-token')` +
`localStorage.removeItem('drbike-admin-refresh')` + recargar. Vuelve el
formulario.

### 12.27 Analytics decia "0 reservas" sobre un embudo con 5 personas pagando — CERRADO 2026-08-11

**Lo pregunto Diego mirando la pantalla:** *"la seccion traffic esta mostrando
datos reales?"*. La respuesta corta es si — PostHog esta conectado y las 8
consultas vuelven. La larga es que **el numero de reservas no se podia creer**,
y por dos motivos distintos.

#### 1. El recuadro estaba mal etiquetado

`js/admin.js` mostraba `booking_completed` bajo el titulo **"Bookings started"**,
con el subtitulo *"reached the end of the booking flow"*. El recuadro se
contradecia solo: decia "empezadas" y contaba "terminadas". Y como daba **0**
justo encima de un embudo que decia *"Chose a service: 22"*, la pantalla parecia
rota.

#### 2. Peor: el numero venia del navegador, que no es la fuente de verdad

`booking_completed` se emite desde `js/app.js` (`:249` y `:1884`) **despues** de
que vuelve el pago. Si el cliente cierra la pestaña — o si la reserva la escribe
el webhook de Stripe en el servidor — la fila existe y el evento no sale nunca.

La prueba estaba en la pantalla de al lado: la auditoria de huerfanos dijo
*"Checked 6 payments between 2026-07-04 and 2026-08-05"* con **1 huerfano**, o
sea **5 pagos con reserva detras**, mientras PostHog reportaba **0** reservas en
una ventana que se solapa. Tres numeros, tres fuentes, y ninguna pantalla que
los pusiera al lado.

**El recuadro ahora cuenta filas de `bookings`**, no eventos. El evento sigue
mostrandose, una fila mas abajo, como lo que es.

#### 3. Lo nuevo: "Do the three sources agree?", arriba del embudo

Misma ventana de fechas, tres preguntas:

| Fuente | Que responde |
|---|---|
| PostHog | cuantos llegaron a la pantalla de pago (intencion) |
| Stripe | cuantos pagos devuelve el rango (plata) |
| `bookings` | cuantas filas se escribieron (**la verdad**) |

Y debajo, las diferencias **con nombre**: un huerfano es plata cobrada sin nada
escrito; un evento faltante debajo de una fila real es un agujero de medicion,
no una venta perdida. Son problemas distintos y hasta hoy se veian igual.

**La mitad de Stripe llama a `auditOrphanPayments()`**, la misma funcion que usan
el cron diario y la pantalla Orphan Payments. Una segunda definicion de
"huerfano" viviendo en `handleAdminAnalytics` habria derivado de esas dos y las
tres pantallas empezarian a contradecirse. De paso hereda dos cosas que una
implementacion nueva hace mal: pagina Stripe, y **trocea la busqueda de ids**,
porque un mes de ids en un solo `in.()` da una URL lo bastante larga como para
ser rechazada — y una busqueda rechazada reporta **todos** los pagos como
huerfanos.

**Sin avisos automaticos, decision de Diego (2026-08-11):** el cron de las 9:00
ya avisa de los huerfanos, que es el caso donde hay plata en juego. Un segundo
aviso por "los numeros no cuadran" seria ruido diario sin accion asociada.

**Verificado renderizando la tarjeta** con tres escenarios inyectados (los tres
cuadran / el caso real de Diego / Stripe caido). Contraste medido en los dos
temas: titulo 16.43:1 claro y 14.59:1 oscuro, nota 4.76:1 y 5.38:1, la linea de
alerta 5.41:1 y 5.89:1. Todo por encima de AA.

#### 4. HALLAZGO — `CLAUDE.md` decia que el escritorio era otro flujo, y no lo es

`CLAUDE.md:70` afirmaba *"Desktop (landing.html): NO Stripe charge - bkProceed()
creates booking in Supabase and Diego contacts client manually"*. **Falso.**
`landing.html:3389` carga `js/app.js` y `openBooking()` abre el asistente de la
SPA en la misma pagina. `bkProceed()` **no existe**: grepearlo solo devuelve
documentacion (este archivo, `CONTEXT.md`, `tasks.md`, comentarios de
`js/i18n.js`).

Esa linea costo caro en esta misma sesion: llevo a concluir — y a decirselo a
Diego — que el embudo de analytics era **solo movil** y que habia que emitir los
eventos tambien en escritorio. Se detecto leyendo `landing.html` antes de
escribir el codigo, no despues. Las dos lineas de `CLAUDE.md` quedaron
corregidas con el porque al lado.

### 12.29 Dos defectos que introdujeron los PR de esta misma sesion — CERRADO 2026-08-11

**Salieron de releer lo propio, no de una pantalla rota.** Los dos son cosas que
`node --check` no puede ver y los tests no cubren: uno solo aparece cuando algo
falla, el otro solo con un rango largo.

#### A. `_completeAdminLogin()` podia quedar como unhandled rejection (del PR #227)

El PR #227 la convirtio en `async` para poder esperar a `setSession()` y mostrar
el error. Correcto — pero **sus cuatro llamadores la invocan sin `await`**
(lineas 1826, 1874, 1912 y 1951), y estan dentro de su propio `try/catch`, que
una promesa suelta **no atraviesa**.

`setSession()` puede **lanzar** en vez de devolver `{error}` (una caida de red,
por ejemplo). En ese caso la promesa quedaba rechazada sin nadie escuchando: el
overlay de login se quedaba mudo y los tokens seguian en `localStorage`. Es
**exactamente el callejon sin salida que ese PR existia para cerrar**, entrando
por la otra puerta.

Ahora el `await` va envuelto y un throw se convierte en el mismo mensaje visible
que un error devuelto.

**VERIFICADO en el navegador**, rompiendo `fetch` dentro del iframe y llamando a
la funcion:

| | antes | ahora |
|---|---|---|
| La promesa rechaza | si | **no** |
| `unhandledrejection` | si | **ninguno** |
| Mensaje en pantalla | ninguno | *"Signed in, but the session could not be opened: …"* |
| Token muerto | se quedaba | **se borra** |

#### B. La reconciliacion podia tumbar la tarjeta de trafico (del PR #228)

`readReconciliation()` llamaba a `auditOrphanPayments()` **sin acotar
`maxPages`**, y el default son 20 paginas: hasta 2000 pagos y 20 viajes a
Stripe, encadenados. Eso corre **dentro de la misma funcion de Vercel** que las
8 consultas de PostHog y la tarjeta de checkouts, y esa funcion tiene un timeout
duro. Con "All time" (730 dias) el rango es lo bastante grande como para que se
note.

El archivo **ya avisaba de esta trampa** tres funciones mas arriba, sobre
`POSTHOG_TIMEOUT_MS`: *"sin un limite propio, un PostHog lento se lleva puesta
la tarjeta de checkouts"*. Se escribio el mismo defecto al lado del comentario
que lo describe.

Acotado a **5 paginas** (500 pagos). La pantalla de Orphan Payments conserva las
20: es una pantalla propia y no comparte presupuesto con nadie. Cuando se corta,
`truncated` ya lo dice en pantalla en vez de que falle la tarjeta entera.

#### C. Un comentario sobre configuracion EXTERNA se quedo viejo y engaño

`api/auth.js`, en la consulta `returning`, decia: *"toDate() resuelve en la zona
horaria del PROYECTO... **es UTC hoy**, lo que pone el corte de dia a las 10-11am
de Sydney"*. Escrito cuando era cierto, nunca actualizado despues de que Diego
cambiara el ajuste.

El 2026-08-11 una sesion lo leyo, lo creyo, y le dijo a Diego que el
**"Came back 9 · 9%" estaba inflado** y habia que arreglarlo — con instrucciones
paso a paso incluidas. Diego abrio PostHog y ahi decia
**"Australia / Sydney (UTC+10:00)"**: ya estaba puesto desde hacia tiempo. **El
numero era correcto y no habia nada que arreglar.**

El comentario queda corregido, con la fecha en que se miro y la advertencia:
**este ajuste vive fuera del repo y nada de aca lo puede mantener honesto.** Si
vas a repetir una afirmacion sobre la configuracion del proyecto de PostHog,
abrilo y mira. Es la misma clase de deriva que `CLAUDE.md:70` con `bkProceed()`
(12.27), y van dos en la misma sesion.

#### Lo que se reviso y estaba bien

- `isOrphanCandidate` **no** quedo referenciado sin importar en `api/auth.js`
  (una version intermedia lo usaba; la reescritura lo saco limpio). Comprobado
  por grep, que es lo unico que lo detecta: `node --check` no valida
  identificadores.
- `loadAvgServiceTime()`: `sub` esta declarado una sola vez y guardado con
  `if (sub)` en las tres ramas.
- El bloque de reconciliacion aguanta datos ausentes: `orphans_value` sin valor
  no rompe el `.toFixed(2)`, y `funnel` en `null` da `—`, no `0`.

### 12.30 El P&L no calculaba nada: restaba una constante — CERRADO 2026-08-11

**Lo vio Diego mirando la tarjeta:** *"esos numeros no son reales"*. Tenia razon,
y era peor de lo que parecia.

De las once lineas del P&L Summary, **solo tres salian de la base**: Revenue,
GST y Net revenue. Las otras ocho eran constantes escritas a mano en
`js/admin.js`:

```
payroll 0 · fleet 960 · insurance 360 · marketing 400 · software 120 · other 360
```

Suman exactamente **2200**, que es el `Net profit -$2,200` que mostraba con
revenue en cero. Mas `Variable costs (parts)`, que era `nº de trabajos x $10`.
Nadie las cargo nunca, nunca cambiaron, y no correspondian a un peso gastado.
**La tarjeta no estaba calculando: estaba restando una constante.**

#### No se podia "conectar": no habia con que

Buscado en las migraciones y en la base: **no existia ninguna tabla de gastos**.
`parts_inventory` es stock, no plata. Y no hay ningun contable conectado. Para
mostrar gastos reales primero tenia que haber donde vivieran.

**Decidido por Diego 2026-08-11:** tabla en Supabase + pantalla en el admin.
`scripts/add-expenses-table.sql` (migracion 38 del runbook), RLS encendido sin
politica — solo el service role la lee, igual que `checkout_attempts`.

#### La camioneta: gasto unico, decision de Diego

Los $17.500 entran **enteros en el mes que se compro**, no repartidos. Se le
advirtio lo que eso implica y lo eligio igual: **ese mes da una perdida enorme y
no es comparable con los demas**. Queda escrito aca porque el que mire el P&L de
julio 2026 sin este parrafo va a pensar que el negocio se hundio.

El modelo soporta las dos cosas: `recurring_monthly` distingue "la suscripcion de
Claude, todos los meses" de "la camioneta, una vez". Si mañana el contador pide
depreciacion, se carga como recurrente y listo — no hay que tocar codigo.

#### Lo que se midio

La aritmetica del rango, con los gastos de Diego cargados:

| Rango | Total | Por que |
|---|---|---|
| agosto 2026 | **$235,50** | Claude 30 + seguro 120 + nafta 85,50. La camioneta **no** aparece |
| julio 2026 | **$17.650** | la camioneta entera + los dos recurrentes |
| trimestre jul-sep | **$18.035,50** | camioneta x1, recurrentes x3 |
| mayo 2026 | **$0** | los recurrentes **no** cuentan hacia atras |

El ultimo es el caso sutil y es el que estaba facil de errar.

**Contraste del monto en la lista, medido sobre la tarjeta real de cada tema:**

| | claro | oscuro |
|---|---|---|
| `--red` | **5,41:1** | 3,14:1 falla |
| `--red-bright` | 3,76:1 falla | **4,52:1** |

Ninguno de los dos sirve para los dos temas, asi que el color vive en
`css/admin.css` (`.exp-amount`) y no en el `style` inline que escribe el JS: un
color inline no lo puede pisar una regla de tema. Los dos son tokens, no suma
hex al presupuesto.

**Estados verificados los tres:** con datos, con la tabla sin crear (dice que
falta correr la migracion, no cero), y vacio (dice que el P&L esta mostrando
ingresos y no ganancia).

**HALLAZGO de medicion, otra vez el service worker.** La primera tanda de
mediciones dio "no encontrado" para `.exp-amount`: el SW servia el `js/admin.js`
anterior, sin la clase. Reescribir el `href` de las hojas de estilo no alcanza —
**el JS tambien va por la misma cache**. Hay que desregistrar el SW y vaciar
`caches` antes de medir cualquier cosa que dependa de codigo nuevo.

### 12.31 Total en Expenses, y un contraste que casi se va invisible — CERRADO 2026-08-11

Pedido de Diego: *"falta una seccion en expenses con el total"*.

**Son DOS numeros, no uno, y esa es la decision.** El monto de un gasto suelto
ES lo que se gasto; el de un recurrente es lo que se gasta CADA MES. Sumar las
dos columnas da un total que no significa nada: contaria la suscripcion de
Claude una sola vez sin importar cuantos meses lleva corriendo. Asi que la
tarjeta muestra **"Spent so far"** (los sueltos) y **"Every month"** (el
compromiso fijo), etiquetados como las dos cosas distintas que son, mas un
desglose por categoria.

**Verificado con los 11 pagos reales de Anthropic**, leidos de los recibos del
correo: **$211.36**, 11 gastos sueltos, todo en Software & phone. Coincide con
la suma a mano.

#### El error: dar por buena una medicion hecha en OTRA tarjeta

La primera version puso `color: var(--navy)` con un comentario que afirmaba
16.43:1 en claro y 14.59:1 en oscuro. El de claro era cierto. **El de oscuro
estaba medido en la tarjeta de Analytics, que tiene otro fondo.** Medido en la
tarjeta de Expenses daba **1.04:1** - navy sobre la tarjeta oscura, invisible.

El arreglo no fue elegir otro token: fue **no declarar `color` y heredar**. El
body lleva `--navy` en claro y `[data-theme='dark'] .main` ya repinta a
`#f2f2f7`, asi que los dos temas reciben la tinta con la que fueron disenados y
no se agrega ni un hex. Medido despues: **16.43:1 claro, 15.25:1 oscuro**.

Es la tercera vez en el mismo dia que una afirmacion sobre algo que no se volvio
a mirar sale mal - `CLAUDE.md:70` con `bkProceed()` (12.27), el timezone de
PostHog (12.29-C), y esta. Aca lo no verificado fue **el fondo**: un ratio no es
propiedad de un token, es de la pareja token + fondo. Medir uno y citarlo en
otra pantalla es exactamente el mismo error que copiar un hex de la doc.

### 12.23 El chip `completed` seguia fallando AA — CERRADO 2026-08-09

**Salio de renderizarlo, no de la aritmetica.** Cuando se libero un slot de dev
server se midieron los **seis** chips de `admin.html` en el navegador, con
`data-theme` fijado y reescribiendo el `href` de cada hoja de estilo primero:

| Chip | Antes | Ahora |
|---|---|---|
| `pending` | 4.84:1 | 4.84:1 |
| `enroute` / `in_progress` | 4.79:1 | 4.79:1 |
| `confirmed` | 8.01:1 | 8.01:1 |
| `cancelled` | 4.95:1 | 4.95:1 |
| **`completed`** | **4.34:1 falla** | **6.92:1** |

`css/admin.css:928` usaba `--slate` (`#64748b`) sobre `--border-lt`
(`#f1f5f9`): 4.34:1, y el chip es 11px/600, asi que el minimo es 4.5:1. Pasa a
`--gray`. **13.11 no lo cubria** porque 13.11 salio de `track.html`, que no
tiene chip `completed`.

**Los seis dan igual en modo oscuro**, comprobado inyectando el chip dentro de
`.main` con `data-theme='dark'`. No es casualidad: esos chips usan hex literal
(`#fffbeb`, `#f0fdf4`...), que es exactamente lo que el conversor dejo quieto
porque `--amber-lt` y `--green-lt` **si** se redefinen en oscuro.

### 12.28 `service_type` no existe: el KPI de tiempo promedio nunca funciono — CERRADO 2026-08-11

**Lo vio Diego como un 400 rojo en la consola**, no en la pantalla. La pantalla
no decia nada, que es la mitad del problema.

`js/admin.js` `loadAvgServiceTime()` pedia `bookings.service_type`. **Esa columna
no existe.** Preguntado a la base de produccion por PostgREST, con la clave anon:

| `select=` | HTTP | respuesta |
|---|---|---|
| `service_name` | **200** | `[]` |
| `service_type` | **400** | `42703 · column bookings.service_type does not exist` · hint: *"Perhaps you meant to reference the column bookings.service_name"* |

**Postgres sugiere el nombre correcto en el propio error.** Nadie lo leyo nunca
porque el codigo hacia `const { data } = await sb...` — se quedaba con `data` y
**tiraba `error`**. Con la consulta fallando, `data` es `undefined`, el
`if (!data?.length) return;` se iba en silencio, y el recuadro quedaba en blanco
para siempre. "No hay trabajos con duracion registrada" y "no puedo leer la
tabla" se veian exactamente igual. Es la regla "No silent errors" de `CLAUDE.md`
otra vez, y van tres en esta sesion (12.26 la sesion de admin, 12.27 el conteo
de reservas, esta).

Ahora el recuadro dice cual de las dos cosas pasa.

#### La misma falta de ortografia dejo la migracion 28 a medias

`scripts/add-service-timing-columns.sql:13` creaba el indice sobre
`...,service_type)`. Postgres **aborta el script en la sentencia que falla**, asi
que de esa migracion corrio la mitad: los cinco `ALTER TABLE` de arriba si
(verificado: las cinco columnas responden 200), y **nada** de la linea 13 para
abajo — ni el indice `idx_bookings_service_timing` ni los cuatro `COMMENT ON
COLUMN`.

El archivo queda corregido y **hay que volver a correrlo**. Todo lo que contiene
es idempotente (`IF NOT EXISTS`), asi que re-ejecutarlo es seguro; solo replica
la cola que nunca se ejecuto. Anotado tambien en `docs/RUNBOOK-SQL.md`, cuyo
chequeo numero 28 solo mira las 5 columnas y por eso daba **verde** con el
indice ausente.

#### `--an-good` era el ultimo verde retirado que seguia en produccion

`css/admin.css` definia `--an-good: #059669` dentro de `#page-analytics`. Ese es
el esmeralda que el grupo A de 12.14 movio a `--green` en todo el resto del
repo. Sobrevivio por dos reglas que se cruzaron: **un hex que es el VALOR de una
custom property nunca se reescribe**, y el ratchet **tampoco cuenta las
definiciones**. O sea era invisible para las dos mitades del trabajo de color.

Medido en el navegador, sobre `#page-analytics`:

| | main | ahora |
|---|---|---|
| `--an-good` claro | `#059669` — **3.77:1, falla AA** | `#15803d` — **5.02:1** |
| `--an-warn` claro | `#b45309` | `#b45309`, sin cambio |
| `--an-crit` claro | `#cf2020` | `#cf2020`, sin cambio |
| el trio oscuro | 8.47:1 | 8.47:1, sin cambio |

Los tres claros pasan a `var(--green)` / `var(--amber)` / `var(--red)`: los otros
dos ya valian exactamente eso, asi que solo se mueve el verde. **El trio oscuro
se queda literal a proposito** - es otra rampa, no una copia.

### 12.24 El email de confirmacion mostraba las mismas cifras dos veces — CERRADO 2026-08-09

**Lo vio Diego en el email de prueba**, no una auditoria. El `confirmation`
traia dos bloques con **los mismos seis numeros**: la tabla de la reserva
arriba, y debajo un bloque `TAX INVOICE` que repetia Service, Date & time,
Location, Subtotal, GST y Total. Palabras de Diego: *"no tiene sentido"*.

**Y estaba mal por una segunda razon, mas seria.** Ese bloque se llamaba a si
mismo *tax invoice* por el **total del servicio**, en un momento en que no se
facturo ni se cobro ese total:

- al reservar se cobra **solo el call-out** — el boton dice literalmente
  `Confirm & Pay $CALLOUT Call-out Fee` (`js/app.js:1331`);
- el email manda `price: _total` (`js/app.js:1931`), que es
  `serviceTotal + calloutFee`;
- y el propio email dice **"Payment collected on completion"** tres lineas mas
  arriba.

**La factura de verdad ya existe y ya se manda:** `api/send-invoice.js` arma un
PDF con PDFKit y lo adjunta como `DrBike-<nro>.pdf` cuando el mecanico completa
el trabajo (`js/mechanic.js:2113`). Ese es el documento que el cliente guarda.

Se borro el bloque. La tabla de arriba queda, "What happens next" queda, el
boton queda. **27 hex menos** en `api/send-email.js` (250 -> 223).

**Tres claves de traduccion quedaron muertas** y las agarro
`tests/unit/email-i18n.test.js`, no la lectura del diff: `Total (AUD)`,
`Subtotal (excl. GST)` y `Location`. Borradas de `es` y `zh`. Un segundo test
usaba `Subtotal (excl. GST)` como ejemplo de "clave larga que contiene a una
corta"; se cambio al par `at checkout` / `&bull; Enter code at checkout`, que
sigue existiendo, con el porque escrito en el test.

**Verificado en produccion el 2026-08-10.** Se mando el envio que faltaba
(Resend id `cdecb204-7a34-42f4-ae21-c64992393284`, a
`contact@drbikesydney.com.au`) y se leyo el correo que llego. El bloque
`TAX INVOICE` **ya no esta**. Lo que queda es: tabla de la reserva (Service,
Date & time, Address, Net amount $132, GST $13, Total $145), "What happens
next" y el boton. **Cada cifra aparece una sola vez.**

### 12.22 El boton "View your booking" del email de confirmacion NO estaba roto — CERRADO 2026-08-10

**Salio de mandar un email de prueba de verdad**, no de leer codigo. Se envio un
`confirmation` desde produccion a `contact@drbikesydney.com.au` (Resend id
`af636c13-02d4-474f-b690-c338f1e3a2d0`) y se leyo el mensaje que llego. El link
del boton principal llego asi:

```
https://drbikesydney.com.au/?action<CARACTER INVALIDO>shboard
```

**El codigo fuente esta bien:** `api/send-email.js:142` dice
`?action=dashboard`. Lo que se rompe es el transporte. En *quoted-printable*,
`=` empieza una secuencia de escape: `=da` se decodifica como el byte `0xDA`,
que no es UTF-8 valido y se convierte en el caracter de reemplazo. Si el `=` no
se escapa como `=3D`, el link muere.

**Solo un link del repo esta expuesto**, y es justo el mas importante:

| Link | `=` seguido de | Riesgo |
|---|---|---|
| `?action=dashboard` | `da` — **los dos hex** | **roto** |
| `?action=book` | `bo` — `o` no es hex | a salvo |
| `?action=membership` | `me` — `m` no es hex | a salvo |

**Lo que NO se pudo determinar desde aca:** si el `=` sin escapar viaja de
verdad en el correo (y entonces le pasa a **todos** los clientes) o si es la API
de Gmail la que decodifica de mas al entregarnos el cuerpo. Las dos hipotesis
explican lo observado.

**Resuelto el 2026-08-10: gana la segunda hipotesis. No hay bug.** Diego abrio
"Mostrar original" (el MIME crudo, antes de que nadie lo decodifique) sobre el
envio `cdecb204-7a34-42f4-ae21-c64992393284` y el link viaja asi:

```
Content-Transfer-Encoding: quoted-printable
View your booking =E2=86=92 https://drbikesydney.com.au/?action=3Ddashboard
```

`=3D` es exactamente el escape correcto del `=`. Amazon SES codifica bien, el
correo sale bien y **el boton le funciona a todo el mundo**. Lo que estaba mal
era el instrumento de medicion: la API de Gmail nos devolvia el cuerpo
decodificado de mas, y ese `<CARACTER INVALIDO>` nunca existio en el mensaje
real.

**Lo que deja como leccion:** un correo leido por API no es el correo. Cuando la
sospecha es de transporte o de codificacion, la prueba es el MIME crudo
("Mostrar original" / "Show original"), no el cuerpo que devuelve una API ni el
render del cliente de correo. La tabla de arriba se conserva porque la aritmetica
de quoted-printable sigue siendo cierta - simplemente no se estaba dando.

#### Las apps de staff, la mitad que NO era una decision (2026-08-09)

12.14 aparco `admin` y `mechanic` diciendo que **cada uno de sus hex es una
decision** sobre si ese elemento debe seguir al tema oscuro. Es cierto para
algunos. **No lo es para los que usan un token que `[data-theme='dark']` nunca
redefine**: ahi `var(--x)` y el hex resuelven al mismo color en **los dos**
temas, asi que convertirlos no puede cambiar un pixel ni en claro ni en oscuro.

Los 12 tokens que el modo oscuro **si** redefine (y que por lo tanto siguen
prohibidos): `--white`, `--off`, `--mgray`, `--border`, `--shadow`,
`--shadow-lg`, `--blue-lt`, `--navy`, `--green-lt`, `--amber-lt`, `--red-lt`,
`--wa-lt`.

**95 hex convertidos.** Los 7 tokens introducidos son `--amber`, `--blue`,
`--blue-dark`, `--border-lt`, `--gray-lt`, `--green` y `--red`, y **ninguno de
los 7 esta en esa lista** - comprobado por script contra el diff, no de
memoria.

| Archivo | Antes | Ahora |
|---|---|---|
| `css/admin.css` | 238 | **190** |
| `js/admin.js` | 163 | **147** |
| `css/mechanic.css` | 36 | **31** |
| `js/mechanic.js` | 68 | **55** |
| `admin.html` | 17 | **10** |
| `mechanic.html` | 12 | **8** |

**HALLAZGO - el hex de 8 digitos lleva alfa y no hay token que lo tenga.**
La primera version del conversor reescribio `#1E40AF15` (la receta
`[color]15` del skill `drbike-design`: color + 8% de opacidad) como
`var(--blue-dark)`, **volviendo opaco un badge translucido**. Lo agarro la
asercion de identidad de valor, no la lectura del diff. Regla: **3 o 6
digitos, nunca 8.**

Lo que queda en esos archivos (190 + 147 + ...) **si** es decision una por
una: son `#fff` y los valores propios del tema oscuro.

#### Los dos ultimos colores, nombrados 2026-08-09

Quedaban `#93c5fd` (7 usos) y `#fcd34d` (3) sin token porque ningun nombre
convencia. Mirando **donde se usan** salieron solos:

- **`--blue-pale` `#93c5fd`** - el texto de las etiquetas sobre navy
  (`OUR TEAM` en `landing.html:363`), y el `border-color` de los estados de
  foco de `css/landing.css:518,550,581`. Es un escalon **mas claro** que
  `--blue-soft`, y mas oscuro que `--blue-edge`.
- **`--amber-edge` `#fcd34d`** - siempre es el **borde** de algo que pide
  atencion: la caja de "vencido" del SPA, el borde punteado de la gift card,
  el borde del aviso en el email. Sigue la convencion de `--red-edge` y
  `--blue-edge`.

8 de las 10 apariciones pasaron a `var()`. Las otras 2 quedan fuera por las
reglas de siempre: una es `--an-ord-4: #93c5fd`, una **definicion** de custom
property, y la otra vive en `api/send-email.js`, donde `var()` no existe.

Si los nombres no gustan, cambiarlos es **una linea** en `css/variables.css`
mas un buscar-y-reemplazar: el valor no se toca.

#### Emails HECHO 2026-08-09: el hex coincide con el token

El PR aparte que Diego pidio para los emails resulto **mucho mas chico de lo
que decia este documento** (357 hex), porque el azul retirado y el grupo A ya
habian pasado por ahi. Al medirlo quedaban **385 hex que ya coincidian** con un
token y solo **56 que no**.

En un email `var()` no existe: Gmail y Outlook descartan las custom properties.
Lo unico posible es que el **valor** coincida. **53 lo hacen ahora**:

`#f7f8fa` y `#f5f5f7` -> `--surface`, `#f0f0f0` -> `--border-lt`, `#eee` y
`#d1d1d6` -> `--border`, `#6e6e73` y `#666666` -> `--gray`, `#1d1d1f` ->
`--navy`, `#6d28d9` -> `--purple`, `#c7d9f8` -> `--blue-edge`, `#fef3c7` ->
`--amber-tint`.

**7 quedan a proposito**, porque ningun token les queda bien: `#d1d5db` (4,
texto gris claro sobre la cabecera azul - los grises del sistema son mas claros
que `--gray-lt`) y `#fcd34d` (3, el dorado de una estrella y de un borde
punteado, que no tiene token).

**`api/send-cron.js` y `api/auth.js` entran al presupuesto** (49 y 39). Estaban
fuera, y por eso `auth.js` se quedo con 3 apariciones del azul retirado
mientras todo lo demas ya estaba limpio. Ese agujero esta cerrado.

**Lo que NO se verifico: no se mando ni un email de prueba.** El cambio esta en
el HTML que arma Resend y en el PDF que arma PDFKit (`#f7f8fa` son 24
`doc.rect().fill()` de la factura, no HTML). Nadie miro una bandeja de entrada.

#### Grupo A HECHO 2026-08-09: los restos de las paletas muertas, mapeados

Los 7 valores que quedaban de los `:root` que ya no existen. **870
apariciones** en todo el repo, no solo en las 5 superficies: 542 pasan a
`var(--token)` donde el navegador parsea CSS, y **328 al valor del token** en
los emails, el generador de suburbios y los atributos de SVG, donde `var()` no
resuelve nunca.

| Antes | Ahora | Cuantos | Contraste sobre blanco |
|---|---|---|---|
| `#6b7280` | `--gray` `#475569` | 417 | **4.83 -> 7.58:1** |
| `#e5e7eb` | `--border` `#e2e8f0` | 190 | borde, no aplica |
| `#059669` | `--green` `#15803d` | 177 | **3.77 -> 5.02:1** |
| `#374151` | `--gray` `#475569` | 37 | 10.31 -> 7.58:1 |
| `#9ca3af` | `--gray-lt` `#94a3b8` | 34 | 2.54 -> 2.56:1 |
| `#f3f4f6` | `--border-lt` `#f1f5f9` | 20 | fondo, no aplica |
| `#111827` | `--navy` `#0d1f3c` | 6 | 17.74 -> 16.43:1 |

**Dos bajan y hay que decirlo:** `#374151` pierde contraste (10.31 -> 7.58) y
`#111827` tambien (17.74 -> 16.43). Los dos siguen muy por encima de AA, y el
punto es que ahora **hay un solo gris y un solo navy**, no tres parecidos.

El verde es el cambio mas visible: `#059669` era esmeralda y `--green` es mas
oscuro. De paso pasa AA sobre `--green-lt` (3.60 -> 4.79:1).

**Todas las paginas afectadas cargan `css/variables.css`** - se comprobo con
`grep -L` sobre las 60 de suburbio, `business.html`, `bike-check.html`,
`cycling-map.html` y el blog: ninguna se quedo sin la hoja de tokens, que es lo
que hubiera hecho desaparecer el color.

#### Grupo B HECHO 2026-08-09: 16 colores reales pasan a token

**Los 128 valores fuera de token no eran todos lo mismo.** Unos son restos de
las paletas muertas (grupo A: `#6b7280`, `#e5e7eb`, `#059669`, `#111827`,
`#374151`, `#9ca3af`, `#f3f4f6`); esos hay que **mapearlos** al token, y cambia
pixeles. Otros son **colores reales que la paleta nunca nombro**, y esos solo
necesitan un nombre. Diego eligio nombrarlos (2026-08-09).

Los 16 nuevos en `css/variables.css`: `--purple` / `--purple-lt`,
`--blue-soft`, `--blue-edge`, `--blue-deep`, `--blue-tint`, `--amber-bright`,
`--amber-ink`, `--amber-tint`, `--red-bright`, `--red-edge`, `--green-bright`,
`--green-ink`, `--green-tint`, `--slate`, `--cyan`.

**No se colapsan contra los tokens de arriba, a proposito.** `--amber-bright`
es el ambar de una estrella de rating, que tiene que leerse mas brillante que
el `--amber` de un aviso; `--green-bright` es el verde de "va en camino", no el
de "terminado".

**117 hex** pasaron a `var(--token)`. **Verificado que ninguno cambia un
pixel**, y no de palabra: un script releyo **el diff real** (no la intencion),
expandio cada `var()` de los dos lados contra el valor que tiene en
`variables.css` y comparo las lineas. **114 lineas resuelven exactamente al
valor viejo, 0 diferencias.** Las 3 restantes son la insercion de los tokens.

**Lo que NO se convirtio, y por que.** 82 apariciones se dejaron quietas: son
hex dentro de strings de JavaScript que no se puede probar que terminen en un
contexto CSS (`pending: '#F59E0B'` en un mapa de estados), atributos de
presentacion de SVG (`fill="#..."`, que **no** acepta `var()`) y definiciones
de custom property. Si se convirtieron las 10 lineas donde **el propio codigo
ya demuestra** que el valor llega a CSS, porque una entrada hermana del mismo
literal ya decia `var(--blue)`.

#### El guardrail HECHO 2026-08-09: `scripts/color-check.mjs`

Hasta hoy nada impedia que entrara un hex nuevo. Los pasos 1 a 3 movieron ~900
hex a tokens y el repo podia volver a ensuciarse el lunes siguiente sin que
nadie se enterara, exactamente como paso la primera vez: un hex por linea, cada
uno razonable por si solo.

**Es un trinquete, no una puerta.** No exige cero hex, porque cero hex es
imposible hoy: quedan **1138** en las 5 superficies y la mayoria **no se puede
convertir** (los dos hallazgos de arriba: un hex que es el VALOR de una custom
property nunca se toca, y en las apps de staff con tema oscuro `#fff` y
`var(--white)` son colores distintos de verdad). Un check que pidiera cero se
hubiera desactivado en una semana.

En vez de eso cada archivo tiene un **presupuesto igual a lo que tiene hoy**:

| Archivo | Presupuesto | Archivo | Presupuesto |
|---|---|---|---|
| `index.html` | 20 | `css/admin.css` | 257 |
| `landing.html` | 118 | `css/mechanic.css` | 39 |
| `track.html` | 3 | `js/app.js` | 106 |
| `admin.html` | 28 | `js/admin.js` | 185 |
| `mechanic.html` | 12 | `js/mechanic.js` | 76 |
| `css/variables.css` | **0** | `js/components.js` | 28 |
| `css/main.css` | 3 | `js/stripe.js` | 5 |
| `css/home.css` | 3 | `api/send-email.js` | 250 |
| `css/landing.css` | 4 | `api/send-invoice.js` | 107 |

Agregar un hex **rompe el build**. Sacar uno **tambien lo rompe**, con el
mensaje de bajar el numero. Eso es a proposito: es lo unico que evita que el
presupuesto se convierta en un techo que nadie toca. `css/variables.css` esta
en 0 porque ahi los hex **son** las definiciones de los tokens, y el script las
excluye por regla, no por presupuesto.

**Ademas, dos reglas duras que no dependen del presupuesto:**

- `#1848c8`, el azul retirado, **falla siempre y en todo el repo**, no solo en
  los archivos con presupuesto: el barrido lee todo `.html/.css/.js/.mjs/.json`
  fuera de `node_modules` y `docs/`. Tenia que ser asi porque habia llegado a
  73 archivos, incluidos los emails y las 60 paginas de suburbio, y un
  presupuesto por archivo no lo hubiera alcanzado.
- Excepciones que **nunca** cuentan, y por que:
  `--nombre: #hex` (es una definicion, convertirla es la auto-referencia del
  HALLAZGO 1), `<meta name="theme-color">` (no acepta `var()`), los cuatro
  colores de Google, el azul de Facebook y el verde de WhatsApp (son marcas
  ajenas), y `#fff` dentro de las 6 fuentes de admin/mechanic (HALLAZGO 2).

**Tres cosas que parecen hex y no lo son**, cada una salio como falso positivo
mientras se escribia el script: `&#215;` y `&#10003;` (entidades HTML),
`#add-card-btn` (un selector de id que empieza con letras hex) y
`href="#pricing"` (un ancla). Los comentarios tambien se descartan: el propio
`track.html:13` es un comentario que **explica** que ahi vivia `#1848C8`.

**Verificado, no supuesto:** `npm run check` da 5/5 en verde, `npx vitest run`
160/160, y se probo que falla de verdad metiendo un `#123456` en
`css/main.css` (dio "4 hand-written hex, budget is 3") y un `#1848C8` (dio la
regla dura del azul retirado). Ambas pruebas se revirtieron.

**Lo que el guardrail NO cubre, dicho sin adornos:** las ~60 paginas de
suburbio y las 5 del blog (54 hex cada una) no estan en la tabla. Se generan
con `scripts/generate-suburb-pages.mjs`, asi que el lugar donde hay que
atajarlas es el generador, y eso va con el PR de emails y paginas.

### 12.15 "No jobs today" es literalmente ilegible: contraste 1.03:1

> **CERRADO 2026-08-02 (PR #137, en produccion).** `.jobs-wrap` y
> `.profile-wrap` usan `var(--off)`. Medido en Chromium: **1.03:1 -> 13.36:1**,
> y el subtitulo 2.58:1 -> 5.33:1. Confirmado en produccion: el fondo llega
> como `rgb(26,39,64)`.

**Sintoma.** El titulo del estado vacio del mecanico se dibuja casi blanco sobre
casi blanco. En la captura no se lee; el subtitulo, que deberia pesar menos, es lo
unico visible. Jerarquia invertida y texto perdido a la vez.

**Donde.** `css/mechanic.css:332` - `.jobs-wrap { background: #f4f6f9; }`, un hex
crudo. El tema oscuro (`css/mechanic.css:2-14`) solo puede redefinir **tokens**,
nunca un hex escrito a mano, asi que el fondo se queda claro mientras `--navy`
pasa a `#f2f2f7` (casi blanco). Mismo defecto en `css/mechanic.css:478`
(`.profile-wrap`), o sea la pestaña Profile tiene el mismo problema.

**Evidencia. VERIFICADO EN NAVEGADOR, MEDIDO.**
`rgb(242,242,247)` sobre `rgb(244,246,249)` = **1.03:1** (WCAG AA pide 4.5:1).
El subtitulo esta a 2.58:1, tambien por debajo. Captura:
`scratchpad/mech/empty-cache-after-failure.png`.

Es la consecuencia visible de 12.14 y explica los `!important` de
`css/mechanic.css:15-36`: estan parcheando hex hardcodeados selector por selector
en lugar de usar tokens.

**Nota sobre otra medicion:** mi sonda tambien marco "AR" y el badge "Confirmed"
a 1.00:1, pero eso es **falso positivo mio** - compara contra un fondo `rgba(...)`
translucido sin componerlo. Ese es el patron de badge que pide el propio skill.
No es un hallazgo.

Si un hallazgo real: el boton **"Accept"** queda a **3.77:1** (blanco sobre
`#059669`) con letra de 13px - por debajo de AA. Y `#059669` es, otra vez, verde
fuera de token (12.14).

### 12.16 Targets tactiles chicos y listas que pueden crecer sin scroll

> **SPA CERRADA 2026-08-03.** El PR #160 subio diez targets
> (`.footer-link`, `.footer-social`, los contactos del footer, el boton de auth
> movil, los tres `.btn-learn-more`, y en mechanic el toggle de tema y
> `#status-btn`). Los que quedaban se midieron de nuevo a 390px y resultaron
> ser **cinco componentes, no ocho elementos sueltos**: `.header-back` (36px),
> `.cat-chip` (32px x9), `.password-toggle` (26px), `.link-btn` (20.8px) y
> `.tab-btn` (36.8px x2). Los cinco estan a 44px.
>
> **Los "5 desbordes horizontales" NO EXISTEN.** Son un artefacto de medicion.
> `.screen.active` lleva `animation: slideInRight`, cuyo primer keyframe es
> `translateX(100%)`. Si se mide antes de que la animacion termine - o en un
> documento oculto, donde no corre nunca - la pantalla entera aparece corrida
> exactamente un viewport a la derecha, y todo lo que hay dentro "desborda".
> Eso explica el `754px` del texto de abajo: 390 de offset + 364 de posicion
> real. Neutralizando la animacion, las seis pantallas alcanzables asientan en
> `left: 0` con `scrollWidth` 390 contra un viewport de 390: **cero desbordes**.
>
> **Sigue abierto:** las 11 tablas del admin sin contenedor de scroll. No se
> pudieron medir - `admin.html` autentica contra `/api/auth`, que no existe en
> un servidor estatico local. Y `profile` / `my-bikes` de la SPA redirigen a
> login sin sesion, asi que sus pantallas propias tampoco se midieron.
>
> **CERRADO 2026-08-16.** Recorriendo `admin.html` completo aparecieron 13,
> no 11 - las 5 nombradas arriba mas Finance transactions, Contacts, Claims,
> Newsletter, Notification numbers, Inventory, Services y Membership. Las 13
> tienen `overflow-y:auto` + `max-height:480px` ahora (`.tbl-scroll` para las
> 6 que son `<table>`, directo en las 7 que son listas). Misma limitacion que
> antes: no se pudo medir con datos reales por la autenticacion de
> `/api/auth` - se verifico que `getComputedStyle()` aplica los valores
> correctos en un preview local, no el scroll en si con filas de verdad.
> El detalle de abajo es la medicion original del 01-ago.

**SPA a 390px - VERIFICADO EN NAVEGADOR, medido con `getBoundingClientRect()`:**
**18 elementos interactivos por debajo de 44px** de alto. Los peores:
`.footer-link` a **21px** (unos 8), `#spa-lang-toggle` a 36px,
`#home-mobile-auth-btn` a 37px, `.btn-learn-more` a 33px (x3), `.footer-social` a
34px. Ademas **5 elementos se desbordan horizontalmente**, uno llega a 754px de
borde derecho contra un viewport de 390px.

**mechanic a 390px:** mucho mas limpio. Solo 2 por debajo de 44px
(`#status-btn` 30px, `#theme-btn-mech` 34px) y `.nav-tab` pasa. La tira de 7
pestañas mide 583px contra 412px de viewport, pero **tiene `overflow-x:auto`**, o
sea scrollea. Lo que no tiene es ninguna señal visual de que hay mas pestañas: en
la captura se cortan justo despues de "PROFILE", y "Stock" y "Spare Parts" quedan
fuera de vista. **Sospecha, no verificado con un mecanico real:** que esas dos
pestañas practicamente no se usen porque no se ven.

**admin a 1440px:** cero desbordes horizontales. Pero **11 tablas y listas sin
contenedor de scroll propio** (`overflow-y: visible` y sin ancestro que scrollee):
`.tbl`, `#dash-today-tbody`, `#dash-schedule-list`, `#route-list`,
`#mech-profile-list` y 6 mas. Es el punto **5.1** (falta paginacion) visto desde
el lado del diseño: hoy entra porque hay pocas filas.

### 12.17 Handlers inline que quedan — corrige el conteo del punto 3.3

> **CERRADO 2026-08-03 (PR #160, mergeado).** Los 26 salieron. La tabla de
> abajo es el inventario original y ya no describe el codigo actual.

Con lineas exactas, para que se puedan sacar de una:

| Archivo | Lineas |
|---|---|
| `admin.html` (12) | 303, 311, 322, 390, 526, 532, 1072, 1104, 1145, 1151, 1217, 1275 |
| `js/admin.js` (6) | 1655, 1658, 1884, 1895, 4129, 4141 |
| `js/mechanic.js` (6) | 1277, 1287, 1294, 1391, 2757, 2759 |
| `mechanic.html` (2) | 163, 215 |

**La SPA esta limpia: 0 handlers inline** en `index.html`, `js/app.js` y
`js/components.js`. Eso confirma la tabla del 3.3, que no las listaba.

**Una correccion al 3.3:** dice "los `onclick` ya se eliminaron todos". Queda uno
en `js/admin.js:1119` (`onclick="window.print()"`). No es un hallazgo nuevo -
vive dentro del popup generado con `document.write()` que la **seccion 6** ya
acepta como tradeoff, fuera de la superficie de CSP de `admin.html` - pero la
frase del 3.3, tal como esta escrita, es falsa si alguien la greppea.

### 12.18 `confirm()` y `alert()` nativos fuera del panel de la landing

El punto **10.2** reporta esto solo para el panel de cuenta de `landing.html`.
Tambien esta en las otras superficies:

- `js/app.js:4120` (cancelar membresia) y `js/app.js:4393` ("Delete this bike?").
  Las dos son destructivas **y** estan en ingles sin traducir (12.10).
- `js/mechanic.js:423` (`confirm('Sign out?')`) y `js/mechanic.js:2478`
  (`alert()` avisando que se encontraron items criticos y se mando un mail).

**VERIFICADO EN CODIGO.**

### 12.19 Codigo muerto

- **`js/app.js:45`** importa `subscribeToMechanicLocation` y **no la llama nunca**.
  Grep en todo el repo: solo aparece en su definicion (`js/supabase.js:139`), en
  ese import, y en una nota de `CONTEXT.md:109` que la da por usada.
- Eso mantiene viva **`js/supabase.js:139-186`**, una funcion de 48 lineas que
  **simula el GPS del mecanico**: mueve un punto falso hacia el centro de Sydney
  (-33.8688, 151.2093) cada 3 segundos hasta que llegue una posicion real. Hoy no
  se ejecuta, pero es una trampa cargada: el dia que alguien la vuelva a
  enchufar, un cliente que paga ve a su mecanico acercandose sin que se haya
  movido nadie. Es de la misma familia que `MOCK_BOOKINGS`, y sobrevivio a la
  limpieza del 28-jul (punto 10.3).

**VERIFICADO EN CODIGO (grep en todo el repo).**

### 12.20 Lo que se reviso y quedo limpio

Para que "no hay hallazgo" se distinga de "no lo mire":

- **SPA:** entrar directo a `#payment` sin reserva empezada redirige bien a
  `#book-service`. La pantalla de tracking sin sesion muestra un estado vacio
  correcto, no datos inventados. 0 handlers inline. `chargeOnce()` **si** evita el
  doble cobro dentro de una misma visita (el agujero es salir y volver, 12.2).
- **mechanic:** el tema oscuro no tiene ningun texto del mismo color que su fondo
  (fuera del caso de 12.15). Las cards de trabajo cumplen la jerarquia del skill
  (titulo 16px/800 a 14.59:1, meta 12px/400 a 5.82:1, precio destacado a 7.33:1).
  La cola offline corta bien en el primer fallo, no reintenta 4xx eternamente y no
  finge las notificaciones al cliente.
- **admin:** cero desbordes horizontales a 1440px. Los borrados de codigos de
  descuento, contactos, repuestos, servicios y numeros de notificacion **si**
  piden confirmacion. El calculo del GST (`/11` sobre un total con IVA incluido)
  es correcto.
- **Transversal:** `npm run i18n:check` corre verde; el problema no es que falle,
  es lo que no mira (12.9).

### 12.21 Lo que esta auditoria NO cubrio

- **`track.html`** - quinta superficie, sin auditar. Es lo unico que falta para
  cerrar el punto 3.1.
- **El navegador nunca ejecuto un cobro.** 12.2 y 12.3 estan probados por codigo
  y, en el caso de 12.2, por el re-render medido en vivo; **la secuencia completa
  de doble cobro con una tarjeta real no se ejecuto** y no deberia ejecutarse sin
  decidirlo a proposito.
- **Ninguna prueba corrio contra la base de produccion salvo un `SELECT` publico**
  a `services`. No se creo ni modifico ninguna fila.
- **`admin.html` y `js/admin.js` estaban siendo editados por otra sesion** (la
  seccion de analitica del punto 11.3) mientras esto se escribia. Los numeros de
  linea del admin son contra `origin/main` en `5dc95d8`.
Mismo problema en pausar/cancelar membresia, que usan `confirm()` + `alert()`.

---

## 13. Auditoria de `track.html` (2026-08-03)

La quinta superficie, la unica que nunca se habia mirado. Con esto queda
cubierto el punto **3.1**: landing (seccion 8), SPA movil + mechanic + admin
(seccion 12) y ahora track.

**Que es esta pagina.** El link publico que recibe un cliente para seguir su
reserva. No pide login: el token de la URL **es** la credencial. Muestra la
direccion del cliente, el precio, el nombre y la foto del mecanico, y su
posicion en vivo en un mapa.

**Como se verifico.** Chromium a 390px contra `origin/main` en `beeea7b`, con el
repo servido en local. La pagina tiene tres estados y se midieron dos:
el formulario de email (sin token) y la vista de reserva con `status: enroute`,
renderizada **interceptando `fetch` con una reserva falsa** - el DOM y el CSS son
reales, los datos no. No hay captura de pantalla: el panel del navegador estaba
cerrado, asi que nada de esto es una afirmacion sobre pixeles.

**Lo bueno, para que no se pierda:** cero handlers inline (la unica superficie
junto con la SPA), todo lo que se escribe en el DOM pasa por `escHtml()`, no
carga el SDK de Supabase ni la anon key, y las cadenas estaticas estan completas
en es y zh.

Orden: primero lo que expone datos, despues lo que le miente a una persona, y lo
cosmetico al final.

### Estado — 2026-08-03, mismo dia que la auditoria

**CERRADOS: 8 de 10.** 13.2-13.4 y 13.6-13.8 en `fix/track-findings`; **13.1 y
13.10 en `fix/address-privacy`**, que ademas necesita que Diego corra
`scripts/add-address-coordinates.sql`. Verificados en Chromium a 390px contra
la rama, no solo escritos:

| # | Que era | Como se comprobo |
|---|---|---|
| 13.2 | "No encontramos la reserva" cuando fallaba la red | Con `fetch` rechazando: ahora dice que no se pudo conectar, y ofrece reintentar |
| 13.3 | 6 targets bajo 44px | Los 6 miden 44 en los dos estados |
| 13.4 | `Van 1 · Mechanic 1` en ingles | Renderiza `Camioneta / 1 · Diego Peredo` |
| 13.6 | Leaflet sin SRI | `integrity` + `crossorigin`; Leaflet 1.9.4 sigue cargando |
| 13.7 | El poll no paraba nunca | Pollers registrados: enroute 1, pending 1, **completed 0, cancelled 0** |
| 13.8 | El poll moria en silencio | 4 fallos seguidos cortan el intervalo y lo dicen en pantalla |

**13.1 — CERRADO 2026-08-03, y ninguna de las dos opciones que se plantearon.**

Diego decidio que el ETA se queda. Las dos salidas que se le habian ofrecido
(proxy propio, o sacar el ETA) eran las dos malas. La tercera es mejor que las
dos: **guardar las coordenadas cuando se crea la reserva.**

El servidor ya conoce la direccion en ese momento, asi que la traduce una sola
vez y la guarda en `bookings.address_lat/address_lng`. La pagina de seguimiento
sale con los numeros puestos y no le pregunta a nadie donde queda nada.

- El cliente ve el mismo ETA de siempre
- La direccion escrita **deja de salir del navegador**
- Al servicio de ruta solo le llegan dos pares de coordenadas
- Sin coordenadas (reservas viejas) **no hay ETA, y no hay fallback**: volver a
  geocodificar en el navegador *es* la fuga que esto elimino

**Necesita que Diego corra `scripts/add-address-coordinates.sql`.** Hasta que lo
haga: las reservas nuevas se crean normal y sin coordenadas, y el seguimiento
funciona sin ETA. Nada se rompe, el codigo tolera que las columnas no existan.

**ABIERTO, ya sin decision de por medio:**

- **13.5** — la tercera paleta. **La decision se tomo el 2026-08-03: gana
  `css/variables.css`, `--blue` = `#2563eb`.** `track.html` tiene que dejar de
  declarar su propio `:root` y cargar el archivo de tokens; hoy sigue trayendo
  el `#1848C8` retirado, tambien en `<meta name="theme-color">`. Detalle y orden
  de trabajo en el punto **12.14**.

**ABIERTO, sin decision:**

- **13.9** — el contraste al limite (4.83:1). Pasa AA; subirlo es cambiar
  `--mgray`, que es parte de 13.5.
- **13.10 — REVISADO 2026-08-03. No habia fuga, pero si un objeto de debug.**
  Se leyo `api/auth.js:handlePublicTrack` entero. Devolvia la fila completa de
  la reserva mas `_dbg: { van, mechId, active }`, un ayudante de depuracion que
  llego a produccion y viajaba en cada poll de 15 segundos con el UUID interno
  del mecanico. **Eliminado.**

  Lo demas se reviso y se queda, con motivo:
  - `arrival_pin` es correcto que se devuelva: la SPA se lo muestra al cliente
    (`js/app.js:2339`) y el mecanico se lo pide al llegar. El cliente es
    justamente quien tiene que tenerlo.
  - Las reseñas de otros clientes pasan por `shortClientName()`, que es lo que
    se publica a proposito.
  - `mechanic_id` y `tracking_token` **los usa la SPA** (`js/app.js:2270` y
    `:3464`). La idea original de "devolver solo lo que usa la pagina" era mas
    corta de lo debido: `track.html` no es el unico consumidor.

### 13.1 La direccion del cliente se le manda a dos servidores de terceros

**VERIFICADO EN NAVEGADOR**, leido del log de red, no del codigo:

```
https://nominatim.openstreetmap.org/search?q=12%20Test%20Street%2C%20Bondi%20NSW%202026&format=json&limit=1
```

`track.html:221` geocodifica la direccion del cliente contra Nominatim, y
`:256` le manda a `router.project-osrm.org` **las coordenadas de la casa del
cliente y la posicion en vivo del mecanico** para calcular el ETA. Los dos son
servicios publicos gratuitos operados por terceros, y en los dos el dato viaja
en el **query string**, que es lo que todo servidor loguea por defecto.

Nadie le dijo al cliente que su direccion sale de nuestra infraestructura. No
hay proxy propio, no hay consentimiento, y la politica de uso de Nominatim
pide identificarse y limitar el volumen.

**Impacto: DATOS PERSONALES.** Es el hallazgo mas serio de esta pagina.

### 13.2 Si falla la red, al cliente se le dice que su reserva no existe

**VERIFICADO EN NAVEGADOR** forzando `fetch` a rechazar: la pagina muestra
*"No encontramos la reserva."*

`track.html:108` es un `catch {}` vacio - lo que CLAUDE.md prohibe
explicitamente. Un fallo de red y un token invalido terminan en la misma rama,
asi que un cliente con un link perfectamente valido, en el subte o con mala
señal, lee que su reserva no existe. Es la misma clase de bug que **12.7** (el
mecanico veia "No jobs today" cuando fallaba la carga).

### 13.3 Seis targets bajo 44px, incluidos los dos botones de contacto

**VERIFICADO EN NAVEGADOR**, medido a 390px:

| Elemento | Alto | Donde |
|---|---|---|
| `#track-email` | 41.3px | formulario de busqueda por email |
| `#track-email-btn` | 40.7px | formulario de busqueda por email |
| Llamar / WhatsApp | 39.3px (x2) | tarjeta del mecanico |
| Llamar / WhatsApp | 42.7px (x2) | tarjeta de contacto del pie |

Los dos primeros son **lo unico interactivo de la pagina** para alguien que
perdio su link. Los otros cuatro son los botones que aprieta un cliente que
esta esperando al mecanico. Es el mismo criterio de **12.16**, que ya se cerro
en la SPA.

### 13.4 `Van 1 · Mechanic 1` queda en ingles

**VERIFICADO EN NAVEGADOR**: renderizado con la pagina en español, entre
"Camioneta" y "Precio del servicio", se lee `Van 1 · Mechanic 1`.

`track.html:156` construye la cadena por interpolacion
(`Van ${n} · Mechanic ${n}`), asi que nunca coincide con una clave del
diccionario y **`scripts/i18n-check.mjs` no lo puede ver**. Misma clase que
12.9 y 12.10: el check en verde y texto sin traducir en pantalla.

Aparte, dice "Mechanic 1" con un numero cuando la tarjeta de abajo muestra el
nombre real del mecanico.

### 13.5 La tercera paleta, y el azul retirado

> **CERRADO 2026-08-09 (`fix/track-loads-the-tokens`).** `track.html` carga
> `css/variables.css` y ya no abre su propio `:root`. Los 12 valores propios
> desaparecieron; los dos nombres que el token file no definia (`--bg`,
> `--card-bg`) pasaron a `--surface` y `--white`. El `theme-color` es `#2563eb`,
> y **`scripts/icons-check.mjs` ahora falla si vuelve el `#1848C8`** en un
> `theme-color` de cualquier pagina - la ventana por la que habia entrado.
> Quedan tres paletas menos una: falta `css/landing.css:2` (paso 2 de 12.14).
>
> **Diferencias medidas en navegador**, antes y despues (variables computadas):
>
> | | Antes | Despues |
> |---|---|---|
> | fondo de pagina | `#F7F8FA` | `#f8fafc` |
> | bordes (`.top`, `.card`) | `#E5E7EB` | `#e2e8f0` |
> | etiquetas y errores | `#6B7280` | `#475569` |
> | chip Confirmed | `#1848C8` sobre `#EEF3FC` | `#2563eb` sobre `#eff6ff` |
> | chip En route / Completed | `#059669` sobre `#ECFDF5` | `#16a34a` sobre `#f0fdf4` |
> | chip Pending | `#D97706` sobre `#FEF3C7` | igual sobre `#fffbeb` |
> | navy, rojo, ambar, blanco | sin cambio | sin cambio |
>
> **HALLAZGO que sale de la medicion, y no lo arregla este PR:** el contraste
> de las etiquetas mejora mucho (**4.83:1 -> 7.58:1**), pero los chips de estado
> **ya fallaban WCAG AA antes y siguen fallando**, y uno empeora:
> En route **3.58 -> 3.15**, Pending **2.86 -> 3.07**, Confirmed **6.74 -> 4.75**.
> Son 12px en negrita, o sea texto normal para WCAG: piden 4.5:1. El verde y el
> ambar del token file tienen menos contraste sobre su propio `-lt` que los que
> `track.html` habia inventado. **Es un problema de la paleta ganadora, no de
> `track.html`**, y afecta a cualquier chip de las 5 superficies. Ver 13.11.

**VERIFICADO EN NAVEGADOR** leyendo las variables computadas:

| Token en track.html | Valor | Valor en `css/variables.css` |
|---|---|---|
| `--blue` | `#1848C8` | `#2563eb` |
| `--green` | `#059669` | `#16a34a` |
| `--mgray` / `--gray` | `#6B7280` | `#475569` |
| `--border` | `#E5E7EB` | `#e2e8f0` |

`track.html` **no carga `css/variables.css`**: abre su propio `:root` con 12
valores propios. Es literalmente la tercera paleta del punto **12.14**, y la
fuente de la que salieron los valores equivocados que el skill `drbike-design`
documento como correctos hasta el 02-ago.

Ademas `<meta name="theme-color" content="#1848C8">`: el azul que
`scripts/icons-check.mjs` bloquea explicitamente si vuelve a un asset de marca.
El check no mira `theme-color`, asi que entro por la ventana.

### 13.6 Leaflet viene de un CDN sin SRI

**VERIFICADO EN CODIGO.** `track.html:13-14` carga CSS y JS de
`cdn.jsdelivr.net/npm/leaflet@1.9.4` sin atributo `integrity` y sin
`crossorigin`.

Un CDN comprometido ejecuta JavaScript arbitrario en la unica pagina de la app
que muestra la direccion de un cliente y la posicion en vivo de un mecanico, sin
que nada lo detecte. El arreglo es un `integrity="sha384-..."`, o servir Leaflet
desde el propio dominio.

### 13.7 El poll de 15 segundos no se detiene nunca

**VERIFICADO EN CODIGO.** El `setInterval` de `track.html:271` esta fuera del
`if` de estado, asi que corre para **cualquier** reserva - incluida una
`completed`, donde no hay nada que actualizar - y nunca se limpia. Una pestaña
olvidada abierta en un celular pega a `/api/auth` cada 15 segundos
indefinidamente.

### 13.8 El segundo `catch {}` puede dejar la pagina muerta en silencio

**VERIFICADO EN CODIGO.** `track.html:286` se traga cualquier fallo del poll. La
tarjeta verde sigue diciendo *"This page updates automatically"* mientras la
pagina ya no se actualiza. Nadie se entera: ni el cliente ni nosotros.

### 13.9 Contraste al limite

**VERIFICADO EN NAVEGADOR**, medido: el gris `--mgray` sobre blanco da
**4.83:1**. Pasa AA (4.5) pero por poco, y se usa tambien en las etiquetas de
**10px** en mayuscula de la fila de estadisticas del mecanico
("Rating" / "Jobs done" / "Location"). No es un fallo como el 1.03:1 de 12.15,
pero es el texto mas chico de la app en el limite del minimo.

### 13.10 Lo que esta auditoria NO cubrio

- **La respuesta real de `/api/auth` con `role: 'public-track'`.** Se
  intercepto `fetch` con una reserva falsa porque no habia un token vivo a mano.
  Que campos devuelve de verdad el servidor, y si manda de mas, **no se
  verifico**. Es lo primero que deberia mirar quien retome esto.
- **El estado `completed`** y el estado de link invalido (`?id=` suelto) no se
  renderizaron.
- **El mapa de Leaflet** no se pudo evaluar visualmente: el panel del navegador
  estaba cerrado y no compone frames. **Diego lo probo en produccion el
  2026-08-09 y funciona.** Lo que sigue sin poder medirse en local son los
  *colores* de esa pantalla, que necesitan una reserva viva.

### 13.11 Los chips de estado no pasan WCAG AA, y la paleta ganadora los empeora

> **CERRADO 2026-08-09. DECIDIDO POR DIEGO: se oscurecen los tres.**
>
> | Token | Antes | Ahora | Sobre su `-lt` | Blanco encima |
> |---|---|---|---|---|
> | `--green` | `#16a34a` | **`#15803d`** | 3.15 -> **4.79:1** | 3.30 -> **5.02:1** |
> | `--amber` | `#d97706` | **`#b45309`** | 3.07 -> **4.84:1** | 3.19 -> **5.02:1** |
> | `--red` | `#dc2626` | **`#cf2020`** | 4.41 -> **4.95:1** | 4.83 -> **5.41:1** |
>
> **El rojo tambien fallaba y no estaba en este punto:** 4.41:1 contra el
> minimo de 4.5. Salio al medir los tres juntos, no de la auditoria.
>
> **No alcanzaba con cambiar los tokens.** `var(--green)` se usa 134 veces pero
> habia **178 hex escritos a mano** con el valor viejo en las 5 superficies y
> los emails. Oscurecer solo el token hubiera partido el color en dos: los
> chips nuevos y los viejos conviviendo. Se cambiaron los **311** juntos, en 82
> archivos (incluye las 60 paginas de suburbio y los 5 posts).
>
> `--gold` y `--orange`, que son alias de `--amber`, se movieron con el.
>
> **Los dos usos en modo oscuro mejoran, no empeoran:** `css/admin.css:429`
> (`.sb-badge`) y `css/mechanic.css:50` (`.abtn.primary.go`) son fondo con
> texto blanco, y el blanco encima sube de 4.83 y 3.19 a 5.41 y 5.02.
>
> **Lo que NO se verifico:** no se vio un chip renderizado. Los chips viven en
> `track.html` (necesita un `booking_id` real), en el admin y en el mecanico
> (necesitan sesion), y los 5 slots de dev server de la carpeta estaban
> ocupados por otros chats. Los contrastes son la formula de luminancia
> relativa de WCAG 2.1 calculada sobre los valores exactos - es aritmetica, no
> una estimacion, pero nadie miro la pantalla.


**Sale de medir 13.5, no de una auditoria.** Al pasar `track.html` a los tokens
se midio el contraste antes y despues, y aparecio algo que no es de
`track.html`: **el verde y el ambar de `css/variables.css` tienen menos
contraste sobre su propio `-lt` que los hex que `track.html` habia inventado.**

| Chip | Antes (paleta propia) | Despues (tokens) | WCAG AA |
|---|---|---|---|
| Pending `--amber` sobre `--amber-lt` | 2.86:1 | 3.07:1 | falla |
| En route / Completed `--green` sobre `--green-lt` | 3.58:1 | **3.15:1** | falla |
| Confirmed `--blue` sobre `--blue-lt` | 6.74:1 | 4.75:1 | pasa |

Son **12px en negrita**: para WCAG eso es texto normal (el umbral de "texto
grande" es 18.66px en negrita), asi que el minimo es **4.5:1**, no 3:1.

**No lo introdujo el paso 1 de 12.14** - Pending ya fallaba con 2.86:1 y nadie
lo habia medido. Pero el paso 3 va a extender esta combinacion a las 5
superficies, asi que conviene resolverlo **antes**, no despues: hoy los badges
de `admin.html`, `mechanic.html` y la SPA usan el mismo patron
`background: [color]-lt; color: [color]`.

**Arreglo probable:** oscurecer `--green` y `--amber` (o aclarar sus `-lt`) en
`css/variables.css` hasta 4.5:1, que es un cambio de **una linea por color** y
arregla las 5 superficies de una. **Es una decision de Diego**, porque cambia
el color de la marca en pantalla.

**Medido en navegador** (formula de luminancia relativa de WCAG 2.1) contra
`fix/track-loads-the-tokens`, no estimado.

---

## 14. Incidente 2026-08-05: se cobraba a quien no podia reservar

**No salio de una auditoria. Salio de una clienta real que pago y no recibio
nada**, y le escribio a Diego por WhatsApp porque fue lo unico que le quedo.

**Que paso.** Thais Rocha Guimaraes pago $20 con Apple Pay a las 13:29 del
05-ago (`pi_3U0vVzPPGSm5cT7J0SRAoVUW`, Stripe la marca como `Customer: Guest`).
No hubo reserva, ni email, ni WhatsApp a Diego. A las 13:30 lo intento de nuevo
y ese segundo pago quedo `Incomplete`. Diego lo devolvio el mismo dia.

**La causa, VERIFICADA EN CODIGO Y EN NAVEGADOR.** Dos mitades del sistema se
contradecian:

| Donde | Que decia |
|---|---|
| `js/app.js:1404` | `// Allow guest checkout - no login required` y a pagar |
| `js/app.js:1680` | `finalizeBooking()` tiraba error en su primera linea sin sesion |
| `api/auth.js:568` | `create-booking` responde 401 `Sign in required` sin token |

El corte real estaba en el **navegador**, no en el servidor: `finalizeBooking()`
cortaba antes de mandar la peticion, asi que la reserva no llegaba a intentarse.

**No era un fallo ocasional. Le pasaba al 100% de los visitantes sin cuenta.**

**Desde cuando.** Los dos cambios entraron el **mismo dia, con 83 minutos de
diferencia**, y nadie los cruzo:

- `7812310`, 04-jul 13:03 — endurecimiento de seguridad: el servidor exige sesion
- `345c573`, 04-jul 14:26 — el front habilita pagar sin cuenta

**Un mes exacto en produccion.** Cuantos pagos huerfanos hubo en ese mes no se
sabe: hay que cruzar los $20 de Stripe desde el 04-jul contra `bookings`. La
barrida del punto **12.3** lo hace automaticamente de ahora en adelante, pero
solo mira 48 horas hacia atras.

### 14.1 Lo que se arreglo

La sesion se comprueba **antes** de la tarjeta, no despues. Sin cuenta, el boton
de la pantalla de resumen manda a crear cuenta en vez de a pagar, guarda a donde
volver, y el borrador de la reserva sobrevive.

Esto **no quita nada que funcionara**: ninguna reserva de invitado se completo
jamas desde el 04-jul. Solo deja de cobrar por una puerta que no abre.

Verificado en navegador contra la rama:

- **Sin sesion:** el click va a `login`, **cero llamadas de red** - ni una a
  Stripe. El toast sale traducido.
- **Con sesion:** llega a `payment` como siempre.

### 14.2 Lo que queda abierto

- **El checkout de invitado de verdad** sigue sin existir. Es una feature, no un
  bug: hay que enseñarle al servidor a guardar una reserva sin `user_id`, con
  email y telefono, y decidir como esa persona sigue despues su reserva. Toca
  RLS. **Decision de Diego** si lo quiere.
- **Contar los huerfanos del mes** (04-jul a 05-ago) cruzando Stripe contra
  `bookings`, y devolverle a cada uno. **La herramienta ya existe desde el
  2026-08-10** (ver 14.9); falta que Diego la corra y decida cada devolucion.
- El mensaje de `finalizeBooking()` era `throw new Error('Please sign in...')`
  y **no estaba traducido**: el chequeo de i18n ignora los `throw new Error(...)`
  a proposito, asi que una clienta con el telefono en español lo veia en ingles.
  Ya esta en el diccionario, pero el hueco del chequeo sigue ahi.

  **CERRADO EN PARTE 2026-08-16.** `js/app.js` tiene 5 variantes de
  `throw new Error('Please sign in...')`, todas llegan a pantalla via
  `translateValue()`. 2 de las 5 ("Please sign in to send a message.",
  "Please sign in again.") no estaban en el diccionario - las mismas se
  agregaron a es/zh. **El hueco del chequeo sigue abierto a proposito:**
  `scripts/i18n-check.mjs` explica por que no lee `throw new Error(...)`
  (mezcla mensajes de usuario e internos, sin forma de distinguirlos por
  analisis estatico) - no se toco esa decision.

### 14.3 Ella no recibio NINGUN email, y no fue por el mismo motivo

Diego pregunto por que la clienta no recibio ni un correo. La respuesta es que
habia **cuatro** canales para hablarle y **los cuatro** asumian que tenia
cuenta, mientras la puerta de entrada dejaba pasar sin una.

| Canal | Por que no llego |
|---|---|
| Recibo de Stripe | `receipt_email` salia de `js/app.js:1844`, que sin sesion mandaba `guest@drbikesydney.com.au` — **un buzon del propio dominio de Diego**. El recibo le llego a el. |
| Confirmacion de reserva (Resend) | Se manda **despues** de que `create-booking` responde OK. Como la reserva nunca se creo, nunca se mando. |
| **Aviso de la devolucion** | Stripe lo manda al mismo `receipt_email`. **Diego le devolvio el dinero y ella no se entero.** |
| Recordatorio de checkout abandonado | `js/app.js:1607` solo registra en `checkout_attempts` `if (currentUser)`. Sin cuenta no hay fila, asi que el cron no tenia nada que encontrar. |

**VERIFICADO EN CODIGO.** La cadena del recibo es
`js/app.js:1844` -> `js/stripe.js:106` -> `api/create-payment-session.js:167`
(`receipt_email: email`).

**Lo que se arreglo.** El fallback murio: si no hay email de sesion, se corta con
un error en vez de inventar una direccion. Y el servidor ahora rechaza como
`receipt_email` cualquier cosa que no parezca un email **o que sea de nuestro
propio dominio** — el dominio entero, no solo `guest@`, para que la proxima
direccion inventada no pueda repetirlo. `isValidReceiptEmail()` esta exportada
y tiene 5 tests.

**Efecto secundario a tener en cuenta:** con esto, una reserva hecha con una
direccion `@drbikesydney.com.au` se rechaza. Se comprobo que no existe ninguna
cuenta de cliente asi; Diego usa su Gmail.

**Lo que NO se arreglo, y sigue abierto:**

- El recordatorio de checkout abandonado sigue siendo solo para gente con
  cuenta. Hoy no importa, porque sin cuenta ya no se llega a pagar. Volvera a
  importar el dia que exista el checkout de invitado de verdad (14.2).
- **Nadie le aviso a la clienta que le devolvieron el dinero.** Eso lo tiene
  que hacer Diego a mano, por WhatsApp.

### 14.4 Por que Diego no vio NADA: una causa, cinco sintomas

Diego pregunto por que no aparecio en el admin, ni en la app del mecanico, ni le
llego el WhatsApp, ni el mail, ni figura en la analitica. **Es todo lo mismo.**

Las tres notificaciones viven en un `Promise.allSettled` que arranca en
`js/app.js:1811`, **despues** de `if (!resp.ok) throw` (`js/app.js:1770`). Sin
fila de reserva no se ejecuta ninguna:

| Lo que Diego no vio | Por que |
|---|---|
| La reserva en el admin | No hay fila en `bookings` |
| El trabajo en la app del mecanico | Lee la misma tabla |
| WhatsApp a Diego | `send-message?channel=whatsapp`, despues del throw |
| SMS al mecanico | `send-message`, despues del throw |
| Mail a la clienta | `send-email`, despues del throw |
| **La analitica del admin** | El funnel lee `checkout_attempts`, y `js/app.js:1607` solo escribe `if (currentUser)`. **Un invitado tampoco existe en el embudo.** La otra mitad viene de PostHog, que si ve visitantes anonimos - pero el evento `booking_completed` tampoco se disparo. |

**VERIFICADO EN CODIGO.** El endpoint del panel es
`/api/analytics` -> rewrite -> `/api/auth?role=admin-analytics`, y lee
`readCheckoutAttempts()` + `readPostHog()`.

### 14.5 La base YA soporta reservas sin cuenta, salvo por una columna

Leido del **schema.sql del backup nocturno** - primera vez que ese repo sirve
para algo concreto:

| Columna de `bookings` | Estado |
|---|---|
| `client_name`, `client_email`, `client_phone` | **ya existen, nullable** |
| `client_id` | nullable, FK -> `profiles(id)` |
| **`user_id`** | **NOT NULL**, FK -> `auth.users(id)` |

**`user_id NOT NULL` es el unico bloqueo real.** Todo lo demas ya esta.

Las policies de RLS de `bookings` son `SELECT`/`UPDATE` sobre
`auth.uid() = client_id` mas la rama de admin. Una reserva de invitado con
`client_id` NULL queda invisible para cualquier usuario logueado, que es
correcto: el invitado la ve por su link de seguimiento, que pasa por el
servidor con la service key. No hay policy de `INSERT` porque las reservas se
insertan server-side, que tambien salta RLS. **Nada de eso hay que tocarlo.**

**CERRADO 2026-08-10.** El `DROP NOT NULL` esta en
`scripts/add-guest-bookings.sql` y **ya corrio contra produccion** - lo
confirmo Diego con la consulta del [RUNBOOK-SQL](RUNBOOK-SQL.md) (ver 16.5).
La tabla de arriba se conserva como estaba el 05-ago; hoy `user_id` es
nullable.

Se reviso ademas lo que el 14.5 pedia revisar - que nada asuma que siempre hay
`user_id`. **No rompe nada**, y la razon es que la columna practicamente no se
usa:

| Que se busco | Resultado |
|---|---|
| Lecturas de `bookings.user_id` en la app | **Ninguna.** Las unicas menciones en `api/` y `js/` son las dos escrituras (`api/auth.js:783` y `api/stripe-webhook.js:298`) y dos comentarios. Ninguna consulta filtra por esa columna |
| Quien identifica al cliente | `client_id`, siempre: `api/auth.js:250`, `:1243`, `:1785`, `:2189`, y el panel de admin en `api/auth.js:1127` |
| RLS | Las policies son sobre `auth.uid() = client_id`. `user_id` no aparece en ninguna |
| Los dos indices unicos | `bookings_unique_slot` (van+fecha+hora, excluye `cancelled`) y `bookings_unique_payment_intent` (parcial, solo cuando hay pago). Ninguno toca `user_id` |

O sea que `user_id` quedo como un espejo historico de `client_id` que nadie
lee. Vaciarlo no deja huerfano a nadie.

### 14.6 Reconstruir la reserva de Thais para el historial fiscal — HECHO 2026-08-10

Diego la necesita en el Excel: es la primera clienta real.

**LA FILA ESTA EN PRODUCCION.** Diego corrio el script el 2026-08-10 y la
verifico en Supabase:

| Campo | Valor |
|---|---|
| `id` | `6046292f-a27d-49e1-84b6-09362d21077a` |
| `status` | **`cancelled`** |
| `user_id` / `client_id` | **NULL** - la primera reserva de invitado real de la base |
| `service_name` / `service_price` | `Tyre / Tube Install` / **27**, salido de `services`, no escrito a mano |
| `callout_fee` | 20 |
| `scheduled_date` / `scheduled_time` | 2026-08-05 / 13:29 |
| `created_at` | 2026-08-05 03:29:00+00, o sea 13:29 de Sydney |

Dos cosas que dejo la corrida y conviene no perder:

- La hora quedo **13:29**, no el `13:30` que traia el script. Es mas fiel al
  minuto del cobro; no se toca.
- La corrida final del `insert` devolvio `Success. No rows returned`: la fila ya
  estaba de un intento anterior y el `where not exists` la freno. **El
  guardarrail funciono y no hay duplicado** - comprobado con un `select`, que
  devuelve exactamente una fila.

Control de que no inflo nada: la suma sobre `status = 'completed'` de 2026 dio
**0**, igual que antes de insertar.

El script queda en **`scripts/restore-thais-booking-2026-08-05.sql`**, sin
borrar: es el registro de como se reconstruyo la fila, y el molde para el dia
que aparezca otro pago huerfano de los que busca 14.9.

El script tiene cuatro secciones y **no escribe nada hasta la tercera**:
comprueba que `user_id` sea nullable y que la fila no exista ya, muestra la
fila exacta en un `select` de prueba, recien despues inserta (con un
`where not exists` sobre el `payment_intent`, asi correrlo dos veces no
duplica), y termina verificando que la facturacion del ano no se movio.

**El precio no va escrito a mano**: sale de un subselect a `services` por
nombre, porque los precios viven ahi y se mueven.

**Dos datos son reconstruidos, no registrados**, y estan marcados en el
script para que Diego los cambie si se acuerda de otra cosa: la **hora del
turno** (`13:30`, tomada del minuto del cobro - el horario que ella eligio se
perdio con la reserva) y el **numero de van** (`1`, nunca se asigno ninguna).
El telefono queda NULL a proposito: Diego tiene su WhatsApp, pero nunca entro
al sistema.

**Y ojo con el importe: se le devolvio.** A efectos fiscales el neto es $0 -
$0.64 de comision de Stripe, que no se devuelve. Cargarla como una venta
completada inflaria la facturacion del ano. El registro honesto es una reserva
con estado `cancelled` y el pago marcado como reembolsado.

**Como se marca el reembolso, y por que asi.** `bookings` **no tiene columna de
estado de pago**: se buscaron `payment_status` y `refunded` en todo el schema y
no existen - el estado del dinero vive en Stripe, y el codigo lo consulta ahi
(`api/_orphan-audit.js:36`). Asi que el reembolso se deja escrito en
`cancellation_reason`, con el id del PaymentIntent, el importe, el medio de pago
y la fecha. Es texto, no un campo estructurado, pero es donde el panel de admin
ya lo muestra.

Que `cancelled` alcance para no inflar la facturacion **esta verificado en
codigo, no supuesto**: todos los numeros de plata filtran por
`status === 'completed'` (`js/admin.js:2054`, `:2340`, `:3258`, `:3322`, y la
linea `:3330` que lo declara como la base del calculo). Y `bookings_unique_slot`
excluye las canceladas, asi que la fila tampoco bloquea ese hueco de agenda.

Datos para reconstruirla, de Stripe:
`pi_3U0vVzPPGSm5cT7J0SRAoVUW`, 05-ago 13:29, $20.00 AUD, Apple Pay / Visa
4481, `thaixguimaraes@gmail.com`, `Customer: Guest`. El servicio lo confirmo Diego
despues de hablar con ella por WhatsApp: **Tyre / Tube Install**. No quedo
registrado en ningun sistema, que es exactamente el problema.

**Correccion 2026-08-10 sobre el nombre del servicio.** Este punto decia
"Tyre and Tube Installed", escrito de memoria. **Ese servicio no existe.** En el
catalogo real - Admin > Services & Prices, o sea la tabla `services` - se llama
**`Tyre / Tube Install`, $27, categoria Wheels & tyres**, comprobado por Diego
en el panel. La diferencia no es cosmetica: el script busca el precio con un
subselect por nombre, asi que con el nombre viejo habria insertado
`service_price` NULL. Es el mismo patron que este documento ya venia
registrando - un dato escrito de memoria en un doc no es evidencia de nada, y
la unica fuente que no miente es el sistema.

### 14.7 El cobro pasa a disparar la cadena, no el navegador

Decision de Diego, 05-ago: **cuando en Stripe entra un pago, de forma automatica
tienen que empezar a funcionar todas las aplicaciones**. Es el arreglo de fondo,
no un parche.

**El problema estructural.** Hoy toda la cadena cuelga de que el navegador del
cliente llegue vivo hasta el final: cobrar -> `create-booking` -> notificaciones,
todo desde el telefono. Si se cierra la app, se cae la señal o falla un paso, no
ocurre nada y nadie se entera. Eso no es un bug dentro de la cadena: **es** la
cadena, y es la que perdio la reserva del 05-ago.

**Lo que la reemplaza.** El aviso `payment_intent.succeeded` de Stripe crea la
reserva y dispara todo desde el servidor. El navegador pasa a ser una comodidad,
no un requisito.

```
ANTES   navegador: cobrar -> crear reserva -> notificar   (si el navegador muere, se pierde todo)
AHORA   navegador: cobrar
        Stripe -> webhook -> crear reserva -> notificar   (el navegador ya no importa)
```

La cadena que pidio Diego se mantiene: la reserva entra `pending`, el admin la
acepta, y recien ahi le aparece al mecanico.

**Los cuatro pasos, cada uno mergeable solo:**

| # | Que | Estado |
|---|---|---|
| 1 | `user_id` nullable + indice unico por pago (`scripts/add-guest-bookings.sql`) | en `feat/payment-drives-the-chain` |
| 2 | Los datos de la reserva viajan dentro del PaymentIntent | en `feat/payment-drives-the-chain` |
| 3 | El webhook crea la reserva y dispara la cadena | **en `feat/webhook-creates-booking`** |
| 4 | Paso de contacto para invitados en el front | **en `feat/guest-checkout`** |

Los pasos 1-3 arreglan los huerfanos **tambien para gente con cuenta**. El paso 4
es lo que suma al invitado.

**Por que hace falta un indice unico.** Durante un tiempo van a existir dos
escritores: el navegador (para respuesta inmediata) y el webhook (por si el
navegador no volvio). Preguntar "¿ya existe?" en codigo pierde la carrera por
definicion; el arbitro tiene que ser la base. El segundo en llegar choca contra
`bookings_unique_payment_intent` y se retira.

**El precio NO viaja en la metadata.** El servidor lo busca el mismo. Todo lo que
llega desde un navegador lo puede editar quien tiene el navegador en la mano.

**Paso 3, detalle de como quedo.** `payment_intent.succeeded` en
`api/stripe-webhook.js`:

- **Filtra primero** (`shouldCreateBookingFor`, exportada y con 8 tests): una
  factura de suscripcion, una gift card, un cobro hecho a mano desde el panel de
  Stripe o una metadata sin fecha/hora **no** generan reserva. Aceptar de mas
  mandaria un mecanico a una direccion que no existe.
- **El precio se busca en `services`**, no se lee del pago.
- **Si el email ya tiene cuenta, la reserva se le adjunta.** Si no, va sin
  `user_id`: es una reserva de invitado y punto.
- **Solo notifica quien escribio la fila.** Si el navegador ya la creo, el
  webhook se retira sin mandar un segundo WhatsApp.
- **Todo error de base se lanza, no se devuelve.** El handler contesta 500 y
  Stripe reintenta. Devolverlo marcaria el evento como procesado para siempre y
  dejaria el cobro sin reserva - justo lo que esto viene a terminar.

Diego ya habia dado de alta `payment_intent.succeeded` en Stripe el 03-ago. No
hacia nada hasta ahora.

**Paso 4, y con esto la seccion 14 queda cerrada.** Se puede reservar sin cuenta.

**La regla ya no es "hay que estar logueado", es "tiene que haber a quien
avisarle".** Sin sesion, el boton del resumen abre una hoja de contacto con tres
campos - nombre, email, celular - y no cobra nada hasta tenerlos. No es un
registro: no hay contraseña, no hay verificacion, no hay cuenta.

Por que tres y no solo el email: el mecanico maneja hasta la casa de un
desconocido, asi que el nombre y el telefono son necesidades operativas, no
marketing. El email es donde van el recibo, la confirmacion y el link de
seguimiento.

**Del lado del servidor, el pago ES la credencial.** `handleCreateBooking` ya no
responde 401 sin token: si no hay sesion exige un email valido y un
`payment_intent_id`, y el paso 4 de esa misma funcion le pregunta a Stripe si
ese cobro existe de verdad y por el importe correcto. Sin pago no hay reserva, y
`bookings_unique_payment_intent` impide gastar el mismo pago dos veces.

Decisiones que conviene no perder:

- **Un invitado nunca llega a un call-out de $0.** El precio de socio se busca
  por cuenta, asi que sin cuenta no hay descuento - y con $0 no habria cobro que
  autenticara la peticion.
- **`bike_id` se ignora para invitados.** Una bici pertenece a una cuenta
  (`bikes.client_id`); aceptar un id suelto dejaria colgar la reserva de la bici
  de otra persona.
- **El chequeo de i18n tenia un tercer agujero.** No leia `translateValue(...)`,
  que es la llamada de traduccion propia de la SPA. Las diez cadenas nuevas de
  la hoja de contacto pasaron en verde hasta que se lo enseño. Es el mismo
  agujero que `tVal(` en track (14.3) y que las props de `confirmDialog` (12.18).

**Verificado en Chromium a 390px** (sin captura: el panel del navegador estaba
cerrado, asi que nada de esto es una afirmacion sobre pixeles):

| Camino | Resultado |
|---|---|
| Sin sesion, click en pagar | Abre la hoja. **Cero llamadas de red** |
| Campos vacios o invalidos | Corta con el mensaje correcto, en español, sin cobrar |
| Datos completos | Va a `payment` con nombre, email y telefono guardados |
| Que email viaja al cobro | `thaix@example.com`, **no** el buzon de Diego |
| Metadata del pago | Servicio, fecha, hora, direccion, contacto e idioma |
| "Ya tengo cuenta" | Va a `login` y recuerda volver al resumen |
| Con sesion iniciada | Va directo a `payment`, la hoja no aparece |

### 14.8 La factura tampoco puede depender del celular del mecanico — PASO A HECHO 2026-08-10

Lo pidio Diego el 10-ago, y es la misma falla estructural que 14.7 pero en el
**otro extremo** del trabajo. 14.7 saco del navegador del *cliente* la cadena
que arranca al cobrar. Esto saca del navegador del *mecanico* la cadena que
arranca al completar.

**Como estaba.** `js/mechanic.js` marcaba el trabajo completado contra el
servidor y **despues**, desde el telefono, disparaba tres `fetch` sueltos:

```
telefono -> /api/auth (mechanic-complete)   <- esto si quedaba guardado
telefono -> /api/send-invoice               <- la factura en PDF
telefono -> /api/send-email (review_request)
telefono -> /api/send-sms   (review_request)
```

Los tres ultimos vivian dentro de un `Promise.allSettled` cuyo `catch` era un
`console.log`. Un mecanico que perdia senal en esa ventana - un garage, un
sotano, un ascensor - dejaba el trabajo **completado y al cliente sin factura**,
y **nadie se enteraba**: ni el cliente, que no sabe que esperaba un PDF, ni
Diego, que no tenia donde verlo.

**Como quedo.** Los tres salen de `api/auth.js`, en la misma peticion que
completa el trabajo. El telefono manda una sola cosa y se puede apagar en el
segundo siguiente.

- `api/_completion-notify.js` es nuevo y **no tiene red adentro**: solo la
  aritmetica y la forma de los tres payloads, para que las cifras de la factura
  de un cliente se puedan afirmar en un test. 15 tests en
  `tests/unit/completion-notify.test.js`.
- Las cifras **reproducen `calcChargeBreakdown()` linea por linea**. Fue una
  mudanza, no una nueva tarifa. La propina sigue fuera de todo total con GST.
- **La fila se lee ANTES del PATCH.** El bloque de descuento de completado esta
  a punto de pisar `discount_applied`, y la factura necesita el descuento de la
  *reserva*, que es con el que la calculaba el navegador.
- **El envio se espera (`await`), no se dispara y se olvida.** Esta peticion es
  el ultimo momento en que hay algo corriendo con certeza. Pero **no puede
  hacer fallar la completacion**: el trabajo ya esta completado, y contestar 500
  ahi le mostraria al mecanico "no se pudo completar" un trabajo que si se
  completo, invitandolo a completarlo dos veces.
- Si algo falla, `console.error` con el `booking_id` **y** un aviso al mecanico
  en pantalla. Que esto se callara es todo el motivo del cambio.

**Un bug de arrastre que se arreglo solo al mudarlo.** El navegador mandaba
`date: j.scheduled_date` y `time: j.scheduled_time` sobre un objeto cuyos campos
se llaman `date` y `time` (`js/mechanic.js:626-627`). Los dos viajaban
`undefined`: **todas las facturas en PDF emitidas hasta hoy salieron sin fecha
ni hora**. Al leer la fila directa, llegan. Hay un test que lo fija.

**Paso B: la factura se reintenta hasta que sale — 2026-08-10.**

El paso A cierra el agujero del telefono. No cierra el nuestro: si Resend o
Twilio estan caidos en ese segundo, el cliente sigue sin factura y la unica
huella es un `console.error` que nadie lee.

Ahora cada envio deja escrito **en la reserva** que paso, por canal:

```json
{"send-invoice":"sent","send-email":"sent","send-sms":"failed"}
```

y `api/send-cron.js?type=completion-retry` reenvia **solo** lo que no diga
`sent`. Nunca lo que ya salio: un SMS fallido no puede producir una segunda
factura. La columna es `bookings.completion_notifications` (JSONB), migracion en
`scripts/add-completion-notifications.sql`.

Decisiones:

- **`NULL` se ignora a proposito.** Una reserva completada antes de que la
  columna existiera no se puede distinguir de "no se mando nada", y adivinar
  significaria mandarle a un cliente viejo una segunda factura.
- **El reintento fusiona, no pisa.** Lo que salio bien en el primer intento no
  esta en el lote del reintento y tiene que conservar su `sent`.
- **Grabar es best-effort.** Si la migracion no se corrio, el envio del paso A
  igual ocurrio; lo que falta es la red de seguridad, no la factura. Queda un
  `console.warn` que nombra el SQL.
- **Es diario, no cada hora.** Vercel Hobby solo admite crons diarios (esta
  escrito en la cabecera de `api/send-cron.js`, y ya hizo fallar un deploy
  antes). Asi que una factura perdida se repara **dentro del dia**, no en
  minutos. Se puede forzar a mano en `/api/retry-completion`.
- Mira 14 dias hacia atras y como maximo 200 reservas por pasada.

**Falta que Diego corra `scripts/add-completion-notifications.sql`** en el editor
SQL de Supabase. Sin eso, el paso B no hace nada (y lo dice en los logs); el paso
A sigue funcionando igual.

**Y lo que NO arregla ninguno de los dos:** si el mecanico **no tiene senal en
el momento de tocar "Completar"**, no pasa nada en absoluto - ni siquiera se
marca el trabajo. Eso necesita una cola offline en la app del mecanico
(guardar la completacion en el telefono y reenviarla cuando vuelve la senal).
Es un tercer trabajo, todavia sin decidir.

**Verificado:** `npm run check` 5/5, `npx vitest run` 175/175 (15 nuevos).
**NO verificado:** no se completo un trabajo de verdad contra produccion — hace
falta un `booking_id` real y el PIN del mecanico. Queda pendiente de hacerlo
despues de mergear.

### 14.9 Admin > Orphan Payments: quien pago y no recibio nada — 2026-08-10

14.2 dejo abierto "contar los huerfanos del mes". No se podia contar desde un
chat: hace falta la clave de Stripe y la service key de Supabase, y ninguna de
las dos sale del servidor. Asi que lo que se construyo es la **herramienta**, y
la corre Diego.

**Admin > Orphan Payments.** Dos fechas (ya vienen puestas en 04-jul y 05-ago) y
un boton. Lee todos los pagos de Stripe en ese rango, los cruza contra
`bookings`, y lista los que nadie reclamo: importe, email, fecha, id de Stripe y
un link directo al pago.

**No devuelve plata, y no es un descuido.** Cada fila abre Stripe en otra
pestaña y ahi Diego decide. Devolver dinero automaticamente sobre un cruce de
datos que puede estar mal es exactamente el tipo de cosa que no se automatiza.

Decisiones que conviene no perder:

- **El filtro es el mismo que el del cron diario**, movido a
  `api/_orphan-audit.js` y compartido, para que la auditoria y la barrida no
  puedan discrepar sobre que es un huerfano.
- **Con una diferencia deliberada:** el cron esconde los pagos que ya avisaron
  (`orphan_alerted`) para no despertar a Diego dos veces. La auditoria los
  muestra igual, marcados `alerted before` - un aviso de julio sin resolver es
  justo lo que se esta buscando.
- **Si se acaban las paginas de Stripe, lo dice arriba de todo y en ambar.** Una
  lista parcial leida como completa dejaria gente sin devolucion, que es lo
  unico que esta pagina viene a terminar.
- **Si falla el cruce contra `bookings`, tira error en vez de devolver la
  lista.** Tragarse ese error reportaria *todos* los pagos como huerfanos: la
  peor respuesta posible aca.
- Las consultas van de a 50 ids: un mes de ids en un solo `in.()` es una URL lo
  bastante larga como para que la rechacen.

**Un bug de contraste, encontrado midiendo y no mirando.** El boton primario
salio con `color:var(--white)`, y en modo oscuro `--white` es casi negro: tinta
oscura sobre azul, **2.9:1**. Quedo en `#fff` literal, que es la excepcion
documentada para admin/mechanic. Medido despues del cambio: **5.17:1 en los dos
temas**.

**Verificado en navegador** (sin captura: el panel estaba cerrado, asi que nada
de esto es una afirmacion sobre pixeles, son valores calculados):

| Que | Resultado |
|---|---|
| El item del menu abre la pagina | titulo y subtitulo correctos |
| Contraste boton / titulo / cuerpo, tema claro | 5.17 / 16.43 / 7.58 |
| Contraste boton / titulo / cuerpo, tema oscuro | 5.17 / 15.25 / 5.22 |
| Render con datos de ejemplo | cabecera + 2 filas, y el aviso de truncado arriba cuando toca |
| Los links a Stripe | `target=_blank` con `rel="noopener noreferrer"` |

**NO verificado, y conviene no confundirlo con verificado:**

- **No se corrio contra Stripe de verdad.** Cuantos huerfanos hay sigue sin
  saberse hasta que Diego apriete el boton.
- **Nada que dependa del ancho.** Con el panel del navegador cerrado el viewport
  reporta `clientWidth: 0`, asi que el flex se apila y el boton mide 75px de
  alto en vez de 44 (ver la nota del punto 12.x sobre este artefacto). El
  contraste no depende del ancho y por eso si vale; los 44px de alto tactil y la
  ausencia de scroll horizontal **no se pudieron comprobar** y hay que mirarlos
  con el panel abierto.

### 14.10 Completar sin senal: la cola offline del mecanico — 2026-08-10

Lo pidio Diego el mismo dia que el 14.8. Es el hueco que quedaba: 14.8 saco la
factura del telefono del mecanico, pero si el mecanico **no tenia senal en el
momento de tocar "Completar"**, no pasaba absolutamente nada. El `fetch` de
`submitComplete()` tiraba excepcion, la excepcion salia de la funcion sin
`catch`, y el trabajo quedaba sin completar: sin error en pantalla, sin
reintento, sin registro. Un garage o un sotano bastaba.

**Ya existia una cola** (`drbike-mech-outbox`, `js/mechanic.js`), y su
comentario decia explicitamente que las completaciones quedaban fuera **a
proposito**: "replaying money hours later... is not something to do quietly in
the background". Tenia razon. Por eso el trabajo fue mitad servidor.

**El candado, primero.** `api/_completion-guard.js` (nuevo, sin red adentro) y
su llamada al principio de `handleMechanicComplete`, **antes** del cobro, del
descuento de stock y de las notificaciones:

- reserva ya `completed` -> `200 {already_completed:true}` y **no se hace
  nada**. Sin esto, el reenvio volvia a cobrar la tarjeta (la idempotency key de
  Stripe deja de deduplicar a las 24h, y una cola que sale a la manana
  siguiente ya esta afuera de esa ventana), volvia a descontar los repuestos y
  mandaba una **segunda factura** en PDF mas un segundo email y SMS de reseña.
- reserva `cancelled` -> `409 JOB_CANCELLED`. Completada en un sotano,
  cancelada por Diego antes de que el telefono encontrara senal: cobrar eso
  horas despues es la peor version del bug, no un caso raro.
- fila ilegible (`null`) -> **sigue de largo**. Negarse a completar un trabajo
  real porque fallo un SELECT es peor que el duplicado del que nos cuidamos.

Se eligio la columna `status`, que ya existe en todos los entornos, y no una
columna de idempotencia nueva: una migracion a mano que nadie corre es un
candado que no existe (ver seccion 16 y `docs/RUNBOOK-SQL.md`). **Este cambio
no necesita SQL.**

**Limite conocido, escrito para que nadie lo lea como resuelto:** leer y despues
actuar no es atomico. Dos requests dentro del mismo segundo pueden leer los dos
"no completado". Esa ventana la sigue cubriendo la idempotency key de Stripe,
que es para lo que estaba. El candado es para el otro caso: el reenvio de
minutos u horas mas tarde.

**La cola, despues.** `submitComplete()` arma el payload como objeto, y si el
`fetch` tira, lo mete en la cola (`{type:'complete', booking_id, body}`) y
cierra el trabajo en pantalla igual que si hubiera salido - un trabajo que sigue
figurando pendiente invita a un segundo toque, que es justo el duplicado que el
candado tiene que frenar.

- **El token no se guarda con el item.** Se lee fresco al reenviar
  (`outboxRequestBody`): un item que durmio toda la noche no viaja con un token
  vencido, y la cola no guarda una credencial en disco.
- **Las fotos no sobreviven.** `uploadPhoto()` va directo a Supabase Storage y
  tampoco tiene senal; se encola sin fotos y **se le dice al mecanico**. Meter
  las fotos en base64 en la cola no es opcion: `_IDB.set` solo considera
  "guardado" si lo acepto **localStorage**, y una foto de celular revienta los
  5 MB, con lo cual cada completacion offline mostraria el banner rojo de "no
  se guardo en este telefono".
- **Un cobro que falla al reenviar NO se descarta.** Nadie esta mirando la
  pantalla cuando la cola se vacia. Un `402 AUTO_CHARGE_FAILED` deja el item en
  la cola marcado `needs_payment`, las vueltas siguientes lo saltean, y el
  banner de sync se pone rojo: "1 job could not be charged". Por eso `queueFlush`
  ahora recorre con indice en vez de hacer `shift`.
- **Solo se encola cuando no hay red** (el `fetch` tira). Un 500 sigue mostrando
  error como antes.
- **Un item aparcado se limpia cuando el mecanico rehace el trabajo**
  (`queueDropCompletions`). Encontrado revisando antes del merge: como los
  flushes lo saltean, nada mas lo sacaba de la cola. El mecanico cobraba por
  EFTPOS, completaba de nuevo con exito, y el item viejo se quedaba ahi para
  siempre - banner rojo permanente y un precio ya corregido durmiendo en el
  telefono. Ahora toda completacion nueva de esa reserva borra las anteriores,
  en las dos ramas (la que sale y la que se encola).

Un detalle del servidor que vale escribir: si el SELECT del candado falla, se
**sigue de largo a proposito**, pero eso deja el candado sin hacer nada en ese
request. Por eso ese caso ahora escribe `console.error(... proceeding
UNGUARDED)`: un candado muerto en silencio es exactamente como vuelve el doble
cobro.

Verificado: 31 tests nuevos (`tests/unit/completion-guard.test.js`,
`tests/unit/mechanic-outbox-completion.test.js`, que levantan las funciones
reales del archivo del navegador), suite completa 221/221, `npm run check`, y
las cuatro rutas ejecutadas en un navegador real contra `mechanic.html`
servido: sin senal queda encolado, 402 lo aparca en rojo, un item aparcado no
se reintenta, y `already_completed` lo da por bueno y lo saca. **NO** verificado:
ningun cobro real de Stripe, ni un reenvio contra produccion.

### 14.11 El trabajo aparcado tenia que verse, y decia "Done" — 2026-08-10

Revisando el 14.10 ya mergeado. El banner rojo decia "1 job could not be
charged - **open it** and collect payment", y ahi terminaba la ayuda:

1. **No decia cual.** Con seis trabajos en la lista, el mecanico tenia que
   adivinar en un problema de plata. Ahora la card del trabajo lleva el aviso
   con el motivo real del rechazo ("Card declined (insufficient funds)"), borde
   izquierdo rojo, y ninguna otra card se toca.
2. **Y el trabajo decia "Done".** Peor que no verse: `finishCompleteUI()` lo
   marca completado en el telefono en cuanto se encola, pero el servidor
   despues rechazo el cobro y **nunca lo completo**. Como `queueFlush()` solo
   llamaba a `load()` cuando algo se habia enviado, la card se quedaba en "Done"
   con solo el boton **Undo** - es decir, el banner mandaba a abrir un trabajo
   que la pantalla mostraba como terminado y sin forma de completarlo. Ahora
   tambien recarga cuando algo queda aparcado, y el trabajo vuelve a lo que el
   servidor realmente tiene, que es donde vive el boton **Complete**.

**El aviso es una clase CSS (`.pay-warn`), no un estilo inline, y la razon es
medible:** sobre la card oscura, `var(--red)` encima del panel rojo al 15% da
**2.76:1** - la misma forma en que "No jobs today" quedo invisible (12.15). Un
estilo inline no puede llevar el override de `[data-theme='dark']`. Con la clase
mide **4.95:1 en claro y 10.34:1 en oscuro**, los dos medidos en el navegador,
no estimados.

Se subieron los dos `?v=` de `mechanic.html` (js y css). Sin eso el cambio no se
ve en un telefono que ya tenia la app: paso en esta misma sesion de verificacion
- el service worker sirvio el `mechanic.js` viejo y la card salio sin el aviso.

Verificado: 232 tests (7 nuevos), `npm run check`, y en navegador real - solo la
card correcta marcada, el boton Complete presente, el contraste de los dos temas
medido, y el `load()` tras aparcar. **NO** verificado: nada contra produccion ni
contra Stripe.

---

## 15. Recuperar la contraseña era imposible desde una computadora (2026-08-06)

Diego pregunto por que no aparece el boton de "olvide mi contraseña" en la
landing. Aparecio eso y algo peor detras.

### 15.1 Dos fallas encadenadas, las dos CERRADAS

**Primera: el boton no existia.** `landing.html` tenia **cero** apariciones de
`forgot` / `reset-password`. Un cliente que olvidaba su clave en la computadora
no tenia por donde empezar. La SPA movil si lo tenia (`js/app.js:3224`).

**Segunda, y peor: aunque lo empezara desde el celular, el link llegaba sin
credencial.** El link de recuperacion apunta a
`https://drbikesydney.com.au/index.html` (`api/auth.js:1855`) y Supabase manda
el token en el **`#hash`**. En escritorio, `index.html` hacia
`window.location.replace('/landing.html')` - y `replace()` **no arrastra el
hash**. El cliente aterrizaba en la pagina de marketing sin token y sin
explicacion.

O sea: recuperar la contraseña funcionaba **solo en celular**. En computadora
era imposible por los dos extremos.

**Arreglo.** `index.html` no redirige cuando detecta un token de recuperacion en
el hash - la SPA ya sabe terminar el flujo (`PASSWORD_RECOVERY` en
`js/app.js`). Y la landing tiene su boton, contra el mismo endpoint que usa la
SPA, en los 3 idiomas.

**VERIFICADO EN NAVEGADOR** contra la rama (sin captura: el panel estaba
cerrado):

| Caso | Resultado |
|---|---|
| Boton en la landing | Aparece, 44px, "¿Olvidaste tu contraseña?" |
| Sin email | Corta con el mensaje correcto, en español |
| Con email | Manda `{role:'request-password-reset', email}` y muestra la confirmacion |
| En "Crear cuenta" | Oculto, no hay nada que recuperar |
| Link de recuperacion en escritorio | **Se queda en la SPA y el token sobrevive** |
| Visita normal de escritorio | **Sigue yendo a la landing** - sin regresion |

### 15.2 Lo que Diego pidio y NO se hizo aca

- **"Olvide mi email".** No existe en ninguna superficie, y no es lo mismo que
  olvidar la contraseña: para recuperar un email hace falta otro identificador,
  normalmente el telefono. Hoy lo mas parecido es la busqueda por email de
  `track.html`, que resuelve "perdi mi link", no "no se con que email me
  registre". **Es una decision de producto, no un bug.**
- **Revisar que la factura en PDF llegue.** Revisado, no tocado: `send-invoice.js`
  arma un PDF real con `pdfkit` y lo adjunta. Lo dispara el mecanico al
  completar el trabajo (`js/mechanic.js:2113`), y solo si la reserva tiene
  `client_email` - que las reservas de invitado ahora si tienen (seccion 14).
  Si el PDF falla, el mail **igual sale** sin adjunto y solo queda un
  `console.warn`: nadie se entera. Eso ultimo si es un hallazgo, sin arreglar.

  **CERRADO 2026-08-16 (15.2).** `api/send-invoice.js` ahora avisa a Diego
  por WhatsApp cuando `buildPDF()` falla (mismo mecanismo que
  `client_cancelled`/`noshow_alert`), ademas del `console.warn` que ya
  tenia. El email sigue saliendo igual, con o sin el adjunto.
- **"Un mail bonito, sin demoras".** Sin especificar todavia. El camino de envio
  esta bien elegido: **no** usa el mailer de Supabase (que nunca se configuro y
  reporta exito aunque no entregue), sino Resend, igual que el resto.
### 15.3 "Olvide con que email me registre" — NUEVO, decidido por Diego

Un email no se resetea, se **recuerda**: hace falta un segundo identificador. El
unico que tenemos es el telefono de la cuenta (`profiles.phone`).

**Como funciona.** El cliente pone su celular y **la respuesta va por SMS, nunca
a la pantalla** - si apareciera en pantalla, cualquiera podria tipear numeros en
un formulario y cosechar direcciones. La direccion va **enmascarada**
(`t***s@gmail.com`): a quien tiene el telefono hay que recordarle cual uso, no
entregarle una direccion completa para usar en otro lado.

**El servidor siempre contesta lo mismo**, este o no registrado el numero, por
el mismo motivo que el reset de contraseña. Y tiene su propio limite de **3
intentos cada 10 minutos**, mas estricto que el general: cada acierto manda un
SMS de verdad a una persona de verdad, asi que el abuso aca cuesta plata y
molesta a alguien que no hizo nada.

**De paso, `confirmDialog()` aprendio a pedir un dato.** Con la opcion `prompt`
devuelve el texto en vez de `true`, y sigue devolviendo `false` al cancelar, asi
que los que ya lo usaban no cambian. Se agrego en vez de recurrir a
`window.prompt()`, que el punto 12.18 saco de la app por los mismos motivos que
`confirm()`.

**VERIFICADO EN NAVEGADOR** (sin captura: el panel estaba cerrado):

| Caso | Resultado |
|---|---|
| Los dos botones en el login | 44px, "¿Olvidaste tu email?" y "¿Olvidaste tu contraseña?" |
| El dialogo | Campo `tel` de 45px, botones "Cancelar" / "Enviármelo" |
| Campo vacio | **No cierra y no envia nada** |
| Con telefono | Manda `{role:'recover-email', phone, lang}` |
| El aviso al cliente | Generico: "Si ese número tiene cuenta..." |
| Regresion de `confirmDialog` | Sin `prompt` no hay input; confirmar devuelve `true`, cancelar `false` |

El SMS esta en los 3 idiomas (`api/_message-i18n.js`).

---

## 16. El SQL que falta correr, y la correccion al 14.7 (2026-08-10)

Seccion nueva, agregada sin tocar nada de lo anterior.

### 16.1 Hay dos runbooks nuevos, y son los documentos operativos

- **[RUNBOOK-SQL.md](RUNBOOK-SQL.md)** - que scripts de `scripts/*.sql` hay que
  correr en Supabase, en que orden, que se rompe si no, y como se verifica
  despues. Arranca con una sola consulta que le pregunta a la base cuales
  faltan, para no depender de lo que este documento recuerde.
- **[RUNBOOK-BACKUP-RESTORE.md](RUNBOOK-BACKUP-RESTORE.md)** - el simulacro de
  restauracion que el punto 1.2 dejo abierto, paso a paso y sin tocar
  produccion.

Los dos los corre Diego. Ninguna IA tiene ni debe tener esas credenciales.

### 16.2 CORRECCION al 14.7: los cuatro pasos ya estan en `main`

La tabla del punto 14.7 lista los cuatro pasos como "en `feat/...`", es decir
sin mergear. **Esta desactualizada.** Verificado el 2026-08-10 leyendo el codigo
en `main`:

| Paso | Estado real |
|---|---|
| 1. `user_id` nullable + indice unico por pago | El script existe (`scripts/add-guest-bookings.sql`). **El SQL puede seguir sin correrse contra produccion** - es el paso 1 del RUNBOOK-SQL |
| 2. Los datos de la reserva viajan en el PaymentIntent | En `main`: metadata `bk_*`, leida en `api/stripe-webhook.js:292` en adelante |
| 3. El webhook crea la reserva y dispara la cadena | En `main`: `api/stripe-webhook.js:372`, `case 'payment_intent.succeeded'`. El filtro `shouldCreateBookingFor()` en la linea 263 |
| 4. Paso de contacto para invitados | En `main`: `js/app.js:1429`, la hoja "Where do we send your booking?" |

**No hay que reimplementar nada de esto.** La distincion que la tabla vieja
borraba, y que es la razon de ser del RUNBOOK-SQL: que el codigo este mergeado
no quiere decir que la base este lista. El paso 1 es mitad codigo (hecho) y
mitad SQL (a confirmar contra produccion).

### 16.3 El falso positivo de `npm run check` - CERRADO

`scripts/icons-check.mjs` recorria carpetas que git ignora. Despues de correr
la suite de Playwright quedaba un `playwright-report/` con HTML generado sin
`<link rel="icon">`, y el check fallaba en local con problemas que no existen
en el repo. El CI siempre estuvo verde porque esa carpeta nunca llega al
repositorio, asi que la falla solo la veia quien habia corrido los e2e.

Arreglado en `fix/icons-check-respects-gitignore`: `scripts/lib/ignored-dirs.mjs`
lee `.gitignore` y exporta los nombres de directorio a saltear, mas
`node_modules` y `.git` siempre. `color-check.mjs` tenia el mismo agujero en su
`sweep()` y comparte el set. Tres tests en `tests/unit/ignored-dirs.test.js`
fijan la lista.

### 16.4 Las 2 vulnerabilidades high de `npm audit` - CERRADAS

Las dos eran transitivas y las dos colgaban de `devDependencies`: nada de lo
que se despliega las toca.

| Paquete | Cadena | Antes | Despues |
|---|---|---|---|
| `brace-expansion` | `eslint` -> `minimatch` | 5.0.8 | 5.0.9 |
| `nanoid` | `vitest` -> `vite` -> `postcss` | 3.3.16 | 3.3.18 |

`npm audit fix` solo cambio `package-lock.json`; `package.json` quedo igual y
ninguna version mayor se movio. Rama `chore/audit-fix-dev-deps`.

### 16.5 VERIFICADO 2026-08-10: no faltaba ningun script SQL

Diego corrio la consulta del [RUNBOOK-SQL](RUNBOOK-SQL.md) contra produccion.
**Las 30 migraciones dieron `OK`**, mas `0` perfiles sin `referral_code` y la
columna `bookings.completion_notifications` presente.

Los tres que este documento daba por pendientes ya estaban corridos:

| Script | Lo daba por pendiente | Estado real |
|---|---|---|
| `add-address-coordinates.sql` | 13.1 | corrido |
| `add-guest-bookings.sql` | seccion 14 | corrido |
| `add-checkout-attempts.sql` | 11.2 | corrido |

O sea que la base estaba al dia y lo desactualizado era el documento. Vale la
pena registrar el patron, porque se repite: **un punto marcado "pendiente" en
`PENDIENTES.md` no es evidencia de nada.** La consulta del runbook tarda diez
segundos y es la unica fuente que no miente.

**Lo que si queda abierto**, y solo lo puede hacer Diego:

1. Una reserva sin iniciar sesion, de punta a punta, comprobando el email al
   cliente y el WhatsApp al admin. El SQL esta, la prueba real no.
2. El ETA en la pagina de seguimiento de una reserva **nueva** (las viejas no
   tienen coordenadas y nunca lo van a mostrar).
3. El simulacro de restauracion del backup
   ([RUNBOOK-BACKUP-RESTORE.md](RUNBOOK-BACKUP-RESTORE.md)). Sigue siendo un
   backup no probado, que es lo que dice el punto 1.2.

---

## 17. Un precio se edita en un solo lugar - salvo el que lee Google (2026-08-10)

Lo pregunto Diego mientras reconstruia la reserva de 14.6: "esto con los precios
no lo tengo que hacer uno por uno, ¿o si?".

### 17.1 La respuesta corta es NO, y esta verificado contra el catalogo real

Se edita **una vez** en Admin > Services & Prices - que es la tabla `services` -
y viaja solo a todos lados. `js/live-prices.js` reescribe las tarjetas de las
paginas de marketing en el navegador, y el asistente de reserva y el chatbot
consultan `services` en vivo.

No es una promesa del documento: existe `npm run services:check`
(`scripts/services-sync-check.mjs`), que lee la tabla de verdad y compara. Se
corrio el 2026-08-10:

```
Checked 277 cards on 62 pages against 33 services.
```

**Cero tarjetas despegadas.** Ninguna quedo con un precio que Admin no pueda
cambiar. Lo unico que reporto:

- ~~`E-bike service` ($129) se puede reservar y no esta en ninguna pagina de
  marketing~~ — **CERRADO el mismo dia** (commit `89f21ac`, "anunciar E-bike
  service, y devolverle al desktop el catalogo de precios"). Ver **17.3**, que
  cuenta el arreglo completo: la tarjeta vive en `landing.html` dentro de
  `#services-modal` (`.svc-card`, $129, icono, es/zh), y de paso encontro que
  **ningun** servicio se veia en desktop, no solo este. Este punto se quedo sin
  marcar despues de esa sesion.

Esa herramienta ya existia y **no corre en CI a proposito**, porque necesita red
y la tabla viva. Se corre a mano despues de tocar servicios:

```
npm run services:check
```

### 17.2 La excepcion: el bloque `application/ld+json` — CERRADO 2026-08-10

Hay **61 archivos HTML** con un bloque `<script type="application/ld+json">`
que declara servicios y precios - es lo que lee Google para mostrar precios en
los resultados de busqueda. **`js/live-prices.js` no lo toca**: solo reescribe
tarjetas del DOM. Y **ningun check lo mira**: `plan-prices-check.mjs` vigila los
precios de membresia, `services-sync-check.mjs` vigila las tarjetas, nadie
vigila el JSON-LD.

**Hoy estan bien**, comprobado contra `services` el 2026-08-10:

| En el JSON-LD | En el catalogo |
|---|---|
| Tune-Up $109 | 109 |
| Standard Service $149 | 149 |
| Standard+ Service $199 | 199 |
| Flat Tyre Repair $27 | `Tyre / Tube Install` 27 |
| Ultimate Overhaul $369 (paginas de suburbio) | 369 |

Pero estan escritos a mano y sin vigilancia, asi que **el dia que Diego cambie
un precio en Admin, Google va a seguir mostrando el viejo** y nada va a avisar.
Es exactamente el patron de 12.6 y del bug de precios del 2026-07-22, en el
unico lugar donde todavia queda.

**ARREGLADO EL MISMO DIA.** `npm run services:check` ahora lee tambien los
bloques JSON-LD. El mismo comando de siempre, sin nada nuevo que recordar:

```
Checked 277 cards on 62 pages, and 244 structured-data offers on 63 pages,
against 33 services.
```

Tres cosas que antes no miraba nadie, y cada una con su mensaje:

| Que detecta | Por que importa |
|---|---|
| Un precio del JSON-LD distinto al de `services` | Es el numero que Google imprime en los resultados |
| El `priceRange` (`$109-$369`) fuera de los extremos reales | Es lo primero que Google muestra al lado del negocio |
| Un `Offer` cuyo nombre no existe en el catalogo | Se anuncia algo que no se puede reservar |

**El problema tecnico que habia que resolver, y como se resolvio.** Las paginas
de suburbio declaran sus ofertas **en el idioma de la pagina** - `Ajuste`,
`基础保养` - asi que buscar contra el catalogo en ingles fallaba en **240 de las
244** ofertas. La traduccion **no se copio**: se lee de
`scripts/generate-suburb-pages.mjs`, que ya la tiene alineada posicionalmente
con `SERVICE_KEYS`, igual que el `NAME_MAP` se lee de `js/live-prices.js`. Una
segunda copia habria derivado del generador y empezado a mentir.

**Matiz que la version anterior de este punto tenia mal.** Decia que los
precios del JSON-LD estaban "escritos a mano". Los de las paginas de suburbio
**no**: `generate-suburb-pages.mjs:712` los lee de Supabase **al generar**. El
agujero real es mas fino: quedan congelados desde que Diego cambia un precio
hasta que alguien regenera. Por eso el mensaje del check dice
`npm run suburbs:generate` (script nuevo, el generador no tenia uno). Los de
`landing.html` e `index.html` si son a mano.

**Verificado rompiendo cosas a proposito**, no solo mirando que diera verde: se
bajo un precio en `bondi.html`, se ensucio el `priceRange` de `es/cbd.html` y
se renombro una oferta a `Ajuste Mistico`. Los tres saltaron con el archivo y
el numero exactos, y despues se restauraron.

**Y un guardarrail contra el modo de fallo de esta casa:** si la barrida
encuentra 0 paginas, 0 ofertas o 0 traducciones, el check **falla** en vez de
felicitarse. Un parser que deja de matchear en silencio es exactamente como el
chequeo de i18n paso en verde por tres agujeros distintos (12.9, 14.3, 14.7).
Comprobado renombrando `SERVICE_KEYS` en el generador: corta con el motivo.

Sigue **fuera de `npm run check`** a proposito, como el resto de este script:
necesita red y la tabla viva, y el CI no puede depender de eso.

### 17.3 El catalogo de precios del desktop era inalcanzable desde el 04-jul

Salio de una tarea chica: Diego pidio anunciar `E-bike service` ($129), el unico
servicio que el 17.1 encontro reservable y sin tarjeta. Al ir a agregarla se vio
que **la tarjeta no la iba a ver nadie**.

**Lo que estaba pasando.** `landing.html` tiene 33 tarjetas de servicio con sus
precios dentro de `#services-modal`. Ese modal se abre con `openServicesModal()`,
que estaba cableada a un boton con id `home-view-all-btn`. **Ese boton no
existia en el HTML.** Medido en el navegador contra la rama, y confirmado contra
**produccion** (`curl` a drbikesydney.com.au: `id="home-view-all-btn"` aparece
**0 veces**):

| Medicion | Resultado |
|---|---|
| Tarjetas `.svc-card` en la pagina | 33 |
| Visibles | **0** |
| Botones que abren el modal | **0** |
| Tarjetas de precio en la seccion `#services` | **0** |

O sea: **un visitante de escritorio no podia ver un solo precio en toda la
pagina.** La seccion "Nuestros Servicios" tiene titulo, un parrafo y un boton de
reservar, y nada mas.

**Desde cuando y por que.** `git log -S` lo ubica exacto: el commit `0c639c1`
(04-jul-2026, del bot de opencode, el mismo de la unificacion de rutas que este
documento llama "Session 5 - PARTIAL") cambio esto:

```
-  <button id="home-view-all-btn" class="btn-outline-blue">View All Services →</button>
+  <a href="#book-service" class="btn-outline-blue">Book a Service →</a>
```

Cambio el CTA y **dejo huerfanos el modal, sus 33 tarjetas y la funcion que los
abre**. Un mes y medio sin precios visibles en desktop, sin que nada fallara:
ningun error de consola, ningun check en rojo. Las tarjetas seguian existiendo
en el HTML, asi que hasta `services-sync-check.mjs` las contaba como
"anunciadas" - es el punto ciego que hizo que `E-bike service` figurara como el
unico servicio sin anunciar cuando en realidad no se anunciaba **ninguno**.

**Como quedo.** Los dos CTA conviven: reservar (solido, la accion que cobra) y
ver el catalogo (contorneado). El string `'View All Services →'` seguia en el
diccionario es/zh de cuando el boton existia, asi que no hizo falta traducir
nada nuevo.

Cuatro cosas que se encontraron al ponerlo y conviene no repetir:

- **`btn-outline` es la clase del HERO**, texto blanco sobre borde blanco
  translucido, para fondo oscuro. En esta seccion blanca el boton quedaba
  **invisible**. La clase correcta para fondo claro es `btn-outline-blue`.
- Un hijo de un contenedor flex sin `align-items` se estira al alto de la fila:
  el boton quedaba de **96px** contra los 48px del de al lado.
- **El servicio ya tenia nombre en el sitio y la tarjeta le puso otro.** La
  primera version la llamo `E-bike Service` (b minuscula, como las tarjetas
  vecinas `E-bike Diagnostic` y `Firmware Update`) y le escribio traducciones
  nuevas: `Service de e-bike`. Pero el enlace del pie (`landing.html:1485`) y la
  opcion del desplegable de reserva (`landing.html:1157`) **ya decian
  `E-Bike Service`**, con su entrada en el diccionario desde antes:
  `Servicio de E-Bike` y `电动车服务`. Un cliente hubiera visto el mismo servicio
  con dos nombres distintos en español en la misma pagina. Se unifico a
  `E-Bike Service` y se borraron las dos entradas nuevas: el nombre ya no suma
  ninguna traduccion, solo la descripcion. Grepear el nombre antes de escribirlo
  es la regla que este proyecto ya tiene para los precios; vale igual para los
  nombres.
- **El icono lo eligio Diego.** La primera version traia un rayo dentro de un
  circulo y el veredicto fue "es horrible". Quedo el icono de bicicleta que ya
  usa el archivo (`landing.html:328` y la tarjeta de `Basic Tune-Up`), o sea que
  **hay dos tarjetas con el mismo icono** - decidido asi a proposito, un dibujo
  reconocible repetido es mejor que uno abstracto propio.

**Verificado en Chromium** contra la rama, sin captura porque el panel del
navegador estaba cerrado - nada de esto es una afirmacion sobre pixeles:

| Camino | Resultado |
|---|---|
| Click en "Ver Todos los Servicios" | El modal pasa de `none` a `flex` |
| La tarjeta de E-bike dentro | Visible, 255px de alto, `$129` |
| Los dos botones | 46px y 48px de alto, ambos sobre 44px |
| Colores | Azul `--blue` sobre blanco y blanco sobre `--blue`: 5.17:1, pasa AA |
| Los 3 idiomas | Boton: `View All Services →` / `Ver Todos los Servicios →` / `查看所有服务 →`. Tarjeta: `E-Bike Service` / `Servicio de E-Bike` / `电动车服务` |
| "Book Now" de la tarjeta | Resuelve a `E-bike service`, o sea que preselecciona bien en el wizard |
| `npm run services:check` | `Everything in the catalog is advertised and matched` - por primera vez limpio |
| Consola en una pestaña nueva | Solo el aviso preexistente de `Custom Quote`. **Ninguno de la tarjeta nueva**: el precio lo toma de la tabla, no del HTML |

**Un susto que no era.** Durante la verificacion aparecio
`[live-prices] no Supabase match for "E-Bike Service"`, que es exactamente el
sintoma de una tarjeta despegada. Era el navegador sirviendo el
`js/live-prices.js` viejo desde cache. Se confirmo abriendo una **pestaña
nueva**, con consola limpia: el aviso no vuelve. El buffer de consola no se
vacia al recargar, asi que un aviso viejo se lee igual que uno nuevo - por eso
la pestaña nueva y no una recarga mas.

**Lo que este punto NO reviso**, y queda para quien siga: si hay otros
elementos huerfanos de la misma unificacion del 04-jul. Se busco `getElementById`
sin elemento **solo** para este caso, no en toda la pagina.

**Revisado el 2026-08-17, CERRADO - dos sesiones en paralelo llegaron al
mismo hallazgo por separado** (ver mas abajo, PR #277). Se comparo cada
`getElementById(...)` / `querySelector('#...')` de `landing.html` contra cada
`id="..."` que la pagina realmente declara (literal, `.id =` dinamico y
`setAttribute('id', ...)`). Un solo cluster real, **no relacionado con el
04-jul** - es mas viejo, de la version standalone que `landing.html` tenia de
"AI Diagnosis" antes de que ese feature se reconstruyera dentro de
`js/app.js` (`runAIDiagnosis`/`runAIDiagnosisText`/`showDiagResult`/
`autoSelectService`, todavia vivas ahi con la misma firma pero recibiendo
`screen` como primer argumento). La version de `landing.html` buscaba
`#diag-photo`, `#diag-text`, `#diag-result` y `#bk-services-list`, ninguno de
los cuatro existe en su HTML, y ninguna de las 4 funciones tenia un solo
llamador. Muerto en el mismo sentido que el flujo `bk-` de la 10.3: codigo
que quedo cuando el HTML que lo activaba se saco por otro lado. Borrado (79
lineas). No se toco `js/i18n.js`: las cadenas de copy que usaba esa version
tambien las usa la de `js/app.js`, que sigue viva. **Nota del rebase
(17-ago):** para cuando este PR se actualizo contra `main`, el punto 3.2 ya
habia movido este mismo bloque de `landing.html` a `js/landing-inline.js` -
el borrado se aplico ahi, no en `landing.html`.

## 18. Auditoria de Analytics (2026-08-11), lo que quedo sin arreglar

Salio de arreglar `suburbCoord` (PR #237). Ese punto ya esta CERRADO: las
direcciones que terminan en `", Sydney"` dejaban de resolverse al suburbio real
y caian en el CBD, porque el fallback recorria `SUBURB_COORDS` en orden de
claves y `sydney` era la primera. Afectaba al heatmap y al optimizador de rutas.
Arreglado con 13 tests, mas el conteo del heatmap que partia un suburbio en dos
circulos apilados.

**Lo de abajo NO se arreglo.** Es el mismo tipo de defecto — un dato agrupado
por el campo que casualmente este lleno — encontrado auditando el resto de la
pantalla. Ninguno es urgente. Ninguno tiene test todavia.

### 18.1 La lista "Suburbs" no usa `suburbCoord` - CERRADO (PR #252)

```js
const key = (b.suburb || '').trim() || 'Not recorded';
```

Agrupa por el texto crudo del campo. **Sin normalizar mayusculas y sin mirar
nunca la direccion.** Dos consecuencias:

- `Pyrmont`, `pyrmont` y `PYRMONT` son tres barras distintas en el mismo grafico.
- Toda reserva con `suburb` vacio cae en **"Not recorded"** aunque la direccion
  diga el suburbio. **La reserva de Thais es una de esas**: despues del #237 el
  heatmap la ubica bien, y esta lista la sigue contando como "no registrado".

El arreglo natural es usar el mismo matcher que ya existe (`suburbFromText`) y
quedarse con el nombre canonico de `SUBURB_COORDS` en vez del texto crudo. Ojo:
eso cambia las etiquetas que se ven, no solo los numeros.

**2026-08-16 (PR #252):** hecho asi. `suburbNameFromText()` salio de
`suburbFromText()` para poder devolver el NOMBRE y no las coordenadas, y la
lista agrupa por ese nombre en Title Case. Las etiquetas cambiaron, como
avisaba el parrafo de arriba: ahora se leen `Pyrmont` y `Bondi Beach`, una sola
barra por suburbio, y "Not recorded" quedo para cuando de verdad no se sabe
donde fue - ni el campo ni la direccion nombran un suburbio conocido.

### 18.2 LTV cuenta al mismo cliente dos veces - CERRADO (PR #252)

```js
const key = b.client_id || b.client_email || b.profiles?.email || b.client_name || 'unknown';
```

La identidad depende de que campo este lleno. Alguien que reservo una vez como
**invitado** (solo email) y otra **con cuenta** (`client_id`) cuenta como dos
clientes. Eso infla "Active customers" y desinfla "Avg LTV" y "Repeat rate".
Importa mas desde que existe el guest checkout (punto 14).

Peor: toda reserva sin ninguno de esos campos se agrupa bajo la clave literal
`'unknown'`, o sea **un cliente falso llamado "Client"** que acumula la
facturacion de todos ellos y puede aparecer arriba de todo en la tabla de LTV.

Arreglarlo bien pide decidir primero **que es un cliente**: probablemente email
normalizado en minusculas como clave, con `client_id` solo como desempate.

**2026-08-16 (PR #252):** Diego eligio exactamente eso. `ltvClientKey()` es
ahora la unica definicion, y la usan la tabla de LTV, la retencion de 6 meses
del scorecard y el CSV. Una reserva sin email y sin cuenta **no es un cliente**:
devuelve null y se cuenta aparte, con su plata, en el subtitulo de la tarjeta.
El cliente falso llamado "Client" ya no existe.

### 18.3 El margen es una estimacion pintada como medicion - CERRADO (PR #251, completado 2026-08-16)

```js
const cost = Math.round(d.jobs * _partsPerJob); // variable parts cost
```

Un costo de repuestos **plano por trabajo**, igual para todos los servicios. La
columna dice "Est. cost", que es honesto, pero el **% de margen** que sale de
ahi se pinta verde/ambar/rojo como si fuera un numero medido. El GST
(`rev - rev/11`) si esta bien.

Opciones: sacar el semaforo del margen estimado, o sacar el costo real de
`parts_inventory` por trabajo. La segunda es la unica que hace el numero
verdadero.

**2026-08-16 (PR #251):** se hizo lo intermedio. La tarjeta ahora **dice de
donde sale el numero** ("est. cost = $X of parts / N jobs = $Y a job"), asi que
el promedio plano deja de parecer un costo medido por servicio, y cuando no hay
gastos de repuestos cargados **no muestra ningun porcentaje**. El semaforo se
mantiene solo cuando hay un dato real detras. Sigue abierto lo unico que hace
el numero verdadero: sacar el costo por trabajo de `parts_inventory` en vez de
un promedio plano.

**CERRADO 2026-08-16 (misma fecha, sesion distinta).** El mecanico ya mandaba
que repuestos uso por trabajo (id + cantidad) al completar, pero el server
solo lo guardaba como texto libre ("2x Brake Pad") - la cantidad y el id se
usaban un instante para descontar stock y se tiraban. Ahora:

- **Migracion:** `scripts/add-parts-cost-actual.sql` agrega
  `bookings.parts_cost_actual numeric` - Diego la tiene que correr en el SQL
  editor de Supabase.
- **Servidor:** `api/auth.js` (`handleMechanicComplete`) calcula
  `qty * parts_inventory.cost_price` sumado por trabajo, en la misma pasada
  donde ya se llamaba a `decrement_part_stock`. Si la migracion no corrio
  todavia, el PATCH reintenta sin esa columna en vez de romper la
  finalizacion del trabajo (mismo patron que el resto del archivo usa para
  columnas nuevas).
- **Admin:** la tabla de margenes y el CSV (`js/admin.js`,
  `analyticsMarginsByService`) usan el costo real cuando el trabajo lo tiene,
  y el promedio plano solo para los que no. Un servicio se marca "medido"
  cuando el 100% de sus trabajos tiene costo real, "estimado" cuando ninguno
  lo tiene (el numero de siempre), "mixto" cuando es una mezcla y hay
  estimado disponible para completar el resto, y - el caso nuevo que evita
  que un margen mixto se vea mas sano de lo que se sabe - "parcial" cuando
  hay trabajos con costo real y el resto no tiene ni costo real ni estimado
  al que recurrir: ese numero se muestra con `≥` porque es un piso, no el
  total.
- **Transicion esperada, no un bug:** el dia que Diego corra la migracion,
  todo trabajo ya completado sigue en "estimado" (parts_cost_actual es NULL
  ahi para siempre - no hay forma honesta de reconstruirlo con precision
  retroactiva). Solo los trabajos que se completen DESPUES empiezan a sumar
  costo real. El numero se vuelve mas preciso con el tiempo, nunca de golpe.

**Revision post-merge (16-ago-2026, 8 agentes en paralelo sobre las 6 PRs de
Media):** encontro 3 bugs reales en `handleMechanicComplete` (`api/auth.js`)
que esta seccion arriba no menciona porque se escribieron sobre el codigo ya
mergeado, no sobre la PR: el fetch a `parts_inventory` no tenia try/catch (una
falla de red hubiera tumbado la finalizacion entera, justo lo que el
comentario de al lado decia que no podia pasar); si ese fetch fallaba sin
tirar excepcion, `partsCostActual` quedaba en `0` en vez de `NULL` -
reclamando un trabajo "medido" con costo cero que en realidad no se pudo
medir; y un id de repuesto con formato invalido rompia el filtro `in.()` para
todo el lote, no solo para si mismo. Los 3 arreglados en la misma pasada -
ver seccion 24.

---

## 19. La bici fea ya no existe, y lo que se vio al sacarla (2026-08-16)

Salio de que Diego seguia viendo la bici fea del paso 4 despues de un
Ctrl+Shift+R, con el #223 ya mergeado. **No era ni cache ni la mascara.**
Produccion servia el HTML correcto todo el tiempo: se verifico con curl que
`/`, `www`, `/landing.html` e `/index.html` devuelven el markup de la mascara y
cero copias del path viejo, para user agents de Firefox, Chrome, Edge, Safari e
iPhone — uno por uno, porque la pagina se cachea en el edge con
`Vary: User-Agent` y cada UA es una entrada distinta del CDN.

Lo que si habia era la bici fea en otros cinco lugares (#242, CERRADO) y tres
cosas que quedan abiertas.

### 19.1 El azul del logotipo: decision de marca sin tomar

El #242 dejo los logotipos de `claims/privacy/terms` con `var(--blue)`, que es
`#2563eb`. Eso es exactamente el `stroke="#2563eb"` que tenian antes, o sea que
el PR no cambio ningun color a proposito: cambio el dibujo.

Pero **la marca tiene otro azul**. El logo y los iconos de app usan `#0055de`
(decidido el 2026-08-03, ver la seccion "App icons" de `CLAUDE.md`: son dos
azules a proposito, el de la app y el del logo). Los logotipos de esas tres
paginas son logotipo, no icono de contenido, y hoy estan pintados con el azul
de la app.

Nadie decidio que esten asi: quedaron heredados. **Es una decision de Diego**,
no un bug:

- dejarlos con `var(--blue)` y aceptar que el logotipo del nav de las legales
  use el azul de la app, o
- pasarlos a `#0055de` y que el logotipo sea el azul de la marca en todos lados.

Si se elige lo segundo, el hex va con comentario: `#0055de` no es un token y no
debe serlo (misma razon que los iconos).

### 19.2 Tres paginas declaran una paleta paralela que NO coincide con los tokens

`claims.html`, `privacy.html` y `terms.html` **no cargan `css/variables.css`**.
Cada una abre su propio `:root` con nombres y valores propios, y no son los
tokens:

| Concepto | `css/variables.css` | Las tres legales | ¿Igual? |
|---|---|---|---|
| azul | `--blue: #2563eb` | `--blue: #2563eb` | si |
| azul oscuro | `--blue-dark: #1e40af` | `--blue-dark: #1d4ed8` | **NO** |
| azul claro | `--blue-lt: #eff6ff` | `--blue-light: #eff6ff` | valor si, nombre no |
| texto oscuro | `--navy: #0d1f3c` | `--dark: #111827` | **NO**, nombre y valor |
| texto gris | `--gray: #475569` | `--gray: #6b7280` | **NO** |
| gris claro | `--gray-lt: #94a3b8` | `--gray-light: #f9fafb` | **NO**, son cosas distintas |
| borde | `--border: #e2e8f0` | `--border: #e5e7eb` | **NO** |
| blanco | `--white: #ffffff` | `--white: #ffffff` | si |

`#111827` y `#e5e7eb` son justo los dos valores que `CLAUDE.md` documenta como
el error historico del 12.14 (la tabla del skill de diseño los dio por tokens
durante meses). Siguen vivos aca.

**Esto contradice lo que dice `CLAUDE.md` hoy**: *"Every surface now resolves
every token to the same value, so any page is a valid reference"*. Es cierto
para las cinco superficies de la app; no lo es para estas tres. Quien lea esa
frase y tome `terms.html` de referencia se lleva `--gray: #6b7280`.

El arreglo natural es cargar `css/variables.css` en las tres y borrar el
`:root` propio, pero **cambia pixeles**: el gris del cuerpo pasaria de `#6b7280`
a `#475569` y el borde de `#e5e7eb` a `#e2e8f0`. Es el mismo trabajo que ya se
hizo con `track.html` (`fix/track-loads-the-tokens`) y con `css/landing.css`, y
conviene hacerlo igual: un PR por superficie, mirando la pagina antes y despues.

### 19.3 El ratchet de color tiene un agujero de 7 paginas

`scripts/color-check.mjs` cubria las cinco superficies por nombre y las 60
generadas por `generatedPages()`. **Siete paginas de la raiz no las miraba
nadie.** Conteo a mano contra un grep simple (`#[0-9a-fA-F]{3,6}`):

| Pagina | Hex a mano (grep) | Carga `variables.css` |
|---|---|---|
| `business.html` | 41 | si |
| `bike-check.html` | 40 | si |
| `cycling-map.html` | 32 | si |
| `terms.html` | 24 | **no** (19.2) |
| `privacy.html` | 21 | **no** (19.2) |
| `applepay.html` | 15 | **no** |
| `claims.html` | 11 | **no** (19.2) |

**CERRADO 2026-08-16.** Las 7 se agregaron al `BUDGET` de
`scripts/color-check.mjs`. El numero real que uso el script **no** es el grep
de la tabla de arriba: `colours()` no cuenta la definicion de un custom
property (`--nombre: #hex`) como un uso, y `terms.html`/`privacy.html`/
`claims.html` declaran su propio `:root` local (19.2) - asi que su budget real
quedo mas bajo que el grep. Numeros que efectivamente uso el script, sacados
corriendo el chequeo con un budget alto y leyendo cuanto "mejoro":
`business.html` 41, `bike-check.html` 40, `cycling-map.html` 32, `terms.html`
**16** (no 24), `privacy.html` **13** (no 21), `applepay.html` 15,
`claims.html` **3** (no 11). No se convirtio ni un hex: es un ratchet, el
budget es lo que hay hoy, no una meta.

### 19.4 Lo que NO se verifico, en ninguno de los dos PRs

Ni el #223 ni el #242 miraron pixeles. Lo verificado es el HTML y el CSS que
sirve el servidor (por HTTP, contra produccion y contra el preview del PR), que
el PNG responde 200 y es byte a byte identico al del repo, y que
`images/bike-icon.png` es RGBA con canal alfa real: 78.5% transparente, silueta
de bici, no un cuadrado opaco — decodificado y reescalado a 28x21 la bici se
lee. Eso descarta la clase de fallas que estabamos buscando, pero **nadie miro
las cinco marcas nuevas renderizadas**. Si alguna quedo desalineada respecto al
texto del logo, se ve a simple vista y no lo agarra ningun test.
## 20. Segunda pasada sobre Analytics y Finanzas (2026-08-16)

Salio de cerrar el resto de `suburbCoord` (PR #244: el `", Sydney"` ya estaba
arreglado en `main`, pero el desempate por largo de nombre mandaba
`"123 Parramatta Rd, Ashfield"` a Parramatta, 25 km al oeste). Lo de abajo es
lo que aparecio auditando las otras tarjetas de la pantalla. **Nada de esto se
arreglo.** El punto 18 sigue abierto tal cual; esto se suma, no lo reemplaza.

Ordenado por lo que mas cambia un numero que Diego mira.

### 20.1 El margen de Analytics dice 100% hasta que se abre Finanzas - CERRADO (PR #251)

`renderMargins()` calcula el costo asi:

```js
const cost = Math.round(d.jobs * _partsPerJob);
const net = d.rev - Math.round(d.rev / 11); // ex-GST
const margin = net > 0 ? Math.round(((net - cost) / net) * 100) : 0;
```

`_partsPerJob` arranca en `0` y **el unico lugar que lo escribe es
`loadFinance()`**. Analytics y Finanzas son dos pantallas distintas del panel:

- Entrar directo a Analytics (lo normal: se clickea Analytics en el menu) deja
  `_partsPerJob = 0`, o sea `Est. cost = $0` y **`Margin = 100%` en verde para
  todos los servicios**. No es una estimacion optimista: es la ausencia del
  dato pintada como un resultado.
- Si antes se abrio Finanzas, la tabla usa el `parts / jobs` **de ese mes
  concreto** y lo aplica a la tabla de margenes, que es **de toda la vida**
  ("lifetime, not filtered by the range above", lo dice la propia tarjeta).
  Cambiar el mes en Finanzas cambia los margenes historicos de Analytics.

El mismo `_partsPerJob` alimenta la seccion MARGINS del CSV
(`exportAnalyticsCSV`), asi que el archivo exportado hereda el mismo numero.

Esto es distinto del 18.3. El 18.3 dice que el costo plano por trabajo es una
estimacion; esto dice que ademas **depende de por donde entraste al panel**.

Arreglo minimo y honesto: que la tarjeta no muestre porcentaje cuando
`_partsPerJob === 0` y diga "cargar gastos en Finanzas para ver el margen", en
vez de un 100% verde.

### 20.2 Si falla la consulta de Finanzas, la pantalla dice que no hubo trabajo - CERRADO (PR #250)

```js
const { data: bookings } = await sb.from('bookings')...
const jobs = bookings || [];
```

`loadFinance()` **no lee `error` ni una sola vez**. Una caida de red, una
sesion vencida o un cambio de RLS producen exactamente la misma pantalla que un
mes sin trabajos: revenue $0, 0 jobs, P&L en cero, BAS en cero. Es la regla
"No silent errors" del CLAUDE.md, y Analytics ya lo hace bien al lado
(`failures[]` + el cartel `an-error`). Vale para `loadCashHandover()` tambien.

### 20.3 El BAS reclama $0 de credito de GST aunque ya haya gastos cargados

```js
document.getElementById('bas-1b').textContent = '$0'; // no GST on purchases yet
```

El comentario quedo viejo: desde que existe la tabla `expenses` **si hay
compras** (repuestos, fleet, software, seguros). El 1B en cero significa que el
BAS de la pantalla **muestra mas GST a pagar del que corresponde**. No es un
error de display: es el numero que se copia a la declaracion.

Ojo antes de tocarlo: no todo gasto trae credito de GST (un seguro puede venir
input-taxed, un pago a un proveedor sin ABN no da credito), asi que esto pide
una decision del contador, no una formula. Mientras tanto el 1B deberia decir
"pendiente de cargar", no "$0".

### 20.4 Analytics y Finanzas fechan la plata en dias distintos - CERRADO (PR #250)

- Analytics: `anCompletedInRange()` usa `completed_at || created_at`, y el
  comentario del archivo dice explicitamente que la facturacion se reconoce
  cuando el trabajo termina.
- Finanzas y BAS: filtran por `scheduled_date` (`gte`/`lte`).

Un trabajo agendado el 31 de julio y completado el 2 de agosto cae en julio en
una pantalla y en agosto en la otra. Con un solo trabajo al mes esto es
invisible; a fin de trimestre es la diferencia entre dos BAS. Hay que elegir
una definicion y que las dos pantallas la usen (probablemente `completed_at`,
que es lo que ya esta documentado como la regla).

**Los dos se arreglaron el 2026-08-16 (PR #250).** Diego eligio `completed_at`
para las dos pantallas, que ademas es la regla que el codigo ya documentaba.
Los limites del rango se mandan como instantes construidos desde la medianoche
LOCAL: mandar `'YYYY-MM-DD'` contra una columna timestamptz sacaba del mes a
todo trabajo terminado antes de las 10 de la manana en Sydney. Y una consulta
fallida ahora vacia los KPI y el BAS y dice que no se leyo nada, en vez de
mostrar ceros.

### 20.5 "New this month" en Clientes se pierde las altas de esa misma manana - CERRADO (PR #248)

```js
const thisMonth = new Date();
thisMonth.setDate(1);
if (kpis[2]) kpis[2].textContent = data.filter((c) => new Date(c.created_at) > thisMonth).length;
```

`setDate(1)` cambia el dia pero **no la hora**: el corte queda en "1 del mes a
la hora actual". Mirando el panel un dia 1 a las 18:00, todo el que se registro
esa manana no se cuenta. Falta `thisMonth.setHours(0, 0, 0, 0)`, que es
exactamente lo que si hace `anRangeStart()` en Analytics.

### 20.6 `loadClients()` no pone limite y el KPI "Total clients" puede ser un piso - CERRADO (PR #248)

```js
const { data, error } = await sb.from('profiles').select('*').order('created_at', ...)
```

Sin `.limit()`. PostgREST corta en su `max-rows` si el proyecto lo tiene
configurado, y el panel no tendria forma de notarlo: la grilla y los tres KPI
mostrarian el numero cortado como si fuera el total. Analytics ya se cuida de
esto (pide 20.000 perfiles y avisa si llega al tope).

**Verificar primero cuanto es el `max-rows` del proyecto** (Supabase >
Settings > API). Si esta en 1000, esto ya esta mordiendo o va a morder pronto,
y no solo aca: `loadAnalytics()` pide `.limit(20000)` pero un `max-rows` mas
bajo gana igual, y su aviso ("solo se leyeron los primeros 20.000") nunca se
dispara porque compara contra 20.000.

**Los dos se arreglaron el 2026-08-16 (PR #248).** Los tres contadores de
Clientes ahora los cuenta la base con `count: 'exact', head: true`, hay una
`startOfMonth()` con tests que si pone la hora en cero, y el aviso de truncado
de Analytics compara contra el conteo real en vez de contra el `.limit()` que
pidio - antes esa condicion era falsa siempre si el `max-rows` del proyecto era
menor, o sea que el aviso no podia aparecer nunca.

Y **la pregunta que 20.6 dejaba abierta - cuanto vale el `max-rows` - ya no hace
falta contestarla**: no queda ningun numero en pantalla que dependa de ese
valor.

### 20.7 Los CSV se pueden abrir como formula en Excel - CERRADO (PR #252)

`exportAnalyticsCSV()` y `exportFinanceCSV()` escapan comillas, que es lo que
hace falta para que el CSV sea valido, pero un valor que empieza con `=`, `+`,
`-` o `@` lo ejecuta Excel al abrirlo. Los valores salen de campos que escribe
gente (nombre de servicio, nombre de cliente). Riesgo bajo porque los abre
Diego y nadie mas, pero se arregla con un apostrofe adelante y no vuelve a
mirarse.

**2026-08-16 (PR #252):** hecho, con un `csvCell()` que usan los tres
exportadores. De paso aparecio algo peor que la inyeccion: `exportFinanceCSV()`
no entrecomillaba **nada** - unia los valores con comas - asi que un cliente
llamado "Smith, John" corria una columna todo lo que venia despues. Eso tambien
quedo arreglado.

### 20.8 Lo que esta pasada NO cubrio

- No se verificaron los numeros contra la base: no hay acceso SQL desde esta
  sesion. Todo lo de arriba sale de leer el codigo, no de comparar totales.
- La tarjeta Traffic (PostHog) y la de Checkout dependen de `/api/analytics`,
  que no se audito.
- El Dashboard (`loadDashboard`) quedo afuera.

**CERRADO 2026-08-16.** Se audito `handleAdminAnalytics` (`api/auth.js`,
Traffic + Checkout + reconciliacion) y `loadDashboard()` (`js/admin.js`)
completos, linea por linea. Misma limitacion que la pasada anterior: sin
acceso SQL, todo sale de leer el codigo, no de comparar contra la base.

**`/api/analytics` (Traffic, Checkout, reconciliacion): no aparecio nada
nuevo para arreglar.** Ya maneja con cuidado los casos honestos - null
cuando una query falla vs. array vacio cuando no hay datos, truncamiento de
Stripe declarado en vez de escondido, tabla `checkout_attempts` faltante
detectada por codigo de error en vez de leida como "cero abandonos",
`scrubKeys()` en cualquier error que se le devuelve al navegador. Un
resultado negativo de auditoria (revisado, nada que corregir) sigue siendo
un resultado.

**`loadDashboard()` (Dashboard del admin): 2 hallazgos, los dos CERRADOS
en esta misma sesion:**

1. **La tabla "Recent bookings" era codigo muerto.** `#page-dashboard` solo
   tiene una tabla `.tbl` en el DOM (la de "Today's bookings",
   `#dash-today-tbody`). El bloque que pintaba los 5 bookings mas recientes
   escribia en `document.querySelector('#page-dashboard .tbl tbody')` -
   el MISMO elemento - y el bloque de "Today's bookings" que corria justo
   despues lo pisaba antes de que el navegador pintara un frame. La query
   que lo alimentaba (`select('*').order('created_at',...).limit(5)`) era
   un viaje de red completo para un resultado que nadie iba a ver nunca.
   Se elimino el bloque entero y su query - el contenido que el admin ve
   no cambia (siempre fue "Today's bookings" el que ganaba).
2. **"Total clients" tenia el mismo bug que el 20.6 (PR #248) ya habia
   cerrado en la pantalla de Clientes.** `sb.from('profiles').select('id')`
   traia CADA fila de perfil solo para contar `.length` - sin el limite
   explicito de Supabase (1000 filas por default), ese numero se
   convertiria en un piso silencioso pasado ese punto, exactamente el bug
   que el 20.6 encontro y arreglo en otra pantalla. Las dos KPIs de al lado
   (newsletter, bikes) ya usaban `{ count: 'exact', head: true }` - el
   Dashboard nunca se actualizo a ese patron. Ahora si.

---

## 21. El boton "Block availability" del admin nunca escribio nada - CERRADO (PR #253)

Encontrado tirando del hilo del reschedule roto (PR #246) y del hecho de que
ninguna reserva bloqueaba su horario (PR #247). Es la tercera cara del mismo
problema de fondo: **en este sistema conviven dos vocabularios de hora y nadie
los traduce**. Este NO se arreglo, porque el arreglo necesita una decision
sobre el esquema.

### 21.1 Escribe una columna que no existe

`saveBlocks()` en `js/admin.js` hace:

```js
const rows = slots.map((time) => ({
  date, time_slot: time, van_number: van || null, blocked: true, reason: reason || null,
}));
await sb.from('availability').upsert(rows, { onConflict: 'date,time_slot,van_number' });
```

**Verificado contra la base de produccion** (con la anon key, misma que usa el
panel):

```
GET /rest/v1/availability?select=time_slot,available  ->  200 []
GET /rest/v1/availability?select=time_slot,blocked    ->  42703
   "column availability.blocked does not exist"
```

O sea: la columna se llama `available`, no `blocked`. El upsert falla, entra
por el `if (error)` y sale un toast rojo. **Nunca se escribio una fila.**
Diego bloquea un dia y el dia sigue reservable.

### 21.2 Y si escribiera, tampoco coincidiria

El lector (`handleGetAvailability` en `api/auth.js`) compara asi:

```js
const manualUnavailable = new Set((overrides||[]).filter(r => !r.available).map(r => r.time_slot));
...
if (manualUnavailable.has(time)) available = false;   // `time` sale de ALL_SLOTS
```

`ALL_SLOTS` son etiquetas de 12 horas (`'8:00 AM'`). El modal del admin ofrece
`'8:00'`, `'8:30'`, `'9:00'`... en 24 horas y cada media hora. **Ningun string
coincide nunca.** Ademas, media hora no corresponde a ningun slot: si Diego
bloquea las 8:30, hay que decidir si eso cierra el slot de las 8:00.

### 21.3 Y el bloqueo por van se aplica a todas

`handleGetAvailability` lee los overrides del dia **sin filtrar por
`van_number`**, asi que un bloqueo de la van 1 tambien tapa la van 2. El modal
deja elegir van, o sea que la UI promete algo que el backend no hace.

### 21.4 Que hace falta para cerrarlo

Tres decisiones, no una linea de codigo:

1. Confirmar el default de `availability.available` y si existe el indice unico
   `(date, time_slot, van_number)` que el `onConflict` da por hecho. Si no
   existe, el upsert sigue fallando aunque se arregle el nombre de la columna.
   Runbook: `docs/RUNBOOK-SQL.md`.
2. Elegir UN formato de hora para `time_slot` y que las dos puntas lo usen.
   Lo natural es guardar 24h (`'08:00'`) y comparar por minutos, no por string
   - `slotToMinutes()` ya sabe leer los dos desde el PR #247.
3. Decidir que hace un bloqueo de media hora, y si el `van_number` del bloqueo
   debe respetarse (parece que si, la UI lo ofrece).

**CERRADO el 2026-08-16 (PR #253).** Diego eligio el modelo A: un bloqueo tapa
el horario entero, sin preguntar por servicio.

- `scripts/fix-availability-blocks.sql` saca el NOT NULL de `service_id`, pasa
  `van_number` a 0 = "todas las vans" (NULL nunca choca con NULL en un indice
  unico, asi que el upsert insertaba duplicados en vez de actualizar) y crea la
  clave unica `(date, time_slot, van_number)` contra la que el panel hace
  `onConflict`. **Hay que correrlo antes de que el boton sirva.**
- `saveBlocks()` escribe `available: false`; `unblockDate()` filtra por la
  misma columna.
- El lector convierte cada bloqueo en un intervalo ocupado, igual que una
  reserva, asi que se comparan minutos y no strings: se acabo el desencuentro
  `'8:30'` contra `'8:00 AM'`. Un bloqueo de media hora choca con el trabajo
  que seguiria corriendo encima, y `van_number` se respeta.

### 21.5 El PR #253 arreglo el codigo y se olvido de bumpear el `?v=` — CERRADO

Diego probo el boton en produccion el mismo 16-ago (la primera corrida real
del punto 21 en la seccion 23.1) y **el mismo error de siempre**: toast rojo
`Could not find the 'blocked' column of 'availability' in the schema cache`,
un POST 400 contra Supabase con `"blocked"` en la lista de columnas.

**No era el mismo bug.** `js/admin.js` en `origin/main` ya escribe
`available: false` desde el PR #253 (verificado leyendo el archivo linea por
linea). Lo que corria en el navegador de Diego era el `admin.js` de ANTES del
PR: `admin.html:1430` carga `<script src="js/admin.js?v=20260801">`, y el
PR #253 modifico `js/admin.js` sin tocar ese `?v=`. `sw.js` sirve el JS propio
stale-while-revalidate por URL exacta (ver su propio comentario de cabecera);
con la query sin cambiar, la entrada cacheada de antes del PR seguia
ganandole a la primera carga.

**Arreglado:** `?v=20260801` -> `?v=20260816`. Es la misma clase de bug que el
`?v=` de `js/i18n.js` que `CLAUDE.md` ya prohibe tocar, pero mas general: pasa
con **cualquier** `<script src="...?v=...">` que se edite sin bumpear su
propia query, no solo con modulos ES. `mechanic.html` ya tiene el habito
correcto (14.11 bumpeo sus dos `?v=` al mergear). `admin.html` no lo tenia.

**Verificado en codigo, no en navegador todavia:** que `handleGetAvailability`
(`api/auth.js`) y `buildBlockIntervals` leen `available`/`van_number` y
convierten con `slotToMinutes()` es correcto por lectura del archivo. La
reserva del cliente (`js/app.js` -> `getAvailableSlots()` en `js/supabase.js`)
pega al mismo endpoint, asi que un bloqueo real ya deberia excluir el horario
en la SPA movil y en el wizard de desktop sin tocar nada mas - **falta que
Diego repita la prueba con la cache correcta** para confirmarlo.

### 21.6 `availability.reason` nunca existio - necesita SQL

Con el `?v=` de 21.5 arreglado, Diego repitio la prueba y **cambio el error**:
`Could not find the 'reason' column of 'availability' in the schema cache`.
Distinto sintoma, mismo tipo de bug: `saveBlocks()` manda `reason` en el
`upsert` desde siempre (ya estaba en el payload roto de 21.1), pero **ningun
script de `scripts/*.sql` crea esa columna** - ni siquiera
`fix-availability-blocks.sql`, que solo toco `service_id`, `van_number` y el
indice unico. `tests/unit/availability-blocks.test.js` tampoco cubre
`reason`, asi que nada lo iba a agarrar antes de produccion.

**Arreglo: `scripts/add-availability-reason.sql`** (`alter table
public.availability add column if not exists reason text;`, idempotente).
Sumado a `docs/RUNBOOK-SQL.md` como los items **39** (`fix-availability-blocks.sql`,
que faltaba en el runbook) y **40** (este). **Diego tiene que correr el 40 en
el SQL Editor de Supabase antes de repetir la prueba por tercera vez.**

### 21.7 `availability` nunca tuvo policies de admin - tercer y ultimo SQL

Con el 21.6 corrido, Diego probo por tercera vez: **cambio el error otra
vez**, ahora `403 new row violates row-level security policy for table
"availability"`. `saveBlocks()` y `unblockDate()` escriben con la sesion
autenticada del admin (no la service key), igual que `van_zones` - pero
`availability` **nacio con el PR #253, semanas despues** de
`harden-security-2026-07-17.sql`, el script que le puso policies de admin a
`bookings`, `discount_codes` y `van_zones`. Nunca la incluyo porque no
existia todavia. RLS quedo encendido sin ninguna policy de escritura: acceso
denegado por defecto para todo el mundo, admin incluido.

**Arreglo: `scripts/add-availability-rls.sql`**, mismo patron exacto que
`van_zones_admin_write/update/delete` de `harden-security-2026-07-17.sql`:
4 policies (`select`/`insert`/`update`/`delete`) que solo dejan pasar a un
usuario autenticado cuyo `profiles.role` sea `'admin'`. El lector server-side
(`api/auth.js`, service key) no lo necesita y no lo toca este script. Sumado
al runbook como item **41**.

**Tres SQL en cadena para un boton que "ya estaba cerrado" (PR #253, 16-ago):**
columna que no existia (21.1/21.5-cache), columna que faltaba (21.6), y ahora
RLS sin policies (21.7). Los tres eran invisibles desde el codigo o los tests
- ninguno corre contra la base real. **La leccion que ya escribio la seccion
22.1 sobre los dos vocabularios de hora vale otra vez aca: sin probar contra
produccion, "cerrado" es una hipotesis, no un hecho.**

### 21.8 El bloqueo nunca impedia una reserva - solo tapaba la lista

Diego probo end-to-end el 17-ago (ya con 21.5-21.7 corridos): el toast decia
"3 slots blocked", pero el horario seguia figurando disponible para el
cliente. **No era un cuarto bug de guardado - la base tiene 2 vans, no una.**

`handleGetAvailability` contesta "¿hay AL MENOS UNA van libre?" (esta
verificado con sus propios tests, es el comportamiento correcto para esa
lista). Bloquear la Van 1 no saca el horario de la oferta si la Van 2 sigue
libre. Eso ya era medio esperable - lo que no lo era: **leyendo el codigo,
`handleCreateBooking` nunca consulta `availability` en absoluto.**
`matchVanZone()` ya sabe a que van especifica pertenece la direccion del
cliente, pero nada comprobaba si ESA van estaba bloqueada antes de crear la
reserva (y cobrar). Un cliente de la zona de la Van 1 podia reservar el
horario que Diego se habia bloqueado, sin que nada lo frenara del lado del
servidor - el bloqueo era una sugerencia visual, no una regla.

**Arreglado en `api/auth.js`:** nueva funcion `isSlotBlocked(blockRows,
vanNumber, timeSlot, neededMin)`, que reusa `buildBlockIntervals`/
`slotToMinutes` pero para UNA sola van (la que `matchVanZone` ya resolvio),
no "cualquiera". `handleCreateBooking` la llama antes de armar la reserva y,
si la van esta bloqueada a esa hora, rechaza con 409 y reembolsa el pago si
ya se habia cobrado - mismo patron que ya usa esa funcion para "el horario se
lo llevaron entre el pago y el insert" (el choque de `bookings_unique_slot`).

7 tests nuevos en `tests/unit/availability-blocks.test.js` (incluye "otra van,
sin bloqueo propio, si puede - aunque la 1 este cerrada", que documenta a
proposito que esto es distinto de `computeAvailableSlots`, no una correccion
de ese). Suite completa 364/364.

**No verificado en produccion todavia:** que un intento de reserva real
contra un horario bloqueado efectivamente rebote con el mensaje correcto.

### 21.9 El calendario del admin nunca mostraba un bloqueo, en ninguna vista

Diego probo Block slots en produccion el 17-ago (ya con 21.5-21.8 en `main`)
y reporto dos cosas juntas:

1. Despues de bloquear, Day/Week/Month seguian diciendo "Free" - **ninguna
   vista consultaba `availability`**, solo `bookings`. El guardado andaba
   perfecto (confirmado por SQL), pero no habia forma de verlo sin abrir el
   SQL Editor.
2. En Day view, **Prev/Next no navegaban nunca**.

**Causa del 1.** Las tres vistas comparten `loadCalendar()`, y ese Promise.all
solo pedia `bookings`. `availability` nunca entraba a la consulta.

**Causa del 2, y no tiene nada que ver con la 1.** `loadCalendar()` corria
`calWeekStart = startOfWeek(new Date(calWeekStart))` **sin condicion**, para
las tres vistas. `calPrev()`/`calNext()` mueven `calWeekStart` +-1 dia y
llaman a `loadCalendar()` - que en Day view snapeaba ese valor de vuelta al
lunes de esa semana antes de pintar nada, deshaciendo el movimiento. Week
view no lo notaba porque navega de a 7 dias, que siempre cae en otro lunes -
el mismo snap ahi es un no-op.

**Arreglado:**
- El snap a lunes ahora es `if (calView === 'week') ...` - Day deja de
  perder su propia fecha.
- `loadCalendar()` pide `availability` junto con `bookings` en las tres
  vistas (`available = false`, mismo rango de fechas visible).
- **Month:** un badge `🚫 N blocked` por dia, antes de los jobs.
- **Week/Day:** cada horario bloqueado se lista con su van y el motivo,
  arriba de los jobs del dia. "Free" solo aparece cuando el dia no tiene
  ni jobs ni bloqueos.

7 tests nuevos de fuente en `tests/unit/calendar-shows-blocks.test.js`
(`js/admin.js` es un script clasico, se verifica leyendo el archivo, mismo
patron que 21.1-21.8). Suite completa 380/380.

**No verificado en navegador:** `admin.html` autentica contra `/api/auth`,
que no corre en un servidor estatico local - falta que Diego lo vea
renderizado en produccion.

### 21.10 El PR de 21.9 se olvido del `?v=` - el mismo bug de 21.5, otra vez

Diego probo el PR de 21.9 en produccion y no vio nada: ni los badges de
bloqueo, ni Day navegando, y ademas la semana se le abria en septiembre en
vez de la semana actual. Las tres cosas tenian **una sola causa**: el PR
edito `js/admin.js` (74 lineas) y no bumpeo el `?v=` de `admin.html` -
exactamente el bug de 21.5, en el mismo archivo, el mismo dia. `sw.js` siguio
sirviendo el `admin.js` de antes del PR; el navegador de Diego nunca vio el
codigo nuevo. (La semana en septiembre fue una segunda causa encima:
`calWeekStart` es una variable de modulo que no se resetea sola, asi que una
pestaña abierta hace rato con clicks viejos en Next arrastraba ese valor -
se resuelve solo con una recarga real una vez que el `?v=` fuerza a
descargar el archivo correcto).

**Arreglado, y esta vez con guardarropa para que no sea la tercera:**
`admin.html` ahora carga `js/admin.js?v=825cc0e187` - **un hash del propio
contenido del archivo**, no una fecha escrita a mano. `scripts/admin-js-version-check.mjs`,
sumado a `npm run check`, recalcula ese hash y falla si no coincide con lo
que dice `admin.html`, imprimiendo el valor exacto para pegar. Ya no depende
de acordarse: **o el hash coincide, o `npm run check` no pasa.** Verificado
rompiendolo a proposito (?v= viejo a mano) antes de mergear: falla con el
mensaje correcto. Regla anotada en `CLAUDE.md`.

`js/mechanic.js` y `js/app.js` siguen con el bump manual (14.11 ya documento
el patron para `mechanic.html`) - no les toco nada, porque esta clase de bug
todavia no les paso a ellos. Si le pasa, mismo arreglo.

### 21.11 Los bloqueos aparecian en el dia equivocado del Month view

Con el `?v=` ya arreglado (21.10), Diego confirmo Week y Day funcionando
bien - los 3 horarios bloqueados del miercoles 19 se ven con su van y motivo,
y Day navega. Pero en Month view el badge "3 blocked" salia en el **jueves
20**, no en el miercoles 19: entrando a Day view del 20 no habia nada.

**Causa, y no era la cache esta vez.** `dateStr = cur.toISOString().split('T')[0]`
convierte a UTC antes de cortar la fecha. Sydney es UTC+10/11: la medianoche
local cae en el dia UTC **anterior**. `cur` en Month view se arma con
`new Date(year, month, day)`, que es siempre medianoche local exacta, asi
que el dato queda sistematicamente un dia atrasado - la celda que **muestra**
"20" (`cur.getDate()`, ya local) filtraba `availability`/`bookings` con la
fecha "19" (`cur.toISOString()`, corrida a UTC). Bloqueos del 19 aparecian
bajo el "20".

**Por que Week/Day no lo mostraban (aun con el mismo patron de codigo):**
`calWeekStart` arranca en `new Date()` - la hora exacta en que se cargo la
pagina, no medianoche - y esa hora del dia se arrastra en cada
`setDate()`. Si esa hora cae despues de medianoche+offset (en Sydney,
aprox. desde las 10 AM en adelante), la conversion a UTC no cruza al dia
anterior y el bug queda invisible. Es el mismo defecto, disimulado por la
hora en que Diego abrio la pestaña - habria aparecido igual si la abria
temprano a la mañana.

**Arreglo:** `calDateStr(d)` nueva, lee `getFullYear()/getMonth()/getDate()`
directo del objeto Date - **sin pasar por UTC en ningun momento** porque esos
campos ya son locales. Reemplaza los 8 usos de `.toISOString().split('T')[0]`
dentro de `loadCalendar()` (Month, Week y Day: `dateFrom`, `dateTo`, `today`,
`dateStr`, en las tres vistas). No se toco ningun otro `toISOString()` del
archivo - los que quedan son timestamps reales (`cash_settled_at`,
`completed_at`), no fechas de calendario, y no es el mismo bug.

**De paso, lo que pidio Diego:** un tooltip al pasar el cursor sobre el badge
"N blocked" del Month view, sin click - lista cada horario bloqueado con su
van y el motivo. CSS puro (`:hover` + `:focus-within` para teclado), sin
`onclick` ni `onmouseover` inline (regla del proyecto). Nueva seccion en
`css/admin.css`.

**Al tocar `css/admin.css`, el mismo bug de cache que 21.10 ya era posible
para ESTE archivo tambien** - `admin.html` lo carga con su propio `?v=`,
nunca antes verificado. Se renombra `scripts/admin-js-version-check.mjs` a
**`admin-assets-version-check.mjs`** y ahora cubre `js/admin.js` **y**
`css/admin.css` con el mismo hash-en-vez-de-fecha.

11 tests nuevos/actualizados (`calDateStr` se extrae y se ejecuta de
verdad, no solo se busca en el texto). Suite completa 384/384.

**No verificado visualmente:** el sandbox de este entorno no puede simular
`:hover` sobre `admin.html` (necesita `/api/auth`, y los archivos fuera del
proyecto no son interactivos aca) - falta que Diego pase el cursor sobre un
badge real.

## 22. Estado al cerrar el 16-ago-2026

Un dia entero sobre Analytics, Finanzas y la reserva. **10 PRs mergeadas y
verificadas en produccion**, no solo mergeadas.

### 22.1 La causa de fondo, que valia por cuatro bugs

La app llevaba **dos vocabularios de hora y nadie los traducia**:

| donde | formato |
|---|---|
| `/api/auth?role=get-availability` | etiquetas de 12h: `"8:00 AM"` |
| `bookings.scheduled_time` | columna `time`, PostgREST devuelve `"10:00:00"` |
| el modal de bloqueos del admin | 24h y media hora: `'8:30'` |

De ahi salieron, todos en produccion al mismo tiempo:

- **El reschedule del cliente fallaba SIEMPRE** (#246). Mandaba la etiqueta a
  un endpoint que valida `HH:MM`. Comprobado contra produccion: `"12:00 PM"`
  daba 400 y `"12:00"` pasaba.
- **Ninguna reserva bloqueaba su propio horario** (#247). `slotToMinutes`
  devolvia -1 para el formato de la base, asi que el mismo horario se le
  seguia ofreciendo al cliente siguiente. Los tests no lo agarraban porque
  solo le daban el formato que la base nunca manda.
- **El boton de bloquear disponibilidad nunca guardo una fila** (#253).
- Y de yapa, la tarjeta mostraba `10:00:00` al cliente.

**La leccion, escrita para la proxima:** cuando escribas un test de algo que
toca la base, alimentalo con **la forma que devuelve la base**, no con la
que usa el codigo de al lado. La suite estuvo verde meses sobre una funcion
que en produccion devolvia -1 siempre.

### 22.2 Lo que queda abierto

*Tabla del 16-ago, dejada tal cual por ser un registro de "el estado al
cerrar ese dia". Al 17-ago: **18.3 y 20.8 ya estan CERRADOS** (ver 22.4 y sus
propias secciones); **21 sigue abierto pero con mucho mas encima** (ver
21.5-21.8, no es "un click" nada mas); **20.3 sigue igual**, sin tocar.*

| # | que es | quien lo desbloquea |
|---|---|---|
| **21** | bloquear un horario y comprobar que desaparece de la reserva | **Diego, un click.** El SQL ya corrio y el codigo esta vivo; falta apretar el boton contra la base real |
| **20.3** | el BAS reclama $0 de credito de GST con gastos cargados: muestra mas GST a pagar del que corresponde | **el contador.** Que gasto da credito no es una decision de codigo |
| **18.3** | el margen es un promedio plano de repuestos por trabajo | codigo, cuando se saque el costo real de `parts_inventory` |
| **20.8** | `/api/analytics` (Traffic y Checkout) y `loadDashboard()` | nadie los auditó todavia |

### 22.3 Como esta el repo

- `main` en el merge de #253. **352 tests**, `npm run check` y `npm run lint`
  limpios.
- `availability` migrada a mano el 16-ago con
  `scripts/fix-availability-blocks.sql` (ver `docs/RUNBOOK-SQL.md` 9).
- Los numeros de Analytics ya no dependen del `max-rows` del proyecto: los
  contadores los cuenta la base con `count: 'exact'`.

### 22.4 Auditoria completa de las 22 secciones, y reparto en 3 frentes (16-ago-2026)

**Se releyeron las 22 secciones de punta a punta, no solo esta.** Contando
cada hallazgo numerado (### N.M) del documento: **unos 103 en total, ~70
CERRADOS/HECHOS y ~33 abiertos.** El conteo es aproximado a proposito - varias
subsecciones son explicativas ("CAUSA RAIZ de...", "Lo que NO cubrio esta
auditoria") y no un item accionable en si mismo.

**Dos correcciones que salieron de esta misma pasada, ya aplicadas arriba:**
la tabla "Salud del proyecto" decia 2026-07-27/08-01 y ya no era cierta desde
hace semanas (`npm run check`/`vitest` corridos de nuevo el 16-ago: **38 JS,
1024 claves i18n, 352 tests**); y el punto **2.5** decia "sin empezar" cuando
`bkProceed()` ya no existe en el repo desde hace tiempo - nadie habia vuelto a
cerrar esa seccion.

**Los 33 abiertos se repartieron en 3 prioridades para trabajarlos en 3 chats
en paralelo**, cada uno en su propio worktree/rama desde `origin/main`, sin
tocar los items de las otras dos listas. Esta es la version viva del reparto:
cuando un item se cierra, se marca CERRADO en su propia seccion de origen (no
aca), con la misma disciplina que ya usa el resto del documento.

> **22.4.1 - esta seccion quedo desactualizada en menos de 24 horas, y se
> corrigio parcialmente el 17-ago.** Ver el detalle completo despues de las 3
> tablas. Resumen: los 6 items de Media de abajo ya estan CERRADOS (una
> sesion los cerro el 16/17-ago, ver cada seccion propia); en Baja, 3.3, 10.2
> y 10.4 tambien. En Alta, el 21 sigue abierto pero con mucho mas trabajo
> encima del que esta tabla sugiere - ver 21.5 a 21.8. **Las filas de abajo
> se dejan tal como se escribieron el 16-ago, a proposito, para que quede el
> registro de que decia el reparto original** - el estado real esta marcado
> en negrita cuando se conoce, y la regla de siempre aplica: la seccion
> propia de cada item, no esta tabla, es la que manda.

**Prioridad Alta — plata, seguridad, o "nadie lo probo de verdad":**

| # | Que falta | Quien lo desbloquea |
|---|---|---|
| 16.5 / 14.9 | Una reserva de invitado real, de punta a punta, con tarjeta real, en produccion - nunca se hizo | Diego, prueba real |
| 14.9 | Correr Admin > Orphan Payments (04-jul a 05-ago) y decidir cada devolucion | Diego, un click + decisiones |
| 14.10 | Completar un trabajo del mecanico sin señal, con telefono real - nunca se probo | Diego, prueba real |
| 21 | Bloquear un horario en Admin > Calendar y confirmar que desaparece de la reserva | **Sigue abierto - pero no es "un click".** Desde el 16-ago aparecieron 4 capas mas (21.5 a 21.8: cache sin invalidar, columna `reason` faltante, RLS sin policies, y el bloqueo no impedia la reserva del lado del servidor) - las 4 ya tienen su codigo/SQL, falta la prueba real de Diego contra produccion |
| 1.2 | Simulacro de restauracion del backup - nunca se probo que el backup restaura | Diego, seguir `RUNBOOK-BACKUP-RESTORE.md` |
| 2.1 | El PIN de mecanico sigue en texto plano (localStorage + requests) desde el 29-jun | Diego decide, despues codigo |
| 12.11 | La puerta del admin se abre con cualquier clave en localStorage; el arreglo real cambia el flujo de auth | Diego decide, despues codigo |
| 20.3 | El BAS muestra $0 de credito GST con gastos ya cargados -> GST a pagar de mas | El contador |

**Nota sobre el solapamiento con la seccion 23:** `21`, `16.5/14.9` y `1.2` son
tambien pruebas de **23.1** y **23.4** (TEST FINAL). La regla de esa seccion es
correrla entera recien cuando el resto del documento este cerrado. **Diego
decidio el 16-ago adelantar estas 3 igual**, dentro del trabajo de Alta, en
vez de esperar. Cuando se prueben, marcar el checkbox correspondiente en 23.1
y 23.4 tambien - no hace falta repetir la prueba dos veces.

**Prioridad Media — plata mal medida o hueco de proceso — CERRADA COMPLETA
2026-08-17, las 6 items de codigo:**

| # | Que falta | Quien lo desbloquea |
|---|---|---|
| 18.3 | ~~El margen sigue siendo un promedio plano...~~ **CERRADO.** Costo real de `parts_inventory` por trabajo, con fallback honesto al promedio para los jobs sin dato (PR #276, corregido en PR #279 tras una auto-revision) | Codigo (`parts_inventory`) |
| 20.8 | ~~`/api/analytics`... nunca se auditaron~~ **CERRADO.** Auditados: `/api/analytics` sin hallazgos, `loadDashboard()` con 2 bugs reales (tabla muerta + KPI sin limite) (PR #274) | Codigo, empieza por auditoria |
| 12.6 | En Admin > Services & Prices: renombrar "Bike Build" a "Bike Assembly" ($80) y crear "E-Bike Service" ($129) | **Sigue pendiente - es de Diego, no de codigo.** 2 minutos |
| 12.16 | ~~11 tablas/listas del admin sin scroll propio...~~ **CERRADO.** Eran 13, no 11 (PR #269) | Codigo |
| 5.1 | ~~Sin paginacion en admin/mechanic/client...~~ **CERRADO.** Admin ya la tenia (doc desactualizado); mechanic/client avisan si tocan su tope en vez de paginar (PR #272) | Codigo |
| 15.2 | ~~Si falla el PDF de la factura...~~ **CERRADO.** Avisa a Diego por WhatsApp (PR #265) | Codigo |
| 14.2 | ~~El mensaje de error de "inicia sesion" no esta traducido...~~ **CERRADO** (PR #263) | Codigo, chico |
| 14.3 | Nadie le aviso a Thais que se le devolvio el dinero (puede que ya se haya hecho) | **Sigue pendiente - es de Diego, no de codigo.** WhatsApp |

**Prioridad Baja — diseno, deuda tecnica, contenido:**

| # | Que falta | Quien lo desbloquea |
|---|---|---|
| 19.1 | El azul del logotipo en `claims/privacy/terms`: usar el de la marca (`#0055de`) o el de la app (`#2563eb`) | Diego decide |
| 19.2 | Esas 3 paginas legales no cargan `variables.css`, tienen su propia paleta que difiere | Codigo, depende de 19.1 |
| 19.3 | 7 paginas fuera del ratchet de color, 184 hex sueltos | Codigo, barato |
| 3.2 | ~~`landing.html` pesa 255 KB...~~ **CERRADO 2026-08-18.** 3529 -> 1424 lineas, 229 KB -> 111 KB; scripts inline a `js/landing-inline.js`/`js/landing-modules.js`. Ver seccion 3.2 propia | Codigo |
| 3.3 | ~~Los 33 handlers inline de `landing.html` siguen sin sacarse...~~ **CERRADO 2026-08-16**, ver seccion 3.3 propia | Codigo |
| 3.4 | Lighthouse formal nunca se corrio sobre produccion | Diego o CI |
| 10.1 | ~~El chequeo de i18n no mira dentro de los `<script>` inline de `landing.html`~~ **MOOT 2026-08-18** - esos scripts ya no son inline (3.2); el agujero angosto de fondo (regex, no AST) sigue sin cerrar, ver seccion 10.1 propia | Codigo, no trivial |
| 10.2 | ~~Cancelar/reprogramar... `confirm()`/`prompt()` nativos~~ **CERRADO 2026-08-17**, ver seccion 10.2 propia | Codigo, feature aparte |
| 10.4 | ~~`docs/mockups/` es publico...~~ **Nunca fue un bug real - CERRADO desde el 2026-08-01**, `.vercelignore` ya lo tapaba. Error del audit original, no de codigo | Codigo, movimiento simple |
| 4.1 / 4.2 | ~~`business.html`, `bike-check.html` y los 5 posts del blog siguen 100% en ingles~~ **4.2 CERRADO** (#282, mergeado). **4.1 rehecho** (#280 quedo obsoleto por conflicto con la 3.2 - reemplazado por otro PR sobre `main` actual, ver seccion 4.1 propia) | Diego, merge |
| 5.2 | Prueba de carga nunca se corrio (necesita staging, no produccion) | Codigo + infraestructura |
| 5.4 | Secretos sin usar en Vercel (`MAPBOX_TOKEN`, `GOOGLE_PLACES_API_KEY`, `POSTHOG_KEY`) | Diego, borrar del dashboard |
| 9.5-bis | Un iPhone en "modo escritorio" / iPad recibe la landing, no la app - riesgo de loop si se arregla mal | Diego decide |
| 13.9 | Contraste al limite en `track.html` (pasa AA por poco) | Diego decide, cambio de marca |
| 17.1 | "E-Bike Service" ($129) se puede reservar pero no tiene tarjeta de marketing | Diego decide (opcional) - **ojo:** hay otra seccion tambien numerada 17.1 (sobre el catalogo de precios, ya cerrada) - no confundir, son temas distintos con el mismo numero |
| 17.3 | Buscar si quedan mas elementos huerfanos de la unificacion del 04-jul | Codigo, exploratorio |

**Lo que no se reviso a fondo, y por que:** las filas de Alta y Baja sin
marca en negrita arriba se dejaron como el 16-ago las describio - no porque
esten confirmadas al dia de hoy, sino porque revisarlas seccion por seccion
no era parte de lo que se pidio (la auditoria de esta pasada fue sobre
Media, la lista asignada). Antes de asumir que una de esas filas sigue
abierta, leer su seccion propia - el 21, el 3.3 y el 10.4 de arriba son tres
ejemplos de que esta tabla ya se equivoco una vez en menos de 24 horas.

---

## 23. TEST FINAL — la lista que solo puede correr Diego

Escrita el 16-ago-2026. **No es una lista de bugs**: es lo que ninguna IA
puede verificar por si sola, porque hace falta apretar botones contra la base
real, cobrar una tarjeta de verdad y recibir un WhatsApp.

Diego pidio dejarla para el final: **se corre entera cuando el resto de este
documento este cerrado**, no antes. Hasta entonces, cada linea es un arreglo
que esta vivo en produccion y con tests, pero que nadie vio funcionar de
punta a punta.

Marcar con [x] a medida que se prueben, y anotar la fecha.

### 23.1 Lo que quedo esperando un click (16-ago-2026)

- [ ] **Bloquear un horario.** Admin > Calendar > Block availability, elegir
      un dia y una hora. Tiene que guardar SIN toast rojo. Despues abrir la
      reserva como cliente ese dia: **ese horario no tiene que aparecer**.
      (PR #253 + `scripts/fix-availability-blocks.sql`, ya corrido)
- [ ] **Desbloquear.** El mismo dia, Unblock. El horario tiene que volver.
- [ ] **Un cobro real.** Una reserva con tarjeta de punta a punta, despues
      del salto de `stripe` a 22.5.0 (PR #260). Verificar que el cargo
      aparece en Stripe y que la reserva se crea.
- [ ] **El WhatsApp llega.** Con esa misma reserva, despues del salto de
      `twilio` a 6.1.0 (PR #255): tiene que llegar el WhatsApp a Diego y el
      SMS al mecanico.

### 23.2 Lo que se arreglo este mes y nadie vio funcionar completo

- [ ] **Reprogramar una reserva de verdad.** Desde el celular, en una reserva
      propia. Antes fallaba SIEMPRE (PR #246). Comprobado el gate de formato
      contra produccion, pero nadie completo un reschedule real.
- [ ] **La hora se lee como hora.** En Mis Reservas, la tarjeta tiene que
      decir `10:00 AM`, no `10:00:00`.
- [ ] **Dos reservas a la misma hora.** Con UNA sola van libre, reservar las
      10:00 y volver a entrar: las 10:00 **no** tienen que ofrecerse otra vez
      (PR #247). Es el bug que permitia dos trabajos encima.

### 23.3 Los numeros del panel, contra la realidad

- [ ] **Finanzas de un mes cerrado.** Desde el PR #250 la plata se fecha por
      `completed_at` y ya no por `scheduled_date`, asi que los totales de
      meses pasados **cambiaron a proposito**. Comparar un mes contra lo que
      Diego sabe que facturo.
- [ ] **Analytics y Finanzas dicen lo mismo.** El mismo mes, las dos
      pantallas, el mismo numero.
- [ ] **Margenes.** Con gastos de repuestos cargados, la tabla ya no puede
      decir 100% en verde para todo (PR #251). Sin gastos cargados tiene que
      decir "Add expenses".
- [ ] **Clientes.** Entrar un dia 1 del mes: "New this month" tiene que
      contar a quien se registro esa misma manana (PR #248).
- [ ] **LTV.** Un cliente que reservo como invitado y con cuenta tiene que
      aparecer UNA vez, no dos (PR #252). Y no puede haber un cliente
      llamado "Client" arriba de la tabla.
- [ ] **Suburbios.** La lista y el mapa de calor tienen que coincidir: nada
      ubicado en el mapa puede figurar como "Not recorded" en la lista.
- [ ] **Los CSV en Excel.** Exportar Analytics y Finanzas y abrirlos: las
      columnas alineadas (un cliente con coma en el nombre ya no las corre) y
      ninguna celda ejecutandose como formula.

### 23.4 Lo que ya estaba pendiente de antes

En `docs/RUNBOOK-SQL.md` seccion 0 hay tres pruebas de mundo real anotadas el
10-ago y nunca tachadas: una reserva sin iniciar sesion de punta a punta, la
pagina de seguimiento mostrando ETA en una reserva nueva, y el simulacro de
restauracion del backup. **Siguen abiertas.** Van en la misma tanda.

### 23.5 Gestion de reservas del calendario (PRs #287-#297, 18/21-ago-2026) - Diego decidio dejarlas para cuando haga una reserva de pago real de prueba

Todo lo de las secciones 21.11 y 25-28 esta mergeado y en produccion, pero
**nada de esto se probo contra la base real todavia.** Diego pidio dejarlo
anotado aca en vez de probarlo suelto, para hacerlo junto con el proximo
booking de pago real (los ultimos items de 23.1 lo necesitan de cualquier
forma, asi que conviene una sola pasada):

- [ ] **Tooltip del calendario (21.11).** Month view, pasar el cursor sobre
      el badge "N blocked": tiene que caer en el dia correcto y mostrar
      horario + van + motivo.
- [ ] **Calendario sin scroll (PR #297).** Abrir Admin > Calendar en Month:
      las 6 semanas tienen que verse enteras sin que la pagina scrollee.
- [ ] **Ficha de reserva (25.1-25.3).** Click en una reserva (calendario o
      tabla de Bookings) abre la ficha; "Reassign van" cambia la van de
      verdad; el punto de color coincide con la van.
- [ ] **Reprogramar desde el admin (26).** Boton "Reschedule" en la tabla,
      mover una reserva real a otra fecha/hora.
- [ ] **Crear reserva a mano (27).** Botón "+ New booking", cargar una
      reserva de telefono de prueba. Confirmar que NO cobra (el mecanico
      cobra al terminar) y que si se carga un email llega la confirmacion.
- [ ] **Mapa en vivo de vans (28).** Vans & Mechanics, confirmar que se ven
      los pines 🚐 de las 2 vans (si `mechanic_locations` no tiene una fila
      reciente el mapa queda vacio de forma legitima, no es bug).
- [ ] **Unblock selected (PR #296).** Block availability, tildar 1-2
      horarios ya bloqueados y confirmar que "Unblock selected" libera solo
      esos, no el dia entero.

---

## 24. Revision de las 6 PRs de Prioridad Media, ya mergeadas (16-ago-2026) - CERRADO, corregido en 24.1

Diego pidio revisar todo lo hecho en 14.2, 15.2, 12.16, 5.1, 20.8 y 18.3
despues de mergear las 6 - no el diff de cada PR por separado, el resultado
combinado ya en `main`. 8 pasadas independientes en paralelo (line-by-line,
comportamiento eliminado, cross-file, reuse, simplificacion, eficiencia,
altura arquitectonica, reglas de CLAUDE.md) sobre el mismo diff agregado;
una (cross-file) fallo por limite de gasto mensual y se repitio a mano.

**3 bugs reales, los 3 en `handleMechanicComplete` (18.3) - CERRADOS:**

1. El fetch a `parts_inventory` para el costo de repuestos no tenia
   try/catch. Una falla de red ahi tumbaba la finalizacion completa del
   trabajo - exactamente lo que el comentario de al lado decia que no podia
   pasar. Envuelto en try/catch, mismo patron que el `guardResp` de la
   verificacion de duplicados dos parrafos arriba.
2. Si esa consulta fallaba (respuesta no-ok, no una excepcion), el codigo
   seguia de largo y `partsCostActual` quedaba en `0` en vez de `NULL` -
   marcando un trabajo como "medido" con costo real cero cuando en realidad
   no se pudo medir. Nuevo flag `costLookupOk` que separa "no hay repuestos
   que costear" de "la consulta fallo".
3. Los ids de repuesto iban al filtro `in.()` de PostgREST sin validar. Un id
   con formato invalido rompia la sintaxis del filtro para **todo el lote**,
   no solo para si mismo. **Correccion de 24.1: esto se presento como bug de
   campo al mismo nivel que el 1 y el 2, y no lo es** - `js/mechanic.js` solo
   deja elegir repuestos de una lista que ya trajo del servidor con su uuid
   real, no hay entrada de texto libre, asi que un mecanico normal nunca
   puede mandar un id corrupto. Es un endurecimiento defensivo (contra un
   cliente corrupto o un POST directo con un token robado), barato de
   mantener, no un bug que le fuera a pasar a un mecanico en el dia a dia.

**2 hallazgos de eficiencia, tambien arreglados** (no son bugs, pero el costo
era real y el arreglo barato):

4. ~~La misma finalizacion arriesgaba perder el aviso de WhatsApp...~~ **Este
   arreglo se revirtio en 24.1 - resulto ser un error propio, no una
   correccion.** Ver 24.1 para el detalle completo.
5. `fetchAnalyticsBookings()` (`js/admin.js`) reintentaba la consulta con
   `parts_cost_actual` en **cada** carga de Analytics, aunque ya hubiera
   fallado antes - un viaje de red completo desperdiciado en cada apertura de
   la pestaña hasta que Diego corra la migracion. Ahora se acuerda con un
   flag de modulo despues del primer fallo.

**Cobertura nueva:** `tests/unit/completion-guard.test.js` gano 4 tests sobre
los 3 bugs de `handleMechanicComplete`, y `tests/unit/analytics-bookings-fallback.test.js`
(nuevo) prueba el cacheo de `fetchAnalyticsBookings()` con un `sb` falso -
antes de esta pasada, ese archivo solo tenia una prueba de patron de texto
sobre `js/admin.js`, no una prueba de comportamiento real.

**Encontrado pero NO tocado, a proposito** (limpieza de codigo, no bugs -
Diego pidio bugs y errores, no un refactor):
- 3 copias casi identicas del patron "consultar por lote de ids -> Map" en
  `api/auth.js` (perfiles, costo de repuestos, contactos de escalamiento).
- El patron "columna nueva puede no existir todavia, reintentar sin ella" -
  ahora son 3 copias en `api/auth.js` mas 1 en `js/admin.js`, todas escritas
  a mano por separado.
- `.tbl-scroll` (12.16) se creo para las 6 tablas pero las 7 listas que no
  son tablas repiten el mismo `max-height:480px;overflow-y:auto` a mano en
  vez de reusar la clase.
- La logica de "basis"/"cost" en `analyticsMarginsByService` calcula los dos
  con arboles de condiciones separados que hoy coinciden pero podrian
  desincronizarse en una edicion futura - no es un bug actual, verificado
  contra el codigo real.

Si Diego quiere esa limpieza en algun momento, es una PR aparte - esta se
mantuvo enfocada en lo que realmente estaba mal.

### 24.1 Antes de mergear la 24, Diego pidio revisar la revision - y encontro que una "correccion" era un error

Diego pidio explicitamente auditar la PR de la seccion 24 antes de mergearla,
buscando "problemas, bugs, o falsos positivos" - no confiar en el resultado
de la primera pasada solo porque sonaba bien. 3 pasadas independientes mas
sobre el diff de esa PR (una combinando line-by-line + trampas propias de
JS, otra combinando comportamiento eliminado + cross-file, y una tercera
dedicada especificamente a re-verificar cada una de las 5 afirmaciones
originales contra el codigo de ANTES del fix, sin dar nada por sentado).

**El hallazgo mas importante: el arreglo #4 de la 24 (esperar el aviso de
WhatsApp con `await`) era un error, y se revirtio.**

El diagnostico original decia que el fetch fire-and-forget en
`api/send-invoice.js` podia perderse si Vercel congelaba la funcion antes de
que terminara, y que `notifyAdminCancellation` (`api/auth.js`) probaba que
el patron fire-and-forget funciona bien en produccion. Las dos partes
resultaron flojas:

- El "precedente seguro" citado tiene **menos** proteccion que el codigo que
  se estaba "arreglando": `notifyAdminCancellation` no espera nada mas
  despues de lanzar su fetch, mientras que `send-invoice.js` YA tenia un
  `await resend.emails.send(...)` sustancial despues del fetch sin esperar -
  eso le daba al fetch una ventana real para terminar via el event loop
  antes de que la funcion pudiera devolver una respuesta. La comparacion
  estaba al reves.
- Y el `await` que se agrego introducia un riesgo nuevo y mas serio: esta
  misma funcion la espera `handleMechanicComplete` justo antes de responderle
  al telefono del mecanico que el trabajo quedo completado (para un trabajo
  que YA esta marcado completado en la base). `api/send-message.js`
  reintenta Twilio hasta 3 veces con backoff, sin timeout en ningun punto de
  toda la cadena. Si Twilio esta lento, el `await` nuevo podia demorar - o en
  el peor caso, si la funcion se corta por tiempo antes de llegar ahi, hasta
  impedir por completo - el envio de la factura real al cliente. Cambiar "el
  aviso a veces se pierde" por "el email de la factura a veces ni se
  intenta" es peor, no mejor.

**Revertido a fire-and-forget**, con el comentario explicando por que
(incluyendo por que la vuelta atras es la decision correcta, no solo
deshacer). Si en algun momento se quiere hacer bien - avisar sin arriesgar
la factura - el camino es mover el aviso a DESPUES del email y ponerle un
timeout corto, no simplemente esperarlo donde estaba.

**2 bugs reales mas, encontrados en el arreglo mismo, corregidos:**

- El regex nuevo para validar ids de repuesto (`/^[0-9a-f-]{36}$/i`, arreglo
  #3 de la 24) solo revisaba largo y alfabeto, no la forma real de un uuid
  (grupos 8-4-4-4-12). Un string de 36 guiones, o 36 caracteres hex sin
  ningun guion, pasaba el regex igual, y ninguno es un uuid valido para
  Postgres - hubiera roto el filtro completo de la misma manera que el bug
  original. Regex corregido a la forma real.
- Caso borde que el arreglo #2 de la 24 no cubria: si TODOS los ids de un
  `parts_used` eran invalidos (no solo alguno), `partIds` quedaba vacio, el
  bloque de consulta nunca corria, y `costLookupOk` se quedaba en su valor
  por defecto (`true` en esa version) - `partsCostActual` terminaba en `0`
  en vez de `NULL`, la misma mentira que el arreglo #2 existia para cerrar.
  `costLookupOk` ahora arranca en `false` y solo pasa a `true` adentro de la
  rama de exito real.

**1 test propio que era un falso positivo real, corregido:**
`tests/unit/completion-guard.test.js` tenia un test llamado "guards the
partsCostActual accumulation on whether the lookup actually succeeded" que
**nunca revisaba el camino de falla** - solo confirmaba que el codigo feliz
existia. Si alguien borraba la asignacion `costLookupOk = false` en el
futuro (reintroduciendo el bug #2 original), ese test hubiera seguido en
verde. Reescrito para contar cuantas veces aparece `costLookupOk = true` en
la funcion (tiene que ser exactamente una, y adentro del bloque de exito) y
para extraer el regex de validacion del codigo fuente y correrlo de verdad
contra casos validos e invalidos, en vez de solo comparar el texto.

**1 hallazgo de severidad baja, corregido:** `_partsCostColumnMissing`
(`js/admin.js`, el cacheo del arreglo #5) quedaba pegado en `true` para el
resto de la sesion aunque la falla que lo puso ahi haya sido una falla de
red pasajera, no la migracion faltante - y el boton "Refresh" de Analytics
no lo sabia. Ahora el click en Refresh lo resetea explicitamente.

**Precision sobre el arreglo #3 (arriba, en la lista principal de la 24):**
se presento como bug de campo al mismo nivel que el 1 y el 2. No lo es - es
endurecimiento defensivo, inalcanzable desde el cliente real del mecanico.
Corregido en el texto de arriba.

**Verificado, no una promesa:** `npm run check`, `npm run lint` (0 errores)
y `npx vitest run` (367 tests) corridos contra los arreglos de esta seccion,
no solo contra los de la 24 original.

## 25. Gestion de reservas desde el calendario (18-ago-2026)

Diego pidio comparar el calendario del admin contra software de servicio de
campo real (Jobber, Housecall Pro, ServiceM8) y cerrar los huecos que
importan para ordenar reservas, **sin** arrastrar-y-soltar (queda afuera a
proposito, se evalua mas adelante). Se hace en varios PRs chicos en vez de
uno grande, cada uno mergeable solo.

### 25.1 Click en una reserva ahora abre su ficha, no la lista completa

Antes: clickear un chip del calendario (Month/Week/Day) o una fila del feed
del Dashboard mandaba a la pagina de Bookings entera, sin filtrar ni
resaltar cual reserva era - habia que buscarla de nuevo a mano.

**Arreglado.** Modal nuevo `#booking-detail-modal`: servicio, fecha, hora,
direccion, van (con punto de color), telefono/email (click-to-call /
mailto), desglose de precio, motivo de cancelacion si aplica. Reutiliza las
funciones que ya existian (`confirmBookingAdmin`, `openAdminChat`,
`copyTrackLink`, `openCancel`) - no duplica logica.

`openBookingDetail(id)` busca primero en `allBookings` (el cache de la
pagina de Bookings); si no esta ahi - el caso normal viniendo del
calendario, que solo carga el rango de fechas visible - lo trae con un
`select` por id.

### 25.2 Reasignar van: la funcion ya existia, no la llamaba nadie

`openReassign()` y su modal estaban completos en el codigo desde antes, pero
**ningun boton en toda la app los llamaba** - codigo muerto. Ahora hay un
boton "Reassign van" en la ficha nueva de 25.1 que lo abre.

### 25.3 Color por van en el calendario

Las 3 vistas coloreaban por status (pending/confirmed/etc), nunca por van -
con 2 vans y creciendo, un vistazo no decia cual estaba mas cargada. Punto
de color nuevo (`vanColor()`, paleta de 4 tokens que rota si algun dia hay
mas de 4 vans) junto al horario en Month, y en el label "Van N" de Week/Day.
No reemplaza el color de status, que sigue significando lo mismo que
siempre.

**Verificado:** `npm run check` (incluye `color-check`: los botones nuevos
usan `var(--purple-lt)`/`var(--blue-lt)`/`var(--red-lt)`, no hex a mano -
los que ya existian en la tabla de Bookings no se tocaron, quedan como
deuda de otro dia) y `npx vitest run`, 390/390 (10 tests nuevos en
`tests/unit/booking-detail.test.js`, incluye `vanColor()` extraida del
archivo y ejecutada de verdad, no solo buscada en el texto).

**No verificado en navegador** (mismo limite de siempre: `admin.html`
necesita `/api/auth`, no corre en servidor estatico local) - falta que
Diego lo vea en produccion.

## 26. El admin puede reprogramar una reserva (18-ago-2026)

Parte de la lista pedida por Diego comparando contra software de servicio de
campo (ver seccion 25, mergeada por separado - misma iniciativa, PR aparte a
proposito). Solo el cliente podia mover su propia reserva; no habia ningun
camino de admin para "mover este trabajo a otro horario".

**De paso, un agujero que ni el reschedule del cliente tenia cerrado:**
ninguno de los dos - ni el viejo del cliente ni el nuevo del admin -
consultaba `availability` antes de mover una reserva. `handleCreateBooking`
ya rechaza una reserva NUEVA contra un horario bloqueado (21.8), pero mover
una YA EXISTENTE a ese mismo horario bloqueado no pasaba por el mismo
chequeo. Mismo agujero, puerta distinta.

**Arreglado con un refactor, no una segunda copia.** `rescheduleBookingCore()`
nueva en `api/auth.js`: precio/callout fee recalculado para la fecha nueva
(igual que antes), mas el chequeo de `isSlotBlocked()` que faltaba, mas el
choque de `bookings_unique_slot` (23505) que ya existia. La usan los dos:
`handleClientReschedule` (dueño de la reserva) y `handleAdminReschedule`
(nueva, autenticada con `verifyAdminSession` - mismo patron que el resto de
`admin-*`, sin filtro de `client_id` porque un admin puede mover cualquiera).

Boton "Reschedule" nuevo en la tabla de Bookings, modal con fecha + hora.

8 tests nuevos en `tests/unit/admin-reschedule.test.js` (por texto - la
funcion compartida hace `fetch()` real, se prueba lo mismo que ya se prueba
en el resto del archivo: que la logica sin red este ahi, no se mockea la
red entera). `isSlotBlocked` en si ya tiene sus propios tests de ejecucion
real en `availability-blocks.test.js`, no se repiten aca.

**No verificado en produccion:** ni el reschedule del cliente ni el del
admin se probaron contra la base real todavia - queda para el TEST FINAL
(seccion 23) o antes si Diego quiere probarlo suelto.

## 27. El admin puede crear una reserva a mano (18-ago-2026)

Item 5 de la lista pedida por Diego (seccion 25). Un cliente que llama por
telefono no tenia como entrar al sistema - la unica forma de que existiera
una reserva era pagar online con la wizard.

**No cobra.** El mecanico cobra al terminar, mismo patron que
`cash_settled_at` que ya esta en produccion - no hacia falta meter Stripe en
el medio para esto. El precio **siempre sale del catalogo** (`services`),
nunca se acepta un precio escrito en el body - la leccion de siempre en este
proyecto (`CLAUDE.md`, el precio del 2026-07-22 que quedo mal en 4 lugares).

`handleAdminCreateBooking` nueva en `api/auth.js`, autenticada con
`verifyAdminSession` (mismo patron que el resto de `admin-*`): resuelve la
van con `matchVanZone()` (la misma funcion que usa `handleCreateBooking`
real, o un override manual si el admin elige una van a mano), choca contra
`isSlotBlocked` y contra `bookings_unique_slot` igual que una reserva
normal, y crea la fila en `confirmed` (no `pending` - un admin la esta
reservando a proposito). Email de confirmacion al cliente si dejo email,
best-effort (no bloquea la respuesta si falla, mismo criterio de "no
silencioso" del resto del archivo).

Boton "+ New booking" en la pagina de Bookings, modal con nombre/telefono/
email/direccion/servicio/fecha/hora/van.

10 tests nuevos en `tests/unit/admin-create-booking.test.js`.

**No verificado en produccion.** Y una cosa que se decidio sin preguntarle a
Diego, para que quede visible: no manda WhatsApp/SMS a nadie mas que el
email al cliente - ni aviso a Diego (el mismo la esta creando) ni SMS al
mecanico. Si el mecanico necesita enterarse por SMS ademas de verla en su
cola de la app, es un agregado chico para despues.

## 28. Mapa en vivo de las vans para el admin (18-ago-2026)

Ultimo item de la lista pedida por Diego (seccion 25). El cliente ya tenia
su mapa de seguimiento por reserva (`track.html`), pero el admin no tenia
ninguna vista de "donde estan mis vans ahora" - solo el mapa de la ruta de
HOY en Vans & Mechanics, que ubica los TRABAJOS, no a los mecanicos.

**Se sumo a ese mismo mapa, no se creo uno nuevo.** `renderVanLocations()`
lee `mechanic_locations` (la fila mas reciente por `van_number` - la tabla
es un historial, no una posicion actual), la dibuja con un pin distinto al
de los trabajos (🚐, color por van, semi-transparente si hace mas de 15 min
que no manda señal - no la esconde, la marca como no-en-vivo). Suscripcion
de realtime (`subscribeVanLocations()`, un solo canal para toda la pagina)
para que se mueva sola sin recargar.

**Igual que 21.7, la tabla nunca tuvo policy de admin.**
`harden-security-2026-07-17.sql` le puso RLS a `mechanic_locations` pero
solo para "el cliente con una reserva activa" - el admin, ni con su propia
sesion, podia leerla directo desde el navegador. `scripts/add-mechanic-locations-admin-select.sql`
nuevo, mismo patron que `availability_admin_select`, sumado al runbook
(item 42). **Sin correrlo, el mapa no muestra ninguna van y no tira ningun
error** - mismo modo de falla silenciosa que ya paso antes.

10 tests nuevos en `tests/unit/admin-live-van-map.test.js`.

**No verificado en produccion**, y dos cosas que no se hicieron a
proposito: no hay boton para "centrar en mi van" ni notificacion si una van
deja de mandar señal por mucho tiempo - se puede sumar despues si hace
falta.

**Bug real encontrado al encadenar los merges (no antes):** esta seccion y
la 25.3 declaraban cada una su propio `const VAN_COLORS` a nivel de modulo -
mientras vivian en branches separadas nunca chocaban, pero al mergear las 5
PRs en una sola rama para que fueran mergeables en orden, `js/admin.js`
terminaba con `VAN_COLORS` declarado dos veces (`SyntaxError: Identifier
'VAN_COLORS' has already been declared` - `node --check` no pasaba). El de
esta seccion (el objeto `{1: ..., 2: ...}` que usan `renderRouteMap()` y
`renderVanLocations()`) se renombro a `VAN_MAP_COLORS`; el array de 25.3
(`vanColor()`) se dejo como estaba. Test actualizado para buscar el nombre
nuevo.

## 29. Las 60 paginas de suburbio, reducidas a 15 (25-ago-2026)

Medido, no estimado: comparando `bondi.html` contra `manly.html` y
neutralizando el nombre del suburbio, **de 198 lineas solo diferian 12**.
94% identicas. Lo unico distinto era la lista de suburbios vecinos (una
frase, repetida dos veces), las coordenadas del dato estructurado, y tres
enlaces al pie. Titular, cuerpo, servicios, FAQ y CTA: iguales en las 20.

Eso es la definicion que Google usa para *doorway pages*. Y eran 20 x 3
idiomas = **60 paginas**, no 20.

Dos señales mas que salieron al mirarlas:
- **No estaban enlazadas** desde la landing ni desde la app. Solo se
  enlazaban entre ellas y desde el blog: un grupo aislado que solo se
  apunta a si mismo, que es otro patron clasico de doorway.
- Varias prometian servicio donde la van no llega (Penrith, Katoomba y
  compañia), asi que alguien podia buscar "bike mechanic Penrith", caer
  ahi, e intentar reservar para que el servidor le rechazara la
  direccion.

**Quedan 5 por idioma**, una por region, elegidas para que cada borrada
tenga un destino natural de redireccion: `bondi` (este), `cbd` (centro),
`inner-west`, `north-shore` (norte) y `northern-beaches` (la zona de la
base). Se van 15 x 3 = 45.

Lo delicado no fue borrar sino no dejar 404s:
- **36 reglas de redireccion permanente** en `vercel.json`, cubriendo las
  90 rutas (15 suburbios x 3 idiomas x con y sin `.html`). Verificado
  programaticamente que las 90 estan cubiertas y que **los 16 destinos
  existen como archivo** - `/es/` y `/zh/` no existen, asi que esas
  redirecciones apuntan a la raiz.
- **Sitemap**: de 85 URLs a 40.
- **30 archivos con enlaces internos reescritos** (los 5 posts del blog en
  3 idiomas, y las 5 paginas que quedan en 3 idiomas). Verificado con un
  barrido de todos los `href` del repo: **0 enlaces rotos**.
- `GENERATED_BUDGET` de `color-check` bajado de 3549 a 1479, que es el
  trinquete funcionando: al borrar paginas el presupuesto de hex sobraba.

**Lo que NO se resuelve con esto:** las 15 que quedan siguen compartiendo
copia entre si. Dejan de ser un problema de escala, pero necesitan
contenido local de verdad - y eso depende de que Diego este en Sydney
(primera semana de noviembre 2026), no de codigo.
## 30. Parramatta: el paso de la direccion seguia siendo un callejon (25-ago-2026)

Diego probo Parramatta desde el celular y desde la landing. Salia el panel
"no llegamos a esa direccion" con un boton de WhatsApp, y nada mas.

**El bug:** en `renderStep3`, `covered === false` hacia `return` y volvia a
habilitar el boton. El segundo toque corria el mismo chequeo, recibia la
misma respuesta y mostraba el mismo panel. **Nunca se podia avanzar.** Una
persona que ya habia elegido servicio, fecha y hora quedaba encerrada.

Lo peor es que el resto del flujo ya estaba bien: el resumen lee
`needsQuote` y cambia el boton de pago por "Consultar mi precio", sin cobrar
nada. Solo el paso 3 no dejaba llegar hasta ahi.

Ahora el primer toque explica y el segundo continua ("Continuar igual"). El
panel usa la MISMA copia que la landing ("Esa zona la cotizamos caso por
caso"), que ya estaba traducida - cero llaves nuevas para ese texto.

### El mensaje de WhatsApp no decia que queria el cliente

Era `"Hi! Do you cover this address? <direccion>"` y nada mas. Diego recibia
una direccion sin saber que servicio pedian. Ahora lleva servicio, fecha,
direccion y km/minutos - los mismos campos que el mensaje que arma el
servidor al final del flujo de cotizacion.

De paso, los dos mensajes tenian el mismo bug de formato: los `''` puestos
como renglon en blanco los borraba `.filter(Boolean)`, asi que el saludo se
pegaba a los campos. El separador va en el `join`, no en el array.

### Los "errores de zoom" no eran de layout

Safari en iPhone **hace zoom a la pagina entera** cuando enfocas un input con
`font-size` menor a 16px, y no vuelve. La pagina queda corrida de lado: por
eso una captura mostraba "HERE SHOULD WE COME?" sin la W y el parrafo cortado
a la derecha. Se lee como un desborde y no lo es.

Habia **~50 controles entre 13 y 15px**, puestos inline en las cinco
superficies. Una regla en `css/fonts.css` (el unico CSS que cargan las cinco)
los sube a 16px solo en punteros gruesos. Verificado en el navegador: inline
`15px` -> computado `16px`, 0 inputs por debajo, `scrollWidth` igual al
viewport.

### El link de wa.me NO estaba roto

Firefox le mostro a Diego un error de HSTS en `wa.me`. El href es
`https://wa.me/...` en el codigo y se verifico en ejecucion. Era el VPN de su
navegador interceptando TLS - en el celular, sin VPN, el mismo boton abrio
WhatsApp con el mensaje escrito.

## 31. La peninsula se divide en dos (25-ago-2026)

Diego vive en las Northern Beaches y la van sale de Curl Curl, y sin embargo
**la punta de su propia peninsula era el unico lugar que la app rechazaba.**

Medido (Google, 25-ago-2026): Curl Curl -> Palm Beach son **46 minutos /
30.7 km**. El perimetro corta en 45. Por un minuto, Palm Beach resolvia
`out`. Y Whale Beach, a 33 minutos, caia en la banda de $45 - la que existe
para cruzar el Spit hasta el CBD.

No es el mismo tipo de viaje. Barrenjoey Road es el unico camino, sin puente,
sin peajes, sin transito de ciudad, por los suburbios donde la van ya
trabaja. Se divide asi:

- **hasta 20 min -> $25** (ya lo hacian las bandas de tiempo, sin cambios)
- **de ahi a la punta -> $35** (nuevo, tope fijo)

**Codificado en el codigo y no en una tabla, a pedido de Diego: "nunca debe
tirar error".** El routing caido, un geocoder que no conoce Careel Bay, la
base de datos con timeout - ninguno puede convertir una direccion de Palm
Beach en un rechazo, porque no se consulta a ninguno. Alcanza con el codigo
postal (2104-2108) o el nombre del suburbio.

El nombre del suburbio se busca solo como **parte completa separada por
comas**, nunca como substring: "12 Newport Rd, Dee Why" es un viaje de $25 a
Dee Why, no de $35 a Newport. Hay test para eso, y para que "291 Church St"
no matchee "Church Point".

17 tests nuevos.

## 32. El reloj estaba mal, y escondia una fuga de precio (25-ago-2026)

Se midieron 55 suburbios de Sydney uno por uno, con los mismos dos servicios
que usa la app en produccion (Nominatim para geocodificar, OSRM para rutear).
De ahi salieron dos cosas.

### OSRM rutea con calles vacias

No modela trafico. Calibrado contra Google en la unica ruta de la que
tenemos los dos numeros (Curl Curl a Palm Beach, captura de Diego del
25-ago-2026): **Google 46 minutos, OSRM 36**. El router corre 28% rapido.

Todo lo que la app llamaba "45 minutos" eran en realidad **58 manejando**.

### La fuga: el CBD cobraba $35 donde decia $45

Las bandas viejas cobraban $35 hasta 32 minutos **de router**. El CBD mide
25. Asi que el CBD caia en la banda de $35 - cuando `callout_zones`, y el
comentario de este mismo archivo, decian **$45**.

La conversion de zonas a bandas de tiempo (que segun su propio comentario
"no debia repreciar nada") habia bajado un escalon a todo el anillo medio:
CBD, North Sydney, Chatswood, Lane Cove, St Ives, Bondi Junction. Nadie lo
noto porque nada fallaba.

### Lo que quedo

Los umbrales ahora se escriben en **minutos reales** - los que Diego quiere
decir cuando dice "45 minutos maximo" - y la respuesta del router se
convierte una sola vez, al entrar (`toRealMinutes`, `TRAFFIC_FACTOR`).

| zona | precio |
|---|---|
| hasta 25 min reales | $25 |
| peninsula norte entera, hasta la punta | $35 |
| corredor norte cercano (2084) | $25 |
| de 26 a 45 min reales | $45 |
| mas de 45 min reales | consulta, sin cobro |

Dos bandas de tiempo en vez de tres. El $35 dejo de ser una banda: ahora es
**solo** el precio de la peninsula.

### Lo que casi se rompe

`VALID_FEES` se armaba de `FEE_BANDS`, asi que el $35 estaba ahi **por
accidente** - era el precio de la banda del medio. Al colapsar a dos bandas
desaparecia, y un cliente de Palm Beach que pagara $35 y despues cayera en
una falla del geocoder habria tenido un pago perfectamente valido rechazado
(ver `amountIsAcceptable` en `api/auth.js`). Ahora `PENINSULA_FAR_FEE` entra
explicito y hay test.

Tambien: `VALID_FEES` quedo declarado antes que `PENINSULA_FAR_FEE` y el
modulo entero tiraba `ReferenceError` al importarse. `node --check` pasa igual
porque solo mira sintaxis - se encontro importando el modulo de verdad.

### Ojo con `callout_zones`

Con el ruteo funcionando, la **capa 1 (tiempo) siempre gana**. Los precios de
la tabla `callout_zones` solo se usan si el ruteo se cae. Editar un precio
ahi ya no cambia lo que paga un cliente en condiciones normales.

## 33. Habia cuatro calculadoras de tarifa, y se contradecian (25-ago-2026)

`js/app.js` lo dice en voz alta en la pantalla de pago: el precio que se
muestra **"must match exactly what handleCreateBooking will verify, or a paid
charge gets rejected as amount mismatch"**.

No coincidia. Cuatro lugares calculaban la tarifa por su cuenta:

| donde | como |
|---|---|
| `handleCreateBooking` (el cobro) | `resolveAddressCoverage` - tiempo de manejo |
| `handleGetPrice` (la pantalla de pago) | `callout_zones`, default **$20** |
| `rescheduleBookingCore` | `callout_zones`, default **$20** |
| reserva desde el admin | `callout_zones`, default **$20** |
| `getCalloutFee` en `js/supabase.js` | `callout_zones` **desde el navegador**, default $20 |

**North Sydney es el caso que muerde:** $45 por tiempo de manejo, y **sin
fila en `callout_zones`**. Un cliente logueado ahi veia $20 en la pantalla de
pago, pagaba $20, el servidor recalculaba $45, rechazaba el monto y **le
reembolsaba**. Desde su lado la reserva simplemente fallaba, sin explicacion.

Lo mas incomodo: el comentario de `getCalloutFee` ya habia diagnosticado esto
en la auditoria del 23-ago - *"the client shows (and tries to pay) the flat
$20 while the server recomputes the real suburb fee and rejects the mismatch -
the client just can't book, with no clue why"*. Le pusieron un `console.error`
y lo dejaron ahi.

### Lo que quedo

Un solo `calloutFeeForAddress(address, date)` en `api/auth.js`, usado por los
tres caminos del servidor. `callout_zones` se sigue leyendo, pero **desde un
solo lugar**: la capa de respaldo dentro de `resolveAddressCoverage`, para
cuando el ruteo no responde.

En el navegador, `getCalloutFee` se borro. El respaldo de la pantalla de pago
ahora llama a `check-coverage`, que es la misma resolucion que el servidor
verifica.

Y si no se puede resolver nada, **no se cobra**: el resumen ahora arranca en
`needsQuote: true` (antes arrancaba en `covered: true` con fee `null`, que
caia al lookup del navegador), y la pantalla de pago muestra la ruta de
consulta gratis en vez de un formulario de tarjeta con un numero inventado.

En el admin, una direccion que no resuelve registra $0 **y lo avisa en el
log**, en vez de facturar un default.

### Verificado corriendo

North Sydney en la pantalla de pago: **$45.00**, en `index.html` y en
`landing.html`. Con el lookup caido: sin boton de pago, ruta de consulta.

## 34. La campana de cumpleanos nunca mando un solo email (25-ago-2026)

Era el cumpleanos de Diego y pregunto por que su propia app no lo habia
saludado. No era un bug del cron.

Todo estaba construido:

- `api/send-cron.js` tiene la rutina, y `vercel.json` la corre **todos los
  dias a las 9** (`0 9 * * * -> /api/send-cron?type=all`).
- El email `birthday_promo` esta escrito, **traducido a los 3 idiomas**,
  saluda por nombre y trae un codigo de descuento con vigencia.
- `scripts/add-birthday-to-profiles.sql` agrega la columna, y esta anotada
  como item 32 del runbook.

**Faltaba una sola cosa: en toda la app no habia donde escribir la fecha.**
`profiles.birthday` era `NULL` para todo el mundo, el filtro
`.not('birthday','is',null)` no matcheaba a nadie, y la campana nunca mando
un email ni podia hacerlo. Todos los dias a las 9, en silencio.

Y no llega de otro lado: **Stripe no da fecha de nacimiento** en las
suscripciones, y ni el registro ni la reserva la piden. Hay que preguntarla.

### Lo que quedo

- **Campo en el perfil**: dia + mes. No se pide el ano - el cron solo compara
  mm/dd, asi que el ano seria dato personal sin uso.
- **Ano centinela 1904**, y no es arbitrario: la columna es `DATE`, y 1904 es
  bisiesto, asi que alguien nacido el **29 de febrero** puede guardarse.
  Verificado: escribe `1904-02-29`.
- **Validacion real**: el 31 de abril en JavaScript se convierte solo en 1 de
  mayo. La comprobacion construye la fecha y mira si volvio la que se pidio.
- **Saludo dentro de la app** en la pantalla de inicio, por nombre, una vez al
  ano por dispositivo, con el nombre escapado.
- 23 llaves nuevas x 3 idiomas.

### Un bug propio, que vale anotar

`isBirthdayToday` llamaba `localDateStr()` sin argumento. Esa funcion pide un
`Date`, asi que tiraba `TypeError` - y como quien la llama **no la espera**,
el error se volvia una promesa rechazada sin manejar: **el saludo simplemente
no aparecia y no se registraba nada**. Se encontro probandolo en el navegador,
no en los tests. Hay test para que no vuelva.

### Lo que Diego tiene que hacer

1. Correr `scripts/add-birthday-to-profiles.sql` si todavia no se corrio
   (item 32 del runbook tiene la consulta que lo verifica).
2. Cargar su propio cumpleanos en Perfil. El ano que viene la app lo saluda.

## 35. La pantalla de Perfil era inalcanzable desde la computadora (25-ago-2026)

Diego mergeo el campo de cumpleanos, abrio la landing y no encontro donde
cargarlo. No era un bug del feature.

**`#profile` aparecia CERO veces** en `landing.html`, `js/landing-inline.js`
y `js/landing-modules.js`. El panel de cuenta tenia tres pestanas -
Bookings, My Bikes, Membership - y nada mas. La pantalla estaba en el DOM de
la landing y el router ya la renderizaba como overlay, pero **nada la abria**.

Asi que todo lo que vive solo ahi era mobile-only sin que nadie lo notara:

- El selector de idioma
- Las notificaciones push
- La tarjeta guardada
- El codigo de referidos
- Y el campo de cumpleanos, que es como se encontro

### La segunda mitad del bug

Poner el link no alcanzaba. `createHeader('Profile', false)` no dibuja flecha
de volver - en el celular no hace falta, porque Perfil es una pestana raiz y
la barra inferior es la salida. Pero **`css/main.css` esconde `.bottom-nav`
arriba de 768px**, asi que en la landing la pantalla se abria sin ninguna
salida visible. El boton del navegador funciona, porque es un cambio de hash,
pero nadie tiene por que descubrir eso.

Ahora el header muestra la flecha cuando `document.body.dataset.surface` es
`'landing'`, en los dos renders (el loader y el final, o parpadea).

### Es la cuarta vez

Misma clase de bug que la barra "Trusted by", que el callejon del chequeo de
tarifa y que las cuatro calculadoras de fee: **una feature construida en una
superficie y no cableada en la otra.** Por eso ahora hay test.

Verificado corriendo en `landing.html`: el panel se cierra, el hash va a
`#profile`, la pantalla se activa con las cuatro secciones (Cumpleanos,
Idioma, Metodo de pago, Notificaciones), la flecha vuelve a `#home` y el
overlay se cierra.

## 36. El saludo de cumpleanos: naranja, y dentro de la pagina (25-ago-2026)

Dos correcciones de Diego sobre el banner de 34, con la version anterior ya en
produccion y funcionando.

**Color.** Estaba en `--blue-lt` / `--blue-dark`, que es el azul de todos los
demas paneles de la app - o sea que el saludo se leia como un aviso mas del
sistema. Un cumpleanos no deberia. Pasa a los tokens ambar que ya existian:

| | |
|---|---|
| fondo | `--amber-lt` (#fffbeb) |
| borde | `--amber-edge` (#fcd34d) |
| titulo | `--amber-ink` (#92400e) |
| subtitulo y cerrar | `--amber` (#b45309) |

Titulo y subtitulo usan **dos tonos distintos de la misma rampa**, no el mismo:
`--amber-ink` esta definido en `variables.css` como "text ON --amber-lt", asi
que el par es el que la paleta ya tenia pensado.

**Posicion.** `screen.prepend(box)` ponia el banner arriba de todo. En la SPA
esta bien, pero en la landing `screen` es la pagina de marketing entera - asi
que el saludo quedaba **encima de la barra de navegacion**, empujando el
header hacia abajo. Ahora se inserta despues de la barra de garantias, con
`max-width:900px` para alinear con el contenedor de esa barra.

La barra recibio `id="trust-badges"` como ancla. La SPA no tiene esa barra, y
ahi el `prepend` sigue siendo correcto - la rama else lo cubre.

Verificado en `landing.html`: el orden dentro de `<main>` queda
`trust-badges -> birthday-greeting -> section.hero`, y los cuatro colores
resuelven a los hex de arriba.

## 37. Cinco cosas que Diego encontro en su propio telefono (25-ago-2026)

Probando el campo de cumpleanos recien salido, en la SPA y en la landing.

### 1. El formulario de tarjeta mostraba solo el numero

Era el elemento `card` combinado de Stripe, que revela los campos **de a uno**:
se ve el numero, y vencimiento y CVC aparecen recien cuando escribis un numero
valido. Stripe lo diseno asi, pero en un telefono se lee como un formulario al
que le faltan dos campos.

Pasa a los elementos separados - `cardNumber`, `cardExpiry`, `cardCvc` - en
**tres cajas visibles**. Es la misma integracion: `confirmCardPayment` y
`confirmCardSetup` reciben el elemento del numero y encuentran a los hermanos,
siempre que los tres salgan de **la misma instancia** de `elements()`.

El markup lo arma `js/stripe.js`, no cada llamador, para que los dos puntos de
montaje (pantalla de pago y perfil) no puedan divergir. El borde se movio del
contenedor a cada campo (`.card-field`).

### 2. El zoom que quedaba, adentro del iframe de Stripe

`css/fonts.css` fuerza 16px en todo input con puntero grueso, porque abajo de
eso Safari en iPhone hace zoom a la pagina al enfocar y no vuelve. **Pero los
campos de Stripe viven en un iframe de otro origen**, donde ninguna hoja de
estilo nuestra llega. La unica entrada es el objeto `style` que se le pasa, y
estaba en `15px`.

### 3. Guardar el cumpleanos no dejaba rastro

El unico feedback era un toast de 3 segundos. Quien miraba para otro lado no
podia saber si se habia guardado: el campo se ve igual en los dos casos. Ahora
hay una marca `✓ Guardado` que **queda**, arranca visible si ya habia una fecha
guardada, y se borra al cambiar cualquiera de los dos selectores.

### 4. Decir que NO a las notificaciones borraba la pantalla

`renderProfile()` se llamaba pase lo que pase despues de pedir el permiso, y
esa funcion **repinta la pantalla como spinner antes de consultar**. Asi que
rechazar el permiso dejaba el perfil en blanco con un toast de error flotando
en el medio - se lee como que la app se rompio.

`enablePushNotifications()` devolvia `undefined` por todos los caminos, asi que
quien la llamaba no podia distinguir "listo" de "el usuario dijo que no". Ahora
devuelve booleano y solo se repinta cuando hay algo nuevo que mostrar.

### 5. El banner prometia un email que nunca se mando

Decia "revisa tu email" siempre. Pero el cron corre **09:00 UTC, que son las
19:00 en Sydney**: quien carga su cumpleanos mas tarde ese mismo dia recibe el
banner y ningun email. Es exactamente lo que le paso a Diego, que lo cargo
20:05.

El cron deja estampado el ano en que mando (`birthday_promo_sent_year`), asi
que el banner ahora **pregunta**: si no coincide con el ano actual, saluda sin
prometer nada.

De paso, el ancho: a 900px fijos el saludo quedaba corto a la izquierda y la ×
a 900px de distancia, con un lago de ambar vacio en el medio. Ahora es
`fit-content`.

14 tests nuevos.

## 38. El saludo de cumpleanos pasa a ser un modal, y manda el email el (25-ago-2026)

Rediseno pedido por Diego sobre el banner de 34/36/37, ya en produccion.

### Lo que cambia

Era una franja ambar metida bajo el header. Ahora es **un panel que se
despliega en 3D desde arriba, sobre la pagina oscurecida, a los 6 segundos de
que la persona entra**. Se cierra con la X, tocando el fondo o con Escape.

La franja se leia como una barra de avisos mas, justo el dia en que no lo es.

### Lo importante no es el diseno: es cuando se manda el email

El cron corre **09:00 UTC, que son las 19:00 en Sydney**. O sea que el saludo
llegaba de noche, y quien cargaba su cumpleanos despues de esa hora no recibia
nada. Le paso a Diego el dia de su propio cumpleanos.

Ahora **el email sale en el momento en que se abre el panel**. El cron queda
como respaldo para quien no entra ese dia. Los dos estampan
`birthday_promo_sent_year`, asi que sale una vez al ano, gane quien gane.

### `handleBirthdayGreeting` en `api/auth.js`

- Verifica el token del cliente. El navegador no puede mandar el email solo:
  `send-email` pide `INTERNAL_API_SECRET`, que es del servidor.
- **Decide la fecha en Sydney, no en UTC** (`toLocaleDateString` con
  `timeZone: 'Australia/Sydney'`). En UTC, cada mañana de Sydney cae en el dia
  anterior: el cumpleanos se saludaria un dia antes durante diez horas de cada
  veinticuatro.
- **Re-chequea la fecha**, no le cree al cliente.
- **Estampa el ano ANTES de mandar, y de forma condicional**
  (`.neq('birthday_promo_sent_year', year)`). Dos pestañas abriendose a la vez
  pasarian las dos un chequeo leer-despues-escribir; con el estampado primero,
  la que pierde ve `emailSent: true` y no manda nada. El precio del canje es
  perder el email si el envio falla despues - mejor que mandar dos.

### Detalles del cliente que valen anotar

- **No quema el disparo unico en una visita sin sesion.** Quien entra
  deslogueado y se loguea un minuto despues vuelve por esta misma ruta con
  sesion; marcar el flag en la pasada anonima le comeria el cumpleanos.
- **Dos `requestAnimationFrame`** antes de animar. Con uno solo el navegador
  salta al estado final y no hay despliegue.
- **`transitionend` no dispara en una pestaña oculta**, asi que hay un
  `setTimeout` de respaldo o el scrim queda pegado para siempre.
- **El fondo cierra solo si el click fue en el fondo** (`e.target === scrim`);
  un click adentro de la tarjeta no debe descartarla.
- El scrim se mezcla desde `--navy` con `color-mix`, asi que no entra ningun
  hex nuevo al presupuesto de `color-check`.

25 tests nuevos. La suite completa se corrio **10 veces seguidas**: 621/621 sin
un solo test inestable.

## 40. El email de cumpleanos no llegaba, y el motivo lo puse yo (25-ago-2026)

El panel aparecia y el email no llegaba nunca. Tres defectos en el mismo
bloque, todos mios, de 38.

### 1. Un envio fallido quemaba el ano entero

El codigo estampaba `birthday_promo_sent_year` **antes** de mandar y **nunca lo
deshacia**. Lo documente como un canje deliberado: "el precio es perder el
email si el envio falla despues - mejor que mandar dos".

Estaba mal. Perder el saludo por un fallo transitorio es peor que el riesgo que
evitaba, y ademas es **permanente**: la siguiente visita lee el sello, concluye
"ya se mando" y se calla para siempre.

Ahora el reclamo se **devuelve** si el envio falla, asi que la proxima visita
reintenta.

### 2. El reclamo no matcheaba a nadie la primera vez

`.neq('birthday_promo_sent_year', year)` - en SQL, `columna <> 2026` es **NULL**
cuando la columna es NULL, y NULL **no matchea**. NULL es exactamente lo que
tiene toda fila que nunca recibio el email.

O sea que el `UPDATE` afectaba **cero filas**, sin error, y el codigo seguia
igual: mandaba en cada visita y nunca sellaba. Ahora es
`.or('birthday_promo_sent_year.is.null,birthday_promo_sent_year.neq.<year>')`.

### 3. No se sabia si el reclamo se habia ganado

Sin `.select()`, un `UPDATE` que no matcheo nada es indistinguible de uno que
gano. Dos pestañas abriendo a la vez mandaban dos emails - justo lo que el
diseño decia evitar. Ahora devuelve las filas y se comprueba.

La respuesta lleva un campo `reason` (`sent`, `send-failed`, `claimed-elsewhere`,
`claim-failed`) y el log incluye el cuerpo de la respuesta de `send-email`, no
solo el numero de estado.

## 41. El panel de cumpleanos, con profundidad de verdad (25-ago-2026)

Diego: "es muy basico... puede ser un poco mas complejo? con mas 3d o algun
efecto smooth de aparicion y de desaparicion".

Lo que habia era un `rotateX` plano: la tarjeta giraba como una chapa.

- **`transform-style: preserve-3d`** en la tarjeta, y emoji, titulo y mensaje en
  `translateZ` distintos (42 / 24 / 12px). Al desplegarse **atraviesan
  profundidad a distintas velocidades** en vez de moverse como un plano unico.
  El emoji lleva su propia `drop-shadow`, que es lo que lo despega.
- **Entrada escalonada** (0.22s / 0.30s / 0.37s): el contenido llega despues de
  que la superficie empezo a abrirse, no flotando en el aire antes que ella.
- **El fondo se oscurece Y se desenfoca** progresivamente, en vez de aparecer.
- **La salida es su propio gesto** - se aleja y se achica en una curva mas
  rapida - y no la entrada al reves. Necesito una clase `is-closing` propia.
- Con `prefers-reduced-motion` se caen los movimientos, **los retardos y el
  desenfoque**: sigue apareciendo, sin nada que se mueva.

10 tests nuevos. Suite completa **10 veces seguidas**: 628/628.
## 39. La gift card: una sola implementacion, y el boton de pagar visible (25-ago-2026)

Diego abrio el modal de gift card y encontro cuatro cosas.

### 1. No existia en la SPA

`grep -c gift index.html js/app.js` devolvia **0**. El modal eran ~25 lineas de
markup dentro de `landing.html` mas sus handlers en `js/landing-inline.js`.

**Es la quinta vez este mes con esta misma forma:** la barra "Trusted by", el
callejon del chequeo de tarifa, cuatro calculadoras de fee, la pantalla de
Perfil inalcanzable, y ahora esto. Una feature cableada en una superficie y no
en la otra.

Ahora vive en `js/gift-card.js` y **las dos superficies abren el mismo modulo**.
`landing-inline.js` es un script clasico y no puede importar un modulo, asi que
`js/app.js` publica un unico handle (`window.drbikeOpenGiftCard`) - eso, o una
segunda copia. En la SPA la entrada esta en Perfil.

### 2. No se veia el boton de pagar

La hoja crecia mas que la pantalla y el boton quedaba al final, asi que en el
telefono el modal terminaba en "Personal message" y no habia forma de pagar sin
saber que habia que scrollear **el fondo**. Ahora la hoja es una columna flex
con **cuerpo scrolleable y pie fijo**: el boton esta siempre a la vista.

### 3. Los cuadros no se entendian

Todos los campos tenian solo `placeholder`, que desaparece al escribir - una vez
lleno, la caja ya no dice que es. El monto libre se leia como un "28" pelado.

Cada campo tiene `<label>` real, el grupo de montos es un `<fieldset>` con
`<legend>`, y el monto libre lleva un **$** adentro de la caja.

### 4. No se veia bien

El encabezado era un degrade violeta-a-azul, que es literalmente el cliche que
las notas de diseño de este proyecto nombran. Ahora es el navy de la marca con
acento dorado, y el 3D esta donde sirve: **una vista previa de la tarjeta que se
esta comprando, inclinada, que se actualiza mientras escribis** (monto,
destinatario, remitente). Contesta "que le llega exactamente" sin una palabra.

### Un hueco del checker de i18n, encontrado de paso

`scripts/i18n-check.mjs` **no leia `js/gift-card.js`** - era un archivo nuevo,
lleno de copia visible, fuera de `JS_SURFACES`. Se agrego.

Y algo que el checker sigue sin ver: solo marca literales **fuera** de
`translateValue`. Una llave que no existe en el diccionario hace que
`translateValue` devuelva el original, o sea ingles, en silencio. De las 15
cadenas del modal, **11 no tenian traduccion** y ninguna habria sido marcada.

De esas, `From` ya existia traducido como **"Desde"** (de un lugar), no "De"
(de una persona) - mal para una tarjeta de regalo. Las etiquetas de la tarjeta
usan `Recipient` / `Sender`, que no chocan con nada.

30 tests nuevos. Suite completa **10 veces seguidas**: 650/650.

## 42. La cara de la gift card, elegida entre cinco (25-ago-2026)

Diego: *"me gusta la tarjeta pero vamos a ocupar esta... sin la marca de agua...
solo pon los colores que este difuminado el fondo y el logo en algun lugar"*.
Se le mostraron **cinco variantes** antes de tocar nada y eligio la 2.

**El monograma ES el fondo.** Gigante, arriba a la derecha, al 17% de opacidad.
Sin foto de marca de agua: solo color y desenfoque, como pidio.

Dos decisiones que valen anotar:

- **Es `images/logo-db.png`, el archivo real, no un dibujo aproximado.**
  `filter: brightness(0) invert(1)` aplasta cualquier arte a blanco puro, asi
  que un solo archivo da la silueta exacta a cualquier tinte. No hay un segundo
  asset que mantener sincronizado, y no hay riesgo de que el trazo se aleje del
  logo de verdad. (Las maquetas que se le mostraron SI usaban un dibujo, y se
  le aviso.)
- **Una mancha navy desenfocada abajo a la izquierda.** Sin eso, "Para" y "De"
  caen sobre la parte clara del degrade y pierden contraste.

El monto pasa de 30px a **42px** - es lo que se esta comprando, deberia ser lo
mas fuerte de la tarjeta. Tamaño e inclinacion no se tocaron: eran la parte que
ya estaba aprobada.

Los colores salen todos de tokens (`--blue-dark`, `--blue`, `--blue-deep`,
`--navy`), asi que no entra ningun hex nuevo al presupuesto de `color-check`.

8 tests nuevos, incluido uno que verifica que **no vuelva a entrar una imagen de
fondo** (`url(` en el bloque de la tarjeta).

## 46. "Visita y diagnostico": el fee dice lo que compra (26-ago-2026)

Diego, despues de ver el email de su propia reserva pagada:

> *"hay que explicar mejor en el booking confirmed... porque sale un solo
> invoice y pareciera que tiene que pagar todo de nuevo"*

y sobre el nombre:

> *"realmente ese fee es ir a checkear la bicicleta... lo que no significa que
> por pagar nosotros tengamos la responsabilidad 100% de que vamos a
> solucionar su problema"*

Tiene razon en las dos, y la segunda importa mas de lo que parece.

### El nombre

"Call-out fee" nombra un traslado. Lo que el cliente compra es el traslado
**mas** una revision completa de la bici por un mecanico y un diagnostico de que
necesita - **por eso no se reembolsa** cuando la reparacion resulta inviable.

Un cargo por diagnostico no reembolsable es normal y defendible: mecanicos,
plomeros, veterinarios. Lo que la ley australiana del consumidor mira no es "lo
arreglaste?", sino si el servicio se presto con competencia, si sirvio para el
**fin declarado**, y si eso **se dijo antes de cobrar**.

Ese tercer punto era el unico que faltaba. La app cobraba sin decir en ningun
lado que compraba. La politica ya estaba bien; la divulgacion no existia.

**184 reemplazos en 21 archivos**, mas 3 archivos en una segunda pasada por
variantes de mayusculas que el primer script no cubrio - las encontro el propio
test de barrido, no una revision a ojo.

Espanol ya decia "Tarifa de visita" y chino "上门服务费", asi que
esos solo se ajustaron para incluir el diagnostico.

### La divulgacion, antes de la tarjeta

Un bloque nuevo en el resumen, **arriba del boton de pagar**, que dice: un
mecanico va, revisa la bici entera y te dice que necesita; si la reparacion no
es posible - un repuesto que no llevamos, un trabajo que necesita tornero o
soldadura - te lo dicen ahi mismo y **no se cobra el servicio**; la visita y el
diagnostico cubren esa revision y **no se reembolsan**.

Define el alcance sin intentar anular una garantia legal, que es la linea que
separa un termino valido de uno que no se sostiene.

### La aritmetica del email

El email decia **Total $160.80** sin mencionar los $30 ya cobrados. Se lee como
una segunda factura. Ahora:

    Total                                    $160.80
    Visita y diagnostico - ya pagado          -$30.00
    A pagar al mecanico al terminar          $130.80

`color-check` bloqueo **dos** versiones de ese bloque por hex de mas. Los emails
no pueden usar tokens - ningun cliente de correo soporta variables CSS - asi que
la version final **no agrega ni un color**: hereda del contenedor. El trinquete
gano las dos veces, y tenia razon.

### El test que vale

`tests/unit/visit-and-diagnosis.test.js` **recorre el arbol entero** buscando
"call-out fee" en cualquier `.html` o `.js` fuera de tests/docs/scripts. No es
una lista de archivos que alguien tiene que acordarse de actualizar: es un
barrido. Encontro las 3 variantes de mayusculas a los dos minutos de escrito.

13 tests nuevos. Suite completa **10 veces**: 678/678.
## 45. La primera reserva pagada de verdad, y los 4 bugs que encontro (26-ago-2026)

Diego hizo la reserva real con pago que `PENDIENTES.md` pedia desde el 21 de
agosto. **Funciono de punta a punta**, con Apple Pay, y confirmo lo que 675
tests que leen archivos no podian confirmar:

- Tune-Up, domingo 30 de agosto, "10 lalchere st, curl curl"
- **Tarifa de visita $30.00** = $25 de la banda x 1.20 del recargo de domingo
- Servicio $130.80 = $109 x 1.20
- Cobro real en Stripe, recibo, SMS y email

Las bandas de zona y el recargo, calculados contra Stripe de verdad. Eso ya
justifico el test. Y despues aparecieron cuatro cosas que ningun test veia.

### 1. El mapa mostraba donde esta el TELEFONO, no la reserva

`renderTracking` llamaba `getCurrentPosition` y **recentraba el mapa ahi**. El
comentario decia, textual: *"always use device location, not geocoded address"*.
Es exactamente al reves - el mecanico va a la direccion reservada, no a donde
el cliente este parado. Diego reservo en Curl Curl desde Hamilton Island y el
mapa volo a Hamilton Island.

Ademas costaba un permiso de ubicacion **a cambio de nada**. Las coordenadas
salen de `address_lat`/`address_lng`, que `public-track` ya devolvia.

### 2. El panel de abajo quedaba cortado

`[data-screen='tracking'].active` es `height:100dvh; overflow:hidden` - correcto,
porque Leaflet necesita un contenedor de tamaño conocido. Pero entonces **nada
debajo del mapa se puede alcanzar**: el panel quedaba recortado con sus botones
adentro. Ahora scrollea el panel, y el mapa conserva un `min-height` para que
un panel alto no lo aplaste a cero.

### 3. Decia "On the way to you" sin mecanico asignado

`#eta-text` estaba escrito a mano con ese texto y solo lo pisa `updateETA`, que
no habla hasta tener una posicion real. O sea que entre reservar y que alguien
acepte, la pantalla afirmaba algo falso. Ahora arranca en "Waiting for a
mechanic" y pasa por "Assigned to your booking".

### 4. Gmail invento un "Train trip"

En el recibo de Stripe, Gmail dibujo una tarjeta de reserva de viaje: *"Train
trip, Sydney departs 12:10, arrives 12:10"*. Es el parser de reservas de Gmail
equivocandose con "Dr. Bike **Sydney**" y una hora. **No es un email nuestro** -
lo genera Stripe - y no se puede controlar desde aca. Ver 46.

10 tests nuevos. Suite completa 10 veces: 675/675.

## 47. El cliente que pago no existia, y la plata cobrada no estaba en ningun lado (26-ago-2026)

Diego, mirando el admin despues de su reserva pagada: *"no se activo nada en
admin... no estan los 30 aus ni el cliente en ni un lado"*.

**El booking si estaba y si mostraba los $30** - en su modal, con la van y la
direccion. Lo que faltaba eran dos cosas distintas.

### 1. El invitado que pago no era un cliente

`loadClients` lee **solo `profiles`**. Una reserva sin cuenta guarda nombre,
email y telefono **en la fila del booking** y no crea perfil.

O sea que el dia que alguien pago $30 como invitado, la pantalla de Clientes
decia **1** - el admin - y la persona que acababa de pagar no aparecia en
ningun lado. No se la podia ver, contar ni contactar.

Ahora la pantalla une las dos fuentes: perfiles **mas** invitados sacados de
`bookings` donde `client_id` es nulo. Una tarjeta por persona y no por reserva,
y quien reservo como invitado y despues se registro con el mismo email **no se
duplica**. El total del KPI tambien los suma, o la tarjeta contradecia a la
lista de abajo.

La tarjeta de invitado muestra su telefono en vez de los botones **Bikes** y
**Chat**: los dos necesitan un id de perfil que un invitado no tiene, y botones
muertos son peores que un dato util.

### 2. La plata cobrada no estaba en ninguna pantalla

`Revenue` cuenta **solo trabajos `completed`**, y eso **esta bien**: es
reconocimiento de ingreso, y el codigo lo arreglo a proposito - el comentario
cuenta que antes tres pantallas tenian tres definiciones distintas de
"revenue" y el dashboard era el unico que halagaba el numero.

Pero los $30 **existen**. Estan en Stripe. Y ninguna pantalla del panel lo
admitia: Finance $0, Dashboard $0, P&L $0.

Se agrego **"Collected, not yet earned"**: la suma de `callout_fee` de las
reservas con `stripe_payment_intent_id` y estado distinto de completada o
cancelada. **Deliberadamente fuera de Revenue**, con el texto explicando por
que. Hay un test que verifica que siga afuera, para que un cambio posterior no
la sume en silencio.

11 tests nuevos. Suite completa **10 veces**: 699/699.

## 50. Un sintoma, tres causas sin relacion (26-ago-2026)

Diego, recorriendo un trabajo real entre tres pantallas: *"la actualizacion al
dia 31 en mi pagina de admin y mechanic solo aparecieron cuando hice reset a las
paginas"* y *"apreto boton en ruta pero en la seccion booking de la spa sigue el
servicio en confirmed... actualice la pagina y ahora aparece en ruta"*.

Parecia un bug. Eran tres, y ninguno tenia que ver con los otros.

### Admin: escuchaba, recordaba, y no dibujaba

La suscripcion ya existia y ya funcionaba. Actualizaba `allBookings` en memoria
y **ahi se terminaba**: nada repintaba la tabla, asi que la pantalla seguia
mostrando la fila como estaba al cargar la pagina. Faltaba una linea.

Ahora repinta, **agrupado**: una sola finalizacion escribe la reserva varias
veces seguidas (estado, repuestos, resultado de las notificaciones) y cada
escritura es un evento propio. Sin agrupar, la tabla se recargaba tres veces en
un segundo. Y **nunca con un modal abierto** - repintar debajo le hace perder al
admin el lugar donde estaba leyendo.

### SPA del cliente: no escuchaba nada

`js/app.js` estaba suscripto a `mechanic_locations` y al chat del trabajo, y a
**nada** de `bookings`. La lista no tenia forma de enterarse de que el estado se
habia movido. Solo un reload.

Tres caminos, porque cada uno cubre lo que los otros no: realtime para la
pantalla abierta mientras el mecanico toca *En route*; **volver a la pestana**,
que es exactamente lo que Diego estaba haciendo; y una consulta lenta detras.

### Mecanico: el codigo estaba bien desde siempre

`js/mechanic.js` **siempre** llamo a `load()` con cada evento. Que igual hiciera
falta recargar a mano solo puede significar una cosa: **los eventos no estaban
llegando**.

Supabase solo transmite cambios de las tablas que son miembros de la publicacion
`supabase_realtime`. Es un ajuste **de la base de datos**: ningun deploy lo
lleva, ningun test lo agarra, y nada en la app lo reporta. Una tabla que no es
miembro produce silencio, que es indistinguible de "no paso nada".

`scripts/enable-realtime-bookings.sql` lo arregla. Pero **las tres pantallas ya
no dependen de eso**: recargan al volver a la app y solas cada tanto. Un
mecanico a mitad de ronda no puede tener que deslizar para enterarse de que un
trabajo se movio. Eso si, **nunca con el modal de completar abierto**: borraria
una firma que el cliente ya dio.

15 tests nuevos. 714/714.

## 51. La pantalla del cliente: tres cosas chicas (26-ago-2026)

### La barra de progreso no decia que estaba pasando

Diego: *"necesitamos que el proceso que se esta realizando en este momento...
el boton parpadee... y que dejen de parpadear cuando el otro proceso empiece...
done deberia salir en color verde"*.

El codigo tenia **dos estados**: pasado y no pasado, los dos planos. Cada paso
alcanzado se pintaba del mismo `#1E40AF` solido, Done incluido, asi que el
cliente no podia saber donde estaba el trabajo.

Ahora son tres: **hecho** (azul apagado), **en curso** (azul vivo con latido) y
**pendiente**. Solo un paso es `live` a la vez, que es lo que hace que el latido
se corte solo cuando el trabajo avanza - justo lo que Diego pidio. **Done no
late**: esta terminado, y un trabajo listo que sigue parpadeando se lee como
algo que todavia se debe. Y es verde, pero solo el ultimo: verde en el paso 0
diria que todo termino en el momento en que se confirmo.

### Los botones tapados por la barra de abajo

Diego: *"no puedo escrolear para abajo entonces no puedo ver los botones de
mesage ni de share link"*.

**El panel scrolleaba perfecto.** La barra de navegacion es `position:fixed`
con `z-index:100` y el panel no reservaba lugar para ella, asi que la ultima
fila quedaba fisicamente **debajo**. Llegar al final del scroll los estacionaba
atras de la barra en vez de arriba.

El alto de la barra ahora es un token, `--bottom-nav-h`, y **la barra misma lo
usa**: los dos numeros no pueden separarse nunca mas.

### El agradecimiento de la resena era un toast

Diego: *"debe estar mas arriba. que aparezca con fondo medio oscuro con opacidad
en 3d mas de lujo mas bonito... y que el cliente pueda hacer click en cualquier
parte fuera del cuadro para se cierre"*.

Dejar una resena es lo unico que la app le pide al cliente **despues** de que la
plata cambio de manos. Merecia la misma hoja que el saludo de cumpleanos.

La hoja 3D se **extrajo** a `showCelebration()` en `js/components.js` en vez de
copiarse: una segunda copia con otro nombre es como un producto termina con
cuatro estilos de modal. Se renombro `.bday-*` a `.celebrate-*` - el nombre dice
**que es**, no para que se uso primero. Cuidado con eso: los ids del perfil
(`bday-day`, `bday-status`) son otra cosa y **no** se tocaron.

Ademas el escapado de texto del usuario ahora vive **adentro** del helper, asi
que lo tiene todo el que lo llame y no solo el autor que se acordo.

### Y la resena no aparecia sola

*"desde el celular tuve que cerrar la pagina y volver a abrirla para ver el
comentario"*.

La grilla de resenas de la home la llenaba un IIFE que corria **una vez, al
cargar la pagina**. Nadie le pedia los datos de nuevo. Ahora la funcion tiene
nombre y se publica en `window.drbikeReloadReviews`, y el flujo de resena la
llama al cerrar la hoja. Como ahora puede correr dos veces, **el estado vacio
tambien tiene que poder irse**: la primera resena aterriza en una pagina que en
ese momento dice que no hay ninguna.

### El agujero del i18n, otra vez

`scripts/i18n-check.mjs` solo marca literales **fuera** de `translateValue()`.
Una cadena pasada **adentro** sin entrada en el diccionario devuelve ingles y el
check queda verde. Las dos cadenas nuevas se agregaron a mano a es y zh, y hay
un test que lo verifica, porque el check no puede.

23 tests nuevos. 737/737.

## 52. La app del mecanico: tres cosas (26-ago-2026)

### El aviso de GPS cada 5 segundos

Diego, en una PC sin GPS: *"aparece ese mensaje en pc del gps cada ciertos
segundos"*.

`sendLocation()` corre en un `setInterval` de 5 segundos y **cada fallo lanzaba
su propio toast**. Solo el codigo 1 (permiso denegado) cortaba el ciclo; un
*timeout* - que es lo que devuelve para siempre una maquina sin GPS - seguia
disparando un mensaje cada cinco segundos mientras el trabajo estuviera en ruta.
Y `watchPosition` tiraba los suyos aparte.

Ahora hay **un aviso por tipo de problema**, no uno por intento, y los tres
caminos pasan por el mismo embudo. Se resetea cuando **entra una posicion de
verdad**, asi que un mecanico que sale de un tunel y vuelve a entrar se entera
otra vez si se rompe una segunda vez - si no, el limite se convierte en silencio.
Permiso denegado **sigue** cortando el compartir: reintentar no lo puede
arreglar.

### El scroll horizontal del modal de completar

El panel es un scroller vertical **sin opinion sobre el otro eje**, asi que
cualquier hijo un pixel mas ancho le agregaba tambien barra horizontal. Un
formulario no tiene nada a lo que scrollear de costado: el eje se apago.

De paso, el canvas de la firma tenia `width="100%"`, que **no es un valor legal**
para ese atributo (lleva un entero de pixeles), y **ninguna altura en CSS**: en
una pantalla 2x el cuadro se dibujaba de 240px de alto porque eso era lo que
valia `canvas.height`. Las dos cosas ahora son explicitas y legales.

### La fecha del proximo servicio

Diego: *"la navegacion para colocar la nueva fecha del siguiente servicio se ve
horrible en pc... y en celu igual se ve horrible"*.

Era `<input type="date">`, asi que **cada plataforma dibujaba su propio selector**
y ninguno pertenecia a esta app - el spinner de mes/ano de Firefox de su captura
no es algo que el CSS pueda tocar.

Pero ademas **era el control equivocado**. Un mecanico que termina un service
recomienda un **intervalo**, no el 14 de marzo; elegir un dia de un calendario
con guantes puestos es mas lento y menos preciso que tocar "6 meses".

Ahora son chips: 3, 6, 12 meses y *Not now*. Escriben una fecha real en **el
mismo campo oculto** que ya leian `submitComplete()` y la factura, asi que
**cambio el control, no el dato**. *Not now* escribe vacio, y
`nextServiceMessage()` ya trataba eso como "sin fecha", asi que la factura cae en
su linea generica en vez de imprimir *Invalid Date*.

15 tests nuevos. 752/752.

## 53. Las dos barras de scroll de la landing, y dos secciones enormes (26-ago-2026)

### Las dos barras: cuatro lineas de CSS

Diego lo reporto **dos veces**, y la segunda dio el dato que lo resolvia:
*"las lineas del scroll solo aparecen en el pc en el celular no"*.

`css/main.css` abria con:

```css
html,
body {
  overflow-x: hidden;
}
```

El CSS dice que **si un eje es `hidden` y el otro es `visible`, el valor usado
del eje visible pasa a `auto`**. O sea que ese `overflow-x` le daba en silencio
`overflow-y: auto` **a los dos**, `html` y `body`.

Y despues la regla de propagacion: el viewport toma su overflow de `<html>`, y
**solo** cae a `<body>` cuando el de html es `visible`. Con html ya no visible,
body dejo de propagar y **se volvio un contenedor de scroll propio**. Dos cajas
que scrollean, dos barras.

En el celular no se veia porque ahi las barras son superpuestas y no ocupan
ancho - exactamente lo que Diego observo.

**La regla va en `body` y en ninguno mas.** Con html visible, el viewport toma
el overflow de body, **body vuelve a computar `visible`** y no dibuja barra
propia. Una sola barra, y el scroll lateral sigue suprimido.

### Las dos secciones que no entraban

*"el cuadro del mecanico en el pc azul detras abarca mucha pantalla hay que
achicarlo para que entre en una sola pantalla al 100%"* y lo mismo para los
planes, *"desde el titulo hasta que terminan las letras de abajo"*.

La de mecanicos sumaba 80 + titulo + 48 + 420 + 24 + 96: mas de 800px **antes**
del cromo del navegador.

Todos esos numeros ahora estan atados al viewport con `clamp()`, y las dos
secciones llevan `min-height:100svh` centrado, **solo en desktop** - en un
celular una seccion de pantalla completa empuja la siguiente fuera de vista y
hace sentir la pagina el doble de larga.

`min-height`, nunca `height`: una seccion que de verdad necesita mas lugar
crece. **Una tarjeta de plan cortada al medio es peor que una seccion que se
pasa 40px.** Y sin navegador para medir, atar todo al viewport es la unica forma
honesta de que entre: entra por construccion, no por adivinar un tamano de
pantalla.

### La tarjeta del mecanico no era 3D porque no se movia

240px dentro de una seccion oscura de 420px de alto es una estampilla flotando
en un vacio. Y con **un solo** mecanico la matematica del carrusel da offset 0:
sin rotacion, sin profundidad, escala 1. **Nada se leia como 3D porque nada lo
era.**

Ahora la tarjeta es `clamp(250px, 23vw, 320px)` y tiene un flotado propio. Vive
en un elemento **interno**: el carrusel escribe `transform` sobre la tarjeta
desde JS, y animar la misma propiedad en dos lugares hace que uno de los dos
pierda en silencio. Solo respira la de adelante; las de atras son fondo.

Y el paso entre tarjetas dejo de ser 190px fijos - calculados para una tarjeta
de 240 - y pasa a ser proporcional al ancho medido, o una pantalla ancha las
superpondria y una angosta dejaria un hueco.

14 tests nuevos. 766/766.

## 54. Cuatro superficies que el tema oscuro no podia alcanzar (26-ago-2026)

El modo oscuro ya tiene tabla de tokens completa (48), pero **un token solo
puede alcanzar un color que este escrito como token**. Cuatro lugares de
`js/mechanic.js` pintaban `background:#fff` como literal: en oscuro eran hojas
de papel blanco sobre el fondo navy, y ningun trabajo sobre la paleta las podia
tocar.

Diego encontro la mas grande solo: *"aprete en history en el pc y se ve un
history abajo como en la foto nose si me gusta ese banner abajo"*.

Las otras tres eran la tarjeta de *No ratings yet*, el resumen de calificaciones
y un boton chico.

**La cuarta se queda blanca a proposito**: el canvas de la firma. Se firma sobre
papel blanco en los dos temas, el trazo se dibuja con una tinta oscura que solo
se lee sobre blanco, y esa imagen termina en la factura del cliente. Lleva un
comentario que lo dice, y un test que verifica que sea **la unica** que queda.

### Y el panel de historial

Una hoja que sube desde el borde de abajo esta bien en un celular - es donde
esta el pulgar - y **se lee como una barra de notificacion en una PC**. Todos
los demas overlays de esta app estan centrados. Ahora sube en mobile y esta
centrado de 768px para arriba.

7 tests nuevos. 772/772.

## 55. El mapa del cliente no tenia ruta ni tiempo real (26-ago-2026)

Diego, mirando su propia reserva salir: *"cuando estaba en ruta tampoco vio ni
una ruta ni un tiempo ni nada... no se vio eso en ni un momento... hay que
arreglarlo. se debe ver el camino hacia el mechanico y la ubicacion del
mechanico"*.

Tenia razon en las dos cosas, y son agujeros distintos.

### La ruta nunca existio

Buscar `polyline` en `js/app.js` antes de este commit: **todos los resultados
son iconos SVG**. Nunca se dibujo un camino. No es que estuviera roto - no
estaba construido.

### Y el tiempo era una linea recta

`updateETA()` calculaba distancia haversine dividida por una velocidad fija. En
Sydney eso dice *"3.2 km away"* para un viaje de ocho kilometros por calle, y
los minutos al lado son igual de inventados.

### Lo que se hizo

`drivingRouteGeometry()` en `api/_eta.js`: le pide a OSRM la **geometria**
(`overview=full`), no solo la duracion. Dos diferencias con `drivingRoute()`,
que ya existia:

- devuelve la linea de verdad;
- toma **coordenadas** en vez de una direccion, porque la posicion del mecanico
  ya es una fija y geocodificarla solo podria perder precision.

Aplica el **mismo `TRAFFIC_FACTOR`** con el que se calculan los precios de
cobertura - importado, no repetido -, asi que el mapa no le puede prometer al
cliente un numero mas optimista que el que uso la cotizacion.

El GeoJSON viene `[lng, lat]` y Leaflet quiere `[lat, lng]`: se da vuelta **una
sola vez**, en el servidor. Al reves dibuja una linea por el oceano Indico.

### Por que un rol aparte

`public-track` se consulta **cada 5 segundos** para mantener el estado al dia.
Pedir una ruta con esa frecuencia seria golpear un servicio gratuito por una
linea que casi no cambia. `track-route` se pide al abrir la pantalla y despues
**cada 45 segundos**, y la cache del router se indexa por el origen redondeado a
~100m: una camioneta que avanzo veinte metros esta en la misma calle.

### Ninguna falta de ruta es un error

*No esta en ruta*, *la direccion nunca se geocodifico*, *no hay fija del
mecanico*, *el router no contesto*: los cuatro devuelven **200 con un motivo**.
El mapa se queda con sus marcadores y con la estimacion en linea recta en vez de
mostrarle una falla al cliente.

### Y el texto dice que clase de numero es

*"ETA 14:32 - 12 min - 5.4 km **by road**"* contra *"ETA ~14:28 - 3.2 km **en
linea recta**"*. Uno de los dos numeros esta medido y el otro es una
aproximacion, y el cliente tiene derecho a saber cual esta mirando. Ademas la
estimacion **nunca pisa** a la medicion: si la ruta ya llego, un repintado lento
de haversine no la puede reemplazar.

18 tests nuevos. 790/790.
## 48. El modo oscuro no tenia tokens. Tenia 160 parches. (26-ago-2026)

Diego, cuatro veces distintas recorriendo una reserva pagada de punta a punta:
*"en dark queda que desear la aplicacion, no se notan los cuadros ni las
divisiones"*.

No era ninguna regla en particular. **El modo oscuro no tenia capa de tokens.**
`css/variables.css` definia 98 colores y **ninguno** tenia valor oscuro. Cada
pantalla parchaba los suyos a mano: 149 selectores `[data-theme='dark']` en
`css/admin.css` y un bloque privado de 11 tokens en `css/mechanic.css`.

Lo que nadie se acordo de parchar **se quedaba con su valor claro**, en
silencio. No es una metafora: `js/admin.js` escribe `color:var(--navy)` inline
**68 veces**, y `--navy` es `#0d1f3c`. En oscuro eso era tinta casi negra sobre
una tarjeta casi negra. Los bordes eran peores: `#e2e8f0`, un gris claro,
dibujado sobre navy.

Y las dos superficies **no estaban de acuerdo sobre que era oscuro**: admin
pintaba `#1c1c1e` neutro, mecanico `#152035` navy, en el mismo producto.

### Lo que se hizo

- **Una sola paleta oscura**, en `css/variables.css`: 42 tokens. Los bloques
  privados de `admin.css` y `mechanic.css` se borraron - cargan **despues** de
  `variables.css`, asi que dejarlos habria significado que la paleta vieja e
  incompleta le siguiera ganando a la nueva.
- **`--navy` hacia dos trabajos**: la tinta de casi toda etiqueta y **el fondo
  del sidebar del admin**. Un token que significa dos cosas no se puede tematizar
  (aclararlo para la tinta pone el sidebar blanco). Se separo `--navy-surface`,
  identico en modo claro, deliberadamente **no** redefinido en oscuro.
- **16 hacks `[style*='color:var(--x)']` eliminados.** Matcheaban un estilo
  inline por substring y forzaban un color con `!important`. Solo funcionaban
  dentro de `.main`, asi que **todo modal que `js/admin.js` cuelga de `<body>`
  nunca estuvo cubierto** - esa era la tinta invisible que Diego encontraba.
- `--on-amber`: la tinta que va **encima** de un relleno ambar. Blanco en claro
  (donde `--amber` es `#b45309`), casi negro en oscuro (donde es `#fbbf24`).

### Los acentos: dos restricciones que se pelean

`--blue`, `--green` y `--red` son a la vez **relleno de boton con texto blanco
duro** y **texto de color sobre la tarjeta**. Las dos restricciones se mueven en
sentidos opuestos y **no existe** un valor que llegue a AA (4.5) en ambas: para
leerse como texto sobre navy hay que aclararlo, y aclararlo mata el texto blanco
encima. Estan calibrados para pasar AA-large (3.0) en los dos papeles, que es la
banda donde vive el texto UI en negrita.

`--amber` es la excepcion documentada: se lee como texto muchas mas veces de las
que se rellena, asi que se queda brillante y su unico boton (`En route`) usa
`--on-amber`. `--wa` es el verde de WhatsApp: blanco sobre el da 1.98:1 en
**los dos** temas, es el boton de WhatsApp y no es algo que este tema haya
introducido ni le toque arreglar.

### El guard

`scripts/dark-theme-check.mjs`, en `npm run check`. Falla si un token de color
que admin o mecanico usan **no tiene valor oscuro**, si un valor oscuro es
identico al claro sin estar declarado como excepcion, si un token existe solo en
un tema, y - lo importante - si el **contraste** de cualquier tinta contra los
tres fondos oscuros baja de 3:1, o si el blanco sobre cualquier relleno baja de
3:1. Un check que solo mirara presencia aprobaria una paleta de navy sobre navy.

Estado actual: **peor tinta 3.10:1, peor blanco sobre relleno 3.30:1**, cero
fallas. Antes habia tinta a 1.03:1.

11 tests nuevos en `tests/unit/dark-theme.test.js`, que protegen la **forma**
(una sola paleta, sin bloques privados, sin hacks de substring) - porque una
segunda paleta privada pasaria el guard y dejaria la app donde estaba.
## 49. El credito por recomendacion no se podia gastar. Nunca. (26-ago-2026)

Diego: *"no probamos el codigo de descuento del cliente que tiene en su perfil"*.

No se podia probar, porque no podia funcionar. `handleApplyReferral()` acredita
a las dos partes, y **nada en todo el repo restaba ese numero**. Las unicas dos
escrituras a `referral_credits` eran incrementos. Un cliente podia compartir su
codigo, ver *Credits earned $30* en su perfil, y descubrir en la caja que el
dinero no existia. Peor que no tener el programa.

Encima, la app prometia **$15** en tres lugares y tres idiomas
(`js/app.js:4635/4657/4658`) mientras el servidor acreditaba **$10**
(`const CREDIT = 10`). Nadie podia notar la diferencia porque el credito era
ingastable de las dos maneras. Ahora el servidor paga los $15 que el cliente
ve: **de los dos numeros, el que cuenta es el que se le mostro**.

### Donde se gasta

Contra el precio del servicio, como descuento a nivel reserva. Esa canaleta ya
existia (`bookings.discount_applied`), asi que el desglose del mecanico, el mail
de factura y las cifras del admin lo levantan **sin plomeria nueva**. Se suma
**encima** de un codigo promocional en vez de reemplazarlo, y nunca deja el
total abajo de cero.

Un invitado no tiene perfil ni creditos: `user` es null y el bloque entero se
saltea.

### Tres cosas que podian perder plata del cliente

1. **Dos reservas en el mismo segundo.** `spend_referral_credits()` hace
   `SELECT ... FOR UPDATE` adentro, asi que no pueden leer las dos el mismo
   saldo y gastarlo cada una. Es la misma carrera que `consume_discount_code()`
   evita para los codigos promocionales.
2. **Credito descontado, reserva sin actualizar.** Si el UPDATE falla despues
   del gasto, se llama a `refund_referral_credits()` y vuelve al perfil.
3. **Reserva cancelada.** El credito vuelve. Sin esto, el cliente gasta $15 que
   se gano, cancela esa tarde, y la plata desaparece sin que ninguna pantalla lo
   admita. Poner la columna en cero en el mismo paso lo hace idempotente: una
   segunda cancelacion no acuna credito de la nada.

### Y se ve antes de pagar

Fila propia en el resumen de la reserva, debajo del descuento promocional. Un
descuento que el cliente descubre cuando el mecanico ya esta en su vereda no es
un descuento, es una sorpresa. La fila es **solo informativa**: el servidor
recalcula y manda, igual que con el codigo.

### El SQL no es una dependencia dura

`scripts/*.sql` se corren a mano, asi que el codigo llega a main antes que la
migracion. **Ninguna consulta nombra la columna nueva** salvo la de cancelacion,
que la pide aparte y sobrevive a que falte - PostgREST rechaza el request
entero, no saltea la columna, y eso habria volteado la pantalla del mecanico
hasta que Diego corriera el archivo. El gasto en la reserva loguea y sigue.

19 tests nuevos. 707/707.

## 56. Tres bugs que aparecieron revisando mi propio trabajo (26-ago-2026)

Diego pidio explicitamente buscar **bugs y falsos positivos** en lo recien
construido antes de dar nada por terminado. Aparecieron tres, y ninguno lo
habria agarrado un test que no se buscara a proposito.

### 1. La guarda del admin leia la propiedad equivocada

El repintado de la tabla de reservas se protegia con
`page.style.display === 'none'`. Pero el admin cambia de pagina con una **clase
`active`** (`go()`), no con un display inline: `style.display` era `''` siempre,
asi que la guarda **nunca bloqueaba nada** y la tabla se recargaba de la base
cada minuto aunque el admin estuviera mirando Finanzas.

### 2. El padding reservaba lugar para una barra que no existe

`--bottom-nav-h` resuelve el problema de los botones tapados en el celular, pero
en desktop `.bottom-nav` es `display:none`. El panel habria dejado **56px de
aire muerto** abajo de cada pantalla de seguimiento en PC. El token ahora vale
`0px` de 768px para arriba: significa *cuanto lugar ocupa la barra*, y una barra
oculta no ocupa nada.

### 3. Un test mio era un falso positivo esperando a pasar

`dark-theme.test.js` fijaba `CACHE_STATIC = 'drbike-static-v91'` **literal**. Se
puso en rojo apenas otra rama subio la misma linea a v96 - una falla que
reportaba un merge, no un bug. Ahora verifica un **minimo**, que es lo que de
verdad tiene que seguir siendo cierto.

### Y lo que encontro el merge

Al unir las ramas, `mechanic.html` volvio a `?v=20260826-dark` y **se perdieron
en silencio dos bumps posteriores**. CLAUDE.md ya avisaba que los `?v=` de
`mechanic.html` eran cadenas de fecha escritas a mano y el unico hueco que
quedaba sin enforcar. Mordio exactamente como estaba previsto: un merge entre
dos ramas que habian tocado esa linea se resolvio hacia el valor viejo, sin nada
en rojo en ningun lado.

`js/mechanic.js` y `css/mechanic.css` ahora son **hashes de contenido** dentro de
`scripts/versioned-assets-check.mjs`. Un hash no se puede resolver hacia el lado
equivocado de un merge y quedar verde.

**823/823, corrido 10 veces seguidas. 6 checks verdes, lint 0 errores.**

## 57. El modo oscuro, de verdad esta vez (27-ago-2026)

Diego, mirando la app del mecanico despues del primer intento: *"modo oscuro
sigue igual de pedorro no se entiende nada todo es azul"*.

**Estaba leyendo un numero real.** La pagina era `#0f1a2e` y la tarjeta
`#152035`: contraste **1.07**. El mismo color dos veces. Cada tarjeta, fila y
panel se disolvia en un unico campo navy plano.

### Por que el check no lo agarro

Medía la **tinta contra los fondos** y pasaba comodo - 14:1 sobre la tarjeta.
Nunca midio los fondos **entre si**. Texto perfectamente legible sobre una
tarjeta invisible sigue siendo una tarjeta invisible.

Ahora `GROUND_STEPS` exige distancia entre pagina, tarjeta y panel hundido. Con
la paleta nueva: **1.28** y **1.20**, mas bordes al 22% en vez de 16%.

### El tercer mecanismo de modo oscuro

`applyDarkModeInline()` en `js/admin.js`: recorria el DOM **en un timer**,
buscaba elementos cuyo estilo inline contuviera ciertos strings de color, y le
forzaba un valor oscuro a cada uno con `!important`.

Peleaba con los otros dos. Forzaba una paleta **neutra** (`#242426`, `#8E8E93`)
mientras los tokens pintan navy, asi que la misma pantalla terminaba con dos
oscuros distintos. Y no podia funcionar ni en principio: recorria los elementos
que existian **en el momento en que corria**, asi que toda tarjeta o modal
dibujado despues nunca quedaba cubierto - por eso necesitaba **ocho** llamadas
en timers y aun asi se le escapaban cosas.

Eliminado, junto con las **18 reglas `[style*='...']`** de `css/admin.css` que
cazaban un color por el **texto** de un atributo de estilo. Existian solo porque
los tokens no tenian valor oscuro.

### 58 literales que ningun tema podia alcanzar

Un token solo tematiza un color **escrito como token**. El lote que Diego estaba
mirando:

- `color:#0D1F3C` en los titulos de dia de la Agenda: tinta casi negra sobre
  pagina navy. Todos los dias menos hoy, ilegibles.
- `background:rgba(0,0,0,0.03)` en sus filas vacias: un lavado **negro**, que
  sobre fondo oscuro no existe.

El guard ahora los rechaza, y hubo que ampliarlo **tres veces** porque el color
se elige de tres formas distintas:

1. `background:#FEF2F2` - directo en el estilo.
2. `color:${isMech ? '#fff' : '#0D1F3C'}` - **adentro de un ternario**. Ahi se
   escondia la burbuja del chat.
3. `cancelled: '#FEF2F2'` - un **mapa de colores** asignado a una variable y
   pintado en otro lado.

Lo que de verdad no puede usar tokens se excluye **por nombre**, con
`dark-theme-check: off`: el reporte impreso (`window.open('')` es un documento
nuevo que nunca carga `variables.css`) y la tinta de la firma (se firma sobre
papel blanco en los dos temas).

`color-check` bajo de 134 a 118 en `admin.css`, de 68 a 38 en `js/admin.js` y de
13 a 3 en `js/mechanic.js`.

### Y tres cosas mas del mismo reporte

**La seccion de mecanicos estaba vacia.** `handlePublicMechanics` arrancaba de
`bookings where completed` y devolvia `[]` si no habia ninguna - asi que un
negocio nuevo mostraba *"coming soon"* a **todos** los visitantes hasta terminar
el primer trabajo. El unico momento para el que existe esa seccion - convencer a
alguien que nunca te escucho nombrar - era exactamente cuando no tenia nada que
mostrar. Diego lo encontro al cancelar su reserva de prueba. Invertido: arranca
de los mecanicos activos y les cuelga las estadisticas que haya.

**"Choose Your Plan" seguia sin entrar.** Centrar empeoro el problema: cuando el
contenido es **mas alto** que la caja, `justify-content: center` reparte el
sobrante arriba y abajo, y la mitad de arriba se va fuera de alcance debajo del
navbar fijo - por eso el titulo salia cortado. `safe center` centra mientras
entra y cae al inicio cuando no. Ademas las tarjetas ahora se aprietan con el
alto de pantalla en vez de desbordar.

**El logo de la gift card** estaba en `top:-18px`, por encima del borde: la
esquina redondeada le cortaba la D. Ahora entra 12px.

**848/848, corrido 10 veces. 7 checks verdes, lint 0 errores.**


## 58. La direccion de los clientes estaba abierta a internet (30-ago-2026)

Auditoria pre-lanzamiento, punto 2: *"la clave anonima esta en el JS, como
corresponde; toda la proteccion real es Row Level Security. Probalo."*

Se probo. **RLS estaba bien. Las vistas la esquivaban.**

### Lo que se pudo hacer sin ninguna credencial

Con la anon key que `js/supabase.js` sirve a cualquiera que abra la pagina,
contra produccion, el 30-ago-2026:

```
GET  /rest/v1/public_booking_tracking?select=*
  -> 200. Las 3 reservas, cada una con su tracking_token.

POST /api/auth?role=public-track   {"tracking_token": <uno de esos>}
  -> 200. Direccion completa, arrival_pin de 4 digitos, GPS del mecanico.
```

Dos pedidos. Sin login, sin token previo, sin adivinar nada.

### La causa raiz, en una frase

**Una vista de Postgres corre con los privilegios de su DUENO, no de quien
consulta** - y Supabase le da a `anon` **todos** los privilegios sobre los
objetos nuevos del esquema `public`.

Las dos vistas del proyecto se crearon owner-privileged **a proposito**: es la
unica forma de mostrarle a un anonimo una porcion filtrada de `bookings`, que
esta detras de RLS. Lo que nadie conto es la otra mitad del trato. Owner
privileges no solo hacen que ande el SELECT: hacen que anden las escrituras. Y
el GRANT por defecto agrego la puerta de escritura sola.

### Segundo agujero, misma causa

```
PATCH /rest/v1/public_reviews?id=eq.<uuid>   -> 204
```

`anon` tenia UPDATE sobre la vista de resenas. Una escritura por ahi aterriza
en `bookings` **sin que RLS se consulte nunca**. Hoy no hay resenas, asi que no
hay ids que direccionar; el dia que las haya, sus ids se leen en la misma vista
y cualquiera puede editarlas. Un DELETE por ese camino se lleva **la reserva
entera**, no la resena.

### Lo que este bug ensena sobre donde mirar

`api/auth.js:3404` **no estaba mal**. Su comentario dice, correctamente, que el
token es un UUID imposible de adivinar y que aceptar un `booking_id` crudo
arruinaba el punto de tenerlo - eso ya se habia arreglado (entrada del
2026-07-21). El codigo era correcto y la base lo contradecia.

Nadie lo iba a encontrar leyendo JavaScript. Por eso el guard son dos piezas y
no una:

- `tests/unit/public-views-locked.test.js` (13 tests, corre en CI): falla si
  algun REVOKE se cae de las migraciones. Una migracion re-corrida ya no puede
  reabrir el agujero, que es exactamente como se habria vuelto a colar.
- `scripts/rls-check.mjs` (`npm run rls:check`): pega contra la base de verdad
  como pegaria un atacante. **Fuera de `npm run check` a proposito** - usa red,
  y un Supabase lento seria CI en rojo en una rama que no toco nada.

El probe reprodujo los 3 hallazgos y **un cuarto que era ruido**: leia el
"no automatically updatable" de la vista de tracking por status 400, y
PostGREST lo contesta con 500. Ahora matchea el mensaje. Un detector que grita
de mas se termina ignorando, que es peor que no tenerlo.

### Lo que hay que correr

`scripts/lock-public-views.sql`. Revoca todo sobre `public_booking_tracking`
(**nada la usa** - se grepeo el repo entero; `handlePublicTrack` lee `bookings`
directo con la service key), le saca la escritura a `public_reviews` dejandole
el SELECT que la landing necesita, y cambia los default privileges del esquema
para que la proxima vista no nazca con el mismo agujero.

`public_reviews` **no** lleva `security_invoker = on`, y eso es deliberado:
prenderlo aplicaria la RLS de `bookings`, un visitante anonimo matchearia cero
filas y la seccion de testimonios quedaria vacia para siempre. Leer como el
dueno es el motivo por el que la vista existe. Sacarle la escritura es la unica
proteccion que puede tener - hay un test que falla si alguien "mejora" esto.

### Lo que NO se probo

- **DELETE.** No se mando ninguno, por la regla de no borrar filas. El GRANT
  por defecto de Supabase casi con certeza lo incluia junto al UPDATE que si
  se confirmo con el 204.
- **Cliente A leyendo la reserva del cliente B.** Requiere dos cuentas reales;
  las policies del repo dicen `auth.uid() = client_id` en SELECT, INSERT y
  UPDATE de `bookings`, pero los scripts del repo **ya se demostraron
  desactualizados** respecto de la base (`migrate-inventory-push.sql` declara
  `parts_inventory FOR ALL USING (true)` y la base la tiene cerrada). Queda
  pendiente contra la base, no contra el repo.

Las 16 tablas base, en cambio, si estan bien: lectura anonima devuelve 0 filas
en todas las sensibles, e INSERT anonimo devuelve `42501` en todas.

### Post-mortem del propio arreglo: el SQL no parseaba (30-ago-2026)

`lock-public-views.sql` se entrego con un error de sintaxis. La ultima
sentencia decia:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  FROM anon, authenticated;      -- <- falta ON TABLES
```

`ALTER DEFAULT PRIVILEGES` tiene que decir **de que tipo de objeto** habla
(TABLES / SEQUENCES / FUNCTIONS / TYPES / SCHEMAS). Sin `ON TABLES`, Postgres
falla al parsear en el `FROM`: `42601 syntax error at or near "FROM"`.

**Lo caro no fue el typo.** Un error de parseo **aborta el lote entero**, asi
que las tres sentencias anteriores - que estaban bien - tampoco corrieron. El
resultado es el peor posible: el script parece aplicado, Diego lo corre dos
veces, y la fuga sigue abierta. Un script que corre a medias hubiera sido mejor
que uno que no hace nada en silencio.

**Por que no lo agarro nada:** el SQL se pega a mano en el editor de Supabase.
Ningun test de este repo puede ejecutar Postgres, asi que la validez del SQL no
estaba cubierta por nada. Los tests que habia verificaban la *intencion* (que
el REVOKE existiera), no que el archivo fuera ejecutable.

Ahora hay tres tests que afirman la forma que Postgres exige: que
`ALTER DEFAULT PRIVILEGES` lleve `ON TABLES FROM`, que todo REVOKE/GRANT nombre
su objeto, y que ninguna sentencia quede sin terminar. **Se verificaron
re-introduciendo el bug a proposito**: con el bug, 2 tests fallan; sin el, 16
pasan. Un test que nunca se vio fallar no prueba nada.

Y una segunda vuelta de lo mismo: la primera version de esos tests **pasaba con
el archivo roto**, porque matcheaba el comentario que explica el bug en vez de
la sentencia. La segunda tambien fallaba, por CRLF: git deja `
` al final de
linea, `.` no matchea `
` y `$` sin flag `m` solo matchea fin de string, asi
que `--.*$` no borraba nada. Quedo como `--[^

]*`.

**CERRADO Y VERIFICADO EN PRODUCCION (30-ago-2026).** Con el SQL corregido:

```
GET  /rest/v1/public_booking_tracking  -> 401 permission denied for view
PATCH /rest/v1/public_reviews          -> 401 permission denied for view
GET  /rest/v1/public_reviews           -> 200  (la landing las sigue leyendo)
npm run rls:check                      -> exit 0, 17 cerradas, 4 publicas
```

Ademas, la mitad del punto 2 que a la manana no se podia probar quedo probada:
simulando un usuario logueado que no es admin ni dueno de nada
(`sub` = un UUID inventado, dentro de BEGIN/ROLLBACK), `bookings`, `profiles`,
`bikes` y `job_messages` devuelven **0, 0, 0, 0**. Un cliente no ve nada de
otro. Las politicas reales de la base lo confirman:
`bookings_select_own_or_admin` es `auth.uid() = client_id OR es admin` - y esa
excepcion de admin es la que hizo que el primer test diera un falso positivo,
porque el UUID elegido era la cuenta de admin de Diego.


## 59. El cobro sin reserva avisaba una vez y despues se olvidaba (30-ago-2026)

Auditoria pre-lanzamiento, punto 12. La regla de Diego no era una pregunta
abierta: *"Nunca puede existir un cobro sin reserva. Si la reserva no se puede
crear, no se cobra; y si el cobro ya salio, **se reembolsa solo, sin que nadie
tenga que mirar**."*

Habia **tres** redes y ninguna terminaba el trabajo.

### Lo que ya estaba bien, y hay que decirlo

1. `api/stripe-webhook.js` reconstruye la reserva desde la metadata del
   PaymentIntent. El navegador puede morirse justo despues del cobro y la
   reserva igual aparece. Eso se construyo despues del incidente del
   2026-08-05 (entrada 14) y **funciona**.
2. El webhook reembolsa solo si el monto no coincide con el precio que el
   servidor recalcula. Tambien funciona - y es la unica cosa que reembolsaba
   sola en toda la app.
3. Un cron diario (`?type=orphan-payments`) cruzaba Stripe contra `bookings` y
   encontraba los pagos huerfanos.

### Donde se cortaba

La red 3 es la que **se parece** a la regla y no lo es. Le mandaba a Diego un
WhatsApp que decia, literalmente: *"Either create the booking manually or
refund it in Stripe."* Eso es pedirle a un humano que mire. La regla dice lo
contrario.

Y era peor que eso: **avisaba una sola vez**. `isOrphanCandidate` descarta
cualquier pago que ya tenga `orphan_alerted` en su metadata - lo cual tiene
sentido para no despertar a Diego dos veces por lo mismo. El efecto real es que
un pago del que Diego se entero un martes y no llego a resolver **salia del
radar del cron para siempre**. La plata del cliente quedaba adentro, en
silencio, sin que nada volviera a mirarla nunca.

Tres agujeros mas, todos en el mismo bucle:

- **Sin numero de WhatsApp configurado** -> `continue`. Sin aviso, sin marca,
  sin reembolso, y un `console.error` que no lee nadie.
- **Twilio caido** -> `continue`. Igual.
- **Stripe se cansa de reintentar.** El webhook tira una excepcion cuando el
  insert falla, justamente para que Stripe reintente. Stripe reintenta unos 3
  dias y despues abandona. Si el error era permanente - por ejemplo **una
  columna que no existe porque la migracion no se corrio**, que es un modo de
  falla conocido de este proyecto - el final es un cobro sin reserva y nadie se
  entera.

### Lo que se hizo

`orphanAction()` en `api/_orphan-audit.js`: una funcion pura que decide que
hacer con un pago ya confirmado como huerfano.

- `alert` - nuevo: avisarle a Diego, que todavia puede convertirlo en reserva.
- `wait` - avisado y dentro del plazo.
- `refund` - **pasado el plazo: la plata vuelve sola.**
- `done` - una corrida anterior ya lo reembolso.

El cron ahora lista con `ignoreAlerted: true`, asi los ya avisados **vuelven a
entrar** en vez de desaparecer, y `orphanAction` es lo que evita re-avisar.

**El reembolso va primero y no depende del WhatsApp.** Que un cliente recupere
su plata no puede colgar de que Twilio ande o de que haya un numero cargado.
Eso invierte el orden que tenia el bucle, que era exactamente al reves.

**El plazo es 24 h** (`ORPHAN_REFUND_AFTER_HOURS`). Decision de negocio con
default aplicado, no consultada: suficiente para que Diego cree la reserva a
mano despues del aviso, corto para que nadie espere un fin de semana por su
propia plata. Hay un test que lo afirma para que no se mueva sin querer, y otro
que verifica que el plazo entre en la ventana de 48 h que mira el cron - si no,
el pago envejeceria fuera de la lista antes de poder reembolsarse.

### El modo de falla catastrofico, y su test

Un reembolso automatico tiene una forma de salir horriblemente mal: si la
consulta a `bookings` falla y se interpreta como "no hay ninguna reserva",
**todos** los pagos del dia parecen huerfanos y la caja se reembolsa sola.

El codigo ya abortaba bien (`return res.status(500)`), pero eso no estaba
cubierto por ningun test y ahora si lo esta. Es la clase de linea que una
"simplificacion" futura borra sin entender que sostiene.

### Lo que NO se toco, a proposito

`shouldCreateBookingFor` en el webhook sigue devolviendo `{skipped}` sin
reembolsar cuando falta la metadata. La tentacion era hacerlo reembolsar ahi
tambien, y es una trampa: por ese mismo camino pasan PaymentIntents que
**legitimamente** no son reservas y que los filtros de arriba no atrapan (el
Checkout Session de `create-payment-session.js:251` lleva solo
`{bookingId, email}`). Reembolsarlos seria devolver plata de cobros validos.

El cron es el unico lugar del sistema que cruza contra `bookings`, o sea contra
la verdad, y por eso es el unico que puede decidir un reembolso. Una red que
sabe, en vez de cuatro parches que adivinan.

15 tests nuevos. 876/876, corrido 4 veces.

## 60. El PIN del mecanico solo estaba blindado en la puerta de entrada (30-ago-2026)

Auditoria pre-lanzamiento, punto 3. El PIN es de 4 digitos. Lo unico entre
alguien que lo adivina y el nombre, telefono y direccion exacta de cada cliente
del dia es el bloqueo por intentos fallidos - y ese bloqueo cubria **una sola**
de las catorce rutas que aceptan el PIN.

### El estado real, no el que decia la auditoria

La auditoria (y viejas notas) hablaban de "sin bloqueo". Falso: el bloqueo
existe desde el 2026-06-29 (5 fallos / 15 min, respaldado en la tabla
`login_attempts`, cross-instance). Lo que estaba mal era **donde** estaba puesto.

`handleMechanic` (role=mechanic, la pantalla de login) llamaba `isLoginLocked`
antes de autenticar. Pero las otras trece rutas - `mechanic-jobs`,
`mechanic-update-status`, `mechanic-parts`, `mechanic-messages`,
`mechanic-location`, ... - autentican pasando el mismo PIN a `authMechanic`, y
**ninguna** consultaba el bloqueo. La unica barrera ahi era el rate limit
generico de 30/min por IP.

### Verificado contra produccion

```
POST /api/auth?role=mechanic       PIN malo x6 -> 401 401 401 401 401 429
POST /api/auth?role=mechanic-jobs  PIN malo x8 -> 401 401 401 401 401 401 401 401
```

El login corta al sexto. `mechanic-jobs` no corta nunca. 10.000 PINs a 30/min
son ~5 horas desde una sola IP, y minutos repartido en varias. El que lo saca
entra a `mechanic-jobs` y ve la agenda entera con direcciones.

### El arreglo

El bloqueo se movio **adentro de `authMechanic`**, que es el unico camino que
comparten las catorce rutas. Ahora:

- consulta `isLoginLocked` antes de procesar un PIN, y corta con 429 sin
  siquiera leer la base;
- cuenta el fallo (`recordLoginFailure`) en cualquier ruta, no solo en login;
- limpia el contador con un PIN correcto.

Aplica **solo al camino del PIN**. Un token de sesion es un HMAC de 256 bits,
no algo que se adivine de a 4 digitos, y uno vencido es un evento normal, no un
ataque - un pedido con token nunca toca el contador ni el bloqueo. Si lo
tocara, un mecanico con la sesion vencida se autobloquearia al reabrir la app.

`handleMechanic` se simplifico para no contar doble: el bloqueo, el contador y
el reset viven ahora en `authMechanic`; el handler solo agrega el header
`Retry-After`, que es propio de la UI de reintento del login.

### La otra mitad del punto 3 ya estaba

"PIN por mecanico o rotable sin tocar codigo": ya existe. `handleAdminSetMechanicPin`
(role=admin-set-mechanic-pin) deja a Diego fijar o rotar el PIN de cada
mecanico desde Admin, guardado como `pin_hash` (HMAC), nunca en texto plano, y
devuelto una sola vez para entregarselo al mecanico. El PIN es por-contacto, o
sea por-mecanico. No hay nada que hacer aca.

### Lo que NO se hizo

- **No se cambio el largo del PIN** (sigue 4 digitos). Con el bloqueo cubriendo
  las catorce rutas, el espacio de 10.000 ya no es fuerza-bruteable online. Un
  PIN mas largo es mejora incremental, no cierre de agujero.
- **No se probo el 429 en las trece rutas contra produccion despues del fix**
  porque el fix todavia no esta deployado. Se probo la funcion `authMechanic`
  directa con 6 tests (bloqueo, conteo, reset, y que el token no toca nada). El
  429 en `mechanic-jobs` hay que confirmarlo en produccion despues del merge.

6 tests nuevos. 882/882.

## 61. No habia backups. Ninguno. (30-ago-2026)

Auditoria pre-lanzamiento, punto 19. La pregunta era *"Supabase los hace, pero
nadie restauro uno nunca"*. **La respuesta result peor que la pregunta.**

Diego abrio Database > Backups y mando la captura:

> **Free Plan does not include project backups.**
> Upgrade to the Pro Plan for up to 7 days of scheduled backups.

No es "backups que nadie probo". Es que **no existe ninguno**. Si la base se
pierde - un `DELETE` mal escrito en el SQL Editor, que es como se corren todas
las migraciones de este proyecto - no hay a donde volver.

Hoy son 3 reservas y se sobrevive. El dia que sean 200 clientes con sus bicis,
su historial de servicio y sus pagos, es el fin de los registros del negocio.

### Lo que se hizo

Diego eligio la opcion gratis: **volcado nocturno de toda la base a JSON,
enviado por email**. Queda **fuera de Supabase por construccion** - sale del
proyecto y aterriza en su casilla, asi que sobrevive a que el proyecto muera.

No reemplaza el point-in-time recovery de Pro y el cuerpo del mail lo dice.
Es la diferencia entre perder un dia y perder todo.

Corre dentro de `?type=all`, el cron diario que ya existe: Vercel en plan Hobby
no permite crons mas frecuentes que diarios, y agregar una entrada nueva ya
hizo fallar un deploy antes (ver el comentario arriba de `api/send-cron.js`).
Va **ultimo** en el `Promise.allSettled`, para leer el estado despues de que
los otros jobs terminaron de escribir y no a mitad de camino.

### Las dos formas en que un backup miente

Un backup en el que no se puede confiar es peor que ninguno, porque se deja de
pensar en el. Las dos formas estan cubiertas y testeadas:

1. **Truncado silencioso.** PostgREST devuelve **1000 filas como maximo** por
   pedido. Un volcado ingenuo de una tabla que crece se detendria en 1000 y el
   archivo se veria completo igual. Cada tabla se pagina hasta agotarla.
2. **Omision silenciosa.** Si una tabla falla, descartarla y mandar el resto
   produce un archivo que parece entero y no lo es. Una tabla que falla queda
   registrada **adentro** del backup (`__backup_error__`) y el asunto del mail
   dice **INCOMPLETO**.

Hay un tercer caso: si el archivo supera los 20 MB no se manda un mail que
Resend va a rechazar en silencio - se manda un aviso diciendo que **hoy no hay
copia** y que a ese tamano la respuesta es un plan con backups de verdad.

### El hueco que encontro el chequeo contra la base real

La lista de tablas se verifico contra el esquema vivo, y el chequeo encontro el
modo de falla que la lista tiene: **una tabla que existe en la base y no esta
nombrada no la respalda nadie, y nada lo dice.**

Faltaban dos:
- `waitlist_signups` - personas reales que pidieron que las contacten.
- `stripe_events` - los ids de eventos de Stripe que evitan procesar un webhook
  dos veces. Perderlos es plata, no datos.

Ahora hay una lista `DELIBERATELY_SKIPPED` con el motivo de cada exclusion
(`geo_cache` se regenera, `login_attempts` no significa nada una hora despues,
`bookings_backup_20260726` ya es una copia y duplicaria el archivo), y un test
que compara las dos listas contra el esquema pinneado al 30-ago-2026. Cuando
una migracion agregue una tabla, el test falla y obliga a elegir: respaldarla o
saltearla con una razon. Las dos estan bien; el silencio no.

### Lo que NO se verifico

**No se disparo el endpoint contra produccion.** Mandaria un mail real con
todos los datos de los clientes, y hacerlo antes del merge significa correr el
codigo de una rama. Se verifico que las 24 tablas existen (las 24 responden 200
en la API) y hay 17 tests sobre el armado del archivo. **El primer mail de
verdad llega el dia despues del merge, a las 9:00 UTC.** Si no llega, el
problema esta en el envio, no en el armado.

**El destinatario esta hardcodeado**, no configurable: el archivo es el nombre,
telefono y direccion de cada cliente en un solo lugar. Ninguna variable de
entorno ni campo de admin puede redirigirlo.

17 tests nuevos. 899/899.

## 62. Los analytics arrancaban antes de que nadie aceptara nada (30-ago-2026)

Auditoria pre-lanzamiento, punto 7. **44 paginas** cargaban Google Analytics,
PostHog y el *session replay* de Sentry en el `<head>`, antes de que el
visitante tuviera oportunidad de decir nada. No habia banner.

El session replay no es un detalle tecnico: **graba lo que la persona hace en
pantalla**. Arrancar eso sin preguntar es distinto de dejar una cookie.

### Por que no alcanzaba el Consent Mode de Google

La solucion "oficial" de Google es declarar `gtag('consent','default', denied)`
antes de cargar el tag. Eso evita que GA escriba cookies, **pero el script se
carga igual y habla con Google igual** - y no hace absolutamente nada por
PostHog ni por Sentry.

Asi que el bloqueo es de verdad: cada tag de analytics viaja como
`<script type="text/plain" data-consent="analytics">`, que **ningun navegador
ejecuta**. `js/consent.js` los reescribe a `<script>` reales solo cuando hay
consentimiento. No hay nada que "des-enviar", porque no se envio nada.

El Consent Mode se declara **ademas**, en denied. Asi, si alguien agrega un tag
nuevo y se olvida del envoltorio, degrada a sin-cookies en vez de a rastreado.

### Las dos formas de analytics, y por que hicieron falta dos mecanismos

1. **Tags** (GA en las 44 paginas, PostHog y Sentry en index.html): se
   neutralizan con `type="text/plain"`.
2. **Codigo** (PostHog en la landing se inicia desde `js/landing-inline.js`, no
   hay tag que neutralizar): se registra con `window.drbikeOnConsent(fn)`, que
   corre la funcion ya mismo si hay consentimiento o al aceptar, y nunca si no.

El segundo caso tenia una trampa. El snippet de instalacion de PostHog deja
`window.posthog` con un **stub truthy**, y `js/app.js` y `js/cta-tracking.js`
guardan cada `capture()` con `if (window.posthog)`. Sin limpiarlo, todas esas
llamadas creerian que el rastreo esta activo y encolarian eventos para un
consentimiento que quiza nunca llegue. Se guarda el stub en una variable, se
limpia el global, y se restaura solo al aceptar.

Y **falla cerrado**: si `js/consent.js` no cargara, el resultado seguro es no
rastrear, nunca rastrear sin haber preguntado.

### Por que un script y no 44 ediciones a mano

`scripts/consent-gate.mjs` hace la transformacion. Editar 44 archivos a mano es
como se escapa uno, y **una pagina que se escapa sigue rastreando en silencio y
no se nota**. El script es idempotente, asi que se puede volver a correr despues
de que `generate-suburb-pages.mjs` genere paginas nuevas, y trae un `--check`
que sale con exit 1 nombrando las paginas sin proteger (`npm run consent:check`).

**No toca `<script type="application/ld+json">`**, que es lo que Google lee para
mostrar precios y zonas en los resultados de busqueda. Bloquear eso hubiera
costado en silencio todo el trabajo de SEO de las paginas de suburbio. Hay un
test que lo verifica.

### Verificado haciendo fallar los guardas a proposito

Se desprotegio `bondi.html` a mano: el test fallo nombrando la pagina y
`npm run consent:check` salio con exit 1. Restaurada, 26/26 y exit 0. **Un test
que nunca se vio fallar no prueba nada** - la misma leccion de la entrada 58.

### Lo que NO se verifico

- **No se abrio el navegador** (prohibido en esta sesion). Que el banner se vea
  bien lo tiene que mirar Diego despues del deploy.
- **`sw.js` subio a v98/v71** porque el banner es contenido nuevo. Sin eso, un
  visitante que ya entro seguiria con la version vieja cacheada.
- **El `?v=` de `js/landing-inline.js`** lo agarro `npm run check`, no yo:
  cambie el archivo y no actualice el hash en `landing.html`. Exactamente la
  trampa que documenta CLAUDE.md, y el guard automatico funciono.

26 tests nuevos. 928/928.

## 63. La politica de privacidad prometia algo que no se podia hacer (30-ago-2026)

Auditoria pre-lanzamiento, punto 9: *"Si un cliente pide 'borren todo lo mio' o
pide una copia de sus datos, hoy no hay forma."*

`privacy.html` ya prometia las dos cosas, bajo la Privacy Act 1988, y
**responder dentro de los 30 dias**:

> Access the personal information we hold about you
> Request deletion of your personal information (subject to our legal
> retention obligations)

Contestar por email es un proceso **valido**: la ley australiana no exige un
boton de autoservicio. **El hueco no era el boton.** Era que cuando alguien
pidiera de verdad, no habia forma de hacerlo: significaba escribir SQL a mano
sobre una docena de tablas y acordarse, de memoria, de cuales guardan datos
personales. Una promesa que no se puede ejecutar es peor que ninguna, porque
esta publicada en el sitio.

### Lo que hace que esto no sea un DELETE

`privacy.html` **tambien** promete guardar los registros de reservas **7 anos**,
por obligacion fiscal australiana. Leidas rapido las dos promesas se
contradicen. No: la respuesta a "borren todo lo mio" es **anonimizar**. El
registro financiero queda con sus fechas e importes - que es lo que exige la
ATO - y se le saca toda la identidad.

Asi que **ningun paso borra una fila de `bookings`**, nunca, y hay un test que
falla si una edicion futura lo cambia. Tambien hay un test que verifica que las
columnas financieras (`service_price`, `callout_fee`,
`stripe_payment_intent_id`, ...) **no** esten entre las que se tocan: anonimizar
de mas destruye el registro fiscal, que es el otro error posible.

### Por que imprime SQL en vez de ejecutarlo

Un endpoint HTTP que anonimiza un cliente **es un arma**: una llamada mal hecha,
o un bug en un chequeo de autenticacion, y los registros de alguien real quedan
sin datos sin deshacer. Un script que **imprime SQL revisado es una herramienta**:
Diego lo lee, ve que tablas toca y por que, y lo corre el mismo - igual que
todas las migraciones de este proyecto.

El bloque sale con `BEGIN;` al principio y `-- COMMIT;` **comentado** al final,
a proposito: se corre, se miran los conteos de filas afectadas, y recien ahi se
descomenta. Un cliente con 2 reservas no deberia tocar 40 filas.

### El bug que aparecio corriendolo

La primera version parseaba los argumentos con
`args[args.indexOf('--id') + 1]`. `indexOf` devuelve **-1** cuando la bandera no
esta, y `-1 + 1` es **0** - asi que leia `args[0]`, que era la cadena literal
`--forget`, y generaba:

```sql
WHERE client_id = 'forget'::uuid
```

SQL con un WHERE basura, apuntado a registros reales. **No lo encontre
leyendolo: lo encontre corriendolo.** Ahora hay una funcion `flag()` que
devuelve `null` cuando falta, y validacion de formato de uuid y de email antes
de construir nada. Con un test que lo fija.

### La deriva de esquema, que es el riesgo real a largo plazo

`api/_privacy.js` es la fuente de verdad de donde vive el dato personal. Una
migracion que agregue una columna con un nombre, un telefono o una direccion y
no la agregue ahi crea un dato que **ningun pedido de borrado va a alcanzar, y
nada lo dice**.

No se puede chequear automaticamente desde el repo: leer `information_schema`
necesita la service key, que no esta ni debe estar aca. Asi que
`docs/RUNBOOK-PRIVACY.md` seccion 3 trae la consulta que lista toda columna con
pinta de dato personal, para correr **despues de cada migracion** y comparar
contra `PII_MAP` y `NOT_PERSONAL`. Toda tabla esta en una de las dos listas, y
las no-personales llevan el motivo escrito - hay tests que lo exigen.

### Lo que el runbook admite que NO cubre

Escrito en la seccion 4, para informarselo al cliente en la respuesta:

- **Supabase Auth**: `auth.users` vive fuera de `public`. Se borra a mano desde
  el panel, y es a proposito que sea manual porque cascadea.
- **Stripe**: los pagos quedan alla con su propia retencion.
- **Los backups nocturnos**: contienen copias previas a la anonimizacion. Es
  correcto - son registros historicos - pero si el pedido es explicito hay que
  borrar esos correos.
- **Emails ya enviados**: no se pueden retirar de la casilla del cliente.

Prometer mas de lo que se puede cumplir es exactamente el problema que este
runbook vino a arreglar; el runbook no lo repite.

22 tests nuevos. 950/950.

## 64. El banner de cookies era una losa de lado a lado (30-ago-2026)

Diego, mirandolo en produccion apenas se deployo la entrada 62: *"el baner se ve
asi... creo que hay que hacerlo de otro color como azul claro difuminado y mas
chico esta muy ancho"*.

Tenia razon. La primera version era `left:0; right:0; bottom:0` con fondo blanco
solido: en una pantalla de 1900px, **una losa cruzando la pagina entera para una
sola frase**. Funcionalmente correcta, visualmente pesada.

### Lo que cambio

Tarjeta flotante de **440px maximo**, abajo a la derecha (fuera del camino de
lectura), con 16px de aire en los cuatro lados, esquinas de 14px y fondo azul
translucido con `backdrop-filter: blur(16px)`.

El azul se arma con `color-mix` en vez de un tinte fijo, y eso **no es
decoracion**: los dos temas necesitan cosas opuestas y los tokens ya lo
resuelven. `--white` es blanco en claro y **es el color de la tarjeta oscura**
en oscuro, asi que la misma expresion da una tarjeta azul suave en claro y una
tarjeta oscura teñida de azul en oscuro. **Una regla, dos temas, ningun bloque
`[data-theme]` que mantener sincronizado** - que es exactamente la deuda que
produjo los 160 parches de la entrada 48.

`background` se declara **dos veces** a proposito: un navegador sin `color-mix`
anidado ignora la segunda y se queda con la tarjeta tematizada plana. Legible
en todos lados, esmerilada donde se puede.

### "Mas chico" no salio del area tactil

Los botones **siguen midiendo 44px de alto**, que es la regla mobile del
proyecto. El volumen venia del padding (`12px 20px`), no de la altura, asi que
eso es lo que bajo (`8px 16px`), mas texto de 13px a 12.5px. Se ve
sensiblemente mas chico y sigue siendo pulsable con el pulgar.

### El contraste se calculo, no se miro

El fondo cambio de blanco puro a `#f0f4fe`, asi que todo el texto encima
cambio de relacion. Medido con la formula WCAG:

```
--gray  #475569 sobre #f0f4fe -> 6.88:1   OK AA
--blue  #2563eb sobre #f0f4fe -> 4.70:1   OK AA
--navy  #0d1f3c sobre #f0f4fe -> 14.92:1  OK AA
blanco  sobre el boton --blue -> 5.17:1   OK AA
```

Los cuatro pasan el minimo AA de **4.5:1** para texto normal. Hay 4 tests que
recalculan esto, para que un ajuste futuro del tinte no baje ninguno en
silencio - la leccion de la entrada 57, donde la tarjeta y la pagina estaban a
1.07:1 y el check pasaba porque solo medía la tinta.

### El bump del service worker no era opcional

`js/consent.js` se carga **sin `?v=`**, igual que `js/i18n.js` y
`js/landing-inline.js`. `npm run check` no lo marca porque no esta en la lista
de assets versionados. Eso significa que **solo un bump de `CACHE_STATIC`
entrega el banner nuevo**: sin el, todo navegador que ya entro seguiria viendo
la losa ancha para siempre. v98 -> v99.

### Un test que fallo por matchear su propio comentario, otra vez

El test "no hay bloque `[data-theme]`" leia el archivo entero, y el comentario
que **explica** por que no hay un `[data-theme]` contiene esa cadena. Fallaba
sobre codigo correcto. Ahora mira solo el string de estilo
(`bar.style.cssText`), no la prosa. **Tercera vez en esta sesion** que un guard
matchea su propia explicacion (ver 58 y 62): cuando un test lee texto fuente,
hay que acotar la ventana a codigo antes de afirmar.

9 tests nuevos. 937/937.

### Lo que NO se verifico

**No se abrio el navegador** (prohibido en esta sesion). Diego tiene que mirar
el resultado en celular y compu despues del deploy. Lo que si esta verificado
por calculo es el contraste; lo que no se puede calcular es si el lugar y el
tamaño le gustan.

## 65. Nada le decia a un usuario de teclado donde estaba parado (30-ago-2026)

Auditoria pre-lanzamiento, punto 13. Dos fallas, **ninguna visible para alguien
que usa mouse**, que es exactamente por que sobrevivieron tanto.

### 1. No habia "saltar al contenido" en ninguna parte

Un usuario de teclado tabulaba por **todo el encabezado** antes de llegar a la
pagina. En la SPA, donde el router redibuja la pantalla sin recargar, eso pasa
en **cada cambio de pantalla**.

Ahora `index.html` y `landing.html` abren con un `.skip-link` que es lo primero
del orden de tabulacion. Esta escondido con `left:-9999px` y **no** con
`display:none`, porque `display:none` lo sacaria del orden de tabulacion, que es
lo unico que no puede pasar.

### 2. No habia estilo de foco, y seis reglas tiraban el del navegador

Solo dos componentes (`.celebrate-close`, `.gift-close`) tenian
`:focus-visible`. Todo lo demas dependia del anillo propio del navegador - y
**seis reglas lo apagaban con `outline: none`**. Cuatro de ellas en la regla
**base**, no en `:focus`, asi que aplicaban siempre:

```
css/main.css      .review-textarea:focus
css/main.css      .form-input:focus
css/main.css      .gift-body input, .gift-body textarea
css/admin.css     .inp
css/mechanic.css  .pin-inp        <- el campo del PIN del mecanico
css/mechanic.css  .notes-inp
```

`.pin-inp` es el peor: se tabula al campo del PIN y **nada en pantalla dice
donde estas**.

Las seis se limpiaron. El anillo global vive en `css/variables.css` - un archivo
que por lo demas solo tiene tokens - porque **es la unica hoja de estilos que
cargan las cinco superficies**: `track.html` no carga ninguna otra. Cualquier
lugar mas "correcto" habria dejado una superficie sin cubrir.

`:focus-visible` y no `:focus`: un click con mouse no debe dejar un anillo
puesto. El navegador ya sabe distinguir; el punto es dejarlo decidir. Y
`outline` en vez de `box-shadow` porque un outline no lo recorta
`overflow:hidden` ni lo deforma el `border-radius` del padre.

`--focus-ring` tiene valor en los dos temas: `#2563eb` en claro (5.17:1 sobre
blanco) y `#93c5fd` en oscuro (6.73:1 sobre la tarjeta). WCAG 1.4.11 pide 3:1
contra lo que este al lado; hay un test que lo **calcula**.

### El agujero que aparecio de rebote: `css/main.css` no estaba vigilado

`css/main.css` llevaba un `?v=` escrito a mano (`20260827a`) y **no estaba en
`scripts/versioned-assets-check.mjs`**. O sea: edite `main.css` para arreglar el
foco, `npm run check` quedo **verde**, y el arreglo habria sido invisible para
todo navegador que ya entro.

Es el **mismo hueco que mordio a `mechanic.html` cuatro dias antes** (entrada
14.11 / el comentario del propio script). Se agrego `css/main.css` a la lista,
en las dos paginas que lo cargan, y el check inmediatamente marco lo que
faltaba. Deja de ser algo que hay que acordarse.

### Dos errores propios que valen mas que el codigo

1. **El guard reportaba rota toda pagina correcta.** Comparaba el indice de
   `class="skip-link"` - un atributo, siempre unos caracteres *adentro* de su
   propio `<a>` - contra el indice del primer `<a>`. Encontrado corriendolo.
2. **Correr prettier sobre `js/i18n.js` rompio dos tests que ya existian**
   (`live-route`, `profile-card-and-birthday`): buscan cadenas por indice y el
   reformateo las movio. Se revirtio el archivo y las traducciones se
   re-insertaron **preservando el fin de linea CRLF**, sin reformatear. Leccion:
   `npm run format` cubre `js/`, pero i18n.js es un diccionario que otros tests
   leen posicionalmente - no se formatea de paso.

### Lo que NO se hizo

- **No se recorrio la reserva entera sin mouse.** Eso necesita un navegador y
  esta prohibido en esta sesion. Lo que si esta: el anillo existe, es visible en
  los dos temas por calculo, y ninguna regla lo apaga. **Falta que Diego tabule
  el flujo** y avise si algun modal atrapa el foco.
- **No se auditaron trampas de foco en modales.** `Escape` cierra en los seis
  modales que se revisaron (`js/app.js` x3, `landing-inline.js` x2,
  `mechanic.js` x1), pero que el foco vuelva al disparador al cerrar no se
  verifico.

16 tests nuevos. 966/966.

## 66. Un lector de pantalla no se enteraba de nada (30-ago-2026)

Auditoria pre-lanzamiento, punto 15: *"que anuncie el cambio de paso, que lea
los errores al ocurrir, y que el mapa tenga alternativa en texto"*.

La app tenia **exactamente dos regiones `aria-live`, y las dos eran spinners de
carga**. Un pago fallido, un cambio de paso en el asistente de reserva, y el
mecanico moviendose por el mapa: los tres se le anunciaban a **nadie**.

### El helper, y por que tiene la forma que tiene

`announce(mensaje, { assertive })` en `js/components.js`, con **dos regiones
persistentes** creadas una vez y en las que se escribe.

No se inserta un elemento nuevo que traiga `role="alert"` puesto. Un lector
anuncia una region viva cuando su **contenido cambia**; un elemento que llega ya
con su texto se anuncia de forma inconsistente, y en algunas combinaciones no se
anuncia nunca. Esta es la forma que funciona en todos.

Dos canales, y la distincion importa:
- **polite** espera una pausa. Estados, cambios de paso, el mecanico moviendose.
- **assertive** interrumpe. **Solo errores**: un pago que fallo no puede esperar
  a que el lector termine la oracion en la que esta.

Y limpia el texto antes de escribirlo: **dos pagos fallidos seguidos es un caso
real**, y una region cuyo texto no cambio no dice nada.

`.sr-only` usa la receta `clip-path` de 1px, no `display:none` ni
`visibility:hidden` - las dos sacan el elemento del arbol de accesibilidad, que
es lo unico que no puede pasar.

### Los errores

`showToast()` creaba un `div` pelado, sin `role` ni `aria-live`. Ahora anuncia
por la region viva, y el toast lleva `aria-hidden="true"`: sin eso el lector
lee el mismo mensaje **dos veces**.

### El cambio de paso

Los tres pasos del asistente se redibujan **dentro de la misma pantalla sin
tocar el hash**, asi que no habia ninguna senal - el lector simplemente
encontraba contenido distinto bajo el cursor.

Se engancho en `scrollStepToTop()`, que ya era el unico lugar que corre en cada
cambio de paso, en las dos superficies. Un solo punto en vez de tres.

### El mapa

`#tracking-map` es un lienzo de tiles: ilegible, y un lector que aterriza ahi
encuentra un hueco sin etiqueta. Ahora lleva `aria-hidden="true"` y al lado hay
un `#map-alt` que dice lo mismo en texto, alimentado desde `paintETA()` para que
no pueda quedar viejo.

Con guarda de repeticion: eso repinta **cada pocos segundos** mientras el
mecanico se mueve, y un lector repitiendo la misma oracion en loop es peor que
el silencio.

### El bug del guard, que es la parte que mas vale

El chequeo de traducciones cortaba el diccionario asi:

```js
dict.slice(dict.indexOf(`  ${lang}: {`))   // hasta el FINAL del archivo
```

Para `es`, eso incluye el bloque `zh` entero. **Una cadena traducida solo al
chino satisfacia tambien el chequeo del espanol.** El guard pasaba sobre una
traduccion faltante de verdad.

Se encontro **borrando una a proposito** para ver si el guard la agarraba. No
la agarro. Ahora `langBlockOf()` corta hasta el siguiente idioma, y el mismo
arreglo se aplico a `tests/unit/keyboard-access.test.js`, que tenia el error
identico. Verificado volviendo a borrarla: ahora si falla.

**Un test que nunca se vio fallar no prueba nada** - cuarta vez en esta sesion
(ver 58, 62, 64).

### Las cadenas habladas y el agujero del i18n-check

Las seis cadenas nuevas pasan **adentro** de `translateValue()` via `announce()`,
y `scripts/i18n-check.mjs` solo ve las que estan **afuera**. Es el hueco que
CLAUDE.md documenta: una traduccion faltante ahi es silenciosa, la cadena sale
en ingles y el check queda verde.

Por eso `scripts/a11y-check.mjs` las verifica por nombre, una por una.

### Lo que NO se verifico

**No se probo con un lector de pantalla real** (NVDA, VoiceOver, TalkBack). Eso
necesita un navegador, prohibido en esta sesion. Lo que si esta verificado: las
regiones existen, tienen la forma que los lectores anuncian de forma confiable,
los tres disparadores estan conectados, y las seis cadenas estan en los tres
idiomas. **Lo que falta es que alguien lo escuche.**

19 tests nuevos. 985/985.

## 67. El reembolso automatico podia saltearse el aviso (31-ago-2026)

Diego, leyendo el resumen de la entrada 59: *"cuando pase esto me tiene que
llegar un mensaje que se genero un pago sin reserva... aunque el cliente no
puede avanzar en nuestra pagina en los pasos del booking para pagar asi que no
creo que pase"*.

Las dos mitades de esa frase tenian respuesta, y ninguna era la esperada.

### "No creo que pase": ya paso, un mes entero

El huerfano no aparece porque alguien avance sin pagar. Aparece al reves:
**primero se cobra, despues se escribe la reserva.** El huerfano es exactamente
lo que queda cuando el cobro sale bien y la escritura falla.

`js/app.js:1863` lo documenta: entre el **2026-07-04 y el 2026-08-05 le paso a
TODOS los invitados, SIEMPRE** - el front dejaba pagar y recien despues pedia
iniciar sesion, `create-booking` respondia 401, y la reserva nunca existia. El
5 de agosto una clienta real pago $20 y no recibio nada: ni recibo, ni
confirmacion, ni el aviso de reembolso, porque los tres iban a un email
inventado que caia en la casilla de Diego (`js/app.js:2497`).

Eso ya esta arreglado. Pero la clase de falla es estructural al orden
cobro -> reserva, y por eso existe el barrido.

### El hueco que su pedido destapo

`orphanAction` devolvia `'refund'` apenas el pago pasaba las 24h, **mirara o no
si Diego habia sido avisado**. Y eso no es un caso raro: **es el ordinario.**

El barrido corre **una vez por dia**. Un pago hecho poco despues de una corrida
ya tiene mas de 24h la primera vez que el barrido lo ve - asi que iba derecho a
`'refund'`, y Diego recibia **solo el aviso del reembolso, nunca el aviso del
huerfano**. Perdia la oportunidad de convertir un trabajo real en una reserva
real antes de que la plata volviera.

Ahora **nada se reembolsa antes de avisarle**. Sin `orphan_alerted`, la accion
es `'alert'`, tenga la edad que tenga.

### Y el backstop, porque la regla nueva tiene su propio modo de falla

Si no hay numero de WhatsApp configurado, o Twilio esta caido varios dias,
`orphan_alerted` **nunca se marca**. Un "nunca reembolsar antes de avisar" puro
dejaria la plata del cliente adentro **para siempre**, que es justo la falla que
todo esto vino a terminar.

`ORPHAN_HARD_REFUND_AFTER_HOURS = 72`: a los tres dias la plata vuelve, haya
llegado el mensaje o no. Hay un test que exige que ese plazo sea **mayor** que
el normal, o nunca aplicaria.

### El mensaje decia algo que no podia cumplir

Decia *"Create the booking within 24h or it refunds itself"*. Con un barrido
diario, "dentro de 24h" no es cierto: la proxima oportunidad de actuar es la
proxima corrida. Ahora dice que lo cree **hoy**, y que se reembolsa en la
corrida siguiente.

### Lo que depende de algo que NO se pudo verificar

Todo esto asume que el numero de WhatsApp del admin esta cargado
(`van_zones` con `van_number = 0` y `suburb = '__whatsapp__'`). **No se puede
leer desde aca**: RLS lo esconde del rol anonimo, correctamente. Si no esta
cargado, el handler hace `continue` y el unico rastro es un `console.error` en
los logs de Vercel que no lee nadie.

Queda como verificacion pendiente de Diego, con el SQL en el chat.

18 tests en el archivo (3 reescritos, 3 nuevos).

## 68. Reserva primero, cobro despues (31-ago-2026)

Diego: *"debe ser primero la reserva... el sentido comun de la pagina web es
bloquear primero la fecha y la hora, y despues ocurre el pago. No entiendo por
que estaba al reves."*

Nadie lo decidio al reves. El paso 2 del asistente pide fecha y hora, asi que
cualquiera asume que el turno queda tomado ahi - pero elegir una fecha solo
escribia `window.appState.date`, **en la memoria del navegador**. Habia UNA
escritura a la base y venia al final, despues del cobro.

### Lo que compra, y lo que NO (correccion registrada)

Le dije a Diego que dos clientes eligiendo el mismo horario dejan al segundo
**cobrado y sin reserva**, y use eso para empujar el cambio como urgente.
**Era falso**, y se lo corregi: `api/auth.js` atrapa el `23505` de
`bookings_unique_slot` y **reembolsa** antes de devolver 409.

Lo que el cambio realmente compra:
- la tarjeta **no se toca** por un turno que el cliente no puede tener, en vez
  de un cobro y una devolucion que tarda dias en aclararse;
- no depende de que el reembolso funcione - que es justo lo que falla cuando
  Stripe es lo que esta caido;
- coincide con lo que el visitante ya asume.

### Sin migracion, a proposito

Una retencion **no es una tabla ni una columna nueva**: es una reserva con
`status='pending'` y **sin** `stripe_payment_intent_id`, que vence por
`created_at`. Las tres columnas ya existian (verificado contra el esquema vivo).

Eso importa mas que la elegancia: aca el SQL se corre a mano y el codigo llega
a main antes, asi que un diseno que necesitara una columna nueva estaria roto en
produccion hasta que Diego corriera el archivo.

**La expiracion es perezosa porque tiene que serlo**: la ventana son 15 minutos
y Vercel Hobby no permite crons sub-diarios. Se resuelve en los dos lugares que
importan - al leer disponibilidad (una retencion vencida no ocupa) y al escribir
(se cancelan las vencidas del turno antes de insertar, o el indice unico
rechazaria la nueva).

### Un handler, no dos

`hold-slot` **reusa `handleCreateBooking`**. Cobertura, tarifa por zona, turno
bloqueado y precios de membresia ya viven ahi; un segundo handler se
desincronizaria. La bandera se pone **en la ruta**, no se lee del body, o
`create-booking` podria ser convencido de saltear la verificacion de pago.

### Los tres bugs que encontro la revision, no la ejecucion

Diego pidio revisarlo tres veces antes del PR. Los tres aparecieron ahi, y
**ninguno habria fallado un test existente**:

1. **`holdOnly` se leia antes de declararse.** Estaba junto a la compuerta de
   pago y el chequeo de cobertura lo usa ~130 lineas antes. Un `const` leido
   antes de su declaracion **tira en ejecucion**, y `node --check` no lo ve:
   valida sintaxis, no referencias. Habria roto **todas** las reservas.

2. **Una direccion que el geocodificador no resuelve quedaba bloqueada.** La
   regla "sin pago no hay reserva" es correcta para una reserva real, pero una
   retencion **nunca** lleva pago - asi que sin exceptuarla, esas reservas se
   perdian. Son las que Diego igual puede atender: el `console.warn` de esa rama
   existe justamente para que las confirme a mano.

3. **El peor: una retencion quemaba el codigo de descuento y los creditos por
   recomendacion del cliente.** Los dos bloques estan **despues** del insert, asi
   que la retencion llegaba y los gastaba. Un checkout abandonado le costaba al
   cliente su codigo de un solo uso y sus creditos, sin haber comprado nada y sin
   forma de notarlo. Ahora los dos van con `&& !holdOnly`, y el cliente **ni
   siquiera manda** el codigo al retener - dos capas, para que quitar el guard
   no alcance para reintroducirlo.

Los tres tienen test, y el del descuento se verifico **reintroduciendo el bug a
proposito**: con el bug, falla; sin el, pasa.

### Dos tests viejos que fijaban texto literal

`coverage-resolution` y `referral-credits` afirmaban las lineas exactas que
cambie. Los cambios eran correctos y los tests fragiles: ahora matchean los
**operandos** que les importan, con el termino nuevo opcional. **No se aflojo lo
que protegen** - la invariante "un pago que existe siempre se verifica" quedo
mas fuerte que antes, porque una retencion que trae un pago ahora se **rechaza**
en vez de resolverse de algun modo razonable.

47 tests nuevos. 1051/1051, corrido 3 veces.

### Lo que NO se verifico

**No se hizo una reserva real de punta a punta.** No se abrio el navegador
(prohibido en esta sesion) ni se disparo un cobro contra Stripe. Lo verificado
son las decisiones y el orden. **Falta que Diego haga una reserva de prueba**
despues del deploy - y en particular que compruebe que al elegir un horario y
llegar al pago, ese horario ya no aparece disponible en otra pestana.

## 69. El catalogo de servicios salia en ingles, y ningun check podia verlo (31-ago-2026)

Diego lo vio como cliente: el paso 1 de la reserva, en espanol, con las tarjetas
en ingles. "Chain Install / Fit and size a new chain."

### La causa raiz: es copia de cara al cliente que vive en una base de datos

`js/app.js` `renderStep1()` llama a `createServiceCard(s)` (`js/components.js`),
que imprime `s.name` y `s.description` **tal cual los devuelve la tabla
`services` de Supabase**. `js/i18n.js` traduce despues, caminando los nodos de
texto y cambiando los que coinciden **exacto** con una clave del diccionario.

O sea: el texto del catalogo es copia de interfaz, pero es un **dato**. Y
`scripts/i18n-check.mjs` lee las **superficies** - el HTML y los templates de
`innerHTML` en `js/`. La tabla no la lee nadie. Esa es toda la causa: el check
que existe justamente para que nada llegue a main sin traducir **no puede ver**
un tercio de la copia que el cliente lee en la primera pantalla de la reserva.

Medido contra la tabla en vivo el 31-ago-2026, 33 servicios:

- **32 de 33 descripciones** sin entrada en `es` ni en `zh`.
- **11 de 33 nombres** tampoco. Eso no estaba en el pedido: el pedido hablaba de
  descripciones. Pero el nombre y la descripcion son la misma tarjeta, y arreglar
  la mitad de abajo dejaba "Chain Install" en ingles arriba.
- La unica que si estaba traducida (`E-bike Diagnostic`) lo estaba **por
  casualidad**: alguien la habia agregado por la tarjeta estatica de marketing,
  que tiene el mismo texto.

`npm run check` estuvo verde todo el tiempo. Nunca hubo nada que lo pusiera rojo.

### Por que al diccionario y no a columnas nuevas

Se evaluo `description_es` / `description_zh` en Supabase. Se descarto:

1. **Los nombres ya viven en el diccionario y no se pueden mover.** `sourceOf()`
   (el indice inverso de `js/i18n.js`) es lo que usa `js/live-prices.js` para
   volver del texto renderizado al nombre ingles y enganchar la tarjeta con su
   fila de precio. Con las descripciones en Postgres, el titulo de la tarjeta se
   traduciria desde un lado y el cuerpo desde el otro.
2. **El mecanismo ya funcionaba.** No habia nada que construir, solo que llenar.
3. **Cero migracion.** Nada que correr a mano, nada que se rompa si no se corre -
   que en este repo es el modo de falla de siempre (ver 24.x, "merged code is not
   a migrated DB").
4. **Diego no escribe chino.** Con columnas, cada servicio nuevo lo obliga a
   llenar `description_zh` a mano o dejarla en NULL.

El costo de la decision, dicho sin maquillar: **si Diego reescribe una
descripcion desde Admin > Services & Prices, la clave deja de coincidir y esa
tarjeta vuelve a ingles en silencio.** No rompe nada - el fallback del i18n es
siempre el ingles - pero nadie se entera.

### El backstop, porque un fallback silencioso no alcanza

`npm run services:check` (`scripts/services-sync-check.mjs`) ya existia para
exactamente esta clase de problema: lee la tabla en vivo y nombra las tarjetas
que quedaron desenganchadas despues de editar servicios en Admin. Ahora tambien
lee `description` y lista **toda fila cuyo nombre o descripcion no tiene entrada
en `es` y `zh`**, con el texto exacto que hay que agregar.

No va en `npm run check` a proposito: necesita red, y esa decision ya estaba
tomada en ese archivo - el CI no puede depender de una tabla viva.

La logica de lectura del diccionario salio a `scripts/lib/dict-keys.mjs` para que
el test la pueda usar sin importar `js/i18n.js` (que toca `localStorage`,
`navigator` y `document.dispatchEvent`). Ese modulo trae adentro el guard del
bug 66: cada corte de idioma **termina en el idioma siguiente**, no al final del
archivo, asi que una cadena traducida solo al chino no puede volver a pasar por
espanola.

### Los dos bugs que encontro el test, mas viejos que este cambio

Escribiendo el test del indice inverso aparecieron **dos colisiones vivas, solo
en chino**, anteriores a este cambio:

- el bullet `'Pad replacement'` de `js/app.js` y la tarjeta
  `'Brake Pad Replacement'` decian los dos **刹车片更换**;
- `'Bottom bracket service'` y `'Bottom Bracket Service'`, los dos **五通保养**.

`sourceOf()` se queda con la **primera** definicion, y en los dos casos la
primera es el bullet, que no es un servicio. Consecuencia en produccion: para un
visitante en chino esas dos tarjetas **no enganchaban con la tabla** y se
quedaban con el precio escrito a mano en el HTML para siempre; editar el precio
en Admin no llegaba nunca. Con un `console.warn` que nadie lee.

En espanol las cuatro cadenas tenian texto distinto, asi que el bug era invisible
leyendo el archivo - solo se ve corriendo el reverso en los dos idiomas.
Arreglado reescribiendo los dos bullets (`更换刹车皮`, `五通中轴保养`): son texto
de solo lectura, nunca se leen de vuelta del DOM. El test ahora recorre **la
union de los alias de marketing y los nombres del catalogo, en es y zh**, y exige
que cada uno vuelva a caer en una fila real.

### El boton del hero

`What does a visit cost?` paso a **`Check my diagnosis fee`**.

El servicio se llama **"Visit & Diagnosis"** en la factura, el email, el panel y
el boton de pago (`Confirm & Pay $X Visit & Diagnosis`). El boton no usaba
ninguna de esas palabras. Diego propuso "Diagnostic price"; se descarto por dos
razones: *diagnostic* seria una cuarta palabra para lo mismo cuando el resto de
la app dice *diagnosis*, y es una etiqueta, no un boton - el control abre
"What's your suburb?" y calcula.

- ES: `Calculá el precio de tu diagnóstico` (las palabras de Diego, con el voseo
  que ya usa el sitio).
- ZH: `查询上门检查费`. **No** se uso 诊断: el diccionario chino ya dice 上门检查费
  en las ~20 cadenas de "visit & diagnosis fee", y cambiar solo el boton hubiera
  creado el mismo problema de dos nombres. 上门 ademas ya dice "vamos a tu casa",
  que es lo que el ingles pierde.

La clave vieja se borro de los dos diccionarios: una clave huerfana es peso
muerto que el proximo lector tiene que descartar.

### Cache

`sw.js` `CACHE_STATIC` a `v102`. `js/i18n.js` se importa **sin `?v=`** (se quito
el 28-jul-2026 a proposito, ver 3.2-cache), asi que este bump es lo unico que
renueva el diccionario en un visitante que ya entro. Los `?v=` de `js/app.js` y
`js/landing-inline.js` en `index.html` y `landing.html` tambien subieron:
`scripts/versioned-assets-check.mjs` los exige y da el hash exacto.

### Lo que NO se verifico

**No se abrio el navegador** (prohibido en esta sesion). Nadie vio las tarjetas
renderizadas ni el boton nuevo en el hero.

Lo que **falta que mire Diego**, concretamente:

1. **El boton en espanol es largo** - `Calculá el precio de tu diagnóstico`, 35
   caracteres contra 22 del ingles. Si envuelve feo en el hero, el reemplazo
   corto es `Precio de tu diagnóstico`.
2. **Las 33 descripciones en la pantalla real**, en es y en zh. El test prueba
   que el diccionario devuelve la traduccion, no que entre en la tarjeta.
3. Las dos cadenas chinas reescritas (`更换刹车皮`, `五通中轴保养`) aparecen en las
   listas de "que incluye" de `js/app.js`.

## 70. La landing no tenia un solo boton funcionando para quien no aceptaba cookies (31-ago-2026)

Diego lo reporto asi: "no puedo apretar los botones en la landing, mecanicos no
aparece nada". Services, View Services, My Account, Book a Service: nada. La
pagina se veia perfecta.

### Una linea

`js/landing-inline.js` linea 9:

```js
Sentry.onLoad(function() { Sentry.init({ ... }); });
```

El loader de Sentry esta detras del consentimiento
(`<script type="text/plain" data-consent="analytics" src="js-de.sentry-cdn.com/...">`),
asi que sin aceptar cookies **`Sentry` no existe**. `ReferenceError`. Y ese
archivo es **quince bloques `<script>` concatenados compartiendo UN solo scope
de nivel superior** - su propio encabezado lo dice: "that order is load-bearing".
Un throw en la linea 9 mata las ~1500 lineas de abajo, donde viven TODOS los
`addEventListener` de la landing:

- `hero-book-btn` (Reservar Servicio), `hero-services-btn`, `nav-services-btn`
- todo el panel `acct-*` de Mi Cuenta
- `loadMechanics()` - por eso la seccion de mecanicos se veia vacia; el endpoint
  respondia 200 con el mecanico, nadie lo pedia

### La causa raiz no es la linea, es de donde salio

`d5bb2f8` ("perf(landing): extract inline scripts, cut landing.html to 111KB")
saco los quince bloques inline de `landing.html` a `js/landing-inline.js`. Dos
de esos bloques eran **bootstraps de vendors que `scripts/consent-gate.mjs`
tenia gateados**.

Ese script gatea leyendo **etiquetas del HTML**. Fuera del HTML, dejo de verlos.
Y quedo el desajuste exacto que rompe: **el gate se cayo del que LLAMA y siguio
puesto en el que CARGA.**

- **Sentry**: el loader nunca corre, el init si -> ReferenceError -> landing
  muerta para todo el que rechace cookies, use Firefox con Enhanced Tracking
  Protection (el default), Brave, o cualquier bloqueador.
- **Google Analytics**: `gtag()` se define solo, asi que no tiro nada. Solo
  empezo a configurar GA en cada visita **sin permiso** - que es exactamente lo
  que ese script existe para impedir. Es lo que se veia en la consola de Diego
  como `Cookie "_ga_GXYD68JXZW" has been rejected`.

El mismo desajuste estaba en `js/admin.js` y `js/mechanic.js`, que arrancan con
el mismo bootstrap de gtag suelto. Lo encontro el check nuevo, no una lectura.

`index.html` nunca estuvo afectado: ahi los dos bloques siguen inline y gateados.

### El arreglo, y por que NO es un guard

Lo tentador es `if (typeof Sentry !== 'undefined')`. **Esta mal**: corta el
crash y deja Sentry muerto para siempre, porque ese archivo corre una sola vez,
antes de que exista el consentimiento. El bloque tiene que volver al HTML, en un
`<script type="text/plain" data-consent="analytics">` que `js/consent.js` pueda
revivir cuando el visitante acepte - que es como `index.html` lo tiene desde el
principio. Ahora las cuatro superficies lo hacen igual.

### El backstop

`scripts/consent-gate.mjs --check` solo miraba etiquetas, y por eso estuvo verde
todo el tiempo que la landing estuvo rota. Ahora tambien lee **los .js que cada
pagina carga incondicionalmente** y falla si alguno toca un global de un vendor
gateado. Los patrones salieron a `scripts/lib/consent-vendors.mjs` para poder
testearlos.

Solo estan los dos que mordieron. PostHog no esta: su snippet instala un stub
propio y ya pasa por `window.drbikeOnConsent()` - hecho bien desde el principio,
en el mismo archivo, tres bloques mas abajo del que rompia.

**`npm run check` ahora corre `consent:check`.** Antes estaba suelto en su propio
npm script y el CI no lo llamaba, asi que nadie lo corria.

Verificado **reintroduciendo el bug a proposito**: con el, `consent:check` sale 1
y dos tests se ponen rojos; sin el, verde. 14 tests nuevos, 1084 en total.

### Lo que NO se verifico

**No se abrio el navegador** (prohibido en esta sesion). Lo que falta que haga
Diego, y es lo unico que cierra esto:

1. **Rechazar las cookies** en la landing y probar Reservar Servicio, View
   Services, Mi Cuenta y que aparezcan los mecanicos. Ese es el caso que estaba
   roto.
2. **Aceptarlas** y confirmar que Sentry y GA vuelven a registrar - el arreglo
   los devuelve al gate, y nadie comprobo que revivan al aceptar.
3. Que admin y mechanic sigan andando: se les movio el bootstrap de gtag y se
   les bumpeo el `?v=`.

## 71. Aceptar las cookies dejaba Sentry sin inicializar (31-ago-2026)

Consecuencia directa del arreglo de 70, encontrada por Diego el mismo dia:

```
Uncaught ReferenceError: Sentry is not defined
    at <anonymous>:2:5
    at enableAnalytics (consent.js:96:22)
```

Ya no rompia los botones - el bloque vive en la pagina, aislado, y un throw ahi
no mata js/landing-inline.js. Pero **el monitoreo de errores estaba muerto para
todo el que aceptaba las cookies**, que es justo el unico caso en que deberia
funcionar.

### Un default del navegador, no una linea que falte

`enableAnalytics()` revive los `<script type="text/plain">` clonandolos. El
comentario del bucle decia: *"Order is preserved by inserting each clone where
the placeholder sat"*.

Preservaba la **posicion**. No la **ejecucion**.

Un `<script>` creado con `document.createElement()` es **async por defecto** -
no hace falta el atributo, y copiar los atributos del original no lo cambia.
Asi que el loader de Sentry (clonado primero, con `src`) seguia bajando cuando
el bloque de init (clonado despues, inline) ya se estaba ejecutando. `Sentry`
no existia todavia.

Es un bug del bucle, no de Sentry: le pasaria a cualquier vendor cuyo init
dependa de su loader.

### El arreglo

```js
if (s.src && !old.hasAttribute('async')) s.async = false;
```

`async = false` en un script insertado por JS es lo que fuerza el orden de
ejecucion por orden de insercion. La condicion importa: el loader de Google
Analytics lleva `async` a proposito y no necesita orden - `gtag()` lo define el
bloque inline, no el loader - y bloquearlo seria una regresion de velocidad a
cambio de nada.

### El test corre el bucle de verdad

`tests/unit/consent-script-order.test.js` extrae el cuerpo de
`enableAnalytics()` **del archivo que se despacha** y lo ejecuta contra un DOM
falso minimo. La invariante es de comportamiento - que el nodo insertado tenga
`async === false` -, no el texto de la linea que lo pone, asi que testear una
copia no habria servido.

Verificado quitando la linea: falla; con ella, pasa. 6 tests nuevos, 1090 en
total.

### De paso, los otros dos avisos de la consola

- `manifest.json`: `share_target` no declaraba `enctype`. Chrome avisaba en cada
  carga. Ahora dice `application/x-www-form-urlencoded`, que es lo que ya usaba
  por defecto.
- `<meta name="apple-mobile-web-app-capable">` esta deprecado. `mechanic.html`
  ya llevaba los dos; `admin.html`, `index.html` y `landing.html` ahora tambien.
  No se quita el viejo: iOS todavia lo lee.

`[live-prices] no Supabase match for "Custom Quote"` **no es un bug**: esa
tarjeta nombra una categoria, no un servicio con precio. El aviso es deliberado
y esta documentado en js/live-prices.js.

### Lo que NO se verifico

**No se abrio el navegador.** Falta que Diego **acepte** las cookies en la
landing y confirme que ya no aparece `Sentry is not defined` en la consola.
Que Sentry efectivamente reporte a su panel no lo comprueba ningun test de acá.

## 72. La pantalla de login del admin era ilegible en modo oscuro (31-ago-2026)

Diego mando una captura de la pantalla de 2FA: el titulo "Dr. Bike Admin", el
subtitulo y **los seis digitos que estaba tipeando** en gris clarisimo, casi
invisibles sobre blanco.

### Dos mitades del mismo error, en el mismo bloque

La tarjeta:

```html
<div style="background:#fff; ...">
  <div style="color:var(--navy)">Dr. Bike Admin</div>
```

`background:#fff` escrito a mano - ningun tema lo puede repintar. Y su texto es
`var(--navy)`, que en oscuro vale `#eef2f7`: tinta clara, hecha para fondos
oscuros. **Casi blanco sobre blanco: 1.12:1.** El subtitulo, 2.21:1.

El fondo tenia el bug espejo: `background:var(--navy)`. En claro `--navy` es
`#0d1f3c` y se ve como el telon oscuro que se queria; en oscuro es `#eef2f7` y
la pantalla entera se volvia casi blanca. **Tinta usada como fondo.**

Medido, no mirado: 1.12:1 el titulo, 1.12:1 los digitos, 2.21:1 el subtitulo.

### Por que ningun check lo vio

`scripts/dark-theme-check.mjs` rechaza literales de color en `js/admin.js`
justamente para esto. No lo agarro por dos razones distintas:

1. **Su patron solo matcheaba hex de SEIS digitos.** `#fff`, de tres, nunca
   fue mirado. El `#fff` que estaba en `LITERAL_ALLOWED` era ademas correcto
   *como tinta* - blanco sobre un boton azul se lee igual en los dos temas -
   pero no distinguia la propiedad, asi que tampoco habria servido.
2. **`--navy` es un token**, y usar un token como fondo no dispara nada.

Ahora el patron captura la **propiedad** ademas del literal: blanco sigue
permitido en `color:`, prohibido en `background:`. Y matchea tres digitos.

Al cerrarlo aparecieron dos literales legitimos en `js/mechanic.js` - el canvas
de firma, que **tiene que** ser blanco en los dos temas porque la imagen va a
la factura. La razon ya estaba escrita ahi; lo que faltaba era el cerco
`dark-theme-check: off/on` que la hace legible para la maquina.

### El token correcto existia, y un test viejo me corrigio

El primer arreglo puso `#admin-login-overlay { background: var(--navy) }` en
`css/admin.css` con un override para oscuro. **`tests/unit/dark-theme.test.js`
lo rechazo**: ya hay una regla que prohibe pintar cualquier fondo con `--navy`.

Tenia razon. El token es **`--navy-surface`**: el mismo navy, declarado como
fondo oscuro y **deliberadamente no invertido** en el bloque oscuro. Un solo
valor, los dos temas, sin override ni regla nueva.

En oscuro la tarjeta (`--white`, `#1a2942`) queda a 1.13:1 de ese fondo, apenas
debajo del paso de 1.15 del proyecto. Lo que la separa es el **borde** que se le
agrego: `--border` compuesto da **2.28:1** contra el fondo. Sin ese borde el
arreglo dejaba el texto legible sobre una tarjeta sin bordes - el error de 12.15
otra vez, en su version suave.

### De paso, `.inp`

La clase de todos los inputs del admin tenia `background: #fff` y
`border: 1.5px solid #e2e8f0` a mano. Sobrevivia porque hay un override
`[data-theme='dark'] .inp`, pero ese override existe para pelear contra estos
literales, y cualquier input nuevo que no lo herede nace roto. Ahora son
`var(--white)` y `var(--border)`.

Tambien le falta `min-width: 0`: un `<input>` arrastra un ancho minimo implicito
de su atributo `size`, asi que dos en la misma fila flex se negaban a encoger y
metian una **barra de scroll horizontal** en el modal "New booking (phone-in)".
Es lo que se ve en la captura de Diego.

El presupuesto de `scripts/color-check.mjs` para `css/admin.css` bajo de 114 a
113. Solo baja, nunca sube.

### Lo que NO se verifico

**No se abrio el navegador.** Los contrastes estan calculados, no vistos. Falta
que Diego mire, en modo oscuro:

1. La pantalla de login y la de 2FA - que se lean el titulo, el subtitulo y los
   digitos mientras los tipea.
2. Que la tarjeta se distinga del fondo (el borde tiene que verse).
3. El modal "New booking (phone-in)": que ya no tenga barra de scroll
   horizontal. El `min-width:0` deberia alcanzar, pero eso se ve mirando.

## 73. El arreglo de 71 no servia, y el test lo tapo (31-ago-2026)

Diego volvio a mandar el mismo error despues de que 71 estuviera desplegado:

```
Uncaught ReferenceError: Sentry is not defined
    enableAnalytics https://drbikesydney.com.au/js/consent.js:112
```

Las lineas eran 96 y 120 antes del arreglo y 112 y 136 despues: **el codigo nuevo
estaba en produccion y el error seguia igual.**

### Lo que 71 asumio, y esta mal

71 puso `s.async = false` en los clones con `src` y lo llamo arreglado. La regla
real es mas chica de lo que asumi:

> `async = false` ordena la ejecucion **de los scripts con `src` entre si**.

Un script **inline** no participa de ese orden: se ejecuta **en el instante en
que se lo inserta en el DOM**, sin esperar a ningun `src` pendiente. Sentry venia
en dos tags gateados - el loader (`src`) y el init (inline) - asi que el init
siguio ganando la carrera exactamente igual que antes.

### Por que el test no lo agarro: media la creencia, no el comportamiento

`tests/unit/consent-script-order.test.js` corria el bucle real contra un DOM
falso y afirmaba:

```js
expect(loader.async).toBe(false);
```

El flag efectivamente quedaba en `false`. El test pasaba, el PR decia
"verificado quitando la linea: rojo", y **produccion seguia rota**. Verifique la
propiedad que yo creia relevante en vez de la unica que importa: cual de los dos
scripts corre primero. Un DOM falso no puede reproducir esa carrera, asi que el
test nunca la vio.

Es el mismo error que la memoria del proyecto ya nombra para el modo oscuro
("el contraste se calcula, no se mira"): medir el proxy en vez del efecto.

### El arreglo real

Un solo bloque gateado por pagina, que **carga el SDK el mismo** y inicializa
dentro de su `onload`:

```js
var s = document.createElement('script');
s.src = 'https://js-de.sentry-cdn.com/....min.js';
s.onload = function () { Sentry.onLoad(function () { Sentry.init({...}); }); };
document.head.appendChild(s);
```

`onload` es lo unico que significa "el SDK ya corrio". El orden deja de depender
de como `js/consent.js` reviva los tags. El tag `<script src>` suelto se elimino
de `landing.html` y de `index.html`: era el que creaba la carrera.

`consent-gate.mjs` lo sigue viendo gateado por su matcher de `body`
(`/Sentry\.onLoad\s*\(/`), no por el de `src`.

`s.async = false` se queda en `js/consent.js`: es correcto para lo que si hace -
ordenar los clones con `src` entre si - y su comentario ahora dice explicitamente
lo que **no** hace, para que nadie vuelva a apoyarse en eso.

### El test nuevo verifica estructura, y lo dice

La carrera no se puede reproducir sin un navegador, asi que el test no finge que
si. Verifica lo unico que la hace imposible: que no exista un tag loader suelto,
y que **toda** aparicion de `Sentry.` en el bloque este despues de la asignacion
de `onload`. Mas un test que impide que el comentario falso vuelva.

### Lo que NO se verifico

**No se abrio el navegador.** Diego tiene que **aceptar las cookies** en la
landing y confirmar que `Sentry is not defined` ya no aparece. Esta vez el error
tambien serviria de prueba al reves: si aparece, el arreglo volvio a estar mal.

Y una advertencia para el proximo: **Diego tiene AdBlock Plus.** Es probable que
`js-de.sentry-cdn.com` le quede bloqueado igual. Eso ya no rompe nada - el
`onload` simplemente no dispara y no se inicializa nada - pero significa que
"no veo el error" no prueba que Sentry este reportando. Eso se confirma en el
panel de Sentry, no en la consola.

## 74. Las resenas de Google, en la landing (31-ago-2026)

La seccion de testimonios llevaba desde siempre mostrando "Be the first to leave
a review", mientras el negocio tenia **5,0 estrellas con 2 resenas en Google**.
Diego lo noto cuando una clienta le dejo 5 estrellas con foto y no aparecio en
ningun lado.

### No era un bug: son dos sistemas que no se hablan

`landing.html` lee la vista `public_reviews`, que sale de
`bookings.client_rating` / `client_review` - resenas que el cliente deja **dentro
de la app**, con el link que le llega por email y SMS al completar el trabajo.
Google es otro mundo y **no habia ninguna integracion** (grep sobre todo el repo:
cero).

La contradiccion estaba a la vista: el boton "Leave us a review" de esa misma
seccion manda a Google, o sea que la landing empujaba a la gente hacia el unico
lugar cuyas resenas no podia mostrar.

### Por que a mano y no por la API de Places

Se evaluo Google Places API y se descarto por ahora:

- devuelve **maximo 5 resenas** y **Google elige cuales** - limite duro;
- **no trae las fotos** que suben los clientes;
- necesita cuenta de Google Cloud con tarjeta.

Con 2 resenas, montar eso es sobre-ingenieria. A mano es gratis, sin limite, y
se eligen cuales. Cuando haya ~30, la API pasa a convenir y esto se reemplaza.

### La regla que hace que esto no sea el bug viejo

Esta seccion **ya existio con resenas inventadas** etiquetadas "Google Review",
y se borraron por riesgo real con la ACCC (ver el encabezado de
`scripts/create-public-reviews-view.sql`). Lo que hace legitima esta version:

- el texto va **textual y en el ingles en que fue escrito** - una cita traducida
  deja de ser una cita, y el link al lado va al original;
- el nombre es el que el autor publico;
- hay link al perfil real, asi que **cualquiera puede verificar cada tarjeta**.

Las citas y los nombres estan en `ALLOWED` de `scripts/i18n-check.mjs`: no se
traducen a proposito, y esa lista es el registro revisable de lo que la pagina
afirma que alguien dijo. El resto - "2 reviews on Google", el mes - si se
traduce como cualquier otra copia.

### El empty state se fue

"Be the first to leave a review" debajo de dos resenas visibles contradecia lo
que el visitante tiene delante. `js/landing-inline.js` ahora simplemente deja
`#reviews-grid` vacio cuando todavia no hay resenas en la app.

### Los tests, y uno viejo que se reforzo

`tests/unit/google-reviews-section.test.js` fija lo que convertiria esto de
nuevo en el problema anterior: que **el numero del badge coincida con las
tarjetas** (decir "2 reviews" sobre tres tarjetas es la pagina mintiendo sobre
su propio contenido), que cada cita este declarada textual en `ALLOWED`, y que
el link al perfil siga ahi.

`google-review-link.test.js` afirmaba `found.length === 3`. Ese conteo se rompio
al usar el link una cuarta vez de forma legitima, y ademas nunca verifico lo que
importa: tres copias podian estar todas en un archivo y dos superficies quedarse
sin ninguna. Ahora exige **presencia por superficie** e **identidad global**, que
es lo que "one place to change" queria decir.

### Lo que NO se verifico, y lo que quedo abierto

**No se abrio el navegador.** Falta que Diego mire la seccion renderizada, en
claro y en oscuro, y en los 3 idiomas.

**Y hay un duplicado en Google Business Profile, confirmado y sin resolver:**

```
LA BUENA (5,0 con 2 resenas)  1s0x6762fdefebf19285:0x52872725f8bdca88  /g/11nq1s1k4b
LA DUPLICADA (vacia)          1s0x24ff468d2df1986f:0x5a31db3433dbe8b0  /g/11zfsvwcxn
coordenadas de las dos:       -33.8482439, 150.9319747   IDENTICAS
```

Identificadores distintos, misma ubicacion exacta: son dos fichas. Reparte las
resenas y la autoridad de busqueda entre las dos. **Falta saber cual gestiona
Diego** (boton "Leer resenas" de su panel) antes de reportar o reclamar nada -
reportar la equivocada le costaria las 2 resenas.

Aparte: su categoria en Google dice "Taller mecanico" (Mechanic), que en
Australia se lee como taller de **autos**. Deberia ser "Bicycle repair shop".

## 70. El punto 10 apuntaba al lugar equivocado (01-sep-2026)

La auditoria decia: *"js/app.js pesa 295 KB... el cliente se baja el asistente
entero, el mapa, Stripe y el chat antes de ver un precio"*.

**Medido contra produccion antes de tocar nada, tres de esas cuatro cosas eran
falsas:**

| Afirmacion | Realidad |
|---|---|
| app.js = 295 KB | **78 KB en la red** - Vercel comprime |
| "se baja Stripe" | Se carga en el pago (`js/stripe.js:25`) |
| "se baja el mapa" | Se carga al abrir el seguimiento |

Alguien miro el tamano del archivo en disco, no lo que viaja. Vale como
recordatorio: **el peso de una pagina se mide con la red, no con `ls`.**

### Lo que la auditoria no vio

`js/i18n.js` viajaba en **64 KB** - casi tanto como toda la app - y llevaba
**los tres idiomas a todos los visitantes**:

- espanol: 1157 claves
- chino: 1157 claves
- ingles: **ninguna** (es el idioma fuente; las claves SON el ingles)

Un cliente leyendo la app en ingles se bajaba **164 KB de espanol y chino que
no iba a usar nunca**. Y `translateValue()` ni consulta el diccionario cuando el
idioma es ingles: devuelve el texto tal cual. O sea que para la mayoria de los
visitantes de Sidney ese archivo se descargaba **para no usarse jamas**.

### El resultado

```
ANTES                        64.2 KB  a todos
AHORA  visitante en ingles    3.3 KB  (ahorra 60.9 KB)
       visitante en espanol  35.8 KB  (ahorra 28.3 KB)
       visitante en chino    34.3 KB  (ahorra 29.9 KB)
```

Para el cliente tipico - en la calle, con datos moviles - eso es **casi la mitad
de todo el JavaScript de la app**, y es mas de lo que se puede sacar de
`js/app.js` sin meter un empaquetador que este proyecto no tiene.

### El requisito que mandaba sobre el ahorro

Diego, al pedirlo: *"debemos asegurarnos de que la gente, cuando entre a la
aplicacion, lo vea en su lenguaje - que espanol, todo en espanol; que ingles,
todo en ingles; que chino, todo en chino"*. El ahorro era secundario.

Por eso el diccionario se **espera** antes de la primera pantalla, en las tres
superficies del cliente (`js/app.js` antes de `router.init()`,
`js/landing-modules.js` y `track.html`). Sin eso un cliente en espanol veria la
primera vista en ingles y la veria cambiar un instante despues - **peor que
tardar 40ms mas**, porque el parpadeo se nota y la demora no.

Y `setLang()` cambia el idioma **recien cuando el diccionario esta en la mano**.
Si `currentLang` se moviera primero, entre ese momento y la llegada del archivo
cada `translateValue()` devolveria ingles - y el evento `langchange`, que es lo
que repinta, caeria justo en esa ventana.

### Verificado clave por clave, no por conteo

Se comparo cada diccionario nuevo contra el original de `origin/main`:
**1157 claves y 1157 valores identicos** en los dos idiomas. Un conteo igual no
prueba nada - dos diccionarios pueden tener 1157 claves cada uno y no ser el
mismo.

Y los guards se verificaron **rompiendolos a proposito**: sacar el `await` de la
SPA hace fallar 2 tests; mover `currentLang` antes del `ensureLang` hace fallar
el que vigila el orden.

### Un bug de clase entera que desaparecio

Media docena de tests y dos scripts recortaban `js/i18n.js` entre `  es: {` y
`  zh: {`. Ese recorte era la causa de PENDIENTES 66: recortar hasta el final
del archivo hacia que el bloque `es` contuviera el `zh`, y **una cadena
traducida solo al chino satisfacia tambien la afirmacion del espanol**.

Con un archivo por idioma **no hay nada que recortar**. El aislamiento paso de
accidental a estructural. `tests/helpers/i18n-source.js` existe para que ningun
test vuelva a inventar el recorte.

### Lo que NO se verifico

**No se abrio el navegador** (prohibido en esta sesion). Que las tres pantallas
se vean en el idioma correcto lo tiene que mirar Diego: entrar en ingles, en
espanol y en chino, y cambiar de idioma con el selector estando en la reserva.
Lo verificado por codigo es que el diccionario esta cargado antes de pintar y
que no falta ni una traduccion.

**El `?v=` sigue prohibido** para los tres archivos, y hay un test que lo vigila.
`sw.js` subio a v108/v75, que es lo unico que entrega la version nueva a un
navegador que ya entro.

17 tests nuevos. 1127/1127.

## 71. El modo oscuro: los dos papeles, separados de verdad (01-sep-2026)

Punto 14. La auditoria decia que el check exige 3:1 cuando el minimo AA para
texto normal es 4.5:1, y que *"los acentos estan calibrados a 3:1 porque cumplen
doble funcion"*.

**Al medirlo, el diagnostico se quedaba corto.** Los seis acentos duales no
estaban calibrados a 3:1 para preservar un papel: **fallaban en los dos a la
vez.**

```
            como texto   con blanco encima
--blue        3.30            3.68
--green       3.68            3.30
--red         3.22            3.76
--purple      3.09            3.92
--cyan        3.14            3.87
--blue-dark   3.38            3.59
```

Estaban en el medio, mal para las dos cosas. La mitad del problema -el texto
blanco de los botones a 3.30:1- **la auditoria ni la mencionaba**, y es la mas
visible.

### Por que no se arregla subiendo el numero

Un color no puede servir de texto sobre una tarjeta oscura Y de relleno con
blanco encima: para **leerse** tiene que ser claro, para **aguantar blanco**
tiene que ser oscuro. Direcciones opuestas, un solo valor.

La salida es dos tokens. `--blue` queda como **relleno**, nace `--blue-text`
para el **texto**.

### Lo que hace que esto sea de bajo riesgo

**En tema claro los dos valen lo mismo.** Sobre blanco no hay conflicto: el
mismo azul sirve de texto y de fondo de boton. Asi que `--blue-text` es
literalmente `var(--blue)` en `:root`, y **el tema claro no cambia** salvo
`--cyan`, que daba 3.68:1 con blanco encima y se oscurecio a 4.52.

Toda la division vive en el bloque de tema oscuro.

### La migracion: 285 usos, solo texto

Se migro **unicamente** `color:`. Un borde o un icono no es texto - WCAG pide
3:1 para elementos de interfaz y 4.5:1 para texto, y los rellenos ya cumplen lo
suyo.

El riesgo real era `background-color`, `border-color` y `caret-color`: **las
tres terminan en "color"**. Un reemplazo ingenuo habria repintado los fondos con
el color del texto. Se uso un lookbehind que las excluye, y hay un test que
verifica que **ningun fondo, borde o icono** quedo apuntando a un token de
texto. Da 0.

### El bug que me hice solo, y es el quinto de su clase

Al escribir el comentario que explica la division, **escribi el nombre del
selector del tema oscuro dentro de el**. Media docena de scripts cortan
`css/variables.css` buscando esa cadena, y todos empezaron a cortar en mi
comentario - dentro de `:root`.

Resultado: **los valores nuevos del tema oscuro se escribieron en el tema
claro.** El check seguia leyendo los viejos y reportando los mismos 7 fallos, lo
cual fue la unica pista.

Se arreglo por las dos puntas: el comentario ya no nombra el selector (y dice
por que), y los scripts cortan por la **regla** -selector seguido de su llave-
en vez de por la cadena suelta. Hay un test que falla si el nombre vuelve a
aparecer en un comentario antes de la regla.

**Quinta vez en este proyecto que un texto en prosa rompe una herramienta que
lee texto** (ver 58, 62, 64, 66). El patron ya es claro: cuando algo lee codigo
como texto, hay que acotar la ventana a codigo, y no escribir en los comentarios
las cadenas que esa herramienta busca.

### Verificado rompiendolo

- Devolver `--blue-text` a su valor viejo -> falla el test de AA en oscuro.
- Apuntar un `background` a un token de texto -> falla el test de la migracion.

Los valores no se eligieron a ojo: un script busco, para cada acento, **el color
mas cercano al original** que cumple 4.5:1 en su papel. Por eso los cambios son
minimos (`--red` de `#ef4444` a `#d73d3d`) y la app sigue viendose igual.

`dark-theme-check` ahora informa: **peor tinta 4.50:1, peor blanco sobre relleno
4.50:1**. Antes: 3.09 y 3.30.

31 tests nuevos. 1158/1158.

### Lo que NO se verifico

**No se abrio el navegador.** Que el modo oscuro se vea bien lo tiene que mirar
Diego, en admin y en la app del mecanico, que son las dos superficies que pueden
ser oscuras. Lo verificado por calculo es el contraste de cada token en cada
papel y en los dos temas.

## 72. El link de seguimiento no caducaba nunca (01-sep-2026)

Punto 5. La auditoria pedia decidir y aplicar **si caduca, cuando, y que largo
tiene**. La respuesta a la primera era: **no caduca**.

Un link mandado por email en agosto seguia devolviendo, en diciembre, la
**direccion exacta del cliente** y su **PIN de llegada** - con el trabajo
terminado hacia meses. El token es la credencial: quien lo tenga ve todo.

### El largo ya estaba bien

Es un UUID v4 (`gen_random_uuid()`): 122 bits. Adivinarlo no es una amenaza
realista y no habia nada que cambiar. **Lo que faltaba era el tiempo.**

### Por que no se apaga de golpe al terminar el trabajo

**El mismo link se usa para dejar la resena.** El email de review que sale al
completar lleva `/track.html?token=...`, y de ahi salen las resenas que muestra
la landing. Matarlo al completar romperia ese flujo.

Asi que caduca en dos escalones, y **cada dato se apaga cuando deja de tener
sentido**:

| Cuando | Que entrega |
|---|---|
| **full** - por venir, en curso, o termino hace <7 dias | Todo |
| **limited** - de 7 a 90 dias | Sigue vivo para la resena, **sin** direccion, PIN, notas ni posicion |
| **expired** - pasados 90 dias | 410 Gone |

Los cuatro campos que se quitan son exactamente los que dolerian si el link se
filtra, y ninguno significa nada para un trabajo terminado hace semanas.

### Decisiones chicas que importan

**Un trabajo sin terminar da todo, sin importar la fecha.** Una reserva
reprogramada varias veces puede tener una `scheduled_date` vieja y ser el
trabajo de manana.

**Sin fecha legible degrada a `limited`, no a `expired`.** Quitar los datos
sensibles es la respuesta segura; romper el link de alguien por una fila rara
seria peor que el riesgo que evita.

**Las claves se borran, no se mandan en `null`.** Un cliente que ve
`address: null` cree que se perdio su direccion; ausente dice "esto ya no se
informa".

**El corte va antes de buscar la posicion del mecanico.** Un link vencido no
tiene por que costar una consulta mas.

### Sin migracion

El ancla es `scheduled_date`, no `completed_at`: ya esta en la fila y en la
consulta que el endpoint hace, asi que esto no espera a ningun SQL - y aca el
codigo llega a main antes de que Diego corra el archivo.

### El cliente ya degradaba bien

`js/app.js:3171` ya mostraba el PIN solo con `booking.arrival_pin && preArrival`,
y `track.html:165` ya renderiza `bkg.address || '—'` y valida las coordenadas
antes de usarlas. **No hizo falta tocar el front**: los campos ausentes ya
estaban contemplados.

23 tests nuevos. 1181/1181.

## 73. "No se reembolsa", sin decir que la ley no se puede excluir (01-sep-2026)

Punto 8. Pedia dos cosas: que el aviso llegue **antes del boton de pago**, y que
**no choque con las garantias obligatorias de la ACL**.

**La primera ya estaba.** El bloque "What the visit & diagnosis covers" vive en
la pantalla de resumen, arriba del boton, y su comentario en el codigo ya
explicaba por que: *"a policy like that is only defensible if it was stated up
front"*.

**La segunda no.** El texto decia, sin calificar:

> *"The visit & diagnosis covers that inspection and is not refunded."*

Bajo la Australian Consumer Law las garantias del consumidor **no se pueden
excluir por contrato ni firmando**. Si la inspeccion no se hizo con el cuidado y
la pericia debidos, el cliente tiene derecho a un remedio diga lo que diga la
pantalla. Afirmar "no se reembolsa" a secas, justo antes de cobrar, es una
afirmacion enganosa sobre sus derechos - y "no refunds" es de los casos que la
ACCC persigue mas activamente.

### Lo que se hizo

Se agrego, **inmediatamente debajo** del aviso y en la misma pantalla:

> *"This does not affect your rights under the Australian Consumer Law, which
> cannot be excluded."*

**No se invento un texto legal nuevo.** `terms.html` ya usaba exactamente esa
formula para sus propias clausulas (*"except as required by Australian Consumer
Law"*) y ya reconocia en su seccion 9 que las garantias no se pueden excluir. Lo
que faltaba era ponerlo **donde el cliente lo lee**: en la pantalla del cobro, no
en los terminos que nadie abre antes de pagar.

### Por que como frase aparte

El aviso original es una cadena larga que ya estaba traducida a los dos idiomas.
Meterle el calificador adentro habria cambiado la clave y **invalidado las dos
traducciones existentes**. Como frase propia se agrega una clave nueva y las
viejas siguen sirviendo.

Esta en los tres idiomas, en el mismo commit. Un aviso legal que solo aparece en
ingles no le avisa al cliente que esta leyendo la app en espanol - y ese es
justo el que mas lo necesita.

11 tests nuevos, incluido que el calificador este **cerca** del aviso (a menos
de 400 caracteres) y no perdido en otra parte del archivo. Verificado
borrandolo: 3 tests fallan.

1192/1192.

### Lo que NO se hizo

**Esto no es asesoramiento legal.** El texto reusa la formula que el propio
proyecto ya tenia en sus terminos, que es lo conservador. Antes de lanzar
conviene que un abogado australiano mire las dos pantallas - la de cobro y
terms.html - de una sola vez.

## 74. Cabeceras y alertas: los dos que quedaban del blindaje (01-sep-2026)

### Punto 1 - la CSP tenia cuatro puertas abiertas a la nada

El veredicto era **FUERTE** y lo era: CSP completa, HSTS con preload,
`X-Frame-Options: DENY`, `nosniff`, `Permissions-Policy`. Faltaba endurecer.

Se quitaron **cuatro hosts permitidos que no usa nadie** - verificado por grep
sobre todos los `*.html` y `*.js`, cero apariciones fuera de la propia cabecera:

| Quitado | Por que sobraba |
|---|---|
| `api.mapbox.com` | El mapa usa Leaflet con tiles de OpenStreetMap |
| `*.mapbox.com` | Idem, en `img-src` |
| `www.gstatic.com` | Sin usar |
| `connect.facebook.net` | Es el SDK de Facebook; en el repo solo hay un `<a href>` a la pagina |

Cada host permitido es una via por la que un tercero comprometido podria
ejecutar codigo en el sitio. De 39 entradas a 33.

**Y el test cuida las dos direcciones**: falla si alguno de los cuatro vuelve, y
tambien **si se cae uno de los que si hacen falta**. Sacar de mas rompe la app en
silencio y solo se nota cuando un cliente no puede pagar.

### `'unsafe-inline'` se queda, y esta escrito por que

La auditoria permitia documentarlo si no se podia. No se puede, y el motivo no
es pereza:

- **Nonces**: hay que generarlos **por peticion** y escribirlos en el HTML
  servido. Este sitio es **HTML estatico en Vercel**: no hay render por peticion
  donde ponerlo. Habria que convertir las cinco paginas en funciones.
- **Hashes**: alcanzarian si todos los scripts inline se conocieran al
  construir. No es el caso: `js/consent.js` **crea elementos `<script>` en
  tiempo de ejecucion** cuando el visitante acepta las cookies - asi es como los
  analytics quedan bloqueados hasta que hay permiso (punto 7).

Sacarlo hoy **romperia el banner de cookies**. Cambiar una proteccion real y
funcionando por una teorica es mal negocio.

Como `vercel.json` es JSON y **no admite comentarios**, el razonamiento vive en
`docs/SECURITY-HEADERS.md`, con la receta para agregar un host nuevo. Hay un
test que verifica que ese documento exista y explique las dos alternativas
descartadas: la auditoria permitia documentar por que no se puede, no dejarlo
sin explicacion.

### Punto 20 - Sentry estaba cargado, pero casi nadie le hablaba

*"Sentry esta cargado. Alguien mira los errores?"*

Medido: **5 de 28 archivos de `api/` reportaban**. Los otros 23 podian fallar en
produccion **sin dejar rastro en ningun lado que alguien mire**.

Y los que faltaban eran justo los tres escenarios que la auditoria nombraba:

| Sin reportar | El escenario |
|---|---|
| `send-message.js` | *"Twilio rechaza los SMS y el mecanico no se entera de su trabajo"* |
| `send-cron.js` | Si esto se cae no corren los recordatorios, ni el backup, ni el reembolso automatico de pagos huerfanos |
| `create-subscription.js` | Cobros recurrentes |

Los **ocho** endpoints publicos que faltaban quedaron envueltos en `withSentry`.
Un test recorre `api/` y falla si aparece uno nuevo sin envolver - no hay lista
que mantener a mano.

### Un tropiezo que vale anotar

El script que agregaba el `import` lo puso **dentro de un import multilinea** en
dos archivos: la heuristica "despues del ultimo `\nimport `" encuentra la
PRIMERA linea de un import de varias y mete el nuevo en el medio de su lista de
nombres. `node --check` lo agarro al instante.

Y se verifico que las fallas de carga que quedan (`supabaseKey is required`,
`Missing API key`) **son previas**: se cargo la version original del archivo
desde git y da el mismo error. Son SDK que se construyen al importar y necesitan
variables de entorno que en local no estan.

34 tests nuevos, verificados rompiendolos: devolver un host muerto a la CSP hace
fallar uno; desenvolver un endpoint hace fallar dos.

1226/1226.

## 75. Imagenes que hacen saltar la pagina, y un embudo sin el "por que" (01-sep-2026)

### Punto 11 - 26 atributos que faltaban

De 16 `<img>` en las tres paginas del cliente, **13 no declaraban sus
dimensiones** y **14 no decian como cargar**.

Sin `width`/`height` el navegador no sabe cuanto espacio reservar hasta que la
imagen llega: dibuja la pagina, la imagen aterriza, y **todo lo de abajo salta**.
El cliente que iba a tocar un boton toca otra cosa. Google lo mide (Cumulative
Layout Shift) y lo usa para posicionar.

No hacen falta las dimensiones de pantalla - el CSS sigue mandando - sino la
**proporcion**, que es lo que el navegador usa para reservar el hueco. Por eso
se escribieron las **dimensiones reales de cada archivo, leidas de sus bytes**:
`logo-db.png` 600x423, `hero-van.webp` 1672x941, `mechanic-working.webp`
1122x1402. Hay un test que compara la proporcion contra esos numeros.

**`loading` no va igual en todas.** `lazy` en una imagen que se ve al abrir la
pagina la **retrasa**: el navegador la descubre mas tarde. El logo y el hero van
`eager`; lo de abajo de la linea de flotacion, `lazy`. Y `decoding="async"` en
todas, que deja seguir pintando mientras se decodifica.

El formato ya estaba bien: las dos imagenes grandes son webp. `logo-db.png` es
PNG a proposito - lleva transparencia y lo usan el manifest y los iconos.

### Punto 17 - el embudo ya decia donde, no por que

La auditoria decia *"no sabemos en que paso exacto se va la gente"*. **Medido:
los cinco pasos si se median** - `select_service`, `select_date`, `address`,
`quote_summary`, `payment`, mas `booking_completed`. La caida entre pasos era
visible desde antes.

Lo que faltaba era la razon de **la ultima caida**, que es la cara: alguien
llego al pago y no pago. ¿Tarjeta rechazada? ¿Le parecio caro? ¿El horario se lo
gano otro?

Dos agregados, y ni uno mas - un embudo con veinte eventos no se mira:

1. **El precio de la visita viaja con el resumen.** "¿Se va por el precio?" no
   se puede contestar sin el numero. Ahora se ve si una zona de $45 convierte
   peor que una de $25, y si conviene tocar el precio o el texto que lo explica.

2. **`payment_failed` con la categoria del fallo**: `card_declined`,
   `slot_taken`, `missing_email` u `other`, mas si el fallo fue **antes o
   despues del cobro** - si ya se habia cobrado, el problema es escribir la
   reserva y eso se arregla distinto.

**Se manda una categoria, nunca el mensaje crudo.** El error de Stripe puede
traer datos del banco o del cliente, y esto sale a un servicio de terceros. Hay
un test que verifica que el mensaje sin procesar no se mande.

15 tests nuevos, verificados rompiendolos. 1241/1241.

## 76. Las dos carreras del cobro, y tres bugs vivos que aparecieron mirandolas (01-sep-2026)

Punto 4 de la auditoria: *"El servidor recalcula la tarifa por zona y reembolsa
lo que no coincide. Falta probar carreras: la misma reserva diez veces en un
segundo, y cancelar en el instante en que el mecanico completa. Cerrado cuando
hay un test que dispara ambas y demuestra que no se duplica el cobro."*

### Carrera 1 - diez veces en un segundo: ya estaba cubierta

Cuatro capas, todas verificadas con `Promise.all` sobre las funciones reales, no
leyendo el codigo y suponiendo:

1. `slotVerdict()` reconoce la retencion propia, asi que diez toques del mismo
   boton ven **una** retencion, no diez.
2. Diez personas distintas sobre el mismo horario: una entra, nueve rebotan
   **antes** de que se les toque la tarjeta.
3. Un mismo PaymentIntent no puede respaldar dos reservas.
4. Y por debajo, un indice unico en la base que no depende de la app; si aun asi
   choca con un pago detras, se reembolsa.

### Carrera 2 - cancelar mientras el mecanico completa: faltaba una direccion

El lado del mecanico ya estaba bien (`completionVerdict()`: completar algo
cancelado se rechaza, completar dos veces no ejecuta nada la segunda vez).

**El lado del cliente no.** `handleClientCancel` leia el estado, comprobaba que
fuera `pending`/`confirmed`, y despues escribia **sin volver a comprobarlo** - un
check-then-act de manual. Entre la lectura y el `PATCH`, el mecanico podia
terminar el trabajo: el `PATCH` pisaba `completed` con `cancelled` y a
continuacion **se reembolsaba un trabajo que se hizo de verdad**.

El arreglo deja que decida la base:

- El filtro de estado va **tambien en la escritura** (`&status=in.(pending,confirmed)`).
- `Prefer: return=representation` en vez de `minimal`, porque `minimal` devuelve
  204 tanto si cambio una fila como si no cambio ninguna, y esa diferencia es
  justo la que decide si se reembolsa.
- Cero filas devueltas -> `409 CANCEL_RACE_LOST`, y **no se toca la plata**.

### Tres bugs vivos que aparecieron mirando eso

**1. El credito de referido no se devolvia nunca al cancelar.**
`notifyAdminCancellation(bk)` usaba `SERVICE_KEY` y `booking_id`, que estan
declarados dentro de `handleClientCancel` y no ahi. En ejecucion eso es un
`ReferenceError`, y cae dentro de un `try/catch` que solo logea - asi que el
bloque entero no corria nunca en silencio. El comentario de esa misma funcion
dice: *"el cliente gasta $15 que se gano, cancela esa misma tarde, y la plata
simplemente desaparece sin que ninguna pantalla lo admita"*. Eso es exactamente
lo que estaba pasando.

**2. El mail de pago fallido decia "This is attempt 1" siempre.**
`api/send-email.js` leia `attemptCount` y `monthsAgo` con `typeof x !==
'undefined'`, pero **nunca los sacaba de `req.body`**. El `typeof` evitaba el
error, asi que nadie se entero: el tercer intento de cobro se anunciaba como el
primero, y el mail de reactivacion nunca decia cuantos meses pasaron. Los dos
valores si se enviaban (`stripe-webhook.js:615`, `send-cron.js:169`,
`send-reminders.js:172`).

**3. "Enviar SMS de prueba" del admin estaba roto en Firefox.**
`sendTestSMS()` usaba el global implicito `event`. Chrome tiene `window.event`
durante el despacho; Firefox no, y el boton tiraba `ReferenceError` antes de
hacer nada. El listener ya recibia el evento, solo no se lo pasaba. Diego usa
Firefox.

### El guard: `no-undef`

Los tres son la misma forma - una variable fuera de alcance. **Sintaxis valida,
`node --check` verde, revienta recien en produccion.** Es el mismo bug que el
`holdOnly` de la reserva antes del cobro, encontrado hace dos dias.

`eslint.config.js` no tenia `no-undef`. Ahora si, con los globals del navegador
y de los CDN declarados para que hable solo de errores de verdad - sin esa
lista, la regla grita 900 veces por `document` y nadie la deja encendida.

De paso salieron tres lineas muertas en `js/landing-inline.js` que llamaban a
`closeGiftCardModal`/`submitGiftCard`, borradas cuando el modal se mudo a
`js/gift-card.js`. No rompian nada (`wire()` no hace nada si el elemento falta)
pero no podian funcionar nunca.

### Verificacion

16 tests nuevos. **Los 8 arreglos se verificaron rompiendolos uno por uno** y
exigiendo que el test fallara. Dos hallazgos de ese proceso:

- Un mutante mal apuntado se leia como "guard decorativo": `Prefer:
  'return=representation'` aparece dos veces en `api/auth.js` y la mutacion caia
  en la primera, que esta en otra funcion. El decorativo era el mutante.
- Uno **si** era decorativo: neutralizar `if (!Array.isArray(updated) ||
  updated.length === 0)` dejaba pasar el 409 y se reembolsaba igual, y ningun
  test lo notaba. Se agrego el que faltaba.

`npm run check`, `npm run lint` y `npm test` verdes por codigo de salida.
1257/1257.
## 77. El backup dejo de ser una promesa (01-sep-2026)

Punto 19 de la auditoria. La queja nunca fue "no hay backups" - era que **nadie
habia restaurado uno nunca**, y un backup sin restauracion de prueba es una
promesa, no un hecho. La entrada 61 cerro la primera mitad: el archivo llega
todas las noches, y Diego confirmo el 01-sep que lo recibio. Esta cierra la
segunda.

### Lo que se probo, y con que

`scripts/restore-backup.mjs` lee un backup y lo devuelve a una base. El
round-trip se manejo **con el codigo real de produccion en los dos lados**:
`buildBackup()` escribe, `validateBackup()` lee, y las filas se comparan campo
por campo. Si la forma se desvia de cualquiera de los dos lados, el test falla -
que es lo unico que mantiene restaurable el archivo que Diego recibe.

Verificado end to end fuera de los tests tambien: se genero un archivo de 1202
filas (151 KB), se escribio a disco como el que llega por mail, y se paso por el
restaurador desde la linea de comandos. Volvio completo.

Lo que sobrevive intacto: acentos, chino, nulos, objetos anidados, y una tabla
de **1200 filas** - mas de una pagina de PostgREST, que es donde un volcado
ingenuo se corta en 1000 y el archivo se ve completo igual.

### Y rechaza lo que tiene que rechazar

Un archivo truncado a mano de 1200 a 900 filas se detecta al instante
(`bookings: dice 1200 filas y trae 900`) y sale con exit 1. Un test que nunca se
vio fallar no prueba nada, asi que tambien se verifico al reves.

### Las guardas, y por que cada una

Una restauracion **escribe**. Todo esta armado para que no pueda escribir en el
lugar equivocado:

- **`--dry-run` es el modo por defecto**, no una opcion. Escribir exige `--url` y
  `--key` explicitos.
- **Se niega a escribir sobre el proyecto de produccion** salvo
  `--i-know-this-is-live`. Restaurar encima de una base sana es como un backup
  se convierte en el desastre que venia a evitar.
- **Un backup incompleto se rechaza** salvo `--allow-incomplete`. Restaurar
  media base en silencio es peor que no restaurar.
- **Nunca borra.** Las filas se upsertean por lotes; nada aca elimina datos.

### Un arreglo de diseno que aparecio al testear

La primera version corria su CLI **al importarse**: el test importaba
`validateBackup()` y el top-level llamaba `process.exit(1)` por falta de
`--file`. Un modulo que termina el proceso al importarse no es un modulo. El CLI
quedo detras de `IS_CLI`, comparando `import.meta.url` con `process.argv[1]`.

No fue una concesion al test: es lo que permite que el test maneje **el
validador de verdad** en vez de una copia que se desincroniza.

`npm run backup:verify -- <archivo>` para revisar cada backup que llega. No
escribe nada.

13 tests nuevos. 1123/1123.

## 78. Ojos propios, y el logo roto que encontraron primero (02-sep-2026)

Diego: *"aqui hay otro error en la landing se ve todo desordenado igual que el
cuadro de booking manual. necesito darte ojos para que puedas navegar tu... son
muchas paginas no te puedo mandar 2000 pantallazos"*.

Tenia razon en las dos cosas: los errores eran reales, y el metodo - el saca un
pantallazo con el celular, yo adivino que CSS lo causa - no escala a 77 paginas.

### `npm run look`

Chromium sin ventana dentro de un proceso de node. **No es el panel del
navegador de Claude**, que abre una ventana con GPU y viene congelando Claude
Desktop (van 10 cierres, todos despues de abrirlo) y esta bloqueado a proposito
en `.claude/settings.local.json`.

```
npm run look -- index.html --mobile --lang es
npm run look -- admin.html --dark --el "#admin-create-booking-modal > div"
npm run look -- landing.html --strips
npm run look -- landing.html --prod
```

Deja la captura en `.look/` (ignorado por git) y ademas **mide**, que es la
mitad que importa: errores de consola filtrando el ruido de las extensiones,
si la pagina se va de ancho y **que elemento** la empuja, cajas cuyo contenido
queda cortado, e hijos que se pasan del padre. Mirar una foto encuentra lo
obvio; el numero encuentra el resto.

Detalles que costaron: `networkidle` nunca termina en este sitio (el widget de
chat deja conexiones abiertas), las animaciones de entrada se miden como
desbordes que no existen si no se congelan, y el service worker sirve JS viejo
si no se lo desregistra antes.

**Y la herramienta me mintio una vez, antes de que la arreglara.** `--mobile`
solo achicaba la ventana. `index.html` mira `navigator.userAgent` y redirige a
`landing.html` si no reconoce un movil, asi que pedir la SPA a 390px devolvia
**la landing apretada en 390px** - y sus desbordes se leian como bugs de la app
de celular. Llegue a "arreglar" un footer que no estaba roto antes de que
`location.pathname` me dijera que estaba mirando otra pagina. Ahora `--mobile`
emula un iPhone 14 de verdad, user-agent incluido. Ese arreglo se revirtio.

### El logo roto - regresion mia, viva en produccion

Lo que Diego llamaba "la landing se ve todo desordenado" era esto:

```html
<img width="600" height="423" src="images/logo-db.png" ... height="36">
```

**El HTML se queda con el PRIMER atributo y descarta el segundo sin decir
nada.** No hay error de consola, no hay warning, no falla ningun build. El logo
paso a medir 423px de alto en vez de 36 y, con `style="width:auto"`, se estiro
a 600px de ancho tapando media pagina.

Lo genero el script del punto 11 (#386, ya mergeado): agregaba `width`/`height`
a toda imagen que no tuviera `width`. El logo tenia `height` pero no `width`,
paso el filtro, y quedo con dos.

**Siete etiquetas, en las tres superficies de cliente**: `index.html` (3),
`landing.html` (3), `track.html` (1). Vivas en produccion desde que se mergeo
el #386 hasta hoy.

Y el test que escribi con ese cambio **paso en verde sobre la pagina rota**:
leia el primer `height=` de la etiqueta - 423 - y 600/423 es exactamente la
proporcion real del archivo, asi que la comprobacion de proporcion daba bien.
Verificaba mi propia suposicion en vez del efecto.

### Los otros dos

**El modal de reserva telefonica del admin.** Cada campo sobresalia 26px del
panel y quedaba cortado. `admin.html` no carga `css/main.css`, asi que no
hereda ningun reset: el unico `box-sizing: border-box` de `css/admin.css` vivia
dentro de `@media print`. Con `width:100%`, los 12px de padding a cada lado mas
1.5px de borde se suman ENCIMA. Alguien ya habia intentado arreglarlo antes con
`min-width:0`, que trata la barra de scroll y no la causa.

**Las tarjetas de servicio en el celular.** Cada una sobresalia 14px de su
grilla y se le cortaba el borde derecho junto con el final de la descripcion.
Una columna `1fr` es `minmax(auto, 1fr)`: no puede encogerse por debajo del
min-content de su contenido. `min-width:0` deja que la tarjeta se achique y el
texto envuelva.

### Tres guards nuevos

1. **`scripts/html-attrs-check.mjs`** (en `npm run check`, o sea bloquea el
   merge): falla si cualquier etiqueta de cualquiera de las 48 paginas repite
   un atributo. Un atributo repetido nunca es intencional.
2. **El test del logo mide el efecto**, no la causa: ninguna copia puede
   declararse de mas de 120px de alto (la mas grande de verdad es 88x62), y
   ninguna imagen puede declarar dos `width` o dos `height`.
3. **`css/home.css` entra en `versioned-assets-check`**: era el ultimo `?v=`
   escrito a mano de `index.html` y mordio en el acto - `npm run check` quedaba
   verde con el archivo cambiado y el `?v=` viejo, o sea que el arreglo de las
   tarjetas habria salido invisible para todo navegador que ya hubiera entrado.

Los cuatro se verificaron **rompiendolos**. De ahi salio que el guard del
`box-sizing` del admin es de la fuente, no del efecto: la mutacion la agarraba
el hash del CSS, no el desborde. Queda escrito en el test que el efecto se mide
con `npm run look`, que no corre en CI.

### El costo en memoria, porque no es gratis

La otra sesion levanto la objecion correcta: de los 10 cierres de Claude
Desktop, nueve fueron por el panel del navegador, pero **el del 02-sep 09:36
(Event 1002) fue por RAM** - 2,7 GB libres de 15,7, con Firefox y Chrome
abiertos. Una herramienta que esquiva la causa de nueve y camina hacia la del
decimo no es una herramienta segura.

Medido en vez de estimado: el pico real era **920 MB**, no los 400-600 que
parecian. Con las extensiones, la sincronizacion, los servicios de fondo y la
GPU apagados, y bajando las capturas de 2x a 1x (una pagina completa de la
landing mide 18.000px de alto: a 2x el mapa de bits solo son ~200 MB), el pico
quedo en **647 MB**, y se libera entero al terminar.

Ademas el script **se planta solo** si hay menos de 1,6 GB libres, y dice que
cerrar. Verificado subiendo el umbral a 99 GB: sale con codigo 2 sin abrir
nada.

`npm run check`, `npm run lint` y `npm test` verdes por codigo de salida.
1276/1276.

## 75. El arreglo del login en oscuro estaba a medias (02-sep-2026)

El 72 dio por resuelta la pantalla de login y 2FA del admin. **No lo estaba.**
La tarjeta y la clase `.inp` quedaron bien; los tres campos donde Diego escribe
-- email, contrasena y el codigo de 6 digitos -- siguieron ilegibles.

### Lo que el 72 no vio

Esos tres inputs no usan la clase `.inp`: se arman con estilo inline en
`js/admin.js` (dos en el bloque del login, y la constante `_inp` que comparten
el 2FA y el alta de 2FA). Y ninguno declaraba **fondo**.

Un `<input>` sin `background` cae al blanco propio del navegador. Al lado tiene
`color:var(--navy)`, que en oscuro vale `#eef2f7`. **Texto casi blanco sobre
blanco, 1.12:1, mientras escribis tu contrasena.**

Es el mismo numero del 72, en el mismo formulario, un elemento mas adentro.

### Por que ningun check lo agarro, ni el que se amplio en el 72

El 72 cerro el hueco de los literales: `#fff` como fondo pasa a estar prohibido
y el patron ahora matchea hex de tres digitos. Nada de eso aplica aca, porque
**no hay literal que marcar**. El bug es lo que el estilo NO dice: declara la
tinta y se calla sobre el fondo, y el navegador decide por el.

Un chequeo que busca colores mal escritos no puede ver un color ausente.

### Como aparecio

Renderizando la pagina, no leyendola. `npm run look` (llego con el #388, de otra
sesion) abre un Chromium sin ventana, y en la captura del overlay en oscuro los
dos campos se veian **blancos** sobre la tarjeta oscura. Escribiendo un email de
prueba con `--fill` quedo a la vista que el texto tipeado no se lee.

Esto vale anotarlo: el 72 se cerro con contraste **calculado** y salio a
produccion diciendo que la pantalla estaba arreglada. El calculo era correcto
para lo que medi -- tinta contra la tarjeta -- y la pantalla seguia rota, porque
el elemento que importaba no era la tarjeta. Es la tercera vez en dos dias que
verificar el proxy en vez del efecto deja pasar un bug vivo (ver 71 y 73).

### El arreglo, y el guard

`background:var(--white)` en los tres estilos inline. `--white` en oscuro es
`#1a2942`, asi que el campo queda oscuro como la tarjeta y el texto tipeado lo
lee cualquiera.

`tests/unit/login-inputs-dark.test.js` fija la forma, no la linea: **todo estilo
inline de `js/admin.js` que pinte texto con un token y tenga forma de campo
(padding + borde) tiene que declarar tambien su fondo**. Mas la medicion de
`--navy` sobre `--white` en oscuro contra AA. Verificado quitando el arreglo:
los tres campos fallan por nombre.

### Lo que SI se verifico esta vez

Con `npm run look`, en la pagina renderizada:

- **La seccion de resenas de Google** (#382): logo, 5.0, las dos tarjetas con
  su texto y "Agosto 2026" traducido. Correcta.
- **El boton del diagnostico en espanol** (#377): `Calculá el precio de tu
  diagnóstico` entra en una linea y no envuelve. La duda del 377 queda cerrada:
  no hace falta el reemplazo corto.
- **Las 33 descripciones del catalogo en el paso 1 de la reserva** (#377), en
  espanol y en movil: las 33 traducidas, cada una en su tarjeta, con los
  encabezados de categoria tambien traducidos.
- **El login del admin en oscuro**, antes y despues de este arreglo.

### Lo que sigue sin verificar

- El catalogo en **chino**.
- El modal "New booking (phone-in)" y su barra de scroll horizontal (72).
- `index.html` en movil reporta una caja con **+364px de scroll horizontal** en
  la fila de badges ("100% Satisfaccion..."). Puede ser un carrusel intencional
  o un desborde. Sin mirar.

## 76. Barrido visual de las cuatro superficies, y lo que encontro (02-sep-2026)

Primer barrido completo con `npm run look` sobre landing, SPA, admin y mechanic,
en claro y en oscuro. Cuatro errores reales, tres falsos positivos que valen
tanto como los errores porque evitan "arreglar" lo que no esta roto.

### El caro: la SPA movil no tenia las resenas de Google

El #382 puso el bloque en `landing.html` y **no en `index.html`**. Resultado: en
escritorio se veian dos resenas de 5 estrellas, y en **movil - por donde entra
la mayoria de los clientes** - la seccion seguia diciendo "Be the first to leave
a review", bajo un perfil de Google que ya tenia dos.

La regla de `CLAUDE.md` es revisar las cuatro superficies. El test que escribi
para el #382 leia **una**, asi que no podia ver el hueco. Ahora recorre las dos
y ademas exige que **coincidan**: mismas citas, mismo orden, mismo numero en el
badge. Escritorio y movil contandole cosas distintas al mismo visitante sobre el
mismo negocio es el modo de falla que esto cierra.

### `hello@` no era la direccion de nadie

Quedaba en dos lugares - `api/send-push.js` (el contacto VAPID de las
notificaciones push) y el pie de los reportes impresos de `js/admin.js`. Diego
lee el correo en `contact@`, y `BUSINESS_EMAILS` de `api/_security.js` ya
listaba solo `contact@` y `noreply@`: o sea que `hello@` **ni siquiera era
reconocida como direccion propia** por los guardas que filtran mensajes
salientes. Unificadas.

### El tagline suelto del sidebar del admin

"Healthy bikes, happy riders" vivia en un `div` propio entre `.sb-brand` y la
navegacion, sin pertenecer a ninguno de los dos. Se leia como una linea de texto
azul flotando. **El contraste estaba bien** - se midio: 6.46:1 en claro y 9.11:1
en oscuro, ambos sobre 4.5 - asi que el problema era de ubicacion, no de
legibilidad. Entro al bloque de marca, bajo "Admin Panel".

### Los tres falsos positivos, y por que importan

1. **"La landing esta rota en oscuro."** Casi se reporta como bug grave: la
   captura mostraba una franja blanca enorme entre el hero y el footer. Se
   comparo la captura clara con la oscura y son **identicas byte a byte**.
   `landing.css`, `main.css` y `home.css` tienen **cero** reglas
   `[data-theme='dark']`, y ni `landing.html` ni `index.html` setean nunca ese
   atributo: solo `js/admin.js` y `js/mechanic.js` lo hacen. **La landing y la
   SPA no tienen modo oscuro**, y lo que se vio era su diseno normal.
2. **+364px de desborde horizontal** en la fila de badges de `index.html`. Es un
   carrusel deslizable a proposito: el padre lleva `overflow-x:auto` y el hijo
   `width:max-content`.
3. **+8px en los numeros 1-2-3-4** de "Proceso Simple de 4 Pasos". Son insignias
   posicionadas en la esquina con `top:-8px; right:-8px`. Sobresalen por diseno.

### Dos tests propios que se rompieron por fragiles

Al correr prettier sobre `index.html`:

- `google-reviews-section` comparaba el texto crudo del `<p>`. Prettier envuelve
  un parrafo largo en varias lineas y el navegador vuelve a colapsar ese espacio
  al renderizar, asi que ahora se compara con el espacio colapsado - contenido,
  no formato.
- `consent-script-order` exigia `data-consent="analytics" async src=` en ese
  orden. El orden de los atributos lo decide prettier. Ahora se busca el tag y
  se verifican sus partes por separado.

Ninguno de los dos se aflojo: los dos verifican lo mismo de una forma que no
depende del formateo.

### Lo que NO se reviso

Se vieron **las pantallas de entrada**, no el interior:

- **mechanic logueado** (lista de trabajos, completar un trabajo): necesita PIN
  y backend.
- **admin por dentro** (Bookings, Finance, Analytics, Calendario): los KPI salen
  vacios sin backend.
- **pasos 2 y 3 de la reserva** (calendario y pago).

Para eso hace falta correr contra produccion con sesion iniciada, que es entrar
al sistema real y lo decide Diego.

## 77. Las reservas telefonicas se veian como "Client" en tres pantallas (02-sep-2026)

Barrido de las pantallas INTERNAS del admin - las que necesitan sesion - con un
backend falso local en vez de autenticarse contra produccion.

### El hallazgo: el nombre del cliente que no aparece

Una reserva tomada por telefono (Admin > New booking) **no tiene cuenta de
usuario**: su nombre vive en `bookings.client_name` y `profiles` es null. Tres
lugares leian solo `profiles.full_name`, asi que todas esas reservas mostraban
la palabra literal **"Client"**:

- `js/admin.js:7064` - el **calendario en vista mes**, la pantalla donde Diego
  lee su dia;
- `js/admin.js:7205` - el calendario en vista dia/semana;
- `js/admin.js:1660` - el **reporte financiero** que se imprime y se exporta, y
  que puede terminar en manos del contador.

No es cosmetico: son exactamente las reservas que Diego carga a mano para los
trabajos que entran por WhatsApp o telefono, que es el flujo que se le
recomendo usar para el trabajo hecho fuera de la app. El mismo archivo ya
resolvia el nombre bien en la tabla de reservas (1394) y en el panel (2716), asi
que era una inconsistencia, no una decision.

**El tercero lo encontro el test, no yo.** Se escribio para fijar los dos
primeros y salto un tercero que no habia visto.

### El titulo de Analytics salia en minuscula

`titles` (js/admin.js:500) tiene las 18 paginas del panel **menos `analytics`**.
La linea que lo usa es `titles[page] || page`, asi que el encabezado mostraba la
clave cruda: la unica pagina del panel que se veia asi.

### Como se llego a las pantallas internas, sin credenciales

Diego ofrecio quitarle la seguridad a las paginas para poder navegarlas. **No se
hizo**: el sitio esta online con datos reales y pagos LIVE, y ese tipo de cambio
"temporal" es el que queda puesto. Tampoco se acepto el codigo de 2FA que
ofrecio pasar.

En cambio se levanto un **backend falso local**: un script de Playwright que
sirve el repo e intercepta toda peticion a `supabase.co` y a `/api/`,
respondiendo con datos inventados. Las librerias (supabase-js desde jsdelivr) se
dejan bajar de verdad - sin eso `js/admin.js` muere en `createClient()` y no
carga ni una pantalla. Lo que se corta es lo que llama a casa: analitica, pagos,
captcha.

Con eso se recorrieron 12 pantallas del admin en claro y en oscuro. Los datos
falsos se eligieron para **estresar** la UI, no para verse bien: un nombre de 29
caracteres, un suburbio largo, los cinco estados de reserva, importes de dos y
tres cifras.

**Limitacion, dicha para el proximo:** el backend falso NO aplica los filtros de
PostgREST del query string. Finance parecio contar una reserva cancelada como
ingreso pagado; se verifico contra el codigo y **no es un bug** - `loadFinance()`
filtra con `.eq('status','completed')`. Los numeros que muestra ese backend no
son los que mostraria la base.

### Lo que se reviso y estaba bien

Dashboard, Bookings, Vans, Clients, Finance, Analytics, Memberships, Services,
Calendar, Zone Manager, Escalation Contacts y Expenses, en los dos temas. Nada
ilegible, nada desbordado, los importes de la tabla de reservas correctos
($69+$25=$94, $369+$45=$414) y los badges de estado con su color.

Un detalle cosmetico sin arreglar: en Bookings la columna de acciones no tiene
ancho fijo, asi que la fila en estado `pending` (cinco botones) se extiende mas
a la derecha que las demas (cuatro o uno) y la tabla se ve despareja.

### Lo que sigue sin verse

La app del mecanico **con sesion**. Se intento restaurando una sesion guardada
en el navegador y no alcanza: la app la valida contra el servidor. Eso es una
buena senal de seguridad, y deja esa pantalla fuera de este metodo.

## 78. Cada bici de cada cliente se veia como "undefined" en el admin (02-sep-2026)

Barrido de la SPA de cliente y de la landing, con el mismo backend falso del 77.

### La tabla se llama distinto de como el codigo creia

`bikes` tiene las columnas **`name`** y **`type`**. Preguntado a la base con la
anon key el 02-sep-2026:

```
select=id,name,brand,model,color,year,type  ->  200 []
select=id,nickname,bike_type                ->  42703 "bikes.nickname does not exist"
```

Dos lugares creian otra cosa:

1. **`js/admin.js:8190`** - `viewClientBikes()` hacia `select('*')` y despues
   pintaba `b.nickname` y `TYPE_LABELS[b.bike_type]`. Como el select pedia todo,
   la consulta **funcionaba**, y la tarjeta imprimia la palabra literal
   **"undefined"** con el tipo en blanco. En Admin > Clientes > ver bicis, para
   todos los clientes.

2. **`scripts/create-bikes-table.sql`** - declaraba `nickname` y `bike_type`.

### La mitad peligrosa era el .sql, no el bug visible

El de admin es feo. El del script es destructivo: **recrear la tabla desde ese
archivo habria renombrado las columnas debajo de `js/app.js`**, que selecciona
*e inserta* `name` y `type`. Mis Bicis habria dejado de funcionar entera - leer
y guardar - y el archivo que lo rompia es justamente el que alguien consultaria
para hacerlo bien.

Es la contracara del modo de falla que este repo ya tiene documentado: no
"codigo mergeado que la base no tiene", sino **documentacion de la base que el
codigo desmiente**.

### Por que sobrevivio tanto

Una columna que no existe normalmente **rompe fuerte**: PostgREST rechaza la
consulta entera y la pantalla muestra un error. Eso se nota. Aca no paso, porque
`select('*')` trae todo y el error se degrada a un `undefined` impreso en una
tarjeta. El sintoma mas leve posible para el bug de fondo.

### El test fija las dos mitades entre si

`tests/unit/bikes-schema.test.js`: el `.sql` tiene que declarar `name` y `type`
y **no** `nickname` ni `bike_type`; toda columna que `js/app.js` selecciona tiene
que estar declarada; y ni `js/admin.js` ni `js/app.js` pueden leer `.nickname` ni
`.bike_type`. Ignora comentarios e ids de markup (`id="bike-nickname"` es un
input, y esta bien).

### Un falso positivo propio, para el registro

En Mis Bicis de la SPA las tarjetas tambien decian "undefined" durante el
barrido. **Eso era culpa de los datos falsos** - se cargaron con `brand/model/
type` y sin `name`. `js/app.js` estaba correcto todo el tiempo. Se verifico
contra el codigo antes de tocar nada.

### Lo que se reviso de la SPA y la landing

Con sesion de cliente simulada: Inicio, Mis Reservas, Perfil, Mis Bicis, Login y
el paso 1 de la reserva, en movil. De la landing, membresias, FAQ y pie.

**Lo que no se vio:** los pasos 2 y 3 de la reserva (calendario y pago) - montar
el estado de reserva que necesitan quedo fuera de alcance -, y la app del
mecanico con sesion, que valida contra el servidor.

Detalle sin arreglar: en `Mis Reservas` el backend falso no responde con la
forma que espera `getBookings()`, asi que se vio el estado de error y no la
lista. El estado de error, eso si, esta bien hecho: icono, titulo y una frase
que dice que hacer.

## 79. Los pasos 2 y 3 de la reserva, recorridos como los recorre un cliente (02-sep-2026)

Ultima pieza del recorrido del cliente que faltaba mirar. Se hizo **navegando**,
no llamando funciones: elegir servicio, elegir dia, elegir hora - los mismos
clicks, contra el backend falso.

### Lo que estaba bien

El paso 2 (`Elegi Fecha y Hora`) se ve correcto en movil: calendario en espanol,
el dia de hoy marcado, los dias pasados deshabilitados, la seccion de horas
debajo y el boton Continuar deshabilitado hasta que hay hora elegida.

### Lo unico que aparecio, y es de UX

Cuando la carga de horarios **falla**, el aviso ("Could not load available
times" + Retry) se pinta al final de `#time-grid`, que queda **debajo de las dos
barras `position: fixed`**: el boton Continuar (`.sticky-bottom`, a 72px del
fondo) y la barra de navegacion (72px de alto).

Lo que la persona ve sin moverse es una frase **cortada a la mitad** y ningun
boton. Se alcanza scrolleando - hay 210px disponibles y `.screen.active` reserva
`padding-bottom: 10rem` -, pero hay que darse cuenta.

Importa porque **no es un caso raro**: Diego confirmo que las horas "demoran unos
segundos en aparecer", asi que una conexion lenta puede llevar a ese estado.

Arreglo: `scrollIntoView({ block: 'center' })` sobre el boton de reintentar
cuando se pinta el aviso.

### Tres falsos positivos propios en este barrido, que valen mas que el hallazgo

1. **"El error queda inalcanzable."** La primera captura era `fullPage`, y ahi
   los elementos `position: fixed` se dibujan fuera de su sitio. Se repitio con
   captura de **viewport** - la que ve la persona - y el problema resulto real
   pero mas suave: tapado, no inalcanzable.
2. **La medicion decia `alcanzableConScroll: false`**, y estaba mal: su
   `techoDeLasBarras` daba 0. Recalculado a mano con los numeros crudos (boton
   en 632-678, barra desde 592, 210px de scroll) da que **si se alcanza**. Se
   reporto lo segundo, no lo primero.
3. **Los horarios "no cargaban".** Era el backend falso devolviendo strings
   cuando el codigo espera objetos con `.available` (`slots.every(s =>
   !s.available)`). En produccion cargan.

### Lo que sigue sin verse

El **paso 3** (resumen y pago). Llegar pide una hora elegida y el flujo completo
de direccion y cobertura; con el backend falso el boton Continuar quedo
deshabilitado. La pantalla de pago monta Stripe Elements, que no se puede
simular sin sus scripts.

Y el `ReferenceError: Sentry is not defined` que aparecio al aceptar cookies en
este barrido **es del backend falso** cortando el CDN - pero confirma lo ya
sabido: a quien tenga un bloqueador, ese error le sale igual en produccion.

## 80. La pantalla en blanco a mitad de una reserva (02-sep-2026)

Diego, desde el celular, dentro de su cuenta: entra a reservar, la app le ofrece
"tenes una reserva en curso", aprieta Continuar y **la pantalla se va a blanco
total**. Sin spinner, sin error, sin nada que tocar. Le paso mas de una vez el
mismo dia - el dia en que salieron **cuatro deploys seguidos**.

### No se pudo reproducir con el codigo, y eso era el dato

Se intento en serio: recorrer el flujo con clicks reales contra un backend
falso, y despues saltar directo al resumen con la reserva armada. Despues, cinco
formas distintas de borrador guardado - hora en 24h, servicio sin precio,
servicio como texto plano, sin `location`, servicio que ya no existe en el
catalogo. **Ninguna** produjo la pantalla en blanco: el resumen renderizo sus
1168 caracteres las cinco veces.

Que el codigo aguante todo eso y a Diego se le rompa significa que el problema
no estaba en el codigo desplegado sino en **el estado del navegador**.

### La causa, en sw.js, y es estructural

```
install:   self.skipWaiting()      se activa sin esperar
activate:  caches.delete(viejo)    BORRA los caches en uso
           self.clients.claim()    toma el control de la pestana abierta
```

...y **nadie recargaba**. Secuencia completa: el cliente tiene la app abierta
corriendo la version anterior; sale un deploy; el worker nuevo se instala, borra
el cache que esa pagina estaba usando y le toma el control. La pagina sigue
ejecutando el JS viejo, pero lo siguiente que pida va contra un cache que ya no
lo tiene. El import falla, el render muere a la mitad, y lo que queda es una
pantalla blanca.

**No es de Diego.** Le pasa a cualquier cliente que tenga la app abierta cuando
se despliega - con la diferencia de que un cliente no avisa, se va.

Los cuatro deploys de ese dia no crearon el problema: lo dispararon cuatro
veces. La causa estaba desde que existe `skipWaiting()` sin su contraparte.

### El arreglo

`controllerchange` -> recargar **una vez**, con guard contra el bucle. Es la
contraparte estandar de `skipWaiting()` + `claim()`. El borrador de reserva vive
en `localStorage`, asi que el cliente vuelve a "tenes una reserva en curso" con
todo lo que habia elegido, en vez de volver a la nada.

Va en las dos superficies que registran el worker: `index.html` y
`js/landing-inline.js`.

### Lo que NO se verifico

**No se vio la pantalla en blanco arreglada**, porque nunca se pudo reproducir.
Lo que si se verifico es el mecanismo: `sw.js` hace las tres cosas, y ahora las
dos paginas escuchan el cambio de controlador. **Que el sintoma desaparezca solo
lo puede confirmar Diego**, usando la app durante el proximo deploy.

Y queda una consecuencia a mirar: **la recarga interrumpe lo que el cliente
estuviera haciendo**. Con el borrador guardado eso es aceptable en el flujo de
reserva, pero si alguna vez hay una pantalla con datos sin guardar, esa recarga
se los lleva.

## 81. La pantalla en blanco, la causa de verdad (03-sep-2026)

La 80 arreglo un problema real de service worker, pero **no era este**. Diego
volvio a reportar: "sigue yendose a blanco en los mismos lugares". Esa frase es
el dato: **en los mismos lugares** significa determinista, y un service worker
que toma el control durante un deploy no es determinista. Habia un bug de
codigo, y estaba a la vista.

### Que pasaba

`renderServiceSummary()` en `js/app.js` leia `calloutFee` y `serviceTotal`
**44 y 12 lineas arriba de su propio `const`**:

```js
if (window.posthog)
  posthog.capture('booking_step_viewed', {
    callout_fee: calloutFee,      // linea 1491
    service_price: serviceTotal,  // linea 1492
  });
...
const serviceTotal = ...          // linea 1504
const calloutFee = ...            // linea 1535
```

Eso es la zona muerta temporal (TDZ) de `const`: no da `undefined`, **tira
`ReferenceError: Cannot access 'calloutFee' before initialization`**.

Y lo tira **antes del primer `screen.innerHTML`** de la funcion. Ahi esta el
sintoma exacto: el router no construye pantallas, solo le pone `active` a divs
que `index.html` ya trae vacios y deja que `js/app.js` los llene. Si el render
revienta antes de escribir, queda:

```html
<div data-screen="service-summary" class="screen active"></div>
```

Una pagina blanca, a pantalla completa, **sin nada que tocar** - porque la barra
de navegacion tambien vive adentro de ese `innerHTML`. Sin spinner, sin error,
sin scroll. Igual que la describio Diego.

### Por que ninguna prueba lo vio

Por el `if (window.posthog)`.

PostHog lo carga `js/consent.js` **solo despues de aceptar las cookies de
analitica**. Sin aceptar, la linea no se ejecuta y el flujo de reserva anda
perfecto. Diego habia aceptado; los barridos automatizados, no. Por eso el
recorrido con clicks reales y las cinco formas de borrador roto pasaron todas:
ninguna tenia PostHog cargado.

Aceptar cookies no deberia cambiar lo que hace la app. Durante un deploy
decidio si la app **funcionaba**.

### Verificado ejecutando, no leyendo

`tests/unit/quote-summary-renders.test.js` saca la funcion real de `js/app.js`
y **la ejecuta** en un `vm` con stubs. Contra el codigo roto:

```
ReferenceError: Cannot access 'calloutFee' before initialization   (html: 0 caracteres)
```

Con el arreglo, las dos rutas - con analitica y sin - producen el mismo HTML,
byte por byte.

### Y "Bookings no me aparece nada" era lo mismo

`renderMyBookings()` esta bien escrita: escribe el encabezado y las pestanas
antes de pedir nada, y tiene estado vacio para las tres respuestas posibles. No
mostraba nada porque **no habia nada que mostrar**: cada intento de reservar
moria en el resumen, asi que Diego nunca llego a crear una reserva. Un solo bug,
dos sintomas.

### Enforcement

`scripts/tdz-check.mjs`, dentro de `npm run check`. `no-use-before-define` a
secas marca 13 casos inofensivos en este repo (el clasico `close()` que
referencia un `onKey` declarado abajo pero que corre recien al hacer click), y
13 comentarios `eslint-disable` habrian tapado justo el que importaba. Este
chequea la forma que **siempre** revienta: la lectura y la declaracion en el
**mismo cuerpo de funcion**, sin nada que difiera la lectura.

Verificado en las dos direcciones: falla contra el `js/app.js` de `origin/main`
(marca 1491 y 1492), pasa con el arreglo.

Es la tercera vez que un bug de alcance de variables llega a produccion en este
repo - el comentario de `eslint.config.js` ya nombraba las otras dos.

### Lo que queda abierto

**Cualquier otra excepcion en un render sigue dando pantalla blanca.** El
despachador de `screenchange` llama a las diez funciones de render sin
`try/catch`, y todas las pantallas salen vacias de `index.html`. La causa de
hoy esta muerta y su clase esta bloqueada, pero la arquitectura sigue
convirtiendo cualquier error de render en una pagina muerta sin salida. Un
`try/catch` por pantalla con un estado de error y un boton de reintentar es un
cambio aparte, deliberado, no para meterlo de contrabando en este.

## 82. El chatbot cotizaba un precio que la reserva no puede cobrar (03-sep-2026)

Diego pregunto: "el chat bot esta conectado con todo el universo Dr bike y
data? no va a responder info incorrecta?". La respuesta corta era **si,
respondia mal** - en el precio de la visita.

El prompt de `api/chat.js` seguia anunciando la escalera de tres bandas:

```
- Up to 20 minutes (Northern Beaches): $25
- 20 to 32 minutes (North Shore, Hornsby): $35
- 32 to 45 minutes (CBD, Inner West, Eastern Suburbs): $45
```

`api/_coverage.js` ya cobraba con **dos**: $25 hasta 25 minutos reales, $45
hasta 45, y $35 pasa a ser exclusivamente el tope de la peninsula norte.

Resultado, en plata:

| Cliente | Le decia el bot | Le cobraba la app |
|---|---|---|
| Chatswood, Hornsby, North Sydney, Lane Cove | $35 | **$45** |
| Newport, Avalon, Palm Beach | $45 | **$35** |

`tests/unit/coverage-resolution.test.js` venia afirmando desde agosto que "$35
ya no es una banda de tiempo". Contra el codigo que cobra, que estaba bien.
Nadie miro el chatbot.

Los precios de los **servicios** nunca se desviaron, y por una razon concreta:
se leen de Supabase en cada request. El precio de la visita era texto escrito a
mano. Esa es toda la diferencia.

### El arreglo

`formatFeeBands()` construye el bloque desde `FEE_BANDS` y `PENINSULA_FAR_FEE`,
y el "BEYOND 45 MINUTES" interpola `PERIMETER_MAX_MINUTES`. Ya no hay ningun
numero tipeado dos veces. `tests/unit/chatbot-quotes-real-fees.test.js` falla
si el bot llegara a nombrar un precio que la reserva rechazaria.

Tambien se corrigio el parrafo de "por que varia la tarifa", que explicaba que
el CBD sale un poco mas que Hornsby - con dos bandas los dos pagan $45.

### Lo que el bot SI tiene bien

- **Servicios y precios**: de la tabla `services`, en vivo.
- **Membresias**: coinciden con `terms.html` e `index.html` (verificado).
- **Recargo de domingo y feriado**: 20%, correcto.
- **Fuera del perimetro**: no inventa precio, manda al pedido de cotizacion.
- **No revela el prompt, no cambia de personaje, no escribe codigo.**

## 83. PENDIENTE - vender la foto y la descripcion, que es lo que nos diferencia

Pedido de Diego (03-sep-2026), textual:

> "en alguna parte hay que hacerle marketing a la seccion de sacar fotos o
> agregar una descripcion de la bici si no sabes que es lo que tiene! ese es el
> game changing de nosotros"

**Que existe hoy:** en la SPA, dentro de "Book a Service", una caja
`#diag-block` que dice "Not sure what your bike needs?" con un boton de foto y
un campo de texto, contra `/api/chat?type=diagnose`. Funciona y devuelve el
servicio recomendado con precio.

**El problema:** esta **solo adentro del flujo de reserva**, es decir, se lo
encuentra el que ya decidio reservar. El cliente que no sabe que tiene la bici
-- justamente el que esto resuelve -- no llega nunca, porque no empieza una
reserva para algo que no sabe nombrar.

**Donde deberia estar y no esta:**
- La landing: no hay ninguna seccion que lo muestre.
- El home de la SPA: no aparece.
- No hay ninguna pagina propia que Google pueda indexar por "no se que le pasa
  a mi bici".

**Sin decidir todavia** (es una decision de producto y de marca, de Diego):
como se llama de cara al cliente, si va arriba o abajo en la landing, si lleva
una foto de ejemplo, y si merece su propia pagina para SEO. No escribir codigo
antes de eso.

## 84. El interruptor de zonas no llegaba al despacho (03-sep-2026)

Diego pidio dejar la Van 2 sin zonas para que todo vaya a la Van 1. Apagar una
zona en Admin pone `active = false` - no borra la fila, y eso es a proposito
(su regla: nunca borrar filas).

**Todos los lectores respetaban ese flag menos el que decidia el reparto.**
Zone Manager, las tarjetas de Van 1 / Van 2 y el conteo de disponibilidad
filtran por `active = true`. `matchVanZone()` en `api/auth.js` - la funcion que
decide **que mecanico recibe el trabajo** - leia la tabla sin filtrar.

O sea: una zona apagada desaparecia de la pantalla y **seguia despachando**. El
SMS le llegaba igual al mecanico que Diego creia haber sacado de ese suburbio.

Arreglado: `matchVanZone()` filtra por `active = true`.

### Lo que quedo sin tocar, a proposito

`api/auth.js:4209` cuenta las vans para calcular cuantos turnos ofrecer, y
tampoco filtra por `active`. **No se cambio.** Si se le agrega el filtro y la
Van 2 se queda sin filas activas, la Van 2 sale del conteo y la app ofrece
menos turnos por dia. Eso es una decision de negocio (¿trabaja el Mecanico 2 o
no?), no un bug, y no es lo que Diego pidio. Si algun dia la Van 2 deja de
trabajar de verdad, ese es el lugar.

## 85. La pagina decia estar en ingles aunque estuviera en chino (03-sep-2026)

Diego: *"debemos asegurarnos de que la gente, cuando entre a la aplicacion, lo
vea en su lenguaje"*. La deteccion automatica ya funcionaba - `detectLang()`
mira `localStorage` y despues `navigator.language`, y sirve espanol a un
telefono en espanol y chino a uno en chino desde antes. Lo que faltaba era que
el **documento lo dijera**.

Las tres paginas de cliente traen `<html lang="en">` escrito a mano y nadie lo
movia. Una pagina traducida entera al chino seguia declarandose inglesa.

### Que rompia, concretamente

- **Un lector de pantalla elige la voz por ese atributo.** Leia el espanol y el
  chino con voz inglesa: entre incomprensible y ofensivo.
- **El navegador decide si ofrecer "traducir esta pagina" comparando ese
  atributo con el idioma del visitante.** Declarando siempre `en`, a un cliente
  hispanohablante que ya estaba viendo la version en espanol se le podia
  ofrecer traducirla del ingles.
- Google lo usa para saber que version indexar.

### Lo que se hizo

`js/i18n.js` es el dueno del atributo, porque ya es el dueno de `currentLang`.
Se aplica al arrancar y **tambien al cambiar de idioma**, antes de disparar
`langchange` - por el mismo motivo que el resto de ese orden: quien escuche el
evento y repinte tiene que leer un documento que ya declara el idioma nuevo.

No es el codigo de dos letras:

```
en -> en-AU   el negocio es australiano
es -> es      la copia es rioplatense ("tenes", "calcula"), asi que es-ES
              seria falso y es-AR estrecho para el resto de Sydney
zh -> zh-CN   sin la region, un lector de pantalla no sabe si leer mandarin
              o cantones
```

Deliberadamente **no** se reusa `DATE_LOCALES`, donde `es` es `es-ES`: para
formatear una fecha la region importa y Espana es el default razonable; para
declarar el idioma del texto, no. Son dos mapas a proposito.

`track.html` tenia su propia copia de esto, que **corria una sola vez al
arrancar y escribia el codigo de dos letras**: pisaba el `zh-CN` correcto con un
`zh` pelado, y si el cliente cambiaba de idioma en esa pagina el atributo se
quedaba en el anterior. Se borro; ahora hay un solo dueno.

`sw.js` sube a `drbike-static-v119`, que es lo que hace que un visitante que ya
entro reciba el `i18n.js` nuevo.

### El bug de mi propia herramienta

`scripts/look.mjs` escribia la eleccion de idioma en `drbike_lang`, con guion
BAJO. La clave real de `js/i18n.js` es `drbike-lang`, con guion medio. Asi que
`--lang` no cambiaba nada: escribia una clave que nadie lee, la app caia en
`detectLang()` y devolvia el idioma del navegador. Yo lo habia leido como "la
app ignora la eleccion" en vez de "mi herramienta escribe en el lugar
equivocado", y quedo anotado asi en la memoria. Corregido.

Con eso arreglado, la verificacion es directa: las tres paginas, los tres
idiomas, y ademas **cambiando de idioma con el selector** - `en-AU` antes del
clic, `zh-CN` despues.

### Los tests, y uno que era decorativo

Seis mutantes, todos detectados. Dos correcciones salieron de ahi:

- El test del orden comparaba la posicion de la palabra `langchange`, que
  aparece antes **en el comentario que explica ese mismo orden**. Medía texto,
  no codigo. Ahora compara contra `dispatchEvent(`.
- El test del arranque buscaba `applyDocumentLang(currentLang)` sin anclar, asi
  que **comentar la linea lo dejaba pasar**: el patron se encontraba a si mismo
  dentro del comentario. Ahora esta anclado al principio de linea.

### Lo que NO se hizo: el cuarto caso

Un cliente con el telefono en frances, portugues o arabe cae en ingles. Eso
sigue igual y es una decision de Diego, no un bug. Lo que ya existe sin
codigo nuevo es la traduccion propia del navegador, y **este cambio es
justamente lo que la hace funcionar bien**: con el idioma declarado de verdad,
Chrome, Edge y Safari pueden ofrecer traducir cuando el visitante habla otro
idioma, y dejan de ofrecerlo cuando la pagina ya esta en el suyo.

Meter un widget de Google Translate seria otra cosa: `script-src` no permite
ningun dominio de Google Translate hoy, habria que sumarlo a la CSP, pasa por
la puerta de consentimiento de cookies, y agrega un script de terceros a
paginas que cobran con tarjeta.

`npm run check`, `npm run lint` y `npm test` verdes por codigo de salida.
1348/1348.

## 85. La red de seguridad por pantalla (03-sep-2026)

Cierra lo que la 81 dejo abierto a proposito. La causa concreta de la pantalla
en blanco murio y su clase entera quedo bloqueada por `scripts/tdz-check.mjs`,
pero la arquitectura seguia convirtiendo **cualquier** error de dibujado en una
pagina muerta sin salida.

`index.html` trae cada pantalla como un div **vacio** y `js/app.js` es lo unico
que la llena. Un render que revienta antes de su primer `screen.innerHTML =`
deja una pagina blanca a pantalla completa y **sin nada que tocar**, porque la
barra de navegacion tambien vive adentro de ese `innerHTML`.

### Dos reglas, y la segunda es la que la hace segura

**1. Solo se reemplaza una pantalla que no dibujo NADA.** Aparece una tarjeta
de error con "Probar de nuevo" y "Volver al inicio".

**2. Una pantalla que ya dibujo y despues falla se deja intacta.** Si el render
saco su HTML y murio recien al conectar un boton, la pagina sigue siendo util:
borrarla para poner una tarjeta de error seria empeorarla. Ese caso recibe un
aviso flotante, no un reemplazo.

Esa segunda regla es el riesgo real de cualquier red de seguridad, y esta
cubierta por un test.

### Nada se traga

Toda falla llega a la consola y a Sentry etiquetada con la pantalla
(`tags: { screen }`). Una pantalla que le falla en silencio a un cliente sigue
siendo algo de lo que nos enteramos.

### Como se verifico

`tests/unit/screen-error-state.test.js` **ejecuta** las tres funciones sacadas
de `js/app.js` en un `vm`: pantalla vacia, pantalla ya dibujada, error
sincronico, error asincronico, y el boton de reintentar (que efectivamente
vuelve a llamar al render). Ocho pruebas.

Ademas el despachador dejo de llamar a los renders sueltos: ahora es un mapa
`ruta -> render` que pasa entero por la red, y un test falla si alguna pantalla
vuelve a esquivarla. Es el error que va a cometer el que agregue la pantalla
numero once.

### Lo que cambio de forma

`if (detail.route === 'x') renderX();` diez veces paso a ser un objeto
`RENDERERS`. `tests/unit/quote-request-flow.test.js` afirmaba la forma vieja
sobre `quote-sent`; se actualizo a la nueva sin aflojar lo que comprueba.


## 86. El BAS declaraba un cero que nadie habia calculado (03-sep-2026)

El export del BAS imprimia:

```
G10 — Capital Purchases: $0
G11 — Non-capital Purchases: $0
1B  — GST Credits on Purchases: $0
NET GST PAYABLE TO ATO: $<gst de ventas>
```

Ninguno de esos ceros se habia calculado. Estaban escritos a mano en la
plantilla. Y el problema no es cosmetico: **presentar el BAS con 1B en cero es
declarar que no se reclama ningun credito de GST**. Para un negocio con gastos
registrados, eso es pagarle a la ATO mas de lo que corresponde.

Peor todavia era el nombre de la ultima linea: "NET GST PAYABLE TO ATO" sobre
el GST de ventas a secas. No era el neto - era el bruto, presentado como neto.

### Los gastos siempre estuvieron ahi

`expenses` es una tabla real y el P&L **de la misma pantalla** viene restando
esos gastos hace meses. El BAS simplemente nunca los miro: `_finData` no los
llevaba.

### Por que no se calcula 1B automaticamente y punto

Porque no se puede, con lo que hay guardado. La tabla `expenses` tiene
`amount`, `category`, `spent_on` - y **nada** que diga si esa compra llevaba
GST ni si es de capital o corriente. La ATO necesita las dos cosas. Dividir el
total por 11 seria reemplazar un numero mal por otro numero mal, esta vez en
una presentacion impositiva.

Tampoco sirve meter el total en G11: **los sueldos no son una compra** (van en
W1/W2), y `payroll` es una de las categorias.

### Lo que hace ahora

- G10, G11 y 1B dicen `NOT CALCULATED`, con un parrafo que explica por que y
  que advierte explicitamente que un 1B en cero es pagar de mas.
- La linea del neto pasa a llamarse "GST ON SALES, BEFORE ANY CREDITS AT 1B".
- Se agrega un bloque con los gastos reales del periodo por categoria,
  rotulado **"Supporting information, not BAS figures"**, con el total y con
  los sueldos senalados aparte.
- Si no hay gastos cargados, lo dice y apunta a Admin > Expenses, que es
  justamente lo que hace que 1B parezca cero.
- Si los gastos no se pudieron leer, lo dice en lugar de inventar ceros.

G1, G2, G3 y 1A siguen calculandose: esos si salen de los datos.

## 87. La columna de acciones de Bookings (03-sep-2026)

Cada fila dibujaba entre **uno y cinco botones** segun el estado, dentro de una
celda `white-space:nowrap`, y cada boton traia su propio `margin-right` salvo
el ultimo escrito. Tres consecuencias:

1. El ancho de la columna saltaba segun cual fuera la fila mas ancha.
2. Cuando el ultimo boton no se dibujaba (un trabajo completado no tiene
   "Confirm"), el anterior se quedaba con un margen colgando que nadie veia
   pero que corria todo lo demas.
3. Una reserva cancelada no dibujaba **nada**, asi que la celda se colapsaba y
   la fila quedaba visualmente rota.

Arreglado de raiz, no con parches: `flex` con `gap` en el contenedor - el
espacio pertenece al contenedor, asi que no puede sobrevivir a un hijo oculto -
y `min-width` igual en todos los botones para que la columna deje de saltar.
La fila cancelada dice "Cancelled" en gris en vez de quedar vacia.

De paso los estilos salieron de los atributos `style` y pasaron a clases con
tokens, que es lo que ademas los hace correctos en modo oscuro.

## 88. El modulo de privacidad estaba escrito y no lo llamaba nadie (03-sep-2026)

`privacy.html` promete, bajo la Privacy Act 1988, dar **una copia** de los datos
personales y **borrarlos** a pedido, respondiendo **dentro de los 30 dias**.

`api/_privacy.js` sabe hacer las dos cosas desde agosto, y
`tests/unit/privacy-requests.test.js` (22 pruebas) demuestra que los planes que
arma estan bien. Lo que nadie reviso fue si **alguien lo llamaba**. No lo
llamaba nadie.

Asi que si un cliente escribia, cumplir la promesa significaba encontrar un
archivo en el repositorio.

### Y el runbook estaba peor que eso

`docs/RUNBOOK-PRIVACY.md` es el documento que Diego habria abierto. Nombraba
**1 de las 9 tablas** con datos personales. Corriendo lo que decia, el nombre de
esa persona quedaba igual en `profiles`, mas sus bicicletas, sus mensajes, sus
checkouts abandonados y **tres listas de correo**.

La cabecera de `api/_privacy.js` afirmaba desde el dia uno:

> docs/RUNBOOK-PRIVACY.md is GENERATED from it by scripts/privacy-check.mjs, so
> the runbook Diego pastes into Supabase cannot drift away from what the code says.

**Ese script no existia.** Por eso se desvio: la garantia estaba escrita en un
comentario en vez de en un archivo ejecutable.

### Lo que se hizo

**1. `scripts/privacy-check.mjs`, dentro de `npm run check`.** Genera la seccion
de SQL del runbook desde `PII_MAP` y falla si el archivo quedo viejo. La prosa
que Diego lee primero - que hacer, por que es anonimizar y no borrar, los 7
anos - es texto a mano arriba de los marcadores y no se toca nunca. El runbook
paso de 1 a 9 tablas, con el motivo de retencion de cada una.

**2. `admin-privacy-plan` en `api/auth.js`.** Detras de `verifyAdminSession`.
Devuelve los dos planes para una persona concreta. Rechaza un id que no sea un
UUID: un id mal formado no matchea nada y produce SQL que **parece completo y no
borra a nadie**, que es el peor resultado posible de esta funcion. Acepta email
solo, porque un invitado no tiene fila en `profiles` pero si tiene reservas con
su nombre.

**3. El boton.** Admin > Clients > cada tarjeta > **Privacy request**. Muestra
los dos bloques de SQL listos para copiar: primero la copia (solo lectura),
despues el borrado, con la advertencia de que no tiene vuelta atras.

### Por que muestra el SQL y no lo ejecuta

No es timidez, son tres razones concretas:

- **El borrado es irreversible y no se puede verificar desde ahi.** Los valores
  originales no quedan guardados en ningun lado: un clic de mas no tiene undo
  ni rastro para reconstruir.
- **Hay que confirmar que el pedido viene de esa persona ANTES.** Ese juicio es
  de Diego y ocurre fuera de la pantalla.
- **La regla del proyecto:** el SQL que cambia datos lo lee y lo pega Diego en
  Supabase, no lo dispara un boton que se puede apretar dos veces.

### Lo que sigue sin cubrir

El cliente **no** tiene autoservicio: no hay boton de "borrar mi cuenta" en la
app. No hace falta - responder por email dentro de los 30 dias es un proceso
valido bajo la ley australiana - pero conviene decirlo en vez de suponerlo.

---

## 89. El invitado recibia el email de resena y no podia dejarla (03-sep-2026)

Buscando que faltaba de la captacion de resenas -que el pedido daba por "hay
que armarla", cuando en realidad estaba armada entera y con guards- aparecio
que la cadena termina en una pared para el unico cliente que un negocio sin
lanzar tiene.

### Los dos muros, en archivos distintos

Ninguno de los dos parece roto por separado. Ahi vivio.

```
js/supabase.js:100   if (!session?.user) throw 'Please sign in to leave a review.'
api/auth.js:3961     if (booking.client_id !== client_id) return 403
```

Y `api/auth.js:1341` crea las reservas de invitado asi:

```js
user_id: user ? user.id : null,
client_id: user ? user.id : null,
```

O sea que para un invitado la segunda condicion **no podia dar verdadera
nunca**. Sin sesion, el primer muro. Y si el invitado se creaba una cuenta
despues y volvia al link, el segundo: `null` no es igual al uuid nuevo.

**Un negocio que todavia no lanzo no tiene ni una cuenta creada.** Sus primeros
clientes son todos invitados. Este era el camino de la PRIMERA resena, la que
mas pesa cuando el competidor de al lado tiene 11 y nosotros 2.

### La segunda credencial

El `tracking_token` de la propia reserva. Es un UUID v4 (122 bits) que
`/api/auth?role=public-track` **ya** cambia por la direccion del cliente y su
PIN de llegada: aceptarlo para puntuar un trabajo concede estrictamente menos
de lo que ya concede. Tiene indice unico, asi que identifica la reserva por si
solo - en ese camino el `booking_id` del pedido no se consulta, y la escritura
usa `booking.id`, el de la fila que paso los chequeos.

Caduca con el mismo reloj que la pagina de seguimiento
(`api/_tracking-scope.js`): a los 90 dias, 410.

El link del email y del SMS pasa de `/?review=<id>` a `/?review=<id>&t=<token>`.

**Y con las dos credenciales presentes gana el token**, no la sesion. Ese es el
caso que un arreglo ingenuo se pierde: el invitado que se crea una cuenta y
hace clic en el link ya firmado. Si ganara la sesion, el servidor compararia
`null` contra su uuid nuevo y contestaria 403 por un trabajo que es
evidentemente suyo.

### El comentario que justificaba una decision con un flujo inexistente

`api/_tracking-scope.js:24` explicaba por que el token no se apaga al terminar
el trabajo:

> *el email de review va con `/track.html?token=...`*

**Falso.** El email mandaba `/?review=<id>`, sin token, y `handleClientReview`
no aceptaba tokens. La decision de mantener el link vivo despues del trabajo
-que es correcta- estaba escrita sobre un flujo que no existia. Ahora existe.

### Verificado, no supuesto

- **Contra produccion**, antes de tocar nada: `POST /api/auth` con
  `role=client-review` y sin sesion contesta `400 access_token and client_id
  required`. El endpoint desplegado exigia sesion de verdad, no solo en el
  codigo que yo leia.
- **Contra produccion**: `bookings.tracking_token` existe. `role=public-track`
  con un UUID al azar contesta `404 Booking not found`, cosa que solo puede
  hacer si la columna resuelve. Si no existiera, seria 500.
- **El guard se vio fallar.** Se reintrodujo el bug a proposito (sacar
  `mode !== 'token'` de `reviewGate`) y `tests/unit/guest-can-review.test.js`
  paso a **6 fallas**. Restaurado, verde.
- 1379 tests, `npm run check` exit 0, `npm run lint` 0 errores.

### Lo que NO se verifico

La cadena entera con un trabajo real completado. Sigue necesitando que un
mecanico complete un trabajo de verdad, y eso no lo puede hacer una IA.


---

## 90. El reintento le mandaba al invitado el link viejo (03-sep-2026)

Secuela inmediata de la 89, y del mismo tipo: **dos listas de columnas que
tienen que coincidir y nada las ataba.**

`/api/send-cron?type=completion-retry` -que corre dentro del cron diario
`type=all`, verificado- vuelve a armar la factura, el email de resena y el SMS
con `buildCompletionCalls`, pero a partir de una fila que arma **su propia**
consulta:

```js
.select('id, client_name, client_email, ... mechanic_id, completion_notifications')
```

El dia anterior el link de resena empezo a llevar el `tracking_token`, que es
lo unico que le permite resenar a un invitado. Esa consulta no lo pedia.

### Por que no se rompe nada visible

PostgREST no se queja de una columna que no le pediste. Llega `undefined`,
`buildCompletionCalls` cae al link sin token, y el reintento sale **con un dato
menos que el envio original**. Ningun error, ningun log, ninguna alerta.

Y le pasaba justo al cliente cuyo primer intento habia fallado: **el unico al
que el reintento existe para rescatar.**

### El guard no fija una lista escrita a mano

`tests/unit/completion-retry-columns.test.js` **deduce** los campos leyendo
`api/_completion-notify.js` (`booking?.<campo>`) y los compara contra el select.
Agregar un campo nuevo alla y olvidarse aca falla solo, sin que nadie tenga que
acordarse. Comprueba ademas que el handler siga enganchado al cron diario y que
`vercel.json` siga teniendo ese cron: un reintento que no llama nadie es una red
que no existe.

### Dos falsos positivos propios, que valen mas que el hallazgo

1. **El regex matcheaba dentro de un comentario.** `_completion-notify.js`
   explica el bug del invitado escribiendo `booking.client_id` en prosa, y el
   test pedia `client_id` como columna. Se sacan los comentarios antes de
   escanear.
2. **Y el que los sacaba no sacaba nada.** `//.*$` sobre archivos con CRLF:
   `.` no matchea un terminador de linea y `$` sin `m` pide fin de cadena, asi
   que en una linea terminada en `\r` la sustitucion **no hacia nada**. Es
   exactamente el error de CRLF que este repo ya tenia anotado. Se normaliza
   `\r` primero.

Los dos aparecieron porque el test se corrio esperando verlo fallar, no verlo
pasar.

### Verificado

- **El guard se vio fallar**: sacando `tracking_token` del select, 2 fallas.
  Restaurado, verde.
- 1413 tests, `npm run check` exit 0.

### Lo que queda sin verificar

Esa consulta tambien pide `parts_charged` y `tip_amount`, que no figuran en
ninguna migracion de `docs/RUNBOOK-SQL.md`. Si alguna no existiera, PostgREST
rechaza la consulta **entera** y el reintento devuelve `skipped: query failed`
todos los dias sin que nadie lo mire. Vienen del esquema viejo y lo mas probable
es que esten; hace falta preguntarselo a la base para saberlo.

---

## 91. Una ruta publica devolvia el nombre completo de cada cliente (03-sep-2026)

Recorriendo la cadena de resenas hasta donde termina -que es la landing y la
home, no la base- aparecio que hay **dos caminos** por los que una resena sale
a internet, y solo uno recortaba el nombre.

| Camino | Nombre | Quien lo usa |
|---|---|---|
| Vista `public_reviews` | `Sarah M.`, recortado en SQL | `index.html` y `js/landing-inline.js`, con la anon key |
| `GET /api/chat?type=reviews` | **nombre y apellido enteros** | nadie del repo |

El segundo es publico, sin autenticacion, y lee `bookings` **directo con la
service key**, que ignora RLS. Que la vista enmascare no lo tapaba: no pasa por
la vista.

### No lo llama nadie, y contesta igual

`git grep type=reviews` sobre todo el repo no encuentra un solo consumidor - ni
una reescritura en `vercel.json`. Vino de un `get-reviews.js` que se fusiono
adentro de `chat.js` para no pasarse del limite de 12 funciones de Vercel.

Pero **responde desde internet**. Verificado el 2026-09-03:

```
GET https://drbikesydney.com.au/api/chat?type=reviews
  -> 200  {"reviews":[]}
```

Vacio **porque todavia no hay ninguna resena**. Iba a devolver nombre, apellido
y servicio contratado de cada cliente el dia del primer trabajo terminado - que
es exactamente lo que esta sesion estuvo desbloqueando (89 y 90).

### El arreglo, y una trampa en el camino

`shortClientName()` se mudo de `api/auth.js` a `api/_privacy.js`, que no importa
nada y por eso cualquier handler lo puede traer. `chat.js` no podia importar
`auth.js`: es un handler completo, con Stripe y Supabase adentro, y arrastrarlo
por una funcion de cinco lineas se paga en cada arranque en frio.

La trampa: el primer intento dejo en `auth.js`

```js
export { shortClientName } from './_privacy.js';
```

Esa forma re-exporta pero **no trae el nombre al alcance local**, y `auth.js` lo
LLAMA doce lineas mas abajo. Habria sido un `ReferenceError` en produccion, en
el perfil publico de un mecanico. `node --check` lo da por bueno: es sintaxis
valida. Lo agarro importar el modulo de verdad y llamar la funcion.

### Verificado

- **El guard se vio fallar**: devolviendo el nombre crudo en `chat.js`, 1 falla.
- **Y un falso positivo propio**: el test importaba `api/auth.js` para llamar la
  funcion de verdad, y con la suite entera corriendo ese import pasaba de 5s y
  moria por timeout. Se cambio por una comprobacion de la FORMA del re-export;
  la resolucion en ejecucion ya la prueba `mechanic-stats.test.js`, que lo
  importa de `auth.js` y lo llama. El timeout es, ademas, la mejor evidencia de
  por que `chat.js` no puede importar `auth.js`.
- Los dos modulos se importaron de verdad y se llamo la funcion, no solo
  `node --check`.
- El endpoint y la vista, los dos probados **contra produccion**: `200` y vacios.
- 1424 tests, `npm run check` exit 0.

### Lo que no se hizo, a proposito

**No se borro el endpoint**, aunque no lo llame nadie en el repo. Que no haya
consumidores adentro no prueba que no los haya afuera, y enmascarar el nombre
cierra la fuga igual. Si Diego confirma que nada externo lo usa, sacarlo es una
linea menos de superficie publica.

## 92. El BAS salia con el ABN sin completar (03-sep-2026)

El export del BAS escribia, literal:

```
ABN: [Your ABN here]
```

...mientras el reporte de Finanzas que se imprime, **treinta lineas mas abajo
del mismo archivo**, escribia el ABN real a mano, dos veces. Alguien lo cargo en
un lado y se olvido del otro.

Nadie lo iba a ver en pantalla. El BAS es un `.txt` que se descarga y se abre
**delante del contador**, que es el peor momento posible para descubrir que la
casilla del ABN dice "[Your ABN here]".

### El arreglo, y la trampa que tenia adentro

Los tres lugares leen ahora `DRBIKE_ABN`.

La trampa: dos de esos tres estaban dentro de un template literal gigante
(`win.document.write(\`...\`)` de 143 lineas). Un `${DRBIKE_ABN}` que cae en un
string comun **se imprime tal cual**, y `node --check` lo da por bueno: es
sintaxis valida. Leyendo el codigo los dos casos se ven identicos.

Por eso `tests/unit/bas-abn.test.js` **ejecuta** `exportBAS()` en un `vm` y mira
el archivo que sale, en vez de leer la fuente. Comprueba que la linea del ABN
traiga el numero, que no haya quedado ningun `${` sin resolver, y que el ABN del
BAS **coincida con el de la factura que recibe el cliente** - si no, el contador
esta conciliando dos negocios distintos.

La extraccion del test tuvo que hacer balanceo de llaves: estas funciones tienen
HTML con `}` al principio de linea, y el corte ingenuo por `\n}\n` cae a la
mitad.

### Contexto: todavia no hay GST registrado

Diego confirmo el 03-sep que **no esta registrado en GST**, y que **no salio
ninguna factura todavia** - no hubo clientes cobrados. Asi que no hay nada mal
emitido hacia atras.

La app esta construida para un negocio registrado (la factura dice "GST
included", `business.html` promete "GST receipts") y **eso es a proposito**: es
donde va. Lo unico que importa es el orden - registrarse antes de la primera
factura cobrada. No es una decision de codigo.


---

## 93. El nombre del servicio lo escribia el navegador, y el mecanico lo ejecutaba (04-sep-2026)

**Hallazgo 2 de la auditoria tecnica del profesor sobre `f496270`. Confirmado
leyendo el codigo, no la auditoria.** XSS almacenado en la app del mecanico,
con un costo de entrada de una tarifa de visita (~$25).

### La cadena, en tres archivos

```
api/create-payment-session.js:46   bk_service_name: s(booking.serviceName, 120)
                                   -> 120 caracteres del navegador, en la
                                      metadata del PaymentIntent

api/stripe-webhook.js:169          priceForService() devuelve null si el
                                   servicio no existe. NO lanza.
api/stripe-webhook.js:349          service_name: svc?.name || md.bk_service_name
                                   -> guarda ese string en `bookings`, para
                                      siempre

js/mechanic.js:884                 ${j.service_name} dentro de innerHTML, SIN
                                   escapar, y escapando esc(j.suburb) en LA
                                   MISMA LINEA
```

El aviso "New booking!" que le salta al mecanico en tiempo real es el que
ejecuta. Y el mecanico es la sesion que tiene el token de 60 dias y el poder de
cerrar trabajos cobrando (ver el punto 3 de la auditoria).

### Arreglado en las dos puntas, a proposito

Escapar en el render arregla la pantalla. Rechazar en el webhook arregla la
base. Se hicieron las dos porque cada una sola deja media falla viva: si solo
se escapa, el dato sucio sigue guardado y el proximo lugar que lo muestre
vuelve a ser vulnerable; si solo se rechaza, cualquier fila sucia ya escrita
sigue ejecutandose.

- `api/stripe-webhook.js`: `if (!svc)` reembolsa y no reserva, exactamente como
  ya hacia con un importe que no coincide. Y el row ahora usa `svc.name`, nunca
  `md.bk_service_name`: el string del navegador ya no tiene ningun camino a la
  base.
- `js/mechanic.js`: `esc()` en `service_name`, `service_price`, y en el
  calendario semanal en `j.suburb || j.address` y `j.status`.

### Hermanos, buscados

Se barrieron TODAS las interpolaciones de `innerHTML` en `js/mechanic.js` y
`js/admin.js` (73 y 184 candidatas). `admin.js` ya escapaba todo lo que viene
de la base - el informe tenia razon, la superficie era la app del mecanico. En
`mechanic.js` aparecieron tres hermanos ademas del citado, los tres en el
calendario semanal: `j.suburb || j.address` (la direccion la escribe el
cliente), `j.status` y `j.price`. Los `item.label` de los checklists son
constantes del propio archivo; los `data-...="${j.client.replace(/"/g,'&quot;')}"`
son atributos entrecomillados y no se puede salir de ellos. No se tocaron.

### Un bug vivo que NO estaba en la auditoria, y que NO se arreglo

`api/auth.js:671` (`handleRequestQuote`) inserta en `bookings`:

```js
service_name: String(service_name).slice(0, 120),
service_price: Number(service_price) || 0,
```

Los dos vienen del cuerpo del pedido, sin contrastarse contra `services` - y
`service_id` llega en el body y no se usa. O sea: hay una SEGUNDA via para
meter un `service_name` arbitrario en la base, y esta es gratis (un pedido de
presupuesto no cobra nada). El XSS quedo muerto igual, porque el arreglo del
render cubre las dos vias.

**No se arreglo aqui porque no es un cambio tecnico, es de negocio:** si un
presupuesto solo puede nombrar un servicio del catalogo, un cliente que pide
algo que no esta en la lista deja de poder pedirlo, y eso es perder un lead.
Lo decide Diego, no una sesion cerrando un hallazgo de seguridad.

### Verificado

Los dos tests se vieron fallar con el bug puesto, y se comprobo que la mutacion
rompio lo que se creia romper:

- `tests/unit/webhook-unknown-service.test.js` **ejecuta**
  `handlePaymentIntentSucceeded` con Stripe y Supabase falsos, en vez de leer
  su fuente. Sacando el guard y devolviendo el fallback: 2 de 4 en rojo, y el
  mensaje de error muestra el `<img src=x onerror=alert(1)>` llegando al row.
- `tests/unit/mechanic-render-escaping.test.js` **ejecuta las plantillas
  reales** sacadas del archivo con `new Function`, usando el `esc()` real del
  propio `mechanic.js`. Sacando los 5 escapes: 6 de 7 en rojo. El que quedo
  verde es el del suburbio del aviso, que ya estaba escapado y no se mutO -
  la comprobacion del mutante.

**Una trampa propia, del tipo que este archivo ya tiene anotado dos veces.**
La primera version afirmaba `expect(html).not.toContain('onerror=')` y fallaba
sobre el codigo YA ARREGLADO: un payload bien escapado se lee
`&lt;img src=x onerror=alert(1)&gt;`, que contiene `onerror=` como texto
inerte. Era testear el proxy en vez del efecto. La version que quedo cuenta los
`<` del HTML producido y los compara contra un render con un valor inocuo: un
valor bien escapado aporta CERO aperturas de etiqueta, sea cual sea su
contenido.

`npm run check` 0, `npm run lint` 0, `npm test` 0 (1435 tests, 104 archivos).
`mechanic.html` movio su `?v=` a `c1d856b1ef` - y eso ya no depende de
acordarse: `scripts/versioned-assets-check.mjs` cubre `js/mechanic.js` desde
hace tiempo, aunque `CLAUDE.md` todavia dice que hay que recordarlo a mano.

### Solo local

Nada de esto esta en produccion hasta que Diego mergee el PR.


---

## 94. El importe que se le cobraba a la tarjeta lo decidia el telefono (04-sep-2026)

**Hallazgo 3 de la auditoria tecnica. Confirmado leyendo el codigo.**

`handleMechanicComplete` tenia UNA sola comprobacion sobre el importe:

```js
if (!skip_auto_charge && Number(final_charge_amount) > 0 && process.env.STRIPE_SECRET_KEY) {
  ...
  amount: Math.round(Number(final_charge_amount) * 100),
```

Ese numero lo calcula `calcChargeBreakdown()` en `js/mechanic.js` y viaja en el
cuerpo del pedido. Sin tope, sin contraste contra el servicio ni contra los
repuestos. Del otro lado hay una tarjeta guardada del cliente y un
`off_session: true, confirm: true`.

### Por que es urgente, y no es este hallazgo solo

Es el ultimo eslabon de una cadena de tres:

```
PIN de 4 digitos (10.000 combinaciones, bloqueo por IP pero no por cuenta)
  -> token de mecanico de 60 dias que rotar el PIN no invalida (punto 95)
    -> cobro de importe arbitrario a una tarjeta guardada  <- ESTE
```

### Lo que se hizo: un TECHO, no un recalculo estricto

`api/_charge-cap.js` (funcion pura, sin red) decide, y `handleMechanicComplete`
la llama ANTES de crear el PaymentIntent.

- Los repuestos se valoran leyendo `sell_price` de `parts_inventory`. El
  `unit_price` y el `total` que manda el telefono en `parts_charged.items` **no
  se leen**.
- El precio del servicio y el descuento salen de la fila de `bookings`, del
  mismo SELECT que ya hacia el guard de duplicados - cero pedidos extra.
- `esperado = max(0, service_price - discount_applied) + repuestos`
- Se rechaza si el importe supera `esperado * 1.2 + 50`, o el techo absoluto de
  $2000, o si no es un numero, o si es negativo.
- La propina tiene su propio techo ($500). No se cobra a la tarjeta, pero SI se
  escribe en la reserva y se suma en las pantallas de finanzas, asi que una
  propina absurda corrompe los reportes en vez de la tarjeta.
- Los dos techos se leen de `MECHANIC_MAX_CHARGE_AUD` y `MECHANIC_MAX_TIP_AUD`.
  **No hay que configurar nada**: sin la variable, valen los defaults.

### Por que un techo y no la igualdad exacta

Porque el modo de fallo del estricto es un mecanico parado en la calle que no
puede cerrar un trabajo que ya hizo. Una completacion se aparca en un outbox
offline en el telefono y se reenvia cuando vuelve la senal, a veces a la manana
siguiente (`api/_completion-guard.js`). Un recalculo exacto rechazaria esa
completacion porque el precio de un repuesto se movio de noche.

Un techo no puede hacer eso: solo rechaza importes que ningun trabajo real
alcanza, y ya deja acotado el dano maximo de la cadena. Mismo criterio que el
despliegue de AAL2: observar antes de bloquear.

**Y se loguea SIEMPRE**, aceptado o rechazado:

```
[mechanic-complete] amount {"booking_id":"...","received":149,"expected":149,"discrepancy":0,...}
```

Esos renglones son la evidencia para decidir despues si el estricto se puede
encender. Si a lo largo de semanas de trabajos reales `discrepancy` es 0 o un
negativo chico (los descuentos solo bajan), se puede. **Lo deciden los logs, no
una lectura del codigo.**

Si el lookup de repuestos no vuelve, `expected` queda en null y solo aplica el
techo absoluto. Una consulta que falla nunca bloquea una completacion.

### Lo que NO se toco, a proposito

- **La propina no se cobra a la tarjeta.** `paymentIntents.create` usa solo
  `final_charge_amount`; el `tip_amount` viaja aparte y se cobra por EFTPOS o
  en efectivo. Parece raro y es deliberado - no se unifico.
- **El descuento del mecanico** (`parts_charged.discount_amount`) sigue
  viniendo del telefono. Solo BAJA el cobro, asi que no es parte de la cadena
  de ataque; anotado, no arreglado.

### Verificado

19 tests. Se vieron fallar en dos mutaciones distintas, y se comprobo en las
dos que se rompio lo que se creia romper:

- Sacando la llamada a `chargeCapVerdict` de `api/auth.js`: **5 en rojo** (los
  del cableado). El de "los repuestos se valoran desde la base" quedo verde
  correctamente - esa consulta no se muto.
- Sacando los dos techos del modulo puro: **4 en rojo** (los del veredicto).

El test del cableado saca los comentarios antes de buscar, con `[^\n]*` y no
`.*$`, porque el archivo es CRLF y `.` no matchea un terminador de linea - las
dos trampas que este archivo ya tiene anotadas.

`npm run check` 0, `npm run lint` 0, `npm test` 0.

### Solo local

Nada de esto esta en produccion hasta que Diego mergee el PR.


---

## 95. Rotar el PIN del mecanico no cerraba ninguna sesion (04-sep-2026)

**Hallazgo 4 de la auditoria. El informe lo llama "medio"; es el eslabon del
medio de la cadena que hace criticos a los otros dos.**

```
api/auth.js:51        TOKEN_TTL_MS = 60 dias
api/auth.js:59        payload = { mid, exp }        <- nada mas
api/_security.js:395  verifyMechanicToken solo mira firma y expiracion
```

Nada en el token se referia al PIN. "Reset PIN" en Admin cambiaba lo que hace
falta para el PROXIMO login y dejaba trabajando, hasta 60 dias, todos los
tokens que ya estaban en un telefono. Un telefono perdido, vendido o robado
seguia entrando al panel del mecanico dos meses despues de que Diego "revocara"
el acceso.

### La cadena, que el informe no nombra junta

```
PIN de 4 digitos (10.000 combinaciones; bloqueo por IP, no por cuenta)
  -> token de 60 dias que rotar el PIN no mata          <- ESTE PUNTO
    -> cobro de importe arbitrario a una tarjeta guardada (punto 94)
```

### Lo que se hizo

- **`sv` (session version) en el token.** `makeToken(mid, sv)` lo firma;
  `verifyMechanicTokenPayload` lo devuelve; `authMechanic` lo compara contra
  `escalation_contacts.session_version`. Si no coincide, el token no vale.
- **`handleAdminSetMechanicPin` incrementa ese numero.** Ahi es donde "Reset
  PIN" pasa a revocar de verdad.
- **TTL de 60 dias a 14.** No mas corto a proposito: una completacion sin senal
  se aparca en el outbox del telefono y se reenvia con el token guardado al
  momento del vaciado. Una ventana muy corta deja un trabajo hecho fuera de
  cobertura sin poder cerrarse hasta que el mecanico vuelva a entrar. 14 dias
  cubre una ausencia normal y recorta la exposicion tres cuartas partes.
- **`verifyMechanicToken` no cambio de firma.** `api/send-push.js` la usa para
  saber QUIEN es y no tiene la fila del mecanico para comparar; sigue
  devolviendo el id. La comprobacion de version vive donde estan los dos datos.

### La columna no existe todavia, y el codigo lo aguanta

`scripts/*.sql` en este proyecto **se corren a mano** (hallazgo 5 de la
auditoria, real). Asi que la columna existe en el codigo antes que en la base.

- **Al leer:** `Number(candidate.session_version) || 0`. Sin columna da
  `undefined -> NaN -> 0`, y los tokens se emiten con `sv: 0`. Compara 0 con 0:
  **el check es inerte hasta que se corra la migracion, nunca equivocado.**
  Y desplegarlo NO desloguea a nadie, porque un token viejo sin `sv` tambien
  lee 0.
- **Al escribir:** PostgREST **rechaza un UPDATE que nombre una columna
  desconocida**, y eso no es teorico aca: es exactamente como el `pin: null`
  convertia cada Reset PIN en un 500 (arreglado el 03-sep). Por eso la columna
  se LEE primero y solo se escribe si la lectura demuestra que esta. El patron
  del reintento ya existia en `handleMechanicComplete` con `parts_cost_actual`.

### Y Admin dice la verdad sobre lo que hizo el boton

La respuesta trae `sessions_revoked`. Si es falso, el cartel del PIN nuevo
agrega: *"WARNING: their old sign-in is still valid for up to 14 days."*
Mostrar "PIN reseteado" mientras el telefono viejo sigue entrando es peor que
no decir nada.

### PENDIENTE DIEGO - hasta que corras esto, el arreglo NO esta activo

```sql
alter table public.escalation_contacts
  add column if not exists session_version integer not null default 0;
```

El archivo completo, con comentarios y una consulta de verificacion, esta en
`scripts/add-mechanic-session-version.sql`. Se puede correr dos veces sin
romper nada y no desloguea a nadie por si solo.

### Lo que NO se hizo, a proposito

**No se subio el minimo del PIN a 6 digitos.** `pin_hash` es de una via: un PIN
emitido antes del 01-sep no se puede detectar ni migrar, y subir el piso dejaria
a esos mecanicos afuera con un "PIN required" que no explica nada. Lo que retira
los de 4 digitos es que Diego los reemita desde Admin - y ahora reemitirlos
ademas cierra las sesiones viejas, que es lo que faltaba.

### Verificado

16 tests, vistos fallar en **cuatro mutaciones distintas**:

- El token deja de llevar `sv`: 1 rojo.
- `authMechanic` deja de comparar: 3 rojos.
- La rotacion del PIN deja de incrementar: 1 rojo.
- El TTL vuelve a 60 dias: 2 rojos.

El test del TTL **mide la expiracion de un token de verdad** (a los 13 dias
vale, a los 15 no) en vez de leer la constante: leer la constante es testear el
proxy, y el proxy ya dejo pasar un bug en este repo.

`makeToken` se **levanta del fuente y se ejecuta**, no se reimplementa - una
copia en el test seguiria en verde si la de verdad cambiara.

`npm run check` 0, `npm run lint` 0, `npm test` 0 (1440 tests).

### Solo local

Nada de esto esta en produccion hasta que Diego mergee el PR. Y aun mergeado,
la revocacion no funciona hasta que corra el SQL.


---

## 96. El segundo factor del admin era una pantalla, no una puerta (04-sep-2026)

**Hallazgo 1 de la auditoria, el critico. Confirmado leyendo el codigo:
`grep -ri "aal"` sobre todo el repo daba CERO resultados antes de este PR.**

```
api/auth.js  verifyAdminSession()  valida el token y el email de la lista.
                                   Nada mas. Ninguna de las 13 rutas admin
                                   mira el nivel de aseguramiento.
api/auth.js  el login devuelve `temp_token` - el access_token REAL de
             Supabase, AAL1 - en el cuerpo de la respuesta, ANTES del TOTP.
```

Quien tenga la contrasena lo lee de la pestana de red, cierra el cartel del
TOTP y usa ese token en las trece rutas. El segundo factor era una pantalla
que se podia cerrar.

### Lo que se entrego: OBSERVAR, no bloquear

`api/_admin-aal.js` calcula el veredicto y `verifyAdminSession` lo registra en
CADA pedido de admin. **No rechaza nada.** El bloqueo existe en el codigo y se
enciende con `ADMIN_REQUIRE_AAL2=1` en Vercel.

```
[admin-aal] {"verdict":"aal1-with-factor","would_reject":true,"enforcing":false,
             "aal":"aal1","amr":["password"],"has_verified_factor":true}
```

**El paso siguiente NO es otro PR: es encender esa variable.** Y no se enciende
hasta que esos renglones muestren, sobre dias de trabajo real de Diego, que
ninguna operacion legitima habria sido rechazada. Si aparece UN solo rechazo de
algo legitimo, se arregla la regla, no se avanza.

### Por que la regla es CONDICIONAL, y por que eso no es un detalle

```
tiene un factor TOTP verificado?  -> exigir AAL2
no tiene ninguno?                 -> dejar pasar AAL1  (si no, no puede enrolarse)
```

Hay **UN SOLO email de admin en todo el sistema**
(`ADMIN_ALLOWED_EMAILS = [ADMIN_TEST_EMAIL]`). Y `js/admin.js` completa el
login con un token AAL1 en dos lugares a proposito: cuando todavia no hay TOTP
enrolado (`setup_mfa`), y cuando el enrolamiento falla, con el comentario
literal *"don't lock the admin out"*.

"Rechazar AAL1" a secas deja al unico admin afuera del panel **sin poder ni
siquiera enrolarse**, y el arreglo queda del otro lado de la puerta que se
acaba de cerrar. El bypass real es aceptar AAL1 cuando SI hay factor. Cerrar el
otro caso no agrega seguridad y si agrega el apagon.

### Dos cosas que NO se asumieron, y que fallan ABIERTO

1. **Que el JWT de este proyecto traiga el claim `aal`.** Nadie decodifico
   todavia un token real de este proyecto. Si el claim no esta, el veredicto es
   `no-aal-claim` y **deja pasar aunque este en modo bloqueo**. Asumir lo
   contrario es como se llega al apagon por suposicion.
2. **Que la consulta de factores vuelva.** Si falla o se pasa de tiempo,
   `hasVerifiedFactor` queda en `null` y tampoco rechaza nunca.

El log del `[admin-aal]` incluye `aal` y `amr` crudos justamente para
RESPONDER esas dos preguntas con datos en vez de con una lectura. Cuando Diego
entre una vez, los renglones dicen si el claim existe, con que valores, y si el
token posterior al TOTP es AAL2 o el mismo AAL1.

### Un bug propio, encontrado corriendo la suite y no leyendo el codigo

La consulta de factores agrego un `fetch` delante de **cada** pedido de admin.
Sin abortarlo, un Supabase lento cuelga el panel entero - un apagon de otro
tipo, causado por el PR que existe para evitar apagones. Aparecio como un
timeout de 5s en `tests/unit/mechanic-pin-length.test.js`. Ahora lleva
`AbortSignal.timeout(4000)`, y agotar el tiempo deja el veredicto sin poder
rechazar. Y la consulta solo se paga cuando el token NO es ya AAL2.

### LO QUE FALTA, Y ES LA MITAD DEL ALCANCE: las politicas RLS

`js/admin.js` consulta Supabase **directo desde el navegador** con ese mismo
token. Las politicas dicen, todas:

```sql
exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
```

**Miran el rol y nunca el AAL.** Un token AAL1 pasa todas. O sea que cerrar
`verifyAdminSession` cierra las 13 rutas y deja abierto todo lo que el
navegador hace directo.

**NO se toco, y es deliberado.** Endurecer RLS con `auth.jwt()->>'aal' = 'aal2'`
sobre un token que todavia no se sabe si es AAL2 deja el panel muerto - y un
cambio de RLS **no tiene el rollback de un deploy de Vercel**. Se hace despues
de que los logs respondan la pregunta 2, no antes.

### Verificado

17 tests, vistos fallar en **cinco mutaciones**:

- La regla se vuelve absoluta ("rechazar AAL1" a secas): **3 rojos**, entre
  ellos los dos del apagon. Ese es el test que no se podia saltear.
- El claim ausente pasa a rechazar: 1 rojo.
- El bypass real deja de marcarse: 2 rojos.
- Se enciende por defecto: 1 rojo.
- Se saca el `AbortSignal.timeout`: 1 rojo.

`npm run check` 0, `npm run lint` 0, `npm test` 0 (1441 tests).

### Lo prueba Diego, no yo

**No tengo sus credenciales de admin y no puedo probar este flujo.** La
checklist para el preview esta en la descripcion del PR. Si algo de eso falla
EN EL PREVIEW, el problema es mio y no suyo: que no mergee.

### Solo local

Nada de esto esta en produccion hasta que Diego mergee el PR. Y aun mergeado,
no bloquea nada hasta que se encienda `ADMIN_REQUIRE_AAL2`.


---

## 97. El presupuesto tambien dejaba que el navegador eligiera el servicio (04-sep-2026)

**Bug vivo encontrado cerrando el punto 93. NO estaba en la auditoria del
profesor.** Decidido y pedido por Diego el 04-sep.

`handleRequestQuote` (`api/auth.js`) escribia en `bookings`:

```js
service_name: String(service_name).slice(0, 120),
service_price: Number(service_price) || 0,
```

Los dos del cuerpo del pedido, sin contrastar contra `services`. Y `service_id`
**llegaba en el body y no se leia nunca** - `js/app.js` ya lo mandaba.

Era la SEGUNDA via por la que un navegador elegia que va en
`bookings.service_name`. La primera (el webhook de Stripe, punto 93) costaba
una tarifa de visita; **esta era gratis**, porque un presupuesto no cobra nada.
El XSS quedo muerto igual con el arreglo del render, pero el dato sucio seguia
entrando a la base, y el precio inventado seguia llegando al panel.

### Por que no se arreglo en el punto 93

Porque no es una decision tecnica. Si un presupuesto solo puede nombrar un
servicio del catalogo, alguien que quiere algo que no esta en la lista deja de
poder pedirlo por ese formulario - y eso es perder un contacto. **Se le
pregunto a Diego y dijo que si.**

El costo real es chico: no surge de la UI de la app, donde el servicio siempre
sale del catalogo cargado del servidor (`window.appState.service.id`).

### Lo que se hizo

- El servicio se resuelve **exactamente como `handleGetPrice`**: por `id`,
  despues por `name`, y `400 'Unknown service'` si no aparece. Mismo codigo,
  mismo mensaje - no se invento un camino nuevo.
- `service_name` sale del catalogo. `service_price` se **recalcula** con
  `applySurcharge(svc.price, scheduled_date)`, que es literalmente lo que
  `js/app.js` hace antes de mostrarlo, asi que un pedido legitimo cae en el
  mismo numero.
- **El WhatsApp que le llega a Diego tambien** usa el nombre del catalogo.
  Antes la fila decia una cosa y el aviso otra.

### Verificado

9 tests que **ejecutan el handler** con un Supabase falso y miran la fila que
se escribio de verdad. Leer el fuente buscando `svc.name` habria pasado sobre
un handler que resuelve el servicio y despues escribe la copia del body igual.

Vistos fallar en dos mutaciones:

- Se restauran las dos escrituras del navegador: **5 rojos**.
- Se acepta un servicio inexistente en vez de rechazarlo: **1 rojo**.

El test del recargo de domingo esta puesto para que el arreglo no cambie
silenciosamente el numero que el cliente vio en pantalla.

`npm run check` 0, `npm run lint` 0, `npm test` 0 (1503 tests).

### Solo local

Nada de esto esta en produccion hasta que Diego mergee el PR.


---

## 98. Abrir el panel no genera ni un renglon de `[admin-aal]` (04-sep-2026)

**Encontrado mirando los logs de produccion despues de mergear el punto 96, no
leyendo el codigo.**

Diego mergeo los cuatro PR, cerro el panel, lo abrio, entro con su codigo, y
todo funciono. Los logs del deploy de produccion tenian **cero renglones
`[admin-aal]`**.

No es una falla del guard: es que `verifyAdminSession` corre **unicamente en
las catorce rutas `admin-*`**, y abrir el panel no llama a ninguna. La mayor
parte del tablero lee Supabase **directo desde el navegador**.

### Y eso vuelve a decir lo mismo que el punto 96 sobre RLS

Si abrir el panel entero no toca el servidor, entonces el AAL2 en
`verifyAdminSession` cubre menos de lo que parece. **Las politicas RLS son la
mitad que falta, y ahora hay evidencia de produccion, no un razonamiento.**

### Lo que se agrego

`logAdminTokenLevel()` en `handleAdmin`, en los tres puntos donde el login
entrega un token:

```
after-password    el token de signInWithPassword (el que viaja como temp_token)
after-totp        el que devuelve /factors/{id}/verify
after-enrolment   el que devuelve el enrolamiento
```

Registra `aal`, `amr` y **`has_aal_claim`** - este ultimo porque `aal: null` es
ambiguo (¿el claim no esta, o esta vacio?) y la pregunta (a) necesita una
respuesta sin ambiguedad.

Con un solo login de Diego quedan contestadas las dos preguntas que el punto 96
dejo abiertas a proposito:

- **(a)** ¿el JWT de este proyecto trae `aal`, y con que valores?
- **(b)** ¿`/factors/{id}/verify` devuelve un token DISTINTO del de la
  contrasena? Si devolviera el mismo AAL1, encender `ADMIN_REQUIRE_AAL2`
  rechazaria **el login correcto** - el apagon, alcanzado desde el otro lado.

**Solo registra.** No devuelve nada, no lanza nada, y ninguna decision depende
de el. Y no escribe el token en el log: un token en un log es una credencial en
un log - hay un test que lo vigila.

### Verificado

8 tests, vistos fallar en dos mutaciones: medir el token equivocado (1 rojo) y
escribir el token entero en el log (1 rojo).

`npm run check` 0, `npm run lint` 0, `npm test` 0 (1502 tests).


---

## 99. Una migracion nueva podia no llegar nunca a la consulta que la vigila (04-sep-2026)

**Hallazgo 5 de la auditoria tecnica: las migraciones se corren A MANO.**

Y no se pueden automatizar: los scripts corren con permisos de dueÃ±o de la
base, credenciales que ni la app ni Claude tienen ni deberian tener
(`docs/RUNBOOK-SQL.md` seccion 1). Asi que el riesgo real no es "fallo el
pipeline" - es que una migracion entre al repo y **nadie le avise a Diego que
existe**.

`docs/RUNBOOK-SQL.md` seccion 3 ya resuelve la mitad buena del problema: una
consulta que le pregunta a la base cual falta. Pero esa consulta vale lo que
vale su propia lista. **Un script agregado a `scripts/` sin su fila en la
consulta hace que la consulta conteste "todo OK" mientras falta una
migracion de verdad.**

### No es hipotetico: ya estaba pasando cuando se escribio esto

`scripts/add-mechanic-session-version.sql` entro esta misma manana con el punto
95 y la consulta no lo miraba. Diego lo corrio porque yo se lo pase por chat,
no porque el runbook se lo pidiera. La proxima vez que nadie lo pase por chat,
el codigo sale a produccion esperando una columna que no esta.

Y ya habia pasado antes: `enable-realtime-bookings.sql` y `lock-public-views.sql`
estuvieron **un mes** en el documento sin que la consulta preguntara por ellos
(ver la seccion 0 del runbook).

### Lo que se hizo

`scripts/migrations-check.mjs`, en `npm run check`. Compara los `.sql` de
`scripts/` contra los que la consulta de la seccion 3 **realmente nombra**, y
falla nombrando el archivo suelto.

- Mira **adentro de la consulta**, no en todo el documento. Que un script este
  mencionado en la prosa no es lo mismo que estar vigilado - esa distincion es
  justo la que dejo pasar las dos de arriba durante un mes.
- Si el ancla de la consulta desaparece, **falla ruidosamente** en vez de pasar
  sobre un texto vacio.
- Las exclusiones viven en `NOT_A_MIGRATION` con **una razon escrita cada una**,
  y hay un test que exige esa razon. Una exclusion sin motivo es como se
  esconde la proxima migracion de verdad. Hoy son tres: un backfill de datos,
  un SELECT de diagnostico y la reparacion puntual de una reserva del 05-ago.
- Y falla tambien si una exclusion nombra un archivo que ya no existe.

Se agrego la fila 47 al runbook (`escalation_contacts.session_version`), que
era la que faltaba.

### Lo que esto NO hace, y hay que decirlo

**No corre nada, y no sabe si la base esta al dia.** Sigue haciendo falta que
Diego pegue la consulta en Supabase. Lo unico que garantiza es que cuando la
pegue, la consulta pregunte por TODO lo que hay en el repo.

La otra mitad - que el codigo tolere una columna que todavia no existe - no se
puede chequear con un script: se resuelve caso por caso, como en el punto 95.

### Verificado

8 tests. **El check se corre como proceso y se juzga por su codigo de salida**,
no reimplementando su logica.

Vistos fallar en tres mutaciones:

- Se planta un `.sql` que el runbook no nombra: el check da exit 1 y **dice el
  nombre del archivo**. El test lo borra en un `finally`, porque un archivo
  plantado que sobrevive rompe `npm run check` para todos.
- Se saca la fila 47 del runbook: 3 rojos.
- Se saca el check de `npm run check`: 1 rojo - sin eso, nada de lo anterior
  protege nada.

`npm run check` 0, `npm run lint` 0, `npm test` 0.


---

## 100. La factura y las fotos de un reclamo estaban en una URL adivinable (04-sep-2026)

**Hallazgo 8 de la auditoria tecnica.**

```js
const ts = Date.now();
const path = `claims/${ts}/${label}_${idx}.jpg`;
// -> https://<proyecto>.supabase.co/storage/v1/object/public/job-photos/claims/1757000000000/invoice_0.jpg
```

Bucket **publico**, carpeta = **una marca de tiempo**, y solo cuatro nombres de
archivo posibles por reclamo (`photo_0`, `photo_1`, `photo_2`, `invoice_0`).

Sin login y sin token, cualquiera que supiera aproximadamente **cuando** una
persona mando un reclamo tenia su factura y las fotos de su bicicleta rota. Y
sin saber la hora, un dia entero son ~8,6e7 milisegundos: caro, no imposible.

### Dos cosas rotas, y solo una se arregla desde el codigo

1. **La ruta se podia adivinar** -> `crypto.randomUUID()` en vez de
   `Date.now()`. De ~8,6e7 posibilidades por dia a ~5e36. **Esto ya esta.**
2. **El bucket es publico** -> hay que crear uno privado, y los buckets se
   crean a mano en el panel de Supabase, igual que las migraciones.

### Como convive con un bucket que todavia no existe

`uploadB64` intenta `claim-evidence` (privado) y, si no esta, **cae a
`job-photos`** avisando en el log. Perder la evidencia que un cliente acaba de
mandar es peor que guardarla en un lugar demasiado legible - y con la carpeta
al azar ya no se encuentra sola.

Lo que se guarda en `claims.photo_urls` cambia segun donde cayo:

```
claim-evidence/claims/<uuid>/photo_0.jpg          privado -> se firma al leerlo
https://.../public/job-photos/claims/<uuid>/...   publico -> se devuelve tal cual
```

`handleAdminClaimsList` firma las primeras con `expiresIn: 3600` y **deja
intactas las segundas**, asi que ningun reclamo viejo se rompe. Si la firma
falla devuelve `null`, nunca la ruta cruda, y `js/admin.js` filtra los nulos en
vez de renderizar `src="null"`.

### PENDIENTE DIEGO - no es SQL, son 30 segundos

Supabase > **Storage** > **New bucket** > nombre `claim-evidence` >
**Public bucket: NO** > Create. No hace falta ninguna policy.

Los pasos completos y como comprobarlo estan en `docs/RUNBOOK-SQL.md`, seccion
0.b. Hasta que lo cree, el punto 1 igual protege: la ruta ya no se adivina.

### Lo que NO arregla

Las fotos de reclamos **ya subidas** siguen en el bucket publico, en su URL de
siempre, y ninguna migracion las mueve. Son de prueba; si hubiera una real, se
borra a mano desde Storage.

Y el bucket `job-photos` sigue publico para todo lo demas - fotos de trabajos,
de perfil de mecanicos, de resenas. Eso es un proyecto aparte: hacerlo privado
rompe cada `<img>` que hoy las muestra. **Anotado, no empezado.**

### Verificado, y un test decorativo cazado en el acto

13 tests. Tres mutaciones:

- Vuelve `Date.now()`: **2 rojos**.
- La lista devuelve las filas crudas sin firmar: **1 rojo**.
- Se prueba primero el bucket publico: **PASO EN VERDE**.

Esa tercera es la que importa. La asercion era
`indexOf('put(CLAIM_BUCKET)') < indexOf('put(CLAIM_FALLBACK_BUCKET)')`, y al
mutar, la llamada al bucket privado **desaparecia**: `indexOf` devolvia `-1`, y
`-1 < n` es verdadero. El test quedaba verde sobre exactamente el bug para el
que fue escrito. Corregido exigiendo que las dos existan antes de comparar el
orden; con el arreglo, la mutacion da 1 rojo.

Es la misma familia que las tres que este archivo ya tiene anotadas: **un
patron que no se encuentra no hace fallar al test que lo busca.**

Y una segunda trampa propia: un `await import('../../api/auth.js')` que no
aportaba nada (la funcion no se exporta, las aserciones eran sobre el fuente)
hacia fallar el archivo por timeout de 5s **solo con la suite entera
corriendo** - el mismo timeout que ya esta anotado en el punto 88.

`npm run check` 0, `npm run lint` 0, `npm test` 0 (1515 tests).

---

## 101. Las reglas de la base miran el rol y nunca el segundo factor (04-sep-2026)

**La otra mitad del hallazgo 1.** El punto 96 cerro las 14 rutas del servidor.
El punto 98 mostro, con logs de produccion, que **el panel casi no las usa**.

Todas las politicas RLS de admin dicen lo mismo:

```sql
exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
```

Miran el rol. **Nunca el AAL.** Un `access_token` conseguido solo con la
contrasena - el que `handleAdmin` entrega como `temp_token`, ANTES del TOTP -
pasa todas ellas y lee `bookings` entero desde el navegador.

### Por que recien ahora, y no en el punto 96

Porque hasta el 04-sep no habia forma honesta de saber si el token posterior al
TOTP era distinto del de la contrasena. Escribir una politica que exija `aal2`
sobre un token que no lo trae **mata el panel**, y un cambio de RLS **no tiene
el Instant Rollback que tiene un deploy**.

El punto 98 puso el instrumento; produccion contesto:

```
[admin-aal] {"verdict":"aal2","aal":"aal2","amr":["totp","password"]}
```

Con eso, y solo con eso, se puede escribir el SQL.

### Lo que se entrego: un runbook, NO un script

`docs/RUNBOOK-RLS-AAL2.md`. **Nada corre solo, y no hay que correrlo hoy.**

- **Agrega, no reescribe.** Una politica `as restrictive` por tabla, que se suma
  con Y a las que ya estan. No hay un solo `drop` de una politica ajena - y hay
  un test que lo exige. Reescribir obligaria a conocer el nombre exacto de cada
  politica **en produccion**, y el repo no es prueba de lo que produccion tiene.
  Borrar la equivocada deja a alguien afuera sin vuelta atras.
- **Falla abierto.** La condicion es
  `(auth.jwt() ->> 'aal') is distinct from 'aal1'`, no `= 'aal2'`. Si el claim
  algun dia no viniera, deja pasar en vez de cerrar todo. Es la misma decision
  que `api/_admin-aal.js`, escrita otra vez en la base.
- **Es condicional.** `or not exists (... auth.mfa_factors ... status = 'verified')`.
  Un admin sin autenticador entra igual, porque si no, no puede ni configurarlo.
  Es el apagon, y esta cubierto por un test.
- **Cuatro pasos, cada uno con su reversion ESCRITA ARRIBA** y su comprobacion.
  El paso 1 no toca ninguna politica: solo crea la funcion y la prueba sola.
  `bookings` va **ultima**, y con un dia de por medio: es la tabla que lee cada
  cliente para ver sus propias reservas, asi que un error ahi no rompe el panel,
  rompe la app.

### Por que NO esta en `scripts/`

Si estuviera, apareceria en la consulta del `RUNBOOK-SQL` como `>>> FALTA <<<`,
que es una invitacion a correrlo sin leer las precauciones. Es el unico SQL del
proyecto que no se puede correr asi. **Hay un test que lo mantiene fuera de
`scripts/`.**

### Verificado

17 tests sobre las propiedades de seguridad del propio documento - un documento
no se verifica solo. Vistos fallar en **seis mutaciones**:

- La regla pasa a `= 'aal2'` (cerraria todo si faltara el claim): 1 rojo.
- Una politica deja de ser `restrictive` - la falla que **se ve identica en el
  panel de Supabase y hace lo contrario**, porque una permisiva se suma con O y
  amplia el acceso en vez de limitarlo: 1 rojo.
- Se quita la condicion del enrolamiento, o sea el apagon: 1 rojo.
- `bookings` deja de ir ultima: 1 rojo.
- La reversion pasa a ir DESPUES del paso que deshace - una reversion que se lee
  cuando el panel ya esta oscuro: 1 rojo.
- Se agrega un `drop` de una politica ajena: 1 rojo.

`npm run check` 0, `npm run lint` 0, `npm test` 0.

### Lo que NO resuelve

- **`ADMIN_REQUIRE_AAL2` sigue apagado.** Es la mitad del servidor. Las dos son
  independientes; conviene no encenderlas el mismo dia.
- **`job-photos` sigue publico** para todo lo que no sea un reclamo (punto 100).

---

## 102. Los tres puntos que la auditoria daba por perdidos, y el ABN en 45 archivos (05-sep-2026)

**Dos cosas: se recuperaron los puntos 6, 16 y 18 de la auditoria de 20 puntos,
y el 6 resulto tener media falla viva.**

### Los tres puntos perdidos

`docs/AUDITORIA-PRELANZAMIENTO.md` los listaba como `NO RECUPERADO` desde que
se reconstruyo la lista: su enunciado solo habia existido en un chat. Estaban
en los transcripts (`~/.claude/projects/*.jsonl`).

```
6.  ABN y GST visibles, y en las facturas - ATENCION (contable / ATO)
16. Paginas de suburbio - HUECO
18. Prueba social - HUECO ("el unico bloqueante real del lanzamiento")
```

**Como se sabe que son de ESA lista y no de otra.** Los transcripts tienen
varias listas numeradas, y los primeros greps devolvieron puntos de tres listas
mezclados - "6. Cache-busting", "6. El pasaporte de la bici", "18. 4 tablas sin
historial de migracion". El ancla fue el **punto 15**: su texto recuperado
coincide **palabra por palabra** con lo que la tabla ya tenia escrito para el
15, y los cuatro comparten un formato (`N. **Titulo - ESTADO.**`) que ninguna
otra lista usa. Sin ese ancla habria documentado tres puntos equivocados con
total confianza.

### El punto 6: la factura estaba bien, el ABN no

La mitad fiscal ya estaba cerrada. `api/send-invoice.js` tiene las tres cosas
que la ATO exige para que un documento sea una factura y no un recibo:
`Tax Invoice`, el ABN, y el GST **desglosado en su propio renglon**.

Lo que no estaba: **el ABN escrito a mano en 45 archivos** - `api/auth.js`,
`api/send-email.js`, `api/send-invoice.js` (3 veces), `api/_email-i18n.js`,
`js/admin.js`, y cada `.html` del sitio - **sin nada que los atara**.

Es exactamente el bug del BAS de hace ocho dias (punto 92, PR #410), donde el
ABN estaba a mano tres veces en UN archivo, alguien lleno dos y se olvido de la
tercera, y el BAS salio diciendo `ABN: [Your ABN here]`. A 45 archivos el mismo
error es mas facil de cometer y mucho mas dificil de ver.

### `scripts/abn-check.mjs`, en `npm run check`

Comprueba dos cosas, y la segunda no la puede hacer una persona a ojo:

1. **Que todos los ABN del repo sean el mismo numero.**
2. **Que ese numero pase el checksum de la ATO.** Once digitos no alcanzan: el
   ultimo es digito verificador, asi que un error de tipeo o dos digitos
   permutados producen un numero que **parece perfectamente valido en una
   factura** y no lo es.

El ABN actual (`87 654 025 287`) **pasa el checksum**. Eso no prueba que sea el
de Diego - prueba que no es un numero inventado, que era el caso peor.

**Dos exclusiones, las dos con la razon escrita en el archivo:**

- `.claude/` - la skill `trademark-status` cita los ABN de OTRAS empresas
  encontradas en IP Australia ("THE BIKE DOC" en Melbourne, un "DR BIKE" en
  VIC 3083). **El check los encontro en su primera corrida**, que es buena
  evidencia de que el patron funciona.
- `tests/` - el propio test planta un ABN distinto a proposito para probar que
  el check lo agarra. Un test nunca es un documento fiscal.

### Los otros dos siguen abiertos, y ninguno es codigo

- **16 (paginas de suburbio):** son **60** (20 suburbios x 3 idiomas) y de 198
  lineas solo difieren 12 - **94% identicas**, que es literalmente la
  definicion de *doorway page* de Google. No se arregla escribiendo mas texto:
  necesita datos locales reales, y eso Diego solo lo puede dar desde Sydney
  (nov-2026).
- **18 (prueba social):** 0 resenas, 0 perfiles de mecanico, 0 fotos de
  trabajos. El sistema de captacion **ya esta armado y con guards** (puntos
  89-91); lo que falta son clientes.

**El marcador queda en 18 de 20**, con los dos abiertos identificados en vez de
desconocidos.

### Verificado

14 tests. El check se corre **como proceso y se juzga por su codigo de salida**.
Visto fallar en cinco mutaciones:

- Se quita el checksum de la ATO: 2 rojos.
- Deja de fallar cuando no encuentra ningun ABN - el modo en que un guard se
  vuelve decorativo, tildando verde sobre cero comprobaciones: 1 rojo.
- Deja de detectar un segundo ABN distinto: 1 rojo.
- Se saca de `npm run check`: 1 rojo.
- **Se le cambia un digito al ABN de `api/send-invoice.js`** - o sea el
  escenario del BAS, sobre la factura del cliente: el check lo agarra, exit 1.

**Una trampa propia:** el test importa `isValidAbn` del script, y el script
hacia su trabajo a nivel de modulo - importarlo recorria el arbol y llamaba a
`process.exit(1)`. El archivo de test **moria en el import, antes de la primera
asercion**: `Tests no tests`. El cuerpo ejecutable quedo detras de una
comprobacion de "soy el comando".

`npm run check` 0, `npm run lint` 0, `npm test` 0 (1563 tests).

## 103. Cuatro tablas con datos de clientes estaban fuera del guard de RLS (05-sep-2026)

**Continuacion del hallazgo de la auditoria del 23-ago sobre las cuatro tablas
sin historial de migracion.** Diego pidio revisarlas.

### Lo que ya estaba bien

`docs/RUNBOOK-SQL.md` 3.1 ya las tenia documentadas, y Diego habia corrido la
consulta el 23-ago: `callout_zones`, `waitlist`, `claims` y `notification_log`
las cuatro con **RLS ON**, y el 0-policies de `claims` y `notification_log` es
correcto a proposito (RLS activo sin policy niega a todos, y el service key
saltea RLS).

**Verificado otra vez hoy contra produccion**, con la anon key, lectura y
escritura:

```
waitlist          READ 200 rows=0   WRITE 401 DENIED by RLS
claims            READ 200 rows=0   WRITE 401 DENIED by RLS
notification_log  READ 200 rows=0   WRITE 401 DENIED by RLS
```

### Lo que NO estaba bien

**Esa respuesta era de una sola vez.** `scripts/rls-check.mjs` - el unico
chequeo que le pregunta a produccion en vez de al repo - cubria 17 tablas y
**solo una de las cuatro** (`callout_zones`, y como publica por diseño).

Las tres que guardan nombre, email, telefono, el texto de un reclamo y las URL
de las fotos y la factura estuvieron **trece dias fuera del guard**. Nada
impedia que alguien les agregara una policy permisiva y nadie se enterara -
que es exactamente lo que paso con `availability` en agosto.

### Y apareció una quinta

Al escribir el test, `checkout_attempts` **tampoco estaba clasificada**. No
figuraba en el hallazgo de agosto porque SI tiene script de migracion, pero
estaba fuera del guard igual. Comprobada: `READ 200 rows=0`,
`WRITE 401 DENIED`. `js/app.js` la escribe desde el navegador, pero **solo con
sesion iniciada** (decision de Diego, 28-jul), asi que el rechazo anonimo es lo
correcto y no un flujo roto.

`rls-check` pasa de 17 a **21 tablas**.

### El test que importa no es el que se esperaria

No es "las tres estan en la lista" - eso es la respuesta de hoy, escrita otra
vez. Es: **toda tabla que el navegador toque tiene que estar clasificada** como
cerrada o como publica-por-diseño. Una tabla nueva que nadie clasifique es
literalmente como aparecieron estas cinco.

**Encontro `checkout_attempts` en su primera corrida.** Igual que `abn-check`
encontro los ABN de terceros en la suya - una señal razonable de que el patron
mira donde dice mirar.

### Lo que este guard NO hace, y hay que decirlo

**`npm run rls:check` no corre en CI.** El workflow corre `lint`, `check` y
`test`, y nada mas. Pega contra produccion, asi que meterlo trae un modo de
fallo nuevo: **Supabase caido bloquearia PRs que no tienen nada que ver**.

Es una decision operativa de Diego, no tecnica, y por eso **no la tome**. Hay
un test que afirma que hoy NO esta en CI: si alguien lo agrega, ese test falla
y obliga a que sea deliberado.

### Verificado

10 tests. Vistos fallar en cuatro mutaciones:

- Se saca `claims` de la lista: 1 rojo.
- `claims` queda clasificada como cerrada Y como publica a la vez: 1 rojo.
- Se borra el aviso de "no agregarles policies": 1 rojo. Ese aviso importa
  porque el 0-policies **parece un olvido** y "arreglarlo" abriria acceso que
  hoy esta correctamente denegado.
- Aparece una tabla nueva sin clasificar: 1 rojo, **y nombra el archivo**.

`npm run check` 0, `npm run lint` 0, `npm test` 0 (1573 tests),
`npm run rls:check` 0 contra produccion.
