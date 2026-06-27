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

```
Primary:    #2563eb (electric blue)
Primary-2:  #1848C8 (blue oscuro, headers mechanic/track)
Success:    #059669 (green)
Warning:    #D97706 (amber)
Danger:     #DC2626 (red)
Navy:       #0D1F3C (texto oscuro)
Gray:       #6B7280 (texto secundario)
Border:     #E5E7EB
Border-lt:  #F3F4F6
Surface:    #F9FAFB (fondo de cards)
White:      #FFFFFF
```

Status colors:
```
pending:     #F59E0B (amber)
confirmed:   #0A58CA (blue)
enroute:     #22C55E (green)
in_progress: #22C55E (green)
completed:   #6B7280 (gray)
cancelled:   #EF4444 (red)
```

---

## Reglas de jerarquia visual

### Tipografia
- Titulo/accion principal: 15-16px, font-weight:700, color navy
- Subtitulo/meta: 12-13px, font-weight:400, color gray (#6B7280)
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
- Primary: background #2563eb, color #fff, padding 12px 20px, border-radius:8px, font-weight:700
- Secondary: background transparent, border:1.5px solid #E5E7EB, color navy
- Destructivo: border:1.5px solid #fee2e2, color #DC2626
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
background: [color]15;  /* 15 = ~8% opacity hex */
color: [color];
```

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
