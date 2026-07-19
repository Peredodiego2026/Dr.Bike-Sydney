# ROADMAP — Dr. Bike Sydney (actualizado 2026-07-19)

Meta: **la mejor aplicación del mundo en servicio de mecánica de bicicletas a domicilio.**
Regla de lectura: cada fase tiene una PUERTA (gate). No se pasa a la siguiente sin cruzarla — features nuevas no compensan fundamentos rotos.

## Julio 2026 — Terminar la base (en curso)
- [x] Fase 0 completa: 12 tareas del rediseño (Home + Cuentas + Medallas), mergeado a main (PR #5, 13 Jul)
- [x] Stripe LIVE test end-to-end: Diego confirmó cobro real con Apple Pay funcionando perfecto (13 Jul)
- [ ] Prueba manual del GPS del mecánico (pin en vivo) - único pendiente de esta puerta
- [x] Merge del PR #5 (dispara deploy, SW v25/v26)
- [x] Branch protection + blindaje de seguridad + smoke tests verdes (hecho 11 Jul)
- [x] Post-Fase 0: fixes de idioma (secciones de marketing sin traducir), próximo servicio a 3 meses fijo, ícono del nav (PR #25, 13 Jul)

**Puerta de salida:** un cliente puede reservar, pagar de verdad, trackear al mecánico y recibir invoice — sin intervención manual de Diego.

## Agosto 2026 — Launch readiness
- [x] Auditoría de producción (19 Jul): SEO (sitemap tenía 28 URLs fantasma sin contenido
      real - eliminadas), accesibilidad (16 inputs sin aria-label - corregido), errores
      (0 P0 en logs de Vercel de los últimos 7 días - solo ruido de deprecation warning +
      2 fallos aislados de push/WhatsApp, no accionables). Lighthouse formal (Chrome
      DevTools) no corrido - el resto de la auditoría no encontró bloqueadores para eso.
- [x] Lighthouse 85→90 (task Jul, imágenes/cache) - hero-van.webp, cache headers
- [x] Multi-idioma 100%: landing.html (PR #31/#32) + SPA móvil (auditado 19 Jul - el
      wizard de reserva ya estaba ~95% traducido; el gap real era showToast() nunca
      pasaba por el traductor - PR #41 lo cerró, 37 strings ES/ZH agregadas)
- [x] Fotos antes/después en el flujo del mecánico
- [x] Tests e2e del SPA móvil: tests/e2e/mobile-spa.test.js ya cubre home, precios en
      vivo, estado de auth, bottom nav, cambio de idioma (ambas direcciones), login
- [x] Onboarding de mecánicos (MECHANIC-ONBOARDING.md, PIN desde Admin PR #30) +
      dashboard de métricas (Admin Analytics)
- [x] Predictive maintenance MVP: ya en producción, más completo que un MVP -
      api/send-cron.js?type=service corre a diario (9am), 2 niveles: fecha que fija el
      mecánico manualmente (prioridad 1), fallback automático por tipo de servicio
      (Tune-Up 6m / Standard 9m / Major-Ultimate-Overhaul 12m, prioridad 2), con
      deduplicación vía next_service_reminder_sent. bookings.bike_id confirmado en uso
      (historial de servicio por bici en Mis Bicis).

**Puerta de salida:** checklist pre-launch 100% + 2 semanas sin bugs P0. Casi todo
verificado 19 Jul - falta solo la ventana de "2 semanas sin bugs P0" en sí (empieza a
correr desde que julio cierre) y la prueba manual del GPS pendiente en la puerta de julio.

## Septiembre 2026 — Soft launch (primavera = temporada alta de ciclismo)
- [ ] Google Business Profile completo + sistema de reseñas corriendo (pedir tras CADA trabajo)
- [ ] Plan de contenido activo (ver docs/PLAN-CONTENIDO.md): 3 piezas/semana
- [ ] Medir el funnel real: visitas → reservas → completadas → reseñas
- [ ] Campaña "prepara tu bici para primavera"

**Puerta de salida:** ≥ 8 reseñas nuevas/mes y conversión medida (no adivinada).

## Octubre 2026 — LAUNCH completo
- [ ] Todo el funnel automático y estable en plena temporada
- [ ] Primeras membresías vendidas (Basic/Standard/VIP)
- [ ] Referidos activos ("recomienda y ambos ganan")

**Puerta de salida:** métrica norte estable — reservas completadas/semana creciendo 4 semanas seguidas.

## Nov–Dic 2026 — Growth de temporada alta
- [ ] Push de membresías (la palanca #1: recurrencia)
- [ ] Recordatorios post-servicio ("tu bici cumple 6 meses")
- [ ] Evaluar capacidad: ¿segundo mecánico / segunda van? SOLO si la zona actual está saturada con rating ≥ 4.8

## 2027 H1 — Escalar lo que retiene
- [ ] B2B: flotas de delivery, bicicletas corporativas, overflow de bike shops
- [ ] Predictive maintenance como diferenciador visible (nadie más lo tiene)
- [ ] Blindaje semestral #2: **11 de enero 2027** (Google Calendar ya avisa)
- [ ] Revisar marca registrada (estrategia figurativa, abogado post-agosto)

## Reglas de decisión permanentes
1. No marketing pagado hasta que la landing convierta y las reseñas fluyan.
2. No expansión de zona/flota hasta rating ≥ 4.8 y capacidad saturada.
3. No features nuevas mientras haya bugs P0 abiertos.
4. Retención > adquisición, siempre: no escalar lo que no retiene.
5. Todo se mide contra la métrica norte: **reservas completadas por semana**.
