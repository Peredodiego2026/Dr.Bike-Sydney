# Unificacion Visual Total — Una sola identidad de diseño

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una sola pagina (index.html + js/app.js como base), un solo diseño visual de punta a punta (el look de landing.html aplicado a todas las pantallas del SPA), sin salto perceptible entre Home, Booking, Login, Tracking, Perfil, etc. Elimina la duplicacion landing.html/SPA.

**Architecture:** El SPA (router.js + app.js + components.js + supabase.js + stripe.js) ya tiene TODA la logica funcionando (auth, booking, fee $20, AI diagnosis, tracking, perfil). No se reescribe logica. Se reemplaza la capa visual (css/variables.css + css/main.css + los pocos hex hardcodeados en components.js) por la paleta y estilos de landing.html, y se absorbe el contenido de marketing de landing.html dentro de la pantalla "home" del SPA. landing.html como archivo separado deja de usarse para usuarios reales.

**Tech Stack:** Vanilla JS ES modules, CSS custom properties (variables.css), hash router propio, Vercel rewrites.

---

## ADVERTENCIA: esto reemplaza 2 planes previos de HOY que quedaron sin ejecutar

En `docs/superpowers/plans/` ya existen dos planes escritos hoy, antes de este chat, que **nunca se corrieron** (lo confirmo: el codigo en produccion sigue con el redirect viejo de `index.html` lineas 5-7 intacto, sin cambios):

- `2026-06-16-spa-unification.md`: propone que index.html sea la entrada para TODOS (desktop + mobile), pero **landing.html se mantiene separada** como pagina de marketing SEO. Direccion opuesta a lo que pedis ahora.
- `2026-06-16-landing-full-desktop-app.md`: propone lo inverso — reconstruir TODA la app (login, booking, pago, tracking) **adentro de landing.html**, dejando el SPA solo para mobile. Tambien opuesto.

Ninguno de los dos resuelve lo que pedis hoy: una sola pagina, un solo diseño, sin split por dispositivo. Este plan los reemplaza. Recomiendo borrar esos dos archivos cuando confirmes este plan, para que no haya tres planes contradictorios dando vueltas.

---

## HALLAZGO CRITICO — confirmá esto antes de arrancar

Lei el CSS real de los dos lados. No es solo "aplicar el estilo prolijo de landing al SPA" — son **paletas opuestas**:

| | `landing.html` (inline `<style>`) | SPA (`css/variables.css` + `main.css`) |
|---|---|---|
| Fondo | Blanco `#ffffff` | Negro casi puro `#0F0F0F` |
| Texto | Gris oscuro `#111827` | Blanco `#FFFFFF` |
| Azul primario | `#2563eb` | `#0A58CA` |
| Tipografia | Inter (Google Fonts) | system-ui (sin font externa) |
| Bordes/sombras | Grises claros, sombras suaves | Bordes `#2A2A2A`, sombras negras |

`CLAUDE.md` documenta el tema OSCURO como "el nuevo sistema de diseño" (Track B, del audit de jun 2026). Lo que pedis ahora es lo contrario: el tema CLARO de landing gana, en todas las pantallas. Es una decision valida, pero quiero que la confirmes explicitamente porque contradice el documento que el consultor entrego como fuente de verdad — y porque es un re-tema completo (cambiar fondo, texto y color primario en TODAS las pantallas), no un simple "pulido". Si confirmas, actualizo `CLAUDE.md` al final del plan (Sesion 6) para que no quede desactualizado.

---

## (1) Sub-tareas concretas + (2) que se reutiliza y como se aplica el diseño

### SESION 1 — Fundacion: tokens de diseño + fuente

**Archivos:** `css/variables.css`, `index.html` (head)

- Reemplazar los valores de los tokens en `css/variables.css` (NO los nombres — `--color-bg`, `--color-surface`, `--color-text`, `--color-primary`, etc. se quedan igual, asi `main.css` y `components.js` no necesitan tocarse en su mayoria) por los valores de landing: `--color-bg: #ffffff`, `--color-text: #111827`, `--color-primary: #2563eb`, `--color-border: #e5e7eb`, etc.
- Agregar a `index.html` el `<link>` de Google Fonts Inter que hoy solo existe en `landing.html` (linea 47), y cambiar `--font-family` a `Inter, system-ui, sans-serif`.
- **Riesgo concreto a corregir en esta misma sesion:** `js/stripe.js` linea ~33 hardcodea `color: '#FFFFFF'` en el estilo del Card Element de Stripe (pensado para fondo oscuro). Con fondo blanco, el texto de la tarjeta queda blanco sobre blanco — invisible. Cambiar a `#111827`. Esto es funcionalidad de pago que armamos hoy mismo; si no se corrige, el call-out fee se rompe visualmente (no se ve lo que se tipea).
- **Riesgo concreto:** `js/components.js` (`createBookingCard`, lineas 122-129) tiene colores de estado (`pending`, `confirmed`, etc.) hardcodeados como hex literal en JS, no como `var()`. El swap de `variables.css` NO los toca. Hay que revisar a mano que esos `rgba(...)` semitransparentes se sigan viendo bien sobre superficie clara (probable que si, pero hay que mirarlo, no asumirlo).
- Verificacion: recargar el SPA en local — debe verse igual de funcional pero con fondo blanco en vez de negro. Repetir el test de booking+fee con el override local (`location.hostname==='localhost'`, ya armado hoy) para confirmar que la logica no se rompio.

