# ROADMAP — Dr. Bike Sydney (actualizado 2026-07-11)

Meta: **la mejor aplicación del mundo en servicio de mecánica de bicicletas a domicilio.**
Regla de lectura: cada fase tiene una PUERTA (gate). No se pasa a la siguiente sin cruzarla — features nuevas no compensan fundamentos rotos.

## Julio 2026 — Terminar la base (en curso)
- [ ] Fase 0 completa: 12 tareas del rediseño (Home + Cuentas + Medallas) en rama `fase0-home-cuentas-medallas`, verificadas en preview (3 idiomas, precios en vivo)
- [ ] Stripe LIVE test end-to-end: cobro real → webhook → invoice → email (+ fix Apple Pay `canMakePayment()` / Google Pay)
- [ ] Prueba manual del GPS del mecánico (pin en vivo)
- [ ] Merge del PR #5 (dispara deploy, SW v25)
- [x] Branch protection + blindaje de seguridad + smoke tests verdes (hecho 11 Jul)

**Puerta de salida:** un cliente puede reservar, pagar de verdad, trackear al mecánico y recibir invoice — sin intervención manual de Diego.

## Agosto 2026 — Launch readiness
- [ ] Auditoría de producción completa (performance, SEO, accesibilidad, errores)
- [ ] Lighthouse móvil ≥ 90 (baseline hoy: landing.html = 255 KB solo HTML — primer candidato a dieta)
- [ ] Multi-idioma 100% (ES/ZH en todo el flujo de reserva)
- [ ] Fotos antes/después en el flujo del mecánico (alimenta el plan de contenido)
- [ ] Tests e2e del SPA móvil (hoy solo landing tiene cobertura)
- [ ] Onboarding de mecánicos nuevos + dashboard de métricas de negocio
- [ ] Predictive maintenance MVP (verificar `bookings.bike_id` primero)

**Puerta de salida:** checklist pre-launch 100% + 2 semanas sin bugs P0.

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
