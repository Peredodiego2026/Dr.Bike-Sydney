# VALOR DE VENTA - Dr. Bike Sydney

Fecha: 2026-10-01
Pregunta: a cuánto se podría vender el negocio en 4 años (2030), con clientes reales,
varias camionetas en Sydney y ventas reales de la tienda.
Documento hermano: `ANALISIS-COSTO-DESARROLLO.md` (lo que cuesta construirlo, que es otra
cosa completamente distinta).

> **Los múltiplos de esta nota son rangos de industria, no tasaciones.** Para un número
> firme hace falta un broker de negocios australiano mirando los libros reales. Lo que sí
> es firme acá es el **método**: qué se mide, qué mueve el precio y en qué orden.

---

## 1. Lo primero, porque cambia todo

**El precio de venta no tiene nada que ver con lo que costó construir la app.**

Nadie paga $800,000 porque el software costó $800,000. Un comprador paga por **las
ganancias** que el negocio le va a dejar, y después multiplica esa ganancia por un número
(el "múltiplo") que depende de cuánto riesgo ve.

La fórmula completa es ésta, y no hay otra:

```
PRECIO DE VENTA = GANANCIA ANUAL  x  MULTIPLO
```

La app no entra en el primer término. **La app entra en el segundo.** No suma dólares: sube
el múltiplo. Y eso es mucho más poderoso, porque el múltiplo se aplica a toda la ganancia,
todos los años.

Ejemplo concreto, mismo negocio, dos mundos:

| | Sin app (todo en la cabeza de Diego y en WhatsApp) | Con la app |
|---|---|---|
| Ganancia anual | $240,000 | $240,000 |
| Múltiplo | 2.0x (el comprador se compra un trabajo) | 4.5x (se compra una empresa que funciona sola) |
| **Precio** | **$480,000** | **$1,080,000** |

Los $600,000 de diferencia son el valor real de la app. No sus líneas de código.

---

## 2. Los tres números

Al año 4 (2030), según cómo evolucione el negocio:

| Escenario | Facturación anual | Ganancia (EBITDA) | Múltiplo | **PRECIO** |
|---|---|---|---|---|
| **Flojo** | ~$500,000 | ~$90,000 | 2.0 - 2.5x | **$250,000 - $400,000** |
| **Probable** | ~$1,200,000 | ~$240,000 | 3.5 - 4.5x | **$800,000 - $1,200,000** |
| **Bueno** | ~$2,500,000 | ~$550,000 | 4.5 - 6.0x | **$2,500,000 - $3,500,000** |

**En limpio: $350,000 / $1,000,000 / $3,000,000.**

Fijate que la facturación se multiplica por 5 entre el flojo y el bueno, pero **el precio se
multiplica por 9**. Eso pasa porque el múltiplo también sube. Es el efecto palanca y es
donde está el dinero.

---

## 3. De dónde salen esos números

### 3.1 Supuestos por camioneta (hay que reemplazarlos con datos reales)

| Variable | Supuesto | De dónde |
|---|---|---|
| Trabajos por día por van | 5 | Estimación; medirlo en Admin > Analytics |
| Días trabajados por semana | 5.5 | |
| Semanas al año | 46 | Descontando vacaciones y días perdidos |
| Ticket promedio por visita | $175 | Servicio + call-out por zona (desde $25) |
| **Facturación por van al año** | **~$220,000** | 5 x 5.5 x 46 x $175 |

### 3.2 Los tres escenarios desarmados

**Flojo (2030):** 2 camionetas, Diego sigue arreglando bicis, membresías que nunca
arrancaron, tienda que vende poco.
- Servicio: 2 vans x $220k = $440,000
- Membresías: ~$40,000 (unos 40 miembros)
- Tienda: ~$20,000
- Total: ~$500,000. Margen 18% = **$90,000**
- Múltiplo bajo (2.0-2.5x) porque el comprador no compra una empresa, compra el empleo de
  Diego. Si Diego se va, el negocio se cae.