### SESION 2 — Home screen absorbe el contenido de landing

**Archivos:** `index.html` (screen `home`, lineas 44-117), `landing.html` (solo lectura, para copiar contenido)

- Reusa: TODA la logica existente (router, `createHeader`/`createBottomNav` de `components.js`).
- Mueve el contenido (no el CSS inline, que ya quedo cubierto en Sesion 1) de landing.html: hero, trust bar, grid de servicios con precios, secciones "about", testimonios, FAQ, footer — dentro de `<div data-screen="home">` de `index.html`.
- Las card de servicios de marketing usan la clase `.service-card` en landing.html — **colision real**: `components.js` ya define `.service-card` para las filas de servicio del flujo de booking (otro look). Hay que renombrar una de las dos antes de fusionar CSS (ej. la version de marketing pasa a `.service-promo-card`) o una pisa a la otra silenciosamente.
- Los CTA "Book a Service" / "Sign In" deben apuntar a los hash routes del SPA (`#book-service`, `#login`), no a anchors de landing.
- Decision a confirmar con vos: el Home dentro del SPA conserva el `bottom-nav` (Home/Bookings/Track/My Bikes/Profile) ademas del contenido de marketing, para que la navegacion sea consistente — asumo que si, avisame si no.
- Verificacion: abrir `/` sin hash → ver Home con todo el contenido de marketing + bottom-nav, mismo look que el resto de la app.

### SESION 3 — Re-tema flujo de booking (book-service, service-summary, payment)

**Archivos:** `css/main.css` (clases `.service-card`, `.date-item`, `.time-slot`, `.summary-row`, `.payment-amount`), `js/app.js` (solo si hay estilos inline a ajustar)

- Reusa: TODA la logica de booking + call-out fee armada hoy (sin cambios de JS, solo visual).
- Ajustar contraste/detalles que dependian del tema oscuro (ej. el explainer box del call-out fee en `renderPayment()` usa `var(--color-surface)` y `var(--color-border)` — ya hereda el cambio de Sesion 1 automaticamente, solo hay que mirarlo).
- Verificacion: repetir el test end-to-end de hoy (override local + 4242 simulado) — confirmar que el booking se sigue creando con `callout_fee` y `stripe_payment_intent_id`, ahora con el look nuevo.

### SESION 4 — Re-tema tracking, review, login, my-bookings, profile, my-bikes (AI diagnosis)

**Archivos:** `css/main.css` (resto de clases: `.booking-card`, `.star-rating`, `.empty-state`, `.toast`, `.form-input`), `js/app.js` (pantalla AI diagnosis, lineas ~1300-1340)

- Reusa: 100% de la logica (login email/Google, AI diagnosis via `/api/chat?type=diagnose`, tracking realtime, perfil).
- `.form-input` en `main.css` ya usa `var()` para fondo/borde/texto — hereda el cambio de Sesion 1 sin tocar codigo, solo verificar visualmente.
- Verificacion manual de cada pantalla: login (email + Google), my-bookings (lista + estados), tracking (mapa/estado), profile, my-bikes (incluye el flujo de AI diagnosis con foto).

### SESION 5 — Eliminar la duplicacion: routing y archivos

**Archivos:** `index.html` (borrar lineas 5-7), `vercel.json` (rewrite catch-all), `landing.html` (decidir destino)

- Borrar el script de deteccion de User-Agent en `index.html` (ya no hace falta — un solo diseño para todos).
- `vercel.json` tiene un rewrite catch-all (linea 81-84) que manda cualquier path desconocido a `/landing.html`. Cambiarlo a `/index.html` (o sacarlo, dejando que Vercel sirva el SPA por defecto).
- `landing.html` como archivo: **no borrarlo de golpe**. Tiene metadata SEO (Open Graph, JSON-LD `LocalBusiness`, canonical, Twitter card) que hoy NO existe en `index.html`. Antes de tocarlo: portar ese `<head>` (lineas 19-51 de landing.html) a `index.html`, para no perder SEO. Despues, convertir `landing.html` en un archivo minimo que redirija (301 via meta-refresh o un rewrite en `vercel.json`) a `/`, para no romper links externos/backlinks que ya apunten a `/landing.html`.
- Grep final: confirmar que nada en `admin.html`, `mechanic.html`, emails (`api/send-email.js`), `sitemap.xml`, `robots.txt` siga apuntando a `/landing.html` como destino activo.
- Borrar los dos planes viejos contradictorios (`2026-06-16-spa-unification.md`, `2026-06-16-landing-full-desktop-app.md`) de `docs/superpowers/plans/`.

