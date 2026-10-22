# Triage de reserva y cola de revisión

**Fecha:** 22-oct-2026
**Estado:** diseño aprobado por Diego, sin implementar
**Decidido con:** Diego, en conversación del 17 al 22-oct-2026

---

## El problema, en palabras de Diego

> "No podemos llegar donde el cliente y decir: oh sorry, ¿sabés que no podemos
> arreglar esto? Mejor decirle previamente al cliente."

Es imposible tener el repuesto para el 100% de los modelos de freno, de
transmisión y de motor que existen. Hoy la reserva no trae **ningún** dato sobre
qué bici es ni qué le pasa, así que el mecánico se entera al llegar.

Su ejemplo concreto: unas pastillas de **SRAM Maven** o de **Hope V4** no las
tiene; unas de **SRAM Code** o **Shimano SLX** sí. Mismo servicio, mismo precio,
y la diferencia entre un trabajo hecho y un viaje perdido.

---

## Lo que ya existe, y por qué no alcanza

Esto se verificó en el código antes de diseñar nada.

| Capa                        | Hoy                                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Capturar** el problema    | **A medias.** El bloque `#diag-block` en el paso 1 ya toma foto y texto, y `/api/chat?type=diagnose` devuelve diagnóstico, gravedad, urgencia y servicio recomendado |
| **Guardar** en la reserva   | **No existe.** El insert escribe 19 columnas y ninguna es el problema, la foto ni el síntoma. El diagnóstico se usa para recomendar y **se descarta**                |
| **Mostrárselo al mecánico** | **No existe.** `js/mechanic.js` lee tres campos del trabajo: `service_name`, `service_price`, `suburb`                                                               |

La reserva **sí** guarda `bike_id`, así que marca, modelo y tipo están en la base
cuando el cliente tiene una bici cargada — y nadie los muestra.

**La consecuencia de diseño:** el trabajo no está en preguntar, está en
**guardar** y **mostrar**. Una pantalla de preguntas sin esas dos capas muere
donde murió el diagnóstico por IA.

---

## Decisiones tomadas

Cada una con quién la decidió, porque dentro de seis meses nadie se va a
acordar.

| #   | Decisión                                                                                           | Quién                        |
| --- | -------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1   | **Revisión manual**, no motor de reglas. El cliente paga, la reserva queda esperando, Diego decide | Diego, 17-oct                |
| 2   | **B y C juntas**: entrada para el que sabe qué quiere y entrada para el que no                     | Diego, 17-oct                |
| 3   | **Layout "todo a la vista"**, sin desplegar, sin pantalla nueva                                    | Diego, 22-oct                |
| 4   | **Preguntas por categoría**, no por servicio                                                       | propuesto y aceptado, 22-oct |
| 5   | **Foto y video opcionales**, en todos los servicios                                                | Diego, 22-oct                |
| 6   | **La emergencia sale del booking** y vive sobre todo en WhatsApp                                   | Diego, 22-oct                |
| 7   | **El "no" lo decide el cliente**: esperar el repuesto o reembolso                                  | Diego, 17-oct                |
| 8   | **Revisado antes de las 18:00**                                                                    | Diego, 22-oct                |
| 9   | **Reembolso automático a las 24 h** sin respuesta del cliente                                      | Diego, 22-oct                |

### Por qué revisión manual y no automática

Diego tiene hoy **cero clientes cobrados y un solo mecánico**. Un motor de
compatibilidades cruzado contra stock es un proyecto entero, y expone a
**rechazar mal** justo cuando cada cliente cuenta.

Diego quiere ese motor eventualmente, y tiene razón en que lo va a necesitar
para vender el servicio a otras ciudades. **Esta etapa no es un desvío: es el
paso uno.** Un motor así necesita registros de "esta bici, esta marca, este
modelo, ¿pudimos o no?", y hoy no existe ni uno. Cincuenta reservas revisadas a
mano son cincuenta registros con la respuesta correcta puesta por un mecánico.

### Por qué por categoría y no por servicio

El catálogo tiene **33 servicios activos en 9 categorías** (leído de Supabase el
22-oct). Atar las preguntas al nombre del servicio significa que un servicio
nuevo cargado desde Admin entra al wizard **sin preguntas y en silencio**.

