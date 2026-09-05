# Auditoria pre-lanzamiento - la lista, reconstruida

**Estado al 2026-09-05: los 20 puntos identificados. 18 cerrados.**

Los tres que faltaban (6, 16, 18) se recuperaron de los transcripts de sesion
- ver la seccion "Los tres puntos que faltaban". El **6** resulto estar
cerrado y ahora tiene guard. Los otros dos siguen abiertos y **ninguno es
deuda de codigo**: el 16 espera datos locales que Diego solo puede dar desde
Sydney (nov-2026), y el 18 espera clientes reales.

## Por que este archivo existe

La auditoria de 20 puntos se corrio a fines de agosto de 2026 y **nunca se
escribio como lista en ningun archivo del repo**. Vivia en el chat donde se
hizo. Lo unico que quedo fueron menciones sueltas ("punto 14", "punto 5") en
`docs/PENDIENTES.md` y dos lineas en `CONTEXT.md` que se contradicen entre si:

- `CONTEXT.md:73` (bloque del 30-ago): *"10 de 20 puntos de la auditoria cerrados"*
- `CONTEXT.md:136` (bloque mas viejo): *"A 20-point pre-launch audit exists and
  none of it is fixed yet"*

La segunda es de un bloque anterior y quedo mas abajo en el archivo pero se sigue
leyendo como si fuera el estado actual, asi que quien la encuentre primero se
lleva el dato equivocado. **Este archivo reemplaza a las dos.**

## Como se reconstruyo

Cada fila sale de evidencia en el repo, no de memoria:

1. `git grep` de `"Auditoria pre-lanzamiento, punto N"` sobre `docs/PENDIENTES.md`
   (8 puntos citan el enunciado original textual).
2. `git grep` de `"Punto N"` al inicio de las secciones 70 a 77 de
   `docs/PENDIENTES.md` (9 puntos mas).
3. `git log --grep` sobre los commits de la sesion de auditoria.

Los puntos **6, 16 y 18** no aparecen en ninguna parte. No se inventan aca. Si
alguien recupera el chat original, se agregan; hasta entonces quedan como hueco
declarado, que es distinto de "cerrado".

## La lista

