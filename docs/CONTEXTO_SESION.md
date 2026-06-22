## QUIEN SOY
Diego Peredo, fundador de Dr. Bike Sydney - servicio de reparacion de bicicletas a domicilio en Sydney, Australia. Trabajas conmigo como CTO y arquitecto. SIEMPRE respondeme en ESPAÑOL. Codigo y UI en INGLES.

## STACK TECNICO
- Repo: github.com/Peredodiego2026/Dr.Bike-Sydney
- Token GitHub: [REEMPLAZAR CON TOKEN ACTUAL - crear nuevo en github.com/settings/tokens]
- Deploy: SIEMPRE manual → npx vercel --prod (auto-deploy ROTO)
- Vercel Hobby: LIMITE 12 funciones serverless (12/12 - NUNCA crear archivo nuevo en /api/)
- Supabase: tgpipbloisahufaywhqb.supabase.co (Sydney region)
- Supabase Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncGlwYmxvaXNhaHVmYXl3aHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTM4NjgsImV4cCI6MjA5MzQ4OTg2OH0.P1lpqPVmW0HE3PwHeUhRw20eRP3ApdDGYuiwtJhRD9U
- Stripe: LIVE (nunca test), $20 call-out fee
- Email: Resend via noreply@drbikesydney.com.au
- SMS: Twilio al +61433963250
- URL: drbikesydney.com.au
- Admin email: peredo.dm@gmail.com
- PIN mecanico: 3250
- ABN: 87 654 025 267

## ARQUITECTURA
Dos paginas separadas (bifurcacion via middleware.js Edge Function):
- landing.html → PC/desktop (tema claro/blanco, booking bloqueado "Coming Soon" excepto admin)
- index.html SPA → mobile (tema claro/blanco, motor completo)
- admin.html → panel administracion (Diego)
- mechanic.html → app mecanico (PIN 3250, auth via /api/auth server-side)
- track.html → tracking publico (?id=UUID funciona, ?token= bloqueado por RLS)

### RLS (Row Level Security)
ACTIVO en Supabase. mechanic.js y track.html usan cliente anon → RLS bloquea queries directas. Solucion: todo pasa por /api/auth con service key server-side.

### Funciones Serverless (12/12 - LIMITE)
auth.js, chat.js, create-payment-session.js, create-subscription.js, send-cron.js, send-email.js, send-invoice.js, send-message.js, send-push.js, send-reminders.js, stripe-webhook.js, subscribe-newsletter.js

Nuevos endpoints van como ?role= dentro de api/auth.js.
Roles en auth.js: admin, mechanic, mechanic-jobs, mechanic-location, client-history

### Tablas principales en Supabase
- bookings: id, user_id, client_id, client_name, client_email, client_phone, service_name, service_price, scheduled_date, scheduled_time, address, status, callout_fee, stripe_payment_intent_id, van_number, tracking_token, mechanic_id, notes, mechanic_notes
- profiles: id, email, full_name, phone, role, membership_plan, membership_status, membership_started_at, membership_renewed_at, stripe_customer_id, stripe_subscription_id
- bikes: id, client_id, name, brand, model, color, year, type, notes, created_at
- services: id, name, price, category, description, duration_min, duration_max, active (25 servicios, 9 categorias)
- callout_zones: id, name, callout_fee, suburbs, created_at (vacia, fallback $20)
- mechanic_locations: id, mechanic_id, van_number, lat, lng, is_online, updated_at (SIN heading ni booking_id)

### Service Worker
sw.js usa cache-first. Al hacer cambios de JS/CSS, SIEMPRE:
1. Agregar ?v=YYYYMMDD a los scripts en index.html
2. Incrementar CACHE_STATIC version en sw.js (actualmente v15)
Sin esto, mobile sirve JS viejo del cache.

## REGLAS DE ORO (NUNCA VIOLAR)
1. NUNCA onclick inline → siempre addEventListener + data attributes
2. NUNCA catch{} vacio → siempre e.message visible
3. NUNCA columna que no existe → verificar schema antes de INSERT
4. NUNCA nuevo archivo en /api/ → agregar como ?role= en auth.js
5. SQL PRIMERO, codigo despues
6. node --check ANTES de cada deploy
7. npx vercel --prod (unico comando valido)
8. UNA sub-tarea por vez, probar antes de la siguiente
9. NUNCA DELETE sin confirm() del usuario
10. Si algo se rompe: git revert HEAD inmediatamente
11. SIEMPRE incrementar SW cache version + ?v= en scripts al cambiar JS/CSS
12. SIEMPRE commitear los cambios (no dejar en working directory sin commit)

## LECCION CRITICA APRENDIDA
Los cambios que viven solo en el working directory local SIN COMMITEAR se pierden al hacer git reset --hard. SIEMPRE commitear cada fix antes de pasar al siguiente. Un commit por sub-tarea.

