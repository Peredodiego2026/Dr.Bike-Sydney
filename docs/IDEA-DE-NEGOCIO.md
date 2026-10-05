# LA MEJOR IDEA DE NEGOCIO CON LO QUE TENEMOS

Fecha: 2026-10-05
Pregunta de Diego: entre vender el software, administrarle la app a las tiendas que se la
compraron, o el marketplace de mecánicos - ¿cuál conviene? Y: armá la mejor idea posible con
lo que hay.
Documentos previos: `ANALISIS-COSTO-DESARROLLO.md`, `VALOR-DE-VENTA.md`,
`VENDER-EL-SOFTWARE.md`.

---

## 1. La respuesta

Ninguna de las tres, tal como están planteadas. La mejor idea es una cuarta, y sale de una
cosa que estuvo todo el tiempo adelante nuestro sin que la nombráramos:

> **El activo escaso no es el software. Es aparecer primero en Google cuando alguien en
> Sydney escribe "bike repair near me". Y Dr. Bike tiene una máquina que fabrica eso en
> serie.**

`scripts/generate-suburb-pages.mjs` produce **20 suburbios x 3 idiomas = 60 páginas** de
posicionamiento local, con hreflang, datos estructurados y precios en vivo, desde un solo
archivo. Cambiar dos variables en ese script y apuntarlo a Melbourne es **una tarde de
trabajo**.

Eso da la idea:

## **Dr. Bike Network: vos sos el dueño de la demanda, el operador es dueño de la camioneta.**

No le vendés software a nadie. Construís la demanda en una ciudad nueva **antes** de que
exista el operador, y después le entregás esa demanda ya funcionando a un mecánico local que
pone la camioneta y las manos. Él no te paga una suscripción: te paga **un porcentaje del
trabajo que vos le mandás**.

---

## 2. Por qué le gana a las tres opciones que planteaste

| | Qué le cobro | Problema que no se resuelve |
|---|---|---|
| **A. Vender el software a tiendas** | $13k-25k/año | Le vendés a tu competencia, no pasás su revisión de proveedores, ciclo de venta de 12-18 meses |
| **B. Venderles y además administrárselas** | $20k-35k/año | Mismo conflicto. Mejor que A porque el ingreso es recurrente |
| **C. Marketplace de mecánicos** | $0 los primeros 2 años | Huevo y gallina, Airtasker ya existe, la subasta destruye el precio, el cliente se va con el teléfono del mecánico |
| **D. Dr. Bike Network** | **$44k/año por ciudad** | - |

La diferencia clave: en A, B y C arrancás de cero consiguiendo a alguien. En D **ya tenés la
gallina**: la demanda la construís vos, con una herramienta que ya está escrita y que te
cuesta una tarde por ciudad.

Y resuelve el agujero que yo mismo te señalé en mi modelo de licencias: el mecánico móvil no
tiene problema de software, tiene problema de clientes. **En D le vendés exactamente eso.**

---

## 3. Cómo funciona, paso a paso

1. **Elegís una ciudad.** Melbourne primero: más ciclistas que Sydney, mismo idioma, mismas
   leyes, mismo Stripe, misma zona horaria.
2. **Fabricás la demanda.** Cambiás `SITE` y la lista de suburbios en el generador, registrás
   el dominio y publicás 60 páginas. Costo real: el dominio.
3. **Esperás y medís.** Tres a cuatro meses sin contratar a nadie. Un formulario que dice
   "lista de espera" y un teléfono. Contás cuántas consultas reales entran por mes.
4. **Recién ahí buscás al operador.** Y no le ofrecés un software: le ofrecés *"tengo 25
   consultas por mes en Melbourne que no puedo atender, ¿las querés?"*. Esa conversación la
   gana cualquiera.
5. **Él pone camioneta, herramientas y manos.** Vos ponés marca, web, app, cobro, soporte y
   los clientes.
6. **Vos fijás el precio.** Es tu marca. No hay regateo, no hay carrera al fondo - justo lo
   que tu `ESTRATEGIA-NEGOCIO.md` dice que nunca hay que hacer.
