# ANÁLISIS DE COSTO DE DESARROLLO - Dr. Bike Sydney

Fecha: 2026-09-24
Pregunta: cuánto costaría mandar a construir esta aplicación a una empresa de desarrollo.
Método: inventario medido sobre el repositorio + estimación por módulo + tarifas de mercado.

> Las cifras de código son medidas reales sobre el repo en el commit `ce0efad`.
> Las tarifas son rangos de mercado de la industria (no son cotizaciones recibidas).

---

## 1. Resumen ejecutivo

| Escenario | Esfuerzo | Agencia AU premium | Agencia AU mediana | Nearshore | Offshore |
|---|---|---|---|---|---|
| **A. Clon 1:1 de lo que existe hoy** | 465-640 días-persona | **$744k - $1,280k** | $442k - $896k | $205k - $486k | $112k - $256k |
| **B. Alcance comercial equivalente** | 280-380 días-persona | $448k - $760k | $266k - $532k | $123k - $289k | $67k - $152k |
| **C. Solo MVP (reserva + pago + mecánico + admin básico)** | 150-210 días-persona | $240k - $420k | $143k - $294k | $66k - $160k | $36k - $84k |

Todo en AUD, excluye GST, excluye costos de infraestructura y mantenimiento.

**Número para citar:** una agencia de Sydney de gama media cotizaría este producto tal como
está hoy en el rango de **$450,000 a $900,000 AUD**, con 7 a 10 meses de calendario y un
equipo de 4-6 personas. Una agencia premium (las que hacen apps para bancos y retail grande)
lo pasaría de **$750,000 al millón**.

El escenario B es el realista para comparar: es lo que una agencia entregaría por ese dinero.
El escenario A incluye cosas que ninguna agencia entrega por defecto (1,492 tests, 14 gates
de CI propios, 3 idiomas completos, 48 páginas SEO, 45 migraciones documentadas).

---

## 2. Inventario medido (qué hay que construir)

### 2.1 Volumen de código

| Capa | Archivos | Líneas |
|---|---|---|
| Frontend JS (`js/`) | 20 | 26,510 |
| Backend / API (`api/`) | 32 | 14,158 |
| CSS (`css/`) | 7 | 8,248 |
| HTML de aplicación (raíz) | 17 | 9,918 |
| Service worker + edge middleware | 2 | 387 |
| **Subtotal producción** | **78** | **59,221** |
| Tests automatizados (`tests/`) | 121 | 17,047 |
| Scripts de build / QA / migración (`scripts/*.mjs`) | 28 | 6,588 |
| Migraciones SQL (`scripts/*.sql`) | 45 | 1,944 |
| Páginas SEO localizadas (`es/`, `zh/`, `blog/`) | 29 | ~5,000 |
| Documentación técnica y de negocio (`docs/`, raíz) | 170 | 56,532 |
| **Total del repositorio** | ~500 | ~146,000 |

Para referencia: 59,221 líneas de código de producción es del orden de una aplicación de
negocio mediana completa, no de un sitio web.

### 2.2 Superficies de la aplicación

**1. SPA móvil (`index.html` + `js/app.js`, 6,546 líneas)**
11 pantallas con router propio de hash: home, login, book-service (wizard multi-paso),
payment, my-bookings, my-bikes, profile, tracking (mapa en vivo), review, quote-sent,
service-summary.

**2. Landing de escritorio (`landing.html` + `js/landing-inline.js`, 3,828 líneas)**
Página de marketing con 6 secciones (about, fleet, mechanics, memberships, reviews, faq),
modal de reserva que reutiliza el wizard de la SPA, captura UTM, tracking de CTA,
consentimiento de cookies, sección de reseñas de Google.

**3. App del mecánico (`mechanic.html` + `js/mechanic.js`, 3,777 líneas, 107 funciones)**
PWA instalable con login por PIN, lista de trabajos (hoy / próximos / hechos),
aceptar-rechazar, cambio de estado, marcar llegada, transmisión de GPS en vivo,
cronómetro de servicio, checklist de servicio, inventario de furgoneta, buscador de
repuestos, **cola offline con sincronización** (banner de offline y de sync), flujo de
completado con foto y canvas.

