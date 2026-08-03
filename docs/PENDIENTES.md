# PENDIENTES — Dr. Bike Sydney

> Lista maestra de lo que falta. Vive en el repo a proposito: sobrevive a que se
> cierre un chat, se pierda el historial o se reinstale Claude.
>
> Ultima verificacion contra el sistema real: **2026-08-01** (seccion 12: SPA
> movil, mechanic y admin en Chromium real; resto del documento, 2026-07-27).
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

**Estado 2026-08-01: 4 de las 5 superficies ya tienen lista escrita.** `landing`
esta en la seccion 8; `SPA movil`, `mechanic` y `admin` en la seccion 12. **Falta
solo `track.html`**, que no entro en ninguna de las dos rondas. Este punto queda
abierto hasta que se audite esa quinta.

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

### 10.1 El guardrail de i18n tiene un agujero — ABIERTO

`scripts/i18n-check.mjs` **borra los bloques `<script>`** antes de buscar texto
en las paginas HTML. `landing.html` construye media interfaz dentro de scripts
inline (el panel de cuenta, el modal de reserva viejo, el chat, el bot de FAQ),
asi que **nada de eso esta cubierto por el chequeo**. Por eso "UPCOMING (1)" y
"Pending" llegaron a produccion en ingles sobre una pagina en español, con el
check en verde.

No es facil de arreglar bien: un parser ingenuo de strings dentro de JS levanta
un monton de falsos positivos (selectores, claves, nombres de campos). Una
opcion realista es extraer las cadenas que estan dentro de comillas y que
tengan letras y espacios, con una lista de exclusiones. La otra, mas limpia, es
sacar esa UI de los scripts inline. Mientras tanto: **cualquier texto que se
escriba dentro de un `<script>` en landing.html hay que traducirlo a mano.**

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

### 10.4 Las maquetas de `docs/mockups/` son publicas — ABIERTO

`docs/mockups/payments.html` y `notifications.html` son archivos estaticos en
el repo, asi que Vercel los sirve en `drbikesydney.com.au/docs/mockups/...`.
No hay nada sensible, pero es una maqueta con estados falsos ("Coming soon")
accesible por cualquiera que adivine la URL. Opciones: moverlas fuera del
directorio publicado, o agregarlas a las exclusiones de `vercel.json`.

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

### 10.2 `confirm()` y `prompt()` del navegador — ABIERTO

Cancelar y reprogramar una reserva desde el panel usan los cuadros de dialogo
del sistema operativo (`confirm()`, y `prompt()` pidiendo la fecha escrita a
mano en formato `YYYY-MM-DD` y despues la hora). Es lo menos profesional que
queda en el panel, y ademas se puede escribir cualquier cosa.

Reemplazarlos pide un selector de fecha/hora de verdad, con los horarios libres
que ya devuelve `/api/auth?role=get-availability` - o sea, lo mismo que el paso
2 del wizard. Es una feature, no un ajuste de estilo: rama aparte.

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

**CERRADOS: 14 de 21** (PRs #137, #140, #142, #145, #147, #149, #160, #161).

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

- **12.3** — el cobro huerfano. El codigo lo puede hacer cualquier sesion; el
  evento `payment_intent.succeeded` **lo tiene que dar de alta Diego en el panel
  de Stripe**, y sin eso el arreglo no sirve.
- **12.14 completo** — reemplazar los 335 hex fuera de token necesita elegir
  que paleta gana. La doc ya no produce el error; el codigo sigue teniendolo.
- **12.11** — la puerta del admin. El arreglo de verdad valida el token contra
  el servidor antes de renderizar: cambia el flujo de auth, conviene hacerlo con
  Diego mirando.

**ABIERTOS, mecanicos, sin ninguna decision de por medio** — son los siguientes
que deberia tomar una sesion nueva:

- **12.16, lo que queda** — el PR #160 subio **10 de los 18** targets bajo 44px.
  Siguen abiertos los otros 8, los **5 desbordes horizontales** a 390px (uno
  llega a 754px de borde derecho) y las 11 tablas del admin sin contenedor de
  scroll propio.
- **12.18** `confirm()`/`alert()` nativos fuera del panel de la landing
- **`track.html`** — la quinta superficie, nunca auditada. Es lo unico que falta
  para cerrar el punto **3.1**.

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

Aclaracion para no perseguir un fantasma: `css/mechanic.css:2-14` y
`css/admin.css:2-10` tambien redefinen tokens, pero **solo dentro de
`[data-theme='dark']`**. Eso es tematizado correcto, no deriva. La unica
redefinicion global en conflicto es la de `css/landing.css:2`.

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

> **PARCIAL 2026-08-03 (PR #160, mergeado).** Diez targets subieron a 44px:
> `.footer-link`, `.footer-social`, los contactos del footer, el boton de auth
> movil, los tres `.btn-learn-more`, y en mechanic el toggle de tema y
> `#status-btn`. **Siguen abiertos** los otros 8 de los 18, los 5 desbordes
> horizontales y las 11 tablas del admin sin scroll propio. El detalle de abajo
> es la medicion original.

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