Es exactamente el modo de falla que `scripts/services-sync-check.mjs` ya
documenta para las tarjetas de marketing:

> "adding a service in Admin puts it in the booking wizard and the chatbot
> immediately, and on no marketing page ever"

Atado a la categoría, el servicio nuevo hereda las preguntas de su familia el
mismo día. **9 juegos base + 20 excepciones cubren los 33.**

### Por qué las preguntas viven en el código y no en la base

Tentador: una tabla `triage_questions` que Diego edite desde Admin.

**No.** Toda pregunta es texto visible para el cliente, y este repo exige que
todo texto visible exista en inglés, español y chino —
`scripts/i18n-check.mjs` bloquea el merge si falta uno. Una pregunta cargada
desde Admin esquiva ese control y sale a producción en un solo idioma.

Las preguntas son **copy**, y el copy vive donde el control lo alcanza.

---

## Arquitectura

Cuatro partes. Las dos primeras son el mínimo que funciona; las dos últimas
son lo que lo hace útil.

```
  CLIENTE                    BASE                    DIEGO
  ───────                    ────                    ─────
  Paso 1 del booking
  ├ "No sé qué tiene"  ──┐
  └ Elige servicio ──────┤
          │              │
          ▼              │
  Preguntas de su        │
  categoría + foto  ─────┴──▶  bookings.triage   ──▶  Cola de revisión
          │                    (jsonb)                       │
          ▼                                                  │
  Fecha → dirección → paga                                   │
          │                                                  ▼
          ▼                                        Confirmar / Preguntar /
  "Te confirmamos                                   Falta el repuesto
   antes de las 18:00"                                       │
          ◀──────────────────────────────────────────────────┘
```

### 1. Captura — el paso 1 del booking

Dos entradas, un solo destino.

**Entrada B — eligió un servicio.** Hoy tocar una tarjeta de servicio la
**selecciona** (`.selected` + habilita `#s1-continue`); no avanza. Por eso el
triage se despliega dentro de la tarjeta seleccionada, sin pantalla nueva. Es el
patrón que Diego describió: el QR de un restaurante donde los modificadores
aparecen debajo del plato elegido.

**Entrada C — "No sé qué tiene mi bici".** Reemplaza el `#diag-block` actual,
que ya hace el 80% del trabajo. Lo que se agrega: **guardar** el resultado y
**pasarlo** al triage de la categoría del servicio recomendado, con la foto ya
cargada.

Layout: **"todo a la vista"**, chips planos, sin acordeones anidados.

### 2. Persistencia

Columnas nuevas en `bookings`:

| Columna            | Tipo          | Para qué                                                                |
| ------------------ | ------------- | ----------------------------------------------------------------------- |
| `triage`           | `jsonb`       | Las respuestas: `{brand, model, symptom, speeds, tyre_size, ...}`       |
| `triage_photo_url` | `text`        | Foto en Supabase Storage, o NULL                                        |
| `triage_video_url` | `text`        | Video corto para ruidos, o NULL                                         |
| `review_state`     | `text`        | `pending` \| `ok` \| `parts_missing` \| `client_choosing` \| `refunded` |
| `reviewed_at`      | `timestamptz` | Cuándo lo miró Diego                                                    |
| `review_note`      | `text`        | Nota interna, no la ve el cliente                                       |

**`jsonb` y no una columna por pregunta.** Las preguntas cambian por categoría y
van a seguir cambiando. Una columna por pregunta significa una migración cada
vez que Diego agrega una, y este repo ya tiene un runbook entero dedicado a que
las migraciones se corren a mano y nadie se acuerda.

**`review_state` separado de `status`.** `status` ya significa otra cosa
(pending/confirmed/enroute/completed/cancelled) y lo leen el mecánico, el
tracking y las finanzas. Mezclar los dos ejes rompe esas tres pantallas.

### 3. La cola de revisión

Vive como pestaña dentro de **Bookings**, con el aviso en el **Dashboard**.
Una página aparte que hay que acordarse de visitar no se visita; el Dashboard es
lo que Diego abre.

