# PENDIENTES — Dr. Bike Sydney

> Lista maestra de lo que falta. Vive en el repo a proposito: sobrevive a que se
> cierre un chat, se pierda el historial o se reinstale Claude.
>
> Ultima verificacion contra el sistema real: **2026-07-27**.
> Regla: si una linea de aqui contradice al codigo o a la base de datos, gana el
> sistema. Corregir esta linea en el momento y anotar por que.

## Salud del proyecto (verificado 2026-07-27)

| Chequeo | Resultado |
|---|---|
| `npm run check` | Verde - 35 archivos JS, i18n 940 claves es/zh, 661 strings en 5 superficies |
| `npx vitest run` | 121 tests, 15 archivos, 0 fallos |
| `TODO`/`FIXME`/`HACK` en el codigo | 0 |
| PRs abiertas | 0 |
| Ramas locales | Solo `main` (64 borradas el 27-jul, todas mergeadas) |

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

### 1.2 Backups de Supabase (TASK-003)

Nunca se confirmo que esten activos ni se probo una restauracion. El negocio
cobra dinero real. Verificar: Supabase -> Database -> Backups, y hacer una
restauracion de prueba a un proyecto scratch contando filas.

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

### 3.1 No existe lista de hallazgos de diseno — hay que auditar de nuevo

Durante semanas se repitio "quedan ~14 de 36 hallazgos de diseno pendientes".
El 27-jul se verifico: **esa lista no esta en ningun lado del repo**. Los 15
checkboxes sin marcar de `docs/ROADMAP.md` son puertas de negocio y marketing
(Google Business Profile, plan de contenido, metricas de funnel, campana de
primavera), no hallazgos de diseno.

Para avanzar en diseno hace falta una auditoria nueva de las 5 superficies
(SPA movil, landing, mechanic, admin, track) escrita en un documento. Sin eso se
trabaja a ciegas.

### 3.2 Dieta de `landing.html`

255 KB de HTML, ~2600 lineas, con estilos y scripts inline. `docs/PLAN-DISENO.md`
lo marca como candidato #1. Presupuesto del plan: <= 1.5 MB por pagina,
LCP < 2.5s en movil, Lighthouse >= 90.

### 3.3 Handlers inline que quedan (bloquean sacar `unsafe-inline` del CSP)

Los `onclick` ya se eliminaron todos (TASK-023). Faltan
`onfocus`/`onblur`/`oninput`/`onchange`/`onkeydown`, contados el 27-jul:

| Archivo | Cantidad |
|---|---|
| `landing.html` | 33 |
| `admin.html` | 12 |
| `js/admin.js` | 6 |
| `js/mechanic.js` | 6 |
| `mechanic.html` | 2 |
| **Total** | **59** |

Es trabajo de diseno y de seguridad a la vez: recien despues de esto se puede
sacar `'unsafe-inline'` de `script-src` y cerrar el punto #9 del roadmap viejo.

### 3.4 Lighthouse formal nunca se corrio

Todo lo que hay son estimaciones. Necesita Chrome DevTools -> Lighthouse sobre
la URL de produccion, en movil y desktop. Lo tiene que correr Diego o hay que
montarlo en CI.

---

## 4. Traducciones (el mecanismo ya esta decidido)

### 4.1 `business.html` (79 strings) y `bike-check.html` (63)

Siguen 100% en ingles. **Mecanismo decidido, no rediscutir:** NO convertirlas en
templates como el generador de suburbios. Se deja el archivo ingles como fuente y
se escribe un script que emita `/es/<page>.html` y `/zh/<page>.html` reemplazando
frases enteras desde un diccionario por pagina (mismo enfoque que
`api/_email-i18n.js`: son bloques de prosa entre tags, el swap por fragmento es
seguro), y que inyecte `hreflang`, `<html lang>` y las entradas del sitemap.
Sumar las URLs nuevas a la lista de rewrites de `vercel.json`.

~284 traducciones entre las dos paginas.

### 4.2 Los 5 posts del blog

Tambien solo en ingles. Es un trabajo de contenido mucho mas grande: PR aparte.

---

## 5. Deuda tecnica

| # | Que | Detalle |
|---|---|---|
| 5.1 | Paginacion y filtros de fecha (TASK-030) | Admin bookings, mechanic jobs, client bookings. Hoy andan porque hay pocas filas; con 5.000 reservas se caen. Objetivo: < 500ms p95 |
| 5.2 | Prueba de carga (TASK-043) | ~500 concurrentes sobre booking + availability + GPS. **Ojo: no se puede correr contra produccion sin plan** - crearia reservas y cobros reales. Necesita entorno de staging o datos de prueba aislados |
| 5.3 | Scroll-to-top del wizard | Se agrego en `js/router.js` el 22-jul y quedo anotado como "sin confirmar en navegador real" |
| 5.4 | Secretos sin usar en Vercel | `MAPBOX_TOKEN`, `GOOGLE_PLACES_API_KEY`, `POSTHOG_KEY` - ninguno referenciado en el codigo. Borrarlos desde el dashboard |

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

## 8. Documentos a re-sincronizar

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

### 8.8 Falta revisar SPA movil, mechanic.html y admin.html

Diego reviso solo `landing.html`. Las otras tres superficies no se miraron
todavia. Esto conecta con el punto 3.1: **no existe lista de hallazgos de
diseno**, y esta seccion 8 es el primer pedazo real de esa auditoria pendiente.

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

### 9.7 Lo que quedo abierto despues del lote (28-jul)

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