**Probable (2030):** 4 camionetas, Diego dirige y no arregla, 300 miembros, tienda andando.
- Servicio: 4 vans x $220k = $880,000
- Membresías: 300 x ~$90/mes x 12 = $324,000 (parte reemplaza servicio one-off)
- Tienda: ~$150,000
- Total descontando solapamiento: ~$1,200,000. Margen 20% = **$240,000**
- Múltiplo 3.5-4.5x: varias camionetas, mecánicos contratados, procesos en la app, ~30% de
  ingreso recurrente, marca y reseñas.

**Bueno (2030):** 7 camionetas, 700 miembros, contratos B2B de flotas, tienda consolidada.
- Servicio: 7 vans x $220k = $1,540,000
- Membresías: 700 x ~$95/mes x 12 = $798,000
- Tienda: ~$400,000
- B2B (flotas de delivery, bicis corporativas): ~$300,000
- Total descontando solapamiento: ~$2,500,000. Margen 22% = **$550,000**
- Múltiplo 4.5-6x: dueño totalmente afuera de la operación, ingreso recurrente alto,
  contratos B2B plurianuales, tecnología propia, foso de reseñas de 4 años.

### 3.3 Los márgenes, para que se entienda de dónde sale la ganancia

De cada $100 que entra en un negocio de servicio móvil maduro:

| Concepto | Aproximado |
|---|---|
| Mecánicos (sueldos + super) | $38 |
| Camionetas (leasing, combustible, seguro, mantenimiento) | $12 |
| Repuestos y consumibles | $14 |
| Marketing | $6 |
| Software, pagos (Stripe), telefonía, seguros, contabilidad | $5 |
| Administración y gestión | $5 |
| **Ganancia (EBITDA)** | **$20** |

Esto es lo que hay que vigilar: **el margen no se mejora vendiendo más, se mejora con
densidad de zona** (menos kilómetros entre trabajos) y con **membresías** (ingreso sin costo
de adquisición).

---

## 4. Lo que sube el múltiplo, en orden de impacto

Esto es la lista que importa. Está ordenada por cuánto mueve el precio final.

### 1. Porcentaje de ingreso recurrente (membresías) - EL factor

| Recurrente sobre el total | Múltiplo típico |
|---|---|
| 0-10% | 2.0 - 2.5x |
| 10-25% | 2.5 - 3.5x |
| 25-40% | 3.5 - 4.5x |
| 40-60% | 4.5 - 6.0x |

Hoy esto está en **0%**: las membresías están construidas y sin vender (`ESTRATEGIA-NEGOCIO.md`
lo dice). Es, de lejos, la palanca más grande que hay. Cada punto de recurrencia vale más que
cualquier otra cosa en esta lista.

Un número para tener presente: **100 miembros Standard ($97/mes) son $116,400 al año de
ingreso casi sin costo de adquisición. A 4.5x, son $520,000 de precio de venta.**

### 2. Que el negocio funcione sin Diego

Un comprador pregunta una sola cosa en la due diligence: *si el dueño se va mañana, ¿esto
sigue funcionando?* Si la respuesta es no, el múltiplo no pasa de 2.5x por bueno que sea
todo lo demás.

Lo que lo prueba: un gerente de operaciones que no sea Diego, procesos escritos, mecánicos
que se onboardean solos con la documentación, y la app haciendo el despacho en vez de la
cabeza de nadie.

### 3. Contratos B2B

Un contrato firmado de 2 años con una flota de delivery vale mucho más que la misma
facturación en clientes sueltos: es ingreso previsible y transferible. El roadmap lo pone en
2027 y es correcto.

**Cuidado con lo contrario:** si un solo cliente B2B pasa a ser más del 20% de la
facturación, el comprador descuenta por concentración. Varios contratos medianos valen más
que uno grande.

