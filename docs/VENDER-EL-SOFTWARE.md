# VENDER EL SOFTWARE A OTROS - Dr. Bike Sydney

Fecha: 2026-10-03
Pregunta: ¿cuánto se le podría cobrar a las tiendas grandes de bicicletas por este software,
adaptado a su marca, sus productos y sus repuestos? ¿Y es buena idea?
Documentos hermanos: `ANALISIS-COSTO-DESARROLLO.md` (lo que cuesta construirlo),
`VALOR-DE-VENTA.md` (a cuánto se vende el negocio).

---

## 1. La respuesta corta

**La idea es buena. El cliente está mal elegido. Y el momento es el peor de los tres.**

- **Buena:** el software existe, funciona en producción y resuelve algo que las tiendas no
  saben hacer (servicio móvil). Eso es un producto real, no una fantasía.
- **Cliente equivocado:** las cadenas grandes son el cliente más difícil del mercado, y
  además compiten con Dr. Bike. Hay clientes mejores para exactamente el mismo software.
- **Momento equivocado:** Dr. Bike tiene **cero ventas de membresías** y es justamente la
  membresía la que vale $500,000 de precio de venta (ver `VALOR-DE-VENTA.md`). Arrancar una
  empresa de software antes de que funcione la primera es la forma clásica de terminar con
  dos medias empresas.

Recomendación: **no todavía, y no a las cadenas.** La sección 6 tiene tres versiones mejores
de la misma idea.

---

## 2. El bloqueo técnico que define el precio de entrada

Hoy el software **no puede servir a dos empresas a la vez.** Medido, no estimado:

| Qué busqué | Resultado |
|---|---|
| Columna de empresa (`tenant_id`, `org_id`, `company_id`) en las 22 tablas | **Ninguna** |
| Menciones de "Dr. Bike", el teléfono o el dominio dentro del código | **907**, en 40 archivos |
| Variables de entorno de marca o de empresa | **0 de 22** |

Es un sistema de un solo inquilino. Para vendérselo a alguien hay dos caminos:

**Camino A - una copia por cliente, de a uno por vez.** Se duplica el proyecto, se cambia la
marca y cada cliente corre su propia copia, con su Supabase, su Stripe y su dominio.

**Para el primer cliente, éste es el camino correcto.** No hace falta construir nada de
multi-empresa: se adapta la copia y listo. Son **25 a 40 días** de adaptación (marca, catálogo
del cliente, sus repuestos, su pasarela de pago), contra 95-162 de hacer multi-empresa. Y se
aprende con un cliente real qué se rompe cuando el software atiende a alguien que no es Diego.

Lo que hay que saber es **dónde deja de funcionar**, que no es una opinión sino aritmética:

| Clientes | Qué pasa |
|---|---|
| 1 | Perfecto. Una copia, se toca cuando hace falta |
| 2 | Molesto pero manejable. Cada arreglo se hace 3 veces (los 2 clientes + Dr. Bike) |
| 3 | Punto de quiebre. ~30-40% del tiempo de desarrollo se va en repetir el mismo arreglo |
| 5+ | Inmanejable para una persona. Las copias se desincronizan y cada una se vuelve su propio producto |

**La regla práctica:** copia suelta para el cliente 1 y el 2. **La decisión se toma en el
cliente 3**, y ahí multi-empresa ya sale más barata que seguir forkeando, porque cada fork
nuevo cuesta 15-25 días *más* el impuesto permanente de arreglar todo N veces.

Hay una trampa a evitar desde el primer día: si las copias se dejan divergir (el cliente 1
pide un cambio y se hace solo ahí), pasar a multi-empresa después deja de costar 95-162 días
y pasa a costar el doble, porque primero hay que volver a unificar lo que se separó. Mientras
sean copias, **todo arreglo se aplica a todas, aunque el cliente no lo haya pedido.**

**Camino B - multi-empresa de verdad.** Una sola instalación sirve a todos, con los datos
aislados entre sí. Esto es lo que hay que construir **cuando aparece el tercer cliente**, no
antes.

| Trabajo | Días-persona |
|---|---|
| `tenant_id` en las 22 tablas y reescribir todas las políticas RLS | 15 - 25 |
| Marca, textos y configuración por empresa (los 907 lugares) | 12 - 20 |
| Stripe Connect: que cada tienda cobre a su propia cuenta | 10 - 18 |
| Dominio, email y SMS propios por empresa | 8 - 14 |
| Panel de super-admin: alta de clientes, facturación, soporte | 15 - 25 |
| Migrar Dr. Bike a ser "la empresa 1" sin romper nada en vivo | 8 - 15 |
| Tests de aislamiento entre empresas (que la tienda A no vea nada de la B) | 12 - 20 |
| **Subtotal** | **80 - 137** |
| Gestión | 15 - 25 |
| **TOTAL** | **95 - 162 días-persona** |