### SESION 6 — QA cruzado + actualizar documentacion

- Probar en mobile real (no solo localhost): PWA install, safe-area insets, Apple/Google Pay button.
- Confirmar que `admin.html`/`mechanic.html` (paneles internos, no de cliente) se quedan con su estilo actual — no entran en esta unificacion salvo que digas lo contrario.
- Actualizar `CLAUDE.md`: la seccion "Brand / new design system" documenta los tokens oscuros viejos como fuente de verdad — reemplazar por los tokens claros nuevos para que no quede desactualizado.

---

## (3) Routing — que se simplifica

Hoy hay DOS capas de redireccion, no una:

1. **Cliente** (`index.html` lineas 5-7): JS que detecta User-Agent y manda desktop a `/landing.html`.
2. **Servidor** (`vercel.json` rewrite catch-all): cualquier path sin extension conocida → `/landing.html`.

Con la unificacion, la capa 1 se borra completo (Sesion 5). La capa 2 se reapunta a `/index.html` en vez de `/landing.html` (o se elimina, dejando el comportamiento default de Vercel). El router interno (`js/router.js`, hash-based) sigue exactamente igual — no hace falta cambiarlo, ya es capaz de manejar todas las pantallas. Resultado: una sola capa de routing (el hash router), nada de middleware de deteccion de dispositivo.

---

## (4) Riesgos concretos y como se protegen

| Riesgo | Evidencia concreta | Mitigacion |
|---|---|---|
| Texto de tarjeta Stripe invisible (blanco sobre blanco) | `js/stripe.js` linea ~33 hardcodea `color:'#FFFFFF'` | Corregir en Sesion 1, antes de tocar nada mas — es la funcionalidad de pago que recien armamos hoy |
| Colision de clase `.service-card` (marketing vs booking) | Definida en `landing.html` inline y en `css/main.css` con estilos opuestos | Renombrar una de las dos ANTES de fusionar CSS (Sesion 2) |
| Colores de estado hardcodeados en JS, no en CSS vars | `js/components.js` lineas 122-129 (`createBookingCard`) | Revision visual manual en Sesion 1, no asumir que se ven bien solo porque "tienen alpha" |
| Perdida de SEO (Open Graph, JSON-LD, canonical) | Esos tags solo existen en `landing.html`, no en `index.html` | Portar el `<head>` completo antes de tocar el destino de `landing.html` (Sesion 5) |
| Romper el flujo de booking/fee que armamos hoy al mover HTML | Reestructurar el home screen no deberia tocar `[data-screen="payment"]` etc, pero un error de copy-paste si podria | Despues de CADA sesion, repetir el test end-to-end con el override local (`stripe.js` hostname check) antes de pasar a la siguiente |
| Romper login (Google OAuth / email) al re-temar inputs | `.form-input` ya usa `var()`, bajo riesgo, pero no verificado visualmente | Test manual de los 3 flujos de login en Sesion 4 |
| Tres planes contradictorios conviviendo en docs/ | Confirmado: los 2 planes de hoy nunca se ejecutaron | Borrar los 2 planes viejos en Sesion 5, una vez confirmes que este es el camino |

---

## (5) Estimacion honesta de sesiones

| Sesion | Contenido | Tiempo estimado |
|---|---|---|
| 1 | Tokens de diseño + fuente + fix Stripe Card Element + revision hex hardcodeados | 45-60 min |
| 2 | Home absorbe contenido de landing + resuelve colision `.service-card` | 50-70 min |
| 3 | Re-tema booking/payment + test end-to-end del fee | 40-50 min |
| 4 | Re-tema tracking/login/profile/my-bikes/AI diagnosis | 45-60 min |
| 5 | Routing (vercel.json + index.html) + destino de landing.html + limpieza de planes viejos | 40-50 min |
| 6 | QA mobile real + actualizar CLAUDE.md | 30-40 min |
| **Total** | | **~4 a 5.5 horas, en 6 sesiones separadas** |

Esto es comparable en tamaño a todo el Track B del plan original del consultor (B1-B6, ~4h40min) — no es una tarea chica. La diferencia es que ahora no se construye un SPA shell desde cero (ya existe y funciona), el trabajo es 100% visual + remover duplicacion, por eso es factible en este rango en vez de mas.