**Ordenada por cuándo es el trabajo**, no por cuándo reservaron. Es lo único que
evita que una reserva para mañana a las 9 quede debajo de tres para dentro de
dos semanas.

Cada tarjeta pone **arriba y en grande la respuesta que decide** — el motor, las
velocidades, la marca — y el resto abajo. La foto grande, porque ahí está el
modelo.

Tres acciones:

| Botón                 | Qué hace                                                |
| --------------------- | ------------------------------------------------------- |
| **Confirmar**         | `review_state = ok`, la reserva sigue su curso normal   |
| **Preguntarle algo**  | Abre WhatsApp al cliente con el contexto cargado        |
| **Falta el repuesto** | `client_choosing`: el cliente elige esperar o reembolso |

**"Preguntarle algo" es de primera clase, no una opción escondida.** Sale
directo de haber dejado la foto opcional: cuando no la mandan, pedirla va a ser
la acción más frecuente.

### 4. Notificación a Diego

**Hallazgo que cambia el diseño.** Admin tiene 7 interruptores de alerta
(`TRIGGER_KEYS` en `js/admin.js:740`), guardados en el hack de
`van_zones` con `van_number = 0`. El servidor lee **uno solo**:
`mechanic_preference` (`api/auth.js:4178`). Los otros seis — incluido
`new_booking` — son interruptores que no hacen nada.

Así que la notificación **no** se engancha ahí: se manda siempre.

- **WhatsApp a Diego**, por `api/send-message.js`, que ya resuelve su número
  desde `van_zones` / `__whatsapp__`. Es el canal que ya funciona y el que él
  lee todo el día.
- **Un segundo aviso** si son las 16:00 y la reserva sigue sin revisar, para que
  la promesa de las 18:00 no dependa de la memoria.

Push al navegador queda afuera: `api/send-push.js` manda a un **cliente** con
`push_subscription` cargada, y el admin no registra ninguna. Es trabajo aparte
para un canal peor.

**Los seis interruptores muertos se anotan como hallazgo separado**, no se
arreglan acá.

---

## Las preguntas, por categoría

Las 9 categorías del catálogo, con el dato que decide el repuesto. Confirmadas
con Diego salvo donde se indica.

| Categoría                | Serv. | Lo que decide                                                         |
| ------------------------ | ----: | --------------------------------------------------------------------- |
| **Frenos**               |     4 | La marca. Define pastilla, líquido y kit de purga                     |
| **Ruedas y cubiertas**   |     6 | Diámetro **y** ancho. Una 29x2.1 y una 29x2.6 son cubiertas distintas |
| **Transmisión**          |     4 | Las velocidades. Una cadena de 11 no entra en una de 12               |
| **Cambios y cables**     |     3 | Cable o electrónico. Un Di2 o AXS es otro trabajo _(sin confirmar)_   |
| **Electrónica y e-bike** |     3 | La marca del motor. Donde el "no podemos" es más probable             |
| **Suspensión**           |     2 | Marca, modelo y año. Los retenes son específicos                      |
| **Manillar y contacto**  |     4 | Casi nada. La categoría más liviana                                   |
| **Programados**          |     5 | Nada, y está bien. Lleva "saltear" visible                            |
| **General y armado**     |     2 | Si la pieza la trae el cliente                                        |

### Las 20 excepciones

Contadas una por una sobre el catálogo. Los mockups decían "11" y era un conteo
mal hecho; el número real es 20, y 13 de los 33 servicios heredan su categoría
sin cambios.

_Corregido el 23-oct: esta tabla decía 19 y le faltaba Accessory / Part Install.
El mockup que vio Diego sí preguntaba qué pieza instalar; el texto no lo
recogió._

