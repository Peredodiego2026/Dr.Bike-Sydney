# ANÁLISIS DE COSTO DE DESARROLLO - Dr. Bike Sydney

Versión 3 - 2026-10-01 (v2: 2026-10-01, v1: 2026-09-24)
Pregunta: cuánto costaría mandar a construir esta aplicación a una empresa de desarrollo,
incluyendo la tienda que está en diseño.
Método: inventario medido sobre el repositorio + estimación por módulo + tarifas de mercado.

> Las cifras de código son medidas reales sobre el repo en el merge de `55e3d6c` (main al
> 1-oct-2026). Las tarifas son rangos de mercado de la industria, no cotizaciones recibidas.
> **La tienda no existe en el código todavía**, pero sí está diseñada: su alcance se leyó
> del canvas "Dr. Bike Shop Mockups" (25 artboards, 1-oct-2026), no se inventó. Sección 5.

---

## 1. Resumen ejecutivo

### 1.1 La app tal como está hoy (sin tienda)

| Escenario | Esfuerzo | Agencia AU premium | Agencia AU mediana | Nearshore | Offshore |
|---|---|---|---|---|---|
| **A. Clon 1:1 de lo que existe** | 480-665 días-persona | **$768k - $1,330k** | $456k - $931k | $211k - $505k | $115k - $266k |
| **B. Alcance comercial equivalente** | 290-395 días-persona | $464k - $790k | $276k - $553k | $128k - $300k | $70k - $158k |
| **C. Solo MVP** | 150-210 días-persona | $240k - $420k | $143k - $294k | $66k - $160k | $36k - $84k |

### 1.2 Con la tienda incluida (alcance leído del canvas de diseño)

| Escenario | Esfuerzo | Agencia AU premium | Agencia AU mediana | Nearshore | Offshore |
|---|---|---|---|---|---|
| **A + tienda custom** | 731-1,024 días-persona | **$1,170k - $2,048k** | $694k - $1,434k | $322k - $778k | $175k - $410k |
| **B + tienda custom** | 541-754 días-persona | $866k - $1,508k | $514k - $1,056k | $238k - $573k | $130k - $302k |
| **B + tienda sobre Shopify** | 355-470 días-persona | $568k - $940k | $337k - $658k | $156k - $357k | $85k - $188k |

### 1.3 Los tres números, en limpio

Si hay que quedarse con tres cifras para la app completa **más** la tienda:

| | Quién lo haría | Precio aproximado |
|---|---|---|
| **Barato** | Offshore, tienda sobre Shopify | **$220,000** |
| **Lo más probable** | Agencia australiana normal, tienda custom | **$800,000** |
| **Caro** | Agencia grande de Sydney, todo custom | **$1,600,000** |

Y solo la tienda, por separado: **barato $100,000 / probable $350,000 / caro $550,000**.
Sobre Shopify con integración, la tienda baja a **$53,000 - $125,000**.

Todo en AUD, excluye GST, excluye infraestructura y mantenimiento.

**Número para citar:** la app tal como está hoy la cotizaría una agencia de Sydney de gama
media entre **$456,000 y $931,000 AUD**. Con la tienda custom, entre **$694,000 y
$1,434,000**. Con la tienda montada sobre Shopify, entre **$337,000 y $658,000** - y esa
diferencia es la decisión más cara que hay sobre la mesa hoy (sección 5.4).

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

## 5. La tienda (alcance leído del canvas de diseño, 1-oct-2026)

> Fuente: el canvas **"Dr. Bike Shop Mockups"** (25 artboards, actualizado el 1-oct-2026).
> El diseño está decidido; **el código todavía no existe** en el repositorio. El alcance de
> abajo está leído de los mockups, no inventado. Lo que falta diseñar está marcado.

### 5.1 Qué dicen los mockups

**Modelo de negocio:** dropshipping de **un solo proveedor, LEBYCLE**. Fotos del catálogo
2026 de LEBYCLE (páginas 41-115), precios tomados de su tienda oficial en AliExpress para
Australia, medidos el 30-sep-2026. Posicionamiento declarado: "una sola marca, a propósito -
precio de taller, directo de fábrica".

**Volumen:** 154 productos distintos salidos de una planilla de 1,020 líneas (las medidas y
los calces viven dentro de cada producto). El canvas menciona un modelo de 296 productos.

**Superficie diseñada y decidida:**

| Pieza | Estado en el canvas |
|---|---|
| Franja de tienda en la home | Elegida (opción C, con los cambios de Diego) |
| Página Shop (hero, barra de confianza, bloque LEBYCLE, "New this week") | Elegida (opción 1) |
| Página de categoría con filtros | Elegida (opción 4) |
| Catálogo completo, 20 por página, 4 por fila, selector 20/30/50 | Elegida (grid A) |
| Ficha de producto con matriz de variantes | Diseñada (nueva) |
| Celular: lista, menú hamburguesa, ficha de producto, gestos | Elegida (opción A + menú) |
| **Carrito y checkout** | **Sin diseñar todavía** |
| **Admin de productos y pedidos** | **Sin diseñar todavía** |

