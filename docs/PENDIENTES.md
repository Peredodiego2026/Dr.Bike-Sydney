# Dr. Bike Sydney — Pendientes al 22 Jun 2026

## Estado actual del repo
- Branch activa: `fix/mobile-buttons`
- Tag checkpoint: `checkpoint-22jun2026-estable`
- Deploy: drbikesydney.com.au (Vercel, alias apunta a ultimo deploy)
- SW version: `drbike-static-v15` (cache busting aplicado 22 Jun)

## Lo que funciona (confirmado en PC)
- Booking wizard completo: Step 1 (service cards + chips de categoria + AI diagnosis), Step 2 (calendario navegable + slots), Step 3 (summary), pago Stripe
- Auto-advance: seleccionar service card avanza automaticamente a Step 2
- Landing page (landing.html): booking flow, reviews, WhatsApp
- Admin dashboard: sidebar, KPIs, tabla bookings, await loadDashboard() race condition fix
- Mechanic app: login PIN 3250, nombre mecanico, pantalla login navy

## Lo que NO funciona o esta pendiente de verificacion

### Mobile (index.html en celular)
- [ ] VERIFICAR post-deploy v15: botones "Book a Service", bottom nav, service cards
- [ ] Cache del browser - pedir a Diego que fuerce recarga (pull-to-refresh o borrar cache)

### Bugs pendientes mechanic.html
- [ ] BUG GPS: 401 Unauthorized en mechanic_locations (fix existe en stash@{0} - handleMechanicLocation en api/auth.js)
- [ ] BUG History: "No previous services found" - RLS bloquea (fix existe en stash@{0} - handleClientHistory en api/auth.js)
- [ ] BUG Mobile buttons cortados: .actions necesita CSS grid 2 columnas (fix existe en stash@{0} - css/mechanic.css)
- [ ] BUG Admin mobile KPI cards cramped (BUG 5)
- [ ] BUG "View all ->" en admin bookings no navega (BUG 6)

### Fixes en stash@{0} que aun NO estan en produccion
stash@{0} contiene (WIP on main: 9b1b2e0):
- api/auth.js: handleMechanicLocation + handleClientHistory + rate limit diferenciado
- js/mechanic.js: upsertLocation via /api/auth, openClientHistory via /api/auth, client_id fix, window._supabase -> sb
- css/mechanic.css: .actions grid 2 columnas
- css/admin.css: .sidebar z-index 1000
- js/admin.js: await loadDashboard()

### Track A pendiente (del plan de auditoria Jun 2026)
- [ ] A1: Seguridad critica (Eruda en mobile_latest.html, XSS emails, admin extension, Maps key)
- [ ] A2: Auth server-side + RLS Supabase (bookings sin RLS - script add-bookings-rls.sql comentado)
- [ ] A3: Limpieza dead code (mobile.html, v2, v3, index-redesign.html, admin.html.bak, etc.)
- [ ] A4: Bug fixes (stripe-webhook B01, send-email B02, WhatsApp B03, anthropic-ai/sdk B04)
- [ ] A5: Modularizacion frontend
- [ ] A6: Produccion readiness (SW cache strategy, rate limit Upstash, Apple Pay/Google Pay, health check)

### Track B pendiente
- [ ] B1-B6: Rediseno UI completo (en espera de completar Track A)

### Otros
- [ ] GPS tracking real integration con track.html map
- [ ] Cancel/reschedule self-service para clientes
- [ ] bike_id column en tabla bookings
- [ ] Stripe LIVE end-to-end test completo
- [ ] Apple Pay: canMakePayment() retorna null en Safari iPhone (pendiente A6)

## Stashes activos
```
stash@{0}: WIP on main: 9b1b2e0 - fixes M1-M5 mechanic + GPS + History (NO deployados)
stash@{1}: [aplicado en ccf23eb - ya en produccion]
stash@{2}: WIP on main: 328627d - Apple Pay conflicts
stash@{3}: WIP on main: 5cf52c0 - Rediseno mobile-first
```

## Commits de referencia
- `676ca3ee` - Checkpoint conocido bueno (Jun 20 21:46) - calendar, auto-advance, chips
- `ccf23eb`  - Estado actual main: 676ca3e + stash@{1} aplicado
- `1fb3363`  - Cache busting v15 (rama fix/mobile-buttons)
- `checkpoint-22jun2026-estable` - Tag de seguridad (apunta a 1fb3363)

## Para aplicar los fixes del stash@{0} (cuando esten listos)
```bash
git stash apply stash@{0}
# verificar conflictos
node --check js/mechanic.js api/auth.js
git add -A
git commit -m "fix: mechanic GPS location + client history via server-side API"
npx vercel --prod
```