| # | Que pedia | Estado | Evidencia |
|---|---|---|---|
| 1 | Endurecer las cabeceras de seguridad (CSP, HSTS, frame options) | CERRADO | PENDIENTES 74. Se quitaron 4 hosts permitidos sin uso (mapbox x2, gstatic, facebook), verificado por grep sobre todos los `.html` y `.js` |
| 2 | *"La clave anonima esta en el JS, como corresponde; toda la proteccion real es Row Level Security. Probalo."* | CERRADO | PENDIENTES 58. RLS estaba bien; **las vistas publicas la esquivaban** y servian los `tracking_token` de todas las reservas. Guard vivo: `npm run rls:check` |
| 3 | El PIN del mecanico es de 4 digitos y es lo unico que protege la app | CERRADO | PENDIENTES 60 (el bloqueo cubria 1 de 14 rutas) + PR #398. PINs nuevos de 6 digitos con `crypto.randomInt` |
| 4 | *"El servidor recalcula la tarifa por zona y reembolsa si no coincide"* - probarlo bajo carrera | CERRADO | PENDIENTES 76. Se dispararon las dos carreras del cobro; aparecieron y se cerraron 3 bugs vivos |
| 5 | Decidir y aplicar si el link de seguimiento caduca, cuando, y que largo tiene | CERRADO | PENDIENTES 72. El largo ya estaba bien (UUID v4, 122 bits); **no caducaba nunca**, y seguia sirviendo direccion y PIN de llegada meses despues |
| 6 | ABN y GST visibles, y en las facturas *(recuperado 2026-09-05)* | CERRADO | PENDIENTES 102. La factura ya tenia las tres cosas que la ATO exige: `Tax Invoice`, ABN y GST desglosado. Lo que faltaba: el ABN estaba escrito a mano en **45 archivos** sin nada que los atara. Guard vivo: `npm run check` -> `abn-check.mjs`, que ademas valida el **checksum de la ATO** |
| 7 | Analytics corriendo antes de que nadie acepte cookies | CERRADO | PENDIENTES 62. Eran **44 paginas**. Guard vivo: `consent-gate.mjs`, hoy 95 tags gateados en 48 paginas |
| 8 | El aviso de no-reembolso tiene que llegar antes del boton de pago y no chocar con la ACL | CERRADO | PENDIENTES 73. La primera mitad ya estaba; la segunda no: *"is not refunded"* a secas es una afirmacion enganosa sobre derechos que la ACL no deja excluir |
| 9 | *"Si un cliente pide 'borren todo lo mio' o pide una copia de sus datos, hoy no hay forma."* | CERRADO | PENDIENTES 63. `npm run privacy:export` y `npm run privacy:forget`. El hueco no era el boton: era que la promesa de `privacy.html` no se podia ejecutar |
| 10 | *"js/app.js pesa 295 KB... el cliente se baja el asistente entero, el mapa, Stripe y el chat antes de ver un precio"* | CERRADO, y el enunciado era falso | PENDIENTES 70. Medido contra produccion: app.js viaja en **78 KB** (Vercel comprime), Stripe y el mapa se cargan cuando se usan. Lo real estaba al lado: `js/i18n.js` mandaba los 3 idiomas a todo el mundo (64 KB). Ahora cada visitante baja el suyo |
| 11 | Imagenes sin dimensiones declaradas | CERRADO | PENDIENTES 75. 13 de 16 `<img>` sin `width`/`height`, 14 sin `loading`. Guard vivo: `npm run attrs:check` |
| 12 | *"Nunca puede existir un cobro sin reserva... si el cobro ya salio, se reembolsa solo, sin que nadie tenga que mirar"* | CERRADO | PENDIENTES 59. Habia 3 redes; la tercera mandaba un WhatsApp pidiendole a Diego que mirara, que es lo contrario de la regla |
| 13 | Accesibilidad de teclado: foco visible y saltar al contenido | CERRADO | PENDIENTES 65. 6 reglas con `outline:none`, 4 en la regla base. Guard vivo: `npm run a11y:check` |
| 14 | Contraste del modo oscuro: el check exigia 3:1 cuando AA pide 4.5:1 | CERRADO | PENDIENTES 71. Peor: 6 acentos fallaban en los **dos** papeles a la vez. Se separaron texto y relleno en tokens distintos. Guard vivo: `dark-theme-check.mjs`, hoy 4.50:1 en los dos |
| 15 | *"Que anuncie el cambio de paso, que lea los errores al ocurrir, y que el mapa tenga alternativa en texto"* | CERRADO EN CODIGO, **sin probar con lector real** | PENDIENTES 66. Habia 2 regiones `aria-live` y las dos eran spinners. `announce()` en `js/components.js`. Nadie lo corrio con NVDA/VoiceOver |
| 16 | Paginas de suburbio: comparten el mismo texto con el nombre cambiado | **ABIERTO, bloqueado hasta noviembre** | Son **60** (20 suburbios x 3 idiomas), y de 198 lineas solo difieren 12: **94% identicas**, que es la definicion de *doorway page* de Google. No se arregla escribiendo mas: necesita datos locales reales que Diego solo puede dar cuando este en Sydney (primera semana de nov-2026) |
| 17 | *"No sabemos en que paso exacto se va la gente"* | CERRADO, y el enunciado era falso | PENDIENTES 75. Los 5 pasos ya se median. Lo que faltaba era el **por que** de la ultima caida: llego al pago y no pago |
| 18 | Prueba social: 0 resenas, 0 perfiles de mecanico, 0 fotos de trabajos | **ABIERTO, y no es codigo** | La auditoria lo llamo *"el unico bloqueante real del lanzamiento"*. El sistema de captacion **ya esta armado y con guards** (PENDIENTES 89-91, y la seccion de abajo); lo que falta son clientes reales, que es cosa de Diego, no del repo |
| 19 | *"Supabase los hace, pero nadie restauro uno nunca"* | CERRADO, y la realidad era peor | PENDIENTES 61 + 77. **No habia ningun backup**: el plan Free de Supabase no los incluye. Hoy hay volcado nocturno a JSON por mail y la restauracion se probo, no se supuso |
| 20 | *"Sentry esta cargado. Alguien mira los errores?"* | CERRADO | PENDIENTES 74. Reportaban **5 de 28** archivos de `api/`. Los 8 endpoints publicos que faltaban quedaron envueltos en `withSentry` |

