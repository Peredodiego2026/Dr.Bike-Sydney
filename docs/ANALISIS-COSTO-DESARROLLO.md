# ANÁLISIS DE COSTO DE DESARROLLO - Dr. Bike Sydney

Versión 2 - 2026-10-01 (v1: 2026-09-24)
Pregunta: cuánto costaría mandar a construir esta aplicación a una empresa de desarrollo,
incluyendo la tienda que está en diseño.
Método: inventario medido sobre el repositorio + estimación por módulo + tarifas de mercado.

> Las cifras de código son medidas reales sobre el repo en el merge de `55e3d6c` (main al
> 1-oct-2026). Las tarifas son rangos de mercado de la industria, no cotizaciones recibidas.
> **La tienda no existe en el código todavía** - su estimación es alcance a futuro, marcado
> como tal en la sección 5.

---

## 1. Resumen ejecutivo

### 1.1 La app tal como está hoy (sin tienda)

| Escenario | Esfuerzo | Agencia AU premium | Agencia AU mediana | Nearshore | Offshore |
|---|---|---|---|---|---|
| **A. Clon 1:1 de lo que existe** | 480-665 días-persona | **$768k - $1,330k** | $456k - $931k | $211k - $505k | $115k - $266k |
| **B. Alcance comercial equivalente** | 290-395 días-persona | $464k - $790k | $276k - $553k | $128k - $300k | $70k - $158k |
| **C. Solo MVP** | 150-210 días-persona | $240k - $420k | $143k - $294k | $66k - $160k | $36k - $84k |

### 1.2 Con la tienda incluida (nivel 2, el realista)

| Escenario | Esfuerzo | Agencia AU premium | Agencia AU mediana | Nearshore | Offshore |
|---|---|---|---|---|---|
| **A + tienda** | 555-770 días-persona | **$888k - $1,540k** | $527k - $1,078k | $244k - $585k | $133k - $308k |
| **B + tienda** | 365-500 días-persona | $584k - $1,000k | $347k - $700k | $161k - $380k | $88k - $200k |

Todo en AUD, excluye GST, excluye infraestructura y mantenimiento.

**Número para citar:** la app tal como está hoy la cotizaría una agencia de Sydney de gama
media entre **$456,000 y $931,000 AUD**. Con la tienda, entre **$527,000 y $1,078,000**.
Una agencia premium cruza el millón en ambos casos.

**Lo que cambió desde el 24 de septiembre:** +2,793 líneas de producción, +1,856 de tests,
+85 casos de test, una página nueva en el panel admin (Photos), bucket privado para fotos
de trabajos, reserva como invitado de punta a punta, y 8 handlers nuevos en la API. El
presupuesto subió entre $14k y $35k en una semana (ver sección 7).

---

## 2. Inventario medido (qué hay que construir)

### 2.1 Volumen de código

| Capa | Archivos | Líneas | vs. 24-sep |
|---|---|---|---|
| Frontend JS (`js/`) | 20 | 27,568 | +1,058 |
| Backend / API (`api/`) | 34 | 15,109 | +951 |
| CSS (`css/`) | 7 | 8,925 | +677 |
| HTML de aplicación (raíz) | 17 | 9,988 | +70 |
| Service worker + edge middleware | 2 | 424 | +37 |
| **Subtotal producción** | **80** | **62,014** | **+2,793** |
| Tests automatizados (`tests/`) | 129 | 18,903 | +1,856 |
| Scripts de build / QA (`scripts/*.mjs`) | 28 | 6,466 | - |
| Migraciones SQL (`scripts/*.sql`) | 45 | 1,944 | - |
| Páginas SEO localizadas (`es/`, `zh/`, `blog/`) | 29 | ~5,200 | - |
| Documentación (`docs/`, raíz) | 171 | 56,986 | +454 |
| **Total del repositorio** | ~510 | ~151,500 | +5,500 |

62,014 líneas de código de producción es del orden de una aplicación de negocio mediana
completa, no de un sitio web.

### 2.2 Superficies de la aplicación

**1. SPA móvil (`index.html` + `js/app.js`, 6,783 líneas)**
11 pantallas con router propio de hash: home, login, book-service (wizard multi-paso),
payment, my-bookings, my-bikes, profile, tracking (mapa en vivo), review, quote-sent,
service-summary. Incluye reserva como invitado sin cuenta.