| Servicio                     | Qué cambia                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Brake Pad Install            | Suma resina/metálica, **opcional**                                                                                |
| Brake Bleed                  | Saca el tipo de freno. **La marca sigue obligatoria**: define mineral o DOT                                       |
| Hydro Brake Install          | Suma: ¿hoy tiene disco o freno de llanta?                                                                         |
| Spoke Replacement            | Cambia a: ¿cuántos rayos rotos? + marca de la maza                                                                |
| Wheel Truing (ambos)         | Cambia a: ¿hay rayos rotos? Si sí, el servicio correcto es otro                                                   |
| Tubeless Tyre Install        | Saca ¿cámara o tubeless?, ya está contestado                                                                      |
| Tyre / Tube Install          | Suma: ¿traés la cubierta vos?                                                                                     |
| True Hanger Derailleur       | Pregunta por el **cuadro**, no por la transmisión. El hanger es exclusivo de cada cuadro — _confirmado por Diego_ |
| Bottom Bracket Install       | Cambia a: ¿roscado o press-fit? _(sin confirmar)_                                                                 |
| Derailleur Install           | Suma: ¿delantero o trasero? + ¿traés la pieza?                                                                    |
| External Cable Install       | Suma: ¿de freno, de cambio, o los dos?                                                                            |
| Firmware Update              | Suma: ¿tenés la app de la marca?                                                                                  |
| E-bike service               | Saca el síntoma: es mantenimiento, no falla                                                                       |
| Air Can Service              | Suma: ¿horquilla o amortiguador trasero?                                                                          |
| Handlebar / Headset / Saddle | Cada uno con su pregunta propia                                                                                   |
| Bike Assembly                | Cambia a: ¿viene en caja? ¿están todas las piezas?                                                                |
| Accessory / Part Install     | Suma primero: ¿qué querés instalar? Portaequipaje, guardabarros, luces, portabidón, pedales u otra                |

### Cinta de manillar: una sola pregunta menos

El mockup ofrecía negra, blanca, roja y azul. **Diego lleva solo negra**
(LEBYCLE: Bar tape Wisp 01A Black, 2 unidades). Ofrecer colores que no tiene es
prometer una elección que no puede cumplir.

Mientras haya un solo color: **no se pregunta, se informa.**

---

## La emergencia

`Emergency Service` cuesta $0 y está clasificado entre los programados, pero no
es mantenimiento: es alguien tirado en la calle.

**Vive sobre todo en WhatsApp.** El cliente escribe "necesito ayuda" y le llega
al instante un mensaje con las tres preguntas:

```
Hola, soy Dr. Bike. Ya estoy leyendo tu mensaje.

Para salir lo antes posible, contame:
1. ¿Qué le pasó a la bici?
2. ¿Dónde estás?
3. ¿Podés moverla o quedó ahí?

Si podés, mandame una foto. Te contesto enseguida.
```

**Un solo mensaje, no un árbol de conversación.** Dos razones:

1. Un árbol necesita estado por número de teléfono, manejo de respuestas fuera
   de orden, "no entendí" y abandonos a la mitad. Un mensaje no necesita nada.
2. **Es una emergencia.** Alguien varado no quiere un bot haciéndole un
   cuestionario de a una pregunta. Quiere saber que lo leyeron.

Diego lo confirmó: _"yo tengo que leerlo para poder ayudar"_. El automático
acusa recibo y junta contexto; la ayuda la da él.

**Falta construir el webhook de entrada.** Verificado: la app manda WhatsApp por
Twilio pero no recibe nada — no hay endpoint que escuche mensajes entrantes.

### Costo

La estructura de precios favorece este caso. Cuando **el cliente escribe
primero** se abre una ventana de servicio de 24 h donde se responde con mensajes
comunes, no con plantillas pagas; Meta dejó esas conversaciones sin cargo desde
nov-2024. Twilio cobra su propia tarifa por mensaje, aparte.

**Los números exactos hay que mirarlos en el panel de Twilio.** La estructura es
estable; las tarifas de Meta cambiaron más de una vez en dos años.

Las **mismas tres preguntas** van en la app para el que entra por el booking. Un
solo juego, dos puertas.

---

## Lo que ve el cliente

