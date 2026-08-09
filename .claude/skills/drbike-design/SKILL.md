---
name: drbike-design
description: Sistema de diseño anti-slop para Dr.Bike Sydney. Aplicar SIEMPRE que se diseñe o modifique cualquier UI en este proyecto (mobile SPA, landing, admin, mechanic, track). Vanilla JS, no React.
---

# Dr.Bike Design System

## Principio central: Anti-slop

Inspirado en el framework Taste + principios Impeccable. Evitar el look generico de IA:
- NO: cards identicas sin jerarquia, gradientes azul-purpura uniformes, sombras suaves en todo
- NO: cero diferenciacion visual entre elementos de igual tipo
- NO: centrado universal sin razon
- SI: jerarquia clara, acentos de color funcionales, elementos que comunican su funcion

---

## Tokens de diseño (del proyecto)

**Usar SIEMPRE `var(--token)`, nunca el hex.** La unica fuente de verdad es
`css/variables.css`, que cargan las **cinco** superficies. Los hex de abajo
estan solo para reconocerlos al leer codigo viejo.

**No copies un hex de esta tabla a codigo nuevo.** `npm run check` corre
`scripts/color-check.mjs`, que tiene un presupuesto de hex por archivo y falla
si sube. Esa es la razon por la que esta tabla ya no puede hacer el daño que
hizo (12.14).

```
--blue:      #2563eb   (primary)
--blue-dark: #1e40af
--blue-lt:   #eff6ff
--green:     #15803d   (success)
--amber:     #b45309   (warning)
--red:       #cf2020   (danger)
--navy:      #0d1f3c   (texto oscuro)
--gray:      #475569   (texto secundario)
--gray-lt:   #94a3b8
--border:    #e2e8f0
--border-lt: #f1f5f9
--surface:   #f8fafc   (fondo de cards)  [alias: --off]
--white:     #ffffff
```

**Esta tabla estuvo MAL hasta el 2026-08-02** y ese error es el origen del
punto 12.14 de `docs/PENDIENTES.md`. Decia `#1848C8`, `#059669`, `#6B7280`,
`#E5E7EB`, `#F3F4F6` y `#F9FAFB` - valores que **no define ningun archivo de
tokens**: son de `track.html` y de `css/landing.css`. Seguir este skill al pie
de la letra *producia* hex fuera de token, 335 apariciones contadas en las tres
superficies auditadas.

**Cerrado el 2026-08-09:** `css/landing.css:2` ya no abre un segundo `:root`, y
`track.html` ya no declara paleta propia. **Las cinco superficies resuelven
todos los tokens al mismo valor**, asi que cualquier pagina sirve de
referencia. Este skill mentia sobre eso hasta hoy.

Ademas hay **16 tokens mas** que antes se escribian a mano en varias
superficies a la vez: `--purple` / `--purple-lt`, `--blue-soft`, `--blue-edge`,
`--blue-deep`, `--blue-tint`, `--amber-bright` / `--amber-ink` /
`--amber-tint`, `--red-bright` / `--red-edge`, `--green-bright` /
`--green-ink` / `--green-tint`, `--slate`, `--cyan`. **No los colapses** contra
`--amber` / `--green` / `--red`: `--amber-bright` es el ambar de una estrella
de rating, `--green-bright` es "va en camino", no "terminado".

Una cosa que conviene saber al tocar CSS:

- `css/mechanic.css` y `css/admin.css` redefinen tokens, pero **solo
  dentro de `[data-theme='dark']`**. Eso es tematizado correcto, no deriva: un
  hex crudo ahi no lo puede pisar el tema oscuro, que es lo que dejo
  "No jobs today" a 1.03:1 de contraste (12.15).

Status colors. **Estos son los nombres, no los hex** - los seis eran hex
sueltos hasta el 2026-08-09:

```
pending:     var(--amber-bright)
confirmed:   var(--blue-deep)
enroute:     var(--green-bright)
in_progress: var(--green-bright)
completed:   var(--slate)
cancelled:   var(--red-bright)
```

El texto de un chip va sobre su `-lt`, no sobre blanco: `var(--green-ink)`
sobre `var(--green-lt)`, `var(--amber-ink)` sobre `var(--amber-lt)`. Los chips
son 12px en negrita, que para WCAG es texto normal: el minimo es **4.5:1**, no
3:1 (13.11).