**2. Landing de escritorio (`landing.html` + `js/landing-inline.js`, 3,913 líneas)**
Marketing con 6 secciones (about, fleet, mechanics, memberships, reviews, faq), modal de
reserva que reutiliza el wizard de la SPA, captura UTM, tracking de CTA, consentimiento de
cookies, sección de reseñas de Google con fotos.

**3. App del mecánico (`mechanic.html` + `js/mechanic.js`, 3,823 líneas)**
PWA instalable: login por PIN, lista de trabajos (hoy / próximos / hechos),
aceptar-rechazar, cambio de estado, marcar llegada, GPS en vivo, cronómetro de servicio,
checklist, inventario de furgoneta, buscador de repuestos, **cola offline con
sincronización**, flujo de completado con foto a bucket privado.

**4. Panel de administración (`admin.html` + `js/admin.js`, 11,107 líneas)**
**19 páginas**: dashboard, bookings, calendar, clients, vans, zones, services, memberships,
finance, expenses, analytics, inventory, coupons, claims, contacts, reminders, orphans,
settings, mechanic-profile, **photos** (nueva). Es, por sí solo, un producto SaaS de
gestión de taller.

**5. Tracking público (`track.html`)** - enlace compartible con token, sin login.

**6. Superficie de contenido/SEO** - 48 páginas HTML: 5 de suburbio, 5 posts de blog,
24 localizadas es/zh, términos, privacidad, reclamos, bike-check, business, cycling-map,
applepay. `sitemap.xml` de 23KB, 36 redirects y 28 rewrites en `vercel.json`.

### 2.3 Backend

- 34 archivos en `api/`, 15,109 líneas.
- `api/auth.js` solo: **6,192 líneas, 71 handlers** (auth admin y mecánico, reservas,
  disponibilidad, cobertura por zona, geocodificación, mensajería cliente-mecánico,
  reseñas con fotos, reclamos, referidos, waitlist, calendario de Google, tarjetas
  guardadas, consentimiento de fotos).
- Módulos de soporte: seguridad (sanitización + rate limit, 490 líneas), validación, cap de
  cobros, guard de completado, hold de slot, ETA, cobertura, auditoría de huérfanos,
  privacidad (export/borrado), backup/restore, i18n de email (395) y de SMS.
- `api/stripe-webhook.js` (762), `api/send-invoice.js` (800, genera PDF),
  `api/send-cron.js` (1,292 líneas, **once trabajos programados**: cumpleaños,
  reengagement, carrito abandonado, checkout abandonado, recordatorio de servicio, aviso
  anticipado, no-show, upsell, reintento de completado, backup y auditoría de pagos
  huérfanos), `api/send-email.js` (495).

### 2.4 Base de datos

22 tablas en uso: `profiles`, `bookings`, `services`, `bikes`, `van_zones`, `callout_zones`,
`availability`, `parts_inventory`, `job_messages`, `mechanic_locations`, `discount_codes`,
`gift_cards`, `claims`, `expenses`, `escalation_contacts`, `notification_log`,
`public_reviews`, `stripe_events`, `checkout_attempts`, `geo_cache`, `waitlist`,
`newsletter_subscribers`.
45 migraciones SQL versionadas con políticas RLS, índices de rendimiento y endurecimiento
de seguridad. Storage con bucket privado para fotos de trabajos.

### 2.5 Integraciones externas (10)

Stripe (pagos en vivo, PaymentIntent, suscripciones, webhooks, Apple Pay y Google Pay
verificados), Supabase (postgres + auth + storage privado + realtime), Google OAuth, Twilio
(SMS y WhatsApp), Resend (email con DNS verificado), Anthropic Claude (chatbot y
diagnóstico de bici), Leaflet (mapas), Google Analytics 4, Sentry, Web Push (VAPID).
22 variables de entorno.

### 2.6 Calidad e infraestructura de entrega

- **1,577 casos de test** en 129 archivos (Vitest unitario + Playwright e2e).
- **14 gates propios** en `npm run check`: i18n, precios de planes, iconos, atributos HTML,
  colores, tema oscuro, assets versionados, TDZ, privacidad, accesibilidad, consentimiento,
  migraciones, ABN.