## LO QUE FUNCIONA HOY (NO TOCAR)
- Booking end-to-end mobile: servicio → fecha/hora → direccion → pago $20 Stripe → confirmacion
- Notificaciones post-booking: SMS + email admin + email cliente (Promise.allSettled)
- AI Diagnosis: foto o texto → recomienda servicio real de Supabase con precio → Book button
- Memberships: Basic $57 / Standard $97 / VIP $147 con Stripe Checkout + Learn more modal
- My Bikes: guardar, ver, borrar (tabla bikes con columnas correctas)
- My Bookings: upcoming + historial con detalle y cancelacion
- Tracking publico: track.html?id=UUID
- Calendario navegable mes a mes en booking Step 2
- Auto-advance: tap en service card → avanza directo a fecha/hora
- Chips de categorias clickeables en booking Step 1 (9 categorias)
- Servicios agrupados por categoria (25 servicios de Supabase)
- Callout fee $20 rosado en pantalla de pago
- mechanic.html: bookings via /api/auth role:mechanic-jobs (bypasea RLS)
- mechanic.html: GPS via /api/auth role:mechanic-location (bypasea RLS)
- mechanic.html: historial cliente via /api/auth role:client-history
- mechanic.html: telefono y notas del cliente en job cards
- mechanic.html: nombre mecanico correcto (mechanic?.name)
- mechanic.html: WhatsApp formato +61
- Admin: navegacion funciona, sidebar z-index 1000
- Admin: panel Memberships con KPIs y tabla (esperando clientes octubre 2026)
- Admin: Bug B01 corregido (membership_plan en vez de membership)
- Landing PC: booking modal, Learn more en memberships, chips categorias, calendario
- Share tracking link funciona con ?id=
- Home SPA: hero, trust badges, servicios, memberships, about, footer portados de landing
- Navbar desktop visible en index.html (>768px)
- Bottom nav oculto en desktop (>768px)

## PENDIENTES EN ORDEN DE PRIORIDAD

### PRIORIDAD 1: Bugs Mobile (index.html SPA)
- Verificar que cache busting v15 resolvio botones en mobile
- Si persiste: diagnosticar por que los botones no responden en mobile

### PRIORIDAD 2: Bugs Mechanic
- M3 GPS: verificar que /api/auth role:mechanic-location funciona (401→200)
- Botones cortados en mobile: flex-wrap en contenedor de botones de job cards
- WhatsApp: error certificado en Chrome desktop (funciona en celular - bajo impacto)

### PRIORIDAD 3: Admin
- KPI cards ilegibles en mobile (numeros cortados)
- "View all" en Today's bookings no navega → conectar a go('bookings')

### PRIORIDAD 4: PC con usuario logueado
- Panel usuario en landing.html: historial bookings, bicis, perfil
- Se resuelve con Sesion 5 de unificacion

### PRIORIDAD 5: Sesion 5 unificacion
- Una sola pagina (index.html) para PC y mobile
- 2 bugs previos: hero text invisible en desktop + bottom nav visible en desktop
- Eliminar middleware.js bifurcacion

### PRIORIDAD 6: Stripe LIVE
- Primer cobro real end-to-end nunca probado (antes octubre 2026)
- Webhook Stripe no verificado en produccion

### PRIORIDAD 7: Vision producto (docs/superpowers/specs/vision-producto.md)
- GPS real mecanico en track.html
- Fotos antes/despues del servicio
- bike_id en bookings (historial salud por bici - diferenciador mundial)
- Cancel/reschedule self-service
- AI predictiva mantenimiento (2027)

## CONTEXTO DE NEGOCIO
- Cliente real: octubre 2026 (sin urgencia Stripe LIVE)
- 2 vans: Van 1 Inner West/Eastern/CBD | Van 2 North Shore/Manly/Northern Beaches
- 3 staff: Diego + 2 mecanicos
- Precio promedio $109 | Meta 5,070 jobs/año | Break-even 178 jobs/mes
- Slogan: "Healthy Bikes, Happy Riders"
- Contacto: 0433 963 250 | contact@drbikesydney.com.au

## COMO TRABAJAMOS
PLAN → CONFIRMACION MIA → EJECUCION → node --check → DEPLOY → PRUEBA → SIGUIENTE
- Leer docs/PENDIENTES.md al inicio de cada sesion
- Una sub-tarea por vez, sin encadenar
- No ejecutar nada sin mi confirmacion
- Commitear cada fix individualmente (no acumular en working directory)
- Incrementar SW version + cache busting en cada deploy que toque JS/CSS

## AL INICIAR NUEVA SESION
1. Lee docs/PENDIENTES.md del repo
2. Lee docs/superpowers/specs/vision-producto.md
3. Dame un resumen de que ves en el codigo actual
4. Espera mi instruccion de que atacar primero
5. NO ejecutes nada hasta que yo confirme