7. **Repetís**: Brisbane, Perth, Adelaide, Auckland.

---

## 4. Los números

### Por ciudad, con un operador y una camioneta

| Concepto | Monto |
|---|---|
| Factura el operador (5 trabajos/día x $175 x 5.5 días x 46 semanas) | $220,000 |
| **Tu parte (20%)** | **$44,000** |
| Tu costo (hosting, Twilio, Resend de esa ciudad) | -$2,400 |
| Tu costo de adquisición de ese operador | ~$0 (te buscan ellos) |
| **Te queda** | **~$41,600 por ciudad, por año** |

### Comparado con las otras opciones, por cliente y por año

| Modelo | Te deja |
|---|---|
| Licencia de software a un mecánico | $4,200 |
| Vender + administrar a una tienda | $20,000 - $35,000 |
| **Dr. Bike Network** | **$41,600** |

**10 veces más que la licencia de software, por cliente.** Y el operador lo paga contento,
porque sin vos no tenía esos clientes.

### A cinco ciudades (2029-2030)

| | |
|---|---|
| 5 ciudades x $41,600 | **$208,000 al año** |
| Más Dr. Bike Sydney operando (escenario "probable" de `VALOR-DE-VENTA.md`) | $240,000 |
| **Ganancia total** | **~$448,000** |

Y acá está lo importante para la venta: una red nacional de 5 ciudades con ingreso por
regalías **no se valúa como un negocio de Sydney**. Se valúa como franquicia: 4.5-6x.
**$2,000,000 a $2,700,000**, contra los $800k-1.2M del escenario probable de un solo
operador.

**La red no te suma $208,000. Te suma más de un millón de precio de venta.**

---

## 5. El test que cuesta $15 y dos semanas

Esto es lo mejor de la idea y es lo que la separa de una fantasía de PowerPoint.

Toda la apuesta descansa en **una sola suposición**: que podés fabricar demanda en una ciudad
donde no tenés ni una reseña ni un cliente. Esa suposición se puede probar ya, barata, antes
de comprometer un solo peso serio.

**El test:**

| Cuándo | Qué |
|---|---|
| Semana 1 | Registrar un dominio de Melbourne. Cambiar `SITE` y los 20 suburbios en el generador. Publicar las 60 páginas. Alta en Google Business. |
| Semanas 2-16 | **No hacer nada más.** Un formulario de lista de espera y un número que va a buzón de voz. Cero publicidad paga. |
| Mes 4 | Contar las consultas reales recibidas. |

**La puerta de decisión:**

- **20 o más consultas al mes** -> la máquina de demanda funciona. Es un negocio real.
  Buscás operador.
- **Entre 5 y 20** -> funciona pero lento. Hace falta reseñas o algo de publicidad. Seguís
  midiendo seis meses más.
- **Menos de 5** -> **la idea está mal y te enteraste por $15.** Lo que hace rankear a Dr.
  Bike en Sydney son las reseñas y la antigüedad, no las páginas, y entonces este modelo no
  se puede copiar a otra ciudad.

Ese último escenario es el resultado más valioso de los tres, porque te ahorra dos años.

---

## 6. Lo que es genuinamente difícil

### 1. En Australia esto puede ser legalmente una franquicia

Marca + sistema + pago + control = franquicia bajo el **Franchising Code of Conduct**. Eso
obliga a documento de divulgación, período de reflexión, procedimiento de disputas y
auditoría. Costo legal inicial estimado: **$15,000 - $30,000**.

Hay estructuras más livianas (contrato de agencia, subcontratación, o directamente emplear al
mecánico), y **cuál corresponde lo decide un abogado australiano, no este documento.** Pero
no es opcional averiguarlo: equivocarse acá es una multa y un contrato nulo.

**Atajo para el primer operador:** subcontratarlo como proveedor, con vos facturando al
cliente final. No es franquicia, no requiere el código, y sirve para probar el modelo una vez
antes de formalizar.