- CI con `quality-gate` obligatorio, branch protection con `enforce_admins`, husky +
  lint-staged, eslint con plugin de seguridad, prettier.
- PWA: service worker, 3 manifests (cliente, admin, mecánico), iconos con variantes maskable.
- 3 idiomas completos (en/es/zh): ~1,202 strings por diccionario, más emails y SMS
  localizados, más 24 páginas estáticas generadas por idioma.

---

## 3. Estimación de esfuerzo por módulo (escenario A: clon 1:1)

| # | Módulo | Días (min) | Días (max) |
|---|---|---|---|
| A | Discovery, UX y sistema de diseño (4 superficies, ~50 vistas) | 43 | 60 |
| B | Frontend SPA móvil (11 pantallas + wizard + invitado) | 47 | 63 |
| C | Frontend landing de escritorio + SEO on-page | 21 | 29 |
| D | PWA del mecánico (offline, GPS, cronómetro, inventario, fotos) | 32 | 42 |
| E | Panel de administración (19 páginas) | 63 | 84 |
| F | Backend y API (71+ handlers, crons, facturación PDF, storage privado) | 69 | 90 |
| G | Base de datos, RLS, migraciones, índices | 15 | 22 |
| H | Integraciones externas (10 proveedores) | 20 | 30 |
| I | i18n en/es/zh (ingeniería + tooling + coordinación) | 15 | 22 |
| J | Superficie de contenido y SEO (48 páginas, generadores) | 10 | 15 |
| K | QA y automatización (1,577 casos + 14 gates + CI) | 38 | 53 |
| L | Cumplimiento legal y privacidad (términos, privacidad, GDPR/APP) | 12 | 18 |
| M | PWA, rendimiento y accesibilidad | 12 | 18 |
| N | DevOps, despliegue, monitoreo | 8 | 12 |
| | **Subtotal técnico** | **405** | **558** |
| O | Gestión de proyecto y análisis de negocio (~18%) | 73 | 100 |
| | **TOTAL** | **478** | **658** |

**480-665 días-persona = 96-133 semanas-persona = 2.3 a 3.2 años-persona.**

Verificación cruzada por líneas: 89,300 líneas (producción + tests + scripts + SQL) entre
480-665 días da 134-186 líneas por día. Alto pero coherente con este stack (HTML y CSS a
mano pesan muchas líneas por hora, los diccionarios i18n son mecánicos, las páginas
localizadas se generan por script). A un ritmo conservador de 80-120 líneas/día el esfuerzo
subiría a **745-1,115 días** y el costo al doble de la tabla del resumen. Ese es el
escenario pesimista, no el central.

### Escenario B: alcance comercial equivalente (290-395 días)

Lo que una agencia entrega realmente por el precio de mercado. Se quitan:
- 1,577 tests -> cobertura típica de agencia (~150-300 tests): -27 días
- 14 gates propios de CI -> lint + prettier estándar: -18 días
- 3 idiomas completos -> solo inglés, i18n preparado pero vacío: -20 días
- 48 páginas SEO -> 1 landing + 3 legales: -12 días
- 45 migraciones versionadas -> esquema entregado una vez: -10 días
- 57,000 líneas de documentación -> handover básico: -15 días
- Panel admin de 19 páginas -> 10 páginas núcleo: -22 días

### Escenario C: MVP (150-210 días)

Reserva móvil + pago Stripe + app del mecánico + admin con bookings/clients/services, un
idioma, sin membresías, sin chatbot IA, sin facturación PDF, sin crons de marketing, sin
gift cards ni referidos, sin tracking público, sin fotos.

---

## 4. Tarifas de mercado (AUD, 2026)

| Proveedor | Tarifa/hora | Tarifa/día (8h) | Comentario |
|---|---|---|---|
| Agencia AU premium (Sydney/Melbourne, full service) | $200-250 | $1,600-2,000 | Equipo dedicado, PM, diseñador, QA, garantía |
| Agencia AU mediana / boutique | $120-175 | $950-1,400 | Lo típico para una PyME como Dr. Bike |
| Freelance senior AU | $90-140 | $700-1,100 | Sin PM ni QA, riesgo de bus factor 1 |
| Nearshore (LatAm, Europa del Este) | $55-95 | $440-760 | Buena relación, requiere gestión propia |
| Offshore (India, sudeste asiático) | $30-50 | $240-400 | Más barato, más iteraciones y retrabajo |