---

## Reglas de jerarquia visual

### Tipografia
- Titulo/accion principal: 15-16px, font-weight:700, color navy
- Subtitulo/meta: 12-13px, font-weight:400, color gray (var(--gray))
- Badge/label: 11-12px, font-weight:600, color segun status
- Nunca mismo peso visual entre titulo y subtitulo

### Spacing (sistema de 4px)
- Padding card: 14px 16px
- Gap entre elementos dentro de card: 4-6px
- Gap entre cards: 10-12px
- Padding de contenedor/screen: 16px horizontal, 20px vertical

### Bordes y sombras
- Cards: border-radius:12px, border:1px solid var(--border)
- Sombra solo en modales/overlays: box-shadow:0 4px 24px rgba(0,0,0,0.12)
- NO sombras decorativas en cards de lista
- Acento de status: borde izquierdo de 3-4px con color del status (NO sombra de color)

---

## Patrones de componentes

### Card de lista (booking, job, servicio)
```
[borde-izq color-status] [icono/avatar] [titulo bold] [badge status derecha]
                          [subtitulo gris]              [flecha › ]
```
- Borde izquierdo: 3px solid [color-status]
- Flecha › a la derecha indica clickeable
- Cursor: pointer siempre en cards clickeables
- Hover: background levemente mas oscuro (rgba(0,0,0,0.02))

### Botones
- Primary: background var(--blue), color var(--white), padding 12px 20px, border-radius:8px, font-weight:700
- Secondary: background transparent, border:1.5px solid var(--border), color var(--navy)
- Destructivo: border:1.5px solid var(--red-lt), color var(--red)
- Nunca disabled sin razon visual clara (opacity:0.5 + cursor:not-allowed)

### Estados vacios (empty state)
- Icono grande (32-48px emoji o SVG)
- Titulo en navy bold
- Subtitulo descriptivo en gray
- CTA opcional si hay accion posible

### Contenedores scrolleables
- Siempre overflow-y:auto en listas que pueden crecer
- max-height calculado: calc(100vh - [altura navbar] - [altura header] - [padding])
- En mobile SPA: restar ~56px bottom nav + ~56px top header = calc(100vh - 112px - extras)

### Badges de status
```css
padding: 3px 10px;
border-radius: 20px;
font-size: 11px;
font-weight: 600;
background: var(--green-lt);
color: var(--green-ink);
```

**La receta vieja era `background: [color]15`** - pegarle `15` al final de un
hex para sacar un 8% de opacidad. **Eso no funciona con `var()`**: no se puede
concatenar. Por eso existen los `-lt` y los `-ink`. Si hace falta una opacidad
que no tiene token, `color-mix(in srgb, var(--green) 8%, transparent)`, nunca
un hex nuevo.

---

## Reglas mobile-first (SPA index.html)

- Touch targets minimo 44px alto
- Padding horizontal siempre 16px (nunca menos en mobile)
- Bottom nav fijo: restar 56px de cualquier contenedor full-height
- Listas: siempre scrolleables, nunca overflow hidden en contenedores de lista
- Feedback inmediato en tap: cambio visual en <100ms

---

## Lo que NO hacer (anti-patterns detectados en el proyecto)

- NO inline style con colores hardcodeados cuando el token ya existe
- NO cards sin indicador de que son clickeables (cursor:pointer + flecha o chevron)
- NO contenedores sin overflow-y:auto cuando el contenido puede crecer
- NO igual peso visual para nombre y fecha en una card
- NO padding:0 en contenedores de lista (siempre al menos 16px horizontal)
- NO botones sin estado disabled visible cuando estan procesando

---

## Cuando aplicar este skill

Activar ANTES de escribir cualquier HTML/CSS inline en:
- js/app.js (screens del SPA mobile)
- landing.html (panel cuenta, modales, booking flow)
- mechanic.html / js/mechanic.js (cards de jobs, modales)
- track.html (picker de bookings, status cards)
- admin.html (tablas, forms)

Proceso:
1. Leer los tokens de este skill
2. Identificar el patron de componente (card lista, modal, empty state, etc.)
3. Aplicar spacing, jerarquia y reglas antes de escribir el HTML
4. Verificar: hay jerarquia clara? el elemento clickeable lo parece? hay scroll si la lista crece?