**4. Panel de administración (`admin.html` + `js/admin.js`, 10,450 líneas, 227 funciones)**
18 páginas: dashboard, bookings, calendar, clients, vans, zones, services, memberships,
finance, expenses, analytics, inventory, coupons, claims, contacts, reminders, orphans,
settings, mechanic-profile. Es, por sí solo, un producto SaaS de gestión de taller.

**5. Tracking público (`track.html`)** - enlace compartible con token, sin login.

**6. Superficie de contenido/SEO** - 48 páginas HTML totales: 5 páginas de suburbio,
5 posts de blog, 24 páginas localizadas es/zh, términos (605 líneas), privacidad
(713 líneas), reclamos, bike-check, business, cycling-map, applepay.
`sitemap.xml` de 23,347 bytes, 36 redirects y 28 rewrites en `vercel.json`.

### 2.3 Backend

- 32 archivos en `api/`, 14,158 líneas.
- `api/auth.js` solo: **5,754 líneas, 63 handlers** (auth admin y mecánico, reservas,
  disponibilidad, cobertura por zona, geocodificación, mensajería cliente-mecánico,
  reseñas, reclamos, referidos, waitlist, calendario de Google, tarjetas guardadas).
- Módulos de soporte: seguridad (sanitización + rate limit, 490 líneas), validación,
  cap de cobros, guard de completado, hold de slot, ETA, cobertura, auditoría de huérfanos,
  privacidad (export/borrado), backup/restore, i18n de email (395 líneas) y de SMS.
- `api/stripe-webhook.js` (709), `api/send-invoice.js` (791, genera PDF), `api/send-cron.js`
  (1,292, cinco campañas automáticas), `api/send-email.js` (495), `api/send-message.js` (367).

### 2.4 Base de datos

22 tablas en uso: `profiles`, `bookings`, `services`, `bikes`, `van_zones`, `callout_zones`,
`availability`, `parts_inventory`, `job_messages`, `mechanic_locations`, `discount_codes`,
`gift_cards`, `claims`, `expenses`, `escalation_contacts`, `notification_log`,
`public_reviews`, `stripe_events`, `checkout_attempts`, `geo_cache`, `waitlist`,
`newsletter_subscribers`.
45 migraciones SQL versionadas, incluyendo políticas RLS, índices de rendimiento y
endurecimiento de seguridad.

### 2.5 Integraciones externas (10)

Stripe (pagos en vivo, PaymentIntent, suscripciones, webhooks, Apple Pay y Google Pay
verificados), Supabase (postgres + auth + storage + realtime), Google OAuth, Twilio
(SMS y WhatsApp), Resend (email transaccional con DNS verificado), Anthropic Claude
(chatbot y diagnóstico de bici), Leaflet (mapas), Google Analytics 4, Sentry, Web Push
(VAPID). 22 variables de entorno.

### 2.6 Calidad e infraestructura de entrega

- **1,492 casos de test** en 121 archivos (Vitest unitario + Playwright e2e).
- **14 gates propios** en `npm run check`: i18n, precios de planes, iconos, atributos HTML,
  colores, tema oscuro, assets versionados, TDZ, privacidad, accesibilidad, consentimiento,
  migraciones, ABN.
- CI con `quality-gate` obligatorio, branch protection, husky + lint-staged, eslint con
  plugin de seguridad, prettier.
- PWA: service worker, 3 manifests (cliente, admin, mecánico), set de iconos con variantes
  maskable.
- 3 idiomas completos (en/es/zh): ~1,187 strings por diccionario, más emails y SMS
  localizados, más 24 páginas estáticas generadas por idioma.

---

## 3. Estimación de esfuerzo por módulo (escenario A: clon 1:1)