A tarifa de agencia australiana mediana eso es **$90,000 a $227,000**. A la velocidad a la
que construye Diego es mucho menos en dinero, pero son semanas que no se le dedican a vender
membresías - y por eso no se hace hasta que haya clientes que lo paguen.

**El test de aislamiento no es opcional.** Que la tienda A vea un cliente de la tienda B una
sola vez termina el negocio de software ese mismo día.

---

## 3. Si igual se hace: cuánto cobrar

Precios de referencia del mercado australiano de software para talleres y retail
(Lightspeed, Ascend, Shopmonkey y similares rondan los $150-600 AUD por local al mes).
Este producto hace más que ellos en servicio móvil, y menos en punto de venta e inventario.

### 3.1 Los tres escalones

| Cliente | Alta (una vez) | Mensual | **Primer año** |
|---|---|---|---|
| **Tienda independiente** (1-3 locales) | $8,000 - $15,000 | $400 - $800 | **$13,000 - $25,000** |
| **Grupo mediano** (4-15 locales) | $25,000 - $60,000 | $2,500 - $6,000 | **$55,000 - $132,000** |
| **Cadena nacional** (30+ locales) | $80,000 - $150,000 | $10,000 - $20,000 | **$200,000 - $390,000** |

En limpio, para tener un número en la cabeza: **$20,000 / $80,000 / $250,000 el primer año**,
según el tamaño del cliente.

### 3.2 Por qué ese precio se puede defender

Un mecánico de taller factura del orden de $120,000 a $180,000 de mano de obra al año. Una
cadena de 30 locales con 90 mecánicos mueve más de $12 millones de servicio.

Cobrarle $250,000 al año es **alrededor del 2%** de lo que gestiona. Si el software le llena
la agenda un 10% más o le baja las inasistencias, se paga solo cinco veces. Ese es el
argumento de venta, y es sólido.

### 3.3 Modelos alternativos de cobro

| Modelo | Cuándo conviene | Riesgo |
|---|---|---|
| **Suscripción por local** | Lo estándar, lo que esperan | Ninguno, es el default |
| **% de lo reservado** (2-5%) | Cuando el cliente duda del valor | Te atás a su resultado; exige auditoría |
| **Licencia perpetua + mantenimiento** | Cadenas que odian las suscripciones | Cobrás una vez; el 15-20% anual de mantenimiento es el negocio real |
| **Gratis + comisión por reserva** | Para entrar rápido en muchos locales | Solo funciona con volumen grande |

Recomendado: suscripción por local, con el alta cobrada aparte. El alta no es un extra: es lo
que paga el trabajo de adaptar marca, catálogo y repuestos de ese cliente.

---

## 4. Las cuatro razones por las que las cadenas grandes son el cliente equivocado

### 1. Ya tienen sistema, y cambiarlo es una cirugía

Las cadenas grandes corren plataformas de retail que manejan punto de venta, inventario,
contabilidad y servicio juntos. Reemplazar eso no es comprar software: es un proyecto de 12
a 18 meses con el área de sistemas de por medio. El ciclo de venta es más largo que el
tiempo que Dr. Bike puede esperar.

### 2. No pasás la revisión de proveedores

Lo que una cadena pide antes de firmar: certificación de seguridad, acuerdo de nivel de
servicio con penalidades, soporte con horarios, seguro de responsabilidad, referencias de
otros clientes y un plan de qué pasa si el proveedor desaparece.

Hoy el proveedor es una persona, con un cliente, que es él mismo. Eso no se arregla con una
buena demo.

### 3. Les estás vendiendo a tu competencia

Éste es el problema más grande y el menos obvio. Dr. Bike le saca facturación de servicio a
las tiendas de bicicletas: ése es literalmente el posicionamiento del negocio
(`ESTRATEGIA-NEGOCIO.md`: "el competidor es la fricción de cargar la bici al auto").

Una tienda que compra tu software te está dando sus datos de clientes, sus precios y sus
volúmenes. Y vos tenés una flota que compite por esos mismos clientes. El primer gerente
despierto que lo note mata la venta, y con razón.

### 4. Te convierte en otra cosa

Vender software a empresas es un trabajo distinto: soporte, tickets, caídas a las 11 de la
noche, pedidos de funciones de clientes que pagan y por lo tanto mandan. Es un buen negocio,
pero es **el negocio**, no un ingreso extra. Dr. Bike pasaría a segundo plano el día que el
primer cliente grande firme.