La tarifa es "blended": mezcla de senior, junior, diseño, QA y PM. Una agencia no cobra una
sola tarifa, pero cotiza sobre esta media.

---

## 5. La tienda (alcance a futuro, todavía sin código)

> **Nada de esto existe en el repositorio al 1-oct-2026.** Busqué archivos, ramas y commits
> de tienda / shop / carrito / producto: no hay ninguno. Lo que sigue es estimación de
> alcance, no medición. Los números se afinan cuando el alcance esté definido.

### 5.1 Tres niveles de tienda

**Nivel 1 - Catálogo con cobro (35-50 días)**
- Catálogo de productos en Supabase (accesorios, repuestos, merchandising)
- Ficha de producto, carrito en el navegador
- Checkout reutilizando el PaymentIntent de Stripe que ya existe
- Admin: CRUD de productos + lista de pedidos
- Entrega: el mecánico lo lleva en la visita, o retiro. **Sin envío postal.**
- Obligatorio en este repo: 3 idiomas, tests, los 14 gates de CI, tema claro y oscuro

**Nivel 2 - Tienda completa con envío (75-105 días)** <- el realista
Todo lo del nivel 1, más:
- Stock real ligado a `parts_inventory` y al inventario de furgoneta
- Envío: integración con Australia Post o Sendle, cálculo de costo por peso y código postal,
  etiquetas, número de seguimiento
- Variantes de producto (talla, color), múltiples imágenes, búsqueda y filtros
- Cupones aplicables a productos, GST en la factura, factura fiscal australiana válida
- Emails de pedido, envío y entrega en 3 idiomas; devoluciones y reembolsos
- Admin: pedidos con estados, picking, informes de ventas, márgenes
- Descuento automático para miembros Basic/Standard/VIP

**Nivel 3 - B2B y marketplace (130-180 días)**
Todo lo del nivel 2, más:
- Cuentas B2B con precios por cliente, órdenes de compra, facturación a 30 días
- Proveedores, dropshipping, reposición automática de stock
- Catálogo de terceros (tiendas de bici haciendo overflow, lo que el roadmap pone en 2027)

### 5.2 Costo de la tienda por nivel

| Nivel | Esfuerzo | AU premium | AU mediana | Nearshore | Offshore |
|---|---|---|---|---|---|
| 1. Catálogo con cobro | 35-50 días | $56k - $100k | $33k - $70k | $15k - $38k | $8k - $20k |
| **2. Tienda completa** | **75-105 días** | **$120k - $210k** | **$71k - $147k** | **$33k - $80k** | **$18k - $42k** |
| 3. B2B / marketplace | 130-180 días | $208k - $360k | $124k - $252k | $57k - $137k | $31k - $72k |

### 5.3 Por qué la tienda no es barata en este repo

Una tienda aislada es un problema resuelto. Aquí no está aislada:

1. **Cuatro superficies, no una.** Catálogo y carrito tienen que vivir en la SPA móvil, en
   la landing de escritorio, en el admin (gestión) y tocar la app del mecánico (stock de
   furgoneta). Una tienda nueva se construye una vez; esta se construye cuatro veces.
2. **Tres idiomas obligatorios por CI.** `scripts/i18n-check.mjs` bloquea el merge si un
   string de producto no tiene `es` y `zh`. No es opcional, es un gate.
3. **El stock ya existe y hay que no romperlo.** `parts_inventory` lo usa el mecánico para
   descontar repuestos en un trabajo. Vender el mismo repuesto por web significa una sola
   fuente de verdad y bloqueos de concurrencia reales.
4. **Pagos ya en vivo.** El webhook de Stripe actual decide reembolsos sobre reservas.
   Meter pedidos de tienda en ese flujo es cirugía sobre dinero real, no feature nueva.
5. **GST y factura fiscal australiana.** `api/send-invoice.js` ya genera PDF para servicios.
   Productos tienen otro tratamiento de impuesto y de envío.
6. **Los 14 gates y 1,577 tests.** Todo lo nuevo tiene que pasar colores, accesibilidad,
   consentimiento, tema oscuro, assets versionados. Es calidad, pero es trabajo.

### 5.4 Alternativa: no construirla (recomendación a considerar)