| Estado            | Qué dice                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pending`         | "Recibimos tu reserva. Estamos viendo que tengamos todo lo necesario. Te confirmamos antes de las 18:00 de hoy." |
| `ok`              | "Confirmada. Te esperamos el jueves a las 14:00. Llevamos las pastillas Shimano."                                |
| `client_choosing` | "Nos falta una pieza para tu bici." + dos botones                                                                |
| `refunded`        | "Te devolvimos el dinero."                                                                                       |

**Nunca ve un "no".** Ve dos salidas y elige:

- **La piden y vienen el martes**
- **Devuélvanme el dinero**

La última frase de `ok` importa: _"llevamos las pastillas Shimano"_ le dice que
alguien miró su caso, no que se apretó un botón.

### El reembolso a las 24 h

Si no contesta en 24 h, se devuelve automáticamente. **El silencio favorece al
que pagó**, no al que no contestó.

**Hay que escribirlo en los términos**, y con los dos plazos separados, porque
no son el mismo:

- A las **24 h** sin respuesta, se dispara la devolución.
- El dinero llega a la cuenta del cliente **después**, porque el plazo lo pone
  el banco, no nosotros.

Decirle "te devolvemos a las 24 h" y que el dinero aparezca días después es cómo
se genera un reclamo. Los dos plazos, dichos por separado, en `terms.html` **y
en la pantalla donde elige**, en los tres idiomas.

**Advertencia sobre el número.** Diego pidió decir "72 horas aprox". Stripe
documenta un plazo bastante más largo para que un reembolso aparezca en el
resumen del cliente, y varía según el banco. **Verificar en el panel de Stripe
antes de escribir una cifra en los términos**: una promesa de 72 h que se
cumple en 7 días genera exactamente el reclamo que esta sección quiere evitar.
Prometer de más es el único error caro acá; prometer de menos no molesta a
nadie.

---

## Lo que NO entra

Dicho explícitamente para que nadie lo agregue de contrabando:

- **Motor de compatibilidades cruzado contra stock.** Es el paso dos, y esta
  etapa genera los datos que lo hacen posible.
- **Que el mecánico juzgue si puede.** Diego: _"el mecánico solo tiene que ir a
  reparar, no tiene que juzgar si puede hacerlo o no"_. El mecánico recibe el
  triage como información, nunca como decisión.
- **Saber qué lleva cada mecánico en la camioneta** y qué sabe hacer cada uno.
  Diego lo puso para **enero-2027**, cuando empiece a contratar.
- **Push al navegador del admin.** WhatsApp alcanza.
- **Árbol de conversación en WhatsApp.** Un mensaje.

---

## Riesgos

**Que el triage cueste reservas.** Cada pregunta antes de pagar tiene un costo
en conversión y hoy no hay datos para medirlo. Mitigación: las preguntas van
dentro del paso que ya existe, nunca en pantalla nueva; "no sé" siempre visible;
foto y video opcionales.

**Que Diego no revise a tiempo.** Un cliente pagó y el trabajo es mañana.
Mitigación: orden por urgencia, WhatsApp al entrar, segundo aviso a las 16:00.

**Que sin foto no alcance.** En pastillas y en e-bike el adjunto era lo que
resolvía el modelo. Mitigación: en esos dos la foto se pide con más fuerza y
dice para qué sirve. Y el cálculo real es ese: sin foto a veces es un mensaje
más; con foto obligatoria a veces es una reserva menos.

**Que las excepciones se desactualicen.** Son conocimiento de mecánico escrito
en código. Mitigación: viven en un solo archivo, con el nombre de quién las
confirmó y cuándo.

---

## Orden sugerido para implementar

No es un solo entregable. Tres partes que se pueden mergear por separado, y
cada una deja el producto mejor que antes:

1. **Captura + persistencia.** El triage en el paso 1 y las columnas nuevas.
   Sin cola todavía: los datos quedan guardados y se ven en el detalle de la
   reserva en Admin. Esto solo ya le da al mecánico lo que hoy no tiene.
2. **La cola de revisión + los estados del cliente + la notificación.** Es lo
   que convierte los datos en una decisión antes de salir.
3. **El webhook de WhatsApp para la emergencia.** Es el más independiente de
   los tres: no toca el booking ni la base de reservas, y puede esperar.

## Lo que queda abierto

- **Dos franjas sin confirmar:** cambios electrónicos (categoría Cambios) y
  pedalier roscado o press-fit (Bottom Bracket).
- **Los seis interruptores de alerta muertos** en Admin. Hallazgo aparte.
- **Enero-2027:** qué lleva cada mecánico en la camioneta y qué sabe hacer.
- **Tarifas de Twilio/Meta** para el webhook de WhatsApp: verificar en el panel.