| # | Módulo | Días-persona (min) | Días-persona (max) |
|---|---|---|---|
| A | Discovery, UX y sistema de diseño (4 superficies, ~50 vistas) | 43 | 60 |
| B | Frontend SPA móvil (11 pantallas + wizard de reserva) | 45 | 60 |
| C | Frontend landing de escritorio + SEO on-page | 20 | 28 |
| D | PWA del mecánico (offline, GPS, cronómetro, inventario) | 30 | 40 |
| E | Panel de administración (18 páginas) | 60 | 80 |
| F | Backend y API (63+ handlers, crons, facturación PDF) | 65 | 85 |
| G | Base de datos, RLS, migraciones, índices | 15 | 22 |
| H | Integraciones externas (10 proveedores) | 20 | 30 |
| I | i18n en/es/zh (ingeniería + tooling + coordinación) | 15 | 22 |
| J | Superficie de contenido y SEO (48 páginas, generadores) | 10 | 15 |
| K | QA y automatización de tests (1,492 casos + 14 gates + CI) | 35 | 50 |
| L | Cumplimiento legal y privacidad (términos, privacidad, GDPR/APP) | 12 | 18 |
| M | PWA, rendimiento y accesibilidad | 12 | 18 |
| N | DevOps, despliegue, monitoreo | 8 | 12 |
| | **Subtotal técnico** | **390** | **540** |
| O | Gestión de proyecto y análisis de negocio (~18%) | 70 | 97 |
| | **TOTAL** | **460** | **637** |

**460-640 días-persona = 92-128 semanas-persona = 2.2 a 3.1 años-persona.**

Verificación cruzada por líneas de código: 85,000 líneas (producción + tests + scripts + SQL)
entre 460-640 días da 133-185 líneas por día. Es alto pero coherente con este stack: HTML y
CSS a mano pesan muchas líneas por hora de trabajo, los diccionarios i18n (3,032 líneas) son
mecánicos y las 24 páginas localizadas se generan por script. Si una agencia trabaja a un
ritmo conservador de 80-120 líneas/día, el esfuerzo subiría a **700-1,060 días** y el costo
al doble de la tabla del resumen. Ese es el escenario pesimista, no el central.

### Escenario B: alcance comercial equivalente (280-380 días)

Lo que una agencia entrega realmente por el precio de mercado. Se quitan:
- 1,492 tests -> cobertura típica de agencia (~150-300 tests): -25 días
- 14 gates propios de CI -> lint + prettier estándar: -18 días
- 3 idiomas completos -> solo inglés, i18n preparado pero vacío: -20 días
- 48 páginas SEO -> 1 landing + 3 legales: -12 días
- 45 migraciones versionadas -> esquema entregado una vez: -10 días
- 56,000 líneas de documentación -> handover básico: -15 días
- Panel admin de 18 páginas -> 10 páginas núcleo: -20 días

### Escenario C: MVP (150-210 días)

Reserva móvil + pago Stripe + app del mecánico + admin con bookings/clients/services,
un idioma, sin membresías, sin chatbot IA, sin facturación PDF, sin crons de marketing,
sin gift cards ni referidos, sin tracking público.

---

## 4. Tarifas de mercado (AUD, 2026)

| Proveedor | Tarifa/hora | Tarifa/día (8h) | Comentario |
|---|---|---|---|
| Agencia AU premium (Sydney/Melbourne, full service) | $200-250 | $1,600-2,000 | Equipo dedicado, PM, diseñador, QA, garantía |
| Agencia AU mediana / boutique | $120-175 | $950-1,400 | Lo típico para una PyME como Dr. Bike |
| Freelance senior AU | $90-140 | $700-1,100 | Sin PM ni QA, riesgo de bus factor 1 |
| Nearshore (LatAm, Europa del Este) | $55-95 | $440-760 | Buena relación, requiere gestión propia |
| Offshore (India, sudeste asiático) | $30-50 | $240-400 | Más barato, más iteraciones y retrabajo |

La tarifa es "blended": mezcla de senior, junior, diseño, QA y PM. Una agencia no cobra
una sola tarifa, pero cotiza sobre esta media.

---

## 5. Costos que NO están en las tablas anteriores

| Concepto | Costo típico (AUD) |
|---|---|
| Redacción legal de términos y privacidad (abogado AU, ACL + Privacy Act) | $3,000 - $8,000 |
| Traducción profesional es/zh (2,374 strings + 24 páginas) | $6,000 - $15,000 |
| Marca, logo y sistema visual (si no existiera) | $3,000 - $10,000 |
| Fotografía y video de producto | $2,000 - $5,000 |
| Auditoría de seguridad / pentest previo a lanzamiento | $8,000 - $25,000 |
| Registro de marca IP Australia | ~$400 - $1,500 |
| **Contingencia típica de agencia (10-20% del contrato)** | variable |