### 4. Datos y foso competitivo

El historial por bici (cada servicio alimentando el próximo) y 4 años de reseñas locales no
se copian. Para un comprador estratégico (una cadena de bicis, una aseguradora, una marca de
e-bikes) eso puede valer una prima arriba del múltiplo normal, porque compra la base de
clientes y los datos, no solo la ganancia.

### 5. Limpieza legal y fiscal

Marca registrada en IP Australia, contratos de los mecánicos en orden, seguros al día, GST y
BAS sin atrasos, la empresa como entidad separada. Nada de esto sube el múltiplo, pero su
ausencia lo baja y frena la venta.

---

## 5. Lo que BAJA el precio, y que nadie te va a decir

### El riesgo que la app crea (y cómo ya está cubierto en buena parte)

Un comprador con asesor técnico va a mirar 62,000 líneas de JavaScript propio y preguntar:
**¿quién mantiene esto cuando Diego no esté?** Si la respuesta es "nadie sabe", eso es un
descuento del 10% al 25% sobre el precio, o una retención del pago a 12-24 meses.

La buena noticia es que el repositorio ya se defiende de eso mejor que la mayoría:

| Lo que un comprador quiere ver | Estado |
|---|---|
| Tests automáticos que prueban que funciona | **1,577 casos** |
| Documentación de arquitectura y operación | **~57,000 líneas** |
| Controles que impiden romper algo al cambiarlo | **14 gates de CI** |
| Historial de cambios auditable | **Branch protection, todo por PR** |
| Runbooks de backup, privacidad y recuperación | **Sí** |
| Migraciones de base de datos versionadas | **45** |

Eso no es vanidad técnica: es **lo que convierte "código del fundador" en "activo
transferible"**. Vale dinero en la mesa de negociación y conviene ponerlo por escrito el día
de la venta.

Lo que todavía falta para cerrar ese flanco: que **otra persona que no sea Diego haya tocado
el código y lo haya desplegado al menos una vez.** Hoy el repositorio tiene un solo autor.
Un contratista externo haciendo mantenimiento 2 días al mes durante el último año antes de
vender elimina ese descuento casi por completo, y cuesta mucho menos de lo que recupera.

### Los otros descuentos clásicos

| Problema | Efecto en el precio |
|---|---|
| Ingresos no bancarizados / contabilidad desordenada | El comprador solo paga por lo que puede auditar |
| Mecánicos como contratistas cuando deberían ser empleados | Riesgo de contingencia laboral, retención del pago |
| Un solo proveedor en China para la tienda | Descuento sobre la línea de tienda |
| Estacionalidad fuerte sin suavizar | Baja el múltiplo medio punto |
| Reseñas de Google en una cuenta personal, no de la empresa | Activo no transferible |
| La marca sin registrar | Riesgo legal, frena la venta |

---

## 6. Las ocho cifras que hay que medir desde hoy

Diego pidió "ir conociendo los valores mientras evolucionamos". Éstas son las que determinan
el precio. Todas salen de la base de datos que ya existe.

| # | Métrica | Por qué importa | Dónde está |
|---|---|---|---|
| 1 | **Ingreso recurrente mensual (MRR) de membresías** | La palanca número uno del múltiplo | `profiles.membership_status` |
| 2 | **% de facturación que es recurrente** | Es el que define el múltiplo (tabla 4.1) | Finance |
| 3 | **Trabajos por día por camioneta** | Define si hace falta otra van o más densidad | `bookings` + `van_zones` |
| 4 | **Ticket promedio por visita** | Sube el margen sin sumar clientes | `bookings` |
| 5 | **Retención a 12 meses** | Un cliente que vuelve vale 5-10x uno de una vez | `bookings` por `client_id` |
| 6 | **Costo de adquisición (CAC)** | Hoy es casi cero por Google y reseñas; el día que se pague, cambia todo | Marketing vs clientes nuevos |
| 7 | **Margen EBITDA real** | Es el primer término de la fórmula | Finance + `expenses` |
| 8 | **Concentración: % del cliente más grande** | Arriba del 20% es descuento | `bookings` por cliente |