**Funciones que los mockups ya comprometen:**

1. **6 categorías** (Brakes, Drivetrain, Wheels, Cockpit, Tools, Care) más Clearance.
2. **Filtros facetados** con contadores por tipo (46 disc pads, 38 rim shoes, 24 rotors...).
3. **Matriz de variantes.** El tubo de cámara es un producto con **41 combinaciones**:
   medida de rueda x tipo de válvula (Schrader/Presta) x largo de válvula (32/48/60 mm).
   Un precio, 41 SKU.
4. **"Calza con mi bici".** Lee la bici guardada en el perfil del cliente ("Your Giant
   Escape 3 takes 700 x 23/28C") y tiene botón "Only show what fits". Esto necesita una
   base de datos de calces, que no es un campo: es un modelo de datos nuevo.
5. **"In the van now" vs "Made to order"** como filtro de disponibilidad. Eso se lee de
   `parts_inventory`, la misma tabla que el mecánico usa para descontar repuestos.
6. **"Order before your service and we fit it free"** - une un pedido de tienda con una
   reserva de servicio.
7. **Envío gratis sobre $80**, envío con seguimiento a toda Australia, garantía 12 meses.
8. **Selector de idioma en el encabezado** - o sea, los 3 idiomas sobre 154-296 productos.
9. Badges New / Sale / Order, precio anterior tachado, orden por precio, buscador,
   migas de pan, productos relacionados, ayuda por WhatsApp con foto.

Dos cosas quedaron abiertas en los propios mockups: `[CONFIRMAR PLAZO DE ENTREGA]` y
`[FOTO DE LA VAN]`.

### 5.2 Estimación de esfuerzo de la tienda

| # | Módulo | Días (min) | Días (max) |
|---|---|---|---|
| 1 | Modelo de datos + importación del catálogo LEBYCLE (154-296 productos, ~1,020 variantes, fotos, códigos) | 12 | 18 |
| 2 | Página Shop + navegación de 6 categorías + buscador | 12 | 16 |
| 3 | Página de categoría con filtros facetados, orden, badges, precio anterior | 18 | 25 |
| 4 | Ficha de producto con matriz de variantes (41 combos), tabs, relacionados | 14 | 20 |
| 5 | Catálogo completo con paginación 20/30/50 | 6 | 9 |
| 6 | Versión celular de todo + menú hamburguesa | 16 | 22 |
| 7 | Carrito (invitado + con cuenta) + checkout Stripe + dirección + envío gratis sobre $80 | 20 | 28 |
| 8 | "Calza con mi bici": base de calces ligada a la tabla `bikes` | 12 | 18 |
| 9 | "In the van now" ligado a `parts_inventory` sin romper al mecánico | 6 | 10 |
| 10 | "Pedí antes del servicio y lo instalamos gratis" (pedido unido a reserva) | 6 | 9 |
| 11 | Operación de dropshipping: pedido a LEBYCLE, seguimiento, emails de estado, devoluciones | 14 | 20 |
| 12 | Admin: productos, variantes, precios y márgenes, pedidos, sync del proveedor, informes | 22 | 30 |
| 13 | Descuento de membresía y cupones sobre productos | 5 | 8 |
| 14 | GST y factura fiscal australiana de productos | 6 | 9 |
| 15 | i18n en/es/zh de toda la superficie de tienda | 8 | 12 |
| 16 | Tests, los 14 gates de CI, tema oscuro, accesibilidad | 16 | 22 |
| 17 | Diseño UX/UI (Diego ya lo hizo; una agencia lo cobra) | 20 | 28 |
| | **Subtotal técnico** | **213** | **304** |
| | Gestión de proyecto (~18%) | 38 | 55 |
| | **TOTAL TIENDA** | **251** | **359** |

### 5.3 Costo de la tienda

| Proveedor | Costo |
|---|---|
| Agencia AU premium | $402k - $718k |
| **Agencia AU mediana** | **$238k - $503k** |
| Freelance senior AU | $176k - $395k |
| Nearshore | $110k - $273k |
| Offshore | $60k - $144k |

La traducción profesional de 154-296 productos a español y chino va aparte: **$8,000 a
$22,000**. Fotografía de producto no hace falta, viene del catálogo del proveedor.

### 5.4 La alternativa que cambia el número: Shopify + integración

Shopify ya trae, de fábrica y gratis con la suscripción, siete de los módulos de la tabla
5.2: variantes, filtros facetados, carrito, checkout, envío, impuestos, admin de productos
y pedidos, y multi-idioma. Eso es **la mayor parte del costo**.

Lo que Shopify **no** trae y hay que construir igual, porque es lo que hace distinta a esta
tienda:

- "Calza con tu Giant Escape 3" leyendo la bici del perfil de Dr. Bike
- "In the van now" leyendo `parts_inventory`
- "Pedí antes del servicio y lo instalamos gratis"
- Descuento automático de membresía Basic / Standard / VIP
- Una sola cuenta para reservar y comprar

| Camino | Costo inicial | Mensual | Comentario |
|---|---|---|---|
| **Todo custom en este repo** | $238k - $503k | ~$50 extra | Control total, una sola base de código, nada que sincronizar |
| **Shopify + tema + 296 productos importados** | $18k - $45k | $50 - $200 | Rápido, pero dos sistemas: dos cuentas, dos logins, ninguna de las cinco funciones de arriba |
| **Shopify + integración real (recomendado)** | **$53k - $125k** | $80 - $300 | Shopify hace el comercio, el código propio hace las cinco funciones de Dr. Bike |

**Recomendación:** el tercer camino. Ahorra del orden de **$150,000 a $380,000** contra
construirlo todo, y conserva exactamente las funciones por las que esta tienda tiene sentido
existiendo dentro de Dr. Bike y no como un AliExpress más. El riesgo que se acepta es tener
dos sistemas que hay que mantener sincronizados.

El contra-argumento honesto: con un solo proveedor y 296 productos, el catálogo es chico y
estable. Si la tienda nunca va a crecer a varios proveedores, el custom se amortiza; si va a
crecer (el roadmap pone B2B y overflow de tiendas en 2027), Shopify aguanta eso sin que
nadie programe nada.

---

## 6. Costos que NO están en las tablas anteriores

| Concepto | Costo típico (AUD) |
|---|---|
| Redacción legal de términos y privacidad (abogado AU, ACL + Privacy Act) | $3,000 - $8,000 |
| Términos de venta y política de devoluciones (obligatorio con tienda) | $2,000 - $5,000 |
| Traducción profesional es/zh (2,404 strings + 24 páginas) | $6,000 - $15,000 |
| Traducción de 154-296 productos a es/zh (si la tienda es custom) | $8,000 - $22,000 |
| Marca, logo y sistema visual (si no existiera) | $3,000 - $10,000 |
| Fotografía de producto | $0 (las fotos vienen del catálogo LEBYCLE) |
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
**$238k-503k** si va custom, o **$53k-125k** si va sobre Shopify.

---

## 8. Costo recurrente después de la entrega

### 8.1 Infraestructura (mensual, AUD aproximado)

| Servicio | Hoy | Con la tienda |
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
build de $800k (app + tienda custom a tarifa mediana) eso son **$120,000 a $200,000 AUD al
año** solo para correcciones, parches de dependencias y cambios menores. Cualquier función
nueva se cotiza aparte.

---

## 9. Plazo de entrega

| Escenario | Equipo típico | Calendario |
|---|---|---|
| A (clon 1:1, sin tienda) | 5-6 personas | 8 - 12 meses |
| A + tienda custom | 6-7 personas | 11 - 16 meses |
| B (alcance comercial) | 4-5 personas | 6 - 9 meses |
| B + tienda custom | 5-6 personas | 9 - 13 meses |
| B + tienda sobre Shopify | 4-5 personas | 7 - 10 meses |
| C (MVP) | 3 personas | 3 - 4 meses |
| Solo la tienda custom, sobre la app ya existente | 3-4 personas | 6 - 9 meses |
| Solo la tienda sobre Shopify + integración | 2 personas | 2 - 3 meses |

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
- **La tienda está diseñada pero no construida.** El alcance de la sección 5 se leyó de los
  mockups, así que es firme en lo que está dibujado, pero **el carrito, el checkout y el
  admin de pedidos todavía no se diseñaron**: son los módulos 7 y 12 de la tabla 5.2, entre
  42 y 58 días, el bloque más grande sin dibujar. Ahí está el margen de error.
- Los precios de la tienda salen de AliExpress medidos el 30-sep-2026. Un proveedor único en
  China es un riesgo de negocio (tipo de cambio, plazos, aranceles), no de software, pero
  afecta el valor de construir la tienda y conviene decidirlo antes de gastar en código.

---

## 12. Cómo usar este documento

Si Diego quiere validar el número con el mercado:

1. Enviar las secciones 2 y 3 a tres agencias como especificación de alcance.
2. Pedir cotización por el **escenario B**, no por el A (el A las asusta y encarece).
3. Para la tienda, mandar el canvas "Dr. Bike Shop Mockups" junto con la tabla 5.2 y pedir
   **dos cotizaciones: una custom y una sobre Shopify**. Sin los mockups toda agencia cotiza
   alto por las dudas.
4. Comparar contra las tablas de la sección 1. Cualquier cotización por debajo de $200k para
   el escenario B implica recorte de alcance, offshore sin gestión, o ambas.
5. Exigir que la cotización diga explícitamente qué incluye en tests, i18n, accesibilidad y
   documentación. Es ahí donde se esconde la diferencia entre $250k y $700k.
6. Antes de encargar la tienda, decidir la pregunta de la sección 5.4: todo custom o Shopify
   con integración. Son entre $150,000 y $380,000 de diferencia, y es la decisión más cara
   que hay pendiente hoy.
7. Terminar de diseñar el carrito, el checkout y el admin de pedidos antes de pedir
   cotización de la tienda. Son 42-58 días de los 251-359 totales, y cotizar a ciegas sobre
   ellos es donde una agencia carga su contingencia.
