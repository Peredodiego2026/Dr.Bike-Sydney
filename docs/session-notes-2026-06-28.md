# Dr. Bike Sydney - Session Notes
**Fecha:** 28 de junio 2026  
**Duracion:** Sesion larga multi-topic  
**Stack:** Vanilla HTML/CSS/JS + Supabase + Stripe + Vercel

---

## Cambios realizados esta sesion

### Monitoreo y analytics (deploy exitoso)
- **Sentry EU** integrado en las 4 apps (landing.html, index.html, mechanic.html, admin.html)
  - CDN: `js-de.sentry-cdn.com` (region de Alemania)
  - DSN configurado como env var en Vercel
  - Session replay + browser tracing activos
- **PostHog EU** integrado en las 4 apps
  - Host: `eu.i.posthog.com`
  - Key: configurada en Vercel + hardcoded en js/analytics.js
  - `person_profiles: 'identified_only'`, pageview + pageleave tracking
- **Mapbox token** agregado como env var en Vercel (para uso futuro en track.html)
- **CSP actualizada** en vercel.json para endpoints EU:
  - `js-de.sentry-cdn.com`, `eu.i.posthog.com`, `*.ingest.de.sentry.io`

### Seguridad - 3 issues cerrados

#### A01 - PIN mecanico independiente
- **Problema:** PIN = ultimos 4 digitos del telefono (cualquiera con el numero podia entrar)
- **Fix:** Nueva columna `pin TEXT` en tabla `escalation_contacts` de Supabase
- **SQL ejecutado:** `ALTER TABLE escalation_contacts ADD COLUMN IF NOT EXISTS pin TEXT;`
- **Codigo:** `api/auth.js` - todas las instancias de `contacts.find(c => c.phone.slice(-4) === pin)` reemplazadas por `contacts.find(c => c.pin === pin)`

#### A02 - 2FA para admin con Google Authenticator
- **Problema:** Admin solo tenia email+password, sin segundo factor
- **Fix completo implementado:**
  - `api/auth.js` - `handleAdmin()` reescrita con flujo MFA de 3 pasos:
    1. Email+password → si hay factor TOTP enrollado, devuelve challenge
    2. TOTP verify → devuelve sesion aal2
    3. MFA enroll (primer uso) → genera QR code via Supabase REST API
    4. MFA enroll-verify → activa el factor
  - `js/admin.js` - UI completa de 2FA:
    - `submitAdminLogin()` - maneja respuesta `mfa_required` y `setup_mfa`
    - `showTOTPInput()` - pantalla de codigo de 6 digitos
    - `submitTOTPCode()` - verifica contra Supabase
    - `_startMFAEnrollment()` - llama API para generar QR
    - `submitMFASetupCode()` - activa el factor con primer codigo
    - `_completeAdminLogin()` - setSession + loadDashboard
- **Complicacion:** Bug en variable `data.temp_token` (debia ser `data.access_token`) detectado con Vercel runtime logs
- **Estado:** Diego enrollo Google Authenticator exitosamente, 2FA activo en produccion

#### A03 - Google Maps API key
- **Conclusion:** No existe ninguna key de Google Maps en el proyecto. App usa Leaflet. Issue cerrado como no-aplica.

### Feature #1 - Desktop booking habilitado
- **Problema:** Boton hero "Booking Coming Soon" deshabilitado para todos los usuarios de PC
- **Fix:**
  - Hero button: habilitado, texto cambiado a "Book a Service"
  - Sub-texto actualizado (removido "coming soon")
  - Event listeners descomentados para hero button
  - Guards de email admin (`=== 'peredo.dm@gmail.com'`) removidos de svc-btn y service-card clicks
  - Bloque admin-only de test booking eliminado
  - `bkProceed()`: si no hay sesion → muestra error + abre auth modal automaticamente

---

## Complicaciones encontradas

