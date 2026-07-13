# Onboarding de mecánico nuevo — Dr. Bike Sydney

Manual para preparar a un mecánico nuevo antes de su primer día. Verificado contra el código real (`js/mechanic.js`, `api/auth.js`) el 13 Jul 2026 — si algo acá no coincide con lo que el mecánico ve en la app, la app manda, avisame para corregir este doc.

Mitiga el riesgo "todo depende de Diego" que marca `ESTRATEGIA-NEGOCIO.md`: el objetivo es que cualquier persona nueva pueda operar sola desde el día uno con solo este documento + la app.

## Antes del primer día (esto lo hacés vos, en Admin)

1. **Admin → Escalation Contacts → Add notification number.**
   - Nombre, teléfono, rol = "Mechanic", zona asignada (Van 1 o Van 2), canal de notificación (SMS/WhatsApp/ambos).
   - Al guardar, la app genera un **PIN de 4 dígitos automáticamente** y te lo muestra una sola vez en pantalla — anotalo, es la única vez que se muestra.
2. Pasale al mecánico: el PIN, el link `drbikesydney.com.au/mechanic.html` (agregalo a la pantalla de inicio del celular como app — botón "Agregar a inicio" en el navegador), y este documento.
3. Confirmá que tiene: celular con GPS y datos móviles, la van equipada, acceso al inventario de repuestos.

## Primer login

1. Entra a `drbikesydney.com.au/mechanic.html`, ingresa el PIN de 4 dígitos.
2. La sesión queda guardada 60 días — no vuelve a pedir el PIN salvo que cierre sesión o pasen los 60 días.
3. Ve el panel del día: lista de trabajos asignados, cada uno con un color según su estado.

## El flujo de un trabajo, paso a paso

### 1. Llega un trabajo nuevo
Notificación push + sonido. Aparece en la lista con **Accept** / **Reject**. El primero en aceptar se lo queda (si dos mecánicos tocan Accept al mismo tiempo, gana el primero — el otro ve "Job already taken"). Regla: aceptar o rechazar con al menos 3 días de anticipación a la fecha del servicio.

Al aceptar: se genera automáticamente el PIN de llegada que el cliente va a pedirte, y el trabajo aparece en tu Google Calendar con recordatorio nativo del celular.

### 2. Salir hacia el cliente
Tocá **En route**. Esto:
- Le avisa al cliente por push + SMS + WhatsApp que vas en camino.
- Empieza a compartir tu ubicación en vivo (el cliente ve el mapa y el ETA).
- Habilita el chat en vivo con el cliente (podés mandar fotos si necesitás confirmar algo antes de llegar).

### 3. Llegada
Tocá **Arrived** y pedile al cliente su **código de 4 dígitos** (se lo generó la app cuando aceptaste el trabajo — el cliente lo ve en su pantalla de seguimiento). Sin el código correcto no podés marcar la llegada.

### 4. Checklist antes de empezar
Revisión rápida de 14 puntos (frenos, cadena, cassette, cables, ruedas, neumáticos, manubrio, asiento, dirección, eje pedalier, luces, cuadro). Marcá cualquiera como "crítico" si encontrás algo que el cliente debería saber antes de que sigas — eso queda registrado.

### 5. Trabajo extra o repuestos fuera de lo cotizado
Si necesitás cobrar algo adicional a lo que el cliente ya reservó, cotizalo y pedile aprobación al cliente en el momento antes de hacerlo — no se cobra nada sin que el cliente lo apruebe primero.

### 6. Completar el trabajo
Al terminar, tocá **Complete**. Te va a pedir:
- **Foto antes y después** (obligatorio — alimenta las redes sociales y reseñas de Diego).
- **Firma del cliente** en pantalla (obligatorio, no se puede completar sin firma).
- **Método de pago**: Tarjeta/EFTPOS o Efectivo. El call-out fee ($20) ya se cobró online al reservar — lo que cobrás en el momento es el resto del servicio.
- Repuestos usados (si sacaste algo del inventario de la van, quedará descontado del stock automáticamente — si queda poco stock de algo te va a avisar "reorder soon").
- Recomendación de próximo servicio (opcional).

Al completar: el cliente recibe automáticamente notificación + pedido de reseña (push, email, SMS y WhatsApp) — no hace falta que hagas nada extra para pedir la reseña, es automático.

### 7. Si cobraste en efectivo
Ese dinero queda pendiente hasta que lo entregues. Diego lo controla semanalmente en Admin → Finance → Cash handover — juntá el efectivo de la semana y coordinen la entrega, él lo marca como "recibido" ahí.

## Preguntas frecuentes / qué hacer si...

- **El cliente no está cuando llego**: contactalo por el chat de la app o el teléfono del booking. (Diego: definir acá una política de espera/reagendado si querés una regla fija — hoy no hay una automática en la app.)
- **El código de 4 dígitos no coincide**: pedile al cliente que vuelva a leer su pantalla de seguimiento. Si sigue sin coincidir, contactá a Diego.
- **Se me cae la conexión / la app no responde**: el trabajo sigue guardado del lado del servidor, no perdés el avance ya guardado (checklist, fotos ya subidas). Reintentá con datos móviles si el wifi falla.
- **Tengo una duda sobre precio o algo no cotizado**: no lo resuelvas por tu cuenta, escribile a Diego antes de cobrar algo distinto a lo reservado.

## Lo que la app hace sola (no necesitás acordarte de nada de esto)

- Avisar al cliente en cada cambio de estado (aceptado, en camino, completado).
- Pedir la reseña al cliente.
- Descontar repuestos del inventario y avisar si queda poco stock.
- Crear el evento en el calendario de Diego con vos invitado.
- Guardar el historial completo del trabajo (fotos, firma, checklist) contra esa bicicleta específica del cliente.
