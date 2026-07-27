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

### 1.1 Confirmar `CRON_SECRET` en Vercel

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