| Opción | Costo inicial | Mensual | Trade-off |
|---|---|---|---|
| **Custom en este repo (nivel 2)** | $71k - $147k | ~$0 extra | Control total, un solo login, stock unificado, descuento de miembros nativo |
| **Shopify + enlace desde la app** | $8k - $25k (tema + setup) | ~$50-200 AUD | Rápido y barato, pero dos sistemas: dos logins, stock duplicado, sin descuento de membresía automático |
| **Shopify + integración real** | $25k - $65k | ~$80-300 AUD | Lo mejor de ambos, pero la integración (SSO, stock, membresías) es la parte caliente y hay que mantenerla |
| **WooCommerce autogestionado** | $12k - $35k | ~$40-120 AUD | Más barato que Shopify a largo plazo, más mantenimiento y riesgo de seguridad |

**Mi lectura:** si la tienda es para vender accesorios y repuestos a clientes que ya reservan
servicio, el nivel 1 custom ($33k-70k) gana a Shopify, porque el valor está justamente en que
el carrito y la reserva compartan cuenta, descuento de membresía y la visita del mecánico.
Si la tienda es un canal de venta independiente con envío a toda Australia, Shopify con
integración ($25k-65k) sale mejor que construir el nivel 2 ($71k-147k).

---

## 6. Costos que NO están en las tablas anteriores

| Concepto | Costo típico (AUD) |
|---|---|
| Redacción legal de términos y privacidad (abogado AU, ACL + Privacy Act) | $3,000 - $8,000 |
| Términos de venta de productos y política de devoluciones (si hay tienda) | $2,000 - $5,000 |
| Traducción profesional es/zh (2,404 strings + 24 páginas + catálogo) | $6,000 - $18,000 |
| Marca, logo y sistema visual (si no existiera) | $3,000 - $10,000 |
| Fotografía de producto para la tienda | $3,000 - $9,000 |
| Fotografía y video de servicio | $2,000 - $5,000 |
| Auditoría de seguridad / pentest previo a lanzamiento | $8,000 - $25,000 |
| Registro de marca IP Australia | ~$400 - $1,500 |
| **Contingencia típica de agencia (10-20% del contrato)** | variable |

---

## 7. Velocidad actual y costo evitado

Entre el 24 de septiembre y el 1 de octubre (7 días, 50 commits, 23 PRs mergeados):

| Métrica | Delta |
|---|---|
| Líneas de producción | +2,793 |
| Líneas de tests | +1,856 |
| Casos de test | +85 |
| Handlers de API | +8 |
| Páginas de admin | +1 (Photos) |

A ritmo de agencia (134-186 líneas de producción por día) esa semana equivale a
**15 a 21 días-persona**, es decir **$14,000 a $29,000 AUD** a tarifa de agencia mediana,
o **$24,000 a $42,000** a tarifa premium. En una semana.

Esto importa para la decisión: el costo de reemplazo de la app no es un número congelado,
sube entre $14k y $29k por semana de desarrollo activo. También importa al revés - si la
tienda se construye al ritmo actual en vez de contratarla, el ahorro es del orden de
$71k-147k para el nivel 2.

---

## 8. Costo recurrente después de la entrega

### 8.1 Infraestructura (mensual, AUD aproximado)

| Servicio | Hoy | Con tienda nivel 2 |
|---|---|---|
| Vercel Pro | $30 - $90 | $40 - $120 |
| Supabase Pro (incluye storage de fotos) | $40 - $160 | $60 - $220 |
| Twilio (SMS + WhatsApp, por uso) | $30 - $200 | $40 - $260 |
| Resend (email) | $30 - $140 | $40 - $190 |
| Anthropic API (chatbot + diagnóstico) | $30 - $300 | $30 - $300 |
| Sentry | $0 - $45 | $0 - $45 |
| Envíos (Australia Post / Sendle, API) | - | $0 - $60 |
| Dominio y DNS | ~$5 | ~$5 |
| **Total** | **$165 - $940 / mes** | **$215 - $1,200 / mes** |

Stripe cobra aparte por transacción (aprox. 1.75% + $0.30 en tarjetas domésticas AU).

### 8.2 Mantenimiento