---

## 5. Lo que sí juega a favor

Para ser justo con la idea, estas tres cosas son reales:

1. **El servicio móvil es la cuña.** Las tiendas quieren ofrecer mecánica a domicilio y no
   saben cómo. Ahí no competís con su sistema de punto de venta: ocupás un lugar vacío.
2. **El producto está probado en producción**, con 1,577 tests y cobros reales. La mayoría de
   quien intenta vender software a este rubro tiene una demo, no un sistema que factura.
3. **El software recurrente se valúa a 2-4 veces el ingreso anual**, no a múltiplo de
   ganancia. 20 clientes a $800/mes son $192,000 al año, que valen $380,000 a $770,000
   **además** del negocio de servicio.

---

## 6. Tres versiones mejores de la misma idea

Ordenadas por cuánto conviene, de más a menos.

### Opción 1 - Licenciar a mecánicos móviles de otras ciudades (la mejor)

Melbourne, Brisbane, Perth, Adelaide, Auckland. Mismo negocio que Dr. Bike, otra ciudad.

- **Cero conflicto de interés**: no compiten con vos, están a mil kilómetros.
- No tienen nada: hoy trabajan con WhatsApp y una libreta. No hay sistema que reemplazar.
- Son chicos, deciden rápido, no hay área de compras.
- El producto les sirve **tal cual está**, sin adaptar catálogo ni marcas de terceros.
- Precio: **$300 - $600 al mes por ciudad**, alta de $3,000 - $6,000.
- 20 licencias son $96,000 de ingreso anual recurrente y casi nada de soporte.

Sigue necesitando multi-empresa (sección 2), pero la versión mínima, no la completa.

### Opción 2 - Venderles el servicio, no el software

En vez de licenciarle el sistema a una tienda, **operar su servicio móvil bajo su marca**:
ellos ponen la marca y los clientes, Dr. Bike pone la camioneta, el mecánico y la plataforma,
y se reparte la facturación.

- No vendés código, vendés capacidad. No hay revisión de proveedores ni certificaciones.
- No les das tus datos ni te dan los suyos: es un acuerdo comercial.
- Crece la facturación de Dr. Bike, que es lo que sube el precio de venta del negocio.
- Es el camino B2B que el roadmap ya tiene para 2027, con un cliente distinto.

### Opción 3 - Vender el software después, con el negocio

El comprador estratégico de Dr. Bike en 2030 (una cadena, una aseguradora, una marca de
e-bikes) compra el negocio **y** la plataforma junta, y es él quien la despliega en sus
locales. Pagás cero costo de venta y cobrás el múltiplo completo.

Está en `VALOR-DE-VENTA.md`, sección 7.

---

## 7. Qué hacer hoy, concretamente

1. **Nada de esto antes de las primeras 50 membresías vendidas.** Es la única métrica que
   está bloqueando medio millón de dólares de valor y lleva desde julio en cero.
2. **Cuando toque, empezar por la Opción 1**, con una sola ciudad y un solo cliente, cobrando
   poco, para aprender qué rompe cuando el software atiende a alguien que no sos vos.
3. **Si aun así se quiere ir a las cadenas**, ir con la Opción 2 primero: un acuerdo de
   servicio operado. Si funciona un año, la misma cadena después compra el software con la
   confianza ya construida, y sin la objeción de competencia.
4. **No construir multi-empresa "por las dudas".** El cliente 1 y el 2 se atienden con una
   copia adaptada (25-40 días cada una). La decisión de multi-empresa se toma recién en el
   cliente 3, y para entonces ya está pagada por los dos primeros.
5. **Mientras haya copias sueltas, aplicar todo arreglo a todas.** Es la única disciplina que
   mantiene barata la migración a multi-empresa el día que toque. Dejarlas divergir duplica
   ese costo.
6. Lo único que conviene hacer ya, porque es barato ahora y carísimo después: **no agregar
   más lugares donde la marca esté escrita a mano.** Ya son 907.

---

## 8. Advertencias

- Los precios de la sección 3 son rangos de mercado de la industria, no cotizaciones ni
  precios verificados de competidores. Antes de ponerle precio a una propuesta real conviene
  mirar qué cobra hoy el software que esa tienda ya usa.
- La estimación de multi-empresa (95-162 días) es del mismo tipo que las de
  `ANALISIS-COSTO-DESARROLLO.md`: por módulo, sobre código medido, pero sin diseño hecho.
- El conflicto de interés de la sección 4.3 es un juicio de negocio, no un hecho. Si Dr. Bike
  dejara de competir por servicio en los suburbios de un cliente, deja de aplicar.
