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
- **12.14 completo** — ~~necesita elegir que paleta gana~~ **DECIDIDO 2026-08-03:
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
  3. Los hex escritos a mano pasan a `var(--token)`, **solo en las 5
     superficies de app** (decision de Diego 2026-08-09; emails y paginas de
     suburbio, PR aparte). Partido en dos: **PR A HECHO 2026-08-09** - los 482
     que no cambian un pixel, en las 3 superficies de cliente. **PR B abierto** -
     los que no coinciden con ningun token, mas los 743 de `admin`/`mechanic`,
     donde el modo oscuro hace que `#fff` y `var(--white)` sean cosas distintas.
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
  `bookings`, y devolverle a cada uno.
- El mensaje de `finalizeBooking()` era `throw new Error('Please sign in...')`
  y **no estaba traducido**: el chequeo de i18n ignora los `throw new Error(...)`
  a proposito, asi que una clienta con el telefono en español lo veia en ingles.
  Ya esta en el diccionario, pero el hueco del chequeo sigue ahi.

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

### 14.6 Reconstruir la reserva de Thais para el historial fiscal

Diego la necesita en el Excel: es la primera clienta real.

**No se puede insertar hoy**: `user_id` es NOT NULL y ella no tiene cuenta.
Atribuirsela al usuario de Diego seria falsear el registro. O sale primero el
`DROP NOT NULL` de 14.5, o no sale.

**Y ojo con el importe: se le devolvio.** A efectos fiscales el neto es $0 -
$0.64 de comision de Stripe, que no se devuelve. Cargarla como una venta
completada inflaria la facturacion del ano. El registro honesto es una reserva
con estado `cancelled` y el pago marcado como reembolsado.

Datos para reconstruirla, de Stripe:
`pi_3U0vVzPPGSm5cT7J0SRAoVUW`, 05-ago 13:29, $20.00 AUD, Apple Pay / Visa
4481, `thaixguimaraes@gmail.com`, `Customer: Guest`. El servicio lo confirmo Diego
despues de hablar con ella por WhatsApp: **Tyre and Tube Installed**. No quedo
registrado en ningun sistema, que es exactamente el problema.

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