Las agencias cobran un retainer anual del **15% al 25% del costo de construcción**. Sobre un
build de $700k (app + tienda nivel 2 a tarifa mediana) eso son **$105,000 a $175,000 AUD al
año** solo para correcciones, parches de dependencias y cambios menores. Cualquier función
nueva se cotiza aparte.

---

## 9. Plazo de entrega

| Escenario | Equipo típico | Calendario |
|---|---|---|
| A (clon 1:1, sin tienda) | 5-6 personas | 8 - 12 meses |
| A + tienda nivel 2 | 6-7 personas | 10 - 14 meses |
| B (alcance comercial) | 4-5 personas | 6 - 9 meses |
| B + tienda nivel 2 | 5-6 personas | 8 - 11 meses |
| C (MVP) | 3 personas | 3 - 4 meses |
| Solo la tienda nivel 2, sobre la app ya existente | 2-3 personas | 4 - 6 meses |

Los plazos incluyen discovery, ciclos de revisión y UAT. No incluyen el tiempo de Diego
dando feedback, que en la práctica es el cuello de botella real en proyectos de agencia.

---

## 10. Lo que una agencia NO entregaría por ese precio

Cosas que existen hoy en este repositorio y que raramente forman parte de un contrato de
agencia estándar:

1. **1,577 casos de test.** El estándar de agencia para un proyecto de este tamaño son
   100-300 tests, casi siempre solo de los caminos felices.
2. **14 gates de CI a medida.** Scripts que bloquean el merge si un precio queda
   desincronizado entre superficies, si falta una traducción, si se escribe un hex a mano en
   vez de un token, si un icono no existe. Es infraestructura de calidad que normalmente
   solo tienen equipos de producto internos.
3. **45 migraciones SQL versionadas con runbooks.** Lo habitual es entregar el esquema final
   sin historial.
4. **57,000 líneas de documentación** (arquitectura, roadmap, auditorías, runbooks de
   backup, privacidad y RLS, flujos de usuario, plan de tracking).
5. **Tres idiomas completos** incluyendo emails y SMS localizados.
6. **Cola offline real en la app del mecánico** con reconciliación. Suele quedar fuera de
   alcance por costo.
7. **Runbooks de privacidad ejecutables** (`npm run privacy:export` / `privacy:forget`).

Si estos siete puntos se pidieran explícitamente a una agencia, se cotizan como extras y
suben el presupuesto entre un 25% y un 40%.

---

## 11. Advertencias metodológicas

- Una agencia **no construiría esto igual**. Usaría React/Next.js o similar, no vanilla JS.
  El conteo de líneas sería distinto y el costo de mantenimiento a 5 años también.
- El costo no es proporcional al código. Las 6,192 líneas de `api/auth.js` valen mucho más
  por línea que las 1,614 del diccionario de español.
- Estas cifras son **costo de reemplazo**, no valor de mercado del negocio. Reconstruir esto
  cuesta lo que dice la tabla; lo que vale depende de los ingresos que genere.
- Las tarifas son rangos de industria, no cotizaciones. Para un número firme hay que pedir
  presupuesto con este mismo documento como pliego de alcance.
- **La tienda está estimada, no medida.** El rango 75-105 días del nivel 2 se mueve
  fácilmente un 40% según cuántos productos, si hay variantes, si hay envío y si el stock se
  unifica con el de la furgoneta. Definir eso antes de pedir cotización baja el precio más
  que negociar la tarifa.

---

## 12. Cómo usar este documento

Si Diego quiere validar el número con el mercado:

1. Enviar las secciones 2 y 3 a tres agencias como especificación de alcance.
2. Pedir cotización por el **escenario B**, no por el A (el A las asusta y encarece).
3. Para la tienda, pedir cotización **por separado y por nivel** (sección 5.1). Una agencia
   que cotiza "la tienda" sin nivel definido siempre cotiza alto y después recorta.
4. Comparar contra las tablas de la sección 1. Cualquier cotización por debajo de $200k para
   el escenario B implica recorte de alcance, offshore sin gestión, o ambas.
5. Exigir que la cotización diga explícitamente qué incluye en tests, i18n, accesibilidad y
   documentación. Es ahí donde se esconde la diferencia entre $250k y $700k.
6. Antes de encargar la tienda, decidir la pregunta de la sección 5.4: canal integrado
   (custom nivel 1) o canal independiente con envío (Shopify integrado). Son presupuestos
   muy distintos.