### 2. Un mal operador te rompe la marca en las dos ciudades

Las reseñas de Melbourne y las de Sydney son la misma marca. Un mecánico malo a 900 km te
ensucia el activo que más te costó construir.

### 3. Seguís siendo una sola persona

Cinco ciudades con un solo desarrollador, soporte y dueño es insostenible. Antes de la ciudad
3 hace falta alguien más, y eso es el mismo descuento por dependencia técnica que ya está
anotado en `VALOR-DE-VENTA.md`.

### 4. Y lo de siempre

**Las membresías siguen en cero desde julio.** Son medio millón de precio de venta parado.
Ninguna ciudad nueva vale lo que vale arreglar eso.

---

## 7. La secuencia

| Cuándo | Qué | Por qué |
|---|---|---|
| **Ahora (Q4 2026)** | Vender membresías. Segundo mecánico en Sydney. | Es la palanca #1 de valor y lleva 3 meses parada |
| **Ahora, en paralelo** | **Correr el test de Melbourne.** Una tarde y después se mide solo | No compite con lo anterior: son 4 horas y 4 meses de espera |
| **Q1 2027** | Leer el resultado del test | La puerta de decisión de la sección 5 |
| **2027** | Si pasó: primer operador en Melbourne, subcontratado | Probar el modelo una vez, sin estructura legal pesada |
| **2028** | Formalizar (abogado) y sumar ciudades 2 y 3 | Recién con el modelo probado dos veces |
| **2029** | Ciudades 4 y 5. Multi-empresa en el software | El punto de quiebre de las copias |
| **2030** | Vender la red nacional, no un negocio de Sydney | 4.5-6x en vez de 3.5x |

---

## 8. El segundo mejor negocio, que financia al primero

Tu opción B (venderles la app a las tiendas y además administrársela) **sí funciona, con una
corrección: solo a tiendas fuera de Sydney.**

El problema de B era el conflicto de interés. Pero una tienda en Melbourne o Brisbane **no
compite con Dr. Bike Sydney**. Y una tienda que quiere ofrecer servicio a domicilio y no sabe
cómo es exactamente el cliente al que esto le sirve.

- Venta inicial: $15,000 - $30,000
- Administración mensual: $800 - $1,500
- Primer año: **$25,000 - $48,000**

Son contratos grandes y rápidos que generan caja mientras la red crece despacio. Y hay una
sinergia real: **una tienda de Melbourne que te compra la app es tu mejor candidata a
operador de Dr. Bike Melbourne** - ya tiene local, mecánicos y clientes.

---

## 9. Lo que NO hay que hacer

1. **El marketplace.** Hoy no: huevo y gallina, Airtasker ya está, la subasta destruye tu
   propio posicionamiento premium, y el cliente se va con el teléfono del mecánico después de
   la primera visita.
2. **Multi-empresa en el software "por las dudas".** Son 95-162 días-persona. Recién con el
   tercer cliente firmado.
3. **Vender a las cadenas grandes.** Hasta no tener tres clientes contentos que sirvan de
   referencia, no se pasa su revisión de proveedores.
4. **Empezar cualquier cosa de esta lista antes de las primeras 50 membresías.**

---

## 10. Advertencias

- Los porcentajes de regalía (20%), los precios y las valuaciones son rangos de industria y
  supuestos marcados, no cotizaciones ni tasaciones. Lo medido acá es el repositorio: el
  generador de 60 páginas, los 62,014 renglones de código, los 1,577 tests.
- El supuesto de $220,000 por camioneta viene del modelo de `VALOR-DE-VENTA.md` y no está
  verificado contra la facturación real de Dr. Bike, que todavía no se midió.
- **El test de la sección 5 existe precisamente porque la premisa central de este documento
  puede ser falsa.** Si el posicionamiento de Dr. Bike en Sydney viene de las reseñas y no de
  las páginas, toda la idea se cae. Corré el test antes de creerle a este documento.
- Lo de la Franchising Code of Conduct es un señalamiento para consultar con un abogado, no
  asesoramiento legal.