---

## 6. Costo recurrente después de la entrega

### 6.1 Infraestructura (mensual, AUD aproximado)

| Servicio | Rango |
|---|---|
| Vercel Pro | $30 - $90 |
| Supabase Pro | $40 - $160 |
| Twilio (SMS + WhatsApp, por uso) | $30 - $200 |
| Resend (email) | $30 - $140 |
| Anthropic API (chatbot + diagnóstico) | $30 - $300 |
| Sentry | $0 - $45 |
| Dominio y DNS | ~$5 |
| **Total** | **$165 - $940 / mes** |

Stripe cobra aparte por transacción (aprox. 1.75% + $0.30 en tarjetas domésticas AU).

### 6.2 Mantenimiento

Las agencias cobran un retainer anual del **15% al 25% del costo de construcción**.
Sobre un build de $600k eso son **$90,000 a $150,000 AUD al año** solo para
correcciones, parches de dependencias y cambios menores. Cualquier función nueva se
cotiza aparte.

---

## 7. Plazo de entrega

| Escenario | Equipo típico | Calendario |
|---|---|---|
| A (clon 1:1) | 5-6 personas | 8 - 12 meses |
| B (alcance comercial) | 4-5 personas | 6 - 8 meses |
| C (MVP) | 3 personas | 3 - 4 meses |

Los plazos incluyen discovery, ciclos de revisión y UAT. No incluyen el tiempo de Diego
dando feedback, que en la práctica es el cuello de botella real en proyectos de agencia.

---

## 8. Lo que una agencia NO entregaría por ese precio

Cosas que existen hoy en este repositorio y que raramente forman parte de un contrato
de agencia estándar:

1. **1,492 casos de test.** El estándar de agencia para un proyecto de este tamaño son
   100-300 tests, casi siempre solo de los caminos felices.
2. **14 gates de CI a medida.** Scripts que bloquean el merge si un precio queda
   desincronizado entre superficies, si falta una traducción, si se escribe un hex a mano
   en vez de un token, si un icono no existe. Esto es infraestructura de calidad que
   normalmente solo tienen equipos de producto internos.
3. **45 migraciones SQL versionadas con runbooks.** Lo habitual es entregar el esquema
   final sin historial.
4. **56,000 líneas de documentación** (arquitectura, roadmap, auditorías, runbooks de
   backup, privacidad y RLS, flujos de usuario, plan de tracking).
5. **Tres idiomas completos** incluyendo emails y SMS localizados.
6. **Cola offline real en la app del mecánico** con reconciliación. Suele quedar fuera de
   alcance por costo.
7. **Runbooks de privacidad ejecutables** (`npm run privacy:export` / `privacy:forget`).

Si estos siete puntos se pidieran explícitamente a una agencia, se cotizan como extras y
suben el presupuesto entre un 25% y un 40%.

---

## 9. Advertencias metodológicas

- Una agencia **no construiría esto igual**. Usaría React/Next.js o similar, no vanilla JS.
  El conteo de líneas sería distinto (probablemente menor en código propio, mayor en
  dependencias) y el costo de mantenimiento a 5 años también.
- El costo no es proporcional al código. Las 5,754 líneas de `api/auth.js` valen mucho más
  por línea que las 1,593 del diccionario de español.
- Estas cifras son **costo de reemplazo**, no valor de mercado del negocio. Reconstruir esto
  cuesta lo que dice la tabla; lo que vale depende de los ingresos que genere.
- Las tarifas son rangos de industria, no cotizaciones. Para un número firme hay que pedir
  presupuesto con este mismo documento como pliego de alcance.

---

## 10. Cómo usar este documento

Si Diego quiere validar el número con el mercado:

1. Enviar las secciones 2 y 3 a tres agencias como especificación de alcance.
2. Pedir cotización por el **escenario B**, no por el A (el A las asusta y encarece).
3. Comparar contra la tabla de la sección 1. Cualquier cotización por debajo de $200k para
   el escenario B implica recorte de alcance, offshore sin gestión, o ambas.
4. Exigir que la cotización diga explícitamente qué incluye en tests, i18n, accesibilidad y
   documentación. Es ahí donde se esconde la diferencia entre $250k y $700k.