## Verificado hoy (2026-09-03), no heredado

Corrido sobre `origin/main` en `3c4739b`, juzgado por codigo de salida:

| Comando | Resultado |
|---|---|
| `npm run check` (11 scripts) | exit 0 |
| `npx vitest run` | **1348 tests, 96 archivos, 0 fallas** |
| `npm run rls:check` (contra produccion, con la anon key) | exit 0 - 17 tablas/vistas cerradas, 4 publicas sirviendo a proposito |
| La consulta de `docs/RUNBOOK-SQL.md`, corrida por Diego en Supabase | `Success. No rows returned` - **las 41 migraciones aplicadas**, cero pendientes |

## Los tres puntos que faltaban, recuperados (2026-09-05)

Los puntos **6, 16 y 18** figuraron como `NO RECUPERADO` desde que se
reconstruyo esta lista: su enunciado solo habia existido en un chat. Se
recuperaron de los transcripts de sesion (`~/.claude/projects/`).

**Como se sabe que son los correctos y no otra lista numerada.** Los
transcripts tienen varias listas con numeros, y las primeras busquedas
devolvieron puntos de tres listas distintas mezclados. El ancla fue el
**punto 15**: su texto recuperado -
*"Lector de pantalla - ATENCION. Que anuncie el cambio de paso, que lea los
errores al ocurrir..."* - coincide **palabra por palabra** con lo que esta
tabla ya tenia escrito para el 15. Los cuatro comparten el mismo formato
(`N. **Titulo - ESTADO.**`), que ninguna de las otras listas usa.

El resultado cambia el marcador: **18 de 20 cerrados**, y los dos que quedan
no son deuda de codigo.

---

## Lo que sigue sin probarse

Ninguna de estas tres es codigo faltante. Son cosas que un chequeo automatico no
puede afirmar:

1. **Punto 15 con un lector de pantalla real.** El codigo esta y tiene tests;
   nadie lo escucho.
2. **~~Los 3 puntos no recuperados (6, 16, 18).~~** Recuperados el 2026-09-05
   de los transcripts - ver la seccion de arriba. El 6 estaba cerrado y ahora
   tiene guard; el 16 y el 18 siguen abiertos y ninguno es codigo.
3. **La cadena completa de resena contra produccion.** El disparo
   (mecanico completa -> invoice + email + SMS -> pantalla de resena -> link de
   Google) tiene tests por partes y ninguna corrida de punta a punta con un
   trabajo real. Ver la seccion de abajo.

## Nota sobre la captacion de resenas

Se reviso el 2026-09-03 porque figuraba como pendiente "armar el sistema". **Ya
esta armado**, y con guard:

| Pieza | Donde |
|---|---|
| Mecanico completa -> invoice + email + SMS de resena | `api/_completion-notify.js:88,118,130` |
| Link `drbikesydney.com.au/?review=<id>` | `api/send-email.js:208` |
| La app abre la pantalla con ese parametro | `js/app.js:276` |
| Estrellas + comentario + foto opcional | `js/app.js:3779` |
| Guardado con anti-fraude (409 si ya reseno) | `api/auth.js:3921` |
| Invitacion a resenar en Google, en en/es/zh | `js/app.js:3931` + `js/i18n-es.js` / `js/i18n-zh.js` |
| Guard contra que el link de Google se rompa otra vez | `tests/unit/google-review-link.test.js` |

Lo unico que queda es de Diego y no es codigo:

- El boton cae en la **ficha de Maps** (verificado con curl el 03-sep: redirige a
  "Dr. Bike Sydney", place id `0x6762fdefebf19285:0x52872725f8bdca88`), no en el
  cuadro de escribir resena. Desde Google Business Profile > "Pedir resenas" sale
  un link corto que abre el cuadro directo. Cada tap de mas pierde resenas.
  Cuidado: tiene que ser el id opaco que emite Google, **no** el formato con el
  nombre del negocio - ese es el que ya estuvo muerto meses (ver el comentario en
  `tests/unit/google-review-link.test.js`).
- Probar la cadena entera con un trabajo real completado.