El panel de admin ya tiene las páginas Analytics y Finance, y la tabla `expenses`. Las ocho
se pueden calcular con lo que hay: no hace falta software nuevo, hace falta una pantalla que
las muestre juntas y un número al mes anotado en algún lado para ver la curva.

---

## 7. Quién compra un negocio así

| Comprador | Qué le interesa | Múltiplo que paga |
|---|---|---|
| **Un mecánico que se quiere independizar** | Comprarse un trabajo con clientes | 1.5 - 2.5x |
| **Un competidor local** | Tus clientes y tus zonas | 2.5 - 3.5x |
| **Una cadena de bicicletas o retail** | La base de clientes, el servicio como canal | 3.5 - 5x |
| **Un roll-up de servicios a domicilio** | Operación sistematizada y replicable | 4 - 6x |
| **Comprador estratégico** (aseguradora, marca de e-bikes, flota de delivery) | Los datos, la cobertura, la marca | 5x o más, caso a caso |

Los dos últimos pagan más, pero solo compran negocios que funcionan sin el dueño. Eso no se
arregla en los últimos 6 meses antes de vender: se construye desde ahora.

---

## 8. Una vía aparte: vender el software, no el negocio

Hay un camino que no requiere vender Dr. Bike: **licenciar la plataforma a negocios de
mecánica móvil en otras ciudades** (Melbourne, Brisbane, Auckland, y afuera).

Es un negocio distinto, con otra valuación: el software recurrente se vende a **2x - 4x el
ingreso anual recurrente**, no a múltiplo de ganancia. 20 licencias a $400/mes son $96,000 de
ARR, que valen $190,000 - $385,000 **además** del negocio operativo.

No lo recomiendo como foco: distrae del negocio real y convierte a Diego en proveedor de
software, que es un trabajo diferente. Pero conviene saber que existe, porque **cambia lo que
conviene hacer hoy**: si algún día se licencia, el multi-tenancy (varias empresas en la misma
base de datos, aisladas) es mucho más barato de construir ahora que de retrofitear después.

---

## 9. Qué hacer en los próximos 12 meses para que el número de 2030 sea el bueno

En orden de impacto sobre el precio de venta, no de esfuerzo:

1. **Vender membresías.** Es la única cosa en esta lista que mueve el múltiplo un punto
   entero. Están construidas desde julio y en cero ventas. 100 miembros valen medio millón
   de precio de venta.
2. **Sacar a Diego de la llave inglesa.** Un segundo mecánico que opere sin supervisión y un
   onboarding que funcione solo.
3. **Medir las ocho cifras de la sección 6 todos los meses.** Un negocio sin historia de
   métricas se vende más barato aunque gane lo mismo, porque el comprador no puede verificar
   la tendencia.
4. **Registrar la marca** (ver el skill `trademark-status`).
5. **Que otra persona toque el código.** Elimina el descuento por dependencia técnica.
6. **Firmar el primer contrato B2B**, aunque sea chico. El primero es el que prueba que el
   modelo existe.
7. **Separar todo a nombre de la empresa**: Google Business, reseñas, dominio, Stripe,
   cuentas bancarias. Lo que esté a nombre personal, no se vende.

---

## 10. Cómo mantener este documento

Esto no se calcula una vez. Cada 6 meses: anotar las ocho cifras reales de la sección 6,
recalcular la ganancia anual, elegir el múltiplo con la tabla 4.1 según el % de recurrencia
logrado, y multiplicar. Es la misma aritmética siempre y toma 20 minutos.

La próxima revisión conviene hacerla cuando haya **el primer mes con membresías vendidas**,
porque ése es el momento en que el múltiplo deja de ser 2x.