| Complicacion | Causa | Resolucion |
|---|---|---|
| "Missing credentials" en admin login | `data.temp_token` en vez de `data.access_token` en branch `setup_mfa` | Detectado con Vercel runtime logs |
| 2FA primer login fallaba silenciosamente | El flow de MFA enrollment llamaba `/api/auth` con `temp_token: undefined` | Fix en variable + cache bust de admin.js con `?v=20260628` |
| CSP bloqueaba Sentry y PostHog | URLs de region EU diferentes a las de la docs principal | Actualizado CSP con endpoints `js-de.sentry-cdn.com`, `eu.i.posthog.com`, `*.ingest.de.sentry.io` |
| Mechanic inventory vacio | Tabla `van_inventory` nunca existio, la correcta es `parts_inventory` con columnas `name`, `stock`, `min_stock` | Fix en `js/mechanic.js` |

---

## Backlog priorizado (lo que queda por hacer)

### TIER 1 - Critico (ingresos o seguridad)
- [x] ~~#1 Desktop booking~~ - COMPLETADO esta sesion
- [ ] #2 Apple Pay / Google Pay - Verificado en Stripe, aparece en iOS, pendiente test real (impuestos)
- [ ] #3 Real-time tracking map - `mechanic_locations` existe, `track.html` tiene Leaflet, falta UI de mapa live
- [ ] #4 Rating y resenas post-servicio - Trigger al completar job → SMS/email con link de rating
- [x] ~~#5 2FA para admin~~ - COMPLETADO esta sesion

### TIER 2 - Alto impacto
- [ ] #6 Reporte PDF post-servicio (jsPDF o PDFmonkey)
- [ ] #7 Fotos antes/despues del job (Supabase Storage + upload en mechanic.html)
- [ ] #8 Bike Health Score (evaluacion por componente, dashboard en account panel)
- [ ] #9 Recordatorio automatico de proximo servicio (crons ya existen, falta logica de fecha)
- [ ] #10 Presupuesto/Quote antes de confirmar booking
- [ ] #11 Disponibilidad real en calendario (bloquear slots ocupados en tiempo real)
- [ ] #12 Waitlist para slots llenos

### TIER 3 - Diferenciadores
- [ ] #13 Programa de referidos ($10 credito por recomendacion)
- [ ] #14 Cuenta corporativa/Fleet (empresas con multiples bikes)
- [ ] #15 Perfil del mecanico visible al cliente
- [ ] #16 Chat live cliente-mecanico (tabla `job_messages` ya existe)
- [ ] #17 Suscripcion: pausa y reanudacion
- [ ] #18 Gift cards
- [ ] #19 Optimizacion de ruta diaria en mapa para admin

### TIER 4 - Analytics y operaciones
- [ ] #20 Conversion funnel real (PostHog ya instalado, falta implementar eventos)
- [ ] #21 Geographic heatmap de clientes
- [ ] #22 Customer LTV y churn
- [ ] #23 Margenes por servicio

---

## Estado tecnico del proyecto

### Infraestructura activa
- **Hosting:** Vercel (deploy manual: `npx vercel --prod`)
- **DB:** Supabase (PostgreSQL + Auth + RLS habilitado en bookings)
- **Pagos:** Stripe LIVE (webhooks verificados)
- **Email:** Resend (noreply@drbikesydney.com.au)
- **SMS/WhatsApp:** Twilio
- **Monitoreo:** Sentry EU + PostHog EU (activos desde esta sesion)
- **Mapbox:** Token configurado en Vercel (pendiente uso en track.html)

### Seguridad
- HSTS + CSP + X-Frame-Options en vercel.json
- Rate limiting: Upstash Redis + fallback en memoria
- Input validation: Zod en todos los endpoints
- CORS: solo drbikesydney.com.au
- Admin: email+password + Google Authenticator (2FA)
- Mecanico: PIN propio en columna `pin` de escalation_contacts

### Deploy
- SIEMPRE manual: `npx vercel --prod` desde `C:\Users\Usuario\Dr.Bike-Sydney`
- Auto-deploy via GitHub ROTO - no usar
- node --check antes de cada deploy
