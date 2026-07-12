# PLAN DE DISEÑO — Dr. Bike Sydney (2026-07-11)

## Objetivo

Que el diseño **no pueda fallar por proceso**: cada pixel del universo Dr. Bike (SPA, landing, mechanic, admin, track, suburbios) sale del mismo sistema, pasa por los mismos candados, y llega a producción solo después de verificarse. Minimalista y coherente — si dudas entre agregar o quitar, quita.

## Los 3 candados (por qué "no falla")

1. **Tokens únicos** — `css/variables.css` es la única fuente de color, tipografía, radios, sombras, elevación y motion. Primario `--blue` (#1e40af), texto `--navy`, fuente Inter. Nadie inventa un hex: si falta un token, se agrega al archivo, no se hardcodea. *(Este candado ya evitó un error real: un doc tenía el primario viejo #2563eb.)*
2. **Skill obligatoria** — `.claude/skills/drbike-design/SKILL.md` se invoca ANTES de tocar cualquier UI: cards con borde de status, jerarquía 15px bold navy / 12px gris, badges al 8% de opacidad, touch targets ≥ 44px, listas con scroll visible.
3. **Verificación bloqueante** — nada se commitea sin: preview real abierto, 375px Y 1280px, 3 idiomas (EN/ES/ZH) si hay texto, consola limpia, precios en vivo. "Se ve bien en mi cabeza" no es verificación.

## Proceso por cambio de UI

1. Leer la pantalla/archivo completo + buscar todos los usos de lo que se toca.
2. Diseñar con tokens existentes; 3 opciones si es una decisión estética real, elegir una con argumento.
3. Implementar el cambio mínimo. Un cambio por commit. No mezclar rediseño con lógica de negocio (booking/pagos NO se tocan en cambios visuales).
4. Verificar (candado 3) + screenshot desktop y móvil.
5. Commit a la rama de trabajo → PR → check `quality-gate` verde → revisión → merge (= deploy).
6. Si el cambio toca CSS/JS/HTML servido: bump del service worker en el mismo PR (prod hoy: v24; próximo: v25).

## Consistencia entre superficies (la "familia")

| Componente | Regla única en todas las superficies |
|---|---|
| Cards | Borde izquierdo de color por status, flecha derecha, elevación --elevation-0, hover con --elevation-1 |
| Badges | Fondo color al 8% + texto color sólido, radius 20px |
| Botones primarios | --blue, texto blanco, estados completos (hover/active/disabled/loading) |
| Tipografía | Título 15px bold navy / subtítulo 12px gris — nunca igual peso |
| Vacíos y errores | Siempre diseñados: nunca una pantalla en blanco o un error crudo |

Prueba de familia: una card del admin puesta al lado de una del SPA y una del mechanic deben parecer hermanas, no primas.

## Performance como parte del diseño (no un after-thought)

- Presupuesto por página: ≤ 1.5 MB transferido, LCP < 2.5s móvil, Lighthouse ≥ 90.
- Toda imagen nueva: WebP/AVIF, tamaño real de render, lazy bajo el fold, < 200 KB.
- Baseline actual (11 Jul): landing.html = 255 KB solo HTML (monolito de ~2600 líneas con inline styles/scripts) → candidato #1 a dieta en la auditoría de agosto.
- Detalle completo: skill `pwa-cache-performance`.

## Qué NO hacer (lecciones pagadas)

- No frameworks nuevos (React, etc.): el stack es vanilla y así se queda — es una decisión, no una carencia.
- No librerías enteras por una función.
- No rediseños globales de golpe: se avanza por Fases acotadas (como Fase 0), con plan y verificación por tarea.
- No tocar main directo — jamás. Todo por rama + PR (main deploya automático a clientes reales).
- No trabajar sobre resúmenes de otros chats sin verificar el estado real (skill `multi-ai-coordination`).

## Definición de "terminado" para un cambio de diseño

Preview verificado en ambos tamaños e idiomas + consola limpia + screenshot + commit en rama + reporte honesto de qué se verificó y qué no. Recién ahí: "listo".
